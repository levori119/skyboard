import { test, expect } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// ─── "רענן הגדרות" — תפריט תצוגה ──────────────────────────────────────────────
// שתי דרישות, ושתיהן נבדקות כאן:
//   1. הפריט יושב ב**תפריט התצוגה** (ולא בהגדרות עמדה), כי מה שהוא מרענן הוא
//      הגדרות התצוגה של העמדה.
//   2. לחיצה עליו **לא מפילה את העמדה** — אין reload ואין remount. הבדיקה מסמנת
//      את אלמנט הסרגל לפני הלחיצה ומוודאת שהסימון שרד אחריה: reload היה מוחק
//      אותו, ו-remount של הרכיב היה יוצר אלמנט חדש בלי הסימון.

// הכניסה לעמדה כוללת הזדהות, בחירת עמדה וטעינת נתוני שדה ומפות - קרוב לתקרת
// ברירת המחדל (30 שניות) כשה-DB מרוחק. מרווח נדיב כדי שהבדיקה לא תהיה מהבהבת.
test.describe.configure({ timeout: 120000 });

test('רענן הגדרות בתפריט התצוגה — ולא בתפריט ההגדרות', async ({ page }) => {
  await loginToWorkstation(page);

  // קודם תפריט ההגדרות — שם הפריט **לא** אמור להופיע יותר
  await page.locator('[data-help="settingsMenu"]').click();
  await expect(page.getByText(/^רענן הגדרות$/)).toHaveCount(0);
  // סגירה דרך שכבת ה"לחיצה בחוץ" שהתפריט פורש על המסך (היא חוסמת כל קליק אחר)
  await page.mouse.click(8, 400);

  // ובתפריט התצוגה — כן
  await page.locator('[data-help="viewMenu"]').click();
  await expect(page.getByTestId('view-menu-refresh')).toBeVisible();
});

test('לחיצה על רענן הגדרות מרעננת בלי להפיל את העמדה', async ({ page }) => {
  await loginToWorkstation(page);

  // סימון על אלמנט חי בסרגל — שורד רענון הגדרות, לא שורד reload/remount
  await page.evaluate(() => {
    (document.querySelector('[data-help="viewMenu"]') as any).__e2eAlive = true;
  });

  await page.locator('[data-help="viewMenu"]').click();
  await page.getByTestId('view-menu-refresh').click();

  // משוב למפעיל
  await expect(page.getByText(/הגדרות התצוגה רועננו|רענון ההגדרות נכשל/)).toBeVisible({ timeout: 15000 });

  // העמדה על מקומה: לא חזרנו ללוגין, אין מסך טעינה, והאלמנט לא הוחלף
  await expect(page.getByText(/מערכת ניהול אווירי טקטי|Tactical Air Management/)).toHaveCount(0);
  await expect(page.getByText(/המערכת בטעינה|System loading/)).toHaveCount(0);
  const alive = await page.evaluate(
    () => (document.querySelector('[data-help="viewMenu"]') as any)?.__e2eAlive === true
  );
  expect(alive, 'העמדה רונדרה מחדש (או נטענה מחדש) — הרענון הפיל אותה').toBe(true);
});
