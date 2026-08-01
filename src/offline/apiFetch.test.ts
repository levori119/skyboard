import { describe, it, expect, beforeEach } from 'vitest';
import { createOfflineFetch, cacheKey, HDR_FROM_CACHE, HDR_CACHED_AT, BLOCKED_CODE } from './apiFetch';
import { createMemoryStore } from './store';
import { getNetSnapshot, __resetNetStatus, dataAgeMs } from './netStatus';

/** שרת מדומה: מחליפים את `handler` כדי לדמות נתק / שחזור. */
function makeHarness(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const calls: { url: string; method: string }[] = [];
  const base: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    calls.push({ url, method: (init?.method || 'GET').toUpperCase() });
    return handler(url, init);
  }) as typeof fetch;
  const cacheStore = createMemoryStore();
  const outboxStore = createMemoryStore();
  let t = 1_000_000;
  const f = createOfflineFetch({
    baseFetch: base, cacheStore, outboxStore, now: () => t, timeoutMs: 0,
  });
  return { f, calls, cacheStore, outboxStore, advance: (ms: number) => { t += ms; }, at: () => t };
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const down = () => Promise.reject(new TypeError('Failed to fetch'));

beforeEach(() => __resetNetStatus());

describe('cacheKey', () => {
  it('יציב מול שינוי origin (עמדה עם dist מקומי מול שרת מרוחק)', () => {
    expect(cacheKey('http://10.0.0.5:3001/api/strips', 'GET'))
      .toBe(cacheKey('/api/strips', 'GET'));
  });
  it('שומר query — הוא משנה את התשובה', () => {
    expect(cacheKey('/api/active-takeoffs?airfield_id=3', 'GET'))
      .not.toBe(cacheKey('/api/active-takeoffs?airfield_id=4', 'GET'));
  });
  it('⚠️ מפריד בין סביבות — תרגול ואמת לא חולקים cache', () => {
    expect(cacheKey('/api/strips', 'GET', '1'))
      .not.toBe(cacheKey('/api/strips', 'GET', '12'));
  });
});

describe('בידוד סביבות', () => {
  it('סביבה טסה לא מקבלת את המידע שנשמר בסביבת תרגול', async () => {
    let env = '1';
    let live = true;
    const calls: string[] = [];
    const base: typeof fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      if (!live) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify([{ env }]), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
    const f = createOfflineFetch({
      baseFetch: base, cacheStore: createMemoryStore(), outboxStore: createMemoryStore(),
      now: () => 1, timeoutMs: 0, scope: () => env,
    });

    await f('/api/strips');            // מילוי cache בסביבה 1
    await f._settled();
    env = '12';                        // מעבר לסביבת תרגול
    live = false;                      // נתק

    // אין cache לסביבה 12 → חייב לזרוק, ולא להגיש את המידע של סביבה 1
    await expect(f('/api/strips')).rejects.toThrow();
  });

  it('פריט outbox נשלח חזרה לסביבה שבה נרשם, גם אחרי מעבר סביבה', async () => {
    let env = '12';
    let live = false;
    const sent: (string | undefined)[] = [];
    const base: typeof fetch = (async (_i: RequestInfo | URL, init?: RequestInit) => {
      if (!live) throw new TypeError('Failed to fetch');
      sent.push(new Headers(init?.headers).get('X-Env') ?? undefined);
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    const f = createOfflineFetch({
      baseFetch: base, cacheStore: createMemoryStore(), outboxStore: createMemoryStore(),
      now: () => 1, timeoutMs: 0, scope: () => env,
    });

    await f('/api/strokes', { method: 'POST', body: '{}' });  // נרשם בסביבה 12
    env = '1';                                                 // המפעיל עבר לסביבה טסה
    live = true;
    await f._drain();

    expect(sent).toEqual(['12']);  // ולא '1'
  });
});

describe('קריאה (GET)', () => {
  it('מצליחה → נשמרת ב-cache ומסמנת מחובר', async () => {
    const h = makeHarness(async () => ok([{ id: 1 }]));
    const res = await h.f('/api/strips');
    expect(await res.json()).toEqual([{ id: 1 }]);
    expect(getNetSnapshot().online).toBe(true);
    expect(getNetSnapshot().lastSuccessAt).toBe(h.at());
    await h.f._settled();
    expect(await h.cacheStore.get(cacheKey('/api/strips', 'GET'))).toBeTruthy();
  });

  it('נכשלת ויש cache → מחזירה את המידע האחרון עם סימון גיל', async () => {
    let live = true;
    const h = makeHarness(async () => (live ? ok([{ id: 7 }]) : down()));
    await h.f('/api/strips');           // ממלא cache
    await h.f._settled();
    h.advance(240_000);                  // 4 דקות
    live = false;

    const res = await h.f('/api/strips');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 7 }]);
    expect(res.headers.get(HDR_FROM_CACHE)).toBe('1');
    expect(Number(res.headers.get(HDR_CACHED_AT))).toBe(h.at() - 240_000);
    expect(getNetSnapshot().online).toBe(false);
    expect(getNetSnapshot().offlineSince).toBe(h.at());
  });

  it('נכשלת ואין cache → זורקת, ולא מחזירה תשובה ריקה', async () => {
    const h = makeHarness(async () => down());
    await expect(h.f('/api/strips')).rejects.toThrow();
    expect(getNetSnapshot().online).toBe(false);
  });

  it('שגיאת 5xx נחשבת נתק ומוגשת מה-cache', async () => {
    let live = true;
    const h = makeHarness(async () => (live ? ok(['a']) : new Response('bad gateway', { status: 502 })));
    await h.f('/api/serials');
    await h.f._settled();
    live = false;
    const res = await h.f('/api/serials');
    expect(res.headers.get(HDR_FROM_CACHE)).toBe('1');
    expect(getNetSnapshot().online).toBe(false);
  });

  it('404 היא תשובה לוגית ואינה נתק', async () => {
    const h = makeHarness(async () => new Response('{}', { status: 404 }));
    const res = await h.f('/api/strips/999');
    expect(res.status).toBe(404);
    expect(getNetSnapshot().online).toBe(true);
  });

  it('בקשה שאינה API עוברת בלי יירוט', async () => {
    const h = makeHarness(async () => new Response('<svg/>', { status: 200 }));
    const res = await h.f('/favicon.svg');
    expect(res.status).toBe(200);
    expect(await h.cacheStore.keys()).toEqual([]);
  });
});

describe('כתיבה בנתק — פעולה משותפת נחסמת', () => {
  it('העברת פ"מ נחסמת עם קוד מזוהה', async () => {
    const h = makeHarness(async () => down());
    const res = await h.f('/api/transfers', { method: 'POST', body: '{}' });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe(BLOCKED_CODE);
    expect(body.path).toBe('/api/transfers');
    expect(getNetSnapshot().lastBlocked?.path).toBe('/api/transfers');
    expect(await h.outboxStore.keys()).toEqual([]); // לא נשמרת לשליחה מאוחרת
  });

  it('שינוי סטטוס בסיס נחסם', async () => {
    const h = makeHarness(async () => down());
    const res = await h.f('/api/base-statuses/3/notam', { method: 'PATCH', body: '{}' });
    expect(res.status).toBe(503);
    expect(await h.outboxStore.keys()).toEqual([]);
  });
});

describe('כתיבה בנתק — פעולה פרטית נכנסת ל-outbox', () => {
  it('תבנית כתב יד נשמרת ונשלחת כשהקשר חוזר', async () => {
    let live = false;
    const h = makeHarness(async () => (live ? ok({ ok: true }) : down()));

    const res = await h.f('/api/strokes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"label":"א"}',
    });
    expect(res.status).toBe(202);
    expect((await res.json()).queued).toBe(true);
    expect(getNetSnapshot().queued).toBe(1);

    const queued = await h.outboxStore.keys();
    expect(queued).toHaveLength(1);

    live = true;
    await h.f._drain();
    expect(await h.outboxStore.keys()).toEqual([]);
    expect(h.calls.filter(c => c.url === '/api/strokes' && c.method === 'POST')).toHaveLength(2);
  });

  it('יומן ביקורת נשמר ולא אובד', async () => {
    const h = makeHarness(async () => down());
    await h.f('/api/activity-log', { method: 'POST', body: '{"action":"x"}' });
    const items = await h.f._outbox.pending();
    expect(items).toHaveLength(1);
    expect(items[0].body).toBe('{"action":"x"}');
    expect(items[0].method).toBe('POST');
  });

  it('heartbeat נזרק ואינו תופס מקום בתור', async () => {
    const h = makeHarness(async () => down());
    const res = await h.f('/api/workstations/3/heartbeat', { method: 'PATCH' });
    expect(res.status).toBe(200);
    expect((await res.json()).dropped).toBe(true);
    expect(await h.outboxStore.keys()).toEqual([]);
  });
});

describe('שחזור קשר', () => {
  it('GET מוצלח אחרי נתק משגר את ה-outbox אוטומטית', async () => {
    let live = false;
    const h = makeHarness(async () => (live ? ok({ ok: true }) : down()));
    await h.f('/api/strokes', { method: 'POST', body: '{}' });
    expect(getNetSnapshot().queued).toBe(1);

    live = true;
    await h.f('/api/strips');
    await h.f._settled(); // ה-drain הוא fire-and-forget
    expect(getNetSnapshot().online).toBe(true);
    expect(await h.outboxStore.keys()).toEqual([]);
  });
});

describe('גיל המידע', () => {
  it('מדווח כמה זמן עבר מאז התשובה האחרונה', async () => {
    const h = makeHarness(async () => ok([]));
    await h.f('/api/strips');
    await h.f._settled();
    h.advance(90_000);
    expect(dataAgeMs(h.at())).toBe(90_000);
  });
  it('null כשעוד לא התקבל מידע כלל', () => {
    expect(dataAgeMs()).toBeNull();
  });
});
