import { test, expect } from '@playwright/test';
import { apiAuthHeaders, loginToWorkstation } from './helpers';

// ─── תצוגת עמדות אחרות בעמדה — בדיקת קצה-לקצה ────────────────────────────────
// מגדיר דרך ה-API עמדה לצפייה עבור העמדה שאליה הבדיקה נכנסת, נכנס לעמדה,
// מדליק את הסרגל מתפריט "תצוגה", ומוודא: הריבוע עולה עם מסגרת חיה של העמדה
// הנצפית, ולחיצה עליו מגדילה אותו לקריאה בלבד. מנקה אחריו.

const API = 'http://localhost:3001/api';

test('סרגל עמדות לצפייה — ריבוע חי, כיווץ, והגדלה לקריאה בלבד', async ({ page, request }) => {
  test.setTimeout(120000);

  const headers = await apiAuthHeaders();
  const presets = await (await request.get(`${API}/workstation-presets`, { headers })).json();
  const usable = presets.filter((p: any) => p.name && !p.name.startsWith('__'));
  test.skip(usable.length < 2, 'נדרשות שתי עמדות לפחות ב-DB');

  // אותה עמדה שבה loginToWorkstation בוחר (הראשונה שאינה שארית בדיקות)
  const viewer = usable[0];
  const target = usable.find((p: any) => p.id !== viewer.id)!;

  // ניקוי שאריות מהרצה שנקטעה
  const existing = await (await request.get(`${API}/preset-view-stations/${viewer.id}`, { headers })).json();
  for (const vs of existing) await request.delete(`${API}/preset-view-stations/${vs.id}`, { headers });

  const created = await (await request.post(`${API}/preset-view-stations/${viewer.id}`, {
    headers,
    data: { target_preset_id: target.id, label: 'עמדה נצפית', sort_order: 0 },
  })).json();

  try {
    await loginToWorkstation(page);

    // הסרגל מוצג רק אחרי בחירה בתפריט "תצוגה"
    await page.getByRole('button', { name: /תצוגה/ }).first().click();
    await page.getByText(/תצוגת עמדות אחרות/).click();

    // הריבוע קיים, ובתוכו מסגרת חיה של העמדה הנצפית
    const frame = page.locator(`iframe[title="peek-${target.id}"]`);
    await expect(frame).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('עמדה נצפית')).toBeVisible();

    // המסגרת באמת טוענת את העמדה הנצפית (ולא את העמדה שלי)
    await expect.poll(async () => frame.getAttribute('src')).toContain(`peek=${target.id}`);

    await page.waitForTimeout(4000); // מסך העמדה שבתוך המסגרת מספיק להיפרס
    await page.screenshot({ path: 'e2e/__screenshots__/station-peek-bar.png' });

    // לחיצה על הריבוע — הגדלה לקריאה בלבד
    await page.getByTestId(`peek-tile-${target.id}`).click({ position: { x: 40, y: 40 } });
    await expect(page.getByText(/קריאה בלבד/)).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'e2e/__screenshots__/station-peek-expanded.png' });

    // Esc סוגר
    await page.keyboard.press('Escape');
    await expect(page.getByText(/קריאה בלבד/)).toHaveCount(0);

    // כיווץ הסרגל — הריבוע יורד מהמסך
    await page.getByRole('button', { name: /עמדות \(1\)/ }).click();
    await expect(frame).toHaveCount(0);
  } finally {
    await request.delete(`${API}/preset-view-stations/${created.id}`, { headers }).catch(() => {});
  }
});

test('שלושה ריבועים בתמה בהירה — הסרגל נגזר-תמה ולא כהה קשיח', async ({ page, request }) => {
  test.setTimeout(180000);

  const headers = await apiAuthHeaders();
  const presets = await (await request.get(`${API}/workstation-presets`, { headers })).json();
  const usable = presets.filter((p: any) => p.name && !p.name.startsWith('__'));
  test.skip(usable.length < 4, 'נדרשות ארבע עמדות לפחות ב-DB');

  const viewer = usable[0];
  const targets = usable.slice(1, 4);
  const existing = await (await request.get(`${API}/preset-view-stations/${viewer.id}`, { headers })).json();
  for (const vs of existing) await request.delete(`${API}/preset-view-stations/${vs.id}`, { headers });

  const created: any[] = [];
  for (const [i, t] of targets.entries()) {
    created.push(await (await request.post(`${API}/preset-view-stations/${viewer.id}`, {
      headers,
      data: { target_preset_id: t.id, sort_order: i },
    })).json());
  }

  try {
    // תמה בהירה נקבעת לפני עליית האפליקציה (SectorDashboard קורא bt-themeMode ב-mount)
    await page.addInitScript(() => localStorage.setItem('bt-themeMode', 'light'));
    await loginToWorkstation(page);

    await page.getByRole('button', { name: /תצוגה/ }).first().click();
    await page.getByText(/תצוגת עמדות אחרות/).click();

    for (const t of targets) {
      await expect(page.locator(`iframe[title="peek-${t.id}"]`)).toBeVisible({ timeout: 20000 });
    }
    await page.waitForTimeout(6000);
    await page.screenshot({ path: 'e2e/__screenshots__/station-peek-light-3.png' });
  } finally {
    for (const c of created) await request.delete(`${API}/preset-view-stations/${c.id}`, { headers }).catch(() => {});
  }
});

test('צפייה היא לקריאה בלבד — מסגרת peek לא כותבת לשרת', async ({ page }) => {
  test.setTimeout(60000);
  const headers = await apiAuthHeaders();
  const presets = await (await page.request.get(`${API}/workstation-presets`, { headers })).json();
  const target = presets.find((p: any) => p.name && !p.name.startsWith('__'));
  test.skip(!target, 'אין עמדה זמינה');

  const writes: string[] = [];
  page.on('request', r => {
    if (r.method() !== 'GET' && r.url().includes('/api/')) writes.push(`${r.method()} ${r.url()}`);
  });

  await page.goto(`/?peek=${target.id}`);
  await page.waitForTimeout(12000); // מספיק זמן לכל האפקטים והפולינג הראשון

  expect(writes, `מסגרת צפייה ניסתה לכתוב: ${writes.join(', ')}`).toEqual([]);

  // ההגנות אכן הותקנו במסגרת, ומיתון הפולינג פעיל
  expect(await page.evaluate(() => (window as any).__btPeekGuarded)).toBe(true);
  expect(await page.evaluate(() => (window as any).__btPeekThrottled)).toBe(true);

  // גארד נגד קינון — מסגרת צפייה לא מציגה סרגל עמדות משלה
  expect(await page.locator('iframe[title^="peek-"]').count()).toBe(0);

  // בעמדה רגילה ההגנות אינן מותקנות — הכתיבות עובדות כרגיל
  await page.goto('/');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as any).__btPeekGuarded)).toBeUndefined();
});
