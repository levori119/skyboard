import { describe, it, expect } from 'vitest';
import { shouldShowNavOverlay, navPathStroke, ANIM_TRAIL_COLOR } from './vehicleRouteAnim';

describe('shouldShowNavOverlay', () => {
  it('מסלול נסיעה מוצג לפי ההגדרה כשאין אנימציה', () => {
    expect(shouldShowNavOverlay(true, false)).toBe(true);
    expect(shouldShowNavOverlay(false, false)).toBe(false);
  });

  it('אנימציה פעילה מוצגת גם כשהצגת המסלולים כבויה', () => {
    expect(shouldShowNavOverlay(false, true)).toBe(true);
    expect(shouldShowNavOverlay(true, true)).toBe(true);
  });
});

describe('navPathStroke', () => {
  it('בזמן אנימציה הקו אדום - גם לרכב וגם למטוס', () => {
    expect(navPathStroke(true, true)).toBe(ANIM_TRAIL_COLOR);
    expect(navPathStroke(false, true)).toBe(ANIM_TRAIL_COLOR);
    expect(ANIM_TRAIL_COLOR).toBe('#ef4444');
  });

  it('בלי אנימציה נשארים הצבעים הקיימים', () => {
    expect(navPathStroke(true, false)).toBe('#f97316');
    expect(navPathStroke(false, false)).toBe('#60a5fa');
  });
});
