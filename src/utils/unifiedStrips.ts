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

/** רשומת איחוד פעילה (תת-קבוצה של position_merges). */
export interface ActiveMerge {
  covering_preset_id: number | string;
  covered_preset_id: number | string;
  ended_at?: unknown;
}

/** עמדה + הסקטורים ששייכים לה (relevant + נקודות מסירה/קבלה). */
export interface PresetSectors {
  id: number | string;
  sectors: (number | string)[];
}

/**
 * מי המוסר בהעברה תחת איחוד עמדות.
 *
 * כשעמדה A מכסה עמדה B (covered) ומייבאת את מפת B (מפה 2), היא מתפעלת את **נקודות
 * ההעברה של B**. העברה דרך נקודת העברה של B — כלומר לסקטור ששייך ל-B — נעשית **בשם B**,
 * ולכן המוסר חייב להיות B. אחרת from=A, ומכיוון ש-to_sector ∈ B.relevant ו-from(A) ≠ B,
 * ההעברה נופלת ב"קבלה" של B במקום ב"מסירה" (הבאג: הפ"מ מופיע כאילו התקבל ולא נמסר).
 *
 * הקריטריון הוא **סקטור היעד** (לא בעל הפ"מ): אם הוא שייך לעמדה שאני מכסה — היא המוסר.
 * כך זה עובד גם כשהפ"מ בבעלות A וגם כשהוא בבעלות B. בפיצול אין עוד איחוד פעיל → from=A.
 */
export const resolveTransferFromPreset = (
  toSectorId: number | string | null | undefined,
  myPresetId: number | string | null | undefined,
  activeMerges: ActiveMerge[],
  coveredPresets: PresetSectors[],
): number | string | null | undefined => {
  if (myPresetId == null || toSectorId == null) return myPresetId;
  const iCover = new Set(
    activeMerges
      .filter(m => !m.ended_at && eqId(m.covering_preset_id, myPresetId))
      .map(m => Number(m.covered_preset_id)),
  );
  if (iCover.size === 0) return myPresetId;
  const owner = coveredPresets.find(
    p => iCover.has(Number(p.id)) && p.sectors.some(s => eqId(s, toSectorId)),
  );
  return owner ? owner.id : myPresetId;
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
