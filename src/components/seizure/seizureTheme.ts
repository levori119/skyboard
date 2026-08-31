/**
 * לוח הצבעים של חלונות הלאמת אזור זמני, לשלוש התמות.
 *
 * למה קובץ ולא צבעים בכל רכיב: ארבעה חלונות (סרגל ציור, טופס, התראה, אישורי
 * עמדות) חייבים להיראות כמשפחה אחת, ו"אור/שחור/כחול" הן שלוש תמות ולא שתיים
 * (ocean היא תמה **כהה** ולכן צבעיה בהירים כמו dark). מסגרת החלון עצמה אינה
 * כאן - היא תמיד מ-`windowFrame` (CLAUDE.md §מסגרת חלון).
 */

import type { FrameTheme } from '../../utils/windowFrame';

export interface SeizurePalette {
  panel: string;
  panelAlt: string;
  text: string;
  muted: string;
  line: string;
  input: string;
  inputText: string;
  accent: string;
  danger: string;
  ok: string;
}

const PALETTE: Record<FrameTheme, SeizurePalette> = {
  dark: {
    panel: '#0f172a', panelAlt: '#1e293b', text: '#e2e8f0', muted: '#94a3b8',
    line: '#334155', input: '#1e293b', inputText: '#e2e8f0',
    accent: '#fdba74', danger: '#f87171', ok: '#86efac',
  },
  ocean: {
    panel: '#05404e', panelAlt: '#0b5566', text: '#e0f2fe', muted: '#7dd3fc',
    line: '#0e7490', input: '#0b5566', inputText: '#e0f2fe',
    accent: '#fdba74', danger: '#fca5a5', ok: '#86efac',
  },
  light: {
    panel: '#ffffff', panelAlt: '#f1f5f9', text: '#0f172a', muted: '#475569',
    line: '#cbd5e1', input: '#ffffff', inputText: '#0f172a',
    accent: '#c2410c', danger: '#b91c1c', ok: '#15803d',
  },
};

export const seizurePalette = (theme: FrameTheme = 'dark'): SeizurePalette => PALETTE[theme] || PALETTE.dark;

/** שדה קלט אחיד - שלוש התמות, כיוון לוגי (עובד גם באנגלית). */
export const seizureInputStyle = (p: SeizurePalette): React.CSSProperties => ({
  width: '100%', padding: '6px 8px', borderRadius: 6,
  border: `1px solid ${p.line}`, background: p.input, color: p.inputText,
  fontSize: 13, textAlign: 'start', boxSizing: 'border-box',
});
