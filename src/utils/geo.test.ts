import { describe, it, expect } from 'vitest';
import { buildGeoAnchor, geoToImagePct, imagePctToGeo, fmtDms, type MapGeoAnchor } from './geo';

const anchor: MapGeoAnchor = {
  x1: 0, y1: 0, lat1: 32, lon1: 34,
  x2: 100, y2: 100, lat2: 33, lon2: 35,
};

describe('geoToImagePct / imagePctToGeo', () => {
  it('are inverse of each other (round-trip)', () => {
    const geo = { lat: 32.5, lon: 34.5 };
    const img = geoToImagePct(geo.lat, geo.lon, anchor);
    const back = imagePctToGeo(img.x, img.y, anchor);
    expect(back.lat).toBeCloseTo(geo.lat, 6);
    expect(back.lon).toBeCloseTo(geo.lon, 6);
  });
  it('maps the midpoint to the image center', () => {
    const img = geoToImagePct(32.5, 34.5, anchor);
    expect(img.x).toBeCloseTo(50, 6);
    expect(img.y).toBeCloseTo(50, 6);
  });
});

describe('buildGeoAnchor', () => {
  it('returns null when anchors are missing', () => {
    expect(buildGeoAnchor(null)).toBeNull();
    expect(buildGeoAnchor({ anchor1_lat: 32 })).toBeNull();
  });
  it('builds an anchor from map data', () => {
    const a = buildGeoAnchor({
      anchor1_x_img: 0, anchor1_y_img: 0, anchor1_lat: 32, anchor1_lon: 34,
      anchor2_x_img: 100, anchor2_y_img: 100, anchor2_lat: 33, anchor2_lon: 35,
    });
    expect(a).not.toBeNull();
    expect(a!.lat1).toBe(32);
    expect(a!.lon2).toBe(35);
  });
});

describe('fmtDms', () => {
  it('formats latitude with N/S', () => {
    expect(fmtDms(32.5, true)).toContain('N');
    expect(fmtDms(-32.5, true)).toContain('S');
  });
  it('formats longitude with E/W', () => {
    expect(fmtDms(34.5, false)).toContain('E');
    expect(fmtDms(-34.5, false)).toContain('W');
  });
  it('produces degrees/minutes/seconds', () => {
    expect(fmtDms(32, true)).toMatch(/32°00'/);
  });
});
