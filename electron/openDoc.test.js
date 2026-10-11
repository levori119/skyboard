import { describe, it, expect } from 'vitest';
import { safeDocName, OPENABLE_EXTS } from './openDoc.cjs';

// "פתח באפליקציה חיצונית" - הקובץ נכתב לתיקייה זמנית ונפתח באפליקציה של
// מערכת ההפעלה. השם מגיע מהעמוד, ולכן: שם בלבד (בלי נתיב), ורק סיומות של
// מסמכים - עמוד עוין לא יכול להפיל קובץ הרצה ולהריץ אותו.
describe('safeDocName', () => {
  it('מסמך תקין נשמר בשמו, כולל עברית', () => {
    expect(safeDocName('תדריך שדה.pptx')).toBe('תדריך שדה.pptx');
    expect(safeDocName('EFF – Flight Folder.PDF')).toBe('EFF – Flight Folder.PDF');
  });
  it('נתיב נחתך לשם בלבד - אין יציאה מהתיקייה', () => {
    expect(safeDocName(String.raw`..\..\Windows\a.docx`)).toBe('a.docx');
    expect(safeDocName('../../etc/a.pdf')).toBe('a.pdf');
  });
  it('תווים אסורים ב-Windows מוחלפים', () => {
    expect(safeDocName('a:b*c?.pdf')).toBe('a_b_c_.pdf');
  });
  it('קובץ הרצה / סקריפט - נדחה (null)', () => {
    for (const n of ['x.exe', 'x.bat', 'x.cmd', 'x.ps1', 'x.js', 'x.vbs', 'x.lnk', 'x.msi', 'x.scr', 'x.html', 'x.pdf.exe', 'noext']) {
      expect(safeDocName(n)).toBeNull();
    }
  });
  it('הסיומות המותרות הן מסמכים ותמונות בלבד', () => {
    expect(OPENABLE_EXTS).toContain('pptx');
    expect(OPENABLE_EXTS).toContain('docx');
    expect(OPENABLE_EXTS).not.toContain('exe');
  });
  it('שם ריק / לא מחרוזת - נדחה', () => {
    expect(safeDocName('')).toBeNull();
    expect(safeDocName(undefined)).toBeNull();
  });
});
