import { test, expect, Page } from '@playwright/test';
import { switchToInternalAuth } from './helpers';

// אימות ויזואלי של RotatingEmblems (סמל בסיס אב + מיח"ה) — סרגל עליון + מסך טעינה.
// מאתר דרך ה-API עמדה עם parent_base_id (סמל בסיס + מיח"ה) ועמדה בלי (מיח"ה בלבד).

const API = 'http://localhost:3001/api';
const CREW = 'אורי'; // admin — רואה את כל העמדות

interface Preset { id: number; name: string; parent_base_id: number | null }

async function fetchPresets(page: Page): Promise<Preset[]> {
  const res = await page.request.get(`${API}/workstation-presets`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

// כניסה עד בחירת עמדה מסוימת (לפי שם המופיע ב-option), עצירה אחרי "דלג".
async function loginUpToPreset(page: Page, presetName: string) {
  await page.goto('/');
  await page.getByRole('button', { name: '15.6"' }).click();
  await switchToInternalAuth(page);
  const search = page.getByPlaceholder(/חפש מתוך|Search \d+ crew/);
  await search.click();
  await search.fill(CREW);
  await page.getByRole('button', { name: new RegExp(CREW) }).first().click();
  await page.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();
  const select = page.locator('select:not(#env-select)').first();
  await expect(select).toBeVisible();
  // בחירה חסינה: מתאימים את ה-option שהטקסט שלו מכיל את שם העמדה
  const label = await select
    .locator('option:not([disabled])')
    .evaluateAll((opts, name) => {
      const hit = (opts as HTMLOptionElement[]).find(o => (o.textContent || '').includes(name));
      return hit ? (hit.textContent || '').trim() : null;
    }, presetName);
  expect(label, `option for preset "${presetName}"`).toBeTruthy();
  await select.selectOption({ label: label! });
  await page.getByRole('button', { name: /^דלג$|^Skip$/ }).click();
}

async function shotTopbar(page: Page, file: string) {
  // הסרגל (<header class="bt-topbar">) מרונדר תמיד, אך שכבת ה-loader (overlay
  // zIndex 100000) מכסה אותו עד סיום הטעינה. בסביבת e2e חלק מהעמדות לא מסיימות
  // לטעון נתוני שדה, לכן מסתירים את שכבת ה-loader כדי לחשוף את הסרגל האמיתי שמתחת.
  const topbar = page.locator('header.bt-topbar').first();
  await expect(topbar).toBeVisible();
  await page.evaluate(() => {
    const overlay = [...document.querySelectorAll('div')].find(
      d => (d as HTMLElement).style?.zIndex === '100000');
    if (overlay) (overlay as HTMLElement).style.display = 'none';
  });
  await page.waitForTimeout(1800); // אנימציית הכניסה של הסמלים מתייצבת
  // element.screenshot לא מחשב נכון bounding box תחת CSS zoom → clip של רצועת הראש.
  const vp = page.viewportSize()!;
  await page.screenshot({ path: `e2e/__screenshots__/${file}`, clip: { x: 0, y: 0, width: vp.width, height: 90 } });
}

test('emblems — עמדה עם בסיס אב (סמל בסיס + מיח"ה)', async ({ page }) => {
  const presets = await fetchPresets(page);
  const withBase = presets.find(p => p.parent_base_id != null);
  test.skip(!withBase, 'אין עמדה עם parent_base_id מוגדר — הגדר "בסיס אב" בניהול עמדות כדי לראות סמל בסיס');
  await loginUpToPreset(page, withBase!.name);
  await shotTopbar(page, 'emblems-topbar-withbase.png');
});

test('emblems — עמדה בלי בסיס אב (מיח"ה בלבד)', async ({ page }) => {
  const presets = await fetchPresets(page);
  const noBase = presets.find(p => p.parent_base_id == null) ?? presets[0];
  await loginUpToPreset(page, noBase.name);
  await shotTopbar(page, 'emblems-topbar-nobase.png');
});

test('emblems — מסך טעינה עם הסמלים המסתובבים', async ({ page }) => {
  const presets = await fetchPresets(page);
  const target = presets.find(p => p.parent_base_id != null) ?? presets[0];
  await loginUpToPreset(page, target.name);
  // מצלמים את ה-splash *בזמן* שהוא גלוי (לפני שנעלם)
  const loading = page.getByText(/המערכת בטעינה|System loading/);
  await expect(loading).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: 'e2e/__screenshots__/emblems-loader.png' });
});
