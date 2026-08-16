// ─── סמלים (בסיס אב + מיח"ה) — הגשה וניהול ───────────────────────────────────
// הסמלים מנוהלים ממסך הניהול ונשמרים ב-DB כ-data URL:
//   • סמל בסיס  — `aviation_bases.emblem_data` (העמודה שייכת ליישות הבסיס)
//   • סמל מערכת — `system_emblems` (כרגע `micha`, הסמל שמוצג בכל עמדה)
//
// למה GET מחזיר תמונה בינארית ולא את ה-data URL: כך ה-`<img>` בעמדה נטען
// ישירות מה-URL, הדפדפן מטמין אותו, ורשימת הבסיסים (`GET /api/aviation-bases`,
// שנטענת בכל כניסה לעמדה) נשארת קלה - היא מחזירה רק `has_emblem`.
//
// 404 ולא 200-ריק: היעדר סמל הוא מצב תקין, והלקוח נופל לסמל המובנה בקוד.

import { Router } from 'express';
import pool from '../db/pool.js';
import { parseEmblemDataUrl } from '../utils/emblemImage.js';

const router = new Router();

// ETag מהתוכן עצמו: אין צורך ב-hash - אורך ה-base64 + 16 תווים ממנו מזהים
// שינוי בפועל, וההגשה היא no-cache (revalidate) כך שהחלפה נראית מיד.
function sendImage(res, dataUrl) {
  let parsed;
  try {
    parsed = parseEmblemDataUrl(dataUrl);
  } catch {
    return res.status(500).json({ error: 'הסמל השמור פגום' });
  }
  const tag = `W/"${parsed.buffer.length}-${parsed.dataUrl.slice(-16)}"`;
  res.set('Content-Type', parsed.mime);
  // max-age קצר ולא no-cache: העמדה מציגה את הסמל בכל טעינת מסך, ובלי הטמנה
  // אמיתית כל טעינה שולחת בקשה שמתחרה במטח קריאות ה-API של הדשבורד. דקה של
  // התיישנות אחרי החלפה בניהול היא מחיר סביר (התצוגה בניהול עוקפת עם `?v=`).
  res.set('Cache-Control', 'max-age=60');
  res.set('ETag', tag);
  if (res.req.headers['if-none-match'] === tag) return res.status(304).end();
  return res.send(parsed.buffer);
}

// חסר סמל: אין הטמנה. הלקוח כבר שואל פעם אחת לכל טעינת עמוד (מטמון ב-
// RotatingEmblems), ו-404 מוטמן היה מסתיר סמל שהועלה זה עתה בניהול.
function sendMissing(res) {
  res.set('Cache-Control', 'no-store');
  return res.status(404).json({ error: 'אין סמל' });
}

// ── סמל בסיס ──────────────────────────────────────────────────────────────────

router.get('/api/emblems/base/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT emblem_data FROM aviation_bases WHERE id=$1', [req.params.id]);
    const data = r.rows[0]?.emblem_data;
    if (!data) return sendMissing(res);
    return sendImage(res, data);
  } catch { res.status(500).json({ error: 'Failed to fetch base emblem' }); }
});

router.put('/api/emblems/base/:id', async (req, res) => {
  try {
    let dataUrl;
    try { dataUrl = parseEmblemDataUrl(req.body?.image).dataUrl; }
    catch (e) { return res.status(400).json({ error: e.message }); }
    const r = await pool.query(
      'UPDATE aviation_bases SET emblem_data=$1 WHERE id=$2 RETURNING id',
      [dataUrl, req.params.id],
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'בסיס לא נמצא' });
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed to save base emblem' }); }
});

router.delete('/api/emblems/base/:id', async (req, res) => {
  try {
    await pool.query('UPDATE aviation_bases SET emblem_data=NULL WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed to clear base emblem' }); }
});

// ── סמל מערכת (מיח"ה) ─────────────────────────────────────────────────────────

router.get('/api/emblems/system/:key', async (req, res) => {
  try {
    const r = await pool.query('SELECT image_data FROM system_emblems WHERE key=$1', [req.params.key]);
    const data = r.rows[0]?.image_data;
    if (!data) return sendMissing(res);
    return sendImage(res, data);
  } catch { res.status(500).json({ error: 'Failed to fetch system emblem' }); }
});

router.put('/api/emblems/system/:key', async (req, res) => {
  try {
    let dataUrl;
    try { dataUrl = parseEmblemDataUrl(req.body?.image).dataUrl; }
    catch (e) { return res.status(400).json({ error: e.message }); }
    await pool.query(
      `INSERT INTO system_emblems (key, image_data, updated_at) VALUES ($1,$2,NOW())
       ON CONFLICT (key) DO UPDATE SET image_data=$2, updated_at=NOW()`,
      [req.params.key, dataUrl],
    );
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed to save system emblem' }); }
});

router.delete('/api/emblems/system/:key', async (req, res) => {
  try {
    await pool.query('DELETE FROM system_emblems WHERE key=$1', [req.params.key]);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed to clear system emblem' }); }
});

export default router;
