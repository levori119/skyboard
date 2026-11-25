import { describe, it, expect } from 'vitest';
import { isGhostClick, GHOST_CLICK_MS } from './ghostClick';

describe('isGhostClick - עט/מגע: ה-click התואם אחרי pointerup לא סוגר את התפריט שנפתח', () => {
  it('click מיד אחרי הפתיחה - רפאים', () => {
    expect(isGhostClick(1000, 1000)).toBe(true);
    expect(isGhostClick(1000, 1000 + GHOST_CLICK_MS - 1)).toBe(true);
  });
  it('click אחרי חצי שנייה - סגירה מכוונת', () => {
    expect(isGhostClick(1000, 1000 + GHOST_CLICK_MS)).toBe(false);
    expect(isGhostClick(1000, 5000)).toBe(false);
  });
  it('בלי זמן פתיחה / שעון שחזר אחורה - לא רפאים', () => {
    expect(isGhostClick(null, 1000)).toBe(false);
    expect(isGhostClick(2000, 1000)).toBe(false);
  });
});
