// הצהרות טיפוסים ל-shared/readerDocs.js - המימוש הוא ESM רגיל כדי ששרת Node (JS)
// והלקוח (TS/Vite) יייבאו את **אותו קובץ**. ראה ההסבר בראש המימוש.

export type ReaderOpenMode = 'window' | 'external';
export type ReaderOfficeMode = 'pdf' | 'server' | 'external';
export type ReaderDocKind = 'pdf' | 'image' | 'sheet' | 'office' | 'other';
export type ReaderEngine = 'pdf' | 'image' | 'sheet' | 'notes';

/** למה החלון מציג סימניות בלבד ולא את התוכן. ריק = התוכן נפרס. */
export type ReaderEngineReason =
  | ''
  | 'unreachable'          // כתובת שאי-אפשר למשוך (כונן רשת / file://)
  | 'office-external'      // הוגדר שקבצי אופיס נפתחים באפליקציה החיצונית
  | 'office-needs-pdf'     // נדרשת גרסת PDF שתועלה בניהול
  | 'convert-pending'      // ממתין להמרה בשרת
  | 'convert-failed'       // ההמרה בשרת נכשלה
  | 'unsupported';         // סוג קובץ שאינו נתמך

export interface ReaderDocLike {
  kind: ReaderDocKind;
  hasFile?: boolean;
  hasPdf?: boolean;
  url?: string;
  convertError?: string;
}

export interface ReaderEngineResult {
  engine: ReaderEngine;
  reason: ReaderEngineReason;
  canConvert: boolean;
}

export declare const READER_OPEN_MODES: ReaderOpenMode[];
export declare const DEFAULT_OPEN_MODE: ReaderOpenMode;
export declare const READER_OFFICE_MODES: ReaderOfficeMode[];
export declare const DEFAULT_OFFICE_MODE: ReaderOfficeMode;

export declare function docExtOf(nameOrUrl: unknown): string;
export declare function docKindOf(ext: unknown, mime?: unknown): ReaderDocKind;
export declare function isFetchableUrl(url: unknown): boolean;
export declare function normalizeDocUrl(url: unknown): string;
export declare function resolveOpenMode(globalMode: unknown, presetMode?: unknown): ReaderOpenMode;
export declare function resolveOfficeMode(mode: unknown): ReaderOfficeMode;
export declare function readerEngine(doc: ReaderDocLike, officeMode: unknown): ReaderEngineResult;
export declare function needsServerConvert(doc: ReaderDocLike, officeMode: unknown): boolean;
