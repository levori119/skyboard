import { describe, it, expect } from 'vitest';
import { LEG_KEYS, boundsAspect, patternPoints, type LegKey, type PatternGeometry } from './trafficPattern';
import {
  DEFAULT_ALT_PROFILE,
  DEFAULT_CAMERA,
  TILT_MAX,
  TILT_MIN,
  VERT_SPAN,
  aglOf,
  altOnLeg,
  altProfileOf,
  clampTilt,
  clampZoom,
  northArrow,
  normYaw,
  patternPath3D,
  project,
  sceneBounds,
  scaleZ,
  viewBoxFor,
  zScaleFor,
  type Camera3D,
  type Vec3,
  shouldRenderPattern3D,
} from './pattern3d';

// ─── מה נבדק כאן ──────────────────────────────────────────────────────────────
//
// כל מה שהעין של הפקח לא יכולה לאמת. תצוגה תלת מימדית **דו-משמעית מטבעה**: אם
// ההיטל, סדר העומק או קנה המידה שגויים, המסך נראה סביר לחלוטין ומשקר. לכן
// הליבה כאן טהורה ונבדקת, והרכיב רק מצייר את מה שהיא מחזירה.

const G: PatternGeometry = {
  anchor: { x: 50, y: 62 }, bearing: 0, side: 'left',
  rwyLen: 14, upwind: 7, width: 14, baseExt: 7,
};
const PROF = { downwindAlt: 3000, baseAlt: 1500 };
const ISO = (aspect: number) => patternPoints(G, aspect).map(p => ({ x: p.x * aspect, y: p.y }));

describe('project - ההיטל האורתוגרפי', () => {
  it('tilt=90 הוא **בדיוק** מבט-העל המוכר (yaw=0 = פונקציית הזהות)', () => {
    const cam: Camera3D = { yaw: 0, tilt: 90, zoom: 1 };
    for (const p of [{ x: 10, y: 20, z: 0 }, { x: -4, y: 7, z: 999 }]) {
      const q = project(p, cam);
      expect(q.x).toBeCloseTo(p.x, 9);
      expect(q.y).toBeCloseTo(p.y, 9);
    }
  });

  it('tilt=90: הגובה **אינו** מזיז את הנקודה במסך, רק מקרב אותה למצלמה', () => {
    const cam: Camera3D = { yaw: 0, tilt: 90, zoom: 1 };
    const low = project({ x: 10, y: 20, z: 0 }, cam);
    const high = project({ x: 10, y: 20, z: 30 }, cam);
    expect(high.x).toBeCloseTo(low.x, 9);
    expect(high.y).toBeCloseTo(low.y, 9);
    expect(high.near).toBeGreaterThan(low.near);
    expect(high.near).toBeCloseTo(30, 9);
  });

  it('tilt=0 הוא חתך אנכי: x נשמר, והגובה עולה כלפי מעלה במסך', () => {
    const cam: Camera3D = { yaw: 0, tilt: 0, zoom: 1 };
    const q = project({ x: 12, y: 40, z: 25 }, cam);
    expect(q.x).toBeCloseTo(12, 9);
    expect(q.y).toBeCloseTo(-25, 9);   // y במסך גדל כלפי מטה
  });

  it('yaw מסובב את המישור האופקי סביב הציר האנכי, ואינו נוגע בגובה', () => {
    const cam: Camera3D = { yaw: 90, tilt: 90, zoom: 1 };
    const q = project({ x: 1, y: 0, z: 5 }, cam);
    expect(q.x).toBeCloseTo(0, 9);
    expect(q.y).toBeCloseTo(1, 9);
    expect(q.near).toBeCloseTo(5, 9);
  });

  it('ההיטל אורתונורמלי - מרחק במסך לעולם אינו גדול מהמרחק במרחב', () => {
    const a: Vec3 = { x: 3, y: -8, z: 11 };
    const b: Vec3 = { x: -6, y: 4, z: 2 };
    const d3 = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    for (const yaw of [0, 37, 90, 214, 359]) {
      for (const tilt of [5, 30, 55, 90]) {
        const pa = project(a, { yaw, tilt, zoom: 1 });
        const pb = project(b, { yaw, tilt, zoom: 1 });
        expect(Math.hypot(pa.x - pb.x, pa.y - pb.y)).toBeLessThanOrEqual(d3 + 1e-9);
      }
    }
  });
});

describe('near - סדר העומק (אלגוריתם הצייר)', () => {
  it('במבט-על הגבוה קרוב יותר', () => {
    const cam: Camera3D = { yaw: 0, tilt: 90, zoom: 1 };
    const lo = project({ x: 0, y: 0, z: 0 }, cam).near;
    const hi = project({ x: 0, y: 0, z: 40 }, cam).near;
    expect(hi).toBeGreaterThan(lo);
  });

  it('בהטיה - מה שיושב **נמוך במסך** קרוב יותר לצופה', () => {
    // זו ההגדרה הפיזית של מבט מוטה (כמו מפה שמוטה קדימה): תחתית המסך היא מה
    // שלרגלי הצופה, ראש המסך הוא האופק. סדר הפוך היה מצייר את הרחוק מעל הקרוב.
    const cam: Camera3D = { yaw: 0, tilt: 55, zoom: 1 };
    const far = project({ x: 0, y: -10, z: 0 }, cam);   // צפון
    const near = project({ x: 0, y: 10, z: 0 }, cam);   // דרום
    expect(far.y).toBeLessThan(near.y);                 // צפון גבוה במסך
    expect(near.near).toBeGreaterThan(far.near);        // ודרום קרוב יותר
  });

  it('בחתך אנכי (tilt=0) העומק הוא המרחק לאורך ציר המבט בלבד', () => {
    const cam: Camera3D = { yaw: 0, tilt: 0, zoom: 1 };
    expect(project({ x: 0, y: 10, z: 0 }, cam).near).toBeGreaterThan(
      project({ x: 0, y: -10, z: 0 }, cam).near);
    // בחתך, הגובה אינו משנה עומק
    expect(project({ x: 0, y: 3, z: 50 }, cam).near).toBeCloseTo(
      project({ x: 0, y: 3, z: 0 }, cam).near, 9);
  });

  it('מיון עולה לפי near = ציור מהרחוק לקרוב', () => {
    const cam: Camera3D = { yaw: 0, tilt: 45, zoom: 1 };
    const pts: Vec3[] = [{ x: 0, y: 10, z: 0 }, { x: 0, y: -10, z: 0 }, { x: 0, y: 0, z: 0 }];
    const order = pts.map((p, i) => ({ i, near: project(p, cam).near }))
      .sort((a, b) => a.near - b.near).map(o => o.i);
    expect(order).toEqual([1, 2, 0]);
  });
});

describe('קנה מידה אנכי', () => {
  it('הגובה הגבוה בסצנה נוגע בתקרה', () => {
    expect(zScaleFor(3000) * 3000).toBeCloseTo(VERT_SPAN, 9);
    expect(zScaleFor(10000) * 10000).toBeCloseTo(VERT_SPAN, 9);
  });

  it('אין גובה בסצנה - הכל שטוח ולא חלוקה באפס', () => {
    expect(zScaleFor(0)).toBe(0);
    expect(zScaleFor(-100)).toBe(0);
    expect(zScaleFor(NaN)).toBe(0);
  });

  it('scaleZ ממיר רגל ליחידות עולם ואינו נוגע במישור האופקי', () => {
    const v = scaleZ({ x: 3, y: -4, z: 3000 }, zScaleFor(3000));
    expect(v.x).toBe(3);
    expect(v.y).toBe(-4);
    expect(v.z).toBeCloseTo(VERT_SPAN, 9);
  });
});

describe('sceneBounds + viewBoxFor - המסגור לא "נושם" בסיבוב', () => {
  const PTS: Vec3[] = [
    { x: 0, y: 0, z: 0 }, { x: 30, y: 10, z: 0 }, { x: 30, y: -40, z: 20 }, { x: -12, y: 25, z: 45 },
  ];

  it('המרכז הוא הצנטרואיד והרדיוס מכסה את כל הנקודות', () => {
    const { center, radius } = sceneBounds(PTS);
    expect(center.x).toBeCloseTo(12, 9);
    for (const p of PTS) {
      expect(Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z)).toBeLessThanOrEqual(radius + 1e-9);
    }
  });

  it('רוחב ה-viewBox **אינו משתנה** עם yaw או tilt', () => {
    const { center, radius } = sceneBounds(PTS);
    const widths = new Set<string>();
    for (const yaw of [0, 15, 90, 180, 275]) {
      for (const tilt of [5, 25, 55, 90]) {
        const vb = viewBoxFor(center, radius, { yaw, tilt, zoom: 1 }, { x: 0, y: 0 }).split(' ');
        widths.add(vb[2]);
        expect(vb[2]).toBe(vb[3]); // ריבוע - כדי שההיטל לא יימתח
      }
    }
    expect(widths.size).toBe(1);
  });

  it('כל הסצנה נכנסת למסגרת בכל זווית', () => {
    const { center, radius } = sceneBounds(PTS);
    for (const yaw of [0, 33, 120, 250]) {
      for (const tilt of [5, 40, 90]) {
        const cam: Camera3D = { yaw, tilt, zoom: 1 };
        const [vx, vy, vw, vh] = viewBoxFor(center, radius, cam, { x: 0, y: 0 }).split(' ').map(Number);
        for (const p of PTS) {
          const q = project(p, cam);
          expect(q.x).toBeGreaterThanOrEqual(vx - 1e-6);
          expect(q.x).toBeLessThanOrEqual(vx + vw + 1e-6);
          expect(q.y).toBeGreaterThanOrEqual(vy - 1e-6);
          expect(q.y).toBeLessThanOrEqual(vy + vh + 1e-6);
        }
      }
    }
  });

  it('זום מכפיל מקטין את המסגרת, ופאן מזיז אותה בלי לשנות גודל', () => {
    const { center, radius } = sceneBounds(PTS);
    const one = viewBoxFor(center, radius, DEFAULT_CAMERA, { x: 0, y: 0 }).split(' ').map(Number);
    const two = viewBoxFor(center, radius, { ...DEFAULT_CAMERA, zoom: 2 }, { x: 0, y: 0 }).split(' ').map(Number);
    // המחרוזת מעוגלת ל-3 ספרות (SVG לא צריך יותר), ולכן ההשוואה באותה רזולוציה
    expect(two[2]).toBeCloseTo(one[2] / 2, 2);
    const panned = viewBoxFor(center, radius, DEFAULT_CAMERA, { x: 5, y: -3 }).split(' ').map(Number);
    expect(panned[0]).toBeCloseTo(one[0] + 5, 3);
    expect(panned[1]).toBeCloseTo(one[1] - 3, 3);
    expect(panned[2]).toBeCloseTo(one[2], 3);
  });

  it('סצנה ריקה או נקודה בודדת אינן מייצרות מסגרת באפס רוחב', () => {
    expect(Number(viewBoxFor(...([sceneBounds([]).center, sceneBounds([]).radius, DEFAULT_CAMERA, { x: 0, y: 0 }] as const))
      .split(' ')[2])).toBeGreaterThan(0);
    const one = sceneBounds([{ x: 5, y: 5, z: 5 }]);
    expect(Number(viewBoxFor(one.center, one.radius, DEFAULT_CAMERA, { x: 0, y: 0 }).split(' ')[2])).toBeGreaterThan(0);
  });
});

describe('patternPath3D - פרופיל הגבהים של ההקפה', () => {
  it('שבע צומתים: שש הנקודות של ההקפה + נקודת תחילת ההנמכה מול הסף', () => {
    expect(patternPath3D(G, 1, PROF)).toHaveLength(7);
  });

  it('מתחיל ומסתיים על הקרקע, ושיא הגובה הוא גובה עם-הרוח', () => {
    const path = patternPath3D(G, 1, PROF);
    expect(path[0].z).toBe(0);
    expect(path[path.length - 1].z).toBe(0);
    expect(Math.max(...path.map(p => p.z))).toBe(PROF.downwindAlt);
  });

  it('המישור האופקי זהה ל-patternPoints, במרחב iso', () => {
    const aspect = 1.6;
    const path = patternPath3D(G, aspect, PROF);
    const iso = ISO(aspect);
    // 6 נקודות ההקפה, לפי סדר הטיסה, כשהשביעית (מול הסף) יושבת בתוך העם-הרוח
    for (const [pathIdx, isoIdx] of [[0, 0], [1, 1], [2, 2], [4, 3], [5, 4], [6, 5]]) {
      expect(path[pathIdx].x).toBeCloseTo(iso[isoIdx].x, 9);
      expect(path[pathIdx].y).toBeCloseTo(iso[isoIdx].y, 9);
    }
  });

  it('נקודת ההנמכה יושבת **מול הסף** על העם-הרוח, ועדיין בגובה עם-הרוח', () => {
    const path = patternPath3D(G, 1, PROF);
    const abeam = path[3];
    expect(abeam.z).toBe(PROF.downwindAlt);
    // מול הסף = אותו "לאורך" של העוגן. בכיוון 0 ההקפה מקבילה לציר y, ולכן
    // אותו y של הסף (62), בהיסט לרוחב.
    expect(abeam.y).toBeCloseTo(G.anchor.y, 9);
    expect(abeam.x).toBeCloseTo(G.anchor.x - G.width, 9);
  });

  it('צלע הבסיס **מפולסת** בגובה הבסיס', () => {
    const path = patternPath3D(G, 1, PROF);
    expect(path[4].z).toBe(PROF.baseAlt); // סוף עם-הרוח = תחילת בסיס
    expect(path[5].z).toBe(PROF.baseAlt); // סוף בסיס = תחילת פיינל
  });

  it('הטיפוס אחרי ההמראה הוא חצי מגובה עם-הרוח', () => {
    expect(patternPath3D(G, 1, PROF)[1].z).toBe(PROF.downwindAlt / 2);
  });
});

describe('altProfileOf - ברירת מחדל גלויה, וערך שהוגדר גובר', () => {
  it('אין פרמטרים - 3000/1500 רגל', () => {
    expect(DEFAULT_ALT_PROFILE).toEqual({ downwindAlt: 3000, baseAlt: 1500 });
    expect(altProfileOf(null)).toEqual(DEFAULT_ALT_PROFILE);
    expect(altProfileOf({})).toEqual(DEFAULT_ALT_PROFILE);
    expect(altProfileOf({ downwind_alt_ft: null, base_alt_ft: null })).toEqual(DEFAULT_ALT_PROFILE);
  });

  it('ערך שהוגדר גובר, גם כשהגיע כמחרוזת מה-DB', () => {
    expect(altProfileOf({ downwind_alt_ft: 2500, base_alt_ft: 1200 })).toEqual({ downwindAlt: 2500, baseAlt: 1200 });
    expect(altProfileOf({ downwind_alt_ft: '2500', base_alt_ft: '1200' })).toEqual({ downwindAlt: 2500, baseAlt: 1200 });
  });

  it('כל שדה עומד בפני עצמו', () => {
    expect(altProfileOf({ downwind_alt_ft: 2000 })).toEqual({ downwindAlt: 2000, baseAlt: 1500 });
    expect(altProfileOf({ base_alt_ft: 900 })).toEqual({ downwindAlt: 3000, baseAlt: 900 });
  });

  it('ערך לא חוקי אינו "מפלס" את ההקפה בשקט', () => {
    for (const bad of [0, -500, NaN, 'abc', {}]) {
      expect(altProfileOf({ downwind_alt_ft: bad as never })).toEqual(DEFAULT_ALT_PROFILE);
    }
  });
});

describe('altOnLeg - המטוס יושב **על** הקו ולא מרחף מעליו', () => {
  /** הגובה על הפוליליין עצמו, לפי מרחק - מקור האמת הגאומטרי. */
  const NODES: Record<LegKey, number[]> = {
    upwind: [0, 1], crosswind: [1, 2], downwind: [2, 3, 4], base: [4, 5], final: [5, 6],
  };
  const altFromPath = (aspect: number, leg: LegKey, frac: number): number => {
    const path = patternPath3D(G, aspect, PROF);
    const nodes = NODES[leg].map(i => path[i]);
    const seg = nodes.slice(1).map((n, i) => Math.hypot(n.x - nodes[i].x, n.y - nodes[i].y));
    const total = seg.reduce((s, d) => s + d, 0);
    let want = frac * total;
    for (let i = 0; i < seg.length; i++) {
      if (want <= seg[i] || i === seg.length - 1) {
        const t = seg[i] ? Math.min(1, want / seg[i]) : 0;
        return nodes[i].z + (nodes[i + 1].z - nodes[i].z) * t;
      }
      want -= seg[i];
    }
    return nodes[nodes.length - 1].z;
  };

  it('עקבי עם הקו שמצויר, בכל צלע ובכל שבר', () => {
    for (const aspect of [1, 1.6]) {
      for (const leg of LEG_KEYS) {
        for (const f of [0, 0.1, 0.25, 0.5, 0.62, 0.75, 0.9, 1]) {
          expect(altOnLeg(G, PROF, leg, f)).toBeCloseTo(altFromPath(aspect, leg, f), 6);
        }
      }
    }
  });

  it('הבסיס מפולס - אותו גובה בכל שבר', () => {
    for (const f of [0, 0.3, 1]) expect(altOnLeg(G, PROF, 'base', f)).toBe(PROF.baseAlt);
  });

  it('עם-הרוח שומר גובה עד מול הסף, ורק אז מנמיך', () => {
    const abeam = (G.rwyLen + G.upwind) / (G.rwyLen + G.upwind + G.baseExt);
    expect(altOnLeg(G, PROF, 'downwind', abeam / 2)).toBe(PROF.downwindAlt);
    expect(altOnLeg(G, PROF, 'downwind', abeam)).toBe(PROF.downwindAlt);
    expect(altOnLeg(G, PROF, 'downwind', 1)).toBe(PROF.baseAlt);
    expect(altOnLeg(G, PROF, 'downwind', (abeam + 1) / 2)).toBeLessThan(PROF.downwindAlt);
  });

  it('הפיינל יורד עד הקרקע, וההמראה מתחילה ממנה', () => {
    expect(altOnLeg(G, PROF, 'final', 1)).toBe(0);
    expect(altOnLeg(G, PROF, 'upwind', 0)).toBe(0);
  });

  it('שבר חסר או חורג אינו מוציא מטוס מחוץ להקפה', () => {
    expect(altOnLeg(G, PROF, 'final', null)).toBe(altOnLeg(G, PROF, 'final', 0.5));
    expect(altOnLeg(G, PROF, 'final', 5)).toBe(altOnLeg(G, PROF, 'final', 1));
    expect(altOnLeg(G, PROF, 'final', -2)).toBe(altOnLeg(G, PROF, 'final', 0));
  });
});

describe('aglOf - גובה מוחלט מול גובה מעל השדה', () => {
  it('בלי גובה שדה - הגובה המוחלט הוא גם ה-AGL', () => {
    expect(aglOf(4000, null)).toBe(4000);
    expect(aglOf(4000, undefined)).toBe(4000);
  });

  it('עם גובה שדה - מחסירים אותו', () => {
    expect(aglOf(4000, 900)).toBe(3100);
    expect(aglOf(4000, '900' as never)).toBe(3100);
  });

  it('בלוק מתחת לפני השדה מוחזר כשלילי ולא נבלע בשקט', () => {
    expect(aglOf(500, 900)).toBe(-400);
  });
});

describe('פקדי המצלמה', () => {
  it('ההטיה נעצרת בגבולות ולא מתהפכת', () => {
    expect(clampTilt(TILT_MAX + 20)).toBe(TILT_MAX);
    expect(clampTilt(TILT_MIN - 20)).toBe(TILT_MIN);
    expect(clampTilt(55)).toBe(55);
  });

  it('הזום נעצר בגבולות', () => {
    expect(clampZoom(99)).toBeLessThanOrEqual(4);
    expect(clampZoom(0.01)).toBeGreaterThanOrEqual(0.4);
  });

  it('הכיוון תמיד 0..359', () => {
    expect(normYaw(-15)).toBe(345);
    expect(normYaw(375)).toBe(15);
    expect(normYaw(360)).toBe(0);
  });

  it('חץ הצפון מסתובב עם yaw ומתקצר עם ההטיה - זה הרמז לכמה שטוח המבט', () => {
    const up = northArrow({ yaw: 0, tilt: 90, zoom: 1 });
    expect(up.x).toBeCloseTo(0, 9);
    expect(up.y).toBeCloseTo(-1, 9);      // צפון למעלה במבט-על
    const flat = northArrow({ yaw: 0, tilt: 20, zoom: 1 });
    expect(Math.hypot(flat.x, flat.y)).toBeLessThan(1);
    const turned = northArrow({ yaw: 90, tilt: 90, zoom: 1 });
    expect(turned.x).toBeCloseTo(1, 9);
    expect(turned.y).toBeCloseTo(0, 9);
  });

  it('מצלמת ברירת המחדל בתוך הגבולות', () => {
    expect(DEFAULT_CAMERA.tilt).toBeGreaterThanOrEqual(TILT_MIN);
    expect(DEFAULT_CAMERA.tilt).toBeLessThanOrEqual(TILT_MAX);
    expect(clampZoom(DEFAULT_CAMERA.zoom)).toBe(DEFAULT_CAMERA.zoom);
  });
});

// ── התלת מימד נפתח תמיד כשהמתג דלוק ─────────────────────────────────────────
// דווח מהשטח: הכפתור נדלק בתורכיז ולא קורה כלום. הסיבה הייתה תנאי רינדור נוסף
// (`imgBounds`) שנכשל בעמדה בלי מפת רקע, ואז לא עלו לא הסצנה ולא סרגל הבקרה.
describe('shouldRenderPattern3D - כפתור שנדלק חייב להראות משהו', () => {
  it('דלוק → מרנדר, כבוי → לא', () => {
    expect(shouldRenderPattern3D(true)).toBe(true);
    expect(shouldRenderPattern3D(false)).toBe(false);
  });

  it('שדה בלי מפת רקע: היחס נופל ל-1 ולכן אין סיבה לחסום את הרינדור', () => {
    expect(boundsAspect(null)).toBe(1);
    expect(boundsAspect(undefined)).toBe(1);
    expect(boundsAspect({ width: 0, height: 0 })).toBe(1);
    expect(shouldRenderPattern3D(true)).toBe(true);
  });
});
