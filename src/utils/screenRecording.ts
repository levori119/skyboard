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
  pickRecordingMime,
  recordingBlockReason,
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

export type RecordingMode = 'station' | 'server';

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

/** מי יכתוב לדיסק בעמדה הזו. טהורה, כדי שתהיה בדיקה ולא ניחוש. */
export const pickRecordingMode = (hasStationBridge: boolean): RecordingMode =>
  hasStationBridge ? 'station' : 'server';

function sink(): RecordingSink {
  const api = bridge();
  return api ? stationSink(api) : serverSink();
}

/** באיזה מצב העמדה הזו מקליטה */
export const recordingMode = (): RecordingMode => pickRecordingMode(bridge() !== null);

/**
 * האם אפשר להקליט. **תמיד true** מאז שמסלול השרת קיים - גם דפדפן מקליט.
 * ההבדל היחיד הוא שבדפדפן ההתחלה דורשת לחיצה (`recordingNeedsGesture`).
 */
export const canRecordScreen = (): boolean => true;

/** בדפדפן: ההקלטה לא מתחילה לבד, כי הדפדפן דורש אישור שיתוף מסך בלחיצה */
export const recordingNeedsGesture = (): boolean => sink().needsGesture;

/** למה אי-אפשר להקליט, מעבר לתצורת הבסיס. null = אפשר. */
export type RecorderUnavailable = RecordingBlockReason
  | 'noElectron'         // אין מקבל כתיבה בכלל (לא אמור לקרות מאז מסלול השרת)
  | 'noCodec'            // אין קודק וידאו נתמך
  | 'noPermission'       // אין מקור מסך (הפעלה בלי צג)
  | 'noBase'             // העמדה אינה משויכת לבסיס
  | 'pathUnreachable'    // הנתיב מוגדר אך אינו נגיש מהעמדה
  | 'configUnavailable'  // התצורה לא נטענה מהשרת
  | 'browserNeedsClick'  // דפדפן: מוגדר ודולק, אבל צריך לחיצה כדי להתחיל
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
  /** התצורה כפי שנקראה מהשרת - לזיהוי מוקדם של "כבוי" / "בלי נתיב" */
  config: { enabled: boolean; path: string } | null;
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

    const out = sink();
    this.out = out;
    if (!args.baseId) { this.set({ blocked: 'noBase' }); return 'noBase'; }

    // הקלטה ידנית מותרת גם כשהקופסה השחורה כבויה בבסיס - מה שחייב להיות מוגדר
    // הוא הנתיב. הבדיקה כאן חוסכת בקשת שיתוף מסך שתיפול בכל מקרה.
    const cfgReason = recordingBlockReason(args.config ?? { enabled: false, path: '' });
    if (cfgReason && !(args.manual && cfgReason === 'disabled')) { this.set({ blocked: cfgReason }); return cfgReason; }

    const mime = pickRecordingMime(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
    if (!mime) { this.set({ blocked: 'noCodec' }); return 'noCodec'; }

    const started = await out.start({
      baseId: args.baseId, presetName: args.presetName, token: args.token,
      ext: mime.ext, manual: args.manual,
    });
    if (!started.ok) {
      const reason = started.reason as RecorderUnavailable;
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
