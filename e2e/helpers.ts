import { Page, expect } from '@playwright/test';
import { deflateSync } from 'zlib';

/**
 * מסך הכניסה עובד מול מיראז' בלבד (מספר אישי + סיסמה) - אין רשימת משתמשים מקומית.
 * לכן הבדיקות מזדהות דרך מיראז' עם משתמש בדיקות ייעודי שנוצר בהרצה (idempotent).
 * בורר הסביבה נשאר על ברירת המחדל (סביבה 1 - טסה, סכמת public).
 */
const MIRAGE_URL = process.env.MIRAGE_URL || 'http://127.0.0.1:7300';
const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

export type ScreenSize = '15.6"' | '16"' | '18"' | '24"';

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

/**
 * יוצר (או מרענן) את משתמש הבדיקות במיראז' - כך שהסיסמה ידועה וההרשאות קבועות.
 *
 * מאז הוספת האימות למיראז' (SK-54) ניהול המשתמשים דורש אסימון מנהל, ולכן
 * הזרימה כאן היא בדיוק זו של פריסה אמיתית:
 *   1. bootstrap - יצירת המנהל הראשון (עובד רק כשאין עדיין מנהל עם סיסמה)
 *   2. login     - קבלת אסימון מנהל
 *   3. CRUD      - עם האסימון
 * הבדיקות עוברות דרך אותם שערים כמו המשתמש, ולא דרך דלת אחורית - אחרת הן
 * היו ממשיכות לעבור גם אם השער היה נשבר.
 */
export async function ensureMirageE2EUser() {
  if (userEnsured) return;
  const { personalNumber, firstName, lastName, password, apps } = E2E_MIRAGE_USER;
  const json = { 'Content-Type': 'application/json' };

  // 1. אתחול ראשוני. 409 = כבר קיים מנהל מהרצה קודמת, וזה תקין.
  const boot = await fetch(`${MIRAGE_URL}/api/admin/bootstrap`, {
    method: 'POST', headers: json,
    body: JSON.stringify({ personalNumber, firstName, lastName, password }),
  }).catch(() => null);
  if (!boot) throw new Error(`mirage: אין מענה על ${MIRAGE_URL} - האם השירות רץ?`);
  if (!boot.ok && boot.status !== 409) {
    throw new Error(`mirage: אתחול המנהל הראשון נכשל (${boot.status})`);
  }

  // 2. אסימון מנהל
  const login = await fetch(`${MIRAGE_URL}/api/admin/login`, {
    method: 'POST', headers: json,
    body: JSON.stringify({ personalNumber, password }),
  });
  if (!login.ok) throw new Error(`mirage: הזדהות משתמש הבדיקות נכשלה (${login.status})`);
  const { token } = await login.json();
  const authed = { ...json, Authorization: `Bearer ${token}` };

  // 3. רענון ההרשאות - ה-bootstrap קבע admin, וכאן מיישרים לשאר השדות
  const upd = await fetch(`${MIRAGE_URL}/api/users/${personalNumber}`, {
    method: 'PUT', headers: authed,
    body: JSON.stringify({ firstName, lastName, password, apps }),
  });
  if (!upd.ok) throw new Error(`mirage: עדכון משתמש הבדיקות נכשל (${upd.status})`);
  userEnsured = true;
}

/**
 * כותרות לבדיקות שפונות ל-API **ישירות** (הקמת נתונים ב-beforeAll, ניקוי).
 *
 * מאז שכבת האימות (SK-01) כל נתיב מידע מחזיר 401 בלי אסימון, ובדיקות ששלחו
 * `request` חשוף קיבלו 401 בשקט בהקמה ונפלו אחר כך על "השדה לא נמצא". האסימון
 * מגיע מאותו שער כמו של המשתמש - `/api/auth/mirage-login` - ולא מדלת אחורית.
 */
export async function apiAuthHeaders(): Promise<Record<string, string>> {
  await ensureMirageE2EUser();
  const res = await fetch(`${API_URL}/auth/mirage-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalNumber: E2E_MIRAGE_USER.personalNumber,
      password: E2E_MIRAGE_USER.password,
    }),
  }).catch(() => null);
  if (!res || !res.ok) {
    throw new Error(`SKY-KING: הזדהות ל-API נכשלה (${res ? res.status : 'אין מענה'})`);
  }
  const { token } = await res.json();
  if (!token) throw new Error('SKY-KING: הזדהות הצליחה אך לא הוחזר אסימון');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/**
 * קובע את גודל המסך לבדיקה. אין בורר ידני במסך הכניסה - סקריפט ה-boot ב-index.html
 * קורא את `bt-screenSize` מה-localStorage (ואם אין, מזהה לפי אלכסון המסך בפועל).
 * לכן חייבים לקרוא לזה **לפני** ה-goto הראשון; ה-init script חל גם על רענונים.
 */
export async function setScreenSize(page: Page, size: ScreenSize = '15.6"') {
  await page.addInitScript((v) => { localStorage.setItem('bt-screenSize', v); }, size.replace('"', ''));
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
 * בוחר עמדה מבורר העמדות (רשימה מקובצת לפי בסיס אב, קטגוריות סגורות בפתיחה).
 * מניח שמודל "בחירת עמדה" כבר פתוח. מחזיר את שם העמדה שנבחרה.
 *
 * `name` - התאמה מדויקת ואם אין, התאמה חלקית (שם עמדה עשוי לכלול סיומת).
 * בלי `name` - העמדה הראשונה שאינה שארית בדיקות (שם שמתחיל ב-__), אחרת
 * שאריות מהרצות קודמות (דסקי משימה) נבחרות ומסך הבקר בכלל לא נטען.
 */
export async function pickWorkstation(page: Page, name?: string): Promise<string> {
  const picker = page.locator('[data-testid="station-picker"]');
  await expect(picker).toBeVisible({ timeout: 20000 });

  // הקטגוריות סגורות כברירת מחדל - פותחים את כולן לפני החיפוש.
  // (בסיס אב יחיד → אין כותרות כלל והרשימה כבר פתוחה)
  const headers = picker.locator('[data-testid="station-group"]');
  for (let i = 0; i < await headers.count(); i++) {
    const h = headers.nth(i);
    if (await h.getAttribute('aria-expanded') !== 'true') await h.click();
  }

  const options = picker.locator('[data-testid="station-option"]');
  await expect(options.first()).toBeVisible();
  // מחזיר **אינדקס** ולא סלקטור: שמות עמדות מכילים גרשיים (יב"א) ושוברים
  // סלקטור מסוג [data-station-name="..."]
  const hit = await options.evaluateAll((els, want) => {
    const names = els.map(e => (e.getAttribute('data-station-name') || '').trim());
    const i = !want
      ? names.findIndex(n => n && !n.startsWith('__'))
      : (names.indexOf(want) >= 0 ? names.indexOf(want) : names.findIndex(n => n.includes(want)));
    return i < 0 ? null : { index: i, name: names[i] };
  }, name || null);
  expect(hit, `לא נמצאה עמדה זמינה לכניסה${name ? ` בשם "${name}"` : ''}`).toBeTruthy();

  await options.nth(hit!.index).click();
  return hit!.name;
}

/**
 * כניסה לעמדת בקר (CTRL) - משמש כרשת ביטחון לבדיקות SectorDashboard.
 * מדמה בדיוק את זרימת המשתמש: הזדהות מיראז' → בחירת עמדה → דילוג על התפקידים.
 */
export async function loginToWorkstation(page: Page, opts: { preset?: string; screenSize?: ScreenSize } = {}) {
  // 1. גודל מסך - נכתב ל-localStorage לפני הטעינה. ברירת המחדל 15.6" = ‎--s:1‎;
  //    בדיקות שרגישות לסקייל (גרירה, מיקומי מצביע) מבקשות 24" = ‎--s:1.65‎ - עמדת היעד.
  await setScreenSize(page, opts.screenSize);

  await page.goto('/');

  // 2. הזדהות מול מיראז'
  await identifyViaMirage(page);

  // 3. בחירת עמדה
  await page.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();

  // 4. עמדה מהרשימה המקובצת לפי בסיס אב
  const presetName = await pickWorkstation(page, opts.preset);

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

/**
 * מפת בדיקה כ-data URI, **נוצרת בקוד**: בדיקה שנשענת על קובץ fixture חיצוני
 * נשברת ברגע שהקובץ אינו ב-repo (וזה מה שקרה). ברירת המחדל 4:3 בכוונה - יחס
 * שאינו 1 חושף עיוות של גאומטריה שאינה מתקנת את יחס התמונה.
 */
export function makeTestMapPng(width = 640, height = 480): string {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const g = (Math.floor(x / 40) + Math.floor(y / 40)) % 2 ? 34 : 26;
      raw[o++] = g; raw[o++] = g + 8; raw[o++] = g + 18;
    }
  }
  const table = [...Array(256)].map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xFFFFFFFF;
    for (const x of b) c = table[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return 'data:image/png;base64,' + png.toString('base64');
}
