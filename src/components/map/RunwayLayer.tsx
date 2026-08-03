import { tr } from '../../i18n/tr';
import { bidiAuto } from '../../utils/bidi';
import {
  centerlineDashes,
  derivedRunwayWidth,
  designatorText,
  runwayAxis,
  runwayQuad,
  thresholdBars,
  type RunwayGeo,
} from '../../utils/runwayShape';

// שכבת מסלולי ההמראה על מפת השדה - מצוירים כ**מסלול** ולא כקו.
//
// קו בעובי אחיד אינו נושא מידע מלבד "יש כאן מסלול". השרטוט כאן נושא את מה שהפקח
// צריך במבט אחד: רוחב אמיתי ביחס לסביבה, ספי מסלול בשני הקצוות, קו מרכז מקווקו
// ומספר הכיוון בכל קצה - מסובב לכיוון הטיסה מאותו קצה, כמו על המסלול עצמו.
//
// הרכיב נטוע ב-SVG של המפה (viewBox="0 0 100 100" באחוזי תמונה) ואינו יודע דבר
// על ה-DOM שסביבו, בדיוק כמו TrafficPatternLayer.

export interface RunwayRow extends RunwayGeo {
  id: number;
  /** סגור לתנועה - נצבע באדום ומקבל X, כמו בדיאגרמת המסלולים בעמדה */
  is_closed?: boolean | null;
}

interface Props {
  runways: RunwayRow[];
  /** יחס התמונה (רוחב/גובה) - בלעדיו רוחב המסלול משתנה עם הכיוון */
  aspect: number;
  /** 1/זום המפה - עובי קו וגודל טקסט נשארים קבועים על המסך */
  sz: number;
  /** רוחב המסלול באחוז מגובה התמונה. ברירת מחדל נגזרת מאורך המסלול. */
  width?: number;
  showLabels?: boolean;
}

const ASPHALT = '#1f2937';
const EDGE = '#e5e7eb';
const MARKING = '#f8fafc';
const CLOSED = '#ef4444';

export default function RunwayLayer({ runways, aspect, sz, width, showLabels = true }: Props) {
  return (
    <g data-testid="runway-layer">
      {runways.map(rw => {
        const ax = runwayAxis(rw, aspect);
        if (!ax) return null;
        const w = width ?? derivedRunwayWidth(ax.length);
        const quad = runwayQuad(rw, aspect, w);
        if (!quad) return null;
        const closed = !!rw.is_closed;
        const des = designatorText(rw, aspect);
        const pts = (p: { x: number; y: number }[]) => p.map(q => `${q.x},${q.y}`).join(' ');

        return (
          <g key={rw.id} data-testid="runway-shape" data-runway-id={rw.id} style={{ pointerEvents: 'none' }}>
            {/* מיסעת האספלט */}
            <polygon points={pts(quad)} fill={ASPHALT} stroke={closed ? CLOSED : EDGE}
              strokeWidth={0.22 * sz} strokeLinejoin="round" opacity={0.95} />

            {/* קו המרכז המקווקו */}
            {centerlineDashes(rw, aspect, Math.max(1.2, ax.length / 14), Math.max(0.8, ax.length / 20)).map((d, i) => (
              <line key={`c${i}`} x1={d.from.x} y1={d.from.y} x2={d.to.x} y2={d.to.y}
                stroke={MARKING} strokeWidth={0.18 * sz} strokeLinecap="butt" opacity={0.85} />
            ))}

            {/* ספי המסלול (פסנתר) */}
            {thresholdBars(rw, aspect, w).map((b, i) => (
              <polygon key={`t${i}`} points={pts(b.points)} fill={MARKING} opacity={0.9} />
            ))}

            {/* מספר הכיוון בכל קצה, מסובב לכיוון הטיסה מאותו קצה */}
            {showLabels && des && [des.a, des.b].filter(d => d.text).map((d, i) => (
              <text key={`d${i}`} data-testid="runway-designator" x={d.at.x} y={d.at.y}
                textAnchor="middle" dominantBaseline="central"
                fill={closed ? CLOSED : MARKING} fontSize={Math.max(1.6, w * 0.55) * sz} fontWeight="bold"
                fontFamily="monospace" style={{ userSelect: 'none' }}
                /* סיבוב יחיד סביב נקודת הכיתוב. `transform-origin` נוסף היה מזיז
                   אותו מהמקום, כי rotate כבר נושא מרכז משלו. */
                transform={`rotate(${d.rotation} ${d.at.x} ${d.at.y})`}>
                {d.text}
              </text>
            ))}

            {/* מסלול סגור - X על כל אורכו */}
            {closed && (
              <>
                <line x1={quad[0].x} y1={quad[0].y} x2={quad[2].x} y2={quad[2].y} stroke={CLOSED} strokeWidth={0.35 * sz} />
                <line x1={quad[1].x} y1={quad[1].y} x2={quad[3].x} y2={quad[3].y} stroke={CLOSED} strokeWidth={0.35 * sz} />
              </>
            )}

            {showLabels && rw.name && (
              <title>{bidiAuto(`${tr('links.kindRunway')} ${rw.name}`)}</title>
            )}
          </g>
        );
      })}
    </g>
  );
}
