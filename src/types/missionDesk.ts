// דסק משימה כללי (General Mission Desk) — טיפוסים.
// עץ הפריסה (BSP) זהה במבנהו ל-SWNode/SGNode; ה-leaf מפנה לשירות (service_id)
// במקום waypoint/fieldKey. state נשמר פר (service_id, preset_id) — ראה data-model.md.

// ── עץ פריסה ────────────────────────────────────────────────────────────────
export type MDNode = MDSplit | MDLeaf;
export interface MDSplit { id: string; type: 'split'; direction: 'h' | 'v'; sizes: number[]; children: MDNode[] }
export interface MDLeaf { id: string; type: 'leaf'; service_id: number | null }

// ── שירותים ─────────────────────────────────────────────────────────────────
export type MDServiceType = 'buttons' | 'freetext' | 'table';

export interface MissionDesk { id: number; name: string; layout_json: MDNode | null }
export interface MissionDeskService {
  id: number; desk_id: number; service_type: MDServiceType;
  name: string; config: MDServiceConfig; sort_order: number;
}

export interface MDFreeTextConfig { ruled?: boolean; lineGap?: number; title?: string }

export type MDColumnType = 'text' | 'number' | 'check' | 'select';
export interface MDTableColumn { key: string; title: string; type: MDColumnType; options?: string[] }
export interface MDComputedColumn { key: string; title: string; formula: string }
export type MDSummaryKind = 'sum' | 'avg' | 'count' | 'min' | 'max';
export type MDRuleOp = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'empty' | 'notEmpty';
export interface MDTableRule { column: string; op: MDRuleOp; value?: string; bg?: string; text?: string; blink?: boolean }
export interface MDTableConfig {
  columns: MDTableColumn[];
  computed?: MDComputedColumn[];
  rules?: MDTableRule[];
  summary?: Record<string, MDSummaryKind>;
  allowAddRows?: boolean;
  initialRows?: number;
}
// buttons: אין config אדמין — הכפתורים נוצרים בעמדה וחיים ב-state
export type MDServiceConfig = MDFreeTextConfig | MDTableConfig | Record<string, never>;

// ── מצב ריצה (state JSONB) ──────────────────────────────────────────────────
export interface MDButtonStateDef { label: string; color: string; alertPresetIds?: number[] }
export interface MDButton {
  id: string;
  x: number; y: number;            // אחוזים מתוך הפאנל (0-100)
  text: string;
  allowFreeText?: boolean; freeText?: string;
  font?: string; fontSize?: number; bold?: boolean;
  states: MDButtonStateDef[];
  activeStateIdx: number;
}
export interface MDButtonsState { buttons: MDButton[] }

export interface MDInkStroke { points: { x: number; y: number }[]; color: string; size: number }
export interface MDFreeTextState { strokes: MDInkStroke[] }

export type MDCellValue = string | number | boolean;
export interface MDTableRow { id: string; cells: Record<string, MDCellValue> }
export interface MDTableState { rows: MDTableRow[] }

export type MDServiceState = MDButtonsState | MDFreeTextState | MDTableState;

export interface MDRowStyle { bg?: string; text?: string; blink?: boolean }
