/**
 * **שכבת המרחבים המולאמים על המפה.**
 *
 * SVG משלה, ב-`viewBox="0 0 100 100"` של אחוזי תמונת המפה - בדיוק כמו שכבת
 * האזורים - ומעליה, כי מרחב מולאם הוא מידע שגובר על ההצגה הרגילה.
 *
 * ── למה הקו נראה אחרת מקו של אזור ──────────────────────────────────────────
 * על המפה כבר יש שני קווים מקווקווים: גבול אזור (`2,1`) ואזור סגור/מוגבל
 * (`2.5,1.5`). מרחב מולאם הוא **ישות אחרת לגמרי** - לא גבול קבוע אלא אירוע
 * חולף - ולכן הוא מצויר ב**קו-נקודה** (`—·—·—`), הסימון המקובל למרחב זמני.
 * ההבחנה נעשית במבט אחד, בלי לקרוא תווית ובלי להסתמך על הצבע (שנבחר פר-הלאמה
 * ולכן אינו מזהה סוג).
 *
 * ── מה לוחצים ──────────────────────────────────────────────────────────────
 * הפקד הוא **הקו והתווית**, ולא פנים המרחב - בדיוק כמו תפריט האזור
 * (CLAUDE.md §אזור סגור). פנים המרחב חייב להישאר יעד שחרור של פ"מ: הלאמה
 * מתריעה ואינה חוסמת, וגרירה אליה היא פעולה לגיטימית שאסור לבלוע בשכבה שקופה.
 * לכן `pointer-events` יושב על ה**קו בלבד** (`stroke`) ועל התווית.
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
  /** לחיצה על קו המרחב או על תוויתו - פותחת את פרטי ההלאמה. */
  onOpen?: (s: TempZoneSeizure) => void;
  zIndex?: number;
}

/**
 * קו-נקודה: מקטע ארוך · רווח · נקודה (אורך ~0 עם `linecap:round`) · רווח.
 * זה מה שהופך את הקו ל-`—·—·—` ולא לעוד קו מקווקו.
 */
export const SEIZURE_DASH = '3.2 1.4 0.01 1.4';
/** רוחב קו התפיסה הבלתי-נראה. אצבע על Cintiq אינה מדייקת לרוחב 0.9. */
const HIT_WIDTH = 3.2;

export default function SeizureLayer({ bounds, seizures, anchor, onOpen, zIndex = 4 }: Props) {
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
        // ⚠️ `pointerdown` ולא `click`: בעט ובאצבע ה-click המסונתז נבלע כשהמצביע
        // זז מעט בין הירידה לעלייה, והלחיצה פשוט "לא נתפסת".
        const open = onOpen
          ? (e: React.PointerEvent) => { e.stopPropagation(); onOpen(s); }
          : undefined;
        return (
          <g key={s.id}>
            <polygon points={poly} fill={`${s.color}22`} stroke={s.color} strokeWidth={0.9}
              strokeDasharray={SEIZURE_DASH} strokeLinecap="round" strokeLinejoin="round" />
            {/* קו תפיסה בלתי-נראה: רחב לאצבע, ותופס **רק על הקו** - פנים המרחב
                נשאר יעד שחרור של פ"מ */}
            {open && (
              <polygon data-seizure-hit={s.id} points={poly} fill="none" stroke="transparent"
                strokeWidth={HIT_WIDTH} strokeLinejoin="round" onPointerDown={open}
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}>
                <title>{tr('seizure.clickHint')}</title>
              </polygon>
            )}
            <text x={cx} y={top + 2} textAnchor="middle" dominantBaseline="middle"
              fill={s.color} fontSize="2.1" fontWeight="bold"
              onPointerDown={open}
              style={{ userSelect: 'none', pointerEvents: open ? 'all' : 'none', cursor: open ? 'pointer' : 'default' }}>
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
