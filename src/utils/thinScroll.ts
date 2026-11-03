import type { CSSProperties } from 'react';

/**
 * פס גלילה **עדין** - דק, בלי מסילה, ובצבע של התמה.
 *
 * פס הגלילה של הדפדפן (לבן, עבה) היה הדבר הבולט ביותר מתחת לטבלה צרה, והעין
 * נמשכה אליו ולא לנתונים. `scrollbar-width/color` הם התקן (Chromium 121+), ודורסים
 * את כללי `::-webkit-scrollbar` הגלובליים רק באלמנט הזה.
 */
export function thinScroll(theme: 'light' | 'dark' | 'ocean'): CSSProperties {
  const thumb = theme === 'light' ? '#cbd5e1' : theme === 'ocean' ? '#0e7490' : '#475569';
  return { scrollbarWidth: 'thin', scrollbarColor: `${thumb} transparent` };
}
