import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DOCKED_ROOT_STYLE, beginDockDrag, dockSubscribe, getDockSlotEl,
  isDockEnabled, isDocked, registerDockable,
} from '../utils/windowDock';

/**
 * הופך חלון צף לחלון שאפשר לדחוף ל**קונטיינר** (CLAUDE.md §קונטיינר החלונות).
 *
 * הרעיון: החלון נשאר **בדיוק במקום שלו בעץ הרכיבים** - עם כל ה-props, ה-state
 * וההיסטוריה שלו - ורק ה**יעד ב-DOM** מתחלף. `createPortal` מעביר אותו למשבצת
 * בקונטיינר בלי לפרק ולהרכיב אותו מחדש, ולכן חלון שהיה באמצע עריכה לא מאבד
 * את מה שהוקלד בו כשמעגנים אותו.
 *
 * שלושה דברים בלבד משתנים בחלון עצמו:
 *
 * ```tsx
 * const dock = useDockableWindow('signalBoard', tr('dock.winMessages'));
 * // 1. שורש החלון - position: relative במקום fixed
 * <div style={{ position:'fixed', left, top, ...dock.rootStyle }}>
 *   // 2. ידית הגרירה - מודיעה למודול שהתחילה גרירה, בלי לבטל את הגרירה הקיימת
 *   <div onPointerDown={e => { dock.onHeaderPointerDown(e); ...הקיים... }}>
 * // 3. עטיפת ההחזרה - portal למשבצת כשמעוגן
 * return dock.render(win);
 * ```
 *
 * ⚠ **לא לקרוא ל-`return null` כשאין משבצת עדיין.** הפער בין הרגע שבו החלון
 * מסומן כמעוגן לרגע שבו המשבצת קיימת ב-DOM הוא פריים אחד (הקונטיינר מסנכרן את
 * המשבצות ב-`useLayoutEffect`), וה-hook כבר מטפל בו - הרכיב עצמו לא צריך.
 */

export interface Dockable {
  /** האם החלון יושב כרגע בקונטיינר */
  docked: boolean;
  /** האם הקונטיינר בכלל פתוח בעמדה - להצגת כפתור "עגן" רק כשיש לאן */
  dockAvailable: boolean;
  /** להצמיד ל-onPointerDown של ידית הגרירה, **לצד** ההתנהגות הקיימת */
  onHeaderPointerDown: (e: React.PointerEvent) => void;
  /** לפרוס על שורש החלון **אחרי** הסגנון שלו. undefined כשהחלון צף */
  rootStyle: React.CSSProperties | undefined;
  /**
   * המשבצת בקונטיינר, או null כשהחלון צף.
   *
   * לחלון ש**כבר** מרונדר ב-createPortal (למשל אל document.body) זו הדרך
   * הקצרה לעגון: מחליפים רק את יעד ה-portal, בלי `render` ובלי לשכפל את ה-JSX.
   *   createPortal(win, dock.slotEl ?? document.body)
   */
  slotEl: HTMLElement | null;
  /** לעטוף את שורש החלון - portal למשבצת כשמעוגן */
  render: (node: React.ReactElement) => React.ReactElement | null;
}

export interface DockableOptions {
  /** שוחרר מחוץ לקונטיינר: מיקום המצביע ביחידות מוגדלות, למקם את החלון הצף */
  onUndock?: (x: number, y: number) => void;
  /** כשfalse - החלון תמיד צף (למשל חלון שאין לו משמעות מעוגן) */
  dockable?: boolean;
}

export function useDockableWindow(id: string, title: string, opts?: DockableOptions): Dockable {
  const [, bump] = useState(0);
  const dockable = opts?.dockable !== false;
  const onUndock = opts?.onUndock;

  // מנוי יחיד לכל שינוי במודל: עגינה, סדר, פתיחת/סגירת הקונטיינר, משבצות
  useEffect(() => dockSubscribe(() => bump(n => n + 1)), []);

  // החלון מכריז על עצמו כל עוד הוא על המסך. מזהה בלי חלון חי לא מקבל משבצת,
  // אבל נשאר ברשימה - כדי שהחלון יחזור למקומו כשהוא ייפתח שוב.
  useEffect(() => {
    if (!dockable) return;
    return registerDockable(id, title);
  }, [id, title, dockable]);

  const docked = dockable && isDocked(id);

  const onHeaderPointerDown = useCallback((e: React.PointerEvent) => {
    if (!dockable || !isDockEnabled()) return;
    if (e.button > 0) return; // לחצן ימני/אמצעי - לא גרירה
    // כפתורי הכותרת אינם ידית גרירה - בלי היציאה הזו לחיצה על ✕ הייתה נספרת
    // כשחרור מחוץ לקונטיינר ומשחררת חלון מעוגן בטעות
    const t = e.target as Element | null;
    if (t && typeof t.closest === 'function' && t.closest('button, input, select, textarea, a')) return;
    beginDockDrag({ id, wasDocked: isDocked(id), onUndock });
  }, [id, dockable, onUndock]);

  const render = useCallback((node: React.ReactElement): React.ReactElement | null => {
    if (!docked) return node;
    const slot = getDockSlotEl(id);
    // פריים אחד בין סימון העגינה ליצירת המשבצת - עדיף כלום מהבזק של חלון צף
    if (!slot) return null;
    return createPortal(node, slot);
  }, [docked, id]);

  return {
    docked,
    slotEl: docked ? getDockSlotEl(id) : null,
    dockAvailable: dockable && isDockEnabled(),
    onHeaderPointerDown,
    rootStyle: docked ? DOCKED_ROOT_STYLE : undefined,
    render,
  };
}

/**
 * אותה יכולת, לחלונות שנולדים ב-`map()` (פתקיות, חלונות נתונים).
 *
 * hook אי אפשר לקרוא בתוך לולאה, ולכן כל חלון ברשימה נעטף ברכיב משלו והמצב
 * מגיע אליו כ-render prop:
 *
 * ```tsx
 * {notes.map(n => (
 *   <DockableWindow key={n.id} id={`sticky:${n.id}`} title={tr('dock.winStickyNote')}>
 *     {dock => <div style={{ position:'fixed', left, top, ...dock.rootStyle }}>…</div>}
 *   </DockableWindow>
 * ))}
 * ```
 */
export const DockableWindow: React.FC<{
  id: string;
  title: string;
  dockable?: boolean;
  onUndock?: (x: number, y: number) => void;
  children: (dock: Dockable) => React.ReactElement;
}> = ({ id, title, dockable, onUndock, children }) => {
  const dock = useDockableWindow(id, title, { dockable, onUndock });
  return dock.render(children(dock));
};

export default useDockableWindow;
