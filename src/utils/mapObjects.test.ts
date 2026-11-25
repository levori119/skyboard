// אובייקטים על מפה - נרמול, גאומטריה והמרה לפיקסלים. ראה MAP_OBJECTS_SPEC.md.
import { describe, it, expect } from 'vitest';
import {
  MAP_OBJECT_SHAPES, MAP_OBJECT_SIZE_MIN, MAP_OBJECT_SIZE_MAX, MAP_OBJECT_SIZE_DEFAULT, MAP_OBJECT_DEFAULT_COLOR,
  normalizeMapObject, normalizeMapObjectPatch, mapObjectPath, isValidMapObjectColor, mapObjectPixels, sortMapObjects,
  mapObjectShapeKey,
} from './mapObjects';
import mapRegistry from '../i18n/registry/map.json';

/** כל הקואורדינטות שבנתיב (מתעלם מפקודות ומדגלי הקשת). */
const coords = (d: string) => (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);

describe('normalizeMapObject', () => {
  it('שורה ריקה מקבלת ערכי ברירת מחדל בטוחים', () => {
    expect(normalizeMapObject({})).toEqual({
      name: '', shape: 'circle', x: 50, y: 50, size: MAP_OBJECT_SIZE_DEFAULT,
      color: MAP_OBJECT_DEFAULT_COLOR, filled: true, show_label: true, sort_order: 0,
    });
    expect(normalizeMapObject(null).shape).toBe('circle');
    expect(normalizeMapObject('junk').x).toBe(50);
  });

  it('מיקום מחוץ למפה נחתך ל-0..100', () => {
    const o = normalizeMapObject({ x: -5, y: 140 });
    expect([o.x, o.y]).toEqual([0, 100]);
    expect(normalizeMapObject({ x: '33.5', y: '12' })).toMatchObject({ x: 33.5, y: 12 });
  });

  it('גודל נחתך לגבולות, ערך לא מספרי = ברירת מחדל', () => {
    expect(normalizeMapObject({ size: 0 }).size).toBe(MAP_OBJECT_SIZE_MIN);
    expect(normalizeMapObject({ size: 999 }).size).toBe(MAP_OBJECT_SIZE_MAX);
    expect(normalizeMapObject({ size: 'abc' }).size).toBe(MAP_OBJECT_SIZE_DEFAULT);
    expect(normalizeMapObject({ size: '' }).size).toBe(MAP_OBJECT_SIZE_DEFAULT);
    expect(normalizeMapObject({ size: 4.5 }).size).toBe(4.5);
  });

  it('צורה לא מוכרת = עיגול; כל צורה מוכרת נשמרת', () => {
    expect(normalizeMapObject({ shape: 'pentagon' }).shape).toBe('circle');
    for (const s of MAP_OBJECT_SHAPES) expect(normalizeMapObject({ shape: s }).shape).toBe(s);
  });

  it('צבע לא תקין = ברירת המחדל; צבע תקין מנורמל לאותיות קטנות', () => {
    expect(normalizeMapObject({ color: 'red' }).color).toBe(MAP_OBJECT_DEFAULT_COLOR);
    expect(normalizeMapObject({ color: '#12345' }).color).toBe(MAP_OBJECT_DEFAULT_COLOR);
    expect(normalizeMapObject({ color: 'javascript:alert(1)' }).color).toBe(MAP_OBJECT_DEFAULT_COLOR);
    expect(normalizeMapObject({ color: '#ABCDEF' }).color).toBe('#abcdef');
    expect(normalizeMapObject({ color: '#fff' }).color).toBe('#fff');
    expect(isValidMapObjectColor('#00ff00')).toBe(true);
    expect(isValidMapObjectColor(12)).toBe(false);
  });

  it('שם נחתך ל-100 תווים ומנוקה מרווחים', () => {
    expect(normalizeMapObject({ name: '  מגדל  ' }).name).toBe('מגדל');
    expect(normalizeMapObject({ name: 'א'.repeat(150) }).name).toHaveLength(100);
  });

  it('בוליאנים: false/"false"/0 מכבים, חסר = דלוק', () => {
    expect(normalizeMapObject({ filled: false, show_label: 'false' })).toMatchObject({ filled: false, show_label: false });
    expect(normalizeMapObject({ filled: 0 }).filled).toBe(false);
    expect(normalizeMapObject({ filled: null }).filled).toBe(true);
  });

  it('id ו-map_id עוברים כשקיימים, ולא מומצאים כשחסרים', () => {
    expect(normalizeMapObject({ id: 7, map_id: '3' })).toMatchObject({ id: 7, map_id: 3 });
    expect('id' in normalizeMapObject({})).toBe(false);
  });

  it('עדכון חלקי שומר את מה שלא נשלח', () => {
    const cur = normalizeMapObject({ name: 'מכ"ם', color: '#22c55e', shape: 'star', size: 5, x: 10, y: 10 });
    const next = normalizeMapObjectPatch({ x: 70, y: 20 }, cur);
    expect(next).toMatchObject({ name: 'מכ"ם', color: '#22c55e', shape: 'star', size: 5, x: 70, y: 20 });
  });
});

describe('mapObjectPath', () => {
  it('לכל צורה נתיב סגור שחסום בתיבה [-r, r]', () => {
    for (const s of MAP_OBJECT_SHAPES) {
      const d = mapObjectPath(s, 10);
      expect(d.startsWith('M')).toBe(true);
      expect(d.trim().endsWith('Z')).toBe(true);
      // דגלי הקשת של העיגול (0,1) גם הם בתוך התיבה, ולכן הבדיקה תקפה לכולן
      for (const n of coords(d)) expect(Math.abs(n)).toBeLessThanOrEqual(10 + 1e-9);
    }
  });

  it('כל צורה ממלאת את התיבה (נוגעת בקצה העליון או הימני)', () => {
    for (const s of MAP_OBJECT_SHAPES) {
      const max = Math.max(...coords(mapObjectPath(s, 10)).map(Math.abs));
      expect(max).toBeCloseTo(10, 5);
    }
  });

  it('צורה לא מוכרת או רדיוס שבור לא מפילים את הציור', () => {
    expect(mapObjectPath('blob', 5)).toBe(mapObjectPath('circle', 5));
    expect(mapObjectPath('square', NaN)).toBe(mapObjectPath('square', 1));
    expect(mapObjectPath('square', -3)).toBe(mapObjectPath('square', 1));
  });
});

describe('mapObjectPixels', () => {
  it('הגודל נגזר מהרוחב - עיגול נשאר עיגול גם במפה לא ריבועית', () => {
    const p = mapObjectPixels({ x: 50, y: 25, size: 10 }, 1000, 400);
    expect(p).toEqual({ cx: 500, cy: 100, r: 50 });
  });

  it('רדיוס מינימלי של חצי פיקסל - אובייקט לא נעלם במפה קטנה', () => {
    expect(mapObjectPixels({ x: 0, y: 0, size: 0.3 }, 10, 10).r).toBe(0.5);
  });
});

describe('sortMapObjects', () => {
  it('לפי sort_order ואז id, בלי לשנות את המערך המקורי', () => {
    const list = [{ id: 3, sort_order: 0 }, { id: 1, sort_order: 1 }, { id: 2, sort_order: 0 }];
    expect(sortMapObjects(list).map(o => o.id)).toEqual([2, 3, 1]);
    expect(list.map(o => o.id)).toEqual([3, 1, 2]);
  });
});

describe('i18n', () => {
  it('לכל צורה יש שם בעברית ובאנגלית ב-registry', () => {
    const keys = (mapRegistry as any).keys;
    for (const s of MAP_OBJECT_SHAPES) {
      const k = mapObjectShapeKey(s).replace(/^map\./, '');
      expect(keys[k]?.he, k).toBeTruthy();
      expect(keys[k]?.en, k).toBeTruthy();
    }
  });
});
