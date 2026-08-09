import { test, expect, type Page } from '@playwright/test';

/**
 * נ"צ תחת הסמן בשדה מעוגן ללא מפה.
 *
 * הבדיקה מוליכה את המצביע ל**עוגן עצמו** - הנקודה היחידה שבה התשובה הנכונה
 * ידועה מראש, כי היא רשומה ב-DB. אם הקריאה שם נכונה, ההמרה נכונה; אם היא
 * שגויה, העמדה מציגה נ"צ מטעה - וזה גרוע יותר מלא להציג בכלל.
 */
const BADGE = '[data-testid="cursor-geo-readout-badge"]';
const A = {
  x1: 54, y1: 32, lat1: 31.84686111111111, lon1: 34.818472222222226,
  x2: 77, y2: 58, lat2: 31.828888888888887, lon2: 34.83883333333333,
};

/**
 * אחוזי-תמונה → פיקסלים על המסך. המיקום נמדד מהתיבה **בפועל** ולא מחושב
 * מ-BOUNDS: הדף RTL, ולכן המכולה יושבת בצד ימין של החלון, ו-`--s` והזום
 * מכפילים הכול. חישוב "מהנייר" הצביע 720 פיקסלים משמאל לתיבה.
 */
async function px(page: Page, xPct: number, yPct: number) {
  const r = await page.locator('[data-testid="cursor-geo-readout"]').boundingBox();
  if (!r) throw new Error('תיבת הקריאה לא נמצאה');
  return { x: r.x + (xPct / 100) * r.width, y: r.y + (yPct / 100) * r.height };
}

async function readAt(page: Page, xPct: number, yPct: number) {
  const p = await px(page, xPct, yPct);
  await page.mouse.move(p.x, p.y);
  await expect(page.locator(BADGE)).toBeVisible({ timeout: 5000 });
  const txt = await page.locator(BADGE).innerText();
  const m = txt.match(/(-?\d+\.\d{5}),\s*(-?\d+\.\d{5})/);
  const pct = txt.match(/x=(-?\d+\.\d)%\s+y=(-?\d+\.\d)%/);
  return {
    text: txt,
    lat: m ? parseFloat(m[1]) : NaN,
    lon: m ? parseFloat(m[2]) : NaN,
    xPct: pct ? parseFloat(pct[1]) : NaN,
    yPct: pct ? parseFloat(pct[2]) : NaN,
  };
}

for (const { s, zoom } of [{ s: 1, zoom: 1 }, { s: 1.65, zoom: 1 }, { s: 1, zoom: 2 }]) {
  test(`נ"צ תחת הסמן מדויק בעוגנים — s=${s} zoom=${zoom}`, async ({ page }) => {
    await page.goto(`/e2e/fixtures/cursor-geo.html?s=${s}&zoom=${zoom}`);

    // עוגן 1: 54%,32% → הנ"צ שרשום בשדה
    const a1 = await readAt(page, A.x1, A.y1);
    expect(a1.lat, 'קו רוחב בעוגן 1').toBeCloseTo(A.lat1, 3);
    expect(a1.lon, 'קו אורך בעוגן 1').toBeCloseTo(A.lon1, 3);
    expect(a1.xPct, 'אחוז אופקי בעוגן 1').toBeCloseTo(A.x1, 0);
    expect(a1.yPct, 'אחוז אנכי בעוגן 1').toBeCloseTo(A.y1, 0);

    // עוגן 2: 77%,58%
    const a2 = await readAt(page, A.x2, A.y2);
    expect(a2.lat, 'קו רוחב בעוגן 2').toBeCloseTo(A.lat2, 3);
    expect(a2.lon, 'קו אורך בעוגן 2').toBeCloseTo(A.lon2, 3);
  });
}

test('הקריאה נעלמת כשהמצביע יוצא מתחומי התמונה', async ({ page }) => {
  await page.goto('/e2e/fixtures/cursor-geo.html');
  await readAt(page, 50, 50);
  // מחוץ לתיבה - הפינה השמאלית-עליונה של החלון, הרחק מהמכולה
  await page.mouse.move(2, 2);
  await expect(page.locator(BADGE)).toHaveCount(0);
});

test('DMS ועשרוני מתארים את אותה נקודה', async ({ page }) => {
  await page.goto('/e2e/fixtures/cursor-geo.html');
  const r = await readAt(page, A.x1, A.y1);
  // 31.84686 → 31°50'48.7"N
  const dms = r.text.match(/(\d+)°(\d+)'([\d.]+)"N/);
  expect(dms, `יש DMS בקריאה: ${r.text}`).toBeTruthy();
  const dec = Number(dms![1]) + Number(dms![2]) / 60 + Number(dms![3]) / 3600;
  expect(dec, 'ה-DMS שווה לעשרוני').toBeCloseTo(r.lat, 3);
});
