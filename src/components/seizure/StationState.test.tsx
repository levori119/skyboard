import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import StationState from './StationState';

// אותו תא מוצג בשתי טבלאות - רשימת ההפצה וטופס אישורי העמדות - וזו השאלה
// שמכריעה אם היוצר ממתין לאישור או מרים טלפון. הבדיקה שומרת על שלושת המצבים
// ועל סדר הקדימות ביניהם.

const html = (state: { active?: boolean; merged_into_name?: string | null }) =>
  renderToStaticMarkup(<StationState state={state} />);

describe('StationState - מצב העמדה', () => {
  it('דופק טרי = פעילה', () => {
    expect(html({ active: true })).toContain('פעילה');
    expect(html({ active: true })).toContain('data-station-state="active"');
  });

  it('בלי דופק = לא פעילה', () => {
    expect(html({ active: false })).toContain('עמדה לא פעילה');
    expect(html({ active: false })).toContain('data-station-state="inactive"');
  });

  // עמדה מכוסה קודמת ל"לא פעילה": זה המידע שמכוון לפעולה - יש למי לפנות,
  // ושמו כתוב. "לא פעילה" לבדה הייתה שולחת את היוצר לחפש.
  it('עמדה מאוחדת נושאת את שם המכסה, וקודמת ל"לא פעילה"', () => {
    const out = html({ active: false, merged_into_name: 'מגדל א' });
    expect(out).toContain('מגדל א');
    expect(out).toContain('data-station-state="merged"');
  });

  it('שם מכסה ריק או רווחים אינו נחשב איחוד', () => {
    expect(html({ active: true, merged_into_name: '  ' })).toContain('data-station-state="active"');
    expect(html({ active: false, merged_into_name: null })).toContain('data-station-state="inactive"');
  });

  // שרת שלא דיווח מצב (שדה חסר) אינו סיבה לצבוע עמדה כחשוכה: הצגת "לא פעילה"
  // על סמך `undefined` הייתה שולחת את היוצר להרים טלפון לעמדה מאוישת.
  it('בלי מידע מהשרת - לא מסומנת כלא פעילה', () => {
    expect(html({})).toContain('data-station-state="active"');
  });
});
