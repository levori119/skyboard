import React from 'react';
import i18n from '../../i18n';
import { tr } from '../../i18n/tr';
import { frameColor } from '../../utils/windowFrame';
import { DRAG_HANDLE_STYLE, startPointerDrag } from '../../utils/pointerDrag';
import { clampSplitRatio, inlineDelta, nextSplitRatio, type SplitOrient } from './pattern3dPrefs';
import type { ThemeMode } from './Pattern3DScene';

// ─── חלונית ההקפה התלת מימדית לצד המפה - "מפה מפוצלת" ───────────────────────
//
// **תצוגה נוספת, לא מחליפה**: המפה השטוחה מצטמצמת לחלקה של האזור, והתלת מימד
// מקבל את היתר. שתיהן חיות בו-זמנית, וכל פעולה נשארת בטבלה.
//
// החלונית יושבת **מחוץ** ל-`mapInnerRef` - שכבת התוכן שנושאת את זום/פאן המפה
// ואת `isolation:'isolate'`. לתלת מימד מצלמה משלו, וירושת ה-transform של המפה
// הייתה מזיזה אותו עם גלגלת שלא נועדה לו.
//
// ── הספליטר ─────────────────────────────────────────────────────────────────
// `startPointerDrag` - עט ואצבע, `setPointerCapture`, ו**חלוקה ב---s**. הספליטר
// הקיים של פאנלי הסטריפים (GroundView §startPanelResize) עובד על `clientX` גולמי
// ולכן זז פי 1.65 מהיד במסך 24"; לא לשכפל אותו. ההיסט מומר להיסט **לוגי**, כדי
// שגרירה "לכיוון המפה" תגדיל את המפה גם בעברית וגם באנגלית.
//
// ── היכן יושב הספליטר ───────────────────────────────────────────────────────
// בתוך רצועת ה-padding של החלונית עצמה, ולא כאלמנט שלישי מרחף עם היסטים
// שליליים: כך אין פיקסל שנופל בין שתי התצוגות ואין חפיפה על מסגרות.

/** עובי רצועת הספליטר. רחב דיו לאצבע על מסך מגע, צר דיו שלא יגזול תצוגה. */
const SPLITTER = 8;

/**
 * ההיסטים של **המפה השטוחה** בפיצול - `ratio` הוא חלקה מהאזור.
 * מוחל על שכבת התוכן של המפה, כדי שהיא תמדוד ותצייר את עצמה מחדש לגודל החדש.
 */
export function splitMapInset(ratio: number, orient: SplitOrient): React.CSSProperties {
  const rest = `${(100 - clampSplitRatio(ratio) * 100).toFixed(3)}%`;
  return orient === 'h'
    ? { position: 'absolute', top: 0, bottom: 0, insetInlineStart: 0, insetInlineEnd: rest }
    : { position: 'absolute', insetInlineStart: 0, insetInlineEnd: 0, top: 0, bottom: rest };
}

/** ההיסטים של חלונית התלת מימד - המשלים המדויק של `splitMapInset`. */
export function splitPaneInset(ratio: number, orient: SplitOrient): React.CSSProperties {
  const share = `${(clampSplitRatio(ratio) * 100).toFixed(3)}%`;
  return orient === 'h'
    ? { position: 'absolute', top: 0, bottom: 0, insetInlineEnd: 0, insetInlineStart: share }
    : { position: 'absolute', insetInlineStart: 0, insetInlineEnd: 0, bottom: 0, top: share };
}

interface Props {
  /** חלקה של **המפה השטוחה** מהאזור, 0..1. */
  ratio: number;
  orient: SplitOrient;
  onRatioChange: (r: number) => void;
  /** אזור המפה כולו - נמדד בזמן הגרירה כדי לתרגם פיקסלים ליחס. */
  areaRef: React.RefObject<HTMLElement | null>;
  themeMode: ThemeMode;
  /** סרגל הבקרה המעוגן. */
  bar: React.ReactNode;
  /** הסצנה. מקבלת קופסה ממודדת עם `position:relative` וממלאת אותה. */
  children: React.ReactNode;
}

export default function Pattern3DSplitPane({
  ratio, orient, onRatioChange, areaRef, themeMode, bar, children,
}: Props) {
  const horizontal = orient === 'h';
  const light = themeMode === 'light';
  const bg = light ? '#ffffff' : themeMode === 'ocean' ? '#05404e' : '#0f172a';
  const accent = frameColor('view', themeMode);

  const onSplitDown = (e: React.PointerEvent) => {
    const area = areaRef.current;
    if (!area) return;
    e.stopPropagation();
    const rtl = i18n.dir() === 'rtl';
    // `clientWidth/clientHeight` הם יחידות פריסה - אותו מרחב של ההיסט שמחזיר
    // `startPointerDrag` (שכבר חולק ב---s). ערבוב עם `getBoundingClientRect`
    // היה מחזיר את מלכודת ה-1.65.
    const total = horizontal ? area.clientWidth : area.clientHeight;
    const start = ratio;
    startPointerDrag(e, {
      onMove: (dx, dy) => onRatioChange(
        nextSplitRatio(start, horizontal ? inlineDelta(dx, rtl) : dy, total)),
    });
  };

  return (
    <div
      data-testid="pattern-3d-split"
      data-orient={orient}
      data-nopan
      onWheel={e => e.stopPropagation()}
      style={{
        ...splitPaneInset(ratio, orient),
        // מתחת לפאנלי המפה הקבועים (z=30/31), בדיוק כמו הסצנה במצב המלא -
        // פאנל השכבות חייב להישאר לחיץ גם כשהוא מכסה פינה של החלונית.
        zIndex: 20,
        background: bg, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxSizing: 'border-box', userSelect: 'none',
        // רצועת הספליטר נחתכת מהחלונית עצמה
        ...(horizontal ? { paddingInlineStart: SPLITTER } : { paddingTop: SPLITTER }),
      }}
    >
      <div
        data-testid="pattern-3d-splitter"
        role="separator"
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-label={tr('pattern3d.splitter')}
        title={tr('pattern3d.splitter')}
        onPointerDown={onSplitDown}
        style={{
          position: 'absolute', ...DRAG_HANDLE_STYLE,
          ...(horizontal
            ? { top: 0, bottom: 0, insetInlineStart: 0, width: SPLITTER, cursor: 'col-resize' }
            : { insetInlineStart: 0, insetInlineEnd: 0, top: 0, height: SPLITTER, cursor: 'row-resize' }),
          background: accent, opacity: 0.75,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2,
        }}
      >
        {/* נקודות אחיזה - הרצועה לבדה נקראת כקו קישוט ולא כידית */}
        <span style={{ color: bg, fontSize: 9, lineHeight: 1, transform: horizontal ? undefined : 'rotate(90deg)' }}>⠿</span>
      </div>

      {bar}

      {/* הסצנה מקבלת את כל היתר. בפיצול אנכי החלונית נמוכה מלכתחילה, ולכן
          תקרת הגובה של הסרגל (`DOCKED_BAR_MAX_H`) היא מה שמשאיר כאן הקפה
          שאפשר לקרוא בה ולא רצועה. */}
      <div data-testid="pattern-3d-body" style={{ flex: 1, position: 'relative', minWidth: 0, minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}
