import { bidiAuto } from '../../utils/bidi';
import { normalizeGeometry, patternLegs, type Pt } from '../../utils/trafficPattern';
import type { PatternRow } from '../map/TrafficPatternLayer';

// ─── מטוסים על ההקפה ──────────────────────────────────────────────────────────
//
// מטוס שנגרר להקפה מסומן **במרכז צלע "עם הרוח"** (downwind), כי זו הצלע שבה
// המטוס ממתין ונראה מהמגדל. מסגרת **מקווקוות** = נגרר אבל עוד לא הוכנס רשמית;
// מסגרת **קבועה** = "שים בהקפה" נלחץ, והמטוס כבר אינו בטבלת ההצטרפות.
//
// השכבה מצוירת בתוך ה-SVG של המפה (viewBox 0..100 באחוזי תמונה), כמו שכבת
// ההקפות עצמה, ולכן היא נשארת מיושרת אליה בזום ובפאן בלי חישוב נוסף.

export interface PatternAircraftRow {
  strip_id: number | string;
  aircraft_idx: number;
  pattern_id?: number | null;
  in_pattern?: boolean;
  pattern_frac?: number | null;
  /** שם התצוגה של המטוס (או"ק + מספר במבנה), מחושב אצל הקורא. */
  label?: string;
}

interface Props {
  patterns: PatternRow[];
  aircraft: PatternAircraftRow[];
  aspect: number;
  sz: number;
}

/** נקודה על צלע ה"עם הרוח" לפי שבר 0..1. ברירת המחדל היא המרכז. */
export function downwindPoint(pattern: PatternRow, aspect: number, frac: number | null | undefined): Pt | null {
  const legs = patternLegs(normalizeGeometry(pattern.geometry), aspect);
  const leg = legs.find(l => l.key === 'downwind');
  if (!leg) return null;
  const f = frac == null || !Number.isFinite(frac) ? 0.5 : Math.max(0, Math.min(1, frac));
  return { x: leg.from.x + (leg.to.x - leg.from.x) * f, y: leg.from.y + (leg.to.y - leg.from.y) * f };
}

/**
 * ההקפה שצלע ה"עם הרוח" שלה הקרובה ביותר לנקודה, והשבר שעליה.
 * זה מה שהופך גרירה של מטוס אל אזור ההקפה לבחירת מסלול אוטומטית.
 */
export function nearestDownwind(
  patterns: PatternRow[], aspect: number, p: Pt,
): { pattern: PatternRow; frac: number; dist: number } | null {
  let best: { pattern: PatternRow; frac: number; dist: number } | null = null;
  for (const pat of patterns || []) {
    const legs = patternLegs(normalizeGeometry(pat.geometry), aspect);
    const leg = legs.find(l => l.key === 'downwind');
    if (!leg) continue;
    // הטלה על הקטע במרחב האיזוטרופי, אחרת תמונה לא ריבועית מטה את המרחק
    const ax = leg.from.x * aspect, ay = leg.from.y;
    const bx = leg.to.x * aspect, by = leg.to.y;
    const px = p.x * aspect, py = p.y;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0.5;
    const dist = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    if (!best || dist < best.dist) best = { pattern: pat, frac: t, dist };
  }
  return best;
}

export default function PatternAircraftLayer({ patterns, aircraft, aspect, sz }: Props) {
  const byId = new Map(patterns.map(p => [Number(p.id), p]));
  return (
    <g>
      {aircraft.map(ac => {
        const pat = ac.pattern_id != null ? byId.get(Number(ac.pattern_id)) : undefined;
        if (!pat) return null;
        const pt = downwindPoint(pat, aspect, ac.pattern_frac);
        if (!pt) return null;
        const col = pat.color || '#38bdf8';
        const w = 7 * sz, h = 3.4 * sz;
        return (
          <g key={`${ac.strip_id}-${ac.aircraft_idx}`} data-testid="pattern-aircraft"
            data-strip-id={String(ac.strip_id)} data-aircraft-idx={ac.aircraft_idx}
            data-in-pattern={ac.in_pattern ? '1' : '0'} style={{ pointerEvents: 'none' }}>
            <rect x={pt.x - w / 2} y={pt.y - h / 2} width={w} height={h} rx={0.6 * sz}
              fill="#000000cc" stroke={col} strokeWidth={0.4 * sz}
              strokeDasharray={ac.in_pattern ? undefined : `${1.1 * sz},${0.8 * sz}`} />
            <text x={pt.x} y={pt.y} textAnchor="middle" dominantBaseline="central"
              fill={col} fontSize={1.7 * sz} fontWeight="bold" style={{ userSelect: 'none' }}>
              {bidiAuto(ac.label || String(ac.aircraft_idx))}
            </text>
          </g>
        );
      })}
    </g>
  );
}
