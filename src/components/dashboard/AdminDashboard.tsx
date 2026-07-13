import { tr } from '../../i18n/tr';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { API_URL } from '../../config';
import { evaluateQuery } from '../../utils/queryBuilder';
import type { QNode } from '../../types';
import { getFormationDisplayName, computeBlockDeviation } from '../../utils/strips';

export const TransferFormModal = ({ strip, selectedIndices, onToggleIndex, onCancel, onTransferAll, onSubmit, etaMinutes, onEtaChange, receiveConditions, altViolation, altWorkstations }: {
  strip: any;
  selectedIndices: number[];
  onToggleIndex: (idx: number) => void;
  onCancel: () => void;
  onTransferAll: () => void;
  onSubmit: () => void;
  etaMinutes: number;
  onEtaChange: (val: number) => void;
  receiveConditions?: any;
  altViolation?: string;
  altWorkstations?: any[];
}) => {
  const totalCount = parseInt(strip?.numberOfFormation ?? strip?.number_of_formation ?? '1') || 1;
  const isFormation = totalCount > 1;
  const availableIndices: number[] = Array.isArray(strip?.aircraft_indices)
    ? [...(strip.aircraft_indices as number[])].sort((a, b) => a - b)
    : Array.from({ length: totalCount }, (_, i) => i + 1);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '28px 24px', minWidth: '320px', maxWidth: '440px', direction: 'rtl', color: 'white', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
        <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '4px', color: '#f1f5f9' }}>{tr('dashboard.transferToATransfer')}</div>
        <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: receiveConditions ? '12px' : '18px' }}>
          {getFormationDisplayName(strip)}
        </div>

        {/* תנאי קבלה של היעד */}
        {receiveConditions && (() => {
          const conditions: string[] = [];
          if (receiveConditions.alt_min != null && receiveConditions.alt_min !== '') conditions.push(`גובה מינ': ${receiveConditions.alt_min}`);
          if (receiveConditions.alt_max != null && receiveConditions.alt_max !== '') conditions.push(`גובה מקס': ${receiveConditions.alt_max}`);
          if (receiveConditions.parity === 'even') conditions.push('זוגי בלבד');
          else if (receiveConditions.parity === 'odd') conditions.push('אי-זוגי בלבד');
          if (conditions.length === 0) return null;
          return (
            <div style={{ marginBottom: '16px', padding: '10px 12px', background: altViolation ? 'rgba(239,68,68,0.10)' : 'rgba(16,185,129,0.08)', border: `1px solid ${altViolation ? '#ef4444' : '#10b981'}`, borderRadius: '8px', direction: 'rtl' }}>
              <div style={{ fontSize: '11px', color: altViolation ? '#fca5a5' : '#6ee7b7', fontWeight: 'bold', marginBottom: '4px' }}>
                📐 תנאי קבלה — {receiveConditions.workstationName || 'יעד'}
              </div>
              <div style={{ fontSize: '12px', color: altViolation ? '#f87171' : '#34d399' }}>{conditions.join(' • ')}</div>
              {altViolation && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#fbbf24', fontWeight: 'bold' }}>
                  ⚠️ {altViolation}
                </div>
              )}
              {altViolation && altWorkstations && altWorkstations.length > 0 && (
                <div style={{ marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>
                  💡 עמדות חלופיות לאותו סקטור: <span style={{ color: '#c4b5fd' }}>{altWorkstations.map((w: any) => w.name).join(' / ')}</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* שדה זמן — תמיד מוצג */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', color: '#60a5fa', fontWeight: 'bold', marginBottom: '8px' }}>{tr('dashboard.timeToTransferPoint')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="number"
              min={0}
              max={120}
              value={etaMinutes === 0 ? '' : etaMinutes}
              onChange={e => onEtaChange(Math.max(0, parseInt(e.target.value) || 0))}
              placeholder="0"
              autoFocus={!isFormation}
              style={{ width: '80px', padding: '8px 10px', background: '#0f172a', border: '1px solid #3b82f6', borderRadius: '6px', color: 'white', fontSize: '18px', textAlign: 'center', outline: 'none' }}
            />
            <span style={{ fontSize: '13px', color: '#64748b' }}>{tr('shared.minutes')}</span>
            {etaMinutes > 0 && <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 'bold' }}>{tr('dashboard.countdownWillBeShown')}</span>}
          </div>
        </div>

        {/* בחירת מטוסים — רק אם יש יותר מ-1 */}
        {isFormation && (
          <>
            <div style={{ width: '100%', height: '1px', background: '#334155', marginBottom: '16px' }} />
            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>
              בחר מטוסים להעברה — או לחץ "העבר הכל"
            </div>
            <div style={{ fontSize: '11px', color: '#475569', marginBottom: '12px', display: 'flex', gap: '12px', direction: 'rtl' }}>
              <span>{tr('dashboard.transferredToATransfer')}</span>
              <span>{tr('dashboard.staysInTheTable')}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
              {availableIndices.map(idx => {
                const sel = selectedIndices.includes(idx);
                return (
                  <button key={idx} onClick={() => onToggleIndex(idx)} style={{
                    width: '52px', height: '52px', borderRadius: '8px',
                    border: `2px solid ${sel ? '#3b82f6' : '#334155'}`,
                    background: sel ? '#1d4ed8' : '#0f172a',
                    color: sel ? 'white' : '#475569',
                    cursor: 'pointer', fontWeight: 'bold', fontSize: '18px',
                    transition: 'all 0.15s',
                    boxShadow: sel ? '0 0 8px rgba(59,130,246,0.5)' : 'none'
                  }}>{idx}</button>
                );
              })}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px', textAlign: 'center' }}>
              {selectedIndices.length > 0
                ? `${selectedIndices.length} מטוסים נבחרו · ${availableIndices.length - selectedIndices.length} נשארים`
                : 'לא נבחרו — "העבר הכל" יעביר את כולם'}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ background: '#334155', border: 'none', color: '#94a3b8', padding: '9px 16px', borderRadius: '7px', cursor: 'pointer', fontSize: '13px' }}>{tr('shared.cancel')}</button>
          {isFormation && (
            <button onClick={onTransferAll} style={{ background: '#475569', border: 'none', color: 'white', padding: '9px 16px', borderRadius: '7px', cursor: 'pointer', fontSize: '13px' }}>{tr('dashboard.transferAll')}</button>
          )}
          <button
            onClick={!isFormation || selectedIndices.length === 0 ? onTransferAll : onSubmit}
            style={{ background: '#1d4ed8', border: 'none', color: 'white', padding: '9px 18px', borderRadius: '7px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
          >
            {isFormation && selectedIndices.length > 0 ? `העבר (${selectedIndices.length})` : 'העבר'}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Admin Dashboard Components ---
export const DonutChart: React.FC<{ count: number; partial: number; full: number }> = ({ count, partial, full }) => {
  const r = 32; const cx = 45; const cy = 45; const size = 90;
  const circ = 2 * Math.PI * r;
  const pct = full > 0 ? Math.min(count / full, 1) : 0;
  const dash = pct * circ;
  const color = count >= full ? '#ef4444' : count >= partial ? '#f97316' : '#22c55e';
  return (
    <svg width={size} height={size} style={{ display: 'block', overflow: 'visible' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e3a5f" strokeWidth="9" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="9"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ * 0.25}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s, stroke 0.3s' }}
      />
      <text x={cx} y={cy - 5} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize="17" fontWeight="bold">{count}</text>
      <text x={cx} y={cy + 11} textAnchor="middle" dominantBaseline="middle" fill="#64748b" fontSize="9">{tr('dashboard.formation')}</text>
    </svg>
  );
};

export const AdminDashboard: React.FC<{
  groups: any[];
  presets: any[];
  lightMode: boolean;
  onClose: () => void;
  aviationBases?: any[];
  groundElements?: any[];
  groundElementTypes?: any[];
  onUpdateGroundElementStatus?: (elementId: number, status: string) => void;
  onUpdateGroundElement?: (elementId: number, fields: { name: string; category: string; status: string; note: string }) => Promise<void>;
  onCreateGroundElement?: (fields: { name: string; category: string; status: string; note: string; element_type_id?: number | null }) => Promise<void>;
}> = ({ groups, presets, lightMode, onClose, aviationBases: aviationBasesProp = [], groundElements, groundElementTypes, onUpdateGroundElementStatus, onUpdateGroundElement, onCreateGroundElement }) => {
  const [selectedGroupId, setSelectedGroupId] = useState<number>(groups[0]?.id ?? 0);
  const [allStrips, setAllStrips] = useState<any[]>([]);
  const [allBlocks, setAllBlocks] = useState<any[]>([]);
  const [thresholds, setThresholds] = useState<Record<number, { partial: number; full: number }>>({});
  const [dashCardView, setDashCardView] = useState<'loads' | 'strips' | 'charts'>('loads');
  const [cardViewByPreset, setCardViewByPreset] = useState<Record<number, 'loads'|'strips'|'charts'>>({});
  const getCardView = (pid: number): 'loads'|'strips'|'charts' => cardViewByPreset[pid] ?? 'loads';
  const setCardView = (pid: number, v: 'loads'|'strips'|'charts') => setCardViewByPreset(prev => ({ ...prev, [pid]: v }));
  const [localPresets, setLocalPresets] = useState<any[]>(presets);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [tableModes, setTableModes] = useState<any[]>([]);
  const [elemEditId, setElemEditId] = useState<number | null>(null);
  const [elemEditFields, setElemEditFields] = useState<{ name: string; category: string; status: string; note: string }>({ name: '', category: '', status: '', note: '' });
  const [showAddElem, setShowAddElem] = useState(false);
  const [addElemForm, setAddElemForm] = useState<{ name: string; category: string; status: string; note: string; element_type_id: string }>({ name: '', category: '', status: 'תקין', note: '', element_type_id: '' });
  const [addElemSaving, setAddElemSaving] = useState(false);
  const [dashForecastResolution, setDashForecastResolution] = useState<15 | 30 | 60 | 120>(60);
  const [dashForecastMetric, setDashForecastMetric] = useState<'formations' | 'aircraft'>('formations');
  const [dashForecastDay, setDashForecastDay] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const [cardForecastSettings, setCardForecastSettings] = useState<Record<number, { resolution: 15|30|60|120; metric: 'formations'|'aircraft'; day: string }>>({});
  const todayForecastStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const getCardForecast = (pid: number) => cardForecastSettings[pid] || { resolution: 60 as 15|30|60|120, metric: 'formations' as 'formations'|'aircraft', day: todayForecastStr };
  const setCardForecast = (pid: number, upd: Partial<{ resolution: 15|30|60|120; metric: 'formations'|'aircraft'; day: string }>) => setCardForecastSettings(prev => ({ ...prev, [pid]: { ...getCardForecast(pid), ...upd } }));
  const [activeCrew, setActiveCrew] = useState<Record<number, string>>({});
  const [allDashContacts, setAllDashContacts] = useState<any[]>([]);
  const [allDashSessionRoles, setAllDashSessionRoles] = useState<any[]>([]);
  const group = groups.find(g => g.id === selectedGroupId) || groups[0];
  const memberPresets = useMemo(() =>
    (group?.members || []).map((m: any) => localPresets.find((p: any) => p.id === m.preset_id)).filter(Boolean),
    [group, localPresets]
  );
  const n = memberPresets.length;
  const cols = n <= 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : n === 4 ? 2 : n <= 6 ? 3 : n <= 8 ? 4 : 3;
  const memberIds = memberPresets.map((p: any) => p.id).join(',');

  useEffect(() => {
    fetch(`${API_URL}/table-modes`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setTableModes(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch(`${API_URL}/blocks`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setAllBlocks(Array.isArray(d) ? d : []))
      .catch(() => {});
    const doFetch = () => {
      fetch(`${API_URL}/strips/global`)
        .then(r => r.ok ? r.json() : [])
        .then(d => setAllStrips(Array.isArray(d) ? d : []))
        .catch(() => {});
    };
    doFetch();
    const t = setInterval(doFetch, 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const doFetch = () => {
      fetch(`${API_URL}/workstation-contacts/all`).then(r => r.ok ? r.json() : []).then(d => setAllDashContacts(Array.isArray(d) ? d : [])).catch(() => {});
      fetch(`${API_URL}/workstation-session-roles`).then(r => r.ok ? r.json() : []).then(d => setAllDashSessionRoles(Array.isArray(d) ? d : [])).catch(() => {});
      fetch(`${API_URL}/preset-active-crew`).then(r => r.ok ? r.json() : []).then((d: any[]) => {
        const map: Record<number, string> = {};
        for (const row of d) map[Number(row.preset_id)] = row.crew_name || '';
        setActiveCrew(map);
      }).catch(() => {});
    };
    doFetch();
    const t = setInterval(doFetch, 10000);
    return () => clearInterval(t);
  }, []);

  const filterStripsForPreset = (strips: any[], preset: any): any[] => {
    const pid = Number(preset.id);
    const filterQ: QNode | null = preset.filter_query || null;
    return strips.filter(s => {
      if (s.status === 'cancelled' || s.status === 'rejected') return false;
      if (Array.isArray(s.table_preset_ids) && s.table_preset_ids.map(Number).includes(pid)) return true;
      if (filterQ) {
        try { if (evaluateQuery(s, filterQ, { presetId: pid, presetName: preset.name || preset.preset_name || null })) return true; } catch { /* ignore */ }
      }
      return false;
    });
  };

  const getCount = (preset: any): number => filterStripsForPreset(allStrips, preset).length;

  const getPartial = (preset: any) => thresholds[preset.id]?.partial ?? (preset.partial_load ?? 3);
  const getFull = (preset: any) => thresholds[preset.id]?.full ?? (preset.full_load ?? 5);

  const getPresetAlerts = (preset: any): { deviationIds: Set<string>; conflictIds: Set<string> } => {
    const strips = filterStripsForPreset(allStrips, preset);
    const pid = Number(preset.id);

    // --- Block deviation ---
    const btIds: number[] = Array.isArray(preset.block_table_ids) ? preset.block_table_ids.map(Number) : [];
    const relBlocks = allBlocks.filter((b: any) =>
      btIds.includes(Number(b.block_table_id)) ||
      (Array.isArray(b.workstations) && b.workstations.map(Number).includes(pid))
    );
    const tableIds = Array.from(new Set(relBlocks.map((b: any) => Number(b.block_table_id))));
    const effectiveBtId: number | null = tableIds.length >= 1 ? tableIds[0] as number : null;

    const deviationIds = new Set<string>();
    if (effectiveBtId !== null) {
      for (const s of strips) {
        if (computeBlockDeviation(s, allBlocks, [], effectiveBtId, pid)) {
          deviationIds.add(String(s.id));
        }
      }
    }

    // --- Altitude conflict ---
    const delta: number = preset.conflict_alt_delta ?? 500;
    const conflictIds = new Set<string>();
    if (delta > 0 && strips.length >= 2) {
      const parseAltR = (alt: string | null | undefined): { lo: number; hi: number } | null => {
        if (!alt) return null;
        const u = String(alt).trim().toUpperCase().replace(/,/g, '');
        const rangeM = u.match(/(?:FL?)?(\d+)\s*[-–]\s*(?:FL?)?(\d+)/);
        if (rangeM) {
          let lo = parseInt(rangeM[1]); let hi = parseInt(rangeM[2]);
          if (lo >= 100 && lo <= 999) lo *= 100; if (hi >= 100 && hi <= 999) hi *= 100;
          if (lo > hi) [lo, hi] = [hi, lo];
          return { lo, hi };
        }
        const m = u.match(/\d+/);
        if (!m) return null;
        const n = parseInt(m[0]);
        const ft = (n >= 100 && n <= 999) ? n * 100 : n;
        return { lo: ft, hi: ft };
      };
      for (let i = 0; i < strips.length; i++) {
        const a = strips[i];
        const rA = parseAltR(a.alt);
        if (rA == null) continue;
        for (let j = i + 1; j < strips.length; j++) {
          const b = strips[j];
          const rB = parseAltR(b.alt);
          if (rB == null) continue;
          // gap < 0: overlap; 0 <= gap < delta: close proximity — both are conflicts
          const gap = Math.max(rA.lo, rB.lo) - Math.min(rA.hi, rB.hi);
          if (gap < delta && !(rA.lo === rB.lo && rA.hi === rB.hi)) {
            conflictIds.add(String(a.id));
            conflictIds.add(String(b.id));
          }
        }
      }
    }

    return { deviationIds, conflictIds };
  };

  const saveThresholds = async (preset: any) => {
    const partial = getPartial(preset);
    const full = getFull(preset);
    setSavingId(preset.id);
    try {
      await fetch(`${API_URL}/workstation-presets/${preset.id}/thresholds`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partial_load: partial, full_load: full })
      });
      setLocalPresets(prev => prev.map(p => p.id === preset.id ? { ...p, partial_load: partial, full_load: full } : p));
      setThresholds(prev => { const nx = { ...prev }; delete nx[preset.id]; return nx; });
    } catch {}
    setSavingId(null);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 8000, background: lightMode ? 'rgba(241,245,249,0.97)' : 'rgba(0,0,0,0.92)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', direction: 'rtl', overflow: 'hidden', fontFamily: 'inherit' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px', borderBottom: `1px solid ${lightMode ? '#cbd5e1' : '#334155'}`, background: lightMode ? '#ffffff' : '#0f172a', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '17px', fontWeight: 'bold', color: lightMode ? '#0f172a' : 'white' }}>{tr('dashboard.adminDashboard')}</span>
        {groups.length > 1 && groups.map((g: any) => (
          <button key={g.id} onClick={() => setSelectedGroupId(g.id)}
            style={{ background: selectedGroupId === g.id ? '#3b82f6' : (lightMode ? '#e2e8f0' : '#334155'), color: selectedGroupId === g.id ? 'white' : (lightMode ? '#334155' : 'white'), border: 'none', borderRadius: '6px', padding: '4px 12px', fontSize: '12px', cursor: 'pointer' }}>
            {g.name}
          </button>
        ))}
        {groups.length === 1 && <span style={{ color: lightMode ? '#475569' : '#94a3b8', fontSize: '13px' }}>{group?.name}</span>}
        <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ color: lightMode ? '#475569' : '#64748b', fontSize: '12px' }}>{n} עמדות</span>
          <button onClick={onClose} style={{ background: lightMode ? '#e2e8f0' : '#334155', color: lightMode ? '#1e293b' : 'white', border: `1px solid ${lightMode ? '#cbd5e1' : '#475569'}`, borderRadius: '6px', padding: '4px 16px', fontSize: '12px', cursor: 'pointer' }}>{tr('shared.close2')}</button>
        </div>
      </div>

      {/* Body — flex row: cards grid + optional ground elements panel */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* Cards grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '14px', alignContent: n > 0 ? 'start' : 'center' }}>
        {n === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', color: lightMode ? '#475569' : '#64748b', padding: '60px', fontSize: '14px' }}>
            אין עמדות בקבוצה. הוסף עמדות בלשונית "קבוצות עבודה" בניהול.
          </div>
        )}
        {memberPresets.map((preset: any) => {
          const count = getCount(preset);
          const partial = getPartial(preset);
          const full = getFull(preset);
          const hasEdit = thresholds[preset.id] !== undefined;
          const { deviationIds, conflictIds } = getPresetAlerts(preset);
          const hasDeviation = deviationIds.size > 0;
          const hasConflict = conflictIds.size > 0;
          const level: 'none'|'partial'|'full' = count >= full ? 'full' : count >= partial ? 'partial' : 'none';
          const borderColor = hasConflict ? '#ef4444' : hasDeviation ? '#f59e0b' : level === 'full' ? '#ef4444' : level === 'partial' ? '#f97316' : '#334155';
          const partialVal = thresholds[preset.id]?.partial ?? (preset.partial_load ?? 3);
          const fullVal = thresholds[preset.id]?.full ?? (preset.full_load ?? 5);
          const cardView = getCardView(preset.id);
          const presetStrips = cardView === 'strips' ? filterStripsForPreset(allStrips, preset) : [];
          const crewName = activeCrew[Number(preset.id)] || '';
          const presetContacts = allDashContacts.filter((c: any) => Number(c.preset_id) === Number(preset.id));
          const kshpContact = presetContacts.find((c: any) => (c.mahut || '').includes('קש"פ') || (c.mahut || '').includes('קשר פנים'));
          const mefalelContact = presetContacts.find((c: any) => (c.mahut || '') === 'מפעיל');
          const achoriContact = presetContacts.find((c: any) => (c.mahut || '') === 'אחורי');
          const sessionRoles = allDashSessionRoles.find((r: any) => Number(r.preset_id) === Number(preset.id));
          const sessionKshp = sessionRoles?.kshp || '';
          const sessionMefale = sessionRoles?.mefale || '';
          const sessionAchori = sessionRoles?.achori || '';
          return (
            <div key={preset.id}
              className={level === 'full' ? 'admin-dash-card-full' : level === 'partial' ? 'admin-dash-card-partial' : ''}
              style={{ background: lightMode ? '#ffffff' : '#1e293b', border: `2px solid ${borderColor}`, borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '260px', boxShadow: lightMode ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', overflow: 'hidden' }}
            >
              {/* Card header — always visible */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                <div style={{ flexShrink: 0 }}>
                  <div style={{ fontWeight: 'bold', fontSize: '15px', color: lightMode ? '#0f172a' : 'white' }}>{preset.name}</div>
                  {(crewName || kshpContact || sessionKshp || sessionMefale || sessionAchori) && (
                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center', marginTop: '3px', flexWrap: 'wrap' }}>
                      {crewName && <span style={{ fontSize: '10px', color: lightMode ? '#2563eb' : '#60a5fa', fontWeight: 'bold' }}>👤 {crewName}</span>}
                      {(sessionKshp || kshpContact) && <span style={{ fontSize: '10px', color: lightMode ? '#059669' : '#34d399', background: lightMode ? '#f0fdf4' : 'rgba(52,211,153,0.1)', borderRadius: '4px', padding: '1px 5px' }}>📻 {sessionKshp || kshpContact?.oketz || kshpContact?.frequency || ''}</span>}
                      {(sessionMefale || mefalelContact) && <span style={{ fontSize: '10px', color: lightMode ? '#7c3aed' : '#a78bfa', background: lightMode ? '#faf5ff' : 'rgba(167,139,250,0.1)', borderRadius: '4px', padding: '1px 5px' }}>🎯 {sessionMefale || mefalelContact?.oketz || mefalelContact?.frequency || ''}</span>}
                      {(sessionAchori || achoriContact) && <span style={{ fontSize: '10px', color: lightMode ? '#d97706' : '#fbbf24', background: lightMode ? '#fffbeb' : 'rgba(251,191,36,0.1)', borderRadius: '4px', padding: '1px 5px' }}>🔁 {sessionAchori || achoriContact?.oketz || achoriContact?.frequency || ''}</span>}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                  {hasConflict && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#dc2626', color: 'white', borderRadius: '6px', padding: '2px 7px', fontSize: '11px', fontWeight: 'bold', border: '1px solid #fca5a5' }}>
                      ⚡ קונפליקט גובה
                      <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: '3px', padding: '0 4px' }}>{conflictIds.size}</span>
                    </span>
                  )}
                  {hasDeviation && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#d97706', color: 'white', borderRadius: '6px', padding: '2px 7px', fontSize: '11px', fontWeight: 'bold', border: '1px solid #fde68a' }}>
                      ⚠️ חריגת בלוק
                      <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: '3px', padding: '0 4px' }}>{deviationIds.size}</span>
                    </span>
                  )}
                  {level !== 'none' && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: level === 'full' ? '#dc2626' : '#d97706', color: 'white', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold', border: `1px solid ${level === 'full' ? '#fca5a5' : '#fde68a'}` }}>
                      {level === 'full' ? '🔴' : '🟠'}
                      {level === 'full' ? 'עומס מלא' : 'עומס חלקי'}
                      <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: '3px', padding: '0 4px' }}>{count}</span>
                    </span>
                  )}
                  <span style={{ fontSize: '11px', color: lightMode ? '#94a3b8' : '#475569', fontWeight: 'normal' }}>{count} פ"מ</span>
                </div>
              </div>

              {/* Per-card view tabs */}
              <div style={{ display: 'flex', border: `1px solid ${lightMode ? '#e2e8f0' : '#334155'}`, borderRadius: '6px', overflow: 'hidden', flexShrink: 0, alignSelf: 'flex-start' }}>
                {([
                  { v: 'loads', label: '📊 עומסים' },
                  { v: 'strips', label: '✈️ פ"מ' },
                  { v: 'charts', label: '📈 גאנט' },
                ] as { v: 'loads'|'strips'|'charts'; label: string }[]).map(({ v, label }) => (
                  <button key={v} onClick={() => setCardView(preset.id, v)}
                    style={{ padding: '3px 10px', fontSize: '11px', border: 'none', cursor: 'pointer', fontWeight: cardView === v ? 'bold' : 'normal',
                      background: cardView === v ? (lightMode ? '#1e293b' : '#1e3a5f') : 'transparent',
                      color: cardView === v ? '#fff' : (lightMode ? '#64748b' : '#94a3b8'),
                      borderLeft: v !== 'loads' ? `1px solid ${lightMode ? '#e2e8f0' : '#334155'}` : 'none' }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Fixed-height content area, 3 views ── */}
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {cardView === 'strips' ? (
                /* ── Strips view — table matching workstation table mode ── */
                (() => {
                  const activeMode = tableModes.find((tm: any) => tm.id === preset.table_mode_id);
                  const fallbackCols = [
                    { key: 'callSign', label: 'או"ק' },
                    { key: 'squadron', label: 'טייסת' },
                    { key: 'alt', label: 'גובה' },
                    { key: 'task', label: 'משימה' },
                    { key: 'koteret', label: 'כותרת' },
                    { key: 'weapons', label: 'חימושים' },
                    { key: 'notes', label: 'הערה' },
                  ];
                  const columns: any[] = (activeMode?.columns && activeMode.columns.length > 0)
                    ? activeMode.columns.filter((c: any) => !['transfer', 'shkadia', 'sector'].includes(c.key || c.field || ''))
                    : fallbackCols;

                  const renderDashCell = (s: any, col: any) => {
                    const key: string = col.key || col.field || '';
                    const weapons: any[] = Array.isArray(s.weapons) ? s.weapons : [];
                    const customFields = (s.custom_fields && typeof s.custom_fields === 'object') ? s.custom_fields : {};
                    if (col.isCustom || key.startsWith('custom_')) {
                      return <span style={{ color: lightMode ? '#334155' : '#e2e8f0' }}>{customFields[key] || '—'}</span>;
                    }
                    const _dashIsSplit = Array.isArray(s.aircraft_indices) && s.aircraft_indices.length > 0;
                    const formationName = `${s.callSign || ''}${!_dashIsSplit && s.numberOfFormation ? `/${s.numberOfFormation}` : ''}`;
                    const muted = lightMode ? '#64748b' : '#94a3b8';
                    const body = lightMode ? '#1e293b' : 'white';
                    switch (key) {
                      case 'callSign': case 'call_sign':
                        return <span style={{ fontWeight: 'bold', color: s.airborne ? (lightMode ? '#1d4ed8' : '#60a5fa') : body, whiteSpace: 'nowrap' }}>
                          {s.airborne ? <span style={{ background: lightMode ? '#dbeafe' : '#1d4ed8', borderRadius: '3px', padding: '1px 5px' }}>{formationName}</span> : formationName}
                        </span>;
                      case 'squadron': case 'sq':
                        return <span style={{ color: lightMode ? '#7c3aed' : '#a78bfa' }}>{s.sq || s.squadron || '—'}</span>;
                      case 'alt':
                        return <span style={{ color: lightMode ? '#b45309' : '#fbbf24', whiteSpace: 'nowrap' }}>{s.alt || '—'}</span>;
                      case 'task': case 'mivtza':
                        return <span style={{ color: muted }}>{s.task || s.mivtza || '—'}</span>;
                      case 'koteret':
                        return <span style={{ color: muted }}>{s.koteret || '—'}</span>;
                      case 'erka':
                        return <span style={{ color: muted }}>{s.erka || '—'}</span>;
                      case 'tzevet_shilta':
                        return <span style={{ color: muted }}>{s.tzevet_shilta || '—'}</span>;
                      case 'ta_shilta':
                        return <span style={{ color: muted }}>{s.ta_shilta || '—'}</span>;
                      case 'weapons':
                        return <span style={{ color: lightMode ? '#b45309' : '#fbbf24', fontSize: '11px' }}>
                          {weapons.length === 0 ? '—' : weapons.map((w: any, i: number) => (
                            <div key={i}>{w.type}{w.quantity ? ` ×${w.quantity}` : ''}</div>
                          ))}
                        </span>;
                      case 'notes':
                        return <span style={{ color: muted, fontSize: '11px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{s.notes || '—'}</span>;
                      case 'targets':
                        return <span style={{ color: lightMode ? '#15803d' : '#86efac', fontSize: '11px' }}>{(Array.isArray(s.targets) ? s.targets : []).map((t: any) => t.name || t).join(', ') || '—'}</span>;
                      case 'status':
                        return <span style={{ color: muted }}>{s.status || '—'}</span>;
                      default:
                        return <span style={{ color: muted }}>{s[key] || '—'}</span>;
                    }
                  };

                  return (
                    <div style={{ flex: 1, overflowY: 'auto', maxHeight: '400px' }}>
                      <div style={{ fontSize: '11px', color: lightMode ? '#475569' : '#64748b', paddingBottom: '4px', marginBottom: '4px', borderBottom: `1px solid ${lightMode ? '#e2e8f0' : '#334155'}` }}>
                        {`${presetStrips.length} פ״מ`}{activeMode ? <span style={{ marginRight: '8px', color: lightMode ? '#64748b' : '#475569' }}>| {activeMode.name}</span> : null}
                      </div>
                      {presetStrips.length === 0 ? (
                        <div style={{ textAlign: 'center', color: lightMode ? '#475569' : '#64748b', padding: '24px', fontSize: '13px' }}>{tr('dashboard.noFormationsToDisplay')}</div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', direction: 'rtl' }}>
                          <thead>
                            <tr style={{ background: lightMode ? '#f1f5f9' : '#0f172a', color: lightMode ? '#475569' : '#64748b' }}>
                              {columns.map((col: any) => (
                                <th key={col.key || col.field} style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 'normal', borderBottom: `1px solid ${lightMode ? '#e2e8f0' : '#334155'}`, whiteSpace: 'nowrap' }}>
                                  {col.label || col.key}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {presetStrips.map((s: any, idx: number) => {
                              const sid = String(s.id);
                              const isConflictRow = conflictIds.has(sid);
                              const isDeviationRow = deviationIds.has(sid);
                              const rowBg = isConflictRow
                                ? (lightMode ? '#fef2f2' : '#3b0000')
                                : isDeviationRow
                                  ? (lightMode ? '#fffbeb' : '#2d1a00')
                                  : (lightMode ? (idx % 2 === 0 ? '#ffffff' : '#f8fafc') : (idx % 2 === 0 ? '#1e293b' : '#0f172a'));
                              const rowBorder = isConflictRow ? '1px solid #ef4444' : isDeviationRow ? '1px solid #f59e0b' : `1px solid ${lightMode ? '#e2e8f0' : '#1e2d3f'}`;
                              return (
                                <tr key={s.id} data-strip-id={s.id} className={[isConflictRow ? 'alt-conflict-flash' : isDeviationRow ? 'block-deviation-flash' : ''].filter(Boolean).join(' ') || undefined} style={{ background: rowBg, borderBottom: rowBorder }}>
                                  {columns.map((col: any, ci: number) => (
                                    <td key={col.key || col.field} style={{ padding: '5px 6px' }}>
                                      {ci === 0 && (isConflictRow || isDeviationRow) && (
                                        <span style={{ marginLeft: '4px', fontSize: '10px' }}>{isConflictRow ? '⚡' : '⚠️'}</span>
                                      )}
                                      {renderDashCell(s, col)}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })()
              ) : cardView === 'charts' ? (
                /* ── Charts view — mini load forecast (per-card controls) ── */
                (() => {
                  const cf = getCardForecast(preset.id);
                  const resMin = cf.resolution;
                  const cardDay = cf.day;
                  const cardMetric = cf.metric;
                  const slotsPerDay = (24 * 60) / resMin;
                  const dayStart = new Date(cardDay + 'T00:00:00');
                  const presetSlots: { count: number }[] = Array.from({ length: slotsPerDay }, () => ({ count: 0 }));
                  const cardStrips = filterStripsForPreset(allStrips, preset);
                  for (const s of cardStrips) {
                    if (!s.takeoff_time) continue;
                    const dt = new Date(s.takeoff_time);
                    const dtDay = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
                    if (dtDay !== cardDay) continue;
                    const slotIdx = Math.floor((dt.getHours() * 60 + dt.getMinutes()) / resMin);
                    if (slotIdx >= 0 && slotIdx < slotsPerDay) {
                      presetSlots[slotIdx].count += cardMetric === 'aircraft'
                        ? (parseInt(s.numberOfFormation || s.number_of_formation || '1') || 1)
                        : 1;
                    }
                  }
                  const maxC = Math.max(...presetSlots.map(s => s.count), 1);
                  const totalC = presetSlots.reduce((sum, s) => sum + s.count, 0);
                  const now = new Date();
                  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
                  const isToday = cardDay === todayStr;
                  const nowFrac = (now.getHours() * 60 + now.getMinutes()) / (24 * 60);
                  const cW = 520;
                  const cH = 120;
                  const lp = 28;
                  const bpad = 18;
                  const innerH = cH - bpad;
                  const slotW = (cW - lp) / slotsPerDay;
                  const barW = Math.max(slotW - 0.5, 0.5);
                  const labelEvery = slotsPerDay <= 24 ? 2 : slotsPerDay <= 48 ? 4 : slotsPerDay <= 96 ? 8 : 12;
                  const changeCardDay = (delta: number) => {
                    const d = new Date(cardDay + 'T12:00:00');
                    d.setDate(d.getDate() + delta);
                    setCardForecast(preset.id, { day: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` });
                  };
                  const [, cmo, cdy] = cardDay.split('-');
                  return (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', padding: '4px 0' }}>
                      {/* Per-card controls row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', direction: 'rtl' }}>
                        {/* Day navigation */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                          <button onClick={() => changeCardDay(-1)} style={{ background: lightMode ? '#e2e8f0' : '#334155', border: 'none', borderRadius: '3px', cursor: 'pointer', padding: '1px 5px', fontSize: '12px', color: lightMode ? '#1e293b' : 'white', lineHeight: 1 }}>›</button>
                          <span style={{ fontSize: '10px', color: lightMode ? '#1e293b' : '#e2e8f0', minWidth: '38px', textAlign: 'center' }}>{isToday ? 'היום' : `${cdy}/${cmo}`}</span>
                          <button onClick={() => changeCardDay(1)} style={{ background: lightMode ? '#e2e8f0' : '#334155', border: 'none', borderRadius: '3px', cursor: 'pointer', padding: '1px 5px', fontSize: '12px', color: lightMode ? '#1e293b' : 'white', lineHeight: 1 }}>‹</button>
                        </div>
                        {/* Resolution */}
                        <div style={{ display: 'flex', border: `1px solid ${lightMode ? '#cbd5e1' : '#475569'}`, borderRadius: '4px', overflow: 'hidden' }}>
                          {([15, 30, 60, 120] as const).map(r => (
                            <button key={r} onClick={() => setCardForecast(preset.id, { resolution: r })} style={{ padding: '1px 5px', fontSize: '9px', border: 'none', cursor: 'pointer', background: resMin === r ? '#0ea5e9' : 'transparent', color: resMin === r ? 'white' : (lightMode ? '#475569' : '#94a3b8'), fontWeight: resMin === r ? 'bold' : 'normal' }}>{r < 60 ? `${r}ד'` : `${r/60}ש'`}</button>
                          ))}
                        </div>
                        {/* Metric */}
                        <div style={{ display: 'flex', border: `1px solid ${lightMode ? '#cbd5e1' : '#475569'}`, borderRadius: '4px', overflow: 'hidden' }}>
                          {(['formations', 'aircraft'] as const).map(m => (
                            <button key={m} onClick={() => setCardForecast(preset.id, { metric: m })} style={{ padding: '1px 5px', fontSize: '9px', border: 'none', cursor: 'pointer', background: cardMetric === m ? '#7c3aed' : 'transparent', color: cardMetric === m ? 'white' : (lightMode ? '#475569' : '#94a3b8'), fontWeight: cardMetric === m ? 'bold' : 'normal' }}>{m === 'formations' ? 'פמ"מ' : 'מטוס'}</button>
                          ))}
                        </div>
                        <span style={{ fontSize: '9px', color: lightMode ? '#94a3b8' : '#475569', marginRight: 'auto' }}>{totalC} {cardMetric === 'aircraft' ? 'מטוסים' : 'פממים'}</span>
                      </div>
                      <svg width="100%" viewBox={`0 0 ${cW} ${cH + 10}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible', height: `${cH + 10}px` }}>
                        {[partialVal, fullVal].map((th, ti) => {
                          const y = innerH - (innerH * th / maxC);
                          if (th > maxC) return null;
                          return <line key={ti} x1={lp} x2={cW} y1={y} y2={y} stroke={ti === 0 ? '#f59e0b' : '#ef4444'} strokeWidth={1} strokeDasharray="3,2" opacity={0.6} />;
                        })}
                        {presetSlots.map((slot, i) => {
                          const x = lp + i * slotW;
                          const barH = innerH * slot.count / maxC;
                          const y = innerH - barH;
                          const fillColor = slot.count === 0 ? (lightMode ? '#e2e8f0' : '#1e293b') : slot.count >= fullVal ? '#ef4444' : slot.count >= partialVal ? '#f59e0b' : '#22c55e';
                          return (
                            <rect key={i} x={x + 0.3} y={y} width={Math.max(barW - 0.3, 0.3)} height={Math.max(barH, slot.count > 0 ? 2 : 1)} fill={fillColor} rx={1} opacity={0.85} />
                          );
                        })}
                        {presetSlots.map((_, i) => {
                          if (i % labelEvery !== 0) return null;
                          const dt2 = new Date(dayStart.getTime() + i * resMin * 60000);
                          const label = `${dt2.getHours().toString().padStart(2,'0')}:${dt2.getMinutes().toString().padStart(2,'0')}`;
                          return <text key={i} x={lp + i * slotW + slotW / 2} y={cH + 1} textAnchor="middle" fontSize={7} fill={lightMode ? '#94a3b8' : '#475569'}>{label}</text>;
                        })}
                        <line x1={lp} x2={cW} y1={innerH} y2={innerH} stroke={lightMode ? '#94a3b8' : '#334155'} strokeWidth={1} />
                        {isToday && <line x1={lp + nowFrac * (cW - lp)} x2={lp + nowFrac * (cW - lp)} y1={0} y2={innerH} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="3,2" />}
                        <text x={lp - 2} y={4} textAnchor="end" fontSize={7} fill={lightMode ? '#94a3b8' : '#475569'}>{maxC}</text>
                      </svg>
                    </div>
                  );
                })()
              ) : (
                /* ── Loads view — donut + thresholds ── */
                <>
                  {/* Donut + threshold labels */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', justifyContent: 'center' }}>
                    <div style={{ textAlign: 'center', minWidth: '38px' }}>
                      <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#f97316', lineHeight: 1 }}>{partial}</div>
                      <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>{tr('shared.partial')}</div>
                    </div>
                    <DonutChart count={count} partial={partial} full={full} />
                    <div style={{ textAlign: 'center', minWidth: '38px' }}>
                      <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#ef4444', lineHeight: 1 }}>{full}</div>
                      <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>{tr('dashboard.load')}</div>
                    </div>
                  </div>
                  {/* Load meter bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 'bold', color: level === 'full' ? '#ef4444' : level === 'partial' ? '#f97316' : '#22c55e' }}>
                        {level === 'full' ? '🔴 עומס מלא' : level === 'partial' ? '🟠 עומס חלקי' : '⚪ תקין'}
                      </span>
                      <span style={{ fontSize: '11px', color: lightMode ? '#64748b' : '#94a3b8' }}>{count} / {full}</span>
                    </div>
                    <div style={{ height: '7px', background: lightMode ? '#e2e8f0' : '#0f172a', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                      <div style={{ height: '100%', width: `${full > 0 ? Math.min(100, (count / full) * 100) : 0}%`, background: level === 'full' ? '#ef4444' : level === 'partial' ? '#f97316' : '#22c55e', borderRadius: '4px', transition: 'width 0.4s ease, background 0.4s ease' }} />
                      {full > 0 && partial > 0 && partial < full && (
                        <div style={{ position: 'absolute', top: 0, left: `${(partial / full) * 100}%`, height: '100%', width: '2px', background: '#f97316', opacity: 0.8 }} />
                      )}
                    </div>
                  </div>
                  {/* Editable thresholds */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: lightMode ? '#f1f5f9' : '#0f172a', borderRadius: '6px', padding: '6px 10px' }}>
                    <span style={{ fontSize: '11px', color: lightMode ? '#64748b' : '#94a3b8' }}>{tr('shared.threshold')}</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: '#f97316' }}>
                      🟠
                      <input type="number" min={1} max={99} value={partialVal}
                        onChange={e => setThresholds(prev => ({ ...prev, [preset.id]: { partial: Number(e.target.value), full: prev[preset.id]?.full ?? (preset.full_load ?? 5) } }))}
                        style={{ width: '38px', background: lightMode ? '#ffffff' : '#1e293b', color: '#f97316', border: `1px solid ${lightMode ? '#cbd5e1' : '#475569'}`, borderRadius: '4px', padding: '2px 4px', fontSize: '12px', textAlign: 'center' }} />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: '#ef4444' }}>
                      🔴
                      <input type="number" min={1} max={99} value={fullVal}
                        onChange={e => setThresholds(prev => ({ ...prev, [preset.id]: { partial: prev[preset.id]?.partial ?? (preset.partial_load ?? 3), full: Number(e.target.value) } }))}
                        style={{ width: '38px', background: lightMode ? '#ffffff' : '#1e293b', color: '#ef4444', border: `1px solid ${lightMode ? '#cbd5e1' : '#475569'}`, borderRadius: '4px', padding: '2px 4px', fontSize: '12px', textAlign: 'center' }} />
                    </label>
                    {hasEdit && (
                      <button onClick={() => saveThresholds(preset)}
                        style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 10px', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {savingId === preset.id ? '...' : '✓ שמור'}
                      </button>
                    )}
                  </div>
                  {/* spacer */}
                  <div style={{ flex: 1 }} />
                  {/* bottom hint */}
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                    <span style={{ fontSize: '10px', color: lightMode ? '#94a3b8' : '#475569' }}>{tr('dashboard.switchViewUsingThe')}</span>
                  </div>
                </>
              )}
              </div>{/* end fixed-height content area */}
              {/* Contacts footer: קש"פ / מפעיל / אחורי */}
              {(kshpContact || mefalelContact || achoriContact) && (
                <div style={{ borderTop: `1px solid ${lightMode ? '#e2e8f0' : '#1e3a5f'}`, paddingTop: '5px', display: 'flex', gap: '10px', flexWrap: 'wrap', flexShrink: 0, direction: 'rtl' }}>
                  {kshpContact && (
                    <span style={{ fontSize: '10px', color: lightMode ? '#475569' : '#94a3b8' }}>
                      📻 קש"פ: <b style={{ color: lightMode ? '#0f172a' : '#e2e8f0' }}>{kshpContact.oketz || kshpContact.frequency || '—'}</b>
                    </span>
                  )}
                  {mefalelContact && (
                    <span style={{ fontSize: '10px', color: lightMode ? '#475569' : '#94a3b8' }}>
                      🎯 מפעיל: <b style={{ color: lightMode ? '#0f172a' : '#e2e8f0' }}>{mefalelContact.oketz || mefalelContact.frequency || '—'}</b>
                    </span>
                  )}
                  {achoriContact && (
                    <span style={{ fontSize: '10px', color: lightMode ? '#475569' : '#94a3b8' }}>
                      🔁 אחורי: <b style={{ color: lightMode ? '#0f172a' : '#e2e8f0' }}>{achoriContact.oketz || achoriContact.frequency || '—'}</b>
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* Ground Elements Panel — shown when groundElements are provided */}
      {groundElements !== undefined && (() => {
        const ELEM_STATUS_CYCLE = ['תקין', 'שמיש', 'חלקי', 'לא תקין', 'תקול'];
        const ELEM_STATUS_COLOR: Record<string, string> = { 'תקין': '#22c55e', 'שמיש': '#22c55e', 'לא תקין': '#ef4444', 'תקול': '#ef4444', 'חלקי': '#f97316' };
        const catMap: Record<string, any[]> = {};
        for (const el of (groundElements || [])) {
          const cat = el.category && el.category.trim() ? el.category.trim() : 'כללי';
          if (!catMap[cat]) catMap[cat] = [];
          catMap[cat].push(el);
        }
        const cats = Object.keys(catMap).sort();
        return (
          <div style={{ width: '320px', flexShrink: 0, borderRight: `2px solid ${lightMode ? '#e2e8f0' : '#334155'}`, display: 'flex', flexDirection: 'column', background: lightMode ? '#f8fafc' : '#0a0f1a' }}>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${lightMode ? '#e2e8f0' : '#334155'}`, background: lightMode ? '#f1f5f9' : '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ fontWeight: 'bold', fontSize: '13px', color: lightMode ? '#1e293b' : '#e2e8f0' }}>{tr('dashboard.airfieldElements')}</span>
              <span style={{ fontSize: '11px', color: lightMode ? '#64748b' : '#94a3b8' }}>({(groundElements || []).length})</span>
              <div style={{ marginRight: 'auto' }} />
              {onCreateGroundElement && (
                <button onClick={() => { setShowAddElem(v => !v); setAddElemForm({ name: '', category: '', status: 'תקין', note: '', element_type_id: '' }); }}
                  style={{ background: showAddElem ? '#475569' : '#2563eb', color: 'white', border: 'none', borderRadius: '5px', padding: '3px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {showAddElem ? '✕' : '+ הוסף'}
                </button>
              )}
            </div>
            {/* Add element form */}
            {showAddElem && onCreateGroundElement && (
              <div style={{ padding: '8px 10px', borderBottom: `1px solid ${lightMode ? '#e2e8f0' : '#334155'}`, background: lightMode ? '#eff6ff' : '#0f1e38', display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0 }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: lightMode ? '#1d4ed8' : '#93c5fd', marginBottom: '2px' }}>{tr('dashboard.newElement')}</div>
                <input value={addElemForm.name} onChange={e => setAddElemForm(p => ({ ...p, name: e.target.value }))} placeholder={tr('dashboard.name')}
                  style={{ padding: '4px 8px', fontSize: '12px', background: lightMode ? '#fff' : '#1e293b', border: `1px solid ${lightMode ? '#cbd5e1' : '#475569'}`, borderRadius: '4px', color: lightMode ? '#0f172a' : 'white', direction: 'rtl' }} />
                <input value={addElemForm.category} onChange={e => setAddElemForm(p => ({ ...p, category: e.target.value }))} placeholder={tr('shared.category')}
                  style={{ padding: '4px 8px', fontSize: '12px', background: lightMode ? '#fff' : '#1e293b', border: `1px solid ${lightMode ? '#cbd5e1' : '#475569'}`, borderRadius: '4px', color: lightMode ? '#0f172a' : 'white', direction: 'rtl' }} />
                <div style={{ display: 'flex', gap: '5px' }}>
                  <select value={addElemForm.status} onChange={e => setAddElemForm(p => ({ ...p, status: e.target.value }))}
                    style={{ flex: 1, padding: '4px 6px', fontSize: '11px', background: lightMode ? '#fff' : '#1e293b', border: `1px solid ${lightMode ? '#cbd5e1' : '#475569'}`, borderRadius: '4px', color: lightMode ? '#0f172a' : 'white', direction: 'rtl' }}>
                    {ELEM_STATUS_CYCLE.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {groundElementTypes && groundElementTypes.length > 0 && (
                    <select value={addElemForm.element_type_id} onChange={e => setAddElemForm(p => ({ ...p, element_type_id: e.target.value }))}
                      style={{ flex: 1, padding: '4px 6px', fontSize: '11px', background: lightMode ? '#fff' : '#1e293b', border: `1px solid ${lightMode ? '#cbd5e1' : '#475569'}`, borderRadius: '4px', color: lightMode ? '#0f172a' : 'white', direction: 'rtl' }}>
                      <option value="">{tr('dashboard.type')}</option>
                      {groundElementTypes.map((t: any) => <option key={t.id} value={String(t.id)}>{t.icon || ''} {t.name}</option>)}
                    </select>
                  )}
                </div>
                <textarea value={addElemForm.note} onChange={e => setAddElemForm(p => ({ ...p, note: e.target.value }))} placeholder={tr('shared.note')} rows={2}
                  style={{ padding: '4px 8px', fontSize: '11px', background: lightMode ? '#fff' : '#1e293b', border: `1px solid ${lightMode ? '#cbd5e1' : '#475569'}`, borderRadius: '4px', color: lightMode ? '#0f172a' : 'white', direction: 'rtl', resize: 'none' }} />
                <button disabled={!addElemForm.name.trim() || addElemSaving}
                  onClick={async () => {
                    if (!addElemForm.name.trim()) return;
                    setAddElemSaving(true);
                    await onCreateGroundElement({ name: addElemForm.name.trim(), category: addElemForm.category.trim(), status: addElemForm.status, note: addElemForm.note.trim(), element_type_id: addElemForm.element_type_id ? Number(addElemForm.element_type_id) : null });
                    setAddElemForm({ name: '', category: '', status: 'תקין', note: '', element_type_id: '' });
                    setAddElemSaving(false);
                    setShowAddElem(false);
                  }}
                  style={{ background: addElemForm.name.trim() ? '#16a34a' : '#475569', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 12px', fontSize: '12px', cursor: addElemForm.name.trim() ? 'pointer' : 'default', fontWeight: 'bold' }}>
                  {addElemSaving ? '...' : '✓ שמור אלמנט'}
                </button>
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {cats.length === 0 && (
                <div style={{ textAlign: 'center', color: lightMode ? '#94a3b8' : '#475569', fontSize: '12px', padding: '24px 8px' }}>
                  אין אלמנטים. לחץ "+ הוסף" כדי להוסיף.
                </div>
              )}
              {cats.map(cat => (
                <div key={cat}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: lightMode ? '#475569' : '#64748b', padding: '3px 4px', marginBottom: '4px', borderBottom: `1px solid ${lightMode ? '#e2e8f0' : '#1e293b'}` }}>{cat}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {catMap[cat].map((el: any) => {
                      const isEditing = elemEditId === el.id;
                      const statusColor = ELEM_STATUS_COLOR[el.status] || '#94a3b8';
                      const nextStatus = ELEM_STATUS_CYCLE[(ELEM_STATUS_CYCLE.indexOf(el.status) + 1) % ELEM_STATUS_CYCLE.length] || 'תקין';
                      return (
                        <div key={el.id} style={{ background: lightMode ? '#fff' : '#1e293b', border: `1px solid ${lightMode ? '#e2e8f0' : '#334155'}`, borderRadius: '6px', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: el.type_color || '#f59e0b', border: `2px solid ${statusColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', flexShrink: 0 }}>{el.type_icon || (el.category === 'camera' ? '📷' : '🔧')}</div>
                            {isEditing ? (
                              <input value={elemEditFields.name}
                                onChange={e => setElemEditFields(p => ({ ...p, name: e.target.value }))}
                                style={{ flex: 1, padding: '2px 6px', fontSize: '12px', background: lightMode ? '#f1f5f9' : '#0f172a', border: '1px solid #3b82f6', borderRadius: '4px', color: lightMode ? '#0f172a' : 'white', direction: 'rtl' }} />
                            ) : (
                              <span style={{ flex: 1, fontSize: '12px', fontWeight: 'bold', color: lightMode ? '#1e293b' : '#e2e8f0' }}>{el.name}</span>
                            )}
                            <button onClick={() => onUpdateGroundElementStatus && onUpdateGroundElementStatus(el.id, nextStatus)}
                              title={`→ ${nextStatus}`}
                              style={{ padding: '2px 7px', borderRadius: '3px', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold', background: lightMode ? '#e2e8f0' : '#0f172a', color: statusColor, flexShrink: 0, whiteSpace: 'nowrap' }}>
                              {el.status || '?'}
                            </button>
                            <button onClick={() => {
                              if (isEditing) { setElemEditId(null); } else {
                                setElemEditId(el.id);
                                setElemEditFields({ name: el.name || '', category: el.category || '', status: el.status || 'תקין', note: el.note || '' });
                              }
                            }}
                              style={{ background: isEditing ? (lightMode ? '#e2e8f0' : '#334155') : 'transparent', border: `1px solid ${lightMode ? '#cbd5e1' : '#475569'}`, borderRadius: '4px', cursor: 'pointer', fontSize: '10px', padding: '1px 5px', color: lightMode ? '#64748b' : '#94a3b8', flexShrink: 0 }}>
                              {isEditing ? '✕' : '✏️'}
                            </button>
                          </div>
                          {isEditing && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '4px', borderTop: `1px solid ${lightMode ? '#e2e8f0' : '#334155'}` }}>
                              <input value={elemEditFields.category}
                                onChange={e => setElemEditFields(p => ({ ...p, category: e.target.value }))}
                                placeholder={tr('shared.category')}
                                style={{ padding: '2px 6px', fontSize: '11px', background: lightMode ? '#f1f5f9' : '#0f172a', border: `1px solid ${lightMode ? '#cbd5e1' : '#475569'}`, borderRadius: '4px', color: lightMode ? '#0f172a' : 'white', direction: 'rtl' }} />
                              <select value={elemEditFields.status}
                                onChange={e => setElemEditFields(p => ({ ...p, status: e.target.value }))}
                                style={{ padding: '2px 6px', fontSize: '11px', background: lightMode ? '#f1f5f9' : '#0f172a', border: `1px solid ${lightMode ? '#cbd5e1' : '#475569'}`, borderRadius: '4px', color: lightMode ? '#0f172a' : 'white', direction: 'rtl' }}>
                                {ELEM_STATUS_CYCLE.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                              <textarea value={elemEditFields.note}
                                onChange={e => setElemEditFields(p => ({ ...p, note: e.target.value }))}
                                placeholder={tr('shared.note')}
                                rows={2}
                                style={{ padding: '2px 6px', fontSize: '11px', background: lightMode ? '#f1f5f9' : '#0f172a', border: `1px solid ${lightMode ? '#cbd5e1' : '#475569'}`, borderRadius: '4px', color: lightMode ? '#0f172a' : 'white', direction: 'rtl', resize: 'none' }} />
                              <button onClick={async () => { if (onUpdateGroundElement) { await onUpdateGroundElement(el.id, elemEditFields); } setElemEditId(null); }}
                                style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                                ✓ שמור
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      </div>
    </div>
  );
};

// --- דשבורד עמדה ---
