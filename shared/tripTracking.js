// מעקב נסיעה חי - הלוגיקה הטהורה. אפיון: TRIP_LIVE_TRACKING_SPEC.md.
//
// **מקור אמת יחיד** לשלושה צדדים שחייבים להסכים:
//   שרת           - הערכת סטייה וחסימה על כל קריאת GPS (routes/permits.js)
//   אפליקציית נהג - התרעות מקומיות, בלי תלות בקליטה (public/driver.html)
//   מגדל          - מיקום הרכב על מפת השדה
//
// הקוד הקיים החזיק שלושה עותקי haversine, שני עותקי המרת נ"צ↔אחוזים (בלי
// הופכי בשרת) ושלושה עותקים לא עקביים של "אלמנט חוסם". מעקב חי שבו השרת
// מחשב סטייה בכלל אחד והנהג בכלל אחר הוא מגדל ונהג שחלוקים על המציאות.
//
// ES module בלי תלויות: נטען ב-Node, ב-vitest ובדף הנהג (/driver/tracking.js).

// ── הספים ────────────────────────────────────────────────────────────────────
// ארבעת הראשונים הם הכרעה תפעולית של אורי (2026-09-13) - לא לשנות בלי אישור.

/** נהג: התקרבות לקו האמצע של מסלול טיסה */
export const RUNWAY_ALERT_M = 150;
/** נהג: התקרבות למסלול הסעה */
export const TAXIWAY_ALERT_M = 100;
/** נהג ומגדל: התקרבות לאלמנט שסוגר את הדרך */
export const ELEMENT_ALERT_M = 50;
/** מגדל: מרחק מהנתיב שנחשב סטייה */
export const DEVIATION_M = 200;
/** מגדל: קריאות רצופות מעל הסף עד שמתריעים (~10 ש' בקצב 5 ש'). קפיצת GPS בודדת
 *  ליד מבנים והאנגרים לא מקפיצה התרעת שווא שהפקח לומד להתעלם ממנה. */
export const DEVIATION_STREAK = 2;

// ספים טכניים - אינם הכרעה תפעולית.

/** אלמנט במרחק זה מקו הנתיב נחשב "על הדרך". רמזורים ומחסומים עומדים בצד הכביש. */
export const ROUTE_CORRIDOR_M = 40;
/** קריאה בדיוק גרוע מזה נשמרת ומוצגת, אך אינה מקפיצה התרעה ואינה נספרת לסטייה */
export const MAX_ACCURACY_M = 100;
/** קריאה ישנה מזה = "אות אבד" במגדל */
export const STALE_FIX_MS = 60_000;
/** אותה התרעה לאותו יעד לא חוזרת בתוך פרק הזמן הזה */
export const ALERT_COOLDOWN_MS = 60_000;

// ── עוגן והמרת נ"צ ↔ אחוזי מפה ─────────────────────────────────────────────
// אותה מתמטיקה כמו src/utils/geo.ts בהיטל הלינארי (ברירת המחדל של כל מפות השדה):
// אינטרפולציה בשתי נקודות, בכל ציר בנפרד.

const finite = v => (v === null || v === undefined || v === '' ? NaN : Number(v));

/**
 * עוגן משורת `maps` או `airfields` (anchor1_x_img ... anchor2_lon).
 * null כשחסר ערך, או כששתי נקודות העוגן חולקות ציר - שם החלוקה היא באפס,
 * והתוצאה הייתה מיקום שגוי בשקט.
 */
export function anchorFrom(row) {
  if (!row) return null;
  const a = {
    x1: finite(row.anchor1_x_img), y1: finite(row.anchor1_y_img),
    lat1: finite(row.anchor1_lat), lon1: finite(row.anchor1_lon),
    x2: finite(row.anchor2_x_img), y2: finite(row.anchor2_y_img),
    lat2: finite(row.anchor2_lat), lon2: finite(row.anchor2_lon),
  };
  if (Object.values(a).some(v => !Number.isFinite(v))) return null;
  if (a.x1 === a.x2 || a.y1 === a.y2 || a.lat1 === a.lat2 || a.lon1 === a.lon2) return null;
  return a;
}

/** אחוזי מפה → נ"צ. בלי עוגן - null, ולא נקודה מומצאת. */
export function pctToLatLon(xPct, yPct, a) {
  // finite ולא Number: Number(null) הוא 0, ואלמנט בלי מיקום היה נוחת בפינת המפה
  if (!a || !Number.isFinite(finite(xPct)) || !Number.isFinite(finite(yPct))) return null;
  const tx = (Number(xPct) - a.x1) / (a.x2 - a.x1);
  const ty = (Number(yPct) - a.y1) / (a.y2 - a.y1);
  return { lat: a.lat1 + ty * (a.lat2 - a.lat1), lon: a.lon1 + tx * (a.lon2 - a.lon1) };
}

/**
 * נ"צ → אחוזי מפה. **אינו חותך ל-0..100:** רכב שיצא מגבולות התמונה עדיין
 * נמצא במקום אמיתי, והמסך מחליט אם להציגו.
 */
export function latLonToPct(lat, lon, a) {
  if (!a || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return null;
  const tx = (Number(lon) - a.lon1) / (a.lon2 - a.lon1);
  const ty = (Number(lat) - a.lat1) / (a.lat2 - a.lat1);
  return { x: a.x1 + tx * (a.x2 - a.x1), y: a.y1 + ty * (a.y2 - a.y1) };
}

// ── מרחקים במטרים ────────────────────────────────────────────────────────────

const R = 6371000;
const RAD = Math.PI / 180;
const validPt = q => q && Number.isFinite(Number(q.lat)) && Number.isFinite(Number(q.lon));

/**
 * מרחק במטרים מנקודה למקטע.
 *
 * הטלה שוות-מרחק (equirectangular) מקומית סביב הנקודה: בקנה מידה של שדה תעופה
 * (כמה ק"מ) השגיאה מול haversine קטנה ממטר, והיא מאפשרת מרחק ניצב לקטע -
 * שאין לו נוסחה ישירה על כדור. מעבר לקצוות המקטע המרחק הוא לנקודת הקצה.
 */
export function metersToSegment(p, a, b) {
  const lat0 = Number(p.lat) * RAD;
  const k = Math.cos(lat0);
  const xy = q => ({ x: (Number(q.lon) - Number(p.lon)) * RAD * R * k, y: (Number(q.lat) - Number(p.lat)) * RAD * R });
  const A = xy(a), B = xy(b);
  const dx = B.x - A.x, dy = B.y - A.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(A.x * dx + A.y * dy) / len2));
  const cx = A.x + t * dx, cy = A.y + t * dy;
  return Math.hypot(cx, cy);
}

/**
 * מרחק במטרים מנקודה לקו שבור, והמקטע הקרוב ביותר.
 * `{ meters, index }` - index הוא אינדקס תחילת המקטע. null לקו ריק.
 */
export function metersToPolyline(p, line) {
  if (!validPt(p) || !Array.isArray(line)) return null;
  const pts = line.filter(validPt);
  if (!pts.length) return null;
  if (pts.length === 1) return { meters: metersToSegment(p, pts[0], pts[0]), index: 0 };
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const m = metersToSegment(p, pts[i], pts[i + 1]);
    if (!best || m < best.meters) best = { meters: m, index: i };
  }
  return best;
}

// ── הנתיב שנשמר על הנסיעה ────────────────────────────────────────────────────

/**
 * נקודות מ-/api/route-plan בצורה המצומצמת שנשמרת ב-route_options.waypoints.
 * **מראה של `compactRouteWaypoints`** (src/utils/trips.ts) - הלקוח שומר בה בזמן
 * האישור, והשרת בה כשהוא משלים נתיב לנסיעה ישנה. בדיקת התאמה ב-trips.test.ts.
 */
export function compactWaypoints(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const w of raw) {
    if (!w || typeof w !== 'object') continue;
    const lat = finite(w.lat), lon = finite(w.lon ?? w.lng);
    const xPct = finite(w.xPct ?? w.x), yPct = finite(w.yPct ?? w.y);
    const hasGeo = Number.isFinite(lat) && Number.isFinite(lon);
    const hasPct = Number.isFinite(xPct) && Number.isFinite(yPct);
    if (!hasGeo && !hasPct) continue;
    out.push({
      lat: hasGeo ? lat : null, lon: hasGeo ? lon : null,
      xPct: hasPct ? xPct : null, yPct: hasPct ? yPct : null,
      routeType: typeof w.routeType === 'string' && w.routeType ? w.routeType : 'vehicle',
      isCrossing: w.isCrossing === true,
      ...(w.isStop === true ? { isStop: true } : {}),
    });
  }
  return out;
}

// ── אלמנט סוגר את הדרך ───────────────────────────────────────────────────────
// הכלל של /api/live-runway-conflicts ושל חלון הניווט במגדל, מאוחד.

/** המצב התפעולי (display_state) → התווית שהמנהלן בוחר ב-blocking_statuses */
export const DISPLAY_STATE_LABEL = {
  close: 'סגור', open: 'פתוח', off: 'כבוי', stop: 'עצור', go: 'עבור', blink: 'מנצנץ',
};

/** ברירות המחדל לקטגוריה כשלאלמנט לא הוגדרו סטטוסים חוסמים */
const CATEGORY_BLOCK_DEFAULT = { 'STOP BAR': 'מנצנץ', 'רמזורים': 'מנצנץ', 'מחסומים': 'סגור' };

const NOT_ON_ROAD = new Set(['camera', 'כלי רכב']);

const jsonList = v => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
};

/** הסטטוסים שבהם האלמנט סוגר: המפורשים, אחרת ברירת המחדל לקטגוריה, אחרת המותר הראשון. */
export function effectiveBlockingStatuses(el) {
  const explicit = jsonList(el?.blocking_statuses).map(String).filter(Boolean);
  if (explicit.length) return explicit;
  const byCategory = CATEGORY_BLOCK_DEFAULT[el?.category];
  if (byCategory) return [byCategory];
  const allowed = jsonList(el?.type_allowed_statuses ?? el?.allowed_statuses).map(String).filter(Boolean);
  return allowed.length ? [allowed[0]] : [];
}

/**
 * האם האלמנט סוגר את הדרך עכשיו.
 * **אלמנט "לא שמיש" אינו סוגר** - מחסום שבור אינו יכול להיסגר, והתרעה עליו
 * שולחת את הנהג לחכות מול מחסום שלא יזוז.
 */
export function isElementBlocking(el) {
  if (!el || el.status === 'לא שמיש') return false;
  const blocking = effectiveBlockingStatuses(el);
  if (!blocking.length) return false;
  const stateLabel = DISPLAY_STATE_LABEL[el.display_state || 'normal'];
  return (stateLabel && blocking.includes(stateLabel)) || (!!el.status && blocking.includes(el.status));
}

/**
 * אלמנטי השליטה בתנועה בשדה - כל אלמנט שיכול לסגור דרך (רמזור, מחסום, STOP BAR,
 * או סוג עם סטטוסים) - עם נ"צ. `on_route` - בתוך `ROUTE_CORRIDOR_M` מקו הנתיב,
 * עם `route_distance_m`; בלי נתיב כולם `on_route=false`.
 *
 * **לא מסננים לפי הנתיב.** בשדה אמיתי הרמזורים עמדו 200 מ' ויותר מהנתיב שנשמר
 * (הנתיב הוא צמתי כבישים, והרמזור מצויר ליד הצומת), והפרוזדור השאיר את הנהג
 * בלי אף אלמנט על המפה. ההתרעה ממילא נמדדת מהרכב (`ELEMENT_ALERT_M`), לא מהנתיב.
 * בלי עוגן אין דרך למקם אלמנט (הוא שמור באחוזים).
 */
export function roadControlElements(elements, route, anchor) {
  if (!anchor || !Array.isArray(elements)) return [];
  const line = Array.isArray(route) && route.some(validPt) ? route : null;
  const out = [];
  for (const el of elements) {
    if (!el || NOT_ON_ROAD.has(el.category) || !effectiveBlockingStatuses(el).length) continue;
    const g = pctToLatLon(el.x_pct, el.y_pct, anchor);
    if (!g) continue;
    const d = line ? metersToPolyline(g, line) : null;
    out.push({
      ...el, lat: g.lat, lon: g.lon,
      route_distance_m: d ? d.meters : null,
      on_route: !!d && d.meters <= ROUTE_CORRIDOR_M,
    });
  }
  return out;
}

// ── סטייה (מגדל) ─────────────────────────────────────────────────────────────

/**
 * המונה של הקריאות הרצופות מעל סף הסטייה, אחרי קריאה חדשה.
 * - בלי מרחק (אין נתיב שמור) - 0: אין מול מה לסטות.
 * - דיוק גרוע - המונה **נשאר**: קריאה כזו לא מוכיחה סטייה וגם לא חזרה.
 */
export function nextDeviationStreak(prevStreak, meters, accuracyM) {
  if (meters === null || meters === undefined || !Number.isFinite(Number(meters))) return 0;
  if (Number.isFinite(Number(accuracyM)) && Number(accuracyM) > MAX_ACCURACY_M) return Number(prevStreak) || 0;
  return Number(meters) > DEVIATION_M ? (Number(prevStreak) || 0) + 1 : 0;
}

export const isDeviating = streak => (Number(streak) || 0) >= DEVIATION_STREAK;

// ── סכנות קרובות (נהג) ───────────────────────────────────────────────────────

/**
 * מה קרוב לנהג עכשיו, מהקרוב לרחוק. כל פריט: `{ key, kind, id, name, meters }`.
 * `data`: `{ runways: [{id,name,line}], taxiways: [{id,name,line}], elements: [{id,name,lat,lon,...}] }`.
 * אלמנט מופיע **רק כשהוא סוגר את הדרך** (הכרעת אורי). דיוק גרוע - אין התרעות.
 */
export function findHazards(pos, data) {
  if (!validPt(pos) || !data) return [];
  if (Number.isFinite(Number(pos.accuracy)) && Number(pos.accuracy) > MAX_ACCURACY_M) return [];
  const out = [];
  const lines = (list, kind, limit) => {
    for (const r of Array.isArray(list) ? list : []) {
      const d = metersToPolyline(pos, r?.line);
      if (d && d.meters <= limit) out.push({ key: `${kind}:${r.id}`, kind, id: r.id, name: r.name || '', meters: d.meters });
    }
  };
  lines(data.runways, 'runway', RUNWAY_ALERT_M);
  lines(data.taxiways, 'taxiway', TAXIWAY_ALERT_M);
  for (const el of Array.isArray(data.elements) ? data.elements : []) {
    if (!validPt(el) || !isElementBlocking(el)) continue;
    const d = metersToSegment(pos, el, el);
    if (d <= ELEMENT_ALERT_M) out.push({ key: `element:${el.id}`, kind: 'element', id: el.id, name: el.name || '', meters: d });
  }
  return out.sort((a, b) => a.meters - b.meters);
}

/** האם עבר מספיק זמן מההתרעה האחרונה לאותו יעד. `last` - מפה key → חותמת ms. */
export function cooldownOver(key, last, now = Date.now()) {
  const t = last && last[key];
  return !t || now - t >= ALERT_COOLDOWN_MS;
}

/**
 * התרעה ב**כניסה** לאזור הסכנה, לא כל עוד הרכב בתוכו.
 *
 * בלי זה נתיב שהמגדל אישר לאורך מסלול הסעה היה מתריע כל דקה לכל אורך
 * הנסיעה, והנהג לומד לסגור את ההתרעה בלי לקרוא - בדיוק ההפך מהמטרה.
 * יציאה וכניסה חוזרת מתריעות שוב, בכפוף להשתקה של `ALERT_COOLDOWN_MS`.
 *
 * `state`: `{ inside: key[], lastAt: {key: ms} }`. מחזיר `{ toAlert, state }`.
 */
export function nextAlertState(hazards, state, now = Date.now()) {
  const prevInside = new Set(state?.inside || []);
  const lastAt = { ...(state?.lastAt || {}) };
  const toAlert = [];
  for (const h of Array.isArray(hazards) ? hazards : []) {
    if (prevInside.has(h.key) || !cooldownOver(h.key, lastAt, now)) continue;
    toAlert.push(h);
    lastAt[h.key] = now;
  }
  return { toAlert, state: { inside: (hazards || []).map(h => h.key), lastAt } };
}

/** קריאה ישנה - "אות אבד". בלי קריאה בכלל - גם. */
export function isFixStale(fixAt, now = Date.now()) {
  if (!fixAt) return true;
  const t = new Date(fixAt).getTime();
  return !Number.isFinite(t) || now - t > STALE_FIX_MS;
}
