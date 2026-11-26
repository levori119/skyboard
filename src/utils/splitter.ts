// ספליטר משותף - מקור אמת יחיד למראה ולשטח התפיסה של כל ספליטר בעמדה.
//
// עמדת היעד היא מסך מגע ועט (Wacom Cintiq). ספליטר של 4-7px נראה כמו קו
// דק שאי-אפשר לפגוע בו בעט, ולכן כאן:
// - **שטח תפיסה רחב** (SPLITTER_HIT_PX) - כל הרוחב מגיב ללחיצה.
// - **קו מרכזי עבה וברור** + **ידית** באמצע, כדי שיהיה ברור במבט איפה תופסים.
// - נדלק בתכלת ב-hover ובזמן גרירה (`data-active`).
//
// המראה עצמו ב-App.css (`.sk-splitter`). הקוד כאן רק בוחר את הצבעים לפי התמה
// ומרכיב את ה-props, כדי שלא יחזרו ספליטרים עם צבע ורוחב מקודדים בכל מקום.

import type React from 'react';

/** רוחב שטח התפיסה (ביחידות מוגדלות, לפני --s) */
export const SPLITTER_HIT_PX = 14;

export type SplitterAxis = 'col' | 'row';
type Theme = 'light' | 'dark' | 'ocean';

const COLORS: Record<Theme, { line: string; track: string }> = {
  dark: { line: '#64748b', track: 'rgba(100,116,139,0.14)' },
  light: { line: '#94a3b8', track: 'rgba(148,163,184,0.18)' },
  // ocean היא תמה כהה - קו בהיר, כמו dark
  ocean: { line: '#0e9fbd', track: 'rgba(14,159,189,0.16)' },
};

export function splitterColors(themeMode: string | null | undefined) {
  return COLORS[(themeMode as Theme)] ?? COLORS.dark;
}

/**
 * ה-props של ספליטר: `col` = קו אנכי שמשנה רוחב, `row` = קו אופקי שמשנה גובה.
 * מיזוג: `<div {...sp} style={{ ...sp.style, order: 5 }} />`.
 */
export function splitterProps(axis: SplitterAxis, themeMode: string | null | undefined, active = false): {
  className: string; 'data-active'?: '1'; style: React.CSSProperties;
} {
  const c = splitterColors(themeMode);
  return {
    className: `sk-splitter sk-splitter-${axis}`,
    ...(active ? { 'data-active': '1' as const } : {}),
    style: { ['--sk-split-line' as any]: c.line, ['--sk-split-track' as any]: c.track },
  };
}
