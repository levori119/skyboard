import React from 'react';
import { tr } from '../../i18n/tr';
import { bidiAuto } from '../../utils/bidi';
import useMapLabelScale from '../../hooks/useMapLabelScale';
import { getFormationDisplayName } from '../../utils/strips';
import {
  LEG_KEYS, LEG_LABEL_KEYS, normalizeGeometry, patternLegs,
  type LegKey, type PatternGeometry, type Pt,
} from '../../utils/trafficPattern';
import { derivedRunwayWidth, runwayAxis, runwayQuad, type RunwayGeo } from '../../utils/runwayShape';
import {
  altToDisplay, buildBlocks, conflictBlocks, formationsInBlocks,
  type JoiningAircraftRow, type JoiningPointStripRow,
} from '../../utils/joiningPoints';
import { FONT, legPoint, placePatternAircraft, type PatternAircraftRow } from './PatternAircraftLayer';
import type { JoiningPointView } from './JoiningPointPanel';
import type { PatternRow } from '../map/TrafficPatternLayer';
import {
  aglOf, altOnLeg, altProfileOf, clampTilt, clampZoom, normYaw, northArrow,
  patternPath3D, project, sceneBounds, viewBoxFor, zScaleFor,
  type Camera3D, type PatternAltProfile, type Projected, type Vec3,
} from '../../utils/pattern3d';

// ─── הקפה תלת מימדית - הסצנה ──────────────────────────────────────────────────
//
// **תצוגה נוספת, לא מחליפה.** המבט מלמעלה נשאר מקור האמת למיקום האופקי; כאן
// נוסף הגובה. מחקר הנדסת אנוש של ATC מזהיר שהיטל תלת מימדי הוא דו-משמעי - אדם
// אינו אומד גובה ומרחק מהיטל בלי רמזי עומק - ולכן ארבעת אלה אינם קישוט:
//
//   צל ההקפה על הקרקע   - המיקום האופקי האמיתי, בלי הטיית הגובה
//   קווי הורדה אנכיים    - הופכים "איפה זה באוויר" לשתי נקודות ידועות
//   רשת קרקע            - סרגל מרחקים; בלעדיה הטיה נראית כמו הזזה
//   ציר גבהים עם תוויות - הגובה **נקרא** כמספר, לא נאמד בעין
//
// וכל מספר שקריטי לפעולה (גובה, או"ק) מופיע כטקסט - לעולם לא רק כמיקום במרחב.
//
// ── למה SVG ולא three.js ─────────────────────────────────────────────────────
// הסצנה היא עשרות פוליגונים. סדר ה-DOM **הוא** אלגוריתם הצייר (ציור מהרחוק
// לקרוב), הטקסט הוא <text> מקורי - חד, מתורגם ומותאם תמה - ואין תלות חדשה
// לשרשרת האספקה. הפרספקטיבה הוחלפה בהיטל אורתוגרפי בכוונה (ראה utils/pattern3d).
//
// ── DRY ──────────────────────────────────────────────────────────────────────
// המיקום של מטוס על צלע מגיע מ-`placePatternAircraft`/`legPoint` (אותה פונקציה
// של השכבה השטוחה) והבלוקים מ-`buildBlocks`/`formationsInBlocks`/`conflictBlocks`
// (אותן פונקציות של הטבלה). שכפול הלוגיקה כאן היה מייצר תצוגה שמראה מטוס בצלע
// אחת ובטבלה בשנייה - וזה הרסני יותר מאשר לא להציג אותו כלל.

export type ThemeMode = 'light' | 'dark' | 'ocean';

interface Props {
  /** ההקפות לציור. אותן שורות של TrafficPatternLayer, עם גבהי ההקפה. */
  patterns: PatternRow[];
  /** מטוסים על ההקפה - **אותן שורות** שמזינות את PatternAircraftLayer. */
  aircraft: PatternAircraftRow[];
  joiningPoints: JoiningPointView[];
  /** הפ"ממים בנקודות, עם `joining_point_id` - לפריסה לבלוקים. */
  joiningStrips: (JoiningPointStripRow & Record<string, any>)[];
  /** מצב המטוסים הבודדים - גובה חריג (פיצול מבנה) וההקפה שנבחרה. */
  joiningAircraft: JoiningAircraftRow[];
  runways: RunwayGeo[];
  /** יחס תמונת המפה (רוחב/גובה) - בלעדיו ההקפה יוצאת מעוותת. */
  aspect: number;
  /** גובה פני השדה ברגל. בלעדיו בלוקי הגבהים (מוחלטים) יעופו לגובה הלא נכון. */
  elevFt?: number | null;
  camera: Camera3D;
  pan: Pt;
  onCameraChange: (c: Camera3D) => void;
  onPanChange: (p: Pt) => void;
  themeMode?: ThemeMode;
}

/** חצי צלע של לוח בלוק, ביחידות iso (אחוז מגובה התמונה). */
const PLATE_HALF = 4.6;
/**
 * הזחת תווית הצלע מהקו, ביחידות `k` (כלומר יחסית לגודל הטקסט ולא לעולם).
 * חייבת לעלות על חצי רוחב תיבת המטוס (עד `8k`) ועוד חצי רוחב התווית עצמה,
 * אחרת "בסיס 33" ו-"ברק 02" נערמים זה על זה בתחתית ההקפה.
 */
const LABEL_CLEAR = 10;
/** רגישות הסיבוב: גרירה לרוחב המסגרת = חצי סיבוב. */
const YAW_PER_WIDTH = 180;
/** רגישות ההטיה: גרירה לגובה המסגרת = כל טווח ההטיה. */
const TILT_PER_HEIGHT = 90;

/** ocean היא תמה **כהה** - הצבעים שלה בהירים כמו dark, לא כמו light. */
const colors = (theme: ThemeMode) =>
  theme === 'light'
    ? { skyTop: '#eff6ff', skyBottom: '#dbeafe', ground: '#e2e8f0', groundEdge: '#94a3b8', grid: '#94a3b8', rwy: '#cbd5e1', rwyEdge: '#64748b', text: '#0f172a', dim: '#475569', axis: '#334155', shadow: '#64748b', drop: '#94a3b8', halo: '#ffffff' }
    : theme === 'ocean'
      ? { skyTop: '#012a35', skyBottom: '#05404e', ground: '#04333f', groundEdge: '#0e7490', grid: '#0e7490', rwy: '#083d4d', rwyEdge: '#22d3ee', text: '#cffafe', dim: '#7dd3fc', axis: '#67e8f9', shadow: '#0e7490', drop: '#0e7490', halo: '#012a35' }
      : { skyTop: '#020617', skyBottom: '#0f172a', ground: '#111d33', groundEdge: '#334155', grid: '#1e3a5f', rwy: '#1e293b', rwyEdge: '#64748b', text: '#e2e8f0', dim: '#94a3b8', axis: '#94a3b8', shadow: '#475569', drop: '#475569', halo: '#000000' };

/** קונפליקט אדום - **צבע סטטוס**, קבוע בשלוש התמות, ולעולם לא הערוץ היחיד (⚠). */
const CONFLICT = '#dc2626';

const f = (n: number) => Math.round(n * 1000) / 1000;
const scr = (p: Projected) => `${f(p.x)},${f(p.y)}`;

/** צעד הרשת - מתכווץ עם הסצנה כדי שתמיד יהיו כמה קווים לאמוד לפיהם. */
const gridStepFor = (radius: number): number => (radius > 25 ? 10 : radius > 12 ? 5 : 2);

/** צעד תוויות ציר הגבהים ברגל - מספר עגול שאפשר לקרוא בהצצה. */
const altStepFor = (maxFt: number): number =>
  maxFt > 8000 ? 2000 : maxFt > 3500 ? 1000 : maxFt > 1200 ? 500 : 200;

export default function Pattern3DScene({
  patterns, aircraft, joiningPoints, joiningStrips, joiningAircraft, runways,
  aspect, elevFt, camera, pan, onCameraChange, onPanChange, themeMode = 'dark',
}: Props) {
  const C = colors(themeMode);
  const labelScale = useMapLabelScale();
  const dragRef = React.useRef<
    { x: number; y: number; cam: Camera3D; pan: Pt; mode: 'rotate' | 'pan'; w: number; h: number } | null>(null);

  // ── בניית הסצנה ────────────────────────────────────────────────────────────

  const pats = React.useMemo(() => patterns.map(p => {
    const g: PatternGeometry = normalizeGeometry(p.geometry);
    const prof: PatternAltProfile = altProfileOf(p);
    return { row: p, g, prof, path: patternPath3D(g, aspect, prof), legs: patternLegs(g, aspect), color: p.color || '#38bdf8' };
  }), [patterns, aspect]);

  const jps = React.useMemo(() => joiningPoints
    .filter(jp => jp.x_pct != null && jp.y_pct != null)
    .map(jp => {
      const blocks = buildBlocks(jp);
      const mine = joiningStrips.filter(r => Number(r.joining_point_id) === Number(jp.id));
      const byBlock = formationsInBlocks(blocks, mine, joiningAircraft);
      // איפה יושב כל מטוס בודד - כדי לצייר את קו החיבור שלו אל ההקפה
      const blockOfAircraft = new Map<string, number>();
      for (const [ft, entries] of byBlock) {
        for (const e of entries) {
          const sid = String(e.strip.strip_id);
          if (e.indices.length) for (const i of e.indices) blockOfAircraft.set(`${sid}|${i}`, ft);
          else blockOfAircraft.set(`${sid}|*`, ft);
        }
      }
      return {
        jp, blocks, byBlock, blockOfAircraft,
        conflicts: conflictBlocks(byBlock),
        anchor: { x: Number(jp.x_pct) * aspect, y: Number(jp.y_pct) },
        color: jp.color || '#38bdf8',
      };
    }), [joiningPoints, joiningStrips, joiningAircraft, aspect]);

  // קנה המידה האנכי נגזר מהגובה הגבוה **בסצנה כולה** - ההקפות ובלוקי הגבהים
  // יחד - אחרת שתי מערכות הגבהים לא יושבות על אותו סרגל וההשוואה ביניהן שקרית.
  const maxAltFt = Math.max(
    1,
    ...pats.map(p => p.prof.downwindAlt),
    ...jps.flatMap(j => j.blocks.map(b => aglOf(b, elevFt))),
  );
  const zScale = zScaleFor(maxAltFt);
  const W = React.useCallback(
    (x: number, y: number, altFt: number): Vec3 => ({ x, y, z: altFt * zScale }), [zScale]);

  const runwayQuads = React.useMemo(() => runways.map(rw => {
    const ax = runwayAxis(rw, aspect);
    const quad = ax ? runwayQuad(rw, aspect, derivedRunwayWidth(ax.length)) : null;
    return quad ? quad.map(p => ({ x: p.x * aspect, y: p.y })) : null;
  }).filter(Boolean) as Pt[][], [runways, aspect]);

  // מטוסים על הצלעות - **אותה פונקציה** של השכבה השטוחה, ולכן אותה צלע ואותו שבר
  const acOnLegs = React.useMemo(() => placePatternAircraft(aircraft).map(({ ac, frac, leg }) => {
    const p = pats.find(x => Number(x.row.id) === Number(ac.pattern_id));
    if (!p) return null;
    const pt = legPoint(p.row, aspect, leg, frac);
    if (!pt) return null;
    const altFt = altOnLeg(p.g, p.prof, leg, frac);
    return { ac, altFt, color: p.color, pos: W(pt.x * aspect, pt.y, altFt) };
  }).filter(Boolean) as { ac: PatternAircraftRow; altFt: number; color: string; pos: Vec3 }[],
  [aircraft, pats, aspect, W]);

  // הכדור החוסם מחושב **פעם אחת** מכל מה שבסצנה. מסגור שמחושב מחדש בכל סיבוב
  // גורם לסצנה "לנשום" בכל תזוזה של היד, וזה בלתי נסבל למעקב.
  const all: Vec3[] = [];
  for (const p of pats) {
    for (const n of p.path) { all.push(W(n.x, n.y, n.z)); all.push(W(n.x, n.y, 0)); }
  }
  for (const q of runwayQuads) for (const c of q) all.push(W(c.x, c.y, 0));
  for (const j of jps) {
    all.push(W(j.anchor.x, j.anchor.y, 0));
    for (const b of j.blocks) {
      const agl = aglOf(b, elevFt);
      all.push(W(j.anchor.x - PLATE_HALF, j.anchor.y - PLATE_HALF, agl));
      all.push(W(j.anchor.x + PLATE_HALF, j.anchor.y + PLATE_HALF, agl));
    }
  }
  for (const a of acOnLegs) all.push(a.pos);

  const { center, radius } = sceneBounds(all);
  const viewBox = viewBoxFor(center, radius, camera, pan);
  const [vbX, vbY, size] = viewBox.split(' ').map(Number);
  /** יחידות סצנה ל"אחוז מגובה תצוגה" - כדי שהטקסט יישאר בגודל של המפה השטוחה. */
  const k = size / 100;
  const P = React.useCallback((v: Vec3) => project(v, camera), [camera]);

  // ── גרירה: Pointer Events בלבד ─────────────────────────────────────────────
  // `touchAction:'none'` + `setPointerCapture` - בלעדיהם אין `pointermove` באצבע
  // כלל, והגרירה נקטעת כשהמצביע עובר מעל iframe (CLAUDE.md §גרירה).
  //
  // ⚠ אין כאן חלוקה ב---s **בכוונה**: המלכודת של `--s` היא ערבוב `clientX`
  // (פיקסלים ויזואליים) עם `left/top` (יחידות שלפני ה-zoom). כאן שני האגפים
  // מגיעים מאותו מרחב - `clientX` ו-`getBoundingClientRect` - ולכן היחס ביניהם
  // נכון בכל גודל מסך.
  const startDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button > 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    dragRef.current = {
      x: e.clientX, y: e.clientY, cam: camera, pan,
      mode: e.shiftKey ? 'pan' : 'rotate', w: r.width, h: r.height,
    };
  };

  const moveDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (d.mode === 'pan') {
      // המסגרת ריבועית ומשובצת ב-meet, ולכן יחידת סצנה = size / הצלע הקטנה
      const u = size / Math.min(d.w, d.h);
      onPanChange({ x: d.pan.x - dx * u, y: d.pan.y - dy * u });
      return;
    }
    onCameraChange({
      ...d.cam,
      yaw: normYaw(d.cam.yaw - (dx / d.w) * YAW_PER_WIDTH),
      tilt: clampTilt(d.cam.tilt + (dy / d.h) * TILT_PER_HEIGHT),
    });
  };

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  // ── שכבות ──────────────────────────────────────────────────────────────────

  const groundQuad = [
    W(0, 0, 0), W(100 * aspect, 0, 0), W(100 * aspect, 100, 0), W(0, 100, 0),
  ].map(v => scr(P(v))).join(' ');

  const step = gridStepFor(radius);
  const gridLines: { a: Vec3; b: Vec3 }[] = [];
  for (let y = 0; y <= 100 + 1e-6; y += step) gridLines.push({ a: W(0, y, 0), b: W(100 * aspect, y, 0) });
  for (let x = 0; x <= 100 * aspect + 1e-6; x += step) gridLines.push({ a: W(x, 0, 0), b: W(x, 100, 0) });

  // ── פריטים שמעורבבים בעומק: נקודות הצטרפות, קווי חיבור ומטוסים ────────────
  // כולם ממוינים **יחד** לפי near עולה, כי הם חולקים את אותו מרחב. מיון בנפרד
  // היה מצייר מטוס מאחורי לוח שנמצא לפניו.
  const depth: { near: number; el: React.ReactNode }[] = [];

  for (const j of jps) {
    const topFt = j.blocks.length ? Math.max(...j.blocks.map(b => aglOf(b, elevFt))) : 0;
    const mastTop = P(W(j.anchor.x, j.anchor.y, topFt));
    const mastBase = P(W(j.anchor.x, j.anchor.y, 0));
    depth.push({
      near: P(W(j.anchor.x, j.anchor.y, topFt / 2)).near,
      el: (
        <g key={`jp-mast-${j.jp.id}`} data-testid="p3d-joining-point" data-point-id={j.jp.id}>
          <line x1={mastBase.x} y1={mastBase.y} x2={mastTop.x} y2={mastTop.y}
            stroke={j.color} strokeWidth={0.35 * k} strokeDasharray={`${1.2 * k},${0.9 * k}`} opacity={0.75} />
          <ellipse cx={mastBase.x} cy={mastBase.y} rx={1.5 * k} ry={1.5 * k * Math.sin(camera.tilt * Math.PI / 180)}
            fill="none" stroke={j.color} strokeWidth={0.35 * k} opacity={0.9} />
          <text x={mastTop.x} y={mastTop.y - 1.8 * k} textAnchor="middle" fill={j.color}
            fontSize={1.7 * k * labelScale} fontWeight="bold"
            style={{ userSelect: 'none', paintOrder: 'stroke' }} stroke={C.halo} strokeWidth={0.5 * k} strokeLinejoin="round">
            {bidiAuto(j.jp.name || '')}
          </text>
        </g>
      ),
    });

    for (const ft of j.blocks) {
      const agl = aglOf(ft, elevFt);
      const entries = j.byBlock.get(ft) || [];
      const occupied = entries.length > 0;
      const isConflict = j.conflicts.has(ft);
      const c = { x: j.anchor.x, y: j.anchor.y };
      const corners = [
        W(c.x - PLATE_HALF, c.y - PLATE_HALF, agl), W(c.x + PLATE_HALF, c.y - PLATE_HALF, agl),
        W(c.x + PLATE_HALF, c.y + PLATE_HALF, agl), W(c.x - PLATE_HALF, c.y + PLATE_HALF, agl),
      ].map(v => P(v));
      const mid = P(W(c.x, c.y, agl));
      const stroke = isConflict ? CONFLICT : j.color;
      // מאויש מול פנוי אינו נבדל **בצבע בלבד** (FAA HF-STD-001): פנוי = מתאר
      // מקווקו ושקוף, מאויש = מילוי מלא + מסגרת + תווית.
      // או"ק, ואם המבנה מפוצל בין בלוקים - גם מספרי המטוסים שיושבים דווקא כאן.
      // הטייסת נוספת כשהיא ידועה, בדיוק כמו בשורת הטבלה.
      const label = entries.map(e => {
        const row = e.strip as Record<string, any>;
        const base = e.partial
          ? `${getFormationDisplayName(row)}/${e.indices.join('+')}`
          : getFormationDisplayName(row);
        return row.squadron ? `${base} / ${row.squadron}` : base;
      }).join(' · ');
      depth.push({
        near: mid.near,
        el: (
          <g key={`jp-${j.jp.id}-b-${ft}`} data-testid="p3d-block" data-point-id={j.jp.id} data-block-ft={ft}
            data-occupied={occupied ? '1' : '0'} data-conflict={isConflict ? '1' : '0'}>
            <polygon points={corners.map(scr).join(' ')}
              fill={occupied ? (isConflict ? `${CONFLICT}66` : `${j.color}55`) : 'none'}
              stroke={stroke} strokeWidth={(occupied ? 0.4 : 0.25) * k}
              strokeDasharray={occupied ? undefined : `${1.1 * k},${0.9 * k}`}
              opacity={occupied ? 1 : 0.5}>
              <title>{occupied ? tr('pattern3d.occupied') : tr('pattern3d.vacant')}</title>
            </polygon>
            <text x={corners[0].x} y={corners[0].y - 0.5 * k} textAnchor="start"
              fill={isConflict ? CONFLICT : C.dim} fontSize={1.4 * k * labelScale} fontFamily="monospace"
              style={{ userSelect: 'none', paintOrder: 'stroke' }} stroke={C.halo} strokeWidth={0.45 * k} strokeLinejoin="round">
              {isConflict ? '⚠ ' : ''}{altToDisplay(ft)}
            </text>
            {occupied && (
              <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central"
                fill={isConflict ? '#ffffff' : C.text} fontSize={1.5 * k * labelScale} fontWeight="bold"
                style={{ userSelect: 'none', paintOrder: 'stroke' }} stroke={C.halo} strokeWidth={0.5 * k} strokeLinejoin="round">
                {bidiAuto(label)}
              </text>
            )}
          </g>
        ),
      });
    }
  }

  // קו החיבור: ממטוס שיושב בבלוק אל **מרכז ה"עם הרוח"** של ההקפה שנבחרה לו.
  // מקווקו - זה "לאן הוא הולך", לא "איפה הוא נמצא". בלי pattern_id אין קו:
  // ניחוש הקפה הוא בדיוק סוג המידע השגוי שאסור להציג לפקח.
  for (const a of joiningAircraft) {
    if (a.pattern_id == null) continue;
    const p = pats.find(x => Number(x.row.id) === Number(a.pattern_id));
    if (!p) continue;
    const sid = String(a.strip_id ?? '');
    const idx = Number(a.aircraft_idx);
    const host = jps.find(j => j.blockOfAircraft.has(`${sid}|${idx}`) || j.blockOfAircraft.has(`${sid}|*`));
    if (!host) continue;
    const ft = host.blockOfAircraft.get(`${sid}|${idx}`) ?? host.blockOfAircraft.get(`${sid}|*`)!;
    const dw = legPoint(p.row, aspect, 'downwind', 0.5);
    if (!dw) continue;
    const from = P(W(host.anchor.x, host.anchor.y, aglOf(ft, elevFt)));
    const to = P(W(dw.x * aspect, dw.y, altOnLeg(p.g, p.prof, 'downwind', 0.5)));
    depth.push({
      near: Math.min(from.near, to.near),
      el: (
        <line key={`link-${sid}-${idx}`} data-testid="p3d-link" data-strip-id={sid} data-aircraft-idx={idx}
          x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke={p.color} strokeWidth={0.28 * k} strokeDasharray={`${1.4 * k},${1.1 * k}`} opacity={0.75} />
      ),
    });
  }

  for (const a of acOnLegs) {
    const q = P(a.pos);
    const ground = P(W(a.pos.x, a.pos.y, 0));
    const label = a.ac.label || String(a.ac.aircraft_idx);
    const fs = FONT * k;
    const w = Math.max(4.7, label.length * 0.77 + 1.6) * k;
    const h = 2.3 * k;
    depth.push({
      near: q.near,
      el: (
        <g key={`ac-${a.ac.strip_id}-${a.ac.aircraft_idx}`} data-testid="p3d-aircraft"
          data-strip-id={String(a.ac.strip_id)} data-aircraft-idx={a.ac.aircraft_idx}
          data-in-pattern={a.ac.in_pattern ? '1' : '0'}>
          {/* קו ההורדה - הופך "איפה הוא באוויר" לשתי נקודות ידועות */}
          <line x1={q.x} y1={q.y} x2={ground.x} y2={ground.y}
            stroke={a.color} strokeWidth={0.22 * k} strokeDasharray={`${0.7 * k},${0.7 * k}`} opacity={0.6} />
          <ellipse cx={ground.x} cy={ground.y} rx={0.7 * k} ry={0.7 * k * Math.sin(camera.tilt * Math.PI / 180)}
            fill={a.color} opacity={0.4} />
          <rect x={q.x - w / 2} y={q.y - h / 2} width={w} height={h} rx={0.6 * k}
            fill="#000000cc" stroke={a.color} strokeWidth={0.4 * k}
            strokeDasharray={a.ac.in_pattern ? undefined : `${1.1 * k},${0.8 * k}`} />
          <text x={q.x} y={q.y} textAnchor="middle" dominantBaseline="central"
            fill={a.color} fontSize={fs} fontWeight="bold" style={{ userSelect: 'none' }}>
            {bidiAuto(label)}
          </text>
          {/* הגובה כ**מספר** ולא רק כמיקום במרחב - כלל העל של התצוגה */}
          <text x={q.x} y={q.y + h * 0.95} textAnchor="middle" dominantBaseline="hanging"
            fill={C.dim} fontSize={1.15 * k * labelScale} fontFamily="monospace"
            style={{ userSelect: 'none', paintOrder: 'stroke' }} stroke={C.halo} strokeWidth={0.4 * k} strokeLinejoin="round">
            {altToDisplay(a.altFt + Number(elevFt ?? 0))}
          </text>
        </g>
      ),
    });
  }

  depth.sort((a, b) => a.near - b.near);

  // ── ציר הגבהים ────────────────────────────────────────────────────────────
  // וקטור אנכי בעולם מוטל תמיד לוקטור **אנכי במסך** (הפרש ההיטל הוא (0,-z·cos)),
  // ולכן הסרגל מצויר ישירות בקואורדינטות המסגרת ואינו זז עם הסיבוב. בהטיה גבוהה
  // (מבט-על) הוא מתכווץ לאפס - וזו האמת: במבט מלמעלה אי אפשר לקרוא גובה.
  const ct = Math.cos(camera.tilt * Math.PI / 180);
  const axisSpan = maxAltFt * zScale * ct;
  const showAxis = axisSpan > size * 0.08;
  const axisX = vbX + size * 0.07;
  const axisBaseY = vbY + size * 0.9;
  const altStep = altStepFor(maxAltFt);
  const ticks: number[] = [];
  for (let a = 0; a <= maxAltFt + 1e-6; a += altStep) ticks.push(a);

  // ── חץ הצפון ──────────────────────────────────────────────────────────────
  // מצויר מהיטל הווקטור (0,-1,0): מסתובב עם ה-yaw **וגם** מתקצר עם ההטיה, ולכן
  // הוא אומר בו-זמנית "לאן צפון" ו"כמה שטוח אני מסתכל". קו + נקודה לא נקראו
  // כחץ - צריך ראש חץ ואות בקצה. במבט-על עם yaw=0 ההיטל מתנוון לאורך אפס,
  // ואז אין כיוון לצייר ומוצגת האות בלבד.
  const north = northArrow(camera);
  const northX = vbX + size * 0.9;
  const northY = vbY + size * 0.88;
  const northReach = size * 0.09;
  const northMag = Math.hypot(north.x, north.y);
  const nd = northMag > 1e-3 ? { x: north.x / northMag, y: north.y / northMag } : null;
  const northTip = { x: northX + north.x * northReach, y: northY + north.y * northReach };
  const headLen = size * 0.028, headHalf = size * 0.016;
  const northHead = nd
    ? [
      `${f(northTip.x)},${f(northTip.y)}`,
      `${f(northTip.x - nd.x * headLen - nd.y * headHalf)},${f(northTip.y - nd.y * headLen + nd.x * headHalf)}`,
      `${f(northTip.x - nd.x * headLen + nd.y * headHalf)},${f(northTip.y - nd.y * headLen - nd.x * headHalf)}`,
    ].join(' ')
    : null;
  const northLabel = nd
    ? { x: northTip.x + nd.x * size * 0.045, y: northTip.y + nd.y * size * 0.045 }
    : { x: northX, y: northY - size * 0.045 };

  return (
    <div
      data-testid="pattern-3d-scene"
      data-nopan
      style={{
        position: 'absolute', inset: 0, zIndex: 20,
        background: `linear-gradient(to bottom, ${C.skyTop} 0%, ${C.skyBottom} 100%)`,
        touchAction: 'none', userSelect: 'none', overflow: 'hidden',
      }}
      onWheel={e => {
        // עוצר את זום המפה שמתחת - אחרת גלגלת אחת מזיזה שתי תצוגות
        e.stopPropagation();
        onCameraChange({ ...camera, zoom: clampZoom(camera.zoom * (e.deltaY < 0 ? 1.25 : 1 / 1.25)) });
      }}
    >
      <svg
        viewBox={viewBox}
        width="100%" height="100%"
        style={{ display: 'block', touchAction: 'none', cursor: 'grab' }}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* 1-2: הקרקע והרשת - סרגל המרחקים. בלעדיו הטיה נראית כמו הזזה. */}
        <polygon points={groundQuad} fill={C.ground} stroke={C.groundEdge} strokeWidth={0.3 * k} />
        <g opacity={0.5}>
          {gridLines.map((l, i) => {
            const a = P(l.a), b = P(l.b);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={C.grid} strokeWidth={0.14 * k} />;
          })}
        </g>

        {/* 3: המסלול - מתאר האספלט בלבד. התצלום האווירי **אינו** מוטה: עיוות
            ראסטר בפרספקטיבה הופך תוויות לבלתי קריאות. */}
        {runwayQuads.map((q, i) => (
          <polygon key={i} data-testid="p3d-runway"
            points={q.map(c => scr(P(W(c.x, c.y, 0)))).join(' ')}
            fill={C.rwy} stroke={C.rwyEdge} strokeWidth={0.3 * k} />
        ))}

        {pats.map(p => {
          const shadow = p.path.map(n => scr(P(W(n.x, n.y, 0)))).join(' ');
          const line = p.path.map(n => scr(P(W(n.x, n.y, n.z)))).join(' ');
          const ident = (p.row.runway_ident || '').trim();
          return (
            <g key={p.row.id} data-testid="p3d-pattern" data-pattern-id={p.row.id}>
              {/* 4: צל ההקפה - המיקום האופקי האמיתי, בלי הטיית הגובה */}
              <polyline points={shadow} fill="none" stroke={C.shadow} strokeWidth={0.35 * k}
                strokeDasharray={`${1.6 * k},${1.2 * k}`} opacity={0.85} />
              {/* 5: קווי הורדה מכל צומת אל הצל שלו */}
              {p.path.map((n, i) => {
                const a = P(W(n.x, n.y, n.z)), b = P(W(n.x, n.y, 0));
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={C.drop} strokeWidth={0.18 * k} strokeDasharray={`${0.6 * k},${0.6 * k}`} opacity={0.7} />;
              })}
              {/* 6: ההקפה עצמה */}
              <polyline points={line} fill="none" stroke={p.color} strokeWidth={0.62 * k}
                strokeLinecap="round" strokeLinejoin="round" />
              {LEG_KEYS.map(key => {
                const leg = p.legs.find(l => l.key === key);
                if (!leg) return null;
                const altFt = altOnLeg(p.g, p.prof, key as LegKey, 0.5);
                // ההזחה נמדדת ב-`k` ולא ביחידות עולם קבועות. הטקסט מתומחר ב-`k`
                // (כדי להישאר בגודל של המפה השטוחה בכל זום), ולכן הזחה קבועה
                // נשארה מאחור כשהכתב גדל - ותוויות הצלעות נערמו על תיבות המטוסים
                // בתחתית ההקפה, בדיוק במקום שבו הפקח קורא את סדר הנחיתה.
                // `LABEL_CLEAR` גדול מחצי רוחב תיבת המטוס (עד 8k) ועוד חצי רוחב
                // התווית, ולכן השתיים לעולם אינן חופפות.
                const off = LABEL_CLEAR * k * labelScale;
                const q = P(W((leg.mid.x + leg.outward.x * off) * aspect, leg.mid.y + leg.outward.y * off, altFt));
                return (
                  <text key={key} data-testid="p3d-leg-label" data-leg={key}
                    x={q.x} y={q.y} textAnchor="middle" dominantBaseline="middle"
                    fill={p.color} fontSize={1.6 * k * labelScale} fontWeight="bold"
                    // זהות המטוס גוברת על שם הצלע: בהתנגשות שנותרה, הצלע נסוגה
                    opacity={0.7}
                    style={{ userSelect: 'none', paintOrder: 'stroke' }}
                    stroke={C.halo} strokeWidth={0.45 * k} strokeLinejoin="round">
                    {[tr(LEG_LABEL_KEYS[key as LegKey]), ident].filter(Boolean).join(' ')}
                  </text>
                );
              })}
            </g>
          );
        })}

        {/* 7-9: כל מה שמעורבב בעומק, ממוין יחד מהרחוק לקרוב */}
        {depth.map(d => d.el)}

        {/* 10: ציר הגבהים - הגובה נקרא כמספר, לא נאמד בעין */}
        {showAxis && (
          <g data-testid="p3d-alt-axis">
            <title>{tr('pattern3d.altAxis')}</title>
            <line x1={axisX} y1={axisBaseY} x2={axisX} y2={axisBaseY - axisSpan}
              stroke={C.axis} strokeWidth={0.3 * k} />
            {ticks.map(a => {
              const y = axisBaseY - a * zScale * ct;
              return (
                <g key={a}>
                  <line x1={axisX} y1={y} x2={axisX + 1.4 * k} y2={y} stroke={C.axis} strokeWidth={0.25 * k} />
                  <text x={axisX + 2 * k} y={y} dominantBaseline="central" textAnchor="start"
                    fill={C.dim} fontSize={1.3 * k * labelScale} fontFamily="monospace"
                    style={{ userSelect: 'none', paintOrder: 'stroke' }} stroke={C.halo} strokeWidth={0.4 * k} strokeLinejoin="round">
                    {a}
                  </text>
                </g>
              );
            })}
            <text x={axisX} y={axisBaseY - axisSpan - 2 * k} textAnchor="start"
              fill={C.dim} fontSize={1.3 * k * labelScale}
              style={{ userSelect: 'none', paintOrder: 'stroke' }} stroke={C.halo} strokeWidth={0.4 * k} strokeLinejoin="round">
              {tr('pattern3d.ft')}
            </text>
          </g>
        )}

        {/* חץ הצפון בסצנה - מתקצר עם ההטיה, וזה בדיוק הרמז "כמה שטוח אני מסתכל" */}
        <g data-testid="p3d-north">
          <title>{tr('pattern3d.north')}</title>
          {nd && (
            <>
              <line x1={northX} y1={northY} x2={northTip.x} y2={northTip.y}
                stroke={C.axis} strokeWidth={0.5 * k} strokeLinecap="round" />
              <polygon data-testid="p3d-north-head" points={northHead!} fill={C.axis} />
            </>
          )}
          <circle cx={northX} cy={northY} r={0.65 * k} fill="none" stroke={C.axis} strokeWidth={0.35 * k} />
          <text x={northLabel.x} y={northLabel.y}
            textAnchor="middle" dominantBaseline="central" fill={C.axis}
            fontSize={2.2 * k * labelScale} fontWeight="bold"
            style={{ userSelect: 'none', paintOrder: 'stroke' }} stroke={C.halo} strokeWidth={0.55 * k} strokeLinejoin="round">
            {tr('pattern3d.northLetter')}
          </text>
        </g>
      </svg>

      {/* אין הקפה = מסך כמעט ריק. משפט אחד עדיף על ניחוש מה השתבש. */}
      {!pats.length && (
        <div data-testid="p3d-empty"
          style={{
            position: 'absolute', insetInlineStart: 0, insetInlineEnd: 0, top: '46%',
            textAlign: 'center', color: C.dim, fontSize: 13, pointerEvents: 'none',
          }}>
          {tr('pattern3d.noPatterns')}
        </div>
      )}
    </div>
  );
}
