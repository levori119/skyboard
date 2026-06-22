// Screen-size scale helper — reads CSS var --s set by index.html before React loads
export const scale = parseFloat(document.documentElement.style.getPropertyValue('--s') || '1') || 1;

// Scale a pixel value by the screen factor
export const sc = (n: number): number => Math.round(n * scale);
