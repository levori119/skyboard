/**
 * **שכבת המרחבים המולאמים על המפה.**
 *
 * SVG משלה, ב-`viewBox="0 0 100 100"` של אחוזי תמונת המפה - בדיוק כמו שכבת
 * האזורים - ומעליה, כי מרחב מולאם הוא מידע שגובר על ההצגה הרגילה. `pointerEvents:
 * none` כדי שלא תחסום גרירת פ"מ אל האזור שמתחתיה: זו שכבת **מידע**, לא פקד.
 *
 * הפוליגון מגיע כבר מוקרן למפה של העמדה הזו (`useTempZoneSeizures.projected`);
 * כאן רק ציור.
 */

import React from 'react';
import { tr } from '../../i18n/tr';
import { bidiAuto } from '../../utils/bidi';
import { seizureRangeLabel } from '../../utils/tempZoneSeizure';
import { projectSeizure } from './useTempZoneSeizures';
import type { MapGeoAnchor } from '../../utils/geo';
import type { TempZoneSeizure } from '../../types';

interface Props {
  bounds: { top: number; left: number; width: number; height: number };
  seizures: TempZoneSeizure[];
  /** עוגני **המפה הזו**. במפה כפולה כל פאנל מקרין בעוגנים שלו. */
  anchor: MapGeoAnchor | null;
  zIndex?: number;
}

export default function SeizureLayer({ bounds, seizures, anchor, zIndex = 4 }: Props) {
  const drawable = seizures
    .map(s => ({ s, pts: projectSeizure(s, anchor) }))
    .filter(d => d.pts.length >= 3);
  if (!drawable.length) return null;

  return (
    <svg data-seizure-layer="" viewBox="0 0 100 100" preserveAspectRatio="none"
      style={{
        position: 'absolute', top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height,
        pointerEvents: 'none', zIndex, overflow: 'visible',
      }}>
      {drawable.map(({ s, pts }) => {
        const poly = pts.map(p => `${p.x},${p.y}`).join(' ');
        const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
        const top = Math.min(...pts.map(p => p.y));
        const range = seizureRangeLabel(s);
        return (
          <g key={s.id}>
            <polygon points={poly} fill={`${s.color}22`} stroke={s.color} strokeWidth={0.9} strokeDasharray="2.5,1.5" />
            <text x={cx} y={top + 2} textAnchor="middle" dominantBaseline="middle"
              fill={s.color} fontSize="2.1" fontWeight="bold" style={{ userSelect: 'none' }}>
              ⛶ {bidiAuto(s.name)}
            </text>
            <text x={cx} y={top + 4.3} textAnchor="middle" dominantBaseline="middle"
              fill={s.color} fontSize="1.6" style={{ userSelect: 'none' }}>
              {bidiAuto(range || tr('seizure.allAlts'))} · {bidiAuto(s.creator_preset_name)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
