// האם מד העומס רלוונטי לעמדה - מקור אמת יחיד להגדרות העמדה ולעמדה עצמה.
//
// `workstation_presets.load_relevant` כבוי → לא מזינים ספי עומס בהגדרות, ובעמדה
// אין תג עומס, אין שורת עומס בתפריטים, אין תחזית עומס ואין רישום "עומס מלא".
// עמדה ותיקה (null/חסר) נשארת כפי שהייתה - דולק.
// עמדת ניהול קרקע אינה סופרת פ"מים, ולכן אצלה העומס כבוי תמיד.
export function isLoadRelevant(preset: { preset_type?: string | null; load_relevant?: boolean | null } | null | undefined): boolean {
  if (!preset) return true;
  if (preset.preset_type === 'ground_mgmt') return false;
  return preset.load_relevant !== false;
}
