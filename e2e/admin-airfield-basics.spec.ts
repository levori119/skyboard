import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders, identifyViaMirage, setScreenSize } from './helpers';

// ─── הגדרת שדה תעופה: יסודות ─────────────────────────────────────────────────
// א. שדה שנבנה מאלמנטים בלבד, בלי לבחור מפה - בלי משטח עבודה המיכל מתמוטט
//    לגובה אפס (כל השכבות position:absolute) ואי אפשר למקם עליו כלום.
// ב. שם שדה תעופה: חובה, וייחודי - האכיפה בשרת ולא רק בטופס, כי גם שכפול
//    ומיגרציות עוברים דרכו. קודם ה-409 היה ב-POST בלבד ושם ריק עבר בשקט.
// ג. בורר בסיס האב הופיע בכתב כמעט בלתי נראה על הרקע הכהה.

const API = process.env.E2E_API_URL || 'http://localhost:3001/api';
const STAMP = `__e2e_afb_${Date.now()}`;
const created: number[] = [];

let api: APIRequestContext;


test.beforeAll(async () => {
  api = await playwrightRequest.newContext({ extraHTTPHeaders: await apiAuthHeaders() });
});

test.afterAll(async () => {
  for (const id of created) await api.delete(`${API}/airfields/${id}`);
});

async function openAirfieldsTab(page: import('@playwright/test').Page) {
  await setScreenSize(page);
  await page.goto('/');
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /ניהול מערכת/ }).click();
  await page.getByRole('button', { name: /שדות תעופה/ }).click();
}

test('שם שדה תעופה הוא חובה - השרת דוחה שם ריק', async () => {
  for (const name of ['', '   ']) {
    const res = await api.post(`${API}/airfields`, { data: { name } });
    expect(res.status(), `שם "${name}" לא אמור להתקבל`).toBe(400);
  }
  const all = await (await api.get(`${API}/airfields`)).json();
  expect(all.filter((a: { name: string }) => !String(a.name || '').trim()),
    'לא אמורים להישאר שדות בלי שם').toHaveLength(0);
});

test('שם שדה תעופה ייחודי - גם ביצירה וגם בשינוי שם', async () => {
  const a = await (await api.post(`${API}/airfields`, { data: { name: `${STAMP}_A` } })).json();
  created.push(a.id);
  const b = await (await api.post(`${API}/airfields`, { data: { name: `${STAMP}_B` } })).json();
  created.push(b.id);

  // יצירה בשם קיים
  const dupCreate = await api.post(`${API}/airfields`, { data: { name: `${STAMP}_A` } });
  expect(dupCreate.status()).toBe(409);
  // גם באותיות שונות וברווחים - אותו שם
  expect((await api.post(`${API}/airfields`, { data: { name: `  ${STAMP}_a  ` } })).status()).toBe(409);

  // שינוי שם ל-B כך שיתנגש ב-A: זה מה שעבר קודם בשקט
  const dupRename = await api.put(`${API}/airfields/${b.id}`, { data: { name: `${STAMP}_A` } });
  expect(dupRename.status(), 'PUT חייב לדחות שם כפול').toBe(409);

  // שמירת אותו שדה בשמו שלו - מותרת
  expect((await api.put(`${API}/airfields/${b.id}`, { data: { name: `${STAMP}_B` } })).status()).toBe(200);
});

test('שדה מאלמנטים בלבד: יש משטח עבודה גם בלי מפה, וניתן למקם עליו', async ({ page }) => {
  const af = await (await api.post(`${API}/airfields`, { data: { name: `${STAMP}_nomap` } })).json();
  created.push(af.id);

  await openAirfieldsTab(page);
  await page.locator('select').first().selectOption({ label: `${STAMP}_nomap` });

  // משטח עבודה בעל גובה אמיתי - בלעדיו אין על מה למקם
  const canvas = page.getByTestId('airfield-blank-canvas');
  await expect(canvas).toBeVisible({ timeout: 20000 });
  const box = (await canvas.boundingBox())!;
  expect(box.height, 'המשטח חייב גובה').toBeGreaterThan(100);
  expect(box.width).toBeGreaterThan(100);

  // שכבת הציור מכסה את המשטח - בלעדיה אין לאן למקם
  const overlay = page.locator('svg[viewBox="0 0 100 100"]').first();
  const ob = (await overlay.boundingBox())!;
  expect(Math.abs(ob.width - box.width)).toBeLessThan(2);
  expect(Math.abs(ob.height - box.height)).toBeLessThan(2);

  // קליק על המשטח הריק מתורגם לאחוזים - זו הזרימה של "שדה מאלמנטים בלבד"
  await page.getByTestId('runways-header').click();
  await page.getByRole('button', { name: /\+\s*מסלול/ }).first().click();
  const markBtn = page.getByRole('button', { name: /סמן על מפה/ }).first();
  await expect(markBtn).toBeVisible({ timeout: 10000 });
  await markBtn.click();
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.6);

  // הכפתור מציג את הנ"צ שנקלט - כלומר הקליק על המשטח הריק עבד
  await expect(page.getByRole('button', { name: /✓\s*\(/ }).first()).toBeVisible({ timeout: 10000 });
});

test('בורר בסיס האב קריא על הרקע הכהה', async ({ page }) => {
  await openAirfieldsTab(page);
  await page.getByRole('button', { name: /\+ חדש|חדש/ }).first().click();

  const select = page.locator('select').filter({ hasText: /ללא בסיס/ }).first();
  await expect(select).toBeVisible({ timeout: 20000 });

  // ניגודיות נמדדת, לא מונחת: הטקסט חייב להיות בהיר על הרקע הכהה
  const lum = (rgb: string) => {
    const [r, g, b] = (rgb.match(/\d+/g) || ['0', '0', '0']).map(Number).map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const { color, bg } = await select.evaluate(el => {
    const cs = getComputedStyle(el);
    return { color: cs.color, bg: cs.backgroundColor };
  });
  const ratio = (Math.max(lum(color), lum(bg)) + 0.05) / (Math.min(lum(color), lum(bg)) + 0.05);
  expect(ratio, `ניגודיות ${color} על ${bg} נמוכה מדי`).toBeGreaterThanOrEqual(4.5);

  // וגם לפריטי הרשימה יש צבע מפורש, אחרת הדפדפן מרנדר אותם בברירת המחדל שלו
  const optColor = await select.locator('option').nth(1).evaluate(el => getComputedStyle(el).color).catch(() => color);
  expect(lum(optColor), 'פריט ברשימה חייב להיות בהיר').toBeGreaterThan(lum(bg));
});
