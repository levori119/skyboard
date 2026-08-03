import { test, expect } from '@playwright/test';
import { identifyViaMirage, makeTestMapPng, setScreenSize } from './helpers';

// ─── שדה תעופה בעמדת ניהול: שכפול, וקישורי מסלולים כרובד נפרד ────────────────
// א. שכפול שדה הפיל את המערכת - שני באגים: sids/stars הועברו כמערך JS ל-JSONB
//    (`pg` מסדר מערך כליטרל של Postgres, לא כ-JSON), ו-sequences שפיגרו אחרי
//    max(id) הפילו כל INSERT ל-airfield_sectors/polygons/status_types.
// ב. "קישורי מסלולים" ישב בתוך "מסלולי הסעה" - הוצא לרובד בפני עצמו, וחל על
//    כל סוגי המסלולים כולל מסלולי המראה.
// ג. קישור בין יותר משתי עמדות - קבוצה במקום זוג.

const API = process.env.E2E_API_URL || 'http://localhost:3001/api';
const STAMP = `__e2e_af_${Date.now()}`;
const PNG = makeTestMapPng();

let mapId = 0;
let airfieldId = 0;
let routeIds: number[] = [];
let presetIds: number[] = [];
const createdAirfields: number[] = [];

test.beforeAll(async ({ request }) => {
  mapId = (await (await request.post(`${API}/maps`, { data: { name: STAMP, image_data: PNG } })).json()).id;
  airfieldId = (await (await request.post(`${API}/airfields`, {
    data: { name: STAMP, map_id: mapId, sids: [{ label: 'אלפא', sector_ids: [] }], stars: ['בור', 'גילה'] },
  })).json()).id;
  createdAirfields.push(airfieldId);

  await request.post(`${API}/airfield-runways`, {
    data: { airfield_id: airfieldId, name: '33/15', heading_a: '33', heading_b: '15', start_x_pct: 50, start_y_pct: 70, end_x_pct: 50, end_y_pct: 40 },
  });
  // מסלול הסעה + מסלול המראה - כדי לאמת שהקישור מציע את שניהם
  for (const r of [
    { name: `${STAMP}_taxi`, route_category: 'general', is_runway: false, route_path: [{ x: 10, y: 10 }, { x: 40, y: 40 }] },
    { name: `${STAMP}_rwy`, route_category: 'general', is_runway: true, end_a_name: '33', end_b_name: '15', route_path: [{ x: 50, y: 70 }, { x: 50, y: 40 }] },
  ]) {
    routeIds.push((await (await request.post(`${API}/airfield-routes`, { data: { airfield_id: airfieldId, ...r } })).json()).id);
  }
  await request.post(`${API}/airfield-sectors`, { data: { airfield_id: airfieldId, name: 'מזרח', rect: { x: 10, y: 10, w: 30, h: 20 } } });
  await request.post(`${API}/airfield-status-types`, { data: { airfield_id: airfieldId, name: 'פתוח', color: '#22c55e' } });

  const presets = await (await request.get(`${API}/workstation-presets`)).json();
  presetIds = presets.slice(0, 3).map((p: { id: number }) => p.id);
});

test.afterAll(async ({ request }) => {
  const groups = await (await request.get(`${API}/route-link-groups?airfield_id=${airfieldId}`)).json();
  for (const g of groups) await request.delete(`${API}/route-link-groups/${g.id}`);
  for (const id of createdAirfields) await request.delete(`${API}/airfields/${id}`);
  if (mapId) await request.delete(`${API}/maps/${mapId}`);
});

test('שכפול שדה עם SIDs, סקטורים וסוגי סטטוס עובד ומעתיק את התוכן', async ({ request }) => {
  const res = await request.post(`${API}/airfields/${airfieldId}/duplicate`);
  expect(res.status(), 'שכפול שדה עם sids/stars לא אמור להיכשל').toBe(200);
  const dup = await res.json();
  createdAirfields.push(dup.id);

  // sids/stars נשמרו כמערך ולא כאובייקט - זה היה הבאג
  const all = await (await request.get(`${API}/airfields`)).json();
  const copy = all.find((a: { id: number }) => a.id === dup.id);
  expect(Array.isArray(copy.sids)).toBe(true);
  expect(copy.sids).toHaveLength(1);
  expect(copy.stars).toEqual(['בור', 'גילה']);

  // מסלולים והקפות נכללים בעותק
  const rw = await (await request.get(`${API}/airfield-runways?airfield_id=${dup.id}`)).json();
  expect(rw).toHaveLength(1);
  expect(rw[0].name).toBe('33/15');
  const routes = await (await request.get(`${API}/airfield-routes?airfield_id=${dup.id}`)).json();
  expect(routes).toHaveLength(2);
  expect(routes.filter((r: { is_runway: boolean }) => r.is_runway)).toHaveLength(1);
});

test('שכפול פעמיים ברצף - הסקטורים וסוגי הסטטוס עוברים בלי duplicate key', async ({ request }) => {
  for (let i = 0; i < 2; i++) {
    const res = await request.post(`${API}/airfields/${airfieldId}/duplicate`);
    expect(res.status(), `שכפול #${i + 1}`).toBe(200);
    const dup = await res.json();
    createdAirfields.push(dup.id);
    const sectors = await (await request.get(`${API}/airfield-sectors?airfield_id=${dup.id}`)).json();
    expect(sectors, 'סקטורים לא הועתקו - sequence מפגר?').toHaveLength(1);
    const statuses = await (await request.get(`${API}/airfield-status-types?airfield_id=${dup.id}`)).json();
    expect(statuses).toHaveLength(1);
  }
});

test('קישור מסלולים: רובד נפרד, שלוש עמדות, וכל סוגי המסלולים', async ({ page }) => {
  test.skip(presetIds.length < 3, 'נדרשות שלוש עמדות כדי לבדוק קישור מעבר לזוג');

  await setScreenSize(page);
  await page.goto('/');
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /ניהול מערכת/ }).click();
  await page.getByRole('button', { name: /שדות תעופה/ }).click();
  await page.locator('select').first().selectOption({ label: STAMP });

  // הסקשן קיים ואינו מקונן בתוך "מסלולי הסעה"
  const section = page.getByTestId('route-links-section');
  await expect(section).toBeVisible({ timeout: 20000 });
  const nestedInTaxi = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="route-links-section"]');
    return !!el?.closest('[data-af-section="routes"]');
  });
  expect(nestedInTaxi, 'קישורי מסלולים לא אמור לשבת בתוך סקשן מסלולי הסעה').toBe(false);

  await page.getByTestId('route-links-header').click();
  await page.getByTestId('route-link-add').click();

  // הבורר מציע גם מסלול הסעה וגם מסלול המראה
  await page.getByTestId('route-link-preset').selectOption(String(presetIds[0]));
  const routeSelect = page.getByTestId('route-link-route');
  const optionTexts = await routeSelect.locator('option').allTextContents();
  expect(optionTexts.some(t => t.includes('🛫')), 'חייב להציע גם מסלול המראה').toBe(true);

  // שלושה חברים - זו כל הנקודה של סעיף ג
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('route-link-preset').selectOption(String(presetIds[i]));
    const opts = await page.getByTestId('route-link-route').locator('option').all();
    const values = (await Promise.all(opts.map(o => o.getAttribute('value')))).filter(Boolean) as string[];
    test.skip(!values.length, 'לעמדה אין מסלולים לבחירה');
    await page.getByTestId('route-link-route').selectOption(values[Math.min(i, values.length - 1)]);
    await page.getByTestId('route-link-member-add').click();
  }
  await page.getByTestId('route-link-save').click();

  const group = page.getByTestId('route-link-group').first();
  await expect(group).toBeVisible({ timeout: 15000 });
  const count = Number(await group.getAttribute('data-member-count'));
  expect(count, 'הקישור חייב להחזיק יותר משתי עמדות').toBeGreaterThan(2);
});

test('קישור עם עמדה אחת אינו ניתן לשמירה', async ({ page }) => {
  test.skip(presetIds.length < 1, 'אין עמדות');
  await setScreenSize(page);
  await page.goto('/');
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /ניהול מערכת/ }).click();
  await page.getByRole('button', { name: /שדות תעופה/ }).click();
  await page.locator('select').first().selectOption({ label: STAMP });
  await page.getByTestId('route-links-header').click();
  await page.getByTestId('route-link-add').click();

  await expect(page.getByTestId('route-link-save')).toBeDisabled();
  await page.getByTestId('route-link-preset').selectOption(String(presetIds[0]));
  const values = (await Promise.all((await page.getByTestId('route-link-route').locator('option').all())
    .map(o => o.getAttribute('value')))).filter(Boolean) as string[];
  test.skip(!values.length, 'לעמדה אין מסלולים');
  await page.getByTestId('route-link-route').selectOption(values[0]);
  await page.getByTestId('route-link-member-add').click();
  await expect(page.getByTestId('route-link-save'), 'חבר אחד אינו קישור').toBeDisabled();
});
