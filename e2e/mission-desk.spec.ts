import { test, expect } from '@playwright/test';

// ─── דסק משימה כללי — בדיקת קצה-לקצה ─────────────────────────────────────────
// יוצר דרך ה-API דסק עם 3 שירותים ופריסה, עמדה מסוג mission_desk שמצביעה עליו,
// נכנס לעמדה ומוודא שהדסק עולה עם שלושת השירותים. מנקה אחריו.

const API = 'http://localhost:3001/api';

test('עמדת דסק משימה כללי — הדסק עולה עם השירותים', async ({ page, request }) => {
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
    await page.goto('/');
    await page.getByRole('button', { name: '15.6"' }).click();
    const search = page.getByPlaceholder(/חפש מתוך|Search \d+ crew/);
    await search.click();
    await search.fill('אורי');
    await page.getByRole('button', { name: /אורי/ }).first().click();
    await page.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();
    const select = page.locator('select').first();
    await expect(select).toBeVisible();
    await select.selectOption({ label: '__דסק_E2E' });
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

    await page.screenshot({ path: 'e2e/__screenshots__/mission-desk.png', fullPage: false });

    // ── עמדה ב' נכנסת בדף שני (polling פעיל) — יעד ההתראה המתפרצת ──────────
    const pageB = await page.context().newPage();
    await pageB.goto('/');
    await pageB.getByRole('button', { name: '15.6"' }).click();
    const searchB = pageB.getByPlaceholder(/חפש מתוך|Search \d+ crew/);
    await searchB.click();
    await searchB.fill('אורי');
    await pageB.getByRole('button', { name: /אורי/ }).first().click();
    await pageB.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();
    await pageB.locator('select').first().selectOption({ label: '__דסק_E2E_ב' });
    const skipB = pageB.getByRole('button', { name: /^דלג$|^Skip$/ });
    if (await skipB.isVisible().catch(() => false)) await skipB.click();
    await expect(pageB.getByText('דסק E2E')).toBeVisible({ timeout: 20000 });

    // ── אינטראקציה 1: קליק ימני → צור כפתור (+ התראה לעמדה ב' במצב "פעיל") ──
    const board = page.getByTestId('md-buttons-board');
    await board.click({ button: 'right', position: { x: 120, y: 120 } });
    await page.getByRole('button', { name: /צור כפתור/ }).click();
    await expect(page.getByText('עריכת כפתור')).toBeVisible();
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
    await page.getByRole('button', { name: '15.6"' }).click();
    const search2 = page.getByPlaceholder(/חפש מתוך|Search \d+ crew/);
    await search2.click();
    await search2.fill('אורי');
    await page.getByRole('button', { name: /אורי/ }).first().click();
    await page.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();
    await page.locator('select').first().selectOption({ label: '__דסק_E2E' });
    const skip2 = page.getByRole('button', { name: /^דלג$|^Skip$/ });
    if (await skip2.isVisible().catch(() => false)) await skip2.click();
    await expect(page.getByText('דסק E2E')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('אמצעי חדש')).toBeVisible();
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

test('מסך ניהול — tab דסקי משימה: יצירת דסק, שירות ופריסה', async ({ page, request }) => {
  // ניקוי שאריות
  const oldDesks = await (await request.get(`${API}/mission-desks`)).json();
  for (const d of oldDesks.filter((x: any) => x.name === 'דסק אדמין E2E')) {
    await request.delete(`${API}/mission-desks/${d.id}`);
  }

  try {
    // כניסה למסך הניהול (איש צוות אדמין → "ניהול מערכת")
    await page.goto('/');
    await page.getByRole('button', { name: '15.6"' }).click();
    const search = page.getByPlaceholder(/חפש מתוך|Search \d+ crew/);
    await search.click();
    await search.fill('אורי');
    await page.getByRole('button', { name: /אורי/ }).first().click();
    await page.getByRole('button', { name: /ניהול מערכת/ }).click();

    // tab דסקי משימה
    await page.getByRole('button', { name: 'דסקי משימה' }).click();
    await expect(page.getByText('דסקי משימה כלליים')).toBeVisible();

    // יצירת דסק
    await page.getByPlaceholder('שם דסק חדש...').fill('דסק אדמין E2E');
    await page.getByRole('button', { name: '＋' }).click();
    await expect(page.getByText('שירותים בדסק')).toBeVisible();

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
