// מסך של עמדה בתוך קופסה — קריאה בלבד.
//
// המסגרת (iframe) היא האפליקציה עצמה בכתובת ?peek=<presetId>, ולכן מוצג בה
// המסך **האמיתי** של אותה עמדה מכל סוג (בקר / מגדל / קלאסי / דסק משימה), והוא
// מתעדכן בזמן אמת — בלי לשכפל שורת רינדור אחת (DRY) ובלי instance שני באותו
// מסמך שיתנגש על הגלובלים של העמדה החיה (תמה, מסך מלא, קיצורי מקלדת).
// ראה src/utils/stationPeek.ts.
//
// שני צרכנים לאותו רכיב:
//   1. סרגל ההצצה בעמדה (StationPeekBar) — ריבוע בגודל ידוע, ובהגדלה 2/3 מסך.
//   2. "הצג מסך לדוגמה" במסך הניהול (StationScreenPreview) — על כל המסך.
import { useEffect, useRef, useState } from 'react';
import { peekUrl } from '../../utils/stationPeek';

// גודל המסמך הלוגי של המסגרת. הקופסה מקטינה אותו בטרנספורם, כך שהעמדה נפרסת
// כמו על מסך מלא ורק אז מוקטנת — במקום להיצבע בפריסה של 200 פיקסלים.
export const FRAME_W = 1600;
export const FRAME_H = 900;

/**
 * `boxW`/`boxH` — מידות הקופסה בפיקסלים כשהן ידועות מראש (ריבוע הסרגל).
 * כשאינן ידועות (66% מהחלון, מסך מלא) משאירים אותן ריקות והקופסה **נמדדת**
 * בפועל, כך שקנה המידה נכון גם אחרי שינוי גודל חלון.
 */
export default function StationScreenFrame({ presetId, boxW = null, boxH = null }: {
  presetId: number;
  boxW?: number | null;
  boxH?: number | null;
}) {
  const measure = boxW == null || boxH == null;
  const hostRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!measure) { setMeasured(null); return; }
    const el = hostRef.current;
    if (!el) return;
    const update = () => setMeasured({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const w = measure ? (measured?.w ?? 0) : (boxW ?? 0);
  const h = measure ? (measured?.h ?? 0) : (boxH ?? 0);
  // "contain" — לא חותכים חלק מהמסך של העמדה הנצפית
  const scale = w && h ? Math.min(w / FRAME_W, h / FRAME_H) : 0;
  // הקופסה אינה תמיד ביחס 16:9 (מסך מלא, חלון מוגדל), ואז נשארות שוליים.
  // ממרכזים אותן משני הצדדים במקום להצמיד הכל לפינה אחת.
  const padX = Math.max(0, (w - FRAME_W * scale) / 2);
  const padY = Math.max(0, (h - FRAME_H * scale) / 2);

  return (
    <div ref={hostRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', direction: 'ltr' }}>
      <iframe
        src={peekUrl(presetId)}
        title={`peek-${presetId}`}
        loading="lazy"
        tabIndex={-1}
        style={{
          position: 'absolute', top: padY, left: padX, width: FRAME_W, height: FRAME_H, border: 'none',
          transform: `scale(${scale || 0.0001})`, transformOrigin: 'top left',
          // קריאה בלבד — אין דרך ללחוץ, לגרור או להקליד לתוך העמדה הנצפית
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
