// $P Point-Cloud Recognizer (Vatavu, Anthony & Wobbrock, ICMI 2012).
// Pure TypeScript, 100% offline — no model, no network, no dependencies.
// Recognizes a multi-stroke ink gesture by nearest-neighbor matching against
// enrolled templates. Order/direction/stroke-count invariant (good for letters
// and Hebrew). Used by SKY-KING's offline handwriting feature.
//
// A "point cloud" is the set of points from all strokes of one symbol.
// Each Point carries the stroke index it came from (id) so resampling keeps
// stroke boundaries.

export interface Pt { x: number; y: number; id: number }

const NUM_POINTS = 32;

/** Build a point cloud from raw strokes (each stroke = array of {x,y}). */
export function strokesToCloud(strokes: { x: number; y: number }[][]): Pt[] {
  const pts: Pt[] = [];
  strokes.forEach((stroke, id) => {
    for (const p of stroke) pts.push({ x: p.x, y: p.y, id });
  });
  return pts;
}

/** Normalize a raw cloud: resample → scale → translate to origin. */
export function normalize(points: Pt[], n = NUM_POINTS): Pt[] {
  let pts = resample(points, n);
  pts = scale(pts);
  pts = translateToOrigin(pts);
  return pts;
}

function pathLength(points: Pt[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].id === points[i - 1].id) d += dist(points[i - 1], points[i]);
  }
  return d;
}

function resample(points: Pt[], n: number): Pt[] {
  const I = pathLength(points) / (n - 1);
  let D = 0;
  const newPts: Pt[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (points[i].id === points[i - 1].id) {
      const d = dist(points[i - 1], points[i]);
      if (D + d >= I) {
        const t = (I - D) / d;
        const qx = points[i - 1].x + t * (points[i].x - points[i - 1].x);
        const qy = points[i - 1].y + t * (points[i].y - points[i - 1].y);
        const q: Pt = { x: qx, y: qy, id: points[i].id };
        newPts.push(q);
        points.splice(i, 0, q); // insert q so it's the start of next segment
        D = 0;
      } else {
        D += d;
      }
    }
  }
  // rounding can leave us a point short
  while (newPts.length < n) newPts.push({ ...points[points.length - 1] });
  return newPts;
}

function scale(points: Pt[]): Pt[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  return points.map(p => ({ x: (p.x - minX) / size, y: (p.y - minY) / size, id: p.id }));
}

function centroid(points: Pt[]): { x: number; y: number } {
  let x = 0, y = 0;
  for (const p of points) { x += p.x; y += p.y; }
  return { x: x / points.length, y: y / points.length };
}

function translateToOrigin(points: Pt[]): Pt[] {
  const c = centroid(points);
  return points.map(p => ({ x: p.x - c.x, y: p.y - c.y, id: p.id }));
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Greedy cloud match (Hungarian approximation) — lower = more similar. */
function greedyCloudMatch(pts1: Pt[], pts2: Pt[]): number {
  const n = pts1.length;
  const eps = 0.5;
  const step = Math.max(1, Math.floor(Math.pow(n, 1 - eps)));
  let min = Infinity;
  for (let i = 0; i < n; i += step) {
    const d1 = cloudDistance(pts1, pts2, i);
    const d2 = cloudDistance(pts2, pts1, i);
    min = Math.min(min, d1, d2);
  }
  return min;
}

function cloudDistance(pts1: Pt[], pts2: Pt[], start: number): number {
  const n = pts1.length;
  const matched = new Array(n).fill(false);
  let sum = 0;
  let i = start;
  do {
    let min = Infinity, index = -1;
    for (let j = 0; j < n; j++) {
      if (!matched[j]) {
        const d = dist(pts1[i], pts2[j]);
        if (d < min) { min = d; index = j; }
      }
    }
    if (index >= 0) matched[index] = true;
    const weight = 1 - ((i - start + n) % n) / n;
    sum += weight * min;
    i = (i + 1) % n;
  } while (i !== start);
  return sum;
}

export interface Template { name: string; cloud: Pt[] }

export class DollarPRecognizer {
  private templates: Template[] = [];

  /** Enroll a labeled sample (raw strokes). */
  add(name: string, strokes: { x: number; y: number }[][]): void {
    this.templates.push({ name, cloud: normalize(strokesToCloud(strokes)) });
  }

  /** Enroll a pre-normalized cloud (e.g. loaded from DB). */
  addCloud(name: string, cloud: Pt[]): void {
    this.templates.push({ name, cloud });
  }

  get size(): number { return this.templates.length; }

  /**
   * Recognize raw strokes. Returns the best match and a 0..1 score
   * (higher = better), plus a ranked list of candidates.
   */
  recognize(strokes: { x: number; y: number }[][]): {
    name: string | null; score: number; candidates: { name: string; score: number }[];
  } {
    if (this.templates.length === 0) return { name: null, score: 0, candidates: [] };
    const cloud = normalize(strokesToCloud(strokes));
    const scored = this.templates.map(t => {
      const d = greedyCloudMatch(cloud, t.cloud);
      return { name: t.name, score: Math.max(0, 1 - d / 2) };
    });
    // best score per distinct label (a label may have several templates)
    const best = new Map<string, number>();
    for (const s of scored) best.set(s.name, Math.max(best.get(s.name) ?? 0, s.score));
    const candidates = [...best.entries()]
      .map(([name, score]) => ({ name, score }))
      .sort((a, b) => b.score - a.score);
    return { name: candidates[0].name, score: candidates[0].score, candidates };
  }
}
