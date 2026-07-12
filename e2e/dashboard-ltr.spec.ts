import { test, expect } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// ─── מוודא שעמדת הבקר באמת מתהפכת ל-LTR באנגלית ──────────────────────────────
// בורר השפה קיים רק ב-LOGIN, ולכן קובעים את השפה לפני הכניסה (כמו משתמש אמיתי).

test('עמדת הבקר מתהפכת ל-LTR כשהשפה אנגלית', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bt-lang', 'en'));
  await loginToWorkstation(page);

  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  // אין גלישה אופקית גם ב-LTR — הפריסה לא נשברה בהיפוך
  const o = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(o.scrollW - o.clientW).toBeLessThan(30);

  await page.screenshot({ path: 'e2e/__screenshots__/dashboard-en-ltr.png', fullPage: false });
});
