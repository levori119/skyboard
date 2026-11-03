// טיפוסים ל-shared/transferPointStations.js (נקודת העברה כבויה לעמדה)
export function disabledPresetIds(sector: unknown): number[];
export function isPointDisabledFor(sector: unknown, presetId: unknown): boolean;
export function toggleDisabled(sector: unknown, presetId: unknown, enabled: boolean): number[];
export function presetSectorIds(preset: unknown): Set<number>;
export function transfersToReturn<T extends { to_sector_id?: unknown }>(openTransfers: T[], sectorId: unknown, presetId: unknown, receiverIds: Iterable<number>): T[];
