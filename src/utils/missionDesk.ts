// דסק משימה כללי — לוגיקה טהורה: עץ פריסה, נוסחאות טבלה חכמה, סיכומים,
// עיצוב מותנה, מצבי כפתור ו-fan-out שיתוף. ללא תלות ב-DOM/רשת (testable).
import type {
  MDNode, MDLeaf, MDTableConfig, MDTableRow, MDCellValue,
  MDTableRule, MDRowStyle, MDButton, MDSummaryKind,
} from '../types/missionDesk';

export const mdGenId = (): string => { throw new Error('not implemented'); };
export const mdDefaultLeaf = (): MDLeaf => { throw new Error('not implemented'); };
export function mdUpdate(_node: MDNode, _id: string, _fn: (n: any) => any): MDNode { throw new Error('not implemented'); }
export function mdSplit(_node: MDNode, _id: string, _dir: 'h' | 'v'): MDNode { throw new Error('not implemented'); }
export function mdRemove(_node: MDNode, _id: string): MDNode { throw new Error('not implemented'); }
export function mdGetAllLeaves(_node: MDNode): MDLeaf[] { throw new Error('not implemented'); }

export function evalFormula(_formula: string, _cells: Record<string, MDCellValue | undefined>): number | null { throw new Error('not implemented'); }
export function computeCells(_row: MDTableRow, _config: MDTableConfig): Record<string, MDCellValue | undefined> { throw new Error('not implemented'); }
export function computeSummary(_rows: MDTableRow[], _config: MDTableConfig): Record<string, number | null> { throw new Error('not implemented'); }
export function summaryLabel(_kind: MDSummaryKind): string { throw new Error('not implemented'); }

export function matchRule(_rule: MDTableRule, _cells: Record<string, MDCellValue | undefined>): boolean { throw new Error('not implemented'); }
export function rowStyle(_rules: MDTableRule[] | undefined, _cells: Record<string, MDCellValue | undefined>): MDRowStyle | null { throw new Error('not implemented'); }

export function cycleButtonState(_btn: MDButton): number { throw new Error('not implemented'); }

export function resolveFanout(
  _sharing: Record<string, unknown> | null | undefined,
  _serviceId: number,
  _writerPresetId: number,
): number[] { throw new Error('not implemented'); }
