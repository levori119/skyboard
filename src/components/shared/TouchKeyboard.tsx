import React, { useEffect, useRef, useState } from 'react';
import OnScreenKeyboard from './OnScreenKeyboard';
import { isTouchEditable, insertIntoField, backspaceInField } from '../../utils/touchKeyboard';

/**
 * **מקלדת שקופצת בכל שדה טקסט - כשעובדים במגע או בעט.**
 *
 * העמדה היא מסך מגע (Cintiq) בלי מקלדת פיזית בהישג יד, ולכן נגיעה בשדה טקסט
 * כלשהו - בכל מסך - פותחת את המקלדת שעל המסך. רכיב **אחד** ברמת השורש ולא
 * כפתור ⌨ בכל שדה: שדה חדש מקבל את ההתנהגות בלי שאיש יזכור להוסיף אותה.
 *
 * - **רק במגע/עט**: נגיעה בעכבר לא פותחת (מי שעובד עם עכבר יש לו מקלדת).
 * - **לא נוגע בפוקוס**: מקשי המקלדת מבטלים את ה-pointerdown, ולכן השדה נשאר
 *   בפוקוס והסמן במקומו.
 * - **שדה שיש לו מקלדת משלו** מסומן `data-no-osk` (הדסק החופשי, הפתקיות).
 */
export default function TouchKeyboard() {
  const [target, setTarget] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const lastPointer = useRef<{ type: string; at: number }>({ type: 'mouse', at: 0 });

  useEffect(() => {
    const onDown = (e: PointerEvent) => { lastPointer.current = { type: e.pointerType, at: Date.now() }; };
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as Element | null;
      const recentTouch = lastPointer.current.type !== 'mouse' && Date.now() - lastPointer.current.at < 1500;
      if (recentTouch && isTouchEditable(el)) setTarget(el as HTMLInputElement | HTMLTextAreaElement);
    };
    const onFocusOut = () => {
      // הפוקוס עבר לשדה אחר (focusin יטפל) או יצא משדות - אז המקלדת נסגרת
      setTimeout(() => {
        const a = document.activeElement;
        if (!isTouchEditable(a)) setTarget(null);
      }, 0);
    };
    window.addEventListener('pointerdown', onDown, true);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  if (!target || !target.isConnected) return null;
  return (
    <div data-testid="touch-keyboard" data-no-osk="">
      <OnScreenKeyboard
        onType={ch => insertIntoField(target, ch)}
        onBackspace={() => backspaceInField(target)}
        onEnter={() => {
          if (target instanceof HTMLTextAreaElement) { insertIntoField(target, '\n'); return; }
          // שדה שורה אחת: Enter כמו במקלדת פיזית - מי שמאזין לו (שמירה/חיפוש) מקבל אותו
          target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        }}
        onClose={() => { target.blur(); setTarget(null); }}
      />
    </div>
  );
}
