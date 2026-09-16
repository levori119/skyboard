// הקלטת פעולות במסך - **ליבת הכתיבה לדיסק**. אפיון: SCREEN_RECORDING_SPEC.md
//
// ⚠️ **מודול Node בלבד** - הוא מייבא `fs`. אין לייבא אותו מהלקוח; שם חי
// `shared/screenRecording.js` (לוגיקה טהורה, בלי fs). קובץ זה יושב ב-shared
// כי **שני** צדדים כותבים לדיסק, וחייבים לכתוב בדיוק אותו דבר:
//
//   עמדת Electron - תהליך ראשי כותב ישירות ל-PATH של הבסיס
//                   (electron/screenRecorder.cjs, dynamic import)
//   דפדפן         - הנתחים עולים לשרת, והשרת כותב לאותו PATH
//                   (server/routes/screenRecording.js)
//
// שני עותקים של הלוגיקה הזו היו נפרדים מהר: שם קובץ שנבנה אחרת, keep שעובד
// בצד אחד, ומחיקה אוטומטית שבצד השני תופסת גם קבצים זרים. ההבדל היחיד בין
// הצדדים הוא **מאיפה באה התצורה**, וזה מוזרק כ-`loadConfig`.

import fs from 'fs';
import path from 'path';
import {
  KEEP_DIR, recordingFileName, expiredRecordingFiles, recordingPathRoot,
  recordingBlockReason, recordingSegmentMs, recordingBitrate, isSafeRecordingPath,
} from './screenRecording.js';

/** סריקת מחיקה אחת לשעה. אין טעם בתכיפות גבוהה - הרזולוציה היא ימים. */
const SWEEP_MS = 60 * 60 * 1000;

/**
 * מקליט אחד = קובץ אחד פתוח בכל רגע.
 *
 * @param {object} deps
 * @param {(args: {baseId: number, token?: string}) => Promise<object>} deps.loadConfig
 *        מחזיר את תצורת ההקלטה של הבסיס, כולל `base_name` ו-`path`.
 *        זורק = "לא הצלחנו לקרוא תצורה" (`configUnavailable`).
 * @param {(msg: string) => void} [deps.log]
 */
export function createRecordingWriter({ loadConfig, log = () => {} }) {
  /** @type {null | {dir:string, stream:import('fs').WriteStream, file:string, cfg:object, baseName:string, presetName:string, ext:string, manual:boolean, keep:boolean}} */
  let active = null;
  /** הקובץ שנסגר לפני הנוכחי - "שמור את הקטע הזה" לוקח גם אותו, כי המפעיל
   *  לוחץ **אחרי** שהאירוע קרה. */
  let previousFile = null;
  let sweepTimer = null;
  let writeError = null;

  /** מוחק קבצים שעברו את תקופת השמירה. לא נוגע בקובץ שאינו שלנו ולא ב-keep/. */
  async function sweep(dir, retentionDays) {
    try {
      const names = await fs.promises.readdir(dir).catch(() => []);
      const expired = expiredRecordingFiles(names, { now: new Date(), retentionDays });
      for (const name of expired) {
        // הקובץ שכרגע נכתב אליו לא נמחק (retention=0 חסום כבר בלוגיקה
        // המשותפת, וזו רשת הביטחון השנייה)
        if (active && active.file === name) continue;
        await fs.promises.unlink(path.join(dir, name)).catch(() => {});
      }
      if (expired.length) log(`נמחקו ${expired.length} קטעים שעברו ${retentionDays} ימים`);
    } catch (e) {
      log(`סריקת מחיקה נכשלה: ${e.message}`);
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
      log(`כתיבה נכשלה: ${err.message}`);
    });
    active = { dir, stream, file, cfg, baseName, presetName, ext, manual, keep: false };
    writeError = null;
    log(`קטע חדש: ${full}`);
    return file;
  }

  /** סוגר את הקטע הנוכחי, ומעביר ל-keep/ אם סומן */
  async function closeSegment() {
    if (!active) return;
    const { stream, dir, file, keep } = active;
    active = null;
    await new Promise(resolve => stream.end(resolve));
    if (keep) {
      const keepDir = path.join(dir, KEEP_DIR);
      await fs.promises.mkdir(keepDir, { recursive: true }).catch(() => {});
      await fs.promises.rename(path.join(dir, file), path.join(keepDir, file))
        .catch(err => log(`העברה ל-keep נכשלה: ${err.message}`));
      previousFile = null;
    } else {
      previousFile = { dir, file };
    }
  }

  return {
    /** מצב המקליט - `available` תמיד true; מי שאין לו מקליט לא בונה אותו */
    status() {
      return { available: true, recording: Boolean(active), file: active?.file || null, writeError };
    },

    /**
     * מתחיל הקלטה: טוען תצורה, מאמת נתיב, יוצר תיקייה ופותח קטע ראשון.
     * מחזיר את פרמטרי הקידוד - כדי שלא יהיו שני עותקים של המדיניות.
     */
    async start({ baseId, presetName, token, ext, manual } = {}) {
      if (active) return { ok: false, reason: 'alreadyRecording' };
      if (!baseId) return { ok: false, reason: 'noBase' };

      let cfg;
      try {
        cfg = await loadConfig({ baseId, token });
      } catch (e) {
        log(`קריאת התצורה נכשלה: ${e.message}`);
        return { ok: false, reason: e.reason || 'configUnavailable' };
      }
      if (!cfg) return { ok: false, reason: 'baseNotFound' };

      // הקלטה ידנית רצה גם כשההקלטה האוטומטית כבויה בבסיס - מה שנדרש הוא הנתיב
      const reason = recordingBlockReason(cfg);
      if (reason && !(manual && reason === 'disabled')) return { ok: false, reason };
      if (!isSafeRecordingPath(cfg.path)) return { ok: false, reason: 'badPath' };

      const dir = cfg.path;

      // **שורש הנתיב נבדק לפני mkdir**, כדי שהסיבה תהיה נכונה (תקלה
      // מהשדה, 2026-09-16): `mkdir` על `D:\SKYKING\REC` במכונה בלי כונן D:
      // מחזיר `ENOENT: ... mkdir '\\?'` - הודעה שאינה מזכירה אפילו את הכונן,
      // והמפעיל קיבל "אין הרשאה" וחיפש הרשאות במקום כונן קיים.
      const root = recordingPathRoot(dir);
      if (root) {
        try {
          await fs.promises.stat(root);
        } catch (e) {
          log(`שורש הנתיב אינו קיים: ${root} (${e.code})`);
          return { ok: false, reason: 'pathUnreachable', detail: `ENOENT: root not found ${root}` };
        }
      }

      try {
        await fs.promises.mkdir(dir, { recursive: true });
      } catch (e) {
        log(`יצירת תיקיית היעד נכשלה: ${e.message}`);
        return { ok: false, reason: 'pathUnreachable', detail: e.message };
      }

      let file;
      try {
        file = await openSegment({
          dir, cfg, baseName: cfg.base_name, presetName,
          ext: ext === 'mp4' ? 'mp4' : 'webm', manual: Boolean(manual),
        });
      } catch (e) {
        log(`פתיחת קובץ הקטע נכשלה: ${e.message}`);
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

    /** נתח מקודד. נכתב כמו שהוא - הקידוד כבר נעשה בעמדה. */
    async chunk(data) {
      if (!active) return { ok: false, reason: 'notRecording' };
      if (!data || !data.byteLength) return { ok: true };
      const buf = Buffer.isBuffer(data)
        ? data
        : Buffer.from(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength);
      const ok = await new Promise(resolve => {
        active.stream.write(buf, err => resolve(!err));
      });
      return ok ? { ok: true } : { ok: false, reason: 'writeFailed', detail: writeError };
    },

    /**
     * מחליף קטע: סוגר את הקובץ הנוכחי ופותח חדש.
     * למה לא להמשיך לכתוב לקובץ נוסף: הכותרת (header) של WebM/MP4 יושבת בנתח
     * הראשון של המקליט. קובץ שנפתח באמצע זרם לא ייפתח בשום נגן, ולכן החלפת
     * קטע היא **מקליט חדש** בעמדה וקובץ חדש כאן.
     */
    async rotate() {
      if (!active) return { ok: false, reason: 'notRecording' };
      const { dir, cfg, baseName, presetName, ext, manual } = active;
      await closeSegment();
      try {
        const file = await openSegment({ dir, cfg, baseName, presetName, ext, manual });
        return { ok: true, file };
      } catch (e) {
        log(`החלפת קטע נכשלה: ${e.message}`);
        return { ok: false, reason: 'pathUnreachable', detail: e.message };
      }
    },

    /** "שמור את הקטע הזה" - הנוכחי וגם הקודם עוברים ל-keep/ ולא יימחקו */
    async keep() {
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

    /** עוצר ומשלים את הקובץ. נקרא גם ביציאה, בנפילת העמוד ובנטישת מקטע. */
    async stop() {
      clearInterval(sweepTimer);
      sweepTimer = null;
      if (!active) return { ok: true, recording: false };
      const file = active.file;
      await closeSegment();
      log(`ההקלטה נעצרה: ${file}`);
      return { ok: true, recording: false, file };
    },
  };
}
