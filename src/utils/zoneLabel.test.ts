import { describe, it, expect } from 'vitest';
import { pointInPolygon } from './zoneHit';
import {
  interiorLabelPoint, interiorSpansAtY, lightenHex, nextZoneNameBrightness,
  zoneNameFill, isZoneNameBrightness, DEFAULT_ZONE_NAME_BRIGHTNESS,
  nextZoneLineWidth, zoneLineWidthFactor, isZoneLineWidth, DEFAULT_ZONE_LINE_WIDTH,
} from './zoneLabel';

const square = [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 10, y: 30 }];
// פרסה (U): ממוצע הקודקודים נופל בחלל הפתוח שבין הזרועות
const horseshoe = [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 30 }, { x: 30, y: 30 },
  { x: 30, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 },
];

describe('interiorLabelPoint', () => {
  it('אזור קמור - נשאר בממוצע הקודקודים', () => {
    expect(interiorLabelPoint(square)).toEqual({ x: 20, y: 20 });
  });

  it('פרסה - הממוצע בחוץ, התווית חוזרת פנימה', () => {
    const cx = horseshoe.reduce((s, p) => s + p.x, 0) / horseshoe.length;
    const cy = horseshoe.reduce((s, p) => s + p.y, 0) / horseshoe.length;
    expect(pointInPolygon(cx, cy, horseshoe)).toBe(false);
    const p = interiorLabelPoint(horseshoe);
    expect(pointInPolygon(p.x, p.y, horseshoe)).toBe(true);
  });

  it('רוחב טקסט - בוחר שורה שבה התווית כולה בפנים', () => {
    const p = interiorLabelPoint(horseshoe, undefined, 20);
    const spans = interiorSpansAtY(horseshoe, p.y);
    expect(spans.some(([a, b]) => p.x - a >= 10 && b - p.x >= 10)).toBe(true);
  });

  it('גובה מבוקש בראש משולש - נשאר בפנים', () => {
    const tri = [{ x: 50, y: 0 }, { x: 80, y: 40 }, { x: 20, y: 40 }];
    const p = interiorLabelPoint(tri, 1.8, 12);
    expect(pointInPolygon(p.x, p.y, tri)).toBe(true);
    expect(p.y).toBeGreaterThan(1.8);
  });
});

describe('בהירות שם האזור', () => {
  it('ברירת המחדל חלשה ובגוון הגבול האפור', () => {
    expect(DEFAULT_ZONE_NAME_BRIGHTNESS).toBe('dim');
    expect(zoneNameFill(false, 'dim')).toBe('rgba(255,255,255,0.55)');
  });
  it('מחזור חלש -> רגיל -> בהיר -> מוסתר -> חלש', () => {
    expect(nextZoneNameBrightness('dim')).toBe('normal');
    expect(nextZoneNameBrightness('normal')).toBe('bright');
    expect(nextZoneNameBrightness('bright')).toBe('hidden');
    expect(nextZoneNameBrightness('hidden')).toBe('dim');
  });
  it('מוסתר - בלי צבע', () => {
    expect(zoneNameFill(false, 'hidden')).toBe('none');
    expect(zoneNameFill(true, 'hidden')).toBe('none');
  });
  it('ערך שמור לא תקין נדחה', () => {
    expect(isZoneNameBrightness('bright')).toBe(true);
    expect(isZoneNameBrightness('x')).toBe(false);
    expect(isZoneNameBrightness(null)).toBe(false);
  });
});

describe('lightenHex', () => {
  it('מבהיר לכיוון לבן', () => {
    expect(lightenHex('#000000', 0.5)).toBe('#808080');
    expect(lightenHex('#f00', 1)).toBe('#ffffff');
  });
  it('צבע לא hex חוזר כמו שהוא', () => {
    expect(lightenHex('red', 0.5)).toBe('red');
  });
});

describe('עובי קווי האזורים', () => {
  it('ברירת המחדל = העובי הקיים', () => {
    expect(DEFAULT_ZONE_LINE_WIDTH).toBe('normal');
    expect(zoneLineWidthFactor('normal')).toBe(1);
  });
  it('מכפיל עולה עם הרמה', () => {
    expect(zoneLineWidthFactor('thin')).toBeLessThan(1);
    expect(zoneLineWidthFactor('thick')).toBeGreaterThan(1);
    expect(zoneLineWidthFactor('xthick')).toBeGreaterThan(zoneLineWidthFactor('thick'));
  });
  it('מחזור דק -> רגיל -> עבה -> עבה מאוד -> דק', () => {
    expect(nextZoneLineWidth('thin')).toBe('normal');
    expect(nextZoneLineWidth('normal')).toBe('thick');
    expect(nextZoneLineWidth('thick')).toBe('xthick');
    expect(nextZoneLineWidth('xthick')).toBe('thin');
  });
  it('ערך שמור לא תקין נדחה', () => {
    expect(isZoneLineWidth('thick')).toBe(true);
    expect(isZoneLineWidth('huge')).toBe(false);
  });
});
