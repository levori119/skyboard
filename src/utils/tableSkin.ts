// סקין של מוד טבלה - המראה של הטבלה **כולה** (`table_modes.skin`).
//
// העיצוב פר-עמודה (מסגרת/רקע/הדגשה לערך, tableCellDisplay.ts) עונה על "מה
// בולט בתא". הסקין עונה על השאלה שמתחתיו: כמה רעש יש סביב הנתונים - רווח בין
// פ"מ לפ"מ, עובי וצבע המסגרת של כל פ"מ, פסי זברה ומשקל הכותרת.
//
// עקרון ההנדסה (ATC HMI): צבע ועובי שמורים למשמעות. מסגרת בצבע זיהוי לכל פ"מ
// היא דרך אחת להפריד יחידות; רווח לבן ופס דק הם דרך שקטה יותר לאותו דבר, שמשאירה
// את הצבע פנוי להתראות. **צבעי המצב לא תלויים בסקין** - קונפליקט, חריגה, גרירה
// והעברה ממתינה נראים אותו דבר בכל סקין.

export type TableSkinId = 'classic' | 'calm' | 'compact' | 'ledger';

export interface TableSkin {
  /** הרווח בין פ"מ לפ"מ (שורת הרווח), בפיקסלים */
  gapPx: number;
  /** ריפוד אנכי של תאי הפ"מ. null = כמו היום (כל תא לפי סוגו) */
  cellPadY: number | null;
  /** מסגרת הפ"מ: בצבע הזיהוי (טורקיז), או בצבע הקו השקט של התמה */
  frame: 'accent' | 'subtle';
  frameW: 1 | 2;
  /** פסי זברה בין פ"מים. בלי - הרווח והקו מפרידים */
  zebra: boolean;
  /** כותרת שקטה: רקע הלוח וקו דק, במקום פס כהה וקו עבה */
  quietHeader: boolean;
}

export const TABLE_SKINS: Record<TableSkinId, TableSkin> = {
  // כמו שהטבלה נראתה עד היום - ברירת המחדל, ולכן מוד קיים לא משתנה
  classic: { gapPx: 9, cellPadY: null, frame: 'accent', frameW: 2, zebra: true, quietHeader: false },
  // שקט: אוויר בין הפ"מים, קווים דקים ואפורים, בלי זברה - העין נחה על הנתונים
  calm: { gapPx: 7, cellPadY: 4, frame: 'subtle', frameW: 1, zebra: false, quietHeader: true },
  // צפוף: כמה שיותר פ"מים במסך, לעומס גבוה. הזברה היא שמפרידה
  compact: { gapPx: 2, cellPadY: 1, frame: 'subtle', frameW: 1, zebra: true, quietHeader: false },
  // פנקס: שורות רצופות כמו טבלת נתונים, זברה וקו דק - בלי רווחים בכלל
  ledger: { gapPx: 0, cellPadY: 3, frame: 'subtle', frameW: 1, zebra: true, quietHeader: true },
};

export const TABLE_SKIN_IDS = Object.keys(TABLE_SKINS) as TableSkinId[];

export function isTableSkinId(v: unknown): v is TableSkinId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TABLE_SKINS, v);
}

/** הסקין של מוד. ערך חסר או לא מוכר (שרת ישן, סקין שנמחק) - הקלאסי */
export function tableSkinOf(raw: unknown): TableSkin {
  return isTableSkinId(raw) ? TABLE_SKINS[raw] : TABLE_SKINS.classic;
}
