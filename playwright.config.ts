import { defineConfig } from '@playwright/test';

// אימות ויזואלי — מריץ את ה-client בלבד (vite). מסך ה-LOGIN מרונדר גם בלי backend:
// קריאות ה-fetch נכשלות בשקט (catch) והמסך עולה. זה מספיק לאימות i18n/כיווניות.
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    screenshot: 'only-on-failure',
    // bt-authSource: ה-e2e בודקים את זרימת משתמשי המערכת — מקבעים מקור הזדהות
    // "פנימי" (ברירת המחדל במוצר היא מיראז'; לדמו המיראז' יש בדיקות vitest נפרדות).
    // bt-dev-marker: תמונות הייחוס ב-e2e/__screenshots__ מתעדות את המוצר, לא את
    // סביבת ההרצה. ה-e2e רץ תמיד מול שרת ה-vite, כלומר תמיד DEV, ובלי הדגל הזה כל
    // תמונה הייתה נושאת את המסגרת הוורודה של סביבת הפיתוח (ראה src/index.tsx).
    // תמונות הייחוס ב-e2e/__screenshots__ מתעדות את המוצר, לא את סביבת ההרצה.
    // ה-e2e רץ תמיד מול שרת ה-vite, כלומר תמיד DEV, ובלי הדגל הזה כל תמונה הייתה
    // נושאת את המסגרת הוורודה של סביבת הפיתוח (ראה src/index.tsx).
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:5199',
          localStorage: [
            { name: 'bt-authSource', value: 'internal' },
            { name: 'bt-dev-marker', value: 'off' },
          ],
          localStorage: [{ name: 'bt-dev-marker', value: 'off' }],
        },
      ],
    },
  },
  // גם שרת ה-Express (ה-API), גם מיראז' (הזדהות) וגם vite. reuseExistingServer
  // מונע התנגשות אם כבר רץ `npm run dev`.
  webServer: [
    {
      command: 'node server.js',
      // /api/health ולא /api/crew-members: מאז הוספת שכבת האימות (SK-01) כל
      // נתיב מידע מחזיר 401 בלי אסימון, ובדיקת המוכנות הייתה נתקעת לנצח.
      // health הוא ה-endpoint הציבורי שנועד בדיוק לזה.
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      // מסך ה-LOGIN עובד מול מיראז' בלבד — בלי השירות הזה אין כניסה לעמדה.
      // MIRAGE_DATA_FILE: אחסון מבודד לבדיקות, כדי שמשתמש הבדיקות לא ייכתב ל-data.json
      command: 'node mirage/server.js',
      url: 'http://127.0.0.1:7300/api/health',
      env: { MIRAGE_DATA_FILE: 'e2e/.mirage-e2e.json' },
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command: 'npx vite --port 5199 --strictPort',
      url: 'http://localhost:5199',
      reuseExistingServer: true,
      timeout: 60000,
    },
  ],
});
