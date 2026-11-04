import { parseAltRange } from './strips';

/**
 * **עריכת גבהי אזור מחלון ההגבלות** - הלוגיקה הטהורה.
 *
 * בחלון ההגבלות של אזור (לחיצה על קו האזור) כל בלוק גובה ("גבוה" 150-400) ניתן
 * לעריכה, בשני אופנים:
 *
 * | אופן | מה משתנה | איפה נשמר |
 * |---|---|---|
 * | **לכל העמדות** | הגדרת האזור עצמו (`zone_altitude_ranges`) | DB - כל העמדות רואות |
 * | **זמני לעמדה** | רק התצוגה והחישובים בעמדה הזו | `localStorage` פר-עמדה, עד "חזרה להגדרה" |
 *
 * בשני האופנים **הפ"מים שיושבים עכשיו בבלוק** מקבלים גובה שמתאים לטווח החדש
 * (`refitAltToBand`) - ושינוי הגובה של פ"מ הוא תמיד שינוי אמיתי ב-DB, כי הפ"מ
 * משותף לכל העמדות.
 *
 * גבהים ב**רום טיסה** (מאות רגל), כמו `zone_altitude_ranges` ו-`strips.alt`.
 */

export interface AltBand { alt_min: number; alt_max: number }
/** עקיפות מקומיות לפי מזהה בלוק (`zone_altitude_ranges.id`) */
export type AltOverrides = Record<number, AltBand>;

interface RangeLike { id: number; alt_min: number | null; alt_max: number | null }

/** הבלוקים אחרי העקיפות המקומיות. בלוק שנעקף מסומן `local_override` */
export function applyAltOverrides<T extends RangeLike>(
  byZone: Record<number, T[]>, overrides: AltOverrides,
): Record<number, (T & { local_override?: boolean })[]> {
  const ids = Object.keys(overrides || {});
  if (!ids.length) return byZone;
  const out: Record<number, (T & { local_override?: boolean })[]> = {};
  for (const [zid, list] of Object.entries(byZone || {})) {
    out[Number(zid)] = (list || []).map(r => {
      const ov = overrides[r.id];
      return ov ? { ...r, alt_min: ov.alt_min, alt_max: ov.alt_max, local_override: true } : r;
    });
  }
  return out;
}

const fmt = (v: number) => (v < 100 ? String(v).padStart(3, '0') : String(v));
const fmtRange = (lo: number, hi: number) => (lo === hi ? fmt(lo) : `${fmt(lo)}-${fmt(hi)}`);

/**
 * הגובה החדש של פ"מ שיושב בבלוק שטווחו השתנה, או `null` אם אין מה לשנות.
 *
 * | הגובה של הפ"מ | התוצאה |
 * |---|---|
 * | בדיוק הטווח הישן של הבלוק (150-400) | הטווח החדש (200-400) |
 * | גובה בודד בתוך הטווח החדש | בלי שינוי |
 * | גובה בודד מחוץ לטווח החדש | הגבול הקרוב (160 ← 200) |
 * | טווח שחותך את החדש | החיתוך (150-250 ← 200-250) |
 * | טווח שאינו נוגע בחדש / בלי גובה | הטווח החדש |
 */
export function refitAltToBand(alt: string | null | undefined, oldBand: AltBand | null, newBand: AltBand): string | null {
  const nLo = Math.min(newBand.alt_min, newBand.alt_max), nHi = Math.max(newBand.alt_min, newBand.alt_max);
  const r = alt ? parseAltRange(String(alt).replace(/,/g, '')) : null;
  if (!r) return fmtRange(nLo, nHi);
  // גובה ברגל (33000) מול בלוקים ברום טיסה
  const [lo, hi] = r.map(v => (v >= 1000 ? Math.round(v / 100) : v));
  if (oldBand) {
    const oLo = Math.min(oldBand.alt_min, oldBand.alt_max), oHi = Math.max(oldBand.alt_min, oldBand.alt_max);
    if (lo === oLo && hi === oHi) return (lo === nLo && hi === nHi) ? null : fmtRange(nLo, nHi);
  }
  if (lo === hi) {
    if (lo >= nLo && lo <= nHi) return null;
    return fmt(lo < nLo ? nLo : nHi);
  }
  const iLo = Math.max(lo, nLo), iHi = Math.min(hi, nHi);
  if (iLo > iHi) return fmtRange(nLo, nHi);
  return (iLo === lo && iHi === hi) ? null : fmtRange(iLo, iHi);
}

/** עקיפות מקומיות - קריאה עמידה לערך שבור */
export function parseAltOverrides(raw: string | null | undefined): AltOverrides {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    const out: AltOverrides = {};
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o as Record<string, any>)) {
        const a = Number(v?.alt_min), b = Number(v?.alt_max);
        if (Number.isFinite(Number(k)) && Number.isFinite(a) && Number.isFinite(b)) out[Number(k)] = { alt_min: a, alt_max: b };
      }
    }
    return out;
  } catch { return {}; }
}

/**
 * בלוק הגובה של האזור שמתאים לגובה הפ"מ, או `null` כשאין התאמה.
 *
 * משמש להצבה ב"הצג גבהי אזור": פ"מ שמתקבל למפה (מנקודת העברה / מהסרגל) נכנס
 * לרצועה של **הגובה שלו** - "גבוה" לגבוה - ולא לרצועה שבמקרה נלחצה. טווח גבהים
 * נכנס לבלוק שהוא חופף בו הכי הרבה.
 */
export function blockForAlt(alt: string | null | undefined, ranges: RangeLike[]): number | null {
  const r = alt ? parseAltRange(String(alt).replace(/,/g, '')) : null;
  if (!r || !ranges?.length) return null;
  const [lo, hi] = r.map(v => (v >= 1000 ? Math.round(v / 100) : v));
  let best: number | null = null, bestOv = -1;
  for (const b of ranges) {
    if (b.alt_min == null || b.alt_max == null) continue;
    const bLo = Math.min(b.alt_min, b.alt_max), bHi = Math.max(b.alt_min, b.alt_max);
    const ov = Math.min(hi, bHi) - Math.max(lo, bLo);
    if (ov >= 0 && ov > bestOv) { best = b.id; bestOv = ov; }
  }
  return best;
}
