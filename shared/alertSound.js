// צליל התרעה - **מקור אמת יחיד** לאפליקציית הנהג (/driver/alertSound.js) ולעמדה
// (התראות ניהול הנסיעות במגדל).
//
// ⚠️ **למה הקובץ הזה קיים** (תקלה מהשדה, 2026-09-22): ההתרעה הקופצת עלתה אצל
// הנהג בלי שום צליל. שלוש סיבות, וכולן בקוד הישן של driver.html:
//
//   1. **AudioContext חדש בכל התרעה.** לדפדפן יש תקרה (~6 ב-Chrome) של הקשרי
//      אודיו פתוחים לעמוד. מהשביעי `new AudioContext()` זורק, ה-try/catch בלע
//      את החריגה - והתרעות פשוט השתתקו. כאן יש הקשר **אחד**, שנוצר פעם אחת.
//   2. **מדיניות ההפעלה האוטומטית.** הקשר שנוצר בלי מגע משתמש נולד `suspended`,
//      ו-`osc.start()` בתוכו לא משמיע דבר ולא זורק. לכן `unlockAudio()` נקראת
//      במגע הראשון (לחיצה על "הפעל נסיעה", וגם כל מגע במסך), ו-`resume()` נקרא
//      לפני כל השמעה.
//   3. **ההקראה ננעלה מאותה סיבה.** `speechSynthesis` בנייד דורש מגע קודם, ולכן
//      ה-unlock משמיע גם הקראה ריקה שפותחת את המנוע.
//
// `audioState()` מחזיר מה מצב הצליל בפועל, כדי שהמסך יוכל לומר לנהג "הקש
// לאישור צלילים" במקום להיראות תקין ולהיות אילם.
//
// ES module בלי תלויות: נטען ב-Node, ב-vitest, בעמדה (Vite) ובדף הנהג.

/** טון = כמה צפצופים, באיזה גובה ובאיזה גל. `freq` מערך = צליל עולה. */
export const TONES = Object.freeze({
  /** עצור - מסלול טיסה, אלמנט שסוגר את הדרך. חד ובולט. */
  stop: Object.freeze({ freq: 880, type: 'square', beeps: 4, len: 0.25, gap: 0.35, gain: 0.4 }),
  /** זהירות - מסלול הסעה, סטייה מהנתיב. נמוך יותר, שניים בלבד. */
  caution: Object.freeze({ freq: 660, type: 'square', beeps: 2, len: 0.25, gap: 0.35, gain: 0.4 }),
  /** נפתח - רמזור ירוק. **חייב** להישמע אחרת מ"עצור": צליל עולה, גל רך. */
  clear: Object.freeze({ freq: [660, 990], type: 'sine', beeps: 2, len: 0.18, gap: 0.2, gain: 0.35 }),
  /** הודעה - משהו ממתין להכרעה במגדל. צפצוף בודד, לא מבהיל. */
  notify: Object.freeze({ freq: 760, type: 'sine', beeps: 1, len: 0.16, gap: 0.2, gain: 0.3 }),
});

/** סוג ההתרעה (נהג ומגדל) → שם הטון */
export const ALERT_TONE_BY_KIND = Object.freeze({
  runway: 'stop', element: 'stop', blocked: 'stop',
  taxiway: 'caution', deviation: 'caution',
  cleared: 'clear',
});

export function toneOf(name) {
  return TONES[name] || TONES.notify;
}

/** הטון → רשימת צפצופים `{at, freq, len, gain, type}`. פונקציה טהורה, נבדקת. */
export function beepSchedule(tone) {
  const t = tone || TONES.notify;
  const freqs = Array.isArray(t.freq) ? t.freq : null;
  const out = [];
  for (let i = 0; i < t.beeps; i++) {
    out.push({
      at: i * t.gap,
      // בצליל עולה הגובה נפרס על פני הצפצופים; אחרת כולם באותו גובה
      freq: freqs ? freqs[Math.min(i, freqs.length - 1)] : t.freq,
      len: t.len, gain: t.gain, type: t.type,
    });
  }
  return out;
}

// ── הצד שנוגע בדפדפן ─────────────────────────────────────────────────────────

let ctx = null;
let ctxFailed = false;

const AC = () => (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) || null;

/** ההקשר היחיד. נוצר פעם אחת ולא נסגר - ראה סיבה 1 למעלה. */
function audioCtx() {
  if (ctx || ctxFailed) return ctx;
  const Ctor = AC();
  if (!Ctor) { ctxFailed = true; return null; }
  try { ctx = new Ctor(); } catch { ctxFailed = true; }
  return ctx;
}

/** `unsupported` | `blocked` (נוצר ונחסם) | `suspended` (ממתין למגע) | `running` */
export function audioState() {
  if (!AC()) return 'unsupported';
  if (ctxFailed) return 'blocked';
  if (!ctx) return 'suspended';
  return ctx.state === 'running' ? 'running' : 'suspended';
}

/**
 * לקרוא **מתוך מגע משתמש** (לחיצה/נגיעה). פותח את ההקשר ואת מנוע ההקראה.
 * בטוח לקריאה חוזרת.
 */
export function unlockAudio() {
  const c = audioCtx();
  if (c && c.state !== 'running') { try { c.resume(); } catch { /* נשאר suspended */ } }
  if (typeof speechSynthesis !== 'undefined') {
    try {
      // הקראה ריקה פותחת את המנוע בנייד בלי להשמיע דבר
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch { /* אין הקראה - הצפצוף לבדו */ }
  }
  return audioState();
}

/** משמיע טון לפי שם. מחזיר true אם הושמע בפועל. */
export function playTone(name) {
  const c = audioCtx();
  if (!c) return false;
  if (c.state !== 'running') { try { c.resume(); } catch { /* ננסה בכל זאת */ } }
  try {
    const t0 = c.currentTime;
    for (const b of beepSchedule(toneOf(name))) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain); gain.connect(c.destination);
      osc.type = b.type;
      osc.frequency.value = b.freq;
      const at = t0 + b.at;
      gain.gain.setValueAtTime(b.gain, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + b.len);
      osc.start(at); osc.stop(at + b.len);
    }
    return c.state === 'running';
  } catch {
    return false;
  }
}

/** הקראה בעברית. שקט כשאין מנוע או קול. */
export function speakAlert(text, opts = {}) {
  if (!text || typeof speechSynthesis === 'undefined') return false;
  try {
    speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = opts.lang || 'he-IL';
    msg.rate = opts.rate ?? 0.85;
    msg.volume = opts.volume ?? 1;
    speechSynthesis.speak(msg);
    return true;
  } catch {
    return false;
  }
}

/** צפצוף + הקראה - מה שהמסכים קוראים לו בפועל. */
export function alertSound(name, text, opts = {}) {
  const played = playTone(name);
  if (text) speakAlert(text, opts);
  return played;
}
