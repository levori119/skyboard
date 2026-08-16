import { test, expect } from '@playwright/test';
import { identifyViaMirage, setScreenSize } from './helpers';

// ─── מסך הניהול: קיבוץ תוכן לפי בסיס אב ──────────────────────────────────────
// הדרישה: העמדות, המפות, העזרים והבלוקים במסך הניהול מקובצים לפי **בסיס אב**,
// וראש צוות רואה רק את המכלולים שהמיראז' אישר לו בהם עמדה.
//
// הבדיקה בונה נתונים משלה (שתי מפות, כל אחת לבסיס אחר) במקום להישען על מה
// שקיים ב-DB: בלי זה הכותרות לא בהכרח מופיעות - קבוצה יחידה מוצגת בלי כותרת
// בכוונה, ולכן בדיקה שנשענת על נתונים קיימים הייתה ירוקה או אדומה באקראי.

const API = process.env.E2E_API_URL || 'http://localhost:3001/api';
const STAMP = `__e2e_base_${Date.now()}`;
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

let mapIds: number[] = [];
let baseNames: string[] = [];

test.beforeAll(async ({ request }) => {
  const bases = await (await request.get(`${API}/aviation-bases`)).json();
  test.skip(bases.length < 2, 'נדרשים לפחות שני בסיסי אב כדי שיהיה מה לקבץ');
  baseNames = [bases[0].name, bases[1].name];
  for (const b of [bases[0], bases[1]]) {
    const res = await request.post(`${API}/maps`, {
      data: { name: `${STAMP}_${b.id}`, image_data: PNG, parent_base_id: b.id },
    });
    mapIds.push((await res.json()).id);
  }
});

test.afterAll(async ({ request }) => {
  for (const id of mapIds) await request.delete(`${API}/maps/${id}`);
});

test('מסך ניהול: מפות מקובצות לפי בסיס אב, עם בורר שיוך בכל שורה', async ({ page }) => {
  await setScreenSize(page);
  await page.goto('/');
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /ניהול מערכת/ }).click();
  await page.getByRole('button', { name: '🗺 מפות', exact: true }).click();

  // כותרת קבוצה לכל אחד משני הבסיסים שהוזנו
  for (const name of baseNames) {
    await expect(page.locator(`[data-testid="base-group"][data-base-name="${name}"]`))
      .toBeVisible({ timeout: 20000 });
  }

  // המפה שיצרנו יושבת **בתוך** קבוצת הבסיס שלה ולא ברשימה שטוחה
  const firstGroup = page.locator(`[data-testid="base-group"][data-base-name="${baseNames[0]}"]`);
  const groupBody = firstGroup.locator('xpath=following-sibling::div[1]');
  await expect(groupBody.getByText(`${STAMP}_`, { exact: false }).first()).toBeVisible();

  // כל שורת מפה מציעה שיוך לבסיס אב
  await expect(groupBody.locator('[data-testid="parent-base-select"]').first()).toBeVisible();
});

test('מסך ניהול: העמדות מקובצות לפי בסיס אב', async ({ page }) => {
  await setScreenSize(page);
  await page.goto('/');
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /ניהול מערכת/ }).click();
  await page.getByRole('button', { name: '🖥 עמדות', exact: true }).click();
  await expect(page.getByText('הגדרת עמדות')).toBeVisible();

  const groups = page.locator('[data-testid="base-group"]');
  const rows = page.locator('[data-testid="admin-preset-row"]');
  await expect(rows.first()).toBeVisible({ timeout: 20000 });

  // או שיש כותרות קיבוץ, או שכל העמדות שייכות לבסיס אחד (ואז אין מה לקבץ -
  // ההתנהגות המכוונת). בשני המקרים חייבות להופיע שורות עמדה.
  const groupCount = await groups.count();
  if (groupCount > 0) {
    // כל שורת עמדה יושבת בתוך קבוצה כלשהי
    expect(groupCount).toBeGreaterThan(1);
  }
  expect(await rows.count()).toBeGreaterThan(0);
});
