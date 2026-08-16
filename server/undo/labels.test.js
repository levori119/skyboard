import { describe, it, expect } from 'vitest';
import { labelFor, entityFromPath } from './labels.js';
import { isUndoableRequest } from '../middleware/actionContext.js';
import { denyReason, DENIED_TABLES, UNDO_DENYLIST } from '../db/undoJournal.js';

describe('תוויות הפעולה', () => {
  it('נתיב מוכר מקבל את התווית שלו', () => {
    expect(labelFor('DELETE', '/api/strips/42').key).toBe('undo.deleteStrip');
    expect(labelFor('POST', '/api/strips').key).toBe('undo.createStrip');
    expect(labelFor('PUT', '/api/strips/42').key).toBe('undo.updateStrip');
  });

  it('הכלל הראשון שמתאים מנצח — נתיב ספציפי לפני תחילית רחבה', () => {
    // הערת סקטור לפני הכלל הכללי של סקטורים
    expect(labelFor('PUT', '/api/sectors/3/notes').key).toBe('undo.sectorNote');
    expect(labelFor('POST', '/api/sectors').key).toBe('undo.sector');
    // סטטוס טיסה לפני הכלל הכללי של מטוסים
    expect(labelFor('PUT', '/api/strip-aircraft/abc/2/flight-status').key).toBe('undo.flightStatus');
    expect(labelFor('PUT', '/api/strip-aircraft/abc/2').key).toBe('undo.updateAircraft');
  });

  it('שאילתת query אינה משבשת התאמה', () => {
    expect(labelFor('DELETE', '/api/strips/42?force=1').key).toBe('undo.deleteStrip');
  });

  it('נתיב לא מוכר עדיין ניתן לביטול — תווית גנרית ולא כישלון', () => {
    const l = labelFor('DELETE', '/api/route-links/9');
    expect(l.key).toBe('undo.deleteEntity');
    expect(l.params.entity).toBe('routeLinks');
  });

  it('שם ישות נגזר מהנתיב ב-camelCase', () => {
    expect(entityFromPath('/api/strip-zone-assignments/3')).toBe('stripZoneAssignments');
    expect(entityFromPath('/api/blocks')).toBe('blocks');
  });
});

describe('אילו בקשות פותחות פעולה', () => {
  const req = (method, path, role = 'user') => ({ method, path, user: { role } });

  it('כתיבה של מפעיל מזוהה — כן', () => {
    expect(isUndoableRequest(req('POST', '/api/strips'))).toBe(true);
    expect(isUndoableRequest(req('DELETE', '/api/strips/1', 'admin'))).toBe(true);
  });

  it('קריאה — לא', () => {
    expect(isUndoableRequest(req('GET', '/api/strips'))).toBe(false);
  });

  it('הביטול עצמו — לא (אחרת זו חזרה קדימה, שאינה בהיקף)', () => {
    expect(isUndoableRequest(req('POST', '/api/undo/abc'))).toBe(false);
  });

  it('הזדהות, מושב עמדה, שו"ב חיצוני ותמונ"א — לא פעולות מפעיל', () => {
    expect(isUndoableRequest(req('POST', '/api/auth/mirage-login'))).toBe(false);
    expect(isUndoableRequest(req('POST', '/api/station-sessions'))).toBe(false);
    expect(isUndoableRequest(req('POST', '/api/gapi/inbound'))).toBe(false);
    expect(isUndoableRequest(req('POST', '/api/air-picture/config'))).toBe(false);
  });

  it('שירות עמית ונהג — אין להם עמדה עם CTRL+Z', () => {
    expect(isUndoableRequest(req('POST', '/api/strips', 'service'))).toBe(false);
    expect(isUndoableRequest(req('POST', '/api/vehicle-requests', 'driver'))).toBe(false);
  });

  it('בקשה בלי זהות — לא', () => {
    expect(isUndoableRequest({ method: 'POST', path: '/api/strips' })).toBe(false);
  });
});

describe('רשימת החסימה', () => {
  it('העברות עמדה ו-GAPI חסומות (החלטת אפיון §2)', () => {
    expect(denyReason('strip_transfers')).toBeTruthy();
    expect(denyReason('gapi_outbox')).toBeTruthy();
  });

  it('היומן אינו יכול לבטל את עצמו', () => {
    expect(denyReason('activity_log')).toBeTruthy();
    expect(denyReason('undo_journal')).toBeTruthy();
    expect(denyReason('undo_actions')).toBeTruthy();
  });

  it('מידע שדה רגיל אינו חסום', () => {
    expect(denyReason('strips')).toBeNull();
    expect(denyReason('map_zones')).toBeNull();
    expect(denyReason('sticky_notes')).toBeNull();
  });

  it('לכל חסימה יש נימוק כתוב, ואין כפילויות', () => {
    for (const [table, why] of UNDO_DENYLIST) {
      expect(typeof table).toBe('string');
      expect(String(why).length).toBeGreaterThan(5);
    }
    expect(new Set(DENIED_TABLES).size).toBe(DENIED_TABLES.length);
  });
});
