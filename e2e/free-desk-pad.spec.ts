import { test, expect, type Page } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// משטח הדסק החופשי (FreeDeskPad) - משותף לדסק ולפתקיות. נבדק על הדסק בלבד:
// הוא לא כותב ל-DB, והפתקית משתמשת באותו רכיב בדיוק.

/** גרירה בעט/מגע - pointer events עם שלבי ביניים, אחרת pointermove לא נשלח */
async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 14 });
  await page.mouse.up();
}
const bar = (page: Page) => page.getByTestId('notepad-bg-bar');
const center = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

async function openDeskInBothMode(page: Page) {
  await loginToWorkstation(page);
  await page.locator('[data-help="notepad"]').click();
  await expect(page.getByTestId('notepad-title-bar')).toBeVisible();
  await bar(page).getByRole('button', { name: 'מקלדת וכתב יד', exact: true }).click();
  await expect(page.getByTestId('desk-pad-text')).toBeVisible();
  await expect(page.getByTestId('notepad-canvas')).toBeVisible();
}

test.describe('משטח הדסק החופשי', () => {
  // סוכן עמדה שרץ על המחשב (5100) חוטף את ה-API של הדפדפן, כולל ההזדהות
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('skyking.stationAgent', 'http://127.0.0.1:9'));
  });

  test('נגיעה באזור ההקלדה מקפיצה את המקלדת שעל המסך', async ({ page }) => {
    await openDeskInBothMode(page);
    const osk = page.getByRole('button', { name: 'CAPS' });
    await expect(osk).toHaveCount(0);
    await page.getByTestId('desk-pad-text').click();
    await expect(osk).toBeVisible();
    // הקלדה במקלדת שעל המסך נכנסת לדסק
    await page.getByRole('button', { name: 'ש', exact: true }).click();
    await expect(page.getByTestId('desk-pad-text')).toHaveValue('ש');
  });

  test('ספליטר משנה את הגובה בין המקלדת לכתב היד', async ({ page }) => {
    await openDeskInBothMode(page);
    const text = page.getByTestId('desk-pad-text');
    const before = (await text.boundingBox())!.height;
    const sp = (await page.getByTestId('desk-pad-splitter').boundingBox())!;
    await dragTo(page, center(sp), { x: center(sp).x, y: center(sp).y + 80 });
    await expect.poll(async () => (await text.boundingBox())!.height, { message: 'אזור ההקלדה גדל' }).toBeGreaterThan(before + 40);
  });

  test('היפוך מחליף את המקומות, ופריסה זה לצד זה מציבה אותם באותה שורה', async ({ page }) => {
    await openDeskInBothMode(page);
    const text = page.getByTestId('desk-pad-text');
    const canvasWrap = page.getByTestId('notepad-canvas').locator('..');
    expect((await text.boundingBox())!.y, 'בהתחלה המקלדת למעלה').toBeLessThan((await canvasWrap.boundingBox())!.y);

    await bar(page).getByRole('button', { name: /החלף מקומות/ }).click();
    await expect.poll(async () => (await canvasWrap.boundingBox())!.y < (await text.boundingBox())!.y, { message: 'אחרי היפוך כתב היד למעלה' }).toBe(true);

    await bar(page).getByRole('button', { name: 'זה לצד זה', exact: true }).click();
    await expect.poll(async () => Math.abs((await canvasWrap.boundingBox())!.y - (await text.boundingBox())!.y) < 40, { message: 'זה לצד זה' }).toBe(true);
    await page.getByTestId('notepad-title-bar').locator('..').screenshot({ path: 'test-results/free-desk-side.png' });

    // הסרגל הוא שורה אחת; רקע הדף נפתח כתפריט בשורה מתחתיו
    const barBox = (await bar(page).boundingBox())!;
    expect(barBox.height, 'הסרגל בשורה אחת').toBeLessThan(40);
    await expect(page.getByTestId('desk-pad-bg-row')).toHaveCount(0);
    await page.getByTestId('desk-pad-bg-menu').click();
    await expect(page.getByTestId('desk-pad-bg-row')).toBeVisible();
    await page.getByTestId('desk-pad-bg-row').getByRole('button', { name: /משבצות|Grid/ }).click();
    await page.getByTestId('notepad-title-bar').locator('..').screenshot({ path: 'test-results/free-desk-bg-menu.png' });
  });

  test('כתב היד נשאר אחרי מעבר למקלדת בלבד וחזרה', async ({ page }) => {
    await openDeskInBothMode(page);
    const inkPixels = () => page.getByTestId('notepad-canvas').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    });
    const wrap = (await page.getByTestId('notepad-canvas').locator('..').boundingBox())!;
    await dragTo(page, { x: wrap.x + wrap.width * 0.2, y: wrap.y + wrap.height * 0.4 }, { x: wrap.x + wrap.width * 0.7, y: wrap.y + wrap.height * 0.6 });
    const drawn = await inkPixels();
    expect(drawn, 'המשיכה צוירה').toBeGreaterThan(0);

    await bar(page).getByRole('button', { name: 'מקלדת', exact: true }).click();
    await expect(page.getByTestId('notepad-canvas')).toHaveCount(0);
    await bar(page).getByRole('button', { name: 'מקלדת וכתב יד', exact: true }).click();
    await expect.poll(inkPixels, { message: 'כתב היד שוחזר' }).toBeGreaterThan(drawn * 0.9);
  });
});
