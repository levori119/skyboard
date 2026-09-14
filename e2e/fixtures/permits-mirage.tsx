import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/i18n';
import VehiclePermitsWindow from '../../src/components/ground/VehiclePermitsWindow';

/**
 * מתקן בדיקה ל"ניהול נהגים": בחירת נהג מהמורשים במיראז' לבסיס.
 *
 * החלון האמיתי עם ההוקים שלו; רק הרשת מדומה, בצורה המדויקת של
 * GET /api/auth/mirage-drivers ו-GET /api/entry-permits. **לא נוגע ב-DB.**
 * `window.__mirage` קובע את תשובת המיראז' (רשימה / 'unavailable' / 'no_base'),
 * ו-`window.__posted` אוסף את מה שהחלון שלח בשמירה.
 */
document.documentElement.style.setProperty('--s', '1');

type W = { __mirage: unknown; __posted: unknown[] };
const w = window as unknown as W;
w.__posted = [];
w.__mirage = [
  { nationalId: '012345678', firstName: 'דני', lastName: 'כהן', fullName: 'דני כהן' },
  { nationalId: '012345682', firstName: 'רונית', lastName: 'לוי', fullName: 'רונית לוי' },
];

// נהג ותיק שנרשם לפני החובה ואינו במיראז'
const LEGACY = {
  id: 5, airfield_id: 1, first_name: 'משה', last_name: 'ותיק', national_id: '099999990', transport_role_id: null,
  permit_from: null, permit_until: null, status_override: null, notes: '', approved_by: '', vehicles: [], zones: [],
  created_at: '2026-09-01T08:00:00Z', updated_at: '2026-09-01T08:00:00Z',
};
let registry: unknown[] = [LEGACY];

const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.includes('/api/auth/mirage-drivers')) {
    if (w.__mirage === 'unavailable') return json({ error: 'mirage_unavailable' }, 502);
    if (w.__mirage === 'no_base') return json({ error: 'airfield_without_base' }, 409);
    return json({ baseId: 7, drivers: w.__mirage });
  }
  if (url.includes('/api/entry-permits') && (init?.method === 'POST' || init?.method === 'PUT')) {
    const body = JSON.parse(String(init.body));
    w.__posted.push({ method: init.method, url, body });
    const saved = { ...LEGACY, ...body, id: init.method === 'POST' ? 6 : 5, vehicles: [], zones: [] };
    registry = [...registry.filter((r) => (r as { id: number }).id !== saved.id), saved];
    return json(saved);
  }
  if (url.includes('/api/entry-permits/') && url.endsWith('/trips')) return json([]);
  if (url.includes('/api/entry-permits')) return json(registry);
  if (url.includes('/api/')) return json([]);
  return realFetch(input, init);
}) as typeof fetch;

createRoot(document.getElementById('root')!).render(
  <VehiclePermitsWindow airfieldId={1} themeMode="dark" onClose={() => {}} />,
);
