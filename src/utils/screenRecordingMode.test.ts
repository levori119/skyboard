// בחירת יעד הכתיבה של הקלטת המסך, ומה שכבת הנתק עושה עם העלאות הווידאו.
// אפיון: SCREEN_RECORDING_SPEC.md §7
import { describe, it, expect } from 'vitest';
import { pickRecordingMode } from './screenRecording';
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
