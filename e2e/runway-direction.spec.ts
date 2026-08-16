import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders, loginToWorkstation } from './helpers';

// ─── כיוון אחד למסלול: אין המראה ונחיתה על קצוות מנוגדים ──────────────────────
// הפאנל "מסלולים בשימוש" החזיק שתי רשימות חופשיות ולכן איפשר לסמן גם 15L וגם
// 33R - שני כיוונים מנוגדים על אותו אספלט. עכשיו הקצה הנגדי מסומן **כתום**,
// ולחיצה עליו **מחליפה כיוון** בשתי השורות (המראה ונחיתה).

// עמדת שדה טוענת מפה, אלמנטים, מסלולים ו-NOTAMים - הכניסה איטית מברירת המחדל.
test.describe.configure({ timeout: 240000 });

const API = process.env.E2E_API_URL || 'http://localhost:3001/api';
const STAMP = `__e2e_rwydir_${Date.now()}`;

let api: APIRequestContext;
let airfieldId = 0;
let presetId = 0;

test.beforeAll(async () => {
  api = await playwrightRequest.newContext({ extraHTTPHeaders: await apiAuthHeaders() });
  airfieldId = (await (await api.post(`${API}/airfields`, { data: { name: STAMP } })).json()).id;
  for (const rw of [
    { name: '15L/33R', heading_a: '15L', heading_b: '33R', start_x_pct: 20, start_y_pct: 80, end_x_pct: 80, end_y_pct: 20 },
    { name: '18/36', heading_a: '18', heading_b: '36', start_x_pct: 50, start_y_pct: 85, end_x_pct: 50, end_y_pct: 15 },
  ]) {
    await api.post(`${API}/airfield-runways`, { data: { airfield_id: airfieldId, ...rw } });
  }
  presetId = (await (await api.post(`${API}/workstation-presets`, {
    data: { name: STAMP, preset_role: 'tower', preset_type: 'ground', airfield_id: airfieldId, display_mode: 'complex' },
  })).json()).id;
});

test.afterAll(async () => {
  if (presetId) await api.delete(`${API}/workstation-presets/${presetId}`);
  if (airfieldId) await api.delete(`${API}/airfields/${airfieldId}`);
  await api.dispose();
});

test('בחירת קצה מסמנת את הנגדי בכתום, ולחיצה עליו מחליפה כיוון', async ({ page }) => {
  await loginToWorkstation(page, { preset: STAMP });

  const to15L = page.getByTestId('rwy-takeoff-15L');
  const to33R = page.getByTestId('rwy-takeoff-33R');
  const ld15L = page.getByTestId('rwy-landing-15L');
  const ld33R = page.getByTestId('rwy-landing-33R');
  const to18 = page.getByTestId('rwy-takeoff-18');

  await expect(to15L, 'פאנל "מסלולים בשימוש" מוצג בעמדת מגדל').toBeVisible({ timeout: 30000 });
  await expect(to15L).toHaveAttribute('data-use', 'off');

  // 1. המראה מ-15L -> הקצה הנגדי כתום, **בשתי השורות**
  await to15L.click();
  await expect(to15L).toHaveAttribute('data-use', 'active');
  await expect(to33R, 'הנגדי כתום בשורת ההמראה').toHaveAttribute('data-use', 'opposed');
  await expect(ld33R, 'הנגדי כתום גם בשורת הנחיתה').toHaveAttribute('data-use', 'opposed');
  await expect(to18, 'מסלול אחר אינו מושפע').toHaveAttribute('data-use', 'off');

  // 2. נחיתה באותו כיוון - מותר, זה המצב הרגיל
  await ld15L.click();
  await expect(ld15L).toHaveAttribute('data-use', 'active');
  await expect(to15L).toHaveAttribute('data-use', 'active');

  // 3. לחיצה על הכתום מחליפה כיוון: 33R נכנס, 15L יורד בשתי השורות
  await ld33R.click();
  await expect(ld33R, 'הכתום הפך לפעיל').toHaveAttribute('data-use', 'active');
  await expect(ld15L, 'הקודם הפך לכתום').toHaveAttribute('data-use', 'opposed');
  await expect(to15L, 'ההמראה המנוגדת ירדה יחד איתו').toHaveAttribute('data-use', 'opposed');

  // 4. כיבוי - לחיצה על הפעיל
  await ld33R.click();
  await expect(ld33R).toHaveAttribute('data-use', 'off');
  await expect(ld15L, 'בלי כיוון בשימוש - אין כתום').toHaveAttribute('data-use', 'off');
});
