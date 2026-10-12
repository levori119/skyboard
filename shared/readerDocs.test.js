import { describe, it, expect } from 'vitest';
import {
  docExtOf, docKindOf, isFetchableUrl, normalizeDocUrl,
  resolveOpenMode, resolveOfficeMode, readerEngine, needsServerConvert,
} from './readerDocs.js';

describe('docExtOf', () => {
  it('מחזיר סיומת באותיות קטנות משם קובץ ומכתובת', () => {
    expect(docExtOf('תדריך.PDF')).toBe('pdf');
    expect(docExtOf('https://x.local/docs/brief.pptx')).toBe('pptx');
    expect(docExtOf('\\\\server\\share\\טבלה.xlsx')).toBe('xlsx');
  });
  it('מתעלם מ-query ומ-fragment', () => {
    expect(docExtOf('https://x.local/a.pdf?v=2#page=3')).toBe('pdf');
  });
  it('כתובת בלי סיומת מחזירה ריק - ולא ניחוש', () => {
    expect(docExtOf('https://x.local/download?id=7')).toBe('');
    expect(docExtOf('')).toBe('');
    expect(docExtOf('noext')).toBe('');
  });
});

describe('docKindOf', () => {
  it('מסווג לפי סיומת', () => {
    expect(docKindOf('pdf')).toBe('pdf');
    expect(docKindOf('png')).toBe('image');
    expect(docKindOf('xlsx')).toBe('sheet');
    expect(docKindOf('csv')).toBe('sheet');
    expect(docKindOf('pptx')).toBe('office');
    expect(docKindOf('docx')).toBe('office');
    expect(docKindOf('zip')).toBe('other');
  });
  it('mime מפורש גובר על היעדר סיומת', () => {
    expect(docKindOf('', 'application/pdf')).toBe('pdf');
    expect(docKindOf('', 'image/jpeg')).toBe('image');
    expect(docKindOf('', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('office');
    expect(docKindOf('', 'text/csv')).toBe('sheet');
  });
});

describe('isFetchableUrl', () => {
  it('http/https בלבד', () => {
    expect(isFetchableUrl('https://x.local/a.pdf')).toBe(true);
    expect(isFetchableUrl('http://x.local/a.pdf')).toBe(true);
  });
  it('כונן רשת ו-file:// אינם ניתנים למשיכה מהדפדפן', () => {
    expect(isFetchableUrl('\\\\server\\share\\a.pptx')).toBe(false);
    expect(isFetchableUrl('file:///C:/a.pdf')).toBe(false);
    expect(isFetchableUrl('')).toBe(false);
  });
});

describe('normalizeDocUrl - איחוד שני קישורים לאותו עזר', () => {
  it('סכמה ו-host לא רגישים לאותיות, fragment יורד, / מיותר בסוף יורד', () => {
    expect(normalizeDocUrl('HTTPS://Docs.Local/Brief.pdf#page=4'))
      .toBe(normalizeDocUrl('https://docs.local/Brief.pdf'));
    expect(normalizeDocUrl('https://docs.local/a/')).toBe('https://docs.local/a');
  });
  it('הנתיב עצמו רגיש לאותיות - שני קבצים שונים לא מתאחדים', () => {
    expect(normalizeDocUrl('https://d.local/A.pdf')).not.toBe(normalizeDocUrl('https://d.local/a.pdf'));
  });
  it('query נשאר - הוא חלק מזהות הקובץ במערכות מסמכים', () => {
    expect(normalizeDocUrl('https://d.local/get?id=7')).toBe('https://d.local/get?id=7');
    expect(normalizeDocUrl('https://d.local/get?id=7')).not.toBe(normalizeDocUrl('https://d.local/get?id=8'));
  });
  it('כתובת שאינה URL (כונן רשת) עוברת כמו שהיא', () => {
    expect(normalizeDocUrl('\\\\srv\\share\\a.pptx')).toBe('\\\\srv\\share\\a.pptx');
    expect(normalizeDocUrl('')).toBe('');
  });
});

describe('resolveOpenMode - עקיפה פר-עמדה גוברת על הגלובלית', () => {
  it('לעמדה יש הגדרה משלה', () => {
    expect(resolveOpenMode('external', 'window')).toBe('window');
    expect(resolveOpenMode('window', 'external')).toBe('external');
  });
  it('ריק בעמדה = ירושה מהמערכת', () => {
    expect(resolveOpenMode('window', '')).toBe('window');
    expect(resolveOpenMode('window', null)).toBe('window');
    expect(resolveOpenMode('window', undefined)).toBe('window');
  });
  it('ערך לא מוכר אינו משנה התנהגות בשקט - נופלים לברירת המחדל הקיימת', () => {
    expect(resolveOpenMode('bogus', 'nonsense')).toBe('external');
    // ברירת המחדל לאופיס: המרה בשרת (2026-10-11) - מצגת שהועלתה נפתחת בלי צעד ידני
    expect(resolveOfficeMode('bogus')).toBe('server');
  });
});

describe('readerEngine - מטריצת המקרים המלאה', () => {
  const link = (url, kind, extra = {}) => ({ kind, url, ...extra });

  it('PDF וקישור http - נפרס בחלון', () => {
    expect(readerEngine(link('https://d.local/a.pdf', 'pdf'), 'pdf').engine).toBe('pdf');
  });
  it('תמונה - נפרסת בחלון', () => {
    expect(readerEngine(link('https://d.local/a.png', 'image'), 'pdf').engine).toBe('image');
  });
  it('קובץ שהועלה נפרס גם בלי כתובת בכלל', () => {
    expect(readerEngine({ kind: 'pdf', hasFile: true, url: '' }, 'pdf').engine).toBe('pdf');
  });

  it('כתובת שאי-אפשר למשוך - סימניות בלבד, ולא ניסיון פריסה כושל', () => {
    const r = readerEngine(link('\\\\srv\\share\\a.pdf', 'pdf'), 'pdf');
    expect(r.engine).toBe('notes');
    expect(r.reason).toBe('unreachable');
    expect(r.canConvert).toBe(false);
  });

  it('גיליון נפרס בחלון בכל מצב פרט ל-external', () => {
    expect(readerEngine(link('https://d.local/a.xlsx', 'sheet'), 'pdf').engine).toBe('sheet');
    expect(readerEngine(link('https://d.local/a.xlsx', 'sheet'), 'server').engine).toBe('sheet');
    const ext = readerEngine(link('https://d.local/a.xlsx', 'sheet'), 'external');
    expect(ext.engine).toBe('notes');
    expect(ext.reason).toBe('office-external');
  });

  it('מצגת במצב pdf - דורשת גרסת PDF, ואין מה להמיר בשרת', () => {
    const r = readerEngine(link('https://d.local/a.pptx', 'office'), 'pdf');
    expect(r).toEqual({ engine: 'notes', reason: 'office-needs-pdf', canConvert: false });
  });
  it('מצגת במצב server - ממתינה להמרה, והלקוח רשאי לבקש אותה', () => {
    const r = readerEngine(link('https://d.local/a.pptx', 'office'), 'server');
    expect(r).toEqual({ engine: 'notes', reason: 'convert-pending', canConvert: true });
  });
  it('המרה שנכשלה מדווחת ככשל ולא כהמתנה אינסופית', () => {
    const r = readerEngine(link('https://d.local/a.pptx', 'office', { convertError: 'soffice missing' }), 'server');
    expect(r.reason).toBe('convert-failed');
  });
  it('מצגת במצב external - נפתחת בחוץ, החלון לסימניות', () => {
    expect(readerEngine(link('https://d.local/a.pptx', 'office'), 'external').reason).toBe('office-external');
  });
  it('גרסת PDF שהומרה גוברת על כל מצב - כולל external', () => {
    const doc = link('https://d.local/a.pptx', 'office', { hasPdf: true });
    expect(readerEngine(doc, 'external').engine).toBe('pdf');
    expect(readerEngine(doc, 'pdf').engine).toBe('pdf');
  });
  it('סוג שאינו נתמך', () => {
    expect(readerEngine(link('https://d.local/a.zip', 'other'), 'pdf').reason).toBe('unsupported');
  });
});

describe('needsServerConvert', () => {
  it('רק אופיס במצב server, ורק כשאין כבר גרסת PDF', () => {
    expect(needsServerConvert({ kind: 'office', hasFile: true }, 'server')).toBe(true);
    expect(needsServerConvert({ kind: 'office', hasFile: true, hasPdf: true }, 'server')).toBe(false);
    expect(needsServerConvert({ kind: 'office', hasFile: true }, 'pdf')).toBe(false);
    expect(needsServerConvert({ kind: 'pdf', hasFile: true }, 'server')).toBe(false);
    // כתובת שאי-אפשר למשוך - אין מה להמיר
    expect(needsServerConvert({ kind: 'office', url: '\\\\srv\\a.pptx' }, 'server')).toBe(false);
  });
});

describe('resolveOpenMode - שלוש רמות: עזר > עמדה > מערכת', () => {
  it('הגדרת העזר גוברת על העמדה ועל המערכת', () => {
    expect(resolveOpenMode('external', 'external', 'window')).toBe('window');
    expect(resolveOpenMode('window', 'window', 'external')).toBe('external');
  });
  it('עזר בירושה (ריק) - העמדה, ואחריה המערכת', () => {
    expect(resolveOpenMode('external', 'window', '')).toBe('window');
    expect(resolveOpenMode('window', '', '')).toBe('window');
  });
  it('ערך לא מוכר בעזר - ירושה ולא כיבוי', () => {
    expect(resolveOpenMode('window', '', 'bogus')).toBe('window');
  });
});
