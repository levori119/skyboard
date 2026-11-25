import { describe, it, expect } from 'vitest';
import { mergeZoneOperational } from './zoneOperational';

const zones = [
  { id: 1, name: '711', restriction: '', restriction_range_ids: [], restriction_alt_min: null, restriction_alt_max: null, limitation_note: '', active_alt_range_ids: [] },
  { id: 2, name: '712', restriction: '', restriction_range_ids: [], restriction_alt_min: null, restriction_alt_max: null, limitation_note: '', active_alt_range_ids: [] },
];

describe('mergeZoneOperational', () => {
  it('בלי שינוי - אותה הפניה (בלי רינדור)', () => {
    const byId = new Map([[1, { restriction: '', restriction_range_ids: [], limitation_note: '', active_alt_range_ids: [] }]]);
    expect(mergeZoneOperational(zones, byId, {}, 0, 12000)).toBe(zones);
  });
  it('הגבלה מהשרת נכנסת לאזור, והשאר לא נוגעים', () => {
    const byId = new Map([[1, { restriction: 'closed', restriction_range_ids: [], restriction_alt_min: 100, restriction_alt_max: 140, limitation_note: '', active_alt_range_ids: [] }]]);
    const out = mergeZoneOperational(zones, byId, {}, 0, 12000);
    expect(out).not.toBe(zones);
    expect(out[0]).toMatchObject({ name: '711', restriction: 'closed', restriction_alt_min: 100, restriction_alt_max: 140 });
    expect(out[1]).toBe(zones[1]);
  });
  it('כתיבה מקומית טרייה גוברת על השרת', () => {
    const byId = new Map([[1, { restriction: 'closed' }]]);
    expect(mergeZoneOperational(zones, byId, { 1: 1000 }, 5000, 12000)).toBe(zones);
    expect(mergeZoneOperational(zones, byId, { 1: 1000 }, 20000, 12000)[0].restriction).toBe('closed');
  });
});
