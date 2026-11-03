import { describe, it, expect } from 'vitest';
import { trackAtMapPoint, blockForAltitude } from './dropHit';

const t = (id: string, x: number, y: number, alt = 10000) => ({ id, cs: id, x, y, alt, lat: 0, lon: 0, spd: 0, hdg: 0, cls: 'friendly', typ: '' } as any);

describe('trackAtMapPoint', () => {
  it('המטוס הקרוב בתוך רדיוס האייקון; מחוץ לרדיוס - כלום', () => {
    const tracks = [t('a', 50, 50), t('b', 52, 50)];
    // תמונה 1000px: 1% = 10px
    expect(trackAtMapPoint(tracks, 51.6, 50, 1000, 1000, 16)?.id).toBe('b');
    expect(trackAtMapPoint(tracks, 60, 60, 1000, 1000, 16)).toBeNull();
    expect(trackAtMapPoint(tracks, 50, 50, 0, 0, 16)).toBeNull();
  });
});

describe('blockForAltitude', () => {
  const ranges = [{ id: 1, name: 'נמוך', alt_min: 0, alt_max: 100 }, { id: 2, name: 'גבוה', alt_min: 100, alt_max: 250 }];
  it('הבלוק שמכיל את גובה המטוס (FL מול רגל)', () => {
    expect(blockForAltitude(ranges, 6000)?.name).toBe('נמוך');
    expect(blockForAltitude(ranges, 18000)?.name).toBe('גבוה');
  });
  it('מעל כל הבלוקים - הקרוב; בלי בלוקים - כלום', () => {
    expect(blockForAltitude(ranges, 40000)?.name).toBe('גבוה');
    expect(blockForAltitude([], 5000)).toBeNull();
  });
  it('בלוק בגבולות ברגל מלאה', () => {
    expect(blockForAltitude([{ id: 3, alt_min: 5000, alt_max: 15000 }], 12000)?.id).toBe(3);
  });
});
