/**
 * **כניסה לעמדה מאופסת - כפתורי האמצעים בדסק.** כל כפתור חוזר למצב הראשון,
 * וטקסט חופשי מתרוקן. מחזיר את אותו אובייקט כשאין מה לאפס (בלי כתיבה מיותרת).
 */
export function resetButtonsState(state) {
  if (!state || !Array.isArray(state.buttons)) return state;
  let changed = false;
  const buttons = state.buttons.map(b => {
    const next = { ...b, activeStateIdx: 0, ...(b.allowFreeText ? { freeText: '' } : {}) };
    if (next.activeStateIdx !== b.activeStateIdx || next.freeText !== b.freeText) changed = true;
    return next;
  });
  return changed ? { ...state, buttons } : state;
}

/** שירותי הדסק שהעמדה משתפת עם עמדות אחרות - לא מתאפסים (אינם רק שלה) */
export function sharedServiceIds(sharing) {
  const out = new Set();
  for (const [k, v] of Object.entries(sharing && typeof sharing === 'object' ? sharing : {})) {
    if (Array.isArray(v) && v.length > 0) out.add(Number(k));
  }
  return out;
}
