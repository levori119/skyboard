import 'dotenv/config';
import { initDb, cleanupExpiredStrips } from './server/db/init.js';
import { seedDb } from './server/db/seed.js';
import { cleanupProvisionalTransferPoints } from './server/routes/provisional-transfers.js';
import app from './server/app.js';

const PORT = process.env.PORT || 3001;

// עליית DB עמידה ל-cold-start של Neon (auto-suspend): מנסה שוב במקום ליפול מיד.
async function startWithDbRetry() {
  const MAX = 6;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      await initDb();
      await seedDb();
      return;
    } catch (err) {
      const wait = Math.min(1500 * attempt, 8000);
      console.error(`[startup] DB לא זמין (ניסיון ${attempt}/${MAX}): ${err.message}`);
      if (attempt === MAX) throw err;
      console.log(`[startup] Neon כנראה בהתעוררות — ניסיון חוזר בעוד ${wait}ms...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

startWithDbRetry()
  .then(() => {
    cleanupExpiredStrips();
    setInterval(cleanupExpiredStrips, 60 * 60 * 1000);
    cleanupProvisionalTransferPoints();
    setInterval(cleanupProvisionalTransferPoints, 60 * 60 * 1000);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`SKY-KING API running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Startup error (אחרי כל הניסיונות):', err);
    process.exit(1);
  });
