import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * FitScaleBox - מקטין/מגדיל תוכן כדי שייכנס בדיוק לשטח שהוקצה לו.
 *
 * למה בכלל: רכיבי תצוגה בחלון העזרים (מסלולים, TAXIWAYS) רחבים מרוחב החלון
 * כשיש הרבה פריטים. הפתרון הישן היה גלילה אופקית - כלומר **הסתרה** של פריטים,
 * ובעמדת בקרה אסור שמסלול "ייעלם" מהמבט. כאן במקום להסתיר - מקטינים הכל
 * (דיאגרמות, פונטים, בקרות) עד שהתוכן נכנס לרוחב, ובחלון מוגדל - מגדילים
 * עד שהתוכן ממלא את כל השטח.
 *
 * למה `zoom` ולא `transform: scale()`: `zoom` הוא תכונת פריסה - הגובה של המיכל
 * מתעדכן לבד (בלי לחשב גובה ידנית), הטקסט מרונדר מחדש בגודל החדש (חד, לא מטושטש),
 * וזה גם המנגנון שכל ה-UI כבר נשען עליו (`#root { zoom: var(--s) }` ב-App.css).
 *
 * המדידה יחסית בכוונה: `getBoundingClientRect` מחזיר מידות **אחרי** כל הזומים
 * (הגלובלי + זה המקומי), ולכן היחס `שטח פנוי / תוכן` תקף בכל גודל מסך ובכל
 * `--s` - בלי לקרוא את הזום או להמיר יחידות.
 *
 * שימוש:
 *   <FitScaleBox>{row}</FitScaleBox>                      // מקטין רק כשחורג
 *   <FitScaleBox mode="fill" maxScale={6}>{row}</FitScaleBox>  // ממלא את השטח
 *   <FitScaleBox mode="width">{win}</FitScaleBox>          // מתאים לרוחב, הגובה נגזר
 */

export interface FitScaleBoxProps {
  children: React.ReactNode;
  /**
   * 'shrink' (ברירת מחדל) - מקטין רק כשהתוכן חורג, לעולם לא מעל 1.
   * 'fill' - ממלא את השטח בשני הממדים (גם מגדיל) - דורש גובה קצוב למיכל.
   * 'width' - מתאים ל**רוחב** בלבד (מקטין ומגדיל), והגובה נגזר מהמקדם.
   *   למיכל שגובהו auto - כמו חלון שנארז בקונטיינר ושומר על יחס המימדים שלו.
   */
  mode?: 'shrink' | 'fill' | 'width';
  /** תקרת הגדלה במצב fill */
  maxScale?: number;
  /** רצפת הקטנה - שמירה על קריאות מינימלית */
  minScale?: number;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  className?: string;
}

/** שינוי יחסי מתחת לזה נחשב "התכנס" - מונע ריצוד בין שני ערכים קרובים */
const EPS = 0.01;
/** מכסת התאמות ברצף לפני עצירה (הגנה מלולאת מדידה); מתאפסת אחרי שקט */
const MAX_ADJUST = 12;
const QUIET_MS = 400;

export const FitScaleBox: React.FC<FitScaleBoxProps> = ({
  children,
  mode = 'shrink',
  maxScale = 6,
  minScale = 0.15,
  style,
  contentStyle,
  className,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const scaleRef = useRef(1);
  const adjustRef = useRef({ count: 0, at: 0 });
  const [scale, setScale] = useState(1);

  const measure = useCallback(() => {
    const host = hostRef.current;
    const content = contentRef.current;
    if (!host || !content) return;
    const hr = host.getBoundingClientRect();
    const cr = content.getBoundingClientRect();
    if (hr.width <= 0 || cr.width <= 0 || cr.height <= 0) return;

    const cur = scaleRef.current || 1;
    const fitW = hr.width / cr.width;
    const fitH = hr.height > 0 ? hr.height / cr.height : Infinity;
    let next = mode === 'fill' ? cur * Math.min(fitW, fitH)
      : mode === 'width' ? cur * fitW           // רוחב בלבד - הגובה נגזר
      : Math.min(1, cur * fitW);
    next = Math.min(Math.max(next, minScale), maxScale);
    if (Math.abs(next - cur) / cur <= EPS) return;

    // הגנה: אם המדידה לא מתכנסת (ריצוד), נעצור עד שהמצב נרגע
    const now = Date.now();
    const a = adjustRef.current;
    if (now - a.at > QUIET_MS) a.count = 0;
    a.at = now;
    if (a.count >= MAX_ADJUST) return;
    a.count += 1;

    scaleRef.current = next;
    setScale(next);
  }, [mode, maxScale, minScale]);

  // מדידה אחרי כל רנדר - תופס גם שינויי תוכן (NOTAM שנוסף, מסלול שנסגר)
  useLayoutEffect(() => { measure(); });

  useEffect(() => {
    const host = hostRef.current;
    const content = contentRef.current;
    if (!host || !content || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(host);
    ro.observe(content);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{
        width: '100%',
        height: mode === 'fill' ? '100%' : undefined,
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        alignItems: mode === 'fill' ? 'center' : 'flex-start',
        ...style,
      }}
    >
      <div
        ref={contentRef}
        style={{
          zoom: scale as unknown as number,
          flexShrink: 0,
          width: 'max-content',
          ...contentStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default FitScaleBox;
