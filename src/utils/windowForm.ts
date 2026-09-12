// סגנונות הטופס של חלון צף, ומידותיו.
//
// יושבים כאן ולא בתוך חלון מסוים כי הם משותפים לחלונות האחים בעמדת ניהול שדה
// תעופה ("ניהול נהגים" ו"ניהול נסיעות"), ושני חלונות שנבדלים בגובה פקד או
// בצבע בורר תאריכים נראים למפעיל כתקלה ולא כעיצוב.
//
// פונקציה טהורה ולא קוד בתוך הרכיב: אלה ההכרעות שהמפעיל רואה בעיניים, ובלי
// jsdom אי אפשר להגיע לטופס דרך רינדור כדי לבדוק אותן.

import type React from 'react';
import type { ThemeMode, WindowPalette } from './windowPalette';

/**
 * גובה אחיד לכל פקד בטופס.
 *
 * `input`, `select` ובמיוחד `input[type=date]` מקבלים מהדפדפן גבהים
 * **פנימיים שונים**, ובלי קיבוע כל שורת טופס יוצאת מדורגת - זה מה שדווח
 * מהשטח על שורת הוספת הרכב.
 */
export const CTRL_H = 28;

/** גודל החלון הצף - כמעט מסך מלא. מיוצא כדי שהבדיקה תקבע את הערכים. */
export const WINDOW_SIZE = {
  width: 'calc(96vw / var(--s, 1))',
  height: 'calc(94vh / var(--s, 1))',
} as const;

export function formStyles(C: WindowPalette, themeMode: ThemeMode) {
  const inputStyle: React.CSSProperties = {
    width: '100%', height: CTRL_H, padding: '0 7px', background: C.input, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 12, boxSizing: 'border-box',
  };
  return {
    inputStyle,
    /**
     * שדה תאריך/שעה. `color-scheme` הוא מה שמפעיל את **בורר התאריכים** של
     * הדפדפן בצבעים הנכונים: בלעדיו הוא מצויר בסכימה בהירה על שדה כהה, סמל
     * הלוח נבלע ברקע, ולמפעיל השדה נראה כמו תיבת טקסט חופשי שאין במה ללחוץ בה.
     * ocean היא תמה **כהה** ולכן מקבלת `dark` כמו dark.
     * `ltr` כי תאריך נקרא משמאל לימין גם בעברית.
     */
    dateStyle: {
      ...inputStyle, direction: 'ltr', textAlign: 'start',
      colorScheme: themeMode === 'light' ? 'light' : 'dark',
    } as React.CSSProperties,
    /** תיבת טקסט רב-שורתית - הגובה הקבוע לא חל עליה */
    areaStyle: { ...inputStyle, height: 'auto', padding: '5px 7px', resize: 'vertical' } as React.CSSProperties,
    /** תווית בגובה קבוע, כדי שכל תאי הרשת יתחילו ויסתיימו באותו קו */
    labelStyle: { fontSize: 10, color: C.muted, display: 'block', height: 13, lineHeight: '13px', marginBottom: 2 } as React.CSSProperties,
    sectionStyle: {
      fontSize: 11, fontWeight: 'bold', color: C.text, borderBottom: `1px solid ${C.line}`,
      paddingBottom: 3, marginBottom: 6, marginTop: 10,
    } as React.CSSProperties,
    /** כפתורי טופס בגובה הפקדים, כדי שיישבו על אותו קו איתם */
    btn: (bg: string, fg = '#fff'): React.CSSProperties => ({
      height: CTRL_H, padding: '0 12px', background: bg, color: fg, border: 'none', borderRadius: 5,
      fontSize: 11, fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap',
    }),
  };
}
