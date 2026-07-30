/**
 * מסמכי בד"ח / רשימת תיוג — סיווג לפי `kind`.
 *
 * שני הסוגים חולקים את **אותה** טבלה (`bdh_documents`), אותם endpoints ואותם
 * רכיבי תצוגה — ההבדל היחיד הוא `kind`, שקובע:
 *   - באיזו קטגוריה המסמך מוצג בעמדה (רשימת תיוג מעל בד"ח)
 *   - האם ה-viewer מציג בורר פ"מ ומספר מטוס (בד"ח בלבד)
 *
 * מסמכים ישנים נשמרו לפני שהעמודה נוספה ולכן `kind` עשוי להיות null/undefined —
 * ברירת המחדל היא תמיד `bdh`.
 */

export type DocKind = 'bdh' | 'checklist';

export const DOC_KIND_BDH: DocKind = 'bdh';
export const DOC_KIND_CHECKLIST: DocKind = 'checklist';

/** הסוג של מסמך; כל ערך שאינו 'checklist' (כולל חסר) נחשב בד"ח */
export function docKind(doc: { kind?: string | null } | null | undefined): DocKind {
  return doc?.kind === DOC_KIND_CHECKLIST ? DOC_KIND_CHECKLIST : DOC_KIND_BDH;
}

/** האם המסמך הוא רשימת תיוג (ולא בד"ח) */
export function isChecklistDoc(doc: { kind?: string | null } | null | undefined): boolean {
  return docKind(doc) === DOC_KIND_CHECKLIST;
}

/** סינון רשימת מסמכים לסוג מבוקש */
export function filterDocsByKind<T extends { kind?: string | null }>(docs: T[], kind: DocKind): T[] {
  return (docs || []).filter(d => docKind(d) === kind);
}

/** נרמול קלט חופשי (query string / body) לסוג חוקי */
export function normalizeDocKind(value: unknown): DocKind {
  return value === DOC_KIND_CHECKLIST ? DOC_KIND_CHECKLIST : DOC_KIND_BDH;
}
