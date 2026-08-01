import { test, expect } from '@playwright/test';
import { loginToWorkstation, identifyViaMirage } from './helpers';

// טופס חברי העמדה + תחקיר — אימות ריצה אמיתי (לא רק tsc/build):
//   1. הטופס נפתח בעליית העמדה עם הסדר הנכון ובלי שדות המושגח
//   2. דגל "קיים משגיח" פותח את שדה המושגח **בצד**, מיושר לשורת האב
//   3. "עדכון חברי העמדה" בתפריט המשתמש פותח את אותו טופס בעמדה החיה
//   4. "צור תחקיר" פותח את טופס התחקיר עם כל השדות

test.describe('חברי עמדה ותחקיר', () => {
  test('טופס הכניסה: סדר השדות, ומושגח נפתח רק אחרי סימון הדגל', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '15.6"' }).click();
    await identifyViaMirage(page);
    await page.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();

    const select = page.locator('select:not(#env-select)').first();
    await expect(select).toBeVisible();
    const presetName = (await select.locator('option:not([disabled])').evaluateAll(
      opts => (opts as HTMLOptionElement[]).map(o => (o.textContent || '').trim()).find(n => n && !n.startsWith('__')) || null
    ))!;
    await select.selectOption({ label: presetName });

    await expect(page.getByText(/כניסה לעמדה:/)).toBeVisible({ timeout: 20000 });
    // השדות נטענים אחרי הכותרת (fetch של חברי העמדה) — ממתינים להם לפני קריאת ה-DOM.
    // שדה קש"פ הוא גם האימות שהכיתוב שלו הוא מספר קשר פנים ולא שם.
    await expect(page.getByPlaceholder('הזן מספר קשר פנים')).toBeVisible({ timeout: 20000 });

    // בפתיחה ראשונה — אין שדות מושגח (הם לא תופסים מקום)
    await expect(page.getByText('מושגח', { exact: true })).toHaveCount(0);

    // הסדר: בקר → אחורי → מפעיל → מש"ק → קש"פ
    const ROLES = ['בקר', 'פקח', 'אחורי', 'מפעיל', 'מש"ק', 'קש"פ'];
    const rolesOnly = (await page.locator('label').evaluateAll(
      els => els.map(e => (e.textContent || '').trim())
    )).filter(l => ROLES.includes(l));
    expect(rolesOnly.length, 'לא נמצאו תוויות תפקידים בטופס').toBeGreaterThan(2);
    expect(rolesOnly[0]).toMatch(/בקר|פקח/);
    expect(rolesOnly[rolesOnly.length - 1]).toBe('קש"פ');

    // דגל "קיים משגיח" ראשון → שדה מושגח נפתח, ומיושר לשורת האב (אותו top)
    const flags = page.getByRole('checkbox');
    await flags.first().check();
    await expect(page.getByText('מושגח', { exact: true })).toBeVisible();

    const nameInputs = page.getByPlaceholder('שם');
    const parentBox = await nameInputs.nth(0).boundingBox();
    const supervisedBox = await nameInputs.nth(1).boundingBox();
    expect(parentBox && supervisedBox).toBeTruthy();
    // יישור: אותה שורה (סטייה של פיקסל בודד מותרת בעיגול)
    expect(Math.abs(parentBox!.y - supervisedBox!.y)).toBeLessThanOrEqual(1);

    // ביטול הדגל מסתיר את השדה בחזרה
    await flags.first().uncheck();
    await expect(page.getByText('מושגח', { exact: true })).toHaveCount(0);
  });

  test('תפריט המשתמש: עדכון חברי העמדה + צור תחקיר', async ({ page }) => {
    await loginToWorkstation(page);

    // פתיחת תפריט המשתמש (הכפתור נושא את שם המשתמש)
    await page.getByRole('button', { name: /בודק אוטומטי|משתמש/ }).first().click();

    await expect(page.getByRole('button', { name: /עדכון חברי העמדה/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /צור תחקיר/ })).toBeVisible();

    // עדכון חברי העמדה — אותו טופס, בכותרת "עדכון"
    await page.getByRole('button', { name: /עדכון חברי העמדה/ }).click();
    await expect(page.getByText(/עדכון חברי העמדה:/)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /^✅ שמירה$/ }).click();
    await expect(page.getByText(/עדכון חברי העמדה:/)).toHaveCount(0, { timeout: 15000 });

    // צור תחקיר — כולל צילום העמדה (עשוי לקחת כמה שניות)
    await page.getByRole('button', { name: /בודק אוטומטי|משתמש/ }).first().click();
    await page.getByRole('button', { name: /צור תחקיר/ }).click();
    await expect(page.getByText(/צור תחקיר:/)).toBeVisible({ timeout: 40000 });

    for (const label of ['מהות תחקיר', 'סיווג תחקיר', 'פירוט תחקיר', 'פירוט אחריות', 'זמן ארוע']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'קריטי' })).toBeVisible();
    await expect(page.getByRole('button', { name: /הוסף מעורב/ })).toBeVisible();
    // הטופס עצמו לא נכנס לתמונה — התמונה צולמה לפניו
    await expect(page.locator('img[alt="תמונת העמדה"]')).toBeVisible({ timeout: 40000 });
  });
});
