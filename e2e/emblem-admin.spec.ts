import { test, expect, Page } from '@playwright/test';
import { identifyViaMirage } from './helpers';

// ─── ניהול סמלים ממסך הניהול ──────────────────────────────────────────────────
// הדרישה: לבחור תמונה ביישות "בסיסים" ושהיא תחליף את הסמל המובנה בקוד.
// ⚠️ הבדיקה המרכזית היא **שהתמונה שהועלתה מגיעה לעמדה** - לא רק שה-API שמר אותה.

const API = 'http://localhost:3001/api';

// PNG 3x3 אדום - נבדל מכל סמל מובנה, כך שהחלפה בפועל ניתנת לזיהוי
const RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAYAAABWKLW/AAAAFklEQVR42mP8z8BQz0AEYBxVSF+FAP5FBAWnnwUyAAAAAElFTkSuQmCC',
  'base64',
);
const BASE_NAME = '509';                 // בסיס האב של "מרחבי 305"
const PRESET_WITH_BASE = 'מרחבי 305';

async function baseByName(page: Page, name: string) {
  const bases = await (await page.request.get(`${API}/aviation-bases`)).json();
  return bases.find((b: any) => b.name === name);
}

async function openAdminBasesTab(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '15.6"' }).click();
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /ניהול מערכת/ }).click();
  await page.getByRole('button', { name: '✈️ בסיסים' }).click();
  await expect(page.getByText('✈️ בסיסי תעופה')).toBeVisible();
}

test.afterEach(async ({ request }) => {
  const bases = await (await request.get(`${API}/aviation-bases`)).json();
  const b = bases.find((x: any) => x.name === BASE_NAME);
  if (b) await request.delete(`${API}/emblems/base/${b.id}`).catch(() => {});
  await request.delete(`${API}/emblems/system/micha`).catch(() => {});
});

// כניסה למסך הניהול + כניסה לעמדה באותה בדיקה — שתי טעינות מלאות
test.setTimeout(120000);

test('סמל בסיס: העלאה בניהול → ממוזער בטבלה → מוצג בעמדה במקום הסמל המובנה', async ({ page }) => {
  const base = await baseByName(page, BASE_NAME);
  expect(base, `בסיס ${BASE_NAME} חייב להתקיים לבדיקה`).toBeTruthy();
  await page.request.delete(`${API}/emblems/base/${base.id}`);

  await openAdminBasesTab(page);

  // עריכת הבסיס → בחירת תמונה → שמירה
  // שורת הבסיס = ה-div הפנימי ביותר שמכיל גם את שם הבסיס וגם את כפתור העריכה
  const row = page.locator('div')
    .filter({ has: page.getByText(BASE_NAME, { exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'עריכה' }) })
    .last();
  await row.getByRole('button', { name: 'עריכה' }).click();
  const picker = page.getByTestId('emblem-base');
  await expect(picker).toBeVisible();
  await picker.locator('input[type="file"]').setInputFiles({ name: 'emblem.png', mimeType: 'image/png', buffer: RED_PNG });
  await expect(picker.getByText('ייכנס לתוקף בשמירת הבסיס')).toBeVisible();
  await page.getByRole('button', { name: 'שמור', exact: true }).first().click();

  // נשמר ב-DB, והתמונה נמשכת מה-endpoint
  await expect.poll(async () => (await baseByName(page, BASE_NAME)).has_emblem, { timeout: 10000 }).toBe(true);
  const img = await page.request.get(`${API}/emblems/base/${base.id}`);
  expect(img.ok()).toBeTruthy();
  expect(img.headers()['content-type']).toContain('image/');

  // ממוזער בטבלת הבסיסים
  await expect(page.locator(`img[src*="/emblems/base/${base.id}"]`).first()).toBeVisible();

  // ההוכחה: בעמדה מוצג הסמל מה-DB, לא הקובץ המובנה
  await page.goto('/');
  await page.getByRole('button', { name: '15.6"' }).click();
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();
  const select = page.locator('select:not(#env-select)').first();
  const label = await select.locator('option:not([disabled])').evaluateAll((opts, name) => {
    const hit = (opts as HTMLOptionElement[]).find(o => (o.textContent || '').includes(name));
    return hit ? (hit.textContent || '').trim() : null;
  }, PRESET_WITH_BASE);
  expect(label, `עמדה "${PRESET_WITH_BASE}"`).toBeTruthy();
  await select.selectOption({ label: label! });
  await page.getByRole('button', { name: /^דלג$|^Skip$/ }).click();

  await expect(page.locator(`img[src*="/emblems/base/${base.id}"]`).first()).toBeVisible({ timeout: 20000 });
  const srcs = await page.locator('img').evaluateAll(imgs =>
    (imgs as HTMLImageElement[]).map(i => i.getAttribute('src') || '').filter(s => /emblem|509\./.test(s)));
  expect(srcs.some(s => s.includes(`/emblems/base/${base.id}`)), `סמל ה-DB מוצג: ${srcs}`).toBeTruthy();
  expect(srcs.some(s => /assets\/emblems\/files\/509/.test(s)), `הסמל המובנה כבר לא מוצג: ${srcs}`).toBeFalsy();
});

test('סמל מיח"ה: העלאה בניהול מגיעה לעמדה, והסרה מחזירה את הסמל המובנה', async ({ page }) => {
  await page.request.delete(`${API}/emblems/system/micha`);
  await openAdminBasesTab(page);

  const picker = page.getByTestId('emblem-micha');
  await expect(picker).toBeVisible();
  await picker.locator('input[type="file"]').setInputFiles({ name: 'micha.png', mimeType: 'image/png', buffer: RED_PNG });

  await expect.poll(async () => (await page.request.get(`${API}/emblems/system/micha`)).status(), { timeout: 10000 }).toBe(200);

  // בעמדה מוצג סמל מיח"ה מה-DB
  await page.goto('/');
  await page.getByRole('button', { name: '15.6"' }).click();
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();
  const select = page.locator('select:not(#env-select)').first();
  const first = await select.locator('option:not([disabled])').evaluateAll(
    opts => (opts as HTMLOptionElement[]).map(o => (o.textContent || '').trim()).find(n => n && !n.startsWith('__')) || null);
  await select.selectOption({ label: first! });
  await page.getByRole('button', { name: /^דלג$|^Skip$/ }).click();
  await expect(page.locator('img[src*="/emblems/system/micha"]').first()).toBeVisible({ timeout: 20000 });

  // הסרה → העמדה חוזרת לסמל המובנה (micha.png מה-bundle)
  await page.request.delete(`${API}/emblems/system/micha`);
  await page.goto('/');
  await page.getByRole('button', { name: '15.6"' }).click();
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();
  await page.locator('select:not(#env-select)').first().selectOption({ label: first! });
  await page.getByRole('button', { name: /^דלג$|^Skip$/ }).click();
  await expect(page.locator('img[src*="emblems/files/micha"]').first()).toBeVisible({ timeout: 20000 });
});
