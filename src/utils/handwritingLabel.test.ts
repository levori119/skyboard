import { describe, it, expect } from 'vitest';
import { handwritingLabel, bidiRuns } from './handwritingLabel';

const label = (o: Parameters<typeof handwritingLabel>[0]) => {
  const { name, suffix } = handwritingLabel(o);
  return name + suffix;
};

describe('handwritingLabel - הפורמט שהבקר כותב בצ\'ינו', () => {
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
