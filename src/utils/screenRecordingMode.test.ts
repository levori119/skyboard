// בחירת יעד הכתיבה של הקלטת המסך, ומה שכבת הנתק עושה עם העלאות הווידאו.
// אפיון: SCREEN_RECORDING_SPEC.md §7
import { describe, it, expect } from 'vitest';
import {
  pickRecordingMode, shouldResetRecorderBlock, recordingHintKey, recordingUnreachableKey,
} from './screenRecording';
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

// ── תקלה מהשדה (2026-09-17): "היעד C:\\ אינו קיים בעמדה הזו" ───────
// ההקלטה רצה בדפדפן מול השרת בענן, ולכן מי שלא מוצא את `C:\\` הוא
// **השרת** ולא העמדה. הודעה שאומרת "בעמדה הזו" שולחת לבדוק את
// המכונה הלא נכונה - וזה בדיוק מה שקרה.
describe('recordingHintKey', () => {
  it('מצב עמדה - הודעה על העמדה', () => {
    expect(recordingHintKey('missing', 'station')).toBe('screenRec.pathErrMissing');
    expect(recordingHintKey('perm', 'station')).toBe('screenRec.pathErrPerm');
  });

  it('מצב שרת - הודעה על השרת', () => {
    expect(recordingHintKey('missing', 'server')).toBe('screenRec.pathErrMissingServer');
    expect(recordingHintKey('perm', 'server')).toBe('screenRec.pathErrPermServer');
    expect(recordingHintKey('network', 'server')).toBe('screenRec.pathErrNetworkServer');
    expect(recordingHintKey('space', 'server')).toBe('screenRec.pathErrSpaceServer');
  });

  it("'other' ו-null אינם מיוצגים", () => {
    expect(recordingHintKey('other', 'station')).toBe('');
    expect(recordingHintKey(null, 'server')).toBe('');
  });
});

describe('recordingUnreachableKey', () => {
  it('מי לא מצא את הנתיב - העמדה או השרת', () => {
    expect(recordingUnreachableKey('station')).toBe('screenRec.whyPathUnreachable');
    expect(recordingUnreachableKey('server')).toBe('screenRec.whyPathUnreachableServer');
  });
});
