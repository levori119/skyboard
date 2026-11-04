/**
 * **כללי גבהים בנקודת העברה** - מסונכרנים בין כל העמדות של הנקודה.
 *
 * כל עמדה שומרת את הכללים שלה ב-`workstation_presets.classic_transfer_points`
 * (`ranges` של הנקודה), וכל עמדה רואה את הכללים של **כל** העמדות בנקודה.
 * עדכון - רק לכללי העמדה עצמה (נאכף גם בשרת, `PATCH .../transfer-point`).
 *
 * העמדה של כלל: `preset_id` שלו, ובהיעדרו - העמדה ששמרה אותו. כלל עם `preset_id`
 * של עמדה אחרת הוא שארית מהימים שבהם עמדה יכלה להגדיר כלל לאחרת: הוא מוצג
 * בשם העמדה ההיא, ובעורך הוא נעול (אפשר רק להסיר אותו).
 */

/** הכללים ששמורים בהגדרת הנקודה של עמדה אחת (כולל הפורמט הישן - טווח יחיד בלי `ranges`) */
export function configRules(cfg) {
  if (Array.isArray(cfg?.ranges) && cfg.ranges.length) return cfg.ranges;
  if (cfg?.alt_min != null || cfg?.alt_max != null) return [{ alt_min: cfg.alt_min ?? null, alt_max: cfg.alt_max ?? null, parity: cfg.parity || 'any' }];
  return [];
}

export function ruleStation(r, storedBy) {
  return r.preset_id != null && r.preset_id !== '' ? Number(r.preset_id) : Number(storedBy);
}

/** כל כללי הנקודה: שלי ושל שאר העמדות, כל אחד עם העמדה שלו */
export function collectPointRules(
  myCfg, myId,
  partners,
) {
  const norm = (r, by) => ({
    station: ruleStation(r, by), alt_min: r.alt_min ?? null, alt_max: r.alt_max ?? null, parity: r.parity || 'any', storedBy: Number(by),
  });
  return [
    ...configRules(myCfg).map(r => norm(r, myId)),
    ...partners.filter(p => Number(p.preset_id) !== Number(myId)).flatMap(p => (p.ranges || []).map(r => norm(r, p.preset_id))),
  ];
}

/**
 * שמירה בשרת: כלל חדש או ערוך שייך לעמדה ששומרת (`preset_id` שלה). כלל של עמדה
 * אחרת מתקבל רק אם הוא כבר היה שמור כך בדיוק (שארית ישנה שנשארת) - אחרת `null`.
 */
export function normalizeOwnRules(next, prev, myId) {
  const key = (r) => JSON.stringify([r.preset_id != null ? Number(r.preset_id) : null, r.alt_min ?? null, r.alt_max ?? null, r.parity || 'any']);
  const prevKeys = new Set(prev.map(key));
  const out = [];
  for (const r of next) {
    const st = r.preset_id != null && r.preset_id !== '' ? Number(r.preset_id) : null;
    if (st != null && st !== Number(myId)) {
      if (!prevKeys.has(key(r))) return null;
      out.push(r);
    } else {
      out.push({ ...r, preset_id: Number(myId) });
    }
  }
  return out;
}
