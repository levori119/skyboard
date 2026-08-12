import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders, loginToWorkstation } from './helpers';

// ─── עמדת שדה: שכבת מסלולי המראה ושכבת הקפות ─────────────────────────────────
// הדרישה מהשטח: "בעמדת שדה תעופה להוסיף יכולת להציג הקפה ומסלולים (בלי מסלולי
// הסעה). כשמציג מסלולים להציג את זה לא כקו אלא כמסלול."
//
// שתי שכבות **נפרדות** ממסלולי ההסעה - הפקח רוצה לראות את המסלולים בלי רשת
// ההסעה - והמסלול מצויר כמיסעה עם ספי מסלול, קו מרכז ומספר כיוון.

const API = 'http://localhost:3001/api';

// עמדת שדה טוענת מפה, אלמנטים, מסלולים ו-NOTAMים - הכניסה איטית מברירת המחדל.
let api: APIRequestContext;

test.describe.configure({ timeout: 240000 });

const STAMP = `__e2e_rwlayer_${Date.now()}`;
const created: { runways: number[]; patterns: number[] } = { runways: [], patterns: [] };
let airfieldId = 0;

async function findGroundPreset() {
  const presets = await (await api.get(`${API}/workstation-presets`)).json();
  return (presets as { preset_type: string; name: string; airfield_id: number | null }[]).find(p =>
    p.preset_type === 'ground' && p.airfield_id && !String(p.name || '').startsWith('__'));
}

/** מסלול והקפה זמניים לשדה של העמדה, כדי שיהיה מה לצייר בלי להישען על ה-DB. */
async function seed(afId: number) {
  airfieldId = afId;
  const rw = await (await api.post(`${API}/airfield-runways`, {
    data: { airfield_id: afId, name: `${STAMP}`, heading_a: '21', heading_b: '03',
            start_x_pct: 20, start_y_pct: 75, end_x_pct: 78, end_y_pct: 28 },
  })).json();
  created.runways.push(rw.id);
  const geom = { anchor: { x: 20, y: 75 }, bearing: 40, side: 'left', rwyLen: 30, upwind: 10, width: 16, baseExt: 10 };
  const pat = await (await api.post(`${API}/airfield-patterns`, {
    data: { airfield_id: afId, runway_id: rw.id, runway_ident: '21', geometry: geom, points: [] },
  })).json();
  created.patterns.push(pat.id);
}


test.beforeAll(async () => {
  api = await playwrightRequest.newContext({ extraHTTPHeaders: await apiAuthHeaders() });
});

test.afterAll(async () => {
  for (const id of created.patterns) await api.delete(`${API}/airfield-patterns/${id}`);
  for (const id of created.runways) await api.delete(`${API}/airfield-runways/${id}`);
});

test('מסלולי ההמראה מוצגים כמיסעה עם סימונים, לא כקו', async ({ page }) => {
  const preset = await findGroundPreset();
  test.skip(!preset, 'אין עמדת שדה המשויכת לשדה תעופה ב-DB');
  await seed(preset!.airfield_id as number);

  await loginToWorkstation(page, { preset: preset!.name });
  await expect(page.locator('#ground-map-area')).toBeVisible({ timeout: 30000 });

  // השכבה דולקת כברירת מחדל - המסלולים הם המידע הבסיסי של השדה
  const shape = page.getByTestId('runway-shape').first();
  await expect(shape).toBeVisible({ timeout: 30000 });

  // מיסעה = פוליגון בעל שטח, לא קו: יש polygon לאספלט ועוד פוליגונים לספי המסלול
  const polys = shape.locator('polygon');
  expect(await polys.count(), 'מיסעה + ספי מסלול').toBeGreaterThan(4);
  // קו מרכז מקווקו
  expect(await shape.locator('line').count()).toBeGreaterThan(1);
});

test('שכבת המסלולים נפרדת ממסלולי ההסעה וניתנת לכיבוי', async ({ page }) => {
  const preset = await findGroundPreset();
  test.skip(!preset, 'אין עמדת שדה המשויכת לשדה תעופה ב-DB');
  await seed(preset!.airfield_id as number);

  await loginToWorkstation(page, { preset: preset!.name });
  await expect(page.getByTestId('runway-shape').first()).toBeVisible({ timeout: 30000 });

  const runwaysBox = page.locator('label', { hasText: 'מסלולי המראה' }).locator('input[type=checkbox]');
  const taxiBox = page.locator('label', { hasText: 'מסלולי מטוסים' }).locator('input[type=checkbox]');
  await expect(runwaysBox).toBeChecked();
  // מסלולי ההסעה כבויים כברירת מחדל - המסלולים אינם תלויים בהם
  await expect(taxiBox).not.toBeChecked();

  // dispatchEvent ולא click: פאנלים צפים אחרים בעמדה (למשל "מחתים בקרוב") יושבים
  // מעל פאנל השכבות וחוטפים את הקליק. הבדיקה כאן היא על **התנהגות השכבה**, לא על
  // סדר הערימה, ולכן היא מפעילה את המטפל ישירות.
  await runwaysBox.dispatchEvent('click');
  await expect(runwaysBox).not.toBeChecked();
  await expect(page.getByTestId('runway-shape')).toHaveCount(0);
  await runwaysBox.dispatchEvent('click');
  await expect(runwaysBox).toBeChecked();
  await expect(page.getByTestId('runway-shape').first()).toBeVisible();
});

/**
 * קצה מסלול אמיתי של השדה שיש לו הקפה. עובדים על נתוני השדה ולא על מסלול שנזרע:
 * הפאנל "מסלולים בשימוש" נבנה מהמסלולים של השדה, וקצה שנזרע לרגע אינו מייצג את
 * מה שהפקח באמת רואה.
 */
async function findEndWithPattern(afId: number) {
  const [runways, patterns] = await Promise.all([
    (await api.get(`${API}/airfield-runways?airfield_id=${afId}`)).json(),
    (await api.get(`${API}/airfield-patterns?airfield_id=${afId}`)).json(),
  ]);
  for (const p of patterns) {
    const ident = String(p.runway_ident || '').trim();
    const rw = runways.find((r: { heading_a?: string; heading_b?: string }) =>
      String(r.heading_a || '').trim() === ident || String(r.heading_b || '').trim() === ident);
    if (ident && rw) return { patternId: p.id as number, runwayId: rw.id as number, ident };
  }
  return null;
}

test('ההקפה נדלקת עם המסלול הפעיל, ונכבית איתו', async ({ page }) => {
  const preset = await findGroundPreset();
  test.skip(!preset, 'אין עמדת שדה המשויכת לשדה תעופה ב-DB');
  const target = await findEndWithPattern(preset!.airfield_id as number);
  test.skip(!target, 'אין בשדה קצה מסלול שיש לו הקפה');
  const { patternId, runwayId, ident } = target!;
  // מתייחסים להקפה **הזו בלבד**: לקצוות אחרים שבשימוש יש הקפות שמוצגות בצדק,
  // וספירה כוללת הייתה בודקת את הנתונים ולא את הקוד.
  const mine = page.locator(`[data-testid="pattern-shape"][data-pattern-id="${patternId}"]`);
  const setUse = (on: boolean) => api.put(`${API}/runway-end-use`,
    { data: { runway_id: runwayId, end_name: ident, in_takeoff: on, in_landing: false } });

  const before = await (await api.get(`${API}/runway-end-use?airfield_id=${preset!.airfield_id}`)).json();
  const wasOn = before.some((r: { end_name: string; in_takeoff: boolean; in_landing: boolean }) =>
    r.end_name === ident && (r.in_takeoff || r.in_landing));

  await setUse(false);
  await loginToWorkstation(page, { preset: preset!.name });
  await expect(page.locator('#ground-map-area')).toBeVisible({ timeout: 40000 });
  await expect(mine, 'בלי מסלול פעיל אין הקפה').toHaveCount(0, { timeout: 60000 });

  await setUse(true);
  await expect(mine, 'ההקפה נדלקת עם המסלול הפעיל').toHaveCount(1, { timeout: 60000 });
  // אותו רכיב של הניהול, במצב תצוגה בלבד - בלי ידיות עריכה
  await expect(mine).toHaveAttribute('data-editing', '0');
  await expect(mine.getByTestId('pattern-corner')).toHaveCount(0);
  await expect(mine.getByTestId('pattern-leg-label')).toHaveCount(5);

  await setUse(false);
  await expect(mine, 'ביטול המסלול מכבה את ההקפה').toHaveCount(0, { timeout: 60000 });
  await setUse(wasOn); // מחזירים את מצב השדה כפי שהיה
});

test('סגירת מסלול ב-NOTAM מורידה את ההקפה, גם כשהקצה מסומן בשימוש', async ({ page }) => {
  const preset = await findGroundPreset();
  test.skip(!preset, 'אין עמדת שדה המשויכת לשדה תעופה ב-DB');
  const target = await findEndWithPattern(preset!.airfield_id as number);
  test.skip(!target, 'אין בשדה קצה מסלול שיש לו הקפה');
  const { patternId, runwayId, ident } = target!;
  const mine = page.locator(`[data-testid="pattern-shape"][data-pattern-id="${patternId}"]`);
  const setUse = (on: boolean) => api.put(`${API}/runway-end-use`,
    { data: { runway_id: runwayId, end_name: ident, in_takeoff: on, in_landing: false } });

  const before = await (await api.get(`${API}/runway-end-use?airfield_id=${preset!.airfield_id}`)).json();
  const wasOn = before.some((r: { end_name: string; in_takeoff: boolean; in_landing: boolean }) =>
    r.end_name === ident && (r.in_takeoff || r.in_landing));

  // הקצה בשימוש -> ההקפה מוצגת
  await setUse(true);
  await loginToWorkstation(page, { preset: preset!.name });
  await expect(page.locator('#ground-map-area')).toBeVisible({ timeout: 40000 });
  await expect(mine, 'מסלול בשימוש - ההקפה מוצגת').toHaveCount(1, { timeout: 60000 });

  // סגירה ב-NOTAM - הקצה עדיין מסומן בשימוש, אבל האספלט סגור
  const notam = await (await api.post(`${API}/runway-notams`,
    { data: { runway_id: runwayId, notam_type: 'closed', text_content: '__e2e_closed' } })).json();
  try {
    await expect(mine, 'מסלול סגור ב-NOTAM - ההקפה יורדת מהתצוגה').toHaveCount(0, { timeout: 60000 });

    // פתיחה מחזירה אותה, כי הקצה עדיין מסומן בשימוש
    await api.delete(`${API}/runway-notams/${notam.id}`);
    await expect(mine, 'ביטול הסגירה מחזיר את ההקפה').toHaveCount(1, { timeout: 60000 });
  } finally {
    await api.delete(`${API}/runway-notams/${notam.id}`).catch(() => undefined);
    await setUse(wasOn);
  }
});

/** מדליק קצה עם הקפה ומחזיר את המזהה שלה, או null אם אין. */
async function showOnePattern(page: import('@playwright/test').Page, afId: number, presetName: string, screenSize?: '15.6"' | '24"') {
  const target = await findEndWithPattern(afId);
  if (!target) return null;
  await api.put(`${API}/runway-end-use`,
    { data: { runway_id: target.runwayId, end_name: target.ident, in_takeoff: true, in_landing: false } });
  await loginToWorkstation(page, { preset: presetName, screenSize });
  await expect(page.locator(`[data-testid="pattern-shape"][data-pattern-id="${target.patternId}"]`))
    .toHaveCount(1, { timeout: 60000 });
  return target;
}

test('שמות ההקפה ניתנים להסתרה מסרגל התצוגה שבמפה', async ({ page }) => {
  const preset = await findGroundPreset();
  test.skip(!preset, 'אין עמדת שדה המשויכת לשדה תעופה ב-DB');
  const target = await showOnePattern(page, preset!.airfield_id as number, preset!.name);
  test.skip(!target, 'אין בשדה קצה מסלול שיש לו הקפה');

  const labels = page.getByTestId('pattern-leg-label');
  await expect(labels.first()).toBeVisible();

  const box = page.locator('label', { hasText: 'הצג שמות הקפה' }).locator('input[type=checkbox]');
  await expect(box, 'המתג דולק כברירת מחדל').toBeChecked();
  // dispatchEvent: פאנלים צפים אחרים בעמדה יושבים מעל פאנל השכבות וחוטפים קליק
  await box.dispatchEvent('click');
  await expect(box).not.toBeChecked();
  await expect(labels, 'השמות מוסתרים').toHaveCount(0);
  // ההקפה עצמה נשארת - הוסתרו השמות בלבד
  await expect(page.getByTestId('pattern-shape').first()).toBeVisible();

  await box.dispatchEvent('click');
  await expect(labels.first()).toBeVisible();
  await api.put(`${API}/runway-end-use`,
    { data: { runway_id: target!.runwayId, end_name: target!.ident, in_takeoff: false, in_landing: false } });
});

test('הפונט של שמות ההקפה מתכווץ ככל שהמסך גדל, וחי - בלי רענון', async ({ page }) => {
  const preset = await findGroundPreset();
  test.skip(!preset, 'אין עמדת שדה המשויכת לשדה תעופה ב-DB');
  const afId = preset!.airfield_id as number;
  const target = await showOnePattern(page, afId, preset!.name, '15.6"');
  test.skip(!target, 'אין בשדה קצה מסלול שיש לו הקפה');

  const label = page.getByTestId('pattern-leg-label').first();
  await expect(label).toBeVisible();
  const fontAt = async () => Number(await label.getAttribute('font-size'));

  // גודל המסך הוא תכונה על <html>; ההחלפה בעמדה חיה, בלי רענון, ולכן גם
  // הבדיקה מחליפה אותה ישירות - זה בדיוק מה שקורה כשמשנים רזולוציה.
  const setScreen = (v: string) => page.evaluate(s => document.documentElement.setAttribute('data-screen', s), v);

  const sizes = ['15.6', '16', '18', '24'];
  const fonts: number[] = [];
  for (const sz of sizes) {
    await setScreen(sz);
    await expect.poll(fontAt).toBeGreaterThan(0);
    fonts.push(await fontAt());
  }

  for (let i = 1; i < fonts.length; i++) {
    expect(fonts[i], `${sizes[i]}" חייב פונט קטן מ-${sizes[i - 1]}"`).toBeLessThan(fonts[i - 1]);
  }
  // עדיין קריא - לא מתכווץ לאפס
  expect(fonts[fonts.length - 1]).toBeGreaterThan(fonts[0] * 0.5);

  await setScreen('15.6');
  await api.put(`${API}/runway-end-use`,
    { data: { runway_id: target!.runwayId, end_name: target!.ident, in_takeoff: false, in_landing: false } });
});

test('סרגל התצוגה מחליף את צבע המסלול ומשנה את רוחבו', async ({ page }) => {
  const preset = await findGroundPreset();
  test.skip(!preset, 'אין עמדת שדה המשויכת לשדה תעופה ב-DB');
  await loginToWorkstation(page, { preset: preset!.name });

  const asphalt = page.locator('[data-testid="runway-shape"] polygon').first();
  await expect(asphalt).toBeVisible({ timeout: 40000 });
  const fillOf = () => asphalt.getAttribute('fill');
  const widthOf = async () => {
    const box = (await asphalt.boundingBox())!;
    return Math.min(box.width, box.height); // הצלע הקצרה = רוחב המסלול
  };

  // ── צבע ──
  await expect(page.getByTestId('runway-palette-dark')).toHaveAttribute('data-active', '1');
  const dark = await fillOf();
  await page.getByTestId('runway-palette-light').click();
  await expect(page.getByTestId('runway-palette-light')).toHaveAttribute('data-active', '1');
  const light = await fillOf();
  expect(light, 'הצבע התחלף').not.toBe(dark);
  // בהיר באמת בהיר: סכום הערוצים גדול יותר
  const lum = (hex: string | null) => (hex || '#000').slice(1).match(/../g)!.reduce((a, h) => a + parseInt(h, 16), 0);
  expect(lum(light)).toBeGreaterThan(lum(dark));
  await page.getByTestId('runway-palette-dark').click();
  expect(await fillOf()).toBe(dark);

  // ── רוחב ──
  const before = await widthOf();
  await expect(page.getByTestId('runway-width-scale')).toHaveText('100%');
  await page.getByTestId('runway-width-plus').click();
  await expect(page.getByTestId('runway-width-scale')).not.toHaveText('100%');
  expect(await widthOf(), 'הרחבה מגדילה את המסלול').toBeGreaterThan(before);

  await page.getByTestId('runway-width-minus').click();
  await page.getByTestId('runway-width-minus').click();
  expect(await widthOf(), 'צמצום מקטין אותו').toBeLessThan(before);

  // הפקדים נעצרים בגבולות ולא מייצרים מסלול אפסי
  for (let i = 0; i < 20; i++) await page.getByTestId('runway-width-minus').click();
  expect(await widthOf(), 'גם במינימום המסלול נשאר מסלול').toBeGreaterThan(1);
});
