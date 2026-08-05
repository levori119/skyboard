import { describe, it, expect } from 'vitest';
import { getQFieldValue, evalQLeaf, evaluateQuery, emptyQGroup, hasConditions } from './queryBuilder';
import type { QGroup, QLeaf } from '../types';

const leaf = (field: string, compare: any, value: string): QLeaf =>
  ({ id: 'l', type: 'leaf', field, compare, value });

describe('getQFieldValue', () => {
  it('resolves callSign from either casing', () => {
    expect(getQFieldValue({ callsign: 'חנית' }, 'callSign')).toBe('חנית');
    expect(getQFieldValue({ callSign: 'BAZ' }, 'callSign')).toBe('BAZ');
  });
  it('resolves sq from sq or squadron', () => {
    expect(getQFieldValue({ squadron: '69' }, 'sq')).toBe('69');
  });
  it('treats in_table relative to preset', () => {
    const strip = { workstation_preset_id: 5, in_table: true };
    expect(getQFieldValue(strip, 'in_table', { presetId: 5 })).toBe(true);
    expect(getQFieldValue(strip, 'in_table', { presetId: 9 })).toBe(false);
  });
});

describe('evalQLeaf', () => {
  it('contains / not_contains', () => {
    expect(evalQLeaf({ callsign: 'חנית' }, leaf('callSign', 'contains', 'חנ'))).toBe(true);
    expect(evalQLeaf({ callsign: 'חנית' }, leaf('callSign', 'not_contains', 'בז'))).toBe(true);
  });
  it('eq / neq', () => {
    expect(evalQLeaf({ task: 'CAP' }, leaf('task', 'eq', 'CAP'))).toBe(true);
    expect(evalQLeaf({ task: 'CAP' }, leaf('task', 'neq', 'STRIKE'))).toBe(true);
  });
  it('in / not_in (comma list)', () => {
    expect(evalQLeaf({ sq: '107' }, leaf('sq', 'in', '101,107,109'))).toBe(true);
    expect(evalQLeaf({ sq: '999' }, leaf('sq', 'not_in', '101,107'))).toBe(true);
  });
  it('gt / lt numeric', () => {
    expect(evalQLeaf({ alt: '250' }, leaf('alt', 'gt', '200'))).toBe(true);
    expect(evalQLeaf({ alt: '150' }, leaf('alt', 'lt', '200'))).toBe(true);
  });
  it('empty / not_empty', () => {
    expect(evalQLeaf({ notes: '' }, leaf('notes', 'empty', ''))).toBe(true);
    expect(evalQLeaf({ notes: 'x' }, leaf('notes', 'not_empty', ''))).toBe(true);
  });
  it('boolean fields', () => {
    expect(evalQLeaf({ airborne: true }, leaf('airborne', 'eq', 'כן'))).toBe(true);
    expect(evalQLeaf({ airborne: false }, leaf('airborne', 'eq', 'כן'))).toBe(false);
  });
});

describe('evaluateQuery', () => {
  const strip = { callsign: 'חנית', sq: '107', task: 'CAP', alt: '250' };
  it('all = AND', () => {
    const q: QGroup = { id: 'g', type: 'group', operator: 'all', children: [
      leaf('sq', 'eq', '107'), leaf('task', 'eq', 'CAP'),
    ]};
    expect(evaluateQuery(strip, q)).toBe(true);
    const q2: QGroup = { ...q, children: [leaf('sq', 'eq', '107'), leaf('task', 'eq', 'STRIKE')] };
    expect(evaluateQuery(strip, q2)).toBe(false);
  });
  it('any = OR', () => {
    const q: QGroup = { id: 'g', type: 'group', operator: 'any', children: [
      leaf('task', 'eq', 'STRIKE'), leaf('sq', 'eq', '107'),
    ]};
    expect(evaluateQuery(strip, q)).toBe(true);
  });
  it('none = NOR', () => {
    const q: QGroup = { id: 'g', type: 'group', operator: 'none', children: [
      leaf('task', 'eq', 'STRIKE'),
    ]};
    expect(evaluateQuery(strip, q)).toBe(true);
  });
  it('empty group matches everything', () => {
    expect(evaluateQuery(strip, emptyQGroup())).toBe(true);
  });
});

// ─── אופרטורי זמן יחסיים לעכשיו ───────────────────────────────────────────────
// "מטוסי קרב שאמורים לחזור אליי בקרוב" = זמן נחיתה מתוכנן פחות מ-X דקות מעכשיו.
// הזמן נמדד ביחס ל-`ctx.now` כדי שהבדיקה לא תהיה תלויה בשעון הרצה.
describe('שדות זמן - השוואה יחסית לעכשיו', () => {
  const NOW = Date.parse('2026-08-05T10:00:00Z');
  const inMin = (m: number) => new Date(NOW + m * 60000).toISOString();
  const ctx = { now: NOW };
  const pl = (compare: any, value: string) => leaf('planned_landing_time', compare, value);

  it('פחות מ-X דקות מעכשיו', () => {
    expect(evalQLeaf({ planned_landing_time: inMin(7) }, pl('lt', '10'), ctx)).toBe(true);
    expect(evalQLeaf({ planned_landing_time: inMin(25) }, pl('lt', '10'), ctx)).toBe(false);
  });
  it('נחיתה שזמנה כבר עבר נכללת ב"פחות מ" - פ"מ מאחר שעדיין באוויר לא נעלם מהחלון', () => {
    expect(evalQLeaf({ planned_landing_time: inMin(-4) }, pl('lt', '10'), ctx)).toBe(true);
  });
  it('יותר מ-X דקות מעכשיו', () => {
    expect(evalQLeaf({ planned_landing_time: inMin(40) }, pl('gt', '30'), ctx)).toBe(true);
    expect(evalQLeaf({ planned_landing_time: inMin(12) }, pl('gt', '30'), ctx)).toBe(false);
  });
  it('שווה ל-X דקות - עיגול לדקה השלמה', () => {
    expect(evalQLeaf({ planned_landing_time: new Date(NOW + 5 * 60000 + 20000).toISOString() }, pl('eq', '5'), ctx)).toBe(true);
    expect(evalQLeaf({ planned_landing_time: inMin(6) }, pl('eq', '5'), ctx)).toBe(false);
    expect(evalQLeaf({ planned_landing_time: inMin(6) }, pl('neq', '5'), ctx)).toBe(true);
  });
  it('כבר עבר', () => {
    expect(evalQLeaf({ planned_landing_time: inMin(-1) }, pl('passed', ''), ctx)).toBe(true);
    expect(evalQLeaf({ planned_landing_time: inMin(1) }, pl('passed', ''), ctx)).toBe(false);
  });
  it('פ"מ בלי זמן נחיתה לא מתאים לאף תנאי זמן, ומתאים ל"ריק"', () => {
    expect(evalQLeaf({}, pl('lt', '10'), ctx)).toBe(false);
    expect(evalQLeaf({}, pl('gt', '10'), ctx)).toBe(false);
    expect(evalQLeaf({}, pl('neq', '10'), ctx)).toBe(false);
    expect(evalQLeaf({}, pl('passed', ''), ctx)).toBe(false);
    expect(evalQLeaf({}, pl('empty', ''), ctx)).toBe(true);
    expect(evalQLeaf({ planned_landing_time: inMin(3) }, pl('not_empty', ''), ctx)).toBe(true);
  });
  it('זמן לא תקין מתנהג כמו זמן חסר', () => {
    expect(evalQLeaf({ planned_landing_time: 'לא-זמן' }, pl('lt', '10'), ctx)).toBe(false);
  });
  it('בלי ctx.now נמדד מול שעון המערכת', () => {
    const soon = new Date(Date.now() + 3 * 60000).toISOString();
    expect(evalQLeaf({ planned_landing_time: soon }, pl('lt', '10'))).toBe(true);
  });
  it('גם זמן ההמראה הוא שדה זמן', () => {
    expect(evalQLeaf({ takeoff_time: inMin(-90) }, leaf('takeoff_time', 'passed', ''), ctx)).toBe(true);
  });
  it('טקסט חופשי על שדה זמן עדיין עובד (שאילתות ותיקות)', () => {
    expect(evalQLeaf({ planned_landing_time: '2026-08-05T10:07:00.000Z' }, pl('contains', '2026-08-05'), ctx)).toBe(true);
  });

  it('הדוגמה המלאה: מטוסי קרב מהבסיס שלי, באוויר, נוחתים בעוד פחות מ-15 דקות', () => {
    // "אצלי" נגזר מהעמדה (`myBaseId`) ולא משם שדה קשיח, כדי שאותה הגדרת חלון
    // תעבוד בכל שדה תעופה בלי לשכפל אותה לכל בסיס.
    const q: QGroup = { id: 'g', type: 'group', operator: 'all', children: [
      leaf('strip_type', 'contains', 'קרב'),
      leaf('airborne', 'eq', 'באוויר'),
      leaf('lands_at_my_base', 'eq', 'כן'),
      pl('lt', '15'),
    ]};
    const base = { id: 3, name: 'רמת דוד', code: 'LLRD' };
    const evalCtx = { now: NOW, aviationBases: [base], myBaseId: 3 };
    const match = { strip_type: 'קרב', airborne: true, landing_airfield_id: 3, planned_landing_time: inMin(9) };
    const tooFar = { ...match, planned_landing_time: inMin(45) };
    const onGround = { ...match, airborne: false };
    expect(evaluateQuery(match, q, evalCtx)).toBe(true);
    expect(evaluateQuery(tooFar, q, evalCtx)).toBe(false);
    expect(evaluateQuery(onGround, q, evalCtx)).toBe(false);
    // אותה הגדרה בדיוק, בעמדה של בסיס אחר - אותו פ"מ כבר לא "אצלי"
    expect(evaluateQuery(match, q, { ...evalCtx, myBaseId: 8 })).toBe(false);
  });

  it('"נוחת אצלי" / "ממריא אצלי" לפי הבסיס של העמדה', () => {
    const strip = { landing_airfield_id: 3, takeoff_airfield_id: 8 };
    expect(evalQLeaf(strip, leaf('lands_at_my_base', 'eq', 'כן'), { myBaseId: 3 })).toBe(true);
    expect(evalQLeaf(strip, leaf('lands_at_my_base', 'eq', 'כן'), { myBaseId: 8 })).toBe(false);
    expect(evalQLeaf(strip, leaf('takes_off_from_my_base', 'eq', 'כן'), { myBaseId: 8 })).toBe(true);
    // עמדה בלי בסיס אב - התנאי לא מתקיים במקום להתאים לכולם
    expect(evalQLeaf(strip, leaf('lands_at_my_base', 'eq', 'כן'), {})).toBe(false);
  });
});

// ─── "נמצא בעמדה" - בחירה מתפריט העמדות ולא הקלדת שם ─────────────────────────
describe('נמצא בעמדה', () => {
  const atPreset = (value: string): QLeaf => ({ id: 'l', type: 'leaf', field: 'at_preset', compare: 'in', value });

  it('מתאים לפי שם העמדה המחזיקה', () => {
    const strip = { callsign: 'חנית', workstation_preset_name: 'אזורי מסוקים' };
    expect(evalQLeaf(strip, atPreset('אזורי מסוקים'))).toBe(true);
    expect(evalQLeaf(strip, atPreset('צפון'))).toBe(false);
  });
  it('כמה עמדות בבחירה = לפחות אחת מהן', () => {
    const strip = { workstation_preset_name: 'צפון' };
    expect(evalQLeaf(strip, atPreset('אזורי מסוקים,צפון'))).toBe(true);
  });
  it('רווחים והפרשי אותיות לא מפילים התאמה', () => {
    const strip = { workstation_preset_name: ' Tower ' };
    expect(evalQLeaf(strip, atPreset('tower'))).toBe(true);
  });
  it('בלי בחירה - התנאי לא מסנן', () => {
    expect(evalQLeaf({ workstation_preset_name: 'צפון' }, atPreset(''))).toBe(true);
  });
  it('פ"מ שלא נמצא באף עמדה לא מתאים', () => {
    expect(evalQLeaf({ callsign: 'כסף' }, atPreset('צפון'))).toBe(false);
  });
  it('נפילה-לאחור למזהה העמדה כשאין שם על הפ"מ', () => {
    const ctx = { presetNamesById: { 7: 'אזורי מסוקים' } };
    expect(evalQLeaf({ workstation_preset_id: 7 }, atPreset('אזורי מסוקים'), ctx)).toBe(true);
    expect(evalQLeaf({ workstation_preset_id: 8 }, atPreset('אזורי מסוקים'), ctx)).toBe(false);
  });
  it('"לא אחד מ" הופך את התנאי', () => {
    const leaf: QLeaf = { id: 'l', type: 'leaf', field: 'at_preset', compare: 'not_in', value: 'צפון' };
    expect(evalQLeaf({ workstation_preset_name: 'צפון' }, leaf)).toBe(false);
    expect(evalQLeaf({ workstation_preset_name: 'דרום' }, leaf)).toBe(true);
  });

  it('הדוגמה: מסוקים באוויר שנוחתים אצלי ונמצאים בעמדת אזורי מסוקים', () => {
    const q: QGroup = { id: 'g', type: 'group', operator: 'all', children: [
      leaf('strip_type', 'contains', 'מסוק'),
      leaf('airborne', 'eq', 'באוויר'),
      leaf('lands_at_my_base', 'eq', 'כן'),
      atPreset('אזורי מסוקים'),
    ]};
    const ctx = { myBaseId: 3 };
    const inZone = { strip_type: 'מסוק', airborne: true, landing_airfield_id: 3, workstation_preset_name: 'אזורי מסוקים' };
    expect(evaluateQuery(inZone, q, ctx)).toBe(true);
    expect(evaluateQuery({ ...inZone, workstation_preset_name: 'מגדל' }, q, ctx)).toBe(false);
  });
});

describe('hasConditions', () => {
  it('false for empty group, true with a leaf', () => {
    expect(hasConditions(emptyQGroup())).toBe(false);
    expect(hasConditions({ id: 'g', type: 'group', operator: 'all', children: [leaf('sq','eq','1')] })).toBe(true);
  });
});
