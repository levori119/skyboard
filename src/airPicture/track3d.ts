// התמונ"א בסצנה התלת מימדית - **השלכה בלבד, בלי לוגיקה משלה**.
//
// זכור את ההבחנה של CLAUDE.md §0: מה שעובר כאן הוא **המטוס הפיזי בשמיים**
// (תמונ"א), ולא הפ"מ. שתי שכבות מידע נפרדות שלא מתערבבות - הפ"מ יושב על צלע
// ההקפה לפי הרישום, והמטוס הזה יושב במקום שהמאגר מדד.
//
// **כל** ההחלטות (מי נראה, מי סונן, איזו תקרה) נעשות ב-`prepare` של המבט
// מלמעלה. כאן נוספת רק המרת הצירים: אחוזי תמונה → מרחב iso של הסצנה, וגובה
// מוחלט → רגל מעל פני השדה. אילו הסינון היה משוכפל כאן, מטוס היה יכול להיראות
// במבט אחד ולא בשני - וזו בדיוק סתירה שהפקח אינו יכול לגלות מהמסך.

import type { AirTrack } from '../../shared/airTrafficApi';
import type { MapGeoAnchor } from '../utils/geo';
import { aglOf } from '../utils/pattern3d';
import { prepare, filtersOf, type PlacedTrack } from './track';
import type { AirPicturePrefs } from './prefs';

/** מטוס תמונ"א אחרי השלכה למרחב הסצנה. */
export interface Track3D {
  /** המטוס כפי שהוא במבט מלמעלה - אותה רשומה, אותם שדות. */
  t: PlacedTrack;
  /** מרחב iso של הסצנה: `x_pct * aspect`, `y_pct`. */
  x: number;
  y: number;
  /**
   * גובה ב**רגל מעל פני השדה** - אותו ציר של בלוקי הגבהים.
   * `AirTrack.alt` הוא גובה **מוחלט ברגל** (shared/airTrafficApi.d.ts:18), ולכן
   * ההמרה היא `aglOf` בדיוק כמו לבלוקים, ולא חלוקה ברמת טיסה.
   */
  aglFt: number;
}

/**
 * המטוסים לציור בסצנה. **מפה לא מעוגנת → רשימה ריקה**: בלי עוגן אין מיקום,
 * וניחוש מיקום של מטוס פיזי הוא בדיוק סוג המידע השגוי שאסור להציג לפקח.
 *
 * `dtSec` הוא חישוב-החשבון (dead reckoning). ברירת המחדל 0 - הסצנה מציירת את
 * **הדגימה** ולא הערכה שלה: הקנבס השטוח מרענן 10 פעמים בשנייה ולכן ההחלקה שם
 * חיה, בעוד שסצנת ה-SVG מרונדרת רק כשמשהו משתנה, ו"הערכה קפואה" גרועה מדגימה
 * אמיתית.
 */
export function placeTracks3D(
  tracks: AirTrack[] | null | undefined,
  anchor: MapGeoAnchor | null | undefined,
  prefs: AirPicturePrefs | null | undefined,
  aspect: number,
  elevFt?: number | null,
  dtSec = 0,
): Track3D[] {
  if (!anchor || !prefs || !prefs.on) return [];
  const a = Number(aspect) || 1;
  return prepare(tracks || [], anchor, dtSec, filtersOf(prefs))
    // גובה לא סופי אינו "אפס" - הוא מטוס שאי אפשר למקם אנכית, והוא היה מוחק
    // את קנה המידה האנכי של כל הסצנה. יורד בשקט, ונשאר במבט מלמעלה.
    .filter(t => Number.isFinite(t.alt))
    .map(t => ({ t, x: t.x * a, y: t.y, aglFt: aglOf(t.alt, elevFt) }));
}
