// פלטת הצבעים של חלון צף, לשלוש התמות.
//
// המסגרת מגיעה מ-`windowFrame.ts` (קוד הצבע של סוג החלון); כאן יושב ה**פנים** -
// רקע, כותרת, קווים וטקסט. עד כה כל חלון הגדיר לעצמו את אותה פלטה מחדש, ושני
// חלונות אחים בעמדה אחת ("ניהול נהגים" ו"ניהול נסיעות") שנבדלים בגוון אחד
// נראים למפעיל כמו תקלה ולא כמו עיצוב.
//
// ocean היא תמה **כהה** ולכן צבעיה בהירים כמו dark, ולא כמו light.

export type ThemeMode = 'light' | 'dark' | 'ocean';

export interface WindowPalette {
  /** רקע גוף החלון */
  panel: string;
  /** רקע שורת הכותרת / ידית הגרירה */
  head: string;
  /** קו ההפרדה החיצוני (כותרת, עמודות) */
  border: string;
  /** קו הפרדה פנימי, דק יותר */
  line: string;
  text: string;
  muted: string;
  /** רקע שדה קלט */
  input: string;
  /** רקע שורה מתחלפת ברשימה */
  rowAlt: string;
  /** רקע שורה נבחרת */
  sel: string;
}

const LIGHT: WindowPalette = {
  panel: '#f1f5f9', head: '#dbe5f1', border: '#94a3b8', line: '#cbd5e1',
  text: '#1e293b', muted: '#64748b', input: '#ffffff', rowAlt: '#e8eef6', sel: '#cfe0f2',
};

const OCEAN: WindowPalette = {
  panel: '#0b3a4a', head: '#0e4b5f', border: '#2b7f96', line: '#1d6579',
  text: '#cffafe', muted: '#7dd3e8', input: '#062c38', rowAlt: '#0d4353', sel: '#12566b',
};

const DARK: WindowPalette = {
  panel: '#0f172a', head: '#1e293b', border: '#334155', line: '#243447',
  text: '#e2e8f0', muted: '#94a3b8', input: '#0b1220', rowAlt: '#141f33', sel: '#1e3a5f',
};

export function windowPalette(themeMode: ThemeMode): WindowPalette {
  return themeMode === 'light' ? LIGHT : themeMode === 'ocean' ? OCEAN : DARK;
}
