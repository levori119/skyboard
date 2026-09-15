import React from 'react';
import { createPortal } from 'react-dom';
import { useDockableWindow } from '../../hooks/useDockableWindow';

// ─── חלון טבלת נקודת ההצטרפות ─────────────────────────────────────────────────
//
// הטבלה יצאה מהשכבה של המפה והפכה לחלון צף מסיבה תפעולית: בתוך המפה היא
// נחתכה בקצה המסך (בעיקר בצדדים ובנקודה שיושבת גבוה), והתכווצה עם הזום
// בדיוק כשצריך לקרוא אותה. כאן היא:
//   1. **נפתחת מעל העוגן אם יש מקום, אחרת מתחתיו** - ולא גולשת מהמסך.
//   2. **מוצמדת לגבולות המסך גם בצדדים** - החלון תמיד נראה במלואו.
//   3. **נגררת** בכותרת - בעט, באצבע ובעכבר.
//   4. **ניתנת לעגינה** בקונטיינר החלונות (CLAUDE.md §קונטיינר החלונות): גרירת
//      הכותרת אל הקונטיינר מוציאה את הטבלה מעל המפה למשבצת קבועה.
//
// ⚠️ Portal ל-`body` = **מחוץ ל-`#root`**, ולכן אינו מקבל את `zoom: var(--s)`
// אוטומטית: הוא מוחל כאן ידנית, וכל קואורדינטת מצביע מחולקת ב---s לפני שהיא
// נכתבת ל-left/top (ראה /ui-adapt - מלכודת ה-Portal).

const MARGIN = 8;

const scaleOf = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;

interface Props {
  /** בורר ה-DOM של הסמן שאליו החלון נפתח (הנקודה על המפה). */
  anchorSel: string;
  /** מזהה החלון בקונטיינר - אחד לכל נקודה, כדי שכל נקודה תחזור למשבצת שלה. */
  dockId: string;
  /** השם שמוצג בקונטיינר. */
  dockTitle: string;
  children: (headerProps: { onPointerDown: (e: React.PointerEvent) => void }) => React.ReactNode;
}

export default function JoiningPointOverlay({ anchorSel, dockId, dockTitle, children }: Props) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const posRef = React.useRef<{ x: number; y: number } | null>(null);
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  const dock = useDockableWindow(dockId, dockTitle, {
    setFloatingPos: (x, y) => { posRef.current = { x, y }; setPos({ x, y }); },
    floatingPos: () => posRef.current ?? { x: MARGIN, y: MARGIN },
  });
  // נקרא מתוך place (ResizeObserver) - ref ולא ה-state, כדי שהמדידה לא תיסגר על ערך ישן
  const dockedRef = React.useRef(dock.docked);
  dockedRef.current = dock.docked;

  /** ממקם בפעם הראשונה לפי העוגן, ובכל שינוי גודל **מצמיד** למסך. */
  const place = React.useCallback(() => {
    const el = ref.current;
    // מעוגן - המיקום נקבע בקונטיינר. מדידה כאן הייתה דורסת את המיקום הצף
    // במשבצת, והטבלה הייתה "נוחתת" בתוך הקונטיינר כשמשחררים אותה.
    if (!el || dockedRef.current) return;
    const s = scaleOf();
    const box = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let left: number, top: number;

    if (posRef.current) {
      left = posRef.current.x * s;
      top = posRef.current.y * s;
    } else {
      const a = document.querySelector(anchorSel)?.getBoundingClientRect();
      const cx = a ? a.left + a.width / 2 : vw / 2;
      // מעל הסמן כשיש מקום (כך הסמן עצמו נשאר גלוי), אחרת מתחתיו
      top = a && a.top - box.height - MARGIN >= MARGIN ? a.top - box.height - MARGIN
        : a ? a.bottom + MARGIN
          : vh / 2 - box.height / 2;
      left = cx - box.width / 2;
    }

    left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, vw - box.width - MARGIN));
    top = Math.min(Math.max(top, MARGIN), Math.max(MARGIN, vh - box.height - MARGIN));

    const next = { x: left / s, y: top / s };
    const cur = posRef.current;
    // עדכון רק כשבאמת זז - אחרת ResizeObserver ו-layout effect מזינים זה את זה
    if (!cur || Math.abs(cur.x - next.x) > 0.5 || Math.abs(cur.y - next.y) > 0.5) {
      posRef.current = next;
      setPos(next);
    }
  }, [anchorSel]);

  React.useLayoutEffect(() => { place(); }, [place, dock.docked]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // הטבלה משנה גובה כשפורסים פ"מ או מטוסים - ואז היא יכולה לגלוש מהמסך
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => place()) : null;
    ro?.observe(el);
    const onResize = () => place();
    window.addEventListener('resize', onResize);
    return () => { ro?.disconnect(); window.removeEventListener('resize', onResize); };
  }, [place]);

  const onPointerDown = (e: React.PointerEvent) => {
    dock.onHeaderPointerDown(e);
    if (e.button > 0) return;
    const el = ref.current;
    if (!el) return;
    const s = scaleOf();
    const box = el.getBoundingClientRect();
    const start = { mx: e.clientX / s, my: e.clientY / s, ox: box.left / s, oy: box.top / s };
    const handle = e.currentTarget as HTMLElement;
    try { handle.setPointerCapture(e.pointerId); } catch { /* ignore */ }

    const move = (me: PointerEvent) => {
      const vw = window.innerWidth / s, vh = window.innerHeight / s;
      const w = box.width / s, h = box.height / s;
      const next = {
        x: Math.min(Math.max(start.ox + me.clientX / s - start.mx, MARGIN / s), Math.max(MARGIN / s, vw - w - MARGIN / s)),
        y: Math.min(Math.max(start.oy + me.clientY / s - start.my, MARGIN / s), Math.max(MARGIN / s, vh - h - MARGIN / s)),
      };
      posRef.current = next;
      setPos(next);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      try { handle.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  return createPortal(
    <div
      ref={ref}
      data-testid="joining-point-overlay"
      data-docked={dock.docked ? '1' : '0'}
      style={{
        position: 'fixed',
        left: pos ? pos.x : 0,
        top: pos ? pos.y : 0,
        // לפני המדידה הראשונה החלון קיים אך אינו נראה - אחרת הוא מהבהב בפינה
        visibility: pos || dock.docked ? 'visible' : 'hidden',
        // במשבצת הקונטיינר מקטין לרוחב העמודה - zoom נוסף היה מכפיל את הסקייל
        zoom: (dock.docked ? 1 : 'var(--s)') as never,
        zIndex: 8800,
        ...dock.rootStyle,
      }}
    >
      {children({ onPointerDown })}
    </div>,
    dock.slotEl ?? document.body,
  );
}
