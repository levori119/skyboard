// ─── FLOW של פ"מ - הלוגיקה הטהורה ─────────────────────────────────────────────
//
// שלוש שאלות, בלי DB:
//   1. אילו שלבי קרקע קרו בעדכון אחד של מיקום המטוסים (diffAircraftPositions)
//   2. איפה הפ"מ נמצא עכשיו (flowCurrent)
//   3. אילו אירועים שייכים לפ"מ שנולד בפיצול או שמוזג אליו חלק (mergeLineageEvents)
//
// ראה STRIP_FLOW_SPEC.md.

/** סטטוסי קרקע שהם שלב ב-FLOW. "none" (טרם קרא) הוא איפוס ולא שלב. */
export const GROUND_FLOW_KINDS = ['taxi', 'lineup', 'takeoff'];
const GROUND_RANK = { none: 0, taxi: 1, lineup: 2, takeoff: 3 };

/** aircraft_positions מגיע מ-pg כמערך, ומגרסאות ישנות כמחרוזת או כאובייקט ריק. */
export function parsePositions(value) {
  let v = value;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return []; }
  }
  return Array.isArray(v) ? v.filter(p => p && Number.isFinite(Number(p.idx))) : [];
}

const numOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/**
 * האירועים שקרו במעבר ממצב מיקום אחד לשני.
 * מטוסים שעברו את אותו שינוי מקובצים לאירוע אחד - "1+2 הסיעו", כמו על הסדק.
 * אירוע נקודה קודם לאירוע הסטטוס: המטוס יצא מהדת"ק ואז הסיע.
 */
export function diffAircraftPositions(prevValue, nextValue) {
  const prev = new Map(parsePositions(prevValue).map(p => [Number(p.idx), p]));
  const points = new Map();
  const statuses = new Map();

  for (const n of parsePositions(nextValue)) {
    const idx = Number(n.idx);
    const p = prev.get(idx) || { status: 'none', point_id: null };

    const toPoint = numOrNull(n.point_id);
    const fromPoint = numOrNull(p.point_id);
    if (toPoint !== null && toPoint !== fromPoint) {
      const key = `${toPoint}|${fromPoint}`;
      if (!points.has(key)) points.set(key, { kind: 'ground_point', aircraft: [], pointId: toPoint, fromPointId: fromPoint });
      points.get(key).aircraft.push(idx);
    }

    const status = n.status || 'none';
    if (GROUND_FLOW_KINDS.includes(status) && status !== (p.status || 'none')) {
      const runway = status === 'takeoff' ? (n.takeoff_runway || null) : null;
      const key = `${status}|${runway ?? ''}`;
      if (!statuses.has(key)) {
        statuses.set(key, runway ? { kind: status, aircraft: [], runway } : { kind: status, aircraft: [] });
      }
      statuses.get(key).aircraft.push(idx);
    }
  }

  const sortAc = (e) => ({ ...e, aircraft: [...e.aircraft].sort((a, b) => a - b) });
  return [...points.values(), ...statuses.values()].map(sortAc);
}

const time = (e) => new Date(e.occurred_at).getTime();

/**
 * איפה הפ"מ עכשיו.
 *
 * "בעמדה" נקבע מה**קבלה** האחרונה ולא מ-strip_table_assignments: עמדה יכולה
 * לגרור פ"מ לדסק שלה מהרשימה הגלובלית בלי שקיבלה אותו, וזו בדיוק ההבחנה
 * שהאפיון דורש. פ"מ שלא התקבל אף פעם נמצא בעמדה שיצרה אותו.
 */
export function flowCurrent({ strip, pendingTransfer, events = [] }) {
  const airborne = strip.airborne === true;
  if (strip.landed === true) return { kind: 'landed' };

  if (pendingTransfer) {
    return {
      kind: 'at_point',
      point: pendingTransfer.point_label || null,
      toPresetName: pendingTransfer.to_preset_name || null,
      fromPresetName: pendingTransfer.from_preset_name || null,
      airborne,
    };
  }

  const sorted = [...events].sort((a, b) => time(a) - time(b));
  const lastAccepted = [...sorted].reverse().find(e => e.kind === 'accepted');
  const presetName = lastAccepted?.preset_name || strip.creator_preset_name || null;
  if (!presetName) return { kind: 'unknown', airborne };

  // סטטוס קרקעי שנשאר על המטוס אחרי שהתקבל בעמדה אחרת (המריא ועבר לבקר) אינו
  // "במגדל עכשיו" - הוא שריד. מוצג רק כשאין קבלה אחרי שלב הקרקע האחרון.
  let groundStatus = null;
  const lastGround = [...sorted].reverse().find(e => GROUND_FLOW_KINDS.includes(e.kind));
  const groundIsCurrent = !lastAccepted || (lastGround && time(lastGround) > time(lastAccepted));
  if (groundIsCurrent) {
    for (const p of parsePositions(strip.aircraft_positions)) {
      const s = p.status || 'none';
      if ((GROUND_RANK[s] || 0) > (GROUND_RANK[groundStatus] || 0)) groundStatus = s;
    }
  }
  return { kind: 'at_station', presetName, airborne, groundStatus };
}

/** המקורות שמהם הפ"מ יורש היסטוריה: פיצול (עד רגע הפיצול) ומיזוג (הכל). */
export function lineageSources(events) {
  const out = [];
  for (const e of events || []) {
    const d = e.details || {};
    if (e.kind === 'split' && d.fromStripId != null) out.push({ stripId: Number(d.fromStripId), until: e.occurred_at });
    if (e.kind === 'merged' && d.sourceStripId != null) out.push({ stripId: Number(d.sourceStripId), until: null });
  }
  return out;
}

const minUntil = (a, b) => {
  if (a == null) return b;
  if (b == null) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
};

/**
 * כל האירועים של פ"מ, כולל מה שירש.
 * eventsByStrip: { [stripId]: events[] } - חייב לכלול את המקורות (loadFlows טוען אותם).
 * אירוע שמגיע משני מסלולים (אירוע מלפני פיצול, שהגיע גם דרך המיזוג) מופיע פעם אחת.
 */
export function mergeLineageEvents(stripId, eventsByStrip) {
  const root = Number(stripId);
  const seen = new Map();
  const visited = new Set();
  const queue = [{ stripId: root, until: null }];

  while (queue.length) {
    const { stripId: sid, until } = queue.shift();
    if (visited.has(sid)) continue;
    visited.add(sid);
    const limit = until == null ? null : new Date(until).getTime();
    const own = (eventsByStrip[sid] || []).filter(e => limit === null || time(e) <= limit);
    for (const e of own) {
      if (!seen.has(e.id)) seen.set(e.id, { ...e, inherited: sid !== root });
    }
    for (const src of lineageSources(own)) {
      queue.push({ stripId: src.stripId, until: minUntil(until, src.until) });
    }
  }

  return [...seen.values()].sort(compareEvents);
}

/** כרונולוגי; בשוויון שעה - "נוצר" קודם, ואז לפי סדר הרישום. */
export function compareEvents(a, b) {
  const dt = time(a) - time(b);
  if (dt) return dt;
  if ((a.kind === 'created') !== (b.kind === 'created')) return a.kind === 'created' ? -1 : 1;
  return (Number(a.id) || 0) - (Number(b.id) || 0);
}

/** כל מזהי הפ"מים שמהם צריך לטעון אירועים, מתוך האירועים שכבר נטענו. */
export function referencedStripIds(events) {
  return [...new Set(lineageSources(events).map(s => s.stripId))];
}
