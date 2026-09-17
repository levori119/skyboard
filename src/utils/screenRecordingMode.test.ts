// בחירת יעד הכתיבה של הקלטת המסך, ומה שכבת הנתק עושה עם העלאות הווידאו.
// אפיון: SCREEN_RECORDING_SPEC.md §7
import { describe, it, expect } from 'vitest';
import { pickRecordingMode, shouldResetRecorderBlock } from './screenRecording';
import { bypassesOfflineLayer, classifyWrite } from '../offline/policy';

describe('pickRecordingMode', () => {
  it('עמדת Electron כותבת בעצמה, דפדפן דרך השרת', () => {
    expect(pickRecordingMode(true)).toBe('station');
    expect(pickRecordingMode(false)).toBe('server');
  });
});

describe('העלאות ההקלטה מול שכבת הנתק', () => {
  it('עוקפות את השכבה - נתח שנכשל אינו עדות שהשרת נפל', () => {
    expect(bypassesOfflineLayer('/api/screen-recording/sessions')).toBe(true);
    expect(bypassesOfflineLayer('/api/screen-recording/sessions/abc/chunk')).toBe(true);
    expect(bypassesOfflineLayer('http://10.0.0.5:3001/api/screen-recording/sessions/abc/chunk')).toBe(true);
  });

  it('התצורה עצמה **כן** עוברת בשכבה - היא קריאה רגילה שנענית מה-cache', () => {
    expect(bypassesOfflineLayer('/api/screen-recording/config/11')).toBe(false);
  });

  it('נתח נזרק ולא נכנס ל-outbox - אין שום טעם לשחזר וידאו אחרי נתק', () => {
    expect(classifyWrite('/api/screen-recording/sessions/abc/chunk', 'POST')).toBe('drop');
    expect(classifyWrite('/api/screen-recording/sessions', 'POST')).toBe('drop');
  });

  it('הגדרת הבסיס בניהול הטכני נשארת חסומה בנתק', () => {
    expect(classifyWrite('/api/screen-recording/bases/11', 'PUT')).toBe('shared');
  });
});

// ── תקלה מהשדה (2026-09-16): הודעת הכשל נשארה תקועה ─────────────
// הנתיב תוקן בניהול הטכני, אבל העמדה המשיכה להציג את הסיבה מהניסיון
// הקודם - ולכן נראה ש"זה לא עובד" גם אחרי שהתקלה נפתרה. הכשל שמוצג
// חייב להיות של **התצורה הנוכחית**, אחרת הוא מטעה גרוע משתיקה.
describe('shouldResetRecorderBlock', () => {
  it('הנתיב הוחלף וההקלטה אינה רצה → מנקים ומנסים מחדש', () => {
    expect(shouldResetRecorderBlock('D:/REC', 'C:/REC', false)).toBe(true);
    expect(shouldResetRecorderBlock('', 'C:/REC', false)).toBe(true);
    expect(shouldResetRecorderBlock('C:/REC', '', false)).toBe(true);
  });

  it('אותו נתיב → לא נוגעים (אחרת כל דגימה היתה מוחקת את הסיבה מהמסך)', () => {
    expect(shouldResetRecorderBlock('C:/REC', 'C:/REC', false)).toBe(false);
  });

  it('באמצע הקלטה → לא מאפסים, גם אם התצורה שונתה', () => {
    expect(shouldResetRecorderBlock('D:/REC', 'C:/REC', true)).toBe(false);
  });
});
