import { test, expect, Page } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// ─── גרירת מפה בלחיצה על שטח ריק ──────────────────────────────────────────────
// הדרישה: לחיצה על המפה - כשלא במוד ציור ולא על יישות לחיצה (פ"מ, נקודת העברה,
// וכל יישות עתידית) - גוררת את המפה עצמה. כל עוד העט/העכבר לא הורם המפה זזה
// איתו, והסמן הופך לסימבול "מטרה" (שונה מסמן היד של גרירת פ"מ).
//
// הבדיקה מודדת את מה שהבקר רואה: **תזוזה ויזואלית 1:1** של תמונת המפה מול תזוזת
// המצביע. היא רצה גם ב-24" (‎--s:1.65‎, עמדת היעד) - שם דווקא מתגלה הבאג הקלאסי
// שבו המפה "בורחת" מהעט פי הסקייל.

const API = 'http://localhost:3001/api';
const TOL = 2; // פיקסלים - עיגול תת-פיקסלי של הדפדפן

async function flightZonesPreset(page: Page) {
  const presets = await (await page.request.get(`${API}/workstation-presets`)).json();
  return (presets as any[]).find(p => p.flight_zones_mode && p.map_id && !String(p.name || '').startsWith('__'))
      ?? (presets as any[]).find(p => p.map_id && !String(p.name || '').startsWith('__'));
}

/**
 * החלק של לוח המפה שנמצא בתוך החלון. ב-24" (‎--s:1.65‎) הפריסה גדולה מהחלון,
 * ודגימה לפי אחוזי הלוח הייתה נופלת מחוצה לו - שם elementFromPoint מחזיר null.
 */
async function visibleArea(page: Page, box: { x: number; y: number; width: number; height: number }) {
  const vp = page.viewportSize()!;
  const left = Math.max(box.x, 0), top = Math.max(box.y, 0);
  const right = Math.min(box.x + box.width, vp.width), bottom = Math.min(box.y + box.height, vp.height);
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/**
 * נקודה על המפה שאין עליה שום יישות. הכלל במסך: שטח ריק = ה-target הוא שכבת
 * התוכן עצמה (או משטח הגרירה שמתחתיה), ולא צאצא כלשהו שלה.
 */
async function findEmptyMapPoint(page: Page, box: { x: number; y: number; width: number; height: number }) {
  for (let fy = 0.3; fy <= 0.7; fy += 0.1) {
    for (let fx = 0.3; fx <= 0.7; fx += 0.1) {
      const x = Math.round(box.x + box.width * fx), y = Math.round(box.y + box.height * fy);
      const isEmpty = await page.evaluate(([px, py]) => {
        const el = document.elementFromPoint(px as number, py as number) as HTMLElement | null;
        return !!el && (el.hasAttribute('data-map-pan-surface') || el.hasAttribute('data-map-layer'));
      }, [x, y]);
      if (isEmpty) return { x, y };
    }
  }
  return null;
}

/** נקודה שיש עליה יישות מתוך שכבת התוכן (פ"מ / נקודת העברה / סמן שכן) */
async function findEntityPoint(page: Page, box: { x: number; y: number; width: number; height: number }) {
  for (let fy = 0.1; fy <= 0.9; fy += 0.04) {
    for (let fx = 0.1; fx <= 0.9; fx += 0.04) {
      const x = Math.round(box.x + box.width * fx), y = Math.round(box.y + box.height * fy);
      const hit = await page.evaluate(([px, py]) => {
        const el = document.elementFromPoint(px as number, py as number) as HTMLElement | null;
        if (!el || el.hasAttribute('data-map-pan-surface') || el.hasAttribute('data-map-layer')) return null;
        // יישות = צאצא של שכבת התוכן (ולא סרגלי הכלים שמעליה)
        const layer = el.closest('[data-map-layer]');
        if (!layer) return null;
        return el.getAttribute('title') || el.textContent?.trim().slice(0, 20) || el.tagName;
      }, [x, y]);
      if (hit) return { x, y, what: hit };
    }
  }
  return null;
}

/** מיקום תמונת המפה על המסך - מה שהבקר באמת רואה */
async function mapImageBox(page: Page) {
  const box = await page.locator('[data-map-layer] img').first().boundingBox();
  expect(box, 'תמונת המפה לא נמצאה').toBeTruthy();
  return box!;
}

async function dragMap(page: Page, from: { x: number; y: number }, dx: number, dy: number,
                      opts: { assertCursor?: boolean } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (opts.assertCursor) {
    const cursor = await page.evaluate(() => ({
      panning: document.body.classList.contains('map-panning'),
      url: getComputedStyle(document.body).getPropertyValue('--map-pan-cursor').trim(),
    }));
    expect(cursor.panning, 'בזמן לחיצה הגוף מסומן כגורר מפה').toBe(true);
    expect(cursor.url, 'סמן המטרה מוזרק כמשתנה CSS').toContain('data:image/svg+xml');
  }
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
  const during = await mapImageBox(page);
  await page.mouse.up();
  return during;
}

// 15.6" רץ בחלון הרגיל; 24" רץ בחלון מוגדל באותו יחס (‎1280×720 × 1.65‎), אחרת
// הפריסה נדחסת ולוח המפה מצטמצם לרוחב של כמה עשרות פיקסלים - ולא נבדק כלום.
for (const { screenSize, viewport } of [
  { screenSize: '15.6"' as const, viewport: { width: 1280, height: 720 } },
  { screenSize: '24"' as const, viewport: { width: 2112, height: 1188 } },
]) {
  test.describe(`גרירת מפה - ${screenSize}`, () => {
  test.use({ viewport });
  test(`גרירת מפה בשטח ריק זזה 1:1 עם המצביע (${screenSize})`, async ({ page }) => {
    const preset = await flightZonesPreset(page);
    expect(preset, 'לא נמצאה עמדה עם מפה').toBeTruthy();
    await loginToWorkstation(page, { preset: preset.name, screenSize });

    const surface = page.locator('[data-map-pan-surface]').first();
    await expect(surface).toBeAttached({ timeout: 20000 });
    const panelBox = await visibleArea(page, (await surface.boundingBox())!);
    expect(panelBox, 'לוח המפה לא נפרס').toBeTruthy();

    const empty = await findEmptyMapPoint(page, panelBox);
    expect(empty, 'לא נמצאה נקודה ריקה על המפה').toBeTruthy();

    const before = await mapImageBox(page);
    await page.screenshot({ path: `e2e/__screenshots__/map-pan-${screenSize.replace(/\D/g, '')}-before.png` });

    const DX = 120, DY = -70;
    const during = await dragMap(page, empty!, DX, DY, { assertCursor: true });

    // ── הלב: תזוזה ויזואלית זהה לתזוזת המצביע, בכל סקייל מסך ──
    expect(Math.abs(during.x - before.x - DX), `תזוזה אופקית 1:1 (${during.x - before.x} מול ${DX})`).toBeLessThanOrEqual(TOL);
    expect(Math.abs(during.y - before.y - DY), `תזוזה אנכית 1:1 (${during.y - before.y} מול ${DY})`).toBeLessThanOrEqual(TOL);

    // אחרי הרמת העט: המפה נשארת במקום החדש (ה-state התעדכן), הסמן חוזר לעצמו
    await page.waitForTimeout(300);
    const after = await mapImageBox(page);
    expect(Math.abs(after.x - during.x), 'המפה לא קופצת חזרה בהרמת העט').toBeLessThanOrEqual(TOL);
    expect(Math.abs(after.y - during.y), 'המפה לא קופצת חזרה בהרמת העט').toBeLessThanOrEqual(TOL);
    expect(await page.evaluate(() => document.body.classList.contains('map-panning'))).toBe(false);
    expect(await page.locator('[data-map-layer]').first().evaluate(el => (el as HTMLElement).style.transition))
      .toContain('transform');

    await page.screenshot({ path: `e2e/__screenshots__/map-pan-${screenSize.replace(/\D/g, '')}-after.png` });
  });
  });
}

// הבדיקה מציבה פ"מ אמיתי על המפה (assignment ל-DB) ומנקה אחריה. בלי זה אין
// יישות על המפה בכל DB, והמקרה החשוב ביותר בדרישה לא היה נבדק בכלל.
let placedStripId: number | null = null;

test.afterEach(async ({ request }) => {
  if (placedStripId == null) return;
  await request.delete(`${API}/strip-zone-assignments/${placedStripId}`).catch(() => {});
  placedStripId = null;
});

test('לחיצה על פ"מ שעל המפה לא גוררת את המפה', async ({ page, request }) => {
  const preset = await flightZonesPreset(page);

  // פ"מ שאין לו הצבה - כדי שהניקוי בסוף יהיה מחיקה ולא דריסת עבודה אמיתית
  const assigned = new Set<number>(((await (await request.get(`${API}/strip-zone-assignments?map_id=${preset.map_id}`)).json()) as any[]).map(a => Number(a.strip_id)));
  const strips = (await (await request.get(`${API}/strips`)).json()) as any[];
  const free = strips.find(s => !assigned.has(Number(String(s.id).replace(/^s/, ''))) && s.status !== 'pending_transfer');
  expect(free, 'אין פ"מ פנוי להצבה על המפה').toBeTruthy();

  placedStripId = Number(String(free.id).replace(/^s/, ''));
  const post = await request.post(`${API}/strip-zone-assignments`, {
    data: { strip_id: placedStripId, zone_id: null, map_id: preset.map_id, pos_x: 50, pos_y: 50, status: 'planned' },
  });
  expect(post.ok(), 'הצבת הפ"מ על המפה נכשלה').toBeTruthy();

  await loginToWorkstation(page, { preset: preset.name });

  const surface = page.locator('[data-map-pan-surface]').first();
  await expect(surface).toBeAttached({ timeout: 20000 });
  const panelBox = await visibleArea(page, (await surface.boundingBox())!);

  const entity = await findEntityPoint(page, panelBox);
  expect(entity, 'הפ"מ שהוצב לא נמצא על המפה').toBeTruthy();
  test.info().annotations.push({ type: 'entity', description: `נבדק מול: ${entity!.what}` });

  const before = await mapImageBox(page);
  await page.mouse.move(entity!.x, entity!.y);
  await page.mouse.down();
  const panningOnEntity = await page.evaluate(() => document.body.classList.contains('map-panning'));
  await page.mouse.move(entity!.x + 90, entity!.y + 60, { steps: 6 });
  const during = await mapImageBox(page);
  await page.mouse.up();

  expect(panningOnEntity, 'לחיצה על יישות לא מפעילה גרירת מפה').toBe(false);
  expect(Math.abs(during.x - before.x), 'המפה לא זזה כשגוררים יישות').toBeLessThanOrEqual(TOL);
  expect(Math.abs(during.y - before.y), 'המפה לא זזה כשגוררים יישות').toBeLessThanOrEqual(TOL);
});

test('שכבת הגרירה יושבת מתחת ליישויות ומעל תמונת המפה', async ({ page }) => {
  const preset = await flightZonesPreset(page);
  await loginToWorkstation(page, { preset: preset.name });
  const surface = page.locator('[data-map-pan-surface]').first();
  await expect(surface).toBeAttached({ timeout: 20000 });

  const layering = await surface.evaluate(el => {
    const panel = el.parentElement!;
    const content = panel.querySelector('[data-map-layer]')!;
    const canvas = panel.querySelector('canvas')!;
    return {
      surfaceBeforeContent: !!(el.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING),
      mapImgIgnoresPointer: getComputedStyle(panel.querySelector('[data-map-layer] img')!).pointerEvents,
      canvasZ: getComputedStyle(canvas).zIndex,
      canvasPointer: getComputedStyle(canvas).pointerEvents, // מחוץ למוד ציור - none
    };
  });

  expect(layering.surfaceBeforeContent, 'שכבת הגרירה לפני שכבת התוכן - כלומר היישויות מעליה').toBe(true);
  expect(layering.mapImgIgnoresPointer, 'תמונת המפה שקופה ללחיצות - הן נופלות לשכבת הגרירה').toBe('none');
  expect(Number(layering.canvasZ), 'קנבס הציור מעל שכבת הגרירה - במוד ציור העט מצייר').toBeGreaterThan(0);
  expect(layering.canvasPointer, 'מחוץ למוד ציור הקנבס לא חוסם את הגרירה').toBe('none');
});
