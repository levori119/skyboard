// בחירת יעד הכתיבה של הקלטת המסך, ומה שכבת הנתק עושה עם העלאות הווידאו.
// אפיון: SCREEN_RECORDING_SPEC.md §7
import { describe, it, expect } from 'vitest';
import {
  pickRecordingMode, shouldResetRecorderBlock, recordingHintKey, recordingUnreachableKey,
  recordingBlockKey,
} from './screenRecording';
import { bypassesOfflineLayer, classifyWrite } from '../offline/policy';

describe('pickRecordingMode', () => {
  it('אפליקציית העמדה כותבת בעצמה - ללא תלות בשרת', () => {
    expect(pickRecordingMode({ hasBridge: true, serverSeesPath: true })).toBe('station');
    expect(pickRecordingMode({ hasBridge: true, serverSeesPath: false })).toBe('station');
  });

  it('דפדפן והשרת רואה את הנתיב → השרת כותב ל-PATH שהוגדר', () => {
    expect(pickRecordingMode({ hasBridge: false, serverSeesPath: true })).toBe('server');
  });

  // המצב שהתקלה הולידה (2026-09-18): דפדפן מול שרת בענן. אין ולא
  // תהיה הגדרה שתגרום ל-Railway לראות `C:\` של עמדה, ולכן הדפדפן
  // כותב בעצמו לתיקייה שהמפעיל בוחר פעם אחת.
  it('דפדפן והשרת אינו רואה את הנתיב → כתיבה לתיקייה מקומית', () => {
    expect(pickRecordingMode({ hasBridge: false, serverSeesPath: false })).toBe('localFolder');
  });

  it('לא ידוע אם השרת רואה (התצורה לא נטענה) → מניחים שרת, כמו קודם', () => {
    expect(pickRecordingMode({ hasBridge: false, serverSeesPath: null })).toBe('server');
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

// ── תקלה מהשדה (2026-09-17): "לא עובד ולא מופיעה שום סיבה" ────────
// ה-switch בתפריט כיסה רק חלק מהסיבות, וכל סיבה אחרת ('forbidden',
// 'alreadyRecording', 'writeFailed', או כל קוד חדש מהשרת) הובילה למחרוזת
// ריקה - כלומר כפתור שלא קורה בו כלום. זה בדיוק מה ש-CLAUDE.md אוסר.
describe('recordingBlockKey', () => {
  it('סיבות מוכרות → מפתח תרגום', () => {
    expect(recordingBlockKey('disabled', 'station')).toBe('screenRec.whyDisabled');
    expect(recordingBlockKey('noPath', 'station')).toBe('screenRec.whyNoPath');
    expect(recordingBlockKey('badPath', 'station')).toBe('screenRec.whyBadPath');
    expect(recordingBlockKey('noBase', 'station')).toBe('screenRec.whyNoBase');
    expect(recordingBlockKey('noCodec', 'station')).toBe('screenRec.whyNoCodec');
    expect(recordingBlockKey('noPermission', 'station')).toBe('screenRec.whyNoPermission');
    expect(recordingBlockKey('configUnavailable', 'station')).toBe('screenRec.whyConfigUnavailable');
    expect(recordingBlockKey('browserNeedsClick', 'server')).toBe('screenRec.whyBrowserNeedsClick');
  });

  it('הנתיב לא נגיש - לפי מי שכותב', () => {
    expect(recordingBlockKey('pathUnreachable', 'station')).toBe('screenRec.whyPathUnreachable');
    expect(recordingBlockKey('pathUnreachable', 'server')).toBe('screenRec.whyPathUnreachableServer');
  });

  it('סיבה שאין לה ניסוח → מחרוזת ריקה, והמסך מציג את הקוד הגולמי', () => {
    expect(recordingBlockKey('forbidden', 'station')).toBe('');
    expect(recordingBlockKey('alreadyRecording', 'station')).toBe('');
    expect(recordingBlockKey('writeFailed', 'server')).toBe('');
    expect(recordingBlockKey(null, 'station')).toBe('');
  });
});

describe('הודעות במצב כתיבה לתיקייה מקומית', () => {
  it('הדפדפן לא תומך ב-API התיקיות (Firefox / Safari)', () => {
    expect(recordingBlockKey('noFolderApi', 'localFolder')).toBe('screenRec.whyNoFolderApi');
  });

  it('המפעיל ביטל את בחירת התיקייה', () => {
    expect(recordingBlockKey('noFolder', 'localFolder')).toBe('screenRec.whyNoFolder');
  });

  it('במצב הזה הנתיב שבניהול הטכני אינו רלוונטי, ולכן גם לא הכשלים שלו', () => {
    expect(recordingBlockKey('noPath', 'localFolder')).toBe('');
    expect(recordingBlockKey('badPath', 'localFolder')).toBe('');
    expect(recordingBlockKey('pathUnreachable', 'localFolder')).toBe('');
  });

  it('כבויה בבסיס - הודעה זהה בכל המצבים', () => {
    expect(recordingBlockKey('disabled', 'localFolder')).toBe('screenRec.whyDisabled');
  });
});
