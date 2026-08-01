import { test, expect, Page } from '@playwright/test';
import { identifyViaMirage, loginToWorkstation } from './helpers';

// ─── סימן היצרן (LEO²) בכל המסכים ─────────────────────────────────────────────
// הדרישה: הלוגו של החברה מוצג בכל מסך, "לא גדול ולא קטן ושלא יתפוס מקום".
// לכן הבדיקה מאמתת שלושה דברים בכל מסך:
//   1. הסימן קיים וגלוי.
//   2. הגובה בטווח קריא-אך-דיסקרטי (לא ננעל על מספר בודד — כדי שכיוונון עדין
//      של הגובה לא ישבור בדיקה, אבל שינוי מהותי כן).
//   3. הוא לא גוזל רוחב מהסרגל התפעולי — פחות מ-5% מרוחב החלון.
//
// הבדיקה רצה ב-15.6" (‎--s = 1‎) ולכן ה-boundingBox הוא ב-px לוגיים ישירות.

const MAX_WIDTH_RATIO = 0.05;

const leo = (page: Page) => page.getByRole('img', { name: /LEO/ });

async function expectDiscreetLogo(page: Page, { min, max }: { min: number; max: number }) {
  const logo = leo(page);
  await expect(logo).toHaveCount(1);
  await expect(logo).toBeVisible();

  const box = await logo.boundingBox();
  expect(box, 'לסימן היצרן יש מיקום על המסך').toBeTruthy();
  expect(box!.height, 'הסימן לא ננמך מכדי לזהות').toBeGreaterThanOrEqual(min);
  expect(box!.height, 'הסימן לא גדול מדי').toBeLessThanOrEqual(max);

  const viewport = page.viewportSize()!;
  expect(box!.width, 'הסימן לא גוזל רוחב מהמסך')
    .toBeLessThan(viewport.width * MAX_WIDTH_RATIO);
}

test('מסך התחברות: סימן היצרן בפוטר, מעל מספר הגרסה', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '15.6"' }).click();

  await expectDiscreetLogo(page, { min: 18, max: 34 });

  // הפוטר ולא הכרטיס — הלוגו לא דוחף את שדות ההזדהות מטה
  const logoBox = (await leo(page).boundingBox())!;
  const identify = (await page.getByRole('button', { name: /הזדהות|Identify/ }).boundingBox())!;
  expect(logoBox.y, 'הסימן מתחת לכרטיס ההתחברות').toBeGreaterThan(identify.y + identify.height);
});

test('עמדת בקר: סימן היצרן בקצה הסרגל העליון', async ({ page }) => {
  await loginToWorkstation(page);

  await expectDiscreetLogo(page, { min: 14, max: 24 });

  // בתוך ה-header, אחרי השעון — קצה הסרגל ולא בתוך אזור המידע התפעולי
  const header = page.locator('header.bt-topbar').first();
  await expect(header.getByRole('img', { name: /LEO/ })).toBeVisible();

  const headerBox = (await header.boundingBox())!;
  const logoBox = (await leo(page).boundingBox())!;
  expect(logoBox.y, 'הסימן לא גלש מתחת לסרגל (הסרגל לא נשבר לשורה נוספת)')
    .toBeLessThan(headerBox.y + headerBox.height);
});

// ─── ניגודיות בשלוש התמות ─────────────────────────────────────────────────────
// המלכודת שנתפסה כאן: 'ocean' היא תמה **כהה** בסרגל (T.surface = #05404e), למרות
// שההכללה של /ui-adapt אומרת "אור/כחול = רקע בהיר". גרסת הנייבי של הסימן על הרקע
// הזה נותנת ~1.3:1 — בלתי נראית. הבדיקה מודדת ולא מניחה.

/** יחס ניגודיות WCAG בין שני צבעים (‎#rrggbb‎ או ‎rgb(...)‎). */
function contrastRatio(a: string, b: string) {
  const lum = (c: string) => {
    const m = c.startsWith('#')
      ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
      : c.match(/\d+/g)!.slice(0, 3).map(Number);
    const [r, g, bl] = m.map(v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

for (const mode of ['dark', 'light', 'ocean'] as const) {
  test(`עמדת בקר: סימן היצרן קריא בתמה ${mode}`, async ({ page }) => {
    await page.addInitScript(m => localStorage.setItem('bt-themeMode', m), mode);
    await loginToWorkstation(page);

    const { headerBg, markFill } = await page.evaluate(() => {
      const header = document.querySelector('header.bt-topbar') as HTMLElement;
      const svg = header.querySelector('svg[aria-label="LEO²"]')!;
      // ה-path הראשון הוא ה-L — צבע הכיתוב הראשי של הסימן
      return {
        headerBg: getComputedStyle(header).backgroundColor,
        markFill: svg.querySelector('path')!.getAttribute('fill')!,
      };
    });

    // 3:1 — הסף של WCAG 2.1 (1.4.11) לאובייקטים גרפיים
    expect(contrastRatio(headerBg, markFill), `ניגודיות ${markFill} על ${headerBg}`)
      .toBeGreaterThanOrEqual(3);
  });
}

test('מסך ניהול: סימן היצרן בכותרת', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '15.6"' }).click();
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /ניהול מערכת/ }).click();

  await expect(page.getByRole('heading', { name: 'ניהול מערכת' })).toBeVisible();
  await expectDiscreetLogo(page, { min: 15, max: 26 });

  await expect(page.locator('header').first().getByRole('img', { name: /LEO/ })).toBeVisible();
});
