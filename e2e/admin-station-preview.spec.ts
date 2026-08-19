import { test, expect } from '@playwright/test';
import { apiAuthHeaders, identifyViaMirage, makeTestMapPng, setScreenSize } from './helpers';

// ─── מסך הניהול: "הצג מסך לדוגמה" ושיכפול מפה ────────────────────────────────
// שתי דרישות שנבדקות כאן קצה-לקצה, כי שתיהן חיות רק בדפדפן:
//   1. בטופס העמדה יש כפתור שפורס את **המסך האמיתי** של העמדה על כל המסך,
//      קריאה בלבד (אותה מסגרת ?peek= של סרגל ההצצה).
//   2. בניהול המפות אפשר לשכפל מפה מעוגנת, והעותק נושא תמונה ועיגון **בלבד** -
//      בלי האזורים שצוירו על המקור.
//
// שתיהן בונות את הנתונים שלהן ומנקות אחריהן: בדיקה שנשענת על מה שקיים ב-DB
// ירוקה או אדומה באקראי לפי מה שהוגדר באותו רגע.

const API = process.env.E2E_API_URL || 'http://localhost:3001/api';
const STAMP = `__e2e_dup_${Date.now()}`;
const ANCHORS = {
  anchor1_x_img: 20, anchor1_y_img: 10, anchor1_lat: 33.25, anchor1_lon: 34.5,
  anchor2_x_img: 80, anchor2_y_img: 90, anchor2_lat: 31.75, anchor2_lon: 35.25,
};

test('טופס העמדה: "הצג מסך לדוגמה" פורס את מסך העמדה על כל המסך, קריאה בלבד', async ({ page }) => {
  test.setTimeout(120000);

  await setScreenSize(page);
  await page.goto('/');
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /ניהול מערכת/ }).click();
  await page.getByRole('button', { name: '🖥 עמדות', exact: true }).click();

  const rows = page.locator('[data-testid="admin-preset-row"]');
  await expect(rows.first()).toBeVisible({ timeout: 20000 });
  await rows.first().getByRole('button', { name: /^עריכה$|^Edit$/ }).click();

  const previewBtn = page.getByRole('button', { name: /הצג מסך לדוגמה/ });
  await expect(previewBtn).toBeEnabled();
  await previewBtn.click();

  // המסגרת היא העמדה עצמה (?peek=<id>), ולא שכפול של מסך הניהול
  const frame = page.locator('iframe[title^="peek-"]');
  await expect(frame).toBeVisible({ timeout: 20000 });
  expect(await frame.getAttribute('src')).toContain('peek=');
  await expect(page.getByText('קריאה בלבד', { exact: true })).toBeVisible();

  // הכותרת נפרסת על כל רוחב החלון - זה "על כל המסך" ולא חלון בתוך המודל
  const box = await page.locator('iframe[title^="peek-"]').boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.width).toBeGreaterThan(vp.width * 0.6);

  // מחכים שהעמדה שבתוך המסגרת תיפרס בפועל: יש בה תוכן, ומסך הטעינה שלה ירד.
  // בדיקת היעדר מסך הטעינה בלבד מסתפקת גם במסגרת **ריקה** שטרם התחילה להיצבע.
  const innerBody = page.frameLocator('iframe[title^="peek-"]').locator('body');
  await expect.poll(async () => {
    const txt = await innerBody.innerText().catch(() => '');
    return txt.trim().length > 40 && !/המערכת בטעינה|System loading/.test(txt);
  }, { timeout: 90000, intervals: [1000] }).toBe(true);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'e2e/__screenshots__/admin-station-sample-screen.png' });

  // Esc סוגר וחוזרים לטופס העמדה
  await page.keyboard.press('Escape');
  await expect(frame).toHaveCount(0);
  await expect(previewBtn).toBeVisible();
});

test('ניהול מפות: שיכפול מפה מעוגנת - העותק בלי אזורים', async ({ page, request }) => {
  test.setTimeout(120000);

  const headers = await apiAuthHeaders();
  const srcName = `${STAMP}_src`;
  const copyName = `${STAMP}_copy`;

  const src = await (await request.post(`${API}/maps`, {
    headers, data: { name: srcName, image_data: makeTestMapPng(320, 240) },
  })).json();
  await request.patch(`${API}/maps/${src.id}/anchors`, { headers, data: ANCHORS });
  await request.post(`${API}/map-zones`, {
    headers, data: { map_id: src.id, name: `${STAMP}_zone`, polygon: [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }] },
  });

  let copyId: number | null = null;
  try {
    await setScreenSize(page);
    await page.goto('/');
    await identifyViaMirage(page);
    await page.getByRole('button', { name: /ניהול מערכת/ }).click();
    await page.getByRole('button', { name: '🗺 מפות', exact: true }).click();

    const row = page.locator(`[data-testid="admin-map-row"][data-map-name="${srcName}"]`);
    await expect(row).toBeVisible({ timeout: 20000 });

    await row.getByRole('button', { name: /שכפל/ }).click();

    // שם ברירת המחדל מוצע, והמשתמש רשאי לשנותו לפני היצירה
    const nameInput = page.getByTestId('map-duplicate-name');
    await expect(nameInput).toHaveValue(`${srcName} (העתק)`);
    await page.screenshot({ path: 'e2e/__screenshots__/admin-map-duplicate.png' });
    await nameInput.fill(copyName);
    await page.getByRole('button', { name: /^שכפל$/ }).click();

    // העותק מופיע ברשימה
    await expect(page.getByText(copyName, { exact: true })).toBeVisible({ timeout: 20000 });

    const maps = await (await request.get(`${API}/maps`, { headers })).json();
    const copy = maps.find((m: any) => m.name === copyName);
    expect(copy, 'העותק לא נוצר').toBeTruthy();
    copyId = copy.id;

    // התמונה והעיגון עברו
    const full = await (await request.get(`${API}/maps/${copy.id}`, { headers })).json();
    expect(full.image_data).toBeTruthy();
    for (const [k, v] of Object.entries(ANCHORS)) expect(Number(full[k]), k).toBeCloseTo(v, 3);

    // "ללא עזרים" - האזור נשאר אצל המקור בלבד
    const copyZones = await (await request.get(`${API}/map-zones?map_id=${copy.id}`, { headers })).json();
    expect(copyZones).toHaveLength(0);
    const srcZones = await (await request.get(`${API}/map-zones?map_id=${src.id}`, { headers })).json();
    expect(srcZones).toHaveLength(1);
  } finally {
    if (copyId) await request.delete(`${API}/maps/${copyId}`, { headers });
    await request.delete(`${API}/maps/${src.id}`, { headers });
  }
});
