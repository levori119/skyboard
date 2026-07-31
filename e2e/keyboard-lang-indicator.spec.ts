import { test, expect } from '@playwright/test';

// ─── מחוון מצב מקלדת בשדה הסיסמה ב-LOGIN ─────────────────────────────────────
// למה e2e ולא unit: הזיהוי מבוסס על אירועי מקלדת אמיתיים ועל Keyboard Map API -
// שניהם קיימים רק בדפדפן. tsc/vitest לא יכולים לתפוס "המחוון לא התעדכן".

const PASSWORD = 'input[type="password"]';

test('המחוון מוצג ליד שדה הסיסמה', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator(PASSWORD)).toBeVisible();
  await expect(page.getByText('מקלדת:')).toBeVisible();
});

test('הקלדת תו לטיני מציגה "אנגלית", תו עברי מציג "עברית"', async ({ page }) => {
  await page.goto('/');
  await page.locator(PASSWORD).click();

  await page.keyboard.type('a');
  await expect(page.getByTestId('kbd-lang')).toHaveText('אנגלית');

  await page.keyboard.type('ש');
  await expect(page.getByTestId('kbd-lang')).toHaveText('עברית');

  await page.keyboard.type('b');
  await expect(page.getByTestId('kbd-lang')).toHaveText('אנגלית');
});

test('המחוון מתורגם לאנגלית יחד עם המסך', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  await expect(page.getByText('Keyboard:')).toBeVisible();
  await page.locator(PASSWORD).click();
  await page.keyboard.type('ש');
  await expect(page.getByTestId('kbd-lang')).toHaveText('Hebrew');
});

test('CAPS LOCK פעיל מציג התראה נפרדת', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator(PASSWORD)).toBeVisible();

  // Playwright לא יודע לדמות CapsLock דרך CDP - שולחים אירוע עם הדגל של המפרט
  await expect(page.getByTestId('kbd-caps')).toHaveCount(0);
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', modifierCapsLock: true } as KeyboardEventInit));
  });
  await expect(page.getByTestId('kbd-caps')).toBeVisible();
});

// צילומי מסך לבדיקת עין אנושית - שני המצבים
test('צילומי מסך - מצב עברית מול מצב אנגלית', async ({ page }) => {
  await page.goto('/');
  await page.locator(PASSWORD).click();

  await page.keyboard.type('שדג');
  await expect(page.getByTestId('kbd-lang')).toHaveText('עברית');
  await page.screenshot({ path: 'e2e/__screenshots__/login-keyboard-he.png', fullPage: true });

  await page.keyboard.type('abc');
  await expect(page.getByTestId('kbd-lang')).toHaveText('אנגלית');
  await page.screenshot({ path: 'e2e/__screenshots__/login-keyboard-en.png', fullPage: true });
});
