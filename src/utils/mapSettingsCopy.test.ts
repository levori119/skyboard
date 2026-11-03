import { describe, it, expect } from 'vitest';
import { mapCopySources, presetFieldsFromSource } from './mapSettingsCopy';

const presets = [
  { id: 1, name: 'מרחבי 305', map_id: 7, relevant_sectors: [5, 6], flight_zones_mode: true, fz_pin_display: 'tag', sector_maps_enabled: true, sector_map_ids: [70] },
  { id: 2, name: 'בת"ק', map_id: 8, map2_id: 7, map2_transfer_points: [9] },
  { id: 3, name: 'דסק', mission_desk_map_config: { a: { map_id: 7, transfer_points: [11], flight_zones_mode: false }, b: { map_id: 8, transfer_points: [] } } },
  { id: 4, name: 'אחרת', map_id: 9 },
];

describe('mapCopySources - "זהה לעמדה" לאותה מפה', () => {
  it('עמדה רגילה, מפה 2 וחלון דסק - רק של המפה הזו', () => {
    const r = mapCopySources(presets, 7);
    expect(r.map(x => x.key)).toEqual(['p1', 'p2m2', 'p3wa']);
    expect(r[0].settings).toMatchObject({ transfer_points: [5, 6], flight_zones_mode: true, fz_pin_display: 'tag', sector_map_ids: [70] });
    expect(r[1].settings.transfer_points).toEqual([9]);
    expect(r[2].settings).toMatchObject({ transfer_points: [11], flight_zones_mode: false });
  });
  it('בלי העמדה הנוכחית ובלי החלון שנערך', () => {
    expect(mapCopySources(presets, 7, { excludePresetId: 1 }).map(x => x.key)).toEqual(['p2m2', 'p3wa']);
    expect(mapCopySources(presets, 7, { excludePresetId: 3, excludeWindowKey: 'a' }).map(x => x.key)).toEqual(['p1', 'p2m2']);
  });
  it('בלי מפה - אין מקורות', () => {
    expect(mapCopySources(presets, null)).toEqual([]);
  });
});

describe('presetFieldsFromSource', () => {
  it('נקודות העברה ומצב אזורים בשדות של טופס עמדה', () => {
    const src = mapCopySources(presets, 7)[0];
    expect(presetFieldsFromSource(src)).toEqual({ relevant_sectors: [5, 6], flight_zones_mode: true, fz_pin_display: 'tag', sector_maps_enabled: true, sector_map_ids: [70] });
  });
});
