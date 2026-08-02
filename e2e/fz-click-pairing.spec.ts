import { test, expect, Page } from '@playwright/test';
import { loginToWorkstation } from './helpers';
import { FZ_PAIR_CURSOR_IDLE, FZ_PAIR_CURSOR_ARMED } from '../src/utils/pairCursor';

// ─── שידוך פ"מ בלחיצה (במקום גרירה) ───────────────────────────────────────────
// הדרישה: מתג "שידוך בלחיצה" בהגדרות עמדה. כשהוא דלוק - לוחצים על פ"מ ואז על
// אזור, וזה שקול לגרירת הפ"מ לשם; לחיצה על חלון הפ"ממים מנתקת אותו מהאזורים.
// הבדיקה עוברת את המסלול המלא מול ה-API האמיתי: שיוך נוצר ב-DB, ואז נמחק.

const API = 'http://localhost:3001/api';

/** ה-API מחזיר את הפוליגון כמחרוזת JSON (כמו שהוא נשמר) */
const parsePolygon = (raw: any): { x: number; y: number }[] => {
  try { const v = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(v) ? v : []; }
  catch { return []; }
};

/** עמדת אזורי-טיסה עם מפה ואזורים משורטטים */
async function findFzPreset(page: Page) {
  const presets = await (await page.request.get(`${API}/workstation-presets`)).json();
  for (const p of presets as any[]) {
    if (!p.flight_zones_mode || !p.map_id || String(p.name || '').startsWith('__')) continue;
    const zones = await (await page.request.get(`${API}/map-zones?map_id=${p.map_id}`)).json();
    const drawn = (zones as any[])
      .map(z => ({ ...z, polygon: parsePolygon(z.polygon) }))
      .filter(z => z.polygon.length >= 3 && z.enabled !== false);
    if (drawn.length) return { preset: p, zones: drawn };
  }
  return null;
}

/** מדליק את מתג "שידוך בלחיצה" בתפריט הגדרות העמדה */
async function enablePairMode(page: Page) {
  const menuBtn = page.getByRole('button', { name: /הגדרות עמדה/ });
  await menuBtn.click();
  const label = page.locator('span').filter({ hasText: 'שידוך בלחיצה' }).first();
  await expect(label).toBeVisible();
  const toggle = label.locator('xpath=following-sibling::button').first();
  // המתג מותמד ב-localStorage — אם הוא כבר דלוק מהרצה קודמת, לא מכבים אותו
  if ((await toggle.textContent())?.includes('הפעל')) await toggle.click();
  await expect(toggle).toHaveText(/כבה/);
  // התפריט נסגר בלחיצה על שכבת-הרקע שלו (fixed inset:0), לא על כפתור התפריט
  await page.mouse.click(2, 2);
  await expect(label).toBeHidden();
}

/**
 * נקודת מסך (client) של קואורדינטה באחוזי תמונת המפה.
 * ה-<img> יושב בתוך שכבת המפה המוזזת/מוזחלת, ולכן ה-rect שלו כבר כולל זום ופאן;
 * נשאר רק לחשב את שטח הציור בפועל (objectFit: contain) בתוך תיבת האלמנט.
 */
async function mapPctToClient(page: Page, px: number, py: number) {
  return page.evaluate(([x, y]) => {
    const img = document.querySelector('[data-map-layer] img') as HTMLImageElement | null;
    if (!img || !img.naturalWidth) return null;
    const b = img.getBoundingClientRect();
    const scale = Math.min(b.width / img.naturalWidth, b.height / img.naturalHeight);
    const pw = img.naturalWidth * scale, ph = img.naturalHeight * scale;
    return {
      x: b.left + (b.width - pw) / 2 + (x / 100) * pw,
      y: b.top + (b.height - ph) / 2 + (y / 100) * ph,
    };
  }, [px, py]);
}

const centroid = (poly: { x: number; y: number }[]) => ({
  x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
  y: poly.reduce((s, p) => s + p.y, 0) / poly.length,
});

async function assignmentOf(page: Page, mapId: number, stripId: number) {
  const rows = await (await page.request.get(`${API}/strip-zone-assignments?map_id=${mapId}`)).json();
  return (rows as any[]).find(a => Number(a.strip_id) === stripId) || null;
}

test('לחיצה על פ"מ ואז על נקודת העברה פותחת את טופס ההעברה לאותו סקטור', async ({ page }) => {
  test.setTimeout(180000);
  const found = await findFzPreset(page);
  test.skip(!found, 'אין עמדת אזורי-טיסה עם אזורים משורטטים בסביבה הזו');

  await loginToWorkstation(page, { preset: found!.preset.name });
  await enablePairMode(page);

  const pickable = page.locator('#sidebar-area [data-fz-pick]');
  await expect(pickable.first()).toBeAttached({ timeout: 15000 });

  const dropZone = page.locator('.neighbor-drop-zone[data-sector-id]').first();
  test.skip((await dropZone.count()) === 0, 'אין נקודות העברה מוצגות בעמדה הזו');

  // פ"מ בלי שיוך קיים — כך שהמסלול לא כותב "עוזב אזור" ל-DB, והבדיקה חסרת תופעות לוואי
  const stripId = await pickable.evaluateAll(els =>
    (els as HTMLElement[]).map(el => Number(el.getAttribute('data-fz-pick'))).find(Boolean) ?? null
  );
  expect(stripId, 'לא נמצא פ"מ בסרגל').toBeTruthy();
  const existing = await assignmentOf(page, found!.preset.map_id, stripId!);
  test.skip(!!existing, 'הפ"מ הראשון כבר משויך — הבדיקה דורשת פ"מ נקי');

  await page.locator(`#sidebar-area [data-fz-pick="${stripId}"]`).first().click();
  await expect(page.locator('[data-fz-sel="1"]')).toHaveCount(1);

  await dropZone.click();

  // טופס ההעברה נפתח — לפניו לא מתבצעת שום כתיבה, ולכן מבטלים ולא נשאר כלום
  await expect(page.getByText('העברה לנקודת העברה')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('[data-fz-sel="1"]')).toHaveCount(0); // הבחירה התאפסה
  await page.getByRole('button', { name: /^ביטול$/ }).first().click();
  expect(await assignmentOf(page, found!.preset.map_id, stripId!)).toBeNull();
});

test('לחיצה על פ"מ ואז על אזור משייכת אותו; לחיצה על חלון הפ"ממים מנתקת', async ({ page }) => {
  test.setTimeout(180000);
  const found = await findFzPreset(page);
  test.skip(!found, 'אין עמדת אזורי-טיסה עם אזורים משורטטים בסביבה הזו');
  const { preset, zones } = found!;

  await loginToWorkstation(page, { preset: preset.name });
  await enablePairMode(page);

  // הפ"ממים בסרגל מקבלים data-fz-pick רק כשהמתג דלוק — זה גם האימות שהוא נדלק
  const pickable = page.locator('#sidebar-area [data-fz-pick]');
  await expect(pickable.first()).toBeAttached({ timeout: 15000 });

  // בוחרים פ"מ שעדיין לא משויך לאזור, כדי שהשיוך שנבדוק יהיה זה שיצרנו
  const stripId = await pickable.evaluateAll((els) =>
    (els as HTMLElement[]).map(el => Number(el.getAttribute('data-fz-pick'))).find(Boolean) ?? null
  );
  expect(stripId, 'לא נמצא פ"מ בסרגל').toBeTruthy();
  const before = await assignmentOf(page, preset.map_id, stripId!);

  const row = page.locator(`#sidebar-area [data-fz-pick="${stripId}"]`).first();

  // סמן המפה מסמן את המצב עוד לפני שנבחר פ"מ: ריבוע חלול = "מצב שידוך דלוק"
  const mapCursor = () => page.locator('[data-map-panel]').first()
    .evaluate(el => getComputedStyle(el).cursor);
  expect(await mapCursor()).toBe(FZ_PAIR_CURSOR_IDLE);

  try {
    // ── 1. לחיצה על הפ"מ = בחירה לשידוך ──────────────────────────────────────
    await row.click();
    await expect(row).toHaveAttribute('data-fz-sel', '1');
    await expect(page.getByText(/לחץ על אזור \/ נקודת העברה/)).toBeVisible();
    // ומהרגע שנבחר פ"מ - ריבוע ציאן עם כוונת: "הלחיצה הבאה משייכת כאן"
    expect(await mapCursor()).toBe(FZ_PAIR_CURSOR_ARMED);

    // ── 2. לחיצה בתוך אזור = שיוך, כאילו נגררתי לשם ──────────────────────────
    const zone = zones.find(z => !before || z.id !== before.zone_id) || zones[0];
    const c = centroid(zone.polygon);
    const pt = await mapPctToClient(page, c.x, c.y);
    expect(pt, 'לא נמצאה תמונת מפה למדידה').toBeTruthy();
    await page.mouse.click(pt!.x, pt!.y);

    await expect
      .poll(async () => (await assignmentOf(page, preset.map_id, stripId!))?.zone_id ?? null,
            { timeout: 15000, message: 'השיוך לא נוצר בשרת' })
      .toBe(zone.id);
    // הבחירה מתאפסת אחרי הפעולה
    await expect(page.locator('[data-fz-sel="1"]')).toHaveCount(0);

    // ── 3. לחיצה על הפ"מ ואז על חלון הפ"ממים = ניתוק מכל האזורים ─────────────
    const rowAfter = page.locator(`#sidebar-area [data-fz-pick="${stripId}"]`).first();
    await rowAfter.click();
    await expect(rowAfter).toHaveAttribute('data-fz-sel', '1');
    // לחיצה על כותרת הסרגל (חלון הפ"ממים) — לא על פ"מ ולא על פקד
    await page.locator('#sidebar-area h4').first().click();

    await expect
      .poll(async () => await assignmentOf(page, preset.map_id, stripId!),
            { timeout: 15000, message: 'הפ"מ לא נותק מהאזורים' })
      .toBeNull();
  } finally {
    // ניקוי: לא משאירים שיוך שנוצר בבדיקה, וגם לא משנים מצב קודם
    await page.request.delete(`${API}/strip-zone-assignments/${stripId}`).catch(() => {});
    if (before) {
      await page.request.post(`${API}/strip-zone-assignments`, {
        data: {
          strip_id: stripId, zone_id: before.zone_id, altitude_range_id: before.altitude_range_id,
          status: before.status, note: before.note, coordination_note: before.coordination_note,
          is_coordinated: before.is_coordinated, pos_x: before.pos_x, pos_y: before.pos_y,
          requested_zone_ids: [], map_id: preset.map_id,
        },
      }).catch(() => {});
    }
  }
});
