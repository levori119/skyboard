import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders, loginToWorkstation } from './helpers';

// ─── שדה שנבנה בלי מפת רקע (שרטוט סכמטי בלבד) ────────────────────────────────
// כל שכבות המפה בעמדה ממוקמות לפי גבולות התמונה המרונדרת (`imgBounds`). כשאין
// תמונה הגבולות היו `null`, ולכן **שום שכבה לא רונדרה**: המסלולים וההקפות היו
// ב-DB והמסך נשאר ריק. עכשיו המשטח הסכמטי (4:3, כמו בעמדת הניהול) הוא המפה.

// עמדת שדה טוענת מפה, אלמנטים, מסלולים ו-NOTAMים - הכניסה איטית מברירת המחדל.
test.describe.configure({ timeout: 240000 });

const API = process.env.E2E_API_URL || 'http://localhost:3001/api';
const STAMP = `__e2e_schem_${Date.now()}`;

let api: APIRequestContext;
let airfieldId = 0;
let presetId = 0;

test.beforeAll(async () => {
  api = await playwrightRequest.newContext({ extraHTTPHeaders: await apiAuthHeaders() });

  // שדה **בלי** map_id - זה כל העניין
  airfieldId = (await (await api.post(`${API}/airfields`, { data: { name: STAMP } })).json()).id;

  // מסלול המראה עם קואורדינטות -> יוצר גם את מסלול הראי ב"מסלולי הסעה"
  await api.post(`${API}/airfield-runways`, {
    data: {
      airfield_id: airfieldId, name: '31/13', heading_a: '31', heading_b: '13',
      start_x_pct: 20, start_y_pct: 80, end_x_pct: 80, end_y_pct: 20,
    },
  });
  // מסלול הסעה מצויר
  await api.post(`${API}/airfield-routes`, {
    data: {
      airfield_id: airfieldId, name: `${STAMP}_taxi`, route_category: 'aircraft',
      route_path: [{ x: 10, y: 60 }, { x: 50, y: 55 }, { x: 70, y: 30 }],
    },
  });

  presetId = (await (await api.post(`${API}/workstation-presets`, {
    data: { name: STAMP, preset_role: 'tower', preset_type: 'ground', airfield_id: airfieldId, display_mode: 'complex' },
  })).json()).id;
});

test.afterAll(async () => {
  if (presetId) await api.delete(`${API}/workstation-presets/${presetId}`);
  if (airfieldId) await api.delete(`${API}/airfields/${airfieldId}`);
  await api.dispose();
});

test('עמדה על שדה בלי מפת רקע - המשטח הסכמטי והשכבות מרונדרים', async ({ page }) => {
  await loginToWorkstation(page, { preset: STAMP });

  const canvas = page.getByTestId('ground-schematic-canvas');
  await expect(canvas, 'משטח הציור הסכמטי מחליף את תמונת הרקע').toBeVisible({ timeout: 30000 });

  // המשטח ביחס 4:3 - אותו יחס שבו צוירו האחוזים בעמדת הניהול
  const box = await canvas.boundingBox();
  expect(box, 'למשטח יש מידות בפועל').toBeTruthy();
  expect(box!.width / box!.height, 'יחס 4:3').toBeCloseTo(4 / 3, 1);

  // ומעליו באמת יושבת שכבת המסלולים - זה מה שנעדר קודם
  const runwayLayer = page.getByTestId('runway-layer');
  await expect(runwayLayer, 'שכבת מסלולי ההמראה מרונדרת מעל המשטח').toBeVisible({ timeout: 15000 });
  const layerBox = await runwayLayer.boundingBox();
  expect(layerBox!.width, 'לשכבה יש שטח בפועל, לא אפס').toBeGreaterThan(10);

  // ההודעה "אין מפה מוגדרת" שייכת לשדה **ריק**, לא לשדה סכמטי
  await expect(page.getByText(/אין מפה מוגדרת|No map defined/)).toHaveCount(0);
});
