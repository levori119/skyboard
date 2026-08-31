/**
 * **מצב העמדה** - תא אחד, שתי טבלאות.
 *
 * גם רשימת ההפצה (לפני היצירה) וגם טופס אישורי העמדות (אחרי) עונים לאותה שאלה
 * תפעולית: *יש שם מישהו?* - וזו השאלה שמכריעה אם היוצר ממתין לאישור או מרים
 * טלפון. שני מימושים נפרדים היו נראים אחרת על אותו מסך, ובעיקר: אחד מהם היה
 * מתעדכן והשני נשאר מאחור בלי שאיש ישים לב.
 *
 * הצבע כאן הוא **צבע סטטוס** ולכן קבוע בשלוש התמות (כמו האזור הסגור): "לא
 * פעילה" חייב להיקרא לא-פעילה גם במסך יום וגם בחדר בקרה מוחשך.
 *
 * מקור הנתונים בשרת הוא ביטוי SQL **אחד** (`stationStateSelect`), ולכן שתי
 * הטבלאות אינן יכולות לחלוק על השאלה מי מאויש.
 */

import React from 'react';
import { tr } from '../../i18n/tr';

export interface StationStateInfo {
  /** דופק טרי מהעמדה. `false` = אין שם אדם. `undefined` = השרת לא דיווח. */
  active?: boolean;
  /** שם העמדה שמכסה אותה באיחוד עמדות, אם היא מכוסה. */
  merged_into_name?: string | null;
}

const OK = '#4ade80';
const OFF = '#f87171';
const MERGED = '#7dd3fc';

/**
 * מצב העמדה כשורה אחת. "מאוחדת" קודמת ל"לא פעילה" כשהעמדה גם מכוסה וגם
 * חשוכה, כי היא **המידע שמכוון לפעולה**: יש למי לפנות, ושמו כתוב.
 */
export default function StationState({ state }: { state: StationStateInfo }) {
  const merged = (state.merged_into_name || '').trim();
  const inactive = state.active === false;
  const tag = (color: string, text: string, mark: string, attr: string) => (
    <span data-station-state={attr}
      style={{ color, fontSize: 10, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span aria-hidden>{mark}</span>{text}
    </span>
  );
  if (merged) return tag(MERGED, tr('seizure.mergedShort', { name: merged }), '🔀', 'merged');
  if (inactive) return tag(OFF, tr('seizure.inactiveStation'), '⭘', 'inactive');
  return tag(OK, tr('seizure.activeStation'), '●', 'active');
}
