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

describe('hasConditions', () => {
  it('false for empty group, true with a leaf', () => {
    expect(hasConditions(emptyQGroup())).toBe(false);
    expect(hasConditions({ id: 'g', type: 'group', operator: 'all', children: [leaf('sq','eq','1')] })).toBe(true);
  });
});
