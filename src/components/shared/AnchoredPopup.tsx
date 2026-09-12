import React from 'react';
import { createPortal } from 'react-dom';
import { anchorMenuPos } from '../../utils/menuPos';

/**
 * פופאפ שנפתח **על** נקודה שנלחצה (אלמנט על המפה, שורה ברשימה) - מימוש אחד
 * לכל המערכת, שסוגר את שתי המלכודות שהפילו כל מימוש ידני:
 *
 * 1. **`contain: paint`** - `#map-area` ב-SectorDashboard נושא אותו, ולכן הוא
 *    הבלוק המכיל של כל צאצא `position: fixed` **וגם חותך אותו**. פופאפ שנפתח
 *    בתוכו קיבל קואורדינטות של החלון אך מוקם יחסית לפינת המפה - נפתח מוסט
 *    (נמדד: 361px בעמדת ניהול שדה תעופה), ולעיתים מחוץ לתיבת החיתוך ואז לא
 *    נראה בכלל. לכן `createPortal` ל-`document.body`.
 * 2. **הסקייל הגלובלי** - הפורטל יושב מחוץ ל-`#root` שנושא `zoom: var(--s)`,
 *    ולכן ה-zoom מוחזר ידנית, והמיקום עובר ב-`anchorMenuPos` שמתרגם את נקודת
 *    הלחיצה ליחידות `left/top` וחוסם לגבולות המסך.
 *
 * לחיצה מחוץ לכרטיס סוגרת; לחיצה בתוכו לא מבעבעת החוצה.
 */
export interface AnchoredPopupProps {
  /** נקודת הלחיצה בפיקסלים אמיתיים (`e.clientX/clientY`) */
  x: number;
  y: number;
  /** גודל משוער של הכרטיס, ביחידות מוגדלות - לחסימה לגבולות המסך */
  w: number;
  h: number;
  onClose: () => void;
  /** סגנון הכרטיס (רקע, מסגרת, ריפוד). המיקום והגובה המרבי נקבעים כאן. */
  cardStyle?: React.CSSProperties;
  zIndex?: number;
  children: React.ReactNode;
}

const AnchoredPopup = ({ x, y, w, h, onClose, cardStyle, zIndex = 99999, children }: AnchoredPopupProps) => {
  const { left, top, maxH } = anchorMenuPos(x, y, w, h);
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex, zoom: 'var(--s)' as never }} onClick={onClose}>
      <div
        style={{ ...cardStyle, position: 'absolute', left, top, maxHeight: `${maxH}px`, overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};

export default AnchoredPopup;
