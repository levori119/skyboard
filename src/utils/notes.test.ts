import { describe, it, expect } from 'vitest';
import { parseNoteValue, serializeNoteValue } from './notes';

describe('parseNoteValue', () => {
  it('treats plain text as text', () => {
    expect(parseNoteValue('hello')).toEqual({ text: 'hello', hw: '' });
  });
  it('treats data-URL as handwriting', () => {
    expect(parseNoteValue('data:image/png;base64,AAA')).toEqual({ text: '', hw: 'data:image/png;base64,AAA' });
  });
  it('parses combined JSON', () => {
    expect(parseNoteValue('{"text":"hi","hw":"data:x"}')).toEqual({ text: 'hi', hw: 'data:x' });
  });
  it('handles empty', () => {
    expect(parseNoteValue('')).toEqual({ text: '', hw: '' });
  });
});

describe('serializeNoteValue', () => {
  it('text only returns the text', () => {
    expect(serializeNoteValue('hello', '')).toBe('hello');
  });
  it('handwriting only returns the data-URL', () => {
    expect(serializeNoteValue('', 'data:img')).toBe('data:img');
  });
  it('both returns JSON', () => {
    expect(serializeNoteValue('hi', 'data:img')).toBe('{"text":"hi","hw":"data:img"}');
  });
});

describe('round-trip', () => {
  it('text survives parse→serialize', () => {
    const v = 'גובה 250';
    expect(serializeNoteValue(...Object.values(parseNoteValue(v)) as [string, string])).toBe(v);
  });
  it('handwriting survives parse→serialize', () => {
    const v = 'data:image/png;base64,XYZ';
    const p = parseNoteValue(v);
    expect(serializeNoteValue(p.text, p.hw)).toBe(v);
  });
});
