import { test, expect } from '@playwright/test';

// ─── אימות ויזואלי של הדו-לשוניות במסך ה-LOGIN ───────────────────────────────
// זה ה-gate שסגר את ה-BLOCKER: tsc/build/unit לא יכולים לתפוס "המסך לא התהפך".

// אין צורך לנקות localStorage — Playwright מבודד context לכל בדיקה.
// (אזהרה: addInitScript היה רץ מחדש גם אחרי reload ומוחק את השפה השמורה.)

test('ברירת המחדל היא עברית ו-RTL', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await expect(page.getByText('מערכת ניהול אווירי טקטי')).toBeVisible();
});

test('מעבר לאנגלית מתרגם את המסך ומהפך ל-LTR', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'English' }).click();

  // הכיווניות התהפכה ברמת ה-root
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  // הטקסט תורגם בפועל
  await expect(page.getByText('Tactical Air Management System')).toBeVisible();
  await expect(page.getByText('Select crew member:')).toBeVisible();
  await expect(page.getByText('Screen size (inches):')).toBeVisible();

  // ואין שאריות עברית במסך
  await expect(page.getByText('מערכת ניהול אווירי טקטי')).toHaveCount(0);
});

test('הבחירה נשמרת אחרי רענון', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByText('Tactical Air Management System')).toBeVisible();
});

test('חזרה לעברית מחזירה RTL', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  await page.getByRole('button', { name: 'עברית' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText('מערכת ניהול אווירי טקטי')).toBeVisible();
});

// צילומי מסך לבדיקת עין אנושית (מופקים תמיד, לא רק בכישלון)
test('צילומי מסך — עברית מול אנגלית', async ({ page }) => {
  await page.goto('/');
  await page.screenshot({ path: 'e2e/__screenshots__/login-he.png', fullPage: true });

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.screenshot({ path: 'e2e/__screenshots__/login-en.png', fullPage: true });
});
