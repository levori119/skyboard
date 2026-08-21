// דסק משימה כללי (General Mission Desk) — טיפוסים.
// עץ הפריסה (BSP) זהה במבנהו ל-SWNode/SGNode; ה-leaf מפנה לשירות (service_id)
// במקום waypoint/fieldKey. state נשמר פר (service_id, preset_id) — ראה data-model.md.

// ── עץ פריסה ────────────────────────────────────────────────────────────────
export type MDNode = MDSplit | MDLeaf;
export interface MDSplit { id: string; type: 'split'; direction: 'h' | 'v'; sizes: number[]; children: MDNode[] }
export interface MDLeaf { id: string; type: 'leaf'; service_id: number | null }

// ── שירותים ─────────────────────────────────────────────────────────────────
// buttons/freetext/table: תוכן חי בעמדה. image/label: תוכן קבוע שנקבע בהגדרת
// הדסק (config) ומוצג לקריאה בלבד — אין להם state פר-עמדה.
// map/strips: חלון מפה וחלון הפ"ממים שלו. הדסק מגדיר שיש כאן מפה; *איזו* מפה,
// אילו נקודות העברה ואילו מפות-סקטור - נקבע פר-עמדה, כי אותו דסק משרת עמדות שונות.
export type MDServiceType = 'buttons' | 'freetext' | 'table' | 'image' | 'label' | 'map' | 'strips';

export interface MissionDesk { id: number; name: string; layout_json: MDNode | null }
export interface MissionDeskService {
  id: number; desk_id: number; service_type: MDServiceType;
  name: string; config: MDServiceConfig; sort_order: number;
}

export interface MDFreeTextConfig { ruled?: boolean; lineGap?: number; title?: string }

// תמונה קבועה — dataUrl מודבק (print-screen/קובץ) בהגדרה. fit: איך למלא את האזור.
export interface MDImageConfig { dataUrl?: string; fit?: 'contain' | 'cover' }
// טקסט קבוע — נקבע בהגדרה; מוצג בעמדה. מקטע מעוצב (run) לעיצוב פר-תו:
// runs[] הוא מקור האמת ל-rich-text; font/fontSize/bold/color = ברירות מחדל
// למקטעים שלא הגדירו במפורש; align = יישור ברמת הבלוק. text = legacy (טקסט אחיד).
export interface MDLabelRun { text: string; font?: string; fontSize?: number; bold?: boolean; color?: string }
export interface MDLabelConfig {
  text?: string; runs?: MDLabelRun[];
  font?: string; fontSize?: number; bold?: boolean;
  align?: 'start' | 'center' | 'end'; color?: string;
}

export type MDColumnType = 'text' | 'number' | 'check' | 'select';
export interface MDTableColumn {
  key: string; title: string; type: MDColumnType; options?: string[];
  // לעמודת V/X עם סיכום "כמות": מה נספר — 'v' (ברירת מחדל, ✔ בלבד)
  // או 'x' (כל מה שמוצג ✘ — כולל שורות שטרם סומנו)
  countWhat?: 'v' | 'x';
}
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
// map: אין לו config ברמת הדסק - כל הגדרותיו פר-עמדה (MDPresetMapSettings).
export type MDMapConfig = Record<string, never>;
// strips: חלון הפ"ממים מקושר לשירות מפה של *אותו* דסק. בלי קישור אין לו מה להציג.
export interface MDStripsConfig { map_service_id?: number | null }
export type MDServiceConfig =
  | MDFreeTextConfig | MDTableConfig | MDImageConfig | MDLabelConfig
  | MDMapConfig | MDStripsConfig | Record<string, never>;

// ── הגדרת חלון מפה פר-עמדה ──────────────────────────────────────────────────
// workstation_presets.mission_desk_map_config = { "<map_service_id>": MDPresetMapSettings }.
// map_id הוא **חובה**: עמדת דסק שיש בדסק שלה חלון מפה לא נשמרת בלי לבחור לו מפה.
export interface MDPresetMapSettings {
  map_id: number | null;
  transfer_points: number[];        // sector_id-ים שנקודות ההעברה שלהם מוצגות בתוך חלון המפה הזה
  sector_maps_enabled?: boolean;
  sector_map_ids?: number[];
  // מצב אזורי טיסה **פר-חלון**: פותח את סרגל הכלים המלא של המפה (תצוגת פ"מ,
  // סינון אזורים, שידוך בלחיצה). בעמדה רגילה זו הגדרה של העמדה כולה, אבל בדסק
  // כל מפה יכולה לשמש למשהו אחר.
  flight_zones_mode?: boolean;
  fz_pin_display?: 'handwrite' | 'icon' | 'small' | 'strip';   // איך מוצג הפ"מ על המפה הזו
  // עמודת הפ"ממים בתוך אזור המפה. ברירת מחדל: מוצגת - אלא אם הוגדר לדסק חלון
  // פ"ממים עצמאי המקושר למפה הזו, ואז אין טעם בשתיהן.
  strips_panel?: boolean;
}
export type MDPresetMapConfig = Record<string, MDPresetMapSettings>;
export const mdEmptyMapSettings = (): MDPresetMapSettings =>
  ({ map_id: null, transfer_points: [], sector_maps_enabled: false, sector_map_ids: [], flight_zones_mode: false, fz_pin_display: 'handwrite', strips_panel: true });

// ── מצב ריצה (state JSONB) ──────────────────────────────────────────────────
export interface MDButtonStateDef { label: string; color: string; alertPresetIds?: number[] }
export interface MDButton {
  id: string;
  x: number; y: number;            // אחוזים מתוך הפאנל (0-100)
  w?: number; h?: number;          // גודל בפיקסלים; לא מוגדר = אוטומטי לפי תוכן
  text: string;
  allowFreeText?: boolean; freeText?: string;
  font?: string; fontSize?: number; bold?: boolean;
  fixed?: boolean;                 // אמצעי קבוע — הוגדר בהגדרת עמדה; לא נמחק/נערך בעמדה
  states: MDButtonStateDef[];
  activeStateIdx: number;
}
export interface MDButtonsState { buttons: MDButton[] }

export interface MDInkStroke { points: { x: number; y: number }[]; color: string; size: number }
export interface MDFreeTextState { strokes: MDInkStroke[] }

export type MDCellValue = string | number | boolean;
export interface MDTableRow { id: string; cells: Record<string, MDCellValue>; fixed?: boolean }
export interface MDTableState { rows: MDTableRow[] }

export type MDServiceState = MDButtonsState | MDFreeTextState | MDTableState;

export interface MDRowStyle { bg?: string; text?: string; blink?: boolean }
