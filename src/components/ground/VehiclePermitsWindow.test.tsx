// מקבע שלוש תקלות תצוגה שדווחו מהשטח על חלון ניהול הרכבים:
//
//   1. שדות התאריך נראו כטקסט חופשי - בורר התאריכים של הדפדפן מצויר לפי
//      `color-scheme`, ובלעדיו סמל הלוח נבלע ברקע הכהה ואין במה ללחוץ.
//   2. שורת הוספת רכב יצאה מדורגת - `input` ו-`select` מקבלים מהדפדפן גבהים
//      פנימיים שונים, ורמז שיושב בתוך תא רשת מגביה אותו מול שכניו.
//   3. החלון היה צר מדי - זה חלון ניהול שעובדים בו, לא תג מצב שמציץ מהצד.
//
// אין jsdom בפרויקט, ולכן הבדיקה על ה-HTML שנוצר בשרת. הטופס עצמו נפתח רק
// אחרי בחירת נהג - שאי אפשר ללחוץ עליה כאן - ולכן שורת הוספת הרכב מרונדרת
// **ישירות** דרך `VehiclesSection`, וסגנונות הטופס נבדקים דרך `formStyles`
// שהיא המקור היחיד שלהם בקוד עצמו.
//
// ⚠ `renderToStaticMarkup` בורח מגרשיים, ולכן `not.toContain` עם גרשיים
// **עובר תמיד** - כאן בודקים רק נוכחות, לעולם לא היעדר מחרוזת עם גרשיים.

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import VehiclePermitsWindow, {
  CTRL_H, WINDOW_SIZE, VehiclesSection, formStyles, palette,
  type PermitDriver, type PermitParam, type ThemeMode,
} from './VehiclePermitsWindow';

vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })));

const THEMES: ThemeMode[] = ['light', 'dark', 'ocean'];
const styles = (t: ThemeMode) => formStyles(palette(t), t);

const DRIVER: PermitDriver = {
  id: 1, airfield_id: 1, first_name: 'דני', last_name: 'כהן', national_id: '012345678',
  transport_role_id: null, transport_role_name: null, permit_from: '2026-01-01',
  permit_until: '2026-12-31', status_override: null, notes: '', approved_by: '',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  vehicles: [], zones: [],
};
const TYPES: PermitParam[] = [
  { id: 10, kind: 'vehicle_type', name: 'מיניבוס', polygon_id: null, color: '#3b82f6', active: true, sort_order: 0 },
];

/** שורת הוספת הרכב, מרונדרת ישירות - זו השורה שדווחה כמדורגת */
const addVehicleRow = (themeMode: ThemeMode = 'dark', vehicleTypes = TYPES) => {
  const C = palette(themeMode);
  const st = styles(themeMode);
  return renderToStaticMarkup(
    <VehiclesSection
      driver={DRIVER} vehicleTypes={vehicleTypes} C={C}
      inputStyle={st.inputStyle} dateStyle={st.dateStyle} labelStyle={st.labelStyle}
      sectionStyle={st.sectionStyle} btn={st.btn}
      adding setAdding={() => {}} onChanged={() => {}}
    />
  );
};

/** כל ערכי `height` שב-inline style של פקדי הטופס */
const controlHeights = (html: string) =>
  [...html.matchAll(/<(?:input|select|button)[^>]*style="([^"]*)"/g)]
    .map(m => /(?:^|;)\s*height:\s*([^;]+)/.exec(m[1])?.[1]?.trim())
    .filter(Boolean) as string[];

describe('שדות תאריך - רכיב תאריך, לא טקסט חופשי', () => {
  it('נושאים color-scheme, אחרת בורר התאריכים נבלע ברקע', () => {
    for (const t of THEMES) expect(styles(t).dateStyle.colorScheme).toBeTruthy();
  });

  it('בהיר באור בלבד - ocean היא תמה כהה ולכן מקבלת dark', () => {
    expect(styles('light').dateStyle.colorScheme).toBe('light');
    expect(styles('dark').dateStyle.colorScheme).toBe('dark');
    expect(styles('ocean').dateStyle.colorScheme).toBe('dark');
  });

  it('נקראים משמאל לימין גם בעברית', () => {
    for (const t of THEMES) expect(styles(t).dateStyle.direction).toBe('ltr');
  });

  it('בגובה הפקדים - שדה תאריך גבוה מטקסט רגיל אם לא מקבעים', () => {
    for (const t of THEMES) expect(styles(t).dateStyle.height).toBe(CTRL_H);
  });
});

describe('גובה אחיד לשורת טופס', () => {
  it('לכל פקד גובה מפורש, ולכולם אותו גובה', () => {
    const heights = controlHeights(addVehicleRow());
    expect(heights.length, 'לא נמצאו פקדים בשורת הוספת הרכב').toBeGreaterThan(3);
    const unique = [...new Set(heights)];
    expect(unique, `נמצאו גבהים שונים: ${unique.join(', ')}`).toEqual([`${CTRL_H}px`]);
  });

  it('הכפתור בשורה בגובה השדות ולא נמוך מהם', () => {
    const html = addVehicleRow();
    const button = /<button[^>]*style="([^"]*)"/.exec(html)?.[1] || '';
    expect(button).toContain(`height:${CTRL_H}px`);
  });

  it('הרמז על היעדר סוגי רכב אינו מגביה תא ברשת', () => {
    // זו הייתה הסיבה לשורה המדורגת: הרמז ישב בתוך התא הראשון
    const withHint = addVehicleRow('dark', []);
    const withoutHint = addVehicleRow('dark', TYPES);
    expect(withHint).toContain('לא הוגדרו סוגי רכב');
    // הרשת עצמה זהה בשני המקרים - הרמז יושב מחוץ לה
    const grid = (h: string) => /<div style="display:grid[^"]*"/.exec(h)?.[0];
    expect(grid(withHint)).toBe(grid(withoutHint));
    expect(controlHeights(withHint)).toEqual(controlHeights(withoutHint));
  });

  it('תווית בגובה קבוע, כדי שתאי הרשת יתחילו באותו קו', () => {
    for (const t of THEMES) expect(styles(t).labelStyle.height).toBe(13);
  });

  it('תיבת ההערה פטורה מהגובה הקבוע', () => {
    expect(styles('dark').areaStyle.height).toBe('auto');
  });
});

describe('גודל החלון', () => {
  it('נפרס על כמעט כל המסך', () => {
    const html = renderToStaticMarkup(
      <VehiclePermitsWindow airfieldId={1} themeMode="dark" onClose={() => {}} />
    );
    expect(html).toContain('width:calc(96vw / var(--s, 1))');
    expect(html).toContain('height:calc(94vh / var(--s, 1))');
  });

  it('כל יחידת חלון מחולקת ב---s, אחרת החלון גולש מהמסך ב-24 אינץ׳', () => {
    // #root תחת `zoom: var(--s)` מכפיל גם vw/vh (/ui-adapt §מלכודת ה-vw/vh)
    for (const v of [WINDOW_SIZE.width, WINDOW_SIZE.height]) {
      expect(v).toMatch(/^calc\([\d.]+v[wh] \/ var\(--s, 1\)\)$/);
    }
    const html = renderToStaticMarkup(
      <VehiclePermitsWindow airfieldId={1} themeMode="dark" onClose={() => {}} />
    );
    for (const m of html.matchAll(/[\d.]+v[wh]/g)) {
      const at = m.index ?? 0;
      const around = html.slice(Math.max(0, at - 60), at + 40);
      expect(around, `יחידת חלון בלי חלוקה ב---s: ${around}`).toContain('calc(');
    }
  });
});
