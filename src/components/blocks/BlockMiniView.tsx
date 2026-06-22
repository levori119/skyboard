import React, { useState, useRef, useEffect } from 'react';
import { parseAltToFeet } from '../../utils/strips';

export const BlockMiniView = ({ relevantBlocks, strips, lightMode, onUpdateStripAlt }: {
  relevantBlocks: any[]; strips: any[]; lightMode: boolean;
  onUpdateStripAlt?: (stripId: string, newAlt: string) => void;
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerH, setContainerH] = React.useState(400);
  const dragRef = React.useRef<{ stripId: string; startY: number; startAltFt: number } | null>(null);
  const [dragAlt, setDragAlt] = React.useState<{ id: string; altFt: number } | null>(null);

  React.useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const ro = new ResizeObserver(ents => { for (const e of ents) setContainerH(e.contentRect.height); });
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const minAltFt = relevantBlocks.length ? Math.min(...relevantBlocks.map((b: any) => b.alt_from)) * 100 : 10000;
  const maxAltFt = relevantBlocks.length ? Math.max(...relevantBlocks.map((b: any) => b.alt_to)) * 100 : 60000;
  const pad = 5000;
  const altMin = minAltFt - pad;
  const altMax = maxAltFt + pad;
  const altRange = altMax - altMin || 1;

  const toY = (ft: number) => ((altMax - ft) / altRange) * containerH;
  const fromY = (y: number) => altMax - (y / containerH) * altRange;

  React.useEffect(() => {
    if (!dragRef.current) return;
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const newAltFt = Math.round(fromY(relY) / 500) * 500;
      setDragAlt({ id: dragRef.current.stripId, altFt: newAltFt });
    };
    const onUp = (e: PointerEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const newAltFt = Math.round(fromY(relY) / 500) * 500;
      const fl = Math.round(newAltFt / 100);
      if (onUpdateStripAlt) onUpdateStripAlt(dragRef.current.stripId, String(fl));
      dragRef.current = null;
      setDragAlt(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [dragRef.current !== null, altMin, altMax, containerH]);

  const TICK_STEP = 5000;
  const ticks: number[] = [];
  for (let a = Math.ceil(altMin / TICK_STEP) * TICK_STEP; a <= altMax; a += TICK_STEP) ticks.push(a);

  const CHIP_H = 28;
  const placedStrips = strips.map((s: any) => {
    const ft = parseAltToFeet(String(s.alt || ''));
    return { ...s, altFt: ft };
  }).filter((s: any) => s.altFt !== null && s.altFt >= altMin - 1000 && s.altFt <= altMax + 1000);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', cursor: dragRef.current ? 'ns-resize' : 'default' }}>
      {/* Block bands */}
      {relevantBlocks.map((b: any) => {
        const y1 = toY(b.alt_to * 100);
        const y2 = toY(b.alt_from * 100);
        if (y2 <= 0 && y1 <= 0) return null;
        if (y1 >= containerH && y2 >= containerH) return null;
        return (
          <div key={b.id} style={{
            position: 'absolute', left: 0, right: 0,
            top: Math.max(0, y1), height: Math.max(2, Math.min(containerH, y2) - Math.max(0, y1)),
            background: (b.color || '#6366f1') + '33',
            borderTop: `2px solid ${b.color || '#6366f1'}cc`,
            borderBottom: `2px solid ${b.color || '#6366f1'}cc`,
            pointerEvents: 'none',
          }}>
            {b.mission && (
              <span style={{ position: 'absolute', top: 2, right: 2, fontSize: '7px', color: b.color || '#a5b4fc', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80%' }}>{b.mission}</span>
            )}
          </div>
        );
      })}
      {/* Altitude ticks */}
      {ticks.map(a => {
        const y = toY(a);
        if (y < 0 || y > containerH) return null;
        return (
          <div key={a} style={{ position: 'absolute', left: 0, right: 0, top: y, height: 1, background: lightMode ? '#e2e8f0' : '#334155', pointerEvents: 'none' }}>
            <span style={{ position: 'absolute', right: 2, top: -8, fontSize: '7px', color: lightMode ? '#94a3b8' : '#475569', whiteSpace: 'nowrap' }}>FL{a / 100}</span>
          </div>
        );
      })}
      {/* Strip chips — draggable */}
      {placedStrips.map((s: any) => {
        const isDragging = dragAlt?.id === s.id;
        const displayAltFt = isDragging ? dragAlt!.altFt : s.altFt!;
        const y = toY(displayAltFt);
        const fl = Math.round(displayAltFt / 100);
        return (
          <div
            key={s.id}
            onPointerDown={onUpdateStripAlt ? (e) => {
              e.preventDefault(); e.stopPropagation();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              dragRef.current = { stripId: s.id, startY: e.clientY, startAltFt: s.altFt! };
              setDragAlt({ id: s.id, altFt: s.altFt! });
            } : undefined}
            style={{
              position: 'absolute', left: 2, right: 2,
              top: y - CHIP_H / 2, height: CHIP_H,
              borderRadius: '3px',
              background: isDragging ? (lightMode ? '#1d4ed8' : '#3b82f6') : (lightMode ? '#1e293b' : '#334155'),
              border: `1px solid ${isDragging ? '#60a5fa' : (lightMode ? '#475569' : '#64748b')}`,
              display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center',
              color: lightMode ? '#f8fafc' : '#f1f5f9',
              overflow: 'hidden',
              cursor: onUpdateStripAlt ? 'ns-resize' : 'default',
              zIndex: isDragging ? 10 : 2,
              userSelect: 'none', touchAction: 'none',
              padding: '1px 3px',
              opacity: isDragging ? 0.85 : 1,
            }}
            title={`${s.callSign || ''} | FL${fl}${s.plane_type ? ' | ' + s.plane_type : ''}`}
          >
            <div style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
              {s.callSign || '—'}
            </div>
            <div style={{ fontSize: '8px', color: lightMode ? '#93c5fd' : '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
              FL{fl}{s.plane_type ? ` · ${s.plane_type}` : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Vehicle Requests Panel (self-contained, shown in GroundView) ───────────

export default BlockMiniView;
