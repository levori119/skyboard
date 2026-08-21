import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import { DRAG_HANDLE_STYLE, startPointerDrag } from '../../utils/pointerDrag';
import {
  DOCK_MAX_WIDTH, DOCK_MIN_WIDTH,
  beginDockDrag, dockLiveTitle, dockLoad, dockRemove, dockSetWidth, dockSubscribe,
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
  /** סדר בפריסה (flex order) - בין הפ"מים לעזרים */
  order?: number;
}

export const WindowContainer: React.FC<WindowContainerProps> = ({ themeMode = 'dark', onClose, order = 5 }) => {
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

  const startResize = (e: React.PointerEvent) => {
    const startW = dockLoad().width;
    // הספליטר על הקצה **הפנימי** של הקונטיינר (לכיוון הפ"מים): גרירה פנימה
    // מרחיבה, ולכן startW - dx - בדיוק כמו ספליטר העזרים
    const started = startPointerDrag(e, {
      onMove: dx => dockSetWidth(startW - dx),
      onEnd: () => { resizingRef.current = false; },
    });
    if (started) resizingRef.current = true;
  };

  const insertMarker = (index: number) => (
    hover && hover.index === index && draggingId
      ? <div key={`mark-${index}`} style={{ height: '3px', background: C.accent, borderRadius: '2px', flexShrink: 0, boxShadow: `0 0 6px ${C.accent}` }} />
      : null
  );

  return (
    <>
      <div
        onPointerDown={startResize}
        title={tr('dock.dragToResize')}
        style={{
          ...DRAG_HANDLE_STYLE, width: '5px', order, flexShrink: 0, cursor: 'col-resize',
          background: C.border, zIndex: 10, transition: 'background 0.15s', alignSelf: 'stretch',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = C.accent)}
        onMouseLeave={e => (e.currentTarget.style.background = C.border)}
      />
      <div
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

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', padding: '4px', gap: '4px' }}>
          {shown.length === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
              color: draggingId ? C.accent : C.dim, fontSize: '11px', lineHeight: 1.6, padding: '10px',
              border: `2px dashed ${draggingId ? C.accent : C.border}`, borderRadius: '8px', transition: 'color 0.15s, border-color 0.15s',
            }}>
              {tr('dock.empty')}
            </div>
          ) : (
            <>
              {shown.map((id, i) => (
                <React.Fragment key={id}>
                  {insertMarker(i)}
                  <div
                    data-dock-slot={id}
                    style={{
                      flexShrink: 0, display: 'flex', flexDirection: 'column',
                      background: C.slot, border: `1px solid ${C.border}`, borderRadius: '6px',
                      overflow: 'hidden', opacity: draggingId === id ? 0.5 : 1,
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
              {insertMarker(shown.length)}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export { DOCK_MAX_WIDTH, DOCK_MIN_WIDTH };
export default WindowContainer;
