import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders, loginToWorkstation } from './helpers';

// ─── טבלת האלמנטים ───────────────────────────────────────────────────────────
// נפתחת מתפריט "תצוגה" בעמדות המגדל, חוצה את כל שדות בסיס האב, ומאפשרת לערוך
// כשירות וסטטוס תפעולי.
//
// המלכודת שנבדקת כאן במפורש: ה-PUT של אלמנט כותב `x_pct=$5, y_pct=$6` **ללא
// תנאי**. עדכון שאינו שולח קואורדינטות מאפס אותן, והאלמנט נעלם מהמפה - תקלה
// שקטה שאין לה שום סימן ב-UI עד שמישהו מחפש את האלמנט על המפה.

const API = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe.configure({ timeout: 240000 });

let api: APIRequestContext;

test.beforeAll(async () => {
  api = await playwrightRequest.newContext({ extraHTTPHeaders: await apiAuthHeaders() });
});

test.afterAll(async () => { await api.dispose(); });

async function findGroundPreset() {
  const presets = await (await api.get(`${API}/workstation-presets`)).json();
  return (presets as { preset_type: string; name: string; airfield_id: number | null; parent_base_id: number | null }[])
    .find(p => (p.preset_type === 'ground' || p.preset_type === 'ground_mgmt')
      && p.airfield_id && p.parent_base_id && !String(p.name || '').startsWith('__'));
}

test('עדכון כשירות מהטבלה אינו מאבד את מיקום האלמנט על המפה', async () => {
  const preset = await findGroundPreset();
  test.skip(!preset, 'אין עמדת מגדל המשויכת לשדה ולבסיס אב');

  const rows = await (await api.get(`${API}/airfield-elements/by-base/${preset!.parent_base_id}`)).json();
  const placed = (rows as any[]).find(r => r.x_pct != null && r.y_pct != null);
  test.skip(!placed, 'אין אלמנט ממוקם על המפה בבסיס הזה');

  // הטבלה חייבת לקבל את מה שנדרש כדי לשמור בלי להרוס
  expect(placed.x_pct, 'by-base חייב להחזיר קואורדינטות').not.toBeNull();
  expect(placed, 'by-base חייב להחזיר את הסטטוס התפעולי').toHaveProperty('display_state');

  const before = { status: placed.status, x: placed.x_pct, y: placed.y_pct, ds: placed.display_state };
  const flipped = placed.status === 'שמיש' ? 'לא שמיש' : 'שמיש';

  // בדיוק הגוף שהטבלה שולחת
  const save = (status: string) => api.put(`${API}/airfield-elements/${placed.id}`, {
    data: {
      element_type_id: placed.element_type_id, name: placed.name, status,
      note: placed.note, category: placed.category || '',
      x_pct: placed.x_pct, y_pct: placed.y_pct,
      display_state: placed.display_state, blink_rate: placed.blink_rate,
      rotation: placed.rotation ?? 0, hidden_on_map: placed.hidden_on_map,
    },
  });

  try {
    expect((await save(flipped)).ok()).toBe(true);
    const after = await (await api.get(`${API}/airfield-elements?airfield_id=${placed.airfield_id}`)).json();
    const mine = (after as any[]).find(r => r.id === placed.id);
    expect(mine.status, 'הכשירות נשמרה').toBe(flipped);
    expect(mine.x_pct, 'המיקום על המפה לא אבד').toBeCloseTo(before.x, 5);
    expect(mine.y_pct, 'המיקום על המפה לא אבד').toBeCloseTo(before.y, 5);
    expect(mine.display_state, 'הסטטוס התפעולי לא נדרס').toBe(before.ds);
  } finally {
    await save(before.status); // מחזירים את מה שהיה - אלה נתונים חיים
  }
});

test('הטבלה נפתחת מתפריט תצוגה ומסננת', async ({ page }) => {
  const preset = await findGroundPreset();
  test.skip(!preset, 'אין עמדת מגדל המשויכת לשדה ולבסיס אב');

  await loginToWorkstation(page, { preset: preset!.name });
  await page.locator('[data-help="viewMenu"]').click();
  await page.getByTestId('view-menu-elements-table').click();

  const win = page.getByTestId('elements-table-window');
  await expect(win).toBeVisible({ timeout: 20000 });

  const rows = win.locator('[data-testid^="elements-table-row-"]');
  await expect.poll(() => rows.count(), { timeout: 20000 }).toBeGreaterThan(0);
  const total = await rows.count();

  // סינון מצמצם, וניקוי מחזיר - פילטר ששוגה בשקט גרוע מפילטר שאינו קיים
  await win.getByTestId('elements-table-search').fill('__אין_כזה_אלמנט__');
  await expect(rows).toHaveCount(0);
  await win.getByTestId('elements-table-search').fill('');
  await expect(rows).toHaveCount(total);

  // הכשירות נערכת מהטבלה, והבורר מציע בדיוק את מה שהפופאפ שעל המפה מציע
  // מתוך **שורה**, ולא מסרגל הסינון - שם יש בורר נפרד
  const firstStatus = rows.first().locator('[data-testid^="elements-table-status-"]').first();
  await expect(firstStatus).toBeVisible();
  const options = await firstStatus.locator('option').allTextContents();
  expect(options, 'רק שמיש / לא שמיש - בלי הרשימה הישנה').toEqual(
    expect.arrayContaining(['שמיש', 'לא שמיש']));
  expect(options).not.toContain('תקול');
});
