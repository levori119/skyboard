import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders, loginToWorkstation } from './helpers';

/**
 * המתג של התמונ"א ב"הגדרות תצוגה".
 *
 * התקלה שדווחה: הצ'קבוקס נראה כמו שאר מתגי התצוגה שלידו ("הצג שמות", "הצג
 * סטטוס") אבל **לא כיבה כלום** - הוא רק פתח וסגר את פאנל ההגדרות. הפקח כיבה
 * אותו והתמונ"א נשארה על המפה, כולל הדגימה מהמאגר כל 2 שניות.
 *
 * הבדיקה בודקת את מה שהפקח עושה: מוריד את הסימון → הקנבס נעלם; מסמן → חוזר;
 * לוחץ על גלגל השיניים → הפאנל נפתח, והתמונ"א **נשארת דלוקה**.
 */
test.describe.configure({ timeout: 240000 });

const API = process.env.E2E_API_URL || 'http://localhost:3001/api';
const STAMP = `__e2e_apx_${Date.now()}`;
const CANVAS = 'canvas[data-air-picture]';

let api: APIRequestContext;
let airfieldId = 0;
let presetId = 0;
let configured = false;

test.beforeAll(async () => {
  api = await playwrightRequest.newContext({ extraHTTPHeaders: await apiAuthHeaders() });

  // התמונ"א דולקת ברמת המערכת? **לא נוגעים בהגדרה הזו** - היא גלובלית וה-DB
  // משותף. אם היא כבויה אין מה לבדוק, והבדיקה מדלגת במקום לשנות מצב לכולם.
  const cfg = await api.get(`${API}/air-picture/admin-config`);
  configured = cfg.ok() && (await cfg.json())?.enabled === true;

  // שדה **מעוגן ובלי מפה** - התצורה שבה התקלה דווחה
  airfieldId = (await (await api.post(`${API}/airfields`, { data: { name: STAMP } })).json()).id;
  await api.put(`${API}/airfields/${airfieldId}/anchors`, {
    data: {
      anchor1_x_img: 54, anchor1_y_img: 32, anchor1_lat: 31.846861, anchor1_lon: 34.818472,
      anchor2_x_img: 77, anchor2_y_img: 58, anchor2_lat: 31.828889, anchor2_lon: 34.838833,
    },
  });

  presetId = (await (await api.post(`${API}/workstation-presets`, {
    data: {
      name: STAMP, preset_role: 'tower', preset_type: 'ground',
      airfield_id: airfieldId, display_mode: 'complex', air_picture_enabled: true,
    },
  })).json()).id;
});

test.afterAll(async () => {
  if (presetId) await api.delete(`${API}/workstation-presets/${presetId}`).catch(() => {});
  if (airfieldId) await api.delete(`${API}/airfields/${airfieldId}`).catch(() => {});
  await api.dispose();
});

test('הצ\'קבוקס מכבה את התמונ"א, וגלגל השיניים פותח את ההגדרות', async ({ page }) => {
  test.skip(!configured, 'התמונ"א כבויה ברמת המערכת - אין מה לבדוק');
  await loginToWorkstation(page, { preset: STAMP });

  // פאנל השכבות פתוח בכניסה לעמדה, ו"הגדרות תצוגה" בתוכו.
  const row = page.locator('label', { hasText: 'תמונ"א' }).first();
  await expect(row).toBeVisible({ timeout: 60000 });

  const box = row.locator('input[type="checkbox"]');
  await expect(box, 'התמונ"א דלוקה בכניסה לעמדה').toBeChecked();
  await expect(page.locator(CANVAS), 'שכבת התמונ"א מרונדרת').toBeAttached({ timeout: 15000 });

  // ── הכיבוי ────────────────────────────────────────────────────────────────
  await box.uncheck();
  await expect(box).not.toBeChecked();
  await expect(page.locator(CANVAS), 'הקנבס ירד מהמפה').toHaveCount(0, { timeout: 10000 });

  // ── ההדלקה חזרה ───────────────────────────────────────────────────────────
  await box.check();
  await expect(page.locator(CANVAS), 'הקנבס חזר').toBeAttached({ timeout: 10000 });

  // ── גלגל השיניים פותח הגדרות ואינו מכבה ──────────────────────────────────
  await page.locator('button[title="הגדרות תמונ\\"א"]').first().click();
  await expect(page.getByText('בהירות', { exact: false }).first()).toBeVisible({ timeout: 10000 });
  await expect(box, 'פתיחת ההגדרות לא כיבתה את התמונ"א').toBeChecked();
  await expect(page.locator(CANVAS)).toBeAttached();
});
