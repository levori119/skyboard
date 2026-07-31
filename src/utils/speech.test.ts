import { describe, it, expect } from 'vitest';
import {
  recordingDecision, isSilent, micErrorCode,
  SILENCE_RMS, SILENCE_HOLD_MS, NO_SPEECH_MS, MAX_RECORD_MS,
} from './speech';

// whisper הוא מנוע batch ולא עוצר לבד בסוף משפט, ולכן אנחנו מחליטים מתי לסגור
// את ההקלטה. אלה הכללים שקובעים אם הבקר ייחתך באמצע פקודה - הלוגיקה הרגישה
// ביותר בפיצ'ר, ולכן היא פונקציה טהורה עם בדיקות.
describe('recordingDecision', () => {
  it('ממשיך להקליט כל עוד מדברים', () => {
    expect(recordingDecision({ elapsedMs: 2000, heardSpeech: true, quietForMs: 0 })).toBe('continue');
  });

  it('סוגר אחרי שקט רצוף שעבר את הסף', () => {
    expect(recordingDecision({ elapsedMs: 3000, heardSpeech: true, quietForMs: SILENCE_HOLD_MS })).toBe('stop');
  });

  it('לא סוגר על הפסקה טבעית קצרה באמצע פקודה ("בננה... תמשיך ל-700 דרום")', () => {
    expect(recordingDecision({ elapsedMs: 3000, heardSpeech: true, quietForMs: SILENCE_HOLD_MS - 1 })).toBe('continue');
  });

  it('ממתין בסבלנות לפני שהבקר התחיל לדבר - שקט לפני דיבור אינו סוף פקודה', () => {
    // המקרה שהיה שובר: הבקר לוחץ, לוקח רגע, ואז מדבר. אסור לסגור בינתיים.
    expect(recordingDecision({ elapsedMs: 3000, heardSpeech: false, quietForMs: 3000 })).toBe('continue');
  });

  it('מוותר אם לא נקלט דיבור כלל בתוך חלון ההמתנה', () => {
    expect(recordingDecision({ elapsedMs: NO_SPEECH_MS + 1, heardSpeech: false, quietForMs: 9999 })).toBe('no-speech');
  });

  it('רשת ביטחון: סוגר בכל מקרה בתקרת ההקלטה, גם אם עדיין מדברים', () => {
    expect(recordingDecision({ elapsedMs: MAX_RECORD_MS, heardSpeech: true, quietForMs: 0 })).toBe('stop');
  });

  it('תקרת ההקלטה לא מופעלת כשעוד לא נקלט דיבור - שם התשובה היא no-speech', () => {
    expect(recordingDecision({ elapsedMs: MAX_RECORD_MS + 5000, heardSpeech: false, quietForMs: 1 })).toBe('no-speech');
  });
});

describe('isSilent', () => {
  it('רעש רקע של חדר בקרה נחשב שקט', () => {
    expect(isSilent(SILENCE_RMS - 0.001)).toBe(true);
  });
  it('דיבור אינו שקט', () => {
    expect(isSilent(SILENCE_RMS)).toBe(false);
    expect(isSilent(0.2)).toBe(false);
  });
  it('אפס מוחלט (מיקרופון מושתק) הוא שקט', () => {
    expect(isSilent(0)).toBe(true);
  });
});

describe('micErrorCode', () => {
  it('מתרגם דחיית הרשאה לקוד שהמסך יודע להציג', () => {
    expect(micErrorCode('NotAllowedError')).toBe('not-allowed');
    expect(micErrorCode('SecurityError')).toBe('not-allowed');
  });
  it('מתרגם היעדר מיקרופון', () => {
    expect(micErrorCode('NotFoundError')).toBe('audio-capture');
  });
  it('שגיאה לא מוכרת נופלת לקוד גנרי ולא לundefined', () => {
    expect(micErrorCode('SomethingElseError')).toBe('mic-failed');
    expect(micErrorCode('')).toBe('mic-failed');
  });
});
