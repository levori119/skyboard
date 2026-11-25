// "פח" - הסתרת פ"מ מהעמדה שלי בלבד, תצוגתית.
//
// גוררים פ"מ מלוח הפ"מים או מהמפה אל אייקון הפח, והוא נעלם **מהעמדה הזו** -
// מהלוח ומהמפה. בשרת לא משתנה דבר: הפ"מ, השיוך לאזור והעמדה שמחזיקה בו נשארים,
// ועמדות אחרות רואות אותו כרגיל. לכן הרשימה נשמרת ב-localStorage פר-עמדה ולא
// ב-DB, ותמיד אפשר לשחזר מהרשימה שנפתחת בלחיצה על הפח.

import { numericStripId } from './formationSplit';

/** מזהה פ"מ מספרי: 's12' / '12' / 12 → 12. לא תקין → null (numericStripId הקיים, רק חיובי) */
export function stripNumId(id: unknown): number | null {
  const n = typeof id === 'string' || typeof id === 'number' ? numericStripId(id) : null;
  return n != null && n > 0 ? n : null;
}

export function parseStripTrash(raw: unknown): Set<number> {
  if (typeof raw !== 'string' || !raw) return new Set();
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map(stripNumId).filter((n): n is number => n != null));
  } catch { return new Set(); }
}

export function serializeStripTrash(set: Set<number>): string {
  return JSON.stringify([...set].sort((a, b) => a - b));
}

export function addToTrash(set: Set<number>, id: unknown): Set<number> {
  const n = stripNumId(id);
  if (n == null || set.has(n)) return set;
  const next = new Set(set); next.add(n); return next;
}

export function removeFromTrash(set: Set<number>, id: unknown): Set<number> {
  const n = stripNumId(id);
  if (n == null || !set.has(n)) return set;
  const next = new Set(set); next.delete(n); return next;
}

export function isTrashed(set: Set<number>, id: unknown): boolean {
  const n = stripNumId(id);
  return n != null && set.has(n);
}

/** האם נקודת מסך נופלת על אייקון פח (`data-strip-trash`). לגרירות Pointer Events */
export function pointInStripTrash(doc: Document, x: number, y: number): boolean {
  for (const el of Array.from(doc.querySelectorAll('[data-strip-trash]'))) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
  }
  return false;
}
