import { Page, expect } from '@playwright/test';

/**
 * מסך הכניסה עובד מול מיראז' בלבד (מספר אישי + סיסמה) - אין רשימת משתמשים מקומית.
 * לכן הבדיקות מזדהות דרך מיראז' עם משתמש בדיקות ייעודי שנוצר בהרצה (idempotent).
 * בורר הסביבה נשאר על ברירת המחדל (סביבה 1 - טסה, סכמת public).
 */
const MIRAGE_URL = process.env.MIRAGE_URL || 'http://127.0.0.1:7300';

// משתמש בדיקות במיראז': admin (רואה את כל העמדות), בלי הגבלת עמדות.
// הסיסמה עומדת במדיניות מיראז' (12+ תווים, אות גדולה/קטנה, ספרה, תו מיוחד).
export const E2E_MIRAGE_USER = {
  personalNumber: '9000001',
  firstName: 'בודק',
  lastName: 'אוטומטי',
  password: 'Qx7!vRt2mZp9',
  apps: { 'SKY-KING': ['admin'] },
};

let userEnsured = false;

/** יוצר (או מרענן) את משתמש הבדיקות במיראז' - כך שהסיסמה ידועה וההרשאות קבועות */
export async function ensureMirageE2EUser() {
  if (userEnsured) return;
  const { personalNumber, firstName, lastName, password, apps } = E2E_MIRAGE_USER;
  const json = { 'Content-Type': 'application/json' };
  const res = await fetch(`${MIRAGE_URL}/api/users`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ personalNumber, firstName, lastName, password, apps }),
  });
  if (res.status === 409) {
    // קיים מהרצה קודמת - מרעננים סיסמה והרשאות כדי שהכניסה תהיה דטרמיניסטית
    const upd = await fetch(`${MIRAGE_URL}/api/users/${personalNumber}`, {
      method: 'PUT',
      headers: json,
      body: JSON.stringify({ firstName, lastName, password, apps }),
    });
    if (!upd.ok) throw new Error(`mirage: עדכון משתמש הבדיקות נכשל (${upd.status})`);
  } else if (!res.ok) {
    throw new Error(`mirage: יצירת משתמש הבדיקות נכשלה (${res.status}) - האם שירות מיראז' רץ על ${MIRAGE_URL}?`);
  }
  userEnsured = true;
}

/** הזדהות במסך ה-LOGIN דרך מיראז' - עד המסך שאחריו (בחירת עמדה / ניהול) */
export async function identifyViaMirage(page: Page) {
  await ensureMirageE2EUser();
  await page.getByPlaceholder(/מספר אישי|Personal number/).fill(E2E_MIRAGE_USER.personalNumber);
  await page.getByPlaceholder(/סיסמה|Password/).fill(E2E_MIRAGE_USER.password);
  await page.getByRole('button', { name: /הזדהות|Identify/ }).click();
  // הזדהות מוצלחת - מופיע מסך הפעולות (בחירת עמדה)
  await expect(page.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }))
    .toBeVisible({ timeout: 20000 });
}

/**
 * כניסה לעמדת בקר (CTRL) - משמש כרשת ביטחון לבדיקות SectorDashboard.
 * מדמה בדיוק את זרימת המשתמש: גודל מסך → הזדהות מיראז' → בחירת עמדה → דילוג על התפקידים.
 */
export async function loginToWorkstation(page: Page, opts: { preset?: string; screenSize?: '15.6"' | '16"' | '18"' | '24"' } = {}) {
  await page.goto('/');

  // 1. גודל מסך (נדרש לפני כניסה). ברירת המחדל 15.6" = ‎--s:1‎; בדיקות שרגישות
  //    לסקייל (גרירה, מיקומי מצביע) מבקשות 24" = ‎--s:1.65‎ - עמדת היעד.
  await page.getByRole('button', { name: opts.screenSize ?? '15.6"' }).click();

  // 2. הזדהות מול מיראז'
  await identifyViaMirage(page);

  // 3. בחירת עמדה
  await page.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();

  // 4. עמדה מהרשימה (לא בורר הסביבה)
  const select = page.locator('select:not(#env-select)').first();
  await expect(select).toBeVisible();
  // ברירת מחדל: העמדה הראשונה שאינה שארית בדיקות (שם שמתחיל ב-__) — אחרת
  // שאריות מהרצות קודמות (דסקי משימה) נבחרות ומסך הבקר בכלל לא נטען
  const presetName = opts.preset ?? (await select.locator('option:not([disabled])').evaluateAll(
    opts => (opts as HTMLOptionElement[]).map(o => (o.textContent || '').trim()).find(n => n && !n.startsWith('__')) || null
  ))!;
  expect(presetName, 'לא נמצאה עמדה זמינה לכניסה').toBeTruthy();
  await select.selectOption({ label: presetName.trim() });

  // 5. מודל התפקידים → דלג
  const skip = page.getByRole('button', { name: /^דלג$|^Skip$/ });
  await skip.click();

  // 6. הגענו לדשבורד — הלוגין נעלם
  await expect(page.getByText(/מערכת ניהול אווירי טקטי|Tactical Air Management/)).toHaveCount(0, { timeout: 15000 });

  // 7. ממתינים שמסך הטעינה ייעלם — אחרת נצלם splash ולא את המסך התפעולי
  await expect(page.getByText(/המערכת בטעינה|System loading/)).toHaveCount(0, { timeout: 45000 });
  await page.waitForLoadState('networkidle').catch(() => {}); // polling רץ תמיד — לא קריטי
  return presetName.trim();
}
