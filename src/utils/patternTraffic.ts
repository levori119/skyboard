// טבלת "בהקפה" - **פונקציה טהורה**. ראה PATTERN_AUTOTRACK_SPEC.md §7.
//
// מטוס שעזב את נקודת ההצטרפות יצא מהטבלה שלה, ועד עכשיו לא היה מקום שבו רואים
// אותו - ולא היה אפשר לגעת בו (שכבת ההקפה על המפה אינה לחיצה). כאן: שורה לכל
// מטוס, מקובצת לפי מסלול הנחיתה וממוינת לפי גובה, הגבוה ראשון - אותה מוסכמה של
// טבלת בלוקי הגבהים, כדי שהעין לא תתהפך בין שתי טבלאות שיושבות זו ליד זו.

import { getFormationDisplayName } from './strips';
import { greensAlert, normalizeLeg } from './joiningPoints';
import { altOnLeg, altProfileOf } from './pattern3d';
import { normalizeGeometry, type LegKey } from './trafficPattern';

type Row = Record<string, any>;

export interface PatternTrafficRow {
  key: string;
  stripId: string;
  idx: number;
  label: string;
  runwayIdent: string;
  patternId: number | null;
  /** downwind / base / final / none. */
  leg: string;
  greens: boolean;
  greensAlert: boolean;
  /** גובה מוחלט ברגל. */
  altFt: number | null;
  /** `track` = הרכיב האווירי המשודך · `planned` = פרופיל ההקפה באותה צלע. */
  altSource: 'track' | 'planned' | null;
}

export interface PatternTrafficGroup { runwayIdent: string; rows: PatternTrafficRow[] }

export function patternTrafficGroups(p: {
  aircraft: Row[];
  patterns: Row[];
  /** `aircraftKey` → גובה הרכיב המשודך (מוחלט). */
  trackAltByKey: Map<string, number>;
  elevFt: number | null | undefined;
}): PatternTrafficGroup[] {
  const byPattern = new Map((p.patterns || []).map(x => [Number(x.id), x]));
  const groups = new Map<string, PatternTrafficRow[]>();

  for (const a of p.aircraft || []) {
    const leg = normalizeLeg(a.flight_status);
    if (a.in_pattern !== true || leg === 'landed') continue;
    const stripId = String(a.strip_id);
    const idx = Number(a.aircraft_idx);
    const key = `${stripId}|${idx}`;
    const pat = a.pattern_id != null ? byPattern.get(Number(a.pattern_id)) : undefined;

    let altFt: number | null = null;
    let altSource: PatternTrafficRow['altSource'] = null;
    const tracked = p.trackAltByKey.get(key);
    if (tracked != null && Number.isFinite(tracked)) {
      altFt = tracked; altSource = 'track';
    } else if (pat) {
      // בלי צלע ידועה המטוס ממתין בעם הרוח - כמו בשכבת ההקפה על המפה
      const legKey = (leg === 'none' ? 'downwind' : leg) as LegKey;
      altFt = Math.round(altOnLeg(normalizeGeometry(pat.geometry), altProfileOf(pat), legKey, 0.5) + (Number(p.elevFt) || 0));
      altSource = 'planned';
    }

    const runwayIdent = String(a.runway_ident || pat?.runway_ident || '').trim();
    const list = groups.get(runwayIdent) ?? [];
    list.push({
      key, stripId, idx,
      label: `${getFormationDisplayName(a)}${idx}`,
      runwayIdent,
      patternId: a.pattern_id != null ? Number(a.pattern_id) : null,
      leg,
      greens: a.greens === true,
      greensAlert: greensAlert(a.flight_status, a.greens),
      altFt, altSource,
    });
    groups.set(runwayIdent, list);
  }

  return [...groups.entries()]
    // מסלול בלי שם - אחרון, כדי שהקבוצות האמיתיות יישארו במקומן הקבוע
    .sort(([a], [b]) => (a === '') !== (b === '') ? (a === '' ? 1 : -1) : a.localeCompare(b))
    .map(([runwayIdent, rows]) => ({
      runwayIdent,
      rows: rows.sort((x, y) => (y.altFt ?? -Infinity) - (x.altFt ?? -Infinity) || x.label.localeCompare(y.label)),
    }));
}

// ─── פתיחה אוטומטית של "בהקפה" ───────────────────────────────────────────────
//
// מטוס בהקפה מתקרב לנחיתה, והוא אינו מופיע בטבלת נקודת ההצטרפות - אם חלון
// "בהקפה" סגור, אין בעמדה שום מקום שבו רואים אותו. לכן **מטוס שנכנס להקפה
// פותח את החלון**, בלי קשר לדרך שבה הגיע: יצא מהנקודה (עם הרוח, "שים בהקפה",
// גרירה), נוצר כבר בהקפה, או הגיע מעמדה אחרת דרך הפולינג.
//
// גם **עליית העמדה** נחשבת: פקח שמתחיל משמרת כשכבר יש מטוסים בהקפה מקבל את
// הטבלה פתוחה, ולא צריך לדעת לחפש אותה בתפריט "תצוגה".
//
// מה שאינו כניסה: מטוס שכבר היה בהקפה בתמונה הקודמת. בלעדיו החלון היה נפתח
// שוב בכל פולינג (5 שניות) אחרי שהפקח סגר אותו.

/** `strip|idx` של כל מטוס שנמצא עכשיו בהקפה וטרם נחת. */
export function inPatternKeys(aircraft: Row[]): Set<string> {
  const keys = new Set<string>();
  for (const a of aircraft || []) {
    if (a.in_pattern === true && normalizeLeg(a.flight_status) !== 'landed') {
      keys.add(`${a.strip_id}|${Number(a.aircraft_idx)}`);
    }
  }
  return keys;
}

/**
 * מי **נכנס** להקפה מאז התמונה הקודמת.
 * `prev=null` = התמונה הראשונה בעמדה, וכל מי שבהקפה נחשב כניסה (עליית העמדה).
 */
export function enteredPattern(prev: Set<string> | null, next: Set<string>): string[] {
  if (!prev) return [...next];
  return [...next].filter(key => !prev.has(key));
}
