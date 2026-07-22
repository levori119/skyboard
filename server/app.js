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
import collaborationRouter from './routes/collaboration.js';
import adminRouter       from './routes/admin.js';
import classicRouter     from './routes/classic.js';
import civilianRouter    from './routes/civilian.js';
import driverRouter      from './routes/driver.js';
import positionMergesRouter from './routes/position-merges.js';
import translationsRouter from './routes/translations.js';
import provisionalTransfersRouter from './routes/provisional-transfers.js';
import missionDesksRouter from './routes/missionDesks.js';
import mirageRouter      from './routes/mirage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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
app.use(collaborationRouter);
app.use(adminRouter);
app.use(classicRouter);
app.use(civilianRouter);
app.use(driverRouter);
app.use(positionMergesRouter);
app.use(translationsRouter);
app.use(provisionalTransfersRouter);
app.use(missionDesksRouter);
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
