import React from 'react';

/**
 * FitText - מקטין את הפונט עד שהטקסט **נכנס בשלמותו** לקופסה שהוקצתה לו.
 *
 * למה: הודעה ארוכה בלוח ההודעות חרגה מהכפתור ומהחלון - הטקסט המשיך אל מעבר
 * למסגרת התורכיז ונשפך על המפה. שתי החלופות המקובלות פסולות בעמדת בקרה:
 * חיתוך (`text-overflow: ellipsis`) **מסתיר** מידע תפעולי, וגלילה בתוך כפתור
 * דורשת פעולה כדי לקרוא הודעה שאמורה להיקרא במבט. לכן מקטינים - כמו
 * ב-`FitScaleBox`, אבל ברמת הפונט ועם **גלישת שורות**, כי הודעה היא משפט
 * שמותר לו לרדת שורה, לא דיאגרמה שחייבת להישאר במידה אחת.
 *
 * ההבדל מ-`FitScaleBox`: שם התוכן הוא `width: max-content` (שורה אחת שמוקטנת
 * לרוחב), וכאן הטקסט **נשבר לשורות** ורק אז מוקטן - עד שגם הגובה נכנס.
 *
 * ── למה מדידה אימפרטיבית ולא state ──────────────────────────────────────────
 * גודל הפונט נכתב ישירות ל-DOM ולא דרך `useState`. שינוי state היה מפעיל רנדר,
 * שמפעיל מדידה, שמשנה state - לולאה שצריך להגן עליה במונים ובאפסילון
 * (`FitScaleBox` נאלץ לעשות בדיוק את זה). כאן המדידה היא חיפוש בינארי שמסתיים
 * בתוך ה-effect, בלי רנדר אחד. React אינו דורס את `fontSize` כי הוא אינו
 * מופיע ב-prop של ה-style, וגם אילו דרס - `useLayoutEffect` רץ אחרי כל רנדר
 * ומחזיר אותו.
 *
 * שימוש:
 *   <FitText max={12} min={7}>{message}</FitText>   // בתוך קופסה בגודל קבוע
 */

export interface FitTextProps {
  children: React.ReactNode;
  /** גודל הפונט הרצוי (px). ממנו מתחילים, ורק כלפי מטה. */
  max: number;
  /** רצפת קריאות - מתחתיה לא מקטינים גם במחיר חריגה. */
  min?: number;
  /** יחס גובה שורה. הודעות קצרות ולכן צפוף בכוונה. */
  lineHeight?: number;
  style?: React.CSSProperties;
  title?: string;
}

/** סובלנות מדידה (px) - שבר פיקסל אינו חריגה. */
const EPS = 0.5;

/**
 * `useLayoutEffect` בדפדפן, `useEffect` בשרת. הרכיב נבדק ב-`renderToStaticMarkup`
 * (אין jsdom בסביבת הבדיקות), ושם `useLayoutEffect` פולט אזהרה על כל רנדר.
 * בדפדפן המדידה **חייבת** להיות לפני הצביעה, אחרת רואים הבהוב של גודל הפונט.
 */
const useIsoLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

/**
 * הגודל ה**גדול ביותר** בטווח [min, max] שעבורו `fits` מחזיר true, בהנחה
 * שההתאמה מונוטונית (מה שנכנס בגודל מסוים נכנס גם בקטן ממנו). חיפוש בינארי:
 * ~4 מדידות לטווח 7-12 במקום 6 ליניאריות, וזה חשוב כי כל מדידה היא reflow.
 *
 * כשגם `min` אינו נכנס - מוחזר `min` עצמו: רצפת הקריאות גוברת, והטקסט ייחתך
 * בגבול הקופסה. פונקציה טהורה כדי שהאלגוריתם ייבדק בלי DOM.
 */
export function fitFontSize(fits: (size: number) => boolean, min: number, max: number): number {
  const floor = Math.max(1, Math.round(Math.min(min, max)));
  let lo = floor, hi = Math.max(floor, Math.round(max)), best = floor;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return best;
}

export const FitText: React.FC<FitTextProps> = ({
  children, max, min = 7, lineHeight = 1.1, style, title,
}) => {
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const txtRef = React.useRef<HTMLDivElement | null>(null);

  const fit = React.useCallback(() => {
    const box = boxRef.current, txt = txtRef.current;
    if (!box || !txt) return;
    // מודדים מול **תיבת התוכן**: `clientWidth/Height` כוללים את הריפוד, ובלי
    // החיסור טקסט ארוך היה "נכנס" אל תוך השטח ששמור לשורת האייקונים.
    const cs = getComputedStyle(box);
    const bw = box.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const bh = box.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    if (!(bw > 0 && bh > 0)) return;

    const best = fitFontSize(size => {
      txt.style.fontSize = `${size}px`;
      // `scrollWidth` תופס מילה אחת ארוכה שלא נשברה; `offsetHeight` הוא הגובה
      // בפועל **אחרי** גלישת השורות - ולכן הוא החסם האמיתי כאן.
      return txt.scrollWidth <= bw + EPS && txt.offsetHeight <= bh + EPS;
    }, min, max);
    txt.style.fontSize = `${best}px`;
  }, [max, min]);

  // אחרי כל רנדר - תופס גם שינוי טקסט (הודעה שהוחלפה) וגם שינוי גודל החלון
  useIsoLayoutEffect(() => { fit(); });

  React.useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(box);
    return () => ro.disconnect();
  }, [fit]);

  return (
    <div
      ref={boxRef}
      title={title}
      style={{
        // `border-box` הוא תנאי לנכונות: בלעדיו ריפוד שהקורא מוסיף (כמו השמירה
        // לשורת האייקונים בכפתור ההודעה) **מתווסף** ל-`height: 100%` במקום
        // להצטמצם ממנו, הקופסה יוצאת גבוהה מהכפתור, והטקסט זולג החוצה בדיוק
        // כמו בלי FitText.
        boxSizing: 'border-box',
        width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center', ...style,
      }}
    >
      <div
        ref={txtRef}
        style={{
          maxWidth: '100%', fontSize: max, lineHeight,
          // מילה בודדת ארוכה מהקופסה חייבת להישבר, אחרת אין גודל פונט שיכניס אותה
          overflowWrap: 'anywhere', wordBreak: 'break-word', textAlign: 'center',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default FitText;
