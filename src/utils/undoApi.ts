// קריאות ה-API של הביטול (CTRL+Z), וניסוח ההודעה שהמפעיל רואה.
//
// **השרת הוא מקור האמת למחסנית.** הלקוח אינו מחזיק רשימה משלו: הוא שואל מה
// הפעולה הבאה לביטול ברגע הלחיצה. מחסנית מקומית הייתה מתפצלת מהאמת ברגע
// שבקשה נפלה, שהעמדה רועננה או שפעולה פגה — והמפעיל היה רואה אפשרות לבטל
// משהו שכבר איננו. ראה UNDO_SPEC.md §5 מקרים 3, 12, 16.

import { API_URL } from '../config';
import { tr } from '../i18n/tr';

export type ConflictType = 'changed' | 'missing' | 'exists';

export interface UndoConflict {
  type: ConflictType;
  table: string;
  journalId: number;
}

export interface UndoAction {
  id: string;
  createdAt: string;
  labelKey: string;
  labelParams: Record<string, unknown>;
  rowCount: number;
  undoable: boolean;
  blockReason: string | null;
}

export interface UndoNext {
  action: UndoAction | null;
  conflicts?: UndoConflict[];
  tables?: string[];
  blocked?: { table: string; reason: string };
}

/** הפעולה הבאה לביטול + בדיקת התנגשות, בסיבוב אחד. */
export async function fetchNextUndo(): Promise<UndoNext> {
  const r = await fetch(`${API_URL}/undo/next`);
  if (!r.ok) throw new Error(`undo/next ${r.status}`);
  return r.json();
}

export interface UndoResult {
  ok: boolean;
  /** התנגשויות שחזרו כשלא נשלח force — הפעולה **לא** בוצעה */
  conflicts?: UndoConflict[];
  error?: string;
  reverted?: number;
}

/** מבצע את הביטול. `force` נדרש כשיש התנגשות והמפעיל בחר לדרוס. */
export async function applyUndo(id: string, force = false): Promise<UndoResult> {
  const r = await fetch(`${API_URL}/undo/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force }),
  });
  const body = await r.json().catch(() => ({}));
  if (r.ok) return { ok: true, ...body };
  return { ok: false, ...body };
}

/** התווית של הפעולה. מפתח שאין לו תרגום נופל לתיאור גנרי, לא למפתח גולמי. */
export function undoLabel(action: UndoAction): string {
  const text = tr(action.labelKey, action.labelParams);
  return text === action.labelKey ? tr('undo.changeEntity', action.labelParams) : text;
}

/** "לפני 12 שניות" / "לפני 2 דקות" — הגיל קובע אם הפעולה עוד בתוקף. */
export function relativeAge(iso: string, now: number = Date.now()): string {
  const secs = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (secs < 60) return tr('undo.agoSeconds', { count: secs });
  return tr('undo.agoMinutes', { count: Math.floor(secs / 60) });
}
