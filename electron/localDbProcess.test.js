// סגירת תהליך המאגר המקומי ביציאה מהעמדה.
//
// `child.kill()` ב-Windows הוא TerminateProcess - PGlite לא מגיע ל-close(),
// והתיקייה נשארת פגומה לעלייה הבאה (REFACTOR_LOG, 2026-10-16). קודם מבקשים
// סגירה, ורק אם התהליך לא יצא בזמן - הורגים.
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { stopLocalDbChild } = require('./localDbProcess.cjs');

function fakeChild({ exitsOnShutdown = true, connected = true } = {}) {
  const child = new EventEmitter();
  child.connected = connected;
  child.exitCode = null;
  child.sent = [];
  child.killed = false;
  child.send = msg => {
    child.sent.push(msg);
    if (exitsOnShutdown && msg?.type === 'shutdown') {
      setTimeout(() => { child.exitCode = 0; child.emit('exit', 0); }, 5);
    }
  };
  child.kill = () => { child.killed = true; child.exitCode = 1; child.emit('exit', 1); };
  return child;
}

describe('stopLocalDbChild', () => {
  it('מבקש סגירה מסודרת ולא הורג כשהתהליך יוצא בזמן', async () => {
    const child = fakeChild();
    const r = await stopLocalDbChild(child, { timeoutMs: 1000 });
    expect(child.sent).toEqual([{ type: 'shutdown' }]);
    expect(child.killed).toBe(false);
    expect(r).toBe('graceful');
  });

  it('תהליך שלא יוצא בזמן - נהרג', async () => {
    const child = fakeChild({ exitsOnShutdown: false });
    const r = await stopLocalDbChild(child, { timeoutMs: 30 });
    expect(child.killed).toBe(true);
    expect(r).toBe('killed');
  });

  it('בלי ערוץ IPC - הורגים מיד, אין למי לבקש', async () => {
    const child = fakeChild({ connected: false });
    const r = await stopLocalDbChild(child, { timeoutMs: 1000 });
    expect(child.sent).toEqual([]);
    expect(child.killed).toBe(true);
    expect(r).toBe('killed');
  });

  it('תהליך שכבר יצא - לא עושים דבר', async () => {
    const child = fakeChild();
    child.exitCode = 0;
    const kill = vi.spyOn(child, 'kill');
    expect(await stopLocalDbChild(child)).toBe('already_exited');
    expect(kill).not.toHaveBeenCalled();
    expect(await stopLocalDbChild(null)).toBe('already_exited');
  });
});
