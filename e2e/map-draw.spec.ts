import { test, expect, type Page } from '@playwright/test';

/**
 * סרגל הציור על המפה - הרכיב המשותף לעמדת המפה ולעמדת השדה.
 *
 * מה נבדק כאן ולא ב-unit: שהציור עובד **בעט ובאצבע** (לא רק בעכבר) - המלכודת
 * מספר 1 בפרויקט - ושהקו נוחת במקום הנכון גם כשהמפה מוזזת/מוגדלת וגם תחת הזום
 * הגלובלי של מסך 24". ראה CLAUDE.md §גרירה - מגע ועט.
 */

const CANVAS = '#map-content canvas';

type Pt = { x: number; y: number };

/** משיכה אחת בעט/אצבע/עכבר על הקנבס, בקואורדינטות מסך. */
async function stroke(page: Page, pointerType: 'pen' | 'touch' | 'mouse', from: Pt, to: Pt, steps = 12) {
  const base = { pointerId: 1, pointerType, isPrimary: true, bubbles: true, button: 0, buttons: 1 };
  await page.dispatchEvent(CANVAS, 'pointerdown', { ...base, clientX: from.x, clientY: from.y });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.dispatchEvent(CANVAS, 'pointermove', {
      ...base, clientX: from.x + (to.x - from.x) * t, clientY: from.y + (to.y - from.y) * t,
    });
  }
  await page.dispatchEvent(CANVAS, 'pointerup', { ...base, buttons: 0, clientX: to.x, clientY: to.y });
}

/** מה צויר בפועל על ה-bitmap: מספר הפיקסלים הצבועים ומרכז המסה שלהם. */
async function painted(page: Page) {
  return page.evaluate((sel) => {
    const c = document.querySelector(sel) as HTMLCanvasElement;
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

const canvasBox = async (page: Page) => (await page.locator(CANVAS).boundingBox())!;

async function open(page: Page, s = 1) {
  await page.goto(`/e2e/fixtures/map-draw.html?s=${s}`);
  await expect(page.locator(CANVAS)).toBeAttached();
}

test('כשהציור כבוי הקנבס שקוף לאירועים ולא חוסם את המפה', async ({ page }) => {
  await open(page);
  await expect(page.locator(CANVAS)).toHaveCSS('pointer-events', 'none');
  const box = await canvasBox(page);
  await stroke(page, 'pen', { x: box.x + 60, y: box.y + 60 }, { x: box.x + 240, y: box.y + 60 });
  expect((await painted(page)).count).toBe(0);
});

for (const pointerType of ['pen', 'touch', 'mouse'] as const) {
  test(`ציור ב-${pointerType} מצייר על המפה`, async ({ page }) => {
    await open(page);
    await page.locator('button[title="הפעל ציור על המפה"]').click();
    await expect(page.locator(CANVAS)).toHaveCSS('pointer-events', 'auto');

    const box = await canvasBox(page);
    await stroke(page, pointerType, { x: box.x + 60, y: box.y + 100 }, { x: box.x + 300, y: box.y + 100 });

    expect((await painted(page)).count).toBeGreaterThan(50);
  });
}

test('הקו נוחת במקום שבו העט נגע - גם כשהמפה מוגדלת וגם במסך 24"', async ({ page }) => {
  await open(page, 1.65);                       // הזום הגלובלי של מסך 24"
  await page.locator('button[title="הפעל ציור על המפה"]').click();
  await page.locator('#zoom-in').click();       // זום מפה x2
  await page.waitForTimeout(250);               // סוף ה-transition של שכבת המפה

  const box = await canvasBox(page);
  // קו אופקי ברבע הגובה הנראה של הקנבס, לרוחב האמצע שלו
  const y = box.y + box.height * 0.25;
  await stroke(page, 'pen', { x: box.x + box.width * 0.3, y }, { x: box.x + box.width * 0.7, y });

  const p = await painted(page);
  expect(p.count).toBeGreaterThan(50);
  // מרכז המסה חייב לשבת באותו **יחס** שבו נגע העט - אחרת יש הסטה של זום/סקייל
  expect(p.cy / p.h).toBeCloseTo(0.25, 1);
  expect(p.cx / p.w).toBeCloseTo(0.5, 1);
});

test('הציור מעוגן למפה: שינוי גודל החלון לא מזיז ולא מוחק אותו', async ({ page }) => {
  await open(page);
  await page.locator('button[title="הפעל ציור על המפה"]').click();

  const box = await canvasBox(page);
  const y = box.y + box.height * 0.5;
  await stroke(page, 'pen', { x: box.x + box.width * 0.2, y }, { x: box.x + box.width * 0.8, y });
  const before = await painted(page);

  await page.locator('#resize').click();        // 600px → 900px
  await page.waitForTimeout(300);               // ResizeObserver + ציור מחדש מהשברים

  const after = await painted(page);
  expect(after.w).toBeGreaterThan(before.w);    // הקנבס באמת השתנה
  expect(after.count).toBeGreaterThan(50);      // הציור לא נמחק
  expect(after.cy / after.h).toBeCloseTo(before.cy / before.h, 1);
  expect(after.cx / after.w).toBeCloseTo(before.cx / before.w, 1);
});

test('"נקה" מוחק את הציור', async ({ page }) => {
  await open(page);
  await page.locator('button[title="הפעל ציור על המפה"]').click();
  const box = await canvasBox(page);
  await stroke(page, 'pen', { x: box.x + 60, y: box.y + 100 }, { x: box.x + 300, y: box.y + 100 });
  expect((await painted(page)).count).toBeGreaterThan(50);

  await page.getByRole('button', { name: '🗑 נקה' }).click();
  expect((await painted(page)).count).toBe(0);
});

test('מלבן נשמר כצורה ומצויר על המפה', async ({ page }) => {
  await open(page);
  await page.locator('button[title="הפעל ציור על המפה"]').click();
  await page.getByRole('button', { name: '▭ מלבן' }).click();

  const box = await canvasBox(page);
  await stroke(page, 'pen', { x: box.x + 80, y: box.y + 80 }, { x: box.x + 260, y: box.y + 200 });

  await expect(page.locator('#shape-count')).toHaveText('1');
  await expect(page.locator('#map-content svg rect')).toHaveCount(1);
});
