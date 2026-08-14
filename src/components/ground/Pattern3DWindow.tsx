import React from 'react';
import i18n from '../../i18n';
import { tr } from '../../i18n/tr';
import { windowFrame } from '../../utils/windowFrame';
import { DRAG_HANDLE_STYLE, readRootScale, startPointerDrag } from '../../utils/pointerDrag';
import {
  DEFAULT_PATTERN3D_PREFS, clampWinPos, clampWinSize, inlineDelta, type Pattern3DWinGeom,
} from './pattern3dPrefs';
import type { DragHandleProps } from './Pattern3DControls';
import type { ThemeMode } from './Pattern3DScene';

// ─── חלון ההקפה התלת מימדית - צף, נגרר ומשנה גודל ───────────────────────────
//
// **תצוגה נוספת לצד המפה הרגילה, לא במקומה.** המפה השטוחה נשארת מקור האמת
// למיקום האופקי, והחלון מוסיף את הגובה - שניהם על המסך בו-זמנית. חלון **צפייה
// ותפעול** ולכן מסגרת תורכיז (CLAUDE.md §מסגרת חלון).
//
// ── למה עוגן inline-start ולא `left` ────────────────────────────────────────
// המערכת דו-לשונית. חלון שמעוגן ב-`left` וידית ההגדלה שלו ב-`insetInlineEnd`
// נשבר בעברית: הידית נוחתת בפינה השמאלית - הפינה ש**אינה** זזה כשהרוחב גדל -
// והגרירה משנה את הקצה הלא נכון. כאן החלון מעוגן תמיד בקצה ה-inline-start
// (ימין בעברית, שמאל באנגלית), ולכן `insetInlineEnd` **הוא** הקצה שזז, ואותה
// גרירה "החוצה" מגדילה בשתי השפות. ההמרה מהיסט פיזי ללוגי: `inlineDelta`.
//
// ── גרירה ───────────────────────────────────────────────────────────────────
// `startPointerDrag` ולא `useDragPosition`: המיקום כאן **נשמר בסשן** ולכן הוא
// חייב להיות מבוקר מבחוץ, ו-`useDragPosition` מחזיק אותו בתוכו בלי דרך לזרוע
// אותו מחדש. הפונקציה כבר פותרת את שלוש המלכודות (חלוקה ב---s, capture,
// touch-action) ולכן זו אינה כתיבה ידנית של גרירה.

/** פינת הפתיחה של חלון שטרם הוזז - בתוך שטח המפה, לא על סרגל הכלים העליון. */
const DEFAULT_INSET = 28;
const DEFAULT_TOP = 92;

interface Props {
  geom: Pattern3DWinGeom;
  onGeomChange: (g: Pattern3DWinGeom) => void;
  themeMode: ThemeMode;
  /** סרגל הבקרה המעוגן, שמקבל את ידית הגרירה של החלון. */
  bar: (dragHandle: DragHandleProps) => React.ReactNode;
  /** הסצנה. מקבלת קופסה ממודדת עם `position:relative` וממלאת אותה. */
  children: React.ReactNode;
}

/** ההיסט של הקצה ה-inline-start מקצה החלון, ביחידות מוגדלות. */
function inlineStartOf(el: HTMLElement, rtl: boolean, s: number): number {
  const r = el.getBoundingClientRect();
  return rtl ? (window.innerWidth - r.right) / s : r.left / s;
}

export default function Pattern3DWindow({ geom, onGeomChange, themeMode, bar, children }: Props) {
  const winRef = React.useRef<HTMLDivElement | null>(null);
  // הגאומטריה העדכנית בזמן גרירה - הסגור של `onMove` נלכד פעם אחת בלבד.
  const geomRef = React.useRef(geom);
  geomRef.current = geom;

  const light = themeMode === 'light';
  const bg = light ? '#ffffff' : themeMode === 'ocean' ? '#05404e' : '#0f172a';
  const grip = light ? '#0284c7' : themeMode === 'ocean' ? '#22d3ee' : '#38bdf8';

  // גאומטריה ששמורה מסשן על מסך אחר יכולה לגלוש מהמסך הנוכחי (החלפת גודל מסך
  // משנה את `--s` ולכן את התצוגה ביחידות מוגדלות). חלון שגולש הוא חלון שידית
  // ה-⇲ שלו מחוץ למסך - כלומר אי אפשר להקטין אותו בחזרה. נחתך פעם אחת בעלייה,
  // ורק אם באמת יש מה לחתוך, כדי לא לכתוב לסשן בכל טעינה.
  React.useEffect(() => {
    const s = readRootScale();
    const vw = window.innerWidth / s, vh = window.innerHeight / s;
    const g = geomRef.current;
    const size = clampWinSize(g.w, g.h, vw, vh);
    const pos = g.x != null && g.y != null ? clampWinPos(g.x, g.y, vw, vh) : { x: g.x, y: g.y };
    if (size.w !== g.w || size.h !== g.h || pos.x !== g.x || pos.y !== g.y) {
      onGeomChange({ ...g, ...size, x: pos.x, y: pos.y });
    }
    // בעלייה בלבד: אחרי זה הגרירה וההגדלה חוסמות בעצמן.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDragDown = (e: React.PointerEvent) => {
    const el = winRef.current;
    if (!el) return;
    const s = readRootScale();
    const rtl = i18n.dir() === 'rtl';
    const base = geom.x != null && geom.y != null
      ? { x: geom.x, y: geom.y }
      : { x: inlineStartOf(el, rtl, s), y: el.getBoundingClientRect().top / s };
    startPointerDrag(e, {
      onMove: (dx, dy) => {
        const p = clampWinPos(
          base.x + inlineDelta(dx, rtl), base.y + dy,
          window.innerWidth / s, window.innerHeight / s,
        );
        onGeomChange({ ...geomRef.current, x: p.x, y: p.y });
      },
    });
  };

  const onResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const s = readRootScale();
    const rtl = i18n.dir() === 'rtl';
    const start = { w: geom.w, h: geom.h };
    startPointerDrag(e, {
      onMove: (dx, dy) => {
        const size = clampWinSize(
          start.w + inlineDelta(dx, rtl), start.h + dy,
          window.innerWidth / s, window.innerHeight / s,
        );
        onGeomChange({ ...geomRef.current, ...size });
      },
    });
  };

  const dragHandle: DragHandleProps = {
    onPointerDown: onDragDown,
    style: { ...DRAG_HANDLE_STYLE, cursor: 'move' },
  };

  return (
    <div
      ref={winRef}
      data-testid="pattern-3d-window"
      data-nopan
      onWheel={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        // טרם הוזז - פינת ברירת מחדל **לוגית**, ולכן נכונה בעברית ובאנגלית
        ...(geom.x != null && geom.y != null
          ? { insetInlineStart: geom.x, top: geom.y }
          : { insetInlineStart: DEFAULT_INSET, top: DEFAULT_TOP }),
        width: geom.w, height: geom.h,
        background: bg,
        // חלון **צפייה ותפעול** ולכן מסגרת תורכיז - מקור אמת יחיד
        ...windowFrame('view', themeMode, 12),
        boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
        display: 'flex', flexDirection: 'column',
        zIndex: 430, overflow: 'hidden', userSelect: 'none', boxSizing: 'border-box',
      }}
    >
      {bar(dragHandle)}

      {/* הסצנה היא `position:absolute; inset:0` ולכן היא צריכה קופסה ממודדת.
          `flex:1` מול תקרת הגובה של הסרגל (`DOCKED_BAR_MAX_H`) הוא מה שמבטיח
          שהסצנה מקבלת את **הרוב** מהחלון בכל גודל, ולא שארית.
          `minHeight/minWidth:0` - בלעדיהם פריט flex לא מתכווץ מתחת לתוכנו
          והחלון מסרב להיות קטן מהסצנה. */}
      <div data-testid="pattern-3d-body" style={{ flex: 1, position: 'relative', minWidth: 0, minHeight: 0 }}>
        {children}
      </div>

      <div
        data-testid="pattern-3d-window-resize"
        onPointerDown={onResizeDown}
        onDoubleClick={() => onGeomChange({
          ...geom, w: DEFAULT_PATTERN3D_PREFS.win.w, h: DEFAULT_PATTERN3D_PREFS.win.h,
        })}
        title={tr('pattern3d.resize')}
        style={{
          // הפינה ה-inline-end התחתונה **היא** הפינה שזזה כשהחלון גדל, כי
          // החלון מעוגן ב-inline-start. נכון בעברית ובאנגלית כאחד.
          position: 'absolute', bottom: 0, insetInlineEnd: 0, width: 16, height: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: i18n.dir() === 'rtl' ? 'nesw-resize' : 'nwse-resize',
          color: grip, fontSize: 12, lineHeight: 1, background: bg,
          borderStartStartRadius: 6, ...DRAG_HANDLE_STYLE,
        }}
      >⇲</div>
    </div>
  );
}
