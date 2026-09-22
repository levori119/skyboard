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
 * שורות שההכרעה עליהן שווה הצגה, מאוחדות פר-שורה.
 *
 * `superseded` - הוכרע אוטומטית לטובת המרכז. **לא** עוצר את הבקר; הוא רואה
 *                מה הוכרע ויכול להפוך את ההכרעה.
 * `conflict`   - לא ניתן היה להכריע (אין חותמת זמן, או כשל כתיבה). רק אלה
 *                באמת דורשים החלטה.
 *
 * למה מאוחדות: פקח שגרר פ"מ עשר פעמים בזמן הנתק מייצר עשר שורות יומן לאותו
 * פ"מ. עשר שורות במסך הן עשר החלטות על אותו דבר עצמו - וזו הדרך הבטוחה
 * ביותר לגרום למישהו ללחוץ "הכל" בלי לקרוא.
 */
async function resolutionRows(status, q = viaPool) {
  const rows = await journalRows(status, q);
  const byKey = new Map();
  for (const r of rows) {
    const key = mirrorRowKey(r.table_name, r.pk);
    const acc = byKey.get(key) || {
      key,
      table: r.table_name,
      pk: r.pk,
      at: r.at,
      status: r.status,
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

/**
 * כותב את גרסת המרכז על השורה המקומית.
 *
 * משותף לשני הנתיבים שמגיעים לכאן - ההכרעה האוטומטית ב-`ack`, וההכרעה הידנית
 * ב-`resolve`. שני עותקים היו מתפצלים בשינוי הראשון, ואז מסך אחד היה מציג
 * משהו שאינו במאגר.
 *
 * ⚠️ `withoutJournal`: זו כתיבה של **הסנכרון**, לא של המפעיל. בלי הסימון היא
 * הייתה נרשמת ביומן ונדחפת בסיבוב הבא חזרה למרכז - כלומר מבטלת את ההכרעה
 * שזה עתה התקבלה.
 *
 * @param c שורת הכרעה מ-`resolutionRows` (או תוצאה מ-`applyOps` עם pk/table)
 * @returns {Promise<boolean>} האם השורה המקומית שונתה
 */
async function adoptServerRow(client, schema, c) {
  const table = c.table || c.table_name;
  const serverRow = c.serverRow ?? null;
  return withoutJournal(client, async () => {
    const now = await currentRow(client, schema, table, c.pk);
    if (!serverRow) {
      // המרכז אינו מחזיק את השורה (נמחקה שם) - גם כאן היא יורדת
      if (!now) return false;
      await deleteRow(client, schema, table, c.pk);
      return true;
    }
    if (now) await updateRow(client, schema, table, c.pk, serverRow);
    else await insertRow(client, schema, table, serverRow);
    return true;
  }, { begin: false });
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
      // הוכרע אוטומטית לטובת המרכז - לתצוגה ולהיפוך, לא לחסימה
      resolved: await resolutionRows(STATUS.SUPERSEDED),
      // רק אלה באמת דורשים החלטה של אדם
      conflicts: await resolutionRows(STATUS.CONFLICT),
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

  // הפרש השעונים בין העמדה למרכז, נמדד **עכשיו** ומוחל על כל הפעולות. בלי זה
  // "האחרון מנצח" היה מודד שני שעונים שונים: עמדה שמקדימה בעשר דקות הייתה
  // מנצחת תמיד, ועמדה שמפגרת - מפסידה תמיד.
  const stationNow = Date.parse(req.body?.stationNow || '');
  const skewMs = Number.isFinite(stationNow) ? Date.now() - stationNow : 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results = await applyOps(client, ops, schema, { force, skewMs });
    await client.query('COMMIT');
    const applied = results.filter(r => r.status === RESULT.APPLIED).length;
    const superseded = results.filter(r => r.status === RESULT.SUPERSEDED).length;
    console.log(
      `[sync] דחיפה מעמדה ${station(req) || '?'}: ${applied}/${results.length} הוחלו` +
      (superseded ? ` · ${superseded} הוכרעו לטובת המרכז` : '') +
      (skewMs ? ` · הפרש שעונים ${Math.round(skewMs / 1000)}ש'` : ''));
    res.json({ results, skewMs });
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
  const schema = currentSchema();
  try {
    await client.query('BEGIN');
    let adopted = 0;
    for (const r of results) {
      const ids = (r.journalIds || []).map(Number).filter(Number.isFinite);
      if (!ids.length) continue;

      if (r.status === RESULT.APPLIED || r.status === RESULT.SKIPPED) {
        await client.query(
          `UPDATE ${JOURNAL_TABLE} SET status = $1, synced_at = NOW(), conflict_reason = $2
            WHERE id = ANY($3::bigint[])`,
          [STATUS.SYNCED, r.reason || null, ids]);
        continue;
      }

      if (r.status === RESULT.SUPERSEDED) {
        // המרכז עודכן מאוחר יותר. **מאמצים את גרסתו כאן ומיד**, אחרת המסך
        // היה ממשיך להציג את הגרסה שהפסידה - והפקח היה עובד על תמונה שאינה
        // מה שיש בשדה. זו הסיבה שהאימוץ אינו מחכה לאישור.
        await client.query(
          `UPDATE ${JOURNAL_TABLE}
              SET status = $1, synced_at = NOW(), conflict_reason = $2, server_row = $3
            WHERE id = ANY($4::bigint[])`,
          [STATUS.SUPERSEDED, r.reason || null,
           r.serverRow ? JSON.stringify(r.serverRow) : null, ids]);

        // ⚠️ **הטבלה והמפתח נלקחים מהיומן ולא מגוף הבקשה.** היומן נכתב על ידי
        // הטריגר ב-DB ואי אפשר לזייף אותו; גוף הבקשה הוא קלט. בלי זה בקשה
        // שקרית הייתה יכולה לכתוב לכל טבלה ולכל שורה במאגר המקומי.
        const { rows } = await client.query(
          `SELECT table_name, pk, server_row FROM ${JOURNAL_TABLE} WHERE id = $1`, [ids[0]]);
        const j = rows[0];
        if (j && await adoptServerRow(client, schema, {
          table: j.table_name, pk: j.pk, serverRow: j.server_row,
        })) adopted++;
        continue;
      }

      await client.query(
        `UPDATE ${JOURNAL_TABLE}
            SET status = $1, conflict_reason = $2, server_row = $3, error = $4
          WHERE id = ANY($5::bigint[])`,
        [STATUS.CONFLICT, r.reason || null,
         r.serverRow ? JSON.stringify(r.serverRow) : null, r.error || null, ids]);
    }
    await client.query('COMMIT');
    const q = (sql, params) => client.query(sql, params);
    res.json({
      ok: true,
      adopted,
      conflicts: (await resolutionRows(STATUS.CONFLICT, q)).length,
    });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* connection כנראה מת */ }
    console.error('POST /api/sync/ack', e);
    res.status(500).json({ error: 'סימון תוצאות הסנכרון נכשל' });
  } finally {
    client.release();
  }
});

// ── בעמדה: היפוך הכרעה, או הכרעה במה שלא הוכרע אוטומטית ──────────────────────
//
// **ברירת המחדל אינה כאן.** רוב השורות מוכרעות לבדן לפי "האחרון מנצח", והבקר
// אינו נעצר. הנתיב הזה הוא ל-*אחרי*: הוא ראה ביומן ההכרעות מה נפל לטובת
// המרכז, ורוצה להחזיר את הגרסה שלו. הוא משמש גם למעט השורות שלא ניתן היה
// להכריע (אין חותמת זמן).
//
//   'mine'   - הגרסה שלי נכונה. השורות חוזרות ל-pending ותידחפנה **בכפייה**.
//   'theirs' - גרסת המרכז נכונה. השורות נזנחות והמקומית מאומצת (ב-superseded
//              זה כבר קרה מעצמו, ולכן זו בעיקר סגירה של סתירה לא-מוכרעת).
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
    const open = [
      ...await resolutionRows(STATUS.CONFLICT, q),
      ...await resolutionRows(STATUS.SUPERSEDED, q),
    ];
    const c = open.find(x => x.key === key);
    if (!c) return res.status(404).json({ error: 'ההכרעה כבר אינה פתוחה' });

    await client.query('BEGIN');
    if (choice === 'mine') {
      await client.query(
        `UPDATE ${JOURNAL_TABLE} SET status = $1, conflict_reason = NULL
          WHERE id = ANY($2::bigint[])`,
        [STATUS.PENDING, c.journalIds]);
      await client.query('COMMIT');
      // הדחיפה הבאה תישלח עם force - הבקר כבר ראה את גרסת המרכז והכריע נגדה
      return res.json({ ok: true, requeued: c.journalIds.length, force: true });
    }

    // 'theirs' - זניחת המקומי ואימוץ גרסת המרכז למאגר המקומי
    await client.query(
      `UPDATE ${JOURNAL_TABLE} SET status = $1 WHERE id = ANY($2::bigint[])`,
      [STATUS.DROPPED, c.journalIds]);
    await adoptServerRow(client, currentSchema(), c);
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
