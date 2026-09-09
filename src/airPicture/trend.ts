// מגמה אנכית של מטוס תמונ"א - **נגזרת, לא מדווחת**.
//
// חוזה המאגר (shared/airTrafficApi.d.ts) מוסר גובה רגעי בלבד ואין בו קצב טיפוס.
// לכן המגמה מחושבת כאן מהשוואת דגימות: הפקח צריך לדעת אם המטוס מטפס או מנמיך
// כדי לפתור קונפליקט גובה, ומספר אחד בלי מגמה אינו עונה על זה.
//
// ── שתי הכרעות ───────────────────────────────────────────────────────────────
// 1. **סף ולא נגזרת רגעית.** הדגימה מגיעה כל ~שנייה, והגובה מעוגל לרגל שלמה;
//    הפרש של רגלים בודדות בין שתי דגימות הוא רעש מדידה ולא טיפוס. השוואה מול
//    **נקודת ייחוס** שנקבעת מחדש רק כשעוברים את הסף מונעת חץ מהבהב.
// 2. **המגמה נשמרת עד שהיא מתיישנת.** מטוס בטיפוס אינו עולה במדרגות אחידות;
//    בין שתי חציות סף יש שניות של שקט, ואילו כל דגימה הייתה מאפסת - החץ היה
//    נעלם ומופיע. אחרי `TREND_HOLD_MS` בלי חציית סף המטוס מוכרז מפולס.

import type { AirTrack } from '../../shared/airTrafficApi';

/** `null` = טיסה מפולסת (או שטרם נמדדה מגמה). */
export type VertTrend = 'climb' | 'descend' | null;

/**
 * הפרש הגובה המינימלי שנחשב מגמה. 150 רגל ולא 50: הגובה מגיע מעוגל, ומטוס
 * מפולס "נושם" עשרות רגלים בין דגימות. הסף הזה גם מסנן קפיצת דגימה בודדת.
 */
export const TREND_MIN_FT = 150;

/** בלי חציית סף במשך הזמן הזה - המטוס מפולס. */
export const TREND_HOLD_MS = 20000;

/** נקודת הייחוס שממנה נמדדת המגמה של מטוס אחד. */
export interface TrendRef {
  /** הגובה בנקודת הייחוס האחרונה (ולא בדגימה האחרונה). */
  alt: number;
  /** מתי נקבעה נקודת הייחוס, בשעון העמדה. */
  t: number;
  trend: VertTrend;
}

/**
 * נקודת הייחוס הבאה של מטוס בודד. פונקציה טהורה - הזמן מגיע כפרמטר, כדי
 * שהבדיקות יוכלו להריץ תרחיש שלם בלי שעון אמיתי.
 */
export function nextTrendRef(
  prev: TrendRef | undefined, altFt: number, nowMs: number,
): TrendRef {
  const alt = Number(altFt);
  if (!Number.isFinite(alt)) return prev ?? { alt: 0, t: nowMs, trend: null };
  if (!prev) return { alt, t: nowMs, trend: null };

  const delta = alt - prev.alt;
  if (Math.abs(delta) >= TREND_MIN_FT) {
    return { alt, t: nowMs, trend: delta > 0 ? 'climb' : 'descend' };
  }
  // שקט ממושך = מפולס. נקודת הייחוס נקבעת מחדש כדי שסחיפה איטית מאוד לא
  // תצטבר לכדי "מגמה" אחרי דקות.
  if (nowMs - prev.t >= TREND_HOLD_MS) return { alt, t: nowMs, trend: null };
  return prev;
}

/**
 * מפת הייחוס לכל המטוסים בדגימה. מטוס שכבר אינו באוויר **נושר** - אחרת המפה
 * גדלה בלי גבול לאורך משמרת שלמה, ומטוס שמזההו ימוחזר היה יורש מגמה זרה.
 */
export function updateTrendRefs(
  prev: Map<string, TrendRef> | null | undefined,
  tracks: AirTrack[] | null | undefined,
  nowMs: number,
): Map<string, TrendRef> {
  const next = new Map<string, TrendRef>();
  for (const t of tracks || []) {
    if (!t || !t.id) continue;
    next.set(t.id, nextTrendRef(prev?.get(t.id), t.alt, nowMs));
  }
  return next;
}

/** מה שהציור צריך: מזהה → מגמה. */
export function trendsOf(refs: Map<string, TrendRef> | null | undefined): Map<string, VertTrend> {
  const out = new Map<string, VertTrend>();
  for (const [id, r] of refs || []) out.set(id, r.trend);
  return out;
}

/**
 * משולש החץ סביב (0,0), ביחידות רדיוס הסמל. חוד למעלה בטיפוס,
 * למטה בנמיכה. **מקור אחד לשני המבטים** - הקנבס צובע אותו בנתיב
 * וה-SVG ב-`<polygon>`, בדיוק כמו `trackSymbolPoints`.
 */
export function trendArrowPoints(r: number, trend: VertTrend): { x: number; y: number }[] {
  if (!trend) return [];
  const h = r * 0.9, w = r * 0.5;
  return trend === 'climb'
    ? [{ x: 0, y: -h / 2 }, { x: w, y: h / 2 }, { x: -w, y: h / 2 }]
    : [{ x: 0, y: h / 2 }, { x: w, y: -h / 2 }, { x: -w, y: -h / 2 }];
}

/**
 * היסט החץ ממרכז הסמל, ביחידות רדיוס. **בצד הנגדי לתווית**
 * (התווית יושבת ב-x חיובי), כדי ששניהם לא יתנגשו בצפיפות.
 */
export const TREND_OFFSET = { x: -1.15, y: -0.55 };

/** צבע החץ - לבן תמיד. הצבע עונה על "מי זה"; החץ על "מה הוא עושה". */
export const TREND_COLOR = '#ffffff';
