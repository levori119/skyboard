import { useEffect, useRef } from 'react';
import { tr } from '../i18n/tr';
import { parseAnyCoordPair, decimalToDmsFields } from '../utils/geo';

export type DmsFields = { deg: string; min: string; sec: string; dir: string };

/**
 * הדבקת נ"צ לטופס עיגון המפה (שני עוגנים, N/E מעלות-דקות-שניות).
 *
 * מעתיקים נ"צ מ-Google Earth / Maps (`31.819509, 34.796090`) ומדביקים (Ctrl+V)
 * - השורה מתפרקת לשדות בפורמט חה"א. משותף לעיגון בניהול השדות ובעורך אזורי המפה.
 *
 * **לאיזה עוגן:** אם הפוקוס בתוך כרטיס עוגן (`data-anchor-step`) - אליו. אחרת -
 * לעוגן **שסומן אחרון על המפה**, ולא לעוגן הפעיל: לחיצה על המפה מקדמת מיד את
 * הפעיל לעוגן 2, והזרימה הטבעית היא "לחיצה על הנקודה ← Ctrl+V". בלי סימון - לפעיל.
 *
 * ההדבקה **לא** מזיזה את העוגן הפעיל, אחרת הלחיצה הבאה על המפה הייתה דורסת את הסיכה.
 */
export function useAnchorCoordPaste(opts: {
  enabled: boolean;
  pin1: unknown;
  pin2: unknown;
  activeStep: 1 | 2;
  apply: (step: 1 | 2, lat: DmsFields, lon: DmsFields) => void;
}) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // העוגן שסומן אחרון - הסיכה היא אובייקט חדש בכל סימון, ולכן האפקט רץ גם בסימון חוזר
  const lastPinned = useRef<1 | 2 | null>(null);
  useEffect(() => { if (opts.pin1) lastPinned.current = 1; else if (!opts.pin2) lastPinned.current = null; }, [opts.pin1]);
  useEffect(() => { if (opts.pin2) lastPinned.current = 2; else if (!opts.pin1) lastPinned.current = null; }, [opts.pin2]);

  const applyText = (text: string, step?: 1 | 2): boolean => {
    const g = parseAnyCoordPair(text);
    if (!g) return false;
    const target = step ?? lastPinned.current ?? optsRef.current.activeStep;
    optsRef.current.apply(target, decimalToDmsFields(g.lat, true), decimalToDmsFields(g.lon, false));
    return true;
  };

  useEffect(() => {
    if (!opts.enabled) return;
    const onPaste = (ev: Event) => {
      const e = ev as ClipboardEvent;
      const el = e.target as HTMLElement | null;
      const card = el?.closest?.('[data-anchor-step]');
      // שדה טקסט אחר במסך (שם, חיפוש) - ההדבקה שלו, לא שלנו
      if (!card && el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const step = card ? (Number(card.getAttribute('data-anchor-step')) as 1 | 2) : undefined;
      if (applyText(e.clipboardData?.getData('text/plain') || '', step)) e.preventDefault();
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [opts.enabled]);

  /** כפתור "הדבק" בכרטיס העוגן - למסך מגע/עט בלי מקלדת */
  const pasteFromClipboard = async (step: 1 | 2) => {
    try {
      if (applyText(await navigator.clipboard.readText(), step)) return;
    } catch (err) {
      console.error('Clipboard read failed:', err);
    }
    alert(tr('map.pasteCoordNone'));
  };

  return { pasteFromClipboard };
}
