import { describe, it, expect } from 'vitest';
import { takeoffUrgency, formationCount } from './takeoffUrgency';

const NOW = new Date('2026-11-04T08:00:00Z');
const at = (min: number) => new Date(NOW.getTime() + min * 60000).toISOString();

describe('takeoffUrgency', () => {
  it('הגיע / עבר - עכשיו; עד 10 דקות - בקרוב; רחוק - רגיל', () => {
    expect(takeoffUrgency(at(0), false, NOW)).toBe('now');
    expect(takeoffUrgency(at(-15), false, NOW)).toBe('now');
    expect(takeoffUrgency(at(1), false, NOW)).toBe('soon');
    expect(takeoffUrgency(at(10), false, NOW)).toBe('soon');
    expect(takeoffUrgency(at(11), false, NOW)).toBe('none');
  });
  it('באוויר, בלי זמן או זמן שבור - רגיל', () => {
    expect(takeoffUrgency(at(-5), true, NOW)).toBe('none');
    expect(takeoffUrgency(null, false, NOW)).toBe('none');
    expect(takeoffUrgency('xx', false, NOW)).toBe('none');
  });
});

describe('formationCount', () => {
  it('מס"מ, פ"מ מפוצל, וחסר', () => {
    expect(formationCount({ numberOfFormation: '4' })).toBe(4);
    expect(formationCount({ number_of_formation: 2 })).toBe(2);
    expect(formationCount({ numberOfFormation: '4', aircraft_indices: [1, 3] })).toBe(2);
    expect(formationCount({ numberOfFormation: '' })).toBeNull();
    expect(formationCount(null)).toBeNull();
  });
});
