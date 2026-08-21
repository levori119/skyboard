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

describe('projection: mercator (maps shared from the ATSIM repository)', () => {
  // A country-sized map, the case that actually matters: the mercator/linear
  // gap grows with the latitude span.
  const merc: MapGeoAnchor = {
    x1: 0, y1: 0, lat1: 33.5, lon1: 33.9,
    x2: 100, y2: 100, lat2: 29.3, lon2: 36.2,
    projection: 'mercator',
  };
  const lin: MapGeoAnchor = { ...merc, projection: 'linear' };

  it('round-trips', () => {
    for (const geo of [{ lat: 31.8, lon: 34.8 }, { lat: 29.5, lon: 34.0 }, { lat: 33.4, lon: 36.1 }]) {
      const img = geoToImagePct(geo.lat, geo.lon, merc);
      const back = imagePctToGeo(img.x, img.y, merc);
      expect(back.lat).toBeCloseTo(geo.lat, 6);
      expect(back.lon).toBeCloseTo(geo.lon, 6);
    }
  });

  it('pins the two anchor points exactly, like linear does', () => {
    expect(geoToImagePct(merc.lat1, merc.lon1, merc).y).toBeCloseTo(0, 6);
    expect(geoToImagePct(merc.lat2, merc.lon2, merc).y).toBeCloseTo(100, 6);
  });

  it('differs from linear in between - this is why the field exists', () => {
    // A degree of latitude stretches northward in mercator. Reading such a map
    // linearly puts an aircraft kilometres off, and nothing on screen shows it.
    const mid = 31.4;
    const dy = geoToImagePct(mid, 35, merc).y - geoToImagePct(mid, 35, lin).y;
    expect(Math.abs(dy)).toBeGreaterThan(0.4);   // ~0.5% of the image height
  });

  it('longitude is unaffected - mercator is linear in x', () => {
    expect(geoToImagePct(31.4, 35, merc).x).toBeCloseTo(geoToImagePct(31.4, 35, lin).x, 9);
  });

  it('**absent projection stays linear** - every existing map is unchanged', () => {
    const noField: MapGeoAnchor = { ...merc };
    delete (noField as { projection?: unknown }).projection;
    expect(geoToImagePct(31.4, 35, noField)).toEqual(geoToImagePct(31.4, 35, lin));
    expect(imagePctToGeo(37, 61, noField)).toEqual(imagePctToGeo(37, 61, lin));
  });

  it('buildGeoAnchor keeps producing linear anchors', () => {
    const a = buildGeoAnchor({
      anchor1_x_img: 0, anchor1_y_img: 0, anchor1_lat: 32, anchor1_lon: 34,
      anchor2_x_img: 100, anchor2_y_img: 100, anchor2_lat: 33, anchor2_lon: 35,
    });
    expect(a!.projection).toBeUndefined();
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
  // האות ההמיספרית **לפני** הספרות (N31°36'11.7"), כמו בפורמט נקודות המכוון
  it('formats latitude with N/S first', () => {
    expect(fmtDms(32.5, true)).toMatch(/^N32°/);
    expect(fmtDms(-32.5, true)).toMatch(/^S32°/);
  });
  it('formats longitude with E/W first', () => {
    expect(fmtDms(34.5, false)).toMatch(/^E34°/);
    expect(fmtDms(-34.5, false)).toMatch(/^W34°/);
  });
  it('produces degrees/minutes/seconds', () => {
    expect(fmtDms(32, true)).toMatch(/32°00'/);
    expect(fmtDms(31.60325, true)).toMatch(/^N31°36'11\.7"$/);
  });
  it('never trails the hemisphere letter', () => {
    expect(fmtDms(32.5, true)).not.toMatch(/N$/);
    expect(fmtDms(34.5, false)).not.toMatch(/E$/);
  });
});
