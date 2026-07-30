import { test, expect } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// ─── מסך מלא בעליית עמדה (kiosk) ─────────────────────────────────────────────
// בפרודקשן העמדה עולה כמו F11 — בלי שורת כתובת ובלי טאבים. ה-e2e רץ מול vite
// dev (לא build), ולכן מדליקים את הדגל 'bt-kiosk' כדי לאמת את אותה זרימה בדיוק.

test('עליית עמדה עוברת למסך מלא', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bt-kiosk', 'on'));
  await loginToWorkstation(page);

  // ה-root דווקא — כך portals שמרונדרים ל-body (מודלים, מקלדת) נשארים גלויים
  const el = await page.evaluate(() => document.fullscreenElement?.tagName ?? null);
  expect(el).toBe('HTML');
});

test('בלי דגל (פיתוח) — נשארים בחלון רגיל', async ({ page }) => {
  await loginToWorkstation(page);

  const el = await page.evaluate(() => document.fullscreenElement?.tagName ?? null);
  expect(el).toBeNull();
});
