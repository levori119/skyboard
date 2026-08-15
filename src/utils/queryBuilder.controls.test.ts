import { describe, it, expect, beforeEach } from 'vitest';
import { evalQLeaf, getQFields, setStripControlRegistry, getQFieldValue } from './queryBuilder';
import { globalControls } from './stripControls';
import type { StripControl } from '../types/stripControls';
import type { QLeaf } from '../types';

const ctl = (over: Partial<StripControl>): StripControl =>
  ({ id: 'c', key: 'k', type: 'button', scope: 'global', ...over });

const leaf = (field: string, compare: any, value = ''): QLeaf =>
  ({ id: 'l', type: 'leaf', field, compare, value });

describe('פקדים גלובליים כשדות שאילתא', () => {
  beforeEach(() => setStripControlRegistry([]));

  it('שדה גלובלי מהקטלוג נוסף לרשימת השדות, ופנימי לא', () => {
    setStripControlRegistry(globalControls([
      ctl({ key: 'ready', type: 'flag', label: 'מוכן', scope: 'global' }),
      ctl({ key: 'local', scope: 'window' }),
    ]));
    const keys = getQFields().map(f => f.key);
    expect(keys).toContain('ctl__ready');
    expect(keys).not.toContain('ctl__local');
  });

  it('דגל גלובלי הוא שדה בוליאני בשאילתא', () => {
    setStripControlRegistry([ctl({ key: 'ready', type: 'flag' })]);
    expect(getQFields().find(f => f.key === 'ctl__ready')?.ftype).toBe('bool');
  });

  // הפער שהיה נופל בלי פתירת ב"מ: במסך הפקד מראה TRUE, ובשאילתא הוא היה false
  it('שאילתא על פקד שלא נגעו בו נפתרת לפי ה-ב"מ', () => {
    setStripControlRegistry([ctl({ key: 'ready', type: 'flag', defaultValue: true })]);
    const strip = { id: 1, custom_fields: {} };
    expect(getQFieldValue(strip, 'ctl__ready')).toBe(true);
    expect(evalQLeaf(strip, leaf('ctl__ready', 'eq', 'כן'))).toBe(true);
  });

  it('ערך שנשמר גובר על ה-ב"מ', () => {
    setStripControlRegistry([ctl({ key: 'ready', type: 'flag', defaultValue: true })]);
    const strip = { id: 1, custom_fields: { ready: false } };
    expect(evalQLeaf(strip, leaf('ctl__ready', 'eq', 'כן'))).toBe(false);
    expect(evalQLeaf(strip, leaf('ctl__ready', 'neq', 'כן'))).toBe(true);
  });

  it('כפתור גלובלי נבדק כטקסט', () => {
    setStripControlRegistry([ctl({ key: 'status', type: 'button', values: ['CLR', 'TXI'] })]);
    const strip = { id: 1, custom_fields: { status: 'TXI' } };
    expect(evalQLeaf(strip, leaf('ctl__status', 'eq', 'txi'))).toBe(true);
    expect(evalQLeaf(strip, leaf('ctl__status', 'contains', 'X'))).toBe(true);
    expect(evalQLeaf(strip, leaf('ctl__status', 'eq', 'CLR'))).toBe(false);
  });

  it('בחירה מרובה נבדקת בהכלה ולא כמחרוזת מחוברת', () => {
    setStripControlRegistry([ctl({ key: 'tags', type: 'multiselect', values: ['A', 'B', 'C'] })]);
    const strip = { id: 1, custom_fields: { tags: ['A', 'C'] } };
    expect(evalQLeaf(strip, leaf('ctl__tags', 'eq', 'C'))).toBe(true);
    expect(evalQLeaf(strip, leaf('ctl__tags', 'eq', 'B'))).toBe(false);
    expect(evalQLeaf(strip, leaf('ctl__tags', 'in', 'B, C'))).toBe(true);
    expect(evalQLeaf(strip, leaf('ctl__tags', 'not_in', 'B'))).toBe(true);
    expect(evalQLeaf(strip, leaf('ctl__tags', 'not_empty'))).toBe(true);
    expect(evalQLeaf({ id: 2, custom_fields: { tags: [] } }, leaf('ctl__tags', 'empty'))).toBe(true);
  });

  it('פ"מ בלי custom_fields אינו מפיל את השאילתא', () => {
    setStripControlRegistry([ctl({ key: 'status', type: 'button' })]);
    expect(evalQLeaf({ id: 1 }, leaf('ctl__status', 'empty'))).toBe(true);
  });

  it('שדות המערכת הקבועים ממשיכים לעבוד כרגיל', () => {
    setStripControlRegistry([ctl({ key: 'status', type: 'button' })]);
    expect(evalQLeaf({ callSign: 'ELAL1', airborne: true }, leaf('callSign', 'contains', 'elal'))).toBe(true);
    expect(evalQLeaf({ airborne: true }, leaf('airborne', 'eq', 'באוויר'))).toBe(true);
  });
});
