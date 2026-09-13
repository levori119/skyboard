// הלוגיקה הטהורה של אפליקציית DRIVER.
//
// public/driver.html הוא HTML סטטי בלי build, והוא טוען את הקובץ הזה כמודול ES
// מ-/driver/logic.js (routes/driver.js) וחושף אותו כ-window.DriverLogic. כך
// ההחלטות - ברכה, בסיס קרוב, חלוקה לטאבים, בניית בקשה - נבדקות ב-vitest בלי
// DOM, ולא חיות רק בתוך סקריפט מוטבע שאי אפשר לבדוק.

/** ברכה לפי שעת המכשיר. */
export function greetingFor(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'בוקר טוב';
  if (h >= 12 && h < 17) return 'צהריים טובים';
  if (h >= 17 && h < 22) return 'ערב טוב';
  return 'לילה טוב';
}

/** מרחק במטרים בין שתי נקודות (haversine). */
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = d => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * הבסיס הקרוב למיקום הטלפון. `coord_n`/`coord_e` של aviation_bases הם מעלות
 * עשרוניות כמחרוזת. בסיס בלי נ"צ אינו משתתף; אין מיקום או אין נ"צ לאף בסיס -
 * null, והאפליקציה נופלת לבסיס האחרון שנבחר.
 */
export function nearestBase(bases, position) {
  if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return null;
  let best = null;
  let bestD = Infinity;
  for (const b of bases || []) {
    const lat = parseFloat(b.coord_n);
    const lng = parseFloat(b.coord_e);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const d = distanceMeters(position.lat, position.lng, lat, lng);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

const timeOf = ts => {
  const t = ts ? new Date(ts).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};

/** מהמוקדם למאוחר; נסיעה בלי מועד בסוף. */
const byScheduleAsc = (a, b) => {
  const ta = timeOf(a.scheduled_at);
  const tb = timeOf(b.scheduled_at);
  if (ta === null && tb === null) return a.id - b.id;
  if (ta === null) return 1;
  if (tb === null) return -1;
  return ta - tb || a.id - b.id;
};

/**
 * חלוקת הנסיעות הפעילות לטאבים. "נדחה" הוא הסטטוס "אין אישור" (not_approved) -
 * הכרעת המגדל. נסיעה שהסתיימה אינה כאן: היא בטאב ההיסטוריה.
 */
export function groupDriverTrips(trips) {
  const list = (trips || []).filter(t => t.status !== 'ended');
  return {
    approved: list.filter(t => t.status === 'approved').sort(byScheduleAsc),
    pending: list.filter(t => t.status !== 'approved' && t.status !== 'not_approved').sort(byScheduleAsc),
    rejected: list.filter(t => t.status === 'not_approved').sort(byScheduleAsc),
  };
}

/** היסטוריה: האחרונה ראשונה, לפי מועד היציאה או מועד הסיום. */
export function sortHistory(trips) {
  const when = t => timeOf(t.scheduled_at) ?? timeOf(t.ended_at) ?? 0;
  return [...(trips || [])].sort((a, b) => when(b) - when(a) || b.id - a.id);
}

/** תאריך + שעה בשעון המקומי של הטלפון -> ISO. חסר אחד מהם -> null. */
export function joinLocalDateTime(date, time) {
  if (!date || !time) return null;
  const [y, mo, d] = String(date).split('-').map(Number);
  const [h, mi] = String(time).split(':').map(Number);
  const dt = new Date(y, mo - 1, d, h, mi);
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
}

const idOrNull = v => (v === '' || v === null || v === undefined ? null : (Number.isInteger(Number(v)) ? Number(v) : null));
const text = v => String(v ?? '').trim();

/**
 * טופס "בקשה חדשה" -> גוף ל-POST /api/driver-trips, ורשימת שדות חובה חסרים.
 *
 * זהות הנהג, הסטטוס והנתיב **אינם** כאן: הזהות נלקחת מהאסימון, והסטטוס והנתיב
 * הם הכרעת המגדל.
 */
export function buildTripRequest(form) {
  const f = form || {};
  const fromId = idOrNull(f.from_point_id);
  const toId = idOrNull(f.to_point_id);
  const body = {
    airfield_id: idOrNull(f.airfield_id),
    trip_type_id: idOrNull(f.trip_type_id),
    vehicle_type_id: idOrNull(f.vehicle_type_id),
    vehicle_name: text(f.vehicle_name),
    scheduled_at: joinLocalDateTime(f.date, f.time),
    from_point_id: fromId,
    from_text: fromId ? '' : text(f.from_text),
    to_point_id: toId,
    to_text: toId ? '' : text(f.to_text),
    stops: (f.stops || [])
      .map(s => ({ point_id: idOrNull(s.point_id), text: idOrNull(s.point_id) ? '' : text(s.text) }))
      .filter(s => s.point_id || s.text),
    requester_name: text(f.requester_name),
    requester_phone: text(f.requester_phone),
    driver_phone: text(f.driver_phone),
    escorts: (f.escorts || [])
      .map(e => ({ name: text(e.name), national_id: text(e.national_id) }))
      .filter(e => e.name || e.national_id),
    note: text(f.note),
  };
  const errors = [];
  if (!body.airfield_id) errors.push('airfield');
  if (!body.scheduled_at) errors.push('when');
  if (!body.from_point_id && !body.from_text) errors.push('from');
  if (!body.to_point_id && !body.to_text) errors.push('to');
  return { body, errors };
}
