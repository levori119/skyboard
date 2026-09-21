import { test, expect } from '@playwright/test';
import { loginToWorkstation, apiAuthHeaders } from './helpers';

// ─── תא הגובה במוד טבלה: לחיצה פותחת מקלדת ספרות ─────────────────────────────
//
// גובה הוא ספרות בלבד, והעמדה היא מסך מגע (Cintiq + עט). תיבת טקסט בתא חייבה
// מקלדת פיזית או קליק שני על כפתור ה-⌨, ולכן הלחיצה על התא פותחת את מקלדת
// הספרות עצמה. הכפתור נשאר לצד הערך כסימן מה הלחיצה תפתח.

const api = process.env.E2E_API_URL || 'http://localhost:3001/api';
test.setTimeout(180_000);

const PRESET = 'בת"ק עזה';
const CALLSIGN = 'E2E-ALTPAD';

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
  const altCol = (mode?.columns || []).find((c: any) => (c.key || c.field) === 'alt');
  expect(altCol?.editable, 'עמודת הגובה מוגדרת לעריכה במוד').toBe('keyboard');

  await purge();
  const created = await fetch(`${api}/strips/ground-create`, {
    method: 'POST', headers,
    body: JSON.stringify({ callSign: CALLSIGN, sq: 'T', number_of_formation: 2, workstation_preset_id: presetId }),
  });
  expect(created.ok, 'יצירת הפ"מ').toBeTruthy();
  stripNum = (await created.json()).id;
  await fetch(`${api}/strip-table-assignments`, {
    method: 'POST', headers, body: JSON.stringify({ strip_id: stripNum, preset_id: presetId }),
  });
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

const savedAlt = async () => {
  const all = await fetch(`${api}/strips/global`, { headers }).then(r => r.json()).catch(() => []);
  const mine = (Array.isArray(all) ? all : []).find((s: any) => String(s.id).replace(/^s/, '') === String(stripNum));
  return mine?.alt ?? null;
};

test('גובה: לחיצה על התא פותחת מקלדת ספרות, והאישור שומר', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await loginToWorkstation(page, { preset: PRESET });

  const row = page.locator('tr', { hasText: CALLSIGN }).first();
  await expect(row).toBeVisible({ timeout: 30000 });

  // תא הגובה: הערך + כפתור מקלדת הספרות + קו תחתון שמסמן "אפשר לערוך"
  const cell = row.locator('td', { has: page.getByTitle('פתח מקלדת וירטואלית') }).first();
  await expect(cell).toBeVisible();
  await expect(cell.locator('div').first()).toHaveCSS('border-bottom-style', 'dashed');

  // לחיצה על התא עצמו (לא על הכפתור) - חלונות צפים מכסים חלק מהמסך בהרצה,
  // ולכן הלחיצה נשלחת ישירות לאלמנט
  await cell.locator('div').first().evaluate(el => (el as HTMLElement).click());

  // מקלדת הספרות נפתחה: מקשי הספרות קיימים, ואין תיבת טקסט בתא
  const pad = page.getByTestId('virtual-keyboard');
  await expect(pad, 'לחיצה על התא פותחת את המקלדת').toBeVisible();
  await expect(pad, 'ובמוד ספרות').toHaveAttribute('data-vk-mode', 'numeric');
  await expect(cell.locator('textarea, input'), 'ואין תיבת טקסט בתא').toHaveCount(0);

  for (const d of ['1', '5', '0']) await pad.getByRole('button', { name: d, exact: true }).click();
  await pad.getByRole('button', { name: '✓ אישור' }).click();

  await expect.poll(savedAlt, { message: 'הגובה נשמר על הפ"מ', timeout: 15000 }).toBe('150');
  await expect(cell).toContainText('150');
});
