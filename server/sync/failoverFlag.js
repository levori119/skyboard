// דגל "התחשבות בנתק" - האם העמדה נופלת למאגר המקומי כשהמרכז לא עונה.
//
// הבקשה (אורי, 2026-10-11): "FLAG שמגדיר אם מתחשבים בנתק או לא - כמו פעם,
// לפני שהגדרנו גיבוי מקומי. מוגדר בניהול, וכל עלייה בודקת ב-DB".
//
//   דלוק (ברירת המחדל) - הסוכן מנתב למאגר המקומי בנתק, ושירות המראה רץ.
//   כבוי               - כמו לפני הגיבוי: כל בקשה הולכת למרכז, אין מראה.
//
// ⚠️ **נקרא פעם אחת, בעליית העמדה.** שינוי בניהול נכנס לתוקף בעלייה הבאה של
// כל עמדה - לא באמצע משמרת, שבה החלפת מאגר מתחת לידיים של הפקח מסוכנת
// יותר מכל אחת משתי ההגדרות.
//
// נשמר ב-`system_defaults`, שכבר עוברת במראה - ולכן עמדה שעולה **בנתק** יודעת
// את הערך האחרון שהמרכז קבע.

export const FAILOVER_KEY = 'offlineFailover';

/** ערך שלא הוגדר מעולם = דלוק: ההתנהגות של היום לא משתנה בלי שמישהו בחר. */
export function parseFailover(value) {
  if (value == null) return true;
  const s = String(value).trim().toLowerCase();
  if (s === '') return true;
  return !['0', 'false', 'off', 'no'].includes(s);
}

/** @param {(sql: string, params?: unknown[]) => Promise<{rows: any[]}>} query */
export async function readFailover(query) {
  const { rows } = await query(`SELECT value FROM system_defaults WHERE key = $1`, [FAILOVER_KEY]);
  return parseFailover(rows[0]?.value);
}

export async function writeFailover(query, enabled) {
  await query(
    `INSERT INTO system_defaults (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [FAILOVER_KEY, enabled ? '1' : '0'],
  );
}

/**
 * הכרעה בעליית העמדה: המרכז הוא הסמכות; בלעדיו - מה שהגיע במראה; בלי שניהם -
 * דלוק. `fetchCentral` מחזיר boolean, או null כשאין תשובה.
 */
export async function resolveFailoverAtBoot({ fetchCentral, readLocal }) {
  try {
    const v = await fetchCentral();
    if (typeof v === 'boolean') return { enabled: v, source: 'central' };
  } catch { /* אין קשר - לשלב הבא */ }
  try {
    const v = await readLocal();
    if (typeof v === 'boolean') return { enabled: v, source: 'local' };
  } catch { /* אין מאגר מקומי */ }
  return { enabled: true, source: 'default' };
}

/** GET {central}/api/station/failover - נתיב ציבורי. null כשאין תשובה תקינה. */
export async function fetchCentralFailover(central, { timeoutMs = 4000, fetchImpl = fetch } = {}) {
  const base = String(central || '').replace(/\/+$/, '');
  if (!base) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${base}/api/station/failover`, { signal: ctrl.signal, headers: { 'Cache-Control': 'no-store' } });
    if (!res.ok) return null;
    const d = await res.json();
    return typeof d?.enabled === 'boolean' ? d.enabled : null;
  } finally {
    clearTimeout(t);
  }
}
