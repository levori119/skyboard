// הצהרות טיפוסים ל-shared/joiningPointProps.js - ראה ההסבר בראש המימוש.

/** הערך בתוקף של "מטוסים בלבד", והאם הוא מגיע מבחירת העמדה. */
export declare function resolveAircraftOnly(pointDefault: unknown, stationChoice: unknown): { value: boolean; fromStation: boolean; defaultValue: boolean };

/** עדכון מיידי של רשימת הנקודות אחרי בחירה בעמדה. `choice` null = חזרה לברירת המחדל. */
export declare function applyAircraftOnlyChoice<T extends { id: number | string }>(points: T[], pointId: number | string, choice: boolean | null): T[];
