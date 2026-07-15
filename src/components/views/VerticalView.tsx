import { tr } from '../../i18n/tr';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import Strip from '../strips/Strip';
import { computeBlockDeviation, getFormationDisplayName, normalizeAlt, parseAltToFeet } from '../../utils/strips';

export const VerticalView = ({ strips, timeField, lightMode, relevantBlocks = [], blockSpaces = [], blockTables = [], allBlocks = [], muteBlockAlerts = false, onStripContextMenu, activeBlockTableId = null, onTimeFieldChange, timeBased = true, onUpdateStripAlt, conflictAltDelta = 500, presetAltMin = null, presetAltMax = null, viewerPresetId = null, externalConflictIds = undefined, initialGroupBy = 'none', onGroupByChange, suggestAltRange = false }: { strips: any[]; timeField: 'takeoff' | 'zmm'; lightMode: boolean; relevantBlocks?: any[]; blockSpaces?: any[]; blockTables?: any[]; allBlocks?: any[]; muteBlockAlerts?: boolean; onStripContextMenu?: (stripId: string, x: number, y: number) => void; activeBlockTableId?: number | null; onTimeFieldChange?: (v: 'takeoff' | 'zmm') => void; timeBased?: boolean; onUpdateStripAlt?: (stripId: string, newAlt: string) => void; conflictAltDelta?: number; presetAltMin?: number | null; presetAltMax?: number | null; viewerPresetId?: number | null; externalConflictIds?: Set<string>; initialGroupBy?: 'none' | 'erka' | 'koteret' | 'mivtza' | 'block_space_id'; onGroupByChange?: (g: 'none' | 'erka' | 'koteret' | 'mivtza' | 'block_space_id') => void; suggestAltRange?: boolean }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartContentRef = React.useRef<HTMLDivElement>(null);
  const [chartW, setChartW] = React.useState(800);
  const [groupBy, setGroupBy] = React.useState<'none' | 'erka' | 'koteret' | 'mivtza' | 'block_space_id'>(initialGroupBy);
  const [showBlocks, setShowBlocks] = React.useState(true);
  const [blockDisplayMode, setBlockDisplayMode] = React.useState<'altitudes' | 'legend'>('altitudes');
  const [blockSpaceOrder, setBlockSpaceOrder] = React.useState<string[]>([]);
  const [dragSegKey, setDragSegKey] = React.useState<string | null>(null);
  const [dragOverSegKey, setDragOverSegKey] = React.useState<string | null>(null);
  const [altDrag, setAltDrag] = React.useState<{ stripId: string; currentAlt: number; origLo: number; origHi: number } | null>(null);
  const [altExpandDrag, setAltExpandDrag] = React.useState<{ stripId: string; edge: 'top' | 'bottom'; origLo: number; origHi: number; currentAlt: number } | null>(null);
  const [altExpand, setAltExpand] = React.useState(0); // extra feet added on each side (positive = expand)
  const [altSuggestion, setAltSuggestion] = React.useState<{ stripId: string; proposedRange: string; count: number; nightMode: boolean } | null>(null);
  const [sunTimes, setSunTimes] = React.useState<{ firstLight: number; lastLight: number } | null>(null);
  const stripsRef = React.useRef(strips);
  stripsRef.current = strips;
  const relevantBlocksRef = React.useRef(relevantBlocks);
  relevantBlocksRef.current = relevantBlocks;
  const suggestAltRangeRef = React.useRef(suggestAltRange);
  suggestAltRangeRef.current = suggestAltRange;
  const sunTimesRef = React.useRef(sunTimes);
  sunTimesRef.current = sunTimes;

  React.useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    fetch(`https://api.sunrise-sunset.org/json?lat=31.7683&lng=35.2137&date=${today}&formatted=0`)
      .then(r => r.json())
      .then(d => {
        if (d.status === 'OK') {
          const sr = new Date(d.results.sunrise).getTime();
          const ss = new Date(d.results.sunset).getTime();
          setSunTimes({ firstLight: sr - 15 * 60 * 1000, lastLight: ss + 15 * 60 * 1000 });
        }
      })
      .catch(() => {});
  }, []);

  const parseAltRangeForSuggestion = (alt: string): { lo: number; hi: number } | null => {
    if (!alt) return null;
    const u = alt.trim().toUpperCase().replace(/,/g, '');
    const rangeMatch = u.match(/(?:FL?)?(\d+)\s*[-–]\s*(?:FL?)?(\d+)/);
    if (rangeMatch) {
      let lo = parseInt(rangeMatch[1]); let hi = parseInt(rangeMatch[2]);
      if (lo < 1000) lo *= 100; if (hi < 1000) hi *= 100;
      return lo <= hi ? { lo, hi } : { lo: hi, hi: lo };
    }
    const fl = u.match(/^F[L]?(\d+)/); if (fl) { const v = parseInt(fl[1]) * 100; return { lo: v, hi: v }; }
    const num = u.match(/^(\d+)$/); if (num) { const n = parseInt(num[1]); const v = n >= 100 && n <= 999 ? n * 100 : n; return { lo: v, hi: v }; }
    return null;
  };

  const tryShowAltSuggestion = React.useCallback((stripId: string, chosenAlt: number) => {
    if (!suggestAltRangeRef.current) return;
    const allStrips = stripsRef.current;
    const strip = allStrips.find((s: any) => String(s.id) === String(stripId));
    if (!strip) return;
    const count = Math.max(1, parseInt(strip.numberOfFormation ?? strip.number_of_formation ?? '1') || 1);
    if (count <= 2) return;
    const extraPairs = Math.ceil((count - 2) / 2);
    const rangeSize = extraPairs * 1000;
    const st = sunTimesRef.current;
    const nightMode = st ? (Date.now() < st.firstLight || Date.now() > st.lastLight) : false;
    const minSep = nightMode ? 2000 : 0;
    const blocks = relevantBlocksRef.current;
    const othersWithAlt = allStrips
      .filter((s: any) => String(s.id) !== String(stripId))
      .map((s: any) => parseAltRangeForSuggestion(s.alt || ''))
      .filter(Boolean) as { lo: number; hi: number }[];
    const isFree = (lo: number, hi: number): boolean => {
      if (blocks.length > 0) {
        const inBlock = blocks.some((b: any) => b.alt_from * 100 <= lo && b.alt_to * 100 >= hi);
        if (!inBlock) return false;
      }
      for (const o of othersWithAlt) {
        if (hi + minSep > o.lo && lo - minSep < o.hi) return false;
      }
      return true;
    };
    const snapped = Math.round(chosenAlt / 1000) * 1000;
    const options = [[snapped, snapped + rangeSize], [snapped - rangeSize, snapped], [snapped - rangeSize / 2, snapped + rangeSize / 2]];
    for (const [lo, hi] of options) {
      if (isFree(lo, hi)) {
        setAltSuggestion({ stripId, proposedRange: `${Math.round(lo / 100)}-${Math.round(hi / 100)}`, count, nightMode });
        return;
      }
    }
  }, []);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => setChartW(Math.max(entries[0].contentRect.width - 56, 300)));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const now = new Date();
  const START_MS = now.getTime() - 60 * 60 * 1000;
  const END_MS = now.getTime() + 5 * 60 * 60 * 1000;
  const TOTAL_MS = END_MS - START_MS;
  const STRIP_DUR_MS = 1 * 60 * 60 * 1000; // 1 hour

  // Parse single altitude value
  const parseAltSingle = (s: string): number | null => {
    if (!s) return null;
    const u = s.trim().toUpperCase().replace(/,/g, '');
    const fl = u.match(/^F[L]?(\d+)/);
    if (fl) return parseInt(fl[1]) * 100;
    const num = u.match(/^(\d+)$/);
    if (num) {
      const n = parseInt(num[1]);
      // 3-digit numbers like 330 are treated as FL (×100)
      return (n >= 100 && n <= 999) ? n * 100 : n;
    }
    return null;
  };

  // Parse possibly-ranged altitude: "330-400" → {lo:33000, hi:40000}, "FL200" → {lo:20000, hi:20000}
  const parseAltRange = (alt: string): { lo: number; hi: number } | null => {
    if (!alt) return null;
    const u = alt.trim().toUpperCase().replace(/,/g, '');
    const rangeMatch = u.match(/(?:FL?)?(\d+)\s*[-–]\s*(?:FL?)?(\d+)/);
    if (rangeMatch) {
      let lo = parseInt(rangeMatch[1]);
      let hi = parseInt(rangeMatch[2]);
      if (lo >= 100 && lo <= 999) lo *= 100;
      if (hi >= 100 && hi <= 999) hi *= 100;
      if (lo > hi) [lo, hi] = [hi, lo];
      return { lo, hi };
    }
    const single = parseAltSingle(alt);
    return single !== null ? { lo: single, hi: single } : null;
  };

  const getTime = (s: any): number | null => {
    const raw = timeField === 'zmm'
      ? (s.zmm_time || s.zmm || s.takeoff_time)
      : s.takeoff_time;
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d.getTime();
  };

  const CHART_H = 220;
  const STRIP_H = 26;
  const X_AXIS_H = 22;
  const Y_AXIS_W = 62;

  const candidatesAll = strips.map(s => {
    const altR = parseAltRange(s.alt);
    const time = getTime(s);
    return { ...s, _time: time, _altLo: altR?.lo ?? null, _altHi: altR?.hi ?? null };
  });

  // Time-based: need both time and altitude. No-time: need only altitude.
  const candidates = timeBased
    ? candidatesAll.filter((s): s is typeof s & { _time: number; _altLo: number; _altHi: number } =>
        s._time !== null && s._altLo !== null && s._altHi !== null)
    : (candidatesAll.filter(s => s._altLo !== null && s._altHi !== null) as (typeof candidatesAll[0] & { _altLo: number; _altHi: number })[]);

  const rawMinAlt = candidates.length > 0 ? Math.min(...candidates.map(s => s._altLo)) : 0;
  const maxAlt    = candidates.length > 0 ? Math.max(...candidates.map(s => s._altHi)) : 50000;
  const rawRange  = Math.max(maxAlt - rawMinAlt, 1);
  const altPerPx  = rawRange / CHART_H;
  const bottomPad = 2 * STRIP_H * altPerPx;
  const topPad    = 2 * STRIP_H * altPerPx;
  // Preset-defined altitude range in feet (presetAltMin/Max are in FL units = hundreds of feet)
  const presetMinFt = presetAltMin != null ? presetAltMin * 100 : null;
  const presetMaxFt = presetAltMax != null ? presetAltMax * 100 : null;
  // Floor from relevant blocks — used only when no preset is set
  const blockAltFloor = relevantBlocks.length > 0
    ? Math.min(...relevantBlocks.map((b: any) => b.alt_from * 100))
    : 0;
  // altExpand > 0 → expand view; < 0 → shrink (but preset floor blocks shrinking)
  let minAlt: number;
  let topAlt: number;
  if (presetMinFt != null) {
    // Hard floor: never show below preset min — not even with - button
    minAlt = presetMinFt;
  } else {
    minAlt = Math.max(blockAltFloor, rawMinAlt - bottomPad - altExpand);
  }
  if (presetMaxFt != null) {
    // Soft ceiling: always show at least up to preset max, but auto-expand for strips above it
    // When a strip is above presetMaxFt show it with a 2000ft buffer (same logic user expects)
    const stripsTopFt = candidates.length > 0 && maxAlt > presetMaxFt
      ? maxAlt + 2000
      : presetMaxFt;
    topAlt = Math.max(presetMaxFt, stripsTopFt) + Math.max(0, altExpand);
  } else {
    topAlt = maxAlt + topPad + altExpand;
  }
  const altRange  = Math.max(topAlt - minAlt, 1);

  // Convert altitude to % from top (0% = top = maxAlt)
  const altPct = (alt: number) => (1 - (alt - minAlt) / altRange) * 100;

  const STRIP_W = (STRIP_DUR_MS / TOTAL_MS) * chartW;
  const timeToX = (ms: number) => ((ms - START_MS) / TOTAL_MS) * chartW;
  // altToY still needed for conflict detection (pixel-based)
  const altToY = (alt: number) => (1 - (alt - minAlt) / altRange) * CHART_H;

  // Build segments based on groupBy
  type Placed = typeof candidates[0] & { _x: number; _y: number; _hasConflict: boolean; _isRange: boolean };

  const buildPlaced = (list: typeof candidates): Placed[] => {
    const p: Placed[] = list.map(s => ({
      ...s,
      _x: timeToX(s._time),
      _y: altToY((s._altLo + s._altHi) / 2),
      _hasConflict: externalConflictIds ? externalConflictIds.has(String(s.id)) : false,
      _isRange: s._altLo !== s._altHi,
    }));
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        const a = p[i], b = p[j];
        const xOvlp = a._x < b._x + STRIP_W && b._x < a._x + STRIP_W;
        if (!xOvlp) continue;
        if (!externalConflictIds) {
          const altGap = Math.max(a._altLo, b._altLo) - Math.min(a._altHi, b._altHi);
          if (altGap !== 0 && altGap < conflictAltDelta) { p[i]._hasConflict = true; p[j]._hasConflict = true; }
        }
        if (!a._isRange && !b._isRange) {
          const yDiff = Math.abs(a._y - b._y);
          if (yDiff < STRIP_H) {
            const shift = (STRIP_H - yDiff) / 2 + 2;
            if (a._y <= b._y) { p[i]._y -= shift; p[j]._y += shift; }
            else { p[i]._y += shift; p[j]._y -= shift; }
          }
        }
      }
    }
    return p;
  };

  // No-time mode: assign a column index to each strip so overlapping-altitude strips are side-by-side
  type NoTimePlaced = typeof candidates[0] & { _col: number; _numCols: number; _hasConflict: boolean; _isRange: boolean };
  const buildNoTimePlaced = (list: typeof candidates): NoTimePlaced[] => {
    // When externalConflictIds is provided, use it directly; otherwise detect internally.
    let conflictSet: Set<string>;
    if (externalConflictIds) {
      conflictSet = externalConflictIds;
    } else {
      conflictSet = new Set<string>();
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          const altGap = Math.max(a._altLo, b._altLo) - Math.min(a._altHi, b._altHi);
          if (altGap !== 0 && altGap < conflictAltDelta) {
            conflictSet.add(String(a.id));
            conflictSet.add(String(b.id));
          }
        }
      }
    }
    // Sort by altitude descending (highest first)
    const sorted = [...list].sort((a, b) => b._altLo - a._altLo);
    // columns: array of altitude-occupied intervals
    const colIntervals: { lo: number; hi: number }[][] = [];
    const colMap = new Map<string, number>();
    for (const s of sorted) {
      let placed = false;
      for (let c = 0; c < colIntervals.length; c++) {
        const hasOverlap = colIntervals[c].some(iv =>
          s._altLo < iv.hi + conflictAltDelta && iv.lo < s._altHi + conflictAltDelta
        );
        if (!hasOverlap) {
          colIntervals[c].push({ lo: s._altLo, hi: s._altHi });
          colMap.set(String(s.id), c);
          placed = true;
          break;
        }
      }
      if (!placed) {
        colIntervals.push([{ lo: s._altLo, hi: s._altHi }]);
        colMap.set(String(s.id), colIntervals.length - 1);
      }
    }
    const numCols = Math.max(colIntervals.length, 1);
    return list.map(s => ({
      ...s,
      _col: colMap.get(String(s.id)) ?? 0,
      _numCols: numCols,
      _hasConflict: conflictSet.has(String(s.id)),
      _isRange: s._altLo !== s._altHi,
    }));
  };

  // Altitude drag effect
  const altRangeRef = React.useRef(altRange);
  const topAltRef = React.useRef(topAlt);
  altRangeRef.current = altRange;
  topAltRef.current = topAlt;
  const altDragRef = React.useRef(altDrag);
  altDragRef.current = altDrag;
  const altExpandDragRef = React.useRef(altExpandDrag);
  altExpandDragRef.current = altExpandDrag;

  React.useEffect(() => {
    if (!altDrag) return;
    const commitAlt = (currentAlt: number) => {
      const d = altDragRef.current!;
      const newAlt = Math.round(currentAlt);
      let altStr: string;
      if (d.origLo !== d.origHi) {
        // Preserve range width, shift center to newAlt
        const halfWidth = (d.origHi - d.origLo) / 2;
        const newLo = Math.round((newAlt - halfWidth) / 100);
        const newHi = Math.round((newAlt + halfWidth) / 100);
        altStr = `${newLo}-${newHi}`;
      } else {
        const fl = Math.round(newAlt / 100);
        altStr = newAlt >= 10000 ? String(fl) : newAlt >= 1000 ? `${(newAlt / 1000).toFixed(1)}k` : String(newAlt);
      }
      onUpdateStripAlt?.(d.stripId, altStr);
      tryShowAltSuggestion(d.stripId, newAlt);
      setAltDrag(null);
    };
    const calcAlt = (clientY: number) => {
      const el = chartContentRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const relY = clientY - rect.top;
      const pct = Math.max(0, Math.min(1, relY / rect.height));
      const rawAlt = topAltRef.current - pct * altRangeRef.current;
      const newAlt = Math.round(rawAlt / 500) * 500;
      setAltDrag(prev => prev ? { ...prev, currentAlt: newAlt } : null);
    };
    const handlePointerMove = (e: PointerEvent) => calcAlt(e.clientY);
    const handlePointerUp = () => { const d = altDragRef.current; if (d) commitAlt(d.currentAlt); };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [altDrag?.stripId]);

  React.useEffect(() => {
    if (!altExpandDrag) return;
    const fmtAltRange = (lo: number, hi: number): string => {
      if (lo === hi) { const fl = Math.round(lo / 100); return lo >= 10000 ? String(fl) : lo >= 1000 ? `${(lo / 1000).toFixed(1)}k` : String(Math.round(lo)); }
      return `${Math.round(lo / 100)}-${Math.round(hi / 100)}`;
    };
    const commitExpand = () => {
      const d = altExpandDragRef.current;
      if (!d) return;
      const rawHi = d.edge === 'top' ? d.currentAlt : d.origHi;
      const rawLo = d.edge === 'bottom' ? d.currentAlt : d.origLo;
      // Allow shrinking but enforce minimum 500ft range and correct ordering
      const newHi = Math.max(rawHi, rawLo + 500);
      const newLo = Math.min(rawLo, rawHi - 500);
      onUpdateStripAlt?.(d.stripId, fmtAltRange(newLo, newHi));
      tryShowAltSuggestion(d.stripId, (newLo + newHi) / 2);
      setAltExpandDrag(null);
    };
    const calcExpandAlt = (clientY: number) => {
      const el = chartContentRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      const rawAlt = topAltRef.current - pct * altRangeRef.current;
      const snapped = Math.round(rawAlt / 1000) * 1000;
      setAltExpandDrag(prev => prev ? { ...prev, currentAlt: snapped } : null);
    };
    const handlePointerMove = (e: PointerEvent) => calcExpandAlt(e.clientY);
    const handlePointerUp = () => commitExpand();
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => { window.removeEventListener('pointermove', handlePointerMove); window.removeEventListener('pointerup', handlePointerUp); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [altExpandDrag?.stripId]);

  const GROUP_FIELD_LABEL: Record<string, string> = { erka: 'ערכה', koteret: 'כותרת', mivtza: 'אזור ביצוע', block_space_id: 'מרחב בלוקים' };

  const buildSegPlaced = (list: typeof candidates) => timeBased ? buildPlaced(list as any) : buildNoTimePlaced(list);

  let segments: { key: string; label: string; placed: any[]; segBlocks?: any[] }[];
  if (groupBy === 'none') {
    segments = [{ key: '__none__', label: '', placed: buildSegPlaced(candidates) }];
  } else if (groupBy === 'block_space_id') {
    const valMap = new Map<string, typeof candidates>();
    candidates.forEach(s => {
      const bsId = s.block_space_id ? String(s.block_space_id) : '—';
      if (!valMap.has(bsId)) valMap.set(bsId, []);
      valMap.get(bsId)!.push(s);
    });
    segments = Array.from(valMap.entries())
      .sort((a, b) => {
        if (a[0] === '—') return 1;
        if (b[0] === '—') return -1;
        return a[0].localeCompare(b[0], 'he');
      })
      .map(([bsId, list]) => {
        const bs = blockSpaces.find((x: any) => String(x.id) === bsId);
        const bsTableIds = blockTables
          .filter((bt: any) => String(bt.block_space_id) === bsId)
          .map((bt: any) => bt.id);
        const blocksPool = allBlocks.length > 0 ? allBlocks : relevantBlocks;
        const segBlocks = blocksPool.filter((b: any) => bsTableIds.includes(b.block_table_id));
        return { key: bsId, label: bs ? bs.name : bsId === '—' ? 'ללא מרחב' : bsId, placed: buildSegPlaced(list), segBlocks };
      });
  } else {
    const field = groupBy as string;
    const valMap = new Map<string, typeof candidates>();
    candidates.forEach(s => {
      const val = ((s as any)[field] || '—') as string;
      if (!valMap.has(val)) valMap.set(val, []);
      valMap.get(val)!.push(s);
    });
    segments = Array.from(valMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'he'))
      .map(([label, list]) => ({ key: label, label, placed: buildSegPlaced(list) }));
  }

  // Sync & apply block-space drag order
  // isBlockSpaceGroup must be defined BEFORE the useEffect that uses it
  const isBlockSpaceGroup = groupBy === 'block_space_id';

  const segKeysStr = segments.map(s => s.key).join(',');
  React.useEffect(() => {
    if (!isBlockSpaceGroup) return;
    const ids = segments.map(s => s.key);
    setBlockSpaceOrder(prev => {
      const existing = prev.filter(id => ids.includes(id));
      const newIds = ids.filter(id => !prev.includes(id));
      return [...existing, ...newIds];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segKeysStr, isBlockSpaceGroup]);

  const orderedSegments = (isBlockSpaceGroup && blockSpaceOrder.length > 0)
    ? [...segments].sort((a, b) => {
        const ai = blockSpaceOrder.indexOf(a.key);
        const bi = blockSpaceOrder.indexOf(b.key);
        if (ai === -1) return 1; if (bi === -1) return -1;
        return ai - bi;
      })
    : segments;

  const ticks: number[] = [];
  const tickStep = 30 * 60 * 1000;
  const tickStart = Math.ceil(START_MS / tickStep) * tickStep;
  for (let t = tickStart; t <= END_MS; t += tickStep) ticks.push(t);

  const altStep = rawRange <= 5000 ? 1000 : rawRange <= 15000 ? 2000 : rawRange <= 40000 ? 5000 : 10000;
  const altTickStart = Math.ceil(minAlt / altStep) * altStep;
  const altTicks: number[] = [];
  for (let a = altTickStart; a <= topAlt + altStep * 0.1; a += altStep) altTicks.push(a);
  const altLabel = (a: number) => a >= 10000 ? `FL${Math.round(a / 100)}` : a >= 1000 ? `${(a / 1000).toFixed(1)}k` : String(Math.round(a));

  const bg = lightMode ? '#f1f5f9' : '#0f172a';
  const gridLine = lightMode ? '#e2e8f0' : '#1e293b';
  const textColor = lightMode ? '#64748b' : '#94a3b8';
  const boldTextColor = lightMode ? '#1e293b' : '#e2e8f0';

  const MIN_CHART_W = 160;
  const segCount = orderedSegments.length;
  const segW = Math.max(chartW / Math.max(segCount, 1), MIN_CHART_W);
  const stripPxW = segW * STRIP_DUR_MS / TOTAL_MS;
  const stripFontSize = stripPxW >= 130 ? 11 : stripPxW >= 90 ? 10 : 9;
  // כאשר יש יותר ממרחב בלוקים אחד ברלוונטיים — מציגים בלוקים רק בחלוקה לפי מרחב בלוקים
  const relevantBlockSpaceIds = Array.from(new Set(relevantBlocks.map((b: any) => {
    const bt = blockTables.find((t: any) => t.id === b.block_table_id);
    return bt ? bt.block_space_id : undefined;
  }).filter(Boolean)));
  const effectiveShowBlocks = showBlocks && relevantBlocks.length > 0 && (relevantBlockSpaceIds.length <= 1 || groupBy === 'block_space_id');
  // per-segment Y-axis only when grouping by block space + blocks shown + altitudes mode
  const usePerSegmentAxis = isBlockSpaceGroup && effectiveShowBlocks && blockDisplayMode === 'altitudes';
  // legend mode: block space grouping + blocks shown + legend mode
  const useLegendMode = isBlockSpaceGroup && effectiveShowBlocks && blockDisplayMode === 'legend';
  const SEG_DIVIDER = isBlockSpaceGroup
    ? (lightMode ? '8px solid #6366f1' : '8px solid #4f46e5')
    : (lightMode ? '4px solid #94a3b8' : '4px solid #475569');
  const HEADER_H = groupBy !== 'none'
    ? (isBlockSpaceGroup ? 36 : 20)
    : 0;
  const TOOLBAR_H = 30;

  const renderXAxis = () => (
    <div style={{ height: X_AXIS_H, flexShrink: 0, position: 'relative', background: bg, borderTop: `1px solid ${gridLine}`, overflow: 'visible' }}>
      {ticks.map(t => {
        const pct = (t - START_MS) / TOTAL_MS * 100;
        if (pct < 0 || pct > 100) return null;
        const d = new Date(t);
        const hh = d.getHours().toString().padStart(2, '0');
        const mm = d.getMinutes().toString().padStart(2, '0');
        const isHour = mm === '00';
        return (
          <div key={t} style={{ position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)', top: 3, color: isHour ? boldTextColor : textColor, fontWeight: isHour ? 'bold' : 'normal', fontSize: isHour ? '11px' : '10px', whiteSpace: 'nowrap' }}>
            {hh}:{mm}
          </div>
        );
      })}
    </div>
  );

  const renderChartContent = (placed: any[], blocksToShow: any[], isFirst = false) => (
    <div ref={isFirst ? chartContentRef : undefined} style={{ flex: 1, position: 'relative', background: bg, overflow: 'hidden', contain: 'paint', cursor: (altDrag || altExpandDrag) ? 'ns-resize' : 'default' }}>
      {/* Block range background bands */}
      {blocksToShow.map((b: any) => {
        const bAltHi = b.alt_to * 100;
        const bAltLo = b.alt_from * 100;
        const topPct = altPct(bAltHi);
        const botPct = altPct(bAltLo);
        if (topPct > 102 || botPct < -2) return null;
        const displayTop = Math.max(topPct, 0);
        const displayBot = Math.min(botPct, 102);
        const h = Math.max(displayBot - displayTop, 1);
        return (
          <div key={b.id} style={{
            position: 'absolute', left: 0, right: 0,
            top: `${displayTop}%`, height: `${h}%`,
            background: b.color ? b.color + '22' : 'rgba(99,102,241,0.1)',
            borderTop: topPct >= 0 ? `1px solid ${b.color ? b.color + '88' : 'rgba(99,102,241,0.4)'}` : undefined,
            borderBottom: botPct <= 102 ? `1px solid ${b.color ? b.color + '88' : 'rgba(99,102,241,0.4)'}` : undefined,
            pointerEvents: 'none', zIndex: 0
          }} />
        );
      })}
      {altTicks.map(a => {
        const pct = altPct(a);
        if (pct < 0 || pct > 100) return null;
        return <div key={a} style={{ position: 'absolute', top: `${pct}%`, left: 0, right: 0, borderTop: `1px dashed ${gridLine}`, pointerEvents: 'none', zIndex: 1 }} />;
      })}

      {/* "Now" line — only in time-based mode */}
      {timeBased && (() => {
        const nowPct = (now.getTime() - START_MS) / TOTAL_MS * 100;
        return (
          <>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${nowPct}%`, width: 2, background: '#ef4444', zIndex: 5, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: 2, left: `${nowPct}%`, transform: 'translateX(3px)', fontSize: '9px', color: '#ef4444', fontWeight: 'bold', zIndex: 6, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              {now.getHours().toString().padStart(2,'0')}:{now.getMinutes().toString().padStart(2,'0')}
            </div>
          </>
        );
      })()}

      {/* Conflict zones — only in time-based mode */}
      {timeBased && (() => {
        const zones: { x1: number; x2: number }[] = [];
        for (let i = 0; i < placed.length; i++) {
          for (let j = i + 1; j < placed.length; j++) {
            const a = placed[i], b = placed[j];
            if (a._hasConflict && b._hasConflict) {
              const x1 = (Math.max(a._time, b._time) - START_MS) / TOTAL_MS * 100;
              const x2 = (Math.min(a._time, b._time) + STRIP_DUR_MS - START_MS) / TOTAL_MS * 100;
              if (x2 > x1) zones.push({ x1, x2 });
            }
          }
        }
        return zones.map((z, idx) => (
          <div key={idx} style={{ position: 'absolute', top: 0, bottom: 0, left: `${z.x1}%`, width: `${z.x2 - z.x1}%`, background: 'rgba(239,68,68,0.18)', zIndex: 0, pointerEvents: 'none' }} />
        ));
      })()}

      {/* Altitude drag indicator */}
      {altDrag && (() => {
        const dragPct = altPct(altDrag.currentAlt);
        const fl = Math.round(altDrag.currentAlt / 100);
        const label = altDrag.currentAlt >= 10000 ? `FL${fl}` : altDrag.currentAlt >= 1000 ? `${(altDrag.currentAlt / 1000).toFixed(1)}k` : String(Math.round(altDrag.currentAlt));
        return (
          <>
            <div style={{ position: 'absolute', left: 0, right: 0, top: `${dragPct}%`, height: 2, background: '#f59e0b', zIndex: 10, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', right: 4, top: `${dragPct}%`, transform: 'translateY(-50%)', background: '#f59e0b', color: '#000', fontSize: '10px', fontWeight: 'bold', padding: '1px 4px', borderRadius: 3, zIndex: 11, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              {label}
            </div>
          </>
        );
      })()}

      {/* Altitude range expand drag indicator */}
      {altExpandDrag && (() => {
        const d = altExpandDrag;
        const dragPct = altPct(d.currentAlt);
        const effHi = d.edge === 'top' ? Math.max(d.currentAlt, d.origHi) : d.origHi;
        const effLo = d.edge === 'bottom' ? Math.min(d.currentAlt, d.origLo) : d.origLo;
        const hiPct = altPct(effHi);
        const loPct = altPct(effLo);
        const label = `${Math.round(effLo / 100)}-${Math.round(effHi / 100)}`;
        return (
          <>
            <div style={{ position: 'absolute', left: 0, right: 0, top: `${hiPct}%`, height: `${Math.max(loPct - hiPct, 2)}%`, background: 'rgba(99,102,241,0.15)', border: '1px dashed #818cf8', zIndex: 9, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: `${dragPct}%`, height: 2, background: '#818cf8', zIndex: 10, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', right: 4, top: `${dragPct}%`, transform: 'translateY(-50%)', background: '#4f46e5', color: '#fff', fontSize: '10px', fontWeight: 'bold', padding: '1px 4px', borderRadius: 3, zIndex: 11, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              {label}
            </div>
          </>
        );
      })()}

      {placed.map(s => {
        const isDragging = altDrag?.stripId === s.id;
        const sq = s.sq || s.squadron || '';
        const isDeviation = computeBlockDeviation(s, allBlocks, blockTables, activeBlockTableId, viewerPresetId);
        const isDeviationAcknowledged = !!s.block_deviation;
        const effectiveDeviation = isDeviation && !muteBlockAlerts;
        const effectiveDeviationAck = isDeviationAcknowledged && !muteBlockAlerts;

        // Compute Y position
        let topPct: number, heightVal: string;
        const midAlt = isDragging ? altDrag!.currentAlt : (s._altLo + s._altHi) / 2;
        if (timeBased) {
          const xPct = (s._time - START_MS) / TOTAL_MS * 100;
          const wPct = STRIP_DUR_MS / TOTAL_MS * 100;
          if (xPct + wPct < 0 || xPct > 100) return null;
          if (s._isRange && !isDragging) {
            const tp = altPct(s._altHi);
            const bp = altPct(s._altLo);
            topPct = Math.max(tp, 0);
            heightVal = `${Math.max(bp - tp, 4)}%`;
          } else {
            const yPct = isDragging ? altPct(midAlt) : s._y / CHART_H * 100;
            const halfPct = (STRIP_H / 2 / CHART_H) * 100;
            topPct = Math.min(Math.max(yPct - halfPct, 0), 100 - (STRIP_H / CHART_H) * 100);
            heightVal = `${STRIP_H}px`;
          }
          const isConflict = s._hasConflict;
          const borderColor = (effectiveDeviation || effectiveDeviationAck) ? '#f97316'
            : s.airborne ? '#3b82f6' : isConflict ? '#ef4444' : (lightMode ? '#94a3b8' : '#475569');
          const textMainColor = s.airborne ? '#3b82f6' : isConflict ? '#ef4444' : boldTextColor;
          const normalBg = s._isRange ? (lightMode ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.18)')
            : isConflict ? (lightMode ? '#fef2f2' : '#450a0a') : (lightMode ? 'rgba(255,255,255,0.95)' : 'rgba(15,23,42,0.95)');
          return (
            <div key={s.id}
              className={isConflict ? 'alt-conflict-flash' : (effectiveDeviation && !isDeviationAcknowledged) ? 'block-deviation-flash' : ''}
              title={`${getFormationDisplayName(s)}${sq ? ' / ' + sq : ''} | גובה: ${normalizeAlt(s.alt || '')}${isDeviation ? ' ⚠️ חריגה מבלוק' : ''}${isConflict ? ' ⚠️ חפיפת גובה' : ''}`}
              onContextMenu={onStripContextMenu ? (e) => { e.preventDefault(); e.stopPropagation(); onStripContextMenu(s.id, e.clientX, e.clientY); } : undefined}
              style={{
                position: 'absolute', left: `${Math.max(xPct, 0)}%`, top: `${topPct}%`,
                width: `${wPct}%`, height: heightVal,
                background: (effectiveDeviation && !isDeviationAcknowledged) ? undefined
                  : effectiveDeviationAck ? 'rgba(234, 88, 12, 0.2)' : (isConflict ? undefined : normalBg),
                border: `2px solid ${isDragging ? '#f59e0b' : borderColor}`, borderRadius: 4,
                display: 'flex', flexDirection: 'row', alignItems: 'stretch',
                overflow: 'hidden', zIndex: isDragging ? 10 : isConflict ? 3 : 2,
                boxSizing: 'border-box', cursor: 'default',
                opacity: isDragging ? 0.6 : 1,
              }}>
              {onUpdateStripAlt && <div onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setAltExpandDrag({ stripId: s.id, edge: 'top', origLo: s._altLo, origHi: s._altHi, currentAlt: s._altHi }); }} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, cursor: 'n-resize', background: 'rgba(99,102,241,0.45)', zIndex: 20, touchAction: 'none', userSelect: 'none' }} />}
              {onUpdateStripAlt && <div onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setAltExpandDrag({ stripId: s.id, edge: 'bottom', origLo: s._altLo, origHi: s._altHi, currentAlt: s._altLo }); }} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 5, cursor: 's-resize', background: 'rgba(99,102,241,0.45)', zIndex: 20, touchAction: 'none', userSelect: 'none' }} />}
              {onUpdateStripAlt && (
                <div
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setAltDrag({ stripId: s.id, currentAlt: (s._altLo + s._altHi) / 2, origLo: s._altLo, origHi: s._altHi }); }}
                  style={{ width: '12px', flexShrink: 0, cursor: 'ns-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.12)', touchAction: 'none', userSelect: 'none', fontSize: '9px', color: '#94a3b8' }}>
                  ⠿
                </div>
              )}
              <div
                onPointerDown={onUpdateStripAlt ? (e) => { e.preventDefault(); e.stopPropagation(); setAltDrag({ stripId: s.id, currentAlt: (s._altLo + s._altHi) / 2, origLo: s._altLo, origHi: s._altHi }); } : undefined}
                style={{ flex: 1, overflow: 'hidden', padding: '2px 4px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', cursor: onUpdateStripAlt ? 'grab' : 'default', touchAction: 'none', userSelect: 'none' }}>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', fontSize: `${stripFontSize}px`, lineHeight: 1.3, display: 'flex', gap: '4px', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 'bold', color: textMainColor, flexShrink: 0 }}>{getFormationDisplayName(s) || '—'}{sq ? ` / ${sq}` : ''}</span>
                  {s.alt && <span style={{ fontSize: `${Math.max(stripFontSize - 1, 8)}px`, color: (effectiveDeviation || effectiveDeviationAck) ? '#f97316' : textColor, flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>גובה: {normalizeAlt(s.alt)}{(effectiveDeviation || effectiveDeviationAck) ? ' ⚠️' : ''}</span>}
                </div>
              </div>
            </div>
          );
        } else {
          // No-time mode: column-based layout
          const numCols = s._numCols ?? 1;
          const col = s._col ?? 0;
          const colW = 100 / numCols;
          const leftPct = col * colW;
          if (s._isRange && !isDragging) {
            const tp = altPct(s._altHi);
            const bp = altPct(s._altLo);
            topPct = Math.max(tp, 0);
            heightVal = `${Math.max(bp - tp, 4)}%`;
          } else {
            const yPct = isDragging ? altPct(midAlt) : altPct((s._altLo + s._altHi) / 2);
            const halfPct = (STRIP_H / 2 / CHART_H) * 100;
            topPct = Math.min(Math.max(yPct - halfPct, 0), 100 - (STRIP_H / CHART_H) * 100);
            heightVal = `${STRIP_H}px`;
          }
          const ntConflict = !!s._hasConflict;
          const borderColor = (effectiveDeviation || effectiveDeviationAck) ? '#f97316'
            : s.airborne ? '#3b82f6' : ntConflict ? '#ef4444' : (lightMode ? '#94a3b8' : '#475569');
          const textMainColor = s.airborne ? '#3b82f6' : ntConflict ? '#ef4444' : boldTextColor;
          const normalBg = s._isRange
            ? (lightMode ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.18)')
            : ntConflict ? (lightMode ? '#fef2f2' : '#450a0a') : (lightMode ? 'rgba(255,255,255,0.95)' : 'rgba(15,23,42,0.95)');
          return (
            <div key={s.id}
              className={ntConflict ? 'alt-conflict-flash' : (effectiveDeviation && !isDeviationAcknowledged) ? 'block-deviation-flash' : ''}
              title={`${getFormationDisplayName(s)}${sq ? ' / ' + sq : ''} | גובה: ${normalizeAlt(s.alt || '')}${isDeviation ? ' ⚠️ חריגה מבלוק' : ''}${ntConflict ? ' ⚠️ חפיפת גובה' : ''}`}
              onContextMenu={onStripContextMenu ? (e) => { e.preventDefault(); e.stopPropagation(); onStripContextMenu(s.id, e.clientX, e.clientY); } : undefined}
              style={{
                position: 'absolute', left: `${leftPct}%`, top: `${topPct}%`,
                width: `${colW - 0.5}%`, height: heightVal,
                background: (effectiveDeviation && !isDeviationAcknowledged) ? undefined
                  : effectiveDeviationAck ? 'rgba(234, 88, 12, 0.2)' : (ntConflict ? undefined : normalBg),
                border: `2px solid ${isDragging ? '#f59e0b' : borderColor}`, borderRadius: 4,
                display: 'flex', flexDirection: 'row', alignItems: 'stretch',
                overflow: 'hidden', zIndex: isDragging ? 10 : ntConflict ? 3 : 2,
                boxSizing: 'border-box', cursor: 'default',
                opacity: isDragging ? 0.6 : 1,
              }}>
              {onUpdateStripAlt && <div onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setAltExpandDrag({ stripId: s.id, edge: 'top', origLo: s._altLo, origHi: s._altHi, currentAlt: s._altHi }); }} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, cursor: 'n-resize', background: 'rgba(99,102,241,0.45)', zIndex: 20, touchAction: 'none', userSelect: 'none' }} />}
              {onUpdateStripAlt && <div onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setAltExpandDrag({ stripId: s.id, edge: 'bottom', origLo: s._altLo, origHi: s._altHi, currentAlt: s._altLo }); }} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 5, cursor: 's-resize', background: 'rgba(99,102,241,0.45)', zIndex: 20, touchAction: 'none', userSelect: 'none' }} />}
              {onUpdateStripAlt && (
                <div
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setAltDrag({ stripId: s.id, currentAlt: (s._altLo + s._altHi) / 2, origLo: s._altLo, origHi: s._altHi }); }}
                  style={{ width: '12px', flexShrink: 0, cursor: 'ns-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.12)', touchAction: 'none', userSelect: 'none', fontSize: '9px', color: '#94a3b8' }}>
                  ⠿
                </div>
              )}
              <div
                onPointerDown={onUpdateStripAlt ? (e) => { e.preventDefault(); e.stopPropagation(); setAltDrag({ stripId: s.id, currentAlt: (s._altLo + s._altHi) / 2, origLo: s._altLo, origHi: s._altHi }); } : undefined}
                style={{ flex: 1, overflow: 'hidden', padding: '2px 4px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', direction: 'rtl', cursor: onUpdateStripAlt ? 'grab' : 'default', touchAction: 'none', userSelect: 'none' }}>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', fontSize: `${stripFontSize}px`, lineHeight: 1.3, display: 'flex', gap: '4px', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 'bold', color: textMainColor, flexShrink: 0 }}>{getFormationDisplayName(s) || '—'}{sq ? ` / ${sq}` : ''}</span>
                  {s.alt && <span style={{ fontSize: `${Math.max(stripFontSize - 1, 8)}px`, color: (effectiveDeviation || effectiveDeviationAck) ? '#f97316' : textColor, flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>גובה: {normalizeAlt(s.alt)}{(effectiveDeviation || effectiveDeviationAck) ? ' ⚠️' : ''}</span>}
                </div>
              </div>
            </div>
          );
        }
      })}

      {/* Alt range suggestion banner */}
      {altSuggestion && (() => {
        const sg = altSuggestion;
        const strip = placed.find(p => String(p.id) === String(sg.stripId));
        const yPct = strip ? altPct((strip._altLo + strip._altHi) / 2) : 50;
        const clampedY = Math.max(5, Math.min(90, yPct));
        return (
          <div style={{ position: 'absolute', left: 4, top: `${clampedY}%`, transform: 'translateY(-50%)', zIndex: 30, background: sg.nightMode ? '#1e1b4b' : '#0c2a1a', border: `1px solid ${sg.nightMode ? '#818cf8' : '#4ade80'}`, borderRadius: 8, padding: '6px 10px', direction: 'rtl', boxShadow: '0 4px 16px rgba(0,0,0,0.5)', minWidth: 180, maxWidth: 240, fontSize: '12px', color: sg.nightMode ? '#c7d2fe' : '#bbf7d0', pointerEvents: 'all' }}>
            <div style={{ fontWeight: 'bold', marginBottom: 4, color: sg.nightMode ? '#a5b4fc' : '#86efac' }}>
              {sg.nightMode ? '🌙' : '☀️'} {tr('vertical.altitudeBlockSuggestion')}
            </div>
            <div style={{ marginBottom: 6, lineHeight: 1.5 }}>
              {tr('vertical.theFormationContains')} <strong>{sg.count}</strong> {tr('shared.aircraft')}
              {sg.nightMode ? ' (לילה)' : ''}
              <br />
              {tr('vertical.suggested')} <strong style={{ fontSize: '13px', color: sg.nightMode ? '#e0e7ff' : '#f0fdf4' }}>FL{sg.proposedRange}</strong>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { onUpdateStripAlt?.(sg.stripId, sg.proposedRange); setAltSuggestion(null); }} style={{ flex: 1, padding: '3px 0', background: sg.nightMode ? '#4338ca' : '#15803d', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>{tr('vertical.accept')}</button>
              <button onClick={() => setAltSuggestion(null)} style={{ flex: 1, padding: '3px 0', background: 'rgba(255,255,255,0.1)', color: sg.nightMode ? '#c7d2fe' : '#bbf7d0', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '11px' }}>{tr('shared.cancel2')}</button>
            </div>
          </div>
        );
      })()}

      {placed.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: textColor, fontSize: '12px', direction: 'rtl' }}>
          {timeBased ? 'אין פממים עם זמן וגובה להצגה' : 'אין פממים עם גובה להצגה'}
        </div>
      )}
    </div>
  );

  const renderYAxisColumn = (blocksToShow: any[]) => (
    <div style={{ width: Y_AXIS_W, flexShrink: 0, position: 'relative', overflow: 'hidden', borderRight: `1px solid ${gridLine}`, background: bg }}>
      {blocksToShow.map((b: any) => {
        const bAltHi = b.alt_to * 100;
        const bAltLo = b.alt_from * 100;
        const topPct = altPct(bAltHi);
        const botPct = altPct(bAltLo);
        if (topPct > 102 || botPct < -2) return null;
        const displayTop = Math.max(topPct, 0);
        const displayBot = Math.min(botPct, 102);
        const h = Math.max(displayBot - displayTop, 2);
        return (
          <div key={b.id} title={b.mission || `${b.alt_from}–${b.alt_to}`} style={{
            position: 'absolute', left: 0, right: 0,
            top: `${displayTop}%`, height: `${h}%`,
            background: b.color ? b.color + '55' : 'rgba(99,102,241,0.3)',
            borderLeft: `3px solid ${b.color || '#6366f1'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
            paddingLeft: '4px', overflow: 'hidden', pointerEvents: 'none', boxSizing: 'border-box'
          }}>
            {h > 5 && <span style={{ fontSize: '8px', fontWeight: 'bold', color: b.color || '#6366f1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', textAlign: 'left', lineHeight: 1 }}>
              {b.mission || `${b.alt_from}–${b.alt_to}`}
            </span>}
          </div>
        );
      })}
      {altTicks.map(a => {
        const pct = altPct(a);
        if (pct < -2 || pct > 102) return null;
        const clampedPct = Math.min(Math.max(pct, 1), 98);
        return (
          <div key={a} style={{ position: 'absolute', top: `${clampedPct}%`, transform: 'translateY(-50%)', right: 4, left: 22, fontWeight: 'bold', fontSize: '11px', color: boldTextColor, whiteSpace: 'nowrap', lineHeight: 1, textAlign: 'right', zIndex: 2 }}>
            {altLabel(a)}
          </div>
        );
      })}
      <button onClick={() => setAltExpand(v => v + 2000)} title={tr('vertical.expandAltitudeRangeBy')}
        style={{ position: 'absolute', top: 3, left: 2, zIndex: 10, width: 18, height: 18, background: lightMode ? '#e2e8f0' : '#1e293b', border: `1px solid ${gridLine}`, borderRadius: 3, cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', color: boldTextColor, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, userSelect: 'none' }}>+</button>
      <button onClick={() => setAltExpand(v => v - 2000)} title={tr('vertical.shrinkAltitudeRangeBy')}
        style={{ position: 'absolute', bottom: 3, left: 2, zIndex: 10, width: 18, height: 18, background: lightMode ? '#e2e8f0' : '#1e293b', border: `1px solid ${gridLine}`, borderRadius: 3, cursor: 'pointer', fontWeight: 'bold', fontSize: '17px', color: boldTextColor, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, userSelect: 'none' }}>−</button>
    </div>
  );

  const renderXAxisWithPad = (yPad = false) => (
    <div style={{ height: X_AXIS_H, flexShrink: 0, display: 'flex', flexDirection: 'row', background: bg, borderTop: `1px solid ${gridLine}` }}>
      {yPad && <div style={{ width: Y_AXIS_W, flexShrink: 0, borderRight: `1px solid ${gridLine}` }} />}
      <div style={{ flex: 1, position: 'relative', overflow: 'visible' }}>
        {ticks.map(t => {
          const pct = (t - START_MS) / TOTAL_MS * 100;
          if (pct < 0 || pct > 100) return null;
          const d = new Date(t);
          const hh = d.getHours().toString().padStart(2, '0');
          const mm = d.getMinutes().toString().padStart(2, '0');
          const isHour = mm === '00';
          return (
            <div key={t} style={{ position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)', top: 3, color: isHour ? boldTextColor : textColor, fontWeight: isHour ? 'bold' : 'normal', fontSize: isHour ? '11px' : '10px', whiteSpace: 'nowrap' }}>
              {hh}:{mm}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderSegmentChart = (placed: any[], segBlocks?: any[], segIdx = 0) => {
    const blocksForChart = effectiveShowBlocks ? (segBlocks !== undefined ? segBlocks : relevantBlocks) : [];
    const isFirst = segIdx === 0;
    if (usePerSegmentAxis) {
      return (
        <>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden', minHeight: 0 }}>
            {renderYAxisColumn(blocksForChart)}
            {renderChartContent(placed, blocksForChart, isFirst)}
          </div>
          {timeBased && renderXAxisWithPad(true)}
        </>
      );
    }
    return (
      <>
        {renderChartContent(placed, blocksForChart, isFirst)}
        {timeBased && renderXAxis()}
      </>
    );
  };

  const GROUP_OPTIONS: { value: 'none' | 'erka' | 'koteret' | 'mivtza' | 'block_space_id'; label: string }[] = [
    { value: 'none', label: 'ללא חלוקה' },
    { value: 'erka', label: 'ערכה' },
    { value: 'koteret', label: 'כותרת' },
    { value: 'mivtza', label: 'אזור ביצוע' },
    { value: 'block_space_id', label: 'מרחב בלוקים' },
  ];

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', direction: 'ltr', background: bg, boxSizing: 'border-box' }}>

      {/* ── Main chart row ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden', minHeight: 0 }}>

        {/* Y-axis column */}
        <div style={{ width: Y_AXIS_W, flexShrink: 0, height: '100%', display: usePerSegmentAxis ? 'none' : 'flex', flexDirection: 'column', borderRight: `1px solid ${gridLine}`, background: bg }}>
          {HEADER_H > 0 && <div style={{ height: HEADER_H, borderBottom: `1px solid ${gridLine}`, background: bg }} />}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {/* Block range bands on Y-axis — hide in legend mode (legend shown in header instead) */}
            {effectiveShowBlocks && !useLegendMode && relevantBlocks.map((b: any) => {
              const bAltHi = b.alt_to * 100;
              const bAltLo = b.alt_from * 100;
              const topPct = altPct(bAltHi);
              const botPct = altPct(bAltLo);
              if (topPct > 102 || botPct < -2) return null;
              const displayTop = Math.max(topPct, 0);
              const displayBot = Math.min(botPct, 102);
              const h = Math.max(displayBot - displayTop, 2);
              return (
                <div key={b.id} title={b.mission || `${b.alt_from}–${b.alt_to}`} style={{
                  position: 'absolute', left: 0, right: 0,
                  top: `${displayTop}%`, height: `${h}%`,
                  background: b.color ? b.color + '55' : 'rgba(99,102,241,0.3)',
                  borderLeft: `3px solid ${b.color || '#6366f1'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                  paddingLeft: '4px', overflow: 'hidden', pointerEvents: 'none', boxSizing: 'border-box'
                }}>
                  {h > 5 && <span style={{ fontSize: '8px', fontWeight: 'bold', color: b.color || '#6366f1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', textAlign: 'left', lineHeight: 1 }}>
                    {b.mission || `${b.alt_from}–${b.alt_to}`}
                  </span>}
                </div>
              );
            })}
            {altTicks.map(a => {
              const pct = altPct(a);
              if (pct < -2 || pct > 102) return null;
              const clampedPct = Math.min(Math.max(pct, 1), 98);
              return (
                <div key={a} style={{ position: 'absolute', top: `${clampedPct}%`, transform: 'translateY(-50%)', right: 4, left: 22, fontWeight: 'bold', fontSize: '11px', color: boldTextColor, whiteSpace: 'nowrap', lineHeight: 1, textAlign: 'right', zIndex: 2 }}>
                  {altLabel(a)}
                </div>
              );
            })}
            {/* Expand/shrink range buttons */}
            <button
              onClick={() => setAltExpand(v => v + 2000)}
              title={tr('vertical.expandAltitudeRangeBy')}
              style={{ position: 'absolute', top: 3, left: 2, zIndex: 10, width: 18, height: 18, background: lightMode ? '#e2e8f0' : '#1e293b', border: `1px solid ${gridLine}`, borderRadius: 3, cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', color: boldTextColor, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, userSelect: 'none' }}>+</button>
            <button
              onClick={() => setAltExpand(v => v - 2000)}
              title={tr('vertical.shrinkAltitudeRangeBy')}
              style={{ position: 'absolute', bottom: 3, left: 2, zIndex: 10, width: 18, height: 18, background: lightMode ? '#e2e8f0' : '#1e293b', border: `1px solid ${gridLine}`, borderRadius: 3, cursor: 'pointer', fontWeight: 'bold', fontSize: '17px', color: boldTextColor, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, userSelect: 'none' }}>−</button>
          </div>
          {timeBased && <div style={{ height: X_AXIS_H, flexShrink: 0, borderTop: `1px solid ${gridLine}`, background: bg }} />}
        </div>

        {/* Scrollable segments area */}
        <div ref={containerRef} style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', display: 'flex', flexDirection: 'row', height: '100%' }}>
          {orderedSegments.map((seg, idx) => {
            const isDragOver = dragOverSegKey === seg.key && dragSegKey !== seg.key;
            return (
            <div key={seg.key}
              style={{ width: segW, minWidth: segW, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', borderRight: idx < orderedSegments.length - 1 ? SEG_DIVIDER : 'none', boxSizing: 'border-box', outline: isDragOver ? `2px solid #818cf8` : 'none', transition: 'outline 0.1s' }}
              onDragOver={isBlockSpaceGroup ? e => { e.preventDefault(); setDragOverSegKey(seg.key); } : undefined}
              onDrop={isBlockSpaceGroup ? e => {
                e.preventDefault();
                if (!dragSegKey || dragSegKey === seg.key) { setDragSegKey(null); setDragOverSegKey(null); return; }
                setBlockSpaceOrder(prev => {
                  const from = prev.indexOf(dragSegKey);
                  const to = prev.indexOf(seg.key);
                  if (from === -1 || to === -1) return prev;
                  const next = [...prev];
                  next.splice(from, 1);
                  next.splice(to, 0, dragSegKey);
                  return next;
                });
                setDragSegKey(null); setDragOverSegKey(null);
              } : undefined}
            >
              {/* Segment header label */}
              {HEADER_H > 0 && (
                isBlockSpaceGroup ? (
                  // Block space header: drag handle + title + (legend swatches on left if legend mode)
                  <div
                    draggable
                    onDragStart={() => setDragSegKey(seg.key)}
                    onDragEnd={() => { setDragSegKey(null); setDragOverSegKey(null); }}
                    style={{ height: HEADER_H, flexShrink: 0, display: 'flex', flexDirection: 'row', alignItems: 'center', background: lightMode ? '#ede9fe' : '#1e1b4b', borderBottom: `2px solid ${lightMode ? '#6366f1' : '#4f46e5'}`, padding: '0 8px', direction: 'rtl', overflow: 'hidden', gap: 6, cursor: 'grab', userSelect: 'none' }}>
                    {/* Drag handle */}
                    <span style={{ fontSize: '13px', color: lightMode ? '#818cf8' : '#6366f1', flexShrink: 0, opacity: 0.7 }}>⠿</span>
                    {/* Title */}
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: lightMode ? '#4338ca' : '#a5b4fc', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {seg.label}
                    </span>
                    {/* Spacer */}
                    <div style={{ flex: 1 }} />
                    {/* Legend swatches — left side (only in legend mode) */}
                    {useLegendMode && (
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'nowrap', overflow: 'hidden', alignItems: 'center', direction: 'ltr' }}>
                        {(seg.segBlocks || []).map((b: any) => (
                          <span key={b.id} title={`FL${b.alt_from}–FL${b.alt_to}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: '9px', padding: '1px 4px', borderRadius: 3, background: b.color ? b.color + '33' : 'rgba(99,102,241,0.2)', border: `1px solid ${b.color || '#6366f1'}`, color: b.color || (lightMode ? '#4338ca' : '#a5b4fc'), whiteSpace: 'nowrap', fontWeight: 'bold', flexShrink: 0 }}>
                            <span style={{ width: 7, height: 7, borderRadius: 2, background: b.color || '#6366f1', display: 'inline-block', flexShrink: 0 }} />
                            {b.mission || `${b.alt_from}–${b.alt_to}`}
                          </span>
                        ))}
                        {(seg.segBlocks || []).length === 0 && <span style={{ fontSize: '9px', color: textColor, fontStyle: 'italic' }}>{tr('vertical.noBlocks')}</span>}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ height: HEADER_H, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: lightMode ? '#e2e8f0' : '#1e293b', borderBottom: `1px solid ${gridLine}`, fontSize: '11px', fontWeight: 'bold', color: boldTextColor, direction: 'rtl', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 6px' }}>
                    {GROUP_FIELD_LABEL[groupBy]}: {seg.label}
                  </div>
                )
              )}
              {renderSegmentChart(seg.placed, seg.segBlocks, idx)}
            </div>
            );
          })}
          {candidates.length === 0 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: textColor, fontSize: '13px', direction: 'rtl' }}>
              {timeBased ? 'אין פממים עם זמן וגובה להצגה' : 'אין פממים עם גובה להצגה'}
            </div>
          )}
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{ height: TOOLBAR_H, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', background: lightMode ? '#e2e8f0' : '#0f172a', borderTop: `1px solid ${gridLine}`, direction: 'rtl', overflow: 'hidden' }}>
        <span style={{ fontSize: '11px', color: textColor, fontWeight: 'bold', whiteSpace: 'nowrap' }}>{tr('vertical.groupBy')}</span>
        {GROUP_OPTIONS.map(opt => (
          <button key={opt.value} onClick={() => { setGroupBy(opt.value); onGroupByChange?.(opt.value); }}
            style={{ padding: '2px 10px', fontSize: '11px', borderRadius: 4, border: 'none', cursor: 'pointer', background: groupBy === opt.value ? '#6d28d9' : (lightMode ? '#cbd5e1' : '#334155'), color: groupBy === opt.value ? '#fff' : (lightMode ? '#1e293b' : '#94a3b8'), fontWeight: groupBy === opt.value ? 'bold' : 'normal', whiteSpace: 'nowrap' }}>
            {opt.label}
          </button>
        ))}

        {/* Separator */}
        <div style={{ width: 1, height: 18, background: gridLine, flexShrink: 0 }} />

        {/* Toggle blocks */}
        <button onClick={() => setShowBlocks(v => !v)}
          style={{ padding: '2px 10px', fontSize: '11px', borderRadius: 4, border: `1px solid ${showBlocks ? '#6366f1' : gridLine}`, cursor: 'pointer', background: showBlocks ? (lightMode ? '#ede9fe' : '#1e1b4b') : (lightMode ? '#cbd5e1' : '#334155'), color: showBlocks ? (lightMode ? '#4338ca' : '#a5b4fc') : (lightMode ? '#1e293b' : '#94a3b8'), fontWeight: 'bold', whiteSpace: 'nowrap', direction: 'rtl' }}>
          {showBlocks ? '◼ הסתר בלוקים' : '◻ הצג בלוקים'}
        </button>

        {/* Block display mode — only when grouping by block space and blocks visible */}
        {isBlockSpaceGroup && effectiveShowBlocks && (
          <>
            <div style={{ width: 1, height: 18, background: gridLine, flexShrink: 0 }} />
            <span style={{ fontSize: '11px', color: textColor, whiteSpace: 'nowrap' }}>{tr('vertical.blockView')}</span>
            {(['altitudes', 'legend'] as const).map(mode => (
              <button key={mode} onClick={() => setBlockDisplayMode(mode)}
                style={{ padding: '2px 10px', fontSize: '11px', borderRadius: 4, border: 'none', cursor: 'pointer', background: blockDisplayMode === mode ? '#6d28d9' : (lightMode ? '#cbd5e1' : '#334155'), color: blockDisplayMode === mode ? '#fff' : (lightMode ? '#1e293b' : '#94a3b8'), fontWeight: blockDisplayMode === mode ? 'bold' : 'normal', whiteSpace: 'nowrap' }}>
                {mode === 'altitudes' ? 'גבהים' : 'מקרא'}
              </button>
            ))}
          </>
        )}

        {/* Time field selector — pushed to the physical left — only in time-based mode */}
        {timeBased && onTimeFieldChange && (
          <>
            <div style={{ marginRight: 'auto' }} />
            <div style={{ width: 1, height: 18, background: gridLine, flexShrink: 0 }} />
            <span style={{ fontSize: '11px', color: textColor, whiteSpace: 'nowrap' }}>{tr('vertical.timeline')}</span>
            <select
              value={timeField}
              onChange={e => onTimeFieldChange(e.target.value as 'takeoff' | 'zmm')}
              style={{ background: lightMode ? '#cbd5e1' : '#334155', color: lightMode ? '#1e293b' : '#e2e8f0', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', cursor: 'pointer' }}
            >
              <option value="takeoff">{tr('shared.takeoffTime')}</option>
              <option value="zmm">{tr('vertical.eta')}</option>
            </select>
          </>
        )}
      </div>
    </div>
  );
};

// --- Block deviation helper (shared across views) ---
/**
 * computeBlockDeviation — determines whether a strip is outside its workstation's
 * assigned altitude block in the CURRENTLY ACTIVE block table.
 *
 * Rules (per user spec):
 *  - No activeBlockTableId          →  never alert (no block context selected)
 *  - Active table has no blocks     →  never alert (empty table)
 *  - WS has no blocks in the table  →  never alert (table doesn't define ranges for this WS)
 *  - WS has blocks in the table     →  alert when strip altitude is NOT in any of them
 */
// Normalize an altitude string: strip FL prefix, collapse spaces around dash
// e.g. "FL340" → "340", "FL340 - FL360" → "340-360", "340  -  360" → "340-360"
// Strip helpers (getFormationDisplayName, getTransferLabel, getTransferSq, normalizeAlt,
// parseAltToFeet, computeBlockDeviation) imported from ./utils/strips


export default VerticalView;
