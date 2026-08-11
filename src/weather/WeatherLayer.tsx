// שכבת המז"א על המפה - **רכיב משותף** לעמדת הבקר ולעמדת המגדל.
//
// היכן היא יושבת: **בתוך** שכבת ה-transform של המפה, מעל תמונת המפה ומתחת
// לשכבות SKY-KING - בדיוק כמו AirPictureLayer. זו לא בחירה אסתטית:
//
//   1. פאן וזום של המפה הם `translate(...) scale(...)` על אותה שכבה, ולכן
//      המז"א זז עם המפה **בלי לטעון את ה-iframe מחדש**. שכבה שיושבת בחוץ
//      הייתה חייבת לחשב מרכז חדש בכל תזוזה, ולטעון את Windy מחדש עשרות פעמים
//      בגרירה אחת.
//   2. הפ"מים חייבים להישאר הדבר הבולט והלחיץ על המפה. המז"א הוא **מודעות
//      מצבית**, ולכן `pointerEvents: 'none'` - הוא לא בולע לחיצה, גרירה או עט.
//
// הדיוק הגיאוגרפי מגיע מ-fit.ts: זום שלם שנבחר לפי קנה המידה של העוגן, ותיקון
// השארית ב-CSS scale.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapGeoAnchor } from '../utils/geo';
import { fitWindyToMap, type FitBox } from './fit';
import { windyEmbedUrl } from './windy';
import type { WeatherPrefs } from './prefs';

/**
 * `loading` - נטען. `ok` - המסגרת עלתה. `blocked` - חלף הזמן ולא עלתה, כמעט
 * תמיד רשת מבודדת בלי מוצא לאינטרנט.
 */
export type WeatherStatus = 'loading' | 'ok' | 'blocked';

/**
 * כמה ממתינים ל-Windy לפני שמכריזים על חסימה. 12 שניות ולא 3: בעמדה שיוצאת
 * דרך פרוקסי איטי טעינה ראשונה של מפה יכולה לקחת כמה שניות, והכרזה מוקדמת
 * מדי הייתה מציגה "אין אינטרנט" בזמן שהמפה בדרך.
 */
const LOAD_TIMEOUT_MS = 12000;

/**
 * ה-iframe נטען בארגז חול. הרווח האמיתי כאן הוא `allow-top-navigation` שאינו
 * ניתן: בלעדיו מסגרת חיצונית יכולה לנווט את **העמדה כולה** לכתובת אחרת בלחיצה.
 * שני ההיתרים שכן ניתנים הם המינימום שמפת Windy צריכה כדי לרוץ (סקריפטים,
 * ואחסון במקור שלה עצמה - שאינו המקור של SKY-KING).
 *
 * אם אי-פעם Windy יפסיק לעלות בגלל ארגז החול - זו השורה שמסירים, והיא לבדה.
 */
export const WINDY_SANDBOX = 'allow-scripts allow-same-origin';

interface Props {
  /** עוגן המפה. `null` = מפה לא מעוגנת → אין למה להתאים, השכבה לא מרונדרת. */
  anchor: MapGeoAnchor | null;
  /** גבולות תמונת המפה בתוך שכבת התוכן, בפיקסלי CSS. */
  bounds: FitBox | null;
  prefs: WeatherPrefs;
  /** מתחת לשכבות SKY-KING ומעל תמונת המפה. */
  zIndex?: number;
  /** דיווח מצב טעינה, כדי שתפריט השכבות יוכל להסביר מסך ריק. */
  onStatus?: (s: WeatherStatus) => void;
}

export default function WeatherLayer({ anchor, bounds, prefs, zIndex = 0, onStatus }: Props) {
  const fit = useMemo(() => fitWindyToMap(anchor, bounds), [anchor, bounds]);
  const on = prefs.on && !!fit && !!bounds;

  // הכתובת תלויה **רק** בשכבה, במרכז ובזום - ולא בגודל התצוגה. לכן שינוי גודל
  // חלון או זום מפה משנה סקייל בלבד, בלי טעינה מחדש.
  const url = useMemo(
    () => (fit ? windyEmbedUrl({ lat: fit.centerLat, lon: fit.centerLon, zoom: fit.zoom, overlay: prefs.overlay, chrome: 'clean' }) : ''),
    [fit?.centerLat, fit?.centerLon, fit?.zoom, prefs.overlay],
  );

  const [status, setStatus] = useState<WeatherStatus>('loading');
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;

  // שעון החסימה מתאפס בכל כתובת חדשה: החלפת שכבה היא טעינה חדשה לכל דבר.
  useEffect(() => {
    if (!on || !url) return;
    setStatus('loading');
    statusRef.current?.('loading');
    const timer = setTimeout(() => {
      setStatus(s => {
        if (s === 'loading') statusRef.current?.('blocked');
        return s === 'loading' ? 'blocked' : s;
      });
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [on, url]);

  if (!on || !fit || !bounds) return null;

  return (
    <div
      data-weather-layer=""
      data-weather-overlay={prefs.overlay}
      style={{
        position: 'absolute',
        top: bounds.top, left: bounds.left,
        width: bounds.width, height: bounds.height,
        // חותך את הטבעת העודפת של ה-iframe - ואיתה את הלוגו, סרגל הזמן והמקרא
        // של Windy, שמוצמדים לשוליים.
        overflow: 'hidden',
        // חובה: בלעדיו ה-iframe בולע כל גרירה, לחיצה וציור על המפה.
        pointerEvents: 'none',
        opacity: prefs.opacity,
        // ברירת המחדל היא `normal` ולא `screen` - רקע המפה של Windy הוא אפור
        // בהיר ולא כמעט-שחור, ו-`screen` היה מלבין את מפת השדה. נמדד. ראה prefs.ts.
        mixBlendMode: prefs.blend,
        zIndex,
      }}
    >
      <iframe
        key={url}
        src={url}
        title={`Windy ${prefs.overlay}`}
        sandbox={WINDY_SANDBOX}
        referrerPolicy="no-referrer"
        onLoad={() => { setStatus('ok'); statusRef.current?.('ok'); }}
        style={{
          // מרכוז **בחשבון מפורש** ולא ב-`inset:0 + margin:auto`.
          //
          // ⚠️ זה היה הבאג: `margin:auto` ממרכז רק אלמנט ש**קטן** ממכולתו.
          // כשהוא גדול ממנה - וכאן הוא גדול בכוונה, פי ה-overscan - המרג'ינים
          // היוצאים שליליים, והספסיפיקציה מורה לאפס את אחד מהם ולהצמיד לקצה
          // (השמאלי ב-LTR, הימני ב-RTL). התוצאה: כל שכבת המז"א הוסטה ב-
          // `(frameW*scaleX - bounds.width)/2` אופקית ובמקביל אנכית - במפת
          // אזורי הקרב זה היה 270px ו-200px, כלומר Windy הציג את דלתת הנילוס
          // מעל ישראל. **נכשל בשקט**: הכול נראה תקין, פשוט בנקודה הלא נכונה.
          //
          // כאן המרכז מחושב בפיקסלים (הערכים שליליים - זו הטבעת שנחתכת),
          // וה-scale סביב מרכז האלמנט משאיר את המרכז במקומו.
          position: 'absolute',
          left: (bounds.width - fit.frameW) / 2,
          top: (bounds.height - fit.frameH) / 2,
          width: fit.frameW, height: fit.frameH,
          transform: `scale(${fit.scaleX}, ${fit.scaleY})`,
          transformOrigin: 'center center',
          border: 'none', pointerEvents: 'none',
          // רקע שקוף עד שהמפה עולה, כדי שלא יהבהב לבן על סדק כהה
          background: 'transparent',
          // מסגרת שלא עלתה לא תשאיר ריבוע ריק על המפה
          visibility: status === 'blocked' ? 'hidden' : 'visible',
        }}
      />
    </div>
  );
}
