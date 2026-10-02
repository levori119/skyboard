// היפוך הקפה עם מטוסים בהקפה - הצד של הלקוח. ראה PATTERN_FLIP_SPEC.md.
//
// השרת מסמן את המטוס (`joining_point_aircraft.pattern_orphan`): `pending` =
// ההקפה שלו כבתה וממתין להכרעה, `kept` = הוכרע להמשיך בה עד הנחיתה. כאן רק
// הגזירה לתצוגה - ההתראה המרוכזת, היעדים להעברה, ההבהוב וההקפה המעומעמת.

import { oppositeEnd, type RunwayEnds } from './runwayEnds';

export type PatternOrphanState = 'pending' | 'kept';

/** צבע ההבהוב של מטוס שממשיך בהקפה כבויה - **צבע סטטוס**, קבוע בכל תמה. */
export const PATTERN_KEPT_COLOR = '#f59e0b';

export interface OrphanAircraftRow {
  strip_id: number | string;
  aircraft_idx: number;
  pattern_id?: number | null;
  pattern_orphan?: string | null;
  label?: string;
  flight_status?: string | null;
}

export interface OrphanPattern { id: number; runway_ident?: string | null }

export const aircraftKey = (a: { strip_id: number | string; aircraft_idx: number }) =>
  `${a.strip_id}|${a.aircraft_idx}`;

const txt = (v: unknown) => String(v ?? '').trim();

/** מטוסי ההקפה הכבויה שממתינים להכרעה, מקובצים לפי ההקפה הישנה. */
export function pendingGroups<A extends OrphanAircraftRow, P extends OrphanPattern>(
  aircraft: A[], patterns: P[],
): { pattern: P; aircraft: A[] }[] {
  const byId = new Map(patterns.map(p => [Number(p.id), p]));
  const groups = new Map<number, { pattern: P; aircraft: A[] }>();
  for (const a of aircraft) {
    if (a.pattern_orphan !== 'pending' || a.pattern_id == null) continue;
    const p = byId.get(Number(a.pattern_id));
    if (!p) continue;
    if (!groups.has(p.id)) groups.set(p.id, { pattern: p, aircraft: [] });
    groups.get(p.id)!.aircraft.push(a);
  }
  return [...groups.values()];
}

/** מטוסים שהוכרע שימשיכו בהקפה כבויה - מהבהבים עד הנחיתה. */
export const keptKeys = (aircraft: OrphanAircraftRow[]): Set<string> =>
  new Set(aircraft.filter(a => a.pattern_orphan === 'kept' && a.pattern_id != null).map(aircraftKey));

/**
 * הקפות כבויות שעדיין יש עליהן מטוס (ממתין או ממשיך). הן מצוירות **מעומעמות**:
 * מטוס על הקפה שאינה מצוירת הוא תווית שצפה על שום דבר.
 */
export function ghostPatterns<P extends OrphanPattern>(
  aircraft: OrphanAircraftRow[], all: P[], shown: P[],
): P[] {
  const shownIds = new Set(shown.map(p => Number(p.id)));
  const ids = new Set(aircraft
    .filter(a => (a.pattern_orphan === 'pending' || a.pattern_orphan === 'kept') && a.pattern_id != null)
    .map(a => Number(a.pattern_id))
    .filter(id => !shownIds.has(id)));
  return all.filter(p => ids.has(Number(p.id)));
}

/**
 * היעדים להעברה: ההקפות הפעילות, וההקפות של **הקצה הנגדי** קודם - זה ההיפוך
 * הרגיל, ולכן הוא ברירת המחדל. לקצה עם כמה הקפות (שמאלית/ימנית) - כל אחת יעד.
 */
export function flipTargets<P extends OrphanPattern>(
  oldIdent: string | null | undefined, active: P[], runways: RunwayEnds[],
): P[] {
  const opp = oppositeEnd(runways, txt(oldIdent));
  const isOpp = (p: P) => !!opp && txt(p.runway_ident).toUpperCase() === opp.toUpperCase();
  return [...active.filter(isOpp), ...active.filter(p => !isOpp(p))];
}

export type FlipChoice = 'keep' | number;

/** ההכרעה לשרת: `keep` או `move` להקפה. */
export const toDecision = (a: OrphanAircraftRow, choice: FlipChoice) =>
  choice === 'keep'
    ? { strip_id: a.strip_id, aircraft_idx: a.aircraft_idx, action: 'keep' as const }
    : { strip_id: a.strip_id, aircraft_idx: a.aircraft_idx, action: 'move' as const, pattern_id: choice };
