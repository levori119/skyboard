import type { CSSProperties } from 'react';

// ─── כותרות בפאנלי הצד (עזרים, פ"מים) ─────────────────────────────────────────
//
// **מקור אמת יחיד** לכותרת מקטע בפאנל צד. עד כה כל מקטע (בלוקים, מדיניות,
// קישורים, מסלולים, ATIS, קשר...) כתב את הכותרת שלו בעצמו: 11px, אפור חלש,
// ריפוד שונה מעט בכל אחד. הכותרת היא העוגן שהעין מחפשת ברשימה ארוכה, ולכן היא
// **עבה ובצבע הטקסט החזק של התמה** (שחור ביום, לבן בלילה), ובאותו רווח בכל מקטע.

export type PanelTheme = 'light' | 'dark' | 'ocean';

/** פס הכותרת של מקטע מתקפל. */
export const sectionBar = (theme: PanelTheme): CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: '6px',
  padding: '6px 8px', minHeight: 32, boxSizing: 'border-box',
  borderRadius: '6px', cursor: 'pointer',
  background: theme === 'light' ? '#e2e8f0' : '#0f172a',
});

/** טקסט הכותרת - עבה ובצבע הטקסט החזק של התמה. */
export const sectionTitle = (theme: PanelTheme): CSSProperties => ({
  flex: 1, minWidth: 0, textAlign: 'start', padding: '0 2px',
  fontSize: '13px', fontWeight: 800, lineHeight: 1.25, letterSpacing: '0.2px',
  color: theme === 'light' ? '#020617' : '#f8fafc',
});

/** כותרת הפאנל עצמו (שורת הראש שלו) - מדרגה אחת מעל כותרת מקטע. */
export const panelTitle = (theme: PanelTheme): CSSProperties => ({
  ...sectionTitle(theme), fontSize: '14px', padding: 0,
});
