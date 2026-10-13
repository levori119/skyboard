import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { ACTIONS, ACTION_GROUPS, parseHiddenActions } from './hiddenActions.js';

describe('parseHiddenActions', () => {
  it('ערך ריק או פגום = כלום מוסתר', () => {
    expect(parseHiddenActions(null)).toEqual([]);
    expect(parseHiddenActions(undefined)).toEqual([]);
    expect(parseHiddenActions('')).toEqual([]);
    expect(parseHiddenActions('not json')).toEqual([]);
    expect(parseHiddenActions('{"a":1}')).toEqual([]);
  });

  it('קורא מחרוזת JSON וגם מערך', () => {
    expect(parseHiddenActions('["voice","theme"]')).toEqual(['voice', 'theme']);
    expect(parseHiddenActions(['voice'])).toEqual(['voice']);
  });

  it('זורק id שאינו בקטלוג, ערכים שאינם מחרוזת וכפילויות', () => {
    expect(parseHiddenActions(['voice', 'nope', 7, 'voice', null])).toEqual(['voice']);
  });
});

describe('הקטלוג', () => {
  it('id ייחודי, וכל קבוצה מוכרת', () => {
    const ids = ACTIONS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACTIONS) expect(ACTION_GROUPS).toContain(a.group);
  });

  it('לכל פעולה ולכל קבוצה יש תווית בעברית ובאנגלית', () => {
    const reg = JSON.parse(readFileSync(new URL('../src/i18n/registry/actions.json', import.meta.url), 'utf8'));
    const keys = [...ACTIONS.map(a => a.id), ...ACTION_GROUPS.map(g => `group_${g}`)];
    for (const k of keys) {
      expect(reg.keys[k]?.he, k).toBeTruthy();
      expect(reg.keys[k]?.en, k).toBeTruthy();
    }
  });

  it('יציאה מהמערכת אינה ניתנת להסתרה', () => {
    expect(ACTIONS.map(a => a.id)).not.toContain('logout');
  });
});
