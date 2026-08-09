import { bidiAuto } from '../../utils/bidi';
import { normalizeGeometry, patternLegs, type LegKey, type Pt } from '../../utils/trafficPattern';
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
  /** סטטוס הטיסה - קובע על איזו צלע המטוס יושב, ואם בכלל. */
  flight_status?: string | null;
}

interface Props {
  patterns: PatternRow[];
  aircraft: PatternAircraftRow[];
  aspect: number;
  sz: number;
}

/**
 * הצלע שעליה יושב המטוס לפי סטטוס הטיסה.
 *
 * `cleared_to_land` = קיבל אישור נחיתה, כלומר הוא כבר **בפיינל** ולא ממתין
 * ב"עם הרוח" - וזה בדיוק מה שהפקח צריך לראות במבט אחד. `landed` נחת ואינו
 * באוויר, ולכן אינו מצויר כלל (null). כל השאר ממתינים ב"עם הרוח".
 */
export function legForFlightStatus(status?: string | null): LegKey | null {
  const s = String(status ?? '').trim();
  // נחת = לא באוויר, ולכן אינו מצויר. "ירוקים" **אינו** מצב אלא דגל דיווח
  // (`strip_aircraft.greens`), ולכן אינו מוריד את המטוס מהצלע שבה הוא נמצא.
  if (s === 'landed') return null;
  if (s === 'base') return 'base';
  // `cleared_to_land` הוא השם ההיסטורי של פיינל
  if (s === 'final' || s === 'cleared_to_land') return 'final';
  return 'downwind';
}

/** נקודה על צלע נתונה לפי שבר 0..1. */
export function legPoint(pattern: PatternRow, aspect: number, legKey: LegKey, frac: number | null | undefined): Pt | null {
  const leg = patternLegs(normalizeGeometry(pattern.geometry), aspect).find(l => l.key === legKey);
  if (!leg) return null;
  const f = frac == null || !Number.isFinite(frac) ? 0.5 : Math.max(0, Math.min(1, frac));
  return { x: leg.from.x + (leg.to.x - leg.from.x) * f, y: leg.from.y + (leg.to.y - leg.from.y) * f };
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

/**
 * פיזור המטוסים לאורך צלע ה"עם הרוח" כך ש**לא יישבו זה על זה**.
 * שני מטוסים שנגררו לאותה הקפה נחתו על אותו שבר (מרכז הצלע) ואחד הסתיר את
 * השני - כלומר בדיוק המידע שהפקח צריך לראות נעלם. כאן הם נשארים **צמודים**
 * (זו אותה הקפה) אבל נפרדים: כל אחד מוזח בתורו לאורך הצלע, ובאורך צלע קצר
 * ההזחה מתכווצת כדי שכולם יישארו עליה.
 */
/** גודל תווית המטוס על ההקפה, ביחידות ה-SVG של המפה (אחוז מגובה התמונה). */
export const FONT = 1.13;

export function spreadFracs(count: number, base: number, gap: number): number[] {
  if (count <= 1) return [base];
  const step = Math.min(gap, 0.9 / (count - 1));
  const start = base - (step * (count - 1)) / 2;
  return Array.from({ length: count }, (_, i) => Math.max(0.03, Math.min(0.97, start + step * i)));
}

export default function PatternAircraftLayer({ patterns, aircraft, aspect, sz }: Props) {
  const byId = new Map(patterns.map(p => [Number(p.id), p]));

  // קיבוץ לפי הקפה + שבר, כדי לזהות מי יושב על מי. הסדר יציב (או"ק ואז מספר
  // המטוס) ולא לפי סדר ההגעה מהשרת - אחרת המטוסים מתחלפים בין רענונים.
  const groups = new Map<string, PatternAircraftRow[]>();
  for (const ac of aircraft) {
    if (ac.pattern_id == null) continue;
    const frac = ac.pattern_frac == null || !Number.isFinite(ac.pattern_frac) ? 0.5 : ac.pattern_frac;
    const key = `${ac.pattern_id}|${frac.toFixed(2)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ac);
  }

  // הפיזור נעשה **פר-צלע**: מטוס שקיבל אישור נחיתה עבר לפיינל, ואין סיבה
  // שיתחרה על מקום עם מי שעדיין ממתין ב"עם הרוח". מטוס שנחת יורד כאן.
  const placed: { ac: PatternAircraftRow; frac: number; leg: LegKey }[] = [];
  for (const rows of groups.values()) {
    const byLeg = new Map<LegKey, PatternAircraftRow[]>();
    for (const ac of rows) {
      const leg = legForFlightStatus(ac.flight_status);
      if (!leg) continue;                       // נחת - לא באוויר, לא מצויר
      byLeg.set(leg, [...(byLeg.get(leg) || []), ac]);
    }
    for (const [leg, list] of byLeg) {
      const sorted = [...list].sort((a, b) =>
        String(a.label || '').localeCompare(String(b.label || '')) || a.aircraft_idx - b.aircraft_idx);
      // בפיינל אין משמעות ל-frac ששמור מהגרירה ל"עם הרוח" - הוא מרוכז מחדש
      const base = leg === 'downwind' && Number.isFinite(sorted[0].pattern_frac as number)
        ? (sorted[0].pattern_frac as number) : 0.5;
      const fracs = spreadFracs(sorted.length, base, 0.13);
      sorted.forEach((ac, i) => placed.push({ ac, frac: fracs[i], leg }));
    }
  }

  return (
    <g>
      {placed.map(({ ac, frac, leg }) => {
        const pat = byId.get(Number(ac.pattern_id));
        if (!pat) return null;
        const pt = legPoint(pat, aspect, leg, frac);
        if (!pt) return null;
        const col = pat.color || '#38bdf8';
        const label = ac.label || String(ac.aircraft_idx);
        // התווית הוקטנה בשליש (1.7 -> 1.13): התיבות תפסו נתח מהמפה והסתירו
        // את השרטוט. התיבה נגזרת מהפונט ולכן מתכווצת איתו - רוחב לפי אורך
        // התווית, כדי שאו"ק שלם לא ייחתך.
        const fs = FONT * sz;
        const w = Math.max(4.7, label.length * 0.77 + 1.6) * sz;
        const h = 2.3 * sz;
        return (
          <g key={`${ac.strip_id}-${ac.aircraft_idx}`} data-testid="pattern-aircraft"
            data-strip-id={String(ac.strip_id)} data-aircraft-idx={ac.aircraft_idx}
            data-in-pattern={ac.in_pattern ? '1' : '0'} style={{ pointerEvents: 'none' }}>
            <rect x={pt.x - w / 2} y={pt.y - h / 2} width={w} height={h} rx={0.6 * sz}
              fill="#000000cc" stroke={col} strokeWidth={0.4 * sz}
              strokeDasharray={ac.in_pattern ? undefined : `${1.1 * sz},${0.8 * sz}`} />
            <text x={pt.x} y={pt.y} textAnchor="middle" dominantBaseline="central"
              fill={col} fontSize={fs} fontWeight="bold" style={{ userSelect: 'none' }}>
              {bidiAuto(label)}
            </text>
          </g>
        );
      })}
    </g>
  );
}
