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

test.describe.configure({ timeout: 180000, retries: 1 });
// retries: כניסה לעמדה חוזרת לשרת החי בכל בדיקה, ובהרצה רצופה היא לעיתים
// חורגת מה-15 שניות ש-loginToWorkstation ממתין. באג אמיתי נופל גם בניסיון החוזר.

/** מדליק את היכולת בעמדה - רק בתשובה שהדפדפן רואה, לא במאגר */
async function fakeContainerEnabled(page: Page) {
  const patch = (body: unknown): unknown => {
    if (Array.isArray(body)) return body.map(p => (p && typeof p === 'object' ? { ...p, show_window_container: true } : p));
    if (body && typeof body === 'object') return { ...(body as object), show_window_container: true };
    return body;
  };
  // ⚠ **רק `/config`, ובכוונה.** `myPresetConfig` הוא `livePresetConfig ?? הרשימה`,
  // ולכן די בנתיב הזה כדי להדליק את היכולת. תפיסת `/api/workstation-presets`
  // עצמו האטה את **הלוגין** - בורר העמדות ניזון מאותה רשימה - והבדיקות נפלו
  // על מסך הכניסה ולא על מה שהן בודקות.
  await page.route(url => /^\/api\/workstation-presets\/\d+\/config$/.test(new URL(url).pathname), async route => {
    try {
      const res = await route.fetch();
      const body = await res.json();
      await route.fulfill({ response: res, body: JSON.stringify(patch(body)), contentType: 'application/json' });
    } catch {
      await route.fallback();
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
    // מחנים אותו הרחק מהסרגל העליון: כשהוא חוזר לצוף הוא חוזר **בדיוק לכאן**,
    // ובמיקום ברירת המחדל (200,80) הוא היה מכסה את תפריט "תצוגה" עצמו
    await dragTo(page, center((await titleBar.boundingBox())!), { x: 420, y: 430 });
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

  test('חלון נכנס לראש הרשימה, נארז בגובה טבעי, וסדר מתחלף בגרירה', async ({ page }) => {
    await fakeContainerEnabled(page);
    await loginToWorkstation(page);
    await expect(container(page)).toBeVisible({ timeout: 20000 });

    // חלון ראשון - הדסק החופשי
    await page.locator('[data-help="notepad"]').click();
    await expect(page.getByTestId('notepad-title-bar')).toBeVisible();
    await dragTo(page, center((await page.getByTestId('notepad-title-bar').boundingBox())!), center((await container(page).boundingBox())!));
    await expect(slots(page)).toHaveCount(1, { timeout: 10000 });

    // נארז למעלה: חלון בודד **לא** מתנפח על כל גובה העמודה
    const cBox = (await container(page).boundingBox())!;
    const oneBox = (await slots(page).first().boundingBox())!;
    expect(oneBox.height, 'חלון בודד לא תופס את כל הגובה').toBeLessThan(cBox.height * 0.9);
    expect(oneBox.y - cBox.y, 'החלון צמוד לראש הקונטיינר').toBeLessThan(60);

    // חלון שני - לוח ההודעות
    await page.getByRole('button', { name: /תצוגה|View/ }).first().click();
    await page.getByText(/לוח הודעות|Message board/).first().click();
    const board = page.getByText(/הודעות שלי|My messages/).first();
    await expect(board).toBeVisible({ timeout: 10000 });
    // שחרור בשטח הריק שמתחת למשבצת הקיימת
    await dragTo(page, center((await board.boundingBox())!), { x: cBox.x + cBox.width / 2, y: cBox.y + cBox.height - 30 });
    await expect(slots(page)).toHaveCount(2, { timeout: 10000 });

    const order = () => slots(page).evaluateAll(els => els.map(e => e.getAttribute('data-dock-slot')));
    const before = await order();
    // ⬅ החדש נכנס **לראש** הרשימה, גם כששוחרר בתחתית
    expect(before[0], 'החלון החדש נכנס למעלה').toBe('signalBoard');

    // שתי המשבצות צמודות זו לזו מלמעלה, בלי מתיחה לגובה שווה
    const [b0, b1] = await slots(page).evaluateAll(els => els.map(e => {
      const r = e.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    }));
    expect(b1.top - b0.bottom, 'המשבצת השנייה צמודה לראשונה').toBeLessThan(12);

    // גרירת המשבצת השנייה מעל אמצע הראשונה - החלפת סדר
    const secondHeader = slots(page).nth(1).locator('> div').first();
    const firstBox = (await slots(page).first().boundingBox())!;
    await dragTo(page, center((await secondHeader.boundingBox())!), { x: firstBox.x + firstBox.width / 2, y: firstBox.y + 4 });

    await expect.poll(order, { timeout: 10000 }).toEqual([before[1], before[0]]);
  });

  test('עגינה לא הורסת את המיקום הצף - החלון חוזר בדיוק לאן שהיה', async ({ page }) => {
    await fakeContainerEnabled(page);
    await loginToWorkstation(page);
    await expect(container(page)).toBeVisible({ timeout: 20000 });

    await page.locator('[data-help="notepad"]').click();
    const bar = page.getByTestId('notepad-title-bar');
    await expect(bar).toBeVisible();

    // מזיזים אותו למקום מוגדר, וזוכרים אותו
    await dragTo(page, center((await bar.boundingBox())!), { x: 360, y: 300 });
    const parked = (await bar.boundingBox())!;

    // עגינה, ואז שחרור ב-↗ (בלי מצביע להסתמך עליו)
    await dragTo(page, center((await bar.boundingBox())!), center((await container(page).boundingBox())!));
    await expect(slots(page)).toHaveCount(1, { timeout: 10000 });
    await container(page).getByTitle(/החזר לחלון צף|Back to floating window/).click();
    await expect(slots(page)).toHaveCount(0, { timeout: 10000 });

    // ⬅ חזר בדיוק למקום שבו חנה לפני העגינה, ולא לנקודת השחרור בקונטיינר
    const restored = (await bar.boundingBox())!;
    expect(Math.abs(restored.x - parked.x), 'אותו X').toBeLessThan(4);
    expect(Math.abs(restored.y - parked.y), 'אותו Y').toBeLessThan(4);
  });

  test('בורר המיקום מזיז את הקונטיינר בין העמודות', async ({ page }) => {
    await fakeContainerEnabled(page);
    await loginToWorkstation(page);
    await expect(container(page)).toBeVisible({ timeout: 20000 });

    const mapBox = async () => (await page.locator('#sidebar-area').boundingBox());
    const aidsBox = async () => (await page.locator('[data-help="aidsPanel"]').boundingBox());

    /** בוחר מיקום מהבורר שבתפריט "תצוגה" ומחזיר את המיקום החדש של הקונטיינר */
    const pick = async (pos: string) => {
      await page.getByRole('button', { name: /תצוגה|View/ }).first().click();
      // הבורר מקופל בפתיחה הראשונה; אחרי שנפתח הוא נשאר פתוח לפתיחות הבאות
      // של התפריט, ולכן פותחים אותו רק כשהוא באמת סגור.
      if (await page.getByTestId(`dock-pos-${pos}`).count() === 0) {
        await page.getByTestId('dock-position-toggle').click();
      }
      await page.getByTestId(`dock-pos-${pos}`).click();
      await expect(container(page)).toBeVisible();
      return (await container(page).boundingBox())!;
    };

    // ברירת המחדל: בין הפ"מים לעזרים
    const strips = await mapBox();
    const aids = await aidsBox();
    const dflt = (await container(page).boundingBox())!;
    if (strips) expect(strips.x).toBeLessThan(dflt.x);
    if (aids) expect(aids.x).toBeGreaterThan(dflt.x);

    // הכי שמאלי - לפני כל שאר העמודות
    const left = await pick('left');
    if (strips) expect(left.x, 'הכי שמאלי - לפני הפ"מים').toBeLessThan(strips.x);
    expect(left.x, 'צמוד לקצה השמאלי').toBeLessThan(60);

    // הכי ימני - אחרי העזרים
    const right = await pick('right');
    const aidsNow = await aidsBox();
    if (aidsNow) expect(right.x, 'הכי ימני - אחרי העזרים').toBeGreaterThan(aidsNow.x);

    // צמוד למפה - לפני הפ"מים, אבל לא בקצה
    const mapRight = await pick('mapRight');
    const stripsNow = await mapBox();
    if (stripsNow) expect(mapRight.x, 'לפני הפ"מים').toBeLessThan(stripsNow.x);
    expect(mapRight.x, 'לא בקצה השמאלי').toBeGreaterThan(left.x);

    // חזרה לברירת המחדל - הבורר עובד לשני הכיוונים
    const back = await pick('beforeAids');
    const stripsBack = await mapBox();
    const aidsBack = await aidsBox();
    if (stripsBack) expect(stripsBack.x).toBeLessThan(back.x);
    if (aidsBack) expect(aidsBack.x).toBeGreaterThan(back.x);
    // (השמירה בין רענונים נבדקת ב-windowDock.test.ts - רענון כאן מאבד את הסשן)
  });

  test('הרחבת הקונטיינר מסדרת את החלונות אחד ליד השני', async ({ page }) => {
    await fakeContainerEnabled(page);
    await loginToWorkstation(page);
    await expect(container(page)).toBeVisible({ timeout: 20000 });

    // שני חלונות בקונטיינר
    await page.locator('[data-help="notepad"]').click();
    await expect(page.getByTestId('notepad-title-bar')).toBeVisible();
    await dragTo(page, center((await page.getByTestId('notepad-title-bar').boundingBox())!), center((await container(page).boundingBox())!));
    await expect(slots(page)).toHaveCount(1, { timeout: 10000 });

    await page.getByRole('button', { name: /תצוגה|View/ }).first().click();
    await page.getByText(/לוח הודעות|Message board/).first().click();
    const board = page.getByText(/הודעות שלי|My messages/).first();
    await expect(board).toBeVisible({ timeout: 10000 });
    await dragTo(page, center((await board.boundingBox())!), center((await container(page).boundingBox())!));
    await expect(slots(page)).toHaveCount(2, { timeout: 10000 });

    const rows = async () => slots(page).evaluateAll(els => els.map(e => {
      const r = e.getBoundingClientRect();
      return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width) };
    }));

    // ברוחב ההתחלתי - זה מתחת לזה
    const narrow = await rows();
    expect(narrow[1].top, 'ברוחב רגיל: אחד מתחת לשני').toBeGreaterThan(narrow[0].top + 10);

    // מרחיבים את הקונטיינר בגרירת הספליטר שמאלה (הוא יושב בקצה הפנימי)
    const box = (await container(page).boundingBox())!;
    await dragTo(page, { x: box.x - 2, y: box.y + box.height / 2 }, { x: box.x - 300, y: box.y + box.height / 2 });

    // ממתינים שהרוחב החדש ייכנס לרינדור לפני שמודדים את השורות
    await expect
      .poll(async () => (await container(page).boundingBox())!.width, { timeout: 10000 })
      .toBeGreaterThan(box.width + 100);

    // ⬅ הליבה: אותה שורה, זה לצד זה
    await expect.poll(async () => {
      const r = await rows();
      return Math.abs(r[1].top - r[0].top);
    }, { timeout: 10000 }).toBeLessThan(6);

    const wide = await rows();
    expect(wide[1].left, 'השני מימין לראשון').toBeGreaterThan(wide[0].left + 50);
  });

  test('בורר המיקום מקופל, והמשולש פותח אותו בלי לסגור את הקונטיינר', async ({ page }) => {
    await fakeContainerEnabled(page);
    await loginToWorkstation(page);
    await expect(container(page)).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: /תצוגה|View/ }).first().click();
    // מקופל כברירת מחדל - הסכמות לא על המסך
    await expect(page.getByTestId('dock-pos-left')).toHaveCount(0);

    // המשולש פותח - והקונטיינר **נשאר פתוח** (לחיצה על השורה הייתה סוגרת אותו)
    await page.getByTestId('dock-position-toggle').click();
    await expect(page.getByTestId('dock-pos-left')).toBeVisible();
    await expect(container(page)).toBeVisible();

    // ולחיצה נוספת מקפלת חזרה
    await page.getByTestId('dock-position-toggle').click();
    await expect(page.getByTestId('dock-pos-left')).toHaveCount(0);
    await expect(container(page)).toBeVisible();
  });
});
