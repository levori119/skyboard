import { readRootScale } from './pointerDrag';

/**
 * מיקום פופאפ/תפריט שנפתח **על** נקודת לחיצה או על אלמנט - מימוש אחד לכל המערכת.
 *
 * למה קיים: `#root` יושב תחת `zoom: var(--s)` (15.6"=1.00 · 16"=1.05 · 18"=1.22 ·
 * 24"=1.65, ראה public/boot.js). בתוך העץ הזה `e.clientX/clientY` ו-
 * `getBoundingClientRect()` מגיעים ב**פיקסלים אמיתיים**, בעוד ש-`left/top` של
 * הפופאפ נמדדים ב**יחידות מוגדלות** - הדפדפן יכפיל אותם ב---s. פופאפ שמזין את
 * הקואורדינטה הגולמית ישירות ל-`left/top` נפתח לכן במרחק `x*(s-1)` מהאלמנט
 * שעליו נלחץ, והסטייה גדלה ככל שמתרחקים מהפינה השמאלית-עליונה - עד שהוא בורח
 * מחוץ למסך. גם החסימה לגבולות (`window.innerWidth`) הייתה ביחידות הלא נכונות
 * ולכן נכנסה לפעולה מאוחר מדי. ב-15.6" (`--s = 1`) הכל נראה תקין, ומכאן
 * ש"לפעמים" הפופאפ נפתח לא צמוד.
 *
 * הפונקציה מחזירה `left/top` **ביחידות מוגדלות** - מוכנות להשמה ישירה על
 * `position: fixed | absolute` בתוך `#root`. `menuW/menuH` נמסרים באותן יחידות
 * (כלומר בדיוק המספרים שכתובים ב-`minWidth`/`maxHeight` של הפופאפ).
 */
export interface MenuPosEnv {
  /** סקייל גודל המסך. ברירת מחדל: `--s` מה-DOM. */
  s?: number;
  /** רוחב/גובה החלון בפיקסלים אמיתיים. ברירת מחדל: `window.innerWidth/innerHeight`. */
  vw?: number;
  vh?: number;
  /** מרווח מינימלי מקצה המסך, ביחידות מוגדלות (ברירת מחדל 4). */
  gap?: number;
}

export function anchorMenuPos(
  x: number,
  y: number,
  menuW: number,
  menuH: number,
  env: MenuPosEnv = {},
): { left: number; top: number; maxH: number } {
  const s = env.s ?? readRootScale();
  const winW = env.vw ?? (typeof window === 'undefined' ? 0 : window.innerWidth);
  const winH = env.vh ?? (typeof window === 'undefined' ? 0 : window.innerHeight);
  const gap = env.gap ?? 4;
  // הכל מתורגם ליחידות מוגדלות - נקודת העיגון, גבולות המסך והפופאפ עצמו.
  const vw = winW / s;
  const vh = winH / s;
  const left = Math.max(gap, Math.min(x / s, vw - menuW - gap));
  const top = Math.max(gap, Math.min(y / s, vh - menuH - gap));
  // הגובה שנשאר מתחת לפופאפ: פופאפ שגדל מעבר ל-`menuH` (רשימת סטטוסים ארוכה)
  // היה גולש מתחת לקצה המסך, כי החסימה מניחה את הגובה המשוער בלבד.
  return { left, top, maxH: Math.max(0, vh - top - gap) };
}
