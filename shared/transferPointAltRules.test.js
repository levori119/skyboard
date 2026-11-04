import { describe, it, expect } from 'vitest';
import { collectPointRules, configRules, normalizeOwnRules } from './transferPointAltRules.js';

// מה שנבדק: כללי הגבהים בנקודת העברה מסונכרנים בין העמדות, וכל עמדה מעדכנת רק את שלה.
// הנתונים כמו באשכול: מרחבי 305 (2) ובת"ק עזה (26).

describe('configRules', () => {
  it('פורמט ישן - טווח יחיד בלי ranges', () => {
    expect(configRules({ alt_min: 180, alt_max: null, parity: 'any' })).toEqual([{ alt_min: 180, alt_max: null, parity: 'any' }]);
  });
  it('בלי כללים - ריק', () => {
    expect(configRules(null)).toEqual([]);
    expect(configRules({ label: 'אשכול', partner_preset_ids: [] })).toEqual([]);
  });
});

describe('collectPointRules', () => {
  const mine = { ranges: [{ preset_id: 26, alt_min: 120, alt_max: 340, parity: 'even' }, { preset_id: null, alt_min: 12, alt_max: 340, parity: 'odd' }] };
  it('בת"ק עזה רואה את כללי מרחבי 305 - כל כלל עם העמדה שלו', () => {
    const rules = collectPointRules({ alt_min: 180 }, 26, [{ preset_id: 2, ranges: mine.ranges }]);
    expect(rules.map(r => [r.station, r.alt_min, r.alt_max, r.storedBy])).toEqual([
      [26, 180, null, 26],
      [26, 120, 340, 2],
      [2, 12, 340, 2],
    ]);
  });
  it('העמדה עצמה לא נספרת פעמיים גם אם הגיעה ברשימת השותפים', () => {
    const rules = collectPointRules(mine, 2, [{ preset_id: 2, ranges: mine.ranges }]);
    expect(rules).toHaveLength(2);
  });
});

describe('normalizeOwnRules', () => {
  it('כלל בלי עמדה - של העמדה ששומרת', () => {
    expect(normalizeOwnRules([{ preset_id: null, alt_min: 12, alt_max: 340, parity: 'odd' }], [], 2))
      .toEqual([{ preset_id: 2, alt_min: 12, alt_max: 340, parity: 'odd' }]);
  });
  it('אי אפשר להגדיר כלל חדש לעמדה אחרת', () => {
    expect(normalizeOwnRules([{ preset_id: 26, alt_min: 100, alt_max: 200, parity: 'any' }], [], 2)).toBeNull();
  });
  it('שארית ישנה של עמדה אחרת נשארת כמו שהיא', () => {
    const legacy = { preset_id: 26, alt_min: 120, alt_max: 340, parity: 'even' };
    expect(normalizeOwnRules([legacy], [legacy], 2)).toEqual([legacy]);
  });
  it('שינוי בשארית של עמדה אחרת - נחסם', () => {
    const legacy = { preset_id: 26, alt_min: 120, alt_max: 340, parity: 'even' };
    expect(normalizeOwnRules([{ ...legacy, alt_max: 400 }], [legacy], 2)).toBeNull();
  });
});
