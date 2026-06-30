import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { API_URL } from '../../config';
import { VKTrigger } from '../../VirtualKeyboard';
import { getFormationDisplayName, getTransferLabel, getTransferSq, normalizeAlt } from '../../utils/strips';
import { parseNoteValue, serializeNoteValue } from '../../utils/notes';
import ContextMenu from '../shared/ContextMenu';
import OnScreenKeyboard from '../shared/OnScreenKeyboard';
import HandwritingOverlay from '../shared/HandwritingOverlay';
import { OutgoingTransferCard, IncomingTransferCard, CompactTransferRow } from './TransferCards';

export const DraggableNeighborPanel = ({ 
  neighbor, 
  subSectors,
  onDropOnMap,
  isExpanded,
  onToggle,
  outgoingTransfers,
  incomingTransfers,
  onCancelTransfer,
  onAcceptTransfer,
  onRejectTransfer,
  onAcceptToMap,
  dragStripId,
  onStripDrop,
  conflictAltDelta,
  crossSectorConflictIds,
  onUpdateStripField,
  mapZoom,
  mapPan,
  lightMode = false,
  tableMode = false,
  presetId,
  onUpdateNote,
  transferPointConfig,
  onUpdateTransferPointConfig,
  allPresets = [],
}: { 
  neighbor: any; 
  subSectors: any[];
  onDropOnMap: (sectorId: number, x: number, y: number, subSectorLabel?: string, clientX?: number, clientY?: number) => void;
  isExpanded: boolean;
  onToggle: () => void;
  outgoingTransfers: any[];
  incomingTransfers: any[];
  onCancelTransfer: (id: string) => void;
  onAcceptTransfer: (id: string) => void;
  onRejectTransfer: (id: string) => void;
  onAcceptToMap: (id: string, x: number, y: number) => void;
  dragStripId?: string | null;
  onStripDrop?: (stripId: string, sectorId: number) => void;
  conflictAltDelta?: number;
  crossSectorConflictIds?: Set<string>;
  onUpdateStripField?: (stripId: string, field: string, value: string) => void;
  mapZoom?: number;
  mapPan?: { x: number; y: number };
  lightMode?: boolean;
  tableMode?: boolean;
  presetId?: number | string | null;
  onUpdateNote?: (transferId: string, note: string) => void;
  transferPointConfig?: { alt_min?: number | null; alt_max?: number | null; parity?: string; partner_preset_ids?: number[]; ranges?: { preset_id?: number | null; label?: string; alt_min?: number | null; alt_max?: number | null; parity?: string }[] } | null;
  onUpdateTransferPointConfig?: (sectorId: number, ranges: { preset_id: number | null; alt_min: number | null; alt_max: number | null; parity: string }[]) => Promise<void>;
  allPresets?: { id: number; name: string }[];
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isStripDragOver, setIsStripDragOver] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [neighborContactsOpen, setNeighborContactsOpen] = useState(false);
  const [neighborContactsCache, setNeighborContactsCache] = useState<any[] | null>(null);
  const [outCollapsed, setOutCollapsed] = useState(false);
  const [inCollapsed, setInCollapsed] = useState(false);
  const [showAltEdit, setShowAltEdit] = useState(false);
  const [altEditRanges, setAltEditRanges] = useState<{ preset_id: string; alt_min: string; alt_max: string; parity: string }[]>([]);
  const [altSaving, setAltSaving] = useState(false);
  const [partnerRangesCache, setPartnerRangesCache] = useState<{ preset_id: number; preset_name: string; ranges: any[] }[]>([]);

  const getNeighborContacts = () => {
    if (!neighborContactsCache) return [];
    const myPresetName = neighborContactsCache.find((c: any) => Number(c.preset_id) === Number(presetId))?.preset_name || '';
    const byPreset = new Map<number, { presetName: string; contacts: any[] }>();
    for (const c of neighborContactsCache) {
      if (Number(c.preset_id) === Number(presetId)) continue;
      if (myPresetName && (c.preset_name || '') === myPresetName) continue;
      let sectors: number[] = [];
      try { sectors = Array.isArray(c.relevant_sectors) ? c.relevant_sectors : (typeof c.relevant_sectors === 'string' ? JSON.parse(c.relevant_sectors) : []); } catch {}
      if (!sectors.map(Number).includes(Number(neighbor.id))) continue;
      if (!byPreset.has(c.preset_id)) byPreset.set(c.preset_id, { presetName: c.preset_name || `עמדה ${c.preset_id}`, contacts: [] });
      byPreset.get(c.preset_id)!.contacts.push(c);
    }
    return Array.from(byPreset.entries()).map(([pid, v]) => ({ presetId: pid, ...v }));
  };
  const toggleNeighborContacts = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (neighborContactsOpen) { setNeighborContactsOpen(false); return; }
    if (!neighborContactsCache) {
      const data = await fetch('/api/workstation-contacts/all').then(r => r.ok ? r.json() : []).catch(() => []);
      setNeighborContactsCache(data);
    }
    setNeighborContactsOpen(true);
  };

  useEffect(() => {
    const partnerIds: number[] = Array.isArray(transferPointConfig?.partner_preset_ids) ? (transferPointConfig!.partner_preset_ids as number[]) : [];
    if (!partnerIds.length) { setPartnerRangesCache([]); return; }
    fetch(`${API_URL}/workstation-presets/partner-alt-ranges?sector_id=${neighbor.id}&preset_ids=${partnerIds.join(',')}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setPartnerRangesCache(data))
      .catch(() => setPartnerRangesCache([]));
  }, [neighbor.id, JSON.stringify(transferPointConfig?.partner_preset_ids)]);

  const sectorOutgoing = outgoingTransfers.filter(t => Number(t.to_sector_id) === Number(neighbor.id));
  const sectorIncoming = incomingTransfers.filter(t => Number(t.to_sector_id) === Number(neighbor.id));

  const parseAlt = (alt: string | null | undefined): number | null => {
    if (!alt) return null;
    const m = alt.match(/\d+/);
    return m ? parseInt(m[0]) : null;
  };

  // delta is stored directly in feet; altitudes are in hundreds → multiply diff by 100 for comparison
  const delta = (neighbor as any).conflict_alt_delta ?? conflictAltDelta ?? 0;
  const conflictingTransferIds = new Set<string>();
  if (delta > 0) {
    // Compare outgoing × incoming (cross-direction); skip if same transfer appears in both
    for (const out of sectorOutgoing) {
      const outAlt = parseAlt(out.alt);
      if (outAlt == null) continue;
      for (const inc of sectorIncoming) {
        if (String(inc.id) === String(out.id)) continue; // same record in both arrays → skip
        const incAlt = parseAlt(inc.alt);
        if (incAlt == null) continue;
        if (Math.abs(outAlt - incAlt) * 100 <= delta) {
          conflictingTransferIds.add(String(out.id));
          conflictingTransferIds.add(String(inc.id));
        }
      }
    }
    // Compare outgoing × outgoing (same-direction — two strips going to same sector at similar altitude)
    // Skip if they go via DIFFERENT sub-sector transfer points (different corridors, no shared airspace)
    for (let i = 0; i < sectorOutgoing.length; i++) {
      const altA = parseAlt(sectorOutgoing[i].alt);
      if (altA == null) continue;
      for (let j = i + 1; j < sectorOutgoing.length; j++) {
        const lblI = sectorOutgoing[i].sub_sector_label || '';
        const lblJ = sectorOutgoing[j].sub_sector_label || '';
        if (lblI && lblJ && lblI !== lblJ) continue; // different transfer points → skip
        const altB = parseAlt(sectorOutgoing[j].alt);
        if (altB == null) continue;
        if (Math.abs(altA - altB) * 100 <= delta) {
          conflictingTransferIds.add(String(sectorOutgoing[i].id));
          conflictingTransferIds.add(String(sectorOutgoing[j].id));
        }
      }
    }
    // Compare incoming × incoming (same-direction)
    // Skip if they arrive via DIFFERENT sub-sector transfer points
    for (let i = 0; i < sectorIncoming.length; i++) {
      const altA = parseAlt(sectorIncoming[i].alt);
      if (altA == null) continue;
      for (let j = i + 1; j < sectorIncoming.length; j++) {
        const lblI = sectorIncoming[i].sub_sector_label || '';
        const lblJ = sectorIncoming[j].sub_sector_label || '';
        if (lblI && lblJ && lblI !== lblJ) continue; // different transfer points → skip
        const altB = parseAlt(sectorIncoming[j].alt);
        if (altB == null) continue;
        if (Math.abs(altA - altB) * 100 <= delta) {
          conflictingTransferIds.add(String(sectorIncoming[i].id));
          conflictingTransferIds.add(String(sectorIncoming[j].id));
        }
      }
    }
  }
  // Merge explicit conflicts from parent if any
  if (crossSectorConflictIds) {
    const sectorTransferIds = new Set([...sectorOutgoing, ...sectorIncoming].map(t => String(t.id)));
    crossSectorConflictIds.forEach(id => {
      if (sectorTransferIds.has(id)) conflictingTransferIds.add(id);
    });
  }
  const hasConflict = conflictingTransferIds.size > 0;

  const altViolationOutgoingIds = new Set<string>();
  const altViolationIncomingIds = new Set<string>();
  {
    const cfg = transferPointConfig as any;
    const myRanges: { alt_min: number | null; alt_max: number | null }[] = Array.isArray(cfg?.ranges) && cfg.ranges.length ? cfg.ranges : (cfg?.alt_min != null || cfg?.alt_max != null ? [{ alt_min: cfg?.alt_min ?? null, alt_max: cfg?.alt_max ?? null }] : []);
    const partnerRanges: { alt_min: number | null; alt_max: number | null }[] = partnerRangesCache.flatMap(pr => pr.ranges);
    const makeCheck = (ranges: { alt_min: number | null; alt_max: number | null }[]) => (altStr: string | null | undefined) => {
      if (!ranges.length || !altStr) return false;
      const m = altStr.match(/\d+/);
      if (!m) return false;
      const a = parseInt(m[0]);
      return !ranges.some(r => (r.alt_min == null || a >= r.alt_min) && (r.alt_max == null || a <= r.alt_max));
    };
    const checkOut = makeCheck(partnerRanges);
    const checkInc = makeCheck(myRanges);
    sectorOutgoing.forEach(t => { if (checkOut(t.alt)) altViolationOutgoingIds.add(String(t.id)); });
    sectorIncoming.forEach(t => { if (checkInc(t.alt)) altViolationIncomingIds.add(String(t.id)); });
  }
  const hasMyRanges = Array.isArray((transferPointConfig as any)?.ranges) && (transferPointConfig as any).ranges.length > 0;

  const handlePointerDown = (e: React.PointerEvent, subLabel?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragPos({ x: e.clientX - 50, y: e.clientY - 20 });
    setDragLabel(subLabel || null);
  };

  useEffect(() => {
    if (!isDragging) return;

    let lastClientX = 0;
    let lastClientY = 0;

    const handleMove = (e: PointerEvent) => {
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      setDragPos({ x: e.clientX - 50, y: e.clientY - 20 });
    };

    const dropAt = (clientX: number, clientY: number) => {
      setIsDragging(false);
      const mapArea = document.getElementById('map-area');
      if (mapArea) {
        const rect = mapArea.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top && clientY <= rect.bottom) {
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const z = mapZoom || 1;
          const px = mapPan?.x ?? 0;
          const py = mapPan?.y ?? 0;
          const rawX = (clientX - cx - px) / z + rect.width / 2;
          const rawY = (clientY - cy - py) / z + rect.height / 2;
          const x = Math.max(100, Math.min(rect.width - 100, rawX));
          const y = Math.max(40, Math.min(rect.height - 50, rawY));
          onDropOnMap(neighbor.id, x, y, dragLabel || undefined, clientX, clientY);
        }
      }
      setDragLabel(null);
    };

    const handleUp = (e: PointerEvent) => dropAt(e.clientX, e.clientY);
    const handleCancel = () => dropAt(lastClientX, lastClientY);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, [isDragging, neighbor.id, onDropOnMap, dragLabel, mapZoom, mapPan]);

  const neighborSubSectors = subSectors.filter(ss => ss.neighbor_id === neighbor.id);
  const hasSubSectors = neighborSubSectors.length > 0;
  const hasTransfers = sectorOutgoing.length > 0 || sectorIncoming.length > 0;

  return (
    <>
      {/* Card container */}
      <div
        onDragOver={e => { e.preventDefault(); setIsStripDragOver(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsStripDragOver(false); }}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); setIsStripDragOver(false); const sid = dragStripId || e.dataTransfer.getData('text/strip-id-for-transfer') || (() => { try { const d = JSON.parse(e.dataTransfer.getData('text/plain')); return d.stripId ? String(d.stripId) : null; } catch { return null; } })(); if (sid && onStripDrop) onStripDrop(String(sid), neighbor.id); }}
        style={{
        margin: '6px 6px',
        borderRadius: '10px',
        border: isStripDragOver ? '2px solid #22c55e' : (hasConflict ? '2px solid #ef4444' : (lightMode ? '1px solid #cbd5e1' : '1px solid #2d4060')),
        background: isStripDragOver ? (lightMode ? '#f0fdf4' : '#0a2218') : (dragStripId ? (lightMode ? '#eff6ff' : '#0e1e2e') : (lightMode ? '#f8fafc' : '#0f1923')),
        overflow: 'hidden',
        boxShadow: lightMode ? '0 2px 8px rgba(0,0,0,0.12)' : '0 2px 10px rgba(0,0,0,0.5)',
        transition: 'border-color 0.15s, background 0.15s',
      }}>

        {/* Header — drag zone */}
        <div
          className="neighbor-drop-zone"
          data-sector-id={neighbor.id}
          onPointerDown={(e) => { if (dragStripId) { e.preventDefault(); e.stopPropagation(); } else if (!tableMode) { handlePointerDown(e); } }}
          onPointerEnter={() => { if (dragStripId) setIsStripDragOver(true); }}
          onPointerLeave={() => { if (dragStripId) setIsStripDragOver(false); }}
          onDragOver={(e => { e.preventDefault(); e.stopPropagation(); setIsStripDragOver(true); })}
          onDragLeave={(() => setIsStripDragOver(false))}
          onDrop={(e => { e.preventDefault(); e.stopPropagation(); setIsStripDragOver(false); const sid = dragStripId || e.dataTransfer.getData('text/strip-id-for-transfer') || (() => { try { const d = JSON.parse(e.dataTransfer.getData('text/plain')); return d.stripId ? String(d.stripId) : null; } catch { return null; } })(); if (sid && onStripDrop) onStripDrop(String(sid), neighbor.id); })}
          style={{
            padding: '7px 10px',
            background: lightMode ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '6px',
            cursor: dragStripId ? 'copy' : tableMode ? 'default' : 'grab',
            userSelect: 'none',
            direction: 'rtl',
            borderBottom: `1px solid ${lightMode ? '#e2e8f0' : '#1e2d3d'}`,
          }}
        >
          {/* Sector name — center */}
          <div style={{ flex: 1, textAlign: 'center', direction: 'rtl', userSelect: 'none' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: lightMode ? '#1e293b' : '#e2e8f0', letterSpacing: '0.01em', lineHeight: 1.4 }}>
              {neighbor.label_he || neighbor.name}
            </div>
            {neighbor.notes && (
              <div style={{ fontSize: '9px', color: lightMode ? '#92400e' : '#fbbf24', fontStyle: 'italic', marginTop: '1px' }}>{neighbor.notes}</div>
            )}
            {(() => {
              const cfg = transferPointConfig as any;
              const myRanges: any[] = Array.isArray(cfg?.ranges) && cfg.ranges.length ? cfg.ranges : (cfg?.alt_min != null || cfg?.alt_max != null ? [{ alt_min: cfg?.alt_min, alt_max: cfg?.alt_max, parity: cfg?.parity }] : []);
              const totalPartner = partnerRangesCache.length;
              if (!myRanges.length && !totalPartner) return null;
              return (
                <div style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', gap: '2px', marginTop: '3px' }}>
                  {myRanges.length > 0 && (
                    <span style={{ fontSize: '9px', background: lightMode ? '#fef9c3' : '#292524', color: lightMode ? '#92400e' : '#fbbf24', border: `1px solid ${lightMode ? '#fde68a' : '#78350f'}`, borderRadius: '4px', padding: '0px 4px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      📐 {myRanges.length > 1 ? `${myRanges.length} טווחים` : `${myRanges[0]?.alt_min ?? '—'}–${myRanges[0]?.alt_max ?? '—'}`}
                    </span>
                  )}
                  {totalPartner > 0 && (
                    <span style={{ fontSize: '9px', background: lightMode ? '#eff6ff' : '#172554', color: lightMode ? '#1d4ed8' : '#93c5fd', border: `1px solid ${lightMode ? '#bfdbfe' : '#1e3a8a'}`, borderRadius: '4px', padding: '0px 4px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      {partnerRangesCache.map(pr => (pr.preset_name || '').split(' ').slice(-1)[0] || pr.preset_name).join('/')}
                    </span>
                  )}
                </div>
              );
            })()}
            {hasConflict && (
              <span style={{ fontSize: '10px', background: lightMode ? '#fee2e2' : '#450a0a', color: lightMode ? '#b91c1c' : '#fca5a5', borderRadius: '4px', padding: '1px 5px', fontWeight: 'bold', display: 'inline-block', marginTop: '2px' }}>⚠ קונפליקט גובה</span>
            )}
          </div>

          {/* Alt edit button — only when onUpdateTransferPointConfig is provided */}
          {onUpdateTransferPointConfig && (
            <button
              onClick={e => {
                e.stopPropagation();
                if (!showAltEdit) {
                  const cfg = transferPointConfig as any;
                  const init = Array.isArray(cfg?.ranges) && cfg.ranges.length
                    ? cfg.ranges.map((r: any) => ({ preset_id: r.preset_id != null ? String(r.preset_id) : '', alt_min: r.alt_min != null ? String(r.alt_min) : '', alt_max: r.alt_max != null ? String(r.alt_max) : '', parity: r.parity || 'any' }))
                    : (cfg?.alt_min != null || cfg?.alt_max != null)
                      ? [{ preset_id: '', alt_min: cfg?.alt_min != null ? String(cfg.alt_min) : '', alt_max: cfg?.alt_max != null ? String(cfg.alt_max) : '', parity: cfg?.parity || 'any' }]
                      : [{ preset_id: '', alt_min: '', alt_max: '', parity: 'any' }];
                  setAltEditRanges(init);
                }
                setShowAltEdit(v => !v);
              }}
              onPointerDown={e => e.stopPropagation()}
              title="הגדר תנאי גובה/זוגיות לנקודה זו"
              style={{
                padding: '3px 7px',
                fontSize: '11px',
                background: showAltEdit ? '#422006' : hasMyRanges ? '#292524' : '#0f172a',
                color: showAltEdit ? '#fb923c' : hasMyRanges ? '#fbbf24' : '#475569',
                border: `1px solid ${showAltEdit ? '#92400e' : hasMyRanges ? '#78350f' : '#1e293b'}`,
                borderRadius: '6px',
                cursor: 'pointer',
                flexShrink: 0,
                lineHeight: 1.5,
                transition: 'all 0.15s',
              }}>
              📐
            </button>
          )}

          {/* קשר button */}
          <button
            onClick={toggleNeighborContacts}
            onPointerDown={e => e.stopPropagation()}
            title="הצג קשרי עמדות לנקודה זו"
            style={{
              padding: '3px 9px',
              fontSize: '11px',
              fontWeight: 'bold',
              background: neighborContactsOpen ? '#0c3547' : '#0a1e2e',
              color: neighborContactsOpen ? '#67e8f9' : '#38bdf8',
              border: `1px solid ${neighborContactsOpen ? '#0e7490' : '#1e4a6a'}`,
              borderRadius: '6px',
              cursor: 'pointer',
              flexShrink: 0,
              lineHeight: 1.5,
              transition: 'all 0.15s',
            }}>
            קשר
          </button>

          {/* Sub-sector toggle (only if sub-sectors exist) */}
          {hasSubSectors && (
            <span
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              style={{ fontSize: '11px', color: '#64748b', cursor: 'pointer', flexShrink: 0, padding: '2px 4px' }}
            >{isExpanded ? '▲' : '▼'}</span>
          )}
        </div>

        {/* Inline alt/parity editor */}
        {showAltEdit && onUpdateTransferPointConfig && (
          <div style={{ padding: '5px 8px', background: lightMode ? '#fef9c3' : '#1c1008', borderBottom: `1px solid ${lightMode ? '#fde68a' : '#92400e'}`, direction: 'rtl' }}
            onPointerDown={e => e.stopPropagation()}>
            {altEditRanges.map((row, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '3px' }}>
                <select value={row.preset_id} onChange={e => setAltEditRanges(rs => rs.map((r, j) => j === i ? { ...r, preset_id: e.target.value } : r))}
                  style={{ width: '80px', padding: '2px 2px', background: lightMode ? 'white' : '#0f172a', border: `1px solid ${lightMode ? '#fde68a' : '#78350f'}`, borderRadius: '3px', color: lightMode ? '#1e293b' : '#fbbf24', fontSize: '10px', minWidth: 0 }}>
                  <option value="">-- עמדה --</option>
                  {allPresets.filter(p =>
                    String(p.id) !== String(presetId) &&
                    Array.isArray(transferPointConfig?.partner_preset_ids) &&
                    (transferPointConfig!.partner_preset_ids as number[]).map(String).includes(String(p.id)) &&
                    !altEditRanges.some((r2, j) => j !== i && String(r2.preset_id) === String(p.id))
                  ).map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                </select>
                <input type="number" placeholder="מינ'" value={row.alt_min} onChange={e => setAltEditRanges(rs => rs.map((r, j) => j === i ? { ...r, alt_min: e.target.value } : r))}
                  style={{ width: '42px', padding: '2px 2px', background: lightMode ? 'white' : '#0f172a', border: `1px solid ${lightMode ? '#fde68a' : '#78350f'}`, borderRadius: '3px', color: lightMode ? '#1e293b' : '#fbbf24', fontSize: '10px', textAlign: 'center', minWidth: 0 }} />
                <span style={{ fontSize: '9px', color: '#64748b', flexShrink: 0 }}>–</span>
                <input type="number" placeholder="מקס'" value={row.alt_max} onChange={e => setAltEditRanges(rs => rs.map((r, j) => j === i ? { ...r, alt_max: e.target.value } : r))}
                  style={{ width: '42px', padding: '2px 2px', background: lightMode ? 'white' : '#0f172a', border: `1px solid ${lightMode ? '#fde68a' : '#78350f'}`, borderRadius: '3px', color: lightMode ? '#1e293b' : '#fbbf24', fontSize: '10px', textAlign: 'center', minWidth: 0 }} />
                <select value={row.parity} onChange={e => setAltEditRanges(rs => rs.map((r, j) => j === i ? { ...r, parity: e.target.value } : r))}
                  style={{ padding: '2px 1px', background: lightMode ? 'white' : '#0f172a', border: `1px solid ${lightMode ? '#fde68a' : '#78350f'}`, borderRadius: '3px', color: lightMode ? '#1e293b' : '#fbbf24', fontSize: '10px', width: '52px', minWidth: 0 }}>
                  <option value="any">כולם</option>
                  <option value="even">זוגי</option>
                  <option value="odd">אי-זוגי</option>
                </select>
                <button onClick={e => { e.stopPropagation(); setAltEditRanges(rs => rs.filter((_, j) => j !== i)); }}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px', padding: '0', lineHeight: 1, flexShrink: 0 }}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <button onClick={e => { e.stopPropagation(); setAltEditRanges(rs => [...rs, { preset_id: '', alt_min: '', alt_max: '', parity: 'any' }]); }}
                style={{ padding: '2px 7px', background: 'transparent', color: lightMode ? '#78350f' : '#fbbf24', border: `1px solid ${lightMode ? '#fde68a' : '#78350f'}`, borderRadius: '3px', fontSize: '10px', cursor: 'pointer', flexShrink: 0 }}>➕</button>
              <button disabled={altSaving} onClick={async e => {
                e.stopPropagation();
                setAltSaving(true);
                const finalRanges = altEditRanges.map(r => ({ preset_id: r.preset_id !== '' ? Number(r.preset_id) : null, alt_min: r.alt_min !== '' ? Number(r.alt_min) : null, alt_max: r.alt_max !== '' ? Number(r.alt_max) : null, parity: r.parity }));
                await onUpdateTransferPointConfig(Number(neighbor.id), finalRanges);
                setAltSaving(false);
                setShowAltEdit(false);
              }} style={{ padding: '2px 8px', background: altSaving ? '#374151' : '#16a34a', color: 'white', border: 'none', borderRadius: '3px', fontSize: '10px', cursor: altSaving ? 'default' : 'pointer', flexShrink: 0 }}>
                {altSaving ? '...' : '✓ שמור'}
              </button>
              <button onClick={e => { e.stopPropagation(); setShowAltEdit(false); }}
                style={{ padding: '2px 6px', background: 'transparent', color: '#64748b', border: '1px solid #334155', borderRadius: '3px', fontSize: '10px', cursor: 'pointer', flexShrink: 0 }}>ביטול</button>
            </div>
          </div>
        )}

        {/* Sub-sectors (collapsible) */}
        {isExpanded && hasSubSectors && neighborSubSectors.map(ss => (
          <div
            key={ss.id}
            onPointerDown={(e) => { if (!tableMode) handlePointerDown(e, ss.label); }}
            style={{ padding: '5px 12px', fontSize: '11px', color: lightMode ? '#64748b' : '#94a3b8', borderBottom: `1px solid ${lightMode ? '#e2e8f0' : '#1e2d3d'}`, cursor: tableMode ? 'default' : 'grab', userSelect: 'none', direction: 'rtl', background: lightMode ? '#f1f5f9' : '#080f18' }}
          >
            ↳ {ss.label}
          </div>
        ))}

        {/* נקודת העברה — רשימה אחת ממוינת לפי גובה (סטגרינג): ימין=מוסר · שמאל=מקבל · קונפליקט=אדום באותה שורה */}
        <div style={{ padding: '4px 5px', direction: 'rtl' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', fontWeight: 'bold', padding: '0 2px 3px', opacity: 0.85 }}>
            <span style={{ color: lightMode ? '#92400e' : '#f59e0b' }}>🔥 מוסר ({sectorOutgoing.length})</span>
            <span style={{ color: lightMode ? '#15803d' : '#22c55e' }}>({sectorIncoming.length}) מקבל 📥</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minHeight: '24px' }}>
            {(() => {
              const combined: { t: any; dir: 'out' | 'in' }[] = [
                ...sectorOutgoing.map((t: any) => ({ t, dir: 'out' as const })),
                ...sectorIncoming.map((t: any) => ({ t, dir: 'in' as const })),
              ];
              if (combined.length === 0) return <div style={{ textAlign: 'center', color: lightMode ? '#94a3b8' : '#334155', fontSize: '10px', padding: '6px' }}>אין העברות</div>;
              combined.sort((a, b) => { const aa = parseAlt(a.t.alt), ba = parseAlt(b.t.alt); if (aa == null && ba == null) return 0; if (aa == null) return 1; if (ba == null) return -1; return ba - aa; });
              // קיבוץ פ"מים בגובה קרוב (בתוך delta) לאותה שורה = קונפליקט
              const rows: { alt: number | null; items: { t: any; dir: 'out' | 'in' }[] }[] = [];
              for (const it of combined) {
                const last = rows[rows.length - 1];
                const alt = parseAlt(it.t.alt);
                if (last && last.alt != null && alt != null && Math.abs(last.alt - alt) * 100 <= (delta || 0)) last.items.push(it);
                else rows.push({ alt, items: [it] });
              }
              const renderCard = (t: any, dir: 'out' | 'in', conflict: boolean) => {
                const isOut = dir === 'out';
                const violation = isOut ? altViolationOutgoingIds.has(String(t.id)) : altViolationIncomingIds.has(String(t.id));
                return (
                  <CompactTransferRow key={t.id} t={t} dir={dir}
                    isConflict={conflict || conflictingTransferIds.has(String(t.id))}
                    isAltViolation={violation}
                    onUpdateStripField={onUpdateStripField}
                    onAction={isOut ? onCancelTransfer : onAcceptTransfer}
                    lightMode={lightMode} shrunk={conflict} />
                );
              };
              return rows.map((row, ri) => {
                const conflict = row.items.length > 1;
                if (!conflict) {
                  const { t, dir } = row.items[0];
                  const isOut = dir === 'out';
                  return (
                    <div key={ri} style={{ display: 'flex', direction: 'rtl' }}>
                      <div style={{ width: '66%', marginInlineStart: isOut ? 'auto' : 0, marginInlineEnd: !isOut ? 'auto' : 0 }}>
                        {renderCard(t, dir, false)}
                      </div>
                    </div>
                  );
                }
                const outs = row.items.filter(i => i.dir === 'out');
                const ins = row.items.filter(i => i.dir === 'in');
                // קונפליקט בין שני כיוונים מנוגדים (מוסר↔מקבל) — זה לצד זה (ימין מוסר · שמאל מקבל)
                if (outs.length > 0 && ins.length > 0) {
                  return (
                    <div key={ri} style={{ display: 'flex', direction: 'rtl', gap: '3px', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {outs.map(({ t }) => renderCard(t, 'out', true))}
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {ins.map(({ t }) => renderCard(t, 'in', true))}
                      </div>
                    </div>
                  );
                }
                // קונפליקט באותו כיוון (שני מוסרים או שני מקבלים) — זה מתחת לזה, מיושר לצד שלו
                const sameOut = outs.length > 0;
                const items = sameOut ? outs : ins;
                return (
                  <div key={ri} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {items.map(({ t }) => (
                      <div key={t.id} style={{ width: '66%', marginInlineStart: sameOut ? 'auto' : 0, marginInlineEnd: sameOut ? 0 : 'auto' }}>
                        {renderCard(t, sameOut ? 'out' : 'in', true)}
                      </div>
                    ))}
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Contacts panel */}
        {neighborContactsOpen && neighborContactsCache !== null && (() => {
          const groups = getNeighborContacts();
          return (
            <div style={{ borderTop: `1px solid ${lightMode ? '#e2e8f0' : '#1e3a5f'}`, background: lightMode ? '#f8fafc' : '#060f1e', padding: '6px 8px', fontSize: '11px', direction: 'rtl', borderRadius: '0 0 10px 10px' }}>
              {groups.length === 0 ? (
                <div style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '4px 0' }}>אין קשרים מוגדרים לסקטור זה</div>
              ) : groups.map(g => (
                <div key={g.presetId} style={{ marginBottom: '6px' }}>
                  <div style={{ fontWeight: 'bold', color: lightMode ? '#0369a1' : '#7dd3fc', fontSize: '10px', marginBottom: '3px', paddingBottom: '2px', borderBottom: `1px solid ${lightMode ? '#e2e8f0' : '#1e3a5f'}` }}>📍 {g.presetName}</div>
                  {g.contacts.map((c: any) => (
                    <div key={c.id} style={{ display: 'flex', gap: '5px', padding: '2px 4px', borderRadius: '3px', background: lightMode ? '#f1f5f9' : '#0a1e35', marginBottom: '2px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {c.device_type && <span style={{ color: lightMode ? '#b45309' : '#f59e0b', fontWeight: 'bold', fontSize: '9px', minWidth: '24px', flexShrink: 0 }}>{c.device_type}</span>}
                      {c.mahut && <span style={{ color: lightMode ? '#475569' : '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '10px' }}>{c.mahut}</span>}
                      {c.oketz && <span style={{ color: lightMode ? '#2563eb' : '#60a5fa', fontWeight: 'bold', fontSize: '10px', flexShrink: 0 }}>{c.oketz}</span>}
                      {c.frequency && <span style={{ color: lightMode ? '#16a34a' : '#22c55e', fontFamily: 'monospace', fontSize: '10px', flexShrink: 0 }}>{c.frequency}</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {isDragging && createPortal(
        <div style={{
          position: 'fixed',
          left: dragPos.x,
          top: dragPos.y,
          background: '#2563eb',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 'bold',
          boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
          zIndex: 9999,
          pointerEvents: 'none',
          direction: 'rtl'
        }}>
          {dragLabel ? `${neighbor.label_he || neighbor.name} - ${dragLabel}` : (neighbor.label_he || neighbor.name)}
          <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.8 }}>שחרר על המפה</div>
        </div>,
        document.body
      )}
    </>
  );
};

// Mini version of incoming transfer for sector panel
export const DraggableIncomingTransferMini = ({
  transfer,
  onAccept,
  onReject,
  onAcceptToMap,
  isConflict = false,
  isAltViolation = false,
  onUpdateStripField,
  zoom = 1,
  pan,
  presetId,
  onUpdateNote,
}: {
  transfer: any;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onAcceptToMap: (id: string, x: number, y: number) => void;
  isConflict?: boolean;
  isAltViolation?: boolean;
  onUpdateStripField?: (stripId: string, field: string, value: string) => void;
  zoom?: number;
  pan?: { x: number; y: number };
  presetId?: number | string | null;
  onUpdateNote?: (transferId: string, note: string) => void;
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [editingAlt, setEditingAlt] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [editBuffer, setEditBuffer] = useState('');
  const altRef = useRef<HTMLSpanElement>(null);
  const hasExternalNote = !!transfer.note && String(transfer.note_by_preset_id) !== String(presetId);
  const openNote = () => { setEditBuffer(transfer.note || ''); setNoteOpen(true); };
  const [etaCountdown, setEtaCountdown] = useState<string | null>(null);
  const [etaOver, setEtaOver] = useState(false);
  useEffect(() => {
    if (!transfer.eta_minutes || !transfer.eta_set_at) { setEtaCountdown(null); return; }
    const update = () => {
      const end = new Date(transfer.eta_set_at).getTime() + Number(transfer.eta_minutes) * 60000;
      const rem = end - Date.now();
      if (rem <= 0) { setEtaCountdown('00:00'); setEtaOver(true); return; }
      setEtaOver(false);
      const m = Math.floor(rem / 60000);
      const s = Math.floor((rem % 60000) / 1000);
      setEtaCountdown(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [transfer.eta_minutes, transfer.eta_set_at]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragPos({ x: e.clientX - 40, y: e.clientY - 20 });
  };

  useEffect(() => {
    if (!isDragging) return;

    let lastClientX = 0;
    let lastClientY = 0;

    const handleMove = (e: PointerEvent) => {
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      setDragPos({ x: e.clientX - 40, y: e.clientY - 20 });
    };

    const screenToMapCoords = (clientX: number, clientY: number, rect: DOMRect) => {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const z = zoom || 1;
      const px = pan?.x ?? 0;
      const py = pan?.y ?? 0;
      const rawX = (clientX - cx - px) / z + rect.width / 2;
      const rawY = (clientY - cy - py) / z + rect.height / 2;
      return { rawX, rawY };
    };

    const dropAt = (clientX: number, clientY: number) => {
      setIsDragging(false);
      const sidebarArea = document.getElementById('sidebar-area');
      if (sidebarArea) {
        const sidebarRect = sidebarArea.getBoundingClientRect();
        if (clientX >= sidebarRect.left && clientX <= sidebarRect.right &&
            clientY >= sidebarRect.top && clientY <= sidebarRect.bottom) {
          onAccept(transfer.id);
          return;
        }
      }
      const mapArea = document.getElementById('map-area');
      if (mapArea) {
        const rect = mapArea.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top && clientY <= rect.bottom) {
          const { rawX, rawY } = screenToMapCoords(clientX, clientY, rect);
          const x = Math.max(100, Math.min(rect.width - 100, rawX));
          const y = Math.max(40, Math.min(rect.height - 50, rawY));
          onAcceptToMap(transfer.id, x, y);
        }
      }
    };

    const handleUp = (e: PointerEvent) => dropAt(e.clientX, e.clientY);
    const handleCancel = () => dropAt(lastClientX, lastClientY);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, [isDragging, transfer.id, onAcceptToMap, zoom, pan]);

  return (
    <>
      <div 
        onPointerDown={handlePointerDown}
        style={{ 
          background: isConflict ? '#450a0a' : isAltViolation ? '#1c0800' : '#dcfce7',
          border: isConflict ? '2px solid #ef4444' : isAltViolation ? '1px solid #f97316' : '1px solid #22c55e',
          borderRadius: '4px',
          padding: '5px',
          marginBottom: '4px',
          fontSize: '9px',
          cursor: 'grab',
          direction: 'rtl'
        }}
      >
        {/* שורה 1: 💬 | callsign | sq */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginBottom: '2px' }}>
          {onUpdateNote && (
            <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); noteOpen ? setNoteOpen(false) : openNote(); }} title={noteOpen ? 'סגור הערה' : 'כתוב/ערוך הערה'}
              style={{ background: noteOpen ? '#14532d' : 'transparent', border: `1px solid ${noteOpen ? '#22c55e' : 'transparent'}`, borderRadius: '3px', cursor: 'pointer', fontSize: '10px', color: transfer.note ? '#22c55e' : '#475569', padding: '1px 2px', lineHeight: 1, flexShrink: 0 }}>💬</button>
          )}
          {hasExternalNote && <span title="הערה מעמדה אחרת" style={{ fontSize: '10px', lineHeight: 1, flexShrink: 0 }}>📢</span>}
          <div style={{ flex: 1, fontWeight: 'bold', color: isConflict ? '#fca5a5' : '#166534', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px', minWidth: 0 }}>
            {getTransferLabel(transfer)}
          </div>
          {getTransferSq(transfer) && <span style={{ fontSize: '9px', color: isConflict ? '#fca5a5' : '#15803d', flexShrink: 0, opacity: 0.9 }}>{getTransferSq(transfer)}</span>}
        </div>
        {/* שורה 2: alt + ספירה לאחור */}
        <div style={{ display: 'flex', gap: '3px', marginBottom: '2px', alignItems: 'center' }}>
          <span
            ref={altRef}
            title={onUpdateStripField ? 'לחץ לעדכון גובה' : undefined}
            onPointerDown={e => { if (onUpdateStripField) { e.stopPropagation(); if (altRef.current) setAnchorRect(altRef.current.getBoundingClientRect()); setEditingAlt(true); } }}
            style={{ flex: 1, display: 'block', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: isConflict ? '#fca5a5' : isAltViolation ? '#fb923c' : '#166534', background: isConflict ? '#7f1d1d' : isAltViolation ? '#431407' : '#bbf7d0', padding: '1px 4px', borderRadius: '4px', cursor: onUpdateStripField ? 'pointer' : 'default', letterSpacing: '0.5px', border: onUpdateStripField ? `1px dashed ${isConflict ? '#ef4444' : isAltViolation ? '#f97316' : '#22c55e'}` : 'none' }}
          >
            {isConflict && <span style={{ marginInlineEnd: '3px' }}>⚠</span>}{isAltViolation && !isConflict && <span style={{ marginInlineEnd: '2px' }}>📐</span>}{transfer.alt ? normalizeAlt(transfer.alt) : '—'}
          </span>
          {etaCountdown !== null && (
            <span title="זמן עד להגעה" style={{ fontSize: '9px', fontWeight: 'bold', color: etaOver ? '#ef4444' : '#15803d', background: etaOver ? '#450a0a' : '#bbf7d0', border: `1px solid ${etaOver ? '#dc2626' : '#22c55e'}`, borderRadius: '3px', padding: '1px 3px', flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              ⏱{etaCountdown}
            </span>
          )}
        </div>
        {transfer.note && !noteOpen && (
          <div style={{ fontSize: '9px', color: hasExternalNote ? '#fca5a5' : '#6ee7b7', background: hasExternalNote ? '#2d0505' : '#052e16', borderRadius: '3px', padding: '2px 5px', marginBottom: '3px', whiteSpace: 'pre-wrap', lineHeight: 1.4, border: `1px solid ${hasExternalNote ? '#7f1d1d' : '#166534'}`, direction: 'rtl' }}>
            {transfer.note}
          </div>
        )}
        {noteOpen && (
          <div style={{ marginBottom: '3px' }} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
            <textarea
              value={editBuffer}
              onChange={e => setEditBuffer(e.target.value)}
              rows={3}
              style={{ width: '100%', background: '#052e16', color: '#dcfce7', border: '1px solid #22c55e', borderRadius: '3px', fontSize: '10px', padding: '3px 4px', resize: 'none', direction: 'rtl', boxSizing: 'border-box', outline: 'none' }}
              placeholder="כתוב הערה..."
              autoFocus
            />
            <div style={{ display: 'flex', gap: '3px', marginTop: '2px' }}>
              <button onClick={e => { e.stopPropagation(); if (onUpdateNote) onUpdateNote(String(transfer.id), editBuffer); setNoteOpen(false); }}
                style={{ flex: 1, fontSize: '9px', padding: '2px', background: '#166534', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontWeight: 'bold' }}>שמור</button>
              <button onClick={e => { e.stopPropagation(); setNoteOpen(false); }}
                style={{ flex: 1, fontSize: '9px', padding: '2px', background: '#374151', color: '#94a3b8', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>ביטול</button>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: '2px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onAccept(transfer.id); }}
            style={{
              flex: 1,
              padding: '2px',
              background: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              fontSize: '8px',
              cursor: 'pointer'
            }}
          >
            קבל
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onReject(transfer.id); }}
            style={{
              flex: 1,
              padding: '2px',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              fontSize: '8px',
              cursor: 'pointer'
            }}
          >
            דחה
          </button>
        </div>
      </div>
      
      {isDragging && createPortal(
        <div style={{
          position: 'fixed',
          left: dragPos.x,
          top: dragPos.y,
          background: '#22c55e',
          color: 'white',
          padding: '8px 16px',
          borderRadius: '8px',
          fontSize: '12px',
          fontWeight: 'bold',
          boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
          zIndex: 9999,
          pointerEvents: 'none',
          direction: 'rtl'
        }}>
          {getFormationDisplayName(transfer)}
          <div style={{ fontSize: '9px', opacity: 0.8 }}>גרור למפה או לפ"מ פעילים</div>
        </div>,
        document.body
      )}
      {editingAlt && (
        <HandwritingOverlay
          onCancel={() => setEditingAlt(false)}
          onComplete={(val: string) => { const n = normalizeAlt(val); setEditingAlt(false); if (onUpdateStripField) onUpdateStripField(String(transfer.strip_id), 'alt', n); }}
          anchorRect={anchorRect}
        />
      )}
    </>
  );
};

// ContextMenu imported from ./components/shared/ContextMenu

// --- Draggable Map Marker component ---
export const DraggableMapMarker = ({ 
  marker, 
  onMove, 
  onRemove, 
  onRename,
  strips,
  onTransfer,
  outgoingTransfers,
  incomingTransfers,
  onCancelTransfer,
  onAcceptTransfer,
  onRejectTransfer,
  onAcceptToMap,
  notes,
  onUpdateNotes,
  zoom = 1,
  pan,
  conflictAltDelta = 0,
  crossSectorConflictIds,
  onUpdateStripField,
  lightMode = false,
  onSendMessage,
  onReplyToTransfer,
  sharedPresets,
  onBroadcastNote,
  onDirectReplyToTransfer,
  getMapEl,
}: {
  marker: { sectorId: number; x: number; y: number; subLabel?: string; label: string };
  getMapEl?: () => HTMLElement | null;
  onMove: (x: number, y: number) => void;
  onRemove: () => void;
  onRename: (newLabel: string) => void;
  strips: any[];
  onTransfer: (stripId: string, sectorId: number, x: number, y: number, subLabel?: string) => void;
  outgoingTransfers: any[];
  incomingTransfers: any[];
  onCancelTransfer: (transferId: string) => void;
  onAcceptTransfer: (transferId: string) => void;
  onRejectTransfer: (transferId: string) => void;
  onAcceptToMap: (transferId: string, x: number, y: number) => void;
  notes?: string;
  onUpdateNotes?: (sectorId: number, notes: string) => void;
  zoom?: number;
  pan?: { x: number; y: number };
  conflictAltDelta?: number;
  crossSectorConflictIds?: Set<string>;
  onUpdateStripField?: (stripId: string, field: string, value: string) => void;
  lightMode?: boolean;
  onSendMessage?: (sectorId: number, subLabel?: string) => void;
  onReplyToTransfer?: (transfer: any) => void;
  sharedPresets?: { id: number; name: string }[];
  onBroadcastNote?: (toPresetId: number, toPresetName: string, noteText: string) => void;
  onDirectReplyToTransfer?: (transfer: any, text: string) => void;
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: marker.x, y: marker.y });
  const [showMenu, setShowMenu] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [tempName, setTempName] = useState(marker.subLabel || '');
  const [tempNotes, setTempNotes] = useState(notes || '');
  const [editingAltId, setEditingAltId] = useState<string | null>(null);
  const [editingAltVal, setEditingAltVal] = useState('');
  const [editingAltAnchor, setEditingAltAnchor] = useState<DOMRect | null>(null);
  const [isTransferMode, setIsTransferMode] = useState(false);
  const [showBroadcastList, setShowBroadcastList] = useState(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const dragStartClientRef = useRef({ x: 0, y: 0 });

  // Sync tempNotes when notes prop changes
  useEffect(() => {
    setTempNotes(notes || '');
  }, [notes]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    e.preventDefault();
    e.stopPropagation();
    dragStartClientRef.current = { x: e.clientX, y: e.clientY };
    startPosRef.current = { x: e.clientX - marker.x, y: e.clientY - marker.y };
    setDragPos({ x: marker.x, y: marker.y });
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const lastPos = { x: marker.x, y: marker.y };
    let hasDragged = false;

    const screenToMap = (clientX: number, clientY: number, rect: DOMRect) => {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const px = (pan?.x ?? 0);
      const py = (pan?.y ?? 0);
      const z = zoom || 1;
      const rawX = (clientX - cx - px) / z + rect.width / 2;
      const rawY = (clientY - cy - py) / z + rect.height / 2;
      return { rawX, rawY };
    };

    const handleMoveEvent = (e: PointerEvent) => {
      const dx = e.clientX - dragStartClientRef.current.x;
      const dy = e.clientY - dragStartClientRef.current.y;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) hasDragged = true;
      const mapArea = (getMapEl?.() ?? document.getElementById('map-area'));
      if (mapArea) {
        const rect = mapArea.getBoundingClientRect();
        const { rawX, rawY } = screenToMap(e.clientX, e.clientY, rect);
        lastPos.x = rawX;
        lastPos.y = rawY;
        setDragPos({ x: rawX, y: rawY });
      }
    };

    const drop = (clientX: number, clientY: number) => {
      setIsDragging(false);
      const mapArea = (getMapEl?.() ?? document.getElementById('map-area'));
      if (mapArea) {
        const rect = mapArea.getBoundingClientRect();
        const { rawX, rawY } = screenToMap(clientX, clientY, rect);
        const x = Math.max(100, Math.min(rect.width - 100, rawX));
        const y = Math.max(40, Math.min(rect.height - 50, rawY));
        onMove(x, y);
      }
    };

    const handleUp = (e: PointerEvent) => {
      if (!hasDragged) {
        // Tap on header → toggle transfer mode + open notes
        setIsDragging(false);
        setIsTransferMode(v => !v);
        setEditingNotes(true);
        window.removeEventListener('pointermove', handleMoveEvent);
        window.removeEventListener('pointerup', handleUp);
        window.removeEventListener('pointercancel', handleCancel);
        return;
      }
      drop(e.clientX, e.clientY);
    };
    const handleCancel = () => {
      setIsDragging(false);
      if (!hasDragged) return;
      const mapArea = (getMapEl?.() ?? document.getElementById('map-area'));
      if (mapArea) {
        const rect = mapArea.getBoundingClientRect();
        const x = Math.max(100, Math.min(rect.width - 100, lastPos.x));
        const y = Math.max(40, Math.min(rect.height - 50, lastPos.y));
        onMove(x, y);
      }
    };

    window.addEventListener('pointermove', handleMoveEvent);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMoveEvent);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, [isDragging, onMove]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setTempName(marker.subLabel || marker.label);
    setEditingName(true);
  };

  const handleSaveName = () => {
    onRename(tempName);
    setEditingName(false);
  };

  const availableStrips = strips.filter((s: any) => !s.onMap && s.status !== 'pending_transfer');
  
  // Filter outgoing transfers for this marker (outgoing: to_sector_id = neighbor sector)
  const markerOutgoing = (outgoingTransfers || []).filter((t: any) => 
    Number(t.to_sector_id) === Number(marker.sectorId) && 
    (marker.subLabel ? t.sub_sector_label === marker.subLabel : !t.sub_sector_label)
  );
  
  // Filter incoming transfers for this marker (incoming: from_sector_id = neighbor sector)
  const markerIncoming = (incomingTransfers || []).filter((t: any) => 
    Number(t.from_sector_id) === Number(marker.sectorId) && 
    (marker.subLabel ? t.sub_sector_label === marker.subLabel : !t.sub_sector_label)
  );
  
  const hasTransfers = markerOutgoing.length > 0 || markerIncoming.length > 0;

  // Altitude conflict detection
  const parseAlt = (alt: string | null | undefined): number | null => {
    if (!alt) return null;
    const m = alt.match(/\d+/);
    return m ? parseInt(m[0]) : null;
  };
  const markerConflictIds = new Set<string>();
  // conflictAltDelta is in feet; altitudes are in hundreds → multiply diff by 100
  if (conflictAltDelta > 0) {
    // Compare outgoing × incoming (cross-direction); skip if same transfer appears in both
    for (const out of markerOutgoing) {
      const outAlt = parseAlt(out.alt);
      if (outAlt == null) continue;
      for (const inc of markerIncoming) {
        if (String(inc.id) === String(out.id)) continue; // same record in both arrays → skip
        const incAlt = parseAlt(inc.alt);
        if (incAlt == null) continue;
        if (Math.abs(outAlt - incAlt) * 100 <= conflictAltDelta) {
          markerConflictIds.add(String(out.id));
          markerConflictIds.add(String(inc.id));
        }
      }
    }
    // Compare outgoing × outgoing (same-direction — two strips going to same marker at similar altitude)
    for (let i = 0; i < markerOutgoing.length; i++) {
      const altA = parseAlt(markerOutgoing[i].alt);
      if (altA == null) continue;
      for (let j = i + 1; j < markerOutgoing.length; j++) {
        const altB = parseAlt(markerOutgoing[j].alt);
        if (altB == null) continue;
        if (Math.abs(altA - altB) * 100 <= conflictAltDelta) {
          markerConflictIds.add(String(markerOutgoing[i].id));
          markerConflictIds.add(String(markerOutgoing[j].id));
        }
      }
    }
    // Compare incoming × incoming (same-direction)
    for (let i = 0; i < markerIncoming.length; i++) {
      const altA = parseAlt(markerIncoming[i].alt);
      if (altA == null) continue;
      for (let j = i + 1; j < markerIncoming.length; j++) {
        const altB = parseAlt(markerIncoming[j].alt);
        if (altB == null) continue;
        if (Math.abs(altA - altB) * 100 <= conflictAltDelta) {
          markerConflictIds.add(String(markerIncoming[i].id));
          markerConflictIds.add(String(markerIncoming[j].id));
        }
      }
    }
  }
  // Merge explicit conflicts from parent if any
  if (crossSectorConflictIds) {
    const markerTransferIds = new Set([...markerOutgoing, ...markerIncoming].map((t: any) => String(t.id)));
    crossSectorConflictIds.forEach(id => {
      if (markerTransferIds.has(id)) markerConflictIds.add(id);
    });
  }
  const markerHasConflict = markerConflictIds.size > 0;

  return (
    <div
      className="marker-drop-zone"
      data-marker-sector={marker.sectorId}
      data-marker-sublabel={marker.subLabel || ''}
      style={{
        position: 'absolute',
        left: (isDragging ? dragPos.x : marker.x) - 100,
        top: (isDragging ? dragPos.y : marker.y) - 40,
        width: '200px',
        background: '#3b82f6',
        borderRadius: '8px',
        boxShadow: markerHasConflict ? '0 0 0 2px #ef4444, 0 4px 12px rgba(0,0,0,0.4)' : '0 4px 12px rgba(0,0,0,0.3)',
        zIndex: 50,
        userSelect: 'none',
        direction: 'rtl',
        overflow: 'hidden',
        transform: `scale(${1/zoom})`,
        transformOrigin: 'center center'
      }}
      onContextMenu={handleContextMenu}
    >
      <div 
        onPointerDown={handlePointerDown}
        title={isTransferMode ? 'מוד מעבר פעיל — לחץ לביטול' : 'לחץ לפתיחת מוד מעבר / גרור להזזה'}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 8px',
          background: isTransferMode ? '#065f46' : markerHasConflict ? '#7f1d1d' : '#2563eb',
          cursor: isDragging ? 'grabbing' : 'grab',
          borderBottom: isTransferMode ? '2px solid #10b981' : undefined,
        }}
      >
        <span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
          {isTransferMode && <span style={{ fontSize: '10px', background: '#10b981', borderRadius: '3px', padding: '1px 4px' }}>↔ מעבר</span>}
          {marker.label}
          {marker.subLabel && <span style={{ fontSize: '10px', opacity: 0.8 }}> ({marker.subLabel})</span>}
          {markerHasConflict && <span style={{ fontSize: '9px', background: '#ef4444', borderRadius: '3px', padding: '1px 4px', whiteSpace: 'nowrap' }}>⚠️ קונפליקט גובה</span>}
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {onSendMessage && (
            <button
              onClick={(e) => { e.stopPropagation(); onSendMessage(marker.sectorId, marker.subLabel); }}
              onPointerDown={(e) => e.stopPropagation()}
              title="שלח הודעה לעמדות בנקודה זו"
              style={{
                background: '#7c3aed',
                border: 'none',
                color: 'white',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                cursor: 'pointer',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              💬
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              background: '#1d4ed8',
              border: 'none',
              color: 'white',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            +
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              background: '#dc2626',
              border: 'none',
              color: 'white',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        </div>
      </div>
      
      {/* Two-column layout for העברה/קבלה - with drop zone for strip transfers */}
      <div 
        className="marker-drop-zone"
        data-marker-sector={marker.sectorId}
        data-marker-sublabel={marker.subLabel || ''}
        style={{ display: 'flex', background: lightMode ? '#f1f5f9' : '#0f172a', borderTop: `1px solid ${lightMode ? '#cbd5e1' : '#334155'}` }}
      >
        {/* העברה - Outgoing */}
        <div style={{ flex: 1, borderLeft: `1px solid ${lightMode ? '#cbd5e1' : '#334155'}`, padding: '6px', minHeight: '60px' }}>
          <div style={{ fontSize: '10px', color: lightMode ? '#b45309' : '#f59e0b', fontWeight: 'bold', marginBottom: '4px', textAlign: 'center' }}>
            העברה: ({markerOutgoing.length})
          </div>
          {markerOutgoing.map((t: any) => (
            <OutgoingTransferCard
              key={t.id}
              t={t}
              isConflict={markerConflictIds.has(String(t.id))}
              onCancel={onCancelTransfer}
              onUpdateStripField={onUpdateStripField}
              lightMode={lightMode}
            />
          ))}
        </div>
        
        {/* קבלה - Incoming */}
        <div style={{ flex: 1, padding: '6px', minHeight: '60px' }}>
          <div style={{ fontSize: '10px', color: lightMode ? '#15803d' : '#22c55e', fontWeight: 'bold', marginBottom: '4px', textAlign: 'center' }}>
            קבלה ({markerIncoming.length})
          </div>
          {markerIncoming.map((t: any) => (
            <IncomingTransferCard
              key={t.id}
              t={t}
              isConflict={markerConflictIds.has(String(t.id))}
              onAccept={onAcceptTransfer}
              onReject={onRejectTransfer}
              onUpdateStripField={onUpdateStripField}
              onReply={onReplyToTransfer ? () => onReplyToTransfer(t) : undefined}
              onSendDirectReply={onDirectReplyToTransfer}
            />
          ))}
        </div>
      </div>
      
      {/* Notes section */}
      {(notes || editingNotes) && (
        <div style={{ background: lightMode ? '#e2e8f0' : '#1e293b', padding: '6px', borderTop: `1px solid ${lightMode ? '#cbd5e1' : '#334155'}` }}>
          {editingNotes ? (
            <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                <textarea
                  value={tempNotes}
                  onChange={(e) => setTempNotes(e.target.value)}
                  style={{ flex: 1, padding: '4px', border: `1px solid ${lightMode ? '#94a3b8' : '#475569'}`, borderRadius: '4px', background: lightMode ? 'white' : '#0f172a', color: lightMode ? '#1e293b' : 'white', fontSize: '10px', resize: 'none', boxSizing: 'border-box' }}
                  rows={2}
                  autoFocus
                />
                <VKTrigger value={tempNotes} onChange={v => setTempNotes(v)} mode="full" label="הערה" size={14} />
              </div>
              <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                <button 
                  onClick={() => { 
                    if (onUpdateNotes) onUpdateNotes(marker.sectorId, tempNotes);
                    setEditingNotes(false);
                  }} 
                  style={{ flex: 1, padding: '3px', background: '#10b981', color: 'white', border: 'none', borderRadius: '3px', fontSize: '9px', cursor: 'pointer' }}
                >
                  שמור
                </button>
                <button 
                  onClick={() => { setTempNotes(notes || ''); setEditingNotes(false); }} 
                  style={{ flex: 1, padding: '3px', background: '#64748b', color: 'white', border: 'none', borderRadius: '3px', fontSize: '9px', cursor: 'pointer' }}
                >
                  ביטול
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div 
                onClick={(e) => { e.stopPropagation(); setEditingNotes(true); }}
                style={{ fontSize: '9px', color: lightMode ? '#334155' : '#94a3b8', cursor: 'pointer', fontWeight: lightMode ? 'bold' : undefined }}
                title="לחץ לעריכה"
              >
                {(() => { const np = parseNoteValue(notes || ''); return (<>
                  {np.text && <span>📝 {np.text}</span>}
                  {np.hw && <img src={np.hw} alt="כתב יד" style={{ maxHeight: '28px', display: 'block', marginTop: '2px', maxWidth: '100%' }} />}
                </>); })()}
              </div>
              {/* Broadcast note to connected workstations */}
              {onBroadcastNote && sharedPresets && sharedPresets.length > 0 && (() => { const np = parseNoteValue(notes || ''); return np.text || np.hw; })() && (
                <div style={{ marginTop: '4px' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowBroadcastList(v => !v); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{ background: '#6d28d9', border: 'none', color: 'white', fontSize: '8px', borderRadius: '3px', padding: '2px 6px', cursor: 'pointer', width: '100%', fontWeight: 'bold' }}
                  >
                    📢 {showBroadcastList ? 'בחר עמדה ▲' : 'שלח הערה לעמדה ▼'}
                  </button>
                  {showBroadcastList && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                      {sharedPresets.map(p => (
                        <button
                          key={p.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            const np = parseNoteValue(notes || '');
                            onBroadcastNote(p.id, p.name, np.text || '');
                            setShowBroadcastList(false);
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          style={{ background: '#4c1d95', border: '1px solid #7c3aed', color: '#c4b5fd', fontSize: '8px', borderRadius: '3px', padding: '2px 5px', cursor: 'pointer', textAlign: 'right' }}
                        >
                          ▶ {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Add notes button if no notes */}
      {!notes && !editingNotes && onUpdateNotes && (
        <div style={{ background: lightMode ? '#e2e8f0' : '#1e293b', padding: '4px', borderTop: `1px solid ${lightMode ? '#cbd5e1' : '#334155'}`, textAlign: 'center' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setEditingNotes(true); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ background: 'transparent', border: 'none', color: lightMode ? '#475569' : '#64748b', fontSize: '9px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            + הוסף הערה
          </button>
        </div>
      )}

      {showMenu && availableStrips.length > 0 && (
        <div
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '4px',
            minWidth: '120px',
            zIndex: 100
          }}
        >
          <div style={{ fontSize: '10px', color: '#64748b', padding: '4px', borderBottom: '1px solid #e2e8f0' }}>
            בחר פמם להעברה:
          </div>
          {availableStrips.map((s: any) => (
            <button
              key={s.id}
              onClick={() => {
                onTransfer(s.id, marker.sectorId, marker.x, marker.y, marker.subLabel);
                setShowMenu(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 8px',
                background: 'transparent',
                border: 'none',
                textAlign: 'right',
                cursor: 'pointer',
                fontSize: '11px',
                color: '#1e293b'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{s.callsign}</span>
                <span style={{ background: '#3b82f6', color: 'white', padding: '1px 4px', borderRadius: '3px', fontSize: '9px' }}>{s.sq}</span>
              </div>
              <div style={{ fontSize: '9px', color: '#64748b' }}>גובה: {normalizeAlt(s.alt || '')}</div>
            </button>
          ))}
        </div>
      )}

      {editingName && (
        <div
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '8px',
            zIndex: 100
          }}
        >
          <input
            type="text"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', width: '100px', fontSize: '11px' }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
            <button onClick={handleSaveName} style={{ flex: 1, padding: '4px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>
              שמור
            </button>
            <button onClick={() => setEditingName(false)} style={{ flex: 1, padding: '4px', background: '#64748b', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>
              ביטול
            </button>
          </div>
        </div>
      )}
      {editingAltId !== null && (
        <HandwritingOverlay
          onCancel={() => setEditingAltId(null)}
          onComplete={(val: string) => { const n = normalizeAlt(val); setEditingAltId(null); if (onUpdateStripField) onUpdateStripField(editingAltId, 'alt', n); }}
          anchorRect={editingAltAnchor}
        />
      )}
    </div>
  );
};

// --- רכיב העברה נכנסת ניתנת לגרירה ---
export const DraggableIncomingTransfer = ({ transfer, onAccept, onReject, onAcceptToMap }: { 
  transfer: any; 
  onAccept: (id: string) => void; 
  onReject: (id: string) => void;
  onAcceptToMap: (id: string, x: number, y: number) => void;
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      startPosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setDragPos({ x: e.clientX - startPosRef.current.x, y: e.clientY - startPosRef.current.y });
      setIsDragging(true);
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      setDragPos({ 
        x: e.clientX - startPosRef.current.x, 
        y: e.clientY - startPosRef.current.y 
      });
    };

    const handlePointerUp = (e: PointerEvent) => {
      setIsDragging(false);
      const mapArea = document.getElementById('map-area');
      const sidebar = document.getElementById('sidebar-area');
      
      if (mapArea && sidebar) {
        const mapRect = mapArea.getBoundingClientRect();
        const sidebarRect = sidebar.getBoundingClientRect();
        const dropX = e.clientX;
        const dropY = e.clientY;

        if (dropX >= sidebarRect.left && dropX <= sidebarRect.right &&
            dropY >= sidebarRect.top && dropY <= sidebarRect.bottom) {
          onAccept(transfer.id);
        }
        else if (dropX >= mapRect.left && dropX <= mapRect.right &&
            dropY >= mapRect.top && dropY <= mapRect.bottom) {
          const x = dropX - mapRect.left;
          const y = dropY - mapRect.top;
          onAcceptToMap(transfer.id, x, y);
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, transfer.id, onAccept, onAcceptToMap]);

  const content = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 'bold', fontSize: '12px' }}>{getFormationDisplayName(transfer)}</span>
        <span style={{ fontSize: '10px', background: '#3b82f6', padding: '2px 6px', borderRadius: '4px' }}>{transfer.sq}</span>
      </div>
      {(!transfer.sq && transfer.squadron) && <div style={{ fontSize: '10px', color: '#a78bfa', marginTop: '2px' }}>טייסת: {transfer.squadron}</div>}
      <div style={{ display: 'flex', gap: '8px', fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
        <span>גובה: {transfer.alt}</span>
      </div>
      <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
        מ: {transfer.from_sector_label}
        {transfer.sub_sector_label && <span style={{ color: '#60a5fa' }}> ({transfer.sub_sector_label})</span>}
      </div>
    </>
  );

  const baseStyle: React.CSSProperties = {
    background: '#334155', 
    padding: '8px', 
    borderRadius: '4px', 
    marginBottom: '8px',
    cursor: 'grab',
    touchAction: 'none'
  };

  if (isDragging) {
    return (
      <>
        <div ref={containerRef} style={{ ...baseStyle, opacity: 0.3 }}>{content}</div>
        {createPortal(
          <div style={{ 
            ...baseStyle, 
            position: 'fixed', 
            left: dragPos.x, 
            top: dragPos.y, 
            zIndex: 9999,
            pointerEvents: 'none',
            boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
            transform: 'rotate(2deg)',
            width: 180
          }}>
            {content}
            <div style={{ fontSize: '9px', color: '#10b981', marginTop: '6px', textAlign: 'center' }}>
              גרור למפה או לממתינים
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  return (
    <div ref={containerRef} style={baseStyle} onPointerDown={handlePointerDown}>
      {content}
      <div style={{ fontSize: '9px', color: '#64748b', marginTop: '4px', textAlign: 'center' }}>
        גרור למפה או לממתינים להצבה
      </div>
      <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
        <button onClick={(e) => { e.stopPropagation(); onAccept(transfer.id); }} style={{ flex: 1, padding: '4px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>
          לממתינים
        </button>
        <button onClick={(e) => { e.stopPropagation(); onReject(transfer.id); }} style={{ flex: 1, padding: '4px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>
          דחה
        </button>
      </div>
    </div>
  );
};

// --- רכיב פ"מ (Strip) ---
// Strip imported from ./components/strips/Strip (incl. _activeStripDetailsCloser singleton)

// OnScreenKeyboard + OSK_LAYOUTS imported from ./components/shared/OnScreenKeyboard
// --- קנבס כתב יד לטבלה ---
export const TableHandwritingCanvas = ({ existing, onConfirm, onCancel, showText = true }: { existing: string; onConfirm: (note: string) => void; onCancel: () => void; showText?: boolean }) => {
  const parsed = parseNoteValue(existing);
  const [textValue, setTextValue] = useState(parsed.text);
  const [showOSK, setShowOSK] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hwRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastRef = useRef<{x:number;y:number}|null>(null);
  const insertAtCursor = (char: string) => {
    const el = textareaRef.current;
    if (!el) { setTextValue(v => v + char); return; }
    const s = el.selectionStart ?? el.value.length;
    const e2 = el.selectionEnd ?? s;
    const next = el.value.slice(0, s) + char + el.value.slice(e2);
    setTextValue(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + char.length, s + char.length); });
  };
  const oskBackspace = () => {
    const el = textareaRef.current;
    if (!el) { setTextValue(v => v.slice(0, -1)); return; }
    const s = el.selectionStart ?? el.value.length;
    const e2 = el.selectionEnd ?? s;
    const next = s === e2 ? el.value.slice(0, Math.max(0, s - 1)) + el.value.slice(e2) : el.value.slice(0, s) + el.value.slice(e2);
    const ns = s === e2 ? Math.max(0, s - 1) : s;
    setTextValue(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(ns, ns); });
  };

  // Load existing handwriting onto canvas
  useEffect(() => {
    const canvas = hwRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (parsed.hw) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = parsed.hw;
    }
  }, []);

  const getXY = (e: any) => {
    const canvas = hwRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  };
  const onDown = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    isDrawingRef.current = true;
    const {x,y} = getXY(e);
    lastRef.current = {x,y};
  };
  const onMove = (e: any) => {
    if (!isDrawingRef.current || !lastRef.current) return;
    e.preventDefault();
    const {x,y} = getXY(e);
    const ctx = hwRef.current?.getContext('2d');
    if (ctx) {
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(lastRef.current.x, lastRef.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    lastRef.current = {x,y};
  };
  const onUp = () => { isDrawingRef.current = false; lastRef.current = null; };
  const clearHw = () => {
    const canvas = hwRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) { ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); }
  };
  const confirm = () => {
    const hwData = hwRef.current?.toDataURL('image/png') || '';
    // Check if canvas has actual drawing (not just white fill) by comparing to a blank canvas
    const blank = document.createElement('canvas');
    blank.width = hwRef.current?.width || 480;
    blank.height = hwRef.current?.height || 200;
    const bctx = blank.getContext('2d');
    if (bctx) { bctx.fillStyle = '#fff'; bctx.fillRect(0,0,blank.width,blank.height); }
    const hasDrawing = hwData !== blank.toDataURL('image/png');
    onConfirm(serializeNoteValue(textValue, hasDrawing ? hwData : ''));
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={e => e.stopPropagation()}>
      <div style={{ background:'white', borderRadius:'12px', padding:'16px', display:'flex', flexDirection:'column', gap:'10px', width:'min(92vw, 520px)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ fontWeight:'bold', fontSize:'16px', direction:'rtl', textAlign:'center' }}>עריכת הערה</div>

        {/* Text input — shown only when showText is true */}
        {showText && (
          <div style={{ direction:'rtl' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
              <span style={{ fontSize:'12px', color:'#64748b', fontWeight:'600' }}>⌨️ טקסט</span>
              <button
                onPointerDown={e => { e.preventDefault(); setShowOSK(v => !v); }}
                style={{ padding:'4px 10px', background: showOSK ? '#2563eb' : '#475569', color:'white', border:'none', borderRadius:'5px', cursor:'pointer', fontSize:'12px', fontWeight:'bold' }}
              >⌨ מקלדת וירטואלית</button>
            </div>
            <textarea
              ref={textareaRef}
              value={textValue}
              onChange={e => setTextValue(e.target.value)}
              dir="rtl"
              rows={3}
              style={{ width:'100%', padding:'10px', fontSize:'16px', border:'2px solid #cbd5e1', borderRadius:'8px', resize:'vertical', fontFamily:'inherit', boxSizing:'border-box', outline:'none' }}
              placeholder="כתוב כאן..."
              autoFocus
              onFocus={e => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
            />
            {showOSK && (
              <OnScreenKeyboard
                onType={insertAtCursor}
                onBackspace={oskBackspace}
                onEnter={() => insertAtCursor('\n')}
                onClose={() => setShowOSK(false)}
              />
            )}
          </div>
        )}

        {/* Handwriting canvas — always visible */}
        <div style={{ direction:'rtl' }}>
          <div style={{ fontSize:'12px', color:'#64748b', marginBottom:'4px', fontWeight:'600' }}>🖊️ כתב יד</div>
          <canvas
            ref={hwRef}
            width={480}
            height={200}
            style={{ border:'2px solid #cbd5e1', borderRadius:'8px', cursor:'crosshair', touchAction:'none', background:'#fff', display:'block', width:'100%' }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onPointerCancel={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          />
        </div>

        {/* Action buttons */}
        <div style={{ display:'flex', gap:'8px', direction:'rtl', flexWrap:'wrap', justifyContent:'center' }}>
          <button onClick={confirm} style={{ padding:'9px 24px', background:'#2563eb', color:'white', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'bold', fontSize:'15px' }}>קבל</button>
          <button onClick={clearHw} style={{ padding:'9px 16px', background:'#64748b', color:'white', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'14px' }}>נקה ציור</button>
          <button onClick={onCancel} style={{ padding:'9px 16px', background:'#ef4444', color:'white', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'14px' }}>ביטול</button>
        </div>
      </div>
    </div>
  );
};

// --- BlockMiniView: narrow side-panel block+altitude view ---
// BlockMiniView imported from ./components/blocks/BlockMiniView
