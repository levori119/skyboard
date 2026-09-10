// ─── מצב המסלול נפתר בזמן קריאה, לא מועתק בזמן כתיבה ──────────────────────────
//
// מסלול מקושר הוא **מסלול פיזי אחד**: סגירה, קיצור, GRF, תאורות והכיוון שבשימוש
// שייכים לו, לא להגדרה של שדה מסוים.
//
// המימוש הראשון העתיק את המצב לצדדים המקושרים ברגע הכתיבה, וזה נשבר בדיוק במקום
// שבו הפקח נתקל בו: **מידע שכבר היה שם לפני שהקישור נוצר לא זז**, וקישור חדש
// לקבוצה קיימת נשאר ריק עד שמישהו "מאפס ומזין מחדש". גם ביטול קישור השאיר עותקים
// שאיש לא ידע שהם עותקים.
//
// כאן אין עותקים: השורה נשמרת היכן שנכתבה, וכל קריאה מרכיבה את מצב **הקבוצה**
// וממפה אותו למסלול ולשמות הקצוות של השדה ששואל. קישור חדש רואה מיד את המידע
// הקיים, וביטול קישור מפריד מיד - בלי מיגרציה, בלי איפוס ובלי משימת תיקון.
//
// שדות שנוספים לכל שורה: `runway_id` ממופה למסלול המקומי (הלקוח ממשיך לפתח לפיו),
// `id` המקורי נשמר (עריכה ומחיקה חלות על שני הצדדים), ו-`source_*` + `is_linked`
// כדי שהפקח יראה **מי** סגר את המסלול שלו ולא ינחש.

import { matchEndName, matchEndSlot } from './linkedRunways.js';

/**
 * זוגות (מסלול מקומי, מסלול שבו המצב נשמר) לכל מסלולי השדה - כולל המסלול עצמו.
 * הגשר: מסלול -> מסלול הראי שלו -> קבוצת הקישור -> הראי השכן -> המסלול שלו.
 */
export const RUNWAY_GROUP_SQL = `
  SELECT rw.id AS local_id, rw.id AS src_id
    FROM airfield_runways rw
   WHERE rw.airfield_id = $1
  UNION
  SELECT mine_rw.id AS local_id, other_rw.id AS src_id
    FROM airfield_runways mine_rw
    JOIN airfield_routes mine      ON mine.source_runway_id = mine_rw.id
    JOIN route_link_members m_mine ON m_mine.route_id = mine.id
    JOIN route_link_members m_oth  ON m_oth.group_id = m_mine.group_id
                                  AND m_oth.route_id <> m_mine.route_id
    JOIN airfield_routes other     ON other.id = m_oth.route_id
    JOIN airfield_runways other_rw ON other_rw.id = other.source_runway_id
   WHERE mine_rw.airfield_id = $1 AND other_rw.id <> mine_rw.id`;

/**
 * מפת הקבוצות של שדה: לכל מסלול מקומי, המסלולים שמצבם שייך לו.
 * @returns {Promise<{pairs: {local: object, src: object}[], srcIds: number[]}>}
 */
export async function runwayGroupPairs(query, airfieldId) {
  const { rows } = await query(RUNWAY_GROUP_SQL, [Number(airfieldId)]);
  if (!rows.length) return { pairs: [], srcIds: [] };
  const ids = [...new Set(rows.flatMap(r => [Number(r.local_id), Number(r.src_id)]))];
  const { rows: rws } = await query(
    `SELECT rw.*, af.name AS airfield_name
       FROM airfield_runways rw
       LEFT JOIN airfields af ON af.id = rw.airfield_id
      WHERE rw.id = ANY($1::int[])`, [ids]);
  const byId = new Map(rws.map(r => [Number(r.id), { ...r, id: Number(r.id) }]));
  const pairs = [];
  for (const r of rows) {
    const local = byId.get(Number(r.local_id)), src = byId.get(Number(r.src_id));
    if (local && src) pairs.push({ local, src });
  }
  return { pairs, srcIds: [...new Set(pairs.map(p => p.src.id))] };
}

const stamp = (v) => { const t = v ? Date.parse(v) : NaN; return Number.isNaN(t) ? 0 : t; };
const isLocal = (src, local) => Number(src.id) === Number(local.id);

/** שדות המקור שמוצמדים לכל שורה שנפתרה. */
const withSource = (row, src, local) => ({
  ...row,
  runway_id: Number(local.id),
  source_runway_id: Number(src.id),
  source_airfield_id: src.airfield_id ?? null,
  source_airfield_name: src.airfield_name ?? null,
  is_linked: !isLocal(src, local),
});

/**
 * NOTAMים: **איחוד** של כל הקבוצה. קיצור נשמר לפי מיקום הקצה ('a'/'b') ולכן
 * ממופה; NOTAM שאי אפשר למפות את הקצה שלו **נופל** - עדיף בלי קיצור מאשר קיצור
 * בקצה ההפוך. שלי מוצג ראשון.
 */
export function mergeNotams(entries) {
  const out = [];
  for (const { row, src, local } of entries) {
    if (row.shorten_end) {
      const slot = matchEndSlot(src, local, row.shorten_end);
      if (!slot) continue;
      out.push({ ...withSource(row, src, local), shorten_end: slot });
    } else {
      out.push(withSource(row, src, local));
    }
  }
  return out.sort((a, b) =>
    (a.is_linked === b.is_linked ? Number(a.id) - Number(b.id) : a.is_linked ? 1 : -1));
}

/** GRF: הדיווח **האחרון** לכל קצה. `heading` מתורגם לשם הקצה המקומי. */
export function mergeGrf(entries) {
  const best = new Map();
  for (const { row, src, local } of entries) {
    const heading = matchEndName(src, local, row.heading);
    if (!heading) continue;
    const key = `${local.id}:${heading.toLowerCase()}`;
    const cur = best.get(key);
    if (!cur || stamp(row.reported_at) >= stamp(cur.row.reported_at)) {
      best.set(key, { row: { ...withSource(row, src, local), heading }, ts: stamp(row.reported_at) });
    }
  }
  return [...best.values()].map(v => v.row);
}

/** תאורות: מצב אחד למסלול - העדכון האחרון בקבוצה. */
export function mergeLighting(entries) {
  const best = new Map();
  for (const { row, src, local } of entries) {
    const cur = best.get(Number(local.id));
    if (!cur || stamp(row.updated_at) >= stamp(cur.updated_at)) {
      best.set(Number(local.id), { ...withSource(row, src, local), updated_at: row.updated_at });
    }
  }
  return [...best.values()];
}

/**
 * אמצעי נחיתה: סטטוס אחד לכל (קצה, אמצעי) - העדכון האחרון בקבוצה.
 * `end_side` הוא מיקום ('a'/'b') ולכן ממופה כמו קיצור ב-NOTAM; שורה שאי אפשר
 * למפות את הקצה שלה **נופלת** - עדיף בלי סימון מאשר ILS תקול בקצה ההפוך.
 */
export function mergeAidStatus(entries) {
  const best = new Map();
  for (const { row, src, local } of entries) {
    const slot = matchEndSlot(src, local, row.end_side);
    if (!slot) continue;
    const key = `${local.id}:${slot}:${String(row.aid_type || '').toUpperCase()}`;
    const cur = best.get(key);
    if (!cur || stamp(row.updated_at) >= stamp(cur.updated_at)) {
      best.set(key, { ...withSource(row, src, local), end_side: slot, updated_at: row.updated_at });
    }
  }
  return [...best.values()];
}

/**
 * מסלולים בשימוש: שם הקצה מתורגם, ואז נאכף **כיוון אחד למסלול** - גם כשהצד
 * השני קבע כיוון אחר לפני כן. הכיוון שנקבע אחרון גובר, והישן מוצג כבוי.
 */
export function mergeEndUse(entries) {
  const perEnd = new Map();  // local:end -> שורה אחרונה
  for (const { row, src, local } of entries) {
    const endName = matchEndName(src, local, row.end_name);
    if (!endName) continue;
    const key = `${local.id}:${endName.toLowerCase()}`;
    const cur = perEnd.get(key);
    if (!cur || stamp(row.updated_at) >= stamp(cur.updated_at)) {
      perEnd.set(key, { ...withSource(row, src, local), end_name: endName, updated_at: row.updated_at });
    }
  }
  // כיוון אחד למסלול: מבין הקצוות שבשימוש נשאר האחרון, השאר כבויים
  const newestInUse = new Map();
  for (const row of perEnd.values()) {
    if (!row.in_takeoff && !row.in_landing) continue;
    const cur = newestInUse.get(row.runway_id);
    if (!cur || stamp(row.updated_at) > stamp(cur.updated_at)) newestInUse.set(row.runway_id, row);
  }
  return [...perEnd.values()].map(row => {
    const winner = newestInUse.get(row.runway_id);
    if (!winner || winner === row) return row;
    const sameEnd = String(row.end_name).toLowerCase() === String(winner.end_name).toLowerCase();
    return sameEnd ? row : { ...row, in_takeoff: false, in_landing: false };
  });
}

/** שולף את שורות המצב של כל הקבוצה ומצרף כל שורה למסלול המקומי שלה. */
async function entriesFor(query, airfieldId, sql, extraParams = []) {
  const { pairs, srcIds } = await runwayGroupPairs(query, airfieldId);
  if (!srcIds.length) return [];
  const { rows } = await query(sql, [srcIds, ...extraParams]);
  const byRunway = new Map();
  for (const row of rows) {
    const k = Number(row.runway_id);
    if (!byRunway.has(k)) byRunway.set(k, []);
    byRunway.get(k).push(row);
  }
  const entries = [];
  for (const { local, src } of pairs) {
    for (const row of byRunway.get(src.id) || []) entries.push({ row, src, local });
  }
  return entries;
}

export const resolveNotams = async (query, airfieldId) =>
  mergeNotams(await entriesFor(query, airfieldId,
    'SELECT * FROM runway_notams WHERE runway_id = ANY($1::int[]) ORDER BY id'));

export const resolveGrf = async (query, airfieldId) =>
  mergeGrf(await entriesFor(query, airfieldId,
    'SELECT * FROM runway_grf WHERE runway_id = ANY($1::int[]) ORDER BY runway_id, heading'));

export const resolveLighting = async (query, airfieldId) =>
  mergeLighting(await entriesFor(query, airfieldId,
    'SELECT * FROM runway_lighting WHERE runway_id = ANY($1::int[])'));

export const resolveEndUse = async (query, airfieldId) =>
  mergeEndUse(await entriesFor(query, airfieldId,
    'SELECT * FROM runway_end_use WHERE runway_id = ANY($1::int[])'));

export const resolveAidStatus = async (query, airfieldId) =>
  mergeAidStatus(await entriesFor(query, airfieldId,
    'SELECT * FROM runway_aid_status WHERE runway_id = ANY($1::int[])'));

/** השדה שאליו שייך מסלול - לנתיבים שמקבלים `runway_id` ולא `airfield_id`. */
export async function airfieldOfRunway(query, runwayId) {
  const { rows } = await query('SELECT airfield_id FROM airfield_runways WHERE id=$1', [Number(runwayId)]);
  return rows[0]?.airfield_id ?? null;
}

// ─── מסלול קרקעי שאינו מסלול המראה ────────────────────────────────────────────
//
// `RUNWAY_GROUP_SQL` מגשר **מסלול המראה למסלול המראה**: שני הצדדים חייבים להיות
// מוגדרים ביישות "מסלולים" ולהחזיק מסלול ראי. אבל בשדה **קרקעי** אותו אספלט
// משורטט לרוב כ**מסלול רגיל** על מפת הקרקע, בלי מסלול המראה מאחוריו - ואז
// הקישור נשמר בניהול ולא קורה כלום: הפקח בקרקע רואה מסלול פתוח בזמן שהוא סגור
// באוויר. כאן נסגר הפער: מסלול שאין מאחוריו מסלול המראה מקבל את מצב **מסלול
// ההמראה המקושר אליו**, ומצויר לפיו.
//
// כמו כל השאר - נפתר בזמן קריאה, בלי עותקים.

export const LINKED_ROUTE_RUNWAY_SQL = `
  SELECT DISTINCT
         mine.id              AS route_id,
         mine.name            AS route_name,
         other_rw.id          AS src_runway_id,
         other_rw.name        AS src_runway_name,
         other_rw.airfield_id AS src_airfield_id,
         af.name              AS src_airfield_name
    FROM airfield_routes mine
    JOIN route_link_members m_mine ON m_mine.route_id = mine.id
    JOIN route_link_members m_oth  ON m_oth.group_id = m_mine.group_id
                                  AND m_oth.route_id <> m_mine.route_id
    JOIN airfield_routes other     ON other.id = m_oth.route_id
    JOIN airfield_runways other_rw ON other_rw.id = other.source_runway_id
    LEFT JOIN airfields af         ON af.id = other_rw.airfield_id
   WHERE mine.airfield_id = $1
     AND mine.source_runway_id IS NULL
     AND other_rw.airfield_id <> mine.airfield_id`;

/**
 * NOTAMים של מסלולי ההמראה המקושרים, מוקרנים על המסלול הקרקעי.
 *
 * `shorten_end` **נמחק**: הוא מיקום ('a'/'b') על מסלול המראה, ולמסלול קרקעי אין
 * קצוות למפות אליהם. הכמות נשארת - "קוצר ב-300 מ'" הוא מידע נכון גם בלי הקצה,
 * וקצה מומצא היה מצייר קיצור בצד ההפוך.
 */
export function mergeRouteNotams(links, notamRows) {
  const byRunway = new Map();
  for (const row of notamRows) {
    const k = Number(row.runway_id);
    if (!byRunway.has(k)) byRunway.set(k, []);
    byRunway.get(k).push(row);
  }
  const out = [], seen = new Set();
  for (const l of links) {
    for (const row of byRunway.get(Number(l.src_runway_id)) || []) {
      const key = `${l.route_id}:${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        ...row,
        shorten_end: null,
        route_id: Number(l.route_id),
        route_name: l.route_name ?? null,
        source_runway_id: Number(l.src_runway_id),
        source_runway_name: l.src_runway_name ?? null,
        source_airfield_id: l.src_airfield_id ?? null,
        source_airfield_name: l.src_airfield_name ?? null,
        is_linked: true,
      });
    }
  }
  return out.sort((a, b) => a.route_id - b.route_id || Number(a.id) - Number(b.id));
}

/** ה-NOTAMים שמוקרנים על מסלולי השדה מתוך מסלולי המראה מקושרים. */
export async function resolveLinkedRouteNotams(query, airfieldId) {
  const { rows: links } = await query(LINKED_ROUTE_RUNWAY_SQL, [Number(airfieldId)]);
  if (!links.length) return [];
  const srcIds = [...new Set(links.map(l => Number(l.src_runway_id)))];
  const { rows } = await query(
    'SELECT * FROM runway_notams WHERE runway_id = ANY($1::int[]) ORDER BY id', [srcIds]);
  return mergeRouteNotams(links, rows);
}
