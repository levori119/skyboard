// ─── סנכרון עבודה מנותקת ───────────────────────────────────────────────────────
// שני צדדים, קובץ אחד: אותו Express רץ גם במרכז וגם בעמדה, ולכן כל endpoint
// כאן מסומן במפורש למי הוא שייך.
//
//   במרכז   POST /api/sync/push    - קליטת מה שהעמדה עשתה בנתק
//           GET  /api/sync/mirror  - צילום המצב לשליחה לעמדה
//   בעמדה   GET  /api/sync/state   - כמה ממתין, ואילו סתירות פתוחות
//           GET  /api/sync/outbound- הפעולות המאוחדות, מוכנות לדחיפה
//           POST /api/sync/ack     - סימון התוצאות ביומן
//           POST /api/sync/resolve - הכרעת הבקר בסתירה
//           POST /api/sync/mirror  - קליטת הצילום למאגר המקומי
//
// **מי מריץ את הסנכרון:** הדפדפן של העמדה. הוא היחיד שמחזיק אסימון תקף ויכול
// לפנות לשני הצדדים (`/api/__remote/...` ו-`/api/__local/...` בשרת העמדה).
// שרת מקומי שהיה פונה למרכז בעצמו היה זקוק לזהות משלו - כלומר משטח תקיפה חדש
// ועוד מסלול הזדהות לתחזק. ראה electron/stationServer.cjs.

import { Router } from 'express';
import pool from '../db/pool.js';
import { currentSchema } from '../db/env-context.js';
import { isLocalDbMode } from '../db/localPool.js';
import { JOURNAL_TABLE, STATUS, withoutJournal } from '../db/syncJournal.js';
import { localIdStart } from '../db/localIds.js';
import { coalesceJournal } from '../sync/coalesce.js';
import { applyOps, RESULT } from '../sync/apply.js';
import { snapshotTables, ingestSnapshot, MIRROR_TABLES, mirrorRowKey } from '../sync/mirror.js';
import { insertRow, updateRow, deleteRow, currentRow } from '../db/rowOps.js';
import { STATION_HEADER } from '../middleware/actionContext.js';

const router = new Router();

/** תקרת פעולות בדחיפה אחת. נתק ארוך נדחף בכמה סיבובים ולא בבקשה ענקית אחת. */
const PUSH_LIMIT = 500;

/**
 * נתיב שקיים **רק** בשרת המקומי של העמדה.
 *
 * 404 ולא 403: במרכז הנתיב הזה פשוט אינו אמור להתקיים, וכל תשובה אחרת הייתה
 * מזמינה ניסיון נוסף. הדפדפן מזהה 404 ומכבה את שכבת הסנכרון בשקט - בדיוק כפי
 * שהוא עושה עם `/api/gapi/status` בגרסה שבה הוא אינו מותקן.
 */
const localOnly = (req, res, next) =>
  isLocalDbMode() ? next() : res.status(404).json({ error: 'not a local station' });

const station = (req) => String(req.get(STATION_HEADER) || '').slice(0, 64);

/**
 * ⚠️ **כל שאילתה כאן מקבלת `q` ואינה קוראת ל-`pool.query` בעצמה.**
 *
 * המאגר המקומי (PGlite) הוא **חיבור יחיד**: `pool.connect()` מחזיק את הנעילה
 * עד ה-`release()`, ו-`pool.query()` באותו handler ממתין לה לנצח. handler
 * שמחזיק client חייב להריץ דרכו את הכל. זו לא זהירות תיאורטית - זה נראה כאן
 * כ-12 בדיקות שנתקעו ב-timeout. ראה server/db/localPool.js §חיבור יחיד.
 */
const viaPool = (sql, params) => pool.query(sql, params);

/** שורות היומן במצב מבוקש, בסדר הכתיבה. */
async function journalRows(status, q = viaPool) {
  const { rows } = await q(
    `SELECT id, at, table_schema, table_name, op, pk, before, after, status,
            conflict_reason, server_row, error
       FROM ${JOURNAL_TABLE}
      WHERE status = $1
      ORDER BY id`,
    [status],
  );
  return rows;
}

/** מפתחות השורות שממתינות או שנויות במחלוקת - המראה לא תיגע בהן. */
async function protectedKeys(q = viaPool) {
  const { rows } = await q(
    `SELECT DISTINCT table_name, pk FROM ${JOURNAL_TABLE}
      WHERE status IN ($1, $2)`,
    [STATUS.PENDING, STATUS.CONFLICT],
  );
  return new Set(rows.map(r => mirrorRowKey(r.table_name, r.pk)));
}

/**
 * הסתירות הפתוחות, מאוחדות פר-שורה - בדיוק כפי שהבקר יראה אותן.
 *
 * למה מאוחדות: פקח שגרר פ"מ עשר פעמים בזמן הנתק מייצר עשר שורות יומן לאותו
 * פ"מ. עשר שורות במסך ההכרעה הן עשר החלטות על אותו דבר עצמו - וזו הדרך
 * הבטוחה ביותר לגרום למישהו ללחוץ "הכל" בלי לקרוא.
 */
async function openConflicts(q = viaPool) {
  const rows = await journalRows(STATUS.CONFLICT, q);
  const byKey = new Map();
  for (const r of rows) {
    const key = mirrorRowKey(r.table_name, r.pk);
    const acc = byKey.get(key) || {
      key,
      table: r.table_name,
      pk: r.pk,
      at: r.at,
      reason: r.conflict_reason,
      serverRow: r.server_row,
      mine: null,
      journalIds: [],
      error: r.error || null,
    };
    // הגרסה שלי היא מה שהיה על המסך **בסוף** הנתק
    if (r.after) acc.mine = r.after;
    acc.at = r.at;
    acc.reason = r.conflict_reason || acc.reason;
    if (r.server_row) acc.serverRow = r.server_row;
    acc.journalIds.push(Number(r.id));
    byKey.set(key, acc);
  }
  return [...byKey.values()];
}

// ── בעמדה: מצב הסנכרון ────────────────────────────────────────────────────────
router.get('/api/sync/state', localOnly, async (req, res) => {
  try {
    const counts = await pool.query(
      `SELECT status, COUNT(*)::int AS n FROM ${JOURNAL_TABLE} GROUP BY status`);
    const by = Object.fromEntries(counts.rows.map(r => [r.status, r.n]));
    res.json({
      pending: by[STATUS.PENDING] || 0,
      synced: by[STATUS.SYNCED] || 0,
      conflicts: await openConflicts(),
      localIdStart: localIdStart(station(req)),
    });
  } catch (e) {
    console.error('GET /api/sync/state', e);
    res.status(500).json({ error: 'שליפת מצב הסנכרון נכשלה' });
  }
});

// ── בעמדה: מה שצריך להידחף, מאוחד ─────────────────────────────────────────────
router.get('/api/sync/outbound', localOnly, async (req, res) => {
  try {
    const ops = coalesceJournal(await journalRows(STATUS.PENDING));
    res.json({ ops: ops.slice(0, PUSH_LIMIT), total: ops.length });
  } catch (e) {
    console.error('GET /api/sync/outbound', e);
    res.status(500).json({ error: 'הכנת הדחיפה נכשלה' });
  }
});

// ── במרכז: קליטת מה שהעמדה עשתה בנתק ──────────────────────────────────────────
router.post('/api/sync/push', async (req, res) => {
  const ops = Array.isArray(req.body?.ops) ? req.body.ops : null;
  if (!ops) return res.status(400).json({ error: 'ops נדרש' });
  if (ops.length > PUSH_LIMIT) return res.status(413).json({ error: `עד ${PUSH_LIMIT} פעולות בדחיפה` });

  const force = req.body?.force === true;
  // ⚠️ הסכמה נקבעת **בשרת** מהקשר הסביבה של הבקשה, ולא מ-`table_schema`
  // שהעמדה שלחה. אחרת עמדה בתרגול הייתה יכולה לכתוב לסביבה האמיתית.
  const schema = currentSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results = await applyOps(client, ops, schema, { force });
    await client.query('COMMIT');
    const applied = results.filter(r => r.status === RESULT.APPLIED).length;
    console.log(`[sync] דחיפה מעמדה ${station(req) || '?'}: ${applied}/${results.length} הוחלו`);
    res.json({ results });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* connection כנראה מת */ }
    console.error('POST /api/sync/push', e);
    res.status(500).json({ error: 'קליטת הדחיפה נכשלה' });
  } finally {
    client.release();
  }
});

// ── בעמדה: סימון תוצאות הדחיפה ביומן ──────────────────────────────────────────
router.post('/api/sync/ack', localOnly, async (req, res) => {
  const results = Array.isArray(req.body?.results) ? req.body.results : null;
  if (!results) return res.status(400).json({ error: 'results נדרש' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of results) {
      const ids = (r.journalIds || []).map(Number).filter(Number.isFinite);
      if (!ids.length) continue;
      if (r.status === RESULT.APPLIED || r.status === RESULT.SKIPPED) {
        await client.query(
          `UPDATE ${JOURNAL_TABLE} SET status = $1, synced_at = NOW()
            WHERE id = ANY($2::bigint[])`,
          [STATUS.SYNCED, ids]);
      } else {
        await client.query(
          `UPDATE ${JOURNAL_TABLE}
              SET status = $1, conflict_reason = $2, server_row = $3, error = $4
            WHERE id = ANY($5::bigint[])`,
          [STATUS.CONFLICT, r.reason || null,
           r.serverRow ? JSON.stringify(r.serverRow) : null, r.error || null, ids]);
      }
    }
    await client.query('COMMIT');
    const q = (sql, params) => client.query(sql, params);
    res.json({ ok: true, conflicts: (await openConflicts(q)).length });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* connection כנראה מת */ }
    console.error('POST /api/sync/ack', e);
    res.status(500).json({ error: 'סימון תוצאות הסנכרון נכשל' });
  } finally {
    client.release();
  }
});

// ── בעמדה: הכרעת הבקר בסתירה ──────────────────────────────────────────────────
//
// שתי הכרעות בלבד, ובכוונה:
//   'mine'   - הגרסה שלי נכונה. השורות חוזרות ל-pending ותידחפנה בכפייה.
//   'theirs' - הגרסה של השרת נכונה. השורות נזנחות, והשורה המקומית מאומצת
//              למה שהמרכז מחזיק - אחרת המסך היה ממשיך להציג את הגרסה שנדחתה.
//
// אין "מיזוג": פ"מ אינו מסמך טקסט, ומיזוג של שתי גרסאות מייצר מצב שאיש
// מהשניים לא בחר בו.
router.post('/api/sync/resolve', localOnly, async (req, res) => {
  const { key, choice } = req.body || {};
  if (!key || !['mine', 'theirs'].includes(choice)) {
    return res.status(400).json({ error: 'key ו-choice (mine/theirs) נדרשים' });
  }

  const client = await pool.connect();
  try {
    const q = (sql, params) => client.query(sql, params);
    const conflicts = await openConflicts(q);
    const c = conflicts.find(x => x.key === key);
    if (!c) return res.status(404).json({ error: 'הסתירה כבר אינה פתוחה' });

    await client.query('BEGIN');
    if (choice === 'mine') {
      await client.query(
        `UPDATE ${JOURNAL_TABLE} SET status = $1, conflict_reason = NULL
          WHERE id = ANY($2::bigint[])`,
        [STATUS.PENDING, c.journalIds]);
      await client.query('COMMIT');
      // הדחיפה הבאה תישלח עם force - הבקר כבר ראה את גרסת השרת והכריע נגדה
      return res.json({ ok: true, requeued: c.journalIds.length, force: true });
    }

    // 'theirs' - זניחת המקומי ואימוץ גרסת השרת למאגר המקומי
    await client.query(
      `UPDATE ${JOURNAL_TABLE} SET status = $1 WHERE id = ANY($2::bigint[])`,
      [STATUS.DROPPED, c.journalIds]);
    const schema = currentSchema();
    await withoutJournal(client, async () => {
      const now = await currentRow(client, schema, c.table, c.pk);
      if (!c.serverRow) {
        // השרת אינו מחזיק את השורה (נמחקה שם) - גם כאן היא יורדת
        if (now) await deleteRow(client, schema, c.table, c.pk);
      } else if (now) {
        await updateRow(client, schema, c.table, c.pk, c.serverRow);
      } else {
        await insertRow(client, schema, c.table, c.serverRow);
      }
    }, { begin: false });
    await client.query('COMMIT');
    res.json({ ok: true, adopted: true });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* connection כנראה מת */ }
    console.error('POST /api/sync/resolve', e);
    res.status(500).json({ error: 'יישוב הסתירה נכשל' });
  } finally {
    client.release();
  }
});

// ── במרכז: צילום המצב לשליחה לעמדה ────────────────────────────────────────────
router.get('/api/sync/mirror', async (req, res) => {
  const only = String(req.query.tables || '').split(',').map(s => s.trim()).filter(Boolean);
  const tables = only.length ? MIRROR_TABLES.filter(t => only.includes(t)) : MIRROR_TABLES;
  try {
    const client = await pool.connect();
    try {
      // טרנזקציה אחת לכל הצילום: בלעדיה פ"מ יכול להיווצר בין שתי טבלאות
      // והעמדה הייתה מקבלת העברה שמצביעה לפ"מ שאינו בצילום.
      await client.query('BEGIN');
      const snap = await snapshotTables(client, currentSchema(), tables);
      await client.query('COMMIT');
      res.json(snap);
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('GET /api/sync/mirror', e);
    res.status(500).json({ error: 'צילום המצב נכשל' });
  }
});

// ── בעמדה: קליטת הצילום למאגר המקומי ──────────────────────────────────────────
router.post('/api/sync/mirror', localOnly, async (req, res) => {
  const snap = req.body;
  if (!snap || !Array.isArray(snap.tables)) return res.status(400).json({ error: 'צילום לא תקין' });

  const client = await pool.connect();
  try {
    const keys = await protectedKeys((sql, params) => client.query(sql, params));
    const stats = await ingestSnapshot(client, currentSchema(), snap, keys);
    res.json({ ok: true, ...stats });
  } catch (e) {
    console.error('POST /api/sync/mirror', e);
    res.status(500).json({ error: 'קליטת המראה נכשלה' });
  } finally {
    client.release();
  }
});

export default router;
