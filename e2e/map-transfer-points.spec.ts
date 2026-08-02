import { test, expect, Page } from '@playwright/test';
import { identifyViaMirage, loginToWorkstation, setScreenSize } from './helpers';

// ─── נקודות העברה קבועות על המפה ──────────────────────────────────────────────
// הדרישה: בניהול עמדה עם מפה - לערוך את המפה ולהגדיר **באופן קבוע** נקודות העברה
// עליה, במקום שהבקר יגרור אותן למפה מחדש בכל משמרת.
//
// ⚠️ הבדיקה המרכזית היא **שהמיקום נשמר ל-DB דרך המסך** - לא רק שה-API מקבל POST.
// לכן היא נכנסת לניהול, פותחת את עורך המפה מתוך הגדרת העמדה, ולוחצת על המפה.
//
// ⚠️ הבדיקה רצה מול ה-DB האמיתי, שבו יושבות נקודות שהוגדרו בעבודה אמיתית. כתיבה
// לנקודה קיימת היא UPSERT - כלומר **דריסת מיקום אמיתי**, ומחיקה בעיוורון בסוף
// הבדיקה מוחקת עבודה אמיתית. לכן היא **מצלמת את השורות לפני ומחזירה אותן אחרי**
// (כמו emblem-admin.spec), ומוחקת רק את מה שהיא עצמה יצרה.

const API = 'http://localhost:3001/api';

type TPointRow = { id: number; sector_id: number; sub_label: string | null; x_pct: number; y_pct: number; lat: number | null; lon: number | null; display_mode: string; preset_id: number | null };

async function snapshotPoints(page: Page, mapId: number): Promise<Map<number, TPointRow>> {
  const res = await page.request.get(`${API}/map-transfer-points?map_id=${mapId}`);
  if (!res.ok()) return new Map();
  return new Map(((await res.json()) as TPointRow[]).map(p => [Number(p.id), p]));
}

/** עמדה עם מפה ועם נקודות העברה מוגדרות - עליה נריץ את הבדיקה */
async function findPresetWithMapAndSectors(page: Page) {
  const presets = await (await page.request.get(`${API}/workstation-presets`)).json();
  return (presets as any[]).find(p =>
    p.map_id && Array.isArray(p.relevant_sectors) && p.relevant_sectors.length > 0
    && !String(p.name || '').startsWith('__'));
}

let createdMapId: number | null = null;
let beforeRows: Map<number, TPointRow> = new Map();

// מחזיר את המצב שהיה: מוחק מה שנוצר בבדיקה, ומשחזר את המיקום המקורי של כל שורה
// שהבדיקה דרסה (UPSERT מחזיר את אותו id, ולכן הכתיבה־בחזרה מספיקה).
test.afterEach(async ({ request }) => {
  if (createdMapId == null) return;
  const res = await request.get(`${API}/map-transfer-points?map_id=${createdMapId}`);
  if (res.ok()) {
    for (const p of (await res.json()) as TPointRow[]) {
      if (!beforeRows.has(Number(p.id))) {
        await request.delete(`${API}/map-transfer-points/${p.id}`).catch(() => {});
      }
    }
  }
  for (const orig of beforeRows.values()) {
    await request.post(`${API}/map-transfer-points`, {
      data: {
        map_id: createdMapId, preset_id: orig.preset_id, sector_id: orig.sector_id,
        sub_label: orig.sub_label, x_pct: orig.x_pct, y_pct: orig.y_pct,
        lat: orig.lat, lon: orig.lon, display_mode: orig.display_mode,
      },
    }).catch(() => {});
  }
  createdMapId = null;
  beforeRows = new Map();
});

test('מיקום נקודת העברה נשמר מעורך המפה שבהגדרת העמדה', async ({ page }) => {
  const preset = await findPresetWithMapAndSectors(page);
  test.skip(!preset, 'אין עמדה עם מפה ועם נקודות העברה מוגדרות ב-DB');
  createdMapId = Number(preset.map_id);
  beforeRows = await snapshotPoints(page, createdMapId);

  // ניהול → עמדות → עריכת העמדה
  await setScreenSize(page);
  await page.goto('/');
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /ניהול מערכת/ }).click();
  await page.getByRole('button', { name: /הגדרת עמדות|עמדות/ }).first().click();
  const title = page.getByText(preset.name, { exact: true }).first();
  await expect(title).toBeVisible({ timeout: 15000 });
  // כרטיס העמדה = ה-div הקרוב ביותר שמכיל גם את הכותרת וגם את כפתור "עריכה"
  await title.locator('xpath=ancestor::div[.//button[normalize-space()="עריכה"]][1]')
    .getByRole('button', { name: 'עריכה' }).first().click();

  // הכפתור החדש בהגדרת העמדה פותח את עורך המפה
  const openEditor = page.getByRole('button', { name: /עריכת מפה ונקודות העברה/ });
  await expect(openEditor).toBeVisible({ timeout: 15000 });
  await openEditor.click();

  // מצב "נקודות העברה" בסרגל העורך
  await page.getByRole('button', { name: /🔀 נקודות העברה/ }).click();
  await expect(page.getByText(/בחר נקודה מהרשימה ולחץ על המפה/)).toBeVisible();

  // בחירת הנקודה הראשונה בקטלוג ואז לחיצה על המפה
  const firstPoint = page.locator('text=לא ממוקמת').first();
  await expect(firstPoint).toBeVisible({ timeout: 10000 });
  await firstPoint.click();

  const svg = page.locator('svg[viewBox="0 0 100 100"]').first();
  await expect(svg).toBeVisible();
  const box = (await svg.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.6);

  // אימות: הנקודה נשמרה ב-DB עם מיקום סביר, ומופיעה כממוקמת במסך
  await expect.poll(async () => {
    const rows = await (await page.request.get(`${API}/map-transfer-points?map_id=${createdMapId}`)).json();
    return (rows as any[]).filter(r => !beforeRows.has(Number(r.id))).length;
  }, { timeout: 10000 }).toBeGreaterThan(0);

  const rows = await (await page.request.get(`${API}/map-transfer-points?map_id=${createdMapId}`)).json();
  const saved = (rows as any[]).find(r => !beforeRows.has(Number(r.id)))!;
  expect(saved.x_pct).toBeGreaterThan(20);
  expect(saved.x_pct).toBeLessThan(60);
  expect(saved.y_pct).toBeGreaterThan(40);
  expect(saved.y_pct).toBeLessThan(80);
  expect(saved.preset_id).toBeNull();            // ברירת מחדל למפה
  expect(saved.display_mode).toBe('arrow');

  await expect(page.getByRole('button', { name: /^חץ$/ }).first()).toBeVisible();
  await page.screenshot({ path: 'e2e/__screenshots__/map-transfer-points-editor.png' });
});

// המפה נגררת ומזוימת. אם המרת הקליק למיקום לא מתחשבת בזום, הנקודה תישמר במקום
// הלא נכון ברגע שהאדמין מתקרב כדי למקם במדויק - בדיוק מה שמקרב עושים בשבילו.
test('מיקום מדויק גם בזום 200% על המפה', async ({ page }) => {
  const preset = await findPresetWithMapAndSectors(page);
  test.skip(!preset, 'אין עמדה עם מפה ועם נקודות העברה מוגדרות ב-DB');
  createdMapId = Number(preset.map_id);
  beforeRows = await snapshotPoints(page, createdMapId);

  await setScreenSize(page);
  await page.goto('/');
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /ניהול מערכת/ }).click();
  await page.getByRole('button', { name: /הגדרת עמדות|עמדות/ }).first().click();
  const title = page.getByText(preset.name, { exact: true }).first();
  await expect(title).toBeVisible({ timeout: 15000 });
  await title.locator('xpath=ancestor::div[.//button[normalize-space()="עריכה"]][1]')
    .getByRole('button', { name: 'עריכה' }).first().click();
  await page.getByRole('button', { name: /עריכת מפה ונקודות העברה/ }).click();
  await page.getByRole('button', { name: /🔀 נקודות העברה/ }).click();

  // זום פנימה פעמיים (x1.25 כל לחיצה) לפני המיקום
  const zoomIn = page.getByRole('button', { name: '+', exact: true }).first();
  await zoomIn.click();
  await zoomIn.click();

  await page.locator('text=לא ממוקמת').first().click();
  const svg = page.locator('svg[viewBox="0 0 100 100"]').first();
  const box = (await svg.boundingBox())!;
  // 25% מרוחב התמונה ו-75% מגובהה - נקודה א-סימטרית, כדי שהחלפת צירים תיתפס
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.75);

  await expect.poll(async () => {
    const rows = await (await page.request.get(`${API}/map-transfer-points?map_id=${createdMapId}`)).json();
    return (rows as any[]).filter(r => !beforeRows.has(Number(r.id))).length;
  }, { timeout: 10000 }).toBe(1);

  const rows = await (await page.request.get(`${API}/map-transfer-points?map_id=${createdMapId}`)).json();
  const saved = (rows as any[]).find(r => !beforeRows.has(Number(r.id)))!;
  // סטייה של עד 2% מקובלת (עיגול/גבולות התמונה); ללא תיקון-זום הסטייה גדולה בהרבה
  expect(Math.abs(saved.x_pct - 25)).toBeLessThan(2);
  expect(Math.abs(saved.y_pct - 75)).toBeLessThan(2);
});

// החצי השני של הדרישה: מה שהוגדר בניהול **מופיע על המפה בכניסה לעמדה**,
// בלי שהבקר יגרור דבר.
test('נקודה שהוגדרה בניהול נטענת אוטומטית למפת העמדה', async ({ page }) => {
  const presets = await (await page.request.get(`${API}/workstation-presets`)).json();
  // עמדת מפה רגילה (לא ground/classic) שנקודות ההעברה שלה מוצגות על המפה
  const preset = (presets as any[]).find(p =>
    p.map_id && p.preset_type === 'normal' && p.preset_role !== 'tower'
    && (p.relevant_sectors || []).length > 0 && !String(p.name || '').startsWith('__'));
  test.skip(!preset, 'אין עמדת מפה רגילה מתאימה ב-DB');
  createdMapId = Number(preset.map_id);
  beforeRows = await snapshotPoints(page, createdMapId);

  const sectors = await (await page.request.get(`${API}/sectors`)).json();
  const sectorId = Number(preset.relevant_sectors[0]);
  const sector = (sectors as any[]).find(s => Number(s.id) === sectorId)!;
  const label = sector.label_he || sector.name;

  // הגדרה קבועה (כמו שנשמרת מהעורך) — ואז כניסה לעמדה
  const res = await page.request.post(`${API}/map-transfer-points`, {
    data: { map_id: createdMapId, sector_id: sectorId, sub_label: null, x_pct: 45, y_pct: 55, display_mode: 'arrow' },
  });
  expect(res.ok()).toBeTruthy();

  await loginToWorkstation(page, { preset: preset.name });

  // החץ הירוק של אותה נקודה מוצב על המפה עצמה (לא רק בפאנל הצדדי) —
  // בלי שאיש גרר אותו במהלך הבדיקה
  const pin = page.locator(`#map-area .neighbor-pin-drop-zone[data-pin-sector="${sectorId}"]`).first();
  await expect(pin).toBeVisible({ timeout: 20000 });
  await expect(pin).toContainText(label);

  // הסרה במשמרת = זמנית; ⟲ מחזיר למיקום הקבוע שהוגדר בניהול
  await pin.getByRole('button', { name: '✕' }).click();
  await expect(page.locator(`#map-area .neighbor-pin-drop-zone[data-pin-sector="${sectorId}"]`)).toHaveCount(0);
  await page.getByRole('button', { name: '⟲' }).click();
  await expect(page.locator(`#map-area .neighbor-pin-drop-zone[data-pin-sector="${sectorId}"]`).first())
    .toBeVisible({ timeout: 10000 });
});

// דיווח מהשטח: "כל נקודות העברה חץ על מפה מופיע ON TOP מעל כל היישויות".
// החץ הוא סימון עזר - הוא חייב לשבת מעל סימוני האזורים בלבד, ומתחת לכל יישות
// (פ"מ וכו'), אחרת הוא מסתיר מידע תפעולי. הבדיקה ממקמת חץ **בדיוק מתחת לפ"מ**
// שנמצא על המפה ושואלת את הדפדפן מי למעלה (elementFromPoint).
test('חץ נקודת העברה יושב מתחת לפ"מ על המפה', async ({ page }) => {
  const presets = await (await page.request.get(`${API}/workstation-presets`)).json();
  const strips = await (await page.request.get(`${API}/strips/global`)).json();
  const onMap = (strips as any[]).filter(s => s.onMap && s.workstation_preset_id);
  const preset = (presets as any[]).find(p =>
    p.map_id && p.preset_type === 'normal' && (p.relevant_sectors || []).length > 0
    && onMap.some(s => Number(s.workstation_preset_id) === Number(p.id)));
  test.skip(!preset, 'אין עמדת מפה עם פ"מ מוצב על המפה ב-DB');
  createdMapId = Number(preset.map_id);
  beforeRows = await snapshotPoints(page, createdMapId);
  const sectorId = Number(preset.relevant_sectors[0]);

  // נקודה ראשונית (מיקום כלשהו) — רק כדי שהעמדה תיטען עם נקודה קבועה
  await page.request.post(`${API}/map-transfer-points`, {
    data: { map_id: createdMapId, sector_id: sectorId, sub_label: null, x_pct: 50, y_pct: 50, display_mode: 'arrow' },
  });
  await loginToWorkstation(page, { preset: preset.name });

  const strip = page.locator('#map-area .bt-strip[data-strip-id]').first();
  await expect(strip).toBeVisible({ timeout: 20000 });

  // ממירים את מרכז הפ"מ לאחוזי תמונה, וממקמים שם את הנקודה הקבועה
  const target = await page.evaluate(() => {
    const el = document.querySelector('#map-area .bt-strip[data-strip-id]') as HTMLElement;
    const img = document.querySelector('#map-area img') as HTMLImageElement;
    const s = el.getBoundingClientRect(), i = img.getBoundingClientRect();
    const cx = s.left + s.width / 2, cy = s.top + s.height / 2;
    return { cx, cy, xPct: ((cx - i.left) / i.width) * 100, yPct: ((cy - i.top) / i.height) * 100 };
  });
  await page.request.post(`${API}/map-transfer-points`, {
    data: { map_id: createdMapId, sector_id: sectorId, sub_label: null, x_pct: target.xPct, y_pct: target.yPct, display_mode: 'arrow' },
  });
  await page.getByRole('button', { name: '⟲' }).click();   // מושך מחדש ומחיל את המיקום החדש
  const movedPin = page.locator(`#map-area .neighbor-pin-drop-zone[data-pin-sector="${sectorId}"]`).first();
  await expect(movedPin).toBeVisible({ timeout: 15000 });
  // החץ אכן הגיע אל הפ"מ (אחרת מבחן החפיפה חסר משמעות)
  await expect.poll(async () => {
    const b = await movedPin.boundingBox();
    return b ? Math.abs(b.x + b.width / 2 - target.cx) : 999;
  }, { timeout: 10000 }).toBeLessThan(30);

  // מי למעלה בנקודת החפיפה? חייב להיות הפ"מ, לא החץ
  const who = await page.evaluate(() => {
    const el = document.querySelector('#map-area .bt-strip[data-strip-id]') as HTMLElement;
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      insideStrip: !!top?.closest('.bt-strip'),
      insidePin: !!top?.closest('.neighbor-pin-drop-zone'),
    };
  });
  expect(who.insidePin, 'החץ מסתיר את הפ"מ').toBe(false);
  expect(who.insideStrip, 'הפ"מ אינו העליון בנקודת החפיפה').toBe(true);

  // ומנגד: החץ עדיין מעל שכבת האזורים
  const zOk = await page.evaluate(() => {
    const pin = document.querySelector('#map-area .neighbor-pin-drop-zone') as HTMLElement;
    const zoneSvg = document.querySelector('#map-area svg[viewBox="0 0 100 100"]') as SVGElement;
    const z = (e: Element | null) => Number(getComputedStyle(e as Element).zIndex) || 0;
    return { pinZ: z(pin), zoneZ: zoneSvg ? z(zoneSvg) : 0 };
  });
  expect(zOk.pinZ).toBeGreaterThan(zOk.zoneZ);
});
