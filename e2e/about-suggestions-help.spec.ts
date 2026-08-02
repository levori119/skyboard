import { test, expect, Page } from '@playwright/test';
import { identifyViaMirage, loginToWorkstation, setScreenSize } from './helpers';

// ─── חלון "אודות": הערות והצעות + עזרה ────────────────────────────────────────
// הדרישה: בלחיצה על סמל המערכת נפתח חלון האודות. בו נוסף סעיף "הערות והצעות"
// שה-+ שלו פותח טופס (שם מלא, טלפון, יחידה, נושא, פירוט) שנשמר ב-DB עם תאריך
// ושעה אוטומטיים, וכפתור "עזרה" שפותח הסבר ממוספר על מה שמוצג **באותה עמדה**.

const API = 'http://localhost:3001/api';

/** פותח את חלון האודות מסמל המערכת בסרגל העליון */
async function openAbout(page: Page) {
  await page.locator('header.bt-topbar').getByText('SKY KING', { exact: true }).first().click();
  await expect(page.getByText(/^אודות$/)).toBeVisible();
}

test('חלון אודות: סעיף הערות והצעות, טופס מלא, ושמירה ל-DB עם חותמת זמן', async ({ page, request }) => {
  await loginToWorkstation(page);
  await openAbout(page);

  // הסעיף וה-+
  const section = page.getByText('הערות והצעות', { exact: true });
  await expect(section).toBeVisible();
  const plus = page.getByRole('button', { name: 'הצעה חדשה' });
  await expect(plus).toBeVisible();

  // הטופס — חמשת השדות מהדרישה
  await plus.click();
  const form = page.getByText('הצעה / הערה למערכת');
  await expect(form).toBeVisible();
  for (const ph of ['שם פרטי ומשפחה', 'מספר ליצירת קשר', 'היחידה שבה אתה משרת']) {
    await expect(page.getByPlaceholder(ph)).toBeVisible();
  }
  await expect(page.getByPlaceholder(/על מה ההצעה/)).toBeVisible();
  await expect(page.getByPlaceholder(/מה קורה היום/)).toBeVisible();

  // חובה: בלי פירוט אין שליחה
  const subject = `e2e-${Date.now()}`;
  await page.getByPlaceholder('שם פרטי ומשפחה').fill('בודק אוטומטי');
  await page.getByPlaceholder(/על מה ההצעה/).fill(subject);
  await page.getByRole('button', { name: /שלח הצעה/ }).click();
  await expect(page.getByText(/שדות חובה/)).toBeVisible();

  // שליחה מלאה
  await page.getByPlaceholder('מספר ליצירת קשר').fill('050-1112233');
  await page.getByPlaceholder('היחידה שבה אתה משרת').fill('יחידת בדיקה');
  await page.getByPlaceholder(/מה קורה היום/).fill('פירוט מלא של ההצעה מבדיקת e2e');
  await page.getByRole('button', { name: /שלח הצעה/ }).click();
  await expect(page.getByText(/ההצעה נשלחה/)).toBeVisible();

  // הגיעה ל-DB, עם תאריך ושעה שנרשמו בשרת (ולא נשלחו מהלקוח)
  const res = await request.get(`${API}/suggestions`);
  expect(res.ok()).toBeTruthy();
  const rows = await res.json();
  const mine = rows.find((r: any) => r.subject === subject);
  expect(mine, 'ההצעה נשמרה ב-DB').toBeTruthy();
  expect(mine.full_name).toBe('בודק אוטומטי');
  expect(mine.unit).toBe('יחידת בדיקה');
  expect(mine.status).toBe('new');
  expect(new Date(mine.created_at).getTime(), 'created_at תקין וטרי')
    .toBeGreaterThan(Date.now() - 10 * 60 * 1000);
  expect(mine.preset_name, 'נרשמה העמדה ששלחה').toBeTruthy();

  await request.delete(`${API}/suggestions/${mine.id}`);
});

test('חלון עזרה: ממוספר, ומכסה רק את מה שמוצג בעמדה', async ({ page }) => {
  await loginToWorkstation(page);

  // מיפוי: כפתור בסרגל ↔ סעיף העזרה שלו. אם הכפתור לא הוגדר לעמדה — גם הסעיף
  // לא יופיע, וזו בדיוק הדרישה.
  const header = page.locator('header.bt-topbar');
  const pairs = [
    { toolbar: /דש בורד/, help: 'דש בורד מנהל' },
    { toolbar: /ספרורים/, help: 'ספרורים' },
    { toolbar: /כל המכלול/, help: 'כל המכלול' },
  ];
  const shown: boolean[] = [];
  for (const p of pairs) shown.push(await header.getByRole('button', { name: p.toolbar }).count() > 0);

  await openAbout(page);
  await page.getByRole('button', { name: /עזרה/ }).click();

  const win = page.getByTestId('help-modal');
  await expect(win).toBeVisible();

  // הספרור: הנושאים רצים ברצף מ-1, והמונה בכותרת סופר גם את הכפתורים שבתוכם
  const counterText = (await win.getByText(/^\d+ סעיפים$/).innerText()).trim();
  const total = Number(counterText.split(' ')[0]);
  const topicNums = (await win.getByTestId('help-num').allInnerTexts()).map(Number);
  expect(topicNums, 'ספרור הנושאים רץ ברצף מ-1')
    .toEqual(Array.from({ length: topicNums.length }, (_, i) => i + 1));
  expect(total, 'המונה כולל גם את הכפתורים שבתוך התפריטים').toBeGreaterThan(topicNums.length);

  // נושאים שתמיד מוצגים בכל עמדה — כולל תיאור המסך והמונחים
  const titles = win.getByTestId('help-title');
  for (const title of ['סמל המערכת (SKY KING)', 'תפריט תצוגה', 'הגדרות עמדה',
                       'חלון הפ"ממים', 'חלון העזרים', 'המפה - מה רואים עליה',
                       'סרגל הכלים של המפה', 'מונחים']) {
    await expect(titles.filter({ hasText: title })).toHaveCount(1);
  }

  // ההתאמה בין הסרגל לעזרה
  for (let i = 0; i < pairs.length; i++) {
    const inHelp = await titles.filter({ hasText: pairs[i].help }).count();
    expect(inHelp > 0, `"${pairs[i].help}" בעזרה = "${pairs[i].toolbar}" בסרגל`).toBe(shown[i]);
  }

  // פירוט הכפתורים בתוך תפריט: פתיחה מציגה סעיפי משנה ממוספרים n.m
  // סינון לפי הכותרת בלבד: "תפריט תצוגה" מוזכר גם בגוף של נושאים אחרים
  const viewRow = win.getByTestId('help-topic')
    .filter({ has: page.getByTestId('help-title').filter({ hasText: 'תפריט תצוגה' }) });
  await viewRow.getByRole('button', { name: /מה יש בתפריט/ }).click();
  const subTitles = win.getByTestId('help-subtitle');
  await expect(subTitles.filter({ hasText: 'לוח הודעות' })).toHaveCount(1);
  await expect(subTitles.filter({ hasText: 'תצוגת עמדות אחרות' })).toHaveCount(1);
  const subNums = await win.getByTestId('help-subnum').allInnerTexts();
  expect(subNums.length, 'יש סעיפי משנה פתוחים').toBeGreaterThan(2);
  for (const n of subNums) expect(n).toMatch(/^\d+\.\d+$/);

  // "פתח הכל" חושף את כל הכפתורים של כל התפריטים
  await win.getByRole('button', { name: 'פתח הכל' }).click();
  const allSubs = await win.getByTestId('help-subnum').count();
  expect(allSubs, 'כל הכפתורים מוצגים').toBe(total - topicNums.length);

  // מונחים: נקודת העברה מוסברת
  await expect(subTitles.filter({ hasText: 'נקודת העברה' }).first()).toBeVisible();

  // חיפוש מסנן גם לפי כפתור שבתוך תפריט
  const search = win.getByPlaceholder('חיפוש בעזרה');
  await search.fill('מפה עיוורת');
  await expect(titles.filter({ hasText: 'סמל המערכת' })).toHaveCount(0);
  await expect(subTitles.filter({ hasText: 'מפה עיוורת' })).toHaveCount(1);
});

test('מסך ניהול: ההצעות מוצגות למנהל המערכת עם תאריך ושעה וניתן לטפל בהן', async ({ page, request }) => {
  // הצעה שנשלחה מעמדה (כמו מהטופס), דרך אותו endpoint
  const subject = `e2e-admin-${Date.now()}`;
  const created = await request.post(`${API}/suggestions`, {
    data: {
      full_name: 'שולח מהשטח', phone: '052-9998877', unit: 'מרחבי בדיקה',
      subject, details: 'ההצעה צריכה להופיע ברשימת מנהל המערכת', preset_name: 'עמדת בדיקה',
    },
  });
  expect(created.ok()).toBeTruthy();
  const id = (await created.json()).id;

  await setScreenSize(page);
  await page.goto('/');
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /ניהול מערכת/ }).click();
  await page.getByRole('button', { name: 'הערות והצעות', exact: true }).click();

  // הרשומה ברשימה: נושא, שולח, יחידה, עמדה, סטטוס פתיחה ותאריך+שעה
  const card = page.getByTestId('suggestion-card').filter({ hasText: subject });
  await expect(card).toHaveCount(1);
  await expect(card.getByText(/שולח מהשטח/).first()).toBeVisible();
  await expect(card.getByText(/052-9998877/).first()).toBeVisible();
  await expect(card.getByText(/מרחבי בדיקה/).first()).toBeVisible();
  await expect(card.getByText(/עמדת בדיקה/).first()).toBeVisible();
  await expect(card.getByText(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/)).toBeVisible();

  // טיפול: שינוי סטטוס נשמר
  await card.getByRole('button', { name: 'בטיפול', exact: true }).click();
  await expect.poll(async () => {
    const rows = await (await request.get(`${API}/suggestions?status=in_review`)).json();
    return rows.some((r: any) => r.id === id);
  }).toBe(true);

  await request.delete(`${API}/suggestions/${id}`);
});
