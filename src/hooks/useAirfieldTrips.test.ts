import { describe, it, expect, vi, afterEach } from 'vitest';
import { PollingRegistry } from './usePollingRegistry';
import { tripsPollId } from './useAirfieldTrips';

// חלון "ניהול נסיעות" וההתראות המתפרצות סוקרים שניהם את כל נסיעות השדה. אם הם
// חולקים מזהה משימה, החלון דורס את הסקר של ההתראות, וסגירתו מבטלת אותו - כלומר
// ההתראות מפסיקות להתעדכן בדיוק כשהחלון סגור.
describe('מזהה הסקר של נסיעות השדה', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('שני צרכנים באותו שדה ובאותו טווח מקבלים מזהים שונים', () => {
    expect(tripsPollId('all', 1, ':r1:')).not.toBe(tripsPollId('all', 1, ':r2:'));
  });

  it('המזהה נבדל גם לפי שדה וטווח', () => {
    expect(tripsPollId('all', 1, ':r1:')).not.toBe(tripsPollId('all', 2, ':r1:'));
    expect(tripsPollId('all', 1, ':r1:')).not.toBe(tripsPollId('upcoming', 1, ':r1:'));
  });

  it('סגירת צרכן אחד אינה עוצרת את הסקר של האחר', async () => {
    vi.useFakeTimers();
    const reg = new PollingRegistry();
    const alerts = vi.fn();
    const windowPoll = vi.fn();
    reg.register(tripsPollId('all', 1, ':alerts:'), alerts, 1000, { immediate: false });
    reg.register(tripsPollId('all', 1, ':window:'), windowPoll, 1000, { immediate: false });

    // החלון נסגר
    reg.unregister(tripsPollId('all', 1, ':window:'));
    await vi.advanceTimersByTimeAsync(2100);

    expect(alerts).toHaveBeenCalled();
    expect(windowPoll).not.toHaveBeenCalled();
    reg.unregister(tripsPollId('all', 1, ':alerts:'));
  });
});
