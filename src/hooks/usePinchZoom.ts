import { useEffect, useRef } from 'react';
import { PinchTracker } from '../utils/pinchTracker';
import type { PinchStep } from '../utils/pinchZoom';

/**
 * צביטה בשתי אצבעות על מפה (אייפד / מסך מגע): הגדלה, הקטנה והזזה.
 *
 * ── איך מסמנים מפה ───────────────────────────────────────────────────────────
 * שורש המפה מקבל `data-pinch-root="<מפתח>"` (או `"<מפתח>:<תת-מפתח>"` - למשל
 * פאנל מפה בדו-מפה), וה-hook מקבל את אותו מפתח. מפה בתוך מפה (תלת מימד מעל
 * מפת המגדל) מקבלת מפתח משלה: נגיעה שייכת לשורש **הקרוב ביותר**, ולכן צביטה
 * בתלת מימד לעולם אינה מזיזה גם את המפה שמתחתיו.
 *
 * ── למה מאזינים ב-window בשלב ה-capture ──────────────────────────────────────
 * כל מפה כבר מגיבה לאצבע אחת (גרירה, סיבוב, לחיצה על פ"מ). האצבע השנייה חייבת
 * לנצח את כולם בלי שאף אחד מהם יצטרך לדעת על הצביטה: ב-capture של window אנחנו
 * רואים את האירוע **לפני** כל מאזין אחר (כולל React, שמאזין על ‎#root‎), ויכולים
 * לבלוע אותו. ברגע שהצביטה מתחילה, האצבע הראשונה מקבלת `pointercancel` סינתטי -
 * מי שכבר התחיל איתה גרירה מתבטל כמו בכל ביטול מגע של מערכת ההפעלה.
 *
 * רק `pointerType === 'touch'`: עט ועכבר אינם צובטים, והם ממשיכים בדיוק כמו היום.
 *
 * `onStep` מקבל את הצעד ב-`clientX/Y`; כל מפה ממירה למודל התצוגה שלה (ראה
 * `utils/pinchZoom`). `onStart`/`onEnd` מאפשרים לכתוב ל-DOM בזמן הצביטה ולעדכן
 * state פעם אחת בסוף, במסכים שרינדור בכל פריים מקרטע בהם.
 */
export interface PinchHandlers {
  onStart?: (root: HTMLElement) => void;
  onStep: (step: PinchStep, root: HTMLElement) => void;
  onEnd?: (root: HTMLElement) => void;
}

/** השורש הקרוב ביותר של מפה שנוגעים בה, אם הוא שייך למפתח. */
function rootFor(target: EventTarget | null, key: string): HTMLElement | null {
  const el = target instanceof Element ? target.closest<HTMLElement>('[data-pinch-root]') : null;
  if (!el) return null;
  const k = el.getAttribute('data-pinch-root') || '';
  return k === key || k.startsWith(`${key}:`) ? el : null;
}

export default function usePinchZoom(key: string, handlers: PinchHandlers, enabled = true): void {
  const h = useRef(handlers);
  h.current = handlers;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const tracker = new PinchTracker();
    /** היעד האחרון של כל אצבע - לשם נשלח הביטול (עם capture זה האלמנט התופס). */
    const targets = new Map<number, EventTarget | null>();
    let root: HTMLElement | null = null;

    const onDown = (e: PointerEvent) => {
      if (!e.isTrusted || e.pointerType !== 'touch') return;
      const r = rootFor(e.target, key);
      if (!r) return;
      targets.set(e.pointerId, e.target);
      const res = tracker.down(e.pointerId, { x: e.clientX, y: e.clientY }, r);
      if (!res.start) return;
      root = r;
      // האצבע השנייה לא מתחילה שום פעולה משלה
      e.stopPropagation();
      const t = targets.get(res.cancelId);
      try {
        t?.dispatchEvent(new PointerEvent('pointercancel', {
          pointerId: res.cancelId, pointerType: 'touch', isPrimary: true, bubbles: true,
        }));
      } catch { /* דפדפן בלי בנאי PointerEvent - הגרירה הקיימת פשוט תיבלע */ }
      h.current.onStart?.(r);
    };

    const onMove = (e: PointerEvent) => {
      if (!e.isTrusted || e.pointerType !== 'touch') return;
      if (targets.has(e.pointerId)) targets.set(e.pointerId, e.target);
      const step = tracker.move(e.pointerId, { x: e.clientX, y: e.clientY });
      if (tracker.isSwallowed(e.pointerId)) e.stopPropagation();
      if (step && root) h.current.onStep(step, root);
    };

    const onUp = (e: PointerEvent) => {
      if (!e.isTrusted || e.pointerType !== 'touch') return;
      // נבלע גם ה-up: מי שהתחיל גרירה כבר קיבל ביטול, ו-up שהיה מגיע אליו היה
      // "מפיל" את מה שגרר בנקודה שבה הורמה האצבע - פעולה שהפקח לא התכוון אליה.
      if (tracker.isSwallowed(e.pointerId)) e.stopPropagation();
      targets.delete(e.pointerId);
      const { end } = tracker.up(e.pointerId);
      if (end && root) { const r = root; root = null; h.current.onEnd?.(r); }
    };

    // ספארי באייפד: בלי זה הצביטה מגדילה גם את **הדף** כולו מעל המפה
    const onGesture = (e: Event) => { if (rootFor(e.target, key)) e.preventDefault(); };

    const opts = { capture: true } as const;
    window.addEventListener('pointerdown', onDown, opts);
    window.addEventListener('pointermove', onMove, opts);
    window.addEventListener('pointerup', onUp, opts);
    window.addEventListener('pointercancel', onUp, opts);
    document.addEventListener('gesturestart', onGesture, { passive: false });
    document.addEventListener('gesturechange', onGesture, { passive: false });
    return () => {
      window.removeEventListener('pointerdown', onDown, opts);
      window.removeEventListener('pointermove', onMove, opts);
      window.removeEventListener('pointerup', onUp, opts);
      window.removeEventListener('pointercancel', onUp, opts);
      document.removeEventListener('gesturestart', onGesture);
      document.removeEventListener('gesturechange', onGesture);
      if (root) { const r = root; root = null; h.current.onEnd?.(r); }
    };
  }, [key, enabled]);
}
