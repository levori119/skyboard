// בדיקות מנוע התנועה של מאגר התמונ"א.
//
// כל בדיקה כאן היא **פונקציה של הזמן בלבד** - אין שרת, אין שעון, אין setInterval.
// זו בדיוק הסיבה שהמנוע נכתב כחישוב על-פי-קריאה (AIR_PICTURE_SPEC.md §9.2):
// אפשר לשאול "איפה המטוס בדקה העשירית" בלי להמתין עשר דקות.
import { describe, it, expect } from 'vitest';
import { distanceNm, bearingDeg, legTimings, positionAt, snapshotAt } from './sim.js';

// מעלת רוחב אחת היא ~60.04 NM ולא 60.00 עגול: המייל הימי מוגדר כדקת קשת על
// **המרידיאן**, ואילו החישוב כאן הוא על ספירה ברדיוס ממוצע. הפער (0.06%) זניח
// תפעולית אבל אמיתי, ולכן הבדיקות שלמטה נגזרות מ-legTimings עצמו במקום ממספר
// עגול שהומצא כאן - כך הן בודקות **התנהגות** ולא את החשבון של מי שכתב אותן.
const N = (lat, lon, alt = 10000, spd = 360) => ({ lat, lon, alt, spd });

describe('distanceNm', () => {
  it('מעלת רוחב אחת = ~60.04 מייל ימי', () => {
    expect(distanceNm(N(32, 35), N(33, 35))).toBeCloseTo(60.04, 2);
  });

  it('אותה נקודה = 0', () => {
    expect(distanceNm(N(32, 35), N(32, 35))).toBe(0);
  });

  it('מעלת אורך מתכווצת עם קו הרוחב', () => {
    // ב-32° צפון: 60 * cos(32) ≈ 50.9
    expect(distanceNm(N(32, 35), N(32, 36))).toBeCloseTo(50.9, 0);
  });
});

describe('bearingDeg', () => {
  it('צפונה = 0', () => expect(bearingDeg(N(32, 35), N(33, 35))).toBeCloseTo(0, 0));
  it('מזרחה = 90', () => expect(bearingDeg(N(32, 35), N(32, 36))).toBeCloseTo(90, 0));
  it('דרומה = 180', () => expect(bearingDeg(N(33, 35), N(32, 35))).toBeCloseTo(180, 0));
  it('מערבה = 270', () => expect(bearingDeg(N(32, 36), N(32, 35))).toBeCloseTo(270, 0));
});

describe('legTimings', () => {
  it('מעלת רוחב ב-360 קשר = ~10 דקות', () => {
    const { total, legs } = legTimings([N(32, 35), N(33, 35)]);
    expect(total).toBeCloseTo(600, -1); // 10 דקות, עד עשרות שניות
    expect(legs).toHaveLength(1);
    expect(legs[0].distNm).toBeCloseTo(60.04, 2);
  });

  it('מהירות משתנה - הזמן לפי הממוצע, ולכן זהה לצלע במהירות הממוצעת', () => {
    // 300 → 420 קשר. הממוצע הוא 360, ולכן המשך חייב לצאת זהה בדיוק.
    const ramp = legTimings([N(32, 35, 10000, 300), N(33, 35, 10000, 420)]);
    const flat = legTimings([N(32, 35, 10000, 360), N(33, 35, 10000, 360)]);
    expect(ramp.total).toBeCloseTo(flat.total, 6);
  });

  it('מסלול בן שלוש נקודות מצטבר', () => {
    const { total, legs } = legTimings([N(32, 35), N(33, 35), N(34, 35)]);
    expect(legs).toHaveLength(2);
    // שתי צלעות זהות: השנייה מתחילה בדיוק כשהראשונה נגמרת, והסך הוא כפל.
    expect(legs[1].tStart).toBeCloseTo(legs[0].secs, 6);
    expect(total).toBeCloseTo(legs[0].secs * 2, 6);
  });

  it('פחות משתי נקודות = אין מסלול', () => {
    expect(legTimings([N(32, 35)]).total).toBe(0);
    expect(legTimings([]).legs).toHaveLength(0);
  });
});

describe('positionAt', () => {
  const ac = { id: 't1', legs: [N(32, 35, 5000, 360), N(33, 35, 25000, 360)] };
  /** משך המסלול בפועל - הבדיקות נשענות עליו ולא על מספר שהומצא כאן. */
  const TOTAL = legTimings(ac.legs).total;

  it('לפני ההמראה - המטוס אינו באוויר', () => {
    expect(positionAt(ac, -1)).toBeNull();
  });

  it('ברגע ההתחלה - בדיוק על הנקודה הראשונה', () => {
    const p = positionAt(ac, 0);
    expect(p.lat).toBeCloseTo(32, 6);
    expect(p.lon).toBeCloseTo(35, 6);
    expect(p.alt).toBeCloseTo(5000, 0);
  });

  it('בסוף המסלול - בדיוק על הנקודה האחרונה', () => {
    const p = positionAt(ac, TOTAL);
    expect(p.lat).toBeCloseTo(33, 6);
    expect(p.alt).toBeCloseTo(25000, 6);
  });

  it('אחרי סוף המסלול - נעלם מהתמונה', () => {
    expect(positionAt(ac, TOTAL + 1)).toBeNull();
  });

  it('באמצע - חצי הדרך וחצי הטיפוס', () => {
    const p = positionAt(ac, TOTAL / 2);
    expect(p.lat).toBeCloseTo(32.5, 6);
    expect(p.alt).toBeCloseTo(15000, 6); // נקודת שינוי גובה נפרסת על הצלע
    expect(p.hdg).toBeCloseTo(0, 6);
  });

  it('מסלול מעגלי חוזר להתחלה', () => {
    const loop = { ...ac, loop: true };
    const a = positionAt(loop, 60);
    const b = positionAt(loop, TOTAL + 60); // סיבוב שלם + 60
    expect(b.lat).toBeCloseTo(a.lat, 6);
    expect(b.alt).toBeCloseTo(a.alt, 6);
  });

  it('דטרמיניסטי - אותו זמן, אותה תוצאה', () => {
    expect(positionAt(ac, 137)).toEqual(positionAt(ac, 137));
  });

  it('מהירות עולה - הכיסוי בחצי הזמן קטן מחצי המרחק', () => {
    const slowFast = { id: 't2', legs: [N(32, 35, 10000, 200), N(33, 35, 10000, 520)] };
    const { total } = legTimings(slowFast.legs);
    const mid = positionAt(slowFast, total / 2);
    expect(mid.lat).toBeLessThan(32.5);   // עוד לא באמצע הדרך
    expect(mid.spd).toBeCloseTo(360, 0);  // אבל כן באמצע הרמפה
  });

  it('מסלול פסול לא מפיל - מחזיר null', () => {
    expect(positionAt({ id: 'x', legs: [] }, 10)).toBeNull();
    expect(positionAt({ id: 'x' }, 10)).toBeNull();
    expect(positionAt(null, 10)).toBeNull();
  });
});

describe('snapshotAt', () => {
  const T0 = 1786108800000; // חותמת קבועה - הבדיקה לא נשענת על Date.now()
  const scenario = (over = {}) => ({
    id: 'sc-1', name: 'צפון', startAt: T0, loop: false,
    tracks: [{ id: 't1', cs: 'אפיק 21', cls: 'friend', typ: 'f16', resp: 'צפון',
      legs: [N(32, 35, 5000, 360), N(33, 35, 25000, 360)] }],
    ...over,
  });

  it('מטוס שההרצה שלו טרם החלה אינו בתמונה', () => {
    const snap = snapshotAt([scenario({ startAt: T0 + 60000 })], T0);
    expect(snap.tracks).toHaveLength(0);
  });

  it('תרחיש בלי זמן התחלה אינו רץ', () => {
    expect(snapshotAt([scenario({ startAt: null })], T0).tracks).toHaveLength(0);
  });

  it('תרחיש עצור עם מסלול מעגלי אינו משדר - Number(null) הוא 0, לא NaN', () => {
    // רגרסיה: לפני התיקון startAt:null נקרא כ"הומרא ב-1970", והמסלול המעגלי
    // גלש חזרה לתוך התמונה. תרחיש שאיש לא הריץ שידר מטוסים לעמדה.
    const idle = scenario({ startAt: null, loop: true });
    idle.tracks[0].loop = true;
    expect(snapshotAt([idle], T0).tracks).toHaveLength(0);
    expect(snapshotAt([scenario({ startAt: undefined, loop: true })], T0).tracks).toHaveLength(0);
  });

  it('תרחיש מנוטרל אינו משדר גם כשהוא מורץ', () => {
    expect(snapshotAt([scenario({ enabled: false })], T0 + 300000).tracks).toHaveLength(0);
  });

  it('מטוס בהרצה מופיע עם כל שדות החוזה', () => {
    const snap = snapshotAt([scenario()], T0 + 300000);
    expect(snap.tracks).toHaveLength(1);
    const t = snap.tracks[0];
    expect(t).toMatchObject({ id: 't1', cs: 'אפיק 21', cls: 'friend', typ: 'f16', resp: 'צפון' });
    expect(t.lat).toBeCloseTo(32.5, 3);
    expect(t.hdg).toBe(0);
    expect(t.spd).toBe(360);
  });

  it('seq הוא טיק של שנייה - מונוטוני ודטרמיניסטי', () => {
    expect(snapshotAt([], T0).seq).toBe(Math.floor(T0 / 1000));
    expect(snapshotAt([], T0 + 2000).seq).toBe(Math.floor(T0 / 1000) + 2);
  });

  it('t הוא שעון המאגר כפי שנמסר', () => {
    expect(snapshotAt([], T0).t).toBe(T0);
  });

  it('אותה שאילתה פעמיים = אותה תמונה', () => {
    expect(snapshotAt([scenario()], T0 + 12345)).toEqual(snapshotAt([scenario()], T0 + 12345));
  });

  it('מסנן סיווג לא מוכר לברירת מחדל בלמ"ז במקום להפיל', () => {
    const bad = scenario();
    bad.tracks[0].cls = 'זבל';
    expect(snapshotAt([bad], T0 + 1000).tracks[0].cls).toBe('unknown');
  });

  it('מכבד את תקרת 300 המטוסים', () => {
    const many = scenario({ tracks: Array.from({ length: 400 }, (_, i) => ({
      id: `t${i}`, cs: `ac${i}`, cls: 'friend', typ: 'f16',
      legs: [N(32, 35), N(33, 35)],
    })) });
    expect(snapshotAt([many], T0 + 1000).tracks).toHaveLength(300);
  });
});
