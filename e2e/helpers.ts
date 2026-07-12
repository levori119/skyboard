import { Page, expect } from '@playwright/test';

/**
 * כניסה לעמדת בקר (CTRL) — משמש כרשת ביטחון לבדיקות SectorDashboard.
 * מדמה בדיוק את זרימת המשתמש: גודל מסך → איש צוות → בחירת עמדה → דילוג על התפקידים.
 */
export async function loginToWorkstation(page: Page, opts: { crew?: string; preset?: string } = {}) {
  const crewName = opts.crew ?? 'אורי  אלימלך'; // admin — רואה את כל העמדות
  await page.goto('/');

  // 1. גודל מסך (נדרש לפני כניסה)
  await page.getByRole('button', { name: '15.6"' }).click();

  // 2. איש צוות — חיפוש ובחירה
  const search = page.getByPlaceholder(/חפש מתוך|Search \d+ crew/);
  await search.click();
  await search.fill(crewName.split(' ')[0]);
  await page.getByRole('button', { name: new RegExp(crewName.split(' ')[0]) }).first().click();

  // 3. בחירת עמדה
  await page.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();

  // 4. עמדה מהרשימה
  const select = page.locator('select').first();
  await expect(select).toBeVisible();
  const presetName = opts.preset ?? (await select.locator('option:not([disabled])').first().textContent())!;
  await select.selectOption({ label: presetName.trim() });

  // 5. מודל התפקידים → דלג
  const skip = page.getByRole('button', { name: /^דלג$|^Skip$/ });
  await skip.click();

  // 6. הגענו לדשבורד — הלוגין נעלם
  await expect(page.getByText(/מערכת ניהול אווירי טקטי|Tactical Air Management/)).toHaveCount(0, { timeout: 15000 });

  // 7. ממתינים שמסך הטעינה ייעלם — אחרת נצלם splash ולא את המסך התפעולי
  await expect(page.getByText(/המערכת בטעינה|System loading/)).toHaveCount(0, { timeout: 45000 });
  await page.waitForLoadState('networkidle').catch(() => {}); // polling רץ תמיד — לא קריטי
  return presetName.trim();
}
