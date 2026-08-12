import { test, expect } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// ─── נקודות העברה בעמדת שדה (ground) ─────────────────────────────────────────
// הדרישה מהשטח: בעמדת שדה התעופה נקודות ההעברה לא הוצגו כלל - צריך להציג אותן
// **רגיל**, כלומר אותו פאנל שכנים בדיוק שיש בעמדת הבקר (רכיב משותף), ולאפשר
// לגרור נקודה אל מפת השדה כך שתופיע עליה כחץ.

const API = 'http://localhost:3001/api';

// עמדת שדה טוענת גם מפה, אלמנטים, מסלולים ו-NOTAMים - הכניסה אליה איטית
// מברירת המחדל של 30 שניות בקונפיג.
test.describe.configure({ timeout: 240000 });

async function findGroundPreset(page: any) {
  const presets = await (await page.request.get(`${API}/workstation-presets`)).json();
  return (presets as any[]).find(p =>
    p.preset_type === 'ground'
    && Array.isArray(p.relevant_sectors) && p.relevant_sectors.length > 0
    && !String(p.name || '').startsWith('__'));
}

test('בעמדת שדה מוצג פאנל נקודות ההעברה הרגיל', async ({ page }) => {
  const preset = await findGroundPreset(page);
  test.skip(!preset, 'אין עמדת שדה עם נקודות העברה מוגדרות ב-DB');

  await loginToWorkstation(page, { preset: preset.name });

  // אותו פאנל של עמדת הבקר - אותו id ואותם כרטיסי שכן
  const panel = page.locator('#neighbor-panel');
  await expect(panel).toBeVisible({ timeout: 20000 });
  const cards = panel.locator('.neighbor-drop-zone[data-sector-id]');
  await expect(cards.first()).toBeVisible({ timeout: 10000 });
  expect(await cards.count()).toBeGreaterThan(0);

  // ומפת השדה עדיין שם לצידו
  await expect(page.locator('#ground-map-area')).toBeVisible();
});

test('גרירת נקודת העברה למפת השדה מציבה אותה כחץ', async ({ page }) => {
  const preset = await findGroundPreset(page);
  test.skip(!preset, 'אין עמדת שדה עם נקודות העברה מוגדרות ב-DB');

  await loginToWorkstation(page, { preset: preset.name });

  const card = page.locator('#neighbor-panel .neighbor-drop-zone[data-sector-id]').first();
  await expect(card).toBeVisible({ timeout: 20000 });
  const sectorId = await card.getAttribute('data-sector-id');

  const map = page.locator('#ground-map-area');
  await expect(map).toBeVisible();

  const cb = (await card.boundingBox())!;
  const mb = (await map.boundingBox())!;
  const dropX = mb.x + mb.width * 0.45, dropY = mb.y + mb.height * 0.55;
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(dropX, dropY, { steps: 15 });
  await page.mouse.up();

  const pin = map.locator(`.neighbor-pin-drop-zone[data-pin-sector="${sectorId}"]`).first();
  await expect(pin).toBeVisible({ timeout: 10000 });

  // החץ נחת היכן ששוחרר (ולא בפינה) - סטייה סבירה בגלל עוגן הבסיס והתווית
  const pb = (await pin.boundingBox())!;
  expect(Math.abs(pb.x + pb.width / 2 - dropX)).toBeLessThan(90);

  // החץ הוא סימון עזר: במנוחה הוא **מתחת** לשכבת הנקודות (10), האלמנטים (12)
  // והמטוסים (20+), כדי שלעולם לא יסתיר מידע תפעולי.
  await page.mouse.move(2, 2);   // להוריד את הריחוף שנשאר מהשחרור
  const restZ = await pin.evaluate(el => Number(getComputedStyle(el as HTMLElement).zIndex) || 0);
  expect(restZ).toBeLessThan(10);

  // ...ולכן ריחוף מעלה אותו זמנית, אחרת אלמנט שיושב עליו היה חוסם הזזה/הסרה.
  // dispatchEvent ולא click: על מפה אמיתית ייתכן שאלמנט יושב בדיוק על ה-✕,
  // וכאן בודקים את הפעולה עצמה - ההגעה אליה מכוסה בבדיקת ה-zIndex שלמעלה.
  const removeBtn = pin.getByRole('button', { name: '✕' });
  await expect(removeBtn).toBeAttached();
  await removeBtn.dispatchEvent('click');
  await expect(map.locator(`.neighbor-pin-drop-zone[data-pin-sector="${sectorId}"]`)).toHaveCount(0);
});
