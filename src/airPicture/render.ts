// ציור התמונ"א על קנבס.
//
// למה קנבס ולא SVG כמו שאר שכבות המפה: השכבות הקיימות (אזורים, הקפות, נקודות
// העברה) הן **סטטיות ומעטות**, וזה בדיוק מה ש-SVG טוב בו. התמונ"א היא ההפך -
// מאות ישויות שכולן זזות. 300 מטוסים ב-SVG הם ~1,500 צמתי DOM שמשתנים כל
// 2 שניות, וזו עלות style+layout+paint שאין שום סיבה לשלם.
// זו אינה סטייה מהתבנית אלא בחירה לפי סוג המידע (AIR_PICTURE_SPEC.md §5.4).

import { trackLabelLines, trackSymbolPoints, type PlacedTrack } from './track';
import { CLASSIFICATION_COLOR } from '../../shared/airTrafficApi';

export interface RenderOpts {
  /** גבולות תמונת המפה בפיקסלי CSS של השכבה. */
  width: number;
  height: number;
  /** גודל הסמל והתווית (העדפת הפקח). */
  scale: number;
  /** בהירות כוללת. */
  opacity: number;
  labels: boolean;
  /** צפיפות הביטמאפ: dpr × סקייל-המסך × זום-המפה. */
  density: number;
  /** התמונה ישנה - הסמלים מעומעמים נוספות. */
  stale: boolean;
}

/**
 * מטמון הביטמאפים של התוויות - **האופטימיזציה היחידה שבלעדיה זה לא עומד**.
 *
 * `fillText` עולה ~10-20µs. 300 מטוסים × 2 שורות = ~600 קריאות לכל פריים,
 * כלומר 6-12ms - יותר מכל תקציב הציור. כאן כל תווית מצוירת פעם אחת לקנבס זעיר
 * ומצוירת בכל פריים ב-`drawImage` (~2-5µs). התוכן משתנה לכל היותר פעם ב-2
 * שניות (דגימה חדשה), ולכן הציור האמיתי קורה כמעט אף פעם.
 *
 * הגבול 400 הוא MAX_TRACKS (300) ועוד מרווח לתחלופה, ולא מספר שרירותי.
 * הפינוי הוא LRU: Map ב-JS שומר סדר הכנסה, ומחיקה+הכנסה מחדש מקדמת ערך לסוף.
 */
const LABEL_CACHE_MAX = 400;
const labelCache = new Map<string, HTMLCanvasElement>();

/** מפתח המטמון - **בדיוק** מה שמופיע בתווית. שינוי בכל אחד מהם = ציור מחדש. */
const labelKey = (t: PlacedTrack, density: number, scale: number, labels: boolean) =>
  `${labels ? 1 : 0}|${t.cs}|${Math.round(t.alt / 100)}|${t.spd}|${t.cls}|${density.toFixed(2)}|${scale.toFixed(2)}`;

export function clearLabelCache(): void { labelCache.clear(); }
export function labelCacheSize(): number { return labelCache.size; }

function labelBitmap(t: PlacedTrack, o: RenderOpts): HTMLCanvasElement | null {
  const key = labelKey(t, o.density, o.scale, o.labels);
  const hit = labelCache.get(key);
  if (hit) {
    labelCache.delete(key);
    labelCache.set(key, hit);
    return hit;
  }

  const fs = 11 * o.scale * o.density;
  // אותה תווית בדיוק של הסצנה התלת מימדית - ראה track.trackLabelLines
  const [line1, line2] = trackLabelLines(t);

  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d');
  if (!cx) return null;
  cx.font = `${fs}px monospace`;
  const w = Math.ceil(Math.max(cx.measureText(line1).width, cx.measureText(line2).width)) + 4;
  const h = Math.ceil(fs * 2.35);
  cv.width = Math.max(1, w);
  cv.height = Math.max(1, h);

  const c2 = cv.getContext('2d');
  if (!c2) return null;
  c2.font = `${fs}px monospace`;
  c2.textBaseline = 'top';
  // קו מתאר כהה: התווית נקראת גם מעל מפה בהירה וגם מעל אזור צבוע.
  c2.lineWidth = Math.max(1, fs / 6);
  c2.strokeStyle = '#000000cc';
  c2.strokeText(line1, 2, 0);
  c2.strokeText(line2, 2, fs * 1.2);
  c2.fillStyle = CLASSIFICATION_COLOR[t.cls] || '#94a3b8';
  c2.fillText(line1, 2, 0);
  c2.fillStyle = '#cbd5e1';
  c2.fillText(line2, 2, fs * 1.2);

  labelCache.set(key, cv);
  if (labelCache.size > LABEL_CACHE_MAX) {
    const oldest = labelCache.keys().next().value;
    if (oldest !== undefined) labelCache.delete(oldest);
  }
  return cv;
}

/** משולש המטוס, מסובב לכיוון הטיסה. נתיב אחד, בלי טקסט - זול לצייר ישירות. */
function drawSymbol(cx: CanvasRenderingContext2D, px: number, py: number, hdg: number, r: number, color: string) {
  cx.save();
  cx.translate(px, py);
  cx.rotate((hdg * Math.PI) / 180);
  cx.beginPath();
  // אותה צורה בדיוק של הסצנה התלת מימדית - ראה track.trackSymbolPoints
  const pts = trackSymbolPoints(r);
  cx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) cx.lineTo(p.x, p.y);
  cx.closePath();
  cx.fillStyle = color;
  cx.fill();
  cx.lineWidth = Math.max(1, r / 7);
  cx.strokeStyle = '#000000aa';
  cx.stroke();
  cx.restore();
}

/**
 * ציור פריים שלם. מקבל מטוסים כבר מסוננים ומוגבלים (`prepare`), ולכן כאן אין
 * שום לוגיקה תפעולית - רק פיקסלים.
 */
export function renderFrame(
  cx: CanvasRenderingContext2D, tracks: PlacedTrack[], o: RenderOpts,
): void {
  const W = o.width * o.density;
  const H = o.height * o.density;
  cx.clearRect(0, 0, W, H);
  cx.globalAlpha = o.stale ? o.opacity * 0.55 : o.opacity;

  const r = 7 * o.scale * o.density;
  for (const t of tracks) {
    const px = (t.x / 100) * W;
    const py = (t.y / 100) * H;
    drawSymbol(cx, px, py, t.hdg, r, CLASSIFICATION_COLOR[t.cls] || '#94a3b8');
    if (!o.labels) continue;
    const bmp = labelBitmap(t, o);
    if (bmp) cx.drawImage(bmp, px + r * 1.1, py - r * 0.6);
  }

  cx.globalAlpha = 1;
}

/**
 * גודל הביטמאפ בפיקסלים אמיתיים.
 *
 * `#root` יושב תחת `zoom: var(--s)` (1.65 בעמדת 24"), ושכבת המפה תחת
 * `scale(mapZoom)`. קנבס שלא מכפיל בשניהם יוצא **מטושטש בדיוק בעמדת היעד** -
 * אותה מלכודת שמתועדת ב-CLAUDE.md §גרירה סעיף 3, בלבוש אחר.
 *
 * התקרה קיימת כדי שזום מפה גבוה לא יקצה ביטמאפ ענק: מעבר לה הטקסט כבר חד
 * מספיק, וההקצאה עולה יותר ממה שהיא מחזירה.
 */
export const MAX_DENSITY = 3;
export function densityFor(dpr: number, cssZoom: number, mapZoom: number): number {
  const d = (dpr || 1) * (cssZoom || 1) * (mapZoom || 1);
  return Math.min(MAX_DENSITY, Math.max(1, d));
}
