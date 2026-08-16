import { describe, it, expect, beforeEach } from 'vitest';
import { dwDefault, dwNormalize, dwEvaluate, dwMergeSession, dwNextMode, dwStripLabel, dwSubscribe, dwSaveSession, dwLoadSession, DW_MODES } from './dataWindows';
import type { DataWindowDef } from './dataWindows';
import type { QGroup } from '../types';

const q = (field: string, compare: any, value: string): QGroup =>
  ({ id: 'g', type: 'group', operator: 'all', children: [{ id: 'l', type: 'leaf', field, compare, value }] });

const win = (over: Partial<DataWindowDef> = {}): DataWindowDef => ({ ...dwDefault(), ...over });

describe('dwEvaluate', () => {
  const strips = [
    { id: 1, callsign: 'חנית', strip_type: 'מסוק', number_of_formation: '2' },
    { id: 2, callsign: 'ברק',  strip_type: 'מסוק', number_of_formation: '4' },
    { id: 3, callsign: 'כסף',  strip_type: 'קרב',  number_of_formation: '2' },
  ];

  it('סופר פ"מים שתואמים לשאילתא ומחזיר את האו"קים לפי הסדר', () => {
    const res = dwEvaluate(strips, win({ query: q('strip_type', 'contains', 'מסוק') }));
    expect(res.count).toBe(2);
    expect(res.callsigns).toEqual(['חנית', 'ברק']);
  });

  it('ספירה לפי מטוסים ולא לפי פ"מים', () => {
    const res = dwEvaluate(strips, win({ query: q('strip_type', 'contains', 'מסוק'), count_by: 'aircraft' }));
    expect(res.count).toBe(6);
  });

  it('מצבה חסרה או לא מספרית נספרת כמטוס אחד', () => {
    const odd = [{ id: 9, callsign: 'דרור', strip_type: 'מסוק' }, { id: 10, callsign: 'עיט', strip_type: 'מסוק', number_of_formation: 'זוג' }];
    expect(dwEvaluate(odd, win({ query: q('strip_type', 'contains', 'מסוק'), count_by: 'aircraft' })).count).toBe(2);
  });

  it('חלון בלי שאילתא הוא חלון לא מוגדר - 0 ולא "כל הפ"מים"', () => {
    const res = dwEvaluate(strips, win({ query: null }));
    expect(res.unconfigured).toBe(true);
    expect(res.count).toBe(0);
    expect(res.callsigns).toEqual([]);
  });

  it('מעביר את ה-ctx למנוע השאילתות (עכשיו / הבסיס שלי)', () => {
    const NOW = Date.parse('2026-08-05T10:00:00Z');
    const soon = [{ id: 1, callsign: 'כסף', landing_airfield_id: 3, planned_landing_time: new Date(NOW + 8 * 60000).toISOString() }];
    const w = win({ query: { id: 'g', type: 'group', operator: 'all', children: [
      { id: 'a', type: 'leaf', field: 'lands_at_my_base', compare: 'eq', value: 'כן' },
      { id: 'b', type: 'leaf', field: 'planned_landing_time', compare: 'lt', value: '15' },
    ]}});
    expect(dwEvaluate(soon, w, { now: NOW, myBaseId: 3 }).count).toBe(1);
    expect(dwEvaluate(soon, w, { now: NOW, myBaseId: 7 }).count).toBe(0);
    // שעה לפני כן אותה נחיתה עוד רחוקה - 68 דקות, מחוץ לחלון של 15
    expect(dwEvaluate(soon, w, { now: NOW - 60 * 60000, myBaseId: 3 }).count).toBe(0);
  });

  it('מחזיר גם את הפ"מים עצמם, כדי שהחלון יוכל להציג אותם ולא רק לספור', () => {
    const res = dwEvaluate(strips, win({ query: q('strip_type', 'contains', 'מסוק'), mode: 'count_strips' }));
    expect(res.strips.map(s => s.id)).toEqual([1, 2]);
    expect(res.count).toBe(2);
  });

  it('סף אזהרה מסמן חריגה', () => {
    const w = win({ query: q('strip_type', 'contains', 'מסוק'), warn_at: 2 });
    expect(dwEvaluate(strips, w).warn).toBe(true);
    expect(dwEvaluate(strips, win({ query: q('strip_type', 'contains', 'מסוק'), warn_at: 5 })).warn).toBe(false);
    expect(dwEvaluate(strips, win({ query: q('strip_type', 'contains', 'מסוק') })).warn).toBe(false);
  });
});

describe('dwNormalize', () => {
  it('מחזיר מערך ריק לכל קלט שאינו מערך', () => {
    expect(dwNormalize(null)).toEqual([]);
    expect(dwNormalize({} as any)).toEqual([]);
    expect(dwNormalize('[]' as any)).toEqual([]);
  });
  it('משלים ברירות מחדל ומזהה לכל חלון', () => {
    const [w] = dwNormalize([{ title: 'מסוקים באזורים' }]);
    expect(w.title).toBe('מסוקים באזורים');
    expect(w.id).toBeTruthy();
    expect(DW_MODES).toContain(w.mode);
    expect(typeof w.x).toBe('number');
    expect(typeof w.y).toBe('number');
  });
  it('זורק פריטים פגומים ומצב לא מוכר', () => {
    const out = dwNormalize([null, 3, { title: 'תקין', mode: 'לא-קיים' }] as any);
    expect(out).toHaveLength(1);
    expect(out[0].mode).toBe('count');
  });
  it('שומר על שאילתא ועל מיקום', () => {
    const [w] = dwNormalize([{ id: 'a', title: 't', x: 40, y: 55, query: q('task', 'contains', 'CAP') }]);
    expect(w.x).toBe(40);
    expect(w.y).toBe(55);
    expect(w.query?.children).toHaveLength(1);
  });
});

describe('dwMergeSession', () => {
  const admin = [win({ id: 'a', title: 'מסוקים' }), win({ id: 'b', title: 'קרב חוזרים' })];

  it('בלי שינויי סשן מוחזרת הגדרת העמדה', () => {
    expect(dwMergeSession(admin, null).map(w => w.id)).toEqual(['a', 'b']);
  });
  it('הזזה בלבד לא מקפיאה את שאילתת העמדה - רשומת הסשן היא העתק מלא', () => {
    const adminQ = [win({ id: 'a', title: 'מסוקים', query: q('strip_type', 'contains', 'מסוק') })];
    // הפקח רק הזיז את החלון, ולכן ההעתק בסשן נושא את השאילתא הישנה
    const moved = dwMergeSession(adminQ, [{ ...adminQ[0], x: 400 }] as any);
    expect(moved[0].edited).toBeFalsy();
    // ואחרי שהמנהל שינה את השאילתא - ההזזה נשמרה, השאילתא התעדכנה
    const adminChanged = [win({ id: 'a', title: 'מסוקים', query: q('task', 'contains', 'CAP') })];
    const after = dwMergeSession(adminChanged, [{ ...adminQ[0], x: 400 }] as any);
    expect(after[0].x).toBe(400);
    expect(after[0].query!.children[0]).toMatchObject({ field: 'task' });
  });

  it('הסשן דורס מיקום, מצב והסתרה - והכותרת נשארת של העמדה', () => {
    const merged = dwMergeSession(admin, [{ id: 'a', x: 300, y: 120, mode: 'count_callsigns', hidden: true }] as any);
    const a = merged.find(w => w.id === 'a')!;
    expect(a.x).toBe(300);
    expect(a.mode).toBe('count_callsigns');
    expect(a.hidden).toBe(true);
    expect(a.title).toBe('מסוקים');
    expect(a.edited).toBeFalsy();
  });

  it('הפקח יכול לשנות את השאילתא בסשן, והחלון מסומן כשונה', () => {
    const own = q('task', 'contains', 'CAP');
    const merged = dwMergeSession(admin, [{ id: 'a', query: own, edited: true }] as any);
    const a = merged.find(w => w.id === 'a')!;
    expect(a.query).toEqual(own);
    expect(a.edited).toBe(true);
    // הכותרת ושאר החלונות לא נגעו
    expect(a.title).toBe('מסוקים');
    expect(merged.find(w => w.id === 'b')!.edited).toBeFalsy();
  });

  it('הסרת השינוי מהסשן מחזירה את שאילתת העמדה', () => {
    const withAdminQuery = [win({ id: 'a', title: 'מסוקים', query: q('strip_type', 'contains', 'מסוק') })];
    const edited = dwMergeSession(withAdminQuery, [{ id: 'a', query: q('task', 'contains', 'CAP'), edited: true }] as any);
    expect(edited[0].query!.children[0]).toMatchObject({ field: 'task' });
    const reset = dwMergeSession(withAdminQuery, []);
    expect(reset[0].query!.children[0]).toMatchObject({ field: 'strip_type' });
    expect(reset[0].edited).toBeFalsy();
  });
  it('חלון שהמנהל מחק נעלם גם אם נשאר בסשן', () => {
    const merged = dwMergeSession([admin[0]], [{ id: 'b', x: 10, y: 10 }] as any);
    expect(merged.map(w => w.id)).toEqual(['a']);
  });
  it('חלון שהפקח הוסיף בסשן נשמר', () => {
    const own = win({ id: 'sess_1', title: 'שלי', own: true });
    const merged = dwMergeSession(admin, [own]);
    expect(merged.map(w => w.id)).toEqual(['a', 'b', 'sess_1']);
    expect(merged.find(w => w.id === 'sess_1')!.own).toBe(true);
  });
});

describe('dwStripLabel', () => {
  it('פ"מ רגיל: או"ק/טייסת (מספר מטוסים)', () => {
    expect(dwStripLabel({ callsign: 'כסף', sq: '117', number_of_formation: '2' })).toBe('כסף/117 (2)');
  });
  it('מצבה חסרה - בלי הסוגריים', () => {
    expect(dwStripLabel({ callsign: 'כסף', sq: '117' })).toBe('כסף/117');
  });
  it('בלי טייסת - בלי הלוכסן', () => {
    expect(dwStripLabel({ callsign: 'כסף', number_of_formation: '4' })).toBe('כסף (4)');
  });
  it('פ"מ מפוצל: או"ק+מספר במבנה / טייסת, בלי ספירה', () => {
    expect(dwStripLabel({ callsign: 'כסף', sq: '117', aircraft_indices: [2], number_of_formation: '1' })).toBe('כסף2/117');
    expect(dwStripLabel({ callsign: 'כסף', sq: '117', aircraft_indices: [3, 1] })).toBe('כסף1+3/117');
  });
  it('aircraft_indices כמחרוזת JSON (כפי שחוזר לפעמים מה-DB)', () => {
    expect(dwStripLabel({ callsign: 'ברק', sq: '69', aircraft_indices: '[2]' })).toBe('ברק2/69');
  });
  it('טייסת מהשדה החלופי squadron, ואו"ק מ-callSign', () => {
    expect(dwStripLabel({ callSign: 'עיט', squadron: '107', numberOfFormation: '3' })).toBe('עיט/107 (3)');
  });
  it('פ"מ ריק לא מפיל', () => {
    expect(dwStripLabel({})).toBe('');
    expect(dwStripLabel(null)).toBe('');
  });
});

describe('dwNextMode', () => {
  it('מחזורי: מספר -> או"קים -> פ"מים -> מספר', () => {
    expect(dwNextMode('count')).toBe('count_callsigns');
    expect(dwNextMode('count_callsigns')).toBe('count_strips');
    expect(dwNextMode('count_strips')).toBe('count');
    expect(dwNextMode('לא-קיים' as any)).toBe('count');
  });
});

describe('סשן', () => {
  // הבדיקות רצות ב-node, בלי DOM. shim מינימלי מספיק כדי לבדוק את הלוגיקה.
  beforeEach(() => {
    const mem = new Map<string, string>();
    (globalThis as any).sessionStorage = {
      getItem: (k: string) => mem.has(k) ? mem.get(k)! : null,
      setItem: (k: string, v: string) => { mem.set(k, v); },
      removeItem: (k: string) => { mem.delete(k); },
    };
  });

  it('שמירה מודיעה למנויים - שכבת החלונות וסרגל השחזור נשארים מסונכרנים', () => {
    let hits = 0;
    const off = dwSubscribe(() => { hits++; });
    dwSaveSession(7, [win({ id: 'a', hidden: true })]);
    expect(hits).toBe(1);
    expect(dwLoadSession(7).map(w => w.hidden)).toEqual([true]);
    off();
    dwSaveSession(7, []);
    expect(hits).toBe(1);
  });
  it('סשן פגום לא מפיל את העמדה', () => {
    sessionStorage.setItem('skyking.dataWindows.9', 'לא-JSON');
    expect(dwLoadSession(9)).toEqual([]);
  });
});
