// הקלטת פעולות במסך - צד העמדה. אפיון: SCREEN_RECORDING_SPEC.md
//
// כאן מתבצעים הצילום והקידוד, כי `MediaRecorder` קיים רק בעמוד. הכתיבה לדיסק
// נעשית בתהליך ה-Electron (electron/screenRecorder.cjs), שאליו נשלחים הנתחים.
//
// שלוש נקודות שחוזרות ונשברות במימושי הקלטה, ולכן הן מפורשות כאן:
//
// 1. **החלפת קטע היא מקליט חדש.** הכותרת של WebM/MP4 יושבת בנתח הראשון של
//    ה-MediaRecorder. המשך כתיבה לקובץ שני בלי כותרת = קובץ שלא ייפתח בשום
//    נגן. לכן בסוף כל קטע המקליט נעצר ונפתח חדש, ויש פער של עשרות אלפיות
//    בין הקטעים. זה מכוון, ומתועד באפיון.
// 2. **הזרם חי מעבר לקטע.** ה-MediaStream של המסך נפתח פעם אחת ומשמש את כל
//    הקטעים. פתיחה מחדש בכל קטע הייתה מהבהבת חיווי שיתוף מסך של המערכת
//    בכל רבע שעה.
// 3. **`ondataavailable` הוא נקודת הלחץ.** נתח נשלח ב-IPC ונכתב לדיסק רשת.
//    השליחה מסודרת בתור טורי, אחרת נתחים היו מגיעים לקובץ בסדר שגוי.
import { API_URL } from '../config';
import {
  KEEP_DIR,
  expiredRecordingFiles,
  pickRecordingMime,
  recordingBlockReason,
  recordingFileName,
  type RecordingBlockReason,
} from '../../shared/screenRecording';

/** הגשר ש-electron-preload.cjs חושף. אינו קיים בדפדפן - וזה מצב חוקי. */
type RecStartResult =
  | { ok: true; file: string; segmentMs: number; fps: number; bitrate: number; retentionDays: number }
  | { ok: false; reason: string; detail?: string };

interface SkykingBridge {
  recStatus?: () => Promise<{ available: boolean; recording?: boolean; file?: string | null; writeError?: string | null; reason?: string }>;
  recStart?: (o: { baseId: number; presetName: string; token: string; ext: string; manual: boolean }) => Promise<RecStartResult>;
  recChunk?: (bytes: Uint8Array) => Promise<{ ok: boolean; reason?: string; detail?: string }>;
  recRotate?: () => Promise<{ ok: boolean; file?: string; reason?: string }>;
  recKeep?: () => Promise<{ ok: boolean; kept?: number }>;
  recStop?: () => Promise<{ ok: boolean; file?: string }>;
}

function bridge(): SkykingBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { skyking?: SkykingBridge };
  return w.skyking?.recStart ? w.skyking : null;
}

// ── שני מקבלים לאותו מקליט ──────────────────────────────────────────────────
//
// הצילום והקידוד זהים בשני המצבים; מה שמשתנה הוא **מי כותב לדיסק**:
//
//   'station' - תהליך ה-Electron של העמדה כותב ישירות ל-PATH. אפס עומס רשת,
//               עובד בנתק, ואין דיאלוג שיתוף מסך.
//   'server'  - דפדפן. הנתחים עולים לשרת והוא כותב לאותו PATH. עובד בכל
//               דפדפן, במחיר של ~1-2GB לשעה לכל עמדה דרך הרשת, ובלי נתק.
//
// המקליט עצמו לא יודע באיזה מצב הוא רץ - זה כל הרעיון של התפר הזה.

/**
 * מי כותב את הקובץ לדיסק:
 *   'station'     - תהליך ה-Electron של העמדה, ישירות ל-PATH שהוגדר.
 *   'server'      - דפדפן, והשרת רואה את ה-PATH (שרת בבסיס / מקומי).
 *   'localFolder' - דפדפן מול שרת ש**אינו** רואה את ה-PATH (למשל ענן):
 *                   הדפדפן כותב בעצמו לתיקייה שהמפעיל בוחר פעם אחת.
 */
export type RecordingMode = 'station' | 'server' | 'localFolder';

interface RecordingSink {
  mode: RecordingMode;
  /** בדפדפן `getDisplayMedia` דורש לחיצת משתמש, ולכן אין התחלה אוטומטית */
  needsGesture: boolean;
  start(a: { baseId: number; presetName: string; token: string; ext: string; manual: boolean }): Promise<RecStartResult>;
  chunk(bytes: Uint8Array): Promise<{ ok: boolean; reason?: string; detail?: string }>;
  rotate(): Promise<{ ok: boolean; file?: string; reason?: string }>;
  keep(): Promise<{ ok: boolean; kept?: number }>;
  stop(): Promise<unknown>;
}

const stationSink = (api: SkykingBridge): RecordingSink => ({
  mode: 'station',
  needsGesture: false,
  start: a => api.recStart!(a),
  chunk: b => api.recChunk!(b),
  rotate: () => api.recRotate!(),
  keep: () => api.recKeep!(),
  stop: () => api.recStop!(),
});

/**
 * מקבל השרת. `sessionId` נולד ב-start ומזהה את הקובץ הפתוח בשרת.
 *
 * ⚠️ כל הקריאות כאן **עוקפות את שכבת הנתק** (`bypassesOfflineLayer`
 * ב-src/offline/policy.ts): נתח וידאו שנכשל אינו עדות לנפילת השרת, והוא בטח
 * לא משהו שצריך לשחזר מ-outbox אחרי נתק. להקלטה יש חיווי מצב משלה.
 */
function serverSink(): RecordingSink {
  let sessionId: string | null = null;
  const url = (suffix: string) => `${API_URL}/screen-recording/sessions/${sessionId}/${suffix}`;
  const post = (u: string, body?: unknown) => fetch(u, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    mode: 'server',
    needsGesture: true,
    async start(a) {
      const res = await post(`${API_URL}/screen-recording/sessions`, {
        base_id: a.baseId, preset_name: a.presetName, ext: a.ext, manual: a.manual,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.session_id) {
        return { ok: false, reason: body?.error === 'base_not_found' ? 'noBase' : (body?.error || 'configUnavailable'), detail: body?.detail };
      }
      sessionId = body.session_id;
      return body as RecStartResult;
    },
    async chunk(bytes) {
      if (!sessionId) return { ok: false, reason: 'notRecording' };
      // Uint8Array ולא Blob: אין צורך ב-multipart, והשרת קורא את הגוף כמו שהוא
      const res = await fetch(url('chunk'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes as BodyInit,
      });
      if (res.ok) return { ok: true };
      const body = await res.json().catch(() => null);
      return { ok: false, reason: res.status === 404 ? 'notRecording' : 'writeFailed', detail: body?.detail };
    },
    async rotate() {
      if (!sessionId) return { ok: false, reason: 'notRecording' };
      const res = await post(url('rotate'));
      return res.ok ? await res.json() : { ok: false, reason: 'notRecording' };
    },
    async keep() {
      if (!sessionId) return { ok: false, kept: 0 };
      const res = await post(url('keep'));
      return res.ok ? await res.json() : { ok: false, kept: 0 };
    },
    async stop() {
      if (!sessionId) return;
      const id = sessionId;
      sessionId = null;
      await post(`${API_URL}/screen-recording/sessions/${id}/stop`).catch(() => {});
    },
  };
}

/**
 * האם לנקות את כשל ההקלטה השמור ולנסות מחדש.
 *
 * תקלה מהשדה (2026-09-16): הנתיב תוקן בניהול הטכני, והעמדה המשיכה
 * להציג את הסיבה מהניסיון הקודם - כלומר "זה לא עובד" גם אחרי
 * שהתקלה נפתרה. כשל שמוצג חייב להיות של **התצורה הנוכחית**;
 * כשל מיושן מטעה גרוע משתיקה.
 */
export const shouldResetRecorderBlock = (
  prevPath: string,
  nextPath: string,
  recording: boolean,
): boolean => !recording && prevPath !== nextPath;

/**
 * מפתח ההודעה לכשל נתיב, **לפי מי ניסה לכתוב**.
 *
 * תקלה מהשדה (2026-09-17): בדפדפן מול שרת בענן הוצג "היעד `C:\` אינו
 * קיים בעמדה הזו" - והנתיב דווקא קיים בעמדה. מי שלא מוצא אותו הוא **השרת**,
 * כי בדפדפן הוא זה שכותב (§7 באפיון). הודעה שמצביעה על המכונה
 * הלא נכונה גרועה מהעדר הודעה.
 */
export const recordingHintKey = (
  kind: 'perm' | 'missing' | 'network' | 'space' | 'other' | null,
  mode: RecordingMode,
): string => {
  if (!kind || kind === 'other') return '';
  const name = kind.charAt(0).toUpperCase() + kind.slice(1);
  return `screenRec.pathErr${name}${mode === 'server' ? 'Server' : ''}`;
};

/** "הנתיב אינו נגיש" - מהעמדה או מהשרת, לפי מי כותב */
export const recordingUnreachableKey = (mode: RecordingMode): string =>
  mode === 'server' ? 'screenRec.whyPathUnreachableServer' : 'screenRec.whyPathUnreachable';

/**
 * מפתח התרגום לסיבת החסימה, או `''` כשאין לה ניסוח.
 *
 * תקלה מהשדה (2026-09-17): ה-switch בתפריט כיסה רק חלק מהסיבות, וכל
 * סיבה אחרת ('forbidden', 'alreadyRecording', 'writeFailed', או כל קוד חדש
 * מהשרת) הובילה למחרוזת ריקה - כלומר "לחצתי ולא קרה כלום". המסך
 * מציג עכשיו את הקוד הגולמי כשאין ניסוח, כדי שלא תהיה אף פעם חסימה
 * שקטה (CLAUDE.md §Do NOT).
 */
export const recordingBlockKey = (
  blocked: RecorderUnavailable,
  mode: RecordingMode,
): string => {
  // במצב כתיבה לתיקייה מקומית ה-PATH שבניהול הטכני אינו בשימוש כלל,
  // ולכן הכשלים שלו אינם רלוונטיים - הצגתם הייתה שולחת לתקן דבר לא נכון.
  if (mode === 'localFolder' && (blocked === 'noPath' || blocked === 'badPath' || blocked === 'pathUnreachable')) {
    return '';
  }
  switch (blocked) {
    case 'disabled': return 'screenRec.whyDisabled';
    case 'noPath': return 'screenRec.whyNoPath';
    case 'badPath': return 'screenRec.whyBadPath';
    case 'noFolderApi': return 'screenRec.whyNoFolderApi';
    case 'noFolder': return 'screenRec.whyNoFolder';
    case 'noElectron': return 'screenRec.whyNoElectron';
    case 'noBase': return 'screenRec.whyNoBase';
    case 'noCodec': return 'screenRec.whyNoCodec';
    case 'noPermission': return 'screenRec.whyNoPermission';
    case 'configUnavailable': return 'screenRec.whyConfigUnavailable';
    case 'browserNeedsClick': return 'screenRec.whyBrowserNeedsClick';
    case 'pathUnreachable': return recordingUnreachableKey(mode);
    default: return '';
  }
};


// ── מקבל שלישי: הדפדפן כותב לתיקייה שהמפעיל בוחר ───────────────
//
// למה זה קיים (תקלה מהשדה, 2026-09-18): בדפדפן מול שרת בענן אין ולא
// תהיה דרך לכתוב ל-`C:\SKYKING\REC` של העמדה - השרת הוא מכונת Linux
// במרכז נתונים. במצב הזה הדפדפן כותב בעצמו, דרך File System Access API.
//
// שלוש נקודות שקובעות את העיצוב:
//   1. **בוחרים תיקייה ולא קובץ.** קטע חדש כל רבע שעה = קובץ חדש, ובחירת
//      קובץ (`showSaveFilePicker`) הייתה פותחת דיאלוג בכל החלפה. עם תיקייה
//      בוחרים **פעם אחת**, ומשם והלאה הדף יוצר קבצים בלי לשאול שוב.
//   2. **ההרשאה נשמרת ב-IndexedDB.** הידית (handle) ניתנת ל-structured clone,
//      ולכן בפעם הבאה מבקשים רק אישור מחדש (בלחיצה) ולא בוחרים מחדש.
//   3. **אותם כללים.** שם הקובץ, `keep/` ותקופת השמירה באים מ-`shared/`,
//      כמו בעמדה ובשרת - שלושה עותקים של הלוגיקה הזו היו נפרדים מהר.

/**
 * File System Access API - החלקים שחסרים ב-lib.dom של גרסת ה-TS הזו.
 * מוצהר מקומית ולא ב-lib גלובלי: השימוש היחיד הוא כאן.
 */
interface FsWritable {
  write(data: Uint8Array | BlobPart): Promise<void>;
  close(): Promise<void>;
}
type FsFileHandle = FileSystemFileHandle & {
  createWritable: () => Promise<FsWritable>;
  getFile: () => Promise<File>;
  move?: (dest: unknown, name: string) => Promise<void>;
};

const FOLDER_DB = 'skyking-rec';
const FOLDER_STORE = 'handles';
const FOLDER_KEY = 'recDir';

type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>;
};

/** האם הדפדפן תומך בבחירת תיקייה (Chrome/Edge ✓ · Firefox/Safari ✗) */
export const canPickFolder = (): boolean =>
  typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function';

function idb(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(FOLDER_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(FOLDER_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function rememberedDir(): Promise<DirHandle | null> {
  const db = await idb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const req = db.transaction(FOLDER_STORE, 'readonly').objectStore(FOLDER_STORE).get(FOLDER_KEY);
      req.onsuccess = () => resolve((req.result as DirHandle) || null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function rememberDir(handle: DirHandle): Promise<void> {
  const db = await idb();
  if (!db) return;
  try {
    db.transaction(FOLDER_STORE, 'readwrite').objectStore(FOLDER_STORE).put(handle, FOLDER_KEY);
  } catch { /* הבחירה תחוזור בפעם הבאה - לא שווה להפיל הקלטה על זה */ }
}

/**
 * התיקייה הזכורה, **בלי לפתוח בורר** - או null.
 *
 * למה בלי בורר כאן: גם בורר התיקייה וגם `getDisplayMedia` דורשים
 * "לחיצת משתמש טרייה" (transient activation), והראשון **צורך אותה** - כך
 * שבקשת שיתוף המסך אחריו נדחתה ב-InvalidStateError. לכן בחירת התיקייה
 * היא **צעד נפרד** בתפריט ("בחר תיקיית שמירה"), וההתחלה משתמשת
 * במה שכבר מורשה.
 */
async function grantedDir(): Promise<DirHandle | null> {
  const saved = await rememberedDir();
  if (!saved) return null;
  const state = (await saved.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
  return state === 'granted' ? saved : null;
}

/**
 * בוחר תיקיית שמירה (או מחדש הרשאה לזכורה). **נקרא מלחיצה בלבד.**
 * מחזיר true אם יש עכשיו תיקייה שמותר לכתוב אליה.
 */
export async function pickRecordingFolder(): Promise<boolean> {
  if (!canPickFolder()) return false;
  const saved = await rememberedDir();
  if (saved) {
    const state = (await saved.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
    if (state === 'granted') return true;
    const asked = (await saved.requestPermission?.({ mode: 'readwrite' })) ?? 'denied';
    if (asked === 'granted') return true;
  }
  try {
    const picked: DirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite', id: 'skyking-rec', startIn: 'videos' });
    await rememberDir(picked);
    return true;
  } catch {
    return false;   // המפעיל ביטל
  }
}

/** האם יש כבר תיקייה מורשת - בלי לשאול את המפעיל שום דבר */
export const recordingFolderReady = (): Promise<boolean> =>
  canPickFolder() ? grantedDir().then(d => d !== null) : Promise.resolve(false);

/** מודד לפי אותם כללים שהעמדה והשרת מודדים בהם - ולא נוגע בקובץ זר */
async function sweepDir(dir: DirHandle, retentionDays: number, current: string | null) {
  try {
    const names: string[] = [];
    for await (const name of (dir as any).keys()) names.push(name as string);
    for (const name of expiredRecordingFiles(names, { now: new Date(), retentionDays })) {
      if (name === current) continue;
      await dir.removeEntry(name).catch(() => {});
    }
  } catch { /* סריקה שנכשלה אינה סיבה לא להקליט */ }
}

/**
 * מקבל התיקייה המקומית. `baseName` מגיע מתשובת השרת (כמו בשני
 * המסלולים האחרים), כדי ששם הקובץ יהיה זהה בכל שלושת המסלולים.
 */
function localFolderSink(cfg: {
  baseName: string; segmentMinutes: number; retentionDays: number; fps: number; bitrate: number;
}): RecordingSink {
  let dir: DirHandle | null = null;
  let writable: FsWritable | null = null;
  let file: string | null = null;
  let previous: string | null = null;
  let keepCurrent = false;
  let ext: 'mp4' | 'webm' = 'webm';
  let presetName = '';

  const openSegment = async (manual: boolean): Promise<string | null> => {
    if (!dir) return null;
    let startedAt = new Date();
    let name = recordingFileName({ baseName: cfg.baseName, presetName, startedAt, ext, manual });
    // התנגשות שם באותה שנייה - אותה הגנה כמו בכותב של ה-Node
    for (let i = 0; i < 120; i++) {
      const taken = await dir.getFileHandle(name).then(() => true).catch(() => false);
      if (!taken) break;
      startedAt = new Date(startedAt.getTime() + 1000);
      name = recordingFileName({ baseName: cfg.baseName, presetName, startedAt, ext, manual });
    }
    const handle = (await dir.getFileHandle(name, { create: true })) as FsFileHandle;
    writable = await handle.createWritable();
    file = name;
    keepCurrent = false;
    return name;
  };

  const closeSegment = async () => {
    if (!writable) return;
    await writable.close().catch(() => {});
    writable = null;
    if (!dir || !file) return;
    if (keepCurrent) {
      await moveToKeep(dir, file);
      previous = null;
    } else {
      previous = file;
    }
    file = null;
  };

  const moveToKeep = async (d: DirHandle, name: string) => {
    try {
      const keepDir = await d.getDirectoryHandle(KEEP_DIR, { create: true });
      const src = (await d.getFileHandle(name)) as FsFileHandle;
      const mv = src.move;
      if (typeof mv === 'function') { await mv.call(src, keepDir, name); return; }
      // דפדפן בלי move() - מעתיקים ומוחקים
      const blob = await src.getFile();
      const dest = (await keepDir.getFileHandle(name, { create: true })) as FsFileHandle;
      const w = await dest.createWritable();
      await w.write(blob);
      await w.close();
      await d.removeEntry(name);
    } catch { /* שמירה שנכשלה מדווחת ב-kept=0 */ }
  };

  return {
    mode: 'localFolder',
    needsGesture: true,
    async start(a) {
      if (!canPickFolder()) return { ok: false, reason: 'noFolderApi' };
      presetName = a.presetName;
      ext = a.ext === 'mp4' ? 'mp4' : 'webm';
      // בלי בורר כאן: הוא היה צורך את לחיצת המשתמש שדרושה לשיתוף המסך
      dir = await grantedDir();
      if (!dir) return { ok: false, reason: 'noFolder' };
      const name = await openSegment(a.manual).catch(() => null);
      if (!name) return { ok: false, reason: 'writeFailed' };
      void sweepDir(dir, cfg.retentionDays, name);
      return {
        ok: true, file: name,
        segmentMs: cfg.segmentMinutes * 60_000,
        fps: cfg.fps, bitrate: cfg.bitrate, retentionDays: cfg.retentionDays,
      };
    },
    async chunk(bytes) {
      if (!writable) return { ok: false, reason: 'notRecording' };
      try {
        await writable.write(bytes);
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: 'writeFailed', detail: (e as Error).message };
      }
    },
    async rotate() {
      if (!writable) return { ok: false, reason: 'notRecording' };
      const manual = false;
      await closeSegment();
      const name = await openSegment(manual).catch(() => null);
      return name ? { ok: true, file: name } : { ok: false, reason: 'writeFailed' };
    },
    async keep() {
      let kept = 0;
      if (writable && file) { keepCurrent = true; kept++; }
      if (dir && previous) { await moveToKeep(dir, previous); previous = null; kept++; }
      return { ok: kept > 0, kept };
    },
    async stop() {
      await closeSegment();
      dir = null;
    },
  };
}

/**
 * מי יכתוב לדיסק בעמדה הזו. טהורה, כדי שתהיה בדיקה ולא ניחוש.
 *
 * `serverSeesPath === null` = התצורה עדיין לא נטענה → מניחים שרת, כמו קודם.
 */
export const pickRecordingMode = (
  { hasBridge, serverSeesPath }: { hasBridge: boolean; serverSeesPath: boolean | null },
): RecordingMode => {
  if (hasBridge) return 'station';
  return serverSeesPath === false ? 'localFolder' : 'server';
};

/**
 * המקבל למקטע הבא. התצורה נדרשת רק למצב התיקייה המקומית, שבו הדפדפן
 * בונה בעצמו את שם הקובץ ומנהל בעצמו את הקטעים.
 */
function sink(cfg?: StartArgs['config']): RecordingSink {
  const api = bridge();
  const mode = pickRecordingMode({ hasBridge: api !== null, serverSeesPath: cfg?.serverSeesPath ?? null });
  if (mode === 'station' && api) return stationSink(api);
  if (mode === 'localFolder') {
    return localFolderSink({
      baseName: cfg?.baseName || '',
      segmentMinutes: cfg?.segmentMinutes ?? 15,
      retentionDays: cfg?.retentionDays ?? 7,
      fps: cfg?.fps ?? 5,
      bitrate: cfg?.bitrate ?? 1_500_000,
    });
  }
  return serverSink();
}

/** באיזה מצב העמדה הזו מקליטה */
export const recordingMode = (serverSeesPath: boolean | null = null): RecordingMode =>
  pickRecordingMode({ hasBridge: bridge() !== null, serverSeesPath });

/**
 * האם אפשר להקליט. **תמיד true** מאז שמסלול השרת קיים - גם דפדפן מקליט.
 * ההבדל היחיד הוא שבדפדפן ההתחלה דורשת לחיצה (`recordingNeedsGesture`).
 */
export const canRecordScreen = (): boolean => true;

/** בדפדפן: ההקלטה לא מתחילה לבד, כי הדפדפן דורש אישור שיתוף מסך בלחיצה */
export const recordingNeedsGesture = (): boolean => bridge() === null;

/** למה אי-אפשר להקליט, מעבר לתצורת הבסיס. null = אפשר. */
export type RecorderUnavailable = RecordingBlockReason
  | 'noElectron'         // אין מקבל כתיבה בכלל (לא אמור לקרות מאז מסלול השרת)
  | 'noCodec'            // אין קודק וידאו נתמך
  | 'noPermission'       // אין מקור מסך (הפעלה בלי צג)
  | 'noBase'             // העמדה אינה משויכת לבסיס
  | 'pathUnreachable'    // הנתיב מוגדר אך אינו נגיש מהעמדה
  | 'configUnavailable'  // התצורה לא נטענה מהשרת
  | 'browserNeedsClick'  // דפדפן: מוגדר ודולק, אבל צריך לחיצה כדי להתחיל
  | 'noFolderApi'        // הדפדפן אינו תומך בבחירת תיקייה (Firefox / Safari)
  | 'noFolder'           // המפעיל ביטל את בחירת התיקייה
  | 'alreadyRecording'
  | 'writeFailed'
  | 'forbidden';

export interface RecorderState {
  recording: boolean;
  /** הקטע שנכתב כרגע (שם קובץ בלבד - הנתיב אינו נחשף לעמוד) */
  file: string | null;
  /** הקלטה שהמפעיל הפעיל בעצמו, להבדיל מהקופסה השחורה */
  manual: boolean;
  /** מה חוסם, או null */
  blocked: RecorderUnavailable;
  /** תקלת כתיבה שהצד הכותב דיווח עליה (דיסק רשת שנפל) */
  writeError: string | null;
  /** קוד/הודעת מערכת ההפעלה מהכשל האחרון - מתורגם לסיבה שמוצגת למפעיל */
  blockedDetail: string | null;
  /** מי כותב לדיסק בהקלטה הנוכחית */
  mode: RecordingMode;
}

export const IDLE_STATE: RecorderState = {
  recording: false, file: null, manual: false, blocked: null, writeError: null,
  blockedDetail: null, mode: 'station',
};

/** אורך נתח. שנייה אחת: איבוד מקסימלי של שנייה בנפילת חשמל. */
const TIMESLICE_MS = 1000;

interface StartArgs {
  baseId: number | null;
  presetName: string;
  token: string;
  manual: boolean;
  /**
   * התצורה כפי שנקראה מהשרת - לזיהוי מוקדם של "כבוי" / "בלי נתיב",
   * ולפרמטרי הקידוד במצב שבו **הדפדפן** הוא שכותב.
   */
  config: {
    enabled: boolean; path: string;
    baseName?: string; segmentMinutes?: number; retentionDays?: number;
    fps?: number; bitrate?: number; serverSeesPath?: boolean | null;
  } | null;
  onState: (patch: Partial<RecorderState>) => void;
}

/**
 * מקליט המסך של העמדה. מופע אחד לכל חיי העמוד (`screenRecorder`), כי גם
 * ההקלטה האוטומטית וגם הכפתור מפעילים את אותו מקליט - שני מקליטים במקביל
 * היו כותבים שני קבצים לאותו נתיב ומכפילים את העומס בלי שום תועלת.
 */
class ScreenRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private rotateTimer: ReturnType<typeof setTimeout> | null = null;
  /** תור טורי - שומר על סדר הנתחים בקובץ */
  private tail: Promise<unknown> = Promise.resolve();
  private state: RecorderState = { ...IDLE_STATE };
  private onState: StartArgs['onState'] = () => {};
  private stopping = false;
  /** מי כותב לדיסק במקטע הנוכחי. נבחר ב-start ונשמר עד stop. */
  private out: RecordingSink | null = null;

  get snapshot(): RecorderState { return { ...this.state }; }

  private set(patch: Partial<RecorderState>) {
    this.state = { ...this.state, ...patch };
    this.onState(patch);
  }

  /** התחלה. מחזיר את הסיבה אם לא התחיל, ו-null אם התחיל. */
  async start(args: StartArgs): Promise<RecorderUnavailable> {
    this.onState = args.onState;
    if (this.state.recording) return null;

    const out = sink(args.config);
    this.out = out;
    if (!args.baseId) { this.set({ blocked: 'noBase' }); return 'noBase'; }

    // הקלטה ידנית מותרת גם כשהקופסה השחורה כבויה בבסיס - מה שחייב להיות מוגדר
    // הוא הנתיב. הבדיקה כאן חוסכת בקשת שיתוף מסך שתיפול בכל מקרה.
    // במצב התיקייה המקומית ה-PATH שבניהול הטכני אינו בשימוש, ולכן
    // בודקים רק מה שרלוונטי: האם ההקלטה דולקת לבסיס.
    const cfgReason: RecordingBlockReason = out.mode === 'localFolder'
      ? (args.config?.enabled ? null : 'disabled')
      : recordingBlockReason(args.config ?? { enabled: false, path: '' });
    if (cfgReason && !(args.manual && cfgReason === 'disabled')) { this.set({ blocked: cfgReason }); return cfgReason; }

    const mime = pickRecordingMime(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
    if (!mime) { this.set({ blocked: 'noCodec' }); return 'noCodec'; }

    const started = await out.start({
      baseId: args.baseId, presetName: args.presetName, token: args.token,
      ext: mime.ext, manual: args.manual,
    });
    if (!started.ok) {
      const reason = started.reason as RecorderUnavailable;
      // לקונסולה גם: בעמדה זו הדרך לראות את הכשל בלי לפתוח תפריט
      console.warn(`[rec] ההקלטה לא התחילה: ${reason}${started.detail ? ' | ' + started.detail : ''} (${out.mode})`);
      // `detail` הוא קוד מערכת ההפעלה (EPERM / ENOENT / ETIMEDOUT). בלעדיו
      // "הנתיב אינו נגיש" הוא מסך חסום בלי דרך פעולה.
      this.set({ blocked: reason, blockedDetail: started.detail ?? null });
      return reason;
    }

    try {
      await this.openStream(started.fps);
    } catch {
      // בעמדה ההרשאה נענית אוטומטית (setDisplayMediaRequestHandler), ולכן כאן
      // זה אומר שאין מקור מסך בכלל. בדפדפן זו גם התשובה כשהמפעיל **ביטל** את
      // בקשת שיתוף המסך - ולכן הקובץ שנפתח בשרת נסגר מיד.
      await out.stop();
      this.set({ blocked: 'noPermission' });
      return 'noPermission';
    }

    this.stopping = false;
    this.set({ recording: true, file: started.file, manual: args.manual, blocked: null, writeError: null, blockedDetail: null, mode: out.mode });
    this.openRecorder(mime.mimeType, started.bitrate);
    this.scheduleRotate(started.segmentMs, mime.mimeType, started.bitrate);
    return null;
  }

  private async openStream(fps: number) {
    if (this.stream) return;
    // כל המסך הפיזי: בעמדה ה-handler בתהליך הראשי בוחר את הצג אוטומטית,
    // ולכן אין דיאלוג בחירה. בלי קול - הקלטת שמע בעמדה תפעולית היא הכרעה
    // נפרדת (הקלטת קשר), ולא נגררת כתופעת לוואי של הקלטת מסך.
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: fps },
      audio: false,
    });
    // הפסקת השיתוף מהחיווי של מערכת ההפעלה סוגרת את ההקלטה מסודר
    this.stream.getVideoTracks().forEach(t => t.addEventListener('ended', () => { void this.stop(); }));
  }

  private openRecorder(mimeType: string, bitrate: number) {
    if (!this.stream) return;
    const rec = new MediaRecorder(this.stream, { mimeType, videoBitsPerSecond: bitrate });
    rec.ondataavailable = e => {
      if (!e.data || !e.data.size) return;
      // התור הטורי: כל נתח נכתב אחרי קודמו, גם כשהדיסק איטי מקצב הקידוד
      this.tail = this.tail.then(async () => {
        const out = this.out;
        if (!out) return;
        const bytes = new Uint8Array(await e.data.arrayBuffer());
        const res = await out.chunk(bytes);
        if (!res.ok && res.reason === 'writeFailed') this.set({ writeError: res.detail ?? 'writeFailed' });
      }).catch(() => {});
    };
    rec.start(TIMESLICE_MS);
    this.recorder = rec;
  }

  /** סוגר את המקליט הנוכחי ומחכה שכל הנתחים שלו נכתבו */
  private async closeRecorder(): Promise<void> {
    const rec = this.recorder;
    this.recorder = null;
    if (!rec || rec.state === 'inactive') return;
    await new Promise<void>(resolve => {
      rec.addEventListener('stop', () => resolve(), { once: true });
      // `onstop` לא תמיד נורה כשהזרם נסגר מתחת למקליט - מגבילים בזמן
      setTimeout(resolve, 1500);
      rec.stop();
    });
    await this.tail;
  }

  private scheduleRotate(segmentMs: number, mimeType: string, bitrate: number) {
    if (this.rotateTimer) clearTimeout(this.rotateTimer);
    this.rotateTimer = setTimeout(async () => {
      if (!this.state.recording || this.stopping) return;
      await this.closeRecorder();
      const res = await this.out?.rotate();
      if (!res?.ok) { await this.stop(); return; }
      this.set({ file: res.file ?? null });
      this.openRecorder(mimeType, bitrate);
      this.scheduleRotate(segmentMs, mimeType, bitrate);
    }, segmentMs);
  }

  /**
   * מנקה כשל שמור (לא נוגע בהקלטה שרצה). נקרא כשהתצורה שונתה
   * בניהול הטכני - מרגע זה הסיבה הקודמת שייכת לתצורה שכבר אינה.
   */
  reset() {
    if (this.state.recording) return;
    this.state = { ...IDLE_STATE };
    this.onState({ ...IDLE_STATE });
  }

  /** "שמור את הקטע הזה" - הקטע הנוכחי והקודם לא יימחקו במחיקה האוטומטית */
  async keep(): Promise<number> {
    const res = await this.out?.keep();
    return res?.kept ?? 0;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.rotateTimer) { clearTimeout(this.rotateTimer); this.rotateTimer = null; }
    await this.closeRecorder();
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    await this.out?.stop();
    this.out = null;
    this.set({ recording: false, file: null, manual: false });
  }
}

/** מופע יחיד לעמדה - ראה ההסבר במחלקה */
export const screenRecorder = new ScreenRecorder();
