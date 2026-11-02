import { test, expect } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// צילום המסך עבר מהסרגל העליון לתפריט שם המשתמש, מתחת להקלטה. Ctrl+P נשאר.
test('צילום מסך בתפריט המשתמש, מתחת להקלטה, ולא בסרגל העליון', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('skyking.stationAgent', 'http://127.0.0.1:9'));
  await loginToWorkstation(page);

  const topbar = page.locator('.bt-topbar').first();
  await expect(topbar.getByRole('button', { name: '📷' })).toHaveCount(0);

  await page.locator('[data-help="userMenu"]').click();
  const item = page.locator('[data-help="screenshot"]');
  await expect(item).toBeVisible();
  await expect(item).toHaveText(/צילום מסך/);
  await page.screenshot({ path: 'test-results/screenshot-user-menu.png' });

  // הלחיצה סוגרת את התפריט (כדי שלא ייכנס לצילום) ומצלמת
  await item.click();
  await expect(item).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: /נשמר בהורדות|צילום המסך נכשל|Saved|failed/ })).toBeVisible({ timeout: 15000 });
});
