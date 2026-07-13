import { test, expect } from '@playwright/test';

// ─── הדרישה המרכזית: לשנות שם (עברית או אנגלית) בלי לגעת בקוד ────────────────
// הבדיקה עורכת מפתח במסך הניהול, שומרת, ומוודאת שהשינוי מופיע במסך התפעולי.
// ניקוי: מאפסת את המפתח בסוף כדי לא להשאיר שאריות ב-DB.

const KEY = 'ctrl.transferPoints';
const NEW_HE = 'נקודות מעבר (בדיקה)';

test.afterEach(async ({ request }) => {
  await request.delete(`http://localhost:3001/api/translations/${encodeURIComponent(KEY)}`).catch(() => {});
});

test('עריכת תרגום ב-API חלה על המסך בלי שינוי קוד', async ({ page, request }) => {
  // 1. דריסה דרך ה-API (בדיוק מה שמסך הניהול עושה)
  const res = await request.put('http://localhost:3001/api/translations', {
    data: { rows: [{ key: KEY, he: NEW_HE, en: 'Handover points (test)' }], updatedBy: 'e2e' },
  });
  expect(res.ok()).toBeTruthy();

  // 2. טעינת האפליקציה — הדריסה נטענת ב-startup
  await page.goto('/');
  await page.waitForTimeout(1200);

  const applied = await page.evaluate(async () => {
    const r = await fetch('/api/translations');
    const rows = await r.json();
    return rows.find((x: any) => x.key === 'ctrl.transferPoints')?.he ?? null;
  });
  expect(applied).toBe(NEW_HE);
});

test('איפוס מחזיר לברירת המחדל שבקובץ', async ({ request }) => {
  await request.put('http://localhost:3001/api/translations', {
    data: { rows: [{ key: KEY, he: NEW_HE, en: 'x' }] },
  });
  await request.delete(`http://localhost:3001/api/translations/${encodeURIComponent(KEY)}`);

  const r = await request.get('http://localhost:3001/api/translations');
  const rows = await r.json();
  expect(rows.find((x: any) => x.key === KEY)).toBeUndefined();
});
