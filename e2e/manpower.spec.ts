import { test, expect } from '@playwright/test';
import { identifyViaMirage, loginToWorkstation, setScreenSize, E2E_MIRAGE_USER } from './helpers';

// כ"א ותחקירים — אימות ריצה אמיתי של השרשרת המלאה:
//   1. כניסה לעמדה פותחת משמרת, ויציאה סוגרת אותה (זמן כניסה + זמן סיום)
//   2. תפקיד "כח אדם" במיראז' פותח את הכפתור במסך ה-LOGIN
//   3. הטופס מציג שני כפתורים, וכל אחד פותח את המסך שלו
//   4. מסך הכשירויות מציג את המשמרת שנרשמה, כולל מעבר לגרף

const MIRAGE = process.env.MIRAGE_URL || 'http://127.0.0.1:7300';
const API = 'http://localhost:3001/api';
const JSON_H = { 'Content-Type': 'application/json' };
const HR_USER = {
  personalNumber: '9200001',
  firstName: 'כוח',
  lastName: 'אדם',
  password: 'Qx7!vRt2mZp9',
};

// PNG 1x1 - מספיק כדי לאמת שהתמונה נמשכת ומוצגת בהרחבה
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** נכנס למסך התחקירים של כ"א (מזדהה כמשתמש כח אדם) */
async function openDebriefs(page: any) {
  await ensureHrUser();
  await setScreenSize(page);
  await page.goto('/');
  await page.getByPlaceholder(/מספר אישי|Personal number/).fill(HR_USER.personalNumber);
  await page.getByPlaceholder(/סיסמה|Password/).fill(HR_USER.password);
  await page.getByRole('button', { name: /הזדהות|Identify/ }).click();
  const manpowerBtn = page.getByRole('button', { name: /כ"א ותחקירים/ });
  await expect(manpowerBtn).toBeVisible({ timeout: 20000 });
  await manpowerBtn.click();
  await page.getByRole('button', { name: /^📋 תחקירים/ }).click();
  await expect(page.getByRole('button', { name: 'נקה סינון' })).toBeVisible({ timeout: 15000 });
}

async function ensureUser(user: typeof HR_USER, roles: string[]) {
  const body = JSON.stringify({
    ...user,
    apps: { 'SKY-KING': { roles, workstations: [], positions: [] } },
  });
  const res = await fetch(`${MIRAGE}/api/users`, { method: 'POST', headers: JSON_H, body });
  if (res.status === 409) {
    await fetch(`${MIRAGE}/api/users/${user.personalNumber}`, { method: 'PUT', headers: JSON_H, body });
  }
}

async function ensureHrUser() {
  await ensureUser(HR_USER, ['manpower']);
}

test.describe('כ"א ותחקירים', () => {
  test('משמרת עמדה נפתחת בכניסה ונסגרת ביציאה', async ({ page, request }) => {
    const presetName = await loginToWorkstation(page);

    // המשמרת נפתחה — מקטע פתוח לעמדה, בלי זמן סיום
    await expect.poll(async () => {
      const rows = await (await request.get('http://localhost:3001/api/station-sessions')).json();
      return rows.some((r: any) => r.preset_name === presetName && r.open);
    }, { timeout: 20000 }).toBe(true);

    // יציאה מהעמדה
    await page.getByRole('button', { name: /בודק אוטומטי|משתמש/ }).first().click();
    await page.getByRole('button', { name: /יציאה|Log out/ }).click();

    // המקטע נסגר — יש זמן סיום, ואין יותר מקטע פתוח לאותה עמדה
    await expect.poll(async () => {
      const rows = await (await request.get('http://localhost:3001/api/station-sessions')).json();
      const mine = rows.filter((r: any) => r.preset_name === presetName);
      return mine.length > 0 && !mine.some((r: any) => r.open) && !!mine[0].exited_at;
    }, { timeout: 20000 }).toBe(true);
  });

  test('תפקיד כח אדם פותח את מסך התחקירים והכשירויות', async ({ page }) => {
    await ensureHrUser();
    await setScreenSize(page);
    await page.goto('/');

    await page.getByPlaceholder(/מספר אישי|Personal number/).fill(HR_USER.personalNumber);
    await page.getByPlaceholder(/סיסמה|Password/).fill(HR_USER.password);
    await page.getByRole('button', { name: /הזדהות|Identify/ }).click();

    const manpowerBtn = page.getByRole('button', { name: /כ"א ותחקירים/ });
    await expect(manpowerBtn).toBeVisible({ timeout: 20000 });
    await manpowerBtn.click();

    // טופס הביניים — שני כפתורים
    const debriefsBtn = page.getByRole('button', { name: /^📋 תחקירים/ });
    const competencyBtn = page.getByRole('button', { name: /^⏱ כשירויות/ });
    await expect(debriefsBtn).toBeVisible({ timeout: 20000 });
    await expect(competencyBtn).toBeVisible();

    // תחקירים — טבלה עם סינון וקיבוץ.
    // התוויות עוטפות את הבורר עצמו (<label><select>), ולכן getByText exact לא
    // תופס אותן — נבדקות דרך הבוררים ודרך כותרות הטבלה.
    await debriefsBtn.click();
    await expect(page.getByRole('button', { name: 'נקה סינון' })).toBeVisible({ timeout: 15000 });
    // 5 בוררים: עמדה · סיווג · נרשם ע"י · מעורבים · קיבוץ לפי
    await expect(page.getByRole('combobox')).toHaveCount(5);
    for (const col of ['עמדה', 'סיווג', 'מהות', 'מעורבים', 'נרשם ע"י']) {
      await expect(page.getByRole('columnheader', { name: col })).toBeVisible();
    }
    // קיבוץ בפועל — בחירת "עמדה" מקבצת את הרשומות
    await page.getByRole('combobox').last().selectOption({ label: 'עמדה' });
    await expect(page.getByText(/רשומות:/).first()).toBeVisible();

    // חזרה ואז כשירויות — המשמרת מהבדיקה הקודמת מופיעה
    await page.getByRole('button', { name: /↩ חזרה/ }).click();
    await competencyBtn.click();
    await expect(page.getByText(E2E_MIRAGE_USER.firstName, { exact: false }).first())
      .toBeVisible({ timeout: 20000 });
    await expect(page.getByText('זמן כניסה', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('זמן יציאה', { exact: true }).first()).toBeVisible();

    // מעבר לגרף — בורר התקופה מופיע והגרף מצויר
    await page.getByRole('button', { name: /📊 גרף/ }).first().click();
    for (const b of ['ימים', 'שבועות', 'חודשים', 'שנים']) {
      await expect(page.getByRole('button', { name: b })).toBeVisible();
    }
    await expect(page.locator('svg rect').first()).toBeVisible();
  });

  // הרחבת תחקיר — הטבלה מציגה רק את עמודות הסינון; כל השאר (צוות, פירוט,
  // אחריות, תמונת העמדה) נפתח בלחיצה על השורה. התמונה נמשכת בפתיחה בלבד.
  // הערה: אין endpoint למחיקת תחקיר, ולכן שורת הבדיקה נשארת ב-DB - מסומנת __.
  test('הרחבת תחקיר מציגה את כל הנתונים ואת תמונת העמדה', async ({ page, request }) => {
    const stamp = String(Date.now()).slice(-6);
    const essence = `__בדיקת הרחבה ${stamp}`;
    const created = await request.post(`${API}/debriefs`, {
      data: {
        preset_name: `__עמדת בדיקה ${stamp}`,
        crew: { bakar: `בקר בדיקה ${stamp}`, achori: `אחורי בדיקה ${stamp}`, kshp: '77' },
        essence,
        severity: 'light',
        details: `פירוט בדיקה ${stamp}`,
        responsibility: `אחריות בדיקה ${stamp}`,
        involved: [{ type: 'squadron', value: `טייסת ${stamp}` }],
        screenshot: TINY_PNG,
        event_time: new Date().toISOString(),
        created_by: 'בודק אוטומטי',
      },
    });
    expect(created.ok()).toBeTruthy();

    await openDebriefs(page);

    // שורת התחקיר — מכווצת: הפירוט והצוות אינם מוצגים
    const row = page.getByRole('row').filter({ hasText: essence });
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(`פירוט בדיקה ${stamp}`)).toHaveCount(0);

    // הרחבה — כל הנתונים נפתחים
    await row.click();
    await expect(page.getByText(`בקר בדיקה ${stamp}`)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(`אחורי בדיקה ${stamp}`)).toBeVisible();
    await expect(page.getByText(`פירוט בדיקה ${stamp}`)).toBeVisible();
    await expect(page.getByText(`אחריות בדיקה ${stamp}`)).toBeVisible();

    // התמונה נמשכה מהשרת ומוצגת
    const img = page.locator('img[data-testid="debrief-screenshot"]');
    await expect(img).toBeVisible({ timeout: 10000 });
    await expect(img).toHaveAttribute('src', /^data:image\//);

    // לחיצה על התמונה פותחת אותה בגודל מלא, Esc סוגר
    await img.click();
    const zoom = page.locator('[data-testid="debrief-zoom"]');
    await expect(zoom).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(zoom).toHaveCount(0);

    // כיווץ — הנתונים נסגרים בחזרה
    await row.click();
    await expect(page.getByText(`פירוט בדיקה ${stamp}`)).toHaveCount(0);
  });

  // כח אדם היא הרשאה **נוספת**: היא מצטרפת לתפקיד הבסיסי ולא מחליפה אותו,
  // ולכן מנהל + כ"א חייב לראות גם את כפתורי הניהול וגם את כפתור הכ"א.
  test('מנהל + כח אדם רואה את שני סוגי הכפתורים', async ({ page }) => {
    const ADMIN_HR = { ...HR_USER, personalNumber: '9200002', firstName: 'מנהל', lastName: 'וכוח אדם' };
    await ensureUser(ADMIN_HR, ['admin', 'manpower']);
    try {
      await setScreenSize(page);
      await page.goto('/');
      await page.getByPlaceholder(/מספר אישי|Personal number/).fill(ADMIN_HR.personalNumber);
      await page.getByPlaceholder(/סיסמה|Password/).fill(ADMIN_HR.password);
      await page.getByRole('button', { name: /הזדהות|Identify/ }).click();

      // הרשאת הניהול נשמרה
      await expect(page.getByRole('button', { name: /ניהול מערכת|Manage system/ })).toBeVisible({ timeout: 20000 });
      // וגם הרשאת הכ"א נוספה עליה
      await expect(page.getByRole('button', { name: /כ"א ותחקירים/ })).toBeVisible();
    } finally {
      await fetch(`${MIRAGE}/api/users/${ADMIN_HR.personalNumber}`, { method: 'DELETE' }).catch(() => {});
    }
  });
});
