// זיהוי קולי - שכבת הפשטה מעל שני מנועים.
//
// למה: ה-Web Speech API של Chromium שולח את האודיו לשירות הזיהוי הענני של גוגל,
// והמפתחות אליו קומפלו רק לתוך Chrome עצמו. בכל מעטפת Chromium אחרת - כולל
// אפליקציית העמדה שלנו (Electron) - הקריאה נכשלת מיד ב-error='network', כשנייה
// אחרי הלחיצה. (electron/electron#46143, #7749)
//
// לכן בעמדה מתמללים **מקומית**: whisper.cpp + מודל עברית של ivrit-ai, דרך גשר
// IPC שנחשף ב-preload. האודיו לא עוזב את העמדה.
//
// ⚠️ מה שהקובץ הזה **לא** עושה: הוא לא מבין פקודות. הוא מחזיר טקסט גולמי בלבד,
// וכל הפרסור העברי (parseVoiceCommand / parseDestCommand / findSectorByVoice)
// נשאר במסך הבקר בדיוק כפי שהיה. החלפת המנוע לא נוגעת בפקודות.

import { encodeWav, bytesToBase64, WHISPER_SAMPLE_RATE } from './wav';

/** הגשר ש-electron-preload.cjs חושף. קיים רק בעמדה, לא בדפדפן. */
declare global {
  interface Window {
    skyking?: {
      sttAvailable?: () => Promise<{ ok: boolean; code?: string }>;
      /** WAV מקודד base64 - ראה bytesToBase64 להסבר למה לא באפר גולמי. */
      transcribe?: (wavBase64: string) => Promise<{ ok: boolean; text?: string; code?: string }>;
    };
  }
}

export type SpeechBackend = 'webSpeech' | 'localWhisper' | 'none';

export interface SpeechCallbacks {
  /** המיקרופון נפתח בפועל. */
  onStart?: () => void;
  /** תמלול חלקי תוך כדי דיבור (Web Speech בלבד - ב-whisper אין ביניים). */
  onInterim?: (text: string) => void;
  /** ההקלטה נסגרה, המנוע מתמלל. */
  onTranscribing?: () => void;
  /** תמלול סופי. מספר חלופות כשהמנוע מספק אותן; לפחות אחת. */
  onFinal?: (candidates: string[]) => void;
  /** קוד שגיאה גולמי; ההודעה למשתמש נבנית בצד המסך (i18n). */
  onError?: (code: string) => void;
}

export interface SpeechSession {
  /** סיום יזום - מפסיק להקליט ומתמלל את מה שנקלט. */
  stop: () => void;
}

// ── עצירה אוטומטית בשקט ───────────────────────────────────────────────────────
// whisper הוא מנוע batch: בניגוד ל-Web Speech הוא לא יודע לעצור לבד בסוף משפט,
// ולכן אנחנו מזהים את השקט. הערכים כוונו כך שהבקר לא ימתין מיותר אבל גם לא ייחתך
// באמצע פקודה עם הפסקה טבעית ("בננה... תמשיך ל-700 דרום").
export const SILENCE_RMS = 0.015;      // מתחת לזה נחשב שקט
export const SILENCE_HOLD_MS = 1200;   // כמה שקט רצוף סוגר את ההקלטה
export const NO_SPEECH_MS = 6000;      // לא נקלט דיבור כלל
export const MAX_RECORD_MS = 15000;    // רשת ביטחון - פקודה אף פעם לא ארוכה כל כך

export const isSilent = (rms: number): boolean => rms < SILENCE_RMS;

export type RecordingState = {
  /** מ-recorder.start() */
  elapsedMs: number;
  /** האם נקלט דיבור כלשהו עד כה */
  heardSpeech: boolean;
  /** אורך השקט הרצוף הנוכחי (0 = מדברים כרגע) */
  quietForMs: number;
};

/**
 * ההחלטה היחידה שקובעת אם פקודה תיחתך באמצע. פונקציה טהורה - ראה speech.test.ts.
 *
 * הסדר חשוב: כל עוד לא נקלט דיבור, שקט הוא **המתנה** ולא סוף פקודה. בלי זה,
 * בקר שלוחץ ולוקח רגע לפני שהוא מדבר היה מקבל הקלטה ריקה.
 */
export function recordingDecision(s: RecordingState): 'continue' | 'stop' | 'no-speech' {
  if (!s.heardSpeech) return s.elapsedMs > NO_SPEECH_MS ? 'no-speech' : 'continue';
  if (s.quietForMs >= SILENCE_HOLD_MS) return 'stop';
  if (s.elapsedMs >= MAX_RECORD_MS) return 'stop';
  return 'continue';
}

/** שם שגיאת getUserMedia → קוד שהמסך יודע לתרגם להודעה. */
export function micErrorCode(errName: string): 'not-allowed' | 'audio-capture' | 'mic-failed' {
  if (errName === 'NotAllowedError' || errName === 'SecurityError') return 'not-allowed';
  if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') return 'audio-capture';
  return 'mic-failed';
}

const SR = (): any =>
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

/** האם רצים בתוך אפליקציית העמדה. */
export const isElectron = (): boolean => /Electron\//i.test(navigator.userAgent);

/** איזה מנוע ישמש בפועל בסביבה הנוכחית. */
export function speechBackend(): SpeechBackend {
  if (typeof window !== 'undefined' && window.skyking?.transcribe) return 'localWhisper';
  if (SR()) return 'webSpeech';
  return 'none';
}

// ── מנוע 1: Web Speech (דפדפן) ────────────────────────────────────────────────
function startWebSpeech(cb: SpeechCallbacks): SpeechSession {
  const recog = new (SR())();
  recog.lang = 'he-IL';
  recog.interimResults = true;
  recog.continuous = false;
  recog.maxAlternatives = 3;

  recog.onstart = () => cb.onStart?.();
  recog.onresult = (event: any) => {
    const results: any[] = Array.from(event.results);
    cb.onInterim?.(results.map((r: any) => r[0].transcript).join(' '));
    if (!results[results.length - 1].isFinal) return;
    const candidates: string[] = [];
    for (let ri = 0; ri < event.results.length; ri++) {
      for (let ai = 0; ai < event.results[ri].length; ai++) {
        candidates.push(event.results[ri][ai].transcript);
      }
    }
    cb.onFinal?.(candidates);
  };
  recog.onerror = (e: any) => {
    const code = String(e?.error || 'unknown');
    if (code === 'aborted') return;
    // ב-Electron זה תמיד יהיה 'network' - אבל שם בכלל לא מגיעים לכאן, כי
    // speechBackend() בוחר ב-localWhisper. אם כן הגענו, המודל חסר בעמדה.
    cb.onError?.(code === 'network' && isElectron() ? 'electron-unsupported' : code);
  };
  try {
    recog.start();
  } catch {
    cb.onError?.('start-failed');
  }
  return { stop: () => { try { recog.stop(); } catch { /* כבר נעצר */ } } };
}

// ── מנוע 2: whisper מקומי (עמדה) ──────────────────────────────────────────────

/** webm/opus מהמיקרופון → Float32 מונו ב-16kHz, דרך ה-resampler של הדפדפן. */
async function decodeTo16kMono(blob: Blob): Promise<Float32Array> {
  const bytes = await blob.arrayBuffer();
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(bytes);
  } finally {
    void ctx.close();
  }
  const frames = Math.max(1, Math.ceil(decoded.duration * WHISPER_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, frames, WHISPER_SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

function startLocalWhisper(cb: SpeechCallbacks): SpeechSession {
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let meterCtx: AudioContext | null = null;
  let monitor: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let gaveUp = false;   // ויתרנו על היעדר דיבור - השגיאה כבר דווחה

  const cleanup = () => {
    if (monitor) { clearInterval(monitor); monitor = null; }
    stream?.getTracks().forEach(t => t.stop());   // משחרר את נורית המיקרופון
    stream = null;
    void meterCtx?.close().catch(() => {});
    meterCtx = null;
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (monitor) { clearInterval(monitor); monitor = null; }
    try { recorder?.state === 'recording' && recorder.stop(); } catch { /* כבר נסגר */ }
  };

  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (err: any) {
      cleanup();
      cb.onError?.(micErrorCode(String(err?.name || '')));
      return;
    }
    if (stopped) { cleanup(); return; }

    const chunks: Blob[] = [];
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      cleanup();
      cb.onError?.('recorder-failed');
      return;
    }
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = async () => {
      cleanup();
      if (gaveUp) return;                                          // כבר דיווחנו no-speech
      if (!chunks.length) { cb.onError?.('no-speech'); return; }
      cb.onTranscribing?.();
      try {
        const samples = await decodeTo16kMono(new Blob(chunks, { type: chunks[0].type }));
        const res = await window.skyking!.transcribe!(bytesToBase64(encodeWav(samples)));
        if (!res?.ok) { cb.onError?.(res?.code || 'whisper-failed'); return; }
        const text = (res.text || '').trim();
        if (!text) { cb.onError?.('no-speech'); return; }
        cb.onFinal?.([text]);
      } catch (err) {
        console.error('[voice] תמלול מקומי נכשל:', err);
        cb.onError?.('whisper-failed');
      }
    };

    // ניטור עוצמה לעצירה אוטומטית בשקט
    meterCtx = new AudioContext();
    const analyser = meterCtx.createAnalyser();
    analyser.fftSize = 1024;
    meterCtx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const startedAt = Date.now();
    let heardSpeech = false;
    let quietSince = 0;

    monitor = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const now = Date.now();

      if (!isSilent(rms)) { heardSpeech = true; quietSince = 0; }
      else if (!quietSince) quietSince = now;

      const decision = recordingDecision({
        elapsedMs: now - startedAt,
        heardSpeech,
        quietForMs: quietSince ? now - quietSince : 0,
      });
      if (decision === 'continue') return;
      if (decision === 'no-speech') gaveUp = true;
      stop();
      if (gaveUp) cb.onError?.('no-speech');
    }, 100);

    recorder.start();
    cb.onStart?.();
  })();

  return { stop };
}

/** פותח מיקרופון ומחזיר תמלול, במנוע המתאים לסביבה. */
export function startSpeech(cb: SpeechCallbacks): SpeechSession {
  const backend = speechBackend();
  if (backend === 'localWhisper') return startLocalWhisper(cb);
  if (backend === 'webSpeech') return startWebSpeech(cb);
  cb.onError?.('unsupported');
  return { stop: () => {} };
}
