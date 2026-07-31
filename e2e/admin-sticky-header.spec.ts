import { test, expect } from '@playwright/test';
import { identifyViaMirage } from './helpers';

// ─── כותרת מסך הניהול נשארת גלויה בגלילה ──────────────────────────────────────
// הדרישה: במסך ניהול מערכת הכותרת (שם המסך, באדג' הסביבה, כפתור החזרה) חייבת
// להישאר על המסך גם כשהתוכן ארוך וגוללים - אחרת המנהל מאבד את ההקשר ואת דרך
// היציאה, ובעיקר את החיווי אם הוא עורך בתרגול או באמת.

// חלון נמוך — מבטיח שיש בכלל מה לגלול, בלי תלות בכמות העמדות ב-DB של הבדיקות
test.use({ viewport: { width: 1280, height: 500 } });

test('מסך ניהול: הכותרת וכפתור החזרה נשארים גלויים אחרי גלילה', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '15.6"' }).click();
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /ניהול מערכת/ }).click();

  const header = page.locator('header').first();
  const backBtn = page.getByRole('button', { name: 'חזרה' });
  await expect(header).toBeVisible();
  await expect(backBtn).toBeVisible();

  // טאב עם תוכן ארוך, כדי שתהיה בכלל גלילה
  await page.getByRole('button', { name: '🖥 עמדות', exact: true }).click();
  await expect(page.getByText('הגדרת עמדות')).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);

  // ההוכחה: אחרי הגלילה הכותרת עדיין צמודה לראש החלון (ולא נגללה החוצה)
  const box = await header.boundingBox();
  expect(box, 'לכותרת יש מיקום על המסך').toBeTruthy();
  expect(box!.y).toBeLessThanOrEqual(1);
  expect(box!.y, 'הכותרת לא נגללה מעל לחלון').toBeGreaterThanOrEqual(-1);
  await expect(backBtn).toBeInViewport();
  await expect(page.getByRole('heading', { name: 'ניהול מערכת' })).toBeInViewport();

  // תפריט הצד הדביק לא נכנס מתחת לכותרת
  const sideNav = page.getByRole('button', { name: '🖥 עמדות', exact: true });
  const navBox = await sideNav.boundingBox();
  expect(navBox!.y).toBeGreaterThanOrEqual(box!.y + box!.height - 1);
});
