// ─── קונטיינר החלונות - המודל ─────────────────────────────────────────────────
//
// על המסך של הפקח/בקר צפים עשרות חלונות בו-זמנית, וכל אחד מהם מכסה חלק מהמפה.
// ה**קונטיינר** הוא עמודה בצד ימין (בין הפ"מים לעזרים) שאליה אפשר לדחוף חלון
// צף: החלון יוצא מהערבוביה, מקבל משבצת קבועה, ונשאר שם עד שגוררים אותו החוצה.
//
// **למה מודול ולא state ברכיב:** החלונות הצפים מפוזרים על פני עשרה קבצים ועומק
// עץ שונה (SectorDashboard, GroundView, managers, weather, airPicture). מודול
// עם pub/sub הוא מקור-אמת יחיד שכולם רואים בלי להעביר props דרך חמש שכבות.
//
// שלוש נקודות שקל לפספס כאן:
//
// 1. **מזהה העמדה נשמר כאן, לא עובר ב-props.** setDockPreset נקרא פעם אחת
//    מהעמדה; כל חלון שמשתמש ב-useDockableWindow לא צריך לדעת עליו כלום.
// 2. **"פעיל" נקבע לפי קיום הקונטיינר.** setDockEnabled נקרא מהקונטיינר עצמו
//    בזמן mount/unmount. כשהקונטיינר סגור אין לאן לעגון, ולכן כל החלונות חוזרים
//    לצוף אוטומטית - בלי שאף חלון יידע מה מצב המתג בתפריט התצוגה.
// 3. **clientX/clientY נשארים גולמיים.** בדיקת הפגיעה משווה מול
//    getBoundingClientRect של הקונטיינר, ושניהם באותן יחידות (פיקסלים אמיתיים,
//    אחרי zoom: var(--s)). דווקא כאן **אסור** לחלק ב---s.

import type React from 'react';

export type PresetKey = number | string | null | undefined;

/** מפתח האחסון - פר-עמדה. localStorage ולא sessionStorage: סידור החלונות של
 *  הפקח שווה משהו גם אחרי רענון דף, לא רק עד סוף המשמרת. */
const dockKey = (id: PresetKey): string => `skWindowDock_${id ?? 'none'}`;

/**
 * באיזו עמודה יושב הקונטיינר. שורת העמדה היא **LTR** (ראה SectorDashboard
 * §מְכל מבני LTR), ולכן 'left' הוא קצה המסך השמאלי ו-'right' הימני.
 */
export type DockPosition = 'left' | 'mapRight' | 'beforeAids' | 'right';

export const DOCK_POSITIONS: DockPosition[] = ['left', 'mapRight', 'beforeAids', 'right'];

/**
 * ה-`order` בפריסת השורה. שאר העמודות קבועות:
 * נקודות=1|3 · מפה=2 · נקודות-מפה2=3|1 · פ"מים=5 · עזרים=7.
 * הערכים הזוגיים נשארו פנויים בכוונה - כך הקונטיינר נכנס בין כל שתי עמודות
 * בלי לגעת ב-order של אף אחת מהן.
 */
export const DOCK_POSITION_ORDER: Record<DockPosition, number> = {
  left: 0,        // לפני נקודות ההעברה - קצה המסך השמאלי
  mapRight: 4,    // אחרי המפה, לפני הפ"מים
  beforeAids: 6,  // בין הפ"מים לעזרים
  right: 8,       // אחרי העזרים - קצה המסך הימני
};

export const DEFAULT_DOCK_POSITION: DockPosition = 'beforeAids';

export interface DockState {
  /** מזהי החלונות המעוגנים, **לפי סדר התצוגה** בקונטיינר */
  items: string[];
  /** רוחב הקונטיינר ביחידות מוגדלות (כמו left/top של חלון צף) */
  width: number;
  /** באיזו עמודה הוא יושב */
  position: DockPosition;
}

export const DOCK_MIN_WIDTH = 180;
export const DOCK_MAX_WIDTH = 900;
export const DOCK_DEFAULT_WIDTH = 280;

/**
 * רוחב עמודה אחת בקונטיינר. מעבר לרוחב הזה אין טעם למתוח חלון בודד על כל
 * הרוחב - עדיף לשים שניים זה לצד זה, ולראות יותר בבת אחת.
 */
export const DOCK_COL_WIDTH = 240;
export const DOCK_MAX_COLS = 4;

/** כמה עמודות נכנסות ברוחב הנתון */
export function dockColumns(width: number): number {
  return Math.max(1, Math.min(DOCK_MAX_COLS, Math.floor(width / DOCK_COL_WIDTH)));
}

const EMPTY: DockState = { items: [], width: DOCK_DEFAULT_WIDTH, position: DEFAULT_DOCK_POSITION };

// ── מצב המודול ───────────────────────────────────────────────────────────────

let presetId: PresetKey = null;
let enabled = false;
/** האלמנט של הקונטיינר - יעד השחרור. null כשהקונטיינר סגור */
let zoneEl: HTMLElement | null = null;
/** משבצת פר-חלון: יעד ה-portal. נכתב ב-callback ref של הקונטיינר */
const slotEls = new Map<string, HTMLElement>();
/** החלונות שקיימים כרגע על המסך (מזהה -> כותרת) - רק הם מקבלים משבצת */
const live = new Map<string, string>();
/** המשבצת שמעליה מרחף כרגע חלון נגרר (סמן ההכנסה), ומי נגרר */
let hover: { index: number } | null = null;
let draggingId: string | null = null;

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach(cb => { try { cb(); } catch { /* מאזין שנפל לא יפיל את השאר */ } });
}

export function dockSubscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

// ── קריאה וכתיבה ─────────────────────────────────────────────────────────────

let cache: { key: string; state: DockState } | null = null;

/**
 * מצב הקונטיינר. **ממוטמן** - הפונקציה נקראת ברינדור של כל חלון בר-עגינה,
 * ובזמן גרירה יש רינדור לכל תזוזת מצביע; בלי מטמון זו קריאת localStorage
 * ו-JSON.parse עשרות פעמים בשנייה.
 */
export function dockLoad(): DockState {
  const key = dockKey(presetId);
  if (cache && cache.key === key) return cache.state;
  try {
    const raw = localStorage.getItem(key);
    const state = raw ? parseState(raw) : EMPTY;
    cache = { key, state };
    return state;
  } catch { return EMPTY; }
}

function parseState(raw: string): DockState {
  const parsed = JSON.parse(raw) as Partial<DockState>;
  const items = Array.isArray(parsed.items) ? parsed.items.filter(x => typeof x === 'string') : [];
  const w = Number(parsed.width);
  const pos = parsed.position;
  return {
    items,
    width: isFinite(w) && w > 0 ? Math.min(Math.max(w, DOCK_MIN_WIDTH), DOCK_MAX_WIDTH) : DOCK_DEFAULT_WIDTH,
    // ערך לא מוכר (אחסון ישן, לקוח אחר) נופל לברירת המחדל ולא מעלים את הקונטיינר
    position: pos && DOCK_POSITIONS.includes(pos) ? pos : DEFAULT_DOCK_POSITION,
  };
}

function dockSave(next: DockState): void {
  cache = { key: dockKey(presetId), state: next };
  try { localStorage.setItem(dockKey(presetId), JSON.stringify(next)); }
  catch { /* מצב פרטי / מכסת אחסון - הסידור פשוט לא נשמר בין רענונים */ }
  notify();
}

/** מזהה העמדה - נקרא מהעמדה, לפני שחלון כלשהו נטען */
export function setDockPreset(id: PresetKey): void {
  if (presetId === id) return;
  presetId = id;
  cache = null;
  notify();
}

/** הקונטיינר מדליק/מכבה את עצמו. כשכבוי - כל החלונות חוזרים לצוף */
export function setDockEnabled(on: boolean): void {
  if (enabled === on) return;
  enabled = on;
  if (!on) { zoneEl = null; slotEls.clear(); hover = null; draggingId = null; }
  notify();
}

export const isDockEnabled = (): boolean => enabled;

// ── רישום החלונות והמשבצות ───────────────────────────────────────────────────

/** חלון מכריז על עצמו כשהוא על המסך. מזהה שאין לו חלון חי לא מקבל משבצת,
 *  אבל **נשאר ברשימה** - כדי שהחלון יחזור למקומו כשהוא ייפתח שוב. */
export function registerDockable(id: string, title: string): () => void {
  if (live.get(id) !== title) { live.set(id, title); notify(); }
  return () => { live.delete(id); notify(); };
}

export const dockLiveTitle = (id: string): string | undefined => live.get(id);

/** הקונטיינר רושם את עצמו כיעד שחרור */
export function registerDockZone(el: HTMLElement | null): void {
  if (zoneEl === el) return;
  zoneEl = el;
  notify();
}

/** יעד ה-portal של חלון מעוגן. הקונטיינר כותב, ה-hook קורא */
export function setDockSlotEl(id: string, el: HTMLElement | null): void {
  const cur = slotEls.get(id) || null;
  if (cur === el) return;
  if (el) slotEls.set(id, el); else slotEls.delete(id);
  notify();
}

export const getDockSlotEl = (id: string): HTMLElement | null => slotEls.get(id) || null;

// ── שינוי הסידור ─────────────────────────────────────────────────────────────

/**
 * מכניס/מזיז מזהה למקום `index` ברשימה - **פונקציה טהורה**, כדי שסדר החלונות
 * ייבדק בלי DOM ובלי אחסון.
 *
 * ⚠ `index` נספר על הרשימה **כפי שהיא נראית בזמן הגרירה** - כלומר כשהחלון
 * הנגרר עדיין תופס משבצת. לכן בגרירה **כלפי מטה** צריך לקזז אחד: בלי הקיזוז,
 * שחרור בדיוק מתחת למקום הנוכחי היה מזיז את החלון משבצת אחת למטה במקום
 * להשאיר אותו במקומו.
 */
export function dockPlace(items: string[], id: string, index: number): string[] {
  const from = items.indexOf(id);
  const without = items.filter(x => x !== id);
  const target = from >= 0 && from < index ? index - 1 : index;
  const at = Math.min(Math.max(target, 0), without.length);
  return [...without.slice(0, at), id, ...without.slice(at)];
}

/** מעגן חלון במקום index, או מזיז אליו חלון שכבר מעוגן */
export function dockPut(id: string, index: number): void {
  const cur = dockLoad();
  const items = dockPlace(cur.items, id, index);
  if (items.length === cur.items.length && items.every((x, i) => x === cur.items[i])) { notify(); return; }
  dockSave({ ...cur, items });
}

/** משחרר חלון מהקונטיינר - הוא חוזר לצוף */
export function dockRemove(id: string): void {
  const cur = dockLoad();
  if (!cur.items.includes(id)) return;
  dockSave({ ...cur, items: cur.items.filter(x => x !== id) });
}

export function dockSetWidth(width: number): void {
  const cur = dockLoad();
  const w = Math.min(Math.max(Math.round(width), DOCK_MIN_WIDTH), DOCK_MAX_WIDTH);
  if (w === cur.width) return;
  dockSave({ ...cur, width: w });
}

export function dockSetPosition(position: DockPosition): void {
  const cur = dockLoad();
  if (cur.position === position) return;
  dockSave({ ...cur, position });
}

export const isDocked = (id: string): boolean => enabled && dockLoad().items.includes(id);

// ── בדיקת פגיעה וגרירה ───────────────────────────────────────────────────────

export interface DockHit {
  over: boolean;
  index: number;
  /** שוחרר ב**שטח הריק** שמתחת לכל המשבצות ולא על משבצת מסוימת */
  overEmpty: boolean;
}

/**
 * האם הנקודה נמצאת מעל הקונטיינר, ולפני איזו משבצת היא תיכנס.
 *
 * ⚠ clientX/clientY **גולמיים** - getBoundingClientRect מחזיר מידות אחרי ה-zoom
 * הגלובלי, ולכן שני הצדדים כבר באותן יחידות. חלוקה ב---s כאן תשבור את הבדיקה
 * בדיוק במסכי 18"/24".
 */
export function dockHitTest(clientX: number, clientY: number): DockHit {
  if (!enabled || !zoneEl) return { over: false, index: -1, overEmpty: false };
  const r = zoneEl.getBoundingClientRect();
  if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) {
    return { over: false, index: -1, overEmpty: false };
  }
  const slots = Array.from(zoneEl.querySelectorAll('[data-dock-slot]')) as HTMLElement[];
  const rects = slots.map(el => el.getBoundingClientRect());
  const last = rects.length ? rects[rects.length - 1] : null;
  // עמודה אחת או רשת: ברשת המיקום נקבע גם לפי X, אחרת רק לפי Y
  const multiCol = rects.length > 1 && Math.abs(rects[1].top - rects[0].top) < 4;
  const index = multiCol
    ? dockInsertIndexGrid(rects.map(r => ({ top: r.top, bottom: r.bottom, left: r.left, right: r.right })), clientX, clientY)
    : dockInsertIndex(rects.map(r => r.top + r.height / 2), clientY);
  return {
    over: true,
    index,
    overEmpty: !last || clientY > last.bottom,
  };
}

export interface DockRect { top: number; bottom: number; left: number; right: number }

/**
 * לאיזו משבצת נכנס החלון כשהקונטיינר פרוס כ**רשת** - **פונקציה טהורה**.
 *
 * סדר הקריאה של הרשת הוא LTR (שורת העמדה כולה LTR), ולכן משבצת "באה אחרי"
 * המצביע אם היא בשורה נמוכה יותר, או באותה שורה ומימין למרכזו.
 */
export function dockInsertIndexGrid(rects: DockRect[], clientX: number, clientY: number): number {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (clientY < r.top) return i;                                  // שורה שמתחת למצביע
    if (clientY <= r.bottom && clientX < (r.left + r.right) / 2) return i; // אותה שורה, לפני האמצע
  }
  return rects.length;
}

/**
 * לפני איזו משבצת ייכנס החלון - **פונקציה טהורה** מעל אמצעי המשבצות.
 * מעל האמצע של משבצת = לפניה; מתחת לאמצע של האחרונה = בסוף הרשימה.
 */
export function dockInsertIndex(midpointsY: number[], clientY: number): number {
  for (let i = 0; i < midpointsY.length; i++) {
    if (clientY < midpointsY[i]) return i;
  }
  return midpointsY.length;
}

export const getDockHover = (): { index: number } | null => hover;
export const getDockDraggingId = (): string | null => draggingId;

export interface DockDragOptions {
  id: string;
  /** האם החלון כבר מעוגן - קובע מה קורה בשחרור מחוץ לקונטיינר */
  wasDocked: boolean;
  /** ממקם את החלון הצף (יחידות מוגדלות) - בשחרור החוצה, ובשחזור אחרי עגינה */
  setFloatingPos?: (x: number, y: number) => void;
  /** המיקום הצף הנוכחי, כדי לשחזר אותו אחרי עגינה */
  floatingPos?: () => { x: number; y: number };
}

/**
 * עוקב אחרי גרירה של חלון כדי לדעת איפה הוא שוחרר.
 *
 * מאזין ברמת window ולא על הידית: לחלון יש כבר setPointerCapture משלו על
 * הכותרת, ואירוע שנתפס עדיין **מבעבע** ל-window. כך שתי הגרירות (הזזת החלון
 * ועגינה) חיות זו לצד זו בלי שאף אחת תבטל את השנייה.
 */
export function beginDockDrag(opts: DockDragOptions): void {
  if (!enabled) return;
  draggingId = opts.id;
  // המיקום הצף **לפני** שהגרירה נגעה בו
  const preDrag = opts.floatingPos ? opts.floatingPos() : null;

  const move = (e: PointerEvent) => {
    const hit = dockHitTest(e.clientX, e.clientY);
    const next = hit.over ? { index: hit.index } : null;
    if ((next ? next.index : -1) !== (hover ? hover.index : -1)) { hover = next; notify(); }
  };
  const finish = (e: PointerEvent, cancelled: boolean) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    hover = null;
    draggingId = null;
    if (cancelled) { notify(); return; }
    const hit = dockHitTest(e.clientX, e.clientY);
    if (hit.over) {
      // חלון **חדש** שנזרק לשטח הריק נכנס לראש הרשימה ולא לתחתיתה: הפקח
      // גורר לתוך העמודה, לא למקום מסוים בה, והחדש הוא מה שהוא רוצה לראות.
      // שחרור מדויק **על** משבצת עדיין מכבד את המקום שכוון אליו.
      const index = (!opts.wasDocked && hit.overEmpty) ? 0 : hit.index;
      dockPut(opts.id, index);
      // הגרירה גררה איתה את המיקום הצף של החלון. מחזירים אותו למה שהיה לפניה,
      // אחרת שחרור עתידי (↗ / סגירת הקונטיינר) היה מחזיר את החלון אל **תוך**
      // הקונטיינר או מעבר לקצה המסך - ושם הוא נראה כאילו נעלם.
      if (opts.setFloatingPos && preDrag) opts.setFloatingPos(preDrag.x, preDrag.y);
    } else if (opts.wasDocked) {
      dockRemove(opts.id);
      if (opts.setFloatingPos) {
        const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;
        const p = clampToViewport(e.clientX / s, e.clientY / s);
        opts.setFloatingPos(p.x, p.y);
      }
    } else {
      notify();
    }
  };
  const up = (e: PointerEvent) => finish(e, false);
  // pointercancel לא נושא מיקום שאפשר לסמוך עליו - מבטלים במקום לעגן במקום שגוי
  const cancel = (e: PointerEvent) => finish(e, true);

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
}

/**
 * שומר שהחלון ינחת **בתוך המסך**. חלון שנוחת מעבר לקצה נראה למפעיל בדיוק
 * כמו חלון שנמחק, והוא מחפש אותו בתפריט במקום בשוליים.
 */
export function clampToViewport(x: number, y: number): { x: number; y: number } {
  const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;
  const maxX = window.innerWidth / s - KEEP_VISIBLE_X;
  const maxY = window.innerHeight / s - KEEP_VISIBLE_Y;
  return {
    x: Math.min(Math.max(x, 0), Math.max(maxX, 0)),
    y: Math.min(Math.max(y, 0), Math.max(maxY, 0)),
  };
}

/** כמה מהחלון חייב להישאר על המסך (יחידות מוגדלות) - כמו ב-useDragPosition */
const KEEP_VISIBLE_X = 90;
const KEEP_VISIBLE_Y = 40;

// ── סגנון החלון המעוגן ───────────────────────────────────────────────────────

/**
 * נפרס על שורש החלון **אחרי** הסגנון שלו, במקום ה-position: fixed.
 *
 * הרוחב והגובה הטבעיים של החלון **נשמרים** בכוונה: המשבצת מקטינה/מגדילה אותו
 * כיחידה אחת (FitScaleBox), ולכן הפריסה הפנימית נשארת בדיוק כמו בחלון הצף.
 * מגבלות vh מבוטלות - הן נמדדות מול המסך ולא מול המשבצת, ובלי ביטולן חלון
 * "גבוה" היה מוקטן עד לבלתי-קריא.
 */
export const DOCKED_ROOT_STYLE: React.CSSProperties = {
  position: 'relative',
  left: 'auto', top: 'auto', right: 'auto', bottom: 'auto',
  zIndex: 'auto',
  margin: 0,
  maxHeight: 'none',
  maxWidth: 'none',
  boxShadow: 'none',
};

/** לבדיקות בלבד - מאפס את מצב המודול בין מקרי מבחן */
export function __resetDockForTests(): void {
  presetId = null; enabled = false; zoneEl = null; cache = null;
  slotEls.clear(); live.clear(); hover = null; draggingId = null;
  listeners.clear();
}
