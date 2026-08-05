import { test, expect } from '@playwright/test';
import { apiAuthHeaders, identifyViaMirage, loginToWorkstation, setScreenSize } from './helpers';

// ─── חלונות נתונים בעמדת שדה ─────────────────────────────────────────────────
// הדרישה מהשטח: בעמדת שדה התעופה רוצים "חלונות" שמוגדרים בשאילתא ומראים כמה
// פ"מים עונים עליה - למשל מסוקים שנוחתים אצלי, או מטוסי קרב שזמן הנחיתה
// המתוכנן שלהם קרוב. הבדיקה מכסה את שתי החוליות שקל לשבור:
//   1. `planned_landing_time` עובר את ה-API (יצירה, קריאה, עדכון) - כל INSERT
//      שם עבר מספור פרמטרים מחדש, וטעות שם לא נתפסת ב-tsc.
//   2. חלון שמוגדר על העמדה באמת מרונדר מעל מפת השדה ומראה את הספירה הנכונה.

const API = 'http://localhost:3001/api';
const STAMP = '__DW_E2E';

test.describe.configure({ timeout: 240000 });

const inMinutes = (m: number) => new Date(Date.now() + m * 60000).toISOString();

test.describe('חלונות נתונים', () => {
  let headers: Record<string, string>;
  const stripIds: string[] = [];
  let presetId: number | null = null;
  let presetBackup: unknown = null;

  test.beforeAll(async () => {
    headers = await apiAuthHeaders();
  });

  test.afterAll(async () => {
    for (const id of stripIds) {
      await fetch(`${API}/strips/${id}`, { method: 'DELETE', headers }).catch(() => {});
    }
    if (presetId != null) {
      await fetch(`${API}/workstation-presets/${presetId}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ ...(presetBackup as object), data_windows: [] }),
      }).catch(() => {});
    }
  });

  test('זמן נחיתה מתוכנן נשמר, נקרא ומתעדכן דרך ה-API', async () => {
    const eta = inMinutes(9);
    const create = await fetch(`${API}/strips`, {
      method: 'POST', headers,
      body: JSON.stringify({ callSign: `${STAMP}_A`, sq: '1', planned_landing_time: eta, manual_entry: true }),
    });
    expect(create.ok).toBeTruthy();
    const created = await create.json();
    expect(created.id).toBeTruthy();
    const rawId = String(created.id).replace(/^s/, '');
    stripIds.push(rawId);

    const all = await (await fetch(`${API}/strips/global`, { headers })).json();
    const mine = (all as any[]).find(s => (s.callSign || s.callsign) === `${STAMP}_A`);
    expect(mine, 'הפ"מ שנוצר חוזר מ-/strips/global').toBeTruthy();

    // השעה חוזרת כפי שנשלחה - עמודה בלי אזור זמן הייתה מחזירה זמן מוסט
    const driftMin = Math.abs(new Date(mine.planned_landing_time).getTime() - new Date(eta).getTime()) / 60000;
    expect(driftMin).toBeLessThan(1);

    // עדכון (PUT) - זה המסלול שבו הפקח משנה את הזמן על הכרטיס
    const later = inMinutes(40);
    const upd = await fetch(`${API}/strips/${rawId}`, {
      method: 'PUT', headers, body: JSON.stringify({ planned_landing_time: later }),
    });
    expect(upd.ok).toBeTruthy();
    const after = await (await fetch(`${API}/strips/global`, { headers })).json();
    const updated = (after as any[]).find(s => (s.callSign || s.callsign) === `${STAMP}_A`);
    expect(Math.abs(new Date(updated.planned_landing_time).getTime() - new Date(later).getTime()) / 60000).toBeLessThan(1);

    // ניקוי לערך null - שדה שאפשר להזין אפשר גם למחוק
    await fetch(`${API}/strips/${rawId}`, { method: 'PUT', headers, body: JSON.stringify({ planned_landing_time: null }) });
    const cleared = await (await fetch(`${API}/strips/global`, { headers })).json();
    expect((cleared as any[]).find(s => (s.callSign || s.callsign) === `${STAMP}_A`).planned_landing_time).toBeNull();
  });

  test('הגדרת חלונות נשמרת על העמדה וחוזרת ממנה', async () => {
    const presets = await (await fetch(`${API}/workstation-presets`, { headers })).json();
    const preset = (presets as any[]).find(p => p.preset_type === 'ground' && !String(p.name || '').startsWith('__'));
    test.skip(!preset, 'אין עמדת שדה ב-DB');
    presetId = preset.id;
    presetBackup = preset;

    const windows = [{
      id: 'e2e_w1', title: 'קרב נוחתים בקרוב', mode: 'count', count_by: 'strips',
      x: 60, y: 140, color: '#22c55e', warn_at: null,
      query: { id: 'g', type: 'group', operator: 'all', children: [
        { id: 'l1', type: 'leaf', field: 'callSign', compare: 'contains', value: STAMP },
        { id: 'l2', type: 'leaf', field: 'planned_landing_time', compare: 'lt', value: '15' },
      ]},
    }];

    const put = await fetch(`${API}/workstation-presets/${preset.id}`, {
      method: 'PUT', headers, body: JSON.stringify({ ...preset, data_windows: windows }),
    });
    expect(put.ok, 'שמירת העמדה עם חלונות נתונים').toBeTruthy();

    const cfg = await (await fetch(`${API}/workstation-presets/${preset.id}/config`, { headers })).json();
    expect(Array.isArray(cfg.data_windows)).toBeTruthy();
    expect(cfg.data_windows[0].title).toBe('קרב נוחתים בקרוב');
    expect(cfg.data_windows[0].query.children).toHaveLength(2);
  });

  test('החלון מרונדר מעל מפת השדה וסופר רק את מי שעונה לשאילתא', async ({ page }) => {
    const presets = await (await fetch(`${API}/workstation-presets`, { headers })).json();
    const preset = (presets as any[]).find(p => p.preset_type === 'ground' && !String(p.name || '').startsWith('__'));
    test.skip(!preset, 'אין עמדת שדה ב-DB');
    presetId = preset.id;
    presetBackup = presetBackup || preset;

    // שני פ"מים: אחד נוחת בעוד 8 דקות (נספר), אחד בעוד 90 (לא נספר)
    for (const [suffix, minutes] of [['NEAR', 8], ['FAR', 90]] as [string, number][]) {
      const res = await fetch(`${API}/strips`, {
        method: 'POST', headers,
        body: JSON.stringify({ callSign: `${STAMP}_${suffix}`, sq: '1', planned_landing_time: inMinutes(minutes), manual_entry: true }),
      });
      const j = await res.json();
      if (j.id) stripIds.push(String(j.id).replace(/^s/, ''));
    }

    await fetch(`${API}/workstation-presets/${preset.id}`, {
      method: 'PUT', headers,
      body: JSON.stringify({
        ...preset,
        data_windows: [{
          id: 'e2e_w1', title: 'נוחתים בקרוב', mode: 'count', count_by: 'strips',
          x: 60, y: 160, color: '#22c55e', warn_at: null,
          query: { id: 'g', type: 'group', operator: 'all', children: [
            { id: 'l1', type: 'leaf', field: 'callSign', compare: 'contains', value: STAMP },
            { id: 'l2', type: 'leaf', field: 'planned_landing_time', compare: 'lt', value: '15' },
          ]},
        }],
      }),
    });

    await loginToWorkstation(page, { preset: preset.name });

    const win = page.getByText('נוחתים בקרוב', { exact: true });
    await expect(win).toBeVisible({ timeout: 30000 });
    // הספירה יושבת באותו חלון, מתחת לכותרת
    const box = win.locator('xpath=ancestor::div[1]/following-sibling::div[1]');
    await expect(box).toHaveText('1', { timeout: 15000 });
  });

  test('"נמצא בעמדה" הוא תפריט עמדות ולא הקלדת שם', async ({ page }) => {
    // הבקשה מהשטח: בשאילתא צריך לבחור עמדה מרשימה. שם שמוקלד ביד נשבר בכל
    // שינוי שם עמדה, והמשתמש גם לא יודע אילו עמדות קיימות.
    const presets = await (await fetch(`${API}/workstation-presets`, { headers })).json();
    const ground = (presets as any[]).find(p => p.preset_type === 'ground' && !String(p.name || '').startsWith('__'));
    test.skip(!ground, 'אין עמדת שדה ב-DB');

    await setScreenSize(page);
    await page.goto('/');
    await identifyViaMirage(page);
    await page.getByRole('button', { name: /ניהול מערכת/ }).click();
    await page.getByRole('button', { name: /עמדות/ }).first().click();

    // הרשימה מקובצת לפי בסיס אב וארוכה - מאתרים את השורה לפי השם ומטפסים אל
    // המכל הקרוב שמחזיק את כפתור העריכה שלה
    const nameEl = page.getByText(ground.name, { exact: true }).first();
    await expect(nameEl).toBeVisible({ timeout: 20000 });
    await nameEl.scrollIntoViewIfNeeded();
    await nameEl.locator('xpath=ancestor::div[.//button[normalize-space()="עריכה"]][1]')
      .getByRole('button', { name: 'עריכה' }).first().click();

    // עורך חלונות הנתונים -> חלון חדש -> תנאי חדש
    await page.getByRole('button', { name: /חלון נתונים/ }).click();
    await page.getByRole('button', { name: /הוסף תנאי/ }).first().click();

    // בחירת השדה מתפריט השדות
    const fieldSelect = page.locator('select').filter({ hasText: 'נמצא בעמדה' }).first();
    await fieldSelect.selectOption({ label: 'נמצא בעמדה' });

    // התוצאה: רשימת עמדות לסימון, לא תיבת טקסט חופשי
    const checks = page.locator('input[type="checkbox"]');
    await expect(checks.first()).toBeVisible({ timeout: 10000 });
    expect(await checks.count(), 'התפריט אמור להציג את העמדות הקיימות').toBeGreaterThan(0);
    await expect(page.getByText(ground.name, { exact: true }).last()).toBeVisible();
  });
});
