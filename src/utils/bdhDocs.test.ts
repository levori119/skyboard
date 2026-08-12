import { describe, it, expect } from 'vitest';
import { docKind, isChecklistDoc, filterDocsByKind, normalizeDocKind } from './bdhDocs';

describe('bdhDocs — סיווג מסמכי בד"ח / רשימת תיוג', () => {
  it('מסמך בלי kind (מסמכים היסטוריים) נחשב בד"ח', () => {
    expect(docKind({})).toBe('bdh');
    expect(docKind({ kind: null })).toBe('bdh');
    expect(docKind(undefined)).toBe('bdh');
  });

  it("kind='checklist' מזוהה כרשימת תיוג", () => {
    expect(docKind({ kind: 'checklist' })).toBe('checklist');
    expect(isChecklistDoc({ kind: 'checklist' })).toBe(true);
    expect(isChecklistDoc({ kind: 'bdh' })).toBe(false);
    expect(isChecklistDoc({})).toBe(false);
  });

  it('ערך לא מוכר נופל לבד"ח (לא מייצר קטגוריה שלישית)', () => {
    expect(docKind({ kind: 'whatever' })).toBe('bdh');
    expect(normalizeDocKind('whatever')).toBe('bdh');
    expect(normalizeDocKind(undefined)).toBe('bdh');
    expect(normalizeDocKind('checklist')).toBe('checklist');
  });

  it('סינון לפי סוג מפצל את הרשימה בלי לאבד מסמכים', () => {
    const docs = [
      { id: 1, kind: 'bdh' },
      { id: 2, kind: 'checklist' },
      { id: 3 },
      { id: 4, kind: 'checklist' },
    ];
    expect(filterDocsByKind(docs, 'bdh').map(d => d.id)).toEqual([1, 3]);
    expect(filterDocsByKind(docs, 'checklist').map(d => d.id)).toEqual([2, 4]);
    expect(filterDocsByKind(docs, 'bdh').length + filterDocsByKind(docs, 'checklist').length).toBe(docs.length);
  });

  it('רשימה ריקה / חסרה לא מפילה', () => {
    expect(filterDocsByKind([], 'checklist')).toEqual([]);
    expect(filterDocsByKind(undefined as any, 'bdh')).toEqual([]);
  });
});
