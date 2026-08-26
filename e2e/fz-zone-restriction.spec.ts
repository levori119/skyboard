import { test, expect, Page } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// ─── אזור סגור / אזור מוגבל ───────────────────────────────────────────────────
// הדרישה: לחיצה על **קו** האזור פותחת תפריט עם סגור/מוגבל, הערה וטווח גבהים.
// אזור **סגור** - השיוך נחסם ויוצאת התראה. אזור **מוגבל** - השיוך מותר ויוצאת
// התראה. בשני המקרים בהתחשב בגובה האזור.
//
// למה e2e ולא unit: ההכרעה עצמה (`src/utils/zoneRestriction.ts`) נבדקת ב-vitest
// על כל מטריצת המקרים. מה ש**רק** e2e יכול לתפוס הוא שהנגיעה על הקו בכלל מגיעה
// לקוד - הגאומטריה, הזום, הפאן, ושכבת המפה שמעליה - ושהמצב באמת נשמר לשרת.
//
// כל קריאות ה-API עוברות **מתוך הדף** (`page.evaluate`) ובנתיב יחסי: זהו המקום
// היחיד שמצרף את אסימון ההזדהות (`src/utils/authToken.ts`), ו-`page.request`
// היה מקבל 401. ראה SK-01.
//
// הבדיקה **משחזרת את עצמה**: מצב האזור מוחזר ל"פתוח" ב-finally, וגם אם היא
// נופלת באמצע לא נשאר אזור סגור ב-DB.

type Zone = { id: number; name: string; polygon: { x: number; y: number }[]; enabled?: boolean };

const apiGet = (page: Page, path: string) =>
  page.evaluate(async (p) => {
    const r = await fetch(p);
    return r.ok ? r.json() : null;
  }, path);

const apiPatch = (page: Page, path: string, body: any) =>
  page.evaluate(async ([p, b]) => {
    const r = await fetch(p as string, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
    });
    return r.ok;
  }, [path, body] as [string, any]);

const parsePolygon = (raw: any): { x: number; y: number }[] => {
  try { const v = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(v) ? v : []; }
  catch { return []; }
};

/**
 * עמדת אזורי-טיסה עם מפה ואזורים משורטטים. נדרשת הזדהות, ולכן החיפוש נעשה
 * **אחרי** כניסה ראשונה לעמדה כלשהי; אם היא אינה המתאימה, נכנסים שוב לזו שנמצאה.
 */
async function loginToFzPreset(page: Page): Promise<{ mapId: number; zones: Zone[] } | null> {
  await loginToWorkstation(page);
  const presets = await apiGet(page, '/api/workstation-presets');
  if (!Array.isArray(presets)) return null;
  for (const p of presets as any[]) {
    if (!p.flight_zones_mode || !p.map_id || String(p.name || '').startsWith('__')) continue;
    const raw = await apiGet(page, `/api/map-zones?map_id=${p.map_id}`);
    if (!Array.isArray(raw)) continue;
    const zones: Zone[] = (raw as any[])
      .map(z => ({ ...z, polygon: parsePolygon(z.polygon) }))
      .filter(z => z.polygon.length >= 3 && z.enabled !== false);
    if (!zones.length) continue;
    await loginToWorkstation(page, { preset: p.name });
    return { mapId: p.map_id, zones };
  }
  return null;
}

/**
 * נקודת מסך על ה**קו המצויר** של אזור, ונקודת מסך במרכזו.
 *
 * הקואורדינטות נלקחות מה-`<polygon>` שבשכבת האזורים ומומרות ב-`getScreenCTM()`,
 * ולא מחושבות מהפוליגון שב-DB: אזור על מפה **מעוגנת** מצויר לפי קווי הרוחב/אורך
 * שלו (`polygon_geo`) ולא לפי הפיקסלים, ולכן חישוב מה-API היה מחטיא את הקו -
 * וזה בדיוק מה שקרה. ה-CTM גם סופג את הזום, הפאן וה-viewBox בלי לשחזר אותם.
 *
 * מוחזר האזור בעל הצלע הארוכה ביותר - הכי עמיד לנגיעה.
 */
async function drawnZoneTargets(page: Page) {
  return page.evaluate(() => {
    let best: { zoneId: number; edge: { x: number; y: number }; center: { x: number; y: number }; len: number } | null = null;
    for (const g of Array.from(document.querySelectorAll('[data-zone-layer] g[data-zone-id]'))) {
      const poly = g.querySelector('polygon') as SVGPolygonElement | null;
      if (!poly) continue;
      const ctm = poly.getScreenCTM();
      if (!ctm) continue;
      const pts = Array.from(poly.points ? { length: poly.points.numberOfItems } as any : [], (_v, i) => poly.points.getItem(i));
      if (pts.length < 3) continue;
      const toScreen = (x: number, y: number) => ({ x: ctm.a * x + ctm.c * y + ctm.e, y: ctm.b * x + ctm.d * y + ctm.f });
      let mid = { x: 0, y: 0 }, len = -1;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = toScreen(pts[j].x, pts[j].y), b = toScreen(pts[i].x, pts[i].y);
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > len) { len = d; mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
      }
      const cu = pts.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
      const center = toScreen(cu.x / pts.length, cu.y / pts.length);
      const zoneId = Number(g.getAttribute('data-zone-id'));
      if (!best || len > best.len) best = { zoneId, edge: mid, center, len };
    }
    return best;
  });
}

const zoneState = async (page: Page, mapId: number, zoneId: number) => {
  const rows = await apiGet(page, `/api/map-zones?map_id=${mapId}`);
  return Array.isArray(rows) ? (rows as any[]).find(z => z.id === zoneId) || null : null;
};

const openZone = (page: Page, zoneId: number) =>
  apiPatch(page, `/api/map-zones/${zoneId}/operational`,
    { restriction: '', restriction_alt_min: null, restriction_alt_max: null });

/**
 * ניקוי שאינו נכשל בשקט.
 *
 * ה-`finally` הקודם היה `.catch(() => {})`, ולכן ניקוי שלא הצליח לא השאיר סימן -
 * ובפועל נמצאו ב-DB אזור שנשאר **סגור** ושיוכי בדיקה שלא נמחקו. אזור סגור
 * שנשכח הוא לא "לכלוך": מרגע שהשיוך נחסם, הוא **מונע** מהפקח לשייך אליו.
 * כאן הניקוי נבדק, וכשלונו מודפס במפורש כדי שלא יוכל להתחבא.
 */
async function cleanup(page: Page, mapId: number, stripId: number | null, zoneId: number) {
  const problems: string[] = [];
  if (stripId) {
    await apiDelete(page, `/api/strip-zone-assignments/${stripId}`).catch(() => {});
    await apiDelete(page, `/api/strip-zone-extra-zones/by-strip/${stripId}`).catch(() => {});
    if (await assignmentOf(page, mapId, stripId)) problems.push(`שיוך פ"מ ${stripId} לא נמחק`);
  }
  await openZone(page, zoneId).catch(() => {});
  const z = await apiGet(page, `/api/map-zones?map_id=${mapId}`).catch(() => null);
  const row = Array.isArray(z) ? (z as any[]).find(x => x.id === zoneId) : null;
  if (row && row.restriction !== '') problems.push(`אזור ${zoneId} נשאר ${row.restriction}`);
  if (problems.length) console.error('❌ ניקוי הבדיקה נכשל: ' + problems.join(' · '));
  expect(problems, 'הבדיקה השאירה מצב ב-DB').toEqual([]);
}

/** על איזה אזור התפריט פתוח, לפי `data-zone-menu` שהתפריט נושא. */
const menuZoneId = (page: Page) =>
  page.locator('[data-zone-menu]').first().evaluate(el => Number(el.getAttribute('data-zone-menu')));

const apiDelete = (page: Page, path: string) =>
  page.evaluate(async (pth) => {
    const r = await fetch(pth, { method: 'DELETE' });
    return r.ok;
  }, path);

const setZoneRestriction = (page: Page, zoneId: number, kind: 'closed' | 'restricted', lo: number | null = null, hi: number | null = null) =>
  apiPatch(page, `/api/map-zones/${zoneId}/operational`,
    { restriction: kind, restriction_alt_min: lo, restriction_alt_max: hi });

const assignmentOf = async (page: Page, mapId: number, stripId: number) => {
  const rows = await apiGet(page, `/api/strip-zone-assignments?map_id=${mapId}`);
  return Array.isArray(rows) ? (rows as any[]).find(a => Number(a.strip_id) === stripId) || null : null;
};

/** מדליק את מתג "שידוך בלחיצה" (localStorage פר-עמדה, בלי נגיעה ב-DB). */
async function enablePairMode(page: Page) {
  const menuBtn = page.getByRole('button', { name: /הגדרות עמדה/ });
  await menuBtn.click();
  const label = page.locator('span').filter({ hasText: 'שידוך בלחיצה' }).first();
  await expect(label).toBeVisible();
  const toggle = label.locator('xpath=following-sibling::button').first();
  if ((await toggle.textContent())?.includes('הפעל')) await toggle.click();
  await expect(toggle).toHaveText(/כבה/);
  await page.mouse.click(2, 2); // התפריט נסגר בלחיצה על שכבת-הרקע שלו
  await expect(label).toBeHidden();
}

test('נגיעה על קו האזור פותחת את תפריט האזור, וסגירה נשמרת לשרת', async ({ page }) => {
  test.setTimeout(240000);
  const found = await loginToFzPreset(page);
  test.skip(!found, 'אין עמדת אזורי-טיסה עם אזורים משורטטים בסביבה הזו');
  const { mapId, zones } = found!;

  await expect(page.locator('[data-map-layer] img').first()).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-zone-layer] g[data-zone-id]').first()).toBeAttached({ timeout: 20000 });

  const target = await drawnZoneTargets(page);
  expect(target, 'לא נמצא אזור מצויר על המפה').toBeTruthy();

  // נגיעה **בלי גרירה** על הקו - זה בדיוק המסלול של העט והאצבע בעמדה
  await page.mouse.click(target!.edge.x, target!.edge.y);

  // התפריט נפתח: שלושת מצבי האזור הם החתימה שלו
  const closedBtn = page.getByRole('button', { name: /^סגור$/ }).first();
  const restrictedBtn = page.getByRole('button', { name: /^מוגבל$/ }).first();
  const openBtn = page.getByRole('button', { name: /^פתוח$/ }).first();
  await expect(closedBtn).toBeVisible({ timeout: 10000 });
  await expect(restrictedBtn).toBeVisible();
  await expect(openBtn).toBeVisible();
  // וגם טווח הגבהים וההערה, שהדרישה מנתה במפורש
  await expect(page.getByText('טווח גבהים (רום טיסה)')).toBeVisible();
  await expect(page.getByText('מגבלה (טקסט חופשי)')).toBeVisible();

  // איזה אזור נפתח בפועל? התפריט אומר, וממנו נגזר מה נבדק בשרת - גבול משותף
  // לשני אזורים צמודים הוא נקודה עמומה מטבעה, ולא צריך לנחש אותה.
  const hitId = await menuZoneId(page);
  const hitZone = zones.find(z => z.id === hitId);
  expect(hitZone, `האזור שבתפריט (#${hitId}) אינו ברשימת אזורי המפה`).toBeTruthy();

  try {
    // ── סגירה ──────────────────────────────────────────────────────────────
    await closedBtn.click();
    await expect.poll(async () => (await zoneState(page, mapId, hitZone!.id))?.restriction,
      { timeout: 10000 }).toBe('closed');

    // ── סגירה טווחית: "מ-100 עד 140" ───────────────────────────────────────
    const bounds = page.locator('input[inputmode="numeric"]');
    await bounds.nth(0).fill('100');
    await bounds.nth(1).fill('140');
    await bounds.nth(1).blur();
    await expect.poll(async () => {
      const z = await zoneState(page, mapId, hitZone!.id);
      return `${z?.restriction}|${z?.restriction_alt_min}|${z?.restriction_alt_max}`;
    }, { timeout: 10000 }).toBe('closed|100|140');

    // ── פתיחה מנקה גם את הטווח ──────────────────────────────────────────────
    await page.getByRole('button', { name: /^פתוח$/ }).first().click();
    await expect.poll(async () => {
      const z = await zoneState(page, mapId, hitZone!.id);
      return `${z?.restriction}|${z?.restriction_alt_min}|${z?.restriction_alt_max}`;
    }, { timeout: 10000 }).toBe('|null|null');
  } finally {
    await cleanup(page, mapId, null, hitZone!.id);
  }
});

test('נגיעה בתוך האזור אינה פותחת את התפריט - הפנים הוא יעד שחרור', async ({ page }) => {
  test.setTimeout(240000);
  const found = await loginToFzPreset(page);
  test.skip(!found, 'אין עמדת אזורי-טיסה עם אזורים משורטטים בסביבה הזו');
  await expect(page.locator('[data-map-layer] img').first()).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-zone-layer] g[data-zone-id]').first()).toBeAttached({ timeout: 20000 });

  const target = await drawnZoneTargets(page);
  expect(target, 'לא נמצא אזור מצויר על המפה').toBeTruthy();

  await page.mouse.click(target!.center.x, target!.center.y);
  await expect(page.getByRole('button', { name: /^סגור$/ })).toHaveCount(0);
});

/**
 * מכינה פ"מ נקי (בלי שיוך) ואזור מצויר, במצב שידוך-בלחיצה. מוחזר מה שנדרש כדי
 * לנסות שיוך ולנקות אחריו.
 */
async function readyToPair(page: Page, mapId: number) {
  await expect(page.locator('[data-zone-layer] g[data-zone-id]').first()).toBeAttached({ timeout: 20000 });
  await enablePairMode(page);
  const pickable = page.locator('#sidebar-area [data-fz-pick]');
  await expect(pickable.first()).toBeAttached({ timeout: 15000 });
  const candidates = await pickable.evaluateAll(els =>
    (els as HTMLElement[]).map(el => Number(el.getAttribute('data-fz-pick'))).filter(Boolean));
  const assigned = new Set<number>(
    ((await apiGet(page, `/api/strip-zone-assignments?map_id=${mapId}`)) as any[] || []).map(a => Number(a.strip_id)));
  // פ"מ **לא משויך**: הניקוי שלו הוא מחיקה, והמצב חוזר בדיוק לקדמותו
  const stripId = candidates.find(id => !assigned.has(id)) ?? null;
  const target = await drawnZoneTargets(page);
  return { stripId, target };
}

/** ממתינה שההגבלה תגיע למסך - היא נמשכת בפולינג, לא נדחפת. */
const waitForRestrictionOnMap = (page: Page, label: string) =>
  expect.poll(async () => page.evaluate((needle) => {
    const layer = document.querySelector('[data-zone-layer]');
    return (layer?.textContent || '').includes(needle);
  }, label), { timeout: 30000, message: `ההגבלה ("${label}") לא הופיעה על המפה` }).toBeTruthy();

const pairInto = async (page: Page, stripId: number, x: number, y: number) => {
  await page.locator(`#sidebar-area [data-fz-pick="${stripId}"]`).first().click();
  await expect(page.locator('[data-fz-sel="1"]')).toHaveCount(1);
  await page.mouse.click(x, y);
};

test('אזור סגור: השיוך **נחסם** והתראה יוצאת', async ({ page }) => {
  test.setTimeout(240000);
  const found = await loginToFzPreset(page);
  test.skip(!found, 'אין עמדת אזורי-טיסה עם אזורים משורטטים בסביבה הזו');
  const { mapId, zones } = found!;

  const { stripId, target } = await readyToPair(page, mapId);
  test.skip(!stripId, 'כל הפ"מים בסרגל כבר משויכים - הבדיקה דורשת פ"מ נקי');
  expect(target, 'לא נמצא אזור מצויר על המפה').toBeTruthy();
  const zoneId = target!.zoneId;
  const zoneName = zones.find(z => z.id === zoneId)?.name || '';
  const esc = zoneName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  try {
    // סגירה **גורפת** (בלי טווח) - החסימה לא תלויה בגובה שרשום בפ"מ
    expect(await setZoneRestriction(page, zoneId, 'closed')).toBeTruthy();
    await waitForRestrictionOnMap(page, 'סגור');

    await pairInto(page, stripId!, target!.center.x, target!.center.y);

    // ההתראה על הדחייה עלתה...
    await expect(page.getByText(new RegExp(`אזור סגור - השיוך נדחה.*${esc}`)))
      .toBeVisible({ timeout: 15000 });
    // ...ו**לא** נוצר שיוך. ההמתנה כאן היא הפואנטה: אילו השיוך היה נוצר באיחור,
    // בדיקה מיידית הייתה עוברת בטעות.
    await page.waitForTimeout(3000);
    expect(await assignmentOf(page, mapId, stripId!), 'נוצר שיוך לאזור סגור').toBeNull();
  } finally {
    await cleanup(page, mapId, stripId, zoneId);
  }
});

test('אזור מוגבל: השיוך **מותר** והתראה יוצאת', async ({ page }) => {
  test.setTimeout(240000);
  const found = await loginToFzPreset(page);
  test.skip(!found, 'אין עמדת אזורי-טיסה עם אזורים משורטטים בסביבה הזו');
  const { mapId, zones } = found!;

  const { stripId, target } = await readyToPair(page, mapId);
  test.skip(!stripId, 'כל הפ"מים בסרגל כבר משויכים - הבדיקה דורשת פ"מ נקי');
  expect(target, 'לא נמצא אזור מצויר על המפה').toBeTruthy();
  const zoneId = target!.zoneId;
  const zoneName = zones.find(z => z.id === zoneId)?.name || '';
  const esc = zoneName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  try {
    expect(await setZoneRestriction(page, zoneId, 'restricted')).toBeTruthy();
    await waitForRestrictionOnMap(page, 'מוגבל');

    await pairInto(page, stripId!, target!.center.x, target!.center.y);

    // כאן ההפך מהבדיקה שמעל: השיוך **כן** נוצר, וההתראה בכל זאת יוצאת
    await expect.poll(async () => (await assignmentOf(page, mapId, stripId!))?.zone_id ?? null,
      { timeout: 20000, message: 'השיוך לא נוצר באזור מוגבל' }).toBe(zoneId);
    await expect(page.getByText(new RegExp(`אויש אזור מוגבל.*${esc}`)))
      .toBeVisible({ timeout: 15000 });
  } finally {
    await cleanup(page, mapId, stripId, zoneId);
  }
});
