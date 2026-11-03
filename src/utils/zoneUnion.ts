import polygonClipping from 'polygon-clipping';

/**
 * **מתאר מקיף לאזורים מחוברים** - פ"מ שמשויך לכמה אזורים מקבל קו אחד שמקיף את
 * כולם. הדרישה: פוליגון **תקין** - סגור, אחד, ושלא חותך את עצמו.
 *
 * איך:
 * 1. איחוד מדויק של האזורים (`polygon-clipping`). אזורים שנוגעים - נגמר כאן.
 * 2. אזורים **שאינם נוגעים** (פער ביניהם): מחברים כל פעם את שני החלקים הקרובים
 *    ב"גשר" - המעטפת הקמורה של שתי הצלעות הקרובות ביותר - ומאחדים שוב, עד חלק
 *    אחד. הגשר קמור והאיחוד של `polygon-clipping` תקין תמיד, ולכן התוצאה תקינה.
 *
 * הגרסה הקודמת ניפחה את האזורים ממרכזם עד שנגעו, ואז "הצמידה" כל קודקוד חזרה
 * לצלע הקרובה - וההצמדה היא שהצליבה צלעות (הקו "חתך את עצמו" בין אזורים רחוקים).
 *
 * קואורדינטות באחוזי תמונת המפה (0-100).
 */
export type Pt = [number, number];
type Ring = Pt[];

const close = (r: Ring): Ring => {
  if (!r.length) return r;
  const f = r[0], l = r[r.length - 1];
  return f[0] === l[0] && f[1] === l[1] ? r : [...r, f];
};
const open = (r: Ring): Ring => {
  if (r.length < 2) return r;
  const f = r[0], l = r[r.length - 1];
  return f[0] === l[0] && f[1] === l[1] ? r.slice(0, -1) : r;
};
const area = (r: Ring) => {
  let a = 0;
  for (let k = 0; k < r.length; k++) { const [x1, y1] = r[k], [x2, y2] = r[(k + 1) % r.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a / 2);
};

const ptSegD2 = (p: Pt, a: Pt, b: Pt) => {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / ((abx * abx + aby * aby) || 1)));
  const qx = a[0] + t * abx, qy = a[1] + t * aby;
  return (p[0] - qx) ** 2 + (p[1] - qy) ** 2;
};
/** מרחק בין שני קטעים (בריבוע) - לא נחתכים; אחרת 0 מטופל ע"י האיחוד עצמו */
const segSegD2 = (a1: Pt, a2: Pt, b1: Pt, b2: Pt) =>
  Math.min(ptSegD2(a1, b1, b2), ptSegD2(a2, b1, b2), ptSegD2(b1, a1, a2), ptSegD2(b2, a1, a2));

/** מעטפת קמורה (monotone chain) */
export function convexHull(points: Pt[]): Ring {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [], upper: Pt[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** הגשר בין שני חלקים: המעטפת הקמורה של שתי הצלעות הקרובות ביותר */
function bridge(a: Ring, b: Ring): Ring | null {
  let best = Infinity, ea: [Pt, Pt] | null = null, eb: [Pt, Pt] | null = null;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i], a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j], b2 = b[(j + 1) % b.length];
      const d = segSegD2(a1, a2, b1, b2);
      if (d < best) { best = d; ea = [a1, a2]; eb = [b1, b2]; }
    }
  }
  if (!ea || !eb) return null;
  const h = convexHull([ea[0], ea[1], eb[0], eb[1]]);
  return h.length >= 3 ? h : null;
}

const outerRings = (mp: Pt[][][]): Ring[] => mp.map(poly => open(poly[0] as Ring)).filter(r => r.length >= 3);

export function unionZones(rings: Ring[]): Ring | null {
  const polys = rings.map(open).filter(r => r.length >= 3).map(r => [close(r)]);
  if (!polys.length) return null;
  let merged: Pt[][][];
  try { merged = polygonClipping.union(polys[0] as any, ...(polys.slice(1) as any)) as Pt[][][]; } catch { return null; }
  // מחברים את החלקים הקרובים זה לזה עד שנשאר אחד (תקרה: מספר האזורים)
  for (let guard = 0; merged.length > 1 && guard < rings.length + 2; guard++) {
    const parts = outerRings(merged);
    let bi = -1, bj = -1, bd = Infinity;
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        let d = Infinity;
        for (let x = 0; x < parts[i].length; x++) for (const q of parts[j]) d = Math.min(d, ptSegD2(q, parts[i][x], parts[i][(x + 1) % parts[i].length]));
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    }
    const br = bi >= 0 ? bridge(parts[bi], parts[bj]) : null;
    if (!br) break;
    try { merged = polygonClipping.union(merged as any, [close(br)] as any) as Pt[][][]; } catch { break; }
  }
  // הטבעת החיצונית של החלק הגדול ביותר (בלי חורים - המתאר הוא קו מקיף)
  const outs = outerRings(merged);
  if (!outs.length) return null;
  return outs.reduce((a, b) => (area(b) > area(a) ? b : a));
}

/** האם טבעת פשוטה - אף שתי צלעות לא-שכנות אינן נחתכות (לבדיקות) */
export function isSimpleRing(ring: Ring): boolean {
  const r = open(ring), n = r.length;
  const orient = (a: Pt, b: Pt, c: Pt) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  for (let i = 0; i < n; i++) {
    const a1 = r[i], a2 = r[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const b1 = r[j], b2 = r[(j + 1) % n];
      const o1 = orient(a1, a2, b1), o2 = orient(a1, a2, b2), o3 = orient(b1, b2, a1), o4 = orient(b1, b2, a2);
      if (o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0) return false;
    }
  }
  return true;
}
