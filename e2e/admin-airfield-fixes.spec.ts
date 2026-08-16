import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders, identifyViaMirage, makeTestMapPng, setScreenSize } from './helpers';

// ─── שדה תעופה בעמדת ניהול: שכפול, וקישורי מסלולים כרובד נפרד ────────────────
// א. שכפול שדה הפיל את המערכת - שני באגים: sids/stars הועברו כמערך JS ל-JSONB
//    (`pg` מסדר מערך כליטרל של Postgres, לא כ-JSON), ו-sequences שפיגרו אחרי
//    max(id) הפילו כל INSERT ל-airfield_sectors/polygons/status_types.
// ב. "קישורי מסלולים" ישב בתוך "מסלולי הסעה" - הוצא לרובד בפני עצמו, וחל על
//    כל סוגי המסלולים כולל מסלולי המראה.
// ג. קישור בין יותר משני **שדות תעופה** - קבוצה במקום זוג. הבורר היה "עמדה"
//    וזו הייתה טעות: מסלול שייך לשדה, ועמדה רק רואה אותו דרך השדה שלה.

const API = process.env.E2E_API_URL || 'http://localhost:3001/api';
const STAMP = `__e2e_af_${Date.now()}`;
const STAMP_B = `${STAMP}_b`;
const STAMP_C = `${STAMP}_c`;
const PNG = makeTestMapPng();

let mapId = 0;
let airfieldId = 0;
let airfieldBId = 0;
let airfieldCId = 0;
const createdAirfields: number[] = [];

// הקמת הנתונים עוברת ב-API עם אסימון (SK-01): `request` חשוף מקבל 401 ומשאיר
// את הבדיקות בלי שדה לעבוד עליו.
let api: APIRequestContext;

/** שדה עם מסלול הסעה ומסלול המראה - כדי לאמת שהקישור מציע את שני הסוגים. */
async function makeAirfieldWithRoutes(name: string): Promise<{ id: number; routes: number[] }> {
  const id = (await (await api.post(`${API}/airfields`, {
    data: { name, map_id: mapId, sids: [{ label: 'אלפא', sector_ids: [] }], stars: ['בור', 'גילה'] },
  })).json()).id;
  createdAirfields.push(id);
  const routes: number[] = [];
  for (const r of [
    { name: `${name}_taxi`, route_category: 'general', is_runway: false, route_path: [{ x: 10, y: 10 }, { x: 40, y: 40 }] },
    { name: `${name}_rwy`, route_category: 'general', is_runway: true, end_a_name: '33', end_b_name: '15', route_path: [{ x: 50, y: 70 }, { x: 50, y: 40 }] },
  ]) {
    routes.push((await (await api.post(`${API}/airfield-routes`, { data: { airfield_id: id, ...r } })).json()).id);
  }
  return { id, routes };
}

test.beforeAll(async () => {
  api = await playwrightRequest.newContext({ extraHTTPHeaders: await apiAuthHeaders() });
  mapId = (await (await api.post(`${API}/maps`, { data: { name: STAMP, image_data: PNG } })).json()).id;
  airfieldId = (await makeAirfieldWithRoutes(STAMP)).id;
  // שדות נוספים - הקישור הוא **בין שדות**, ושלושה מוכיחים שהוא קבוצה ולא זוג
  airfieldBId = (await makeAirfieldWithRoutes(STAMP_B)).id;
  airfieldCId = (await makeAirfieldWithRoutes(STAMP_C)).id;

  await api.post(`${API}/airfield-runways`, {
    data: { airfield_id: airfieldId, name: '33/15', heading_a: '33', heading_b: '15', start_x_pct: 50, start_y_pct: 70, end_x_pct: 50, end_y_pct: 40 },
  });
  await api.post(`${API}/airfield-sectors`, { data: { airfield_id: airfieldId, name: 'מזרח', rect: { x: 10, y: 10, w: 30, h: 20 } } });
  await api.post(`${API}/airfield-status-types`, { data: { airfield_id: airfieldId, name: 'פתוח', color: '#22c55e' } });
});

test.afterAll(async () => {
  for (const afId of [airfieldId, airfieldBId, airfieldCId]) {
    const groups = await (await api.get(`${API}/route-link-groups?airfield_id=${afId}`)).json();
    for (const g of groups) await api.delete(`${API}/route-link-groups/${g.id}`);
  }
  for (const id of createdAirfields) await api.delete(`${API}/airfields/${id}`);
  if (mapId) await api.delete(`${API}/maps/${mapId}`);
  await api.dispose();
});

test('שכפול שדה עם SIDs, סקטורים וסוגי סטטוס עובד ומעתיק את התוכן', async () => {
  const res = await api.post(`${API}/airfields/${airfieldId}/duplicate`);
  expect(res.status(), 'שכפול שדה עם sids/stars לא אמור להיכשל').toBe(200);
  const dup = await res.json();
  createdAirfields.push(dup.id);

  // sids/stars נשמרו כמערך ולא כאובייקט - זה היה הבאג
  const all = await (await api.get(`${API}/airfields`)).json();
  const copy = all.find((a: { id: number }) => a.id === dup.id);
  expect(Array.isArray(copy.sids)).toBe(true);
  expect(copy.sids).toHaveLength(1);
  expect(copy.stars).toEqual(['בור', 'גילה']);

  // מסלולים והקפות נכללים בעותק
  const rw = await (await api.get(`${API}/airfield-runways?airfield_id=${dup.id}`)).json();
  expect(rw).toHaveLength(1);
  expect(rw[0].name).toBe('33/15');
  const routes = await (await api.get(`${API}/airfield-routes?airfield_id=${dup.id}`)).json();
  expect(routes).toHaveLength(2);
  expect(routes.filter((r: { is_runway: boolean }) => r.is_runway)).toHaveLength(1);
});

test('שכפול פעמיים ברצף - הסקטורים וסוגי הסטטוס עוברים בלי duplicate key', async () => {
  for (let i = 0; i < 2; i++) {
    const res = await api.post(`${API}/airfields/${airfieldId}/duplicate`);
    expect(res.status(), `שכפול #${i + 1}`).toBe(200);
    const dup = await res.json();
    createdAirfields.push(dup.id);
    const sectors = await (await api.get(`${API}/airfield-sectors?airfield_id=${dup.id}`)).json();
    expect(sectors, 'סקטורים לא הועתקו - sequence מפגר?').toHaveLength(1);
    const statuses = await (await api.get(`${API}/airfield-status-types?airfield_id=${dup.id}`)).json();
    expect(statuses).toHaveLength(1);
  }
});

test('קישור מסלולים: רובד נפרד, שלושה שדות תעופה, וכל סוגי המסלולים', async ({ page }) => {
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
  await page.getByTestId('route-link-airfield').selectOption(String(airfieldId));
  const routeSelect = page.getByTestId('route-link-route');
  const optionTexts = await routeSelect.locator('option').allTextContents();
  expect(optionTexts.some(t => t.includes('🛫')), 'חייב להציע גם מסלול המראה').toBe(true);

  // שלושה שדות בקישור אחד - זו כל הנקודה של סעיף ג
  for (const [i, afId] of [airfieldId, airfieldBId, airfieldCId].entries()) {
    await page.getByTestId('route-link-airfield').selectOption(String(afId));
    // רשימת המסלולים נטענת ברקע - assertion מרענן במקום קריאה חד-פעמית
    await expect(page.getByTestId('route-link-route').locator('option'),
      `שני המסלולים של שדה ${i} + שורת הבחירה`).toHaveCount(3);
    const opts = await page.getByTestId('route-link-route').locator('option').all();
    const values = (await Promise.all(opts.map(o => o.getAttribute('value')))).filter(Boolean) as string[];
    await page.getByTestId('route-link-route').selectOption(values[0]);
    await page.getByTestId('route-link-member-add').click();
  }
  await page.getByTestId('route-link-save').click();

  const group = page.getByTestId('route-link-group').first();
  await expect(group).toBeVisible({ timeout: 15000 });
  const count = Number(await group.getAttribute('data-member-count'));
  expect(count, 'הקישור חייב להחזיק יותר משני שדות').toBeGreaterThan(2);
});

test('הבורר מציע שדות תעופה - לא עמדות', async ({ page }) => {
  await setScreenSize(page);
  await page.goto('/');
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /ניהול מערכת/ }).click();
  await page.getByRole('button', { name: /שדות תעופה/ }).click();
  await page.locator('select').first().selectOption({ label: STAMP });
  await page.getByTestId('route-links-header').click();
  await page.getByTestId('route-link-add').click();

  const labels = await page.getByTestId('route-link-airfield').locator('option').allTextContents();
  expect(labels, 'שני השדות שנוצרו לבדיקה חייבים להופיע בבורר').toEqual(expect.arrayContaining([STAMP, STAMP_B]));
});

test('קישור עם מסלול אחד אינו ניתן לשמירה', async ({ page }) => {
  await setScreenSize(page);
  await page.goto('/');
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /ניהול מערכת/ }).click();
  await page.getByRole('button', { name: /שדות תעופה/ }).click();
  await page.locator('select').first().selectOption({ label: STAMP });
  await page.getByTestId('route-links-header').click();
  await page.getByTestId('route-link-add').click();

  await expect(page.getByTestId('route-link-save')).toBeDisabled();
  await page.getByTestId('route-link-airfield').selectOption(String(airfieldId));
  await expect(page.getByTestId('route-link-route').locator('option'),
    'שני מסלולי השדה + שורת הבחירה').toHaveCount(3);
  const values = (await Promise.all((await page.getByTestId('route-link-route').locator('option').all())
    .map(o => o.getAttribute('value')))).filter(Boolean) as string[];
  await page.getByTestId('route-link-route').selectOption(values[0]);
  await page.getByTestId('route-link-member-add').click();
  await expect(page.getByTestId('route-link-save'), 'מסלול אחד אינו קישור').toBeDisabled();
});
