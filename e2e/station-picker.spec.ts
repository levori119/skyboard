import { test, expect } from '@playwright/test';
import { identifyViaMirage, setScreenSize } from './helpers';

// בורר העמדה במסך הכניסה — רשימה מקובצת לפי בסיס אב.
// מאמת מול נתונים אמיתיים מה-API (לא mock): הקטגוריות סגורות בפתיחה, הפתיחה
// חושפת את עמדות הבסיס, והעמדות מסודרות מהאחרון שעודכן/נוצר עם חותמת זמן.

// 127.0.0.1 ולא localhost: השרת מאזין ב-IPv4 בלבד, ו-localhost נפתר ל-::1 בסביבת הבדיקות
const API = 'http://127.0.0.1:3001/api';

async function openPicker(page: import('@playwright/test').Page) {
  await setScreenSize(page);
  await page.goto('/');
  await identifyViaMirage(page);
  await page.getByRole('button', { name: /בחירת עמדה|Select Workstation/ }).click();
  const picker = page.locator('[data-testid="station-picker"]');
  await expect(picker).toBeVisible({ timeout: 20000 });
  return picker;
}

test.describe('בורר העמדה — קיבוץ לפי בסיס אב', () => {
  test('הקטגוריות סגורות בפתיחה, ולחיצה חושפת את עמדות הבסיס', async ({ page }) => {
    const presets = await (await page.request.get(`${API}/workstation-presets`)).json();
    const distinctBases = new Set(presets.map((p: any) => p.parent_base_id ?? 'none'));
    test.skip(distinctBases.size < 2, 'נדרש יותר מבסיס אב אחד כדי שיוצגו קטגוריות');

    const picker = await openPicker(page);
    const headers = picker.locator('[data-testid="station-group"]');
    const options = picker.locator('[data-testid="station-option"]');

    // כל הקטגוריות סגורות → אין אף עמדה גלויה
    await expect(headers.first()).toBeVisible();
    expect(await headers.count()).toBeGreaterThan(1);
    for (let i = 0; i < await headers.count(); i++) {
      await expect(headers.nth(i)).toHaveAttribute('aria-expanded', 'false');
    }
    await expect(options).toHaveCount(0);

    // פתיחת הקטגוריה הראשונה — רק העמדות שלה נחשפות, והמונה שבכותרת תואם
    const first = headers.first();
    const count = Number((await first.locator('span').last().textContent())!.trim());
    await first.click();
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    await expect(options).toHaveCount(count);

    // סגירה חוזרת מחביאה אותן
    await first.click();
    await expect(options).toHaveCount(0);
  });

  test('בכל קטגוריה: העדכני ביותר ראשון, ולצד כל עמדה חותמת זמן', async ({ page }) => {
    const presets: any[] = await (await page.request.get(`${API}/workstation-presets`)).json();
    const picker = await openPicker(page);
    const headers = picker.locator('[data-testid="station-group"]');

    for (let i = 0; i < await headers.count(); i++) {
      const h = headers.nth(i);
      if (await h.getAttribute('aria-expanded') !== 'true') await h.click();
    }

    const rows = await picker.locator('[data-testid="station-option"]').evaluateAll(els =>
      els.map(e => ({ name: (e.getAttribute('data-station-name') || '').trim(), text: (e.textContent || '').trim() }))
    );
    expect(rows.length, 'לא נמצאו עמדות בבורר').toBeGreaterThan(0);

    // לכל עמדה חותמת זמן (HH:MM או DD/MM HH:MM) עם תווית נוצר/עודכן
    for (const r of rows) {
      expect(r.text, `לעמדה "${r.name}" אין חותמת זמן`).toMatch(/(נוצר|עודכן|Created|Updated)\s+\d{2}[:/]/);
    }

    // הסדר בתוך כל קטגוריה: חותמת יורדת
    const stamp = (n: string) => {
      const p = presets.find(x => x.name === n);
      return p ? new Date(p.updated_at || p.created_at).getTime() : 0;
    };
    const groupOf = (n: string) => presets.find(x => x.name === n)?.parent_base_id ?? 'none';
    for (let i = 1; i < rows.length; i++) {
      if (groupOf(rows[i].name) !== groupOf(rows[i - 1].name)) continue;
      expect(stamp(rows[i - 1].name), `"${rows[i - 1].name}" צריכה להופיע אחרי "${rows[i].name}"`)
        .toBeGreaterThanOrEqual(stamp(rows[i].name));
    }
  });
});
