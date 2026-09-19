import type { CSSProperties } from 'react';

/**
 * רקע הדסק החופשי - שורות (כמו מחברת) או משבצות, בקו רציף / מקווקו / מנוקד.
 *
 * הרקע הוא CSS על האלמנט ולא ציור על ה-canvas, ולכן:
 * - המחק לא מוחק אותו ו"נקה" לא מעלים אותו
 * - הוא לא נכנס ל-toDataURL של הציור (שנשמר בין מצבים)
 * - שינוי גודל השורה/המשבצת לא נוגע במה שכבר נכתב
 */
export type DeskBackgroundKind = 'none' | 'lines' | 'grid';
export type DeskBackgroundLine = 'solid' | 'dashed' | 'dotted';
export interface DeskBackground {
  kind: DeskBackgroundKind;
  /** גובה שורה / צלע משבצת, בפיקסלים */
  size: number;
  line: DeskBackgroundLine;
}

export const DESK_BG_MIN_SIZE = 16;
export const DESK_BG_MAX_SIZE = 80;
export const DEFAULT_DESK_BACKGROUND: DeskBackground = { kind: 'none', size: 28, line: 'solid' };

/** הדסק הוא "דף" לבן בכל התמות - צבע הקו הוא צבע נייר, לא צבע תמה */
const LINE_COLOR = '#94a3b8';

/**
 * מחזור הקווקוו מחושב כך שמספר שלם של מחזורים נכנס בצלע האריח,
 * אחרת הקו נשבר בתפר בין אריח לאריח (מקף קצר/כפול כל אריח).
 */
export function dashPattern(line: DeskBackgroundLine, size: number): [number, number] | null {
  if (line === 'solid') return null;
  const target = line === 'dashed' ? 8 : 5;
  const period = size / Math.max(1, Math.round(size / target));
  const on = line === 'dashed' ? period * 0.6 : 1.2;
  return [on, period - on];
}

export function deskBackgroundStyle(bg: DeskBackground): CSSProperties {
  if (bg.kind === 'none') return {};
  const s = bg.size;
  const edge = s - 0.5; // קו ברוחב 1px ממורכז על הפיקסל האחרון באריח
  const dash = dashPattern(bg.line, s);
  const stroke = `stroke="${LINE_COLOR}" stroke-width="1"${dash ? ` stroke-dasharray="${dash.map(n => +n.toFixed(3)).join(' ')}"` : ''}${bg.line === 'dotted' ? ' stroke-linecap="round"' : ''}`;
  const lines = [`<line x1="0" y1="${edge}" x2="${s}" y2="${edge}" ${stroke}/>`];
  if (bg.kind === 'grid') lines.push(`<line x1="${edge}" y1="0" x2="${edge}" y2="${s}" ${stroke}/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">${lines.join('')}</svg>`;
  return {
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    backgroundSize: `${s}px ${s}px`,
    backgroundRepeat: 'repeat',
  };
}

/** ערך מ-localStorage עלול להיות שבור או ישן - כל שדה לא תקין חוזר לברירת המחדל */
export function normalizeDeskBackground(raw: unknown): DeskBackground {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const kind = (['none', 'lines', 'grid'] as const).find(k => k === o.kind) ?? DEFAULT_DESK_BACKGROUND.kind;
  const line = (['solid', 'dashed', 'dotted'] as const).find(k => k === o.line) ?? DEFAULT_DESK_BACKGROUND.line;
  const n = typeof o.size === 'number' && Number.isFinite(o.size) ? Math.round(o.size) : DEFAULT_DESK_BACKGROUND.size;
  return { kind, line, size: Math.min(DESK_BG_MAX_SIZE, Math.max(DESK_BG_MIN_SIZE, n)) };
}
