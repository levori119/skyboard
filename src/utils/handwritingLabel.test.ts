import { describe, it, expect } from 'vitest';
import { handwritingParts, partsText, bidiRuns } from './handwritingLabel';

/** רווח קשיח - מקף - רווח קשיח, כפי שהמפריד נבנה במימוש. */
const S = ' - ';

/** הטקסט הלוגי המלא, עם מקף רגיל במקום הקשיח כדי שהבדיקות יהיו קריאות. */
const label = (o: Parameters<typeof handwritingParts>[0]) =>
  partsText(handwritingParts(o)).split(S).join(' - ');

describe('handwritingParts - הפורמט שהבקר כותב בצ\'ינו', () => {
  it('פ"מ מפוצל: מספר המטוס עצמו, בלי סוגריים', () => {
    expect(label({ callSign: 'כידון', aircraftIndices: [1], numberOfFormation: 4, squadron: '105' }))
      .toBe('כידון1 - 105');
  });

  it('פ"מ מפוצל בכמה מטוסים: המספרים מחוברים ב-+ ולפי סדר עולה', () => {
    expect(label({ callSign: 'כידון', aircraftIndices: [2, 1], numberOfFormation: 4, squadron: '105' }))
      .toBe('כידון1+2 - 105');
  });

  it('מבנה שלם: מספר המטוסים בסוגריים', () => {
    expect(label({ callSign: 'בננה', numberOfFormation: 2, squadron: '105' }))
      .toBe('בננה(2) - 105');
  });

  it('מבנה שלם של מטוס אחד - עדיין סוגריים, וזה מה שמבדיל אותו ממפוצל', () => {
    expect(label({ callSign: 'ע305', numberOfFormation: 1, squadron: '142' }))
      .toBe('ע305(1) - 142');
    expect(label({ callSign: 'ע305', aircraftIndices: [1], squadron: '142' }))
      .toBe('ע3051 - 142');
  });

  it('aircraft_indices כמחרוזת JSON מה-DB מטופל כמו מערך', () => {
    expect(label({ callSign: 'כידון', aircraftIndices: '[1,3]', squadron: '105' }))
      .toBe('כידון1+3 - 105');
  });

  it('JSON פגום נופל בחזרה למספר המבנה ולא מפיל את התווית', () => {
    expect(label({ callSign: 'כידון', aircraftIndices: '][', numberOfFormation: 4, squadron: '105' }))
      .toBe('כידון(4) - 105');
  });

  it('בלי מספר מבנה - רק או"ק וטייסת', () => {
    expect(label({ callSign: 'בננה', squadron: '105' })).toBe('בננה - 105');
  });

  it('בלי טייסת - בלי מקף ורווח מיותמים בסוף', () => {
    expect(label({ callSign: 'בננה', numberOfFormation: 4 })).toBe('בננה(4)');
  });

  it('מבנה 0 או ריק אינו יוצר סוגריים ריקות', () => {
    expect(label({ callSign: 'בננה', numberOfFormation: '', squadron: '105' })).toBe('בננה - 105');
  });
});

describe('handwritingParts - סדר האסימונים הוא סדר הקריאה', () => {
  it('כל אסימון עומד בפני עצמו, ולכן בעברית הקריאה מימין היא או"ק, מספרים, מקף, טייסת', () => {
    const parts = handwritingParts({ callSign: 'כידון', aircraftIndices: [1, 2], squadron: '105' });
    expect(parts.map(p => p.text)).toEqual(['כידון', '1+2', S, '105']);
  });

  it('הטייסת אינה נצמדת למספרי המטוסים - אחרת היא הייתה נוגעת באו"ק בקריאה מימין', () => {
    const parts = handwritingParts({ callSign: 'כידון', aircraftIndices: [1, 2], squadron: '105' });
    const acIdx = parts.findIndex(p => p.text === '1+2');
    const sqIdx = parts.findIndex(p => p.text === '105');
    expect(sqIdx).toBeGreaterThan(acIdx);
    expect(parts[acIdx + 1].text).toBe(S);
  });

  it('או"ק מעורב מתפצל לאסימונים, כדי ש-ע305 לא יתהפך ל-305ע', () => {
    const parts = handwritingParts({ callSign: 'ע305', numberOfFormation: 1, squadron: '142' });
    expect(parts.map(p => p.text)).toEqual(['ע', '305', '(1)', S, '142']);
  });

  it('רק רצף עברי מקבל bdi אוטומטי; ספרות וסוגריים כפויות ל-LTR', () => {
    const parts = handwritingParts({ callSign: 'ע305', numberOfFormation: 1, squadron: '142' });
    expect(parts.map(p => p.ltr)).toEqual([false, true, true, true, true]);
  });

  it('או"ק לטיני כולו LTR', () => {
    const parts = handwritingParts({ callSign: 'SKY01', numberOfFormation: 2, squadron: '105' });
    expect(parts.map(p => p.ltr)).toEqual([true, true, true, true]);
  });

  it('המפריד הוא רווח קשיח, כדי שלא יתמוטט בקצה אסימון', () => {
    const parts = handwritingParts({ callSign: 'בננה', squadron: '105' });
    expect(parts.find(p => p.text.includes('-'))!.text).toBe(' - ');
  });
});

describe('bidiRuns - בידוד רצפים כדי שהסדר הלוגי יישמר', () => {
  it('או"ק שמערבב אות עברית וספרות מפורק, אחרת הדפדפן מרנדר 305ע', () => {
    expect(bidiRuns('ע305')).toEqual(['ע', '305']);
  });

  it('מילה עברית שלמה אינה מפורקת - פירוק היה הופך את האותיות', () => {
    expect(bidiRuns('כידון')).toEqual(['כידון']);
    expect(bidiRuns('בננה')).toEqual(['בננה']);
  });

  it('או"ק לטיני נשאר רצף אחד', () => {
    expect(bidiRuns('SKY01')).toEqual(['SKY01']);
  });

  it('כמה מעברים באותו או"ק', () => {
    expect(bidiRuns('ע305א')).toEqual(['ע', '305', 'א']);
  });

  it('מחרוזת ריקה אינה מייצרת <bdi> ריק', () => {
    expect(bidiRuns('')).toEqual([]);
  });

  it('הרצפים תמיד מרכיבים בחזרה את המקור', () => {
    for (const s of ['ע305', 'כידון', 'SKY01', 'ע305א', 'א1ב2ג3']) {
      expect(bidiRuns(s).join('')).toBe(s);
    }
  });
});
