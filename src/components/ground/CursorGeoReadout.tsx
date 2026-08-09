// נ"צ תחת הסמן - קריאה חיה של הנקודה שהעט/האצבע/העכבר נמצאים עליה.
//
// **למה זה קיים:** בשדה מעוגן ללא מפה אין שום סימן ויזואלי שמאמת את העיגון.
// כשמטוס תמונ"א לא מופיע במקום הצפוי, אי-אפשר לדעת אם העוגן שגוי או שהמטוס
// פשוט לא שם. הקריאה הזו הופכת את השאלה למדידה: מצביעים על המסלול, קוראים
// את הנ"צ, ומשווים לתשקיף.
//
// הרכיב **לא נוגע באירועים של המפה**: הוא `pointerEvents: 'none'` ומאזין
// ל-`pointermove` על החלון. גרירה, ציור ובחירה ממשיכים לעבוד מתחתיו.

import { useEffect, useRef, useState } from 'react';
import { imagePctToGeo, fmtDms, type MapGeoAnchor } from '../../utils/geo';

export interface ReadoutBounds { top: number; left: number; width: number; height: number }

interface Props {
  anchor: MapGeoAnchor | null;
  bounds: ReadoutBounds | null;
  /**
   * זום המפה. הכיתוב מתקזז מולו (`scale(1/zoom)`) כדי שיישאר בגודל קבוע -
   * בזום 8 טקסט שגדל איתו היה מכסה חצי מסך.
   */
  mapZoom?: number;
  themeMode?: 'light' | 'dark' | 'ocean';
  zIndex?: number;
}

/** תווית אחוזי-תמונה. אלה היחידות שבהן מוגדרים העוגנים, ולכן הן חלק מהאימות. */
const pctText = (x: number, y: number) => `x=${x.toFixed(1)}%  y=${y.toFixed(1)}%`;

export default function CursorGeoReadout({
  anchor, bounds, mapZoom = 1, themeMode = 'dark', zIndex = 5,
}: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!anchor || !bounds) return;
    let raf = 0;
    let pending: { cx: number; cy: number } | null = null;

    const flush = () => {
      raf = 0;
      const el = boxRef.current;
      const p = pending;
      pending = null;
      if (!el || !p) return;
      // `getBoundingClientRect` מחזיר פיקסלים **ויזואליים**, ו-clientX/clientY
      // מגיעים באותן יחידות - ולכן `zoom: var(--s)` והזום/הזזה של המפה
      // מתקזזים מעצמם. אין כאן חלוקה ב-`--s` בכוונה.
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const x = ((p.cx - r.left) / r.width) * 100;
      const y = ((p.cy - r.top) / r.height) * 100;
      setPt(x >= 0 && x <= 100 && y >= 0 && y <= 100 ? { x, y } : null);
    };

    const onMove = (e: PointerEvent) => {
      pending = { cx: e.clientX, cy: e.clientY };
      // מדידה אחת לפריים. `getBoundingClientRect` בכל אירוע מצביע מכריח
      // חישוב פריסה מחדש, ובעט זה מגיע במאות אירועים בשנייה.
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const onLeave = () => setPt(null);

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
    };
  }, [anchor, bounds]);

  if (!anchor || !bounds) return null;

  const light = themeMode === 'light';
  const geo = pt ? imagePctToGeo(pt.x, pt.y, anchor) : null;

  return (
    <div
      ref={boxRef}
      data-testid="cursor-geo-readout"
      style={{
        position: 'absolute',
        top: bounds.top, left: bounds.left,
        width: bounds.width, height: bounds.height,
        pointerEvents: 'none',
        zIndex,
      }}
    >
      {geo && (
        <div
          data-testid="cursor-geo-readout-badge"
          style={{
            position: 'absolute',
            bottom: 6,
            // מרכז אופקי - ניטרלי לכיוון, ולכן זהה בעברית ובאנגלית.
            left: '50%',
            transform: `translateX(-50%) scale(${1 / (mapZoom || 1)})`,
            transformOrigin: 'bottom center',
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '3px 9px',
            borderRadius: 6,
            border: `1px solid ${light ? '#cbd5e1' : '#334155'}`,
            background: light ? 'rgba(248,250,252,0.92)' : 'rgba(10,22,40,0.88)',
            color: light ? '#0f172a' : '#e2e8f0',
            // מספרים בטבלה קוראים בעין רק כשהספרות ברוחב אחיד - אחרת הנ"צ
            // "רוקד" בזמן תנועת העט וקשה להשוות אותו לתשקיף.
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 11, lineHeight: 1.5, whiteSpace: 'nowrap',
            // הנ"צ הוא מספר לועזי - הוא נקרא משמאל לימין גם במסך עברי.
            direction: 'ltr',
            boxShadow: light ? '0 1px 4px rgba(15,23,42,0.15)' : '0 1px 4px rgba(0,0,0,0.5)',
          }}
        >
          <span>{fmtDms(geo.lat, true)}  {fmtDms(geo.lon, false)}</span>
          <span style={{ opacity: 0.75 }}>{geo.lat.toFixed(5)}, {geo.lon.toFixed(5)}</span>
          <span style={{ opacity: 0.55 }}>{pctText(pt!.x, pt!.y)}</span>
        </div>
      )}
    </div>
  );
}
