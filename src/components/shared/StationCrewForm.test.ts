import { describe, it, expect } from 'vitest';
import { EMPTY_SESSION_ROLES, initialSessionRoles, matchCrewOptions } from './StationCrewForm';

// הרכב "משמרת קודמת" כפי שהוא חוזר מהשרת עבור העמדה
const SAVED = {
  bakar: 'בקר קודם', achori: 'אחורי קודם', mushgach: 'משגיח קודם',
  mefale: 'מפעיל קודם', mefale_mushgach: 'מפעיל מושגח קודם',
  mashak: 'מש"ק קודם', mashak_mushgach: 'מש"ק מושגח קודם',
  kshp: '55901234',
  has_mushgach: true, has_mefale_mushgach: true, has_mashak_mushgach: true,
};

describe('initialSessionRoles - כניסה לעמדה (הרכב חדש)', () => {
  it('מנקה את כל נתוני המשמרת הקודמת ומשאיר רק את הבקר/פקח שנכנס', () => {
    expect(initialSessionRoles(SAVED, 'אורי לב', true))
      .toEqual({ ...EMPTY_SESSION_ROLES, bakar: 'אורי לב' });
  });

  it('שדה הבקר/פקח הוא המשתמש שנכנס, גם כשבמשמרת הקודמת ישב מישהו אחר', () => {
    expect(initialSessionRoles(SAVED, 'אורי לב', true).bakar).toBe('אורי לב');
  });

  it('דגלי ההשגחה נכבים - הטופס נפתח קצר, בלי שדות מושגח', () => {
    const r = initialSessionRoles(SAVED, 'אורי לב', true);
    expect([r.has_mushgach, r.has_mefale_mushgach, r.has_mashak_mushgach]).toEqual([false, false, false]);
  });

  it('בלי משתמש מזוהה - גם שדה הבקר/פקח ריק', () => {
    expect(initialSessionRoles(SAVED, undefined, true)).toEqual(EMPTY_SESSION_ROLES);
  });
});

describe('initialSessionRoles - עדכון חברי העמדה / תחקיר (הרכב קיים)', () => {
  it('טוען את ההרכב השמור כמו שהוא', () => {
    expect(initialSessionRoles(SAVED, 'אורי לב', false)).toEqual(SAVED);
  });

  it('בקר ריק בשרת נופל למשתמש הנוכחי', () => {
    expect(initialSessionRoles({ ...SAVED, bakar: '' }, 'אורי לב', false).bakar).toBe('אורי לב');
  });

  it('תשובה ריקה מהשרת - טופס ריק עם המשתמש הנוכחי', () => {
    expect(initialSessionRoles(null, 'אורי לב', false))
      .toEqual({ ...EMPTY_SESSION_ROLES, bakar: 'אורי לב' });
  });
});

// חיפוש השם בתפריט: בעמדה מקלידים 2-3 אותיות מהשם - לא בהכרח את תחילתו,
// לא בהכרח לפי הסדר, ובלי לדייק ברווחים ובגרשיים.
describe('matchCrewOptions - חיפוש איש צוות בתפריט', () => {
  const PEOPLE = ['אורי לב', 'אורן בן דור', 'דנה כהן', 'יואל פינק', 'שי"ח מזרחי', 'Ori Elimelech'];

  it('בלי טקסט - כל הרשימה', () => {
    expect(matchCrewOptions(PEOPLE, '')).toEqual(PEOPLE);
    expect(matchCrewOptions(PEOPLE, '   ')).toEqual(PEOPLE);
  });

  it('רצף אותיות מתוך השם', () => {
    expect(matchCrewOptions(PEOPLE, 'אור')).toEqual(['אורי לב', 'אורן בן דור']);
  });

  it('שם משפחה בלבד - גם כשהוא לא בתחילת השם', () => {
    expect(matchCrewOptions(PEOPLE, 'כהן')).toEqual(['דנה כהן']);
  });

  it('שם פרטי ומשפחה בסדר הפוך', () => {
    expect(matchCrewOptions(PEOPLE, 'לב אורי')).toEqual(['אורי לב']);
  });

  it('דילוג על מילה באמצע השם', () => {
    expect(matchCrewOptions(PEOPLE, 'אורן דור')).toEqual(['אורן בן דור']);
  });

  it('רווחים מיותרים לא מפילים את החיפוש', () => {
    expect(matchCrewOptions(PEOPLE, '  אורן    דור  ')).toEqual(['אורן בן דור']);
  });

  it('גרשיים בשם - החיפוש עובד עם ובלי', () => {
    expect(matchCrewOptions(PEOPLE, 'שיח')).toEqual(['שי"ח מזרחי']);
    expect(matchCrewOptions(PEOPLE, 'שי"ח')).toEqual(['שי"ח מזרחי']);
  });

  it('שם באנגלית - בלי תלות באותיות גדולות', () => {
    expect(matchCrewOptions(PEOPLE, 'ori')).toEqual(['Ori Elimelech']);
  });

  it('שם שאינו ברשימה - אין תוצאות (הקלדה חופשית עדיין חוקית)', () => {
    expect(matchCrewOptions(PEOPLE, 'משקון')).toEqual([]);
  });

  it('רשימה ארוכה נחתכת ל-50 הצעות', () => {
    const many = Array.from({ length: 120 }, (_, i) => `בקר ${i}`);
    expect(matchCrewOptions(many, '').length).toBe(50);
    expect(matchCrewOptions(many, 'בקר').length).toBe(50);
  });
});
