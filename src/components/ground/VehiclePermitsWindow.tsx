// חלון ניהול רכבים ואישורי כניסה - עמדת ניהול שדה תעופה.
//
// כאן מנוהל **מי מורשה להיכנס לשדה ובאיזה רכב**, להבדיל מפאנל "כניסת רכבים"
// (GroundVehiclePanel) שהוא התור החי של מי שדופק בשער עכשיו. השניים מחוברים:
// בבקשת כניסה מוצג מצב האישור של מבקש הכניסה, ואישור בקשה רושם נסיעה כאן.
//
// **הישות היא הנהג** (מזוהה בת"ז) והרכבים תלויים בו - נהג מגיע פעם ברכב קבוע
// ופעם ברכב מזדמן, וההרשאה היא של האדם.
//
// חלון **עריכה** (מסגרת כתומה): הוא משנה רשומות והגדרות, לא מציג מצב שדה חי.
// יושב בתוך #root ולכן מקבל את `zoom: var(--s)` אוטומטית - רק יחידות ה-vh
// מחולקות ב---s ידנית (ראה /ui-adapt §מלכודת ה-vw/vh).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import i18n from '../../i18n';
import { API_URL } from '../../config';
import { windowFrame } from '../../utils/windowFrame';
import useDragPosition from '../../hooks/useDragPosition';
import { useDockableWindow } from '../../hooks/useDockableWindow';
import { customConfirm } from '../shared/ConfirmModal';
import {
  PERMIT_STATUSES, PERMIT_STATUS_COLOR, computedPermitStatus, daysUntilExpiry,
  dateOnly, effectivePermitStatus, isPermitOverridden, permitStatusKey,
  type PermitStatus,
} from '../../utils/permitStatus';

export type ThemeMode = 'light' | 'dark' | 'ocean';

/** פלטת שלוש התמות. ocean היא תמה **כהה** ולכן קרובה ל-dark ולא ל-light. */
function palette(themeMode: ThemeMode) {
  return themeMode === 'light'
    ? { panel: '#f1f5f9', head: '#dbe5f1', border: '#94a3b8', line: '#cbd5e1', text: '#1e293b', muted: '#64748b', input: '#ffffff', rowAlt: '#e8eef6', sel: '#cfe0f2' }
    : themeMode === 'ocean'
    ? { panel: '#0b3a4a', head: '#0e4b5f', border: '#2b7f96', line: '#1d6579', text: '#cffafe', muted: '#7dd3e8', input: '#062c38', rowAlt: '#0d4353', sel: '#12566b' }
    : { panel: '#0f172a', head: '#1e293b', border: '#334155', line: '#243447', text: '#e2e8f0', muted: '#94a3b8', input: '#0b1220', rowAlt: '#141f33', sel: '#1e3a5f' };
}

type ParamKind = 'zone' | 'transport_role' | 'vehicle_type';

interface PermitParam { id: number; kind: ParamKind; name: string; polygon_id: number | null; color: string; active: boolean; sort_order: number }
interface PermitVehicle { id: number; vehicle_type_id: number | null; vehicle_type_name: string | null; plate_fixed: boolean; plate_number: string; notes: string | null; sort_order: number }
interface PermitZone { id: number; name: string; color: string; polygon_id: number | null }
interface PermitDriver {
  id: number; airfield_id: number; first_name: string; last_name: string; national_id: string;
  transport_role_id: number | null; transport_role_name: string | null;
  permit_from: string | null; permit_until: string | null; status_override: string | null;
  notes: string | null; approved_by: string; created_at: string; updated_at: string;
  vehicles: PermitVehicle[]; zones: PermitZone[];
}
interface PermitTrip {
  id: number; vehicle_id: number | null; from_point_id: number | null; to_point_id: number | null;
  from_text: string; to_text: string; scheduled_at: string | null; ended_at: string | null;
  purpose: string | null; vehicle_request_id: number | null;
  from_point_name: string | null; to_point_name: string | null;
  plate_number: string | null; plate_fixed: boolean | null; vehicle_type_name: string | null;
}
interface AirfieldPoint { id: number; name: string }

/** טופס הנהג - טיוטה מקומית, כדי שהסטטוס יתעדכן לפי התאריכים לפני השמירה. */
interface DriverDraft {
  first_name: string; last_name: string; national_id: string;
  transport_role_id: string; permit_from: string; permit_until: string;
  status_override: string; notes: string; approved_by: string; zone_ids: number[];
}

const EMPTY_DRAFT: DriverDraft = {
  first_name: '', last_name: '', national_id: '', transport_role_id: '',
  permit_from: '', permit_until: '', status_override: '', notes: '', approved_by: '', zone_ids: [],
};

const draftOf = (d: PermitDriver): DriverDraft => ({
  first_name: d.first_name || '', last_name: d.last_name || '', national_id: d.national_id || '',
  transport_role_id: d.transport_role_id ? String(d.transport_role_id) : '',
  permit_from: dateOnly(d.permit_from), permit_until: dateOnly(d.permit_until),
  status_override: d.status_override || '', notes: d.notes || '', approved_by: d.approved_by || '',
  zone_ids: (d.zones || []).map(z => z.id),
});

const fullName = (d: { first_name?: string; last_name?: string }) =>
  `${d.first_name || ''} ${d.last_name || ''}`.trim() || tr('permits.unnamed');

export interface VehiclePermitsWindowProps {
  /** השדה שהעמדה מוצמדת אליו. בלעדיו אין למי לשייך אישורים */
  airfieldId: number | null;
  themeMode: ThemeMode;
  onClose: () => void;
  /** נהג לפתוח מיד - כשמגיעים לכאן מבקשת כניסה בפאנל "כניסת רכבים" */
  focusDriverId?: number | null;
}

export const VehiclePermitsWindow: React.FC<VehiclePermitsWindowProps> = ({ airfieldId, themeMode, onClose, focusDriverId }) => {
  const C = palette(themeMode);
  const dir = i18n.dir();
  const winRef = useRef<HTMLDivElement | null>(null);
  const drag = useDragPosition(winRef);

  const [params, setParams] = useState<PermitParam[]>([]);
  const [points, setPoints] = useState<AirfieldPoint[]>([]);
  const [drivers, setDrivers] = useState<PermitDriver[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DriverDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [trips, setTrips] = useState<PermitTrip[]>([]);
  const [tripTab, setTripTab] = useState<'future' | 'history'>('future');
  const [addingTrip, setAddingTrip] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);

  const zones = useMemo(() => params.filter(p => p.kind === 'zone' && p.active), [params]);
  const roles = useMemo(() => params.filter(p => p.kind === 'transport_role' && p.active), [params]);
  const vehicleTypes = useMemo(() => params.filter(p => p.kind === 'vehicle_type' && p.active), [params]);

  const selected = useMemo(() => drivers.find(d => d.id === selectedId) || null, [drivers, selectedId]);

  // ── טעינה ──────────────────────────────────────────────────────────────────
  const loadDrivers = useCallback(async () => {
    if (!airfieldId) { setDrivers([]); return; }
    try {
      const r = await fetch(`${API_URL}/entry-permits?airfield_id=${airfieldId}`);
      if (r.ok) setDrivers(await r.json());
    } catch { /* הרשת נופלת - הרשימה נשארת כפי שהיא */ }
  }, [airfieldId]);

  useEffect(() => {
    if (!airfieldId) { setParams([]); setPoints([]); return; }
    fetch(`${API_URL}/permit-params?airfield_id=${airfieldId}`).then(r => r.ok ? r.json() : []).then(setParams).catch(() => {});
    fetch(`${API_URL}/airfields/${airfieldId}/points`).then(r => r.ok ? r.json() : []).then(setPoints).catch(() => {});
  }, [airfieldId]);

  useEffect(() => { void loadDrivers(); }, [loadDrivers]);

  useEffect(() => { if (focusDriverId) { setSelectedId(focusDriverId); setCreating(false); } }, [focusDriverId]);

  // הטיוטה נגזרת מהנהג הנבחר, ולא מוחזקת במקביל - כדי שרענון הרשימה לא ידרוס
  // שדה שהמפעיל באמצע הקלדתו רק בגלל שהתשובה מהשרת חזרה.
  useEffect(() => {
    if (creating) { setDraft(EMPTY_DRAFT); return; }
    setDraft(selected ? draftOf(selected) : EMPTY_DRAFT);
    setError('');
  }, [selectedId, creating]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTrips = useCallback(async (driverId: number) => {
    try {
      const r = await fetch(`${API_URL}/entry-permits/${driverId}/trips`);
      setTrips(r.ok ? await r.json() : []);
    } catch { setTrips([]); }
  }, []);

  useEffect(() => {
    if (selectedId && !creating) void loadTrips(selectedId);
    else setTrips([]);
  }, [selectedId, creating, loadTrips]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── שמירה ──────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!draft.first_name.trim() && !draft.last_name.trim()) { setError(tr('permits.errName')); return; }
    setSaving(true); setError('');
    const body = {
      airfield_id: airfieldId,
      first_name: draft.first_name, last_name: draft.last_name, national_id: draft.national_id,
      transport_role_id: draft.transport_role_id ? Number(draft.transport_role_id) : null,
      permit_from: draft.permit_from || null, permit_until: draft.permit_until || null,
      status_override: draft.status_override, notes: draft.notes,
      approved_by: draft.approved_by, zone_ids: draft.zone_ids,
    };
    try {
      const r = creating || !selectedId
        ? await fetch(`${API_URL}/entry-permits`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch(`${API_URL}/entry-permits/${selectedId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setError(e.error === 'national_id_exists' ? tr('permits.errNationalIdExists') : tr('permits.errSave'));
        setSaving(false); return;
      }
      const savedDriver: PermitDriver = await r.json();
      await loadDrivers();
      setCreating(false);
      setSelectedId(savedDriver.id);
    } catch { setError(tr('permits.errSave')); }
    setSaving(false);
  };

  const removeDriver = async () => {
    if (!selectedId) return;
    if (!(await customConfirm(tr('permits.confirmDeleteDriver')))) return;
    await fetch(`${API_URL}/entry-permits/${selectedId}`, { method: 'DELETE' }).catch(() => {});
    setSelectedId(null);
    void loadDrivers();
  };

  // ── סינון הרשימה ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter(d =>
      fullName(d).toLowerCase().includes(q) ||
      (d.national_id || '').includes(q) ||
      (d.vehicles || []).some(v => (v.plate_number || '').toLowerCase().includes(q)));
  }, [drivers, search]);

  const dock = useDockableWindow('vehiclePermits', tr('permits.title'), {
    setFloatingPos: (x, y) => drag.moveTo(x, y),
    floatingPos: () => drag.pos || { x: 60, y: 70 },
  });

  // ── פריטי עזר לעיצוב ───────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '5px 7px', background: C.input, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 12, boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { fontSize: 10, color: C.muted, display: 'block', marginBottom: 2 };
  const sectionStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 'bold', color: C.text, borderBottom: `1px solid ${C.line}`,
    paddingBottom: 3, marginBottom: 6, marginTop: 10,
  };
  const btn = (bg: string, fg = '#fff'): React.CSSProperties => ({
    padding: '5px 10px', background: bg, color: fg, border: 'none', borderRadius: 5,
    fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
  });

  const statusOf = (d: { permit_from?: string | null; permit_until?: string | null; status_override?: string | null }) =>
    effectivePermitStatus(d);

  const StatusChip: React.FC<{ status: PermitStatus; small?: boolean }> = ({ status, small }) => (
    <span style={{
      fontSize: small ? 9 : 10, fontWeight: 'bold', padding: small ? '0 5px' : '1px 7px',
      borderRadius: 9, whiteSpace: 'nowrap',
      color: PERMIT_STATUS_COLOR[status], border: `1px solid ${PERMIT_STATUS_COLOR[status]}66`,
      background: `${PERMIT_STATUS_COLOR[status]}1f`,
    }}>{tr(permitStatusKey(status))}</span>
  );

  const now = Date.now();
  const futureTrips = trips.filter(t => t.scheduled_at && new Date(t.scheduled_at).getTime() >= now);
  const historyTrips = trips.filter(t => !t.scheduled_at || new Date(t.scheduled_at).getTime() < now);

  const win = (
    <div
      ref={winRef}
      style={{
        position: 'fixed', zIndex: 8600,
        ...(drag.dragged ? { left: drag.pos!.x, top: drag.pos!.y } : { left: 60, top: 70 }),
        width: 'min(760px, calc(94vw / var(--s, 1)))',
        maxHeight: 'calc(84vh / var(--s, 1))',
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
        <span style={{ fontSize: 15 }}>🚛</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 'bold' }}>
          {tr('permits.title')}
          <span style={{ color: C.muted, fontWeight: 'normal', marginInlineStart: 6 }}>
            {tr('permits.driverCount', { count: drivers.length })}
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

      {!airfieldId ? (
        <div style={{ padding: 20, fontSize: 12, color: C.muted, textAlign: 'center' }}>{tr('permits.noAirfield')}</div>
      ) : (
        <div style={{ display: 'flex', minHeight: 0, flex: 1 }}>
          {/* ── רשימת הנהגים ──────────────────────────────────────────────── */}
          <div style={{ width: 218, flexShrink: 0, borderInlineEnd: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: 6, display: 'flex', gap: 5, borderBottom: `1px solid ${C.line}` }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={tr('permits.search')}
                style={{ ...inputStyle, fontSize: 11 }}
              />
              <button
                onClick={() => { setCreating(true); setSelectedId(null); }}
                title={tr('permits.newDriver')}
                style={{ ...btn('#0284c7'), padding: '4px 8px', flexShrink: 0 }}
              >✚</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {filtered.length === 0 && (
                <div style={{ padding: 12, fontSize: 11, color: C.muted, textAlign: 'center' }}>
                  {drivers.length === 0 ? tr('permits.noDrivers') : tr('permits.noMatches')}
                </div>
              )}
              {filtered.map((d, i) => {
                const st = statusOf(d);
                const isSel = d.id === selectedId && !creating;
                const plates = (d.vehicles || []).filter(v => v.plate_fixed && v.plate_number).map(v => v.plate_number);
                return (
                  <div
                    key={d.id}
                    onClick={() => { setCreating(false); setSelectedId(d.id); }}
                    style={{
                      padding: '5px 8px', cursor: 'pointer', fontSize: 11,
                      background: isSel ? C.sel : (i % 2 ? C.rowAlt : 'transparent'),
                      borderInlineStart: `3px solid ${isSel ? PERMIT_STATUS_COLOR[st] : 'transparent'}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ flex: 1, fontWeight: isSel ? 'bold' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName(d)}</span>
                      <StatusChip status={st} small />
                    </div>
                    <div style={{ fontSize: 9, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[d.national_id, plates.join(', ')].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── פרטי הנהג ─────────────────────────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 10 }}>
            {!selected && !creating ? (
              <div style={{ padding: 24, fontSize: 12, color: C.muted, textAlign: 'center' }}>{tr('permits.selectDriver')}</div>
            ) : (
              <>
                <div style={{ ...sectionStyle, marginTop: 0 }}>{tr('permits.sectionDriver')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7 }}>
                  <div>
                    <label style={labelStyle}>{tr('permits.firstName')}</label>
                    <input value={draft.first_name} onChange={e => setDraft(d => ({ ...d, first_name: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>{tr('permits.lastName')}</label>
                    <input value={draft.last_name} onChange={e => setDraft(d => ({ ...d, last_name: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>{tr('permits.nationalId')}</label>
                    <input value={draft.national_id} onChange={e => setDraft(d => ({ ...d, national_id: e.target.value }))} inputMode="numeric" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>{tr('permits.transportRole')}</label>
                    <select value={draft.transport_role_id} onChange={e => setDraft(d => ({ ...d, transport_role_id: e.target.value }))} style={inputStyle}>
                      <option value="">{tr('permits.noTransportRole')}</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>{tr('permits.approvedBy')}</label>
                    <input value={draft.approved_by} onChange={e => setDraft(d => ({ ...d, approved_by: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>{tr('permits.updatedAt')}</label>
                    <div style={{ ...inputStyle, background: 'transparent', border: `1px dashed ${C.line}`, color: C.muted, fontSize: 11 }}>
                      {selected?.updated_at ? new Date(selected.updated_at).toLocaleString(i18n.language) : tr('permits.never')}
                    </div>
                  </div>
                </div>

                {/* ── אישור כניסה ────────────────────────────────────────── */}
                <div style={sectionStyle}>{tr('permits.sectionPermit')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gap: 7, alignItems: 'start' }}>
                  <div>
                    <label style={labelStyle}>{tr('permits.permitFrom')}</label>
                    <input type="date" value={draft.permit_from} onChange={e => setDraft(d => ({ ...d, permit_from: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>{tr('permits.permitUntil')}</label>
                    <input type="date" value={draft.permit_until} onChange={e => setDraft(d => ({ ...d, permit_until: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>{tr('permits.status')}</label>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                      <select
                        value={draft.status_override}
                        onChange={e => setDraft(d => ({ ...d, status_override: e.target.value }))}
                        style={{ ...inputStyle, flex: 1 }}
                      >
                        <option value="">{tr('permits.statusAuto')}</option>
                        {PERMIT_STATUSES.map(s => <option key={s} value={s}>{tr(permitStatusKey(s))}</option>)}
                      </select>
                      <StatusChip status={effectivePermitStatus(draft)} />
                    </div>
                    {/* למה נדרס: בלי זה הפקח רואה "נפסל" בתוך תקופת תוקף תקפה
                        ומחפש את התקלה בתאריכים */}
                    <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>
                      {isPermitOverridden(draft)
                        ? `${tr('permits.statusOverridden')} · ${tr('permits.statusAutoWouldBe', { status: tr(permitStatusKey(computedPermitStatus(draft))) })}`
                        : (() => {
                            const days = daysUntilExpiry(draft);
                            if (days === null) return '';
                            if (days === 0) return tr('permits.expiresToday');
                            return days > 0 ? tr('permits.expiresIn', { days }) : tr('permits.expiredAgo', { days: -days });
                          })()}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 7 }}>
                  <label style={labelStyle}>{tr('permits.zones')}</label>
                  {zones.length === 0 ? (
                    <div style={{ fontSize: 10, color: C.muted }}>{tr('permits.zonesEmpty')}</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {zones.map(z => {
                        const on = draft.zone_ids.includes(z.id);
                        return (
                          <button
                            key={z.id}
                            onClick={() => setDraft(d => ({
                              ...d,
                              zone_ids: on ? d.zone_ids.filter(x => x !== z.id) : [...d.zone_ids, z.id],
                            }))}
                            style={{
                              padding: '3px 9px', borderRadius: 10, fontSize: 11, cursor: 'pointer',
                              background: on ? `${z.color}33` : 'transparent',
                              color: on ? C.text : C.muted,
                              border: `1px solid ${on ? z.color : C.border}`,
                            }}
                          >{on ? '✓ ' : ''}{z.name}</button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 7 }}>
                  <label style={labelStyle}>{tr('permits.notes')}</label>
                  <textarea value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>

                {error && <div style={{ marginTop: 6, fontSize: 11, color: '#ef4444' }}>{error}</div>}

                <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
                  <button onClick={() => void save()} disabled={saving} style={{ ...btn('#22c55e'), opacity: saving ? 0.6 : 1, cursor: saving ? 'wait' : 'pointer' }}>{tr('permits.save')}</button>
                  {creating
                    ? <button onClick={() => setCreating(false)} style={btn(C.border, C.text)}>{tr('permits.cancel')}</button>
                    : <button onClick={() => void removeDriver()} style={btn('#ef4444')}>{tr('permits.delete')}</button>}
                </div>

                {/* ── רכבים ונסיעות: רק לנהג שכבר נשמר ────────────────────── */}
                {selected && !creating && (
                  <>
                    <VehiclesSection
                      driver={selected} vehicleTypes={vehicleTypes} C={C}
                      inputStyle={inputStyle} labelStyle={labelStyle} sectionStyle={sectionStyle} btn={btn}
                      adding={addingVehicle} setAdding={setAddingVehicle} onChanged={loadDrivers}
                    />
                    <TripsSection
                      driver={selected} points={points} trips={tripTab === 'future' ? futureTrips : historyTrips}
                      tab={tripTab} setTab={setTripTab} C={C}
                      inputStyle={inputStyle} labelStyle={labelStyle} sectionStyle={sectionStyle} btn={btn}
                      adding={addingTrip} setAdding={setAddingTrip}
                      onChanged={() => loadTrips(selected.id)}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return dock.render(win);
};

// ── רכבים תחת הנהג ───────────────────────────────────────────────────────────

interface SubProps {
  C: ReturnType<typeof palette>;
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
  sectionStyle: React.CSSProperties;
  btn: (bg: string, fg?: string) => React.CSSProperties;
  adding: boolean;
  setAdding: (v: boolean) => void;
  onChanged: () => void | Promise<void>;
}

const VehiclesSection: React.FC<SubProps & { driver: PermitDriver; vehicleTypes: PermitParam[] }> = ({
  driver, vehicleTypes, C, inputStyle, labelStyle, sectionStyle, btn, adding, setAdding, onChanged,
}) => {
  const [typeId, setTypeId] = useState('');
  const [fixed, setFixed] = useState(true);
  const [plate, setPlate] = useState('');

  const reset = () => { setTypeId(''); setFixed(true); setPlate(''); setAdding(false); };

  const add = async () => {
    await fetch(`${API_URL}/entry-permits/${driver.id}/vehicles`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicle_type_id: typeId ? Number(typeId) : null, plate_fixed: fixed, plate_number: plate }),
    }).catch(() => {});
    reset();
    await onChanged();
  };

  const remove = async (id: number) => {
    if (!(await customConfirm(tr('permits.confirmDeleteVehicle')))) return;
    await fetch(`${API_URL}/entry-permit-vehicles/${id}`, { method: 'DELETE' }).catch(() => {});
    await onChanged();
  };

  return (
    <>
      <div style={{ ...sectionStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1 }}>{tr('permits.sectionVehicles')}</span>
        <button onClick={() => setAdding(!adding)} style={{ ...btn('#0284c7'), padding: '2px 8px', fontSize: 10 }}>
          {adding ? tr('permits.cancel') : tr('permits.addVehicle')}
        </button>
      </div>

      {adding && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr auto', gap: 6, alignItems: 'end', marginBottom: 7, padding: 7, background: C.rowAlt, borderRadius: 6 }}>
          <div>
            <label style={labelStyle}>{tr('permits.vehicleType')}</label>
            <select value={typeId} onChange={e => setTypeId(e.target.value)} style={inputStyle}>
              <option value="">{tr('permits.noVehicleType')}</option>
              {vehicleTypes.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            {vehicleTypes.length === 0 && <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{tr('permits.vehicleTypesEmpty')}</div>}
          </div>
          <div>
            <label style={labelStyle}>{tr('permits.plateFixed')}</label>
            <select value={fixed ? '1' : '0'} onChange={e => setFixed(e.target.value === '1')} style={inputStyle}>
              <option value="1">{tr('permits.plateFixed')}</option>
              <option value="0">{tr('permits.plateNotFixed')}</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{tr('permits.plateNumber')}</label>
            {/* רכב לא קבוע אינו נושא רישוי - השדה נחסם ולא רק מתעלמים ממנו */}
            <input value={fixed ? plate : ''} disabled={!fixed} onChange={e => setPlate(e.target.value)} inputMode="numeric" style={{ ...inputStyle, opacity: fixed ? 1 : 0.5 }} />
          </div>
          <button onClick={() => void add()} style={btn('#22c55e')}>{tr('permits.add')}</button>
        </div>
      )}

      {(driver.vehicles || []).length === 0 && !adding && (
        <div style={{ fontSize: 10, color: C.muted, padding: '2px 0' }}>{tr('permits.noVehicles')}</div>
      )}
      {(driver.vehicles || []).map(v => (
        <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '3px 6px', borderBottom: `1px solid ${C.line}` }}>
          <span style={{ flex: 1 }}>{v.vehicle_type_name || tr('permits.noVehicleType')}</span>
          <span style={{ color: v.plate_fixed ? C.text : C.muted, fontFamily: v.plate_fixed ? 'monospace' : undefined }}>
            {v.plate_fixed ? (v.plate_number || tr('permits.noPlate')) : tr('permits.plateNotFixed')}
          </span>
          <button onClick={() => void remove(v.id)} title={tr('permits.delete')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>✕</button>
        </div>
      ))}
    </>
  );
};

// ── נסיעות ───────────────────────────────────────────────────────────────────

const TripsSection: React.FC<SubProps & {
  driver: PermitDriver; points: AirfieldPoint[]; trips: PermitTrip[];
  tab: 'future' | 'history'; setTab: (t: 'future' | 'history') => void;
}> = ({ driver, points, trips, tab, setTab, C, inputStyle, labelStyle, sectionStyle, btn, adding, setAdding, onChanged }) => {
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [when, setWhen] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [purpose, setPurpose] = useState('');

  const reset = () => { setFromId(''); setToId(''); setFromText(''); setToText(''); setWhen(''); setVehicleId(''); setPurpose(''); setAdding(false); };

  const add = async () => {
    await fetch(`${API_URL}/entry-permits/${driver.id}/trips`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_point_id: fromId ? Number(fromId) : null, to_point_id: toId ? Number(toId) : null,
        from_text: fromId ? '' : fromText, to_text: toId ? '' : toText,
        // datetime-local הוא שעון מקומי; ה-ISO שומר את אזור הזמן ולא מאבד אותו
        scheduled_at: when ? new Date(when).toISOString() : null,
        vehicle_id: vehicleId ? Number(vehicleId) : null, purpose,
      }),
    }).catch(() => {});
    reset();
    await onChanged();
  };

  const remove = async (id: number) => {
    if (!(await customConfirm(tr('permits.confirmDeleteTrip')))) return;
    await fetch(`${API_URL}/entry-permit-trips/${id}`, { method: 'DELETE' }).catch(() => {});
    await onChanged();
  };

  const tabBtn = (key: 'future' | 'history'): React.CSSProperties => ({
    padding: '2px 10px', fontSize: 10, borderRadius: 9, cursor: 'pointer',
    border: `1px solid ${tab === key ? '#0284c7' : C.border}`,
    background: tab === key ? '#0284c733' : 'transparent',
    color: tab === key ? C.text : C.muted,
  });

  /** נקודה מתוך רשימת השדה, ובהיעדרה הטקסט החופשי שנרשם. */
  const endpoint = (name: string | null, text: string) => name || text || '-';

  return (
    <>
      <div style={{ ...sectionStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ flex: 1 }}>{tr('permits.sectionTrips')}</span>
        <button onClick={() => setTab('future')} style={tabBtn('future')}>{tr('permits.tripsFuture')}</button>
        <button onClick={() => setTab('history')} style={tabBtn('history')}>{tr('permits.tripsHistory')}</button>
        <button onClick={() => setAdding(!adding)} style={{ ...btn('#0284c7'), padding: '2px 8px', fontSize: 10 }}>
          {adding ? tr('permits.cancel') : tr('permits.addTrip')}
        </button>
      </div>

      {adding && (
        <div style={{ padding: 7, background: C.rowAlt, borderRadius: 6, marginBottom: 7 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <div>
              <label style={labelStyle}>{tr('permits.tripFrom')}</label>
              <select value={fromId} onChange={e => setFromId(e.target.value)} style={inputStyle}>
                <option value="">{tr('permits.tripPointOther')}</option>
                {points.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {!fromId && <input value={fromText} onChange={e => setFromText(e.target.value)} style={{ ...inputStyle, marginTop: 3 }} />}
            </div>
            <div>
              <label style={labelStyle}>{tr('permits.tripTo')}</label>
              <select value={toId} onChange={e => setToId(e.target.value)} style={inputStyle}>
                <option value="">{tr('permits.tripPointOther')}</option>
                {points.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {!toId && <input value={toText} onChange={e => setToText(e.target.value)} style={{ ...inputStyle, marginTop: 3 }} />}
            </div>
            <div>
              <label style={labelStyle}>{tr('permits.tripWhen')}</label>
              <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} style={inputStyle} />
            </div>
          </div>
          {points.length === 0 && <div style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>{tr('permits.pointsEmpty')}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr auto', gap: 6, marginTop: 6, alignItems: 'end' }}>
            <div>
              <label style={labelStyle}>{tr('permits.tripVehicle')}</label>
              <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} style={inputStyle}>
                <option value="">{tr('permits.noVehicleType')}</option>
                {(driver.vehicles || []).map(v => (
                  <option key={v.id} value={v.id}>
                    {[v.vehicle_type_name, v.plate_fixed ? v.plate_number : tr('permits.plateNotFixed')].filter(Boolean).join(' · ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{tr('permits.tripPurpose')}</label>
              <input value={purpose} onChange={e => setPurpose(e.target.value)} style={inputStyle} />
            </div>
            <button onClick={() => void add()} style={btn('#22c55e')}>{tr('permits.add')}</button>
          </div>
        </div>
      )}

      {trips.length === 0 ? (
        <div style={{ fontSize: 10, color: C.muted, padding: '2px 0' }}>
          {tab === 'future' ? tr('permits.noTripsFuture') : tr('permits.noTripsHistory')}
        </div>
      ) : trips.map(t => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, padding: '3px 6px', borderBottom: `1px solid ${C.line}` }}>
          <span style={{ color: C.muted, minWidth: 96, fontSize: 10 }}>
            {t.scheduled_at ? new Date(t.scheduled_at).toLocaleString(i18n.language, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
          </span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {endpoint(t.from_point_name, t.from_text)} → {endpoint(t.to_point_name, t.to_text)}
          </span>
          {t.plate_number && <span style={{ fontFamily: 'monospace', color: C.muted, fontSize: 10 }}>{t.plate_number}</span>}
          {t.vehicle_request_id && (
            <span title={tr('permits.tripFromRequest')} style={{ fontSize: 10 }}>🚛</span>
          )}
          <button onClick={() => void remove(t.id)} title={tr('permits.delete')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>✕</button>
        </div>
      ))}
    </>
  );
};

export default VehiclePermitsWindow;
