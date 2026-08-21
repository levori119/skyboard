import { test, expect, type Page } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// ─── קונטיינר החלונות ─────────────────────────────────────────────────────────
// הפיצ'ר כולו הוא DOM וגרירה: חלון צף עובר ב-portal למשבצת בעמודה שבצד, מוקטן
// כדי למלא אותה, וחוזר לצוף כשגוררים אותו החוצה. tsc ובדיקות היחידה לא נוגעים
// באף אחד מאלה - רק דפדפן אמיתי כן.
//
// **בלי שום כתיבה ל-DB.** ההגדרה `show_window_container` מוזרקת ל**תשובת ה-API**
// בדרך לדפדפן (route interception) במקום להישמר על העמדה. כך הבדיקה רצה מול
// המאגר החי בלי לשנות בו עמדה - ובלי להשאיר שאריות אם היא נופלת באמצע.

test.describe.configure({ timeout: 180000 });

/** מדליק את היכולת בעמדה - רק בתשובה שהדפדפן רואה, לא במאגר */
async function fakeContainerEnabled(page: Page) {
  const patch = (body: unknown): unknown => {
    if (Array.isArray(body)) return body.map(p => (p && typeof p === 'object' ? { ...p, show_window_container: true } : p));
    if (body && typeof body === 'object') return { ...(body as object), show_window_container: true };
    return body;
  };
  await page.route('**/api/workstation-presets**', async route => {
    const res = await route.fetch();
    try {
      const body = await res.json();
      await route.fulfill({ response: res, body: JSON.stringify(patch(body)), contentType: 'application/json' });
    } catch {
      await route.fulfill({ response: res });
    }
  });
}

const container = (page: Page) => page.locator('[data-help="windowContainer"]');
const slots = (page: Page) => container(page).locator('[data-dock-slot]');
const emptyHint = (page: Page) => container(page).getByText(/גרור לכאן חלון צף|Drag a floating window here/);

/** מתג הקונטיינר בתפריט "תצוגה" */
async function toggleFromViewMenu(page: Page) {
  await page.getByRole('button', { name: /תצוגה|View/ }).first().click();
  await page.getByText(/קונטיינר חלונות|Window container/).first().click();
}

/** גרירה בעט/מגע - pointer events עם שלבי ביניים, אחרת pointermove לא נשלח */
async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 14 });
  await page.mouse.up();
}

const center = (b: { x: number; y: number; width: number; height: number }) =>
  ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

test.describe('קונטיינר החלונות', () => {
  test('עמדה שהיכולת מופעלת בה מציגה אותו בין הפ"מים לעזרים, והמתג בתצוגה סוגר', async ({ page }) => {
    await fakeContainerEnabled(page);
    await loginToWorkstation(page);

    // ברירת המחדל של העמדה = פתוח
    await expect(container(page)).toBeVisible({ timeout: 20000 });
    await expect(emptyHint(page)).toBeVisible();

    // הסדר בפריסה: פ"מים (order 4) → קונטיינר (5) → עזרים (6). נבדק על המיקום
    // בפועל ולא על ה-CSS - order הוא בדיוק מה שקל לשבור בלי לשים לב.
    const box = (await container(page).boundingBox())!;
    expect(box, 'לקונטיינר יש מקום על המסך').toBeTruthy();
    const strips = page.locator('#sidebar-area');
    if (await strips.count()) {
      const sb = await strips.boundingBox();
      if (sb) expect(sb.x, 'הפ"מים משמאל לקונטיינר (מְכל LTR)').toBeLessThan(box.x);
    }
    const aids = page.locator('[data-help="aidsPanel"]');
    if (await aids.count()) {
      const ab = await aids.boundingBox();
      if (ab) expect(ab.x, 'העזרים מימין לקונטיינר').toBeGreaterThan(box.x);
    }

    // המתג בתפריט "תצוגה" סוגר אותו
    await toggleFromViewMenu(page);
    await expect(container(page)).toHaveCount(0);

    // ופותח שוב
    await toggleFromViewMenu(page);
    await expect(container(page)).toBeVisible();
  });

  test('חלון צף נגרר פנימה, יושב שם באמת, ויוצא בגרירה החוצה', async ({ page }) => {
    await fakeContainerEnabled(page);
    await loginToWorkstation(page);
    await expect(container(page)).toBeVisible({ timeout: 20000 });

    // הדסק החופשי - חלון צף שקיים בכל עמדה ונפתח בכפתור אחד בסרגל
    await page.locator('[data-help="notepad"]').click();
    const titleBar = page.getByTestId('notepad-title-bar');
    await expect(titleBar).toBeVisible();

    await dragTo(page, center((await titleBar.boundingBox())!), center((await container(page).boundingBox())!));

    // מעוגן: נוצרה משבצת, והחלון עצמו **עבר פיזית** לתוכה (portal, לא העתק)
    await expect(slots(page)).toHaveCount(1, { timeout: 10000 });
    await expect(emptyHint(page)).toHaveCount(0);
    await expect(container(page).getByTestId('notepad-title-bar')).toHaveCount(1);

    // הגודל: החלון מוקטן כדי להיכנס למשבצת - לא גולש מחוץ לקונטיינר
    const cBox = (await container(page).boundingBox())!;
    const sBox = (await slots(page).first().boundingBox())!;
    expect(sBox.width, 'המשבצת נכנסת ברוחב הקונטיינר').toBeLessThanOrEqual(cBox.width + 1);
    expect(sBox.height, 'המשבצת נכנסת בגובה הקונטיינר').toBeLessThanOrEqual(cBox.height + 1);

    // שחרור: גרירת כותרת המשבצת אל מרכז המסך מחזירה את החלון לצוף
    const slotHeader = slots(page).first().locator('> div').first();
    await dragTo(page, center((await slotHeader.boundingBox())!), { x: 420, y: 380 });

    await expect(slots(page)).toHaveCount(0, { timeout: 10000 });
    await expect(emptyHint(page)).toBeVisible();
    // החלון חזר לצוף - הוא עדיין על המסך, רק לא בתוך הקונטיינר
    await expect(page.getByTestId('notepad-title-bar')).toBeVisible();
    await expect(container(page).getByTestId('notepad-title-bar')).toHaveCount(0);
  });

  test('סגירת הקונטיינר מחזירה את החלון לצוף, והסידור חוזר בפתיחה הבאה', async ({ page }) => {
    await fakeContainerEnabled(page);
    await loginToWorkstation(page);
    await expect(container(page)).toBeVisible({ timeout: 20000 });

    await page.locator('[data-help="notepad"]').click();
    const titleBar = page.getByTestId('notepad-title-bar');
    await expect(titleBar).toBeVisible();
    await dragTo(page, center((await titleBar.boundingBox())!), center((await container(page).boundingBox())!));
    await expect(slots(page)).toHaveCount(1, { timeout: 10000 });

    // סגירה מכפתור הכותרת
    await container(page).getByTitle(/סגור קונטיינר|Close container/).click();
    await expect(container(page)).toHaveCount(0);
    // החלון לא נעלם איתו - הוא חזר לצוף
    await expect(page.getByTestId('notepad-title-bar')).toBeVisible();

    // פתיחה מחדש - החלון חוזר למשבצת שלו
    await toggleFromViewMenu(page);
    await expect(container(page)).toBeVisible();
    await expect(slots(page)).toHaveCount(1, { timeout: 10000 });
    await expect(container(page).getByTestId('notepad-title-bar')).toHaveCount(1);
  });

  test('שני חלונות מתחלקים שווה בגובה, וסדרם מתחלף בגרירה', async ({ page }) => {
    await fakeContainerEnabled(page);
    await loginToWorkstation(page);
    await expect(container(page)).toBeVisible({ timeout: 20000 });

    const dockIn = async (handle: ReturnType<Page['getByTestId']>) => {
      await dragTo(page, center((await handle.boundingBox())!), center((await container(page).boundingBox())!));
    };

    // חלון ראשון - הדסק החופשי
    await page.locator('[data-help="notepad"]').click();
    await expect(page.getByTestId('notepad-title-bar')).toBeVisible();
    await dockIn(page.getByTestId('notepad-title-bar'));
    await expect(slots(page)).toHaveCount(1, { timeout: 10000 });

    // חלון שני - לוח ההודעות, נפתח מתפריט "תצוגה"
    await page.getByRole('button', { name: /תצוגה|View/ }).first().click();
    await page.getByText(/לוח הודעות|Message board/).first().click();
    const board = page.getByText(/הודעות שלי|My messages/).first();
    await expect(board).toBeVisible({ timeout: 10000 });
    await dragTo(page, center((await board.boundingBox())!), center((await container(page).boundingBox())!));
    await expect(slots(page)).toHaveCount(2, { timeout: 10000 });

    // הגודל נקבע פרופורציונלית: שתי משבצות = חצי גובה כל אחת
    const boxes = await slots(page).evaluateAll(els => els.map(e => e.getBoundingClientRect().height));
    expect(Math.abs(boxes[0] - boxes[1]), 'שתי המשבצות באותו גובה').toBeLessThan(2);

    const order = () => slots(page).evaluateAll(els => els.map(e => e.getAttribute('data-dock-slot')));
    const before = await order();
    expect(before).toHaveLength(2);

    // גרירת המשבצת השנייה מעל אמצע הראשונה - החלפת סדר
    const secondHeader = slots(page).nth(1).locator('> div').first();
    const firstBox = (await slots(page).first().boundingBox())!;
    await dragTo(page, center((await secondHeader.boundingBox())!), { x: firstBox.x + firstBox.width / 2, y: firstBox.y + 4 });

    await expect.poll(order, { timeout: 10000 }).toEqual([before[1], before[0]]);
  });
});
