import { test, expect, type Page } from '@playwright/test';

/**
 * מעקב נסיעה חי **במגדל**, בדפדפן אמיתי (TRIP_LIVE_TRACKING_SPEC.md §6 T1-T12).
 *
 * המתקן (e2e/fixtures/trip-live.tsx) מרנדר את הרכיבים האמיתיים עם ההוקים והסקר
 * האמיתיים; רק הרשת מדומה. **לא נוגע ב-DB** - אין שרת API בבדיקה הזו.
 *
 * מה נבדק כאן ולא ברינדור סטטי: שהסקר רץ ומזין את השכבה ואת ההתרעות מאותו
 * מנוי, שהרכב נוחת גאומטרית במקום הנכון על המסך, ושהתרעת סטייה שנסגרה **חוזרת**
 * כשהרכב חוזר לנתיב וסוטה שוב.
 */

/** הסקר רץ כל 5 ש' - מחכים לסבב אחד ועוד מרווח */
const POLL = 6500;

async function center(page: Page, sel: string) {
  const box = await page.locator(sel).locator('div').first().boundingBox();
  return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/trip-live.html');
  await expect(page.locator('[data-testid="live-vehicle-1"]')).toBeVisible({ timeout: 15000 });
});

test('T1-T3/T5/T7: כל רכב בגוון של מצבו', async ({ page }) => {
  await expect(page.locator('[data-testid="live-vehicle-1"]')).toHaveAttribute('data-tone', 'normal');
  await expect(page.locator('[data-testid="live-vehicle-2"]')).toHaveAttribute('data-tone', 'deviating');
  await expect(page.locator('[data-testid="live-vehicle-3"]')).toHaveAttribute('data-tone', 'blocked');
  await expect(page.locator('[data-testid="live-vehicle-4"]')).toHaveAttribute('data-tone', 'waiting');
});

test('T1: הרכב נוחת גאומטרית במקום שה-GPS מדווח', async ({ page }) => {
  // lat 31.25, lon 34.65 → 50%/50% של גבולות התמונה (left 20, top 20, 520x390)
  const map = await page.locator('#map-area').boundingBox();
  const c = await center(page, '[data-testid="live-vehicle-1"]');
  expect(c!.x - map!.x).toBeCloseTo(20 + 260, 0);
  expect(c!.y - map!.y).toBeCloseTo(20 + 195, 0);
});

test('T2: ממתין למיקום - בנקודת המוצא', async ({ page }) => {
  const map = await page.locator('#map-area').boundingBox();
  const c = await center(page, '[data-testid="live-vehicle-4"]');
  expect(c!.x - map!.x).toBeCloseTo(20 + 0.4 * 520, 0);
  await expect(page.locator('[data-testid="live-vehicle-4"]')).toContainText('ממתין למיקום');
});

test('T1: הנתיבים שאושרו מצוירים', async ({ page }) => {
  for (const id of [1, 2, 3]) await expect(page.locator(`[data-testid="live-route-${id}"]`)).toBeAttached();
});

test('T5/T7: שתי התרעות - החסימה ראשונה, עם הפרטים', async ({ page }) => {
  const stack = page.locator('[data-testid="trip-alerts"]');
  await expect(stack).toBeVisible();
  const cards = stack.locator(':scope > div').filter({ hasText: /מתקרב לאלמנט סוגר|סטייה מהנתיב/ });
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('מתקרב לאלמנט סוגר');
  await expect(cards.nth(0)).toContainText('מחסום צפוני');
  await expect(cards.nth(0)).toContainText('סגור');
  await expect(cards.nth(1)).toContainText('סטייה מהנתיב');
  await expect(cards.nth(1)).toContainText('312');
  await page.screenshot({ path: 'e2e/__screenshots__/trip-live-tower.png' });
});

test('T6: התרעת סטייה שנסגרה חוזרת כשהרכב סוטה שוב', async ({ page }) => {
  const stack = page.locator('[data-testid="trip-alerts"]');
  const deviation = stack.locator(':scope > div').filter({ hasText: 'סטייה מהנתיב' });
  await expect(deviation).toHaveCount(1);

  // הפקח סוגר את ההתרעה
  await deviation.getByRole('button').last().click();
  await expect(deviation).toHaveCount(0);

  // הרכב חוזר לנתיב - ההתרעה נשארת סגורה, והתנאי חלף
  await page.evaluate(() => {
    const w = window as unknown as { __scenario: Array<Record<string, unknown>>; __setLive: (r: unknown[]) => void };
    w.__setLive(w.__scenario.map(t => (t.id === 2 ? { ...t, deviating: false, deviation_m: 8 } : t)));
  });
  await page.waitForTimeout(POLL);
  await expect(page.locator('[data-testid="live-vehicle-2"]')).toHaveAttribute('data-tone', 'normal');
  await expect(deviation).toHaveCount(0);

  // וסוטה שוב - ההתרעה **חוזרת**
  await page.evaluate(() => {
    const w = window as unknown as { __scenario: unknown[]; __setLive: (r: unknown[]) => void };
    w.__setLive(w.__scenario);
  });
  await page.waitForTimeout(POLL);
  await expect(deviation).toHaveCount(1);
});

test('רכב מתריע מעל רכב תקין כשהתוויות חופפות', async ({ page }) => {
  // רכב תקין **אחרי** המתריע בסדר ה-DOM, בדיוק במקומו. בשכבה שווה האלמנט המאוחר
  // נצבע מעל - ולכן בלי הדירוג לפי חומרה הרכב התקין היה מסתיר את המתריע.
  await page.evaluate(() => {
    const w = window as unknown as { __scenario: Array<Record<string, any>>; __setLive: (r: unknown[]) => void };
    const blocked = w.__scenario.find(t => t.id === 3)!;
    w.__setLive(w.__scenario.map(t => (t.id === 4 ? { ...t, position: { ...blocked.position }, stale: false } : t)));
  });
  await expect(page.locator('[data-testid="live-vehicle-4"]')).toHaveAttribute('data-tone', 'normal', { timeout: 8000 });
  await page.waitForTimeout(POLL);
  const c = await center(page, '[data-testid="live-vehicle-3"]');
  const onTop = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return el?.closest('[data-testid^="live-vehicle-"]')?.getAttribute('data-testid') ?? null;
  }, [c!.x, c!.y]);
  expect(onTop).toBe('live-vehicle-3');
});

test('לחיצה על רכב פותחת את הנסיעה', async ({ page }) => {
  await page.locator('[data-testid="live-vehicle-3"]').click();
  expect(await page.evaluate(() => (window as unknown as { __opened: number[] }).__opened)).toContain(3);
});
