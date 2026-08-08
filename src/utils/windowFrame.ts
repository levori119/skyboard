// קוד הצבע של מסגרות החלונות (CLAUDE.md §מסגרת חלון).
//
// לפקח/בקר יש עשרות חלונות צפים על המסך בו-זמנית. **צבע המסגרת אומר מה החלון
// עושה**, כדי שאפשר יהיה לזהות אותו במבט אחד בלי לקרוא את הכותרת:
//
//   כתום  = חלון **עריכה** - משנה הגדרות/תוכן (עורך אזורים, סרגל ציור, עורך שאילתא)
//   תורכיז = חלון **צפייה ותפעול** - מציג מצב שדה ומאפשר פעולה תפעולית שוטפת
//
// מקור אמת יחיד: כל חלון חדש נגזר מכאן ולא מקודד צבע מסגרת משלו.
//
// **חריג מתועד:** חלון שצבעו נושא משמעות **פר-ישות** (נקודת הצטרפות לפי צבע
// הנקודה, חלון נתונים לפי הצבע שהוגדר לו בניהול) שומר על צבעו - שם הצבע מזהה
// *איזו* ישות זו, לא *סוג* החלון.

import type React from 'react';

export type WindowKind = 'edit' | 'view';
export type FrameTheme = 'light' | 'dark' | 'ocean';

/** ocean היא תמה **כהה** - הצבעים שלה בהירים כמו ב-dark, לא כמו ב-light. */
const FRAME: Record<FrameTheme, Record<WindowKind, string>> = {
  dark: { edit: '#f97316', view: '#38bdf8' },
  ocean: { edit: '#fb923c', view: '#22d3ee' },
  light: { edit: '#ea580c', view: '#0284c7' },
};

/** עובי המסגרת - מספיק כדי להבחין בצבע מקצה המסך, בלי לגזול שטח תצוגה. */
export const FRAME_WIDTH = 2;

/** צבע מסגרת החלון לפי סוגו ולפי התמה. */
export function frameColor(kind: WindowKind, themeMode: FrameTheme = 'dark'): string {
  return (FRAME[themeMode] || FRAME.dark)[kind];
}

/**
 * סגנון המסגרת המלא לחלון צף.
 * `radius` נשאר בשליטת החלון, כי חלונות שונים כבר עוגלו אחרת.
 */
export function windowFrame(kind: WindowKind, themeMode: FrameTheme = 'dark', radius: number | string = 8): React.CSSProperties {
  return { border: `${FRAME_WIDTH}px solid ${frameColor(kind, themeMode)}`, borderRadius: typeof radius === 'number' ? `${radius}px` : radius };
}

export default windowFrame;
