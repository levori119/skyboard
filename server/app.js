import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import crewRouter        from './routes/crew.js';
import stripsRouter      from './routes/strips.js';
import transfersRouter   from './routes/transfers.js';
import sectorsRouter     from './routes/sectors.js';
import workstationsRouter from './routes/workstations.js';
import mapsRouter        from './routes/maps.js';
import blocksRouter      from './routes/blocks.js';
import airfieldRouter    from './routes/airfield.js';
import baseRouter        from './routes/base.js';
import emblemRouter      from './routes/emblem.js';
import collaborationRouter from './routes/collaboration.js';
import adminRouter       from './routes/admin.js';
import classicRouter     from './routes/classic.js';
import civilianRouter    from './routes/civilian.js';
import driverRouter      from './routes/driver.js';
import positionMergesRouter from './routes/position-merges.js';
import translationsRouter from './routes/translations.js';
import provisionalTransfersRouter from './routes/provisional-transfers.js';
import missionDesksRouter from './routes/missionDesks.js';
import suggestionsRouter from './routes/suggestions.js';
import mirageRouter      from './routes/mirage.js';
import environmentsRouter from './routes/environments.js';
import { createEnvironmentMiddleware } from './middleware/environment.js';
import { ensureEnvSchema } from './db/envs.js';
import { rawPool } from './db/pool.js';
import { bootState } from './boot-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ── בריאות ─────────────────────────────────────────────────────────────────────
// ראשון בשרשרת, ובכוונה לא נוגע ב-DB: זה ה-endpoint היחיד שעונה גם בזמן
// שעליית ה-DB עדיין רצה (עשרות שניות מול Neon). Railway/Docker משתמשים בו
// כ-healthcheck, וכך 502 אילם הופך להודעה שאפשר לקרוא.
//   booting → 200 (השרת חי, ה-DB עוד עולה)   failed → 503 + סיבת הכשל
app.get('/api/health', (req, res) => {
  const s = bootState();
  res.status(s.phase === 'failed' ? 503 : 200).json({
    ok: s.phase !== 'failed',
    ...s,
    port: Number(process.env.PORT) || 3001,
    nodeEnv: process.env.NODE_ENV || 'development',
  });
});

// ── מוכנות (readiness) ─────────────────────────────────────────────────────────
// בשונה מ-/api/health שהוא **liveness** (התהליך חי, בכוונה בלי לגעת ב-DB),
// כאן נבדק האם המופע הזה באמת מסוגל לשרת **עכשיו**: DB מגיב תוך זמן סביר.
// זה מה ש-load balancer צריך כדי לנתב תעבורה **הצידה** ממופע שה-DB שלו נפל,
// במקום שכל העמדות יקבלו 500. ראה ARCHITECTURE.md - יתירות ו-failover.
app.get('/api/ready', async (req, res) => {
  const started = Date.now();
  const boot = bootState();
  // מופע שעדיין עולה אינו מוכן: הסכמה אולי לא הושלמה, ו-LB שינתב אליו תעבורה
  // יחזיר שגיאות לעמדות. `/api/health` הוא זה שנשאר 200 בשלב הזה (liveness),
  // כדי שפלטפורמת האירוח לא תהרוג את הקונטיינר באמצע העלייה.
  if (boot.phase !== 'ready') {
    return res.status(503).json({ ready: false, reason: boot.phase, error: boot.error, ...boot });
  }
  try {
    // ישירות ל-rawPool: המוכנות של המופע אינה תלויה בהקשר סביבה
    await Promise.race([
      rawPool.query('SELECT 1'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('db timeout')), 3000)),
    ]);
    res.json({ ready: true, dbLatencyMs: Date.now() - started });
  } catch (err) {
    res.status(503).json({ ready: false, reason: 'db', error: err.message, dbLatencyMs: Date.now() - started });
  }
});

// ── סביבות תרגול ───────────────────────────────────────────────────────────────
// ניהול הסביבות (רשימה/כניסה/איפוס) עובד ישירות מול public — נטען *לפני*
// ה-middleware כדי שלא יהיה תלוי בהקשר סביבה או ייחסם ב-503 של יצירת סכמה.
app.use(environmentsRouter);
// מכאן ואילך: כל בקשה מקבלת הקשר סביבה לפי כותרת X-Env (ברירת מחדל 1 → public),
// ו-pool.query מכוון אוטומטית לסכמה הנכונה — בלי לגעת בשאר ה-routes.
app.use(createEnvironmentMiddleware({ ensure: ensureEnvSchema }));

// ── API Routes ────────────────────────────────────────────────────────────────
// כל ה-routes מגדירים את הנתיב המלא (כולל /api), לכן נטענים ב-root.
app.use(crewRouter);
app.use(stripsRouter);
app.use(transfersRouter);
app.use(sectorsRouter);
app.use(workstationsRouter);
app.use(mapsRouter);
app.use(blocksRouter);
app.use(airfieldRouter);
app.use(baseRouter);
app.use(emblemRouter);
app.use(collaborationRouter);
app.use(adminRouter);
app.use(classicRouter);
app.use(civilianRouter);
app.use(driverRouter);
app.use(positionMergesRouter);
app.use(translationsRouter);
app.use(provisionalTransfersRouter);
app.use(missionDesksRouter);
app.use(suggestionsRouter);
app.use(mirageRouter);

// ── Static serving ────────────────────────────────────────────────────────────
const distPath = path.join(__dirname, '..', 'dist');

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath));
  app.get(/^(?!\/api).*$/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Development: redirect non-API, non-driver requests to Vite dev server on :5000
  app.get(/^(?!\/(api|driver)).*$/, (req, res) => {
    const viteUrl = `${req.protocol}://${req.hostname}:5000${req.originalUrl}`;
    res.redirect(302, viteUrl);
  });
}

export default app;
