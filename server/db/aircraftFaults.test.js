// בדיקות לקטע ה-SQL המשותף של תקלות המטוסים.
//
// הבדיקה כאן היא **בלם רגרסיה**, לא בדיקת ניסוח: הסינון לפי `aircraft_indices`
// הוא מה שמונע מתקלה של מטוס שעבר בפיצול להופיע על שני הפ"ממים במקביל. מי
// שימחק אותו "כדי לפשט את השאילתה" ישבור את הדרישה בשקט - הנתונים ימשיכו
// לחזור, פשוט אצל הפ"מ הלא נכון.
//
// הרצת ה-SQL מול Postgres נעשית בבדיקת האינטגרציה ובסמוק, לא כאן.

import { describe, it, expect } from 'vitest';
import { aircraftFaultsSubquery, belongsToStrip, FAULT_CARRY_COLUMNS } from './aircraftFaults.js';

describe('aircraftFaultsSubquery - תקלות המטוסים של הפ"מ', () => {
  it('מחזיר רק מטוסים שדגל התקלה שלהם דלוק', () => {
    expect(aircraftFaultsSubquery('s')).toContain('sa.has_fault = TRUE');
  });

  it('כולל את המהות והפירוט לצד מספר המטוס - התג אומר "למי" וה-HINT "מה"', () => {
    const sql = aircraftFaultsSubquery('s');
    expect(sql).toContain("'idx', sa.idx");
    expect(sql).toContain("'fault_type', sa.fault_type");
    expect(sql).toContain("'fault_details', sa.fault_details");
  });

  it('מסנן לפי aircraft_indices - בלעדיו תקלה של מטוס מפוצל הופיעה על שני הפ"ממים', () => {
    expect(aircraftFaultsSubquery('s')).toContain('aircraft_indices @> to_jsonb(sa.idx)');
  });

  it('פ"מ בלי תקלות מחזיר מערך ריק ולא NULL - הלקוח עושה עליו map בלי שמירה', () => {
    expect(aircraftFaultsSubquery('s')).toContain("'[]'::jsonb");
  });

  it('מכבד את כינוי הטבלה שנמסר, כי לא בכל שאילתה strips היא "s"', () => {
    const sql = aircraftFaultsSubquery('st');
    expect(sql).toContain('sa.strip_id = st.id');
    expect(sql).toContain('st.aircraft_indices');
    expect(sql).not.toContain(' s.id');
  });

  it('ברירת המחדל היא "s" - הכינוי הנפוץ בכל מסלולי הפ"מ', () => {
    expect(aircraftFaultsSubquery()).toBe(aircraftFaultsSubquery('s'));
  });
});

describe('belongsToStrip - "המטוס שייך לפ"מ הזה עכשיו"', () => {
  it('פ"מ שלם (aircraft_indices = NULL) מציג את כל מטוסיו', () => {
    expect(belongsToStrip('s')).toContain('s.aircraft_indices IS NULL');
  });

  it('פ"מ מפוצל מציג רק את המטוסים שברשימתו', () => {
    expect(belongsToStrip('s')).toContain('s.aircraft_indices @> to_jsonb(sa.idx)');
  });

  it('ניתן להחליף את ביטוי המספר, לשימוש מחוץ לכינוי sa', () => {
    expect(belongsToStrip('s', 'jpa.aircraft_idx')).toContain('to_jsonb(jpa.aircraft_idx)');
  });
});

describe('FAULT_CARRY_COLUMNS - מה נוסע עם המטוס בפיצול ובמיזוג', () => {
  it('שלוש עמודות התקלה - הדגל בלי המהות והפירוט הוא תקלה בלי תוכן', () => {
    expect(FAULT_CARRY_COLUMNS).toEqual(['has_fault', 'fault_type', 'fault_details']);
  });
});
