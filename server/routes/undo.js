// ─── ביטול פעולה (CTRL+Z) ──────────────────────────────────────────────────────
// המחסנית של העמדה, תצוגה מקדימה של הביטול, וביצועו. ראה UNDO_SPEC.md.
//
// **מקור האמת הוא השרת.** הלקוח אינו מנהל מחסנית משלו: הוא שואל מה הפעולה
// הבאה לביטול ברגע שהמפעיל לוחץ. מחסנית מקומית הייתה מתפצלת מהאמת ברגע
// שבקשה נפלה, שהעמדה רועננה, או שפעולה פגה — והמפעיל היה רואה אפשרות לבטל
// משהו שכבר איננו.
import { Router } from 'express';
import pool from '../db/pool.js';
import { currentEnv } from '../db/env-context.js';
import { withoutAction } from '../db/action-context.js';
import { RETENTION_MINUTES } from '../db/undoJournal.js';
import { STATION_HEADER } from '../middleware/actionContext.js';
import { conflictsFor, revertEntries, blockedTableIn } from '../undo/revert.js';

const router = new Router();

/** זהות הבקשה: מי (מהאסימון החתום) ומאיזו עמדה (מהכותרת). */
const who = (req) => ({
  crew: req.user?.crewMemberId ?? null,
  station: String(req.get(STATION_HEADER) || '').slice(0, 64),
});

/**
 * הפעולות שהעמדה הזו רשאית לבטל.
 *
 * שלושת התנאים אינם ניתנים להרפיה (החלטת אפיון §2): **הפעולות שלי, מהעמדה
 * שלי, בסביבה שלי**. `crew_member_id` מגיע מהאסימון החתום ולא מהלקוח, ולכן
 * זיוף כותרת העמדה יכול להגיע לכל היותר לפעולות של אותו אדם בעמדה אחרת.
 *
 * `EXISTS` על היומן מסנן פעולות ריקות — בקשה שלא שינתה דבר אינה "פעולה".
 */
const STACK_SQL = `
  SELECT a.id, a.created_at, a.label_key, a.label_params, a.status, a.block_reason,
         (SELECT COUNT(*) FROM public.undo_journal j WHERE j.action_id = a.id) AS row_count
    FROM public.undo_actions a
   WHERE a.env = $1
     AND a.station_key = $2
     AND a.crew_member_id IS NOT DISTINCT FROM $3
     AND a.kind = 'action'
     AND a.status IN ('active', 'blocked')
     AND a.created_at > NOW() - INTERVAL '${RETENTION_MINUTES} minutes'
     AND EXISTS (SELECT 1 FROM public.undo_journal j WHERE j.action_id = a.id)
   ORDER BY a.created_at DESC`;

const shape = (r) => ({
  id: r.id,
  createdAt: r.created_at,
  labelKey: r.label_key,
  labelParams: r.label_params || {},
  rowCount: Number(r.row_count),
  undoable: r.status === 'active',
  blockReason: r.block_reason || null,
});

// GET — המחסנית המלאה של חמש הדקות האחרונות (חלון היסטוריה)
router.get('/api/undo/stack', async (req, res) => {
  const { crew, station } = who(req);
  if (!station) return res.json([]);
  try {
    const r = await pool.query(`${STACK_SQL} LIMIT 50`, [currentEnv(), station, crew]);
    res.json(r.rows.map(shape));
  } catch (e) {
    console.error('GET /api/undo/stack', e);
    res.status(500).json({ error: 'שליפת מחסנית הביטול נכשלה' });
  }
});

// GET — הפעולה הבאה לביטול, כולל בדיקת התנגשות. זו הקריאה שמזינה את חלון
// האישור: הכל בסיבוב אחד, כדי שהחלון ייפתח מיד אחרי CTRL+Z.
router.get('/api/undo/next', async (req, res) => {
  const { crew, station } = who(req);
  if (!station) return res.json({ action: null });
  try {
    const r = await pool.query(`${STACK_SQL} LIMIT 1`, [currentEnv(), station, crew]);
    if (!r.rows.length) return res.json({ action: null });
    const action = shape(r.rows[0]);

    const entries = await loadEntries(action.id);
    const blocked = blockedTableIn(entries);
    if (blocked) {
      return res.json({ action: { ...action, undoable: false, blockReason: 'denied' }, blocked, conflicts: [] });
    }

    // בדיקת ההתנגשות היא קריאה בלבד; אין טעם להחזיק טרנזקציה בשבילה. הביצוע
    // בודק שוב, בתוך הטרנזקציה שלו, וזו הבדיקה המחייבת.
    const client = await pool.connect();
    let conflicts;
    try {
      conflicts = await conflictsFor(client, entries);
    } finally {
      client.release();
    }
    res.json({ action, conflicts, tables: [...new Set(entries.map(e => e.table_name))] });
  } catch (e) {
    console.error('GET /api/undo/next', e);
    res.status(500).json({ error: 'בדיקת הפעולה לביטול נכשלה' });
  }
});

/** שורות היומן של פעולה, בסדר הכתיבה המקורי. */
async function loadEntries(actionId) {
  const r = await pool.query(
    `SELECT id, table_schema, table_name, op, pk, before, after
       FROM public.undo_journal WHERE action_id = $1 ORDER BY id ASC`,
    [actionId],
  );
  return r.rows;
}

// POST — ביצוע הביטול. `force=1` נדרש כשיש התנגשות: המפעיל ראה בחלון האישור
// מי נגע בשורה מאז, ובחר לדרוס.
router.post('/api/undo/:id', async (req, res) => {
  const { crew, station } = who(req);
  const actionId = String(req.params.id || '');
  const force = req.body?.force === true || req.query.force === '1';
  if (!station) return res.status(400).json({ error: 'חסר מזהה עמדה' });

  try {
    // אימות בעלות בשאילתה עצמה — לא בבדיקה נפרדת שאפשר לשכוח
    const own = await pool.query(
      `SELECT id, status, label_key, label_params FROM public.undo_actions
        WHERE id = $1 AND env = $2 AND station_key = $3
          AND crew_member_id IS NOT DISTINCT FROM $4 AND kind = 'action'
          AND created_at > NOW() - INTERVAL '${RETENTION_MINUTES} minutes'`,
      [actionId, currentEnv(), station, crew],
    );
    if (!own.rows.length) return res.status(404).json({ error: 'expired', message: 'הפעולה כבר אינה ניתנת לביטול' });
    const action = own.rows[0];
    if (action.status !== 'active') {
      return res.status(409).json({ error: action.status, message: 'הפעולה אינה ניתנת לביטול' });
    }

    const entries = await loadEntries(actionId);
    if (!entries.length) return res.status(409).json({ error: 'empty', message: 'לא נמצא מה לבטל' });

    const blocked = blockedTableIn(entries);
    if (blocked) return res.status(409).json({ error: 'denied', ...blocked });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // הגנת עומק: הביטול עצמו לעולם אינו נרשם ביומן, גם אם ה-connection
      // החזיק מזהה פעולה קודם. בלי זה, ביטול היה יכול להיכנס לפעולה של מישהו.
      await client.query(`SELECT set_config('app.action_id', '', true)`);

      const conflicts = await conflictsFor(client, entries);
      if (conflicts.length && !force) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'conflict', conflicts });
      }

      await revertEntries(client, entries);
      await client.query(
        `UPDATE public.undo_actions SET status = 'undone', undone_at = NOW() WHERE id = $1`,
        [actionId],
      );
      await client.query('COMMIT');

      // יומן הביקורת — מי ביטל מה ומתי (UNDO_SPEC.md §5 מקרה 15). מחוץ
      // לטרנזקציה: כשל ברישום לא יבטל ביטול שכבר בוצע.
      logUndo(req, action, entries, conflicts);
      res.json({ ok: true, reverted: entries.length, overrode: conflicts.length });
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* connection כנראה מת */ }
      throw err;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('POST /api/undo/:id', e);
    res.status(500).json({ error: 'הביטול נכשל', message: e.message });
  }
});

function logUndo(req, action, entries, conflicts) {
  withoutAction(async () => {
    try {
      await pool.query(
        `INSERT INTO activity_log (event_type, severity, crew_member_id, crew_member_name, details)
         VALUES ('undo', $1, $2, $3, $4)`,
        [
          conflicts.length ? 'warning' : 'normal',
          req.user?.crewMemberId ?? null,
          req.user?.name ?? null,
          JSON.stringify({
            action_id: action.id,
            label_key: action.label_key,
            label_params: action.label_params,
            rows: entries.length,
            tables: [...new Set(entries.map(e => e.table_name))],
            overrode_conflicts: conflicts.map(c => `${c.table}:${c.type}`),
          }),
        ],
      );
    } catch (err) {
      console.warn('[undo] רישום ליומן הפעילות נכשל:', err.message);
    }
  });
}

export default router;
