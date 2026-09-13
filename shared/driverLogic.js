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

// ── תבניות נסיעה ושכפול בקשה ─────────────────────────────────────────────────
// שכפול ותבנית הם אותה פעולה: לקחת את **פרטי הבקשה** (מאיפה, לאן, במה, עם מי)
// מנסיעה קיימת או מתבנית שמורה, ולפתוח איתם טופס בקשה חדש. הכרעות המגדל
// (סטטוס, נתיב, אישור) ומועד היציאה אינם חלק מהפרטים - בקשה חדשה נבחנת מחדש.

export const TEMPLATE_NAME_MAX = 60;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const validTime = v => (HHMM.test(text(v)) ? text(v) : '');
const p2 = n => String(n).padStart(2, '0');
const idStr = v => (idOrNull(v) ? String(idOrNull(v)) : '');
const listOf = v => {
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } }
  return Array.isArray(v) ? v : [];
};

/**
 * נסיעה קיימת, או תבנית (`{ airfield_id, base_id, data }`) -> ערכי טופס הבקשה.
 * המזהים כמחרוזות, כפי שהם יושבים ב-select. `time` - שעת היציאה המקומית של
 * הנסיעה, או השעה הקבועה שנשמרה בתבנית (ריק אם אין).
 */
export function requestFormFrom(src) {
  const s = src || {};
  const isTemplate = s.data && typeof s.data === 'object';
  const d = isTemplate ? s.data : s;
  let time = '';
  if (isTemplate) time = validTime(d.time);
  else if (timeOf(s.scheduled_at) !== null) {
    const dt = new Date(s.scheduled_at);
    time = `${p2(dt.getHours())}:${p2(dt.getMinutes())}`;
  }
  const fromId = idStr(d.from_point_id);
  const toId = idStr(d.to_point_id);
  return {
    base_id: idStr(s.base_id),
    airfield_id: idStr(s.airfield_id),
    trip_type_id: idStr(d.trip_type_id),
    vehicle_type_id: idStr(d.vehicle_type_id),
    vehicle_name: text(d.vehicle_name),
    from_point_id: fromId,
    from_text: fromId ? '' : text(d.from_text),
    to_point_id: toId,
    to_text: toId ? '' : text(d.to_text),
    stops: listOf(d.stops)
      .map(x => ({ point_id: idStr(x?.point_id), text: idStr(x?.point_id) ? '' : text(x?.text) }))
      .filter(x => x.point_id || x.text),
    escorts: listOf(d.escorts)
      .map(e => ({ name: text(e?.name), national_id: text(e?.national_id) }))
      .filter(e => e.name || e.national_id),
    requester_name: text(d.requester_name),
    requester_phone: text(d.requester_phone),
    driver_phone: text(d.driver_phone),
    note: text(d.note),
    time,
  };
}

/**
 * מועד ברירת המחדל לבקשה חדשה. עם שעה (משוכפלת / מתבנית) - באותה שעה, היום אם
 * עוד לא עברה ואחרת מחר. בלי שעה - בעוד שעה, מעוגל לחצי השעה הבאה.
 */
export function nextDeparture(time, now = new Date()) {
  let dt;
  const t = validTime(time);
  if (t) {
    const [h, m] = t.split(':').map(Number);
    dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
    if (dt.getTime() <= now.getTime()) dt.setDate(dt.getDate() + 1);
  } else {
    dt = new Date(now.getTime() + 60 * 60000);
    dt.setMinutes(dt.getMinutes() < 30 ? 30 : 60, 0, 0);
  }
  return {
    date: `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())}`,
    time: `${p2(dt.getHours())}:${p2(dt.getMinutes())}`,
  };
}

/**
 * טופס -> גוף ל-POST/PUT /api/driver-trips/templates. אותו ניקוי כמו בקשה
 * (buildTripRequest), בלי המועד ועם שעה קבועה אופציונלית. משותף לאפליקציה
 * ולשרת, כך שמה שנשמר הוא בדיוק מה שהטופס ייצר.
 *
 * רק שם ושדה חובה: תבנית היא נקודת פתיחה, ומוצא/יעד נבדקים ביצירת הבקשה.
 */
export function buildTemplate(form) {
  const f = form || {};
  const { body: req } = buildTripRequest({ ...f, date: '', time: '' });
  const { airfield_id, scheduled_at, ...data } = req;
  data.time = validTime(f.time);
  const body = { name: text(f.name).slice(0, TEMPLATE_NAME_MAX), airfield_id, data };
  const errors = [];
  if (!body.name) errors.push('name');
  if (!body.airfield_id) errors.push('airfield');
  return { body, errors };
}

/**
 * כמה דקות לפני ואחרי מועד היציאה מותר לנהג ללחוץ "הפעל נסיעה". משותף לאפליקציה
 * ולשרת (routes/permits.js), כדי שהכפתור והאכיפה לא יתפצלו.
 */
export const START_WINDOW_MINUTES = 30;

/**
 * 'open' - אפשר להפעיל; 'early' / 'late' - מחוץ לחלון, ונדרש לעדכן את זמן היציאה;
 * 'none' - לנסיעה אין מועד.
 */
export function startWindowState(scheduledAt, now = Date.now()) {
  const t = scheduledAt ? new Date(scheduledAt).getTime() : NaN;
  if (!Number.isFinite(t)) return 'none';
  const diffMin = (t - now) / 60000;
  if (diffMin > START_WINDOW_MINUTES) return 'early';
  if (diffMin < -START_WINDOW_MINUTES) return 'late';
  return 'open';
}
