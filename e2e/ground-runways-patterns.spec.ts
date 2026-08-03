import { test, expect, type Page } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// ─── עמדת שדה: שכבת מסלולי המראה ושכבת הקפות ─────────────────────────────────
// הדרישה מהשטח: "בעמדת שדה תעופה להוסיף יכולת להציג הקפה ומסלולים (בלי מסלולי
// הסעה). כשמציג מסלולים להציג את זה לא כקו אלא כמסלול."
//
// שתי שכבות **נפרדות** ממסלולי ההסעה - הפקח רוצה לראות את המסלולים בלי רשת
// ההסעה - והמסלול מצויר כמיסעה עם ספי מסלול, קו מרכז ומספר כיוון.

const API = 'http://localhost:3001/api';

// עמדת שדה טוענת מפה, אלמנטים, מסלולים ו-NOTAMים - הכניסה איטית מברירת המחדל.
test.describe.configure({ timeout: 240000 });

const STAMP = `__e2e_rwlayer_${Date.now()}`;
const created: { runways: number[]; patterns: number[] } = { runways: [], patterns: [] };
let airfieldId = 0;

async function findGroundPreset(page: Page) {
  const presets = await (await page.request.get(`${API}/workstation-presets`)).json();
  return (presets as { preset_type: string; name: string; airfield_id: number | null }[]).find(p =>
    p.preset_type === 'ground' && p.airfield_id && !String(p.name || '').startsWith('__'));
}

/** מסלול והקפה זמניים לשדה של העמדה, כדי שיהיה מה לצייר בלי להישען על ה-DB. */
async function seed(page: Page, afId: number) {
  airfieldId = afId;
  const rw = await (await page.request.post(`${API}/airfield-runways`, {
    data: { airfield_id: afId, name: `${STAMP}`, heading_a: '21', heading_b: '03',
            start_x_pct: 20, start_y_pct: 75, end_x_pct: 78, end_y_pct: 28 },
  })).json();
  created.runways.push(rw.id);
  const geom = { anchor: { x: 20, y: 75 }, bearing: 40, side: 'left', rwyLen: 30, upwind: 10, width: 16, baseExt: 10 };
  const pat = await (await page.request.post(`${API}/airfield-patterns`, {
    data: { airfield_id: afId, runway_id: rw.id, runway_ident: '21', geometry: geom, points: [] },
  })).json();
  created.patterns.push(pat.id);
}

test.afterAll(async ({ request }) => {
  for (const id of created.patterns) await request.delete(`${API}/airfield-patterns/${id}`);
  for (const id of created.runways) await request.delete(`${API}/airfield-runways/${id}`);
});

test('מסלולי ההמראה מוצגים כמיסעה עם סימונים, לא כקו', async ({ page }) => {
  const preset = await findGroundPreset(page);
  test.skip(!preset, 'אין עמדת שדה המשויכת לשדה תעופה ב-DB');
  await seed(page, preset!.airfield_id as number);

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
  const preset = await findGroundPreset(page);
  test.skip(!preset, 'אין עמדת שדה המשויכת לשדה תעופה ב-DB');
  await seed(page, preset!.airfield_id as number);

  await loginToWorkstation(page, { preset: preset!.name });
  await expect(page.getByTestId('runway-shape').first()).toBeVisible({ timeout: 30000 });

  const runwaysBox = page.locator('label', { hasText: 'מסלולי המראה' }).locator('input[type=checkbox]');
  const taxiBox = page.locator('label', { hasText: 'מסלולי מטוסים' }).locator('input[type=checkbox]');
  await expect(runwaysBox).toBeChecked();
  // מסלולי ההסעה כבויים כברירת מחדל - המסלולים אינם תלויים בהם
  await expect(taxiBox).not.toBeChecked();

  await runwaysBox.uncheck();
  await expect(page.getByTestId('runway-shape')).toHaveCount(0);
  await runwaysBox.check();
  await expect(page.getByTestId('runway-shape').first()).toBeVisible();
});

test('הקפה מוצגת בעמדה, כבויה כברירת מחדל', async ({ page }) => {
  const preset = await findGroundPreset(page);
  test.skip(!preset, 'אין עמדת שדה המשויכת לשדה תעופה ב-DB');
  await seed(page, preset!.airfield_id as number);

  await loginToWorkstation(page, { preset: preset!.name });
  await expect(page.locator('#ground-map-area')).toBeVisible({ timeout: 30000 });

  // ההקפה אינה מידע יומיומי ולכן אינה מוצגת עד שמבקשים אותה
  await expect(page.getByTestId('pattern-shape')).toHaveCount(0);

  const patternsBox = page.locator('label', { hasText: 'הקפות' }).locator('input[type=checkbox]');
  await expect(patternsBox).not.toBeChecked();
  await patternsBox.check();

  const pattern = page.getByTestId('pattern-shape').first();
  await expect(pattern).toBeVisible({ timeout: 15000 });
  // אותו רכיב של הניהול, במצב תצוגה בלבד - בלי ידיות עריכה
  await expect(pattern).toHaveAttribute('data-editing', '0');
  await expect(page.getByTestId('pattern-corner')).toHaveCount(0);
  // חמש הצלעות עם שמותיהן
  await expect(pattern.getByTestId('pattern-leg-label')).toHaveCount(5);
});
