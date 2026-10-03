import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

// יעד ה-proxy ל-API. ברירת המחדל 3001 (השרת הראשי); ניתן להפנות לפורט אחר כדי
// להריץ מופע שני במקביל בלי להפיל את שרת הפיתוח שכבר רץ.
const API_TARGET = `http://localhost:${process.env.SKYKING_API_PORT || 3001}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true, // אל תקפוץ ל-5001+ אם 5000 תפוס — נכשל במקום לגלוש לפורט של פרויקט אחר
    allowedHosts: true,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
      '/driver': {
        target: API_TARGET,
        changeOrigin: true,
      },
      // המפה הצפה במצב Google - מוגשת מהשרת עם CSP משלה
      '/live-map': {
        target: API_TARGET,
        changeOrigin: true,
      }
    }
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'framer-motion',
      'lucide-react',
      'clsx',
      'tailwind-merge',
    ],
  },
  build: {
    target: 'esnext',
    sourcemap: false,
  },
  // vitest = בדיקות יחידה בלבד. e2e/ שייך ל-Playwright (npm run test:e2e).
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    // ⚠️ **תקרת ההוק מורמת בשביל PGlite.** הוק שמקים מאגר מקומי
    // (`createLocalPool({ dataDir: 'memory://' })`) מאתחל PostgreSQL ב-WASM,
    // וזה לוקח שניות. בתקרת ברירת המחדל (10 שניות) הוא עובר כשמריצים את
    // הקובץ לבד ו**נופל כשהסוויטה עמוסה** - כלומר כשל שתלוי בעומס המכונה
    // ולא בקוד. בדיוק זה קרה ל-mirageReplica.test.js ול-stationSeed.test.js:
    // שניהם "Hook timed out in 10000ms" בהרצה מלאה, ושניהם ירוקים בהרצה
    // מבודדת. בדיקה שנופלת לפי מי עוד רץ במקביל אינה מלמדת דבר.
    hookTimeout: 60_000,
  },
} as any);
