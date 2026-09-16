// הקלטת פעולות במסך - תצורה. אפיון: SCREEN_RECORDING_SPEC.md
//
// שלוש נקודות קצה, ולכל אחת קהל אחר:
//   GET  /api/screen-recording/bases      - ניהול טכני: כל הבסיסים והיב"אות
//   PUT  /api/screen-recording/bases/:id  - ניהול טכני: שמירת ה-PATH והמדיניות
//   GET  /api/screen-recording/config/:baseId - **תהליך ה-Electron של העמדה**
//
// למה התצורה אינה חלק מ-`GET /api/aviation-bases`: אותה רשימה נטענת בכל כניסה
// לעמדה ובכל מסך, וה-PATH הוא פרט תשתית (שם שרת ושיתוף ברשת הבסיס). הוא נמסר
// רק למי שבאמת כותב אליו - תהליך ה-Electron - ולמסך הניהול הטכני.
//
// ⚠️ **העמוד לעולם אינו מוסר נתיב.** ה-renderer שולח מזהה בסיס ב-IPC, ותהליך
// ה-Electron שואב מכאן את הנתיב בעצמו (electron/screenRecorder.cjs). זה מה
// ששומר על הכלל שבראש electron-preload.cjs: אין ערוץ שמקבל נתיב קובץ מהעמוד.

import { Router } from 'express';
import pool from '../db/pool.js';
import { normalizeRecordingConfig, isSafeRecordingPath, RECORDING_LIMITS } from '../../shared/screenRecording.js';

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

export default router;
