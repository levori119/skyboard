import { describe, it, expect } from 'vitest';
import { resetButtonsState, sharedServiceIds } from './missionDeskReset.js';

// מה שנבדק: "כניסה מאופסת" מחזירה את כפתורי האמצעים למצב הראשון, ולא נוגעת בשירות משותף.
describe('resetButtonsState', () => {
  it('כל כפתור חוזר למצב הראשון, טקסט חופשי מתרוקן', () => {
    const st = { buttons: [{ id: 'a', activeStateIdx: 2, allowFreeText: true, freeText: 'תפוס' }, { id: 'b', activeStateIdx: 0 }] };
    const r = resetButtonsState(st);
    expect(r.buttons.map(b => b.activeStateIdx)).toEqual([0, 0]);
    expect(r.buttons[0].freeText).toBe('');
  });
  it('כבר מאופס / לא לוח כפתורים - אותו אובייקט', () => {
    const st = { buttons: [{ id: 'b', activeStateIdx: 0 }] };
    expect(resetButtonsState(st)).toBe(st);
    const txt = { text: 'x' };
    expect(resetButtonsState(txt)).toBe(txt);
  });
});

describe('sharedServiceIds', () => {
  it('רק שירותים ששותפו בפועל', () => {
    expect([...sharedServiceIds({ '5': [3], '6': [], '7': 'x' })]).toEqual([5]);
    expect(sharedServiceIds(null).size).toBe(0);
  });
});
