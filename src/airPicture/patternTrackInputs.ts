// שורות ה-DB → קלט למנוע מעקב ההקפה (patternTrack.ts). **פונקציות טהורות.**
//
// זה המקום היחיד שיודע איך נראות השורות: `joining_point_strips` (פ"מ שממתין
// בנקודה), `joining_point_aircraft` (מטוס בודד - בנקודה או בהקפה), ו-`strip_aircraft`
// (סטטוס הטיסה והירוקים). המנוע עצמו מדבר רק במטוסים, בנ"צ ובצלעות.

import { imagePctToGeo, type MapGeoAnchor } from '../utils/geo';
import { normalizeGeometry, patternLegs } from '../utils/trafficPattern';
import { normalizeLeg } from '../utils/joiningPoints';
import type { AutoAircraft, AutoFlightStatus, AutoStrip, GeoPt, PatternGeo } from './patternTrack';

type Row = Record<string, any>;

const num = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? n : null;
};

const indicesOf = (v: unknown): number[] | null =>
  Array.isArray(v) && v.length ? v.map(Number).filter(Number.isFinite) : null;

/** הקפה מה-DB → צלעות בנ"צ. בלי עוגן אין נ"צ, ואז אין הקפה למנוע. */
export function patternGeoOf(row: Row, aspect: number, anchor: MapGeoAnchor | null): PatternGeo | null {
  if (!anchor || row?.id == null) return null;
  const legs = patternLegs(normalizeGeometry(row.geometry), Number(aspect) || 1);
  const seg = (key: string): [GeoPt, GeoPt] | null => {
    const l = legs.find(x => x.key === key);
    return l ? [imagePctToGeo(l.from.x, l.from.y, anchor), imagePctToGeo(l.to.x, l.to.y, anchor)] : null;
  };
  const downwind = seg('downwind'), base = seg('base'), final = seg('final'), upwind = seg('upwind');
  if (!downwind || !base || !final || !upwind) return null;
  return {
    id: Number(row.id),
    runwayIdent: String(row.runway_ident || '').trim(),
    legs: { downwind, base, final },
    threshold: final[1],
    // תחילת "אחרי המראה" היא הקצה הרחוק של המסלול
    runway: [final[1], upwind[0]],
  };
}

/**
 * הפ"מים שהעמדה **מחזיקה** ומטוסיהם, מתוך המצב החי של נקודות ההצטרפות.
 *
 * פ"מ נכנס אם הוא ממתין בנקודה או שיש לו מטוס בהקפה. פ"מ של עמדה אחרת אינו
 * נכנס כלל - שתי עמדות מגדל על אותו שדה היו כותבות אותה צלע פעמיים.
 * סטטוס הטיסה נלקח מ-`stripAircraft` (עדכון מקומי מיידי) ובהיעדרו מהשורה.
 */
export function autotrackInputs(p: {
  joiningPoints: Row[];
  joiningPointStrips: Row[];
  joiningPointAircraft: Row[];
  stripAircraft: Record<string, Row[]> | null | undefined;
  presetId: number | string | null | undefined;
  anchor: MapGeoAnchor | null;
}): { strips: AutoStrip[]; aircraft: AutoAircraft[] } {
  const { joiningPoints, joiningPointStrips, joiningPointAircraft, stripAircraft, presetId, anchor } = p;
  if (presetId == null || !anchor) return { strips: [], aircraft: [] };
  const mine = (r: Row) => num(r?.workstation_preset_id) === Number(presetId);

  const pointGeo = new Map<number, GeoPt>();
  for (const jp of joiningPoints || []) {
    const x = num(jp.x_pct), y = num(jp.y_pct);
    if (jp.id != null && x != null && y != null) pointGeo.set(Number(jp.id), imagePctToGeo(x, y, anchor));
  }

  // פ"מ אחד לכל מזהה, משתי המקורות - שורת הנקודה או שורת מטוס בהקפה
  const stripRows = new Map<string, Row>();
  for (const r of [...(joiningPointStrips || []), ...(joiningPointAircraft || [])]) {
    if (!mine(r) || r.strip_id == null) continue;
    const sid = String(r.strip_id);
    if (!stripRows.has(sid)) stripRows.set(sid, r);
  }

  const strips: AutoStrip[] = [];
  const aircraft: AutoAircraft[] = [];
  for (const [sid, r] of stripRows) {
    const indices = indicesOf(r.aircraft_indices);
    const count = num(r.number_of_formation) ?? 1;
    strips.push({
      stripId: sid,
      callSign: String(r.callsign || ''),
      formationSize: num(r.original_formation_count) ?? count,
      indices,
    });
    const atPoint = (joiningPointStrips || []).find(x => String(x.strip_id) === sid);
    const idxs = indices ?? Array.from({ length: Math.max(1, count) }, (_, i) => i + 1);
    for (const idx of idxs) {
      const row = (joiningPointAircraft || []).find(x => String(x.strip_id) === sid && Number(x.aircraft_idx) === idx);
      const inPattern = row?.in_pattern === true;
      if (!inPattern && !atPoint) continue;               // לא בנקודה ולא בהקפה - אין מה לעקוב
      const pid = inPattern ? null : num(row?.joining_point_id) ?? num(atPoint?.joining_point_id);
      const local = stripAircraft?.[sid]?.find(x => Number(x.idx) === idx);
      aircraft.push({
        stripId: sid,
        idx,
        pointId: pid,
        pointGeo: pid != null ? pointGeo.get(pid) ?? null : null,
        inPattern,
        patternId: num(row?.pattern_id),
        runwayIdent: String(row?.runway_ident || '').trim(),
        flightStatus: normalizeLeg(local?.flight_status ?? row?.flight_status) as AutoFlightStatus,
      });
    }
  }
  return { strips, aircraft };
}
