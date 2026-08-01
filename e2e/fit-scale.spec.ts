import { test, expect, Page } from '@playwright/test';

/**
 * FitScaleBox - הרכיב שמקטין/מגדיל את רצועת המסלולים בחלון העזרים.
 *
 * מה נבדק: שהתוכן **נכנס** לרוחב החלון בלי שאף מסלול יוסתר או ייחתך (הדרישה:
 * "לא להסתיר - רק להקטין"), ושבחלון המוגדל אותו תוכן **ממלא** את השטח.
 * נבדק גם תחת הזום הגלובלי של מסך 24" (`--s = 1.65`), כי שם דווקא מתגלות
 * טעויות המרת יחידות.
 */

const SCREENS = [
  { s: 1, label: '15.6" (--s=1)' },
  { s: 1.65, label: '24" (--s=1.65)' },
];

/** ממתין להתכנסות המדידה (ResizeObserver + rAF) */
async function settle(page: Page) {
  await page.waitForTimeout(400);
}

for (const { s, label } of SCREENS) {
  test(`רצועת המסלולים נכנסת לרוחב חלון העזרים בלי להסתיר מסלול - ${label}`, async ({ page }) => {
    await page.goto(`/e2e/fixtures/fit-scale.html?s=${s}`);
    await expect(page.locator('#panel [data-testid="strip"]')).toBeVisible();
    await settle(page);

    const panel = (await page.locator('#panel').boundingBox())!;
    const strip = (await page.locator('#panel [data-testid="strip"]').boundingBox())!;

    // התוכן הוקטן עד שנכנס לרוחב - ולא נחתך
    expect(strip.width).toBeLessThanOrEqual(panel.width + 1);
    // ...ומנצל את הרוחב (לא הוקטן יתר על המידה)
    expect(strip.width).toBeGreaterThan(panel.width * 0.8);

    // כל ארבעת המסלולים גלויים ובתוך גבולות החלון
    const rws = page.locator('#panel [data-testid="rw"]');
    await expect(rws).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      const b = (await rws.nth(i).boundingBox())!;
      expect(b.width, `מסלול ${i} ברוחב 0 (הוסתר)`).toBeGreaterThan(0);
      expect(b.x, `מסלול ${i} נחתך בקצה ההתחלה`).toBeGreaterThanOrEqual(panel.x - 1);
      expect(b.x + b.width, `מסלול ${i} נחתך בקצה הסיום`).toBeLessThanOrEqual(panel.x + panel.width + 1);
    }
  });

  test(`בחלון המוגדל התצוגה ממלאת את השטח וגדולה מזו שבחלון העזרים - ${label}`, async ({ page }) => {
    await page.goto(`/e2e/fixtures/fit-scale.html?s=${s}`);
    await expect(page.locator('#zoomwin [data-testid="strip"]')).toBeVisible();
    await settle(page);

    const win = (await page.locator('#zoomwin').boundingBox())!;
    const big = (await page.locator('#zoomwin [data-testid="strip"]').boundingBox())!;
    const small = (await page.locator('#panel [data-testid="strip"]').boundingBox())!;

    // ממלא את החלון לפחות בציר אחד, בלי לחרוג באף ציר
    expect(big.width).toBeLessThanOrEqual(win.width + 1);
    expect(big.height).toBeLessThanOrEqual(win.height + 1);
    expect(Math.max(big.width / win.width, big.height / win.height)).toBeGreaterThan(0.85);

    // הכל גדל - גם הדיאגרמה וגם הטקסט. הטקסט נמדד לפי הגובה שרונדר בפועל
    // (getComputedStyle מחזיר את ה-font-size המוצהר, בלי ה-zoom - ולכן חסר תועלת כאן).
    expect(big.width).toBeGreaterThan(small.width * 1.5);
    const textH = async (sel: string) => (await page.locator(sel).first().boundingBox())!.height;
    const bigText = await textH('#zoomwin [data-testid="rw"] div');
    const smallText = await textH('#panel [data-testid="rw"] div');
    expect(bigText).toBeGreaterThan(smallText * 1.5);
  });

  test(`גרירת החלון המוגדל זזה 1:1 עם המצביע - ${label}`, async ({ page }) => {
    await page.goto(`/e2e/fixtures/fit-scale.html?s=${s}`);
    const win = page.locator('#dragwin');
    const handle = page.locator('#draghandle');
    await expect(handle).toBeVisible();

    // ידית מותאמת מגע: שטח לחיצה של 34px (מוכפל ב---s) ו-touch-action:none,
    // שאחרת הדפדפן תופס את התנועה כגלילה ולא שולח pointermove כלל
    const hb = (await handle.boundingBox())!;
    expect(hb.width).toBeGreaterThanOrEqual(34 * s - 1);
    expect(hb.height).toBeGreaterThanOrEqual(34 * s - 1);
    expect(await handle.evaluate(el => getComputedStyle(el).touchAction)).toBe('none');

    const before = (await win.boundingBox())!;
    const DX = 120, DY = 90;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + DX / 2, hb.y + hb.height / 2 + DY / 2);
    await page.mouse.move(hb.x + hb.width / 2 + DX, hb.y + hb.height / 2 + DY);
    await page.mouse.up();

    const after = (await win.boundingBox())!;
    // 1:1 - בלי החלוקה ב---s החלון היה זז פי 1.65 מהמצביע ב-24"
    expect(Math.abs(after.x - before.x - DX)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.y - before.y - DY)).toBeLessThanOrEqual(2);
  });
}
