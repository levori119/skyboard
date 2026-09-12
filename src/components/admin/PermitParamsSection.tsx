// פרמטרים של ניהול נהגים ונסיעות - סעיף בטאב "שדות תעופה" בניהול.
//
// חמש רשימות קצרות שמזינות את חלונות "ניהול נהגים" ו"ניהול נסיעות" בעמדה:
//   אזורי אישור כניסה · תפקידי הסעה · סוגי רכב · סוגי נסיעה · סוגי אישור הסתובבות
//
// הן חיות בטבלה אחת עם `kind` (אותו דפוס כמו units) ולכן גם במסך אחד: חמש
// טבלאות זהות היו חמישה עורכים שמתפצלים בהתנהגות.
//
// **אזור אישור יכול להצביע על פוליגון במפת השדה** - אז ההרשאה מדברת על שטח
// אמיתי ולא רק על שם, ואפשר בהמשך לצבוע את המפה לפי מי מורשה בה.

import React, { useEffect, useState } from 'react';
import { tr } from '../../i18n/tr';

type ParamKind = 'zone' | 'transport_role' | 'vehicle_type' | 'trip_type' | 'roam_permit';

export interface PermitParamRow {
  id: number;
  kind: ParamKind;
  name: string;
  polygon_id: number | null;
  polygon_name?: string | null;
  color: string;
  active: boolean;
  sort_order: number;
}

interface PolygonOption { id: number; name: string }

/** הסדר כאן = סדר ההצגה במסך: קודם ההרשאה, אחריה מי נוסע, במה, ולבסוף לשם מה. */
const KINDS: { kind: ParamKind; labelKey: string; accent: string }[] = [
  { kind: 'zone', labelKey: 'permits.paramZones', accent: '#38bdf8' },
  { kind: 'transport_role', labelKey: 'permits.paramTransportRoles', accent: '#a78bfa' },
  { kind: 'vehicle_type', labelKey: 'permits.paramVehicleTypes', accent: '#fbbf24' },
  { kind: 'trip_type', labelKey: 'permits.paramTripTypes', accent: '#34d399' },
  { kind: 'roam_permit', labelKey: 'permits.paramRoamPermits', accent: '#f472b6' },
];

const EMPTY_FORM = { name: '', polygon_id: '', color: '#3b82f6', active: true };

export interface PermitParamsSectionProps {
  apiUrl: string;
  airfieldId: number | null;
  /** פוליגוני השדה - לקישור אזור אישור לשטח על המפה */
  polygons: PolygonOption[];
  expanded: boolean;
  onToggle: () => void;
  confirmDelete: (msg: string) => Promise<boolean>;
}

export const PermitParamsSection: React.FC<PermitParamsSectionProps> = ({
  apiUrl, airfieldId, polygons, expanded, onToggle, confirmDelete,
}) => {
  const [rows, setRows] = useState<PermitParamRow[]>([]);
  const [openKind, setOpenKind] = useState<ParamKind | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = React.useCallback(async () => {
    if (!airfieldId) { setRows([]); return; }
    try {
      const r = await fetch(`${apiUrl}/permit-params?airfield_id=${airfieldId}`);
      setRows(r.ok ? await r.json() : []);
    } catch { setRows([]); }
  }, [apiUrl, airfieldId]);

  useEffect(() => { if (expanded) void load(); }, [expanded, load]);

  const startAdd = (kind: ParamKind) => { setOpenKind(kind); setEditingId(null); setForm(EMPTY_FORM); };
  const startEdit = (row: PermitParamRow) => {
    setOpenKind(row.kind); setEditingId(row.id);
    setForm({ name: row.name, polygon_id: row.polygon_id ? String(row.polygon_id) : '', color: row.color || '#3b82f6', active: row.active });
  };
  const closeForm = () => { setOpenKind(null); setEditingId(null); setForm(EMPTY_FORM); };

  const save = async (kind: ParamKind) => {
    if (!form.name.trim() || !airfieldId) return;
    const body = {
      airfield_id: airfieldId, kind, name: form.name.trim(),
      polygon_id: kind === 'zone' && form.polygon_id ? Number(form.polygon_id) : null,
      color: form.color, active: form.active,
    };
    const res = editingId
      ? await fetch(`${apiUrl}/permit-params/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch(`${apiUrl}/permit-params`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) { closeForm(); void load(); }
  };

  const remove = async (row: PermitParamRow) => {
    if (!(await confirmDelete(tr('permits.confirmDeleteParam')))) return;
    await fetch(`${apiUrl}/permit-params/${row.id}`, { method: 'DELETE' }).catch(() => {});
    void load();
  };

  const inputStyle: React.CSSProperties = {
    padding: '5px 8px', background: '#1e293b', border: '1px solid #475569',
    borderRadius: 5, color: 'white', fontSize: 12, boxSizing: 'border-box',
  };

  return (
    <div style={{ borderTop: '1px solid #334155', paddingTop: 10 }}>
      <div
        onClick={onToggle}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: expanded ? 6 : 0, cursor: 'pointer' }}
      >
        <div style={{ color: '#38bdf8', fontSize: 11, fontWeight: 'bold', flex: 1 }}>{tr('permits.adminSection')}</div>
        <span style={{ color: expanded ? '#38bdf8' : '#475569', fontSize: 11, marginInlineStart: 4 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (!airfieldId ? (
        <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', padding: 6 }}>{tr('permits.paramSelectAirfield')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {KINDS.map(({ kind, labelKey, accent }) => {
            const list = rows.filter(r => r.kind === kind);
            const formOpen = openKind === kind;
            return (
              <div key={kind}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ color: accent, fontSize: 10, fontWeight: 'bold', flex: 1 }}>{tr(labelKey)}</span>
                  <button
                    onClick={() => (formOpen && !editingId ? closeForm() : startAdd(kind))}
                    style={{ padding: '1px 8px', background: formOpen && !editingId ? '#334155' : '#0e7490', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 'bold' }}
                  >{formOpen && !editingId ? tr('permits.cancel') : tr('permits.add')}</button>
                </div>

                {formOpen && (
                  <div style={{ background: '#0f172a', border: `1px solid ${accent}55`, borderRadius: 6, padding: 7, marginBottom: 5, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <input
                      value={form.name}
                      onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                      placeholder={tr('permits.paramName')}
                      style={inputStyle}
                    />
                    {/* קישור למפה רלוונטי לאזור בלבד - לתפקיד הסעה ולסוג רכב אין שטח */}
                    {kind === 'zone' && (
                      <select value={form.polygon_id} onChange={e => setForm(p => ({ ...p, polygon_id: e.target.value }))} style={inputStyle}>
                        <option value="">{tr('permits.paramNoPolygon')}</option>
                        {polygons.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="color" value={form.color}
                        onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                        style={{ width: 32, height: 24, border: 'none', background: 'transparent', cursor: 'pointer' }}
                      />
                      <label style={{ fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input type="checkbox" checked={form.active} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} />
                        {tr('permits.paramActive')}
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button onClick={() => void save(kind)} style={{ flex: 1, padding: 4, background: '#0e7490', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 'bold' }}>{tr('permits.save')}</button>
                      <button onClick={closeForm} style={{ padding: '4px 10px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>{tr('permits.cancel')}</button>
                    </div>
                  </div>
                )}

                {list.length === 0 ? (
                  <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: 4 }}>{tr('permits.paramEmpty')}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {list.map(row => (
                      <div
                        key={row.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0f172a', borderRadius: 4, padding: '3px 7px', border: `1px solid ${row.color}44`, opacity: row.active ? 1 : 0.5 }}
                      >
                        <span style={{ width: 11, height: 11, borderRadius: 3, background: row.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, color: '#e2e8f0', fontSize: 11 }}>{row.name}</span>
                        {row.polygon_name && <span style={{ fontSize: 9, color: '#64748b' }}>🗺 {row.polygon_name}</span>}
                        {!row.active && <span style={{ fontSize: 9, color: '#64748b' }}>{tr('permits.paramInactive')}</span>}
                        <button onClick={() => startEdit(row)} title={tr('permits.paramName')}
                          style={{ padding: '1px 6px', background: '#1e3a5f', color: '#93c5fd', border: '1px solid #3b82f6', borderRadius: 3, cursor: 'pointer', fontSize: 9 }}>✏️</button>
                        <button onClick={() => void remove(row)} title={tr('permits.delete')}
                          style={{ padding: '1px 6px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 9 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default PermitParamsSection;
