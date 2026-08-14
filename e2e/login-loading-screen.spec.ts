import { test, expect } from '@playwright/test';
import { identifyViaMirage, pickWorkstation, setScreenSize } from './helpers';

// ─── עליית עמדה: מטופס חברי העמדה ישר למסך הטעינה ────────────────────────────
// טופס חברי העמדה נפתח **מעל** רשימת בחירת העמדה. עד התיקון, סגירת הטופס חשפה
// שוב את הרשימה לכל אורך הכניסה לשרת — הבקר ראה את עצמו "חוזר אחורה" בדיוק
// אחרי שאישר. הבדיקה תופסת את המצב הראשון שמופיע אחרי סגירת הטופס: הוא חייב
// להיות מסך הטעינה, ולא בורר העמדות.

test('אחרי אישור טופס חברי העמדה מוצג מסך הטעינה — לא רשימת בחירת העמדה', async ({ page }) => {
  await setScreenSize(page);
  await page.goto('/');
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();
  await pickWorkstation(page);

  // אישור הטופס (ולא "דלג") — המסלול שהמשתמש מתאר
  const submit = page.locator('#crewFormSubmit');
  await expect(submit).toBeEnabled({ timeout: 20000 });
  await submit.click();

  // המצב הראשון שנראה אחרי שהטופס נסגר. בקוד הישן היה מתקבל 'picker'.
  const first = await page.waitForFunction(() => {
    if (document.querySelector('#crewFormSubmit')) return null;      // הטופס עדיין שומר
    if (document.querySelector('[data-testid="station-loading"]')) return 'loader';
    if (document.querySelector('[data-testid="station-picker"]')) return 'picker';
    return null;
  }, undefined, { timeout: 30000 });

  expect(await first.jsonValue()).toBe('loader');

  // ובורר העמדות אינו על המסך יחד עם מסך הטעינה
  await expect(page.locator('[data-testid="station-picker"]')).toHaveCount(0);
});
