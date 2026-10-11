// חלון קריאה - הלוגיקה של הלקוח: גיאומטריית החלון, שמירת מצב התצוגה, וחלוקת
// הסרגל התחתון בין "קריאה מהירה" ל"עמדות נוספות".
//
// ההכרעות שאינן כאן (סוג העזר, מנוע התצוגה, איפה הוא נפתח) יושבות ב-
// shared/readerDocs.js, כי גם השרת מכריע אותן. כאן רק מה שנוגע למסך.

import {
  docKindOf, docExtOf, readerEngine, resolveOpenMode,
  type ReaderDocKind, type ReaderEngineResult,
} from '../../shared/readerDocs';
import { API_URL } from '../config';

export interface ReaderDoc {
  id: number;
  name: string;
  source_kind: 'link' | 'file';
  url: string;
  file_name: string;
  ext: string;
  mime: string;
  byte_size: number;
  hasFile: boolean;
  hasPdf: boolean;
  kind: ReaderDocKind;
  convertError: string;
  converted_at?: string | null;
}

export interface ReaderBookmark {
  id: number;
  doc_id: number;
  page_no: number;
  label: string;
  note: string;
  color: string;
  sort_order: number;
}

export interface ReaderConfig {
  openMode: 'window' | 'external';
  officeMode: 'pdf' | 'server' | 'external';
  /** null = טרם נבדק על השרת הזה */
  convertAvailable: boolean | null;
}

export interface ReaderRect { x: number; y: number; w: number; h: number }

// ── גיאומטריית החלון ───────────────────────────────────────────────────────

/** ב"מ: 40% מגודל המסך בכל ציר (אפיון). */
export const READER_DEFAULT_FRACTION = 0.4;
/** מתחת לזה הכותרת עצמה כבר לא נקראת - אין טעם לאפשר הקטנה נוספת. */
export const READER_MIN_W = 360;
export const READER_MIN_H = 260;
/** היסט מדורג בין חלונות פתוחים, שהשני לא יכסה את הראשון בדיוק. */
const CASCADE = 28;
/** כמה מהחלון חייב להישאר על המסך אחרי גרירה. */
const KEEP_X = 120;
const KEEP_Y = 40;

/**
 * החלון הפותח: 40% מרוחב המסך ו-40% מגובהו, ממורכז, עם היסט מדורג לפי מספר
 * החלונות שכבר פתוחים. כל המידות **ביחידות מוגדלות** - כלומר אחרי חלוקה
 * ב---s של גודל המסך, כמו `left/top` של כל חלון צף (ראה useDragPosition).
 */
export function defaultReaderRect(vw: number, vh: number, index = 0): ReaderRect {
  const w = Math.max(READER_MIN_W, Math.round(vw * READER_DEFAULT_FRACTION));
  const h = Math.max(READER_MIN_H, Math.round(vh * READER_DEFAULT_FRACTION));
  const step = CASCADE * Math.max(0, index);
  return clampReaderRect({
    x: Math.round((vw - w) / 2) + step,
    y: Math.round((vh - h) / 2) + step,
    w, h,
  }, vw, vh);
}

/** מחזיר את החלון לגבולות המסך - גם אחרי גרירה וגם אחרי מעבר לעמדה קטנה יותר. */
export function clampReaderRect(r: ReaderRect, vw: number, vh: number): ReaderRect {
  const w = Math.min(Math.max(READER_MIN_W, Math.round(r.w)), Math.max(READER_MIN_W, Math.round(vw)));
  const h = Math.min(Math.max(READER_MIN_H, Math.round(r.h)), Math.max(READER_MIN_H, Math.round(vh)));
  return {
    w, h,
    x: Math.min(Math.max(Math.round(r.x), 0), Math.max(0, Math.round(vw - KEEP_X))),
    y: Math.min(Math.max(Math.round(r.y), 0), Math.max(0, Math.round(vh - KEEP_Y))),
  };
}

// ── גדלים קבועים ────────────────────────────────────────────────────────────

/**
 * ארבעת הגדלים הקבועים של החלון (אפיון): מלא, 2/3, חצי ושליש **מרוחב המסך**,
 * תמיד בגובה מלא. לחיצה אחת במקום גרירת ידית - על מסך מגע זה ההבדל בין פעולה
 * אחת לשלוש, והחלון מתיישב בדיוק לצד המפה ולא "בערך".
 */
export const READER_SIZE_PRESETS = [
  { key: 'full', fraction: 1 },
  { key: 'twoThirds', fraction: 2 / 3 },
  { key: 'half', fraction: 1 / 2 },
  { key: 'third', fraction: 1 / 3 },
] as const;
export type ReaderSizeKey = typeof READER_SIZE_PRESETS[number]['key'];

/**
 * החלון בגודל קבוע. נצמד לצד שבו הוא **כבר** נמצא (לפי מרכזו): פקח שהזיז את
 * החלון ימינה כדי לפנות את המפה לא ירצה שהקטנה תקפיץ אותו שמאלה.
 * הצד פיזי ולא לוגי - זה מיקום על המסך, לא זרימת טקסט (כמו bottomBarSlots).
 */
export function presetReaderRect(fraction: number, current: ReaderRect, vw: number, vh: number): ReaderRect {
  const w = Math.min(Math.max(READER_MIN_W, Math.round(vw * fraction)), Math.max(READER_MIN_W, Math.round(vw)));
  const h = Math.max(READER_MIN_H, Math.round(vh));
  const onRight = current.x + current.w / 2 > vw / 2;
  return { x: onRight ? Math.max(0, Math.round(vw) - w) : 0, y: 0, w, h };
}

/**
 * איזה גודל קבוע פעיל כרגע (להדגשת הכפתור), או null אחרי שינוי ידני.
 * לפי **הרוחב בלבד**: הגובה נגזר מהעמוד המוצג (fitRectToContent), ולכן אינו
 * מעיד על הבחירה.
 */
export function activeSizePreset(r: ReaderRect, vw: number, vh: number): ReaderSizeKey | null {
  const TOL = 2;
  for (const p of READER_SIZE_PRESETS) {
    if (Math.abs(presetReaderRect(p.fraction, r, vw, vh).w - r.w) <= TOL) return p.key;
  }
  return null;
}

// ── החלון בגודל התוכן ───────────────────────────────────────────────────────

/** הריווח סביב העמוד בתוך אזור התצוגה (margin 8px מכל צד של ה-canvas). */
export const CONTENT_PAD = 16;

/**
 * החלון בגודל העמוד / השקף המוצג - **לא יותר** (אפיון 2026-10-11). מצגת 16:9
 * בחלון בגובה מלא השאירה שטח ריק ענק מתחת לשקף, ושטח ריק הוא מפה מוסתרת לחינם.
 *
 * הרוחב קובע והגובה נגזר מיחס העמוד (`aspect` = גובה/רוחב). עמוד שלא נכנס בגובה
 * המסך - הגובה נחתך למסך והרוחב מתכווץ בהתאם, כדי שלא יישאר שטח ריק בצדדים.
 * `chrome` = מה שבחלון אינו אזור התצוגה (כותרת, ניווט, פאנל סימניות, גבולות) -
 * נמדד מה-DOM ולא מנוחש, כי הוא משתנה עם הפאנל.
 * חלון שהיה צמוד לימין נשאר צמוד לימין (כמו presetReaderRect).
 */
export function fitRectToContent(
  r: ReaderRect, aspect: number, chrome: { chromeW: number; chromeH: number }, vw: number, vh: number,
): ReaderRect {
  if (!Number.isFinite(aspect) || aspect <= 0) return r;
  const { chromeW, chromeH } = chrome;
  let w = r.w;
  let h = chromeH + (w - chromeW - CONTENT_PAD) * aspect + CONTENT_PAD;
  if (h > vh) {
    h = vh;
    w = (vh - chromeH - CONTENT_PAD) / aspect + chromeW + CONTENT_PAD;
  }
  w = Math.round(Math.max(READER_MIN_W, w));
  h = Math.round(Math.max(READER_MIN_H, Math.min(h, vh)));
  const rightEdge = r.x + r.w;
  const wasRight = r.x + r.w / 2 > vw / 2;
  const x = wasRight ? Math.max(0, Math.round(Math.min(rightEdge, vw) - w)) : r.x;
  const y = Math.max(0, Math.min(r.y, Math.round(vh - h)));
  return { x, y, w, h };
}

// ── איפה נפתח קישור ─────────────────────────────────────────────────────────

/**
 * קישור עמדה נפתח בחלון הקריאה כשזו ההגדרה הפעילה - **או** כשהוא קובץ בלבד
 * (נבחר בבוחר הקבצים בניהול, בלי כתובת). לקובץ כזה אין "אפליקציה חיצונית"
 * שהמפעיל מכיר, ופתיחה בלשונית דפדפן היא בדיוק מה שהחלון בא להחליף.
 */
export function linkOpensInWindow(
  effectiveMode: string,
  link: { url?: string | null; doc_id?: number | null },
): boolean {
  if (effectiveMode === 'window') return true;
  return !String(link.url || '').trim() && !!link.doc_id;
}

/**
 * מצב התצוגה (גודל, מיקום, העמוד האחרון) נשמר **מקומית לעמדה**, ולא ב-DB:
 * גודל חלון תלוי במסך שלפניו יושבים, ו-24" ו-15.6" אינם אותו מסך. התוכן
 * האישי - הסימניות וההערות - נשמר בשרת, ולכן נוסע עם איש הצוות.
 */
export const readerStateKey = (presetId: number | string, docId: number) => `bt-reader-${presetId}-${docId}`;

export interface ReaderViewState { rect?: ReaderRect; page?: number; panelOpen?: boolean }

export function loadReaderState(presetId: number | string, docId: number): ReaderViewState {
  try {
    const raw = localStorage.getItem(readerStateKey(presetId, docId));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed as ReaderViewState : {};
  } catch { return {}; }
}

export function saveReaderState(presetId: number | string, docId: number, state: ReaderViewState): void {
  try { localStorage.setItem(readerStateKey(presetId, docId), JSON.stringify(state)); } catch { /* מכסת אחסון */ }
}

// ── חלוקת הסרגל התחתון ─────────────────────────────────────────────────────

export interface BottomSlot { left: string; right: string }

/**
 * שני הסרגלים התחתונים חולקים רצועה אחת: **קריאה מהירה בשמאל, עמדות בימין**
 * (אפיון). כשרק אחד מוצג הוא תופס את כל הרוחב.
 *
 * ⚠ כאן משתמשים ב-`left`/`right` הפיזיים ולא ב-`insetInlineStart/End` - בכוונה
 * ובניגוד לכלל הרגיל. הדרישה היא **סידור מרחבי** ("קריאה מהירה בצד שמאל"),
 * ולא זרימת טקסט: לו היה זה לוגי, שני הסרגלים היו מתחלפים במקומם ברגע שהממשק
 * עובר לאנגלית - והפקח היה מחפש את המדף שלו בצד השני של המסך.
 */
export function bottomBarSlots(showQuick: boolean, showStations: boolean): { quick: BottomSlot; stations: BottomSlot } {
  const both = showQuick && showStations;
  return {
    quick: both ? { left: '0', right: '66%' } : { left: '0', right: '0' },
    stations: both ? { left: '34%', right: '0' } : { left: '0', right: '0' },
  };
}

// ── עזרי תצוגה ─────────────────────────────────────────────────────────────

/** אייקון לפי סוג העזר - זיהוי במבט אחד בסרגל הקריאה המהירה. */
export function docIcon(kind: ReaderDocKind): string {
  switch (kind) {
    case 'pdf': return '📕';
    case 'image': return '🖼';
    case 'sheet': return '📊';
    case 'office': return '📽';
    default: return '📄';
  }
}

/** משלים שדות נגזרים לשורה שהגיעה מהשרת (או מטופס), בלי להניח שהם קיימים. */
export function shapeReaderDoc(row: Record<string, unknown>): ReaderDoc {
  const ext = String(row.ext || docExtOf(row.file_name || row.url));
  return {
    id: Number(row.id),
    name: String(row.name || ''),
    source_kind: row.source_kind === 'file' ? 'file' : 'link',
    url: String(row.url || ''),
    file_name: String(row.file_name || ''),
    ext,
    mime: String(row.mime || ''),
    byte_size: Number(row.byte_size || 0),
    hasFile: !!(row.hasFile ?? row.has_file),
    hasPdf: !!(row.hasPdf ?? row.has_pdf),
    kind: (row.kind as ReaderDocKind) || docKindOf(ext, row.mime),
    convertError: String(row.convertError ?? row.convert_error ?? ''),
    converted_at: (row.converted_at as string) ?? null,
  };
}

/** מנוע התצוגה לעזר נתון - עטיפה על ההכרעה המשותפת עם השרת. */
export function engineFor(doc: ReaderDoc, officeMode: ReaderConfig['officeMode']): ReaderEngineResult {
  return readerEngine({ kind: doc.kind, hasFile: doc.hasFile, hasPdf: doc.hasPdf, url: doc.url, convertError: doc.convertError }, officeMode);
}

/** כתובת הבתים שהחלון פורס: קובץ שהועלה, גרסת PDF שהומרה, או proxy לכתובת. */
export function docBytesUrl(doc: ReaderDoc): string {
  if (doc.hasPdf) return `${API_URL}/reader/docs/${doc.id}/file?pdf=1`;
  if (doc.hasFile) return `${API_URL}/reader/docs/${doc.id}/file`;
  return `${API_URL}/reader/docs/${doc.id}/proxy`;
}

export { resolveOpenMode };
