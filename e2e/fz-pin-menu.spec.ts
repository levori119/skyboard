import { test, expect, Page } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// ─── כפתור ה-⋮ של פ"מ על מפת האזורים ──────────────────────────────────────────
// הדרישה: שלוש הנקודות יוצגו **מתחת** לתוכן הפ"מ (כתב היד / הכרטיס / האייקון),
// ולא בפינה שמעליו - שם העיגול כיסה את האו"ק בדיוק במקום שהבקר קורא.
// הבדיקה מודדת גיאומטריה על המסך: אין חפיפה עם התוכן, והנקודות מתחתיו וממורכזות.

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

/** מיקום ה-⋮ מול תוכן הפ"מ, כפי שהם על המסך */
async function menuVsContent(page: Page) {
  return page.evaluate((sel) => {
    const menu = document.querySelector(sel) as HTMLElement | null;
    if (!menu || !menu.parentElement) return null;
    // תוכן הפ"מ = הילדים שבזרימה (הכפתורים והתגיות הצפים הם absolute)
    const flow = Array.from(menu.parentElement.children).filter(
      el => el !== menu && getComputedStyle(el as HTMLElement).position !== 'absolute'
    ) as HTMLElement[];
    const rects = flow.map(el => el.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
    if (!rects.length) return null;
    const m = menu.getBoundingClientRect();
    return {
      menu: { top: m.top, bottom: m.bottom, cx: m.left + m.width / 2 },
      content: {
        top: Math.min(...rects.map(r => r.top)),
        bottom: Math.max(...rects.map(r => r.bottom)),
        cx: (Math.min(...rects.map(r => r.left)) + Math.max(...rects.map(r => r.right))) / 2,
      },
    };
  }, MENU);
}

test('⋮ של פ"מ על המפה יושב מתחת לטקסט/אייקון ולא מכסה אותו', async ({ page }) => {
  test.setTimeout(180000); // עד 3 כניסות לעמדה עד שנמצא פ"מ על המפה
  const preset = await loginUntilPins(page);
  test.skip(!preset, 'אין פ"מ מוצג על מפה בסביבה הזו - אין מה למדוד');

  await expect(page.locator(MENU).first()).toBeVisible();
  const geo = await menuVsContent(page);
  expect(geo, 'לא נמצא פ"מ עם תוכן ותפריט').toBeTruthy();

  // מתחת לתוכן - לא חופף אליו
  expect(geo!.menu.top).toBeGreaterThanOrEqual(geo!.content.bottom - TOL);
  // וממורכז מתחתיו (ולא נדבק לפינה)
  expect(Math.abs(geo!.menu.cx - geo!.content.cx)).toBeLessThanOrEqual(
    Math.max(6, (geo!.content.bottom - geo!.content.top) / 2)
  );
});
