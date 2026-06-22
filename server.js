import 'dotenv/config';
import { initDb, cleanupExpiredStrips } from './server/db/init.js';
import { seedDb } from './server/db/seed.js';
import app from './server/app.js';

const PORT = process.env.PORT || 3001;

initDb()
  .then(seedDb)
  .then(() => {
    cleanupExpiredStrips();
    setInterval(cleanupExpiredStrips, 60 * 60 * 1000);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`SKY-KING API running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Startup error:', err);
    process.exit(1);
  });
