import { blockFitsSpace } from './blockSpaces';
// Strip / formation display + altitude helpers (extracted from App.tsx)

// Computed display name from callsign + aircraft_indices (e.g. "חנית/1+2")
export const getFormationDisplayName = (strip: any): string => {
  if (!strip) return '';
  const base = strip.callSign || strip.callsign || '';
  let raw = strip.aircraft_indices;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
  const indices: number[] | null = Array.isArray(raw) && raw.length > 0 ? raw : null;
  if (!indices) return base;
  return `${base}/${[...indices].sort((a, b) => a - b).join('+')}`;
};

export const getTransferLabel = (t: any): string => {
  const base = t.callSign || t.callsign || '';
  let raw = t.aircraft_indices;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
  const indices: number[] | null = Array.isArray(raw) && raw.length > 0 ? raw : null;
  if (indices) {
    return `${base}/${[...indices].sort((a, b) => a - b).join('+')}`;
  }
  const count = t.numberOfFormation || t.number_of_formation || '';
  return count ? `${base}/${count}` : base;
};

export const getTransferSq = (t: any): string => t.sq || t.squadron || '';

export const normalizeAlt = (raw: string): string => {
  if (!raw) return raw;
  const s = raw.trim();
  const rangeMatch = s.match(/^[Ff][Ll]?\s*(\d+)\s*[-–]\s*[Ff]?[Ll]?\s*(\d+)$/) ||
                     s.match(/^(\d+)\s*[-–]\s*[Ff]?[Ll]?\s*(\d+)$/) ||
                     s.match(/^[Ff][Ll]?\s*(\d+)\s*[-–]\s*(\d+)$/) ||
                     s.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (rangeMatch) return `${rangeMatch[1]}-${rangeMatch[2]}`;
  const singleMatch = s.match(/^[Ff][Ll]?\s*(\d+)$/);
  if (singleMatch) return singleMatch[1];
  return s;
};

// Parse an altitude string into feet (same logic as VerticalView's parseAltSingle)
export const parseAltToFeet = (raw: string): number | null => {
  if (!raw) return null;
  const u = raw.trim().toUpperCase().replace(/,/g, '');
  const fl = u.match(/^F[L]?(\d+)/);
  if (fl) return parseInt(fl[1]) * 100;
  const num = u.match(/^(\d+)$/);
  if (num) {
    const n = parseInt(num[1]);
    return (n >= 100 && n <= 999) ? n * 100 : n;
  }
  return null;
};

// Parse an altitude/block string into a [low, high] FL range (raw numbers, as used
// by conflict deltas — multiply by 100 for feet). "320-395"→[320,395]; "320"→[320,320];
// "FL270"→[270,270]. null if no number. Fixes conflict checks that previously used
// only the first (lowest) number of a multi-altitude block.
export const parseAltRange = (alt: string | null | undefined): [number, number] | null => {
  if (!alt) return null;
  const nums = String(alt).match(/\d+/g);
  if (!nums || nums.length === 0) return null;
  const vals = nums.map(n => parseInt(n, 10)).filter(n => !isNaN(n));
  if (vals.length === 0) return null;
  return [Math.min(...vals), Math.max(...vals)];
};

// Vertical gap (in FL units) between two altitude ranges; 0 if they overlap.
export const altRangeGap = (a: [number, number], b: [number, number]): number =>
  Math.max(0, Math.max(a[0], b[0]) - Math.min(a[1], b[1]));

/**
 * חריגה מבלוק: האם גובה הפ"מ יוצא מהבלוקים של העמדה בטבלה הפעילה.
 *
 * - העמדה הקובעת היא **העמדה שמציגה** את הפ"מ (`viewerPresetId`), ורק בהיעדרה
 *   העמדה הרשומה על הפ"מ: `workstation_preset_id` נושא גם יעד העברה, ופ"מ שיושב
 *   בבלוק של העמדה סומן כחורג כי נמדד מול עמדה אחרת.
 * - נבדק **כל הטווח** ולא רק הגובה הראשון: שני הקצוות בבלוקים של העמדה, ואף
 *   בלוק של עמדה אחרת לא נחתך בדרך. כך טווח על פני שני בלוקים סמוכים של העמדה
 *   (רביעייה) תקין, וטווח שגולש לבלוק של עמדה אחרת - חורג.
 * - בלי טבלה פעילה, בלי בלוקים בטבלה, או כשלעמדה אין בה בלוקים - אין התראה.
 */
/** רמת טיסה אחת (FL) - בלוקים שביניהם רמה אחת לכל היותר הם רצף */
const FL_STEP = 10;
export const computeBlockDeviation = (
  s: any, allBlocks: any[], _blockTables: any[],
  activeBlockTableId?: number | null, viewerPresetId?: number | null,
): boolean => {
  if (!s.alt) return false;
  // בלי טבלה פעילה (לעמדה כמה טבלאות): הטבלה שהמרחב של הפ"מ הוא אחד ממרחבי
  // החלוקה שלה - זו הטבלה שהעמודה שלו בתצוגה האנכית מציגה. קודם: אין התראה בכלל
  if (!activeBlockTableId && s.block_space_id != null && s.block_space_id !== '') {
    const bySpace = (Array.isArray(_blockTables) ? _blockTables : []).filter((bt: any) =>
      Array.isArray(bt?.split_space_ids) && bt.split_space_ids.map(Number).includes(Number(s.block_space_id)));
    if (bySpace.length === 1) activeBlockTableId = Number(bySpace[0].id);
  }
  if (!activeBlockTableId) return false;
  const presetId = viewerPresetId ? Number(viewerPresetId) : (s.workstation_preset_id ? Number(s.workstation_preset_id) : null);
  if (!presetId) return false;

  const r = parseAltRange(String(s.alt).replace(/,/g, ''));
  if (!r) return false;
  // גובה ברגל (33000) מול בלוקים ביחידות FL
  const [lo, hi] = r.map(v => (v >= 1000 ? Math.round(v / 100) : v));

  const tableBlocks = allBlocks.filter((b: any) => b.block_table_id === activeBlockTableId && blockFitsSpace(b, s.block_space_id));
  if (tableBlocks.length === 0) return false;
  const wsOf = (b: any): number[] => (Array.isArray(b.workstations) ? b.workstations.map(Number) : []);
  // בלוק של מרחב אחר אינו "הבלוק שלו" - גם אם הגובה זהה (סונן למעלה).
  // "שלי" = בלוק שהעמדה **משויכת** אליו. בלוק בלי עמדות אינו של אף אחד: קודם
  // הוא נחשב פתוח לכולם, ופ"מ שישב בו (שקד 290 בכטממ) לא סומן כחריגה
  // טבלה שאיש לא שויך בה לבלוקים - כל הבלוקים הלא-משויכים הם "שלי" (טבלה כללית)
  const assigned = tableBlocks.some((b: any) => wsOf(b).includes(presetId));
  const isMine = (b: any) => (assigned ? wsOf(b).includes(presetId) : wsOf(b).length === 0);
  const myBlocks = tableBlocks.filter(isMine);
  if (myBlocks.length === 0) return false; // לעמדה אין בלוקים בטבלה - אין מול מה להתריע

  const bLo = (b: any) => Math.min(Number(b.alt_from), Number(b.alt_to));
  const bHi = (b: any) => Math.max(Number(b.alt_from), Number(b.alt_to));
  const inMine = (v: number) => myBlocks.some((b: any) => v >= bLo(b) && v <= bHi(b));
  if (!inMine(lo) || !inMine(hi)) return true;
  // כל הטווח, לא רק הקצוות: 303-358 מתחיל בבלוק 280-310 ונגמר ב-330-380, אבל
  // עובר דרך 320 שאינו באף בלוק. בלוקים סמוכים ברמת טיסה אחת (260-270 ו-280-310)
  // הם רצף - אין רמה ביניהם
  let covered = lo;
  for (const b of [...myBlocks].filter((b: any) => bHi(b) >= lo && bLo(b) <= hi).sort((a: any, b: any) => bLo(a) - bLo(b))) {
    if (bLo(b) > covered + FL_STEP) return true;
    covered = Math.max(covered, bHi(b));
    if (covered >= hi) break;
  }
  if (covered < hi) return true;
  return tableBlocks.some((b: any) => !isMine(b) && lo <= bHi(b) && hi >= bLo(b));
};

/**
 * מיזוג **עדכון אופטימי** על גבי נתוני השרת, לפני שהם נכנסים ל-state.
 *
 * הפולינג מחליף את רשימת הפ"מים כל שתי שניות. שינוי שנעשה בעמדה ועדיין לא
 * חזר מהשרת נמחק ברענון הבא, ובפקד זה נראה כאילו הלחיצה לא עבדה: הערך חוזר
 * לריק, וכל לחיצה מתחילה שוב מהערך הראשון.
 *
 * שני כללים שמחזיקים את זה:
 * 1. `custom_fields` ממוזג **ברמת המפתח** - אחרת פקד שעמדה אחרת שינתה היה
 *    נמחק אצלי בכל רענון.
 * 2. מפתח שהשרת כבר מחזיר **יוצא** מרשימת ההמתנה - אחרת ההמתנה נצחית,
 *    ושינוי של עמדה אחרת לעולם לא היה מגיע אליי.
 *
 * ה-`Map` **משתנה במקום** (זה מצב חי של המסך), ולכן הפונקציה מחזירה רק את
 * הרשימה הממוזגת.
 */
export function mergeStripsWithPending(
  fresh: any[],
  pending: Map<string | number, Record<string, any>>,
): any[] {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  return (fresh || []).map(s => {
    const pend = pending.get(s.id);
    if (!pend) return s;
    const merged: any = { ...s, ...pend };
    if (pend.custom_fields) merged.custom_fields = { ...(s.custom_fields || {}), ...pend.custom_fields };

    const stillPending: Record<string, any> = {};
    for (const [k, v] of Object.entries(pend)) {
      if (k === 'custom_fields') {
        const leftovers: Record<string, unknown> = {};
        for (const [ck, cv] of Object.entries(v as Record<string, unknown>)) {
          if (!same((s.custom_fields || {})[ck], cv)) leftovers[ck] = cv;
        }
        if (Object.keys(leftovers).length) stillPending.custom_fields = leftovers;
      } else if (!same(s[k], v)) {
        stillPending[k] = v;
      }
    }
    if (Object.keys(stillPending).length) pending.set(s.id, stillPending);
    else pending.delete(s.id);
    return merged;
  });
}
