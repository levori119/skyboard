import { test, expect } from '@playwright/test';

// ─── מחוון מצב מקלדת בשדה הסיסמה ב-LOGIN ─────────────────────────────────────
// למה e2e ולא unit: הזיהוי מבוסס על אירועי מקלדת אמיתיים - keydown/keyup,
// beforeinput וצירוף Alt+Shift. tsc/vitest לא יכולים לתפוס "המחוון לא התעדכן".

const PASSWORD = 'input[type="password"]';

/** החלפת פריסה בחלונות: Alt+Shift "נקי", בלי מקש נוסף ביניהם */
async function switchLayout(page: import('@playwright/test').Page) {
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
}

test('המחוון מוצג ליד שדה הסיסמה, ולפני הקלדה המצב "?" עם רמז', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator(PASSWORD)).toBeVisible();
  await expect(page.getByText('מקלדת:')).toBeVisible();
  // לא מנחשים: getLayoutMap מחזיר US גם בפריסה עברית (באג Chromium), ולכן "?"
  await expect(page.getByTestId('kbd-lang')).toHaveText('?');
  await expect(page.getByText('הקש תו לזיהוי')).toBeVisible();
});

test('הקלדת תו לטיני מציגה "אנגלית", תו עברי מציג "עברית"', async ({ page }) => {
  await page.goto('/');
  await page.locator(PASSWORD).click();

  await page.keyboard.type('a');
  await expect(page.getByTestId('kbd-lang')).toHaveText('אנגלית');
  await expect(page.getByText('הקש תו לזיהוי')).toHaveCount(0);

  await page.keyboard.type('ש');
  await expect(page.getByTestId('kbd-lang')).toHaveText('עברית');

  await page.keyboard.type('b');
  await expect(page.getByTestId('kbd-lang')).toHaveText('אנגלית');
});

// ── הבאג שדווח: מעבר מאנגלית לעברית לא זוהה עד שהוקלד תו עברי ──
test('Alt+Shift מחליף את המצב מיד, בשני הכיוונים, בלי להקליד', async ({ page }) => {
  await page.goto('/');
  await page.locator(PASSWORD).click();
  await page.keyboard.type('a');
  await expect(page.getByTestId('kbd-lang')).toHaveText('אנגלית');

  await switchLayout(page);
  await expect(page.getByTestId('kbd-lang')).toHaveText('עברית');

  await switchLayout(page);
  await expect(page.getByTestId('kbd-lang')).toHaveText('אנגלית');
});

test('Shift+אות (אות גדולה) לא נחשב החלפת פריסה', async ({ page }) => {
  await page.goto('/');
  await page.locator(PASSWORD).click();
  await page.keyboard.type('a');
  await expect(page.getByTestId('kbd-lang')).toHaveText('אנגלית');

  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('kbd-lang')).toHaveText('אנגלית');
});

test('Alt+Tab לא נחשב החלפת פריסה', async ({ page }) => {
  await page.goto('/');
  await page.locator(PASSWORD).click();
  await page.keyboard.type('a');

  await page.keyboard.down('Alt');
  await page.keyboard.press('Tab');
  await page.keyboard.up('Alt');
  await expect(page.getByTestId('kbd-lang')).toHaveText('אנגלית');
});

test('בלי מצב ידוע, Alt+Shift לא ממציא מצב', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('kbd-lang')).toHaveText('?');
  await switchLayout(page);
  await expect(page.getByTestId('kbd-lang')).toHaveText('?');
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

// צילומי מסך לבדיקת עין אנושית - שלושת המצבים
test('צילומי מסך - לא ידוע / עברית / אנגלית', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('kbd-lang')).toHaveText('?');
  await page.screenshot({ path: 'e2e/__screenshots__/login-keyboard-unknown.png', fullPage: true });

  await page.locator(PASSWORD).click();
  await page.keyboard.type('שדג');
  await expect(page.getByTestId('kbd-lang')).toHaveText('עברית');
  await page.screenshot({ path: 'e2e/__screenshots__/login-keyboard-he.png', fullPage: true });

  await page.keyboard.type('abc');
  await expect(page.getByTestId('kbd-lang')).toHaveText('אנגלית');
  await page.screenshot({ path: 'e2e/__screenshots__/login-keyboard-en.png', fullPage: true });
});
