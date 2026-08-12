// מנוע התמלול המקומי של העמדה - whisper.cpp + מודל עברית של ivrit-ai.
//
// למה מקומי: ה-Web Speech API של Chromium נשען על שירות ענן של גוגל שהמפתחות
// אליו קומפלו רק לתוך Chrome, ולכן ב-Electron הוא נכשל מיד ב-'network'
// (electron/electron#46143). כאן מתמללים בעמדה עצמה - **האודיו לא עוזב אותה**,
// וזו גם התשובה לסקר האבטחה.
//
// למה בינארי ולא מודול native של node: whisper.cpp מפרסם בינארי Windows מוכן,
// ולכן אין קומפילציה מול ה-ABI של Electron ואין rebuild בכל שדרוג גרסה.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MODEL_FILE = 'ggml-model.bin';
const TRANSCRIBE_TIMEOUT_MS = 60000;

let counter = 0;   // מבדיל בין קבצים זמניים של תמלולים עוקבים

// ── חלון האודיו (audio context) ───────────────────────────────────────────────
// whisper מעבד תמיד חלון של 30 שניות (1500 פריימים), גם כשהאמירה בת 2 שניות -
// ובמדידה על i7-1355U זה עלה 15.8 שניות לפקודה של 2.5 שניות. צמצום החלון לפי
// אורך ההקלטה בפועל הוריד את זה ל-3.7 שניות (פי 4.3).
//
// ⚠️ למה יש רצפה של 256: במדידה, ac=128 שבר את המודל ללולאת חזרות
// ("בנונה 120, בנונה 120, ...") ודווקא היה איטי יותר. לא לרדת מתחת לזה.
const WHISPER_CTX_FRAMES = 1500;    // = 30 שניות
const WHISPER_WINDOW_SEC = 30;
const MIN_AUDIO_CTX = 256;
const CTX_MARGIN = 1.5;             // שוליים, כדי שסוף האמירה לא ייחתך

/** אורך WAV (PCM16 מונו 16kHz) בשניות, לפי גודל הבאפר. */
function wavDurationSeconds(byteLength, sampleRate = 16000) {
  const dataBytes = Math.max(0, byteLength - 44);
  return dataBytes / 2 / sampleRate;
}

/** כמה פריימים של חלון אודיו נדרשים לאמירה באורך נתון. פונקציה טהורה. */
function audioCtxForDuration(seconds) {
  const needed = (seconds / WHISPER_WINDOW_SEC) * WHISPER_CTX_FRAMES * CTX_MARGIN;
  return Math.min(WHISPER_CTX_FRAMES, Math.max(MIN_AUDIO_CTX, Math.ceil(needed)));
}

/**
 * whisper.cpp מוציא גם סימוני לא-דיבור בסוגריים ("[BLANK_AUDIO]", "(מוזיקה)"),
 * ואלה היו מגיעים כזבל אל parseVoiceCommand. פונקציה טהורה - ראה whisper.test.js.
 */
function cleanWhisperOutput(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\[[^\]]*\]/g, ' ')     // [BLANK_AUDIO] וכל סימון בסוגריים מרובעים
    .replace(/\([^)]*\)/g, ' ')      // (מוזיקה), (רעש רקע)
    .replace(/\s+/g, ' ')            // שורות ומקטעים → משפט אחד
    .trim();
}

/**
 * איפה יושבים הבינארי והמודל.
 * cfg (מתוך config.json של העמדה) גובר, כדי שאפשר יהיה להחליף מודל בעמדה
 * בלי לבנות מתקין חדש.
 */
function resolveSttPaths({ isDev, appDir, resourcesPath, cfg = {}, platform = process.platform }) {
  const dir = (cfg.WHISPER_DIR && String(cfg.WHISPER_DIR).trim())
    || (isDev ? path.join(appDir, 'vendor', 'whisper') : path.join(resourcesPath, 'whisper'));
  const modelPath = (cfg.WHISPER_MODEL_PATH && String(cfg.WHISPER_MODEL_PATH).trim())
    || path.join(dir, MODEL_FILE);
  // whisper.cpp שינה את שם הבינארי מ-main ל-whisper-cli בגרסה 1.7.2 - תומכים בשניהם
  const exe = platform === 'win32' ? '.exe' : '';
  return {
    dir,
    modelPath,
    binCandidates: [path.join(dir, `whisper-cli${exe}`), path.join(dir, `main${exe}`)],
  };
}

function findBinary(paths) {
  return paths.binCandidates.find(p => fs.existsSync(p)) || null;
}

/** בדיקת מוכנות - מה בדיוק חסר, כדי שההודעה בעמדה תהיה מדויקת. */
function sttStatus(paths) {
  if (!findBinary(paths)) return { ok: false, code: 'stt-missing-binary' };
  if (!fs.existsSync(paths.modelPath)) return { ok: false, code: 'stt-missing-model' };
  return { ok: true };
}

/**
 * מתמלל WAV (16kHz מונו PCM16) ומחזיר { ok, text } או { ok:false, code }.
 * לא זורק - כל כשל חוזר כקוד שהמסך מתרגם להודעה בעברית.
 */
async function transcribeWav(wavBuffer, paths) {
  const status = sttStatus(paths);
  if (!status.ok) return status;

  const bin = findBinary(paths);
  const tmpWav = path.join(os.tmpdir(), `skyking-stt-${process.pid}-${counter++}.wav`);
  try {
    await fs.promises.writeFile(tmpWav, wavBuffer);
  } catch (err) {
    console.error('[stt] כתיבת קובץ זמני נכשלה:', err.message);
    return { ok: false, code: 'stt-failed' };
  }

  // -l he      שפה עברית (בלי זה whisper מנחש, ולעיתים מתרגם לאנגלית)
  // -nt        בלי חותמות זמן
  // -np        בלי הדפסות מערכת - כדי ש-stdout יהיה הטקסט בלבד
  // -t         חוטי CPU; משאירים ליבה למערכת כדי שהמסך לא ייתקע בזמן תמלול
  // -bo/-bs 1  פענוח חמדני. פקודה תפעולית קצרה וחד-משמעית - beam search לא
  //            שיפר את התוצאה במדידה, רק עלה זמן
  // -fa        flash attention; לבדו לא עוזר, אבל בשילוב עם -ac הוא חלק מהרווח
  // -ac        חלון האודיו לפי אורך האמירה - הרווח הגדול ביותר (ראה למעלה)
  const threads = Math.max(2, Math.min(8, (os.cpus()?.length || 4) - 1));
  const audioCtx = audioCtxForDuration(wavDurationSeconds(wavBuffer.length));
  const args = [
    '-m', paths.modelPath, '-f', tmpWav, '-l', 'he', '-nt', '-np',
    '-t', String(threads), '-bo', '1', '-bs', '1', '-fa', '-ac', String(audioCtx),
  ];

  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fs.promises.unlink(tmpWav).catch(() => {});
      resolve(result);
    };

    let child;
    try {
      child = spawn(bin, args, { windowsHide: true });
    } catch (err) {
      console.error('[stt] הרצת המנוע נכשלה:', err.message);
      done({ ok: false, code: 'stt-failed' });
      return;
    }

    const timer = setTimeout(() => {
      console.error(`[stt] תמלול חרג מ-${TRANSCRIBE_TIMEOUT_MS}ms - נהרג`);
      try { child.kill(); } catch { /* כבר מת */ }
      done({ ok: false, code: 'stt-timeout' });
    }, TRANSCRIBE_TIMEOUT_MS);

    child.stdout.on('data', d => { stdout += d.toString('utf8'); });
    child.stderr.on('data', d => { stderr += d.toString('utf8'); });
    child.on('error', err => {
      console.error('[stt] שגיאת תהליך:', err.message);
      done({ ok: false, code: 'stt-failed' });
    });
    child.on('close', code => {
      if (code !== 0) {
        console.error(`[stt] המנוע יצא בקוד ${code}: ${stderr.slice(-500)}`);
        done({ ok: false, code: 'stt-failed' });
        return;
      }
      done({ ok: true, text: cleanWhisperOutput(stdout) });
    });
  });
}

module.exports = {
  cleanWhisperOutput, resolveSttPaths, sttStatus, transcribeWav,
  audioCtxForDuration, wavDurationSeconds,
  MODEL_FILE, MIN_AUDIO_CTX, WHISPER_CTX_FRAMES,
};
