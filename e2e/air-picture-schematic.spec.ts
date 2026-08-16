import { test, expect, type Page } from '@playwright/test';

/**
 * התמונ"א בעמדת שדה **מעוגנת ללא מפה** - המקרה שדווח בבחא 8: הפאנל סופר
 * מטוס, ולא רואים אותו. הבדיקה מפרידה בין שתי אפשרויות שנראות זהות למשתמש:
 * המטוס לא נצבע בכלל, או שהוא נצבע ומכוסה.
 */
const CANVAS = 'canvas[data-air-picture]';

/** כמה פיקסלים לא-שקופים יש על קנבס התמונ"א, ואיפה מרכז המסה. */
async function painted(page: Page) {
  return page.evaluate((sel) => {
    const c = document.querySelector(sel) as HTMLCanvasElement;
    if (!c) return null;
    const ctx = c.getContext('2d')!;
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let n = 0, sx = 0, sy = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) continue;
      const px = (i - 3) / 4;
      n++; sx += px % c.width; sy += Math.floor(px / c.width);
    }
    return { count: n, cx: n ? sx / n : 0, cy: n ? sy / n : 0, w: c.width, h: c.height };
  }, CANVAS);
}

for (const s of ['1', '1.65']) {
  test(`שדה מעוגן ללא מפה: המטוס נצבע על הקנבס — s=${s}`, async ({ page }) => {
    await page.goto(`/e2e/fixtures/air-picture.html?s=${s}`);
    await expect(page.locator(CANVAS)).toBeAttached({ timeout: 15000 });
    await page.waitForTimeout(600);

    await expect(page.locator('#visible-count')).toHaveText('1');

    const p = (await painted(page))!;
    expect(p, 'הקנבס קיים').toBeTruthy();
    expect(p.w, 'רוחב הביטמאפ גדול מאפס').toBeGreaterThan(0);
    expect(p.count, 'נצבעו פיקסלים - המטוס צויר').toBeGreaterThan(20);
    // המטוס במרכז השדה, ולכן מרכז המסה חייב ליפול באמצע הקנבס ולא בפינה
    expect(p.cx / p.w, 'מרכז המסה אופקית').toBeGreaterThan(0.2);
    expect(p.cx / p.w).toBeLessThan(0.9);
    expect(p.cy / p.h, 'מרכז המסה אנכית').toBeGreaterThan(0.2);
    expect(p.cy / p.h).toBeLessThan(0.9);
  });
}

test('הקנבס אינו מכוסה ע"י הרקע הסכמטי', async ({ page }) => {
  await page.goto('/e2e/fixtures/air-picture.html');
  await expect(page.locator(CANVAS)).toBeAttached({ timeout: 15000 });
  await page.waitForTimeout(600);
  // הרקע נצבע לפני התמונ"א, ולכן התמונ"א חייבת להיות מעליו בסדר הצביעה
  const order = await page.evaluate(() => {
    const bg = document.querySelector('[data-testid="schematic"]')!;
    const ap = document.querySelector('canvas[data-air-picture]')!;
    return bg.compareDocumentPosition(ap) & Node.DOCUMENT_POSITION_FOLLOWING ? 'after' : 'before';
  });
  expect(order, 'התמונ"א מרונדרת אחרי הרקע').toBe('after');
});
