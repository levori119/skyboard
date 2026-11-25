// אזורים מתוכננים - לאן הפ"מ **אמור** ללכת, כפי שנרשם בפ"מ עצמו
// (`strips.planned_zones`). זה עדיין **לא** שיוך לאזור: אין פין, אין בלוק גובה
// ואין "תפוס". זו הכוונה, והפקח הוא שהופך אותה לשיוך בלחיצה.
//
// על המפה: פ"מ שממריא בעוד פחות מ-10 דקות מופיע כאו"ק קטן **באפור** בפינת
// האזור המתוכנן; משהמריא - **בכחול**. לחיצה עליו משייכת אותו לאזור, ומאותו רגע
// הוא פין רגיל בגודל מלא.

/** כמה דקות לפני ההמראה האו"ק מופיע באזור המתוכנן */
export const PLANNED_ZONE_LEAD_MIN = 10;

/**
 * "705, 711" → ['705', '711']. מפרידים: פסיק, נקודה-פסיק, קו נטוי ושורה חדשה -
 * **לא רווח**, כי לשם אזור מותר להכיל רווח ("קדמי דרום").
 */
export function parsePlannedZones(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;/\n]+/)) {
    const name = part.trim();
    const key = normName(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export function formatPlannedZones(names: string[]): string {
  return names.join(', ');
}

const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * האזורים של המפה הנוכחית שתואמים לשמות, **בסדר שנרשם בפ"מ** - הראשון הוא
 * האזור שאליו הפ"מ ייכנס בלחיצה. התאמה לפי שם, כך שאותו פ"מ נמצא גם במפה
 * הראשית וגם בחלק שלה (לשני האזורים "711" אותו שם ומזהה אחר).
 */
export function matchPlannedZones<Z extends { id: number; name: string }>(names: string[], zones: Z[]): Z[] {
  const byName = new Map<string, Z>();
  for (const z of zones) {
    const k = normName(String(z?.name ?? ''));
    if (k && !byName.has(k)) byName.set(k, z);
  }
  const out: Z[] = [];
  for (const n of names) {
    const z = byName.get(normName(n));
    if (z && !out.includes(z)) out.push(z);
  }
  return out;
}

export type PlannedZoneLabel = 'hidden' | 'pending' | 'airborne';

/**
 * האם להציג את האו"ק באזור המתוכנן, ובאיזה צבע:
 *   airborne - המריא (כחול), בלי תלות בשעה
 *   pending  - ממריא בעוד פחות מ-10 דקות, **או שזמן ההמראה כבר עבר** ועוד לא
 *              סומן שהמריא (אפור) - פ"מ שמאחר לא נעלם מהמפה ברגע ההמראה
 *   hidden   - רחוק מהמראה, או בלי זמן המראה
 */
export function plannedZoneLabel(
  { airborne, takeoffTime }: { airborne: boolean; takeoffTime: string | null | undefined },
  now: number,
  leadMin = PLANNED_ZONE_LEAD_MIN,
): PlannedZoneLabel {
  if (airborne) return 'airborne';
  if (!takeoffTime) return 'hidden';
  const t = Date.parse(takeoffTime);
  if (!Number.isFinite(t)) return 'hidden';
  return t - now < leadMin * 60_000 ? 'pending' : 'hidden';
}
