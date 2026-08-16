import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  cleanWhisperOutput, resolveSttPaths, audioCtxForDuration, wavDurationSeconds,
  MIN_AUDIO_CTX, WHISPER_CTX_FRAMES,
} = require('./whisper.cjs');

// whisper מעבד תמיד חלון של 30 שניות, גם על פקודה בת 2 שניות. במדידה על
// i7-1355U זה עלה 15.8 שניות; צמצום החלון לפי אורך ההקלטה הוריד ל-3.7.
describe('audioCtxForDuration', () => {
  it('פקודה קצרה מקבלת את החלון המינימלי - שם נמדד הזמן הטוב ביותר', () => {
    expect(audioCtxForDuration(2.5)).toBe(MIN_AUDIO_CTX);
  });

  it('לא יורד מתחת ל-256 - שם המודל נשבר ללולאת חזרות ודווקא מאט', () => {
    expect(audioCtxForDuration(0.5)).toBe(MIN_AUDIO_CTX);
    expect(audioCtxForDuration(0)).toBe(MIN_AUDIO_CTX);
  });

  it('אמירה ארוכה מקבלת חלון גדול יותר - אחרת סופה נחתך', () => {
    // 10 שניות: 10/30*1500 = 500 פריימים, ועוד שוליים
    expect(audioCtxForDuration(10)).toBeGreaterThan(MIN_AUDIO_CTX);
    expect(audioCtxForDuration(10)).toBeGreaterThanOrEqual(500);
  });

  it('החלון גדל מונוטונית עם אורך האמירה', () => {
    expect(audioCtxForDuration(12)).toBeGreaterThan(audioCtxForDuration(6));
  });

  it('לא חורג מהחלון המלא של whisper גם על הקלטה ארוכה מ-30 שניות', () => {
    expect(audioCtxForDuration(60)).toBe(WHISPER_CTX_FRAMES);
    expect(audioCtxForDuration(30)).toBe(WHISPER_CTX_FRAMES);
  });

  it('כולל שוליים מעל הנדרש המדויק, כדי שסוף האמירה לא ייחתך', () => {
    const exact = (8 / 30) * 1500;      // 400
    expect(audioCtxForDuration(8)).toBeGreaterThan(exact);
  });
});

describe('wavDurationSeconds', () => {
  it('מחשב אורך לפי גודל הבאפר בניכוי ה-header', () => {
    expect(wavDurationSeconds(44 + 16000 * 2)).toBe(1);        // שנייה אחת
    expect(wavDurationSeconds(44 + 16000 * 2 * 3)).toBe(3);
  });
  it('באפר קטן מ-header מחזיר 0 ולא מספר שלילי', () => {
    expect(wavDurationSeconds(10)).toBe(0);
    expect(wavDurationSeconds(0)).toBe(0);
  });
});

// whisper.cpp מדפיס גם סימוני לא-דיבור בסוגריים ("[BLANK_AUDIO]", "(מוזיקה)").
// אם הם עוברים לפרסור הפקודות, parseVoiceCommand מקבל זבל ומחפש בו כרוז וגובה.
describe('cleanWhisperOutput', () => {
  it('מחזיר פקודה עברית נקייה כמו שהיא', () => {
    expect(cleanWhisperOutput(' בננה תמשיך ל-700 דרום \n')).toBe('בננה תמשיך ל-700 דרום');
  });

  it('מסנן [BLANK_AUDIO] - הפלט הנפוץ ביותר על הקלטה שקטה', () => {
    expect(cleanWhisperOutput('[BLANK_AUDIO]')).toBe('');
  });

  it('מסנן סימוני לא-דיבור בתוך משפט ומשאיר את הפקודה', () => {
    expect(cleanWhisperOutput('(רעש רקע) בננה גובה 120')).toBe('בננה גובה 120');
    expect(cleanWhisperOutput('בננה [מוזיקה] גובה 120')).toBe('בננה גובה 120');
  });

  it('מאחד שורות מרובות לשורה אחת - whisper מפצל לפי מקטעים', () => {
    expect(cleanWhisperOutput('בננה\nתמשיך ל-700 דרום')).toBe('בננה תמשיך ל-700 דרום');
  });

  it('מכווץ רווחים כפולים שנוצרים אחרי הסינון', () => {
    expect(cleanWhisperOutput('בננה   [x]   גובה')).toBe('בננה גובה');
  });

  it('קלט ריק / לא-מחרוזת מחזיר מחרוזת ריקה ולא קורס', () => {
    expect(cleanWhisperOutput('')).toBe('');
    expect(cleanWhisperOutput(null)).toBe('');
    expect(cleanWhisperOutput(undefined)).toBe('');
  });

  it('לא מוחק מקף רגיל בתוך פקודה (ל-700 חייב לשרוד)', () => {
    expect(cleanWhisperOutput('ל-700')).toBe('ל-700');
  });
});

describe('resolveSttPaths', () => {
  const path = require('path');
  const appDir = path.join('C:', 'app');
  const resourcesPath = path.join(appDir, 'resources');
  const base = { appDir, resourcesPath };

  it('בפיתוח מחפש ב-vendor שבתיקיית הפרויקט', () => {
    const p = resolveSttPaths({ ...base, isDev: true, cfg: {} });
    expect(p.dir).toBe(path.join(appDir, 'vendor', 'whisper'));
  });

  it('בגרסה ארוזה מחפש במשאבי ההתקנה', () => {
    const p = resolveSttPaths({ ...base, isDev: false, cfg: {} });
    expect(p.dir).toBe(path.join(resourcesPath, 'whisper'));
  });

  it('config.json → WHISPER_DIR גובר, כדי להחליף מודל בעמדה בלי בנייה מחדש', () => {
    const custom = path.join('D:', 'stt');
    const p = resolveSttPaths({ ...base, isDev: false, cfg: { WHISPER_DIR: custom } });
    expect(p.dir).toBe(custom);
    expect(p.modelPath).toBe(path.join(custom, 'ggml-model.bin'));
  });

  it('config.json → WHISPER_MODEL_PATH גובר על נתיב המודל בלבד', () => {
    const model = path.join('D:', 'm', 'he.bin');
    const p = resolveSttPaths({ ...base, isDev: false, cfg: { WHISPER_MODEL_PATH: model } });
    expect(p.modelPath).toBe(model);
    expect(p.dir).toBe(path.join(resourcesPath, 'whisper'));   // הבינארי נשאר במקומו
  });

  it('מחזיר מועמדים לשם הבינארי - whisper.cpp שינה את השם מ-main ל-whisper-cli', () => {
    const p = resolveSttPaths({ ...base, isDev: true, cfg: {}, platform: 'win32' });
    expect(p.binCandidates.some(c => c.endsWith('whisper-cli.exe'))).toBe(true);
    expect(p.binCandidates.some(c => c.endsWith('main.exe'))).toBe(true);
  });
});
