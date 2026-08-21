import { test, expect, type Page } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// ─── שחזור חלון שנסגר מתוך הקונטיינר ────────────────────────────────────────
// מהשטח: "אחרי שלחצתי על מחיקת לוח הודעות מהקונטיינר, לחיצה על 'לוח הודעות'
// בתפריט תצוגה לא מחזירה אותו". שחזור התקלה לפני התיקון.

test.describe.configure({ timeout: 180000, retries: 1 });
// retries: כניסה לעמדה חוזרת לשרת החי בכל בדיקה, ובהרצה רצופה היא לעיתים
// חורגת מה-15 שניות ש-loginToWorkstation ממתין. באג אמיתי נופל גם בניסיון החוזר.

async function fakeContainerEnabled(page: Page) {
  const patch = (body: unknown): unknown => {
    if (Array.isArray(body)) return body.map(p => (p && typeof p === 'object' ? { ...p, show_window_container: true } : p));
    if (body && typeof body === 'object') return { ...(body as object), show_window_container: true };
    return body;
  };
  // ⚠ **רק `/config`, ובכוונה.** `myPresetConfig` הוא `livePresetConfig ?? הרשימה`,
  // ולכן די בנתיב הזה כדי להדליק את היכולת. תפיסת `/api/workstation-presets`
  // עצמו האטה את **הלוגין** - בורר העמדות ניזון מאותה רשימה - והבדיקות נפלו
  // על מסך הכניסה ולא על מה שהן בודקות.
  await page.route(url => /^\/api\/workstation-presets\/\d+\/config$/.test(new URL(url).pathname), async route => {
    try {
      const res = await route.fetch();
      const body = await res.json();
      await route.fulfill({ response: res, body: JSON.stringify(patch(body)), contentType: 'application/json' });
    } catch {
      await route.fallback();
    }
  });
}

const container = (page: Page) => page.locator('[data-help="windowContainer"]');
const slots = (page: Page) => container(page).locator('[data-dock-slot]');
const board = (page: Page) => page.getByText(/הודעות שלי|My messages/).first();

async function openBoardFromViewMenu(page: Page) {
  await page.getByRole('button', { name: /תצוגה|View/ }).first().click();
  await page.getByText(/לוח הודעות|Message board/).first().click();
}

async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 14 });
  await page.mouse.up();
}

const center = (b: { x: number; y: number; width: number; height: number }) =>
  ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

test('לוח הודעות שנסגר מתוך הקונטיינר חוזר מתפריט התצוגה', async ({ page }) => {
  await fakeContainerEnabled(page);
  await loginToWorkstation(page);
  await expect(container(page)).toBeVisible({ timeout: 20000 });

  // פותחים את לוח ההודעות ומעגנים אותו
  await openBoardFromViewMenu(page);
  await expect(board(page)).toBeVisible({ timeout: 10000 });
  await dragTo(page, center((await board(page).boundingBox())!), center((await container(page).boundingBox())!));
  await expect(slots(page)).toHaveCount(1, { timeout: 10000 });

  // סוגרים אותו **מתוך הקונטיינר** - כפתור המזעור שבכותרת הלוח עצמו
  await container(page).getByRole('button', { name: '—' }).click();
  await expect(slots(page)).toHaveCount(0, { timeout: 10000 });
  await expect(board(page)).toHaveCount(0);

  // ⬅ הליבה: תפריט התצוגה חייב להחזיר אותו
  await openBoardFromViewMenu(page);
  await expect(board(page), 'הלוח חזר אחרי לחיצה בתפריט תצוגה').toBeVisible({ timeout: 10000 });
});

test('חלון ששוחרר מהקונטיינר ב-↗ חוזר לתוך המסך ולא נעלם מעבר לקצה', async ({ page }) => {
  await fakeContainerEnabled(page);
  await loginToWorkstation(page);
  await expect(container(page)).toBeVisible({ timeout: 20000 });

  await openBoardFromViewMenu(page);
  await expect(board(page)).toBeVisible({ timeout: 10000 });

  // איפה הלוח צף **לפני** העגינה
  const beforeBox = (await board(page).boundingBox())!;

  await dragTo(page, center(beforeBox), center((await container(page).boundingBox())!));
  await expect(slots(page)).toHaveCount(1, { timeout: 10000 });

  // שחרור בכפתור ↗ (ולא בגרירה) - אין מיקום מצביע להסתמך עליו
  await container(page).getByTitle(/החזר לחלון צף|Back to floating window/).click();
  await expect(slots(page)).toHaveCount(0, { timeout: 10000 });

  // הלוח חזר לצוף - וחייב להיות **בתוך המסך**, לא מעבר לקצה
  await expect(board(page)).toBeVisible({ timeout: 10000 });
  const afterBox = (await board(page).boundingBox())!;
  const vp = page.viewportSize()!;
  console.log('לפני עגינה:', JSON.stringify(beforeBox), '| אחרי שחרור:', JSON.stringify(afterBox), '| מסך:', JSON.stringify(vp));

  expect(afterBox.x, 'שמאל הלוח בתוך המסך').toBeGreaterThanOrEqual(0);
  expect(afterBox.x + afterBox.width, 'ימין הלוח בתוך המסך').toBeLessThanOrEqual(vp.width);
  expect(afterBox.y + afterBox.height, 'תחתית הלוח בתוך המסך').toBeLessThanOrEqual(vp.height);
});
