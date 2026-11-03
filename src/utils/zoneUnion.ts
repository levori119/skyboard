import polygonClipping from 'polygon-clipping';

/**
 * **מתאר מקיף לאזורים מחוברים** - פ"מ שמשויך לכמה אזורים מקבל קו אחד שמקיף את
 * כולם. הדרישה: פוליגון **תקין** - סגור, אחד, ושלא חותך את עצמו.
 *
 * איך:
 * 1. איחוד מדויק של האזורים (`polygon-clipping`). אזורים שנוגעים - נגמר כאן.
 * 2. אזורים **שאינם נוגעים** (פער ביניהם): **סגירה מורפולוגית** - מרחיבים את
 *    האזורים ברדיוס r, מאחדים, ומכווצים חזרה באותו r. המתאר חוזר בדיוק לגבולות
 *    האזורים, ורק פערים צרים מ-2r מתמלאים - בגשר צר ומעוגל ולא במשולש רחב.
 *    הרדיוס הוא הקטן ביותר שמחבר את כל החלקים.
 * 3. רק אם גם הרדיוס הגדול לא חיבר (אזורים רחוקים מאוד) - גשר קמור בין הצלעות
 *    הקרובות, כמו בגרסה הקודמת.
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

// ── סגירה מורפולוגית ─────────────────────────────────────────────────────────
// polygon-clipping נשבר (SweepLine) על הרבה מקטעים כמעט-חופפים - בדיוק מה
// שעיבוי צלעות מייצר. לכן כל קואורדינטה מיושרת לרשת של 1/1000 אחוז, והחיבור
// והחיסור נעשים בהדרגה, חלק אחרי חלק.
const GRID = 1000;
const snapPt = ([x, y]: Pt): Pt => [Math.round(x * GRID) / GRID, Math.round(y * GRID) / GRID];
const snapMP = (mp: Pt[][][]): Pt[][][] => mp.map(poly => poly.map(r => r.map(snapPt)));
const closedSnap = (r: Pt[]): Ring => { const s2 = r.map(snapPt); return close(s2); };

/** "עיבוי" של קווי המתאר ברדיוס r: מלבן סביב כל צלע ומצולע עגול סביב כל קודקוד */
function thickenRings(ringsList: Ring[], r: number): Pt[][][] {
  const out: Pt[][][] = [];
  const DISK = 8;
  for (const ring of ringsList) {
    const rr = open(ring);
    for (let i = 0; i < rr.length; i++) {
      const a = rr[i], b = rr[(i + 1) % rr.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      if (len > 1e-6) {
        const nx = (-dy / len) * r, ny = (dx / len) * r;
        out.push([closedSnap([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]])]);
      }
      const disk: Pt[] = [];
      for (let k = 0; k < DISK; k++) { const t = ((k + 0.5) / DISK) * Math.PI * 2; disk.push([a[0] + Math.cos(t) * r, a[1] + Math.sin(t) * r]); }
      out.push([closedSnap(disk)]);
    }
  }
  return out;
}
const allRings = (mp: Pt[][][]): Ring[] => mp.flatMap(poly => poly.map(r => r as Ring));

/** סגירה: הרחבה ב-r ואז כיווץ ב-r. מחזיר את המצולע המרובה, או null בכשל */
function closing(polys: Pt[][][], r: number): Pt[][][] | null {
  try {
    let dil: Pt[][][] = snapMP(polys);
    for (const piece of thickenRings(polys.map(p => p[0] as Ring), r)) dil = snapMP(polygonClipping.union(dil as any, piece as any) as Pt[][][]);
    // כיווץ = מה שנשאר אחרי שמורידים את עיבוי הגבול של התוצאה (כולל חורים)
    let acc = dil;
    for (const piece of thickenRings(allRings(dil), r)) acc = snapMP(polygonClipping.difference(acc as any, piece as any) as Pt[][][]);
    return acc;
  } catch { return null; }
}

// המתאר נבנה בכל ציור של המפה (פולינג, פאן, זום), והסגירה יקרה - ולכן מטמון
// לפי הצורות עצמן. אותם אזורים = אותו מתאר, בלי לחשב שוב.
const CACHE_MAX = 300;
const cache = new Map<string, Ring | null>();

export function unionZones(rings: Ring[]): Ring | null {
  const key = rings.map(r => open(r).map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' ')).sort().join('|');
  if (cache.has(key)) return cache.get(key)!;
  const res = unionZonesRaw(rings);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, res);
  return res;
}

function unionZonesRaw(rings: Ring[]): Ring | null {
  const polys = rings.map(open).filter(r => r.length >= 3).map(r => [close(r)]);
  if (!polys.length) return null;
  let merged: Pt[][][];
  try { merged = polygonClipping.union(polys[0] as any, ...(polys.slice(1) as any)) as Pt[][][]; } catch { return null; }
  if (merged.length > 1) {
    // הרדיוס הקטן ביותר שמחבר הכל לחלק אחד (באחוזי תמונה). החלק הגדול בתוצאה
    // חייב לכסות את כל האזורים - אחרת הכיווץ "ניתק" אחד מהם
    const totalArea = polys.reduce((sum, p) => sum + area(open(p[0] as Ring)), 0);
    for (const r of [0.4, 0.8, 1.2, 1.8, 2.6, 3.6, 5, 7]) {
      const c = closing(polys, r);
      if (!c) break;
      const outs = outerRings(c);
      if (outs.length === 1 && area(outs[0]) >= totalArea * 0.98) { merged = c; break; }
    }
  }
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
