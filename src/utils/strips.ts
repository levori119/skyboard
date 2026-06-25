// Strip / formation display + altitude helpers (extracted from App.tsx)

// Computed display name from callsign + aircraft_indices (e.g. "חנית/1+2")
export const getFormationDisplayName = (strip: any): string => {
  if (!strip) return '';
  const base = strip.callSign || strip.callsign || '';
  let raw = strip.aircraft_indices;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
  const indices: number[] | null = Array.isArray(raw) && raw.length > 0 ? raw : null;
  if (!indices) return base;
  return `${base}/${[...indices].sort((a, b) => a - b).join('+')}`;
};

export const getTransferLabel = (t: any): string => {
  const base = t.callSign || t.callsign || '';
  let raw = t.aircraft_indices;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
  const indices: number[] | null = Array.isArray(raw) && raw.length > 0 ? raw : null;
  if (indices) {
    return `${base}/${[...indices].sort((a, b) => a - b).join('+')}`;
  }
  const count = t.numberOfFormation || t.number_of_formation || '';
  return count ? `${base}/${count}` : base;
};

export const getTransferSq = (t: any): string => t.sq || t.squadron || '';

export const normalizeAlt = (raw: string): string => {
  if (!raw) return raw;
  const s = raw.trim();
  const rangeMatch = s.match(/^[Ff][Ll]?\s*(\d+)\s*[-–]\s*[Ff]?[Ll]?\s*(\d+)$/) ||
                     s.match(/^(\d+)\s*[-–]\s*[Ff]?[Ll]?\s*(\d+)$/) ||
                     s.match(/^[Ff][Ll]?\s*(\d+)\s*[-–]\s*(\d+)$/) ||
                     s.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (rangeMatch) return `${rangeMatch[1]}-${rangeMatch[2]}`;
  const singleMatch = s.match(/^[Ff][Ll]?\s*(\d+)$/);
  if (singleMatch) return singleMatch[1];
  return s;
};

// Parse an altitude string into feet (same logic as VerticalView's parseAltSingle)
export const parseAltToFeet = (raw: string): number | null => {
  if (!raw) return null;
  const u = raw.trim().toUpperCase().replace(/,/g, '');
  const fl = u.match(/^F[L]?(\d+)/);
  if (fl) return parseInt(fl[1]) * 100;
  const num = u.match(/^(\d+)$/);
  if (num) {
    const n = parseInt(num[1]);
    return (n >= 100 && n <= 999) ? n * 100 : n;
  }
  return null;
};

// Parse an altitude/block string into a [low, high] FL range (raw numbers, as used
// by conflict deltas — multiply by 100 for feet). "320-395"→[320,395]; "320"→[320,320];
// "FL270"→[270,270]. null if no number. Fixes conflict checks that previously used
// only the first (lowest) number of a multi-altitude block.
export const parseAltRange = (alt: string | null | undefined): [number, number] | null => {
  if (!alt) return null;
  const nums = String(alt).match(/\d+/g);
  if (!nums || nums.length === 0) return null;
  const vals = nums.map(n => parseInt(n, 10)).filter(n => !isNaN(n));
  if (vals.length === 0) return null;
  return [Math.min(...vals), Math.max(...vals)];
};

// Vertical gap (in FL units) between two altitude ranges; 0 if they overlap.
export const altRangeGap = (a: [number, number], b: [number, number]): number =>
  Math.max(0, Math.max(a[0], b[0]) - Math.min(a[1], b[1]));

export const computeBlockDeviation = (
  s: any, allBlocks: any[], _blockTables: any[],
  activeBlockTableId?: number | null, viewerPresetId?: number | null,
): boolean => {
  if (!activeBlockTableId) return false;
  if (!s.alt) return false;
  const effectivePresetId = s.workstation_preset_id ? Number(s.workstation_preset_id) : (viewerPresetId ? Number(viewerPresetId) : null);
  if (!effectivePresetId) return false;

  const rawAlt = String(s.alt).trim().toUpperCase().replace(/,/g, '');
  const flMatch = rawAlt.match(/^F[L]?(\d+)/);
  const numMatch = rawAlt.match(/^(\d+)/);
  const altFL = flMatch ? parseInt(flMatch[1]) : (numMatch ? parseInt(numMatch[1]) : null);
  if (altFL === null) return false;

  const presetId = effectivePresetId;
  const tableBlocks = allBlocks.filter((b: any) => b.block_table_id === activeBlockTableId);
  if (tableBlocks.length === 0) return false;

  const myBlocks = tableBlocks.filter((b: any) => {
    const ws = Array.isArray(b.workstations) ? b.workstations.map(Number) : [];
    return ws.length === 0 || ws.includes(presetId);
  });
  if (myBlocks.length === 0) return false;

  return !myBlocks.some((b: any) => altFL >= Number(b.alt_from) && altFL <= Number(b.alt_to));
};
