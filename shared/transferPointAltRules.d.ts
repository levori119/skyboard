// טיפוסים ל-shared/transferPointAltRules.js (כללי גבהים בנקודת העברה)
export type AltRule = { preset_id?: number | string | null; alt_min?: number | null; alt_max?: number | null; parity?: string | null };
export type PointRule = { station: number; alt_min: number | null; alt_max: number | null; parity: string; storedBy: number };
export function configRules(cfg: unknown): AltRule[];
export function ruleStation(r: AltRule, storedBy: number): number;
export function collectPointRules(myCfg: unknown, myId: number, partners: { preset_id: number; ranges: AltRule[] }[]): PointRule[];
export function normalizeOwnRules(next: AltRule[], prev: AltRule[], myId: number): AltRule[] | null;
