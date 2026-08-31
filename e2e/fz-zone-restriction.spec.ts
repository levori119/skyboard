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
      const n = poly.points.numberOfItems;
      if (n < 3) continue;
      const toScreen = (x: number, y: number) => ({ x: ctm.a * x + ctm.c * y + ctm.e, y: ctm.b * x + ctm.d * y + ctm.f });
      // נקודה **פנויה**: פ"מ שיושב על הקו בולע את הלחיצה, והיא לא מגיעה לשכבת
      // המפה - כלומר הנגיעה "לא קרתה". זה בדיוק מה שהפיל את הבדיקה, ולכן
      // נבדק כאן מה נמצא בפועל מעל הנקודה.
      const free = (p: { x: number; y: number }) => {
        const el = document.elementFromPoint(p.x, p.y) as HTMLElement | null;
        if (!el) return false;
        if (el.closest('.bt-strip') || el.closest('[data-fz-pin]')) return false;
        return !!el.closest('[data-map-panel]');
      };
      // דגימה לאורך כל צלע (לא רק אמצעה) - כדי לעקוף פ"מ שיושב על האמצע
      let edge: { x: number; y: number } | null = null, len = -1;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const a = poly.points.getItem(j), b = poly.points.getItem(i);
        const sa = toScreen(a.x, a.y), sb = toScreen(b.x, b.y);
        const d = Math.hypot(sa.x - sb.x, sa.y - sb.y);
        if (d <= len) continue;
        for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
          const p = { x: sa.x + (sb.x - sa.x) * t, y: sa.y + (sb.y - sa.y) * t };
          if (free(p)) { edge = p; len = d; break; }
        }
      }
      if (!edge) continue;
      let center: { x: number; y: number } | null = null;
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < n; i++) { const q = poly.points.getItem(i); pts.push({ x: q.x, y: q.y }); }
      const inside = (x: number, y: number) => {
        let hit = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
          if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) hit = !hit;
        }
        return hit;
      };
      const cx = pts.reduce((s2, q) => s2 + q.x, 0) / pts.length;
      const cy = pts.reduce((s2, q) => s2 + q.y, 0) / pts.length;
      const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const cands = [{ x: cx, y: cy }];
      for (let a = 1; a <= 5; a++) for (let b = 1; b <= 5; b++) {
        const x = minX + (maxX - minX) * a / 6, y = minY + (maxY - minY) * b / 6;
        if (inside(x, y)) cands.push({ x, y });
      }
      for (const c of cands) { const p = toScreen(c.x, c.y); if (free(p)) { center = p; break; } }
      if (!center) continue;
      const zoneId = Number(g.getAttribute('data-zone-id'));
      if (!best || len > best.len) best = { zoneId, edge, center, len };
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

/** מאשר את תפריט האזור ("אשר"). עד הלחיצה שום דבר לא נשלח לשרת. */
const applyZoneMenu = async (page: Page) => {
  const btn = page.locator('[data-zone-menu-apply]');
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(page.locator('[data-zone-menu]')).toHaveCount(0);
};

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
  test.setTimeout(420000);
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
  await expect(page.locator('[data-zone-menu]')).toBeVisible({ timeout: 15000 });
  const closedBtn = page.locator('[data-zone-state="closed"]');
  const restrictedBtn = page.locator('[data-zone-state="restricted"]');
  const openBtn = page.locator('[data-zone-state="open"]');
  await expect(closedBtn).toBeVisible();
  await expect(restrictedBtn).toBeVisible();
  await expect(openBtn).toBeVisible();
  // אישור וביטול - הדרישה החדשה: הטופס מאשר, ולא שומר בכל נגיעה
  await expect(page.locator('[data-zone-menu-apply]')).toBeVisible();
  await expect(page.locator('[data-zone-menu-cancel]')).toBeVisible();
  await expect(page.locator('[data-zone-menu] button[aria-label="ביטול"]')).toBeVisible();
  // וגם היקף הגבהים וההערה, שהדרישה מנתה במפורש. באזור מפוצל זו **רשימת
  // בלוקים אחת** (בחירה מרובה), ובאזור לא מפוצל טווח מספרי - אחת מהשתיים.
  const scope = page.getByText(/הגבהים שההגבלה חלה עליהם|הגבהים הסגורים|טווח גבהים \(רום טיסה\)/);
  await expect(scope.first()).toBeVisible();
  await expect(page.getByText('מגבלה (טקסט חופשי)')).toBeVisible();
  // הרשימה הכפולה שהוסרה: "החל על בלוק" ו"בלוקים (גבהים) פעילים" אינן קיימות
  await expect(page.getByText('החל על בלוק:')).toHaveCount(0);
  await expect(page.getByText('בלוקים (גבהים) פעילים')).toHaveCount(0);

  // איזה אזור נפתח בפועל? התפריט אומר, וממנו נגזר מה נבדק בשרת - גבול משותף
  // לשני אזורים צמודים הוא נקודה עמומה מטבעה, ולא צריך לנחש אותה.
  const hitId = await menuZoneId(page);
  const hitZone = zones.find(z => z.id === hitId);
  expect(hitZone, `האזור שבתפריט (#${hitId}) אינו ברשימת אזורי המפה`).toBeTruthy();

  try {
    // ── התפריט **אינו** שומר עד "אשר" ──────────────────────────────────────
    // זו הפואנטה של מודל האישור: הפקח רואה את התמונה השלמה לפני שהיא חלה,
    // ואין מצבי-ביניים שמופצים לעמדות האחרות.
    await closedBtn.click();
    await page.waitForTimeout(1200);
    expect((await zoneState(page, mapId, hitZone!.id))?.restriction,
      'המצב נשמר לשרת עוד לפני "אשר"').toBe('');

    // ── היקף ההגבלה ────────────────────────────────────────────────────────
    // אזור **מפוצל** מקבל רשימת בלוקים אחת (בחירה מרובה); אזור לא מפוצל - טווח
    // מספרי. הבדיקה מכסה את שניהם, כי מה שקיים על המסך תלוי באזור שנלחץ.
    const blockRows = page.locator('[data-zone-block]');
    const zoneBlocks = ((await apiGet(page, `/api/zone-altitude-ranges?zone_id=${hitZone!.id}`)) as any[]) || [];
    const blockCount = zoneBlocks.length;
    expect(await blockRows.count(), 'רשימת הבלוקים בתפריט אינה תואמת לאזור').toBe(blockCount);
    let expected: string;
    if (blockCount > 1) {
      // אזור **סגור גורף** מוצג עם כל הבלוקים מסומנים - זה מה ש"סגור" אומר.
      // צמצום לגובה מסוים נעשה ב**הסרת** הסימון מהשאר, וזה מה שנבדק כאן.
      const ids = await blockRows.evaluateAll(els =>
        (els as HTMLElement[]).map(e => Number(e.getAttribute('data-zone-block'))));
      for (const el of await blockRows.all()) {
        await expect(el.locator('input[type=checkbox]')).toBeChecked();
      }
      // מסירים את האחרון: נשארים כל השאר, וזו **בחירה מרובה** כשיש שלושה ומעלה
      await blockRows.last().locator('input[type=checkbox]').uncheck();
      expected = `closed|${JSON.stringify(ids.slice(0, -1))}|null|null`;
    } else if (blockCount === 1) {
      // בלוק יחיד: סימונו **הוא** "האזור סגור", ולכן אין מה לצמצם
      await expect(blockRows.first().locator('input[type=checkbox]')).toBeChecked();
      expected = 'closed|[]|null|null';
    } else {
      const bounds = page.locator('input[inputmode="numeric"]');
      await bounds.nth(0).fill('100');
      await bounds.nth(1).fill('140');
      expected = 'closed|[]|100|140';
    }

    // ── "אשר" - בקשה אחת, וכל מה שנערך חל יחד ──────────────────────────────
    await applyZoneMenu(page);
    await expect.poll(async () => {
      const z = await zoneState(page, mapId, hitZone!.id);
      return `${z?.restriction}|${JSON.stringify(z?.restriction_range_ids)}|${z?.restriction_alt_min}|${z?.restriction_alt_max}`;
    }, { timeout: 10000 }).toBe(expected);

    // ── ✕ סוגר **בלי** להחיל ───────────────────────────────────────────────
    await page.mouse.click(target!.edge.x, target!.edge.y);
    await expect(page.locator('[data-zone-menu]')).toBeVisible({ timeout: 10000 });
    await openBtn.click();
    await page.locator('[data-zone-menu] button[aria-label="ביטול"]').click();
    await expect(page.locator('[data-zone-menu]')).toHaveCount(0);
    await page.waitForTimeout(1200);
    expect((await zoneState(page, mapId, hitZone!.id))?.restriction,
      'ה-✕ החיל את השינוי במקום לבטל אותו').toBe('closed');

    // ── פתיחה + אישור מנקה גם את ההיקף ─────────────────────────────────────
    await page.mouse.click(target!.edge.x, target!.edge.y);
    await expect(page.locator('[data-zone-menu]')).toBeVisible({ timeout: 10000 });
    await openBtn.click();
    await applyZoneMenu(page);
    await expect.poll(async () => {
      const z = await zoneState(page, mapId, hitZone!.id);
      return `${z?.restriction}|${z?.restriction_alt_min}|${z?.restriction_alt_max}|${JSON.stringify(z?.restriction_range_ids)}`;
    }, { timeout: 10000 }).toBe('|null|null|[]');
  } finally {
    await cleanup(page, mapId, null, hitZone!.id);
  }
});

test('נגיעה בתוך האזור אינה פותחת את התפריט - הפנים הוא יעד שחרור', async ({ page }) => {
  test.setTimeout(420000);
  const found = await loginToFzPreset(page);
  test.skip(!found, 'אין עמדת אזורי-טיסה עם אזורים משורטטים בסביבה הזו');
  await expect(page.locator('[data-map-layer] img').first()).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-zone-layer] g[data-zone-id]').first()).toBeAttached({ timeout: 20000 });

  const target = await drawnZoneTargets(page);
  expect(target, 'לא נמצא אזור מצויר על המפה').toBeTruthy();

  await page.mouse.click(target!.center.x, target!.center.y);
  await expect(page.locator('[data-zone-menu]')).toHaveCount(0);
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

/**
 * ממתינה שההגבלה תגיע ל**אזור המסוים** על המסך - היא נמשכת בפולינג (כל 5
 * שניות), לא נדחפת, ולכן כתיבה ב-API אינה מורגשת בעמדה מיד.
 *
 * הבדיקה היא על ה-`<g>` של אותו אזור ולא על שכבת האזורים כולה: הגרסה הקודמת
 * חיפשה את המילה בכל השכבה, קיבלה אותה מאזור **אחר**, והמשיכה לפני שהעמדה
 * ידעה על ההגבלה - ואז הגרירה עברה בלי התראה. זה נראה כמו באג במוצר ולא היה.
 */
const waitForZoneRestrictionOnMap = (page: Page, zoneId: number, label: string) =>
  expect.poll(async () => page.evaluate(([id, needle]) => {
    const g = document.querySelector(`[data-zone-layer] g[data-zone-id="${id}"]`);
    return (g?.textContent || '').includes(needle as string);
  }, [zoneId, label] as [number, string]),
  { timeout: 40000, message: `ההגבלה ("${label}") לא הופיעה על אזור ${zoneId}` }).toBeTruthy();

/**
 * סוגרת כל שכבה שמכסה את המפה - תפריט אזור פתוח או התראה קופצת. בלעדיה
 * הלחיצה הבאה נבלעת בשכבה ולא מגיעה למפה, והבדיקה נופלת על "כלום לא קרה".
 */
async function clearOverlays(page: Page) {
  for (let i = 0; i < 6; i++) {
    if ((await page.locator('[data-zone-alert-popup]').count()) > 0) {
      await page.getByRole('button', { name: 'הבנתי' }).click().catch(() => {});
    } else if ((await page.locator('[data-zone-menu]').count()) > 0) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.mouse.click(3, 3).catch(() => {});
    } else { return; }
    await page.waitForTimeout(250);
  }
}

const pairInto = async (page: Page, stripId: number, x: number, y: number) => {
  await clearOverlays(page);
  await page.locator(`#sidebar-area [data-fz-pick="${stripId}"]`).first().click();
  await expect(page.locator('[data-fz-sel="1"]')).toHaveCount(1);
  // התראה קופצת שנולדה **בין** בחירת הפ"מ ללחיצה על המפה בולעת את הלחיצה,
  // והבדיקה נופלת על "השיוך לא נוצר". מנקים שוב, ואם הניקוי איבד את הבחירה -
  // בוחרים מחדש.
  if ((await page.locator('[data-zone-alert-popup]').count()) > 0) {
    await clearOverlays(page);
    if ((await page.locator('[data-fz-sel="1"]').count()) === 0) {
      await page.locator(`#sidebar-area [data-fz-pick="${stripId}"]`).first().click();
      await expect(page.locator('[data-fz-sel="1"]')).toHaveCount(1);
    }
  }
  await page.mouse.click(x, y);
};

test('אזור סגור: השיוך **נחסם** והתראה יוצאת', async ({ page }) => {
  test.setTimeout(420000);
  const found = await loginToFzPreset(page);
  test.skip(!found, 'אין עמדת אזורי-טיסה עם אזורים משורטטים בסביבה הזו');
  const { mapId, zones } = found!;

  const { stripId, target } = await readyToPair(page, mapId);
  test.skip(!stripId, 'כל הפ"מים בסרגל כבר משויכים - הבדיקה דורשת פ"מ נקי');
  expect(target, 'לא נמצא אזור מצויר על המפה').toBeTruthy();
  const zoneId = target!.zoneId;
  const zoneName = zones.find(z => z.id === zoneId)?.name || '';

  try {
    // סגירה **גורפת** (בלי טווח) - החסימה לא תלויה בגובה שרשום בפ"מ
    expect(await setZoneRestriction(page, zoneId, 'closed')).toBeTruthy();
    await waitForZoneRestrictionOnMap(page, zoneId, 'סגור');
    // פ"מים שכבר ישבו באזור מייצרים "אויש אזור סגור" - חלון קופץ שחוסם את
    // המסך, והלחיצה הבאה הייתה נבלעת בו
    await page.waitForTimeout(1500);
    await drainPopups(page);
    await clearOverlays(page);

    const drop = await freePointIn(page, `[data-zone-layer] g[data-zone-id="${zoneId}"]`);
    expect(drop, 'אין נקודה פנויה בתוך האזור - כולו מכוסה בפ"מים').toBeTruthy();
    await pairInto(page, stripId!, drop!.x, drop!.y);

    // ההתראה היא **חלון קופץ** ולא שורה בראש המסך, והיא נוקבת באזור ובפ"מ
    const body = await expectPopup(page, 'האזור סגור - השיוך נדחה');
    expect(body, 'ההתראה אינה נוקבת בשם האזור').toContain(zoneName);
    // ...ו**לא** נוצר שיוך. ההמתנה כאן היא הפואנטה: אילו השיוך היה נוצר באיחור,
    // בדיקה מיידית הייתה עוברת בטעות.
    await page.waitForTimeout(3000);
    expect(await assignmentOf(page, mapId, stripId!), 'נוצר שיוך לאזור סגור').toBeNull();
  } finally {
    // החלון הקופץ מכסה את המסך; סוגרים אותו לפני הניקוי
    await page.locator('[data-zone-alert-popup] button').first().click().catch(() => {});
    await cleanup(page, mapId, stripId, zoneId);
  }
});

test('אזור מוגבל: השיוך **מותר** והתראה יוצאת', async ({ page }) => {
  test.setTimeout(420000);
  const found = await loginToFzPreset(page);
  test.skip(!found, 'אין עמדת אזורי-טיסה עם אזורים משורטטים בסביבה הזו');
  const { mapId, zones } = found!;

  const { stripId, target } = await readyToPair(page, mapId);
  test.skip(!stripId, 'כל הפ"מים בסרגל כבר משויכים - הבדיקה דורשת פ"מ נקי');
  expect(target, 'לא נמצא אזור מצויר על המפה').toBeTruthy();
  const zoneId = target!.zoneId;
  const zoneName = zones.find(z => z.id === zoneId)?.name || '';

  try {
    expect(await setZoneRestriction(page, zoneId, 'restricted')).toBeTruthy();
    await waitForZoneRestrictionOnMap(page, zoneId, 'מוגבל');
    await page.waitForTimeout(1500);
    await drainPopups(page);

    const drop = await freePointIn(page, `[data-zone-layer] g[data-zone-id="${zoneId}"]`);
    expect(drop, 'אין נקודה פנויה בתוך האזור - כולו מכוסה בפ"מים').toBeTruthy();
    await pairInto(page, stripId!, drop!.x, drop!.y);

    // כאן ההפך מהבדיקה שמעל: השיוך **כן** נוצר, וההתראה בכל זאת יוצאת
    await expect.poll(async () => (await assignmentOf(page, mapId, stripId!))?.zone_id ?? null,
      { timeout: 20000, message: 'השיוך לא נוצר באזור מוגבל' }).toBe(zoneId);
    // ההתראה נוקבת באזור, וגם ב**גבהים הפתוחים** ובהערת המגבלה - זו המחצית
    // השימושית שלה: לא רק "יש מגבלה", אלא מה כן אפשר
    const body = await expectPopup(page, 'גררת לאזור מוגבל');
    expect(body, 'ההתראה אינה נוקבת בשם האזור').toContain(zoneName);
  } finally {
    await cleanup(page, mapId, stripId, zoneId);
  }
});

/** הגבלה לפי **בלוקים** - המנגנון של אזור מפוצל. */
const setZoneBlocks = (page: Page, zoneId: number, kind: 'closed' | 'restricted', blockIds: number[]) =>
  apiPatch(page, `/api/map-zones/${zoneId}/operational`,
    { restriction: kind, restriction_range_ids: blockIds });

// ─── מוד "פצל לגבהים": הרצועה היא ההכרעה ─────────────────────────────────────
// הבדיקה הקשה מכולן, ולכן היא קיימת: אזור אחד שבו רצועה **סגורה** ורצועה
// **פתוחה**. שחרור על הסגורה חייב להיחסם, ושחרור על הפתוחה - להתקבל. הלוגיקה
// הטהורה (`bandRestrictionKind`) נבדקת ב-vitest; מה שרק כאן נתפס הוא החיווט -
// `altBlockAtPoint` על נקודת השחרור, מול הרצועה שבאמת מצוירת על המסך.

/** מדליק את "⇅ פצל לגבהים" אם הוא כבוי. */
async function enableSplitByAlt(page: Page) {
  const btn = page.locator('[data-split-by-alt]').first();
  await expect(btn).toBeVisible({ timeout: 15000 });
  if ((await btn.getAttribute('data-split-by-alt')) === '0') await btn.click();
  await expect(btn).toHaveAttribute('data-split-by-alt', '1');
}

/**
 * העמדה והאזור לבדיקת הפיצול: אזור עם **שני בלוקי גובה** לפחות.
 *
 * החיפוש עובר ב-API בלבד ואז נכנס לעמדה **פעם אחת**. הגרסה הקודמת נכנסה לכל
 * עמדה בתורה כדי לבדוק אם היא מציירת רצועות - זה לקח דקות, והתוצאה השתנתה בין
 * הרצה להרצה. בדיקה שהתשובה שלה מתחלפת גרועה מבדיקה שאינה קיימת.
 */
async function findSplitZone(page: Page) {
  const presets = await apiGet(page, '/api/workstation-presets');
  if (!Array.isArray(presets)) return null;
  for (const p of presets as any[]) {
    if (!p.flight_zones_mode || !p.map_id || String(p.name || '').startsWith('__')) continue;
    const zones = await apiGet(page, `/api/map-zones?map_id=${p.map_id}`);
    if (!Array.isArray(zones)) continue;
    for (const z of (zones as any[]).filter(x => x.enabled !== false).slice(0, 40)) {
      const blocks = await apiGet(page, `/api/zone-altitude-ranges?zone_id=${z.id}`);
      if (Array.isArray(blocks) && blocks.length >= 2) {
        return { presetName: p.name as string, mapId: p.map_id as number, zoneId: z.id as number, blocks: blocks as any[] };
      }
    }
  }
  return null;
}

/**
 * מסלקת חלונות קופצים שכבר ממתינים בתור.
 *
 * סגירת רצועה שיושבים בה פ"מים **מראש** מוציאה "אויש אזור סגור" - וזו התראה
 * נכונה ורצויה, אבל לא זו שהבדיקה באה לבדוק. בלי הניקוי הזה הבדיקה הייתה
 * נופלת על התראה **אמיתית** של המערכת, וזה מסוג הכשלים שמלמדים לכבות בדיקות.
 */
async function drainPopups(page: Page) {
  const popup = page.locator('[data-zone-alert-popup]');
  for (let i = 0; i < 6 && (await popup.count()) > 0; i++) {
    await page.getByRole('button', { name: 'הבנתי' }).click().catch(() => {});
    await page.waitForTimeout(200);
  }
  await expect(popup).toHaveCount(0);
}

/**
 * ממתינה להתראה קופצת שנושאת טקסט מסוים, ומסלקת אותה.
 *
 * החלון מציג את **ראש התור** בלבד, ולכן התראה נכונה שקדמה בתור (למשל "אויש
 * אזור סגור" על פ"מ שכבר ישב ברצועה שנסגרה) מסתירה את זו שנבדקת. הלולאה
 * מסלקת אותן עד שמגיעה המבוקשת - ונופלת אם היא לא הגיעה.
 */
async function expectPopup(page: Page, text: string): Promise<string> {
  const popup = page.locator('[data-zone-alert-popup]');
  for (let i = 0; i < 6; i++) {
    await expect(popup).toBeVisible({ timeout: 20000 });
    const body = (await popup.innerText()) || '';
    await page.getByRole('button', { name: 'הבנתי' }).click();
    await expect(popup).toHaveCount(0);
    if (body.includes(text)) return body;
  }
  throw new Error(`לא הופיעה התראה קופצת עם "${text}"`);
}

/**
 * נקודת מסך **פנויה** בתוך פוליגון SVG נתון - כזו שהלחיצה עליה מגיעה למפה.
 *
 * מרכז האזור אינו בהכרח פנוי: פ"מ שכבר יושב שם מכסה אותו, והלחיצה נבלעת בפין
 * במקום להגיע לשכבת המפה. זה בדיוק מה שהפיל את הבדיקות - הן "לחצו על האזור"
 * והכלום קרה. לכן נדגמות כמה נקודות בתוך הפוליגון, ונבחרת הראשונה
 * ש-`elementFromPoint` מחזיר עליה את שכבת המפה ולא פ"מ.
 */
async function freePointIn(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const poly = document.querySelector(sel)?.querySelector('polygon') as SVGPolygonElement | null;
    const ctm = poly?.getScreenCTM();
    if (!poly || !ctm) return null;
    const n = poly.points.numberOfItems;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) { const q = poly.points.getItem(i); pts.push({ x: q.x, y: q.y }); }
    const inside = (x: number, y: number) => {
      let hit = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) hit = !hit;
      }
      return hit;
    };
    const toScreen = (x: number, y: number) => ({ x: ctm.a * x + ctm.c * y + ctm.e, y: ctm.b * x + ctm.d * y + ctm.f });
    const cx = pts.reduce((s2, q) => s2 + q.x, 0) / pts.length;
    const cy = pts.reduce((s2, q) => s2 + q.y, 0) / pts.length;
    const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    // המרכז קודם, ואחריו רשת דגימה בתוך התיבה החוסמת
    const cands: { x: number; y: number }[] = [{ x: cx, y: cy }];
    for (let a = 1; a <= 5; a++) for (let b = 1; b <= 5; b++) {
      const x = minX + (maxX - minX) * a / 6, y = minY + (maxY - minY) * b / 6;
      if (inside(x, y)) cands.push({ x, y });
    }
    for (const c of cands) {
      const p2 = toScreen(c.x, c.y);
      const el = document.elementFromPoint(p2.x, p2.y) as HTMLElement | null;
      if (!el) continue;
      // פ"מ על המפה בולע את הלחיצה; שכבת המפה עצמה היא היעד
      if (el.closest('.bt-strip') || el.closest('[data-fz-pin]')) continue;
      if (!el.closest('[data-map-panel]')) continue;
      return p2;
    }
    return null;
  }, selector);
}

/** נקודת מסך במרכז **רצועת גובה** מסוימת (`data-zone-band` = מזהה הבלוק). */
const bandCenter = (page: Page, blockId: number) =>
  freePointIn(page, `[data-zone-layer] g[data-zone-band="${blockId}"]`);

test('מפוצל לגבהים: רצועה סגורה חוסמת, רצועה פתוחה באותו אזור מקבלת', async ({ page }) => {
  test.setTimeout(420000);
  await loginToWorkstation(page);
  const target = await findSplitZone(page);
  test.skip(!target, 'אין אזור עם שני בלוקי גובה - הבדיקה דורשת אזור מפוצל');
  const { presetName, mapId, zoneId, blocks } = target!;
  const shutBlock = blocks[0].id as number, openBlock = blocks[1].id as number;

  await loginToWorkstation(page, { preset: presetName });
  const { stripId } = await readyToPair(page, mapId);
  test.skip(!stripId, 'כל הפ"מים בסרגל כבר משויכים - הבדיקה דורשת פ"מ נקי');
  const popup = page.locator('[data-zone-alert-popup]');

  try {
    // סוגרים **רק** רצועה אחת. זו הפואנטה: האזור אינו סגור כולו, ולכן הרצועה
    // השנייה חייבת להמשיך לקבל פ"מים - סגירה של גובה אינה סגירה של אזור.
    expect(await setZoneBlocks(page, zoneId, 'closed', [shutBlock])).toBeTruthy();
    await enableSplitByAlt(page);
    const shutBand = page.locator(`[data-zone-layer] g[data-zone-band="${shutBlock}"]`);
    if ((await shutBand.count()) === 0) {
      await expect(shutBand).toBeAttached({ timeout: 30000 }).catch(() => {});
    }
    test.skip((await shutBand.count()) === 0, 'האזור המפוצל אינו מצויר על המפה של העמדה הזו');
    // פ"מים שכבר ישבו ברצועה שנסגרה מייצרים "אויש אזור סגור" - התראה נכונה
    // שאינה מה שנבדק כאן
    await page.waitForTimeout(1500);
    await drainPopups(page);

    // ── שחרור על הרצועה ה**סגורה** - נחסם ────────────────────────────────
    const shutPt = await bandCenter(page, shutBlock);
    expect(shutPt, 'לא נמצאה הרצועה הסגורה על המפה').toBeTruthy();
    await pairInto(page, stripId!, shutPt!.x, shutPt!.y);

    await expectPopup(page, 'האזור סגור - השיוך נדחה');
    // ההמתנה היא הפואנטה: שיוך שנוצר באיחור היה חומק מבדיקה מיידית
    await page.waitForTimeout(3000);
    expect(await assignmentOf(page, mapId, stripId!), 'נוצר שיוך לרצועה סגורה').toBeNull();

    // ── שחרור על הרצועה ה**פתוחה** באותו אזור - עובר ─────────────────────
    const openPt = await bandCenter(page, openBlock);
    expect(openPt, 'לא נמצאה הרצועה הפתוחה על המפה').toBeTruthy();
    await pairInto(page, stripId!, openPt!.x, openPt!.y);
    await expect.poll(async () => (await assignmentOf(page, mapId, stripId!))?.zone_id ?? null,
      { timeout: 20000, message: 'השיוך לרצועה הפתוחה נחסם בטעות' }).toBe(zoneId);
    await expect(popup).toHaveCount(0); // רצועה פתוחה - בלי התראה
  } finally {
    await drainPopups(page).catch(() => {});
    await cleanup(page, mapId, stripId, zoneId).catch(() => {});
  }
});
