import { describe, it, expect } from 'vitest';
import { parseMapInkNotes, setMapInkNote, purgeMapInkNotes, stripNum } from './mapInkNotes';

const INK = 'data:image/png;base64,AAAA';

describe('הערה בכתב יד על פ"מ במפה - מקומית לעמדה', () => {
  it('stripNum - כל צורות המזהה', () => {
    expect([stripNum('s12'), stripNum(12), stripNum('12'), stripNum('x')]).toEqual([12, 12, 12, null]);
  });
  it('שמירה ומחיקה (ערך ריק מוחק)', () => {
    const a = setMapInkNote({}, 's5', INK);
    expect(a).toEqual({ 5: INK });
    expect(setMapInkNote(a, 5, '')).toEqual({});
  });
  it('parse עמיד לערך שבור, ומסנן ערכים שאינם תמונה', () => {
    expect(parseMapInkNotes(JSON.stringify({ 5: INK, 6: 'hello', x: INK }))).toEqual({ 5: INK });
    expect(parseMapInkNotes('nope')).toEqual({});
  });
  it('הפ"מ עבר לעמדה אחרת (העברה התקבלה) - ההערה נעלמת', () => {
    const notes = { 1: INK, 2: INK };
    const strips = [{ id: 's1', workstation_preset_id: 26, status: 'active' }, { id: 's2', workstation_preset_id: 21, status: 'active' }];
    expect(purgeMapInkNotes(notes, strips, 26, true)).toEqual({ 1: INK });
  });
  it('בהעברה (pending_transfer) - עדיין אצלי, ההערה נשארת', () => {
    const notes = { 2: INK };
    expect(purgeMapInkNotes(notes, [{ id: 's2', workstation_preset_id: 21, status: 'pending_transfer' }], 26, true)).toBe(notes);
  });
  it('פ"מ בלי עמדה - נשארת', () => {
    const notes = { 3: INK };
    expect(purgeMapInkNotes(notes, [{ id: 's3', workstation_preset_id: null, status: 'queued' }], 26, true)).toBe(notes);
  });
  it('פ"מ שנמחק - נעלמת; אבל לא לפני שהפ"מים נטענו', () => {
    const notes = { 4: INK };
    expect(purgeMapInkNotes(notes, [{ id: 's9', workstation_preset_id: 26 }], 26, true)).toEqual({});
    expect(purgeMapInkNotes(notes, [], 26, true)).toBe(notes);
    expect(purgeMapInkNotes(notes, [{ id: 's9' }], 26, false)).toBe(notes);
  });
});
