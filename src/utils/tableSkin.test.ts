import { describe, it, expect } from 'vitest';
import { tableSkinOf, isTableSkinId, TABLE_SKINS, TABLE_SKIN_IDS } from './tableSkin';

describe('tableSkin', () => {
  it('מוד בלי סקין / סקין לא מוכר - הקלאסי (המראה של היום)', () => {
    expect(tableSkinOf(undefined)).toBe(TABLE_SKINS.classic);
    expect(tableSkinOf('neon')).toBe(TABLE_SKINS.classic);
    expect(tableSkinOf('toString')).toBe(TABLE_SKINS.classic);
  });
  it('הקלאסי שומר את המראה הקיים: רווח 9, מסגרת זיהוי 2px, זברה', () => {
    expect(TABLE_SKINS.classic).toMatchObject({ gapPx: 9, frame: 'accent', frameW: 2, zebra: true, cellPadY: null, quietHeader: false });
  });
  it('סקין מוכר נבחר', () => {
    expect(tableSkinOf('ledger').gapPx).toBe(0);
    expect(isTableSkinId('calm')).toBe(true);
    expect(TABLE_SKIN_IDS).toContain('compact');
  });
});
