import { useEffect, useState } from 'react';
import { readToolbarScale } from '../utils/scale';

/**
 * מכפיל גודל לכפתורי סרגל כלים לפי גודל המסך הנבחר (15.6"/16"/18"/24").
 *
 * למה בכלל: הזום הגלובלי `zoom: var(--s)` על #root מגדיל את כל ה-UI באופן אחיד,
 * ולכן כפתור 20px נשאר קטן *ביחס* למסך גם ב-24". בסרגלים צפופים זה לא מספיק
 * לעט/מגע. ה-hook מחזיר מכפיל נוסף שמוחל על הכפתורים בלבד - לא על הסרגל כולו
 * ולא על שאר המסך.
 *
 * מקור אמת יחיד: התכונה `data-screen` על <html> (נכתבת בסקריפט ה-boot של
 * index.html). ה-hook מאזין לשינויים כדי שהחלפת גודל תעודכן חי.
 *
 * שימוש:
 *   const tb = useToolbarScale();
 *   <button style={{ width: tbPx(20, tb), height: tbPx(20, tb) }} />
 */
export const useToolbarScale = (): number => {
  const [s, setS] = useState<number>(readToolbarScale);

  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setS(readToolbarScale()));
    obs.observe(el, { attributes: true, attributeFilter: ['data-screen'] });
    // סנכרון נוסף למקרה שהתכונה נכתבה בין הרנדר הראשון ל-effect
    setS(readToolbarScale());
    return () => obs.disconnect();
  }, []);

  return s;
};

export default useToolbarScale;
