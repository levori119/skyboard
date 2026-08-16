import { test, expect } from '@playwright/test';
import { loginToWorkstation, apiAuthHeaders } from './helpers';

// ─── עריכה בתא של טבלת בן (נקודות מכוון / מטוסים) ─────────────────────────────
//
// **מה נשבר:** מקנפג הגדיר שדה בטבלת הבן כניתן לעריכה בהגדרות מוד הטבלה, ובעמדה
// התא נשאר "–" ולחיצה עליו לא עשתה דבר. הסיבה הייתה שער **שני** בעמדה - נעילת
// כתיבה פר-עמודה, שה-✏️ שלה יושב בכותרת הטבלה הראשית, מגולל הרחק מהטבלה שנפרסה
// מתחת לפ"מ. ההגדרה בניהול היא מקור האמת היחיד, והנעילה הוסרה.
//
// הבדיקה רצה על עמדה **קיימת** ומוד טבלה **קיים** ולא על מתקן שנבנה כאן: היא
// בודקת את ההגדרה שהצוות באמת עובד איתה, ולא קונפיגורציה סינתטית שעשויה
// להתנהג אחרת.

const api = process.env.E2E_API_URL || 'http://localhost:3001/api';

// הטעינה הראשונה מול vite (בנייה קרה של חבילה בת ~4MB) חוצה את 30 השניות
// שבברירת המחדל, והבדיקה נפלה על ה-goto ולא על מה שהיא בודקת.
test.setTimeout(180_000);

const PRESET = 'בת"ק עזה';        // עמדה קיימת שמוד הטבלה שלה הוא "בתחק חזית"
const CALLSIGN = 'E2E-SUBEDIT';

let headers: Record<string, string>;
let stripNum: number;
let presetId: number;

test.beforeAll(async () => {
  headers = await apiAuthHeaders();

  const presets = await fetch(`${api}/workstation-presets`, { headers }).then(r => r.json());
  const preset = (Array.isArray(presets) ? presets : []).find((p: any) => String(p.name).trim() === PRESET);
  expect(preset, `העמדה "${PRESET}" לא נמצאה`).toBeTruthy();
  presetId = preset.id;

  // מוד הטבלה של העמדה חייב לכלול טבלת מטוסים עם שדה שהוגדר לעריכה - אחרת
  // הבדיקה "עוברת" על קונפיגורציה שאין בה מה לבדוק
  const modes = await fetch(`${api}/table-modes`, { headers }).then(r => r.json());
  const mode = (Array.isArray(modes) ? modes : []).find((m: any) => Number(m.id) === Number(preset.table_mode_id));
  expect(mode, 'למוד הטבלה של העמדה').toBeTruthy();
  const acCol = (mode.columns || []).find((c: any) => c.isTable && c.tableKey === 'aircraft');
  expect(acCol, 'עמודת טבלת המטוסים במוד').toBeTruthy();
  expect(
    (acCol.columns || []).some((c: any) => c.key === 'fault_type' && c.editable === 'keyboard'),
    '"מהות התקלה" מוגדר לעריכה במקלדת בהגדרות הטבלה',
  ).toBeTruthy();

  await purge();

  const created = await fetch(`${api}/strips/ground-create`, {
    method: 'POST', headers,
    body: JSON.stringify({ callSign: CALLSIGN, sq: 'T', number_of_formation: 2, workstation_preset_id: presetId }),
  });
  expect(created.ok, 'יצירת הפ"מ').toBeTruthy();
  stripNum = (await created.json()).id;

  // `myTableStrips` נגזר מ-`table_preset_ids`, כלומר משורה ב-strip_table_assignments.
  // `workstation_preset_id` לבדו אינו מעלה את הפ"מ ללוח.
  const asgn = await fetch(`${api}/strip-table-assignments`, {
    method: 'POST', headers,
    body: JSON.stringify({ strip_id: stripNum, preset_id: presetId }),
  });
  expect(asgn.ok, 'שיבוץ הפ"מ לטבלת העמדה').toBeTruthy();
});

test.afterAll(async () => { if (headers) await purge(); });

/** ניקוי שאריות - בלי זה הרצה שנייה נופלת על ההקמה ולא על מה שהיא בודקת */
async function purge() {
  const all = await fetch(`${api}/strips/global`, { headers }).then(r => r.json()).catch(() => []);
  for (const s of (Array.isArray(all) ? all : [])) {
    if (String(s.callSign || '') === CALLSIGN) {
      await fetch(`${api}/strips/${s.id}`, { method: 'DELETE', headers }).catch(() => {});
    }
  }
}

test('טבלת בן: שדה שהוגדר לעריכה בניהול פתוח בעמדה - בלי מתג נעילה', async ({ page }) => {
  await loginToWorkstation(page, { preset: PRESET });

  // פריסת טבלת הבן מה-+ שבשורת הפ"מ
  const row = page.locator('tr', { hasText: CALLSIGN }).first();
  await expect(row).toBeVisible({ timeout: 30000 });
  await row.getByRole('button', { name: /שורות|rows/ }).first().click();

  const subTable = page.locator('tr[data-sub-table-of]').first();
  await expect(subTable).toBeVisible();

  // ── אין מתג נעילה, והתא כבר פתוח ────────────────────────────────────────
  await expect(subTable.getByRole('button', { name: /נעול|Locked/ })).toHaveCount(0);

  // תא פתוח לעריכה מציג "…" (נעול היה מציג "–") - זה הסימן שהעריכה זמינה.
  // הלחיצה היא על ה-span עצמו ולא על ה-td: ה-onClick יושב עליו, ולחיצה על
  // ריפוד התא לא הייתה פותחת דבר.
  const cell = subTable.getByText('…', { exact: true }).first();
  await expect(cell, 'תא של שדה שהוגדר לעריכה חייב להיות פתוח מיד').toBeVisible();
  await cell.click();

  // לא `input` סתם: עמודת "תקלה" היא דגל, וגם היא פתוחה עכשיו - ולכן ה-input
  // הראשון בטבלה הוא ה-checkbox שלה. זו עצמה עדות שגם ענף הדגל השתחרר.
  await expect(subTable.locator('input[type="checkbox"]').first(), 'דגל שהוגדר למתג פתוח אף הוא').toBeVisible();
  const input = subTable.locator('input:not([type="checkbox"])').first();
  await expect(input, 'לחיצה על התא פותחת אותו לעריכה').toBeVisible();

  // ── הערך נשמר על המטוס ──────────────────────────────────────────────────
  await input.fill('מנוע');
  await input.press('Enter');
  await expect(subTable).toContainText('מנוע');

  // הכתיבה אסינכרונית והתצוגה אופטימית, ולכן קריאה מיידית מה-API מקדימה את
  // ה-PUT. poll ולא sleep: הבדיקה נגמרת ברגע שהערך שם, ולא אחרי המתנה קבועה.
  await expect.poll(async () => {
    const saved = await fetch(`${api}/strip-aircraft?strip_ids=s${stripNum}`, { headers })
      .then(r => r.json()).catch(() => []);
    return (Array.isArray(saved) ? saved : []).some((r: any) => r.fault_type === 'מנוע');
  }, { message: 'הערך נכתב ל-strip_aircraft', timeout: 15000 }).toBe(true);
});
