/**
 * **לקיחת פ"מ שכבר בנקודת העברה** - תיאום בין שתי עמדות.
 *
 * כמה עמדות יכולות להחזיק את אותו פ"מ (להתכונן אליו, לגבות נתק, או כשעמדה לא
 * עובדת לפי הנהלים). כשהפ"מ כבר **בנקודת העברה** מעמדה אחת (YYY), ועמדה אחרת
 * גוררת אותו לנקודת העברה משלה - אסור ששתי ההעברות יחיו במקביל: הפ"מ היה
 * ממתין לשתי עמדות מקבלות, ומי שמקבל ראשון "גונב" אותו מהשני בשקט.
 *
 * לכן הגרירה השנייה **לא נשלחת** אלא פותחת בקשה:
 *
 * | צד | מה רואה | כפתורים |
 * |----|---------|---------|
 * | העמדה הגוררת | טופס תיאום - "תאם עם עמדה YYY" | בוצע תיאום ומאושר להעביר / לא אושר |
 * | העמדה המחזיקה (YYY) | התראה - "הפ"מ אצלך בדרך ל..., לאשר לעמדה השנייה?" | אשר / אל תאשר |
 *
 * **ההכרעה הראשונה קובעת**, מכל צד: אישור מבטל את ההעברה הקיימת (ההקצאה של
 * YYY בנקודת ההעברה נמחקת) ושולח את החדשה - בטרנזקציה אחת, דרך אותה ליבת
 * שליחה של `transfers.js`. דחייה סוגרת את הבקשה ושום העברה לא נשלחת.
 * הצד שלא הכריע מקבל הודעת תוצאה (`*_seen`), כדי שאיש לא יגלה בדיעבד שהפ"מ
 * שלו נלקח.
 */

import { Router } from 'express';
import pool from '../db/pool.js';
import { transferNames } from '../db/stripFlowEvents.js';
import {
  initiateSectorTransferTx, initiatePresetTransferTx,
  recordTransferSentFlow, recordTransferClosedFlow,
} from './transfers.js';

const router = new Router();

/** בקשה שלא הוכרעה תוך הזמן הזה פגה - המצב בשטח כבר השתנה. */
export const TAKEOVER_TTL_MINUTES = 10;
/** כמה זמן הודעת תוצאה נשמרת לצד שלא הכריע (אם לא סומנה כנראתה). */
const OUTCOME_WINDOW_MINUTES = 30;

const intOrNull = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));

/** העמדה שמחזיקה את ההעברה - השולחת. */
export const transferHolderPresetId = (t) => intOrNull(t?.from_preset_id ?? t?.from_workstation_id);

/**
 * ההעברה הפתוחה של הפ"מ **מעמדה אחרת**, או null.
 *
 * `presetIds` - כל הזהויות של העמדה הגוררת (היא עצמה + עמדה שהיא מכסה באיחוד).
 * העברה ששלחה אחת מהן אינה התנגשות: זה אותו מפעיל, והזזת היעד שלה היא מסלול
 * `move` הקיים.
 */
export async function findConflictingTransfer(db, stripId, presetIds) {
  const { rows } = await db.query(
    `SELECT * FROM strip_transfers
      WHERE strip_id = $1 AND status IN ('pending','acknowledged')
      ORDER BY created_at DESC LIMIT 1`,
    [stripId],
  );
  const t = rows[0];
  if (!t) return null;
  const holder = transferHolderPresetId(t);
  const mine = new Set((presetIds || []).map(intOrNull).filter(v => v != null));
  if (holder != null && mine.has(holder)) return null;
  return t;
}

/** שמות לתצוגה של העברה - נקודה + עמדת יעד. להעברה ישירה אין נקודה. */
async function describeTransfer(db, t) {
  const n = await transferNames(db, t);
  return { point: t.to_preset_id ? '' : (n.pointLabel || ''), dest: n.toName || '', holder: n.fromName || '' };
}

/** ההעברה החדשה כפי שתישלח - לשמות בלבד, לפני שהיא קיימת. */
function pendingTransferShape(kind, payload) {
  if (kind === 'preset') return { to_preset_id: payload.toPresetId, from_preset_id: payload.fromPresetId };
  return {
    to_sector_id: payload.toSectorId, sub_sector_label: payload.subSectorLabel || null,
    to_workstation_id: payload.toWorkstationId || null, from_workstation_id: payload.fromWorkstationId || null,
  };
}

async function logActivity(db, fields) {
  try {
    await db.query(
      `INSERT INTO activity_log (event_type, severity, workstation_preset_id, workstation_name,
         strip_id, strip_callsign, details, related_preset_id, related_preset_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [fields.event_type, fields.severity || 'warning', fields.preset_id ?? null, fields.preset_name || '',
        fields.strip_id != null ? String(fields.strip_id) : null, fields.callsign || null,
        JSON.stringify(fields.details || {}), fields.related_preset_id ?? null, fields.related_preset_name || null],
    );
  } catch (err) {
    // יומן הביקורת לא מפיל פעולה תפעולית
    console.error('[transfer-takeovers] activity_log נכשל:', err.message);
  }
}

const SELECT_COLS = `r.*, (r.created_at < NOW() - make_interval(mins => ${TAKEOVER_TTL_MINUTES})) AS expired`;

/**
 * POST /api/transfer-takeovers
 * body: { strip_id, requester_preset_id, kind: 'sector'|'preset', payload }
 * `payload` הוא גוף הבקשה שהיה נשלח ל-/transfer או ל-/transfer-to-preset.
 */
router.post('/api/transfer-takeovers', async (req, res) => {
  try {
    const b = req.body || {};
    const stripId = intOrNull(String(b.strip_id ?? '').replace(/^s/, ''));
    const requester = intOrNull(b.requester_preset_id);
    const kind = b.kind === 'preset' ? 'preset' : 'sector';
    const payload = b.payload && typeof b.payload === 'object' ? b.payload : {};
    if (stripId == null || requester == null) return res.status(400).json({ error: 'strip_id and requester_preset_id required' });

    const ids = [requester, intOrNull(kind === 'preset' ? payload.fromPresetId : payload.fromWorkstationId)];
    const t = await findConflictingTransfer(pool, stripId, ids);
    if (!t) return res.json({ request: null });

    const cur = await describeTransfer(pool, t);
    const next = await describeTransfer(pool, pendingTransferShape(kind, payload));
    const meta = await pool.query(
      `SELECT (SELECT callsign FROM strips WHERE id = $1) AS callsign,
              (SELECT name FROM workstation_presets WHERE id = $2) AS requester_name`,
      [stripId, requester],
    );
    const m = meta.rows[0] || {};

    // בקשה קודמת של אותה עמדה על אותו פ"מ - מוחלפת (גרירה חוזרת = כוונה חדשה)
    await pool.query(
      `UPDATE transfer_takeover_requests SET status = 'cancelled', decided_at = NOW()
        WHERE strip_id = $1 AND requester_preset_id = $2 AND status = 'pending'`,
      [stripId, requester],
    );
    const { rows } = await pool.query(
      `INSERT INTO transfer_takeover_requests
         (strip_id, callsign, existing_transfer_id, holder_preset_id, holder_name, existing_point_label, existing_dest_name,
          requester_preset_id, requester_name, new_point_label, new_dest_name, kind, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [stripId, m.callsign || '', t.id, transferHolderPresetId(t), cur.holder, cur.point, cur.dest,
        requester, m.requester_name || '', next.point, next.dest, kind, JSON.stringify(payload)],
    );
    const r = rows[0];
    await logActivity(pool, {
      event_type: 'transfer_takeover_requested', preset_id: requester, preset_name: r.requester_name,
      strip_id: stripId, callsign: r.callsign, related_preset_id: r.holder_preset_id, related_preset_name: r.holder_name,
      details: { requestId: r.id, existingTransferId: t.id, existingPoint: r.existing_point_label, newPoint: r.new_point_label },
    });
    res.json({ request: r });
  } catch (err) {
    console.error('Error creating transfer takeover:', err);
    res.status(500).json({ error: 'Failed to create transfer takeover' });
  }
});

/**
 * GET /api/transfer-takeovers?presetId=X
 * מה שהעמדה צריכה לראות:
 *   - בקשות פתוחות שהיא צד בהן (מחזיקה - התראה, גוררת - טופס)
 *   - תוצאות שהוכרעו **בצד השני** ועוד לא נראו אצלה
 */
router.get('/api/transfer-takeovers', async (req, res) => {
  try {
    const presetId = intOrNull(req.query.presetId);
    if (presetId == null) return res.json([]);
    const { rows } = await pool.query(
      `SELECT ${SELECT_COLS} FROM transfer_takeover_requests r
        WHERE (r.status = 'pending' AND r.created_at >= NOW() - make_interval(mins => ${TAKEOVER_TTL_MINUTES})
               AND (r.holder_preset_id = $1 OR r.requester_preset_id = $1))
           OR (r.status <> 'pending' AND r.decided_at >= NOW() - make_interval(mins => ${OUTCOME_WINDOW_MINUTES})
               AND ((r.holder_preset_id = $1 AND NOT r.holder_seen)
                 OR (r.requester_preset_id = $1 AND NOT r.requester_seen)))
        ORDER BY r.created_at`,
      [presetId],
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching transfer takeovers:', err);
    res.status(500).json({ error: 'Failed to fetch transfer takeovers' });
  }
});

/**
 * ההכרעה - מאחד את שני הצדדים. מניח טרנזקציה פתוחה על ה-client.
 * מחזיר { status, request, newTransfer?, cancelledTransfer? } או { error, code }.
 */
export async function decideTakeoverTx(client, requestId, { decision, presetId }) {
  const { rows } = await client.query(
    `SELECT ${SELECT_COLS} FROM transfer_takeover_requests r WHERE r.id = $1 FOR UPDATE`, [requestId]);
  const r = rows[0];
  if (!r) return { code: 404, error: 'not_found' };
  const pid = intOrNull(presetId);
  const side = pid != null && pid === intOrNull(r.holder_preset_id) ? 'holder'
    : pid != null && pid === intOrNull(r.requester_preset_id) ? 'requester' : null;
  if (!side) return { code: 403, error: 'not_a_party' };
  if (r.status !== 'pending') return { code: 409, error: 'already_decided', request: r };

  // הצד שהכריע כבר "ראה" את התוצאה; הצד השני יקבל הודעה
  const seenCols = side === 'holder' ? 'holder_seen = true' : 'requester_seen = true';
  const close = async (status) => (await client.query(
    `UPDATE transfer_takeover_requests SET status = $1, decided_at = NOW(), decided_by_preset_id = $2, decided_side = $3, ${seenCols}
      WHERE id = $4 RETURNING *`, [status, pid, side, r.id])).rows[0];

  if (r.expired) return { code: 409, error: 'expired', request: await close('expired') };
  if (decision !== 'approve') return { status: 'denied', request: await close('denied') };

  // ההעברה הקיימת חייבת להיות עדיין פתוחה. אם בינתיים התקבלה/בוטלה - המצב
  // שעליו התאמנו כבר לא קיים, ולקיחה עכשיו הייתה גונבת פ"מ מעמדה שכבר קיבלה.
  const ex = (await client.query(
    `SELECT * FROM strip_transfers WHERE id = $1 AND status IN ('pending','acknowledged') FOR UPDATE`,
    [r.existing_transfer_id])).rows[0];
  if (!ex) return { code: 409, error: 'stale', request: await close('stale') };

  await client.query(
    `UPDATE strip_transfers SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [ex.id]);
  const payload = typeof r.payload === 'string' ? JSON.parse(r.payload) : (r.payload || {});
  const newTransfer = r.kind === 'preset'
    ? await initiatePresetTransferTx(client, r.strip_id, payload)
    : await initiateSectorTransferTx(client, r.strip_id, payload);
  if (!newTransfer) return { code: 404, error: 'strip_not_found' };
  // הגוררת מוסרת את הפ"מ - הוא יוצא מהדסק שלה כמו בכל שליחה
  await client.query(
    `UPDATE transfer_takeover_requests SET new_transfer_id = $1 WHERE id = $2`, [newTransfer.id, r.id]);
  const request = await close('approved');
  return { status: 'approved', request, newTransfer, cancelledTransfer: ex };
}

/** POST /api/transfer-takeovers/:id/decide  body: { decision: 'approve'|'deny', preset_id } */
router.post('/api/transfer-takeovers/:id/decide', async (req, res) => {
  const client = await pool.connect();
  let result;
  try {
    await client.query('BEGIN');
    result = await decideTakeoverTx(client, intOrNull(req.params.id), {
      decision: req.body?.decision, presetId: req.body?.preset_id,
    });
    if (result.code === 404 || result.code === 403) {
      await client.query('ROLLBACK');
      return res.status(result.code).json({ error: result.error });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error deciding transfer takeover:', err);
    return res.status(500).json({ error: 'Failed to decide transfer takeover' });
  } finally {
    client.release();
  }

  // אחרי ה-COMMIT: FLOW ויומן לא מפילים הכרעה שכבר בוצעה
  const r = result.request;
  if (result.status === 'approved') {
    await recordTransferClosedFlow(result.cancelledTransfer, 'cancelled', req.user, { takeoverRequestId: r.id, takenBy: r.requester_name });
    await recordTransferSentFlow(result.newTransfer, req.user, { takeoverRequestId: r.id });
  }
  if (r) {
    const byHolder = r.decided_side === 'holder';
    await logActivity(pool, {
      event_type: result.status === 'approved' ? 'transfer_takeover_approved' : `transfer_takeover_${r.status}`,
      preset_id: byHolder ? r.holder_preset_id : r.requester_preset_id,
      preset_name: byHolder ? r.holder_name : r.requester_name,
      strip_id: r.strip_id, callsign: r.callsign,
      related_preset_id: byHolder ? r.requester_preset_id : r.holder_preset_id,
      related_preset_name: byHolder ? r.requester_name : r.holder_name,
      details: { requestId: r.id, side: r.decided_side, existingTransferId: r.existing_transfer_id, newTransferId: r.new_transfer_id ?? null },
    });
  }
  if (result.code) return res.status(result.code).json({ error: result.error, request: r });
  res.json({ status: result.status, request: r });
});

/** POST /api/transfer-takeovers/:id/seen  body: { preset_id } - הצד השני ראה את התוצאה. */
router.post('/api/transfer-takeovers/:id/seen', async (req, res) => {
  try {
    const id = intOrNull(req.params.id);
    const pid = intOrNull(req.body?.preset_id);
    await pool.query(
      `UPDATE transfer_takeover_requests
          SET holder_seen = holder_seen OR holder_preset_id = $2,
              requester_seen = requester_seen OR requester_preset_id = $2
        WHERE id = $1`,
      [id, pid],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error marking transfer takeover seen:', err);
    res.status(500).json({ error: 'Failed to mark seen' });
  }
});

export default router;
