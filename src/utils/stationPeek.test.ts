// תצוגת עמדות אחרות בעמדה — בדיקות לפני מימוש (TDD).
// הלוגיקה הטהורה: מי מוצג (הרשאת מיראז'), באיזה סדר, באיזה גודל, ובאיזה URL.
import { describe, it, expect } from 'vitest';
import {
  PEEK_PARAM, TILE_WIDTHS, DEFAULT_TILE_IDX, PEEK_POLL_FACTOR,
  canViewStation, visibleViewStations, stationLabel,
  stepTileIdx, tileHeight, peekUrl, parsePeekPresetId, isPeekMode,
  reorderStations, peekFetchGuard, peekIntervalDelay, type ViewStation,
} from './stationPeek';

const st = (id: number, target: number, extra: Partial<ViewStation> = {}): ViewStation => ({
  id, preset_id: 1, target_preset_id: target, label: '', sort_order: id, target_name: `עמדה ${target}`, ...extra,
});

describe('canViewStation — הרשאת צפייה לפי המיראז', () => {
  it('רשימה ריקה = בלי הגבלה במיראז → מותר לצפות בכל עמדה', () => {
    expect(canViewStation(7, [])).toBe(true);
  });

  it('רשימה חסרה (undefined) = בלי הגבלה → מותר', () => {
    expect(canViewStation(7, undefined)).toBe(true);
  });

  it('העמדה ברשימת המורשות → מותר', () => {
    expect(canViewStation(7, [3, 7, 9])).toBe(true);
  });

  it('העמדה לא ברשימת המורשות → אסור', () => {
    expect(canViewStation(7, [3, 9])).toBe(false);
  });

  it('הגבלה שאף עמדה לא זוהתה בה ([-1]) → אסור לכל עמדה', () => {
    expect(canViewStation(7, [-1])).toBe(false);
  });

  it('מזהים כמחרוזות (מגיעים כך מ-JSON) → משווים מספרית', () => {
    expect(canViewStation(7, ['7' as any])).toBe(true);
  });
});

describe('visibleViewStations — אילו ריבועים מרונדרים', () => {
  const stations = [st(1, 5), st(2, 6), st(3, 7)];

  it('בלי הגבלת מיראז — כל העמדות המוגדרות', () => {
    expect(visibleViewStations(stations, []).map(s => s.target_preset_id)).toEqual([5, 6, 7]);
  });

  it('עמדה שאין לה אישור — הריבוע כלל לא מוחזר (לא מוצג נעול)', () => {
    expect(visibleViewStations(stations, [5, 7]).map(s => s.target_preset_id)).toEqual([5, 7]);
  });

  it('ממוין לפי sort_order ולא לפי סדר ההגעה מהשרת', () => {
    const shuffled = [st(3, 7, { sort_order: 0 }), st(1, 5, { sort_order: 2 }), st(2, 6, { sort_order: 1 })];
    expect(visibleViewStations(shuffled, []).map(s => s.target_preset_id)).toEqual([7, 6, 5]);
  });

  it('sort_order זהה — נשבר לפי id, כדי שהסדר יהיה יציב בין רינדורים', () => {
    const same = [st(9, 8, { sort_order: 0 }), st(4, 9, { sort_order: 0 })];
    expect(visibleViewStations(same, []).map(s => s.id)).toEqual([4, 9]);
  });

  it('רשימה ריקה/לא-מערך — מחזיר []', () => {
    expect(visibleViewStations([], [])).toEqual([]);
    expect(visibleViewStations(undefined as any, [])).toEqual([]);
  });
});

describe('stationLabel — הכיתוב על הריבוע', () => {
  it('שם תצוגה שהוגדר בניהול גובר', () => {
    expect(stationLabel(st(1, 5, { label: 'צפון 1' }))).toBe('צפון 1');
  });

  it('בלי שם תצוגה — שם העמדה הנצפית', () => {
    expect(stationLabel(st(1, 5))).toBe('עמדה 5');
  });

  it('רווחים בלבד אינם שם תצוגה', () => {
    expect(stationLabel(st(1, 5, { label: '   ' }))).toBe('עמדה 5');
  });
});

describe('גודל הריבוע — הקטנה והגדלה', () => {
  it('ברירת המחדל היא אחד הגדלים המוגדרים', () => {
    expect(TILE_WIDTHS[DEFAULT_TILE_IDX]).toBeGreaterThan(0);
  });

  it('הגדלה מקדמת שלב אחד', () => {
    expect(stepTileIdx(1, +1)).toBe(2);
  });

  it('הקטנה מחזירה שלב אחד', () => {
    expect(stepTileIdx(1, -1)).toBe(0);
  });

  it('לא יורדים מתחת לקטן ביותר', () => {
    expect(stepTileIdx(0, -1)).toBe(0);
  });

  it('לא עולים מעל הגדול ביותר', () => {
    const last = TILE_WIDTHS.length - 1;
    expect(stepTileIdx(last, +1)).toBe(last);
  });

  it('אינדקס פסול נופל לברירת המחדל', () => {
    expect(stepTileIdx(99, 0)).toBe(DEFAULT_TILE_IDX);
    expect(stepTileIdx(NaN, 0)).toBe(DEFAULT_TILE_IDX);
  });

  it('הגובה נגזר מהרוחב ביחס מסך (16:9) ומעוגל', () => {
    expect(tileHeight(160)).toBe(90);
  });
});

describe('URL של מצב צפייה', () => {
  it('בונה כתובת עם פרמטר peek', () => {
    expect(peekUrl(12)).toBe(`/?${PEEK_PARAM}=12`);
  });

  it('קורא את מזהה העמדה מה-query', () => {
    expect(parsePeekPresetId('?peek=12')).toBe(12);
    expect(parsePeekPresetId('?foo=1&peek=8')).toBe(8);
  });

  it('בלי פרמטר / ערך פסול — null (עמדה רגילה, לא מצב צפייה)', () => {
    expect(parsePeekPresetId('')).toBeNull();
    expect(parsePeekPresetId('?peek=')).toBeNull();
    expect(parsePeekPresetId('?peek=abc')).toBeNull();
    expect(parsePeekPresetId('?peek=0')).toBeNull();
    expect(parsePeekPresetId('?peek=-3')).toBeNull();
  });

  it('isPeekMode — הגארד נגד קינון: עמדה בתוך ריבוע לא מציגה סרגל משלה', () => {
    expect(isPeekMode('?peek=12')).toBe(true);
    expect(isPeekMode('')).toBe(false);
  });

  it('מיתון ביצועים — הפולינג במצב צפייה איטי מהעמדה החיה', () => {
    expect(PEEK_POLL_FACTOR).toBeGreaterThan(1);
  });
});

describe('peekFetchGuard — צפייה היא לקריאה בלבד', () => {
  const calls: any[] = [];
  const orig = async (input: any, init?: any) => { calls.push([input, init]); return { ok: true, status: 200 } as any; };
  const guarded = peekFetchGuard(orig as any);

  it('קריאת GET לשרת עוברת כרגיל — כך המסך מתעדכן בזמן אמת', async () => {
    calls.length = 0;
    const res: any = await guarded('/api/strips', { method: 'GET' });
    expect(res.ok).toBe(true);
    expect(calls.length).toBe(1);
  });

  it('fetch בלי method (ברירת מחדל GET) עובר', async () => {
    calls.length = 0;
    await guarded('/api/sectors');
    expect(calls.length).toBe(1);
  });

  it('PUT ל-API נחסם ולא מגיע לשרת', async () => {
    calls.length = 0;
    const res: any = await guarded('/api/preset-active-crew/5', { method: 'PUT', body: '{}' });
    expect(calls.length).toBe(0);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
  });

  it('POST ו-DELETE ל-API נחסמים גם הם', async () => {
    calls.length = 0;
    await guarded('/api/strips', { method: 'POST' });
    await guarded('/api/strips/1', { method: 'delete' });
    expect(calls.length).toBe(0);
  });

  it('התשובה החסומה נראית כמו Response — כדי שקוד קורא לא יקרוס', async () => {
    const res: any = await guarded('/api/strips', { method: 'POST' });
    expect(await res.json()).toEqual({ error: 'peek_read_only' });
    expect(await res.text()).toBe('');
  });

  it('בקשה שאינה ל-API (נכס סטטי) לא מטופלת בכלל', async () => {
    calls.length = 0;
    await guarded('/assets/map.png', { method: 'POST' });
    expect(calls.length).toBe(1);
  });
});

describe('peekIntervalDelay — מיתון הפולינג במסגרת צפייה', () => {
  it('פולינג נתונים (5ש\') מואט לפי הפקטור — כך 4 ריבועים לא מכפילים פי-חמישה את העומס', () => {
    expect(peekIntervalDelay(5000)).toBe(5000 * PEEK_POLL_FACTOR);
  });

  it('גם 10ש\' ו-30ש\' מואטים', () => {
    expect(peekIntervalDelay(10000)).toBe(10000 * PEEK_POLL_FACTOR);
    expect(peekIntervalDelay(30000)).toBe(30000 * PEEK_POLL_FACTOR);
  });

  it('טיימר שעון (1ש\') נשאר מדויק — שעה מוצגת בעמדה נצפית לא תהיה מיושנת', () => {
    expect(peekIntervalDelay(1000)).toBe(1000);
  });

  it('טיימרים מהירים (אנימציה) לא נפגעים', () => {
    expect(peekIntervalDelay(16)).toBe(16);
    expect(peekIntervalDelay(0)).toBe(0);
    expect(peekIntervalDelay(undefined)).toBe(undefined);
  });

  it('הגבול הוא 2 שניות — מתחתיו לא נוגעים', () => {
    expect(peekIntervalDelay(1999)).toBe(1999);
    expect(peekIntervalDelay(2000)).toBe(2000 * PEEK_POLL_FACTOR);
  });
});

describe('reorderStations — שינוי סדר בגרירה', () => {
  const list = [st(1, 5, { sort_order: 0 }), st(2, 6, { sort_order: 1 }), st(3, 7, { sort_order: 2 })];

  it('גרירת האחרון לראש', () => {
    expect(reorderStations(list, 3, 1).map(s => s.id)).toEqual([3, 1, 2]);
  });

  it('גרירת הראשון לסוף', () => {
    expect(reorderStations(list, 1, 3).map(s => s.id)).toEqual([2, 3, 1]);
  });

  it('sort_order ממוספר מחדש ברצף — זה מה שנשלח לשרת', () => {
    expect(reorderStations(list, 3, 1).map(s => s.sort_order)).toEqual([0, 1, 2]);
  });

  it('גרירה על עצמו לא משנה כלום', () => {
    expect(reorderStations(list, 2, 2).map(s => s.id)).toEqual([1, 2, 3]);
  });

  it('מזהה שלא קיים — הרשימה חוזרת כמות שהיא', () => {
    expect(reorderStations(list, 99, 1).map(s => s.id)).toEqual([1, 2, 3]);
  });
});
