// סביבות תרגול — בדיקות middleware הזרקת הסביבה (TDD, לפני מימוש)
import { describe, it, expect, vi } from 'vitest';
import { createEnvironmentMiddleware } from './environment.js';
import { currentEnv, currentSchema } from '../db/env-context.js';

function mockReqRes(headers = {}) {
  const req = { get: (name) => headers[name.toLowerCase()] };
  const res = {
    statusCode: null,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  return { req, res };
}

describe('environmentMiddleware', () => {
  it('בלי header → סביבה 1 (public), בלי יצירת סכמה — תאימות לאחור מלאה', async () => {
    const ensure = vi.fn();
    const mw = createEnvironmentMiddleware({ ensure });
    const { req, res } = mockReqRes();
    let seen = null;
    await mw(req, res, () => { seen = { env: currentEnv(), schema: currentSchema() }; });
    expect(seen).toEqual({ env: 1, schema: 'public' });
    expect(ensure).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(null);
  });

  it('X-Env: 17 → הקשר env_17 בתוך ה-handler + ensure נקרא עם 17', async () => {
    const ensure = vi.fn().mockResolvedValue(undefined);
    const mw = createEnvironmentMiddleware({ ensure });
    const { req, res } = mockReqRes({ 'x-env': '17' });
    let seen = null;
    await mw(req, res, () => { seen = { env: currentEnv(), schema: currentSchema() }; });
    expect(seen).toEqual({ env: 17, schema: 'env_17' });
    expect(ensure).toHaveBeenCalledWith(17);
  });

  it('סביבה טסה (X-Env: 5) → public, בלי ensure', async () => {
    const ensure = vi.fn();
    const mw = createEnvironmentMiddleware({ ensure });
    const { req, res } = mockReqRes({ 'x-env': '5' });
    let seen = null;
    await mw(req, res, () => { seen = currentSchema(); });
    expect(seen).toBe('public');
    expect(ensure).not.toHaveBeenCalled();
  });

  it('ensure מסתיים לפני next (אין מרוץ בין יצירת סכמה לשאילתה ראשונה)', async () => {
    const order = [];
    const ensure = vi.fn(async () => {
      await new Promise(r => setTimeout(r, 10));
      order.push('ensure');
    });
    const mw = createEnvironmentMiddleware({ ensure });
    const { req, res } = mockReqRes({ 'x-env': '30' });
    await mw(req, res, () => order.push('next'));
    expect(order).toEqual(['ensure', 'next']);
  });

  it.each(['0', '51', 'abc', '12.5', '-4'])('X-Env לא חוקי (%s) → 400 בלי next', async (bad) => {
    const ensure = vi.fn();
    const mw = createEnvironmentMiddleware({ ensure });
    const { req, res } = mockReqRes({ 'x-env': bad });
    const next = vi.fn();
    await mw(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
    expect(ensure).not.toHaveBeenCalled();
  });

  it('כשל ביצירת סכמה → 503 בלי next (לא נופלים ל-public בטעות)', async () => {
    const ensure = vi.fn().mockRejectedValue(new Error('neon down'));
    const mw = createEnvironmentMiddleware({ ensure });
    const { req, res } = mockReqRes({ 'x-env': '42' });
    const next = vi.fn();
    await mw(req, res, next);
    expect(res.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });
});
