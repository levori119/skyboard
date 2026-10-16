// סגירת תהליך המאגר המקומי ביציאה מהעמדה.
//
// ⚠️ **לא `child.kill()` ישר.** ב-Windows זה TerminateProcess: PGlite לא מגיע
// ל-close(), ותיקיית המאגר נשארת באמצע כתיבה. בעלייה הבאה PGlite קרס ב-
// `Aborted()`, השרת המקומי לא עלה - ובנתק לא היה מאגר ולא העתק מיראז'
// (2026-10-16). קודם מבקשים סגירה דרך IPC (server/local.js מטפל ב-'shutdown'),
// ורק תהליך שלא יצא בזמן נהרג.

/** סגירת PGlite על מאגר של ~100MB לוקחת שנייה-שתיים; זו תקרה, לא המתנה. */
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * @returns {Promise<'graceful'|'killed'|'already_exited'>}
 */
function stopLocalDbChild(child, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!child || child.exitCode !== null) return Promise.resolve('already_exited');

  return new Promise(resolve => {
    let done = false;
    let timer = null;
    const finish = how => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(how);
    };
    // finish לפני kill: ה-'exit' שההריגה מעוררת היה מסמן 'graceful'
    const kill = () => {
      finish('killed');
      try { child.kill(); } catch { /* כבר מת */ }
    };

    if (!child.connected) { kill(); return; }

    child.once('exit', () => finish('graceful'));
    timer = setTimeout(() => {
      console.error(`[station] המאגר המקומי לא נסגר תוך ${timeoutMs}ms - נהרג`);
      kill();
    }, timeoutMs);
    try {
      child.send({ type: 'shutdown' });
    } catch {
      kill();
    }
  });
}

module.exports = { stopLocalDbChild, DEFAULT_TIMEOUT_MS };
