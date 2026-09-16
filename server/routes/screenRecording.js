// הקלטת פעולות במסך - תצורה. אפיון: SCREEN_RECORDING_SPEC.md
//
// שתי קבוצות נקודות קצה:
//
// **תצורה**
//   GET  /api/screen-recording/bases      - ניהול טכני: כל הבסיסים והיב"אות
//   PUT  /api/screen-recording/bases/:id  - ניהול טכני: שמירת ה-PATH והמדיניות
//   GET  /api/screen-recording/config/:baseId - **תהליך ה-Electron של העמדה**
//
// **הקלטה מהדפדפן** (§7 באפיון) - דפדפן אינו יכול לכתוב לנתיב בדיסק,
// ולכן הנתחים עולים לכאן והשרת כותב לאותו PATH:
//   POST /api/screen-recording/sessions            פתיחת מקטע (מחזיר מזהה ופרמטרי קידוד)
//   POST /api/screen-recording/sessions/:id/chunk  גוף בינארי, נכתב לסוף הקובץ
//   POST /api/screen-recording/sessions/:id/rotate סוגר קובץ ופותח חדש
//   POST /api/screen-recording/sessions/:id/keep   "שמור את הקטע הזה"
//   POST /api/screen-recording/sessions/:id/stop   סוגר ומשלים
//
// ⚠ **השרת חייב לראות את ה-PATH.** בפריסה עננית (Railway) אין לו גישה
// לשיתוף ברשת הבסיס, ולכן המסלול הזה שימושי כשהשרת רץ בבסיס (או
// כשהנתיב על הדיסק של השרת עצמו). בעמדת Electron אין בו צורך כלל.
//
// למה התצורה אינה חלק מ-`GET /api/aviation-bases`: אותה רשימה נטענת בכל כניסה
// לעמדה ובכל מסך, וה-PATH הוא פרט תשתית (שם שרת ושיתוף ברשת הבסיס). הוא נמסר
// רק למי שבאמת כותב אליו - תהליך ה-Electron - ולמסך הניהול הטכני.
//
// ⚠️ **העמוד לעולם אינו מוסר נתיב.** ה-renderer שולח מזהה בסיס ב-IPC, ותהליך
// ה-Electron שואב מכאן את הנתיב בעצמו (electron/screenRecorder.cjs). זה מה
// ששומר על הכלל שבראש electron-preload.cjs: אין ערוץ שמקבל נתיב קובץ מהעמוד.

import { Router, raw } from 'express';
import { randomUUID } from 'crypto';
import pool from '../db/pool.js';
import { normalizeRecordingConfig, isSafeRecordingPath, RECORDING_LIMITS } from '../../shared/screenRecording.js';
import { createRecordingWriter } from '../../shared/recordingWriter.js';

const router = new Router();

const REC_COLS = `id, name, code, recording_enabled, recording_path,
  recording_segment_minutes, recording_retention_days, recording_fps, recording_quality`;

/** רשימת הבסיסים והיב"אות עם תצורת ההקלטה - מסך הניהול הטכני */
router.get('/api/screen-recording/bases', async (_req, res) => {
  try {
    const r = await pool.query(`SELECT ${REC_COLS} FROM aviation_bases ORDER BY name`);
    res.json(r.rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch recording config' });
  }
});

/**
 * שמירת תצורת ההקלטה של בסיס. הנתיב מאומת **כאן** ולא רק בעמדה: נתיב פסול
 * שנשמר בשקט הופך ל"ההקלטה לא עובדת ואיש לא יודע למה" בעמדה אחרת, ביום אחר.
 * נתיב ריק = ניקוי ההגדרה (מותר), ולכן הוא אינו נבדק מול isSafeRecordingPath.
 */
router.put('/api/screen-recording/bases/:id', async (req, res) => {
  try {
    const path = String(req.body?.recording_path ?? '').trim();
    if (path && !isSafeRecordingPath(path)) {
      // 400 עם סיבה מפורשת - מסך הניהול מציג אותה ליד השדה
      return res.status(400).json({
        error: 'invalid_path',
        detail: 'נדרש נתיב מוחלט (D:\\SKYKING\\REC) או נתיב רשת (\\\\srv\\share), בלי .. ובלי %משתני סביבה%',
      });
    }
    const cfg = normalizeRecordingConfig({ ...req.body, recording_path: path });
    const r = await pool.query(
      `UPDATE aviation_bases SET recording_enabled=$1, recording_path=$2,
         recording_segment_minutes=$3, recording_retention_days=$4,
         recording_fps=$5, recording_quality=$6
       WHERE id=$7 RETURNING ${REC_COLS}`,
      [cfg.enabled, cfg.path || null, cfg.segmentMinutes, cfg.retentionDays, cfg.fps, cfg.quality, req.params.id],
    );
    if (!r.rows.length) return res.status(404).json({ error: 'base_not_found' });
    res.json(r.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to save recording config' });
  }
});

/**
 * התצורה האפקטיבית של בסיס אחד - נקראת על ידי **תהליך ה-Electron של העמדה**
 * לפני כל התחלת הקלטה ואחרי כל ניתוק/חזרה. מחזיר גם את שם הבסיס, כדי ששם
 * הקובץ ייבנה מהשם שב-DB ולא ממה שהעמוד מסר.
 *
 * `blocked` הוא **הסיבה** ולא דגל: העמדה מציגה אותה למפעיל.
 */
router.get('/api/screen-recording/config/:baseId', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT ${REC_COLS} FROM aviation_bases WHERE id=$1`,
      [req.params.baseId],
    );
    if (!r.rows.length) return res.status(404).json({ error: 'base_not_found' });
    const row = r.rows[0];
    const cfg = normalizeRecordingConfig(row);
    res.json({
      base_id: row.id,
      base_name: row.name,
      ...cfg,
      // נתיב שנשמר לפני שהאימות נוסף, או שיתוף שהוסר מאז - ההקלטה תיכבה עם סיבה
      pathValid: cfg.path ? isSafeRecordingPath(cfg.path) : false,
      limits: RECORDING_LIMITS,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch recording config' });
  }
});

// ── הקלטה מהדפדפן: מקטעים חיים ──────────────────────────────

/**
 * מקטע = מקליט אחד עם קובץ אחד פתוח. בזיכרון ולא ב-DB במכוון:
 * מקטע הוא מצב של **תהליך השרת הזה** (ניהול קובץ פתוח), ואין לו משמעות
 * אחרי אתחול או בתהליך אחר.
 * @type {Map<string, {writer: any, key: string, lastSeen: number}>}
 */
const sessions = new Map();

/** מקטע שלא נשמע ממנו זמן כזה → הדפדפן נסגר בלי לעצור. סוגרים את הקובץ. */
const SESSION_IDLE_MS = 2 * 60 * 1000;
/** תקרת נתח בודד. נתח של שנייה ב-4Mbps הוא ~500KB; 25MB מכסה גם צבירה אחרי אטיות. */
const MAX_CHUNK = '25mb';

const rawChunk = raw({ type: () => true, limit: MAX_CHUNK });

/** סוגר מקטע ומשלים את הקובץ */
async function closeSession(id) {
  const s = sessions.get(id);
  if (!s) return null;
  sessions.delete(id);
  return s.writer.stop().catch(() => null);
}

// נטישה: דפדפן שנסגר אינו שולח "עצור", ובלי הסריקה הזו הקובץ היה נשאר
// פתוח לנצח וה-write stream דולף עם כל רענון דף.
const idleSweep = setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastSeen > SESSION_IDLE_MS) void closeSession(id);
  }
}, 60_000);
if (typeof idleSweep.unref === 'function') idleSweep.unref();

/** מחזיר את המקטע ומעדכן את זמן השמיעה האחרון */
function touch(id) {
  const s = sessions.get(id);
  if (s) s.lastSeen = Date.now();
  return s;
}

/**
 * פתיחת מקטע. התצורה נקראת מה-DB **כאן**, ולכן גם שם הבסיס בשם
 * הקובץ וגם הנתיב אינם מגיעים מהדפדפן - בדיוק כמו בעמדת Electron.
 *
 * פתיחה שנייה לאותה עמדה סוגרת את הקודמת: רענון דף באמצע הקלטה אחרת
 * משאיר שני קבצים פתוחים לאותה עמדה, והנטוש ביניהם לא ייסגר עד לאימות.
 */
router.post('/api/screen-recording/sessions', async (req, res) => {
  const baseId = Number(req.body?.base_id) || 0;
  const presetName = typeof req.body?.preset_name === 'string' ? req.body.preset_name : '';
  const key = `${baseId}|${presetName}`;
  try {
    for (const [id, s] of sessions) if (s.key === key) await closeSession(id);

    const writer = createRecordingWriter({
      log: msg => console.log(`[rec:${key}] ${msg}`),
      loadConfig: async ({ baseId: id }) => {
        const r = await pool.query(`SELECT ${REC_COLS} FROM aviation_bases WHERE id=$1`, [id]);
        if (!r.rows.length) {
          const err = new Error('base_not_found');
          err.reason = 'baseNotFound';
          throw err;
        }
        return { base_name: r.rows[0].name, ...normalizeRecordingConfig(r.rows[0]) };
      },
    });

    const started = await writer.start({
      baseId, presetName,
      ext: req.body?.ext === 'mp4' ? 'mp4' : 'webm',
      manual: Boolean(req.body?.manual),
    });
    if (!started.ok) {
      // 404 לבסיס שאינו קיים, 409 לתצורה שחוסמת את ההקלטה - והסיבה בגוף,
      // כדי שהעמדה תציג למפעיל *למה* ולא "שגיאה"
      const code = started.reason === 'baseNotFound' ? 404 : started.reason === 'noBase' ? 400 : 409;
      return res.status(code).json({
        error: started.reason === 'baseNotFound' ? 'base_not_found' : started.reason,
        detail: started.detail,
      });
    }

    const id = randomUUID();
    sessions.set(id, { writer, key, lastSeen: Date.now() });
    res.json({ session_id: id, ...started });
  } catch (e) {
    console.error('[rec] פתיחת מקטע נכשלה:', e.message);
    res.status(500).json({ error: 'session_failed' });
  }
});

router.post('/api/screen-recording/sessions/:id/chunk', rawChunk, async (req, res) => {
  const s = touch(req.params.id);
  if (!s) return res.status(404).json({ error: 'unknown_session' });
  const out = await s.writer.chunk(Buffer.isBuffer(req.body) ? req.body : null);
  if (!out.ok) return res.status(out.reason === 'notRecording' ? 404 : 500).json(out);
  res.json(out);
});

router.post('/api/screen-recording/sessions/:id/rotate', async (req, res) => {
  const s = touch(req.params.id);
  if (!s) return res.status(404).json({ error: 'unknown_session' });
  res.json(await s.writer.rotate());
});

router.post('/api/screen-recording/sessions/:id/keep', async (req, res) => {
  const s = touch(req.params.id);
  if (!s) return res.status(404).json({ error: 'unknown_session' });
  res.json(await s.writer.keep());
});

router.post('/api/screen-recording/sessions/:id/stop', async (req, res) => {
  if (!sessions.has(req.params.id)) return res.status(404).json({ error: 'unknown_session' });
  res.json((await closeSession(req.params.id)) || { ok: true });
});

export default router;
