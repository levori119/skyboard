/**
 * **שכבת המרחבים המולאמים על המפה.**
 *
 * SVG משלה, ב-`viewBox="0 0 100 100"` של אחוזי תמונת המפה - בדיוק כמו שכבת
 * האזורים - ומעליה, כי מרחב מולאם הוא מידע שגובר על ההצגה הרגילה.
 *
 * ── למה הקו נראה אחרת מקו של אזור ──────────────────────────────────────────
 * על המפה כבר יש שני קווים מקווקווים: גבול אזור (`2,1`) ואזור סגור/מוגבל
 * (`2.5,1.5`). מרחב מולאם הוא **ישות אחרת לגמרי** - לא גבול קבוע אלא אירוע
 * חולף - ולכן הוא מצויר ב**שלוש נקודות ומקף** (`···—···—`), תבנית שאין לה אח
 * על המפה. ההבחנה נעשית במבט אחד, בלי לקרוא תווית ובלי להסתמך על הצבע (שנבחר
 * פר-הלאמה ולכן אינו מזהה סוג).
 *
 * הקו עצמו **דק**: המרחב מכסה שטח גדול, וקו עבה סביבו מתחרה באזורים ובפ"מים
 * שבתוכו. התבנית והצבע נושאים את המשמעות, לא העובי.
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
import { estimateTextWidth, interiorLabelPoint, lightenHex } from '../../utils/zoneLabel';
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
  /** תמה בהירה: התווית נשארת בצבע ההלאמה. בתמה כהה היא מובהרת. */
  light?: boolean;
}

/**
 * **שלוש נקודות ומקף** - `···—···—`.
 *
 * הקריאה: `0.01` הוא נקודה (אורך אפס שנצבע כעיגול הודות ל-`linecap:round`),
 * `1.1` הוא הרווח שאחריה, והמקטע `2.6` הוא המקף. שלוש נקודות ואז מקף, וחוזר
 * חלילה - תבנית שאין לה אח על המפה: גבול אזור הוא `2,1` ואזור סגור `2.5,1.5`,
 * ושניהם קווקו אחיד.
 */
export const SEIZURE_DASH = '0.01 1.1 0.01 1.1 0.01 1.1 2.6 1.4';

/**
 * עובי הקו. **דק בכוונה**: המרחב המולאם מכסה שטח גדול על המפה, וקו עבה סביבו
 * מתחרה באזורים עצמם ובפ"מים שבתוכו. התבנית והצבע נושאים את המשמעות, לא העובי.
 */
export const SEIZURE_STROKE_W = 0.5;
/**
 * משקל התווית. **דק בכוונה**: התווית יושבת מעל המפה ומעל שם האזור שמתחתיה,
 * ומשקל כבד הופך אותה מסימון למסך שמכסה את מה שהיא אמורה לתאר. הצבע והמיקום
 * נושאים את המשמעות - לא העובי. הבהירות מגיעה מ**גוון מובהר והילה**, לא מעובי.
 */
export const SEIZURE_LABEL_WEIGHT = 300;
/** כמה מבהירים את צבע ההלאמה בתווית על רקע כהה (0..1). */
export const SEIZURE_LABEL_LIGHTEN = 0.45;

/** רוחב קו התפיסה הבלתי-נראה. אצבע על Cintiq אינה מדייקת לרוחב 0.9. */
const HIT_WIDTH = 3.2;

export default function SeizureLayer({ bounds, seizures, anchor, onOpen, zIndex = 4, light = false }: Props) {
  const halo = light ? 'rgba(255,255,255,0.85)' : 'rgba(2,6,23,0.85)';
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
        const range = seizureRangeLabel(s);
        // התווית יושבת **בתוך** המרחב: במרכזו כשהוא בפנים, ואחרת בשורה הקרובה
        // שיש בה מקום לשתי השורות. מרחב מצויר ביד הוא לעיתים קעור, וממוצע
        // הקודקודים שלו נפל מחוץ לקו - והתווית נקראה כשייכת לאזור השכן.
        const line1 = `⛶ ${s.name}`;
        const line2 = `${range || tr('seizure.allAlts')} · ${s.creator_preset_name ?? ''}`;
        const { x: cx, y: cy } = interiorLabelPoint(pts, undefined,
          Math.max(estimateTextWidth(line1, 2), estimateTextWidth(line2, 1.45)));
        const labelFill = light ? s.color : lightenHex(s.color, SEIZURE_LABEL_LIGHTEN);
        // ⚠️ `pointerdown` ולא `click`: בעט ובאצבע ה-click המסונתז נבלע כשהמצביע
        // זז מעט בין הירידה לעלייה, והלחיצה פשוט "לא נתפסת".
        const open = onOpen
          ? (e: React.PointerEvent) => { e.stopPropagation(); onOpen(s); }
          : undefined;
        return (
          <g key={s.id}>
            <polygon points={poly} fill={`${s.color}14`} stroke={s.color} strokeWidth={SEIZURE_STROKE_W}
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
            {/* שתי השורות מאוזנות סביב המרכז, ולכן הגוש כולו ממורכז - ולא השורה
                הראשונה בלבד עם השנייה תלויה מתחתיה. */}
            <text x={cx} y={cy - 1.15} textAnchor="middle" dominantBaseline="middle"
              fill={labelFill} fontSize="2" fontWeight={SEIZURE_LABEL_WEIGHT} letterSpacing="0.06"
              stroke={halo} strokeWidth={0.4} paintOrder="stroke" strokeLinejoin="round"
              onPointerDown={open}
              style={{ userSelect: 'none', pointerEvents: open ? 'all' : 'none', cursor: open ? 'pointer' : 'default' }}>
              ⛶ {bidiAuto(s.name)}
            </text>
            <text x={cx} y={cy + 1.35} textAnchor="middle" dominantBaseline="middle"
              fill={labelFill} fontSize="1.45" fontWeight={SEIZURE_LABEL_WEIGHT} letterSpacing="0.04"
              stroke={halo} strokeWidth={0.3} paintOrder="stroke" strokeLinejoin="round"
              style={{ userSelect: 'none' }}>
              {bidiAuto(range || tr('seizure.allAlts'))} · {bidiAuto(s.creator_preset_name)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
