import { test, expect, Page } from '@playwright/test';
import { loginToWorkstation } from './helpers';

/**
 * עמידות בנתק — אימות מקצה לקצה של התרחיש שהוגדר: כבל הרשת של העמדה מנותק,
 * והעמדה ממשיכה לעבוד על המידע שהיה נכון לרגע הנתק.
 *
 * הנתק מדומה ב-route.abort('connectionfailed') — זהו בדיוק מה שהדפדפן רואה
 * כשהכבל נשלף: ה-fetch נדחה, לא מחזיר שגיאת HTTP.
 */

/**
 * מנתק את הכבל, ומיד מפעיל בקשה אחת כדי שהנתק **יתגלה** מיד.
 * בלי זה הבדיקה תלויה בתזמון הפולינג (5-15ש' לפי הפאנל) ומפליקה תחת עומס.
 */
const cutCable = async (page: Page) => {
  await page.route('**/api/**', route => route.abort('connectionfailed'));
  await page.evaluate(() => fetch('/api/sectors').catch(() => {}));
};

const reconnect = (page: Page) => page.unroute('**/api/**');

/**
 * יחס ניגודיות WCAG בין שני צבעים (‎#rrggbb‎ או ‎rgb(...)‎).
 * מחזיר null על קלט לא-צבע — הבאנר מתרנדר מחדש כל שנייה (שעון הגיל), ולכן
 * קריאה יכולה לנחות על אלמנט שכבר הוחלף ו-getComputedStyle מחזיר מחרוזת ריקה.
 * במקום לזרוק, מחזירים null וה-poll קורא שוב.
 */
function contrastRatio(a: string, b: string): number | null {
  const lum = (c: string) => {
    const digits = c.startsWith('#') ? null : c.match(/\d+/g);
    if (!c || (!c.startsWith('#') && (!digits || digits.length < 3))) return null;
    const m = c.startsWith('#')
      ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
      : digits!.slice(0, 3).map(Number);
    if (m.some(v => Number.isNaN(v))) return null;
    const [r, g, bl] = m.map(v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const la = lum(a), lb = lum(b);
  if (la == null || lb == null) return null;
  const [hi, lo] = [la, lb].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test.describe('עמידות בנתק — עמדת בקר', () => {
  test('נתק: הבאנר מופיע, המידע נשאר, ופעולה משותפת נחסמת', async ({ page }) => {
    await loginToWorkstation(page);

    // תמונת מצב לפני הנתק — כמה פ"מים/אלמנטים מוצגים כרגע
    const beforeText = (await page.locator('#root').innerText()).length;
    expect(beforeText, 'המסך אמור להיות טעון לפני הנתק').toBeGreaterThan(50);

    await cutCable(page);

    // ── 1. הבאנר מודיע שהמידע אינו חי ──────────────────────────────────────
    const banner = page.getByRole('status').filter({ hasText: /עבודה מקומית|Local mode/ });
    await expect(banner).toBeVisible({ timeout: 20000 });

    // גיל המידע מוצג ומתקתק (שעון, לא חותמת קפואה)
    await expect(banner).toContainText(/\d{2}:\d{2}/);
    await expect(banner).toContainText(/שיתוף מידע בין עמדות מושבת|sharing disabled/);

    // ── 2. המסך לא התרוקן ──────────────────────────────────────────────────
    await page.waitForTimeout(7000); // יותר ממחזור פולינג אחד (5ש')
    const afterText = (await page.locator('#root').innerText()).length;
    expect(afterText, 'המסך לא אמור להתרוקן בנתק').toBeGreaterThan(beforeText * 0.5);

    // ── 3. פעולה משותפת נחסמת בקול, ולא נשלחת מאוחר יותר ────────────────────
    const blocked = await page.evaluate(async () => {
      const r = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strip_id: 1 }),
      });
      return { status: r.status, body: await r.json() };
    });
    expect(blocked.status).toBe(503);
    expect(blocked.body.code).toBe('OFFLINE_SHARED_WRITE');
    await expect(page.getByRole('alert')).toContainText(/חסומה בזמן נתק|blocked while disconnected/);

    // ── 4. פעולה פרטית נשמרת לשליחה מאוחרת ─────────────────────────────────
    const queued = await page.evaluate(async () => {
      const r = await fetch('/api/activity-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'e2e_offline_probe', severity: 'normal', details: {} }),
      });
      return { status: r.status, body: await r.json() };
    });
    expect(queued.status).toBe(202);
    expect(queued.body.queued).toBe(true);
    await expect(banner).toContainText(/ממתינות לשליחה|queued to send/);

    // ── 5. חזרת הקשר ────────────────────────────────────────────────────────
    await reconnect(page);
    await expect(page.getByRole('status').filter({ hasText: /הקשר לשרת חזר|connection restored/ }))
      .toBeVisible({ timeout: 20000 });
  });

  // ─── ניגודיות הבאנר בשלוש התמות ────────────────────────────────────────────
  // /ui-adapt: ניגודיות **נמדדת, לא מונחת**. המלכודת כאן: רקע הבאנר הוא צבע
  // סטטוס קבוע (ענבר) ולא משטח של התמה, ולכן טקסט "בהיר בתמה כהה" נותן 2.18:1
  // ונופל מתחת לסף — דווקא בתמה שהיא ברירת המחדל בחדר בקרה.
  for (const mode of ['dark', 'light', 'ocean'] as const) {
    test(`באנר הנתק קריא בתמה ${mode}`, async ({ page }) => {
      await page.addInitScript(m => localStorage.setItem('bt-themeMode', m), mode);
      await loginToWorkstation(page);
      await cutCable(page);

      // 30ש': ההמתנה כאן היא לזרימת הכניסה לעמדה, לא לבאנר (שמופיע תוך שנייה
      // מרגע שהכבל נותק, כי cutCable מפעיל בקשה מיד). תחת עומס DB הכניסה
      // איטית יותר, וזה מה שהפליק פה.
      const banner = page.getByRole('status').filter({ hasText: /עבודה מקומית|Local mode/ });
      await expect(banner).toBeVisible({ timeout: 30000 });

      // הקריאה חוזרת עד שמתקבל צבע אמיתי: הבאנר מתרנדר מחדש כל שנייה (שעון
      // הגיל), ו-getComputedStyle על אלמנט שהוחלף מחזיר מחרוזת ריקה.
      // 4.5:1 — סף WCAG 1.4.3 לטקסט רגיל (מחמיר מ-3:1 של אובייקט גרפי)
      let measured = '';
      await expect.poll(async () => {
        const { bg, fg } = await banner.evaluate(el => {
          const s = getComputedStyle(el as HTMLElement);
          return { bg: s.backgroundColor, fg: s.color };
        });
        const ratio = contrastRatio(bg, fg);
        if (ratio != null) measured = `${fg} על ${bg}`;
        return ratio;
      }, { timeout: 10000, message: `ניגודיות בתמה ${mode}` }).toBeGreaterThanOrEqual(4.5);
      console.log(`[ניגודיות] ${mode}: ${measured}`);
    });
  }

  test('קריאה בנתק מוגשת מה-cache המקומי ולא נכשלת', async ({ page }) => {
    await loginToWorkstation(page);
    // מוודאים שהנתיב נכנס ל-cache לפני הנתק
    await page.evaluate(() => fetch('/api/sectors').then(r => r.json()));

    await cutCable(page);

    const served = await page.evaluate(async () => {
      const r = await fetch('/api/sectors');
      return { status: r.status, fromCache: r.headers.get('x-skyking-from-cache'), len: (await r.json()).length };
    });
    expect(served.status).toBe(200);
    expect(served.fromCache).toBe('1');   // הגיע מ-IndexedDB, לא מהרשת
  });
});
