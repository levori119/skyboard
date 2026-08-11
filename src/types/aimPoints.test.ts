import { describe, it, expect } from 'vitest';
import {
  AIM_POINT_COLUMNS, AIM_POINT_COLUMN_BY_FIELD, EMPTY_AIM_POINT,
  toAimPoint, toAimPoints, isEmptyAimPoint, normalizeCoord, isValidCoord,
  coordToLatLon, fuzeMs, invalidAimPointFields, formatAimPointSummary,
  parseAimPointsCell, formatAimPointsCell,
  type AimPoint,
} from './aimPoints';

import { STRIP_FIELD_DEFS } from './stripFields';
import { CLASSIC_STRIP_FIELDS } from './stripGrid';
import { Q_FIELDS } from '../utils/queryBuilder';

const ap = (over: Partial<AimPoint> = {}): AimPoint => ({ ...EMPTY_AIM_POINT, ...over });

describe('שילוב בקטלוגי השדות', () => {
  const catalogs: [string, { key: string }[]][] = [
    ['STRIP_FIELD_DEFS (בורר עמודות מוד טבלה)', STRIP_FIELD_DEFS],
    ['CLASSIC_STRIP_FIELDS (פ"מ קלאסי)', CLASSIC_STRIP_FIELDS],
    ['Q_FIELDS (בונה שאילתות)', Q_FIELDS],
  ];

  it.each(catalogs)('%s - אין מפתח כפול, ולכן שדה קיים לא נחטף', (_name, catalog) => {
    const keys = catalog.map(f => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(catalogs)('%s - כל 12 שדות נקודות המכוון נבחרים', (_name, catalog) => {
    const keys = new Set(catalog.map(f => f.key));
    expect(keys.has('aim_points')).toBe(true);
    for (const col of AIM_POINT_COLUMNS) expect(keys.has(col.fieldKey)).toBe(true);
  });

  it('השדה המצרפי ניתן לעריכה בבורר, והשדות הפרטניים לקריאה בלבד', () => {
    const byKey = new Map(STRIP_FIELD_DEFS.map(f => [f.key, f]));
    expect(byKey.get('aim_points')!.editableOptions).toContain('keyboard');
    for (const col of AIM_POINT_COLUMNS) {
      expect(byKey.get(col.fieldKey)!.editableOptions).toEqual(['none']);
    }
  });
});

describe('קטלוג העמודות', () => {
  it('מכיל את 11 השדות שהוגדרו, בלי כפילות מפתח', () => {
    expect(AIM_POINT_COLUMNS).toHaveLength(11);
    expect(new Set(AIM_POINT_COLUMNS.map(c => c.key)).size).toBe(11);
    expect(new Set(AIM_POINT_COLUMNS.map(c => c.fieldKey)).size).toBe(11);
  });

  it('כל עמודה נגישה לפי מפתח השדה של מוד הטבלה', () => {
    expect(AIM_POINT_COLUMN_BY_FIELD['aim_coord'].key).toBe('coord');
    expect(AIM_POINT_COLUMN_BY_FIELD['aim_bombs'].key).toBe('bombs');
    expect(AIM_POINT_COLUMN_BY_FIELD['aim_target_name'].key).toBe('name');
  });

  it('כל מפתח בשורה מיוצג בקטלוג - שדה לא נשכח בעורך', () => {
    expect(AIM_POINT_COLUMNS.map(c => c.key).sort()).toEqual(Object.keys(EMPTY_AIM_POINT).sort());
  });
});

describe('toAimPoint - תאימות לאחור', () => {
  it('שורה ישנה בת שני שדות נטענת מלאה, בלי undefined', () => {
    const old = toAimPoint({ name: 'אלפא', aim_point: 'א1' });
    expect(old.name).toBe('אלפא');
    expect(old.aim_point).toBe('א1');
    expect(old.coord).toBe('');
    expect(old.bombs).toBe('');
    expect(Object.values(old).every(v => typeof v === 'string')).toBe(true);
  });

  it('מספר שנשמר כמספר נקרא כמחרוזת', () => {
    expect(toAimPoint({ alt_ft: 12000, bombs: 2 }).alt_ft).toBe('12000');
    expect(toAimPoint({ alt_ft: 12000, bombs: 2 }).bombs).toBe('2');
  });

  it('null/undefined הופכים למחרוזת ריקה ולא ל-"null"', () => {
    expect(toAimPoint({ note: null, hd: undefined }).note).toBe('');
    expect(toAimPoint({ note: null, hd: undefined }).hd).toBe('');
  });

  it('ערך שאינו מערך מחזיר טבלה ריקה', () => {
    expect(toAimPoints(null)).toEqual([]);
    expect(toAimPoints('לא מערך')).toEqual([]);
    expect(toAimPoints([{ name: 'א' }])).toHaveLength(1);
  });
});

describe('isEmptyAimPoint', () => {
  it('שורה ריקה - כן; שורה עם רווחים בלבד - כן', () => {
    expect(isEmptyAimPoint(EMPTY_AIM_POINT)).toBe(true);
    expect(isEmptyAimPoint(ap({ note: '   ' }))).toBe(true);
  });
  it('שדה כלשהו מלא - לא ריקה', () => {
    expect(isEmptyAimPoint(ap({ bombs: '2' }))).toBe(false);
  });
});

describe('normalizeCoord', () => {
  it('17 ספרות רצופות מסודרות לפורמט', () => {
    expect(normalizeCoord('32124500034568200')).toBe('N3212.4500/E03456.8200');
  });

  it('נ"צ תקין נשאר כמות שהוא', () => {
    expect(normalizeCoord('N3212.4500/E03456.8200')).toBe('N3212.4500/E03456.8200');
  });

  it('מפרידים ורווחים חופשיים מתנקים', () => {
    expect(normalizeCoord('n 3212 4500 / e 03456 8200')).toBe('N3212.4500/E03456.8200');
  });

  it('חצי הדרומי/מערבי נשמר', () => {
    expect(normalizeCoord('S3212.4500/W03456.8200')).toBe('S3212.4500/W03456.8200');
  });

  it('הקלדה באמצע (פחות מ-17 ספרות) חוזרת כמות שהיא ולא נמחקת', () => {
    expect(normalizeCoord('N3212.45')).toBe('N3212.45');
    expect(normalizeCoord('321245')).toBe('321245');
  });

  it('ריק נשאר ריק', () => {
    expect(normalizeCoord('')).toBe('');
    expect(normalizeCoord('   ')).toBe('');
  });
});

describe('isValidCoord', () => {
  it('ריק תקין - שורה יכולה להיות חלקית בזמן מילוי', () => {
    expect(isValidCoord('')).toBe(true);
  });

  it('פורמט מלא תקין', () => {
    expect(isValidCoord('N3212.4500/E03456.8200')).toBe(true);
  });

  it('מספר ספרות שגוי נפסל', () => {
    expect(isValidCoord('N321.4500/E03456.8200')).toBe(false);
    expect(isValidCoord('N3212.450/E03456.8200')).toBe(false);
    expect(isValidCoord('N3212.4500/E3456.8200')).toBe(false);
  });

  it('דקות מעל 59 נפסלות', () => {
    expect(isValidCoord('N3260.4500/E03456.8200')).toBe(false);
    expect(isValidCoord('N3212.4500/E03460.8200')).toBe(false);
  });

  it('מעלות מחוץ לתחום נפסלות', () => {
    expect(isValidCoord('N9112.4500/E03456.8200')).toBe(false);
    expect(isValidCoord('N3212.4500/E18156.8200')).toBe(false);
  });

  it('בלי מפריד או בלי אותיות - נפסל', () => {
    expect(isValidCoord('32124500034568200')).toBe(false);
    expect(isValidCoord('N3212.4500 E03456.8200')).toBe(false);
  });
});

describe('coordToLatLon', () => {
  it('ממיר מעלות+דקות למעלות עשרוניות', () => {
    const r = coordToLatLon('N3212.4500/E03456.8200')!;
    expect(r.lat).toBeCloseTo(32 + 12.45 / 60, 6);
    expect(r.lon).toBeCloseTo(34 + 56.82 / 60, 6);
  });

  it('דרום/מערב שליליים', () => {
    const r = coordToLatLon('S3212.4500/W03456.8200')!;
    expect(r.lat).toBeLessThan(0);
    expect(r.lon).toBeLessThan(0);
  });

  it('נ"צ לא תקין מחזיר null', () => {
    expect(coordToLatLon('')).toBeNull();
    expect(coordToLatLon('N3260.4500/E03456.8200')).toBeNull();
  });
});

describe('fuzeMs - 0.02 שניות הן 20 מ"ש', () => {
  it('ממיר שניות למילי-שניות', () => {
    expect(fuzeMs('0.02')).toBe(20);
    expect(fuzeMs('0.1')).toBe(100);
    expect(fuzeMs('1')).toBe(1000);
  });
  it('ריק או לא-מספר מחזיר null', () => {
    expect(fuzeMs('')).toBeNull();
    expect(fuzeMs('מיידי')).toBeNull();
  });
});

describe('invalidAimPointFields', () => {
  it('שורה תקינה - אין שגיאות', () => {
    expect(invalidAimPointFields(ap({
      coord: 'N3212.4500/E03456.8200', alt_ft: '12000', hd: '270',
      an: '45', an_min: '30', fuze: '0.02', bombs: '2',
    })).size).toBe(0);
  });

  it('שורה ריקה תקינה - לא מציפים שגיאות על שורה שרק נפתחה', () => {
    expect(invalidAimPointFields(EMPTY_AIM_POINT).size).toBe(0);
  });

  it('נ"צ פגום מסומן', () => {
    expect(invalidAimPointFields(ap({ coord: 'N32.45/E34' })).has('coord')).toBe(true);
  });

  it('כיוון וזוויות מחוץ לתחום מסומנים', () => {
    expect(invalidAimPointFields(ap({ hd: '400' })).has('hd')).toBe(true);
    expect(invalidAimPointFields(ap({ an: '120' })).has('an')).toBe(true);
    expect(invalidAimPointFields(ap({ an_min: '-5' })).has('an_min')).toBe(true);
    expect(invalidAimPointFields(ap({ hd: '360' })).has('hd')).toBe(false);
  });

  it('טקסט בשדה מספרי מסומן', () => {
    expect(invalidAimPointFields(ap({ alt_ft: 'גבוה' })).has('alt_ft')).toBe(true);
    expect(invalidAimPointFields(ap({ bombs: 'שתיים' })).has('bombs')).toBe(true);
  });
});

describe('ייבוא/ייצוא מקובץ', () => {
  it('הפורמט הקצר הישן נקרא כמו שהוא - תאימות לאחור לקבצים קיימים', () => {
    const rows = parseAimPointsCell('אלפא:א1; ברווז:ב2');
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('אלפא');
    expect(rows[0].aim_point).toBe('א1');
    expect(rows[0].coord).toBe('');
    expect(rows[1].name).toBe('ברווז');
  });

  it('הפורמט המלא נקרא לכל 11 השדות לפי הסדר', () => {
    const r = parseAimPointsCell('אלפא:א1:N3212.4500/E03456.8200:12000:270:45:30:0.02:MK84:2:הערה')[0];
    expect(r.coord).toBe('N3212.4500/E03456.8200');
    expect(r.alt_ft).toBe('12000');
    expect(r.hd).toBe('270');
    expect(r.an).toBe('45');
    expect(r.an_min).toBe('30');
    expect(r.fuze).toBe('0.02');
    expect(r.armament).toBe('MK84');
    expect(r.bombs).toBe('2');
    expect(r.note).toBe('הערה');
  });

  it('שורה חלקית ממלאת ריק בשדות שלא נמסרו', () => {
    const r = parseAimPointsCell('אלפא:א1:N3212.4500/E03456.8200')[0];
    expect(r.coord).toBe('N3212.4500/E03456.8200');
    expect(r.bombs).toBe('');
    expect(r.note).toBe('');
  });

  it('תא ריק מחזיר טבלה ריקה', () => {
    expect(parseAimPointsCell('')).toEqual([]);
    expect(parseAimPointsCell('   ')).toEqual([]);
    expect(parseAimPointsCell(';;')).toEqual([]);
  });

  it('ייצוא וייבוא הם הפוכים זה לזה', () => {
    const rows = [
      ap({ name: 'אלפא', aim_point: 'א1', coord: 'N3212.4500/E03456.8200', alt_ft: '12000', hd: '270', an: '45', an_min: '30', fuze: '0.02', armament: 'MK84', bombs: '2', note: 'הערה' }),
      ap({ name: 'ברווז', aim_point: 'ב2' }),
    ];
    expect(parseAimPointsCell(formatAimPointsCell(rows))).toEqual(rows);
  });

  it('ייצוא מדלג על שורות ריקות', () => {
    expect(formatAimPointsCell([EMPTY_AIM_POINT, ap({ name: 'אלפא', aim_point: 'א1' })])).toBe('אלפא:א1');
  });
});

describe('formatAimPointSummary', () => {
  it('מרכיב שורת תקציר מהשדות המלאים בלבד', () => {
    expect(formatAimPointSummary(ap({
      name: 'אלפא', aim_point: 'א1', coord: 'N3212.4500/E03456.8200',
      alt_ft: '12000', hd: '270', an: '45', armament: 'MK84', bombs: '2',
    }))).toBe("אלפא · א1 · N3212.4500/E03456.8200 · 12000' · HD270 · AN45 · MK84 ×2");
  });

  it('שורה חלקית לא מייצרת מפרידים ריקים', () => {
    expect(formatAimPointSummary(ap({ name: 'אלפא', aim_point: 'א1' }))).toBe('אלפא · א1');
  });

  it('שורה ריקה מחזירה מחרוזת ריקה', () => {
    expect(formatAimPointSummary(EMPTY_AIM_POINT)).toBe('');
  });
});
