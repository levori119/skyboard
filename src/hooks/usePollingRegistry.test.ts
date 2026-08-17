import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PollingRegistry } from './usePollingRegistry';

describe('PollingRegistry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('batches all tasks into a single underlying timer', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const reg = new PollingRegistry();
    reg.register('a', () => {}, 2000, { immediate: false });
    reg.register('b', () => {}, 5000, { immediate: false });
    reg.register('c', () => {}, 10000, { immediate: false });
    expect(reg.taskCount()).toBe(3);
    expect(reg.timerActive()).toBe(true);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1); // ← לב הממצא: טיימר אחד, לא 3
  });

  it('runs each task on its own interval schedule', async () => {
    const reg = new PollingRegistry();
    const fast = vi.fn();
    const slow = vi.fn();
    reg.register('fast', fast, 2000, { immediate: false });
    reg.register('slow', slow, 5000, { immediate: false });

    await vi.advanceTimersByTimeAsync(10000);

    expect(fast).toHaveBeenCalledTimes(5); // 2,4,6,8,10s
    expect(slow).toHaveBeenCalledTimes(2); // 5,10s
  });

  it('runs immediately on register by default', async () => {
    const reg = new PollingRegistry();
    const fn = vi.fn();
    reg.register('x', fn, 5000); // immediate default true
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('unregister stops the task and clears the timer when empty', async () => {
    const reg = new PollingRegistry();
    const fn = vi.fn();
    reg.register('x', fn, 1000, { immediate: false });
    await vi.advanceTimersByTimeAsync(2500);
    const countBefore = fn.mock.calls.length;
    reg.unregister('x');
    expect(reg.timerActive()).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fn.mock.calls.length).toBe(countBefore); // אין קריאות נוספות
  });

  it('re-registering the same id replaces (idempotent, no duplicate task)', () => {
    const reg = new PollingRegistry();
    reg.register('x', () => {}, 1000, { immediate: false });
    reg.register('x', () => {}, 3000, { immediate: false });
    expect(reg.taskCount()).toBe(1);
  });

  it('skips a task while its previous async run is still in flight', async () => {
    const reg = new PollingRegistry();
    let resolveRun: (() => void) | null = null;
    const fn = vi.fn(() => new Promise<void>((resolve) => { resolveRun = resolve; }));
    reg.register('slow', fn, 1000, { immediate: false });

    await vi.advanceTimersByTimeAsync(3500); // 3 ticks would be due, but run never resolved
    expect(fn).toHaveBeenCalledTimes(1); // לא מצטבר

    resolveRun!(); // הריצה הסתיימה
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2); // עכשיו רץ שוב
  });
});
