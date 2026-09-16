// הקלטת פעולות במסך - צד הכתיבה לדיסק. אפיון: SCREEN_RECORDING_SPEC.md
//
// חלוקת העבודה בין התהליכים:
//   העמדה (renderer) - מצלמת את המסך (getDisplayMedia) ומקודדת (MediaRecorder).
//                      רק שם יש MediaRecorder; בתהליך הראשי אין.
//   התהליך הראשי (כאן) - **מחזיק את הנתיב** ואת הקובץ. הוא שואב את התצורה
//                      מהשרת בעצמו, מאמת את הנתיב, בונה את שם הקובץ, כותב את
//                      הנתחים ומוחק לפי תקופת שמירה.
//
// ⚠️ **העמוד לעולם אינו מוסר נתיב** (הכלל שבראש electron-preload.cjs). הוא
// מוסר מזהה בסיס ואת האסימון שלו, והתצורה נשאבת מ-/api/screen-recording/config.
// לכן עמוד עוין שיושב על ה-origin שלנו יכול, במקרה הגרוע, להקליט לתיקייה
// שהניהול הטכני הגדיר - ולא לכתוב לכל מקום בדיסק.
//
// שם הבסיס בשם הקובץ מגיע **מתשובת השרת** ולא מהעמוד, ושם העמדה עובר
// sanitizeFileToken. שם קובץ נבנה כאן בלבד, ולכן אין דרך להזליג בו מפריד נתיב.

const fs = require('fs');
const path = require('path');

/** מודול הלוגיקה המשותף הוא ESM; ב-CJS טוענים אותו פעם אחת ב-dynamic import. */
let sharedPromise = null;
function shared() {
  if (!sharedPromise) sharedPromise = import('../shared/screenRecording.js');
  return sharedPromise;
}

/** סריקת מחיקה אחת לשעה. אין טעם בתכיפות גבוהה - הרזולוציה היא ימים. */
const SWEEP_MS = 60 * 60 * 1000;
/** קריאת התצורה מהשרת לא תתלה את תחילת ההקלטה יותר מזה */
const CONFIG_TIMEOUT_MS = 8000;

/**
 * @param {object} deps
 * @param {() => string} deps.apiBase כתובת הבסיס של ה-API (למשל http://localhost:3001)
 */
function createScreenRecorder({ apiBase }) {
  /** @type {null | { dir: string, stream: import('fs').WriteStream, file: string, cfg: any, baseName: string, presetName: string, ext: string, manual: boolean, keep: boolean }} */
  let active = null;
  /** הקובץ שנסגר לפני הנוכחי - "שמור את הקטע הזה" לוקח גם אותו, כי המפעיל
   *  לוחץ **אחרי** שהאירוע קרה. */
  let previousFile = null;
  let sweepTimer = null;
  let writeError = null;

  async function fetchConfig(baseId, token) {
    const url = new URL(`/api/screen-recording/config/${encodeURIComponent(baseId)}`, apiBase());
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`config ${res.status}`);
    return res.json();
  }

  /** מוחק קבצים שעברו את תקופת השמירה. לא נוגע בקובץ שאינו שלנו ולא ב-keep/. */
  async function sweep(dir, retentionDays) {
    try {
      const { expiredRecordingFiles } = await shared();
      const names = await fs.promises.readdir(dir).catch(() => []);
      const expired = expiredRecordingFiles(names, { now: new Date(), retentionDays });
      for (const name of expired) {
        // הקובץ שכרגע נכתב אליו לא נמחק, גם אם התצורה אבסורדית (retention=0 חסום
        // כבר בלוגיקה המשותפת, וזו רשת הביטחון השנייה)
        if (active && active.file === name) continue;
        await fs.promises.unlink(path.join(dir, name)).catch(() => {});
      }
      if (expired.length) console.log(`[rec] נמחקו ${expired.length} קטעים שעברו ${retentionDays} ימים`);
    } catch (e) {
      console.error('[rec] סריקת מחיקה נכשלה:', e.message);
    }
  }

  function scheduleSweep(dir, retentionDays) {
    clearInterval(sweepTimer);
    sweepTimer = setInterval(() => { void sweep(dir, retentionDays); }, SWEEP_MS);
    // `unref` כדי שהטיימר לא יחזיק את התהליך בחיים ביציאה
    if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
    void sweep(dir, retentionDays);
  }

  /**
   * פותח קובץ קטע חדש. מניח שהתיקייה קיימת ושהתצורה אומתה.
   *
   * שתי נקודות שנראות טכניות ואינן:
   *   1. **התנגשות שם באותה שנייה.** חותמת הזמן בשם היא ברזולוציית שנייה,
   *      והחלפת קטע (או עצירה והתחלה ידנית) יכולה ליפול באותה שנייה. עם
   *      `flags:'w'` הקטע הקודם היה נדרס בשקט, ולכן מקדמים את החותמת בשנייה
   *      עד שהשם פנוי, ופותחים ב-`wx` (נכשל אם קיים) כרשת ביטחון.
   *   2. **המתנה ל-open.** דיסק רשת שאינו נגיש נכשל רק כאן; בלי ההמתנה
   *      ההקלטה הייתה "מתחילה" בהצלחה והמפעיל היה מגלה את הכשל בדיעבד.
   */
  async function openSegment({ dir, cfg, baseName, presetName, ext, manual }) {
    const { recordingFileName } = await shared();
    let startedAt = new Date();
    let file = recordingFileName({ baseName, presetName, startedAt, ext, manual });
    for (let i = 0; i < 120 && fs.existsSync(path.join(dir, file)); i++) {
      startedAt = new Date(startedAt.getTime() + 1000);
      file = recordingFileName({ baseName, presetName, startedAt, ext, manual });
    }
    const full = path.join(dir, file);
    const stream = fs.createWriteStream(full, { flags: 'wx' });
    await new Promise((resolve, reject) => {
      stream.once('open', resolve);
      stream.once('error', reject);
    });
    stream.on('error', err => {
      // דיסק רשת שנפל באמצע משמרת - הסיבה נמסרת לעמדה, שתציג אותה למפעיל
      writeError = err.message;
      console.error('[rec] כתיבה נכשלה:', err.message);
    });
    active = { dir, stream, file, cfg, baseName, presetName, ext, manual, keep: false };
    writeError = null;
    console.log(`[rec] קטע חדש: ${full}`);
    return file;
  }

  /** סוגר את הקטע הנוכחי, ומעביר ל-keep/ אם סומן */
  async function closeSegment() {
    if (!active) return;
    const { KEEP_DIR } = await shared();
    const { stream, dir, file, keep } = active;
    active = null;
    await new Promise(resolve => stream.end(resolve));
    if (keep) {
      const keepDir = path.join(dir, KEEP_DIR);
      await fs.promises.mkdir(keepDir, { recursive: true }).catch(() => {});
      await fs.promises.rename(path.join(dir, file), path.join(keepDir, file)).catch(err =>
        console.error('[rec] העברה ל-keep נכשלה:', err.message));
      previousFile = null;
    } else {
      previousFile = { dir, file };
    }
  }

  return {
    /** האם בכלל אפשר להקליט בעמדה הזו (קיים תהליך Electron) */
    status() {
      return { available: true, recording: Boolean(active), file: active?.file || null, writeError };
    },

    /**
     * מתחיל הקלטה: שואב תצורה, מאמת נתיב, יוצר תיקייה ופותח קטע ראשון.
     * מחזיר לעמדה את פרמטרי הקידוד - כדי שלא יהיו שני עותקים של המדיניות.
     */
    async start({ baseId, presetName, token, ext, manual } = {}) {
      const { recordingBlockReason, recordingSegmentMs, recordingBitrate, isSafeRecordingPath } = await shared();
      if (active) return { ok: false, reason: 'alreadyRecording' };
      if (!baseId) return { ok: false, reason: 'noBase' };

      let cfg;
      try {
        cfg = await fetchConfig(baseId, token);
      } catch (e) {
        console.error('[rec] קריאת התצורה נכשלה:', e.message);
        return { ok: false, reason: 'configUnavailable' };
      }

      // הקלטה ידנית רצה גם כשההקלטה האוטומטית כבויה בבסיס - מה שנדרש הוא הנתיב
      const reason = recordingBlockReason(cfg);
      if (reason && !(manual && reason === 'disabled')) return { ok: false, reason };
      if (!isSafeRecordingPath(cfg.path)) return { ok: false, reason: 'badPath' };

      const dir = cfg.path;
      try {
        await fs.promises.mkdir(dir, { recursive: true });
      } catch (e) {
        console.error('[rec] יצירת תיקיית היעד נכשלה:', e.message);
        return { ok: false, reason: 'pathUnreachable' };
      }

      let file;
      try {
        file = await openSegment({ dir, cfg, baseName: cfg.base_name, presetName, ext, manual: Boolean(manual) });
      } catch (e) {
        console.error('[rec] פתיחת קובץ הקטע נכשלה:', e.message);
        return { ok: false, reason: 'pathUnreachable', detail: e.message };
      }
      scheduleSweep(dir, cfg.retentionDays);
      return {
        ok: true,
        file,
        segmentMs: recordingSegmentMs(cfg),
        fps: cfg.fps,
        bitrate: recordingBitrate(cfg),
        retentionDays: cfg.retentionDays,
      };
    },

    /** נתח מקודד מה-MediaRecorder. נכתב כמו שהוא - הקידוד כבר נעשה בעמדה. */
    async chunk(data) {
      if (!active) return { ok: false, reason: 'notRecording' };
      if (!data || !data.byteLength) return { ok: true };
      const buf = Buffer.from(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength);
      const ok = await new Promise(resolve => {
        active.stream.write(buf, err => resolve(!err));
      });
      return ok ? { ok: true } : { ok: false, reason: 'writeFailed', detail: writeError };
    },

    /**
     * מחליף קטע: סוגר את הקובץ הנוכחי ופותח חדש.
     * למה לא פשוט להמשיך לכתוב לקובץ נוסף: הכותרת (header) של WebM/MP4 יושבת
     * בנתח הראשון של המקליט. קובץ שנפתח באמצע זרם הוא קובץ שלא ייפתח בשום נגן,
     * ולכן החלפת קטע היא **מקליט חדש** בעמדה, וקובץ חדש כאן.
     */
    async rotate() {
      if (!active) return { ok: false, reason: 'notRecording' };
      const { dir, cfg, baseName, presetName, ext, manual } = active;
      await closeSegment();
      try {
        const file = await openSegment({ dir, cfg, baseName, presetName, ext, manual });
        return { ok: true, file };
      } catch (e) {
        console.error('[rec] החלפת קטע נכשלה:', e.message);
        return { ok: false, reason: 'pathUnreachable', detail: e.message };
      }
    },

    /** "שמור את הקטע הזה" - הנוכחי וגם הקודם עוברים ל-keep/ ולא יימחקו */
    async keep() {
      const { KEEP_DIR } = await shared();
      let kept = 0;
      if (active) { active.keep = true; kept++; }
      if (previousFile) {
        const keepDir = path.join(previousFile.dir, KEEP_DIR);
        await fs.promises.mkdir(keepDir, { recursive: true }).catch(() => {});
        const moved = await fs.promises
          .rename(path.join(previousFile.dir, previousFile.file), path.join(keepDir, previousFile.file))
          .then(() => true).catch(() => false);
        if (moved) { kept++; previousFile = null; }
      }
      return { ok: kept > 0, kept };
    },

    /** עוצר ומשלים את הקובץ. נקרא גם ביציאה מהאפליקציה ובנפילת העמוד. */
    async stop() {
      clearInterval(sweepTimer);
      sweepTimer = null;
      if (!active) return { ok: true, recording: false };
      const file = active.file;
      await closeSegment();
      console.log(`[rec] ההקלטה נעצרה: ${file}`);
      return { ok: true, recording: false, file };
    },
  };
}

module.exports = { createScreenRecorder };
