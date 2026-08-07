// מנוע התנועה של מאגר התמונ"א - **חישוב על-פי-קריאה, לא על-פי-טיק**.
//
// ההחלטה המרכזית (AIR_PICTURE_SPEC.md §9.2): המאגר לא מריץ setInterval שמזיז
// מטוסים ושומר מצב. הוא שומר את **הגדרת** המסלול (נקודות דרך + מהירות + גבהים
// + זמן התחלה), וכשמגיעה בקשה הוא מחשב איפה כל מטוס נמצא עכשיו - כפונקציה
// טהורה של הזמן.
//
// ארבעה רווחים שמצדיקים את זה:
//   · אפס CPU במנוחה - מאגר שאיש לא קורא לו לא צורך כלום.
//   · בלי drift - טיקים שמצטברים סוטים; חישוב מ-t0 תמיד מדויק.
//   · עמיד לאתחול - הפעלה מחדש לא מאבדת מיקומים, הם נגזרים מהזמן.
//   · "הרצה בשעה מסוימת" מגיעה בחינם - t0 עתידי, והמטוס פשוט אינו באוויר.
//
// אין כאן Date.now(): הזמן נכנס תמיד כפרמטר. זה מה שהופך את הבדיקות
// לדטרמיניסטיות ומאפשר לשאול "איפה המטוס בדקה העשירית" בלי להמתין.

import { buildSnapshot } from '../shared/airTrafficApi.js';

/** רדיוס כדור הארץ במייל ימי. */
const R_NM = 3440.065;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** מהירות מינימלית. מטוס במהירות 0 לא היה מסיים את הצלע לעולם (חלוקה באפס). */
const MIN_SPD_KT = 1;

/** מרחק גדול-מעגלי במייל ימי. haversine - מדויק גם לצלעות קצרות. */
export function distanceNm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** כיוון התחלתי מ-a ל-b, 0..359. אותה נקודה = 0. */
export function bearingDeg(a, b) {
  const dLon = rad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat))
    - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLon);
  if (y === 0 && x === 0) return 0;
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

const spdOf = (wp) => Math.max(MIN_SPD_KT, Number(wp?.spd) || 0);

/**
 * לוח הזמנים של המסלול: לכל צלע מרחק, משך, וחלון הזמן שלה.
 *
 * המשך נגזר מ**ממוצע** המהירויות בשני קצות הצלע ולא מאחת מהן. זה מה שמאפשר
 * לרמפת המהירות לסגור בדיוק את המרחק: בהאצה ליניארית המרחק שנצבר הוא
 * v_ממוצע × T, ולכן T = מרחק / v_ממוצע. עם v0 בלבד המטוס היה "מפספס" את
 * נקודת הדרך בכל צלע שבה המהירות משתנה.
 */
export function legTimings(legs) {
  const out = [];
  let total = 0;
  if (!Array.isArray(legs) || legs.length < 2) return { legs: out, total: 0 };
  for (let i = 0; i < legs.length - 1; i++) {
    const from = legs[i];
    const to = legs[i + 1];
    const distNm = distanceNm(from, to);
    const avgKt = (spdOf(from) + spdOf(to)) / 2;
    const secs = (distNm / avgKt) * 3600;
    out.push({ i, from, to, distNm, secs, tStart: total, tEnd: total + secs });
    total += secs;
  }
  return { legs: out, total };
}

const lerp = (a, b, f) => a + (b - a) * f;

/**
 * מיקום המטוס אחרי `elapsedSec` שניות מתחילת המסלול.
 * `null` = **אינו באוויר**: טרם המריא, סיים את המסלול, או שהמסלול פסול.
 * זה לא מקרה שגיאה אלא מצב תפעולי - וזו הסיבה שמטוס פשוט נעלם מהתמונה
 * במקום להיערם בה.
 */
export function positionAt(aircraft, elapsedSec) {
  const { legs, total } = legTimings(aircraft?.legs);
  if (!legs.length || total <= 0) return null;
  if (!Number.isFinite(elapsedSec) || elapsedSec < 0) return null;

  let e = elapsedSec;
  if (e > total) {
    if (!aircraft.loop) return null;
    e %= total;
  }

  const leg = legs.find(l => e >= l.tStart && e <= l.tEnd) || legs[legs.length - 1];
  const T = leg.secs;
  const t = Math.min(Math.max(e - leg.tStart, 0), T);

  // המרחק שנצבר תחת האצה ליניארית: d(t) = v0·t + (v1-v0)·t²/(2T).
  // ב-t=T זה נותן בדיוק את אורך הצלע (ראה legTimings), ולכן המטוס נוחת על
  // נקודת הדרך ולא לידה.
  const v0 = spdOf(leg.from) / 3600;
  const v1 = spdOf(leg.to) / 3600;
  const covered = T > 0 ? v0 * t + ((v1 - v0) * t * t) / (2 * T) : leg.distNm;
  const f = leg.distNm > 0 ? Math.min(Math.max(covered / leg.distNm, 0), 1) : 1;

  return {
    // אינטרפולציה ליניארית בנ"צ ולא על הקשת: בסדרי הגודל של אזור מבצעי
    // (עשרות מיילים) הפער מהמסלול הגדול-מעגלי קטן מרזולוציית הפיקסל בעמדה.
    lat: lerp(leg.from.lat, leg.to.lat, f),
    lon: lerp(leg.from.lon, leg.to.lon, f),
    // הגובה נפרס על הצלע - זו המשמעות של "נקודת שינוי גובה": הטיפוס מתחיל
    // בנקודה אחת ומסתיים בבאה, ולא קופץ.
    alt: lerp(Number(leg.from.alt) || 0, Number(leg.to.alt) || 0, f),
    // המהירות נגזרת מהרמפה בזמן (ולא מהמרחק) - זה מה שהמכ"ם היה מודד.
    spd: T > 0 ? lerp(spdOf(leg.from), spdOf(leg.to), t / T) : spdOf(leg.to),
    hdg: bearingDeg(leg.from, leg.to),
  };
}

/**
 * התמונה האווירית המלאה ברגע `nowMs` - כל המטוסים מכל התרחישים הרצים.
 *
 * תרחיש בלי `startAt` אינו רץ, ולכן המטוסים שלו אינם באוויר. זה ההבדל בין
 * "תרחיש שנבנה" ל"תרחיש שהורץ", והוא נשמר כשדה יחיד ולא כדגל נפרד: `startAt`
 * הוא גם המתג וגם נקודת הייחוס לחישוב.
 */
export function snapshotAt(scenarios, nowMs) {
  const raws = [];
  for (const sc of scenarios || []) {
    if (!sc || sc.enabled === false) continue;
    // `startAt == null` נבדק **לפני** ההמרה: Number(null) הוא 0, לא NaN. בלי
    // הבדיקה הזו תרחיש עצור נראה כמי שהומרא ב-1970, ומסלול מעגלי היה גולש
    // חזרה לתוך התמונה - כלומר תרחיש שאיש לא הריץ משדר מטוסים לעמדה.
    if (sc.startAt == null) continue;
    const startAt = Number(sc.startAt);
    if (!Number.isFinite(startAt)) continue;
    const elapsed = (nowMs - startAt) / 1000;
    for (const ac of sc.tracks || []) {
      const p = positionAt({ ...ac, loop: ac.loop ?? sc.loop }, elapsed);
      if (!p) continue;
      raws.push({
        id: ac.id, cs: ac.cs, cls: ac.cls, typ: ac.typ, resp: ac.resp,
        lat: p.lat, lon: p.lon, alt: p.alt, spd: p.spd, hdg: p.hdg,
      });
    }
  }
  return buildSnapshot(nowMs, raws);
}
