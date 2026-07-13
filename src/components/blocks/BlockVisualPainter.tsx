import { tr } from '../../i18n/tr';
import React, { useState, useRef } from 'react';

export const BLOCK_PALETTE = ['#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f43f5e','#a855f7','#fb923c','#4ade80'];
export const hexToHue = (hex: string): number => {
  const r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === r) h = ((g-b)/d) % 6;
  else if (max === g) h = (b-r)/d + 2;
  else h = (r-g)/d + 4;
  return ((h*60)+360)%360;
};
export const pickDistinctBlockColor = (existingBlocks: any[]): string => {
  if (!existingBlocks.length) return BLOCK_PALETTE[0];
  const usedHues = existingBlocks.map((b: any) => hexToHue(b.color || '#3b82f6'));
  let best = BLOCK_PALETTE[0], bestDist = -1;
  for (const c of BLOCK_PALETTE) {
    const h = hexToHue(c);
    const d = Math.min(...usedHues.map(uh => Math.min(Math.abs(h-uh), 360-Math.abs(h-uh))));
    if (d > bestDist) { bestDist = d; best = c; }
  }
  return best;
};

// --- כלי ציור בלוקים ויזואלי (יצירה + עריכה ויזואלית) ---
type PainterDragOp =
  | { type: 'new'; startFL: number; currentFL: number }
  | { type: 'resize-top';    blockId: number; origFrom: number; origTo: number; currentFL: number }
  | { type: 'resize-bottom'; blockId: number; origFrom: number; origTo: number; currentFL: number }
  | { type: 'move';          blockId: number; origFrom: number; origTo: number; startFL: number; currentFL: number };

export const BlockVisualPainter = ({ btId, existingBlocks, apiUrl, onSaved }: { btId: number; existingBlocks: any[]; apiUrl: string; onSaved: () => void }) => {
  const RULER_H = 340;
  const FL_MIN = 100;
  const FL_MAX = 420;
  const FL_RANGE = FL_MAX - FL_MIN;
  const EDGE_PX = 6; // px zone near edge to trigger resize
  const rulerRef = React.useRef<HTMLDivElement>(null);

  const [resolution, setResolution] = React.useState(10);
  const [dragOp, setDragOp] = React.useState<PainterDragOp | null>(null);
  const [hoverCursor, setHoverCursor] = React.useState<string>('crosshair');
  // pending new block
  const [pending, setPending] = React.useState<{ alt_from: number; alt_to: number } | null>(null);
  const [pendingMission, setPendingMission] = React.useState('');
  const [pendingColor, setPendingColor] = React.useState('#3b82f6');

  const flToY = (fl: number) => ((FL_MAX - fl) / FL_RANGE) * RULER_H;
  const yToFL = (y: number) => FL_MAX - (y / RULER_H) * FL_RANGE;
  const snapFL = (fl: number) => Math.max(FL_MIN, Math.min(FL_MAX, Math.round(fl / resolution) * resolution));

  const getMouseFL = (e: React.MouseEvent) => {
    const rect = rulerRef.current!.getBoundingClientRect();
    const y = e.clientY - rect.top;
    return snapFL(yToFL(Math.max(0, Math.min(RULER_H, y))));
  };

  // Detect which block + zone the mouse is on
  const hitTest = (e: React.MouseEvent): { block: any; zone: 'top' | 'middle' | 'bottom' } | null => {
    const rect = rulerRef.current!.getBoundingClientRect();
    const y = e.clientY - rect.top;
    for (const b of [...existingBlocks].reverse()) {
      const topY = flToY(b.alt_to);
      const botY = flToY(b.alt_from);
      if (y < topY - 1 || y > botY + 1) continue;
      if (y <= topY + EDGE_PX) return { block: b, zone: 'top' };
      if (y >= botY - EDGE_PX) return { block: b, zone: 'bottom' };
      return { block: b, zone: 'middle' };
    }
    return null;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const fl = getMouseFL(e);
    if (dragOp) {
      if (dragOp.type === 'new') {
        setDragOp({ ...dragOp, currentFL: fl });
      } else if (dragOp.type === 'resize-top') {
        // alt_to (top) must stay above alt_from + resolution
        setDragOp({ ...dragOp, currentFL: Math.max(fl, dragOp.origFrom + resolution) });
      } else if (dragOp.type === 'resize-bottom') {
        // alt_from (bottom) must stay below alt_to - resolution
        setDragOp({ ...dragOp, currentFL: Math.min(fl, dragOp.origTo - resolution) });
      } else if (dragOp.type === 'move') {
        const delta = fl - dragOp.startFL;
        setDragOp({ ...dragOp, currentFL: fl });
        // currentFL tracks mouse; we'll compute position in render
        void delta;
      }
      return;
    }
    // Update cursor based on hover
    const hit = hitTest(e);
    if (!hit) setHoverCursor('crosshair');
    else if (hit.zone === 'top' || hit.zone === 'bottom') setHoverCursor('ns-resize');
    else setHoverCursor('grab');
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (pending) return;
    const fl = getMouseFL(e);
    const hit = hitTest(e);
    if (!hit) {
      setDragOp({ type: 'new', startFL: fl, currentFL: fl });
    } else if (hit.zone === 'top') {
      setDragOp({ type: 'resize-top', blockId: hit.block.id, origFrom: hit.block.alt_from, origTo: hit.block.alt_to, currentFL: hit.block.alt_to });
    } else if (hit.zone === 'bottom') {
      setDragOp({ type: 'resize-bottom', blockId: hit.block.id, origFrom: hit.block.alt_from, origTo: hit.block.alt_to, currentFL: hit.block.alt_from });
    } else {
      setDragOp({ type: 'move', blockId: hit.block.id, origFrom: hit.block.alt_from, origTo: hit.block.alt_to, startFL: fl, currentFL: fl });
    }
  };

  const handleMouseUp = async () => {
    if (!dragOp) return;
    if (dragOp.type === 'new') {
      const lo = Math.min(dragOp.startFL, dragOp.currentFL);
      const hi = Math.max(dragOp.startFL, dragOp.currentFL);
      setDragOp(null);
      if (hi - lo >= resolution) {
        setPendingColor(pickDistinctBlockColor(existingBlocks));
        setPending({ alt_from: lo, alt_to: hi });
      }
      return;
    }
    // Save edit for existing block
    if (dragOp.type === 'resize-top') {
      const newTo = dragOp.currentFL;
      const blk = existingBlocks.find(b => b.id === dragOp.blockId);
      if (blk && newTo !== dragOp.origTo) {
        await fetch(`${apiUrl}/blocks/${dragOp.blockId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...blk, alt_from: blk.alt_from, alt_to: newTo }) });
        onSaved();
      }
    } else if (dragOp.type === 'resize-bottom') {
      const newFrom = dragOp.currentFL;
      const blk = existingBlocks.find(b => b.id === dragOp.blockId);
      if (blk && newFrom !== dragOp.origFrom) {
        await fetch(`${apiUrl}/blocks/${dragOp.blockId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...blk, alt_from: newFrom, alt_to: blk.alt_to }) });
        onSaved();
      }
    } else if (dragOp.type === 'move') {
      const delta = dragOp.currentFL - dragOp.startFL;
      const newFrom = snapFL(dragOp.origFrom + delta);
      const newTo = snapFL(dragOp.origTo + delta);
      const blk = existingBlocks.find(b => b.id === dragOp.blockId);
      if (blk && delta !== 0) {
        await fetch(`${apiUrl}/blocks/${dragOp.blockId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...blk, alt_from: newFrom, alt_to: newTo }) });
        onSaved();
      }
    }
    setDragOp(null);
  };

  // Compute live positions during drag for each block
  const getLiveBlock = (b: any): { alt_from: number; alt_to: number } => {
    if (!dragOp || dragOp.type === 'new' || dragOp.blockId !== b.id) return b;
    if (dragOp.type === 'resize-top') return { alt_from: b.alt_from, alt_to: dragOp.currentFL };
    if (dragOp.type === 'resize-bottom') return { alt_from: dragOp.currentFL, alt_to: b.alt_to };
    if (dragOp.type === 'move') {
      const delta = dragOp.currentFL - dragOp.startFL;
      return { alt_from: snapFL(dragOp.origFrom + delta), alt_to: snapFL(dragOp.origTo + delta) };
    }
    return b;
  };

  const previewFrom = dragOp?.type === 'new' ? Math.min(dragOp.startFL, dragOp.currentFL) : null;
  const previewTo   = dragOp?.type === 'new' ? Math.max(dragOp.startFL, dragOp.currentFL) : null;

  const gridTicks: number[] = [];
  for (let fl = FL_MIN; fl <= FL_MAX; fl += resolution) gridTicks.push(fl);
  const resOptions = [5, 10, 20];

  const cursorStyle = dragOp ? (dragOp.type === 'move' ? 'grabbing' : dragOp.type === 'new' ? 'crosshair' : 'ns-resize') : hoverCursor;

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', direction: 'ltr' }}>
      {/* Ruler column */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        {/* Resolution controls */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 2 }}>
          <button onClick={() => setResolution(r => resOptions[Math.max(0, resOptions.indexOf(r) - 1)])}
            disabled={resolution === resOptions[0]}
            title={tr('blocks.higherResolutionSmallerSteps')}
            style={{ width: 22, height: 22, borderRadius: 3, border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
          <span style={{ fontSize: '9px', color: '#64748b', minWidth: 36, textAlign: 'center' }}>{resolution * 100}ft</span>
          <button onClick={() => setResolution(r => resOptions[Math.min(resOptions.length - 1, resOptions.indexOf(r) + 1)])}
            disabled={resolution === resOptions[resOptions.length - 1]}
            title={tr('blocks.lowerResolutionLargerSteps')}
            style={{ width: 22, height: 22, borderRadius: 3, border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
        </div>
        {/* Ruler */}
        <div ref={rulerRef}
          style={{ position: 'relative', width: 72, height: RULER_H, background: '#0c1a2e', border: '1px solid #334155', borderRadius: 4, overflow: 'hidden', cursor: cursorStyle, userSelect: 'none', flexShrink: 0 }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
          {/* Grid lines + FL labels */}
          {gridTicks.map(fl => (
            <div key={fl} style={{ position: 'absolute', left: 0, right: 0, top: flToY(fl), pointerEvents: 'none' }}>
              <div style={{ height: 1, background: fl % 20 === 0 ? '#475569' : '#1e3a5f', width: '100%' }} />
              {fl % 20 === 0 && <span style={{ position: 'absolute', left: 2, top: 1, fontSize: '8px', color: '#64748b', whiteSpace: 'nowrap' }}>FL{fl}</span>}
            </div>
          ))}
          {/* Existing blocks (live positions) */}
          {existingBlocks.map((b: any) => {
            const live = getLiveBlock(b);
            const top = flToY(live.alt_to);
            const h = Math.max(flToY(live.alt_from) - top, 2);
            const isActive = dragOp && 'blockId' in dragOp && dragOp.blockId === b.id;
            return (
              <div key={b.id} style={{ position: 'absolute', left: 0, right: 0, top, height: h, background: (b.color || '#3b82f6') + (isActive ? 'aa' : '55'), border: `2px solid ${b.color || '#3b82f6'}`, borderRadius: 2, overflow: 'hidden', boxSizing: 'border-box' }}>
                {h > 10 && <span style={{ fontSize: '7px', color: b.color || '#93c5fd', padding: '1px 2px', display: 'block', overflow: 'hidden', whiteSpace: 'nowrap' }}>{b.mission || `${live.alt_from}–${live.alt_to}`}</span>}
                {/* Resize handles */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: EDGE_PX, cursor: 'ns-resize' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: EDGE_PX, cursor: 'ns-resize' }} />
              </div>
            );
          })}
          {/* New block drag preview */}
          {previewFrom !== null && previewTo !== null && previewTo > previewFrom && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: flToY(previewTo), height: Math.max(flToY(previewFrom) - flToY(previewTo), 2), background: pendingColor + '55', border: `1px dashed ${pendingColor}`, pointerEvents: 'none' }}>
              <span style={{ fontSize: '7px', color: pendingColor, padding: '1px 2px' }}>FL{previewFrom}–FL{previewTo}</span>
            </div>
          )}
        </div>
        <span style={{ fontSize: '8px', color: '#475569', textAlign: 'center' }}>{tr('blocks.newDragEmptyEdit')}</span>
      </div>

      {/* Pending new block form */}
      {pending && (
        <div style={{ background: '#0c1a2e', border: '1px solid #334155', borderRadius: 6, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 130, direction: 'rtl' }}>
          <span style={{ color: '#a5b4fc', fontSize: '11px', fontWeight: 'bold' }}>FL{pending.alt_from} – FL{pending.alt_to}</span>
          <input placeholder={tr('blocks.taskName')} value={pendingMission} onChange={e => setPendingMission(e.target.value)} autoFocus
            style={{ padding: '4px 6px', background: '#1e293b', border: '1px solid #334155', borderRadius: 4, color: 'white', fontSize: '11px', width: '100%', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: '10px', color: '#64748b' }}>{tr('shared.color')}</label>
            <input type="color" value={pendingColor} onChange={e => setPendingColor(e.target.value)}
              style={{ width: 32, height: 24, padding: 1, background: 'none', border: '1px solid #334155', borderRadius: 3, cursor: 'pointer' }} />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={async () => {
              await fetch(`${apiUrl}/blocks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block_table_id: btId, alt_from: pending.alt_from, alt_to: pending.alt_to, mission: pendingMission, color: pendingColor, workstations: [], platforms: [] }) });
              setPending(null); setPendingMission(''); setPendingColor('#3b82f6'); onSaved();
            }} style={{ background: '#1d4ed8', color: 'white', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>{tr('shared.save')}</button>
            <button onClick={() => { setPending(null); setPendingMission(''); setPendingColor('#3b82f6'); }}
              style={{ background: '#475569', color: 'white', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontSize: '11px' }}>{tr('shared.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Settings overlay modal ---
