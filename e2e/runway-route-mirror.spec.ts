import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders, identifyViaMirage, makeTestMapPng, setScreenSize } from './helpers';

// ─── מסלול המראה נכנס אוטומטית ל"מסלולי הסעה" ────────────────────────────────
// מסלול המראה הוגדר פעמיים ידנית - ביישות "מסלולים" וב"מסלולי הסעה" - ושתי
// ההגדרות יכלו לסתור זו את זו בשקט. מעכשיו השנייה היא **ראי** של הראשונה:
// נוצרת אוטומטית עם כל הנתונים, נושאת הערה שאומרת מאיפה הגיעה, ואינה ניתנת
// לעריכה שם.

const API = process.env.E2E_API_URL || 'http://localhost:3001/api';
const STAMP = `__e2e_rwmirror_${Date.now()}`;
const PNG = makeTestMapPng();

let api: APIRequestContext;
let mapId = 0;
let airfieldId = 0;
let runwayId = 0;

const routesOf = async (afId: number) =>
  (await (await api.get(`${API}/airfield-routes?airfield_id=${afId}`)).json()) as any[];

test.beforeAll(async () => {
  api = await playwrightRequest.newContext({ extraHTTPHeaders: await apiAuthHeaders() });
  mapId = (await (await api.post(`${API}/maps`, { data: { name: STAMP, image_data: PNG } })).json()).id;
  airfieldId = (await (await api.post(`${API}/airfields`, { data: { name: STAMP, map_id: mapId } })).json()).id;
});

test.afterAll(async () => {
  if (airfieldId) await api.delete(`${API}/airfields/${airfieldId}`);
  if (mapId) await api.delete(`${API}/maps/${mapId}`);
  await api.dispose();
});

test('יצירת מסלול ביישות "מסלולים" יוצרת מסלול הסעה מלא עם הערת מקור', async () => {
  const res = await api.post(`${API}/airfield-runways`, {
    data: {
      airfield_id: airfieldId, name: '33/15', heading_a: '33', heading_b: '15',
      start_x_pct: 50, start_y_pct: 70, end_x_pct: 50, end_y_pct: 40,
    },
  });
  expect(res.status()).toBe(200);
  runwayId = (await res.json()).id;

  const routes = await routesOf(airfieldId);
  const mirror = routes.find(r => Number(r.source_runway_id) === Number(runwayId));
  expect(mirror, 'מסלול ההמראה חייב להופיע במסלולי ההסעה').toBeTruthy();

  // הנתונים מולאו אוטומטית - בלי הקלדה חוזרת
  expect(mirror.name).toBe('33/15');
  expect(mirror.is_runway).toBe(true);
  expect(mirror.end_a_name).toBe('33');
  expect(mirror.end_b_name).toBe('15');
  const path = Array.isArray(mirror.route_path) ? mirror.route_path : JSON.parse(mirror.route_path || '[]');
  expect(path, 'השרטוט נגזר מקואורדינטות המסלול').toEqual([{ x: 50, y: 70 }, { x: 50, y: 40 }]);
  expect(mirror.notes, 'ההערה אומרת מאיפה המסלול הגיע').toContain('מסלולים');
});

test('עדכון המסלול ביישות "מסלולים" מתגלגל למסלול ההסעה', async () => {
  test.skip(!runwayId, 'המסלול לא נוצר');
  const res = await api.put(`${API}/airfield-runways/${runwayId}`, {
    data: {
      name: '34/16', heading_a: '34', heading_b: '16',
      start_x_pct: 20, start_y_pct: 20, end_x_pct: 80, end_y_pct: 80,
    },
  });
  expect(res.status()).toBe(200);

  const mirror = (await routesOf(airfieldId)).find(r => Number(r.source_runway_id) === Number(runwayId));
  expect(mirror.name).toBe('34/16');
  expect(mirror.end_a_name).toBe('34');
  const path = Array.isArray(mirror.route_path) ? mirror.route_path : JSON.parse(mirror.route_path || '[]');
  expect(path).toEqual([{ x: 20, y: 20 }, { x: 80, y: 80 }]);
});

test('מסלול ראי אינו ניתן לעריכה או למחיקה במסלולי ההסעה', async () => {
  test.skip(!runwayId, 'המסלול לא נוצר');
  const mirror = (await routesOf(airfieldId)).find(r => Number(r.source_runway_id) === Number(runwayId));

  const put = await api.put(`${API}/airfield-routes/${mirror.id}`, {
    data: { name: 'שם אחר', route_path: [], is_runway: true },
  });
  expect(put.status(), 'עריכה במסלולי הסעה נחסמת').toBe(409);
  expect((await put.json()).error).toBe('route_from_runway');

  const del = await api.delete(`${API}/airfield-routes/${mirror.id}`);
  expect(del.status(), 'מחיקה במסלולי הסעה נחסמת').toBe(409);

  // ולא רק ההודעה - הנתון לא זז
  const after = (await routesOf(airfieldId)).find(r => r.id === mirror.id);
  expect(after.name).toBe('34/16');
});

test('מסלול שנוצר במסלולי ההסעה עצמם - כן ניתן לעריכה', async () => {
  const created = await (await api.post(`${API}/airfield-routes`, {
    data: { airfield_id: airfieldId, name: `${STAMP}_manual`, route_category: 'general', route_path: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
  })).json();
  const put = await api.put(`${API}/airfield-routes/${created.id}`, {
    data: { name: `${STAMP}_manual2`, route_path: [{ x: 3, y: 3 }, { x: 4, y: 4 }] },
  });
  expect(put.status(), 'מסלול שנוצר כאן נשאר בשליטת המפעיל').toBe(200);
  expect((await put.json()).name).toBe(`${STAMP}_manual2`);
  expect((await api.delete(`${API}/airfield-routes/${created.id}`)).status()).toBe(200);
});

test('מחיקת המסלול ביישות "מסלולים" מוחקת גם את מסלול ההסעה', async () => {
  test.skip(!runwayId, 'המסלול לא נוצר');
  expect((await api.delete(`${API}/airfield-runways/${runwayId}`)).status()).toBe(200);
  const left = (await routesOf(airfieldId)).find(r => Number(r.source_runway_id) === Number(runwayId));
  expect(left, 'מסלול ראי אינו שורד את המסלול שממנו הגיע').toBeUndefined();
  runwayId = 0;
});

test('שכפול שדה: מסלול הראי בעותק מצביע על המסלול של העותק, לא של המקור', async () => {
  const rw = await (await api.post(`${API}/airfield-runways`, {
    data: {
      airfield_id: airfieldId, name: '05/23', heading_a: '05', heading_b: '23',
      start_x_pct: 30, start_y_pct: 30, end_x_pct: 70, end_y_pct: 70,
    },
  })).json();

  const dup = await (await api.post(`${API}/airfields/${airfieldId}/duplicate`)).json();
  try {
    const dupRunways = await (await api.get(`${API}/airfield-runways?airfield_id=${dup.id}`)).json();
    const dupMirror = (await routesOf(dup.id)).find(r => r.source_runway_id);
    expect(dupMirror, 'לעותק יש מסלול ראי משלו').toBeTruthy();
    expect(Number(dupMirror.source_runway_id), 'הראי בעותק מצביע על המסלול של העותק')
      .toBe(Number(dupRunways[0].id));
    expect(Number(dupMirror.source_runway_id)).not.toBe(Number(rw.id));

    // ההוכחה שזה לא רק מספר: מחיקת המסלול במקור אינה נוגעת בעותק
    await api.delete(`${API}/airfield-runways/${rw.id}`);
    const stillThere = (await routesOf(dup.id)).find(r => r.id === dupMirror.id);
    expect(stillThere, 'מחיקה בשדה המקורי לא מוחקת בעותק').toBeTruthy();
  } finally {
    await api.delete(`${API}/airfields/${dup.id}`);
  }
});

test('בממשק: שורת מסלול ראי מסומנת נעולה ובלי כפתורי עריכה', async ({ page }) => {
  const rw = await (await api.post(`${API}/airfield-runways`, {
    data: {
      airfield_id: airfieldId, name: '27/09', heading_a: '27', heading_b: '09',
      start_x_pct: 10, start_y_pct: 50, end_x_pct: 90, end_y_pct: 50,
    },
  })).json();

  await setScreenSize(page);
  await page.goto('/');
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /ניהול מערכת/ }).click();
  await page.getByRole('button', { name: /שדות תעופה/ }).click();
  await page.locator('select').first().selectOption({ label: STAMP });

  const header = page.locator('[data-af-section="routes"]');
  await expect(header).toBeVisible({ timeout: 20000 });
  await header.click();

  const mirrorRow = page.locator('[data-testid="airfield-route-row"][data-from-runway="1"]');
  await expect(mirrorRow, 'המסלול מיישות "מסלולים" מופיע ברשימה').toHaveCount(1);
  await expect(mirrorRow.getByTestId('route-from-runway')).toBeVisible();
  await expect(mirrorRow.locator('button'), 'לשורה נעולה אין כפתורי פעולה').toHaveCount(0);

  await api.delete(`${API}/airfield-runways/${rw.id}`);
});
