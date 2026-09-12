// ניהול נסיעות - הפונקציות הטהורות שהחלון נשען עליהן.
//
// אין jsdom בפרויקט, ולכן לא נבדק כאן רינדור אלא ההכרעות עצמן: פיצול מועד
// היציאה לתאריך ולשעה וחזרה, והמצביע שאומר **איזה נתיב נבחר** - שתיהן
// נגזרות שהמפעיל רואה בעיניים ושבאג בהן אינו מתגלה ב-tsc.

import { describe, it, expect } from 'vitest';
import { joinLocalDateTime, savedRouteSig, splitLocalDateTime } from './TripsManagementWindow';
import { routeSignature } from '../../utils/trips';

describe('מועד היציאה - עמודה אחת, שני שדות', () => {
  it('פיצול וחיבור חוזרים לאותו רגע', () => {
    const iso = joinLocalDateTime('2026-09-12', '11:50');
    expect(iso).toBeTruthy();
    expect(splitLocalDateTime(iso)).toEqual({ date: '2026-09-12', time: '11:50' });
  });

  // `datetime-local` הוא שעון מקומי, ו-toISOString מזיז לפי אזור הזמן. בלי
  // המרה הלוך-ושוב נכונה השעה בטופס זזה בכל פתיחה מחדש.
  it('שומר את השעה המקומית ולא מזיז אותה באזור הזמן', () => {
    const local = new Date('2026-09-12T11:50:00');
    expect(joinLocalDateTime('2026-09-12', '11:50')).toBe(local.toISOString());
  });

  it('תאריך בלי שעה = תחילת היום', () => {
    expect(splitLocalDateTime(joinLocalDateTime('2026-09-12', ''))).toEqual({ date: '2026-09-12', time: '00:00' });
  });

  // שעה של איזה יום? בלי תאריך אין מועד, ולא ניחוש
  it('שעה בלי תאריך אינה מועד', () => {
    expect(joinLocalDateTime('', '11:50')).toBeNull();
  });

  it('ערך ריק או שבור מחזיר שדות ריקים ולא מפיל', () => {
    expect(splitLocalDateTime(null)).toEqual({ date: '', time: '' });
    expect(splitLocalDateTime('לא תאריך')).toEqual({ date: '', time: '' });
  });
});

describe('המצביע לנתיב שנבחר', () => {
  it('נסיעה עם נתיב שמור מצביעה עליו', () => {
    const sig = savedRouteSig([3, 7], 'כיבוי -> תחילת 15');
    expect(sig).toBe(routeSignature({ route_ids: [3, 7], label: 'כיבוי -> תחילת 15' }));
  });

  // זה הלב: מצביע ריק = **אף שורה אינה מסומנת**. ערך כמו "|" היה מסמן את
  // האפשרות הריקה, ובשטח זה נראה כאילו נבחר נתיב שאיש לא בחר.
  it('נסיעה בלי נתיב שמור מקבלת מצביע ריק', () => {
    expect(savedRouteSig([], '')).toBe('');
  });

  it('תווית בלי מסלולים עדיין נחשבת בחירה', () => {
    expect(savedRouteSig([], 'דרך שנשמרה')).not.toBe('');
  });
});
