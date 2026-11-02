import { test, expect } from '@playwright/test';
import { identifyViaMirage, setScreenSize } from './helpers';

// ─── טופס העמדה: שמירה וחיווי מצב גם למעלה ───────────────────────────────────
// הטופס ארוך, וכפתור העדכון היה רק בתחתיתו: כדי לשמור, או רק לדעת אם יש בכלל
// מה לשמור, היה צריך לגלול עד הסוף. הסרגל העליון דביק ונשאר גלוי בגלילה.
// הבדיקה לא שומרת - היא רק מוודאת שהחיווי מגיב לשינוי ושהסרגל נשאר גלוי.

test.use({ viewport: { width: 1280, height: 700 } });

test('טופס העמדה: כפתור עדכון וחיווי "יש שינויים" בראש הטופס, גלויים גם אחרי גלילה', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('skyking.stationAgent', 'http://127.0.0.1:9'));
  await setScreenSize(page);
  await page.goto('/');
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /ניהול מערכת/ }).click();
  await page.getByRole('button', { name: '🖥 עמדות', exact: true }).click();

  // הרשימה מקובצת לפי בסיס אב, והקבוצות סגורות בפתיחה
  await page.getByRole('button', { name: /^▶/ }).first().click();
  const rows = page.locator('[data-testid="admin-preset-row"]');
  await expect(rows.first()).toBeVisible({ timeout: 20000 });
  await rows.first().getByRole('button', { name: /^עריכה$|^Edit$/ }).click();

  const bar = page.getByTestId('preset-top-bar');
  const save = page.getByTestId('preset-save-top');
  const status = page.getByTestId('preset-save-status');
  await expect(bar).toBeVisible();
  await expect(save).toBeDisabled();
  await expect(status).toHaveText(/אין שינויים/);

  // שינוי בטופס - הכפתור נדלק והחיווי מתחלף
  const nameInput = bar.locator('xpath=following::input[1]');
  const orig = await nameInput.inputValue();
  await nameInput.fill(`${orig} `);
  await expect(save).toBeEnabled();
  await expect(status).toHaveText(/שלא נשמרו/);

  // גלילה לתחתית הטופס - הסרגל עדיין בתוך החלון הנראה
  await bar.evaluate(el => {
    let p: HTMLElement | null = el.parentElement;
    while (p && getComputedStyle(p).overflowY !== 'auto') p = p.parentElement;
    p?.scrollTo(0, p.scrollHeight);
  });
  await page.waitForTimeout(300);
  const box = (await bar.boundingBox())!;
  expect(box.y, 'הסרגל נשאר בראש החלון').toBeGreaterThan(0);
  expect(box.y).toBeLessThan(200);
  await expect(save).toBeInViewport();
  await page.screenshot({ path: 'test-results/preset-save-top.png' });

  // ביטול השינוי - חוזרים ל"אין שינויים", בלי לשמור דבר
  await nameInput.fill(orig);
  await expect(status).toHaveText(/אין שינויים/);
});
