import { describe, it, expect } from 'vitest';
import {
  ELEMENT_AUDIENCES, DEFAULT_RELEVANT_FOR, parseRelevantFor, relevantFor, isRelevantFor, onlyRelevantFor,
} from './elementRelevance.js';

describe('elementRelevance - למי האלמנט רלוונטי', () => {
  it('שני קהלים: רכבים ומטוסים, וברירת המחדל - שניהם', () => {
    expect(ELEMENT_AUDIENCES).toEqual(['vehicles', 'aircraft']);
    expect(DEFAULT_RELEVANT_FOR).toEqual(['vehicles', 'aircraft']);
  });

  it('parseRelevantFor מנקה ערכים לא מוכרים וכפילויות, בסדר קבוע', () => {
    expect(parseRelevantFor(['aircraft', 'vehicles', 'aircraft', 'boats'])).toEqual(['vehicles', 'aircraft']);
    expect(parseRelevantFor(['aircraft'])).toEqual(['aircraft']);
    expect(parseRelevantFor('["vehicles"]')).toEqual(['vehicles']);
  });

  it('parseRelevantFor מחזיר null לקלט ריק או לא תקין - אין בחירה שלא אומרת כלום', () => {
    for (const v of [undefined, null, '', [], ['boats'], 'x', 42, {}]) expect(parseRelevantFor(v)).toBeNull();
  });

  it('אלמנט ישן בלי שדה (או עם ערך פגום) רלוונטי לשניהם - לא נעלם בשקט מהנהג', () => {
    expect(relevantFor({})).toEqual(['vehicles', 'aircraft']);
    expect(relevantFor({ relevant_for: [] })).toEqual(['vehicles', 'aircraft']);
    expect(relevantFor(null)).toEqual(['vehicles', 'aircraft']);
    expect(isRelevantFor({ relevant_for: null }, 'vehicles')).toBe(true);
  });

  it('isRelevantFor לפי הבחירה', () => {
    expect(isRelevantFor({ relevant_for: ['aircraft'] }, 'vehicles')).toBe(false);
    expect(isRelevantFor({ relevant_for: ['aircraft'] }, 'aircraft')).toBe(true);
    expect(isRelevantFor({ relevant_for: ['vehicles', 'aircraft'] }, 'vehicles')).toBe(true);
  });

  it('onlyRelevantFor מסנן רשימה', () => {
    const els = [{ id: 1, relevant_for: ['aircraft'] }, { id: 2, relevant_for: ['vehicles'] }, { id: 3 }];
    expect(onlyRelevantFor(els, 'vehicles').map(e => e.id)).toEqual([2, 3]);
    expect(onlyRelevantFor(null, 'vehicles')).toEqual([]);
  });
});
