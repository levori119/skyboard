import { tr } from '../../i18n/tr';
import { bidiAuto } from '../../utils/bidi';
import {
  aidLabels,
  centerlineDashes,
  derivedRunwayWidth,
  designatorFontSize,
  designatorText,
  runwayAxis,
  runwayQuad,
  thresholdBars,
  type RunwayGeo,
} from '../../utils/runwayShape';
import {
  AID_STATUS_KEY,
  aidMarksForEnd,
  aidStatusColor,
  aidStatusCrossed,
  type RunwayAidDef,
  type RunwayAidStatusRow,
} from '../../utils/runwayAids';

// שכבת מסלולי ההמראה על מפת השדה - מצוירים כ**מסלול** ולא כקו.
//
// קו בעובי אחיד אינו נושא מידע מלבד "יש כאן מסלול". השרטוט כאן נושא את מה שהפקח
// צריך במבט אחד: רוחב אמיתי ביחס לסביבה, ספי מסלול בשני הקצוות, קו מרכז מקווקו
// ומספר הכיוון בכל קצה - מסובב לכיוון הטיסה מאותו קצה, כמו על המסלול עצמו.
//
// הרכיב נטוע ב-SVG של המפה (viewBox="0 0 100 100" באחוזי תמונה) ואינו יודע דבר
// על ה-DOM שסביבו, בדיוק כמו TrafficPatternLayer.

export interface RunwayRow extends RunwayGeo, RunwayAidDef {
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
  /**
   * מספר הכיוון על המסלול (33R). דולק כברירת מחדל בכוונה: הוא **הזהות** של
   * המסלול ולא תווית עזר - מסלול בלי מספר אינו אומר לפקח באיזה קצה הוא מסתכל.
   */
  showLabels?: boolean;
  /**
   * סטטוס אמצעי הנחיתה (/api/runway-aid-status). בלעדיו האמצעים המוגדרים
   * מצוירים כתקינים - כך שגם עמדת הניהול, שאין לה מצב חי, מראה את הסימון.
   */
  aidStatuses?: RunwayAidStatusRow[];
}

const ASPHALT = '#1f2937';
const EDGE = '#e5e7eb';
const MARKING = '#f8fafc';
const CLOSED = '#ef4444';

export default function RunwayLayer({ runways, aspect, sz, width, showLabels = true, aidStatuses = [] }: Props) {
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

            {/* אמצעי הנחיתה של כל קצה - בין הזברה למספר, בכיוון המסלול.
                בדיוק כמו על המסלול האמיתי: הנוחת חוצה את הסף, קורא את האמצעים
                ואז את מספר הכיוון. הצבע הוא הסטטוס, ה-X הוא "לא שמיש",
                וה-HINT נושא את הערת ההחרגה. */}
            {(['a', 'b'] as const).flatMap(side => {
              const marks = aidMarksForEnd(rw, side, aidStatuses);
              if (!marks.length) return [];
              return aidLabels(rw, aspect, w, side, marks.map(m => m.type)).map((l, i) => {
                const m = marks[i];
                const fs = l.fontSize * sz;
                const halfW = (m.type.length * 0.58 * fs) / 2;
                const halfH = fs * 0.62;
                const hint = `${m.type} - ${tr(AID_STATUS_KEY[m.status])}${m.note ? `: ${m.note}` : ''}`;
                return (
                  <g key={`aid-${side}-${m.type}`} data-testid="runway-aid"
                    data-aid-type={m.type} data-aid-status={m.status}
                    transform={`rotate(${l.rotation} ${l.at.x} ${l.at.y})`}
                    /* רק אמצעי עם הערה "לוכד" מצביע - כדי שה-HINT יעבוד בלי
                       שסימון שקט יגנוב תחילת גרירה של המפה */
                    style={{ pointerEvents: m.note ? 'auto' : 'none' }}>
                    <text x={l.at.x} y={l.at.y} textAnchor="middle" dominantBaseline="central"
                      fill={closed ? CLOSED : aidStatusColor(m.status)} fontSize={fs}
                      fontWeight="bold" fontFamily="monospace" style={{ userSelect: 'none' }}>
                      {m.type}
                    </text>
                    {aidStatusCrossed(m.status) && (
                      <>
                        <line x1={l.at.x - halfW} y1={l.at.y - halfH} x2={l.at.x + halfW} y2={l.at.y + halfH}
                          stroke={aidStatusColor(m.status)} strokeWidth={fs * 0.16} strokeLinecap="round" />
                        <line x1={l.at.x + halfW} y1={l.at.y - halfH} x2={l.at.x - halfW} y2={l.at.y + halfH}
                          stroke={aidStatusColor(m.status)} strokeWidth={fs * 0.16} strokeLinecap="round" />
                      </>
                    )}
                    <title>{bidiAuto(hint)}</title>
                  </g>
                );
              });
            })}

            {/* מספר הכיוון בכל קצה, מסובב לכיוון הטיסה מאותו קצה */}
            {showLabels && des && [des.a, des.b].filter(d => d.text).map((d, i) => (
              <text key={`d${i}`} data-testid="runway-designator" x={d.at.x} y={d.at.y}
                textAnchor="middle" dominantBaseline="central"
                fill={closed ? CLOSED : MARKING} fontSize={designatorFontSize(w) * sz} fontWeight="bold"
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
