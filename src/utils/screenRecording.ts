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
  const w = window as unknown as { skyking?: SkykingBridge };
  return w.skyking?.recStart ? w.skyking : null;
}

/** האם העמדה בכלל מסוגלת להקליט. בדפדפן - לא, ואז מציגים את הסיבה. */
export const canRecordScreen = (): boolean => bridge() !== null;

/** למה אי-אפשר להקליט, מעבר לתצורת הבסיס. null = אפשר. */
export type RecorderUnavailable = RecordingBlockReason
  | 'noElectron'         // ריצה בדפדפן ולא באפליקציית העמדה
  | 'noCodec'            // אין קודק וידאו נתמך
  | 'noPermission'       // אין מקור מסך (הפעלה בלי צג)
  | 'noBase'             // העמדה אינה משויכת לבסיס
  | 'pathUnreachable'    // הנתיב מוגדר אך אינו נגיש מהעמדה
  | 'configUnavailable'  // התצורה לא נטענה מהשרת
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
  /** תקלת כתיבה שהתהליך הראשי דיווח עליה (דיסק רשת שנפל) */
  writeError: string | null;
}

export const IDLE_STATE: RecorderState = {
  recording: false, file: null, manual: false, blocked: null, writeError: null,
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

  get snapshot(): RecorderState { return { ...this.state }; }

  private set(patch: Partial<RecorderState>) {
    this.state = { ...this.state, ...patch };
    this.onState(patch);
  }

  /** התחלה. מחזיר את הסיבה אם לא התחיל, ו-null אם התחיל. */
  async start(args: StartArgs): Promise<RecorderUnavailable> {
    this.onState = args.onState;
    if (this.state.recording) return null;

    const api = bridge();
    if (!api?.recStart || !api.recChunk) { this.set({ blocked: 'noElectron' }); return 'noElectron'; }
    if (!args.baseId) { this.set({ blocked: 'noBase' }); return 'noBase'; }

    // הקלטה ידנית מותרת גם כשהקופסה השחורה כבויה בבסיס - מה שחייב להיות מוגדר
    // הוא הנתיב. הבדיקה כאן חוסכת בקשת שיתוף מסך שתיפול בכל מקרה.
    const cfgReason = recordingBlockReason(args.config ?? { enabled: false, path: '' });
    if (cfgReason && !(args.manual && cfgReason === 'disabled')) { this.set({ blocked: cfgReason }); return cfgReason; }

    const mime = pickRecordingMime(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
    if (!mime) { this.set({ blocked: 'noCodec' }); return 'noCodec'; }

    const started = await api.recStart({
      baseId: args.baseId, presetName: args.presetName, token: args.token,
      ext: mime.ext, manual: args.manual,
    });
    if (!started.ok) {
      const reason = started.reason as RecorderUnavailable;
      this.set({ blocked: reason, writeError: started.detail ?? null });
      return reason;
    }

    try {
      await this.openStream(started.fps);
    } catch {
      // בעמדה ההרשאה נענית אוטומטית (setDisplayMediaRequestHandler); כאן זה
      // אומר שאין מקור מסך בכלל - למשל הפעלה בלי צג (RDP מנותק)
      await api.recStop?.();
      this.set({ blocked: 'noPermission' });
      return 'noPermission';
    }

    this.stopping = false;
    this.set({ recording: true, file: started.file, manual: args.manual, blocked: null, writeError: null });
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
        const api = bridge();
        if (!api?.recChunk) return;
        const bytes = new Uint8Array(await e.data.arrayBuffer());
        const res = await api.recChunk(bytes);
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
      const api = bridge();
      const res = await api?.recRotate?.();
      if (!res?.ok) { await this.stop(); return; }
      this.set({ file: res.file ?? null });
      this.openRecorder(mimeType, bitrate);
      this.scheduleRotate(segmentMs, mimeType, bitrate);
    }, segmentMs);
  }

  /** "שמור את הקטע הזה" - הקטע הנוכחי והקודם לא יימחקו במחיקה האוטומטית */
  async keep(): Promise<number> {
    const res = await bridge()?.recKeep?.();
    return res?.kept ?? 0;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.rotateTimer) { clearTimeout(this.rotateTimer); this.rotateTimer = null; }
    await this.closeRecorder();
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    await bridge()?.recStop?.();
    this.set({ recording: false, file: null, manual: false });
  }
}

/** מופע יחיד לעמדה - ראה ההסבר במחלקה */
export const screenRecorder = new ScreenRecorder();
