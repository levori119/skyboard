import { useEffect, useState } from 'react';
import { readMapLabelScale } from '../utils/scale';

/**
 * מכפיל **כיווץ** לתוויות שיושבות על המפה, לפי גודל המסך הנבחר.
 *
 * למה: הזום הגלובלי `zoom: var(--s)` על #root מגדיל את כל ה-UI אחיד. לכפתור
 * סרגל זה טוב (ראה useToolbarScale), אבל לתווית על המפה זה רע - היא גדלה עם
 * המסך בעוד שהצורה שמתחתיה נשארת באותו יחס, ובמסך 24" שמות צלעות ההקפה חנקו
 * את השרטוט. ה-hook מחזיר מכפיל שמקטין את התווית ככל שהמסך גדל.
 *
 * מקור אמת יחיד: `data-screen` על <html> (נכתב בסקריפט ה-boot של index.html),
 * ומאזין לשינויים כדי שהחלפת גודל תעודכן חי - בלי רענון.
 */
export const useMapLabelScale = (): number => {
  const [s, setS] = useState<number>(readMapLabelScale);

  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setS(readMapLabelScale()));
    obs.observe(el, { attributes: true, attributeFilter: ['data-screen'] });
    setS(readMapLabelScale()); // סנכרון למקרה שהתכונה נכתבה בין הרנדר ל-effect
    return () => obs.disconnect();
  }, []);

  return s;
};

export default useMapLabelScale;
