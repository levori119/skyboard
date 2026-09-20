// שיוך אלמנט שליטה בתנועה (רמזור, מחסום, STOP BAR) ל**נתיב הנסיעה** שעליו הוא
// שולט, ולצומת שלפניו - `airfield_elements.road_relevance`.
//
// **למה בכלל:** עד כאן השיוך נוחש גאומטרית - מתכנן הנתיב תפס כל אלמנט ברדיוס
// 150 מ' מצומת שזוהה ברדיוס 60 מ', והמפה של הנהג סימנה "על הנתיב" בפרוזדור
// 40 מ'. בשדה אמיתי הרמזורים עומדים 228 מ' ויותר מקו הנתיב (הנתיב הוא צמתי
// כבישים, הרמזור מצויר ליד הצומת), ולכן הפרוזדור השאיר את הנהג בלי אלמנטים
// והרדיוס תפס רמזורים של צומת אחר. כאן המגדיר **מצהיר** במקום שהמערכת תנחש.
//
// המבנה: `[{ route_id, cross_route_id }]` - מזהי `base_routes`.
// `cross_route_id: null` = רמזור באמצע נתיב, לא בצומת (מקרה לגיטימי, ולכן
// ההגדרה אינה חובה).
//
// **ההגדרה גוברת על הגאומטריה, ורק לאלמנט שהוגדר.** אלמנט בלי הגדרה ממשיך
// בדיוק כפי שהיה - אחרת כל האלמנטים הקיימים בשדה היו נעלמים מהנהג בשקט ברגע
// שהפיצ'ר עולה.
//
// ES module בלי תלויות: נטען ב-Node, ב-vitest ובאפליקציה (Vite).

const num = v => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** קלט (מערך או JSON) → `[{route_id, cross_route_id}]` נקי, בלי כפילויות. פגום = ריק. */
export function parseRoadRelevance(value) {
  let v = value;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return []; }
  }
  if (!Array.isArray(v)) return [];
  const out = [];
  const seen = new Set();
  for (const item of v) {
    const routeId = num(item && item.route_id);
    if (!routeId) continue;
    let crossId = num(item && item.cross_route_id);
    // נתיב שחוצה את עצמו אינו צומת - הצהרה כזו נקראת "באמצע הנתיב"
    if (crossId === routeId) crossId = null;
    const key = `${routeId}-${crossId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ route_id: routeId, cross_route_id: crossId });
  }
  return out;
}

/** האם למגדיר יש הצהרה על האלמנט הזה */
export function hasRoadRelevance(el) {
  return parseRoadRelevance(el && el.road_relevance).length > 0;
}

/**
 * רצף נתיבי הנסיעה של נתיב מתוכנן, לפי סדר הנסיעה ובלי כפילויות רצופות:
 * `[1,2,1]` = יצא מנתיב 1, עבר ל-2 וחזר ל-1. הרצף (ולא הקבוצה) הוא מה שמאפשר
 * להבחין בין "עבר בצומת של 1 עם 2" לבין "נסע גם על 1 וגם על 2 במקומות שונים".
 */
export function routeSequenceOf(waypoints) {
  if (!Array.isArray(waypoints)) return [];
  const seq = [];
  for (const wp of waypoints) {
    const id = num(wp && (wp.routeId ?? wp.route_id));
    if (!id) continue;
    if (seq[seq.length - 1] !== id) seq.push(id);
  }
  return seq;
}

/**
 * האם האלמנט רלוונטי לנסיעה הזו.
 * - `null` = אין הצהרה (או שלנסיעה אין רצף נתיבים - נתיב שנשמר לפני הפיצ'ר):
 *   **הכרעה לקורא**, שממשיך בכלל הגאומטרי הקיים.
 * - `true` / `false` = ההצהרה הכריעה.
 */
export function elementAppliesToPath(el, routeSequence) {
  const rel = parseRoadRelevance(el && el.road_relevance);
  if (!rel.length) return null;
  const seq = Array.isArray(routeSequence) ? routeSequence.filter(Boolean).map(Number) : [];
  if (!seq.length) return null;

  const used = new Set(seq);
  const junctions = new Set();
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] !== seq[i - 1]) junctions.add(junctionKey(seq[i - 1], seq[i]));
  }
  for (const r of rel) {
    if (!used.has(r.route_id)) continue;
    if (r.cross_route_id === null) return true;
    if (junctions.has(junctionKey(r.route_id, r.cross_route_id))) return true;
  }
  return false;
}

/** מפתח צומת חסר-כיוון: הצומת של 1 עם 2 הוא הצומת של 2 עם 1 */
const junctionKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** תווית לתצוגה: "ציר צפון × ציר מערב", או שם הנתיב לבדו כשאין צומת. */
export function relevanceLabel(rel, routeNames) {
  const get = id => {
    const n = routeNames instanceof Map ? routeNames.get(id) : (routeNames || {})[id];
    return n || 'נתיב שנמחק';
  };
  const main = get(rel && rel.route_id);
  return rel && rel.cross_route_id ? `${main} × ${get(rel.cross_route_id)}` : main;
}
