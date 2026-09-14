import { test, expect, type Page } from '@playwright/test';

/**
 * "ניהול נהגים": הנהג נבחר מהמורשים במיראז' לבסיס, בדפדפן אמיתי.
 *
 * המתקן (e2e/fixtures/permits-mirage.tsx) מרנדר את החלון האמיתי; רק הרשת
 * מדומה. **לא נוגע ב-DB.**
 */

const posted = (page: Page) => page.evaluate(() => (window as unknown as { __posted: { method: string; body: Record<string, unknown> }[] }).__posted);
const driverSelect = (page: Page) => page.locator('select').filter({ has: page.locator('option', { hasText: 'בחר נהג' }) });

async function openNew(page: Page) {
  await page.locator('button[title="נהג חדש"]').click();
  await expect(driverSelect(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/permits-mirage.html');
  await expect(page.getByText('משה ותיק')).toBeVisible({ timeout: 15000 });
});

test('נהג חדש: אין שדות שם/ת"ז להקלדה - בוחרים מהמורשים, והשם והת"ז נגזרים', async ({ page }) => {
  await openNew(page);
  const options = await driverSelect(page).locator('option').allTextContents();
  expect(options).toEqual(['-- בחר נהג --', 'דני כהן · 012345678', 'רונית לוי · 012345682']);
  // ת"ז לקריאה בלבד
  await expect(page.locator('input[readonly]').first()).toHaveValue('');

  await driverSelect(page).selectOption('012345682');
  await expect(page.locator('input[readonly]').first()).toHaveValue('012345682');
  await page.getByRole('button', { name: 'שמור' }).click();
  await expect.poll(() => posted(page)).toHaveLength(1);
  const [p] = await posted(page);
  expect(p.method).toBe('POST');
  expect(p.body).toMatchObject({ first_name: 'רונית', last_name: 'לוי', national_id: '012345682' });
  await page.screenshot({ path: 'e2e/__screenshots__/permits-mirage.png' });
});

test('שמירה בלי בחירה - נחסמת עם הודעה, ושום דבר לא נשלח', async ({ page }) => {
  await openNew(page);
  await page.getByRole('button', { name: 'שמור' }).click();
  await expect(page.getByText("יש לבחור נהג מרשימת המורשים במיראז'")).toBeVisible();
  expect(await posted(page)).toHaveLength(0);
});

test('נהג ותיק שאינו במיראז\' - מסומן, ועדיין אפשר לעדכן לו פרטים', async ({ page }) => {
  await page.getByText('משה ותיק').click();
  await expect(driverSelect(page)).toHaveValue('099999990');
  await expect(page.getByText("הנהג אינו מורשה במיראז' לבסיס הזה")).toBeVisible();
  await page.getByRole('button', { name: 'שמור' }).click();
  await expect.poll(() => posted(page)).toHaveLength(1);
  expect((await posted(page))[0].method).toBe('PUT');
});

test('המיראז\' לא זמין - הבורר כבוי, הסבר מפורש, ונהג חדש לא נשמר', async ({ page }) => {
  await page.evaluate(() => { (window as unknown as { __mirage: string }).__mirage = 'unavailable'; });
  await openNew(page);
  await expect(driverSelect(page)).toBeDisabled();
  await expect(page.getByText("המיראז' אינו זמין - אי אפשר להוסיף או להחליף נהג.")).toBeVisible();
  await page.getByRole('button', { name: 'שמור' }).click();
  await expect(page.getByText("המיראז' אינו זמין - אי אפשר להוסיף או להחליף נהג כרגע")).toBeVisible();
  expect(await posted(page)).toHaveLength(0);
});

test('שדה בלי בסיס - הסבר שהבעיה בהגדרת השדה', async ({ page }) => {
  await page.evaluate(() => { (window as unknown as { __mirage: string }).__mirage = 'no_base'; });
  await openNew(page);
  await expect(page.getByText('לשדה לא הוגדר בסיס')).toBeVisible();
});
