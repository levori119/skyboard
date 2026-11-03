import { test, expect } from '@playwright/test';
import { setScreenSize } from './helpers';

// ─── מקלדת שקופצת בכל שדה טקסט במגע ───────────────────────────────────────────
// העמדה היא מסך מגע בלי מקלדת פיזית בהישג יד: נגיעה באצבע/עט בשדה טקסט כלשהו
// פותחת את המקלדת שעל המסך, וההקלדה נכנסת לשדה (גם לשדה מבוקר של React).
// בעכבר המקלדת לא קופצת - מי שעובד בעכבר יש לו מקלדת.

test.use({ hasTouch: true, viewport: { width: 1280, height: 800 } });

test('נגיעה בשדה טקסט פותחת את המקלדת, וההקלדה נכנסת לשדה; עכבר - לא', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('skyking.stationAgent', 'http://127.0.0.1:9'));
  await setScreenSize(page);
  await page.goto('/');
  const field = page.locator('input[type="text"], input:not([type]), input[type="search"], input[type="number"], input[type="tel"]').first();
  await expect(field).toBeVisible({ timeout: 30000 });
  // המקלדת מרונדרת ב-portal - מחפשים את המקשים שלה בעמוד
  const caps = page.getByRole('button', { name: 'CAPS' });

  await field.click();          // עכבר
  await expect(caps).toHaveCount(0);
  await page.locator('body').click({ position: { x: 5, y: 5 } });

  await field.tap();            // מגע
  await expect(caps, 'המקלדת קפצה').toBeVisible();
  await page.getByRole('button', { name: '1', exact: true }).first().dispatchEvent('pointerdown');
  await page.getByRole('button', { name: '2', exact: true }).first().dispatchEvent('pointerdown');
  await expect(field).toHaveValue(/12$/);
  await page.screenshot({ path: 'test-results/touch-keyboard.png' });
});
