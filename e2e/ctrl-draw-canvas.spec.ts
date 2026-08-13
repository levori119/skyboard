import { test, expect, type Page } from '@playwright/test';
import { loginToWorkstation } from './helpers';

/**
 * קנבס הציור של **עמדת הבקר** (SectorDashboard) - עמדה שמריצה מנוע ציור משלה,
 * ולכן בדיקות המתקן של הרכיב המשותף (map-draw.spec.ts) לא שומרות עליה.
 *
 * מהשטח: "ציור על מפה נהיה קו עבה פתאום". ה-bitmap נבנה בגודל ה**פריסה** של
 * אזור המפה, בעוד שהמפה מוצגת תחת `#root { zoom: var(--s) }` - הדפדפן מתח את
 * ה-bitmap פי --s, וקו העט נראה עבה ומטושטש פי 1.65 בעמדת 24". במסך 15.6"
 * (--s=1) לא היה הבדל, ולכן זה לא נתפס.
 *
 * הסקייל נקבע כאן בזמן ריצה ולא דרך מסך הכניסה: זו בדיוק הזרימה של בורר גודל
 * המסך בעמדה, והיא חוסכת כניסה שנייה למערכת.
 */

const DRAW_CANVAS = 'canvas[data-map-layer]';

/** גודל ה-bitmap מול הגודל על המסך, כפי שהם בפועל בעמדה החיה. */
async function canvasGeometry(page: Page) {
  return page.evaluate((sel) => {
    const c = document.querySelector(sel) as HTMLCanvasElement | null;
    if (!c) return null;
    const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;
    return { s, bitmap: { w: c.width, h: c.height }, layout: { w: c.clientWidth, h: c.clientHeight } };
  }, DRAW_CANVAS);
}

test('קנבס הציור בעמדת הבקר הוא בפיקסלי מסך - גם ב-15.6" וגם ב-24"', async ({ page }) => {
  await loginToWorkstation(page);
  await expect(page.locator(DRAW_CANVAS).first()).toBeAttached();
  await page.waitForTimeout(1500); // ResizeObserver + סוף פריסת המפה

  const view = page.viewportSize()!;
  for (const s of [1, 1.65]) {
    // המסך הפיזי גדל יחד עם הסקייל - כך פיקסלי ה**פריסה** נשארים זהים בשני
    // המעברים, בדיוק כמו עמדת 24" אמיתית שמציגה את אותה פריסה בגודל גדול יותר.
    await page.setViewportSize({ width: Math.round(view.width * s), height: Math.round(view.height * s) });
    await page.evaluate(v => document.documentElement.style.setProperty('--s', String(v)), s);
    await page.waitForTimeout(700); // הזום משנה את פיקסלי הפריסה → ResizeObserver

    const g = await canvasGeometry(page);
    expect(g, 'קנבס הציור לא נמצא על המפה').not.toBeNull();
    expect(g!.s, 'סקייל המסך לא הוחל').toBeCloseTo(s, 2);
    expect(g!.layout.w, 'אזור המפה לא נפרס').toBeGreaterThan(100);

    // פיקסל קנבס = פיקסל מסך: ה-bitmap גדול פי --s מגודל הפריסה
    expect(Math.abs(g!.bitmap.w - g!.layout.w * g!.s), `רוחב ה-bitmap (--s=${s})`).toBeLessThanOrEqual(1);
    expect(Math.abs(g!.bitmap.h - g!.layout.h * g!.s), `גובה ה-bitmap (--s=${s})`).toBeLessThanOrEqual(1);

    // ויחס הגובה-רוחב של ה-bitmap זהה לזה של התצוגה - אחרת קו אופקי ואנכי
    // יוצאים בעובי שונה (זה מה שקורה כשמודדים את #map-area במקום את הקנבס)
    expect(g!.bitmap.w / g!.bitmap.h, `יחס ה-bitmap (--s=${s})`).toBeCloseTo(g!.layout.w / g!.layout.h, 2);
  }
});
