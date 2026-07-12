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
  },
  // גם שרת ה-Express (ה-API) וגם vite. reuseExistingServer מונע התנגשות
  // אם כבר רץ `npm run dev`.
  webServer: [
    {
      command: 'node server.js',
      url: 'http://localhost:3001/api/crew-members',
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
