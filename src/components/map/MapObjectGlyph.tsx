// ציור אובייקט על מפה - רכיב **אחד** לעורך המפה (ניהול) ולמפת העמדה, כדי
// שמה שמנהל המערכת רואה בעורך הוא בדיוק מה שהפקח/בקר יראה. ראה MAP_OBJECTS_SPEC.md.
//
// הציור בפיקסלים של שכבה שמכסה בדיוק את תמונת המפה (W x H) ולא ב-viewBox של
// 100x100: מפה אינה ריבועית, ומתיחה לא-אחידה הייתה הופכת עיגול לאליפסה.
// הצורה עצמה גדלה עם זום המפה (היא חלק מהמפה), אבל עובי הקו והתווית מחולקים
// בזום - כדי שיישארו קריאים בכל זום, כמו תוויות האזורים.

import React from 'react';
import { bidiAuto } from '../../utils/bidi';
import { mapObjectPath, mapObjectPixels, type MapObject } from '../../utils/mapObjects';

/** צבעי ההילה והתווית לפי תמה - כהה (dark/ocean) או בהירה (light). */
export function mapObjectInk(light: boolean) {
  return {
    halo: light ? 'rgba(255,255,255,0.9)' : 'rgba(2,6,23,0.85)',
    label: light ? '#0f172a' : '#f1f5f9',
  };
}

/** גודל התווית בפיקסלי מסך (לפני חלוקה בזום). */
const LABEL_PX = 12;

export const MapObjectGlyph = ({ o, W, H, zoom, light, selected, hitPad, gProps }: {
  o: MapObject; W: number; H: number;
  /** זום המפה - עובי קו ותווית מחולקים בו כדי להישאר בגודל מסך קבוע */
  zoom: number;
  light: boolean;
  /** עורך: טבעת סימון סביב האובייקט הנבחר */
  selected?: boolean;
  /** עורך: שטח נגיעה מינימלי (פיקסלי מסך) - כדי שאובייקט קטן או קו מתאר דק יהיו ניתנים לגרירה באצבע */
  hitPad?: number;
  gProps?: React.SVGProps<SVGGElement>;
}) => {
  const z = zoom > 0 ? zoom : 1;
  const { cx, cy, r } = mapObjectPixels(o, W, H);
  const ink = mapObjectInk(light);
  const d = mapObjectPath(o.shape, r);
  const sw = 2 / z;
  const fs = LABEL_PX / z;
  const hit = hitPad ? Math.max(r, hitPad / z) : 0;
  return (
    <g transform={`translate(${cx} ${cy})`} data-map-object-id={o.id} {...gProps}>
      {hit > 0 && <rect x={-hit} y={-hit} width={hit * 2} height={hit * 2} fill="transparent" />}
      {o.filled ? (
        // מלא: הצבע עם קו הילה דק - כך הצורה בולטת גם על רקע באותו גוון
        <path d={d} fill={o.color} fillOpacity={0.85} stroke={ink.halo} strokeWidth={1.2 / z} strokeLinejoin="round" />
      ) : (<>
        {/* קו מתאר: הילה מתחת לקו הצבעוני, לקריאות על כל רקע מפה */}
        <path d={d} fill="none" stroke={ink.halo} strokeWidth={sw + 2 / z} strokeLinejoin="round" />
        <path d={d} fill="none" stroke={o.color} strokeWidth={sw} strokeLinejoin="round" />
      </>)}
      {selected && (
        <rect x={-r - 4 / z} y={-r - 4 / z} width={2 * r + 8 / z} height={2 * r + 8 / z} rx={3 / z}
          fill="none" stroke={light ? '#0f172a' : '#ffffff'} strokeWidth={1.5 / z} strokeDasharray={`${4 / z},${3 / z}`} />
      )}
      {o.show_label && o.name && (
        <text x={0} y={r + 3 / z} textAnchor="middle" dominantBaseline="hanging" fontSize={fs} fontWeight="bold"
          fill={ink.label} stroke={ink.halo} strokeWidth={3 / z} paintOrder="stroke" strokeLinejoin="round"
          style={{ userSelect: 'none', pointerEvents: 'none' }}>
          {bidiAuto(o.name)}
        </text>
      )}
    </g>
  );
};

export default MapObjectGlyph;
