import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders, loginToWorkstation } from './helpers';

// ─── סגירת מסלול חוצה שדות מקושרים, גם כשהצד הקרקעי אינו מסלול המראה ─────────
//
// הדרישה מהשטח: "סגרתי בתל נוף אווירי את המסלול והוא לא מוצג כסגור בתל נוף
// קרקעי". שני השדות מקושרים בניהול, אבל בשדה הקרקעי אותו אספלט משורטט כ**מסלול
// רגיל** על מפת הקרקע ולא כמסלול המראה - ולכן הגשר שבין שני מסלולי המראה לא חל
// עליו, והפקח בקרקע ראה מסלול פתוח בזמן שהוא סגור באוויר.
//
// הבדיקה מקימה בדיוק את המצב הזה מקצה לקצה: מסלול המראה בשדה נפרד, מסלול רגיל
// בשדה של העמדה, קישור ביניהם, וסגירה בצד האווירי.

const API = 'http://localhost:3001/api';

test.describe.configure({ timeout: 240000 });

// שמות קצרים: `airfield_runways.name` הוא varchar(20)
const SFX = String(Date.now()).slice(-6);
const STAMP = `__e2e_rwlink_${SFX}`;
let api: APIRequestContext;

const created = {
  notamId: 0, groupId: 0, groundRouteId: 0, runwayId: 0, airAirfieldId: 0,
};

test.beforeAll(async () => {
  api = await playwrightRequest.newContext({ extraHTTPHeaders: await apiAuthHeaders() });
});

test.afterAll(async () => {
  if (created.notamId) await api.delete(`${API}/runway-notams/${created.notamId}`);
  if (created.groupId) await api.delete(`${API}/route-link-groups/${created.groupId}`);
  if (created.groundRouteId) await api.delete(`${API}/airfield-routes/${created.groundRouteId}`);
  if (created.runwayId) await api.delete(`${API}/airfield-runways/${created.runwayId}`);
  if (created.airAirfieldId) await api.delete(`${API}/airfields/${created.airAirfieldId}`);
  await api.dispose();
});

async function findGroundPreset() {
  const presets = await (await api.get(`${API}/workstation-presets`)).json();
  return (presets as { preset_type: string; name: string; airfield_id: number | null }[]).find(p =>
    p.preset_type === 'ground' && p.airfield_id && !String(p.name || '').startsWith('__'));
}

test('מסלול קרקעי מצויר כסגור כשהמסלול המקושר נסגר בשדה האווירי', async ({ page }) => {
  const preset = await findGroundPreset();
  test.skip(!preset, 'אין עמדת שדה המשויכת לשדה תעופה ב-DB');
  const groundAfId = preset!.airfield_id as number;

  // ── הצד האווירי: שדה נפרד עם מסלול המראה (שגורר מסלול ראי אוטומטית) ──
  const airAf = await (await api.post(`${API}/airfields`, { data: { name: `${STAMP}_air` } })).json();
  created.airAirfieldId = airAf.id;
  const rw = await (await api.post(`${API}/airfield-runways`, {
    data: { airfield_id: airAf.id, name: `_e2eR${SFX}`, heading_a: '05', heading_b: '23' },
  })).json();
  created.runwayId = rw.id;
  const airRoutes = await (await api.get(`${API}/airfield-routes?airfield_id=${airAf.id}`)).json();
  const mirror = (airRoutes as any[]).find(r => Number(r.source_runway_id) === Number(rw.id));
  expect(mirror, 'מסלול ההמראה מייצר מסלול ראי במסלולי ההסעה').toBeTruthy();

  // ── הצד הקרקעי: מסלול **רגיל** משורטט על מפת השדה של העמדה ──
  const groundRoute = await (await api.post(`${API}/airfield-routes`, {
    data: {
      airfield_id: groundAfId, name: `_e2eG${SFX}`, route_category: 'aircraft', color: '#38bdf8',
      route_path: [{ x: 12, y: 12 }, { x: 88, y: 62 }],
    },
  })).json();
  created.groundRouteId = groundRoute.id;
  expect(groundRoute.source_runway_id, 'הצד הקרקעי אינו מסלול ראי - זה כל העניין').toBeFalsy();

  // ── הקישור: שני הצדדים הם אותו אספלט ──
  const group = await (await api.post(`${API}/route-link-groups`, {
    data: {
      name: STAMP, airfield_id: groundAfId,
      members: [{ route_id: groundRoute.id }, { route_id: mirror.id }],
    },
  })).json();
  created.groupId = group.id;

  // לפני הסגירה - אין מה לצייר
  const before = await (await api.get(`${API}/route-notams?airfield_id=${groundAfId}`)).json();
  expect((before as any[]).filter(n => Number(n.route_id) === Number(groundRoute.id))).toHaveLength(0);

  // ── הסגירה נרשמת בצד האווירי בלבד ──
  const notam = await (await api.post(`${API}/runway-notams`, {
    data: { runway_id: rw.id, notam_type: 'closed' },
  })).json();
  created.notamId = notam.id;

  const after = await (await api.get(`${API}/route-notams?airfield_id=${groundAfId}`)).json();
  const mine = (after as any[]).filter(n => Number(n.route_id) === Number(groundRoute.id));
  expect(mine, 'הסגירה מגיעה למסלול הקרקעי').toHaveLength(1);
  expect(mine[0].notam_type).toBe('closed');
  expect(mine[0].source_airfield_name, 'הפקח רואה מי סגר').toBe(`${STAMP}_air`);

  // ── ובעמדה עצמה: המסלול מצויר כסגור על המפה ──
  await loginToWorkstation(page, { preset: preset!.name });
  await expect(page.locator('#ground-map-area')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId(`route-closed-${groundRoute.id}`))
    .toBeVisible({ timeout: 30000 });
});
