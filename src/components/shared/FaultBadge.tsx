// ─── תג תקלה - רכיב משותף ────────────────────────────────────────────────────
//
// "לפ"מ הזה יש מטוס בתקלה" הוא **אותו מידע** בכל מסך שבו הפ"מ מופיע: על מפת
// אזורי הטיסה, בנקודת המעבר, בתצוגה הטבלאית, במוד האזרחי ובנקודת ההצטרפות
// במגדל. לכן תג אחד משותף, ולא חמישה סימונים שנראים אחרת בכל מסך (DRY).
//
// התג נושא את **מספר המטוס** ולא סימן בלבד: "⚠ 2" עונה מיד על *למי* יש תקלה,
// וה-HINT (בריחוף) עונה על *מה* - המהות והפירוט. כך המבט על המסך מספיק לזיהוי,
// והפרטים זמינים בלי לפתוח חלון.
//
// ⚠ הוא ערוץ **נוסף** על הצבע ולא קישוט: אדום לבדו נעלם מפקח עם עיוורון צבעים
// (FAA HF-STD-001 §3.2, Ahlstrom & Arend) - אותו עיקרון שלפיו הקונפליקט בנקודת
// ההצטרפות מסומן גם ב-⚠.
//
// המקור: `strip.aircraft_faults`, שהשרת מחשב מ-`strip_aircraft` ומסנן לפי
// `aircraft_indices` - ולכן בפ"מ מפוצל התג מופיע רק אצל הפ"מ שהמטוס נמצא בו.

import React from 'react';
import {
  hasAnyFault, formatFaultNumbers, formatFaultsHint, faultRedFor,
  type AircraftFault,
} from '../../utils/faults';
import { tr } from '../../i18n/tr';

export const FaultBadge = ({ faults, lightMode = false, size = 10, style }: {
  faults: AircraftFault[] | null | undefined;
  lightMode?: boolean;
  /** גודל הגופן בפיקסלים - נשלט ע"י הקורא, כי על המפה הוא מתחלק בזום */
  size?: number;
  style?: React.CSSProperties;
}) => {
  if (!hasAnyFault(faults)) return null;
  const red = faultRedFor(lightMode);
  return (
    <span
      data-testid="fault-badge"
      title={formatFaultsHint(faults)}
      aria-label={tr('strips.fault')}
      style={{
        flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: `${Math.max(1, size * 0.15)}px`,
        fontSize: `${size}px`, fontWeight: 'bold', lineHeight: 1, whiteSpace: 'nowrap',
        color: red, background: `${red}22`, border: `1px solid ${red}88`,
        borderRadius: '3px', padding: `${Math.max(1, size * 0.1)}px ${Math.max(2, size * 0.3)}px`,
        ...style,
      }}
    >⚠ {formatFaultNumbers(faults)}</span>
  );
};

export default FaultBadge;
