import { describe, it, expect } from 'vitest';
import { splitterProps, splitterColors, SPLITTER_HIT_PX } from './splitter';

describe('splitter - ספליטר משותף לעט ולמגע', () => {
  it('שטח תפיסה רחב מספיק לעט', () => {
    expect(SPLITTER_HIT_PX).toBeGreaterThanOrEqual(12);
  });
  it('מחלקה לפי ציר, ודגל פעיל רק כשבגרירה', () => {
    expect(splitterProps('col', 'dark').className).toBe('sk-splitter sk-splitter-col');
    expect(splitterProps('row', 'dark').className).toBe('sk-splitter sk-splitter-row');
    expect(splitterProps('col', 'dark')['data-active']).toBeUndefined();
    expect(splitterProps('col', 'dark', true)['data-active']).toBe('1');
  });
  it('צבעים לפי תמה; תמה לא מוכרת = כהה', () => {
    expect(splitterColors('light').line).not.toBe(splitterColors('dark').line);
    expect(splitterColors('xyz')).toEqual(splitterColors('dark'));
    expect((splitterProps('col', 'ocean').style as any)['--sk-split-line']).toBe(splitterColors('ocean').line);
  });
});
