import { describe, it, expect } from 'vitest';
import { WEATHER_LAYERS, windyEmbedUrl, weatherLayer, isWindyOverlay, WINDY_EMBED_BASE } from './windy';

/** הפרמטרים מתוך כתובת ההטמעה, כמפה. */
const paramsOf = (url: string) => {
  const q = url.slice(url.indexOf('?') + 1);
  return Object.fromEntries(new URLSearchParams(q).entries());
};

describe('קטלוג השכבות', () => {
  it('עשר שכבות התפריט המהיר, באותו סדר שהוצג באפיון', () => {
    const quick = WEATHER_LAYERS.filter(l => l.group === 'quick').map(l => l.id);
    expect(quick).toEqual([
      'radar', 'satellite', 'wind', 'rain', 'temp',
      'hurricanes', 'clouds', 'waves', 'rainAccu', 'thunder',
    ]);
  });

  it('השכבות התעופתיות נוספות ולא מחליפות', () => {
    const aviation = WEATHER_LAYERS.filter(l => l.group === 'aviation').map(l => l.id);
    expect(aviation).toEqual(['gust', 'visibility', 'cbase', 'deg0', 'cape']);
  });

  it('לכל שכבה מזהה ייחודי, מפתח i18n ודגימת צבע', () => {
    const ids = WEATHER_LAYERS.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of WEATHER_LAYERS) {
      expect(l.labelKey).toBe(`weather.layer_${l.id}`);
      expect(l.swatch).toMatch(/gradient/);
    }
  });

  it('מזהה מהקטלוג מזוהה, ומחרוזת זרה נדחית', () => {
    expect(isWindyOverlay('radar')).toBe(true);
    expect(isWindyOverlay('nonsense')).toBe(false);
    expect(isWindyOverlay(undefined)).toBe(false);
    expect(weatherLayer('radar')?.product).toBe('radar');
    expect(weatherLayer('nonsense')).toBeUndefined();
  });
});

describe('windyEmbedUrl', () => {
  const base = { lat: 32.0123456, lon: 34.9876543, zoom: 9, overlay: 'radar' as const };

  it('בונה כתובת על בסיס ההטמעה עם השכבה, המרכז והזום', () => {
    const url = windyEmbedUrl(base);
    expect(url.startsWith(`${WINDY_EMBED_BASE}?`)).toBe(true);
    const p = paramsOf(url);
    expect(p.overlay).toBe('radar');
    expect(p.zoom).toBe('9');
    expect(Number(p.lat)).toBeCloseTo(32.01235, 5);
    expect(Number(p.lon)).toBeCloseTo(34.98765, 5);
  });

  it('יחידות תעופה: קשר ומעלות צלזיוס', () => {
    const p = paramsOf(windyEmbedUrl(base));
    expect(p.metricWind).toBe('kt');
    expect(p.metricTemp).toBe('°C');
  });

  it('שכבה מעוגנת נטענת נקייה - בלי תפריט, בלי סמן ובלי הודעה', () => {
    const p = paramsOf(windyEmbedUrl({ ...base, chrome: 'clean' }));
    expect(p.menu).toBe('');
    expect(p.marker).toBe('');
    expect(p.message).toBe('');
    expect(p.detail).toBe('');
  });

  it('חלון צף מקבל סמן - שם עובדים בתוך המפה', () => {
    const p = paramsOf(windyEmbedUrl({ ...base, chrome: 'full' }));
    expect(p.marker).toBe('true');
    // התפריט של Windy נשאר סגור גם שם: תפריט השכבות הוא של SKY-KING, בעברית
    expect(p.menu).toBe('');
  });

  it('שכבת מכ"ם ולוויין נושאות product משלהן, שכבת תחזית לא', () => {
    expect(paramsOf(windyEmbedUrl({ ...base, overlay: 'radar' })).product).toBe('radar');
    expect(paramsOf(windyEmbedUrl({ ...base, overlay: 'satellite' })).product).toBe('satellite');
    expect(paramsOf(windyEmbedUrl({ ...base, overlay: 'temp' })).product).toBeUndefined();
  });

  it('הזום נשלח כמספר שלם גם כשהתקבל שבור', () => {
    expect(paramsOf(windyEmbedUrl({ ...base, zoom: 9.6 })).zoom).toBe('10');
  });

  it('כל שכבה בקטלוג מייצרת כתובת תקינה', () => {
    for (const l of WEATHER_LAYERS) {
      const url = windyEmbedUrl({ ...base, overlay: l.id });
      expect(() => new URL(url)).not.toThrow();
      expect(paramsOf(url).overlay).toBe(l.id);
    }
  });
});
