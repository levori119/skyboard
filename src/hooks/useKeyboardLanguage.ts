// זיהוי מצב שפת המקלדת (עברית/אנגלית) + מצב CAPS LOCK.
//
// למה: העמדה רצה במסך מלא (Cintiq / Electron) ולכן מחוון השפה של Windows
// מוסתר. בשדה סיסמה התווים מוסתרים - המשתמש מגלה שהקליד בעברית רק אחרי
// שהכניסה נכשלת. המחוון מציג את המצב לפני הלחיצה על "הזדהות".
//
// ── שני מקורות מידע ─────────────────────────────────────────────────────────
// 1. **תו שהוקלד בפועל** - האמת היחידה. נקרא משני אירועים: keydown (e.key)
//    ו-beforeinput עם inputType='insertText' (e.data). ה-beforeinput אינו
//    כפילות: יש מסלולי קלט שמייצרים טקסט בלי keydown כלל (IME, מקלדות מערכת).
//    הדבקה (insertFromPaste) אינה נספרת - היא לא מעידה על מצב המקלדת.
// 2. **זיהוי החלפת פריסה** - Alt+Shift "נקי" (בלי מקש נוסף ביניהם) או
//    Win+Space. בעמדה מותקנות שתי פריסות (עברית ואנגלית) ולכן החלפה = היפוך,
//    והמצב מתעדכן **מיד** בלי להקליד. אם המצב לא ידוע - היפוך לא עושה כלום.
//
// ── למה אין כאן navigator.keyboard.getLayoutMap() ──────────────────────────
// זו הייתה הגרסה הראשונה, והיא **הציגה תשובה שגויה בביטחון**: אחרי מעבר
// לעברית המחוון המשיך להראות "אנגלית" עד שהוקלד תו עברי. הסיבה היא באג ידוע
// ב-Chromium (issues.chromium.org/issues/340949926) - עבור פריסה לא-לטינית
// ה-API מחזיר את מפת ה-US במקום את הפריסה בפועל. כלומר קריאת "לטינית" מה-API
// לא נושאת מידע כלל: היא נראית זהה בפריסה עברית ובפריסה אנגלית. תשובה שגויה
// גרועה מ"לא ידוע", ולכן ה-API הוסר.
//
// כשהמצב אינו ידוע (עליית המסך, או חזרה לפוקוס אחרי שהחלון איבד אותו והפריסה
// יכלה להשתנות מחוץ לאפליקציה) מוצג "?" מפורש - ולא ניחוש.
import { useEffect, useState } from 'react';

export type KeyboardLang = 'he' | 'en' | 'other' | 'unknown';

const HEBREW = /[֐-׿]/;
const LATIN = /^[A-Za-z]$/;

export interface KeyboardState {
  lang: KeyboardLang;
  capsLock: boolean;
}

export function useKeyboardLanguage(): KeyboardState {
  const [lang, setLang] = useState<KeyboardLang>('unknown');
  const [capsLock, setCapsLock] = useState(false);

  useEffect(() => {
    // מצב מקשי הצירוף - לזיהוי Alt+Shift "נקי". dirty = נלחץ מקש רגיל בזמן
    // שמקש צירוף היה לחוץ, כלומר זה קיצור מקלדת (Alt+Tab, Shift+אות) ולא החלפת פריסה.
    let alt = false, shift = false, meta = false, dirty = false;

    /** תו בודד שהופק בפועל - מזהה ודאית של מצב המקלדת */
    const fromChar = (ch: string) => {
      if (ch.length !== 1) return;
      if (HEBREW.test(ch)) setLang('he');
      else if (LATIN.test(ch)) setLang('en');
      else setLang('other');
    };

    /** החלפת פריסה: שתי פריסות מותקנות = היפוך. מצב לא ידוע נשאר לא ידוע. */
    const toggle = () => setLang(l => (l === 'he' ? 'en' : l === 'en' ? 'he' : l));

    const onKeyDown = (e: KeyboardEvent) => {
      if (typeof e.getModifierState === 'function') setCapsLock(e.getModifierState('CapsLock'));
      if (e.repeat) return;
      if (e.key === 'Alt') { alt = true; return; }
      if (e.key === 'Shift') { shift = true; return; }
      if (e.key === 'Meta') { meta = true; return; }
      if (e.key === 'Control') return;

      // מקש רגיל בזמן צירוף = קיצור מקלדת, לא החלפת פריסה
      if (alt || shift || meta) dirty = true;
      if (meta && e.key === ' ') { toggle(); return; }        // Win+Space
      if (!e.ctrlKey && !e.altKey && !e.metaKey) fromChar(e.key);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (typeof e.getModifierState === 'function') setCapsLock(e.getModifierState('CapsLock'));
      // Alt+Shift ששוחרר בלי שנלחץ מקש נוסף = החלפת פריסה.
      // נבדק **לפני** איפוס הדגלים, ולכן מזוהה בדיוק פעם אחת (בשחרור הראשון מביניהם).
      if ((e.key === 'Alt' || e.key === 'Shift') && alt && shift && !dirty) toggle();
      if (e.key === 'Alt') alt = false;
      if (e.key === 'Shift') shift = false;
      if (e.key === 'Meta') meta = false;
      if (!alt && !shift && !meta) dirty = false;
    };

    const onBeforeInput = (e: Event) => {
      const ie = e as InputEvent;
      if (ie.inputType === 'insertText' && ie.data) fromChar(ie.data);
    };

    // החלון איבד פוקוס וחזר - הפריסה יכלה להשתנות מחוץ לאפליקציה
    // (סרגל השפה של Windows), ואין דרך לדעת. עדיף "?" מאשר ערך ישן ושגוי.
    const onFocus = () => { alt = shift = meta = dirty = false; setLang('unknown'); };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('beforeinput', onBeforeInput);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('beforeinput', onBeforeInput);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return { lang, capsLock };
}
