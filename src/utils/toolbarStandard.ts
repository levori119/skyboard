import type { CSSProperties } from 'react';

// ─── סטנדרט סרגלי הכלים ──────────────────────────────────────────────────────
//
// **מקור אמת יחיד** לכפתור בסרגל כלים צף (מפה, תלת מימד, ציור, הלאמה, שכבות
// המגדל). המידה היא זו של סרגל המפה (+/−) - הסרגל שהפקח כבר מכיר ביד - ולכן
// כל סרגל אחר נראה ומתנהג כמוהו:
//
//   מידה   - 40x40. תחת `zoom: var(--s)` זה 66px פיזיים במסך 24", יעד מגע ועט
//            נוח על Cintiq. **לא** מכפיל נוסף (tbPx): הזום הגלובלי כבר מגדיל,
//            וסרגל המפה - שהוא המידה - אינו מוכפל.
//   תוכן   - **אייקון בלבד**. ההסבר חי ב-`title` (HINT), לא כטקסט ליד הכפתור:
//            טקסט מסביר מרחיב את הסרגל ומכסה את המפה בלי להוסיף פקד.
//   מצב    - כפתור פעיל מסומן גם במסגרת ובעובי, לא בצבע בלבד (FAA HF-STD-001).

/** צלע כפתור סרגל - זהה לכפתורי הזום של סרגל המפה. */
export const TOOL_BTN = 40;
/** גודל אייקון בכפתור סרגל. */
export const TOOL_ICON = 22;
/** רווח בין כפתורים בסרגל. */
export const TOOL_GAP = 2;
/** עיגול פינות כפתור. */
export const TOOL_RADIUS = 4;

export type ToolTheme = 'light' | 'dark' | 'ocean';

/** צבעי כפתור סרגל לפי תמה. ocean היא תמה **כהה**. */
export const toolColors = (theme: ToolTheme) =>
  theme === 'light'
    ? { bg: '#e2e8f0', bgHover: '#cbd5e1', text: '#0f172a', border: '#94a3b8', active: '#0284c7', activeBg: '#bae6fd' }
    : theme === 'ocean'
      ? { bg: '#0e4a5c', bgHover: '#155e75', text: '#ecfeff', border: '#0e7490', active: '#22d3ee', activeBg: '#155e75' }
      : { bg: '#475569', bgHover: '#64748b', text: '#ffffff', border: '#334155', active: '#38bdf8', activeBg: '#1d4ed8' };

/** סגנון כפתור סרגל. `active` מסמן מצב דלוק - במסגרת עבה ולא בצבע בלבד. */
export const toolBtn = (theme: ToolTheme, opts: { active?: boolean; disabled?: boolean } = {}): CSSProperties => {
  const c = toolColors(theme);
  return {
    width: TOOL_BTN, height: TOOL_BTN, minWidth: TOOL_BTN, padding: 0, flexShrink: 0,
    boxSizing: 'border-box', borderRadius: TOOL_RADIUS,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: TOOL_ICON, lineHeight: 1, fontWeight: 'bold',
    background: opts.active ? c.activeBg : c.bg,
    color: c.text,
    // פעיל = מסגרת עבה (inset - לא משנה את מידת הכפתור)
    border: `1px solid ${opts.active ? c.active : 'transparent'}`,
    boxShadow: opts.active ? `inset 0 0 0 1px ${c.active}` : undefined,
    cursor: opts.disabled ? 'default' : 'pointer',
    opacity: opts.disabled ? 0.45 : 1,
    touchAction: 'manipulation',
  };
};
