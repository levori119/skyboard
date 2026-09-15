// ─── FLOW של פ"מ - הלוגיקה הטהורה בלקוח ───────────────────────────────────────
//
// השרת מחזיר אירועים גולמיים ו"נמצא עכשיו" מחושב (server/db/stripFlowEvents.js).
// כאן רק מחליטים מה נכנס לשרשרת המרוכזת ואיזה משפט מתאר כל אירוע - כמפתח
// תרגום + פרמטרים, כדי שהמשפט השלם יחיה ב-registry ולא ייבנה מרסיסים.
// ראה STRIP_FLOW_SPEC.md.

export interface FlowEvent {
  id: number | string;
  kind: string;
  strip_id: number;
  occurred_at: string;
  callsign: string | null;
  preset_id: number | null;
  preset_name: string | null;
  point_label: string | null;
  crew_member_name: string | null;
  details: Record<string, any>;
  /** הגיע מפ"מ אחר (מקור הפיצול / חלק שמוזג) */
  inherited?: boolean;
}

export type FlowGroundStatus = 'taxi' | 'lineup' | 'takeoff';

export type FlowCurrent =
  | { kind: 'landed' }
  | { kind: 'at_point'; point: string | null; toPresetName: string | null; fromPresetName: string | null; airborne: boolean }
  | { kind: 'at_station'; presetName: string; airborne: boolean; groundStatus: FlowGroundStatus | null }
  | { kind: 'unknown'; airborne: boolean };

export interface StripFlow {
  strip: {
    id: number; callsign: string | null; sq: string | null; number_of_formation: string | null;
    created_at: string | null; landed: boolean; airborne: boolean; status: string | null;
  };
  current: FlowCurrent;
  events: FlowEvent[];
}

export type FlowChainKind = 'datk' | 'taxi' | 'takeoff' | 'point' | 'station' | 'landed';
export interface FlowChainStep { kind: FlowChainKind; label: string | null; at: string }

/** מפתח תרגום + פרמטרים. הרכיב קורא tr(key, params). */
export interface FlowText { key: string; params: Record<string, string> }

/** אירוע -> שלב בשרשרת המרוכזת, או null כשהאירוע נשאר רק בפירוט. */
function chainStepOf(e: FlowEvent): Omit<FlowChainStep, 'at'> | null {
  const d = e.details || {};
  switch (e.kind) {
    case 'ground_point': return d.fromPointType === 'datk' ? { kind: 'datk', label: d.fromPointName || null } : null;
    case 'taxi': return { kind: 'taxi', label: null };
    case 'takeoff': return { kind: 'takeoff', label: d.runway || e.point_label || null };
    case 'transfer_sent': return e.point_label ? { kind: 'point', label: e.point_label } : null;
    case 'accepted': return e.preset_name ? { kind: 'station', label: e.preset_name } : null;
    case 'landed': return { kind: 'landed', label: null };
    default: return null;
  }
}

/**
 * השרשרת המרוכזת: "דת"ק 8 -> הסעה -> המריא 33 -> פלמח -> 305 -> 306".
 * שלב שחוזר ברצף (מטוס שני במבנה שהסיע, קבלה חוזרת באותה עמדה) נספר פעם אחת.
 */
export function flowChain(events: FlowEvent[]): FlowChainStep[] {
  const out: FlowChainStep[] = [];
  for (const e of events || []) {
    const step = chainStepOf(e);
    if (!step) continue;
    const last = out[out.length - 1];
    if (last && last.kind === step.kind && last.label === step.label) continue;
    out.push({ ...step, at: e.occurred_at });
  }
  return out;
}

/** "1+2" - כמו על הסדק. */
export function formatAircraft(aircraft: unknown): string {
  if (!Array.isArray(aircraft) || aircraft.length === 0) return '';
  return [...aircraft].map(Number).filter(Number.isFinite).sort((a, b) => a - b).join('+');
}

const s = (v: unknown) => (v == null ? '' : String(v));

export function flowEventDescriptor(e: FlowEvent): FlowText {
  const d = e.details || {};
  switch (e.kind) {
    case 'created': return { key: 'flow.evCreated', params: { station: s(e.preset_name) } };
    case 'ground_point':
      return d.fromPointType === 'datk'
        ? { key: 'flow.evLeftDatk', params: { from: s(d.fromPointName), point: s(e.point_label) } }
        : { key: 'flow.evGroundPoint', params: { point: s(e.point_label) } };
    case 'taxi': return { key: 'flow.evTaxi', params: {} };
    case 'lineup': return { key: 'flow.evLineup', params: {} };
    case 'takeoff':
      return d.runway ? { key: 'flow.evTakeoffRunway', params: { runway: s(d.runway) } } : { key: 'flow.evTakeoff', params: {} };
    case 'transfer_sent': {
      const moved = d.moved === true;
      if (e.point_label) return { key: moved ? 'flow.evMovedPoint' : 'flow.evSentPoint', params: { point: s(e.point_label) } };
      if (d.toPresetName) return { key: moved ? 'flow.evMovedStation' : 'flow.evSentStation', params: { station: s(d.toPresetName) } };
      return { key: 'flow.evSent', params: {} };
    }
    case 'accepted': {
      const key = d.mode === 'auto' ? 'flow.evAcceptedAuto' : d.mode === 'map' ? 'flow.evAcceptedMap' : 'flow.evAccepted';
      return { key, params: { station: s(e.preset_name) } };
    }
    case 'rejected': return { key: 'flow.evRejected', params: { station: s(e.preset_name) } };
    case 'cancelled': return { key: 'flow.evCancelled', params: {} };
    case 'airborne': return { key: d.airborne === false ? 'flow.evNotAirborne' : 'flow.evAirborne', params: {} };
    case 'landed': return { key: 'flow.evLanded', params: {} };
    case 'split': return { key: 'flow.evSplit', params: {} };
    case 'merged': return { key: 'flow.evMerged', params: {} };
    default: return { key: 'flow.evUnknown', params: { kind: s(e.kind) } };
  }
}

export function flowCurrentDescriptor(c: FlowCurrent | null | undefined): FlowText & { groundStatus?: FlowGroundStatus } {
  if (!c) return { key: 'flow.nowUnknown', params: {} };
  switch (c.kind) {
    case 'landed': return { key: 'flow.nowLanded', params: {} };
    case 'at_point':
      if (!c.point) return { key: 'flow.nowPendingTo', params: { station: s(c.toPresetName) } };
      return c.toPresetName
        ? { key: 'flow.nowAtPointTo', params: { point: c.point, station: c.toPresetName } }
        : { key: 'flow.nowAtPoint', params: { point: c.point } };
    case 'at_station':
      return c.groundStatus
        ? { key: 'flow.nowAtStationGround', params: { station: c.presetName }, groundStatus: c.groundStatus }
        : { key: 'flow.nowAtStation', params: { station: c.presetName } };
    default: return { key: 'flow.nowUnknown', params: {} };
  }
}

/** מזהה פ"מ מכל צורה שמסתובבת בלקוח ('s123' / 123 / '123'). */
export function flowStripId(id: unknown): number | null {
  const n = parseInt(String(id ?? '').replace(/^s/, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** השעה של האירוע (HH:MM) בשעון העמדה. */
export function flowTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── פתיחת החלון מכל מקום ─────────────────────────────────────────────────────
// אירוע DOM ולא prop drilling: פ"מ מרונדר בעשרות מקומות (חלון הפ"מים, טבלה,
// מגדל, קלאסי), וכולם צריכים לפתוח את **אותו** חלון יחיד.
const OPEN_EVENT = 'skyking:open-strip-flow';

/** פותח את חלון ה-FLOW. בלי מזהה - הטבלה המרוכזת. */
export function openStripFlow(stripId?: unknown): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { stripId: stripId == null ? null : flowStripId(stripId) } }));
}

export function subscribeStripFlow(fn: (stripId: number | null) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const h = (e: Event) => fn((e as CustomEvent).detail?.stripId ?? null);
  window.addEventListener(OPEN_EVENT, h);
  return () => window.removeEventListener(OPEN_EVENT, h);
}
