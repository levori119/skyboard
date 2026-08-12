import { describe, it, expect } from 'vitest';
import {
  AIM_POINT_COLUMNS, AIM_POINT_COLUMN_BY_FIELD, EMPTY_AIM_POINT,
  toAimPoint, toAimPoints, isEmptyAimPoint, normalizeCoord, isValidCoord,
  coordToLatLon, fuzeMs, invalidAimPointFields, formatAimPointSummary,
  parseAimPointsCell, formatAimPointsCell, toAimFlag, aimFieldText,
  AIM_POINT_FLAG_KEYS,
  type AimPoint,
} from './aimPoints';
import { STRIP_SUB_TABLES, getSubTable, isSubTableColumn, defaultSubTableColumns, subTableAccent } from './subTables';

import { STRIP_FIELD_DEFS } from './stripFields';
import { CLASSIC_STRIP_FIELDS, AIM_POINTS_SUMMARY_FIELD_KEY } from './stripGrid';
import { Q_FIELDS } from '../utils/queryBuilder';

const ap = (over: Partial<AimPoint> = {}): AimPoint => ({ ...EMPTY_AIM_POINT, ...over });

describe('שילוב בקטלוגים', () => {
  const catalogs: [string, { key: string }[]][] = [
    ['STRIP_FIELD_DEFS', STRIP_FIELD_DEFS],
    ['CLASSIC_STRIP_FIELDS', CLASSIC_STRIP_FIELDS],
    ['Q_FIELDS', Q_FIELDS],
  ];

  it.each(catalogs)('%s - אין מפתח כפול', (_name, catalog) => {
    const keys = catalog.map(f => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('שדות נקודות המכוון **אינם** בבורר השדות של הפ"מ - הם נוספים דרך "הוסף טבלה"', () => {
    const keys = STRIP_FIELD_DEFS.map(f => f.key);
    expect(keys).not.toContain('aim_points');
    for (const col of AIM_POINT_COLUMNS) expect(keys).not.toContain(col.fieldKey);
  });

  it('בפ"מ הקלאסי: טבלה או שורת תקציר - ולא 15 שדות פרטניים', () => {
    const keys = CLASSIC_STRIP_FIELDS.map(f => f.key);
    expect(keys).toContain('aim_points');            // התא נפרס לטבלה
    expect(keys).toContain('aim_points_summary');    // תא צר - שורה אחת
    for (const col of AIM_POINT_COLUMNS) expect(keys).not.toContain(col.fieldKey);
  });

  it('מפתח טבלת הבן בפ"מ הקלאסי מזוהה ברישום, ומפתח התקציר לא', () => {
    expect(getSubTable('aim_points')).toBeTruthy();
    expect(getSubTable(AIM_POINTS_SUMMARY_FIELD_KEY)).toBeNull();
  });

  it('בבונה השאילתות השדות הפרטניים נשארים - סינון לפי דגל או נ"צ', () => {
    const keys = Q_FIELDS.map(f => f.key);
    expect(keys).toContain('aim_points');
    for (const col of AIM_POINT_COLUMNS) expect(keys).toContain(col.fieldKey);
  });
});

describe('רישום טבלאות הבן של הפ"מ', () => {
  it('נקודות מכוון רשומה, ומצביעה על strips.targets', () => {
    const t = getSubTable('aim_points')!;
    expect(t).toBeTruthy();
    expect(t.stripField).toBe('targets');
    expect(t.columns).toHaveLength(AIM_POINT_COLUMNS.length);
  });

  it('כל טבלה ברישום בעלת מפתח ייחודי', () => {
    const keys = STRIP_SUB_TABLES.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('דגל נערך במתג, שדה רגיל במקלדת', () => {
    const t = getSubTable('aim_points')!;
    expect(t.columns.find(c => c.key === 'abort_attack')!.editableOptions).toEqual(['none', 'toggle']);
    expect(t.columns.find(c => c.key === 'coord')!.editableOptions).toEqual(['none', 'keyboard']);
  });

  it('isSubTableColumn מזהה רק עמודת טבלה מוכרת', () => {
    expect(isSubTableColumn({ isTable: true, tableKey: 'aim_points' })).toBe(true);
    expect(isSubTableColumn({ isTable: true, tableKey: 'nope' })).toBe(false);
    expect(isSubTableColumn({ tableKey: 'aim_points' })).toBe(false);
    expect(isSubTableColumn(null)).toBe(false);
  });

  it('צבע הזיהוי כהה באור ובהיר בכהה - ניגודיות מול הרקע', () => {
    // תורכיז בהיר על רקע בהיר יורד מתחת ל-3:1; באור נלקח הכהה
    expect(subTableAccent('light')).toBe('#0e7490');
    expect(subTableAccent('dark')).toBe('#22d3ee');
    expect(subTableAccent('ocean')).toBe('#22d3ee');
  });

  it('ברירת המחדל היא תת-קבוצה מזהה, ולא כל העמודות', () => {
    const cols = defaultSubTableColumns('aim_points');
    expect(cols.map(c => c.key)).toEqual(['name', 'aim_point', 'coord', 'alt_ft']);
    expect(cols.every(c => c.editable === 'none')).toBe(true);
    expect(defaultSubTableColumns('nope')).toEqual([]);
  });
});

describe('דגלים', () => {
  it('toAimFlag: ברירת המחדל היא false - ערך שלא הוכרע אינו אישור', () => {
    expect(toAimFlag(undefined)).toBe(false);
    expect(toAimFlag(null)).toBe(false);
    expect(toAimFlag('')).toBe(false);
    expect(toAimFlag('לא')).toBe(false);
    expect(toAimFlag({})).toBe(false);
  });

  it('toAimFlag: קורא בוליאני, מספר ומחרוזות נפוצות', () => {
    expect(toAimFlag(true)).toBe(true);
    expect(toAimFlag(1)).toBe(true);
    expect(toAimFlag(0)).toBe(false);
    expect(toAimFlag('true')).toBe(true);
    expect(toAimFlag('1')).toBe(true);
    expect(toAimFlag('כן')).toBe(true);
    expect(toAimFlag('false')).toBe(false);
  });

  it('"false" כמחרוזת אינו מאשר תקיפה', () => {
    expect(toAimPoint({ abort_attack: 'false' }).abort_attack).toBe(false);
    expect(toAimPoint({ air_verified: 'false' }).air_verified).toBe(false);
  });

  it('שורה שכל דגליה כבויים עדיין נחשבת ריקה', () => {
    expect(isEmptyAimPoint(toAimPoint({}))).toBe(true);
    expect(isEmptyAimPoint(ap({ abort_attack: true }))).toBe(false);
  });

  it('aimFieldText מציג ✓ ולא "false"', () => {
    expect(aimFieldText(ap({ air_verified: true }), 'air_verified')).toBe('✓');
    expect(aimFieldText(ap({ air_verified: false }), 'air_verified')).toBe('');
    expect(aimFieldText(ap({ coord: 'N3212.4500/E03456.8200' }), 'coord')).toBe('N3212.4500/E03456.8200');
  });

  it('"עצור תקיפה" מופיע ראשון ובולט בשורת התקציר', () => {
    const sum = formatAimPointSummary(ap({ name: 'אלפא', abort_attack: true }));
    expect(sum.startsWith('⛔ עצור תקיפה')).toBe(true);
  });

  it('דגלים דלוקים מופיעים בתקציר, וכבויים לא', () => {
    const sum = formatAimPointSummary(ap({ name: 'אלפא', air_verified: true, ground_verified: false }));
    expect(sum).toContain('מאומת אווירי');
    expect(sum).not.toContain('מאומת קרקעי');
  });
});

describe('toAimPoint - תאימות לאחור', () => {
  it('שורה ישנה בת שני שדות נטענת מלאה, בלי undefined', () => {
    const old = toAimPoint({ name: 'אלפא', aim_point: 'א1' });
    expect(old.name).toBe('אלפא');
    expect(old.aim_point).toBe('א1');
    expect(old.coord).toBe('');
    expect(old.bombs).toBe('');
    // אין `undefined` בשום שדה: טקסט הוא מחרוזת ריקה, דגל הוא false
    for (const col of AIM_POINT_COLUMNS) {
      expect(typeof old[col.key]).toBe(col.kind === 'flag' ? 'boolean' : 'string');
    }
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

  it('דגלים מיוצאים כ-1/ריק ונקראים חזרה', () => {
    const rows = [ap({ name: 'אלפא', aim_point: 'א1', air_verified: true, abort_attack: false, ground_verified: true })];
    expect(parseAimPointsCell(formatAimPointsCell(rows))).toEqual(rows);
  });

  it('הפורמט הישן בלי דגלים נטען עם דגלים כבויים', () => {
    const r = parseAimPointsCell('אלפא:א1')[0];
    expect(r.air_verified).toBe(false);
    expect(r.abort_attack).toBe(false);
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
