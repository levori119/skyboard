import { describe, it, expect, vi } from 'vitest';
import { quitApp } from './appQuit';

function fakeWindow(opts: { bridge?: unknown; closes?: boolean }) {
  const w: any = { closed: false, skyking: opts.bridge };
  w.close = vi.fn(() => { if (opts.closes) w.closed = true; });
  return w as Window;
}

describe('quitApp', () => {
  it('בעמדה - יוצא דרך הגשר ולא סוגר חלון', async () => {
    const quit = vi.fn().mockResolvedValue({ ok: true });
    const w = fakeWindow({ bridge: { quitApp: quit } });
    expect(await quitApp(w)).toBe('electron');
    expect(quit).toHaveBeenCalledOnce();
    expect(w.close).not.toHaveBeenCalled();
  });

  it('גשר שסירב - נופל לסגירת החלון', async () => {
    const w = fakeWindow({ bridge: { quitApp: vi.fn().mockResolvedValue({ ok: false }) }, closes: true });
    expect(await quitApp(w)).toBe('window');
  });

  it('גשר שזרק - נופל לסגירת החלון', async () => {
    const w = fakeWindow({ bridge: { quitApp: vi.fn().mockRejectedValue(new Error('x')) }, closes: true });
    expect(await quitApp(w)).toBe('window');
  });

  it('דפדפן שחוסם סגירה - מדווח unsupported', async () => {
    const w = fakeWindow({ closes: false });
    expect(await quitApp(w)).toBe('unsupported');
    expect(w.close).toHaveBeenCalledOnce();
  });
});
