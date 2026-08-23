import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import { DRAG_HANDLE_STYLE, startPointerDrag } from '../../utils/pointerDrag';
import {
  DOCK_MAX_WIDTH, DOCK_MIN_WIDTH, DOCK_POSITION_ORDER, DOCK_POSITIONS, dockColumns, type DockPosition,
  beginDockDrag, dockLiveTitle, dockLoad, dockRemove, dockSetPosition, dockSetWidth, dockSubscribe,
  getDockDraggingId, getDockHover, registerDockZone, setDockEnabled, setDockSlotEl,
} from '../../utils/windowDock';
import FitScaleBox from './FitScaleBox';

// ─── קונטיינר החלונות ─────────────────────────────────────────────────────────
//
// עמודה בצד ימין, בין הפ"מים לעזרים, שאליה הפקח/בקר דוחף חלונות צפים. חלון
// שנגרר לכאן יוצא מהערבוביה שמעל המפה ומקבל משבצת קבועה, ונשאר בה עד שגוררים
// אותו החוצה.
//
// **הרוחב קובע את הגודל, והחלונות נארזים למעלה:** כל חלון מוקטן/מוגדל
// כיחידה אחת כדי להתאים ל**רוחב** הקונטיינר (`FitScaleBox mode="width"`), והגובה
// שלו נגזר מאותו מקדם. המשבצות נערמות מלמעלה למטה ולא נמתחות לגובה
// העמודה - חלון בודד נשאר בגודלו ולא מתנפח על כל העמודה. כשהכל לא
// נכנס - הקונטיינר נגלל. הפריסה הפנימית של החלון נשארת בדיוק כפי שהיא
// בחלון הצף - אין "גרסה מעוגנת" נפרדת לתחזק.
//
// **אין כאן `windowFrame`, וזה מכוון:** זו עמודת פריסה כמו העזרים והפ"מים ולא
// חלון צף. קוד הצבע של המסגרות (CLAUDE.md §מסגרת חלון) ממשיך לחיות על החלונות
// **שבתוך** המשבצות - הם שומרים על המסגרת שלהם, ולכן ממשיכים להיקרא במבט אחד
// גם מעוגנים.
//
// ⚠ **סנכרון המשבצות ב-`useLayoutEffect` ולא ב-callback ref.** ref בשורה
// (arrow) נוצר מחדש בכל רינדור, ולכן React היה קורא לו `null` ואז `el` בכל
// רינדור - וכל קריאה מודיעה למנויים, כלומר לולאת רינדור אינסופית.

type ThemeMode = 'light' | 'dark' | 'ocean';

/** ocean היא תמה **כהה** - אסור לגזור אותה מ"כל מה שאינו dark" */
const themeColors = (theme: ThemeMode) => theme === 'light'
  ? { panel: '#f8fafc', header: '#e2e8f0', slot: '#ffffff', border: '#cbd5e1', text: '#1e293b', dim: '#64748b', accent: '#0284c7' }
  : theme === 'ocean'
  ? { panel: '#04323d', header: '#0a5568', slot: '#053241', border: '#0e7490', text: '#cffafe', dim: '#7dd3fc', accent: '#22d3ee' }
  : { panel: '#111827', header: '#1e293b', slot: '#0f172a', border: '#334155', text: '#e2e8f0', dim: '#94a3b8', accent: '#38bdf8' };

/** גובה כותרת המשבצת - מספיק לשם ולידית, בלי לגזול משטח החלון */
const SLOT_HEADER_H = 20;

export interface WindowContainerProps {
  themeMode?: ThemeMode;
  /** סגירת הקונטיינר מהכותרת - אותו מתג שבתפריט "תצוגה" */
  onClose?: () => void;
}

export const WindowContainer: React.FC<WindowContainerProps> = ({ themeMode = 'dark', onClose }) => {
  const [, bump] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const resizingRef = useRef(false);

  useEffect(() => dockSubscribe(() => bump(n => n + 1)), []);

  // הקונטיינר עצמו הוא ה"מתג": כל עוד הוא על המסך אפשר לעגן, וברגע שהוא נסגר
  // כל החלונות חוזרים לצוף - בלי שאף חלון יידע מה מצב המתג בתפריט התצוגה.
  useEffect(() => {
    setDockEnabled(true);
    return () => setDockEnabled(false);
  }, []);

  // ⚠ מערך תלויות ריק בכוונה. בלעדיו הניקוי היה רץ לפני **כל** רינדור, מאפס
  // את אזור השחרור, מודיע למנויים - וגורר רינדור נוסף. לולאה אינסופית.
  // ה-ref כבר מוצב כשאפקט פריסה רץ, ולכן פעם אחת ב-mount מספיקה.
  useLayoutEffect(() => {
    registerDockZone(rootRef.current);
    return () => registerDockZone(null);
  }, []);

  const state = dockLoad();
  const order = DOCK_POSITION_ORDER[state.position];
  /** ברוחב גדול אין טעם למתוח חלון בודד על הכל - שניים זה לצד זה מראים יותר */
  const cols = dockColumns(state.width);
  const C = themeColors(themeMode);
  const hover = getDockHover();
  const draggingId = getDockDraggingId();

  /** רק חלונות שקיימים כרגע על המסך מקבלים משבצת; השאר נשמרים לסדר בלבד */
  const shown = state.items.filter(id => dockLiveTitle(id) !== undefined);

  // סנכרון יעדי ה-portal אחרי כל commit - ראה ההערה על callback ref למעלה
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const seen = new Set<string>();
    root.querySelectorAll('[data-dock-portal]').forEach(el => {
      const id = (el as HTMLElement).dataset.dockPortal;
      if (id) { seen.add(id); setDockSlotEl(id, el as HTMLElement); }
    });
    state.items.forEach(id => { if (!seen.has(id)) setDockSlotEl(id, null); });
  });

  // הקונטיינר יושב **משמאל למפה** רק במיקום 'left'. שם הספליטר צריך להיות על
  // הקצה הימני שלו, וגרירה ימינה היא שמרחיבה - אחרת הידית בורחת מהיד.
  const splitterAfter = state.position === 'left';

  const startResize = (e: React.PointerEvent) => {
    const startW = dockLoad().width;
    const started = startPointerDrag(e, {
      onMove: dx => dockSetWidth(splitterAfter ? startW + dx : startW - dx),
      onEnd: () => { resizingRef.current = false; },
    });
    if (started) resizingRef.current = true;
  };

  /**
   * סמן ההכנסה - הדגשה **בתוך** המשבצת ולא אלמנט נפרד.
   *
   * אלמנט נפרד היה תופס תא ברשת ומזיז את כל הפריסה בזמן הגרירה, בדיוק כשהפקח
   * מכוון למקום. כאן הקצה המוביל של משבצת היעד נצבע, והפריסה לא זזה.
   * ברשת (LTR) הקצה המוביל הוא שמאל; בעמודה אחת - למעלה.
   */
  const slotMarker = (i: number, lastIndex: number): string | undefined => {
    if (!draggingId || !hover) return undefined;
    const glow = `inset 0 0 0 1px ${C.accent}`;
    if (hover.index === i) return cols > 1 ? `inset 3px 0 0 ${C.accent}, ${glow}` : `inset 0 3px 0 ${C.accent}, ${glow}`;
    // שחרור בסוף הרשימה - הקצה הנגרר של המשבצת האחרונה
    if (hover.index === lastIndex + 1 && i === lastIndex) {
      return cols > 1 ? `inset -3px 0 0 ${C.accent}, ${glow}` : `inset 0 -3px 0 ${C.accent}, ${glow}`;
    }
    return undefined;
  };

  const splitter = (
    <div
      key="splitter"
      onPointerDown={startResize}
      title={tr('dock.dragToResize')}
      style={{
        ...DRAG_HANDLE_STYLE, width: '5px', order, flexShrink: 0, cursor: 'col-resize',
        background: C.border, zIndex: 10, transition: 'background 0.15s', alignSelf: 'stretch',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = C.accent)}
      onMouseLeave={e => (e.currentTarget.style.background = C.border)}
    />
  );

  const panel = (
      <div
        key="panel"
        ref={rootRef}
        data-help="windowContainer"
        style={{
          width: state.width, order, background: C.panel, display: 'flex', flexDirection: 'column',
          flexShrink: 0, overflow: 'hidden', position: 'relative',
          borderInlineStart: `1px solid ${C.border}`,
          // בזמן גרירת חלון - מסגרת מודגשת, שיהיה ברור לאן הוא ייפול
          outline: draggingId && hover ? `2px solid ${C.accent}` : 'none',
          outlineOffset: '-2px',
          transition: resizingRef.current ? 'none' : 'outline-color 0.15s',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px',
          background: C.header, borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <span style={{ flex: 1, color: C.text, fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tr('dock.title')}
          </span>
          {shown.length > 0 && (
            <span style={{ color: C.dim, fontSize: '11px', fontVariantNumeric: 'tabular-nums' }}>{shown.length}</span>
          )}
          {onClose && (
            <button
              onClick={onClose}
              title={tr('dock.close')}
              style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.dim, borderRadius: '4px', padding: '1px 6px', fontSize: '11px', cursor: 'pointer', lineHeight: 1.4 }}
            >✕</button>
          )}
        </div>

        {/* רשת ולא flex-wrap: החישוב של רוחב עמודה מ-100% נשבר על עיגול
            תת-פיקסלי (שתי משבצות של 283 לא נכנסו ל-569 פנויים ונשברו שורה).
            grid מחלק את הרוחב בעצמו ותמיד מדויק. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, alignContent: 'flex-start', padding: '4px', gap: '4px', direction: 'ltr' }}>
          {shown.length === 0 ? (
            <div style={{
              gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
              color: draggingId ? C.accent : C.dim, fontSize: '11px', lineHeight: 1.6, padding: '10px',
              border: `2px dashed ${draggingId ? C.accent : C.border}`, borderRadius: '8px', transition: 'color 0.15s, border-color 0.15s',
            }}>
              {tr('dock.empty')}
            </div>
          ) : (
            <>
              {shown.map((id, i) => (
                <React.Fragment key={id}>
                  <div
                    data-dock-slot={id}
                    style={{
                      minWidth: 0, display: 'flex', flexDirection: 'column',
                      background: C.slot, border: `1px solid ${C.border}`, borderRadius: '6px',
                      overflow: 'hidden', opacity: draggingId === id ? 0.5 : 1,
                      boxShadow: slotMarker(i, shown.length - 1),
                    }}
                  >
                    <div
                      onPointerDown={e => {
                        if ((e.target as HTMLElement).closest('button')) return;
                        beginDockDrag({ id, wasDocked: true });
                      }}
                      title={tr('dock.dragToReorder')}
                      style={{
                        ...DRAG_HANDLE_STYLE, height: SLOT_HEADER_H, flexShrink: 0, cursor: 'grab',
                        display: 'flex', alignItems: 'center', gap: '5px', padding: '0 5px',
                        background: C.header, borderBottom: `1px solid ${C.border}`,
                      }}
                    >
                      <span style={{ color: C.dim, fontSize: '11px', lineHeight: 1 }}>⠿</span>
                      <span style={{ flex: 1, color: C.text, fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {dockLiveTitle(id)}
                      </span>
                      <button
                        onClick={() => dockRemove(id)}
                        title={tr('dock.popOut')}
                        style={{ background: 'transparent', border: 'none', color: C.dim, cursor: 'pointer', fontSize: '11px', padding: '0 3px', lineHeight: 1 }}
                      >↗</button>
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                      <FitScaleBox mode="width" maxScale={2.5} minScale={0.18}>
                        <div data-dock-portal={id} />
                      </FitScaleBox>
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </>
          )}
        </div>
      </div>
  );

  // הספליטר תמיד בקצה הפונה למרכז המסך: משמאל לקונטיינר כשהוא מימין למפה,
  // ומימינו כשהוא בקצה השמאלי.
  return <>{splitterAfter ? [panel, splitter] : [splitter, panel]}</>;
};

/**
 * בורר המיקום - ארבע סכמות קטנות של שורת העמדה, עם עמודת הקונטיינר מודגשת.
 * ויזואלי ולא רשימת שמות: "בין הפ"מים לעזרים" דורש מהפקח לבנות את המסך בראש,
 * והתמונה עונה על זה במבט.
 */
export const DockPositionPicker: React.FC<{
  themeMode?: ThemeMode;
  /** נבחר מיקום - לסגירת התפריט */
  onPick?: (p: DockPosition) => void;
}> = ({ themeMode = 'dark', onPick }) => {
  const [, bump] = useState(0);
  useEffect(() => dockSubscribe(() => bump(n => n + 1)), []);
  const C = themeColors(themeMode);
  const current = dockLoad().position;

  /** העמודות בכל סכמה, לפי סדר המסך (LTR). null = הקונטיינר */
  const columns = (p: DockPosition): (null | 'n' | 'm' | 's' | 'a')[] => {
    const base: (null | 'n' | 'm' | 's' | 'a')[] = ['n', 'm', 's', 'a'];
    const at = { left: 0, mapRight: 2, beforeAids: 3, right: 4 }[p];
    return [...base.slice(0, at), null, ...base.slice(at)];
  };

  return (
    <div style={{ display: 'flex', gap: '6px', padding: '2px 0', direction: 'ltr', justifyContent: 'center' }}>
      {DOCK_POSITIONS.map(p => {
        const on = current === p;
        return (
          <button
            key={p}
            onClick={() => { dockSetPosition(p); onPick?.(p); }}
            title={tr(`dock.pos_${p}`)}
            aria-label={tr(`dock.pos_${p}`)}
            aria-pressed={on}
            data-testid={`dock-pos-${p}`}
            style={{
              display: 'flex', gap: '1px', alignItems: 'stretch', height: '26px', padding: '3px',
              background: on ? C.slot : 'transparent',
              border: `1px solid ${on ? C.accent : C.border}`,
              borderRadius: '4px', cursor: 'pointer',
            }}
          >
            {columns(p).map((c, i) => (
              <span
                key={i}
                style={{
                  width: c === 'm' ? '11px' : c === null ? '5px' : '4px',
                  background: c === null ? C.accent : c === 'm' ? C.border : C.dim,
                  borderRadius: '1px', opacity: c === null ? 1 : 0.55,
                }}
              />
            ))}
          </button>
        );
      })}
    </div>
  );
};

export { DOCK_MAX_WIDTH, DOCK_MIN_WIDTH };
export default WindowContainer;
