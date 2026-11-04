/**
 * **כניסה לעמדה מאופסת** - דגל חד-פעמי מטופס חברי העמדה אל הדשבורד.
 *
 * יושב ב-sessionStorage ולא ב-session השמור: ה-session נשמר ונטען מחדש בכל
 * רענון, ודגל שיושב בו היה מאפס את העמדה שוב בכל F5 באמצע משמרת. כאן הוא
 * נצרך פעם אחת - הדשבורד קורא ומוחק.
 */
const key = (presetId: number | string) => `sk.resetOnEntry.${presetId}`;

export function markResetOnEntry(presetId: number | string): void {
  answered.delete(key(presetId));
  try { sessionStorage.setItem(key(presetId), '1'); } catch { /* אחסון חסום - הכניסה רגילה */ }
}

// התשובה נשמרת לטעינת הדף: initializer של useState רץ פעמיים ב-StrictMode,
// והקריאה השנייה הייתה מוצאת את הדגל כבר מחוק
const answered = new Map<string, boolean>();

/** true פעם אחת לכל סימון - והדגל נמחק (רענון אחר כך לא מאפס שוב) */
export function consumeResetOnEntry(presetId: number | string | null | undefined): boolean {
  if (presetId == null) return false;
  const k = key(presetId);
  if (answered.has(k)) return answered.get(k)!;
  let on = false;
  try {
    on = sessionStorage.getItem(k) === '1';
    if (on) sessionStorage.removeItem(k);
  } catch { on = false; }
  answered.set(k, on);
  return on;
}

/** לבדיקות בלבד */
export function _resetAnswered(): void { answered.clear(); }

/** מה מתאפס בכפתורי אמצעים: כל כפתור חוזר למצב הראשון, וטקסט חופשי מתרוקן */
export function resetButtonsState<T extends { buttons?: any[] }>(state: T): T {
  if (!state || !Array.isArray(state.buttons)) return state;
  let changed = false;
  const buttons = state.buttons.map(b => {
    const next = { ...b, activeStateIdx: 0, ...(b.allowFreeText ? { freeText: '' } : {}) };
    if (next.activeStateIdx !== b.activeStateIdx || next.freeText !== b.freeText) changed = true;
    return next;
  });
  return changed ? { ...state, buttons } : state;
}
