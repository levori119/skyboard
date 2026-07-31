// זיהוי מצב שפת המקלדת (עברית/אנגלית) + מצב CAPS LOCK.
//
// למה: העמדה רצה במסך מלא (Cintiq / Electron) ולכן מחוון השפה של Windows
// מוסתר. בשדה סיסמה התווים מוסתרים - המשתמש מגלה שהקליד בעברית רק אחרי
// שהכניסה נכשלת. המחוון מציג את המצב לפני הלחיצה על "הזדהות".
//
// שני מקורות מידע, לפי סדר אמינות:
//   1. תו שהוקלד בפועל - האמת המוחלטת. עוקף כל השערה. נקרא משני אירועים:
//      keydown (e.key) ו-beforeinput עם inputType='insertText' (e.data).
//      beforeinput נחוץ כי לא כל הקלדה עוברת ב-keydown: פריסות שמייצרות טקסט
//      דרך insertText (IME, מקלדות מערכת) מדלגות עליו. הדבקה (insertFromPaste)
//      אינה נספרת - היא לא מעידה על מצב המקלדת.
//   2. navigator.keyboard.getLayoutMap() (Keyboard Map API, Chromium/Electron,
//      secure context בלבד) - נותן תשובה כבר לפני ההקלדה הראשונה.
//      לא נתמך ב-Firefox/Safari, ואז נשארים על "לא ידוע" עד התו הראשון.
//
// המקור המוקלד מאופס בהחלפת פריסה (Alt+Shift / Win+Space -> keyup של מקש הצירוף)
// ובחזרה לפוקוס לחלון, ואז נבדקת מחדש הפריסה מה-API.
import { useEffect, useState } from 'react';

export type KeyboardLang = 'he' | 'en' | 'other' | 'unknown';

const HEBREW = /[֐-׿]/;
const LATIN = /^[A-Za-z]$/;

/** מקשים שבפריסה העברית נושאים אות עברית (KeyT -> א, KeyS -> ד ...) */
const PROBE_CODES = ['KeyT', 'KeyR', 'KeyA', 'KeyS', 'KeyD', 'KeyG'];

/** מקשים שלחיצה עליהם עשויה להחליף פריסה - אחריהם בודקים מחדש */
const SWITCH_KEYS = new Set(['Shift', 'Alt', 'Meta', 'Control', 'CapsLock']);

interface KeyboardApi { getLayoutMap?: () => Promise<Map<string, string>> }

async function probeLayout(): Promise<KeyboardLang | null> {
  const kb = (navigator as Navigator & { keyboard?: KeyboardApi }).keyboard;
  if (!kb?.getLayoutMap) return null;
  try {
    const map = await kb.getLayoutMap();
    let heb = 0, lat = 0, known = 0;
    for (const code of PROBE_CODES) {
      const v = map.get(code);
      if (!v) continue;
      known++;
      if (HEBREW.test(v)) heb++;
      else if (LATIN.test(v)) lat++;
    }
    if (heb >= 2) return 'he';
    if (lat >= 2) return 'en';
    return known >= 2 ? 'other' : null;
  } catch {
    return null; // הדפדפן חסם (לא secure context) - נסתמך על ההקלדה
  }
}

export interface KeyboardState {
  lang: KeyboardLang;
  capsLock: boolean;
}

export function useKeyboardLanguage(): KeyboardState {
  // typed - מה שהוקלד בפועל, גובר תמיד. probed - השערה מה-Keyboard Map API.
  const [typed, setTyped] = useState<KeyboardLang | null>(null);
  const [probed, setProbed] = useState<KeyboardLang | null>(null);
  const [capsLock, setCapsLock] = useState(false);

  useEffect(() => {
    let alive = true;
    const refresh = () => { probeLayout().then(l => { if (alive && l) setProbed(l); }); };
    refresh();

    /** תו בודד שהופק בפועל - מזהה ודאית של מצב המקלדת */
    const fromChar = (ch: string) => {
      if (ch.length !== 1) return;
      if (HEBREW.test(ch)) setTyped('he');
      else if (LATIN.test(ch)) setTyped('en');
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (typeof e.getModifierState === 'function') setCapsLock(e.getModifierState('CapsLock'));
      if (!e.ctrlKey && !e.altKey && !e.metaKey) fromChar(e.key);
    };

    const onBeforeInput = (e: Event) => {
      const ie = e as InputEvent;
      if (ie.inputType === 'insertText' && ie.data) fromChar(ie.data);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (typeof e.getModifierState === 'function') setCapsLock(e.getModifierState('CapsLock'));
      // ייתכן שהפריסה הוחלפה - התו הקודם כבר לא מייצג את המצב
      if (SWITCH_KEYS.has(e.key)) { setTyped(null); refresh(); }
    };

    const onFocus = () => { setTyped(null); refresh(); };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('beforeinput', onBeforeInput);
    window.addEventListener('focus', onFocus);
    return () => {
      alive = false;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('beforeinput', onBeforeInput);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return { lang: typed ?? probed ?? 'unknown', capsLock };
}
