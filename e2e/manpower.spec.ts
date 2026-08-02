import { test, expect } from '@playwright/test';
import { identifyViaMirage, loginToWorkstation, setScreenSize, E2E_MIRAGE_USER } from './helpers';

// כ"א ותחקירים — אימות ריצה אמיתי של השרשרת המלאה:
//   1. כניסה לעמדה פותחת משמרת, ויציאה סוגרת אותה (זמן כניסה + זמן סיום)
//   2. תפקיד "כח אדם" במיראז' פותח את הכפתור במסך ה-LOGIN
//   3. הטופס מציג שני כפתורים, וכל אחד פותח את המסך שלו
//   4. מסך הכשירויות מציג את המשמרת שנרשמה, כולל מעבר לגרף

const MIRAGE = process.env.MIRAGE_URL || 'http://127.0.0.1:7300';
const JSON_H = { 'Content-Type': 'application/json' };
const HR_USER = {
  personalNumber: '9200001',
  firstName: 'כוח',
  lastName: 'אדם',
  password: 'Qx7!vRt2mZp9',
};

async function ensureHrUser() {
  const body = JSON.stringify({
    ...HR_USER,
    apps: { 'SKY-KING': { roles: ['manpower'], workstations: [], positions: [] } },
  });
  const res = await fetch(`${MIRAGE}/api/users`, { method: 'POST', headers: JSON_H, body });
  if (res.status === 409) {
    await fetch(`${MIRAGE}/api/users/${HR_USER.personalNumber}`, { method: 'PUT', headers: JSON_H, body });
  }
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
});
