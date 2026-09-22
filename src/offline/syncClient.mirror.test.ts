// המראה מהמרכז - למה היא מגיעה בחלקים, ומה קורה כשהיא נקטעת.
//
// התקלה שזה מתעד: צילום מלא של 128 הטבלאות נמדד ב-10.5 שניות ו-4.58MB, מול
// תקרת זמן של 8 שניות בפרוקסי של העמדה. **כל** מראה חזרה 502, המאגר המקומי
// נשאר ריק, ובמעבר לנתק המסך התרוקן - "כל הנתונים נעלמים".
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pullMirror, getSyncState, __enableForTests } from './syncClient';

const TABLES = Array.from({ length: 30 }, (_, i) => `t${i}`);

type Call = { url: string; method: string };

function mockServer({ failAt = -1 }: { failAt?: number } = {}) {
  const calls: Call[] = [];
  let batches = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method || 'GET' });

    if (url.includes('/sync/state')) {
      return new Response(JSON.stringify({ pending: 0, conflicts: [], resolved: [] }), { status: 200 });
    }
    if (url.includes('/mirror/tables')) {
      return new Response(JSON.stringify({ tables: TABLES }), { status: 200 });
    }
    if (url.includes('/mirror?tables=')) {
      if (batches === failAt) { batches++; return new Response('boom', { status: 502 }); }
      batches++;
      const names = decodeURIComponent(url.split('tables=')[1]).split(',');
      return new Response(JSON.stringify({ schema: 'public', at: '', tables: names.map(t => ({ table: t, rows: [] })) }), { status: 200 });
    }
    // POST /__local/sync/mirror
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, batchCount: () => batches };
}

describe('pullMirror - מראה בחלקים', () => {
  beforeEach(() => { __enableForTests(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('מושכת את רשימת הטבלאות, ואז קבוצות - ולא בקשה אחת ענקית', async () => {
    const srv = mockServer();
    const ok = await pullMirror();
    expect(ok).toBe(true);

    const list = srv.calls.filter(c => c.url.includes('/mirror/tables'));
    const gets = srv.calls.filter(c => c.url.includes('/mirror?tables='));
    const posts = srv.calls.filter(c => c.method === 'POST' && c.url.includes('/mirror'));

    expect(list).toHaveLength(1);
    // 30 טבלאות בקבוצות של 12 = שלוש בקשות, לא אחת
    expect(gets).toHaveLength(3);
    expect(posts).toHaveLength(3);
    expect(getSyncState().mirrorReady).toBe(true);
  });

  it('כל בקשה נושאת רק את הטבלאות שלה, בסדר שהשרת החזיר', async () => {
    const srv = mockServer();
    await pullMirror();

    const gets = srv.calls.filter(c => c.url.includes('/mirror?tables='));
    const first = decodeURIComponent(gets[0].url.split('tables=')[1]).split(',');
    expect(first).toEqual(TABLES.slice(0, 12));
    const last = decodeURIComponent(gets[2].url.split('tables=')[1]).split(',');
    expect(last).toEqual(TABLES.slice(24));
  });

  // קטיעה אינה אובדן: מה שנקלט כבר יושב במאגר, והסיבוב הבא ממשיך משם ולא
  // מתחיל מאפס. בלי זה רשת רועדת הייתה משאירה את העמדה ריקה לנצח.
  it('קטיעה באמצע - הסיבוב הבא ממשיך מהמקום שנעצר', async () => {
    const srv = mockServer({ failAt: 1 });
    expect(await pullMirror()).toBe(false);
    expect(getSyncState().mirrorReady).toBe(false);
    const firstRound = srv.calls.filter(c => c.url.includes('/mirror?tables=')).length;
    expect(firstRound).toBe(2);   // הראשונה עברה, השנייה נפלה

    const srv2 = mockServer();
    expect(await pullMirror()).toBe(true);
    const second = srv2.calls.filter(c => c.url.includes('/mirror?tables='));
    // ממשיך מהקבוצה השנייה, ולא מתחיל מחדש
    expect(second).toHaveLength(2);
    expect(decodeURIComponent(second[0].url.split('tables=')[1]).split(',')).toEqual(TABLES.slice(12, 24));
    expect(getSyncState().mirrorReady).toBe(true);
  });
});
