// GAPI — HTTP client מ-SKYKING ל-GAPI (ingest / subscription / changes).
// חותם כל בקשה ב-HMAC (ראה GAPI-CONTRACT.md §2) ומצרף X-Env של הסביבה הנוכחית.
import { sign } from './auth.js';
import { currentEnv } from '../db/env-context.js';

async function request(method, baseUrl, secret, path, body, now = Date.now()) {
  if (!baseUrl) throw new Error('gapi: no base_url configured');
  const raw = body == null ? '' : JSON.stringify(body);
  const url = baseUrl.replace(/\/+$/, '') + path;
  const headers = {
    'X-GAPI-Timestamp': String(now),
    'X-GAPI-Signature': sign(secret, now, raw),
    'X-Env': String(currentEnv()),
  };
  if (body != null) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers, body: body == null ? undefined : raw });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* תשובה לא-JSON */ }
  if (!res.ok) throw new Error(`GAPI ${method} ${path} → ${res.status}: ${String(text).slice(0, 200)}`);
  return json;
}

// דוחף מנת אירועים ל-GAPI. מחזיר { applied, mappings:[{local_id, gapi_id}], ... }.
export function ingest(baseUrl, secret, events) {
  return request('POST', baseUrl, secret, '/ingest', { source: 'skyking', events });
}

// קובע/מעדכן את המנוי ב-GAPI.
export function pushSubscription(baseUrl, secret, subscription) {
  return request('PUT', baseUrl, secret, '/subscription', subscription);
}

// מושך אירועים שאחרי ה-cursor (reconciliation). מחזיר מעטפת עם events + cursor.
export function fetchChanges(baseUrl, secret, since, limit = 500) {
  const q = new URLSearchParams();
  if (since) q.set('since', since);
  q.set('limit', String(limit));
  return request('GET', baseUrl, secret, `/changes?${q.toString()}`, null);
}
