import { test, expect } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// ─── נקודת העברה זמנית — תפריט "יצירה" + טופס יצירה מרונדרים ──────────────────
test('תפריט יצירה פותח את טופס נקודת ההעברה הזמנית', async ({ page }) => {
  await loginToWorkstation(page);

  // כפתור "יצירה" בסרגל
  const createBtn = page.getByRole('button', { name: /יצירה/ });
  await expect(createBtn.first()).toBeVisible();
  await createBtn.first().click();

  // פריט התפריט "צור נקודת העברה חדשה"
  const createItem = page.getByText('צור נקודת העברה חדשה', { exact: false });
  await expect(createItem.first()).toBeVisible();
  await createItem.first().click();

  // הטופס: שדה שם, בחירת עמדה שנייה, כפתור צור
  await expect(page.getByText('שם נקודת העברה', { exact: false })).toBeVisible();
  await expect(page.getByText('בחר עמדה שנייה', { exact: false })).toBeVisible();
  await expect(page.getByText('הערות לנקודת המעבר', { exact: false })).toBeVisible();

  await page.screenshot({ path: 'e2e/__screenshots__/provisional-form.png' });
});
