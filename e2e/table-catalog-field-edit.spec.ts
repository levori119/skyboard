import { test, expect } from '@playwright/test';
import { loginToWorkstation, apiAuthHeaders } from './helpers';

// ─── שדה מהקטלוג בתא של מוד הטבלה ────────────────────────────────────────────
//
// "הערה" בעמדת בת"ק עזה אינה עמודה מובנית אלא **שדה מהקטלוג** (strip_field_defs),
// ולכן היא מצוירת ב-StripControl. הדיווח: ENTER אינו שומר, ו-ALT+ENTER אינו יורד
// שורה. הבדיקה רצה על העמדה ומוד הטבלה שהצוות באמת עובד איתם.

const api = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.setTimeout(180_000);

const PRESET = 'בת"ק עזה';
const CALLSIGN = 'E2E-CATFLD';
const FIELD_KEY = 'custom_1777440115846'; // "הערה"

let headers: Record<string, string>;
let stripNum: number;
let presetId: number;

test.beforeAll(async () => {
  headers = await apiAuthHeaders();
  const presets = await fetch(`${api}/workstation-presets`, { headers }).then(r => r.json());
  const preset = (Array.isArray(presets) ? presets : []).find((p: any) => String(p.name).trim() === PRESET);
  expect(preset, `העמדה "${PRESET}" לא נמצאה`).toBeTruthy();
  presetId = preset.id;

  const modes = await fetch(`${api}/table-modes`, { headers }).then(r => r.json());
  const mode = (Array.isArray(modes) ? modes : []).find((m: any) => Number(m.id) === Number(preset.table_mode_id));
  expect((mode?.columns || []).some((c: any) => (c.key || c.field) === FIELD_KEY), 'עמודת "הערה" במוד').toBeTruthy();

  await purge();
  const created = await fetch(`${api}/strips/ground-create`, {
    method: 'POST', headers,
    body: JSON.stringify({ callSign: CALLSIGN, sq: 'T', number_of_formation: 2, workstation_preset_id: presetId }),
  });
  expect(created.ok, 'יצירת הפ"מ').toBeTruthy();
  stripNum = (await created.json()).id;
  const asgn = await fetch(`${api}/strip-table-assignments`, {
    method: 'POST', headers, body: JSON.stringify({ strip_id: stripNum, preset_id: presetId }),
  });
  expect(asgn.ok, 'שיבוץ הפ"מ לטבלת העמדה').toBeTruthy();
});

test.afterAll(async () => { if (headers) await purge(); });

async function purge() {
  const all = await fetch(`${api}/strips/global`, { headers }).then(r => r.json()).catch(() => []);
  for (const s of (Array.isArray(all) ? all : [])) {
    if (String(s.callSign || '') === CALLSIGN) {
      await fetch(`${api}/strips/${s.id}`, { method: 'DELETE', headers }).catch(() => {});
    }
  }
}

const savedValue = async () => {
  const all = await fetch(`${api}/strips/global`, { headers }).then(r => r.json()).catch(() => []);
  // מזהה הפ"מ חוזר מה-API עם קידומת (`s3924`), ולכן Number() עליו הוא NaN
  const mine = (Array.isArray(all) ? all : []).find((s: any) => String(s.id).replace(/^s/, '') === String(stripNum));
  return (mine?.custom_fields || {})[FIELD_KEY] ?? null;
};

test('שדה מהקטלוג בטבלה: ENTER שומר, ALT+ENTER יורד שורה', async ({ page }) => {
  await loginToWorkstation(page, { preset: PRESET });

  const row = page.locator('tr', { hasText: CALLSIGN }).first();
  await expect(row).toBeVisible({ timeout: 30000 });

  const cell = row.locator(`[data-strip-control="${FIELD_KEY}"]`).first();
  await expect(cell, 'התא של "הערה" מרונדר בשורה').toBeVisible();

  // העמודות המקובעות דביקות וחלונות צפים מכסים חלק מהטבלה בחלון הבדיקה, ולכן
  // הלחיצה נשלחת ישירות לאלמנט וההקלדה למקלדת. זו מגבלת הרצה, לא התנהגות המוצר.
  const openCell = async () => {
    await cell.evaluate(el => { el.scrollIntoView({ block: 'center', inline: 'center' }); (el as HTMLElement).click(); });
    const ed = cell.locator('input, textarea').first();
    await expect(ed, 'לחיצה פותחת את השדה לעריכה').toBeVisible();
    await ed.evaluate((el: HTMLInputElement) => el.focus());
    return ed;
  };

  // ── ENTER שומר ──────────────────────────────────────────────────────────
  await openCell();
  await page.keyboard.type('שמור אותי');
  await page.keyboard.press('Enter');

  await expect.poll(savedValue, { message: 'הערך נשמר ל-custom_fields', timeout: 15000 })
    .toBe('שמור אותי');
  await expect(cell).toContainText('שמור אותי');

  // ── ALT+ENTER יורד שורה ─────────────────────────────────────────────────
  const ed2 = await openCell();
  await ed2.evaluate((el: HTMLInputElement | HTMLTextAreaElement) => { el.value = ''; });
  await page.keyboard.type('שורה א');
  await page.keyboard.press('Alt+Enter');
  await page.keyboard.type('שורה ב');
  await page.keyboard.press('Enter');

  await expect.poll(savedValue, { message: 'שתי השורות נשמרו', timeout: 15000 })
    .toBe('שורה א\nשורה ב');
});

test('תא רב-שורתי נעצר ב-3 שורות ונגלל, ולא מותח את שורת הפ"מ', async ({ page }) => {
  // שבע שורות בשדה - בלי תקרה התא היה מותח את כל שורת הפ"מ וגורר איתו את שאר העמודות
  const many = Array.from({ length: 7 }, (_, i) => `שורה ${i + 1}`).join('\n');
  const put = await fetch(`${api}/strips/s${stripNum}/control-field`, {
    method: 'PUT', headers, body: JSON.stringify({ control_key: FIELD_KEY, value: many }),
  });
  expect(put.ok, 'הזנת ערך רב-שורתי').toBeTruthy();

  await loginToWorkstation(page, { preset: PRESET });
  const row = page.locator('tr', { hasText: CALLSIGN }).first();
  await expect(row).toBeVisible({ timeout: 30000 });
  const cell = row.locator(`[data-strip-control="${FIELD_KEY}"]`).first();
  await expect(cell).toContainText('שורה 1');

  const box = await cell.evaluate(el => ({
    client: el.clientHeight,
    scroll: el.scrollHeight,
    line: parseFloat(getComputedStyle(el).lineHeight),
  }));
  expect(box.scroll, 'התוכן ארוך מהתא - כלומר התא נגלל').toBeGreaterThan(box.client);
  expect(box.client, 'הגובה הנראה אינו עובר שלוש שורות').toBeLessThanOrEqual(box.line * 3 + 2);
});
