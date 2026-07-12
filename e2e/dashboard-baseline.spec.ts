import { test, expect } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// ─── רשת ביטחון ל-SectorDashboard (עמדת הבקר) ────────────────────────────────
// המטרה: לתפוס רגרסיות גיאומטריות כשנמיר את 293 מאפייני הפריסה ל-logical properties.
// הבדיקה מצלמת את המסך ומוודאת שלא "התפוצץ" — אלמנטים במקום, אין גלישה אופקית.

test('כניסה לעמדת בקר — הדשבורד עולה', async ({ page }) => {
  const preset = await loginToWorkstation(page);
  expect(preset.length).toBeGreaterThan(0);

  // הדשבורד עלה: ה-<html> עדיין RTL (עברית ברירת מחדל)
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await page.waitForTimeout(2500); // נתינת זמן ל-polling הראשון
  await page.screenshot({ path: 'e2e/__screenshots__/dashboard-he.png', fullPage: false });
});

test('הדשבורד לא גולש אופקית (סימן מובהק לשבירת פריסה)', async ({ page }) => {
  await loginToWorkstation(page);
  await page.waitForTimeout(2500);

  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  // סטייה קטנה מותרת (scrollbar); גלישה אמיתית = פריסה שבורה
  expect(overflow.scrollW - overflow.clientW).toBeLessThan(30);
});
