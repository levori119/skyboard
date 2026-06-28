// ─── "עמדה מאוחדת" (Unified Position) — client-side strip union ────────────────
// בקר אחד מאחד אליו עמדה/עמדות נוספות בזמן ריצה (Position Combine). הלוגיקה כאן
// טהורה (בלי React/DOM) כדי שתהיה בת-בדיקה.
//
// סט-עמדה מלא (החלטה 4 באפיון): פ"מ שייך לעמדה אם —
//   • הוא תואם את ה-filter שלה (query match), או
//   • הוא משויך אליה מפורשות (table_preset_ids), או
//   • הוא pending_transfer נכנס אליה (בבעלותה + תואם ה-filter), או
//   • (כשאין ל-עמדה filter) הוא בבעלותה (workstation_preset_id) — fallback שמונע הצפה.
//
// "העמדה שלי" (mine) שונה רק בנקודה אחת: filter ריק = "כל הפ"מים" (כמו myStrips),
// בעוד עמדה מאוחדת בלי filter נופלת לבעלות מפורשת בלבד.
import { evaluateQuery, hasConditions } from './queryBuilder';
import type { QGroup, QEvalCtx } from './queryBuilder';

export interface CombinedPosition {
  /** ה-preset id של העמדה שאוחדה */
  presetId: number | string;
  /** ה-filter_query של אותה עמדה (null/ריק = אין סינון משלה) */
  filter: QGroup | null;
  /** הקשר הערכה לאותה עמדה (presetId/presetName/aviationBases) */
  ctx?: QEvalCtx;
}

/** האם הפ"מ תואם פילטר אפקטיבי. פילטר null/ריק = "כל הפ"מים" (כמו myStrips). */
export const matchesEffectiveFilter = (
  strip: any,
  filter: QGroup | null,
  ctx?: QEvalCtx,
): boolean => {
  if (!filter || !hasConditions(filter)) return true;
  return evaluateQuery(strip, filter, ctx);
};

const eqId = (a: any, b: any): boolean => Number(a) === Number(b);

/**
 * האם פ"מ שייך לעמדה מסוימת — מאחד query + שיוך מפורש + pending נכנס + בעלות.
 * `mineFallbackAll`: בעמדה שלי, filter ריק = כל הפ"מים. בעמדה מאוחדת = בעלות בלבד.
 */
const matchesPosition = (
  strip: any,
  filter: QGroup | null,
  ctx: QEvalCtx | undefined,
  presetId: number | string | null | undefined,
  mineFallbackAll: boolean,
): boolean => {
  // pending_transfer: רק אם הפ"מ נכנס לעמדה הזו (בבעלותה) ותואם את ה-filter שלה
  if (strip?.status === 'pending_transfer') {
    return presetId != null && eqId(strip.workstation_preset_id, presetId)
      && matchesEffectiveFilter(strip, filter, ctx);
  }
  // שיוך מפורש (table_preset_ids) — לא כולל cancelled/rejected
  if (
    presetId != null &&
    Array.isArray(strip?.table_preset_ids) &&
    strip.table_preset_ids.some((id: any) => eqId(id, presetId)) &&
    strip.status !== 'cancelled' && strip.status !== 'rejected'
  ) {
    return true;
  }
  // query match, או fallback (כל הפ"מים לעמדה שלי / בעלות לעמדה מאוחדת)
  if (filter && hasConditions(filter)) return evaluateQuery(strip, filter, ctx);
  return mineFallbackAll ? true : (presetId != null && eqId(strip?.workstation_preset_id, presetId));
};

/**
 * האם פ"מ שייך לאחת מהעמדות המאוחדות בלבד (לא כולל "שלי"). שימושי כדי לצרף את
 * תוספת-העמדות-המאוחדות לרשימה קיימת בלי לכפול את הפ"מים שכבר נכללו ב-myStrips.
 */
export const stripInCombined = (
  strip: any,
  combined: CombinedPosition[] = [],
): boolean => combined.some(pos => matchesPosition(strip, pos.filter, pos.ctx, pos.presetId, false));

/**
 * האם פ"מ צריך להופיע בתצוגה המאוחדת: שייך לעמדה שלי, או לאחת מהעמדות המאוחדות.
 * כש-combined ריק → מתנהג בדיוק כמו הסינון הרגיל (myStrips).
 */
export const stripInUnifiedView = (
  strip: any,
  mineFilter: QGroup | null,
  mineCtx?: QEvalCtx,
  combined: CombinedPosition[] = [],
): boolean => {
  if (matchesPosition(strip, mineFilter, mineCtx, mineCtx?.presetId ?? null, true)) return true;
  return combined.some(pos => matchesPosition(strip, pos.filter, pos.ctx, pos.presetId, false));
};

/**
 * סינון רשימת פ"מים לתצוגה מאוחדת. שומר על סדר המקור ואינו מייצר כפילויות
 * (כל פ"מ נבדק פעם אחת ונכלל לכל היותר פעם אחת).
 */
export const filterUnifiedStrips = (
  strips: any[],
  mineFilter: QGroup | null,
  mineCtx?: QEvalCtx,
  combined: CombinedPosition[] = [],
): any[] => strips.filter(s => stripInUnifiedView(s, mineFilter, mineCtx, combined));

/**
 * ניקוי רשימת עמדות מאוחדות: מסיר את העמדה של המפעיל עצמו (`mineId`) וכפילויות
 * (לפי presetId), שומר את המופע הראשון. שכבת-הגנה מפני איחוד-עצמי/כפילות.
 */
export const sanitizeCombined = (
  combined: CombinedPosition[],
  mineId: number | string | null | undefined,
): CombinedPosition[] => {
  const seen = new Set<number>();
  const out: CombinedPosition[] = [];
  for (const pos of combined) {
    if (mineId != null && eqId(pos.presetId, mineId)) continue;
    const key = Number(pos.presetId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pos);
  }
  return out;
};

/**
 * נקודת-הכניסה לאינטגרציה: ניקוי עמדות → איחוד. מבנה מפוצל = פ"מים נפרדים
 * (כל אחד נבדק בנפרד; אין מיזוג מבנים — זה לא נוגע לאיחוד עמדות).
 * `combined=[]` ⇒ פלט זהה ל-myStrips (אי-נסיגה).
 */
export const unifyStrips = (
  strips: any[],
  mineFilter: QGroup | null,
  mineCtx?: QEvalCtx,
  combined: CombinedPosition[] = [],
): any[] => {
  const clean = sanitizeCombined(combined, mineCtx?.presetId ?? null);
  return filterUnifiedStrips(strips, mineFilter, mineCtx, clean);
};
