import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import { listen } from './listen.js';

const opened = [];
const close = (s) => new Promise(resolve => s.close(resolve));

afterEach(async () => {
  while (opened.length) await close(opened.pop());
});

describe('listen', () => {
  it('מחזיר שרת שבאמת מאזין (address אמיתי)', async () => {
    const server = await listen(express(), 0, '127.0.0.1');
    opened.push(server);
    const addr = server.address();
    expect(addr).not.toBeNull();
    expect(addr.port).toBeGreaterThan(0);
    const res = await fetch(`http://127.0.0.1:${addr.port}/nope`);
    expect(res.status).toBe(404); // express חי ועונה
  });

  // הלב: app.listen של Express 5 רושם את ה-callback גם כמאזין ל-'error'
  // (application.js: server.once('error', done)), ולכן bind כושל מפעיל את
  // ה-callback ה"מוצלח" והשרת מדפיס "listening" בלי להאזין. כאן זה חייב לזרוק.
  it('bind כושל נכשל בקול - לא מדווח הצלחה', async () => {
    const first = await listen(express(), 0, '127.0.0.1');
    opened.push(first);
    const takenPort = first.address().port;

    let resolved = false;
    const err = await listen(express(), takenPort, '127.0.0.1')
      .then(s => { resolved = true; opened.push(s); return null; })
      .catch(e => e);

    expect(resolved).toBe(false);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('EADDRINUSE');
  });

  it('כתובת לא חוקית למארח → reject ולא תלייה', async () => {
    const err = await listen(express(), 0, '203.0.113.1') // TEST-NET-3, לא קיים כאן
      .then(s => { opened.push(s); return null; })
      .catch(e => e);
    expect(err).toBeInstanceOf(Error);
  });
});
