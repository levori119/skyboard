// חלון ניהול נסיעות - עמדת ניהול שדה תעופה.
//
// כאן מתוכננת ומנוהלת ה**נסיעה** עצמה: מי נוסע, במה, מתי, מאיפה לאן, דרך אילו
// תחנות, באיזה נתיב ובאיזה סטטוס. להבדיל מ"ניהול נהגים" (VehiclePermitsWindow)
// שהוא המרשם הקבוע של מי מורשה להיכנס לשדה, ומ"כניסת רכבים" (GroundVehiclePanel)
// שהוא התור החי של מי שדופק בשער עכשיו.
//
// **אותה ישות נסיעה** של חלון הנהג, לא טבלה שנייה: נסיעה שנרשמה מאישור בקשת
// כניסה מופיעה גם כאן וגם שם. הנגזרות (אייקון מוצע, חלון ההתראה, זהות הנתיב
// ומה הנהג שינה) חיות ב-src/utils/trips.ts בלבד.
//
// ── שני מצבים, לא שני חצאי מסך ──────────────────────────────────────────────
// ברירת המחדל היא **רשימת הנסיעות על כל רוחב החלון** - זו התצוגה שהפקח מסתכל
// בה רוב הזמן, והיא צריכה להראות בשורה אחת מה יוצא, מתי, לאן, באיזה נתיב
// ובאיזה סטטוס. הטופס המלא נפתח רק ב**נסיעה חדשה או בעדכון**. רשימה שדחוסה
// לעמודה צרה לצד טופס פתוח נותנת את הגרוע משני העולמות: לא רואים את השדה,
// וגם הטופס צר.
//
// חלון **עריכה** (מסגרת כתומה): הוא משנה רשומות, לא מציג מצב שדה חי.
// יושב בתוך #root ולכן מקבל את `zoom: var(--s)` אוטומטית - רק יחידות ה-vh
// מחולקות ב---s ידנית (ראה /ui-adapt §מלכודת ה-vw/vh).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import i18n from '../../i18n';
import { API_URL } from '../../config';
import { windowFrame } from '../../utils/windowFrame';
import { windowPalette, type ThemeMode, type WindowPalette } from '../../utils/windowPalette';
import { CTRL_H, WINDOW_SIZE, formStyles } from '../../utils/windowForm';
import useDragPosition from '../../hooks/useDragPosition';
import { useDockableWindow } from '../../hooks/useDockableWindow';
import { customConfirm } from '../shared/ConfirmModal';
import { PERMIT_STATUS_COLOR, effectivePermitStatus, permitStatusKey } from '../../utils/permitStatus';
import {
  TRIP_STATUSES, TRIP_STATUS_COLOR, TRIP_VEHICLE_ICONS,
  MAX_TRIP_COPIES,
  routeInputSignature,
  asTripStatus, canApproveTrip, clampCopies, dedupeRouteOptions, duplicateSchedule,
  hasPendingDriverChange,
  isRouteChosen, normalizeEscorts, normalizeStops, pendingChangeFields,
  routeSignature, suggestedVehicleIcon, tripStatusKey,
  type TripEscort, type TripStatus, type TripStop,
} from '../../utils/trips';

export interface PermitParam { id: number; kind: string; name: string; active: boolean }
export interface AirfieldPoint { id: number; name: string }
export interface PermitVehicle {
  id: number; vehicle_type_id: number | null; vehicle_type_name: string | null;
  plate_fixed: boolean; plate_number: string;
}
export interface PermitDriverLite {
  id: number; first_name: string; last_name: string; national_id: string;
  permit_from: string | null; permit_until: string | null; status_override: string | null;
  vehicles: PermitVehicle[];
}

/** נתיב אחד שהמודל הציע, כפי שהוא נשמר על הנסיעה. */
export interface RouteOption {
  /** רמת ההרשאה ששימשה לחישוב - גם מזהה האפשרות ברשימה */
  key: 'vehicle' | 'taxiways' | 'runways';
  route_ids: number[];
  label: string;
  dist_m: number;
  crossings: number;
}

export interface Trip {
  id: number; airfield_id: number | null;
  driver_id: number | null; driver_name: string; driver_phone: string;
  permit_driver_name: string | null; permit_national_id: string | null;
  permit_from: string | null; permit_until: string | null; permit_status_override: string | null;
  vehicle_id: number | null; vehicle_name: string;
  vehicle_type_id: number | null; vehicle_type_name: string | null;
  trip_type_id: number | null; trip_type_name: string | null;
  icon: string;
  from_point_id: number | null; to_point_id: number | null;
  from_point_name: string | null; to_point_name: string | null;
  from_text: string; to_text: string;
  stops: unknown; stop_names: unknown;
  scheduled_at: string | null; ended_at: string | null;
  status: string; note: string | null; purpose: string | null;
  requester_name: string; requester_phone: string;
  escorts: unknown;
  roam_permit_id: number | null; roam_permit_name: string | null;
  suggested_route_ids: unknown; route_options: unknown;
  selected_route_ids: unknown; selected_route_label: string;
  driver_ack_at: string | null; pending_change: unknown; pending_change_at: string | null;
  departure_alerted_at: string | null;
  vehicle_request_id: number | null;
}

interface TripDraft {
  driver_id: string; driver_name: string; driver_phone: string;
  vehicle_id: string; vehicle_name: string; vehicle_type_id: string;
  trip_type_id: string; icon: string;
  date: string; time: string;
  from_point_id: string; from_text: string;
  to_point_id: string; to_text: string;
  stops: TripStop[];
  status: TripStatus;
  suggested_route_ids: number[]; route_options: RouteOption[];
  selected_route_ids: number[]; selected_route_label: string;
  /** מצביע לאפשרות שנבחרה. ריק = **לא נבחר נתיב**, ואז אף שורה אינה מסומנת */
  selected_route_sig: string;
  note: string; requester_name: string; requester_phone: string;
  escorts: TripEscort[]; roam_permit_id: string;
}

const EMPTY_DRAFT: TripDraft = {
  driver_id: '', driver_name: '', driver_phone: '',
  vehicle_id: '', vehicle_name: '', vehicle_type_id: '',
  trip_type_id: '', icon: '',
  date: '', time: '',
  from_point_id: '', from_text: '', to_point_id: '', to_text: '',
  stops: [], status: 'pending',
  suggested_route_ids: [], route_options: [], selected_route_ids: [], selected_route_label: '',
  selected_route_sig: '',
  note: '', requester_name: '', requester_phone: '', escorts: [], roam_permit_id: '',
};

/**
 * מועד היציאה מפוצל לתאריך ולשעה בטופס, אך יושב בעמודה **אחת** ב-DB.
 * שתי עמודות היו מאפשרות תאריך בלי שעה, ואז "מתי יוצאים" הוא חצי תשובה.
 */
export function splitLocalDateTime(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return { date: '', time: '' };
  const p2 = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`,
    time: `${p2(d.getHours())}:${p2(d.getMinutes())}`,
  };
}

/** תאריך בלי שעה = תחילת היום; שעה בלי תאריך = אין מועד (שעה של איזה יום?). */
export function joinLocalDateTime(date: string, time: string): string | null {
  if (!date) return null;
  const d = new Date(`${date}T${time || '00:00'}`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

const asNumArray = (raw: unknown): number[] => {
  let v: unknown = raw;
  if (typeof raw === 'string') { try { v = JSON.parse(raw); } catch { return []; } }
  return Array.isArray(v) ? v.map(Number).filter(Number.isFinite) : [];
};

const asRouteOptions = (raw: unknown): RouteOption[] => {
  let v: unknown = raw;
  if (typeof raw === 'string') { try { v = JSON.parse(raw); } catch { return []; } }
  if (!Array.isArray(v)) return [];
  return v.filter(o => o && typeof o === 'object') as RouteOption[];
};

/** בחירה שמורה -> מצביע. נסיעה בלי נתיב שמור מקבלת מצביע **ריק** ולא "|". */
export const savedRouteSig = (ids: number[], label: string): string =>
  ids.length || label ? routeSignature({ route_ids: ids, label }) : '';

const draftOf = (t: Trip): TripDraft => {
  const selIds = asNumArray(t.selected_route_ids);
  const selLabel = t.selected_route_label || '';
  return {
    driver_id: t.driver_id ? String(t.driver_id) : '',
    driver_name: t.driver_name || '', driver_phone: t.driver_phone || '',
    vehicle_id: t.vehicle_id ? String(t.vehicle_id) : '',
    vehicle_name: t.vehicle_name || '',
    vehicle_type_id: t.vehicle_type_id ? String(t.vehicle_type_id) : '',
    trip_type_id: t.trip_type_id ? String(t.trip_type_id) : '',
    icon: t.icon || '',
    ...splitLocalDateTime(t.scheduled_at),
    from_point_id: t.from_point_id ? String(t.from_point_id) : '',
    from_text: t.from_text || '',
    to_point_id: t.to_point_id ? String(t.to_point_id) : '',
    to_text: t.to_text || '',
    stops: normalizeStops(t.stops),
    status: asTripStatus(t.status),
    suggested_route_ids: asNumArray(t.suggested_route_ids),
    route_options: asRouteOptions(t.route_options),
    selected_route_ids: selIds,
    selected_route_label: selLabel,
    selected_route_sig: savedRouteSig(selIds, selLabel),
    note: t.note || '', requester_name: t.requester_name || '', requester_phone: t.requester_phone || '',
    escorts: normalizeEscorts(t.escorts),
    roam_permit_id: t.roam_permit_id ? String(t.roam_permit_id) : '',
  };
};

/** שם הנסיעה ברשימה: הרכב הוא מה שהפקח מחפש בעין, ואחריו הנהג. */
export const tripLabel = (t: Trip): string =>
  t.vehicle_name || t.vehicle_type_name || t.permit_driver_name || t.driver_name || tr('trips.unnamedTrip');

/** שלוש רמות ההרשאה שהמודל יודע לחשב. הסדר קובע איזו רמה נשמרת באיחוד. */
const ROUTE_VARIANTS: { key: RouteOption['key']; permissions: string[]; labelKey: string }[] = [
  { key: 'vehicle', permissions: ['vehicle'], labelKey: 'trips.routePermVehicle' },
  { key: 'taxiways', permissions: ['vehicle', 'taxiways'], labelKey: 'trips.routePermTaxiways' },
  { key: 'runways', permissions: ['vehicle', 'taxiways', 'runways'], labelKey: 'trips.routePermRunways' },
];

const variantLabel = (key: string) =>
  tr(ROUTE_VARIANTS.find(v => v.key === key)?.labelKey ?? 'trips.routePermVehicle');

/**
 * דיאלוג השכפול - לנסיעה אחת ולקבוצה כאחת.
 *
 * שלוש שאלות בלבד: לאיזה יום, כמה עותקים, ובאיזה מרווח ביניהם. הכל נגזר
 * מ-`duplicateSchedule`, שמעביר את הנסיעה ליום היעד ו**שומר את שעת היציאה**
 * שלה - כך ששכפול קבוצתי של יום שלם שומר על המרווחים בין הנסיעות.
 *
 * ⚠️ הדיאלוג אומר במפורש שהעותק **אינו מאושר**. שכפול נסיעה מאושרת שהיה גורר
 * את האישור מוציא לשטח רכב שאיש לא אישר, ומי שלוחץ "שכפל" אינו מצפה לכך.
 */
const DuplicateDialog: React.FC<{
  sources: Trip[];
  C: WindowPalette;
  dir: React.CSSProperties['direction'];
  themeMode: ThemeMode;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (targetDate: string, copies: number, intervalMinutes: number) => void;
}> = ({ sources, C, dir, themeMode, busy, onCancel, onConfirm }) => {
  const { inputStyle, dateStyle, labelStyle, btn } = formStyles(C, themeMode);
  // ברירת המחדל היא **יום היעד של הנסיעה המוקדמת ביותר**, ולא "מחר" של היום
  // הנוכחי: שכפול של נסיעות מחרתיים ליום שאחריהן הוא המקרה השכיח.
  const earliest = sources
    .map(t => t.scheduled_at).filter(Boolean)
    .sort()[0] as string | undefined;
  const base = earliest ? new Date(earliest) : new Date();
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
  const p2 = (n: number) => String(n).padStart(2, '0');
  const [targetDate, setTargetDate] = useState(
    `${next.getFullYear()}-${p2(next.getMonth() + 1)}-${p2(next.getDate())}`,
  );
  const [copies, setCopies] = useState('1');
  const [interval, setIntervalMin] = useState('60');
  const n = clampCopies(copies);
  const total = sources.length * n;

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', direction: dir,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.panel, color: C.text, border: `2px solid #a855f7`, borderRadius: 10,
          padding: 14, width: 'min(420px, 90%)', boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 3 }}>
          ⧉ {sources.length === 1 ? tr('trips.duplicate') : tr('trips.duplicateSelected')}
        </div>
        <div style={{ fontSize: 10, color: C.muted, marginBottom: 10 }}>
          {tr('trips.duplicateSources', { count: sources.length })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 7 }}>
          <div>
            <label style={labelStyle}>{tr('trips.duplicateTargetDate')}</label>
            <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} style={dateStyle} />
          </div>
          <div>
            <label style={labelStyle}>{tr('trips.duplicateCopies')}</label>
            <input
              type="number" min={1} max={MAX_TRIP_COPIES} value={copies}
              onChange={e => setCopies(e.target.value)} style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>{tr('trips.duplicateInterval')}</label>
            {/* המרווח רלוונטי רק כשיש יותר מעותק אחד - שדה פעיל שאינו משפיע
                על דבר הוא בדיוק הפקד שגורם למפעיל לחפש תקלה במקום הלא נכון */}
            <input
              type="number" min={0} step={5} value={interval} disabled={n < 2}
              onChange={e => setIntervalMin(e.target.value)}
              style={{ ...inputStyle, opacity: n < 2 ? 0.5 : 1 }}
            />
          </div>
        </div>

        <div style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>
          {tr('trips.duplicateTotal', { count: total })}
        </div>
        <div style={{ fontSize: 10, color: '#fbbf24', marginTop: 3 }}>
          ⚠ {tr('trips.duplicateNotApproved')}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <button
            onClick={() => onConfirm(targetDate, n, Number(interval) || 0)}
            disabled={busy}
            style={{ ...btn('#a855f7'), opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}
          >{busy ? tr('trips.duplicateBusy') : tr('trips.duplicateConfirm')}</button>
          <button onClick={onCancel} style={btn(C.border, C.text)}>{tr('trips.cancel')}</button>
        </div>
      </div>
    </div>
  );
};

export interface TripsManagementWindowProps {
  /** השדה שהעמדה מוצמדת אליו. בלעדיו אין למי לשייך נסיעות */
  airfieldId: number | null;
  themeMode: ThemeMode;
  onClose: () => void;
  /** נסיעה לפתוח מיד לעריכה - כשמגיעים לכאן מהתראה מתפרצת */
  focusTripId?: number | null;
}

export const TripsManagementWindow: React.FC<TripsManagementWindowProps> = ({
  airfieldId, themeMode, onClose, focusTripId,
}) => {
  const C = windowPalette(themeMode);
  const dir = i18n.dir();
  const winRef = useRef<HTMLDivElement | null>(null);
  const drag = useDragPosition(winRef);
  const { inputStyle, dateStyle, areaStyle, labelStyle, sectionStyle, btn } = formStyles(C, themeMode);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<PermitDriverLite[]>([]);
  const [params, setParams] = useState<PermitParam[]>([]);
  const [points, setPoints] = useState<AirfieldPoint[]>([]);
  /** 'list' = רשימת הנסיעות על כל רוחב החלון; 'form' = נסיעה חדשה או עדכון */
  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<TripDraft>(EMPTY_DRAFT);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  /** הנסיעות המסומנות לשכפול קבוצתי */
  const [picked, setPicked] = useState<Set<number>>(new Set());
  /** הנסיעות שדיאלוג השכפול פתוח עליהן. ריק = הדיאלוג סגור */
  const [dupFor, setDupFor] = useState<Trip[]>([]);
  const [dupBusy, setDupBusy] = useState(false);

  const vehicleTypes = useMemo(() => params.filter(p => p.kind === 'vehicle_type' && p.active), [params]);
  const tripTypes = useMemo(() => params.filter(p => p.kind === 'trip_type' && p.active), [params]);
  const roamPermits = useMemo(() => params.filter(p => p.kind === 'roam_permit' && p.active), [params]);

  const selected = useMemo(() => trips.find(t => t.id === selectedId) || null, [trips, selectedId]);

  // ── טעינה ──────────────────────────────────────────────────────────────────
  const loadTrips = useCallback(async () => {
    if (!airfieldId) { setTrips([]); return; }
    try {
      const r = await fetch(`${API_URL}/trips?airfield_id=${airfieldId}`);
      if (r.ok) setTrips(await r.json());
    } catch { /* הרשת נופלת - הרשימה נשארת כפי שהיא */ }
  }, [airfieldId]);

  useEffect(() => {
    if (!airfieldId) { setParams([]); setPoints([]); setDrivers([]); return; }
    fetch(`${API_URL}/permit-params?airfield_id=${airfieldId}`).then(r => r.ok ? r.json() : []).then(setParams).catch(() => {});
    fetch(`${API_URL}/airfields/${airfieldId}/points`).then(r => r.ok ? r.json() : []).then(setPoints).catch(() => {});
    fetch(`${API_URL}/entry-permits?airfield_id=${airfieldId}`).then(r => r.ok ? r.json() : []).then(setDrivers).catch(() => {});
  }, [airfieldId]);

  useEffect(() => { void loadTrips(); }, [loadTrips]);

  // ── מעבר בין רשימה לטופס ───────────────────────────────────────────────────
  //
  // ⚠️ הטיוטה נגזרת **כאן, מהנסיעה עצמה** - ולא ב-useEffect שתלוי במזהה.
  // הגזירה דרך effect נפלה בשקט לטופס ריק בשני מקרים: כשהרשימה עדיין לא
  // נטענה (`trips.find` מחזיר undefined, והטיוטה נופלת ל-EMPTY_DRAFT בלי
  // שאיש יידע), וכשנפתחה שוב **אותה** נסיעה - `setSelectedId` באותו ערך אינו
  // משנה state, ה-effect אינו רץ, והטופס מציג את מה שנשאר בו מקודם.
  const openNew = (base?: Trip) => {
    const d = base ? draftOf(base) : EMPTY_DRAFT;
    setCreating(true);
    setSelectedId(null);
    setDraft(d);
    lastRouteSig.current = routeInputSignature(d);
    setError(''); setRouteError('');
    setMode('form');
  };
  const openEdit = (t: Trip) => {
    const d = draftOf(t);
    setCreating(false);
    setSelectedId(t.id);
    setDraft(d);
    lastRouteSig.current = routeInputSignature(d);
    setError(''); setRouteError('');
    setMode('form');
  };
  const backToList = () => {
    setMode('list'); setCreating(false); setSelectedId(null);
    setDraft(EMPTY_DRAFT); setError(''); setRouteError('');
  };

  // התראה מתפרצת מובילה ישר לעריכת הנסיעה שהיא מדברת עליה - אך רק **אחרי**
  // שהרשימה נטענה, אחרת הטופס נפתח ריק. הסימון מונע פתיחה מחדש בכל ריענון.
  /** חתימת הקלט שהנתיב הנוכחי חושב עבורה. נקבעת בפתיחת הטופס. */
  const lastRouteSig = useRef('');
  const focusHandled = useRef<number | null>(null);
  useEffect(() => {
    if (!focusTripId || focusHandled.current === focusTripId) return;
    const t = trips.find(x => x.id === focusTripId);
    if (!t) return;
    focusHandled.current = focusTripId;
    openEdit(t);
  }, [focusTripId, trips]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc: מהטופס חוזרים לרשימה, ומהרשימה סוגרים את החלון. סגירה מהטופס הייתה
  // מאבדת עריכה שלמה בהקשה אחת.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (mode === 'form') backToList(); else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, mode]);

  // ── הנהג והרכב ─────────────────────────────────────────────────────────────
  const draftDriver = useMemo(
    () => drivers.find(d => String(d.id) === draft.driver_id) || null, [drivers, draft.driver_id],
  );

  /** שם הרכב כפי שהוא מוצג בבורר: הסוג ואחריו הרישוי, כמו בחלון הנהג. */
  const vehicleLabel = (v: PermitVehicle) =>
    [v.vehicle_type_name, v.plate_fixed ? v.plate_number : ''].filter(Boolean).join(' · ') || String(v.id);

  const vehicleTypeName = useMemo(
    () => vehicleTypes.find(p => String(p.id) === draft.vehicle_type_id)?.name ?? null,
    [vehicleTypes, draft.vehicle_type_id],
  );

  const effectiveIcon = draft.icon || suggestedVehicleIcon(vehicleTypeName);

  // ── חישוב הנתיב ────────────────────────────────────────────────────────────
  /** האפשרויות כפי שהן מוצגות: מאוחדות לפי נתיב פיזי, מהקצר לארוך. */
  const routeChoices = useMemo(() => dedupeRouteOptions(draft.route_options), [draft.route_options]);

  /**
   * מריץ את **מודל החישוב הקיים** (`/api/route-plan`, A* על מסלולי הבסיס) בשלוש
   * רמות ההרשאה. אין כאן מודל שני: אותו חישוב בדיוק שמשמש את "כניסת רכבים",
   * רק שהוא מוצג כ**בחירה** ולא כתוצאה יחידה.
   *
   * ⚠️ **אינו בוחר נתיב.** הנתיב שהנהג נוסע בו הוא הכרעה של הפקח, ובחירה
   * אוטומטית הייתה נראית על המסך בדיוק כמו בחירה שלו - בלי שאיש הכריע.
   */
  const computeRoutes = async (silent = false) => {
    if (!airfieldId || !draft.from_point_id || !draft.to_point_id) {
      // בחישוב אוטומטי אין שגיאה: הפקח באמצע מילוי הטופס, ולא ביקש דבר
      if (!silent) setRouteError(tr('trips.routeNeedsEndpoints'));
      return;
    }
    setRouteLoading(true); setRouteError('');
    try {
      const results = await Promise.all(ROUTE_VARIANTS.map(async v => {
        try {
          const r = await fetch(`${API_URL}/route-plan`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              airfield_id: airfieldId,
              from_point_id: Number(draft.from_point_id),
              to_point_id: Number(draft.to_point_id),
              // הנתיב חייב לעבור **בתחנות**: תחנה שאינה עליו היא תחנה שהנהג
              // לא יעצור בה. תחנה בטקסט חופשי אין לה נ"צ ולכן אינה נשלחת.
              via_point_ids: draft.stops.map(st => st.point_id).filter(Boolean),
              permissions: v.permissions,
            }),
          });
          const data = await r.json();
          if (!r.ok || data.error || !Array.isArray(data.waypoints) || !data.waypoints.length) return null;
          const segments: { id: number; name: string }[] = Array.isArray(data.routeSegments) ? data.routeSegments : [];
          const option: RouteOption = {
            key: v.key,
            route_ids: segments.map(s => Number(s.id)).filter(Number.isFinite),
            label: String(data.segmentPath || segments.map(s => s.name).join(' → ') || ''),
            dist_m: Number(data.totalDistM) || 0,
            crossings: Array.isArray(data.crossings) ? data.crossings.length : 0,
          };
          return option;
        } catch { return null; }
      }));
      const options = results.filter((o): o is RouteOption => o !== null);
      if (!options.length) { setRouteError(tr('trips.routeError')); setRouteLoading(false); return; }
      const merged = dedupeRouteOptions(options);
      setDraft(d => {
        // בחירה קיימת נשמרת רק אם הנתיב שנבחר עדיין בין האפשרויות. השתנה משהו
        // במפה והנתיב איננו? עדיף שהפקח יבחר מחדש מאשר שיישאר עם נתיב שהמודל
        // כבר לא מציע, בלי שאיש אמר לו.
        const stillThere = merged.some(o => isRouteChosen(o, d.selected_route_sig));
        return {
          ...d,
          route_options: options,
          suggested_route_ids: merged[0].route_ids,
          ...(stillThere ? {} : { selected_route_sig: '', selected_route_ids: [], selected_route_label: '' }),
        };
      });
    } catch { setRouteError(tr('trips.routeError')); }
    setRouteLoading(false);
  };

  /**
   * כל שינוי במוצא, ביעד או בתחנות מחשב את הנתיב **מחדש, אוטומטית**.
   *
   * נתיב שחושב לקלט אחר אינו הנסיעה שהפקח מאשר, והסתמכות על לחיצה ידנית
   * פירושה שמי ששכח ללחוץ מאשר לנהג דרך שאינה שלו. `lastRouteSig` נקבע
   * בפתיחת הטופס מהנסיעה עצמה, ולכן טעינת נסיעה קיימת אינה מחשבת מחדש
   * ואינה דורסת את הנתיב שנבחר לה.
   */
  const routeSig = routeInputSignature(draft);
  useEffect(() => {
    if (mode !== 'form') return;
    if (routeSig === lastRouteSig.current) return;
    lastRouteSig.current = routeSig;
    if (!draft.from_point_id || !draft.to_point_id) {
      // קלט חלקי: עדיף בלי נתיב על נתיב שאינו תואם את מה שעל המסך
      setDraft(d => ({ ...d, route_options: [], selected_route_sig: '', selected_route_ids: [], selected_route_label: '' }));
      return;
    }
    // השהיה קצרה: בחירה בשני בוררים רצופים לא תשלח שני חישובים
    const t = setTimeout(() => void computeRoutes(true), 350);
    return () => clearTimeout(t);
  }, [routeSig, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseRoute = (o: RouteOption) => setDraft(d => ({
    ...d,
    selected_route_sig: routeSignature(o),
    selected_route_ids: o.route_ids,
    selected_route_label: o.label,
  }));

  // ── שמירה ──────────────────────────────────────────────────────────────────
  const bodyOf = (d: TripDraft) => ({
    airfield_id: airfieldId,
    driver_id: d.driver_id ? Number(d.driver_id) : null,
    driver_name: d.driver_name, driver_phone: d.driver_phone,
    vehicle_id: d.vehicle_id ? Number(d.vehicle_id) : null,
    vehicle_name: d.vehicle_name,
    vehicle_type_id: d.vehicle_type_id ? Number(d.vehicle_type_id) : null,
    trip_type_id: d.trip_type_id ? Number(d.trip_type_id) : null,
    icon: d.icon,
    scheduled_at: joinLocalDateTime(d.date, d.time),
    from_point_id: d.from_point_id ? Number(d.from_point_id) : null,
    to_point_id: d.to_point_id ? Number(d.to_point_id) : null,
    from_text: d.from_point_id ? '' : d.from_text,
    to_text: d.to_point_id ? '' : d.to_text,
    stops: d.stops, status: d.status, note: d.note,
    requester_name: d.requester_name, requester_phone: d.requester_phone,
    escorts: d.escorts,
    roam_permit_id: d.roam_permit_id ? Number(d.roam_permit_id) : null,
    suggested_route_ids: d.suggested_route_ids, route_options: d.route_options,
    selected_route_ids: d.selected_route_ids, selected_route_label: d.selected_route_label,
  });

  const save = async () => {
    // אישור בלי נתיב נבחר = הפקח רואה "יש אישור", הנהג אינו מקבל דרך, ואיש
    // אינו יודע על מה הוסכם
    if (!canApproveTrip(draft.status, routeChoices.length > 0, draft.selected_route_sig)) {
      setError(tr('trips.errNeedRoute')); return;
    }
    setSaving(true); setError('');
    try {
      const r = creating || !selectedId
        ? await fetch(`${API_URL}/trips`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyOf(draft)) })
        : await fetch(`${API_URL}/entry-permit-trips/${selectedId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyOf(draft)) });
      if (!r.ok) { setError(tr('trips.errSave')); setSaving(false); return; }
      await r.json();
      await loadTrips();
      setSaving(false);
      backToList();
    } catch { setError(tr('trips.errSave')); setSaving(false); }
  };

  const removeTrip = async () => {
    if (!selectedId) return;
    if (!(await customConfirm(tr('trips.confirmDeleteTrip')))) return;
    await fetch(`${API_URL}/entry-permit-trips/${selectedId}`, { method: 'DELETE' }).catch(() => {});
    setSelectedId(null);
    await loadTrips();
    backToList();
  };

  /** הכרעת המגדל על שינוי שהנהג הציע - מוחלת בשרת כדי שלא תתפצל לשני מימושים. */
  const resolveChange = async (tripId: number, decision: 'approve' | 'reject') => {
    await fetch(`${API_URL}/entry-permit-trips/${tripId}/change/${decision}`, { method: 'POST' }).catch(() => {});
    const fresh: Trip[] = await fetch(`${API_URL}/trips?airfield_id=${airfieldId}`)
      .then(r => r.ok ? r.json() : []).catch(() => []);
    setTrips(fresh);
    // הטיוטה נטענת מחדש: אישור שינוי משנה שדות שהפקח רואה מולו
    const t = fresh.find(x => x.id === tripId);
    if (t && mode === 'form' && selectedId === tripId) setDraft(draftOf(t));
  };

  // ── שכפול ──────────────────────────────────────────────────────────────────
  /**
   * שכפול נסיעה אחת או קבוצה. הלקוח מחשב לכל עותק את מועדו **בשעון המקומי**
   * (`duplicateSchedule`) ושולח אותו מפורשות - חישוב "אותה שעה, יום אחר"
   * בשרת, מול TIMESTAMPTZ, היה זז בשעה במעבר שעון קיץ.
   */
  const runDuplicate = async (sources: Trip[], targetDate: string, copies: number, intervalMinutes: number) => {
    const n = clampCopies(copies);
    const items = sources.flatMap(t => Array.from({ length: n }, (_, k) => ({
      id: t.id,
      scheduled_at: duplicateSchedule(t.scheduled_at, targetDate, k, intervalMinutes),
    })));
    if (!items.length) return;
    setDupBusy(true);
    try {
      await fetch(`${API_URL}/trips/duplicate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ airfield_id: airfieldId, items }),
      });
      await loadTrips();
      // הסימון נמחק אחרי שכפול: להשאירו היה מזמין שכפול כפול בלחיצה נוספת
      setPicked(new Set());
      setDupFor([]);
    } catch { /* הרשת נופלת - הדיאלוג נשאר פתוח והפקח מנסה שוב */ }
    setDupBusy(false);
  };

  // ── סינון הרשימה ───────────────────────────────────────────────────────────
  const now = Date.now();
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trips
      .filter(t => {
        const past = asTripStatus(t.status) === 'ended'
          || (t.scheduled_at !== null && new Date(t.scheduled_at).getTime() < now);
        return tab === 'history' ? past : !past;
      })
      .filter(t => !q || [
        t.vehicle_name, t.vehicle_type_name, t.permit_driver_name, t.driver_name,
        t.from_point_name, t.from_text, t.to_point_name, t.to_text, t.trip_type_name,
      ].some(v => String(v ?? '').toLowerCase().includes(q)));
  }, [trips, search, tab, now]);

  /** הנסיעות המסומנות בפועל. סימון של שורה שנעלמה מהסינון אינו נחשב. */
  const pickedTrips = useMemo(() => filtered.filter(t => picked.has(t.id)), [filtered, picked]);
  const allFilteredPicked = filtered.length > 0 && pickedTrips.length === filtered.length;

  const dock = useDockableWindow('tripsManagement', tr('trips.title'), {
    setFloatingPos: (x, y) => drag.moveTo(x, y),
    floatingPos: () => drag.pos || { x: 40, y: 30 },
  });

  // ── פריטי עזר לעיצוב ───────────────────────────────────────────────────────
  const tabBtn = (key: 'upcoming' | 'history'): React.CSSProperties => ({
    height: CTRL_H, padding: '0 14px', fontSize: 11, borderRadius: 9, cursor: 'pointer',
    border: `1px solid ${tab === key ? '#0284c7' : C.border}`,
    background: tab === key ? '#0284c733' : 'transparent',
    color: tab === key ? C.text : C.muted,
  });

  const StatusChip: React.FC<{ status: TripStatus; small?: boolean }> = ({ status, small }) => (
    <span style={{
      fontSize: small ? 9 : 10, fontWeight: 'bold', padding: small ? '0 5px' : '1px 7px',
      borderRadius: 9, whiteSpace: 'nowrap',
      color: TRIP_STATUS_COLOR[status], border: `1px solid ${TRIP_STATUS_COLOR[status]}66`,
      background: `${TRIP_STATUS_COLOR[status]}1f`,
    }}>{tr(tripStatusKey(status))}</span>
  );

  const endpointLabel = (name: string | null, text: string) => name || text || '-';

  const th: React.CSSProperties = {
    textAlign: 'start', fontSize: 10, fontWeight: 'bold', color: C.muted,
    padding: '5px 8px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = {
    fontSize: 11, padding: '5px 8px', borderBottom: `1px solid ${C.line}`, verticalAlign: 'middle',
  };

  // ── רשימת הנסיעות (תצוגת ברירת המחדל) ──────────────────────────────────────
  const listView = (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <div style={{ padding: 8, display: 'flex', gap: 7, alignItems: 'center', borderBottom: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={tr('trips.search')}
          style={{ ...inputStyle, width: 260 }}
        />
        <button onClick={() => setTab('upcoming')} style={tabBtn('upcoming')}>{tr('trips.tabUpcoming')}</button>
        <button onClick={() => setTab('history')} style={tabBtn('history')}>{tr('trips.tabHistory')}</button>
        <span style={{ flex: 1 }} />
        {pickedTrips.length > 0 && (
          <>
            <span style={{ fontSize: 10, color: C.muted }}>{tr('trips.pickedCount', { count: pickedTrips.length })}</span>
            <button onClick={() => setDupFor(pickedTrips)} style={btn('#a855f7')}>⧉ {tr('trips.duplicateSelected')}</button>
            <button onClick={() => setPicked(new Set())} style={btn(C.border, C.text)}>{tr('trips.clearSelection')}</button>
          </>
        )}
        <button onClick={() => openNew()} style={btn('#0284c7')}>✚ {tr('trips.newTrip')}</button>
      </div>

      <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 24, fontSize: 12, color: C.muted, textAlign: 'center' }}>
            {trips.length === 0 ? tr('trips.noTrips') : tr('trips.noMatches')}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 28, textAlign: 'center' }}>
                  {/* סימון הכל - על **השורות המסוננות** ולא על כל הנסיעות:
                      סימון שכולל שורות שאינן על המסך הוא בדיוק הדרך לשכפל
                      בטעות יום שלם */}
                  <input
                    type="checkbox"
                    checked={allFilteredPicked}
                    onChange={() => setPicked(allFilteredPicked ? new Set() : new Set(filtered.map(t => t.id)))}
                    title={tr('trips.selectAll')}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={{ ...th, width: 34 }} />
                <th style={th}>{tr('trips.colVehicle')}</th>
                <th style={th}>{tr('trips.colDriver')}</th>
                <th style={th}>{tr('trips.colFromTo')}</th>
                <th style={th}>{tr('trips.colStops')}</th>
                <th style={th}>{tr('trips.colWhen')}</th>
                <th style={th}>{tr('trips.colRoute')}</th>
                <th style={th}>{tr('trips.colStatus')}</th>
                <th style={{ ...th, width: 118 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => {
                const st = asTripStatus(t.status);
                const when = splitLocalDateTime(t.scheduled_at);
                const stopNames = Array.isArray(t.stop_names) ? (t.stop_names as string[]).filter(Boolean) : [];
                const pending = hasPendingDriverChange(t);
                return (
                  <tr
                    key={t.id}
                    onDoubleClick={() => openEdit(t)}
                    style={{ background: i % 2 ? C.rowAlt : 'transparent' }}
                  >
                    <td style={{ ...td, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={picked.has(t.id)}
                        onChange={() => setPicked(prev => {
                          const next = new Set(prev);
                          if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
                          return next;
                        })}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ ...td, fontSize: 16, textAlign: 'center' }}>
                      {t.icon || suggestedVehicleIcon(t.vehicle_type_name)}
                    </td>
                    <td style={{ ...td, fontWeight: 'bold' }}>
                      {t.vehicle_name || t.vehicle_type_name || '-'}
                      {t.trip_type_name && (
                        <div style={{ fontSize: 9, color: C.muted, fontWeight: 'normal' }}>{t.trip_type_name}</div>
                      )}
                    </td>
                    <td style={td}>
                      {t.permit_driver_name || t.driver_name || '-'}
                      {t.driver_phone && (
                        <div style={{ fontSize: 9, color: C.muted, direction: 'ltr', textAlign: 'start' }}>{t.driver_phone}</div>
                      )}
                    </td>
                    <td style={td}>
                      {`${endpointLabel(t.from_point_name, t.from_text)} → ${endpointLabel(t.to_point_name, t.to_text)}`}
                    </td>
                    <td style={{ ...td, color: C.muted, fontSize: 10 }}>
                      {stopNames.length ? stopNames.join(' · ') : '-'}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {when.date ? `${when.date} ${when.time}` : tr('trips.noSchedule')}
                    </td>
                    {/* הנתיב שאושר לנהג - העמודה שאומרת אם בכלל הוכרע משהו */}
                    <td style={{ ...td, maxWidth: 220 }}>
                      {t.selected_route_label
                        ? <span style={{ fontSize: 10, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.selected_route_label}</span>
                        : <span style={{ fontSize: 10, color: '#f87171' }}>{tr('trips.routeNoneSelected')}</span>}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <StatusChip status={st} small />
                        {pending && <span title={tr('trips.pendingChange')} style={{ fontSize: 11 }}>✋</span>}
                        {t.driver_ack_at && <span title={tr('trips.driverAckedShort')} style={{ fontSize: 11, color: '#22c55e' }}>✓</span>}
                        {t.vehicle_request_id && <span title={tr('trips.fromRequest')} style={{ fontSize: 11 }}>🚛</span>}
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: 'end', whiteSpace: 'nowrap' }}>
                      <button onClick={() => openEdit(t)} style={{ ...btn('#334155', '#e2e8f0'), height: 22, padding: '0 10px' }}>
                        {tr('trips.edit')}
                      </button>
                      <button
                        onClick={() => setDupFor([t])}
                        title={tr('trips.duplicate')}
                        style={{ ...btn('#334155', '#e2e8f0'), height: 22, padding: '0 8px', marginInlineStart: 4 }}
                      >⧉</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  // ── טופס הנסיעה (חדש / עדכון) ──────────────────────────────────────────────
  const formView = (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <div style={{ padding: 8, display: 'flex', gap: 8, alignItems: 'center', borderBottom: `1px solid ${C.line}` }}>
        <button onClick={backToList} style={btn('#334155', '#e2e8f0')}>‹ {tr('trips.backToList')}</button>
        <span style={{ fontSize: 12, fontWeight: 'bold' }}>
          {creating ? tr('trips.newTrip') : tr('trips.editTrip')}
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={() => void save()} disabled={saving} style={{ ...btn('#22c55e'), opacity: saving ? 0.6 : 1, cursor: saving ? 'wait' : 'pointer' }}>{tr('trips.save')}</button>
        {!creating && <button onClick={() => void removeTrip()} style={btn('#ef4444')}>{tr('trips.delete')}</button>}
        {!creating && selected && (
          <button onClick={() => setDupFor([selected])} style={btn('#a855f7')}>⧉ {tr('trips.duplicate')}</button>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 10 }}>
        {/* שינוי שהנהג הציע - למעלה, כי בלעדיו הפקח מאשר נסיעה אחרת מזו
            שהנהג יוצא אליה בפועל */}
        {selected && !creating && hasPendingDriverChange(selected) && (
          <div style={{
            background: '#78350f', border: '1px solid #f59e0b', borderRadius: 6,
            padding: '6px 9px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 13 }}>✋</span>
            <div style={{ flex: 1, minWidth: 150 }}>
              <div style={{ fontSize: 11, fontWeight: 'bold', color: '#fde68a' }}>{tr('trips.pendingChange')}</div>
              <div style={{ fontSize: 10, color: '#fcd34d' }}>
                {tr('trips.pendingChangeFields', {
                  fields: pendingChangeFields(selected).map(f => tr(`trips.field${f === 'scheduled_at' ? 'ScheduledAt' : f === 'stops' ? 'Stops' : 'Note'}`)).join(', '),
                })}
              </div>
            </div>
            <button onClick={() => void resolveChange(selected.id, 'approve')} style={btn('#22c55e')}>{tr('trips.alertApproveChange')}</button>
            <button onClick={() => void resolveChange(selected.id, 'reject')} style={btn('#ef4444')}>{tr('trips.alertRejectChange')}</button>
          </div>
        )}

        {/* ── רכב ונהג ─────────────────────────────────────────────────────── */}
        <div style={{ ...sectionStyle, marginTop: 0 }}>{tr('trips.sectionVehicle')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr', gap: 7 }}>
          <div>
            <label style={labelStyle}>{tr('trips.driverPick')}</label>
            <select
              value={draft.driver_id}
              onChange={e => {
                const d = drivers.find(x => String(x.id) === e.target.value);
                setDraft(p => ({
                  ...p, driver_id: e.target.value,
                  // בחירת נהג מהמרשם ממלאת את שמו; נהג מזדמן נשאר בשם שהוקלד
                  driver_name: d ? `${d.first_name} ${d.last_name}`.trim() : p.driver_name,
                  vehicle_id: '',
                }));
              }}
              style={inputStyle}
            >
              <option value="">{tr('trips.driverManual')}</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{`${d.first_name} ${d.last_name}`.trim() || d.national_id}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>{tr('trips.driver')}</label>
            <input value={draft.driver_name} onChange={e => setDraft(d => ({ ...d, driver_name: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{tr('trips.driverPhone')}</label>
            <input value={draft.driver_phone} onChange={e => setDraft(d => ({ ...d, driver_phone: e.target.value }))} inputMode="tel" style={inputStyle} />
          </div>
        </div>

        {/* מצב אישור הכניסה של הנהג - הפקח מחליט על הנסיעה מול מי שמורשה
            להיכנס, ולא אחרי שהוא כבר בשער */}
        {draftDriver && (
          <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: C.muted }}>
            <span>{tr('trips.driverPermit')}</span>
            {(() => {
              const st = effectivePermitStatus(draftDriver);
              return (
                <span style={{
                  fontSize: 10, fontWeight: 'bold', padding: '0 6px', borderRadius: 9,
                  color: PERMIT_STATUS_COLOR[st], border: `1px solid ${PERMIT_STATUS_COLOR[st]}66`,
                  background: `${PERMIT_STATUS_COLOR[st]}1f`,
                }}>{tr(permitStatusKey(st))}</span>
              );
            })()}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr auto', gap: 7, marginTop: 7, alignItems: 'end' }}>
          <div>
            <label style={labelStyle}>{tr('trips.vehicleName')}</label>
            {/* בחירה מרכבי הנהג **או** הקלדה חופשית - נהג מגיע פעם ברכב קבוע
                ופעם ברכב מזדמן שאינו במרשם */}
            <select
              value={draft.vehicle_id}
              onChange={e => {
                const v = (draftDriver?.vehicles || []).find(x => String(x.id) === e.target.value);
                setDraft(p => ({
                  ...p, vehicle_id: e.target.value,
                  vehicle_name: v ? vehicleLabel(v) : p.vehicle_name,
                  vehicle_type_id: v?.vehicle_type_id ? String(v.vehicle_type_id) : p.vehicle_type_id,
                }));
              }}
              style={inputStyle}
              disabled={!draftDriver}
            >
              <option value="">{tr('trips.vehicleManual')}</option>
              {(draftDriver?.vehicles || []).map(v => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}
            </select>
            <input
              value={draft.vehicle_name}
              onChange={e => setDraft(d => ({ ...d, vehicle_name: e.target.value }))}
              style={{ ...inputStyle, marginTop: 3 }}
            />
          </div>
          <div>
            <label style={labelStyle}>{tr('trips.vehicleType')}</label>
            <select value={draft.vehicle_type_id} onChange={e => setDraft(d => ({ ...d, vehicle_type_id: e.target.value }))} style={inputStyle}>
              <option value="">{tr('trips.noVehicleType')}</option>
              {vehicleTypes.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            {vehicleTypes.length === 0 && <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{tr('trips.vehicleTypesEmpty')}</div>}
          </div>
          <div>
            <label style={labelStyle}>{tr('trips.tripType')}</label>
            <select value={draft.trip_type_id} onChange={e => setDraft(d => ({ ...d, trip_type_id: e.target.value }))} style={inputStyle}>
              <option value="">{tr('trips.noTripType')}</option>
              {tripTypes.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            {tripTypes.length === 0 && <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{tr('trips.tripTypesEmpty')}</div>}
          </div>
          <div style={{ position: 'relative' }}>
            <label style={labelStyle}>{tr('trips.icon')}</label>
            <button
              onClick={() => setIconPickerOpen(v => !v)}
              title={draft.icon ? tr('trips.iconOverridden') : tr('trips.iconSuggested')}
              style={{ ...inputStyle, width: 46, fontSize: 19, cursor: 'pointer', textAlign: 'center', lineHeight: 1.1 }}
            >{effectiveIcon}</button>
            {iconPickerOpen && (
              <div style={{
                position: 'absolute', insetInlineEnd: 0, top: '100%', marginTop: 3, zIndex: 5,
                background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 5,
                display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3, boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
              }}>
                {TRIP_VEHICLE_ICONS.map(ic => (
                  <button
                    key={ic}
                    onClick={() => { setDraft(d => ({ ...d, icon: ic })); setIconPickerOpen(false); }}
                    style={{ background: draft.icon === ic ? C.sel : 'transparent', border: 'none', fontSize: 17, cursor: 'pointer', borderRadius: 4, padding: 2 }}
                  >{ic}</button>
                ))}
                <button
                  onClick={() => { setDraft(d => ({ ...d, icon: '' })); setIconPickerOpen(false); }}
                  style={{ gridColumn: '1 / -1', ...btn(C.border, C.text), fontSize: 10, marginTop: 3 }}
                >{tr('trips.iconUseSuggested')}</button>
              </div>
            )}
          </div>
        </div>

        {/* ── מועד, מוצא ויעד ────────────────────────────────────────────── */}
        <div style={sectionStyle}>{tr('trips.sectionWhen')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gap: 7 }}>
          <div>
            <label style={labelStyle}>{tr('trips.dateLabel')}</label>
            <input type="date" value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} style={dateStyle} />
          </div>
          <div>
            <label style={labelStyle}>{tr('trips.timeLabel')}</label>
            <input type="time" value={draft.time} onChange={e => setDraft(d => ({ ...d, time: e.target.value }))} style={dateStyle} />
          </div>
          <div>
            <label style={labelStyle}>{tr('trips.status')}</label>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <select
                value={draft.status}
                onChange={e => setDraft(d => ({ ...d, status: asTripStatus(e.target.value) }))}
                style={{ ...inputStyle, flex: 1 }}
              >
                {TRIP_STATUSES.map(s => <option key={s} value={s}>{tr(tripStatusKey(s))}</option>)}
              </select>
              <StatusChip status={draft.status} />
            </div>
            {selected && !creating && (
              <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>
                {selected.driver_ack_at
                  ? tr('trips.driverAcked', { time: new Date(selected.driver_ack_at).toLocaleString(i18n.language, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) })
                  : tr('trips.driverNotAcked')}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginTop: 7 }}>
          <div>
            <label style={labelStyle}>{tr('trips.from')}</label>
            <select value={draft.from_point_id} onChange={e => setDraft(d => ({ ...d, from_point_id: e.target.value }))} style={inputStyle}>
              <option value="">{tr('trips.pointOther')}</option>
              {points.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {!draft.from_point_id && <input value={draft.from_text} onChange={e => setDraft(d => ({ ...d, from_text: e.target.value }))} style={{ ...inputStyle, marginTop: 3 }} />}
          </div>
          <div>
            <label style={labelStyle}>{tr('trips.to')}</label>
            <select value={draft.to_point_id} onChange={e => setDraft(d => ({ ...d, to_point_id: e.target.value }))} style={inputStyle}>
              <option value="">{tr('trips.pointOther')}</option>
              {points.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {!draft.to_point_id && <input value={draft.to_text} onChange={e => setDraft(d => ({ ...d, to_text: e.target.value }))} style={{ ...inputStyle, marginTop: 3 }} />}
          </div>
        </div>
        {points.length === 0 && <div style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>{tr('trips.pointsEmpty')}</div>}

        {/* ── תחנות ביניים ───────────────────────────────────────────────── */}
        <div style={{ ...sectionStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1 }}>{tr('trips.stops')}</span>
          <button
            onClick={() => setDraft(d => ({ ...d, stops: [...d.stops, { point_id: null, text: '' }] }))}
            style={{ ...btn('#0284c7'), height: 22, padding: '0 10px', fontSize: 10 }}
          >{tr('trips.addStop')}</button>
        </div>
        {draft.stops.length === 0 && <div style={{ fontSize: 10, color: C.muted, padding: '2px 0' }}>{tr('trips.noStops')}</div>}
        {draft.stops.map((s, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: C.muted, width: 16, textAlign: 'center' }}>{idx + 1}</span>
            <select
              value={s.point_id ? String(s.point_id) : ''}
              onChange={e => setDraft(d => ({
                ...d,
                stops: d.stops.map((x, i) => i === idx ? { ...x, point_id: e.target.value ? Number(e.target.value) : null } : x),
              }))}
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value="">{tr('trips.pointOther')}</option>
              {points.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {!s.point_id && (
              <input
                value={s.text}
                onChange={e => setDraft(d => ({ ...d, stops: d.stops.map((x, i) => i === idx ? { ...x, text: e.target.value } : x) }))}
                style={{ ...inputStyle, flex: 1 }}
              />
            )}
            <button
              onClick={() => setDraft(d => ({ ...d, stops: d.stops.filter((_, i) => i !== idx) }))}
              title={tr('trips.removeStop')}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}
            >✕</button>
          </div>
        ))}

        {/* ── נתיב הנסיעה ────────────────────────────────────────────────── */}
        <div style={{ ...sectionStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1 }}>{tr('trips.sectionRoute')}</span>
          <button
            onClick={() => void computeRoutes()}
            disabled={routeLoading}
            style={{ ...btn('#0284c7'), height: 22, padding: '0 10px', fontSize: 10, opacity: routeLoading ? 0.6 : 1 }}
          >{routeLoading ? tr('trips.routeComputing') : tr('trips.routeRecompute')}</button>
        </div>
        <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>
          {tr('trips.routeAutoHint')}
          {draft.stops.some(st => st.point_id) && (
            <span style={{ marginInlineStart: 6, color: '#38bdf8' }}>
              {tr('trips.routeViaStops', { count: draft.stops.filter(st => st.point_id).length })}
            </span>
          )}
        </div>
        {routeError && <div style={{ fontSize: 10, color: '#f87171', marginBottom: 4 }}>{routeError}</div>}
        {routeChoices.length === 0 ? (
          <div style={{ fontSize: 10, color: C.muted, padding: '2px 0' }}>{tr('trips.routeNone')}</div>
        ) : (
          <>
            {/* הנתיב שהנהג ייסע בו הוא הכרעה של הפקח - ולכן כאן אין ברירת מחדל
                מסומנת, והשורות מתנהגות כקבוצת רדיו: אחת בכל רגע */}
            <div style={{ fontSize: 10, color: draft.selected_route_sig ? C.muted : '#fbbf24', marginBottom: 4 }}>
              {draft.selected_route_sig ? tr('trips.routeOptions') : tr('trips.routeMustPick')}
            </div>
            {routeChoices.map((o, idx) => {
              const chosen = isRouteChosen(o, draft.selected_route_sig);
              return (
                <div
                  key={routeSignature(o)}
                  onClick={() => chooseRoute(o)}
                  role="radio"
                  aria-checked={chosen}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, cursor: 'pointer',
                    padding: '5px 7px', marginBottom: 3, borderRadius: 5,
                    background: chosen ? C.sel : C.rowAlt,
                    border: `1px solid ${chosen ? '#22c55e' : 'transparent'}`,
                  }}
                >
                  <span style={{ fontSize: 12, color: chosen ? '#22c55e' : C.muted }}>{chosen ? '◉' : '○'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 'bold' }}>{variantLabel(o.key)}</span>
                      {/* "המוצע" = הקצר ביותר שהמודל מצא, והוא הראשון אחרי המיון.
                          מוצע אינו נבחר: הוא המלצה, לא הכרעה */}
                      {idx === 0 && <span style={{ fontSize: 9, color: '#4ade80' }}>{tr('trips.routeShortest')}</span>}
                      {/* בשדה שאין בו דרך חלופית כל הרמות מחזירות אותו נתיב.
                          בלי לומר זאת, שורה בודדת נראית כמו חישוב שנכשל */}
                      {o.keys.length > 1 && (
                        <span style={{ fontSize: 9, color: C.muted }}>
                          {tr('trips.routeSameForAll', { levels: o.keys.map(variantLabel).join(', ') })}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 9, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</div>
                  </div>
                  <span style={{ fontSize: 9, color: C.muted, whiteSpace: 'nowrap' }}>{tr('trips.routeDistance', { meters: o.dist_m })}</span>
                  {o.crossings > 0 && (
                    <span style={{ fontSize: 9, color: '#fbbf24', whiteSpace: 'nowrap' }}>{tr('trips.routeCrossings', { count: o.crossings })}</span>
                  )}
                </div>
              );
            })}
          </>
        )}
        <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
          {tr('trips.routeSelected')}
          <span style={{ color: draft.selected_route_label ? C.text : '#f87171', marginInlineStart: 5 }}>
            {draft.selected_route_label || tr('trips.routeNoneSelected')}
          </span>
        </div>

        {/* ── מבקש הנסיעה ונלווים ────────────────────────────────────────── */}
        <div style={sectionStyle}>{tr('trips.sectionPeople')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 7 }}>
          <div>
            <label style={labelStyle}>{tr('trips.requester')}</label>
            <input value={draft.requester_name} onChange={e => setDraft(d => ({ ...d, requester_name: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{tr('trips.requesterPhone')}</label>
            <input value={draft.requester_phone} onChange={e => setDraft(d => ({ ...d, requester_phone: e.target.value }))} inputMode="tel" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{tr('trips.roamPermit')}</label>
            <select value={draft.roam_permit_id} onChange={e => setDraft(d => ({ ...d, roam_permit_id: e.target.value }))} style={inputStyle}>
              <option value="">{tr('trips.noRoamPermit')}</option>
              {roamPermits.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {roamPermits.length === 0 && <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{tr('trips.roamPermitsEmpty')}</div>}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 4 }}>
          <span style={{ flex: 1, fontSize: 10, color: C.muted }}>{tr('trips.escorts')}</span>
          <button
            onClick={() => setDraft(d => ({ ...d, escorts: [...d.escorts, { name: '', national_id: '' }] }))}
            style={{ ...btn('#0284c7'), height: 22, padding: '0 10px', fontSize: 10 }}
          >{tr('trips.addEscort')}</button>
        </div>
        {draft.escorts.length === 0 && <div style={{ fontSize: 10, color: C.muted }}>{tr('trips.noEscorts')}</div>}
        {draft.escorts.map((e, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
            <input
              value={e.name} placeholder={tr('trips.escortName')}
              onChange={ev => setDraft(d => ({ ...d, escorts: d.escorts.map((x, i) => i === idx ? { ...x, name: ev.target.value } : x) }))}
              style={{ ...inputStyle, flex: 1.4 }}
            />
            <input
              value={e.national_id} placeholder={tr('trips.escortId')} inputMode="numeric"
              onChange={ev => setDraft(d => ({ ...d, escorts: d.escorts.map((x, i) => i === idx ? { ...x, national_id: ev.target.value } : x) }))}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={() => setDraft(d => ({ ...d, escorts: d.escorts.filter((_, i) => i !== idx) }))}
              title={tr('trips.delete')}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}
            >✕</button>
          </div>
        ))}

        <div style={{ marginTop: 7 }}>
          <label style={labelStyle}>{tr('trips.note')}</label>
          <textarea value={draft.note} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} rows={2} style={areaStyle} />
        </div>

        {error && <div style={{ marginTop: 6, fontSize: 11, color: '#ef4444' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 6, marginTop: 9, alignItems: 'center' }}>
          <button onClick={() => void save()} disabled={saving} style={{ ...btn('#22c55e'), opacity: saving ? 0.6 : 1, cursor: saving ? 'wait' : 'pointer' }}>{tr('trips.save')}</button>
          <button onClick={backToList} style={btn(C.border, C.text)}>{tr('trips.cancel')}</button>
          {!creating && <button onClick={() => void removeTrip()} style={btn('#ef4444')}>{tr('trips.delete')}</button>}
          {selected?.vehicle_request_id && !creating && (
            <span title={tr('trips.fromRequest')} style={{ fontSize: 13 }}>🚛</span>
          )}
        </div>
      </div>
    </div>
  );

  const win = (
    <div
      ref={winRef}
      style={{
        position: 'fixed', zIndex: 8600,
        ...(drag.dragged ? { left: drag.pos!.x, top: drag.pos!.y } : { left: 40, top: 30 }),
        ...(dock.docked ? {} : WINDOW_SIZE),
        display: 'flex', flexDirection: 'column',
        background: C.panel, color: C.text, direction: dir,
        boxShadow: '0 10px 34px rgba(0,0,0,0.5)',
        // חלון **עריכה** - מסגרת כתומה לפי קוד הצבע המשותף (CLAUDE.md §מסגרת חלון)
        ...windowFrame('edit', themeMode, 10),
        overflow: 'hidden',
        ...dock.rootStyle,
      }}
    >
      {/* ── כותרת + ידית גרירה ─────────────────────────────────────────────── */}
      <div
        {...drag.handleProps}
        onPointerDown={e => { dock.onHeaderPointerDown(e); drag.handleProps.onPointerDown(e); }}
        style={{
          ...drag.handleProps.style, background: C.head, borderBottom: `1px solid ${C.border}`,
          padding: '6px 9px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 15 }}>🚙</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 'bold' }}>
          {tr('trips.title')}
          <span style={{ color: C.muted, fontWeight: 'normal', marginInlineStart: 6 }}>
            {tr('trips.tripCount', { count: trips.length })}
          </span>
        </span>
        {/* הכפתור יושב בתוך ידית הגרירה שתופסת את המצביע - בלי העצירה הלחיצה
            נבלעת בגרירה ולא מגיעה ל-onClick */}
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={onClose}
          title={tr('shared.close')}
          style={{ background: 'none', border: 'none', color: C.text, fontSize: 15, cursor: 'pointer', lineHeight: 1, padding: '0 6px' }}
        >✕</button>
      </div>

      {/* שכבת השכפול - בתוך החלון ולא כפורטל, כדי שתיסגר איתו ולא תישאר
          תלויה על המסך כשהוא נעגן או נסגר */}
      {dupFor.length > 0 && (
        <DuplicateDialog
          sources={dupFor}
          C={C}
          dir={dir}
          themeMode={themeMode}
          busy={dupBusy}
          onCancel={() => setDupFor([])}
          onConfirm={(date, copies, gap) => void runDuplicate(dupFor, date, copies, gap)}
        />
      )}

      {!airfieldId
        ? <div style={{ padding: 20, fontSize: 12, color: C.muted, textAlign: 'center' }}>{tr('trips.noAirfield')}</div>
        : mode === 'list' ? listView : formView}
    </div>
  );

  return dock.render(win);
};

export default TripsManagementWindow;
