// ATSIM - מאגר התמונ"א. אפליקציה **נפרדת מ-SKY-KING**, בתבנית מיראז'.
//
// שני פנים לאותו שרת:
//   1. AirTrafficAPI  - `GET /air-picture`. קריאה בלבד, לכיוון העמדה. זה
//      הפן היחיד שהעמדה מכירה, והוא זהה לחוזה של המאגר האמיתי.
//   2. ה-FRONT        - מסך בניית התרחישים (`/`) וה-CRUD שמאחוריו. שייך
//      למאגר בלבד; העמדה לא נוגעת בו לעולם.
//
// אין DB ואין ענן (§9). אין תלות ב-SKY-KING - אפשר להריץ את ATSIM לבד.

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createStore } from './store.js';
import { snapshotAt } from './sim.js';
import { CLASSIFICATIONS, AIRCRAFT_TYPES, MAX_TRACKS } from '../shared/airTrafficApi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** ניקוי נקודת דרך. נ"צ חובה; גובה ומהירות נופלים לברירת מחדל שפויה. */
const cleanLeg = (l) => ({
  lat: Number(l?.lat),
  lon: Number(l?.lon),
  alt: Math.max(0, Math.round(Number(l?.alt) || 0)),
  spd: Math.max(1, Math.round(Number(l?.spd) || 300)),
});

const cleanTrack = (t, i) => ({
  id: String(t?.id || `t-${i + 1}`),
  cs: String(t?.cs || `מטוס ${i + 1}`),
  cls: CLASSIFICATIONS.includes(t?.cls) ? t.cls : 'unknown',
  typ: AIRCRAFT_TYPES.includes(t?.typ) ? t.typ : 'jet',
  resp: String(t?.resp || ''),
  loop: t?.loop === true,
  legs: (Array.isArray(t?.legs) ? t.legs : [])
    .map(cleanLeg)
    .filter(l => Number.isFinite(l.lat) && Number.isFinite(l.lon)),
});

/**
 * ניקוי תרחיש נכנס. `startAt` **לא** מגיע מהטופס אלא רק מ-run/stop: שדה
 * שמפעיל תרחיש לא צריך להשתנות בטעות בכל שמירת עריכה.
 */
const cleanScenario = (b) => ({
  name: String(b?.name || 'תרחיש'),
  loop: b?.loop === true,
  enabled: b?.enabled !== false,
  tracks: (Array.isArray(b?.tracks) ? b.tracks : []).map(cleanTrack),
});

export function createAtsimApp({ dataFile } = {}) {
  const store = createStore({ dataFile });
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // ── AirTrafficAPI - הפן שהעמדה רואה ────────────────────────────────────────
  //
  // אסימון **אופציונלי**: מוגדר ATSIM_TOKEN → נדרש Bearer. בפיתוח מקומי הוא
  // כבוי, וברשת אמיתית שרת העמדה הוא שמזריק אותו (§7.3) כדי שהוא לא יגיע
  // ל-renderer.
  const TOKEN = process.env.ATSIM_TOKEN || '';
  const authOk = (req) => {
    if (!TOKEN) return true;
    const h = String(req.headers.authorization || '');
    return h.startsWith('Bearer ') && h.slice(7) === TOKEN;
  };

  app.get('/air-picture', (req, res) => {
    if (!authOk(req)) return res.status(401).json({ error: 'unauthorized' });
    const snap = snapshotAt(store.list(), Date.now());

    // ETag על התוכן בלבד (בלי t/seq, שמשתנים בכל שנייה גם כשאיש לא זז).
    // בלי זה כל דגימה הייתה מטען מלא, גם כשהתמונה קפואה.
    const etag = `W/"${snap.tracks.length}-${hash(JSON.stringify(snap.tracks))}"`;
    res.set('Cache-Control', 'no-store');
    res.set('ETag', etag);
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.json(snap);
  });

  app.get('/api/health', (_req, res) => {
    const scenarios = store.list();
    res.json({
      ok: true,
      app: 'ATSIM',
      running: scenarios.filter(s => s.startAt && s.enabled !== false).length,
      scenarios: scenarios.length,
      tracks: snapshotAt(scenarios, Date.now()).tracks.length,
      maxTracks: MAX_TRACKS,
      store: 'file',
    });
  });

  // ── ה-FRONT - בניית מאגר התמונ"א ───────────────────────────────────────────
  app.get('/api/scenarios', (_req, res) => res.json(store.list()));

  app.post('/api/scenarios', (req, res) => {
    res.status(201).json(store.create({ ...cleanScenario(req.body), startAt: null }));
  });

  app.put('/api/scenarios/:id', (req, res) => {
    const updated = store.update(req.params.id, cleanScenario(req.body));
    if (!updated) return res.status(404).json({ error: 'not found' });
    res.json(updated);
  });

  app.delete('/api/scenarios/:id', (req, res) => {
    if (!store.remove(req.params.id)) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  });

  app.post('/api/scenarios/:id/duplicate', (req, res) => {
    const copy = store.duplicate(req.params.id);
    if (!copy) return res.status(404).json({ error: 'not found' });
    res.status(201).json(copy);
  });

  /**
   * הרצה. `at` ריק = עכשיו; `at` עתידי = "הרצה בשעה מסוימת" - והיא מגיעה
   * בחינם מהמנוע: המטוס פשוט אינו באוויר עד שהזמן מגיע (§9.2).
   */
  app.post('/api/scenarios/:id/run', (req, res) => {
    const at = Number(req.body?.at);
    const startAt = Number.isFinite(at) ? at : Date.now();
    const updated = store.update(req.params.id, { startAt, enabled: true });
    if (!updated) return res.status(404).json({ error: 'not found' });
    res.json(updated);
  });

  app.post('/api/scenarios/:id/stop', (req, res) => {
    const updated = store.update(req.params.id, { startAt: null });
    if (!updated) return res.status(404).json({ error: 'not found' });
    res.json(updated);
  });

  // החוזה המשותף מוגש כמו שהוא ל-FRONT, כדי שהסיווגים, הצבעים וסוגי המטוסים
  // יגיעו מ**מקור אמת אחד** ולא ישוכפלו לתוך ה-HTML. אותו קובץ שהשרת מייבא.
  app.get('/shared/airTrafficApi.js', (_req, res) => {
    res.type('application/javascript')
      .sendFile(path.join(__dirname, '..', 'shared', 'airTrafficApi.js'));
  });

  app.use(express.static(__dirname, { index: 'admin.html', extensions: ['html'] }));
  app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

  return app;
}

/** גיבוב זול ל-ETag. לא קריפטוגרפי - תפקידו לזהות שינוי, לא לעמוד בהתקפה. */
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
