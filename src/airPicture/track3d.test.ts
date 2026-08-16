import { describe, it, expect } from 'vitest';
import { placeTracks3D } from './track3d';
import { DEFAULT_PREFS } from './prefs';
import type { AirTrack } from '../../shared/airTrafficApi';
import type { MapGeoAnchor } from '../utils/geo';

// מה שנבדק כאן הוא **ההסכמה בין שתי התצוגות**: מטוס שסונן במבט מלמעלה אינו
// יכול להופיע בתלת מימד, ומטוס בלי עוגן אינו מקבל מיקום מנוחש. ההשלכה עצמה
// (geoToImagePct) נבדקת ב-geo, והשרשרת (place/visible/filters/cap) ב-track.

/** עוגן פשוט: (0,0) בפינה, (100,100) בפינה הנגדית. */
const ANCHOR: MapGeoAnchor = {
  x1: 0, y1: 0, lat1: 33, lon1: 34,
  x2: 100, y2: 100, lat2: 32, lon2: 35,
};

const track = (over: Partial<AirTrack> = {}): AirTrack => ({
  id: 't1', cs: 'בננה', lat: 32.5, lon: 34.5, alt: 5000, spd: 200, hdg: 90,
  cls: 'friend', typ: 'jet', resp: '', ...over,
});

describe('placeTracks3D - התמונ"א במרחב הסצנה', () => {
  it('בלי עוגן אין מיקום - הרשימה ריקה, ולא ניחוש', () => {
    expect(placeTracks3D([track()], null, DEFAULT_PREFS, 1, 0)).toEqual([]);
  });

  it('התמונ"א כבויה - שום מטוס, גם כשיש דגימה טרייה', () => {
    expect(placeTracks3D([track()], ANCHOR, { ...DEFAULT_PREFS, on: false }, 1, 0)).toEqual([]);
  });

  it('גובה `alt` הוא **רגל מוחלטת** ומומר ל-AGL מול גובה השדה', () => {
    const [a] = placeTracks3D([track({ alt: 5000 })], ANCHOR, DEFAULT_PREFS, 1, 0);
    expect(a.aglFt).toBe(5000);
    const [b] = placeTracks3D([track({ alt: 5000 })], ANCHOR, DEFAULT_PREFS, 1, 2000);
    expect(b.aglFt).toBe(3000);
  });

  it('המיקום האופקי הוא מרחב ה-iso של הסצנה - x מוכפל ב-aspect', () => {
    const [a] = placeTracks3D([track()], ANCHOR, DEFAULT_PREFS, 1, 0);
    const [b] = placeTracks3D([track()], ANCHOR, DEFAULT_PREFS, 2, 0);
    expect(b.x).toBeCloseTo(a.x * 2, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
  });

  it('סינון הסיווג של הפקח חל גם כאן - **אותם מסננים** של המבט מלמעלה', () => {
    const list = [track({ id: 'f', cls: 'friend' }), track({ id: 'h', cls: 'hostile' })];
    const out = placeTracks3D(list, ANCHOR, { ...DEFAULT_PREFS, classes: ['hostile'] }, 1, 0);
    expect(out.map(o => o.t.id)).toEqual(['h']);
  });

  it('סינון הגובה של הפקח חל גם כאן', () => {
    const list = [track({ id: 'low', alt: 2000 }), track({ id: 'high', alt: 20000 })];
    const out = placeTracks3D(list, ANCHOR, { ...DEFAULT_PREFS, altMin: 10000 }, 1, 0);
    expect(out.map(o => o.t.id)).toEqual(['high']);
  });

  it('מטוס מחוץ לתמונת המפה אינו מגיע לסצנה', () => {
    // הרחק מצפון-מערב לפינת העוגן - מחוץ ל-0..100 ומעבר לשוליים
    const out = placeTracks3D([track({ lat: 40, lon: 20 })], ANCHOR, DEFAULT_PREFS, 1, 0);
    expect(out).toEqual([]);
  });

  it('גובה לא סופי יורד בשקט - הוא היה מוחק את קנה המידה האנכי', () => {
    const out = placeTracks3D(
      [track({ id: 'ok' }), track({ id: 'nan', alt: Number.NaN })], ANCHOR, DEFAULT_PREFS, 1, 0);
    expect(out.map(o => o.t.id)).toEqual(['ok']);
  });
});
