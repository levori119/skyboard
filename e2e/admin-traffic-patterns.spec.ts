import { test, expect } from '@playwright/test';
import { identifyViaMirage, setScreenSize } from './helpers';

// ─── עמדת ניהול: רובד ההקפה ביישות שדות תעופה ────────────────────────────────
// הדרישה: תחת שדה תעופה אפשר להוסיף הקפה, לבחור לאיזה מסלול היא, לצייר אותה על
// המפה (סיבוב + הארכת צלעות בגרירת פינות), לראות שם צלע ליד כל צלע עם שם המסלול,
// ולשכפל אותה - רגיל (שם ריק) או הפוך (השם ההופכי: 33 → 15).
//
// הבדיקה בונה שדה, מפה ומסלול משלה ומוחקת אותם בסוף: בלי זה היא נשענת על מה
// שקיים ב-DB המשותף ומשנה את התוצאה מהרצה להרצה.

const API = process.env.E2E_API_URL || 'http://localhost:3001/api';
const STAMP = `__e2e_pattern_${Date.now()}`;
// PNG לבן 2x1 - יחס תמונה שאינו 1, כדי שהבדיקה תתפוס גם עיוות של יחס התמונה
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let mapId = 0;
let airfieldId = 0;

test.beforeAll(async ({ request }) => {
  mapId = (await (await request.post(`${API}/maps`, { data: { name: STAMP, image_data: PNG } })).json()).id;
  airfieldId = (await (await request.post(`${API}/airfields`, { data: { name: STAMP, map_id: mapId } })).json()).id;
  await request.post(`${API}/airfield-runways`, {
    data: {
      airfield_id: airfieldId, name: '33/15', heading_a: '33', heading_b: '15',
      start_x_pct: 50, start_y_pct: 70, end_x_pct: 50, end_y_pct: 40,
    },
  });
});

// כל בדיקה מתחילה בלי הקפות: אחרת הבדיקה השנייה סופרת גם את ההקפות של הראשונה
// ו-.first() מצביע על הקפה ישנה במקום על זו שזה עתה נוספה.
test.beforeEach(async ({ request }) => {
  const existing = await (await request.get(`${API}/airfield-patterns?airfield_id=${airfieldId}`)).json();
  for (const p of existing) await request.delete(`${API}/airfield-patterns/${p.id}`);
});

test.afterAll(async ({ request }) => {
  if (airfieldId) await request.delete(`${API}/airfields/${airfieldId}`);
  if (mapId) await request.delete(`${API}/maps/${mapId}`);
});

async function openPatternsSection(page: import('@playwright/test').Page) {
  await setScreenSize(page);
  await page.goto('/');
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /ניהול מערכת/ }).click();
  await page.getByRole('button', { name: /שדות תעופה/ }).click();
  const select = page.locator('select').first();
  await expect(select).toBeVisible({ timeout: 20000 });
  await select.selectOption({ label: STAMP });
  const header = page.getByTestId('patterns-header');
  await expect(header).toBeVisible({ timeout: 20000 });
  await header.click();
  await expect(page.getByTestId('pattern-add')).toBeVisible();
}

test('הקפה: הוספה, שיוך למסלול, שרטוט על המפה ושמות צלעות', async ({ page }) => {
  await openPatternsSection(page);

  await page.getByTestId('pattern-add').click();
  const row = page.getByTestId('pattern-row').first();
  await expect(row).toBeVisible({ timeout: 15000 });

  // ההקפה מצוירת על המפה מיד, ונכנסים ישר למצב עריכה (ידיות גרירה)
  const shape = page.getByTestId('pattern-shape').first();
  await expect(shape).toBeVisible();
  await expect(shape).toHaveAttribute('data-editing', '1');
  await expect(page.getByTestId('pattern-corner')).toHaveCount(6);
  await expect(page.getByTestId('pattern-rotate')).toBeVisible();

  // חמש צלעות, כל אחת עם שם
  const labels = page.getByTestId('pattern-leg-label');
  await expect(labels).toHaveCount(5);
  const legNames = ['אחרי המראה', 'צולבת', 'עם הרוח', 'בסיס', 'פיינל'];
  for (const name of legNames) {
    await expect(labels.filter({ hasText: name })).toHaveCount(1);
  }

  // בחירת המסלול -> השם נכנס לשורה **וגם** לתוויות הצלעות על המפה
  await row.getByTestId('pattern-runway-select').selectOption({ label: 'מסלול 33' });
  await expect(page.getByTestId('pattern-row').first()).toHaveAttribute('data-runway-ident', '33', { timeout: 15000 });
  await expect(page.getByTestId('pattern-leg-label').filter({ hasText: 'פיינל 33' })).toHaveCount(1);
});

test('הקפה: סיבוב וגרירת פינה משנים את השרטוט ונשמרים', async ({ page }) => {
  await openPatternsSection(page);
  await page.getByTestId('pattern-add').click();
  await expect(page.getByTestId('pattern-shape').first()).toHaveAttribute('data-editing', '1', { timeout: 15000 });

  const cornerAt = (i: number) => page.getByTestId('pattern-corner').nth(i);
  const before = await cornerAt(2).getAttribute('cx');

  // גרירת פינת הצולבת מרחיבה את ההקפה - הפינה חייבת לזוז
  const box = await cornerAt(2).boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x - 60, box!.y + 10, { steps: 8 });
  await page.mouse.up();
  const afterDrag = await cornerAt(2).getAttribute('cx');
  expect(Number(afterDrag)).not.toBeCloseTo(Number(before), 3);

  // סיבוב: הידית מסובבת סביב הסף, ולכן הפינה האחרונה (הסף) אינה זזה
  const anchorBefore = await cornerAt(5).getAttribute('cx');
  const rot = await page.getByTestId('pattern-rotate').boundingBox();
  await page.mouse.move(rot!.x + rot!.width / 2, rot!.y + rot!.height / 2);
  await page.mouse.down();
  await page.mouse.move(rot!.x + 120, rot!.y + 120, { steps: 10 });
  await page.mouse.up();
  const anchorAfter = await cornerAt(5).getAttribute('cx');
  expect(Number(anchorAfter)).toBeCloseTo(Number(anchorBefore), 3);
  const rotatedCorner = await cornerAt(1).getAttribute('cx');

  // שמירה -> טעינה מחדש -> השרטוט חזר כפי שהיה
  await page.getByTestId('pattern-save').click();
  await expect(page.getByTestId('pattern-shape').first()).toHaveAttribute('data-editing', '0', { timeout: 15000 });
  await page.reload();
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /ניהול מערכת/ }).click();
  await page.getByRole('button', { name: /שדות תעופה/ }).click();
  await page.locator('select').first().selectOption({ label: STAMP });
  await expect(page.getByTestId('pattern-shape').first()).toBeVisible({ timeout: 20000 });
  await page.getByTestId('patterns-header').click();
  await page.getByTestId('pattern-row').first().getByTestId('pattern-draw').click();
  await expect(page.getByTestId('pattern-corner').nth(1)).toHaveAttribute('cx', rotatedCorner!, { timeout: 15000 });
});

test('שכפול הקפה: רגיל משאיר שם ריק, הפוך נותן את השם ההופכי (33 → 15)', async ({ page }) => {
  await openPatternsSection(page);

  await page.getByTestId('pattern-add').click();
  const row = page.getByTestId('pattern-row').first();
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByTestId('pattern-runway-select').selectOption({ label: 'מסלול 33' });
  await expect(page.getByTestId('pattern-row').first()).toHaveAttribute('data-runway-ident', '33', { timeout: 15000 });

  // שכפול רגיל - העתק של השרטוט **בלי שם**
  await page.getByTestId('pattern-row').first().getByTestId('pattern-duplicate').click();
  await expect(page.getByTestId('pattern-row')).toHaveCount(2, { timeout: 15000 });
  await expect(page.locator('[data-testid="pattern-row"][data-runway-ident=""]')).toHaveCount(1);

  // שכפול הפוך - השם ההופכי, ובאותו צד פיזי של המסלול
  await page.locator('[data-testid="pattern-row"][data-runway-ident="33"]').getByTestId('pattern-duplicate-reverse').click();
  await expect(page.locator('[data-testid="pattern-row"][data-runway-ident="15"]')).toHaveCount(1, { timeout: 15000 });

  const shapes = page.getByTestId('pattern-shape');
  await expect(shapes).toHaveCount(3);

  // כל הקפה נושאת את חמש הצלעות שלה עם **שם המסלול שלה** - שתי ההקפות אינן
  // מתערבבות אף שהן יושבות זו על זו על המפה
  const groupOf = async (ident: string) => {
    const id = await page.locator(`[data-testid="pattern-row"][data-runway-ident="${ident}"]`).getAttribute('data-pattern-id');
    return page.locator(`[data-testid="pattern-shape"][data-pattern-id="${id}"]`);
  };
  for (const ident of ['33', '15']) {
    const g = await groupOf(ident);
    const labels = g.getByTestId('pattern-leg-label');
    await expect(labels).toHaveCount(5);
    for (const leg of ['אחרי המראה', 'צולבת', 'עם הרוח', 'בסיס', 'פיינל']) {
      await expect(labels.filter({ hasText: `${leg} ${ident}` })).toHaveCount(1);
    }
  }

  // ההקפה ההפוכה יושבת באותו צד: קצה ה"עם הרוח" של שתיהן באותו X
  const xOf = async (patternIdent: string) => {
    const id = await page.locator(`[data-testid="pattern-row"][data-runway-ident="${patternIdent}"]`).getAttribute('data-pattern-id');
    const d = await page.locator(`[data-testid="pattern-shape"][data-pattern-id="${id}"] path`).last().getAttribute('d');
    return Math.min(...d!.match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, i) => i % 2 === 0));
  };
  expect(await xOf('15')).toBeCloseTo(await xOf('33'), 1);
});

test('אלמנט של הקפה שייך רק לה', async ({ page, request }) => {
  await openPatternsSection(page);
  await page.getByTestId('pattern-add').click();
  await expect(page.getByTestId('pattern-row').first()).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: '+ אלמנט' }).first().click();
  await page.getByPlaceholder('שם האלמנט').fill('נקודת דיווח צפון');
  await page.getByRole('button', { name: '🚩' }).click();
  await page.getByTestId('pattern-element-save').click();
  await expect(page.getByRole('button', { name: /מקם על מפה/ })).toBeVisible({ timeout: 15000 });

  const patterns = await (await request.get(`${API}/airfield-patterns?airfield_id=${airfieldId}`)).json();
  const withEl = patterns.filter((p: { elements: unknown[] }) => p.elements.length > 0);
  expect(withEl).toHaveLength(1);
  expect(withEl[0].elements[0].name).toBe('נקודת דיווח צפון');
  expect(withEl[0].elements[0].icon).toBe('🚩');
});
