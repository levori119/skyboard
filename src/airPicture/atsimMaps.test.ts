import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  atsimAnchor, isUsableAtsimMap, listAtsimMaps, atsimMapKey, isAtsimMapKey, atsimIdOf,
  type AtsimMap,
} from './atsimMaps';
import { geoToImagePct, imagePctToGeo } from '../utils/geo';

const MAP: AtsimMap = {
  id: 'map-2', name: 'תל נוף', projection: 'linear',
  bounds: { latMin: 30.75, latMax: 33.25, lonMin: 33.667, lonMax: 35.333 },
  width: 1200, height: 900, etag: 'abc', updatedAt: null,
};

afterEach(() => { vi.unstubAllGlobals(); });

describe('atsimAnchor - גבולות התמונה לשתי נקודות עיגון', () => {
  it('הפינות יושבות על 0% ו-100%', () => {
    const a = atsimAnchor(MAP);
    const tl = geoToImagePct(MAP.bounds.latMax, MAP.bounds.lonMin, a);
    const br = geoToImagePct(MAP.bounds.latMin, MAP.bounds.lonMax, a);
    expect(tl.x).toBeCloseTo(0, 6);
    expect(tl.y).toBeCloseTo(0, 6);
    expect(br.x).toBeCloseTo(100, 6);
    expect(br.y).toBeCloseTo(100, 6);
  });

  it('מרכז המפה במרכז התמונה (ליניארי)', () => {
    const a = atsimAnchor(MAP);
    const mid = geoToImagePct((30.75 + 33.25) / 2, (33.667 + 35.333) / 2, a);
    expect(mid.x).toBeCloseTo(50, 6);
    expect(mid.y).toBeCloseTo(50, 6);
  });

  it('הלוך ושוב דרך העיגון', () => {
    const a = atsimAnchor(MAP);
    const p = geoToImagePct(31.8384, 34.8287, a);
    const back = imagePctToGeo(p.x, p.y, a);
    expect(back.lat).toBeCloseTo(31.8384, 6);
    expect(back.lon).toBeCloseTo(34.8287, 6);
  });

  it('**ההיטל עובר** - מפה במרקטור אינה נקראת ליניארית', () => {
    // בלי זה המטוס יושב קילומטרים מהמקום, והתמונה נראית תקינה לחלוטין.
    expect(atsimAnchor({ ...MAP, projection: 'mercator' }).projection).toBe('mercator');
    expect(atsimAnchor(MAP).projection).toBe('linear');
    const linY = geoToImagePct(32, 34.5, atsimAnchor(MAP)).y;
    const merY = geoToImagePct(32, 34.5, atsimAnchor({ ...MAP, projection: 'mercator' })).y;
    expect(Math.abs(merY - linY)).toBeGreaterThan(0.05);
  });

  it('היטל לא מוכר נופל לליניארי ולא ל-undefined', () => {
    const a = atsimAnchor({ ...MAP, projection: 'סתם' as unknown as 'linear' });
    expect(a.projection).toBe('linear');
  });
});

describe('isUsableAtsimMap - מה שלא ניתן להציב עליו מטוס נדחה', () => {
  it('מפה תקינה עוברת', () => {
    expect(isUsableAtsimMap(MAP)).toBe(true);
  });
  it('בלי גבולות - נדחית', () => {
    expect(isUsableAtsimMap({ ...MAP, bounds: undefined })).toBe(false);
    expect(isUsableAtsimMap(null)).toBe(false);
  });
  it('גבולות הפוכים או מנוונים - נדחים', () => {
    expect(isUsableAtsimMap({ ...MAP, bounds: { ...MAP.bounds, latMin: 40 } })).toBe(false);
    expect(isUsableAtsimMap({ ...MAP, bounds: { ...MAP.bounds, lonMax: MAP.bounds.lonMin } })).toBe(false);
  });
  it('גבולות שאינם מספרים - נדחים', () => {
    expect(isUsableAtsimMap({ ...MAP, bounds: { ...MAP.bounds, latMax: 'צפון' } })).toBe(false);
  });
});

describe('listAtsimMaps - מאגר שאינו זמין אינו שובר את המסך', () => {
  it('רשת נפלה - רשימה ריקה ולא זריקה', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(listAtsimMaps()).resolves.toEqual([]);
  });
  it('502 מהריליי - רשימה ריקה', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    expect(await listAtsimMaps()).toEqual([]);
  });
  it('תשובה שאינה מערך - רשימה ריקה', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: 'x' }) }));
    expect(await listAtsimMaps()).toEqual([]);
  });
  it('מפות פסולות מסוננות, התקינות עוברות', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => [MAP, { id: 'bad' }, { ...MAP, id: 'map-3' }],
    }));
    expect((await listAtsimMaps()).map(m => m.id)).toEqual(['map-2', 'map-3']);
  });
});

describe('מזהה המפה בהעדפות העמדה', () => {
  it('מזהה מהמאגר מובחן ממזהה מה-DB', () => {
    // בלי התחילית, `atsim:map-2` ו-`2` היו יכולים להתנגש בבורר המפות, והעמדה
    // הייתה טוענת מפה אחרת לגמרי מזו שנבחרה.
    expect(isAtsimMapKey(atsimMapKey('map-2'))).toBe(true);
    expect(isAtsimMapKey('2')).toBe(false);
    expect(isAtsimMapKey(2)).toBe(false);
    expect(atsimIdOf(atsimMapKey('map-2'))).toBe('map-2');
  });
});
