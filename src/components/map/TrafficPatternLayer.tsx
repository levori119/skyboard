import React from 'react';
import { tr } from '../../i18n/tr';
import { bidiAuto } from '../../utils/bidi';
import {
  LEG_LABEL_KEYS,
  normalizeGeometry,
  patternLegs,
  patternPathD,
  patternPoints,
  resizeByCorner,
  translateGeometry,
  type PatternGeometry,
  type Pt,
} from '../../utils/trafficPattern';

// שכבת ההקפות על מפת השדה - **רכיב אחד** לתצוגה ולעריכה, כדי שההקפה שהמנהל
// משרטט תיראה בדיוק כפי שהיא תיראה בעמדה. הרכיב נטוע בתוך ה-SVG של המפה
// (viewBox="0 0 100 100" באחוזי תמונה) ואינו יודע דבר על ה-DOM שסביבו: המרת
// קואורדינטות המצביע לאחוזים מגיעה מבחוץ דרך toPct, כי רק ההורה מכיר את
// גבולות התמונה, הזום והגלילה.

export interface PatternRow {
  id: number;
  runway_id?: number | null;
  runway_ident?: string | null;
  color?: string | null;
  geometry?: unknown;
  elements?: PatternElementRow[];
}

export interface PatternElementRow {
  id: number;
  name?: string | null;
  icon?: string | null;
  color?: string | null;
  x_pct?: number | null;
  y_pct?: number | null;
}

interface Props {
  patterns: PatternRow[];
  /** יחס התמונה (רוחב/גובה) - בלעדיו מלבן ההקפה יוצא מעוות בתמונה לא ריבועית. */
  aspect: number;
  /** 1/זום המפה - כל עובי קו, רדיוס ידית וגודל טקסט מוכפל בו כדי להישאר קבוע על המסך. */
  sz: number;
  /** ההקפה שנמצאת כרגע בעריכה (ידיות גרירה + סיבוב). */
  editingId?: number | null;
  /** גאומטריית טיוטה של ההקפה הנערכת - גוברת על מה ששמור. */
  draft?: PatternGeometry | null;
  onDraftChange?: (g: PatternGeometry) => void;
  /** ממיר נקודת מצביע (clientX/clientY) לאחוזי תמונה. מחזיר null אם אין מפה. */
  toPct?: (clientX: number, clientY: number) => Pt | null;
}

type DragKind = { kind: 'corner'; index: number } | { kind: 'move'; from: Pt; origin: PatternGeometry } | { kind: 'rotate' };

const RAD = Math.PI / 180;

/** רדיוס עיגול הפינות של ההקפה, ביחידות iso - שרטוט ההקפה המקובל אינו מלבן חד. */
const CORNER_RADIUS = 2.2;

export default function TrafficPatternLayer({
  patterns, aspect, sz, editingId = null, draft = null, onDraftChange, toPct,
}: Props) {
  const dragRef = React.useRef<DragKind | null>(null);

  const geometryOf = (p: PatternRow): PatternGeometry =>
    p.id === editingId && draft ? draft : normalizeGeometry(p.geometry);

  const startDrag = (e: React.PointerEvent, kind: DragKind, g: PatternGeometry) => {
    if (!onDraftChange || !toPct) return;
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = kind;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (kind.kind === 'move') { kind.from = toPct(e.clientX, e.clientY) ?? kind.from; kind.origin = g; }
  };

  const onMove = (e: React.PointerEvent, g: PatternGeometry) => {
    const drag = dragRef.current;
    if (!drag || !onDraftChange || !toPct) return;
    const p = toPct(e.clientX, e.clientY);
    if (!p) return;
    e.stopPropagation();
    if (drag.kind === 'corner') onDraftChange(resizeByCorner(g, drag.index, p, aspect));
    else if (drag.kind === 'move') onDraftChange(translateGeometry(drag.origin, p.x - drag.from.x, p.y - drag.from.y));
    else {
      // סיבוב סביב העוגן: הכיוון החדש הוא הזווית מהסף אל המצביע, במרחב האיזוטרופי.
      const dx = (p.x - g.anchor.x) * aspect;
      const dy = p.y - g.anchor.y;
      if (Math.hypot(dx, dy) < 0.3) return; // קרוב מדי לעוגן - הזווית רועדת
      onDraftChange({ ...g, bearing: +(((Math.atan2(dx, -dy) / RAD) + 360) % 360).toFixed(2) });
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };

  return (
    <g>
      {patterns.map(p => {
        const g = geometryOf(p);
        const editing = p.id === editingId;
        const col = p.color || '#38bdf8';
        const pts = patternPoints(g, aspect);
        const legs = patternLegs(g, aspect);
        const tip = pts[5];
        const ident = (p.runway_ident || '').trim();

        // ראש החץ בסוף הפיינל - הוא שמסמן איזו צלע היא הפיינל ולאיזה כיוון טסים.
        const head = (() => {
          const size = 2.4 * sz;
          const a = g.bearing * RAD;
          const dx = Math.sin(a) / aspect, dy = -Math.cos(a);
          const nx = Math.cos(a) / aspect, ny = Math.sin(a);
          return [
            `${tip.x},${tip.y}`,
            `${tip.x - dx * size - nx * size * 0.45},${tip.y - dy * size - ny * size * 0.45}`,
            `${tip.x - dx * size + nx * size * 0.45},${tip.y - dy * size + ny * size * 0.45}`,
          ].join(' ');
        })();

        // ידית הסיבוב יושבת מעבר לקצה "אחרי המראה", על ציר המסלול.
        const rotHandle = (() => {
          const a = g.bearing * RAD;
          const d = 4 * sz;
          return { x: pts[1].x + (Math.sin(a) / aspect) * d, y: pts[1].y - Math.cos(a) * d };
        })();

        return (
          <g key={p.id} data-testid="pattern-shape" data-pattern-id={p.id} data-editing={editing ? '1' : '0'}
            style={{ pointerEvents: editing ? 'all' : 'none' }}
            onPointerMove={editing ? e => onMove(e, g) : undefined}
            onPointerUp={editing ? endDrag : undefined}
            onPointerCancel={editing ? endDrag : undefined}>

            {/* אזור פגיעה שקוף ורחב - גרירת ההקפה כולה למיקום */}
            {editing && (
              <path d={patternPathD(g, aspect, CORNER_RADIUS)} fill="none" stroke="transparent"
                strokeWidth={3 * sz} style={{ cursor: 'move' }}
                onPointerDown={e => startDrag(e, { kind: 'move', from: { x: 0, y: 0 }, origin: g }, g)} />
            )}

            <path d={patternPathD(g, aspect, CORNER_RADIUS)} fill="none" stroke={col}
              strokeWidth={(editing ? 0.7 : 0.5) * sz} strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={editing ? `${1.6 * sz},${1.1 * sz}` : undefined} opacity={editing ? 0.95 : 0.85} />

            <polygon points={head} fill={col} />

            {/* שם הצלע ליד הצלע, עם תוספת שם המסלול */}
            {legs.map(leg => {
              const off = 2.2 * sz;
              const label = [tr(LEG_LABEL_KEYS[leg.key]), ident].filter(Boolean).join(' ');
              // תווית שנדחפה מעבר לקצה המפה נחתכת - מקבעים אותה בתוך הגבולות
              const lx = Math.max(6 * sz, Math.min(100 - 6 * sz, leg.mid.x + leg.outward.x * off));
              const ly = Math.max(2 * sz, Math.min(100 - 2 * sz, leg.mid.y + leg.outward.y * off));
              return (
                <text key={leg.key} data-testid="pattern-leg-label" data-leg={leg.key}
                  x={lx} y={ly}
                  textAnchor="middle" dominantBaseline="middle" fill={col}
                  fontSize={1.7 * sz} fontWeight="bold"
                  style={{ pointerEvents: 'none', userSelect: 'none', paintOrder: 'stroke' }}
                  stroke="#000" strokeWidth={0.45 * sz} strokeLinejoin="round">
                  {bidiAuto(label)}
                </text>
              );
            })}

            {/* אלמנטים המשויכים להקפה הזו בלבד */}
            {(p.elements || []).filter(el => el.x_pct != null && el.y_pct != null).map(el => (
              <g key={el.id} style={{ pointerEvents: 'none' }}>
                <circle cx={Number(el.x_pct)} cy={Number(el.y_pct)} r={1.5 * sz}
                  fill="#00000099" stroke={el.color || '#f59e0b'} strokeWidth={0.35 * sz} />
                <text x={Number(el.x_pct)} y={Number(el.y_pct)} textAnchor="middle" dominantBaseline="central"
                  fontSize={1.7 * sz} style={{ userSelect: 'none' }}>{el.icon || '📍'}</text>
                <text x={Number(el.x_pct)} y={Number(el.y_pct) + 3.1 * sz} textAnchor="middle" dominantBaseline="middle"
                  fill={el.color || '#f59e0b'} fontSize={1.5 * sz} fontWeight="bold"
                  style={{ userSelect: 'none', paintOrder: 'stroke' }}
                  stroke="#000" strokeWidth={0.4 * sz} strokeLinejoin="round">
                  {bidiAuto(el.name || '')}
                </text>
              </g>
            ))}

            {editing && (
              <>
                {/* ידית סיבוב */}
                <line x1={pts[1].x} y1={pts[1].y} x2={rotHandle.x} y2={rotHandle.y}
                  stroke="#fbbf24" strokeWidth={0.3 * sz} strokeDasharray={`${0.6 * sz},${0.6 * sz}`} />
                <circle data-testid="pattern-rotate" cx={rotHandle.x} cy={rotHandle.y} r={1.5 * sz} fill="#fbbf24" stroke="#000" strokeWidth={0.35 * sz}
                  style={{ cursor: 'grab' }} onPointerDown={e => startDrag(e, { kind: 'rotate' }, g)} />
                <text x={rotHandle.x} y={rotHandle.y} textAnchor="middle" dominantBaseline="central"
                  fontSize={1.6 * sz} style={{ pointerEvents: 'none', userSelect: 'none' }}>⟳</text>

                {/* ידיות פינה - גרירה מאריכה את הצלעות הצמודות */}
                {pts.map((pt, i) => (
                  <circle key={i} data-testid="pattern-corner" data-corner={i} cx={pt.x} cy={pt.y} r={1.35 * sz}
                    fill={i === 5 ? '#22c55e' : '#ffffff'} stroke={i === 5 ? '#000' : col} strokeWidth={0.35 * sz}
                    style={{ cursor: i === 5 ? 'move' : 'nwse-resize' }}
                    onPointerDown={e => startDrag(
                      e,
                      i === 5 ? { kind: 'move', from: { x: 0, y: 0 }, origin: g } : { kind: 'corner', index: i },
                      g,
                    )} />
                ))}
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}
