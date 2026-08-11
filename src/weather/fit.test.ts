import { describe, it, expect } from 'vitest';
import { fitWindyToMap, anchorCenter, OVERSCAN } from './fit';
import type { MapGeoAnchor } from '../utils/geo';

/**
 * מפה קונפורמית (מרקטורית) סביב 32°N - מה שמפה תעופתית באמת נראית כמוה:
 * מעלה קו רוחב תופסת על הנייר פי 1/cos(32°) ממעלה קו אורך.
 *
 * העוגנים נקבעים ב-25% וב-75% מהתמונה - לא בפינות - כדי שהבדיקה תעבור גם דרך
 * ההרחבה של המיפוי אל מחוץ לקטע שבין העוגנים, בדיוק כמו במפה אמיתית.
 */
const LAT0 = 32;
const COS = Math.cos((LAT0 * Math.PI) / 180);

/** בונה עוגן לפריסה גיאוגרפית נתונה על תמונה שלמה. */
const anchorFor = (spanLon: number, spanLat: number): MapGeoAnchor => ({
  x1: 25, y1: 25, lon1: 34 + spanLon * 0.25, lat1: LAT0 + spanLat * 0.25,
  x2: 75, y2: 75, lon2: 34 + spanLon * 0.75, lat2: LAT0 - spanLat * 0.25,
});

const BOUNDS = { top: 0, left: 0, width: 1000, height: 700 };

describe('fitWindyToMap', () => {
  it('מפה קונפורמית - הסקייל זהה בשני הצירים', () => {
    // גובה התמונה ביחס לרוחבה קובע את פריסת קווי הרוחב במפה מרקטורית
    const spanLon = 0.5;
    const spanLat = (spanLon * COS * BOUNDS.height) / BOUNDS.width;
    const fit = fitWindyToMap(anchorFor(spanLon, spanLat), BOUNDS)!;

    expect(fit).not.toBeNull();
    expect(fit.scaleY / fit.scaleX).toBeCloseTo(1, 2);
  });

  it('הזום שלם, בטווח, וה-scale מחזיר את קנה המידה המדויק של המפה', () => {
    const spanLon = 0.5;
    const fit = fitWindyToMap(anchorFor(spanLon, 0.3), BOUNDS)!;

    expect(Number.isInteger(fit.zoom)).toBe(true);
    expect(fit.zoom).toBeGreaterThanOrEqual(2);
    expect(fit.zoom).toBeLessThanOrEqual(15);

    // רוחב העולם בזום שנבחר, אחרי הסקייל, חייב לכסות בדיוק את רוחב התמונה
    const worldPxPerDegLon = (256 * 2 ** fit.zoom) / 360;
    expect(worldPxPerDegLon * fit.scaleX * spanLon).toBeCloseTo(BOUNDS.width, 6);
  });

  it('הסקייל צמוד לזום שנבחר ולכן קרוב ל-1 (עד גורם 2)', () => {
    // כל עיגול של log2 מזיז את הסקייל לכל היותר פי שורש 2 לכל כיוון
    for (const spanLon of [0.05, 0.13, 0.4, 1.1, 3]) {
      const fit = fitWindyToMap(anchorFor(spanLon, spanLon * 0.7), BOUNDS)!;
      expect(fit.scaleX).toBeGreaterThan(0.7);
      expect(fit.scaleX).toBeLessThan(1.45);
    }
  });

  it('מסגרת ה-iframe גדולה מהמפה בשיעור ה-overscan, כדי שסרגל הזמן של Windy ייחתך', () => {
    const fit = fitWindyToMap(anchorFor(0.5, 0.3), BOUNDS)!;
    // עיגול ה-iframe לפיקסל שלם משאיר סטייה של עד פיקסל - היא נחתכת ממילא
    expect(fit.frameW * fit.scaleX).toBeCloseTo(BOUNDS.width * OVERSCAN, -1);
    expect(fit.frameH * fit.scaleY).toBeCloseTo(BOUNDS.height * OVERSCAN, -1);
  });

  it('המרכז הוא מרכז התמונה, גם כשהעוגנים אינם בפינות', () => {
    const fit = fitWindyToMap(anchorFor(0.5, 0.3), BOUNDS)!;
    expect(fit.centerLon).toBeCloseTo(34.25, 6);
    expect(fit.centerLat).toBeCloseTo(LAT0, 6);
  });

  it('עוגן מנוון / חסר / גבולות ריקים - אין התאמה, ולא קריסה', () => {
    expect(fitWindyToMap(null, BOUNDS)).toBeNull();
    expect(fitWindyToMap(anchorFor(0.5, 0.3), null)).toBeNull();
    expect(fitWindyToMap(anchorFor(0.5, 0.3), { ...BOUNDS, width: 0 })).toBeNull();
    // שני עוגנים על אותה נקודה בתמונה - אין קנה מידה להסיק ממנו
    expect(fitWindyToMap({ x1: 10, y1: 10, x2: 10, y2: 90, lat1: 32, lon1: 34, lat2: 31, lon2: 35 }, BOUNDS)).toBeNull();
    // אותו קו אורך לשני העוגנים - פריסה אפסית
    expect(fitWindyToMap({ x1: 10, y1: 10, x2: 90, y2: 90, lat1: 32, lon1: 34, lat2: 31, lon2: 34 }, BOUNDS)).toBeNull();
  });

  it('עוגן מעוות קיצונית - הסקייל נחסם ולא מותח את המסך', () => {
    // פריסת רוחב עצומה מול פריסת אורך זעירה = יחס לא-פיזי
    const skewed: MapGeoAnchor = { x1: 0, y1: 0, x2: 100, y2: 100, lat1: 40, lon1: 34, lat2: 20, lon2: 34.01 };
    const fit = fitWindyToMap(skewed, BOUNDS)!;
    expect(fit).not.toBeNull();
    expect(fit.scaleY / fit.scaleX).toBeLessThanOrEqual(3.0001);
    expect(fit.scaleY / fit.scaleX).toBeGreaterThanOrEqual(1 / 3.0001);
  });
});

describe('anchorCenter', () => {
  it('מחזיר את מרכז המפה לחלון הצף', () => {
    const c = anchorCenter(anchorFor(0.5, 0.3))!;
    expect(c.lat).toBeCloseTo(LAT0, 9);
    expect(c.lon).toBeCloseTo(34.25, 9);
  });
  it('בלי עוגן - null, והחלון ייפתח על ברירת המחדל', () => {
    expect(anchorCenter(null)).toBeNull();
    expect(anchorCenter({ x1: 5, y1: 5, x2: 5, y2: 5, lat1: 1, lon1: 1, lat2: 2, lon2: 2 })).toBeNull();
  });
});
