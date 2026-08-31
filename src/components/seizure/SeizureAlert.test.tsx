import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SeizureAlertCard } from './SeizureAlert';
import { SEIZURE_COVERAGE_COLOR } from '../../utils/tempZoneSeizure';
import type { TempZoneSeizure } from '../../types';

// ההתראה המתפרצת היא **פקד בטיחותי**, ולכן מה שנבדק כאן אינו העיצוב אלא
// ההתחייבויות שאסור לשבור בשקט:
//   1. במצב `incoming` אין שום דרך לסגור מלבד אישור - אין ✕ ואין "בטל".
//   2. מה שהפקח חייב לראות מופיע: מי יצר, אילו גבהים, אילו אזורים אצלו, ואילו
//      פ"מים צריכים טיפול.
//   3. עמדה בלי מפה מעוגנת מקבלת "פתח מפה" במקום רשימת אזורים שאין לה.
// אלה בדיוק הדברים שרפקטור עתידי יכול להסיר בלי ש-tsc יגיד מילה.

const SEIZURE: TempZoneSeizure = {
  id: 7,
  name: 'תפיסת מרחב מזרח',
  purpose: 'ניסוי',
  color: '#f97316',
  alt_min: 100, alt_max: 140,
  polygon_geo: [], polygon: [],
  creator_preset_id: 1,
  creator_preset_name: 'בקרה מרכז',
  creator_map_id: 1,
  phone: '03-1234567', radio: '132.5', note: 'הערה חופשית',
  eta_end: null, to_all: false, status: 'active',
  created_at: '2026-08-31T08:00:00.000Z', ended_at: null,
};

const ZONES = [
  { name: 'צפון', coverage: 'full' as const },
  { name: 'מרכז', coverage: 'partial' as const },
];
const PINS = [{ key: '11', callsign: 'ע321', zoneName: 'צפון', altFl: 120 }];

/** `renderToStaticMarkup` בורח מגרשיים. בלי זה `not.toContain` על טקסט שיש בו
 *  גרשיים היה עובר תמיד - בדיקה שמאשרת את עצמה. */
const esc = (t: string) => t.replace(/"/g, '&quot;');
const render = (over: Partial<React.ComponentProps<typeof SeizureAlertCard>> = {}) =>
  renderToStaticMarkup(
    <SeizureAlertCard
      variant="incoming" seizure={SEIZURE} zones={ZONES} pins={PINS}
      hasAnchoredMap themeMode="dark"
      {...over}
    />
  );

describe('SeizureAlert - התראה נכנסת', () => {
  it('אין ✕ ואין "בטל" - רק אישור סוגר התראה בטיחותית', () => {
    const html = render();
    expect(html).not.toContain('✕');
    expect(html).not.toContain('בטל');
    expect(html).toContain('אישור');
  });

  it('מציגה את המכלול היוצר, הגבהים, הטלפון והקש"פ', () => {
    const html = render();
    expect(html).toContain('בקרה מרכז');
    expect(html).toContain('100-140');
    expect(html).toContain('03-1234567');
    expect(html).toContain('132.5');
    expect(html).toContain('הערה חופשית');
  });

  it('טווח ריק נקרא "כל הגבהים" ולא נשאר ריק', () => {
    const html = render({ seizure: { ...SEIZURE, alt_min: null, alt_max: null } });
    expect(html).toContain('כל הגבהים');
  });

  it('האזורים המוגבלים מופיעים, כל אחד בצבע הדרגה שלו', () => {
    const html = render();
    expect(html).toContain('צפון');
    expect(html).toContain('מרכז');
    expect(html).toContain(SEIZURE_COVERAGE_COLOR.full);
    expect(html).toContain(SEIZURE_COVERAGE_COLOR.partial);
  });

  it('בלי אזורים מושפעים - נאמר במפורש ולא נשאר ריק', () => {
    const html = render({ zones: [] });
    expect(html).toContain('אין אזורים מוגבלים בעמדה זו');
  });

  it('רשימת הפ"מים לטיפול מופיעה עם האו"ק והגובה', () => {
    const html = render();
    expect(html).toContain('ע321');
    expect(html).toContain('120');
  });

  it('בלי פ"מים - נאמר במפורש', () => {
    expect(render({ pins: [] })).toContain(esc('אין פ"מים באזורים המוגבלים'));
  });

  it('שדה הערה לאישור קיים', () => {
    expect(render()).toContain('הערה (רשות)');
  });

  it('מונה התראות ממתינות מוצג רק כשיש עוד בתור', () => {
    expect(render({ queued: 2 })).toContain('+2');
    expect(render({ queued: 0 })).not.toContain('+0');
  });
});

describe('SeizureAlert - עמדה בלי מפה מעוגנת', () => {
  it('מקבלת "פתח מפה" במקום רשימת אזורים שאין לה', () => {
    const html = render({ hasAnchoredMap: false });
    expect(html).toContain('פתח מפה');
    expect(html).not.toContain('אזורים מוגבלים אצלי');
  });

  it('ועדיין רואה את כל שאר המידע - זו אותה התראה', () => {
    const html = render({ hasAnchoredMap: false });
    expect(html).toContain('בקרה מרכז');
    expect(html).toContain('100-140');
    expect(html).toContain('אישור');
  });
});

describe('SeizureAlert - יצאה מתוקף', () => {
  const ended = () => render({ variant: 'ended', seizure: { ...SEIZURE, status: 'ended' } });

  it('אומרת שהמרחב שוחרר', () => {
    expect(ended()).toContain('המרחב שוחרר');
  });

  it('אינה מבקשת לטפל בפ"מים - אין במה לטפל יותר', () => {
    const html = ended();
    expect(html).not.toContain(esc('פ"מים שצריך לטפל בהם'));
    expect(html).not.toContain('הערה (רשות)');
  });
});

describe('SeizureAlert - חלף זמן הסיום (לעמדה היוצרת)', () => {
  const overdue = () => render({ variant: 'overdue' });

  it('שואלת אם לסיים או להאריך', () => {
    const html = overdue();
    expect(html).toContain('לסיים את ההלאמה או להאריך אותה?');
    expect(html).toContain('סיים הלאמה');
  });

  it('מציעה הארכה בלחיצה אחת - בלי להקליד שעה באמצע אירוע', () => {
    const html = overdue();
    for (const m of [15, 30, 60]) expect(html).toContain(String(m));
  });

  it('אינה מציגה אישור עמדה - זו אינה התראה שהתקבלה', () => {
    expect(overdue()).not.toContain('ראיתי את ההגבלה');
  });
});

describe('SeizureAlert - שלוש התמות', () => {
  for (const theme of ['dark', 'light', 'ocean'] as const) {
    it(`נצבעת ב-${theme} בלי לרשת צבע מתמה אחרת`, () => {
      const html = render({ themeMode: theme });
      expect(html).toContain('תפיסת מרחב מזרח');
      // רקע הפאנל נקבע במפורש - חלון שקוף היה יורש את רקע המסך שמתחתיו
      expect(html).toMatch(/background:[^;"]*#/);
    });
  }
});
