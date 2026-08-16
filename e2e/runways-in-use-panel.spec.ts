import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders, loginToWorkstation } from './helpers';

// ─── פאנל "מסלולים בשימוש" בעמדת המגדל ───────────────────────────────────────
// הדרישות מהשטח: הפאנל בצד **שמאל** ולא ימין · הלחיצות מגיבות מהר · **אותו סדר
// מסלולים בכל עמדה** שמקושרת לאותם מסלולים · **קו מפריד בין כל זוג מסלולים**.

const API = 'http://localhost:3001/api';

let api: APIRequestContext;

test.describe.configure({ timeout: 240000 });

test.beforeAll(async () => {
  api = await playwrightRequest.newContext({ extraHTTPHeaders: await apiAuthHeaders() });
});

async function findTowerPreset() {
  const presets = await (await api.get(`${API}/workstation-presets`)).json();
  return (presets as { preset_type: string; name: string; airfield_id: number | null }[]).find(p =>
    (p.preset_type === 'ground' || p.preset_type === 'tower') && p.airfield_id
    && !String(p.name || '').startsWith('__'));
}

test('הפאנל יושב בצד שמאל של העמדה', async ({ page }) => {
  const preset = await findTowerPreset();
  test.skip(!preset, 'אין עמדת מגדל המשויכת לשדה תעופה');
  await loginToWorkstation(page, { preset: preset!.name });

  const anyBtn = page.locator('[data-testid^="rwy-takeoff-"]').first();
  await expect(anyBtn).toBeVisible({ timeout: 40000 });

  const panel = anyBtn.locator('xpath=ancestor::div[contains(@style,"position: fixed")][1]');
  const box = (await panel.boundingBox())!;
  const vw = page.viewportSize()!.width;
  expect(box.x, 'הפאנל חייב להיות בצד שמאל').toBeLessThan(vw / 2 - box.width / 2);
});

test('קו מפריד בין כל זוג מסלולים, בשתי השורות', async ({ page }) => {
  const preset = await findTowerPreset();
  test.skip(!preset, 'אין עמדת מגדל המשויכת לשדה תעופה');
  const runways = await (await api.get(`${API}/airfield-runways?airfield_id=${preset!.airfield_id}`)).json();
  const pairCount = runways.filter((r: { heading_a?: string; heading_b?: string }) => r.heading_a || r.heading_b).length;
  test.skip(pairCount < 2, 'נדרשים לפחות שני מסלולים כדי שיהיה מה להפריד');

  await loginToWorkstation(page, { preset: preset!.name });
  await expect(page.locator('[data-testid^="rwy-takeoff-"]').first()).toBeVisible({ timeout: 40000 });

  // מפריד אחד פחות ממספר המסלולים, בכל אחת משתי השורות
  await expect(page.getByTestId('rwy-group-sep')).toHaveCount((pairCount - 1) * 2);
});

test('סדר המסלולים קנוני ומקבץ כל מסלול יחד', async ({ page }) => {
  const preset = await findTowerPreset();
  test.skip(!preset, 'אין עמדת מגדל המשויכת לשדה תעופה');
  const runways = await (await api.get(`${API}/airfield-runways?airfield_id=${preset!.airfield_id}`)).json();
  test.skip(runways.length < 2, 'נדרשים לפחות שני מסלולים');

  await loginToWorkstation(page, { preset: preset!.name });
  const btns = page.locator('[data-testid^="rwy-takeoff-"]');
  await expect(btns.first()).toBeVisible({ timeout: 40000 });
  const shown = (await btns.allTextContents()).map(t => t.trim());

  // שני קצותיו של כל מסלול צמודים זה לזה
  for (const rw of runways) {
    const a = String(rw.heading_a || '').trim(), b = String(rw.heading_b || '').trim();
    if (!a || !b) continue;
    const ia = shown.indexOf(a), ib = shown.indexOf(b);
    if (ia < 0 || ib < 0) continue;
    expect(Math.abs(ia - ib), `${a} ו-${b} הם אותו מסלול וחייבים להיות צמודים`).toBe(1);
  }

  // הסדר נגזר משם המסלול בלבד, ולכן זהה בכל עמדה: הקצה הנמוך של כל מסלול עולה
  const firstOfEachPair = shown.filter((_, i) => i % 2 === 0).map(e => Number((/^\d+/.exec(e) || ['99'])[0]));
  const sorted = [...firstOfEachPair].sort((x, y) => x - y);
  expect(firstOfEachPair, 'המסלולים ממוינים לפי הקצה הנמוך').toEqual(sorted);
});

test('לחיצה על קצה מגיבה מיד ואינה מרכיבה מחדש את הכפתורים', async ({ page }) => {
  const preset = await findTowerPreset();
  test.skip(!preset, 'אין עמדת מגדל המשויכת לשדה תעופה');
  await loginToWorkstation(page, { preset: preset!.name });

  const btns = page.locator('[data-testid^="rwy-takeoff-"]:not([disabled])');
  await expect(btns.first()).toBeVisible({ timeout: 40000 });
  const target = btns.first();
  const testId = await target.getAttribute('data-testid');
  const before = await target.getAttribute('data-use');

  // סימון על אותו צומת DOM: הרכבה מחדש הייתה מחליפה את הצומת
  await target.evaluate(el => { (el as HTMLElement).dataset.probe = 'kept'; });

  const t0 = Date.now();
  await target.click();
  await expect(page.locator(`[data-testid="${testId}"]`))
    .not.toHaveAttribute('data-use', before!, { timeout: 3000 });
  const elapsed = Date.now() - t0;
  expect(elapsed, 'הלחיצה חייבת להיראות מיד, בלי להמתין לשרת').toBeLessThan(2000);

  // הצומת שרד את הרינדור - כלומר הכפתור לא הורכב מחדש
  await expect(page.locator(`[data-testid="${testId}"]`)).toHaveAttribute('data-probe', 'kept');

  await target.click(); // החזרת המצב
});
