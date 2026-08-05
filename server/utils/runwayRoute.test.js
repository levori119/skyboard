import { describe, it, expect } from 'vitest';
import {
  RUNWAY_ROUTE_COLOR,
  matchesRunway,
  routeFieldsFromRunway,
  runwayRouteName,
  runwayRouteNote,
  runwayRoutePath,
} from './runwayRoute.js';

// מסלול המראה שנוצר ביישות "מסלולים" נכנס אוטומטית ל"מסלולי הסעה" כמסלול ראי:
// אותם נתונים, בלי הקלדה חוזרת, ועם הערה שאומרת מאיפה הוא הגיע.

const rw = (over = {}) => ({
  id: 7, airfield_id: 3, name: '33/15', heading_a: '33', heading_b: '15',
  start_x_pct: 50, start_y_pct: 70, end_x_pct: 50, end_y_pct: 40, ...over,
});

describe('runwayRouteName - שם המסלול הראי', () => {
  it('שם המסלול כפי שהוגדר ביישות מסלולים', () => {
    expect(runwayRouteName(rw())).toBe('33/15');
  });

  it('בלי שם - נגזר משני הקצוות, כי מסלול בלי שם אינו ניתן לזיהוי ברשימה', () => {
    expect(runwayRouteName(rw({ name: '' }))).toBe('33/15');
    expect(runwayRouteName(rw({ name: null }))).toBe('33/15');
  });

  it('בלי שם ובלי שני קצוות - הקצה היחיד שקיים', () => {
    expect(runwayRouteName(rw({ name: '', heading_b: '' }))).toBe('33');
  });

  it('בלי שם ובלי קצוות - מזהה המסלול, כדי שלא יישאר ריק', () => {
    expect(runwayRouteName(rw({ name: '', heading_a: '', heading_b: '' }))).toBe('מסלול 7');
  });
});

describe('runwayRoutePath - השרטוט נגזר מקואורדינטות המסלול', () => {
  it('שתי נקודות: תחילת המסלול וסופו', () => {
    expect(runwayRoutePath(rw())).toEqual([{ x: 50, y: 70 }, { x: 50, y: 40 }]);
  });

  it('קואורדינטה חסרה - אין שרטוט (ולא נקודה על 0,0)', () => {
    expect(runwayRoutePath(rw({ end_y_pct: null }))).toEqual([]);
    expect(runwayRoutePath(rw({ start_x_pct: undefined }))).toEqual([]);
  });

  it('אפס הוא קואורדינטה תקפה - פינת המפה, לא "ריק"', () => {
    expect(runwayRoutePath(rw({ start_x_pct: 0, start_y_pct: 0 })))
      .toEqual([{ x: 0, y: 0 }, { x: 50, y: 40 }]);
  });
});

describe('runwayRouteNote - ההערה מספרת מאיפה המסלול הגיע', () => {
  it('מזכירה את יישות המסלולים ואת שם המסלול', () => {
    const note = runwayRouteNote(rw());
    expect(note).toContain('מסלולים');
    expect(note).toContain('33/15');
  });

  it('בלי מקף ארוך - "המקף של AI" לא נכתב בטקסט שמוצג למשתמש', () => {
    expect(runwayRouteNote(rw())).not.toMatch(/[—–]/);
  });
});

describe('routeFieldsFromRunway - כל השדות מתמלאים אוטומטית', () => {
  it('מסלול המראה, עם קצוות, שרטוט, הערה וצבע אחיד', () => {
    expect(routeFieldsFromRunway(rw())).toEqual({
      name: '33/15',
      is_runway: true,
      end_a_name: '33',
      end_b_name: '15',
      route_path: [{ x: 50, y: 70 }, { x: 50, y: 40 }],
      notes: runwayRouteNote(rw()),
      route_category: 'aircraft',
      color: RUNWAY_ROUTE_COLOR,
    });
  });

  it('קצה ריק נשמר כ-null ולא כמחרוזת ריקה', () => {
    const f = routeFieldsFromRunway(rw({ heading_b: '' }));
    expect(f.end_b_name).toBeNull();
  });
});

describe('matchesRunway - אימוץ מסלול קיים במקום יצירת כפילות', () => {
  it('אותו שם באותו שדה', () => {
    expect(matchesRunway({ airfield_id: 3, is_runway: true, name: '33/15' }, rw())).toBe(true);
  });

  it('שם שונה אבל אותם שני קצוות - זה אותו מסלול פיזי', () => {
    expect(matchesRunway({ airfield_id: 3, is_runway: true, name: 'הראשי', end_a_name: '33', end_b_name: '15' }, rw())).toBe(true);
  });

  it('קצה אחד בלבד תואם - לא מספיק', () => {
    expect(matchesRunway({ airfield_id: 3, is_runway: true, name: 'הראשי', end_a_name: '33', end_b_name: '09' }, rw())).toBe(false);
  });

  it('שדה אחר - לעולם לא', () => {
    expect(matchesRunway({ airfield_id: 4, is_runway: true, name: '33/15' }, rw())).toBe(false);
  });

  it('מסלול הסעה (לא המראה) אינו מועמד לאימוץ', () => {
    expect(matchesRunway({ airfield_id: 3, is_runway: false, name: '33/15' }, rw())).toBe(false);
  });

  it('מסלול שכבר משויך למסלול המראה אחר אינו מועמד', () => {
    expect(matchesRunway({ airfield_id: 3, is_runway: true, name: '33/15', source_runway_id: 9 }, rw())).toBe(false);
  });
});
