/**
 * **פ"מ בהעברה - מנקודת המבט של העמדה שמחזיקה אותו.**
 *
 * `strips` היא שורה אחת לפ"מ, ו-`status='pending_transfer'` + `workstation_preset_id`
 * (שנושא את **יעד** ההעברה) הם **גלובליים**. ההחזקה, לעומת זאת, היא פר-עמדה
 * (`strip_table_assignments` / `strip_zone_assignments`): את אותו פ"מ מחזיקות כמה
 * עמדות במקביל - להיערכות, לגיבוי נתק, או כשעמדה אינה עובדת לפי הנהלים.
 *
 * הבאג שזה מתקן: עמדה א' שלחה את הפ"מ לנקודת העברה, והוא **נעלם גם מעמדה ג'**
 * שהחזיקה אותו לגמרי בנפרד - כי כל מסנני התצוגה מסתירים `pending_transfer`,
 * וגם `myStrips` מוותר על פ"מ שה-`workstation_preset_id` שלו אינו שלי.
 *
 * הפתרון: **הטלה פר-עמדה** על הנתונים בכניסתם. לעמדה שמחזיקה את הפ"מ ואינה צד
 * בהעברה, הפ"מ נראה בדיוק כמו קודם - ולכן גם `status` וגם `workstation_preset_id`
 * מוטלים לערכים "שלי", ואין צורך לגעת בעשרות אתרי התצוגה (אתר שהיה נשכח - שותק
 * בשקט). הערכים המקוריים נשמרים ב-`raw_status` / `raw_workstation_preset_id`.
 *
 * מי **כן** רואה "בהעברה": השולח (הפ"מ יוצא מהדסק שלו עד קבלה או דחייה) והעמדה
 * המקבלת (כרטיס נכנס). הם הצדדים - אצלם זו המציאות.
 */

export interface PendingTransferParty {
  strip_id: number | string;
  from_preset_id?: number | string | null;
  from_workstation_id?: number | string | null;
  to_preset_id?: number | string | null;
  to_workstation_id?: number | string | null;
}

export interface TransferViewStrip {
  id: string | number;
  status?: string;
  on_map?: boolean;
  in_table?: boolean;
  workstation_preset_id?: number | string | null;
  table_preset_ids?: (number | string)[] | null;
  at_preset_names?: string[] | null;
  raw_status?: string;
  raw_workstation_preset_id?: number | string | null;
}

const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** האם **אני** מחזיק את הפ"מ - בדסק שלי או באזור שחיברתי. */
function heldByMe(s: TransferViewStrip, myIds: Set<number>, myNames: Set<string>): boolean {
  if (Array.isArray(s.table_preset_ids) && s.table_preset_ids.some(p => myIds.has(Number(p)))) return true;
  return Array.isArray(s.at_preset_names) && s.at_preset_names.some(n => myNames.has(n));
}

/**
 * הטלת רשימת הפ"מים לעמדה אחת.
 *
 * `myPresetIds` - העמדה עצמה + עמדות שהיא מכסה באיחוד (הן אותו מפעיל, ולכן
 * העברה שיצאה מהן היא **שלי**).
 * `transfers` - ההעברות הפתוחות (`/api/transfers/pending-all`). חסרה העברה ברשימה
 * (סבב שעוד לא חזר)? הפ"מ נשאר כפי שהוא - לא "מוחזר" לעמדה בניחוש.
 */
export function projectStripsForStation(
  rows: TransferViewStrip[],
  myPresetIds: (number | string | null | undefined)[],
  myPresetNames: (string | null | undefined)[],
  transfers: PendingTransferParty[],
): TransferViewStrip[] {
  const myIds = new Set<number>(myPresetIds.map(num).filter((v): v is number => v != null));
  const myNames = new Set<string>(myPresetNames.filter((n): n is string => !!n));
  if (myIds.size === 0 || !Array.isArray(rows)) return rows;

  const byStrip = new Map<string, PendingTransferParty>();
  for (const t of transfers || []) byStrip.set(String(t.strip_id).replace(/^s/, ''), t);

  return rows.map(s => {
    if (s.status !== 'pending_transfer') return s;
    // אני היעד - זה פ"מ שנמצא בדרך אליי, והכרטיס הנכנס הוא הדרך לקבל אותו
    if (myIds.has(Number(s.workstation_preset_id))) return s;
    const t = byStrip.get(String(s.id).replace(/^s/, ''));
    if (!t) return s;
    const sender = num(t.from_preset_id ?? t.from_workstation_id);
    const dest = num(t.to_preset_id ?? t.to_workstation_id);
    if (sender != null && myIds.has(sender)) return s;   // אני השולח - יצא מהדסק שלי
    if (dest != null && myIds.has(dest)) return s;        // אני המקבל
    if (!heldByMe(s, myIds, myNames)) return s;           // בכלל לא אצלי

    // מחזיק ואינו צד: אצלי הפ"מ פשוט נמצא, כאילו לא נשלח כלל
    return {
      ...s,
      status: s.on_map && !s.in_table ? 'active' : 'queued',
      workstation_preset_id: [...myIds][0],
      raw_status: s.status,
      raw_workstation_preset_id: s.workstation_preset_id ?? null,
    };
  });
}
