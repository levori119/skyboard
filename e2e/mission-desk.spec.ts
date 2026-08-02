import { test, expect } from '@playwright/test';
import { identifyViaMirage, pickWorkstation, setScreenSize } from './helpers';

// ─── דסק משימה כללי — בדיקת קצה-לקצה ─────────────────────────────────────────
// יוצר דרך ה-API דסק עם 3 שירותים ופריסה, עמדה מסוג mission_desk שמצביעה עליו,
// נכנס לעמדה ומוודא שהדסק עולה עם שלושת השירותים. מנקה אחריו.

const API = 'http://localhost:3001/api';

// שני דפים + כניסה מחדש, וכל כניסה מריצה את מסך העמדה המלא (SectorDashboard)
// עם קנבס הדסק במרכז — יותר מ-30ש' ברירת המחדל.
test('עמדת דסק משימה כללי — הדסק עולה עם השירותים', async ({ page, request }) => {
  test.setTimeout(120000);
  // ── ניקוי שאריות מהרצות קודמות שנקטעו (timeout מדלג על finally) ────────
  const oldPresets = await (await request.get(`${API}/workstation-presets`)).json();
  for (const p of oldPresets.filter((x: any) => x.name === '__דסק_E2E' || x.name === '__דסק_E2E_ב')) {
    await request.delete(`${API}/workstation-presets/${p.id}`);
  }
  const oldDesks = await (await request.get(`${API}/mission-desks`)).json();
  for (const d of oldDesks.filter((x: any) => x.name === 'דסק E2E')) {
    await request.delete(`${API}/mission-desks/${d.id}`);
  }

  // ── הקמה דרך ה-API ──────────────────────────────────────────────────────
  const desk = await (await request.post(`${API}/mission-desks`, { data: { name: 'דסק E2E' } })).json();
  const svcButtons = await (await request.post(`${API}/mission-desks/${desk.id}/services`, {
    data: { service_type: 'buttons', name: 'אמצעי E2E' },
  })).json();
  const svcInk = await (await request.post(`${API}/mission-desks/${desk.id}/services`, {
    data: { service_type: 'freetext', name: 'רישום E2E', config: { ruled: true, lineGap: 34, title: 'רישום' } },
  })).json();
  const svcTable = await (await request.post(`${API}/mission-desks/${desk.id}/services`, {
    data: {
      service_type: 'table', name: 'מעקב E2E',
      config: {
        columns: [
          { key: 'entity', title: 'ישות', type: 'text' },
          { key: 'qty', title: 'כמות', type: 'number' },
        ],
        computed: [], rules: [], summary: { qty: 'sum' }, allowAddRows: true, initialRows: 2,
      },
    },
  })).json();
  await request.put(`${API}/mission-desks/${desk.id}`, {
    data: {
      layout_json: {
        id: 'r', type: 'split', direction: 'h', sizes: [40, 60],
        children: [
          { id: 'l1', type: 'leaf', service_id: svcButtons.id },
          {
            id: 's2', type: 'split', direction: 'v', sizes: [50, 50],
            children: [
              { id: 'l2', type: 'leaf', service_id: svcInk.id },
              { id: 'l3', type: 'leaf', service_id: svcTable.id },
            ],
          },
        ],
      },
    },
  });
  const preset = await (await request.post(`${API}/workstation-presets`, {
    data: { name: '__דסק_E2E', preset_type: 'mission_desk', mission_desk_id: desk.id },
  })).json();
  // עמדה שנייה — יעד להתראה מתפרצת
  const presetB = await (await request.post(`${API}/workstation-presets`, {
    data: { name: '__דסק_E2E_ב', preset_type: 'mission_desk', mission_desk_id: desk.id },
  })).json();

  try {
    // ── כניסה לעמדה ──────────────────────────────────────────────────────
    await setScreenSize(page);
    await page.goto('/');
    await identifyViaMirage(page);
    await page.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();
    await pickWorkstation(page, '__דסק_E2E');
    const skip = page.getByRole('button', { name: /^דלג$|^Skip$/ });
    if (await skip.isVisible().catch(() => false)) await skip.click();

    // ── הדסק עלה: שם הדסק ושלושת השירותים ─────────────────────────────────
    await expect(page.getByText('דסק E2E')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('אמצעי E2E')).toBeVisible();
    await expect(page.getByText('רישום E2E')).toBeVisible();
    await expect(page.getByText('מעקב E2E')).toBeVisible();

    // הטבלה החכמה: כותרות עמודות + שורת סיכום
    await expect(page.getByRole('columnheader', { name: 'ישות' })).toBeVisible();
    await expect(page.getByText(/סכום:/)).toBeVisible();

    // אין גלישה אופקית (שבירת פריסה)
    const overflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollW - overflow.clientW).toBeLessThan(30);

    // ── ספליטר: גרירה משנה את חלוקת האזורים ונשמרת מקומית ─────────────────
    const splitter = page.getByTitle('גרור לשינוי חלוקת האזורים').first();
    const sb = (await splitter.boundingBox())!;
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.mouse.down();
    await page.mouse.move(sb.x + sb.width / 2 - 80, sb.y + sb.height / 2, { steps: 5 });
    await page.mouse.up();
    const splitSaved = await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('bt-md-splits-')));
    expect(splitSaved).toBe(true);

    await page.screenshot({ path: 'e2e/__screenshots__/mission-desk.png', fullPage: false });

    // ── עמדה ב' נכנסת בדף שני (polling פעיל) — יעד ההתראה המתפרצת ──────────
    const pageB = await page.context().newPage();
    await setScreenSize(pageB);
    await pageB.goto('/');
    await identifyViaMirage(pageB);
    await pageB.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();
    await pickWorkstation(pageB, '__דסק_E2E_ב');
    const skipB = pageB.getByRole('button', { name: /^דלג$|^Skip$/ });
    if (await skipB.isVisible().catch(() => false)) await skipB.click();
    await expect(pageB.getByText('דסק E2E')).toBeVisible({ timeout: 20000 });

    // ── אינטראקציה 1: כפתור פעולה ➕ (מסך מגע — בלי קליק ימני) → צור כפתור
    //    (+ התראה לעמדה ב' במצב "פעיל") ──
    await page.getByRole('button', { name: /צור כפתור/ }).click();
    await expect(page.getByRole('heading', { name: 'עריכת כפתור' })).toBeVisible();
    const stateB = page.locator('details').nth(1); // המצב השני — "פעיל"
    await stateB.locator('summary').click();
    await stateB.getByText('__דסק_E2E_ב').click();
    await page.getByRole('button', { name: 'שמור', exact: true }).click();
    const newBtn = page.getByText('אמצעי חדש');
    await expect(newBtn).toBeVisible();
    await expect(page.getByText('לא פעיל')).toBeVisible();

    // ── אינטראקציה 2: לחיצה על הכפתור → המצב מתחלף + התראה מתפרצת אצל ב' ──
    await newBtn.click();
    await expect(page.getByText('פעיל', { exact: true })).toBeVisible();
    await expect(pageB.getByText(/אמצעי חדש: פעיל/)).toBeVisible({ timeout: 12000 });
    await pageB.screenshot({ path: 'e2e/__screenshots__/mission-desk-toast.png', fullPage: false });
    await pageB.close();

    // ── אינטראקציה 2.5: כפתור שני נוצר באותו אזור — הסידור האוטומטי מפריד ──
    await page.getByRole('button', { name: /צור כפתור/ }).click();
    await page.getByRole('heading', { name: 'עריכת כפתור' }).waitFor();
    await page.getByRole('button', { name: 'שמור', exact: true }).click();
    await page.waitForTimeout(500); // מרווח ל-settle (rAF + save)
    const btnEls = page.locator('[data-btn-id]');
    await expect(btnEls).toHaveCount(2);
    const r1 = (await btnEls.nth(0).boundingBox())!;
    const r2 = (await btnEls.nth(1).boundingBox())!;
    const overlap = r1.x < r2.x + r2.width && r2.x < r1.x + r1.width &&
                    r1.y < r2.y + r2.height && r2.y < r1.y + r1.height;
    expect(overlap).toBe(false);

    // ── אינטראקציה 3: הקלדה בטבלה → הסיכום מתעדכן ─────────────────────────
    const qtyInputs = page.locator('table input[type="number"]');
    await qtyInputs.first().fill('7');
    await qtyInputs.nth(1).fill('3');
    await expect(page.getByText('סכום: 10')).toBeVisible({ timeout: 12000 });

    // ── אינטראקציה 3.5: ציור דיו בחלון הטקסט החופשי → strokes נשמרים ב-DB ──
    const canvas = page.locator('canvas');
    const cbox = (await canvas.boundingBox())!;
    await page.mouse.move(cbox.x + 30, cbox.y + 30);
    await page.mouse.down();
    await page.mouse.move(cbox.x + 120, cbox.y + 60, { steps: 8 });
    await page.mouse.move(cbox.x + 200, cbox.y + 40, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const st = await (await request.get(`${API}/mission-desk-state?preset_id=${preset.id}`)).json();
        const ink = st.find((r: any) => r.service_id === svcInk.id);
        return ink?.state?.strokes?.length || 0;
      }, { timeout: 8000 })
      .toBeGreaterThan(0);

    // ── אינטראקציה 4: כניסה מחדש — הכל שרד (state נשמר ב-DB) ──────────────
    // (רענון תמיד חוזר ל-LOGIN — התנהגות קיימת בכל העמדות)
    await page.waitForTimeout(700); // מרווח ל-PUT האחרון
    await page.reload();
    await identifyViaMirage(page);
    await page.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();
    await pickWorkstation(page, '__דסק_E2E');
    const skip2 = page.getByRole('button', { name: /^דלג$|^Skip$/ });
    if (await skip2.isVisible().catch(() => false)) await skip2.click();
    await expect(page.getByText('דסק E2E')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('אמצעי חדש')).toHaveCount(2); // שני הכפתורים שרדו
    await expect(page.getByText('פעיל', { exact: true })).toBeVisible();
    await expect(page.getByText('סכום: 10')).toBeVisible();

    // ── אימות Event Log: שינוי מצב הכפתור נרשם ───────────────────────────
    const logs = await (await request.get(`${API}/activity-log?limit=50`)).json();
    const logRows = Array.isArray(logs) ? logs : (logs.rows || logs.entries || []);
    const hasBtnLog = JSON.stringify(logRows).includes('mission_desk_button_state_changed');
    expect(hasBtnLog).toBe(true);
  } finally {
    // ── ניקוי ────────────────────────────────────────────────────────────
    await request.delete(`${API}/workstation-presets/${preset.id}`);
    await request.delete(`${API}/workstation-presets/${presetB.id}`);
    await request.delete(`${API}/mission-desks/${desk.id}`);
  }
});

test('עמדת דסק - סדר האזורים בעמדה זהה למסך ההגדרה (RTL)', async ({ page, request }) => {
  // רגרסיה: קנבס הדסק בעמדה יושב בתוך המְכל המבני של SectorDashboard שמוגדר
  // dir="ltr" (הפריסה של עמדת הבקר תוכננה ל-LTR), ולכן סדר האזורים בעמדה יצא
  // הפוך ממה שמוגדר בניהול (שם הדסק יורש את ה-RTL של השורש). האזור הראשון
  // בפריסה חייב להופיע בצד ימין - בשני ההקשרים.
  const oldPresets = await (await request.get(`${API}/workstation-presets`)).json();
  for (const p of oldPresets.filter((x: any) => x.name === '__דסק_E2E_rtl')) {
    await request.delete(`${API}/workstation-presets/${p.id}`);
  }
  const oldDesks = await (await request.get(`${API}/mission-desks`)).json();
  for (const d of oldDesks.filter((x: any) => x.name === 'דסק rtl E2E')) {
    await request.delete(`${API}/mission-desks/${d.id}`);
  }

  const desk = await (await request.post(`${API}/mission-desks`, { data: { name: 'דסק rtl E2E' } })).json();
  const first = await (await request.post(`${API}/mission-desks/${desk.id}/services`, {
    data: { service_type: 'buttons', name: 'אזור ראשון' },
  })).json();
  const second = await (await request.post(`${API}/mission-desks/${desk.id}/services`, {
    data: { service_type: 'buttons', name: 'אזור שני' },
  })).json();
  await request.put(`${API}/mission-desks/${desk.id}`, {
    data: {
      layout_json: {
        id: 'r', type: 'split', direction: 'h', sizes: [50, 50],
        children: [
          { id: 'l1', type: 'leaf', service_id: first.id },
          { id: 'l2', type: 'leaf', service_id: second.id },
        ],
      },
    },
  });
  const preset = await (await request.post(`${API}/workstation-presets`, {
    data: { name: '__דסק_E2E_rtl', preset_type: 'mission_desk', mission_desk_id: desk.id },
  })).json();

  try {
    await setScreenSize(page);
    await page.goto('/');
    await identifyViaMirage(page);
    await page.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();
    await pickWorkstation(page, '__דסק_E2E_rtl');
    const skip = page.getByRole('button', { name: /^דלג$|^Skip$/ });
    if (await skip.isVisible().catch(() => false)) await skip.click();

    await expect(page.getByText('אזור ראשון')).toBeVisible({ timeout: 20000 });

    // הכיווניות של הקנבס נקבעת בדסק עצמו ולא נגררת מהמכל שמסביב
    const canvasDir = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="mission-desk-canvas"]');
      return el ? getComputedStyle(el).direction : null;
    });
    expect(canvasDir).toBe('rtl');

    // האזור הראשון בפריסה - בצד ימין (כמו במסך ההגדרה)
    const a = (await page.getByText('אזור ראשון').boundingBox())!;
    const b = (await page.getByText('אזור שני').boundingBox())!;
    expect(a.x).toBeGreaterThan(b.x);
  } finally {
    await request.delete(`${API}/workstation-presets/${preset.id}`);
    await request.delete(`${API}/mission-desks/${desk.id}`);
  }
});

test('מסך ניהול — tab דסקי משימה: יצירת דסק, שירות ופריסה', async ({ page, request }) => {
  // ניקוי שאריות
  const oldDesks = await (await request.get(`${API}/mission-desks`)).json();
  for (const d of oldDesks.filter((x: any) => x.name === 'דסק אדמין E2E')) {
    await request.delete(`${API}/mission-desks/${d.id}`);
  }

  try {
    // כניסה למסך הניהול (איש צוות אדמין → "ניהול מערכת")
    await setScreenSize(page);
    await page.goto('/');
    await identifyViaMirage(page);
    await page.getByRole('button', { name: /ניהול מערכת/ }).click();

    // tab דסקי משימה
    await page.getByRole('button', { name: 'דסקי משימה' }).click();
    await expect(page.getByText('דסקי משימה כלליים')).toBeVisible();

    // יצירת דסק
    await page.getByPlaceholder('שם דסק חדש...').fill('דסק אדמין E2E');
    await page.getByRole('button', { name: '＋' }).click();
    // timeout מוגדל — יצירת הדסק היא round-trip ל-DB שעלול להיות איטי תחת עומס
    await expect(page.getByText('שירותים בדסק')).toBeVisible({ timeout: 15000 });

    // הוספת שירות טבלה + פריסה ושיוך
    await page.getByRole('button', { name: /📊 טבלה/ }).click();
    await expect(page.getByText('💡 כפתורי האמצעים')).toHaveCount(0); // אין שירות אמצעים
    await page.getByRole('button', { name: /התחל פריסה/ }).click();
    await page.getByRole('button', { name: '⟺' }).first().click();  // פיצול אופקי
    // שיוך שירות לאזור הראשון דרך ה-select
    const leafSelect = page.locator('select').filter({ hasText: 'ללא שירות' }).first();
    await leafSelect.selectOption({ index: 1 });

    // שמירה
    await page.getByRole('button', { name: /שמור דסק/ }).click();
    await expect(page.getByText('✓ נשמר')).toBeVisible();

    // אימות ב-API: הפריסה נשמרה עם שיוך שירות
    const desks = await (await request.get(`${API}/mission-desks`)).json();
    const saved = desks.find((d: any) => d.name === 'דסק אדמין E2E');
    expect(saved).toBeTruthy();
    expect(saved.layout_json?.type).toBe('split');
    expect(saved.services.length).toBe(1);
    const leafIds = JSON.stringify(saved.layout_json);
    expect(leafIds).toContain(String(saved.services[0].id));

    await page.screenshot({ path: 'e2e/__screenshots__/mission-desk-admin.png', fullPage: false });
  } finally {
    const desks = await (await request.get(`${API}/mission-desks`)).json();
    for (const d of desks.filter((x: any) => x.name === 'דסק אדמין E2E')) {
      await request.delete(`${API}/mission-desks/${d.id}`);
    }
  }
});

test('עמדת דסק שנוצרה אחרי טעינת הדף — עולה קנבס הדסק ולא מוד טבלאי', async ({ page, request }) => {
  // רגרסיה: רשימת ה-presets ב-App נטענה פעם אחת ב-mount; עמדה שנוצרה בזמן שהדף
  // פתוח לא זוהתה כ-mission_desk וההתחברות נפלה ל-SectorDashboard (מוד טבלאי).
  const oldPresets = await (await request.get(`${API}/workstation-presets`)).json();
  for (const p of oldPresets.filter((x: any) => x.name === '__דסק_E2E_stale')) {
    await request.delete(`${API}/workstation-presets/${p.id}`);
  }
  const oldDesks = await (await request.get(`${API}/mission-desks`)).json();
  for (const d of oldDesks.filter((x: any) => x.name === 'דסק stale E2E')) {
    await request.delete(`${API}/mission-desks/${d.id}`);
  }

  // 1. קודם טוענים את הדף (רשימת ה-presets של App נטענת עכשיו — בלי העמדה החדשה)
  await setScreenSize(page);
  await page.goto('/');
    await identifyViaMirage(page);

  // 2. רק עכשיו נוצרים הדסק והעמדה (כמו יצירה במסך ניהול בזמן שהדף פתוח)
  const desk = await (await request.post(`${API}/mission-desks`, { data: { name: 'דסק stale E2E' } })).json();
  const svc = await (await request.post(`${API}/mission-desks/${desk.id}/services`, {
    data: { service_type: 'buttons', name: 'אמצעי stale' },
  })).json();
  await request.put(`${API}/mission-desks/${desk.id}`, {
    data: { layout_json: { id: 'l1', type: 'leaf', service_id: svc.id } },
  });
  const preset = await (await request.post(`${API}/workstation-presets`, {
    data: { name: '__דסק_E2E_stale', preset_type: 'mission_desk', mission_desk_id: desk.id },
  })).json();

  try {
    // 3. מעבר למסך הניהול וחזרה (הזרימה האמיתית — מסך ה-login מתרענן, App לא היה)
    await page.getByRole('button', { name: /ניהול מערכת/ }).click();
    await expect(page.getByRole('button', { name: 'חזרה' })).toBeVisible();
    await page.getByRole('button', { name: 'חזרה' }).click();

    // 4. התחברות לעמדה החדשה — חייב לעלות מסך הדסק, לא SectorDashboard
    await identifyViaMirage(page);
    await page.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();
    await pickWorkstation(page, '__דסק_E2E_stale');
    const skip = page.getByRole('button', { name: /^דלג$|^Skip$/ });
    if (await skip.isVisible().catch(() => false)) await skip.click();

    await expect(page.getByText('דסק stale E2E')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('אמצעי stale')).toBeVisible();
    // העמדה רצה בתוך SectorDashboard, אבל פ"ממים ונקודות העברה לא מוצגים:
    // סרגל הפ"ממים מוסתר ופאנל נקודות ההעברה לא קיים כלל
    await expect(page.locator('#sidebar-area')).toBeHidden();
    await expect(page.locator('#neighbor-panel')).toHaveCount(0);
  } finally {
    await request.delete(`${API}/workstation-presets/${preset.id}`);
    await request.delete(`${API}/mission-desks/${desk.id}`);
  }
});

test('עמדת דסק — מה שהוגדר בניהול מוצג כמו בכל עמדה (עזרים, דש בורד, מצבי בסיס)', async ({ page, request }) => {
  // הבקשה: בעמדת "דסק משימה" — אם בניהול נבחר להציג דש בורד מנהל / מצבי בסיס
  // ותכני החלון הימני (עזרים), הם חייבים להופיע בדיוק כמו בכל עמדה אחרת.
  const oldPresets = await (await request.get(`${API}/workstation-presets`)).json();
  for (const p of oldPresets.filter((x: any) => x.name === '__דסק_E2E_chrome')) {
    await request.delete(`${API}/workstation-presets/${p.id}`);
  }
  const oldDesks = await (await request.get(`${API}/mission-desks`)).json();
  for (const d of oldDesks.filter((x: any) => x.name === 'דסק chrome E2E')) {
    await request.delete(`${API}/mission-desks/${d.id}`);
  }
  const oldGroups = await (await request.get(`${API}/aid-groups`)).json();
  for (const g of (Array.isArray(oldGroups) ? oldGroups : []).filter((x: any) => x.name === 'עזרים E2E')) {
    await request.delete(`${API}/aid-groups/${g.id}`);
  }

  // דסק + שירות + פריסה
  const desk = await (await request.post(`${API}/mission-desks`, { data: { name: 'דסק chrome E2E' } })).json();
  const svc = await (await request.post(`${API}/mission-desks/${desk.id}/services`, {
    data: { service_type: 'buttons', name: 'אמצעי chrome' },
  })).json();
  await request.put(`${API}/mission-desks/${desk.id}`, {
    data: { layout_json: { id: 'l1', type: 'leaf', service_id: svc.id } },
  });
  // קבוצת עזרים עם פריט טקסט
  const group = await (await request.post(`${API}/aid-groups`, { data: { name: 'עזרים E2E' } })).json();
  await request.post(`${API}/aid-groups/${group.id}/items`, {
    data: { name: 'עזר E2E', type: 'text', content: 'תוכן העזר', sort_order: 0 },
  });
  // עמדת דסק עם "מציג דש בורד"
  const preset = await (await request.post(`${API}/workstation-presets`, {
    data: { name: '__דסק_E2E_chrome', preset_type: 'mission_desk', mission_desk_id: desk.id, show_dashboard: true },
  })).json();
  await request.put(`${API}/presets/${preset.id}/aid-group`, { data: { group_id: group.id } });

  try {
    await setScreenSize(page);
    await page.goto('/');
    await identifyViaMirage(page);
    await page.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();
    await pickWorkstation(page, '__דסק_E2E_chrome');
    const skip = page.getByRole('button', { name: /^דלג$|^Skip$/ });
    if (await skip.isVisible().catch(() => false)) await skip.click();

    // הדסק עלה
    await expect(page.getByText('דסק chrome E2E')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('אמצעי chrome')).toBeVisible();

    // חלון עזרים ימני — קיים עם הפריט שהוגדר בניהול
    await expect(page.getByText('עזר E2E')).toBeVisible();
    // כפתור דש בורד מנהל — כמו בכל עמדה שהוגדרה כך
    const dashBtn = page.getByRole('button', { name: /דש בורד|Dashboard/ });
    await expect(dashBtn).toBeVisible();

    // צ'יפ הלחץ האטמוספרי — חלק מסרגל העמדה הרגיל
    await expect(page.getByTitle(/לחץ אטמוספרי/)).toBeVisible();

    await page.screenshot({ path: 'e2e/__screenshots__/mission-desk-chrome.png', fullPage: false });
  } finally {
    await request.delete(`${API}/workstation-presets/${preset.id}`);
    await request.delete(`${API}/mission-desks/${desk.id}`);
    await request.delete(`${API}/aid-groups/${group.id}`);
  }
});

test('הגדרת עמדה — פתיחת הדסק לתצוגת הגדרה ויצירת אמצעי קבוע', async ({ page, request }) => {
  // ניקוי שאריות
  const oldPresets = await (await request.get(`${API}/workstation-presets`)).json();
  for (const p of oldPresets.filter((x: any) => x.name === '__דסק_E2E_cfg')) {
    await request.delete(`${API}/workstation-presets/${p.id}`);
  }
  const oldDesks = await (await request.get(`${API}/mission-desks`)).json();
  for (const d of oldDesks.filter((x: any) => x.name === 'דסק cfg E2E')) {
    await request.delete(`${API}/mission-desks/${d.id}`);
  }

  // הקמה: דסק עם שירות אמצעים + עמדה שמצביעה עליו
  const desk = await (await request.post(`${API}/mission-desks`, { data: { name: 'דסק cfg E2E' } })).json();
  const svc = await (await request.post(`${API}/mission-desks/${desk.id}/services`, {
    data: { service_type: 'buttons', name: 'אמצעים cfg' },
  })).json();
  await request.put(`${API}/mission-desks/${desk.id}`, {
    data: { layout_json: { id: 'l1', type: 'leaf', service_id: svc.id } },
  });
  const preset = await (await request.post(`${API}/workstation-presets`, {
    data: { name: '__דסק_E2E_cfg', preset_type: 'mission_desk', mission_desk_id: desk.id },
  })).json();

  try {
    // כניסה למסך ניהול → עמדות → עריכת העמדה
    await setScreenSize(page);
    await page.goto('/');
    await identifyViaMirage(page);
    await page.getByRole('button', { name: /ניהול מערכת/ }).click();
    await page.getByRole('button', { name: '🖥 עמדות' }).click();
    await page.getByText('__דסק_E2E_cfg', { exact: true }).locator('..').locator('..')
      .getByRole('button', { name: /עריכה|Edit/ }).click();

    // פתיחת הדסק לתצוגת הגדרה
    await page.getByRole('button', { name: /פתח דסק להגדרה/ }).click();
    await expect(page.getByText('מצב הגדרה')).toBeVisible();

    // יצירת אמצעי קבוע דרך כפתור הפעולה (מגע)
    await page.getByRole('button', { name: /צור כפתור/ }).click();
    await expect(page.getByRole('heading', { name: 'עריכת כפתור' })).toBeVisible();
    await page.getByRole('button', { name: 'שמור', exact: true }).click();
    await expect(page.getByText(/📌 אמצעי חדש/)).toBeVisible();

    // סגירה וחזרה לעורך העמדה
    await page.waitForTimeout(700); // מרווח ל-PUT
    await page.getByRole('button', { name: /סיים הגדרה/ }).click();
    await expect(page.getByText('מצב הגדרה')).toHaveCount(0);

    // אימות: ה-state של העמדה מכיל אמצעי קבוע (fixed)
    const st = await (await request.get(`${API}/mission-desk-state?preset_id=${preset.id}`)).json();
    const btns = st.find((r: any) => r.service_id === svc.id)?.state?.buttons || [];
    expect(btns.length).toBe(1);
    expect(btns[0].fixed).toBe(true);

    // ── שכפול עמדה: כפתור השמירה חייב להיות זמין מיד והשמירה עוברת ────────
    await page.getByRole('button', { name: 'ביטול' }).click(); // סגירת מודל העריכה
    await page.getByText('__דסק_E2E_cfg', { exact: true }).locator('..').locator('..')
      .getByRole('button', { name: /שכפל/ }).click();
    const addBtn = page.getByRole('button', { name: /הוספה/ });
    await expect(addBtn).toBeEnabled();
    await addBtn.click();
    await expect(page.getByText('__דסק_E2E_cfg (העתק)', { exact: true }).first()).toBeVisible({ timeout: 10000 });
  } finally {
    const all = await (await request.get(`${API}/workstation-presets`)).json();
    for (const p of all.filter((x: any) => x.name === '__דסק_E2E_cfg (העתק)')) {
      await request.delete(`${API}/workstation-presets/${p.id}`);
    }
    await request.delete(`${API}/workstation-presets/${preset.id}`);
    await request.delete(`${API}/mission-desks/${desk.id}`);
  }
});
