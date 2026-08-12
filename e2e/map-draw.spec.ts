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

// ── רגרסיה: הקנבס כיסה את פקדי המפה ─────────────────────────────────────────
// שכבת התוכן של מפת השדה איבדה את ה-transform בזום 100%, ואיתו את קונטקסט
// הערימה - הקנבס (z=200) דלף לקונטקסט של מכולת המפה וכיסה את סרגל הציור ואת
// פאנל השכבות: הכפתורים לא נלחצו והעט צייר על גבי החלון. השומר כאן הוא
// **המבנה**: כל מה שבשכבת התוכן חייב להישאר מתחת לפקדים, בלי קשר ל-z-index שלו.
/** מה שיושב בפועל מעל מרכז האלמנט - הכפתור עצמו, או הקנבס שמכסה אותו. */
async function topTagAt(page: Page, sel: string) {
  const box = (await page.locator(sel).boundingBox())!;
  return page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName.toLowerCase() ?? null,
    [box.x + box.width / 2, box.y + box.height / 2]);
}

test('במצב ציור הפקדים על המפה נשארים לחיצים, והעט לא מצייר עליהם', async ({ page }) => {
  await open(page);
  const toggle = 'button[title="הפעל ציור על המפה"]';
  await page.locator(toggle).click();

  // כפתור ה-✏ עצמו (z=31, כמו פאנל השכבות בעמדת השדה) - לא מכוסה בקנבס
  expect(await topTagAt(page, 'button[title="כבה ציור"]')).not.toBe('canvas');
  // וכפתורי הסרגל
  expect(await topTagAt(page, 'button:has-text("▭ מלבן")')).not.toBe('canvas');

  // הכפתור נלחץ בפועל ומחליף כלי (שורת המילוי מופיעה רק לכלי צורה)
  await page.getByRole('button', { name: '▭ מלבן' }).click();
  await expect(page.getByRole('button', { name: 'קווי' })).toBeVisible();

  // משיכה על גוף הסרגל אינה מציירת דבר
  const box = (await page.getByRole('button', { name: '▭ מלבן' }).boundingBox())!;
  await stroke(page, 'pen', { x: box.x - 20, y: box.y }, { x: box.x + box.width + 20, y: box.y });
  expect((await painted(page)).count).toBe(0);

  // ו"סגור" באמת סוגר
  await page.getByRole('button', { name: '✕ סגור' }).click();
  await expect(page.getByText('כלי ציור')).toBeHidden();
  await expect(page.locator(CANVAS)).toHaveCSS('pointer-events', 'none');
});

// ── מיקום הצורה ─────────────────────────────────────────────────────────────
// עד כה נבדק רק **מיקום קו העט** (פיקסלים על ה-bitmap). הצורה עוברת מסלול אחר
// לגמרי - שבר מגודל הקנבס → שכבת SVG - ולכן היא יכולה לנחות במקום אחר בלי
// שאף בדיקה תרגיש. מהשטח: "ציור עיגול ומלבן בעמדת שדה לא מצוייר מהמקום הנכון".
for (const { s, zoom, label } of [
  { s: 1, zoom: false, label: '15.6", זום מפה 100%' },
  { s: 1, zoom: true, label: '15.6", זום מפה x2' },
  { s: 1.65, zoom: false, label: '24", זום מפה 100%' },
  { s: 1.65, zoom: true, label: '24", זום מפה x2' },
]) {
  test(`המלבן נוחת בדיוק במקום שבו העט נגרר - ${label}`, async ({ page }) => {
    await open(page, s);
    await page.locator('button[title="הפעל ציור על המפה"]').click();
    await page.getByRole('button', { name: '▭ מלבן' }).click();
    if (zoom) { await page.locator('#zoom-in').click(); await page.waitForTimeout(250); }

    const box = await canvasBox(page);
    const from = { x: box.x + box.width * 0.25, y: box.y + box.height * 0.25 };
    const to = { x: box.x + box.width * 0.65, y: box.y + box.height * 0.70 };
    await stroke(page, 'pen', from, to);

    const r = await page.locator('#map-content svg rect').first().boundingBox();
    expect(r, 'המלבן לא רונדר כלל').not.toBeNull();
    // הצורה חייבת לשבת על מסלול הגרירה עצמו. הסבילות היא עובי הקו + עיגול.
    expect(Math.abs(r!.x - from.x), `היסט אופקי (${label})`).toBeLessThan(6);
    expect(Math.abs(r!.y - from.y), `היסט אנכי (${label})`).toBeLessThan(6);
    expect(Math.abs(r!.width - (to.x - from.x)), `רוחב (${label})`).toBeLessThan(6);
    expect(Math.abs(r!.height - (to.y - from.y)), `גובה (${label})`).toBeLessThan(6);
  });
}

// התקלה מהשטח: המשטח הורכב תחת הורה `position:static` בגודל אחר מבלוק ההכלה,
// ה-bitmap נבנה לפי ההורה ואילו שכבת הצורות פורשה לפי בלוק ההכלה - הצורה נחתה
// מוסטת ומוקטנת ב-35%. המשטח חייב למדוד את **עצמו**, בכל מקום שבו יורכב.
test('הצורה נוחתת נכון גם כשההורה הישיר static ובגודל אחר', async ({ page }) => {
  await page.goto('/e2e/fixtures/map-draw.html?sp=1');
  await expect(page.locator(CANVAS)).toBeAttached();
  await page.locator('button[title="הפעל ציור על המפה"]').click();
  await page.getByRole('button', { name: '▭ מלבן' }).click();

  const box = await canvasBox(page);
  const from = { x: box.x + box.width * 0.25, y: box.y + box.height * 0.25 };
  const to = { x: box.x + box.width * 0.70, y: box.y + box.height * 0.70 };
  await stroke(page, 'pen', from, to);

  const r = await page.locator('[data-draw-shapes] rect').first().boundingBox();
  expect(r, 'המלבן לא רונדר כלל').not.toBeNull();
  expect(Math.abs(r!.x - from.x), 'היסט אופקי').toBeLessThan(6);
  expect(Math.abs(r!.y - from.y), 'היסט אנכי').toBeLessThan(6);
  expect(Math.abs(r!.width - (to.x - from.x)), 'רוחב').toBeLessThan(6);
  expect(Math.abs(r!.height - (to.y - from.y)), 'גובה').toBeLessThan(6);
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

test('סרגל הציור נגרר - בעט, באצבע ובעכבר', async ({ page }) => {
  await open(page);
  await page.locator('button[title="הפעל ציור על המפה"]').click();

  const bar = page.locator('[data-draw-toolbar]');
  const handle = bar.locator('[data-drag-handle]');
  await expect(bar).toBeVisible();
  await expect(handle).toBeVisible();

  for (const pointerType of ['pen', 'touch', 'mouse'] as const) {
    const before = (await bar.boundingBox())!;
    const h = (await handle.boundingBox())!;
    const from = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
    const base = { pointerId: 7, pointerType, isPrimary: true, bubbles: true, button: 0, buttons: 1 };
    await handle.dispatchEvent('pointerdown', { ...base, clientX: from.x, clientY: from.y });
    for (let i = 1; i <= 6; i++) {
      await handle.dispatchEvent('pointermove',
        { ...base, clientX: from.x + (60 * i) / 6, clientY: from.y + (40 * i) / 6 });
    }
    await handle.dispatchEvent('pointerup', { ...base, buttons: 0, clientX: from.x + 60, clientY: from.y + 40 });

    const after = (await bar.boundingBox())!;
    // הסרגל זז בכיוון הגרירה. הסובלנות רחבה בכוונה - נבדק **שהוא זז**, לא
    // דיוק תת-פיקסלי, כי המלכודת האמיתית היא שבאצבע הוא לא זז בכלל.
    expect(Math.abs(after.x - before.x), `${pointerType}: תזוזה אופקית`).toBeGreaterThan(20);
    expect(Math.abs(after.y - before.y), `${pointerType}: תזוזה אנכית`).toBeGreaterThan(10);
  }
});
