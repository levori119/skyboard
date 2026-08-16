// GAPI — אימות HMAC-SHA256 על גוף הבקשה הגולמי (ראה GAPI-CONTRACT.md §2).
// חתימה = sha256=<hex hmac(secret, `${timestamp}.${rawBody}`)>. חלון replay 5 דק'.
import crypto from 'node:crypto';

export const REPLAY_WINDOW_MS = 5 * 60 * 1000;

// בונה את ערך כותרת X-GAPI-Signature.
export function sign(secret, timestamp, rawBody) {
  const mac = crypto.createHmac('sha256', String(secret));
  mac.update(`${timestamp}.${rawBody}`);
  return 'sha256=' + mac.digest('hex');
}

// מאמת חתימה + חלון זמן. now מוזרק לצורכי בדיקה (ברירת מחדל Date.now()).
export function verify(secret, timestamp, rawBody, signature, now = Date.now()) {
  if (!secret || !signature || timestamp == null || timestamp === '') return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(now - ts) > REPLAY_WINDOW_MS) return false;
  const expected = sign(secret, timestamp, rawBody);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// מאמת בקשת express נכנסת מול secret. מחזיר { ok, reason }.
export function verifyRequest(req, secret, rawBody, now = Date.now()) {
  if (!secret) return { ok: false, reason: 'no-secret' };
  const timestamp = req.get ? req.get('X-GAPI-Timestamp') : req.headers?.['x-gapi-timestamp'];
  const signature = req.get ? req.get('X-GAPI-Signature') : req.headers?.['x-gapi-signature'];
  if (verify(secret, timestamp, rawBody, signature, now)) return { ok: true };
  return { ok: false, reason: 'bad-signature' };
}
