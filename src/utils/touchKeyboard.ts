/**
 * המקלדת שעל המסך מול שדה טקסט כלשהו - הלוגיקה (ראה TouchKeyboard.tsx).
 *
 * הקלדה נכתבת דרך ה-setter **המקורי** של value ואירוע `input`, ולא ב-
 * `el.value = ...` לבד: React מחזיק את הערך של שדה מבוקר ומתעלם משינוי ישיר -
 * רק אירוע input שעובר דרך ה-setter המקורי מגיע ל-onChange.
 */

const TEXT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number']);

/** האם האלמנט הוא שדה טקסט שהמקלדת אמורה לשרת */
export function isTouchEditable(el: Element | null | undefined): boolean {
  if (!el || typeof (el as HTMLElement).closest !== 'function') return false;
  if ((el as HTMLElement).closest('[data-no-osk]')) return false;
  if (el.tagName === 'TEXTAREA') {
    const t = el as HTMLTextAreaElement;
    return !t.readOnly && !t.disabled;
  }
  if (el.tagName === 'INPUT') {
    const i = el as HTMLInputElement;
    return TEXT_TYPES.has((i.getAttribute('type') || '').toLowerCase()) && !i.readOnly && !i.disabled;
  }
  return false;
}

const selRange = (el: HTMLInputElement | HTMLTextAreaElement): [number, number] => {
  // type=number אינו תומך ב-selectionStart (זורק / null) - מוסיפים בסוף
  try {
    const s = el.selectionStart, e = el.selectionEnd;
    if (s != null && e != null) return [s, e];
  } catch { /* ignore */ }
  return [el.value.length, el.value.length];
};

function setNative(el: HTMLInputElement | HTMLTextAreaElement, value: string, caret: number) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value); else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  try { el.setSelectionRange(caret, caret); } catch { /* number */ }
}

/** הכנסת טקסט במקום הסמן (מחליף בחירה) */
export function insertIntoField(el: HTMLInputElement | HTMLTextAreaElement, chunk: string) {
  const [s, e] = selRange(el);
  setNative(el, el.value.slice(0, s) + chunk + el.value.slice(e), s + chunk.length);
}

/** מחיקת תו לפני הסמן, או של הבחירה */
export function backspaceInField(el: HTMLInputElement | HTMLTextAreaElement) {
  const [s, e] = selRange(el);
  if (s !== e) { setNative(el, el.value.slice(0, s) + el.value.slice(e), s); return; }
  if (s === 0) return;
  setNative(el, el.value.slice(0, s - 1) + el.value.slice(s), s - 1);
}
