// הסוכן קורא את דגל "התחשבות בנתק" בעלייה: מהמרכז, ואם אין קשר - מהמאגר המקומי.
import { describe, it, expect, vi } from 'vitest';
import { resolveStationFailover } from './failoverFlag.cjs';

const ok = (enabled) => ({ ok: true, json: async () => ({ enabled }) });
const routerStub = () => { const r = { value: true, setFailover: vi.fn(v => { r.value = v; }) }; return r; };

describe('resolveStationFailover', () => {
  it('המרכז עונה - הוא קובע', async () => {
    const router = routerStub();
    const fetchImpl = vi.fn(async (url) => (url.startsWith('https://central') ? ok(false) : ok(true)));
    const r = await resolveStationFailover({ apiTarget: 'https://central', localTarget: () => 'http://127.0.0.1:1', router, fetchImpl });
    expect(r).toEqual({ enabled: false, source: 'central' });
    expect(router.setFailover).toHaveBeenCalledWith(false);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://central/api/station/failover');
  });

  it('אין קשר למרכז - נקרא מהמאגר המקומי, גם אם הוא עולה רק אחרי כמה ניסיונות', async () => {
    const router = routerStub();
    let local = null;
    let tries = 0;
    const fetchImpl = vi.fn(async (url) => {
      if (url.startsWith('https://central')) throw new Error('offline');
      return ok(false);
    });
    const r = await resolveStationFailover({
      apiTarget: 'https://central', router, fetchImpl, retryMs: 1, maxWaitMs: 500,
      localTarget: () => (++tries >= 3 ? (local ??= 'http://127.0.0.1:9') : null),
    });
    expect(r).toEqual({ enabled: false, source: 'local' });
    expect(router.value).toBe(false);
  });

  it('אין מרכז ואין מאגר - נשאר דלוק (ההתנהגות הקיימת)', async () => {
    const router = routerStub();
    const fetchImpl = vi.fn(async () => { throw new Error('offline'); });
    const r = await resolveStationFailover({
      apiTarget: 'https://central', router, fetchImpl, retryMs: 1, maxWaitMs: 20, localTarget: () => null,
    });
    expect(r).toEqual({ enabled: true, source: 'default' });
    expect(router.setFailover).not.toHaveBeenCalled();
  });

  it('מרכז מגרסה ישנה (404) נחשב "אין תשובה" ולא כיבוי', async () => {
    const router = routerStub();
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    const r = await resolveStationFailover({
      apiTarget: 'https://central', router, fetchImpl, retryMs: 1, maxWaitMs: 20, localTarget: () => 'http://127.0.0.1:9',
    });
    expect(r.enabled).toBe(true);
  });
});
