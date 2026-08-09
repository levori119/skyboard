// שכבת החישוב של התמונ"א בעמדה - **פונקציות טהורות בלבד**.
//
// אין כאן React, אין DOM, ואין קריאה לשעון: הזמן נכנס כפרמטר. זו הסיבה שכל
// הקובץ נבדק ב-vitest, וזו גם הסיבה שאפשר להריץ אותו 10 פעמים בשנייה בתוך
// לולאת הציור בלי לגעת ב-state של אף רכיב (AIR_PICTURE_SPEC.md §5.3).
//
// זכור: מה שעובר כאן הוא **מטוס פיזי בשמיים**, לא פ"מ (§0).

import type { AirTrack, Classification } from '../../shared/airTrafficApi';
import { geoToImagePct, type MapGeoAnchor } from '../utils/geo';

/**
 * תקרת התכנון. **נאכפת בקוד ולא מונחת** - זו ההנחה היחידה במערכת שגורם מחוץ
 * ל-SKY-KING יכול להפר, ומאגר שיחזיר יום אחד 900 מטוסים היה מפיל את העמדה
 * מתחת לפקח בזמן אמת.
 */
export const MAX_TRACKS = 300;

/** מטוס אחרי השלכה למרחב אחוזי-התמונה של המפה. */
export interface PlacedTrack extends AirTrack {
  /** אחוז מרוחב תמונת המפה (0..100). יכול לחרוג מחוץ לטווח - ראה `visible`. */
  x: number;
  /** אחוז מגובה תמונת המפה (0..100). */
  y: number;
}

export interface TrackFilters {
  /** הסיווגים המוצגים. ריק = שום סיווג (כיבוי מלא), לא "הכול". */
  classes: Classification[];
  /** טווח גובה ברגל. `null` = בלי חסם בצד הזה. */
  altMin: number | null;
  altMax: number | null;
  /** אחראיות. ריק = כל האחראיות. */
  resp: string;
}

/**
 * חישוב-חשבון (dead reckoning) - איפה המטוס **עכשיו**, לפי הדגימה האחרונה
 * ולפי הזמן שחלף ממנה.
 *
 * בלעדיו המטוסים מנתרים כל 2 שניות. בסביבת ATC ניתור נקרא כתקלה ופוגע באמון
 * בתמונה. העלות היא **אפס בקשות רשת** - זה חישוב מקומי בלולאה שממילא רצה.
 *
 * הקירוב שטוח בכוונה: בשתי שניות ובמהירות סבירה התזוזה היא פחות ממייל, ושגיאת
 * המישור מול הקשת שם קטנה מרזולוציית הפיקסל.
 */
export function deadReckon(t: AirTrack, dtSec: number): { lat: number; lon: number } {
  if (!Number.isFinite(dtSec) || dtSec <= 0) return { lat: t.lat, lon: t.lon };
  const distNm = (t.spd * dtSec) / 3600;
  const rad = (t.hdg * Math.PI) / 180;
  const dLat = (distNm * Math.cos(rad)) / 60;
  const cosLat = Math.cos((t.lat * Math.PI) / 180);
  const dLon = Math.abs(cosLat) < 1e-6 ? 0 : (distNm * Math.sin(rad)) / (60 * cosLat);
  return { lat: t.lat + dLat, lon: t.lon + dLon };
}

/**
 * השלכה למרחב המפה. `dtSec` הוא הזמן מאז **הדגימה**, ולכן חישוב-החשבון
 * והשלכת הנ"צ קורים יחד ובמעבר אחד.
 */
export function place(tracks: AirTrack[], anchor: MapGeoAnchor, dtSec: number): PlacedTrack[] {
  const out: PlacedTrack[] = [];
  for (const t of tracks) {
    const p = deadReckon(t, dtSec);
    const pct = geoToImagePct(p.lat, p.lon, anchor);
    out.push({ ...t, lat: p.lat, lon: p.lon, x: pct.x, y: pct.y });
  }
  return out;
}

/**
 * סינון גיאוגרפי - מי בכלל בתחומי המפה.
 *
 * זה הסינון **הזול** שרץ ראשון: מאגר ארצי מחזיר גם מטוסים שאין להם שום קשר
 * למפה שעל השולחן, ואין טעם לחשב עליהם תווית או מרחק. השוליים קיימים כדי
 * שמטוס שנכנס לתמונה לא "יקפוץ" לתוכה מהקצה.
 */
export function visible(list: PlacedTrack[], marginPct = 8): PlacedTrack[] {
  return list.filter(t =>
    t.x >= -marginPct && t.x <= 100 + marginPct &&
    t.y >= -marginPct && t.y <= 100 + marginPct);
}

/** המניפולציות של הפקח. הכול מקומי לעמדה - לא נשלח לשרת ולא נשמר ב-DB. */
export function applyFilters(list: PlacedTrack[], f: TrackFilters): PlacedTrack[] {
  const resp = f.resp.trim();
  return list.filter(t => {
    if (!f.classes.includes(t.cls)) return false;
    if (f.altMin != null && t.alt < f.altMin) return false;
    if (f.altMax != null && t.alt > f.altMax) return false;
    if (resp && t.resp !== resp) return false;
    return true;
  });
}

/**
 * אכיפת התקרה. חותך את ה**רחוקים ממרכז המפה** ולא את סוף הרשימה: אילו החיתוך
 * היה "300 הראשונים", מאגר שמחזיר לפי סדר שרירותי היה מסתיר דווקא את המטוס
 * שמעל השדה.
 *
 * רץ **אחרון** בשרשרת - אחרי הסינון של הפקח. אחרת מטוס שסונן החוצה היה תופס
 * מקום בתקרה ודוחק מטוס רלוונטי.
 */
export function capNearest(list: PlacedTrack[], max = MAX_TRACKS): PlacedTrack[] {
  if (list.length <= max) return list;
  const d = (t: PlacedTrack) => (t.x - 50) ** 2 + (t.y - 50) ** 2;
  return [...list].sort((a, b) => d(a) - d(b)).slice(0, max);
}

/** השרשרת המלאה, בסדר הקבוע: השלכה → נראות → סינון → תקרה. */
export function prepare(
  tracks: AirTrack[], anchor: MapGeoAnchor, dtSec: number, f: TrackFilters, max = MAX_TRACKS,
): PlacedTrack[] {
  return capNearest(applyFilters(visible(place(tracks, anchor, dtSec)), f), max);
}

/**
 * גיל התמונה בשניות, מול שעון **המאגר**.
 * מסתמכים על `t` של המאגר ולא על שעון העמדה: עמדה ששעונה סטה הייתה מציגה
 * תמונה ישנה כאילו היא חיה - וזו טעות תפעולית, לא באג תצוגה.
 */
export function ageSec(snapshotT: number, nowMs: number): number {
  return Math.max(0, (nowMs - snapshotT) / 1000);
}

/** מעל הסף התמונה מסומנת כישנה. שתי דגימות שהוחמצו ועוד מרווח. */
export const STALE_AFTER_SEC = 6;

/**
 * כמה מטוסים באמת **נראים** - בתוך גבולות התמונה, בלי השוליים.
 *
 * `visible()` מרחיב ב-8% כדי שמטוס שנכנס לתמונה לא יקפוץ מהקצה, אבל מה
 * שמעבר ל-0..100 נחתך ע"י הקנבס ואינו נראה. ספירה שכוללת אותו אומרת לפקח
 * "יש מטוס באזור" מול מסך ריק - וזה בדיוק הבלבול שדווח בעמדת שדה, שבה
 * הקנבס מכסה 8 ק"מ ו-8% הם 700 מטר.
 */
export function countOnScreen(list: PlacedTrack[]): number {
  let n = 0;
  for (const t of list) if (t.x >= 0 && t.x <= 100 && t.y >= 0 && t.y <= 100) n++;
  return n;
}
