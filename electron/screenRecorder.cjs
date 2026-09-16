// הקלטת פעולות במסך - צד העמדה (Electron). אפיון: SCREEN_RECORDING_SPEC.md
//
// חלוקת העבודה בין התהליכים:
//   העמדה (renderer) - מצלמת את המסך (getDisplayMedia) ומקודדת (MediaRecorder).
//                      רק שם יש MediaRecorder; בתהליך הראשי אין.
//   התהליך הראשי (כאן) - **מחזיק את הנתיב** ואת הקובץ.
//
// **הכתיבה עצמה אינה כאן** אלא ב-[`shared/recordingWriter.js`](../shared/recordingWriter.js),
// המשותף לעמדת Electron ולשרת (שכותב כשההקלטה מגיעה מדפדפן). מה שנשאר כאן
// הוא הדבר היחיד שאינו משותף: **מאיפה באה התצורה** - כאן מ-HTTP עם האסימון
// של העמדה, ובשרת קריאה ישירה ל-DB.
//
// ⚠️ **העמוד לעולם אינו מוסר נתיב** (הכלל שבראש electron-preload.cjs). הוא
// מוסר מזהה בסיס ואת האסימון שלו, והתצורה נשאבת מ-/api/screen-recording/config.
// לכן עמוד עוין שיושב על ה-origin שלנו יכול, במקרה הגרוע, להקליט לתיקייה
// שהניהול הטכני הגדיר - ולא לכתוב לכל מקום בדיסק.
//
// שם הבסיס בשם הקובץ מגיע **מתשובת השרת** ולא מהעמוד.

/** הליבה היא ESM; ב-CJS טוענים אותה פעם אחת ב-dynamic import. */
let writerModule = null;
function core() {
  if (!writerModule) writerModule = import('../shared/recordingWriter.js');
  return writerModule;
}

/** קריאת התצורה מהשרת לא תתלה את תחילת ההקלטה יותר מזה */
const CONFIG_TIMEOUT_MS = 8000;

/**
 * @param {object} deps
 * @param {() => string} deps.apiBase כתובת הבסיס של ה-API (למשל http://localhost:3001)
 */
function createScreenRecorder({ apiBase }) {
  /** @type {null | Promise<any>} */
  let writerPromise = null;

  function writer() {
    if (!writerPromise) {
      writerPromise = core().then(({ createRecordingWriter }) => createRecordingWriter({
        log: msg => console.log(`[rec] ${msg}`),
        loadConfig: async ({ baseId, token }) => {
          const url = new URL(`/api/screen-recording/config/${encodeURIComponent(baseId)}`, apiBase());
          const res = await fetch(url, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS),
          });
          if (!res.ok) throw new Error(`config ${res.status}`);
          return res.json();
        },
      }));
    }
    return writerPromise;
  }

  return {
    /** האם בכלל אפשר להקליט בעמדה הזו (קיים תהליך Electron) */
    async status() {
      // לפני ההקלטה הראשונה אין עדיין מקליט, ואין טעם לבנות אותו רק כדי לדווח
      if (!writerPromise) return { available: true, recording: false, file: null, writeError: null };
      return (await writerPromise).status();
    },
    async start(args) { return (await writer()).start(args); },
    async chunk(data) { return (await writer()).chunk(data); },
    async rotate() { return (await writer()).rotate(); },
    async keep() { return (await writer()).keep(); },
    async stop() { return (await writer()).stop(); },
  };
}

module.exports = { createScreenRecorder };
