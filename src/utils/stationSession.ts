// משמרת עמדה — זמן כניסה וזמן סיום, נרשמים **תמיד** ובלי קשר לתחקיר.
// זה מקור הנתונים למסך הכשירויות (כמה שעות כל איש צוות ישב על איזו עמדה).
//
// מקטע נסגר בכל אירוע שמשנה מי יושב על העמדה — החלפת משתמש, עדכון חברי העמדה
// או יציאה — ונפתח מיד מקטע חדש (למעט יציאה). כך השעות מדויקות לכל אדם ולא
// מיוחסות כולן למי שישב בסוף המשמרת.
//
// כל הקריאות "שקטות": כשל רשת לא חוסם כניסה לעמדה ולא יציאה ממנה. עמדה
// תפעולית לא נעצרת בגלל רישום שעות.
import { API_URL } from '../config';
import type { CrewMember } from '../types';

export type SessionEndReason = 'logout' | 'crew_swap' | 'crew_update' | 'reopen';

export interface OpenSessionArgs {
  presetId: number;
  presetName: string;
  crewMember?: CrewMember | null;
  /** חברי העמדה כפי שהם ברגע פתיחת המקטע */
  roles?: Record<string, unknown>;
  /** מדוע נסגר המקטע הקודם (אם היה) */
  closeReason?: SessionEndReason;
}

/** פותח מקטע חדש. השרת סוגר קודם מקטע פתוח קיים לאותה עמדה. */
export async function openStationSession(args: OpenSessionArgs): Promise<void> {
  if (!args.presetId) return;
  try {
    await fetch(`${API_URL}/station-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preset_id: args.presetId,
        preset_name: args.presetName || '',
        crew_member_id: args.crewMember?.id ?? null,
        crew_name: args.crewMember?.name || '',
        personal_id: args.crewMember?.personal_id || '',
        roles: args.roles || {},
        close_reason: args.closeReason || 'reopen',
      }),
    });
  } catch { /* רישום שעות לא חוסם עמדה */ }
}

/**
 * **דופק המשמרת** - "אני עדיין כאן".
 *
 * מקטע פתוח לבדו אינו אומר שיושב אדם על העמדה: הוא נסגר רק ביציאה מפורשת,
 * ומי שסגר לשונית או כיבה מסך נשאר "מחובר" לנצח (בפרודקשן נמצאו מקטעים
 * פתוחים בני 11 יום). הדופק הוא מה שהופך את השאלה "מי מאויש עכשיו" לתשובה.
 *
 * שקט ככל שאר הקריאות כאן: כשל רשת אינו נוגע בעמדה.
 */
export async function heartbeatStationSession(presetId: number | null | undefined): Promise<void> {
  if (!presetId) return;
  try {
    await fetch(`${API_URL}/station-sessions/heartbeat`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset_id: presetId }),
    });
  } catch { /* דופק שהוחמץ אינו אירוע */ }
}

/**
 * סוגר את המקטע הפתוח של העמדה. ביציאה משתמשים ב-`keepalive` — הבקשה
 * חייבת לשרוד את פריקת הדף שמגיעה מיד אחריה.
 */
export async function closeStationSession(
  presetId: number | null | undefined,
  reason: SessionEndReason = 'logout',
): Promise<void> {
  if (!presetId) return;
  try {
    await fetch(`${API_URL}/station-sessions/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset_id: presetId, reason }),
      keepalive: true,
    });
  } catch { /* יציאה לא נחסמת */ }
}
