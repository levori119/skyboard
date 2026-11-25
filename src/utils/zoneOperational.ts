// מיזוג המצב התפעולי של האזורים (סגור/מוגבל, טווח, מגבלה חופשית, בלוקים פעילים)
// מהשרת לתוך רשימת האזורים שבמפה. משותף למפה הראשית, למפה השנייה ולחלונות המפה
// של דסק המשימה - עד 2026-11-26 רק שתי הראשונות קיבלו אותו, וחלון מפה בדסק לא
// ראה הגבלה שנקבעה בעמדה אחרת.

export interface ZoneOperationalFields {
  id: number;
  restriction?: string | null;
  restriction_range_ids?: number[] | null;
  restriction_alt_min?: number | null;
  restriction_alt_max?: number | null;
  limitation_note?: string | null;
  active_alt_range_ids?: number[] | null;
}

/**
 * מחזיר רשימה חדשה רק כשמשהו באמת השתנה - **אותה הפניה** כשלא, כדי שטיק
 * פולינג בלי שינוי לא ירנדר מחדש את כל המפה. כתיבה מקומית טרייה (בתוך graceMs)
 * גוברת על התשובה מהשרת, כדי שפקד שנלחץ לא "יקפוץ" חזרה לפני שהשרת עודכן.
 */
export function mergeZoneOperational<Z extends ZoneOperationalFields>(
  zones: Z[], byId: Map<number, Partial<ZoneOperationalFields>>,
  writes: Record<number, number>, now: number, graceMs: number,
): Z[] {
  let changed = false;
  const next = zones.map(z => {
    const r = byId.get(z.id);
    if (!r) return z;
    const wroteAt = writes[z.id];
    if (wroteAt != null && now - wroteAt < graceMs) return z;
    const same = (z.restriction ?? '') === (r.restriction ?? '')
      && (z.restriction_alt_min ?? null) === (r.restriction_alt_min ?? null)
      && (z.restriction_alt_max ?? null) === (r.restriction_alt_max ?? null)
      && JSON.stringify(z.restriction_range_ids ?? []) === JSON.stringify(r.restriction_range_ids ?? [])
      && (z.limitation_note ?? '') === (r.limitation_note ?? '')
      && JSON.stringify(z.active_alt_range_ids ?? []) === JSON.stringify(r.active_alt_range_ids ?? []);
    if (same) return z;
    changed = true;
    return {
      ...z,
      restriction: r.restriction, restriction_range_ids: r.restriction_range_ids,
      restriction_alt_min: r.restriction_alt_min, restriction_alt_max: r.restriction_alt_max,
      limitation_note: r.limitation_note, active_alt_range_ids: r.active_alt_range_ids,
    };
  });
  return changed ? next : zones;
}
