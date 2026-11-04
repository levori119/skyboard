// טיפוסים ל-shared/transferPointStations.js (נקודת העברה כבויה לעמדה)
export function disabledPresetIds(sector: unknown): number[];
export function isPointDisabledFor(sector: unknown, presetId: unknown): boolean;
export function toggleDisabled(sector: unknown, presetId: unknown, enabled: boolean): number[];
export function presetSectorIds(preset: unknown): Set<number>;
export function transfersToReturn<T extends { to_sector_id?: unknown }>(openTransfers: T[], sectorId: unknown, presetId: unknown, receiverIds: Iterable<number>): T[];
export function pointStationIds(presets: unknown[], sector: unknown): number[];
export type StationDirection = 'both' | 'send' | 'receive';
export const DIRECTIONS: StationDirection[];
export function stationDirections(sector: unknown): Record<number, 'send' | 'receive'>;
export function stationDirection(sector: unknown, presetId: unknown): StationDirection;
export function canSendVia(sector: unknown, presetId: unknown): boolean;
export function canReceiveVia(sector: unknown, presetId: unknown): boolean;
export function setDirection(sector: unknown, presetId: unknown, direction: StationDirection): Record<number, 'send' | 'receive'>;
export function transfersToReturnOnDirection<T extends { to_sector_id?: unknown }>(openTransfers: T[], sectorId: unknown, presetId: unknown, direction: StationDirection, receiverIds: Iterable<number>): T[];
