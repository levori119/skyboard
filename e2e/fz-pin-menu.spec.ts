import { test, expect, Page } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// ─── כפתור ה-⋮ של פ"מ על מפת האזורים ──────────────────────────────────────────
// הדרישה: שלוש הנקודות יושבות **בצד** של תגית הסטטוס (בדרך/באזור/עוזב/כניסה) -
// צד ההתחלה, כלומר ימין בעברית - ולא מעל האו"ק ולא מתחת לתוכן בשורה נפרדת.
// כשאין תגית סטטוס (תצוגת אייקון) הכפתור נשאר מתחת לתוכן וממורכז.
// הבדיקה מודדת גיאומטריה על המסך.

const API = 'http://localhost:3001/api';
const TOL = 2; // פיקסלים - עיגול תת-פיקסלי של הדפדפן
const MENU = '[data-map-layer] [title="תפריט"]';

/**
 * נכנסים לעמדות מוד-אזורים עד שמופיע פ"מ על המפה. הקצאה ב-DB לא מספיקה:
 * הפ"מ נצבע על המפה רק אם הוא גם ברשימת הפ"מים של אותה עמדה.
 */
async function loginUntilPins(page: Page) {
  const presets = await (await page.request.get(`${API}/workstation-presets`)).json();
  const cands: any[] = [];
  for (const p of (presets as any[])) {
    if (!p.flight_zones_mode || !p.map_id || String(p.name || '').startsWith('__')) continue;
    const rows = await (await page.request.get(`${API}/strip-zone-assignments?map_id=${p.map_id}`)).json();
    if (Array.isArray(rows) && rows.length > 0) cands.push(p);
  }
  for (const p of cands) {
    await loginToWorkstation(page, { preset: p.name });
    if (await page.locator(MENU).count() > 0) return p.name as string;
  }
  return null;
}

/** מיקום ה-⋮ מול תגית הסטטוס ומול תוכן הפ"מ, כפי שהם על המסך */
async function menuVsStatus(page: Page) {
  return page.evaluate((sel) => {
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    };
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const menu = el as HTMLElement;
      const row = menu.parentElement;
      if (!row || !row.parentElement) continue;
      // שורת הסטטוס: השורה שמכילה את ה-⋮ ואת התגית (בתצוגת אייקון אין שורה כזו)
      const tag = Array.from(row.children).find(c => c !== menu) as HTMLElement | undefined;
      if (!tag) continue;
      const pin = row.parentElement;
      // תוכן הפ"מ = שאר הילדים שבזרימה של הפין (הצפים הם absolute)
      const flow = Array.from(pin.children).filter(
        c => c !== row && getComputedStyle(c as HTMLElement).position !== 'absolute'
      ) as HTMLElement[];
      const rects = flow.map(c => c.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
      return {
        dir: getComputedStyle(row).direction,
        menu: rect(menu),
        tag: rect(tag),
        tagText: (tag.textContent || '').trim(),
        content: rects.length ? {
          top: Math.min(...rects.map(r => r.top)),
          bottom: Math.max(...rects.map(r => r.bottom)),
        } : null,
      };
    }
    return null;
  }, MENU);
}

test('⋮ של פ"מ על המפה יושב בצד תגית הסטטוס', async ({ page }) => {
  test.setTimeout(180000); // עד 3 כניסות לעמדה עד שנמצא פ"מ על המפה
  const preset = await loginUntilPins(page);
  test.skip(!preset, 'אין פ"מ מוצג על מפה בסביבה הזו - אין מה למדוד');

  await expect(page.locator(MENU).first()).toBeVisible();
  const geo = await menuVsStatus(page);
  test.skip(!geo, 'אין פ"מ עם תגית סטטוס (תצוגת אייקון בלבד) - אין מה למדוד');

  // 1. בצד התגית ולא מתחתיה/מעליה - חופפים אנכית, ה-⋮ ממורכז לגובה התגית
  expect(geo!.menu.top).toBeLessThan(geo!.tag.bottom - TOL);
  expect(geo!.menu.bottom).toBeGreaterThan(geo!.tag.top + TOL);
  expect(Math.abs(geo!.menu.cy - geo!.tag.cy)).toBeLessThanOrEqual(
    Math.max(4, (geo!.tag.bottom - geo!.tag.top) / 2)
  );

  // 2. צד ההתחלה: ימין בעברית (RTL), שמאל באנגלית - ובלי חפיפה אופקית עם התגית
  if (geo!.dir === 'rtl') expect(geo!.menu.left).toBeGreaterThanOrEqual(geo!.tag.right - TOL);
  else                    expect(geo!.menu.right).toBeLessThanOrEqual(geo!.tag.left + TOL);

  // 3. לא מכסה את האו"ק/האייקון שמעל
  if (geo!.content) expect(geo!.menu.top).toBeGreaterThanOrEqual(geo!.content.bottom - TOL);
});
