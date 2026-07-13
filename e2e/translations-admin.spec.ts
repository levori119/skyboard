import { test, expect } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// ─── הדרישה המרכזית: לשנות שם (עברית או אנגלית) בלי לגעת בקוד ────────────────
// ⚠️ הבדיקה החשובה כאן היא **שהדריסה מגיעה למסך**, לא רק שה-API מחזיר אותה.
// הגרסה הראשונה בדקה רק round-trip של ה-API — פרצה שהייתה מאפשרת לבאג תצוגה לחמוק.

const KEY = 'ctrl.transferPoints';
const OVERRIDE_HE = 'אזורי מסירה (בדיקה)';
const OVERRIDE_EN = 'HANDOVER ZONES (test)';

test.afterEach(async ({ request }) => {
  await request.delete(`http://localhost:3001/api/translations/${encodeURIComponent(KEY)}`).catch(() => {});
});

test('דריסה שנשמרה מוחלת על המסך התפעולי — אנגלית', async ({ page, request }) => {
  const res = await request.put('http://localhost:3001/api/translations', {
    data: { rows: [{ key: KEY, he: OVERRIDE_HE, en: OVERRIDE_EN }], updatedBy: 'e2e' },
  });
  expect(res.ok()).toBeTruthy();

  await page.addInitScript(() => localStorage.setItem('bt-lang', 'en'));
  await loginToWorkstation(page);

  // הערך שנערך מוצג; ברירת המחדל שבקובץ כבר לא
  await expect(page.getByText(OVERRIDE_EN, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Transfer points', { exact: true })).toHaveCount(0);
});

test('דריסה שנשמרה מוחלת על המסך התפעולי — עברית', async ({ page, request }) => {
  await request.put('http://localhost:3001/api/translations', {
    data: { rows: [{ key: KEY, he: OVERRIDE_HE, en: OVERRIDE_EN }] },
  });

  await loginToWorkstation(page); // עברית = ברירת מחדל
  await expect(page.getByText(OVERRIDE_HE, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('נקודות העברה', { exact: true })).toHaveCount(0);
});

test('איפוס מחזיר את ברירת המחדל שבקובץ — גם על המסך', async ({ page, request }) => {
  await request.put('http://localhost:3001/api/translations', {
    data: { rows: [{ key: KEY, he: OVERRIDE_HE, en: OVERRIDE_EN }] },
  });
  await request.delete(`http://localhost:3001/api/translations/${encodeURIComponent(KEY)}`);

  const rows = await (await request.get('http://localhost:3001/api/translations')).json();
  expect(rows.find((x: any) => x.key === KEY)).toBeUndefined();

  await loginToWorkstation(page);
  await expect(page.getByText('נקודות העברה', { exact: true }).first()).toBeVisible();
});
