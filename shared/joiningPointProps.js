// מאפייני נקודת הצטרפות שהעמדה יכולה לדרוס לעצמה.
//
// **"מטוסים בלבד"** (`expand_aircraft`): הניהול קובע ברירת מחדל לנקודה, והפקח
// בעמדה יכול לבחור אחרת **לעמדה שלו** (`joining_point_preset_overrides`). בחירה
// בעמדה אחת אינה משנה לעמדה אחרת את הטבלה מתחת לידיים. `null` בעמדה = הולכת
// אחרי הניהול, וכך "חזור לברירת המחדל" הוא מצב ולא העתקה של ערך.
//
// משותף לשרת (GET מחשב את הערך בתוקף) וללקוח (עדכון מיידי אחרי בחירה), כדי
// שלא יהיו שני כללי הכרעה.

/** הערך בתוקף, והאם הוא מגיע מבחירת העמדה. */
export function resolveAircraftOnly(pointDefault, stationChoice) {
  const defaultValue = pointDefault === true;
  const fromStation = typeof stationChoice === 'boolean';
  return { value: fromStation ? stationChoice : defaultValue, fromStation, defaultValue };
}

/**
 * העדכון המיידי ברשימת הנקודות של העמדה. `choice` null = חזרה לברירת המחדל.
 * פונקציה טהורה: נקודות אחרות חוזרות כמות שהן.
 */
export function applyAircraftOnlyChoice(points, pointId, choice) {
  return (points || []).map(p => {
    if (Number(p.id) !== Number(pointId)) return p;
    const def = typeof p.expand_aircraft_default === 'boolean' ? p.expand_aircraft_default : p.expand_aircraft === true;
    const r = resolveAircraftOnly(def, typeof choice === 'boolean' ? choice : null);
    return { ...p, expand_aircraft: r.value, expand_aircraft_default: def, expand_aircraft_override: r.fromStation ? choice : null };
  });
}
