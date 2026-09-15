// סדר עדיפויות לנחיתה לדת"ק - **כלל אחד** לשרת (חלוקה אוטומטית כשמבנה מגיע
// לנקודת הצטרפות) ולעמדה/לניהול (מספר הדת"ק של נקודה). ESM רגיל כמו
// shared/formationCount.js, כדי ששני הצדדים ייבאו את אותו קובץ.
//
// על הסדק הפקח יודע בעל פה: "דת"ק 1 נוחת על 26, ואם 26 סגור - על 08". כאן זה
// מוגדר פעם אחת בנקודת הדת"ק (`airfield_points.landing_priority`), וכל מטוס
// שמגיע לנקודת ההצטרפות מקבל את המסלול הראשון ברשימה **שפתוח לנחיתות**.
// מטוס שהפקח כבר בחר לו מסלול לא נדרס - ההכרעה נשארת אצל הפקח.

/**
 * מספר הדת"ק מתוך שם הנקודה: "5", "דת"ק 5", "דתק5", "דת"ק-5", "דת״ק 3".
 * @param {unknown} name
 * @returns {number | null}
 */
export function datkNumberOf(name) {
  const m = String(name ?? '').trim().match(/^(?:דת["״״]?ק[\s-]?)?(\d+)$/u);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * רשימת המסלולים בסדר רץ. מקבל מערך (JSONB מה-DB), JSON או "26, 08".
 * @param {unknown} v
 * @returns {string[]}
 */
export function parseLandingPriority(v) {
  let list = v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s.startsWith('[')) {
      try { list = JSON.parse(s); } catch { return []; }
    } else {
      list = s.split(/[,\s]+/);
    }
  }
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const ident = String(item ?? '').trim().slice(0, 10);
    if (ident && !out.some(x => sameRunway(x, ident))) out.push(ident);
  }
  return out;
}

const norm = (v) => String(v ?? '').trim().toUpperCase().replace(/^0+(?=\d)/, '');

/**
 * אותו קצה מסלול? "08" = "8", "08l" = "8L".
 * @param {unknown} a
 * @param {unknown} b
 */
export function sameRunway(a, b) {
  const x = norm(a);
  return x !== '' && x === norm(b);
}

/**
 * המסלול הראשון בסדר העדיפויות שפתוח לנחיתות - בשם שלו ברשימת הפתוחים.
 * @param {string[]} priority
 * @param {string[]} landingRunways
 * @returns {string | null}
 */
export function pickLandingRunway(priority, landingRunways) {
  for (const want of priority || []) {
    const open = (landingRunways || []).find(r => sameRunway(r, want));
    if (open) return String(open).trim();
  }
  return null;
}

/**
 * חלוקת המבנה למסלולים: לכל מטוס בלי מסלול - לפי הדת"ק שלו.
 * רק נקודות מסוג `datk` נחשבות, גם כשנקודה אחרת נושאת את אותו מספר בשם.
 * @param {{
 *   aircraft: { idx: number, datk?: unknown, runway_ident?: string | null }[],
 *   points: { name?: string | null, point_type?: string | null, landing_priority?: unknown }[],
 *   landingRunways: string[],
 * }} p
 * @returns {{ idx: number, runway_ident: string }[]}
 */
export function planLandingRunways({ aircraft, points, landingRunways }) {
  const byDatk = new Map();
  for (const pt of points || []) {
    if (String(pt?.point_type ?? '').trim() !== 'datk') continue;
    const n = datkNumberOf(pt.name);
    const priority = parseLandingPriority(pt.landing_priority);
    if (n != null && priority.length && !byDatk.has(n)) byDatk.set(n, priority);
  }
  const plan = [];
  for (const ac of aircraft || []) {
    if (String(ac?.runway_ident ?? '').trim()) continue;
    const d = parseInt(String(ac?.datk ?? ''), 10);
    if (!Number.isFinite(d)) continue;
    const runway = pickLandingRunway(byDatk.get(d) || [], landingRunways);
    if (runway) plan.push({ idx: Number(ac.idx), runway_ident: runway });
  }
  return plan;
}
