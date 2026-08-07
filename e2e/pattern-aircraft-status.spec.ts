import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders, loginToWorkstation } from './helpers';

// ─── מטוס על ההקפה לפי סטטוס הטיסה ───────────────────────────────────────────
// הדרישות מהשטח: מטוס בנקודת ירוקים יוצג על נקודת הירוקים · מטוס בנחיתה יוצג
// על צלע הפיינל של אותו מסלול · מטוס שנחת יורד מההקפה.
//
// הבדיקה עובדת על השדה האמיתי של העמדה ומחזירה את המצב לקדמותו, כי סטטוס טיסה
// הוא מידע תפעולי משותף.

const API = 'http://localhost:3001/api';

let api: APIRequestContext;

test.describe.configure({ timeout: 240000 });

test.beforeAll(async () => {
  api = await playwrightRequest.newContext({ extraHTTPHeaders: await apiAuthHeaders() });
});

async function findGroundPreset() {
  const presets = await (await api.get(`${API}/workstation-presets`)).json();
  return (presets as { preset_type: string; name: string; airfield_id: number | null }[]).find(p =>
    p.preset_type === 'ground' && p.airfield_id && !String(p.name || '').startsWith('__'));
}

/**
 * מטוס על הקפה. אם אין כזה - **זורעים** אחד, כדי שהבדיקה תאמת את הקוד ולא את
 * מצב ה-DB באותו רגע. מה שנזרע מנוקה ב-afterAll.
 */
const seeded: { sid: number | string; idx: number }[] = [];

async function aircraftOnPattern(afId: number) {
  const rows = await (await api.get(`${API}/joining-point-strips?airfield_id=${afId}`)).json();
  const list = (Array.isArray(rows?.aircraft) ? rows.aircraft : Array.isArray(rows) ? rows : []) as any[];
  const existing = list.find((a: any) => a.pattern_id != null);
  if (existing) return { strip_id: existing.strip_id, aircraft_idx: existing.aircraft_idx };

  const patterns = await (await api.get(`${API}/airfield-patterns?airfield_id=${afId}`)).json();
  if (!patterns.length) return null;
  const strips = await (await api.get(`${API}/strips`)).json();
  const strip = (Array.isArray(strips) ? strips : []).find((x: any) => !String(x.callsign || '').startsWith('__'));
  if (!strip) return null;

  await api.put(`${API}/joining-point-aircraft/${strip.id}/1`, {
    data: { pattern_id: patterns[0].id, pattern_frac: 0.5, runway_ident: patterns[0].runway_ident || '', in_pattern: false },
  });
  seeded.push({ sid: strip.id, idx: 1 });
  return { strip_id: strip.id, aircraft_idx: 1 };
}

test.afterAll(async () => {
  for (const { sid, idx } of seeded) {
    await api.put(`${API}/strip-aircraft/${sid}/${idx}/flight-status`, { data: { flight_status: 'none' } }).catch(() => undefined);
    await api.put(`${API}/joining-point-aircraft/${sid}/${idx}`, { data: { pattern_id: null, pattern_frac: null, runway_ident: '', in_pattern: false } }).catch(() => undefined);
  }
});

const setStatus = (stripId: number | string, idx: number, status: string) =>
  api.put(`${API}/strip-aircraft/${stripId}/${idx}/flight-status`, { data: { flight_status: status } });

test('סטטוס טיסה מזיז את המטוס בין צלעות ההקפה, ומוריד אותו כשנחת', async ({ page }) => {
  const preset = await findGroundPreset();
  test.skip(!preset, 'אין עמדת שדה המשויכת לשדה תעופה ב-DB');
  const ac = await aircraftOnPattern(preset!.airfield_id as number);
  test.skip(!ac, 'אין בשדה הקפה או פ"מ שאפשר לזרוע עליה');
  const { strip_id: sid, aircraft_idx: idx } = ac!;
  const chip = page.locator(`[data-testid="pattern-aircraft"][data-strip-id="${sid}"][data-aircraft-idx="${idx}"]`);

  await setStatus(sid, idx, 'none');
  await loginToWorkstation(page, { preset: preset!.name });
  await expect(page.locator('#ground-map-area')).toBeVisible({ timeout: 40000 });
  await expect(chip, 'ממתין - מוצג על ההקפה').toHaveCount(1, { timeout: 60000 });
  const onDownwind = (await chip.boundingBox())!;

  // אישור נחיתה -> עובר לפיינל, כלומר זז ממקומו
  await setStatus(sid, idx, 'cleared_to_land');
  await expect.poll(async () => {
    const b = await chip.boundingBox();
    return b ? Math.hypot(b.x - onDownwind.x, b.y - onDownwind.y) : 0;
  }, { timeout: 60000, message: 'אישור נחיתה מעביר את המטוס לפיינל' }).toBeGreaterThan(10);

  // נחת -> יורד מההקפה
  await setStatus(sid, idx, 'landed');
  await expect(chip, 'נחת - יורד מההקפה').toHaveCount(0, { timeout: 60000 });

  await setStatus(sid, idx, 'none');
  await expect(chip, 'ביטול הסטטוס מחזיר אותו').toHaveCount(1, { timeout: 60000 });
});

test('מטוס בסטטוס ירוקים מוצמד לנקודת הירוקים של השדה', async ({ page }) => {
  const preset = await findGroundPreset();
  test.skip(!preset, 'אין עמדת שדה המשויכת לשדה תעופה ב-DB');
  const afId = preset!.airfield_id as number;

  const points = await (await api.get(`${API}/airfields/${afId}/points`)).json();
  const greens = points.find((p: { point_type?: string; name?: string }) =>
    p.point_type === 'greens' || /ירוק/.test(String(p.name || '')));
  test.skip(!greens, 'אין בשדה נקודת ירוקים - נקבעת בעמדת הניהול (סוג נקודה "נקודת ירוקים")');

  const ac = await aircraftOnPattern(afId);
  test.skip(!ac, 'אין מטוס שאפשר להעביר לסטטוס ירוקים');
  const { strip_id: sid, aircraft_idx: idx } = ac!;

  await setStatus(sid, idx, 'greens');
  await loginToWorkstation(page, { preset: preset!.name });
  await expect(page.locator('#ground-map-area')).toBeVisible({ timeout: 40000 });

  // המטוס יושב על נקודת הירוקים: השבב שלו נמצא בקרבת הנקודה שעל המפה
  const pin = page.locator(`[data-airfield-point-id="${greens.id}"]`);
  await expect(pin).toBeVisible({ timeout: 40000 });
  const pinBox = (await pin.boundingBox())!;
  const chip = page.locator(`[data-testid^="ground-ac-"][data-strip-id="${sid}"]`).first();
  await expect(chip).toBeVisible({ timeout: 40000 });
  const chipBox = (await chip.boundingBox())!;
  expect(Math.abs(chipBox.x - pinBox.x), 'השבב מעל נקודת הירוקים').toBeLessThan(120);

  await setStatus(sid, idx, 'none');
});
