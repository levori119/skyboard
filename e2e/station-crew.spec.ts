import { test, expect } from '@playwright/test';
import { loginToWorkstation, identifyViaMirage, pickWorkstation, setScreenSize } from './helpers';

// טופס חברי העמדה + תחקיר — אימות ריצה אמיתי (לא רק tsc/build):
//   1. הטופס נפתח בעליית העמדה עם הסדר הנכון ובלי שדות המושגח
//   2. דגל "קיים משגיח" פותח את שדה המושגח **בצד**, מיושר לשורת האב
//   3. "עדכון חברי העמדה" בתפריט המשתמש פותח את אותו טופס בעמדה החיה
//   4. "צור תחקיר" פותח את טופס התחקיר עם כל השדות

test.describe('חברי עמדה ותחקיר', () => {
  test('טופס הכניסה: סדר השדות, ומושגח נפתח רק אחרי סימון הדגל', async ({ page }) => {
    await setScreenSize(page);
    await page.goto('/');
    await identifyViaMirage(page);
    await page.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();

    await pickWorkstation(page);

    await expect(page.getByText(/כניסה לעמדה:/)).toBeVisible({ timeout: 20000 });
    // השדות נטענים אחרי הכותרת (fetch של חברי העמדה) — ממתינים להם לפני קריאת ה-DOM.
    // שדה קש"פ הוא גם האימות שהכיתוב שלו הוא מספר קשר פנים ולא שם.
    await expect(page.getByPlaceholder('הזן מספר קשר פנים')).toBeVisible({ timeout: 20000 });

    // בפתיחה ראשונה — אין שדות מושגח (הם לא תופסים מקום)
    await expect(page.getByText('מושגח', { exact: true })).toHaveCount(0);

    // הסדר: בקר → אחורי → מפעיל → מש"ק → קש"פ
    const ROLES = ['בקר', 'פקח', 'אחורי', 'מפעיל', 'מש"ק', 'קש"פ'];
    const rolesOnly = (await page.locator('label').evaluateAll(
      els => els.map(e => (e.textContent || '').trim())
    )).filter(l => ROLES.includes(l));
    expect(rolesOnly.length, 'לא נמצאו תוויות תפקידים בטופס').toBeGreaterThan(2);
    expect(rolesOnly[0]).toMatch(/בקר|פקח/);
    expect(rolesOnly[rolesOnly.length - 1]).toBe('קש"פ');

    // דגל "קיים משגיח" ראשון → שדה מושגח נפתח, ומיושר לשורת האב (אותו top)
    const flags = page.getByRole('checkbox');
    await flags.first().check();
    await expect(page.getByText('מושגח', { exact: true })).toBeVisible();

    const nameInputs = page.getByPlaceholder('שם');
    const parentBox = await nameInputs.nth(0).boundingBox();
    const supervisedBox = await nameInputs.nth(1).boundingBox();
    expect(parentBox && supervisedBox).toBeTruthy();
    // יישור: אותה שורה (סטייה של פיקסל בודד מותרת בעיגול)
    expect(Math.abs(parentBox!.y - supervisedBox!.y)).toBeLessThanOrEqual(1);

    // ביטול הדגל מסתיר את השדה בחזרה
    await flags.first().uncheck();
    await expect(page.getByText('מושגח', { exact: true })).toHaveCount(0);
  });

  // כניסה לעמדה = הרכב חדש. גם כשבעמדה שמורים אנשי המשמרת הקודמת, הטופס
  // נפתח נקי ורק שדה הבקר/פקח מתמלא במשתמש שנכנס - אחרת הנכנס היה צריך
  // למחוק שדה-שדה, מסלול שקט לרישום צוות שגוי.
  test('כניסה מחודשת: הטופס נפתח נקי, רק הבקר/פקח שנכנס', async ({ page }) => {
    const API = 'http://localhost:3001/api';
    const json = { 'Content-Type': 'application/json' };
    const presets = await (await fetch(`${API}/workstation-presets`)).json();
    const named = (p: any) => !String(p.name).startsWith('__');
    const preset = presets.find((p: any) => p.preset_role === 'yaba' && named(p))
      || presets.find(named);
    expect(preset, 'לא נמצאה עמדה לבדיקה').toBeTruthy();

    const EMPTY = {
      bakar: '', achori: '', mushgach: '', mefale: '', mefale_mushgach: '',
      mashak: '', mashak_mushgach: '', kshp: '',
      has_mushgach: false, has_mefale_mushgach: false, has_mashak_mushgach: false,
    };
    // זיהום מכוון: משמרת קודמת שירדה מהעמדה והשאירה את כל השדות מלאים
    await fetch(`${API}/workstation-session-roles/${preset.id}`, {
      method: 'PUT', headers: json,
      body: JSON.stringify({
        ...EMPTY,
        bakar: 'בקר קודם', achori: 'אחורי קודם', mushgach: 'משגיח קודם',
        mefale: 'מפעיל קודם', mefale_mushgach: 'מפעיל מושגח קודם',
        mashak: 'משק קודם', mashak_mushgach: 'משק מושגח קודם', kshp: '55901234',
        has_mushgach: true, has_mefale_mushgach: true, has_mashak_mushgach: true,
      }),
    });

    try {
      await setScreenSize(page);
      await page.goto('/');
      await identifyViaMirage(page);
      await page.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();
      await pickWorkstation(page, preset.name);

      await expect(page.getByText(/כניסה לעמדה:/)).toBeVisible({ timeout: 20000 });
      await expect(page.getByPlaceholder('הזן מספר קשר פנים')).toBeVisible({ timeout: 20000 });

      const pairs = await page.locator('[data-crew-field]').evaluateAll(
        els => els.map(e => [e.getAttribute('data-crew-field') || '', (e as HTMLInputElement).value] as [string, string])
      );
      const values = Object.fromEntries(pairs);
      expect(values.bakar, 'שדה הבקר/פקח = המשתמש שנכנס').toBe('בודק אוטומטי');
      for (const [field, value] of pairs) {
        if (field !== 'bakar') expect(value, `שדה ${field} נגרר מהמשמרת הקודמת`).toBe('');
      }
      // דגלי ההשגחה כבויים → שדות המושגח כלל לא מוצגים
      await expect(page.getByText('מושגח', { exact: true })).toHaveCount(0);
    } finally {
      await fetch(`${API}/workstation-session-roles/${preset.id}`, {
        method: 'PUT', headers: json, body: JSON.stringify(EMPTY),
      }).catch(() => {});
    }
  });

  // כל שדה שם נשאב מהתפריט של התפקיד המקצועי שלו במיראז', ואחרי סינון לפי
  // הרשאת העמדה. הבדיקה יוצרת שלושה אנשים - בקר, מש"ק ומפעיל - ומוודאת
  // שכל אחד מופיע **רק** בשדות שלו.
  test('תפריט האנשים בכל שדה מגיע מהתפקיד המקצועי במיראז', async ({ page }) => {
    // שתי כניסות מלאות לעמדה (יב"א + מגדל) חורגות מ-30 השניות של ברירת המחדל
    test.setTimeout(120000);
    const MIRAGE = process.env.MIRAGE_URL || 'http://127.0.0.1:7300';
    const json = { 'Content-Type': 'application/json' };
    const PW = 'Qx7!vRt2mZp9';
    const PEOPLE = [
      { personalNumber: '9100001', firstName: 'בקרון', lastName: 'לבדיקה', positions: ['bakar'] },
      { personalNumber: '9100002', firstName: 'משקון', lastName: 'לבדיקה', positions: ['mashak'] },
      { personalNumber: '9100003', firstName: 'מפעילון', lastName: 'לבדיקה', positions: ['mefale'] },
      { personalNumber: '9100004', firstName: 'פקחון', lastName: 'לבדיקה', positions: ['pakach'] },
    ];
    for (const p of PEOPLE) {
      const body = JSON.stringify({
        ...p, password: PW,
        apps: { 'SKY-KING': { roles: ['user'], workstations: [], positions: p.positions } },
      });
      const res = await fetch(`${MIRAGE}/api/users`, { method: 'POST', headers: json, body });
      if (res.status === 409) {
        await fetch(`${MIRAGE}/api/users/${p.personalNumber}`, { method: 'PUT', headers: json, body });
      }
    }
    // שתי העמדות נבדקות בפועל: יב"א (בקר) ומגדל (פקח). השמות נשלפים מה-API
    // ולא מקובעים — רשימת העמדות היא נתוני סביבה ומשתנה.
    const presets = await (await fetch('http://localhost:3001/api/workstation-presets')).json();
    const pickByRole = (role: string) =>
      presets.find((p: any) => p.preset_role === role && !String(p.name).startsWith('__'))?.name as string | undefined;
    const yabaPreset = pickByRole('yaba');
    const towerPreset = pickByRole('tower');
    expect(yabaPreset, 'לא נמצאה עמדת יב"א לבדיקה').toBeTruthy();
    expect(towerPreset, 'לא נמצאה עמדת מגדל לבדיקה').toBeTruthy();

    const checkStation = async (preset: string, isTower: boolean) => {
      await loginToWorkstation(page, { preset });
      await page.getByRole('button', { name: /בודק אוטומטי|משתמש/ }).first().click();
      await page.getByRole('button', { name: /עדכון חברי העמדה/ }).click();
      await expect(page.getByText(/עדכון חברי העמדה:/)).toBeVisible({ timeout: 15000 });

      // עוגן לפי שם השדה ולא לפי אינדקס: בעמדת מגדל אין מפעיל/מש"ק כלל,
      // ולכן מיקום השדה משתנה לפי סוג העמדה
      const fieldFor = (name: string) => page.locator(`[data-crew-field="${name}"]`);
      const expectMenu = async (field: string, present: string, absent: string[]) => {
        const input = fieldFor(field);
        await input.click();
        await input.fill('לבדיקה');
        await expect(page.getByRole('button', { name: present })).toBeVisible({ timeout: 10000 });
        for (const a of absent) await expect(page.getByRole('button', { name: a })).toHaveCount(0);
        await page.keyboard.press('Escape');
      };

      // שורת האב, המושגח והאחורי: ביב"א מתפריט הבקרים, במגדל מתפריט הפקחים
      const head = isTower ? 'פקחון לבדיקה' : 'בקרון לבדיקה';
      const notHead = isTower ? 'בקרון לבדיקה' : 'פקחון לבדיקה';
      await expectMenu('bakar', head, [notHead, 'משקון לבדיקה', 'מפעילון לבדיקה']);
      await expectMenu('achori', head, [notHead, 'משקון לבדיקה', 'מפעילון לבדיקה']);

      // מפעיל ומש"ק קיימים רק בעמדה שאינה מגדל
      expect(await fieldFor('mefale').count(), `מפעיל בעמדת ${preset}`).toBe(isTower ? 0 : 1);
      if (!isTower) {
        await expectMenu('mefale', 'מפעילון לבדיקה', ['בקרון לבדיקה', 'פקחון לבדיקה', 'משקון לבדיקה']);
        await expectMenu('mashak', 'משקון לבדיקה', ['בקרון לבדיקה', 'פקחון לבדיקה', 'מפעילון לבדיקה']);
      }
    };

    try {
      await checkStation(yabaPreset!, false);
      await checkStation(towerPreset!, true);
    } finally {
      for (const p of PEOPLE) {
        await fetch(`${MIRAGE}/api/users/${p.personalNumber}`, { method: 'DELETE' }).catch(() => {});
      }
    }
  });

  test('תפריט המשתמש: עדכון חברי העמדה + צור תחקיר', async ({ page }) => {
    await loginToWorkstation(page);

    // פתיחת תפריט המשתמש (הכפתור נושא את שם המשתמש)
    await page.getByRole('button', { name: /בודק אוטומטי|משתמש/ }).first().click();

    await expect(page.getByRole('button', { name: /עדכון חברי העמדה/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /צור תחקיר/ })).toBeVisible();

    // עדכון חברי העמדה — אותו טופס, בכותרת "עדכון"
    await page.getByRole('button', { name: /עדכון חברי העמדה/ }).click();
    await expect(page.getByText(/עדכון חברי העמדה:/)).toBeVisible({ timeout: 15000 });

    // יציאה בלי לשמור: ✕ סגור. הטופס נפתח מהתפריט ואינו חובה — מי שפתח בטעות
    // חייב דרך החוצה שאינה "שמירה"
    await page.getByRole('button', { name: /✕ סגור/ }).click();
    await expect(page.getByText(/עדכון חברי העמדה:/)).toHaveCount(0, { timeout: 5000 });

    // Escape סוגר גם הוא (בלי תפריט הצעות פתוח)
    await page.getByRole('button', { name: /בודק אוטומטי|משתמש/ }).first().click();
    await page.getByRole('button', { name: /עדכון חברי העמדה/ }).click();
    await expect(page.getByText(/עדכון חברי העמדה:/)).toBeVisible({ timeout: 15000 });
    await page.keyboard.press('Escape');
    await expect(page.getByText(/עדכון חברי העמדה:/)).toHaveCount(0, { timeout: 5000 });

    await page.getByRole('button', { name: /בודק אוטומטי|משתמש/ }).first().click();
    await page.getByRole('button', { name: /עדכון חברי העמדה/ }).click();
    await expect(page.getByText(/עדכון חברי העמדה:/)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /^✅ שמירה$/ }).click();
    await expect(page.getByText(/עדכון חברי העמדה:/)).toHaveCount(0, { timeout: 15000 });

    // צור תחקיר — כולל צילום העמדה (עשוי לקחת כמה שניות)
    await page.getByRole('button', { name: /בודק אוטומטי|משתמש/ }).first().click();
    await page.getByRole('button', { name: /צור תחקיר/ }).click();
    await expect(page.getByText(/צור תחקיר:/)).toBeVisible({ timeout: 40000 });

    for (const label of ['מהות תחקיר', 'סיווג תחקיר', 'פירוט תחקיר', 'פירוט אחריות', 'זמן ארוע']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'קריטי' })).toBeVisible();
    await expect(page.getByRole('button', { name: /הוסף מעורב/ })).toBeVisible();
    // הטופס עצמו לא נכנס לתמונה — התמונה צולמה לפניו
    await expect(page.locator('img[alt="תמונת העמדה"]')).toBeVisible({ timeout: 40000 });
  });
});
