import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SeizureDetails from './SeizureDetails';
import type { TempZoneSeizure } from '../../types';

// חלון הפרטים הוא הדרך היחידה לשאול מרחב שעל המפה "מה אתה" אחרי שההתראה
// אושרה, ולעמדה היוצרת הוא גם הדרך חזרה לטופס אישורי העמדות. מה שנבדק כאן:
// שהמידע התפעולי באמת מוצג (למי מתקשרים, עד מתי), ושפקדי הסיום והאישורים
// שמורים ל**עמדה היוצרת** ואינם דולפים לעמדת יעד.

const SEIZURE: TempZoneSeizure = {
  id: 5, name: 'תפיסת מרחב דרום', purpose: 'ניסוי', color: '#22d3ee',
  alt_min: 80, alt_max: 120,
  polygon_geo: [], polygon: [],
  creator_preset_id: 1, creator_preset_name: 'בקרה מרכז', creator_map_id: 1,
  phone: '03-7654321', radio: '128.9', note: 'תיאום מול המגדל',
  eta_end: '2026-08-31T14:00:00.000Z', to_all: false, status: 'active',
  created_at: '2026-08-31T12:00:00.000Z', ended_at: null,
};

const noop = () => {};
const render = (over: Partial<React.ComponentProps<typeof SeizureDetails>> = {}) =>
  renderToStaticMarkup(
    <SeizureDetails
      seizure={SEIZURE} themeMode="dark" isCreator={false}
      onOpenAcks={noop} onEnd={noop} onClose={noop}
      {...over}
    />
  );

describe('SeizureDetails - המידע התפעולי', () => {
  it('מציג את מה שנדרש כדי לפעול: שם, גבהים, מי יצר, טלפון וקש"פ', () => {
    const html = render();
    expect(html).toContain('תפיסת מרחב דרום');
    expect(html).toContain('80-120');
    expect(html).toContain('בקרה מרכז');
    expect(html).toContain('03-7654321');
    expect(html).toContain('128.9');
    expect(html).toContain('תיאום מול המגדל');
  });

  it('טווח ריק נקרא "כל הגבהים"', () => {
    expect(render({ seizure: { ...SEIZURE, alt_min: null, alt_max: null } })).toContain('כל הגבהים');
  });

  it('שדה ריק אינו מייצר שורה ריקה', () => {
    const html = render({ seizure: { ...SEIZURE, purpose: '', phone: '', radio: '', note: '' } });
    expect(html).not.toContain('לטובת מה');
    expect(html).not.toContain('טלפון לבירור');
  });

  it('מציג שעון רץ מרגע ההלאמה', () => {
    expect(render()).toContain('זמן מההלאמה');
  });
});

describe('SeizureDetails - עמדה יוצרת מול עמדת יעד', () => {
  it('היוצרת מקבלת "אישורי עמדות" ו"סיים הלאמה"', () => {
    const html = render({ isCreator: true });
    expect(html).toContain('אישורי עמדות');
    expect(html).toContain('סיים הלאמה');
  });

  it('עמדת יעד אינה מקבלת אותם - היא לא מסיימת הלאמה של מישהו אחר', () => {
    const html = render({ isCreator: false });
    expect(html).not.toContain('אישורי עמדות');
    expect(html).not.toContain('סיים הלאמה');
  });

  it('עמדת יעד רואה את מצב האישור שלה', () => {
    expect(render({ seizure: { ...SEIZURE, my_acked: true } })).toContain('אישרתי');
    expect(render({ seizure: { ...SEIZURE, my_acked: false } })).toContain('טרם אושר');
  });
});

describe('SeizureDetails - שלוש התמות', () => {
  for (const theme of ['dark', 'light', 'ocean'] as const) {
    it(`נצבע ב-${theme} עם רקע מפורש`, () => {
      const html = render({ themeMode: theme });
      expect(html).toContain('תפיסת מרחב דרום');
      expect(html).toMatch(/background:[^;"]*#/);
    });
  }
});
