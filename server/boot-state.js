// מצב העלייה של השרת - משותף בין server.js (שמריץ את שרשרת ה-DB) לבין
// route הבריאות ב-app.js (שמדווח עליה). מודול נפרד כדי להימנע מתלות מעגלית.
//
// למה זה קיים: השרת מאזין לפורט **לפני** שה-DB עולה (initDb/seedDb/סנכרון
// סכמות התרגול לוקחים עשרות שניות עד דקות מול Neon). בלי זה, פלטפורמת
// אירוח (Railway/Docker) רואה קונטיינר חי בלי מאזין ומחזירה 502 בלי הסבר.

const state = {
  phase: 'booting', // booting | ready | failed
  error: null,      // הודעת השגיאה כשהעלייה נכשלה
  startedAt: Date.now(),
  readyAt: null,
};

export function markReady() {
  state.phase = 'ready';
  state.error = null;
  state.readyAt = Date.now();
}

export function markFailed(err) {
  state.phase = 'failed';
  state.error = err?.message || String(err);
}

export function bootState() {
  return {
    phase: state.phase,
    error: state.error,
    uptimeMs: Date.now() - state.startedAt,
    bootMs: state.readyAt ? state.readyAt - state.startedAt : null,
  };
}
