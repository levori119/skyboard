import { describe, it, expect } from 'vitest';
import { planAltRangeMirror, inheritAltRanges } from './zoneAltInherit.js';

const R = (id, zone_id, name, alt_min, alt_max, sort_order) => ({ id, zone_id, name, alt_min, alt_max, sort_order });

/**
 * DB מזויף עם שתי טבלאות בלבד - `map_zones` (עץ אב-ילד) ו-`zone_altitude_ranges`.
 * מטרתו לבדוק את **מה שנכתב**: אילו שורות הוכנסו, אילו עודכנו במקום (ולכן
 * שמרו על ה-id שלהן), ואילו נמחקו.
 */
function fakeDb({ zones = [], ranges = [] } = {}) {
  let nextId = Math.max(0, ...ranges.map(r => r.id)) + 1;
  const writes = [];
  return {
    ranges,
    writes,
    of: (zoneId) => ranges.filter(r => r.zone_id === zoneId)
      .sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id)),
    query: async (sql, params = []) => {
      if (/^\s*SELECT[\s\S]*FROM zone_altitude_ranges/i.test(sql)) {
        const rows = ranges.filter(r => r.zone_id === params[0])
          .sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id))
          .map(r => ({ ...r }));
        return { rows, rowCount: rows.length };
      }
      if (/^\s*SELECT[\s\S]*FROM map_zones/i.test(sql)) {
        const parents = params[0];
        const rows = zones.filter(z => parents.includes(z.parent_zone_id)).map(z => ({ id: z.id }));
        return { rows, rowCount: rows.length };
      }
      if (/^\s*INSERT INTO zone_altitude_ranges/i.test(sql)) {
        const [zone_id, name, alt_min, alt_max, sort_order] = params;
        const row = { id: nextId++, zone_id, name, alt_min, alt_max, sort_order };
        ranges.push(row);
        writes.push(['insert', zone_id, name]);
        return { rows: [row], rowCount: 1 };
      }
      if (/^\s*UPDATE zone_altitude_ranges/i.test(sql)) {
        const [name, alt_min, alt_max, sort_order, id] = params;
        const row = ranges.find(r => r.id === id);
        Object.assign(row, { name, alt_min, alt_max, sort_order });
        writes.push(['update', row.zone_id, name]);
        return { rows: [row], rowCount: 1 };
      }
      if (/^\s*DELETE FROM zone_altitude_ranges/i.test(sql)) {
        for (const id of params[0]) {
          const i = ranges.findIndex(r => r.id === id);
          if (i >= 0) writes.push(['delete', ranges[i].zone_id, ranges[i].name]);
          if (i >= 0) ranges.splice(i, 1);
        }
        return { rows: [], rowCount: 0 };
      }
      throw new Error('שאילתה לא צפויה: ' + sql);
    },
  };
}

describe('תכנון המראה - איזה שינוי צריך על אזור-ילד', () => {
  const parent = [R(1, 10, 'גבוה', 150, 400, 0), R(2, 10, 'נמוך', 100, 140, 1)];

  it('ילד ריק - הכל הכנסה', () => {
    const plan = planAltRangeMirror(parent, []);
    expect(plan.inserts).toHaveLength(2);
    expect(plan.updates).toHaveLength(0);
    expect(plan.deletes).toHaveLength(0);
    expect(plan.inserts[0]).toMatchObject({ name: 'גבוה', alt_min: 150, alt_max: 400, sort_order: 0 });
  });

  it('שם זהה וטווח שונה - עדכון **במקום** ולא מחיקה+הכנסה (הפ"מ לא נופל מהבלוק)', () => {
    const child = [R(7, 20, 'גבוה', 200, 300, 0), R(8, 20, 'נמוך', 100, 190, 1)];
    const plan = planAltRangeMirror(parent, child);
    expect(plan.inserts).toHaveLength(0);
    expect(plan.deletes).toHaveLength(0);
    expect(plan.updates).toEqual([
      { id: 7, name: 'גבוה', alt_min: 150, alt_max: 400, sort_order: 0 },
      { id: 8, name: 'נמוך', alt_min: 100, alt_max: 140, sort_order: 1 },
    ]);
  });

  it('בלוק שיש לילד ואין לאב - נמחק', () => {
    const child = [R(7, 20, 'גבוה', 150, 400, 0), R(9, 20, 'ביניים', 141, 149, 5)];
    const plan = planAltRangeMirror(parent, child);
    expect(plan.deletes).toEqual([9]);
    expect(plan.inserts.map(i => i.name)).toEqual(['נמוך']);
  });

  it('אב ריק - כל בלוקי הילד נמחקים (מחיקת הבלוק האחרון מתגלגלת)', () => {
    const plan = planAltRangeMirror([], [R(7, 20, 'גבוה', 150, 400, 0)]);
    expect(plan.deletes).toEqual([7]);
    expect(plan.inserts).toHaveLength(0);
  });

  it('שם כפול אצל האב - כל מופע מקבל שורה משלו אצל הילד', () => {
    const dup = [R(1, 10, 'גבוה', 150, 400, 0), R(2, 10, 'גבוה', 401, 500, 1)];
    const plan = planAltRangeMirror(dup, [R(7, 20, 'גבוה', 150, 400, 0)]);
    expect(plan.updates).toHaveLength(1);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.deletes).toHaveLength(0);
  });

  it('שם עם רווחים מיותרים נחשב אותו בלוק', () => {
    const plan = planAltRangeMirror([R(1, 10, 'גבוה', 150, 400, 0)], [R(7, 20, ' גבוה ', 150, 400, 0)]);
    expect(plan.updates).toHaveLength(1);
    expect(plan.deletes).toHaveLength(0);
  });
});

describe('הורשה בפועל - מצב מראה (עריכת בלוק על האב)', () => {
  // 10 = אזור במפת-האב, 20/21 ילדים בשתי תת-מפות, 30 נכד
  const tree = () => ({
    zones: [{ id: 10, parent_zone_id: null }, { id: 20, parent_zone_id: 10 }, { id: 21, parent_zone_id: 10 }, { id: 30, parent_zone_id: 20 }],
    ranges: [R(1, 10, 'גבוה', 150, 400, 0), R(2, 10, 'נמוך', 100, 140, 1)],
  });

  it('כל הצאצאים - כולל נכד - מקבלים את בלוקי האב', async () => {
    const db = fakeDb(tree());
    const stats = await inheritAltRanges(db, 10);
    expect(stats).toMatchObject({ zones: 3, inserted: 6, updated: 0, deleted: 0 });
    for (const zid of [20, 21, 30]) {
      expect(db.of(zid).map(r => `${r.name} ${r.alt_min}-${r.alt_max}`)).toEqual(['גבוה 150-400', 'נמוך 100-140']);
    }
  });

  it('לילד שכבר יש בלוק באותו שם - השורה מתעדכנת ושומרת על ה-id', async () => {
    const t = tree();
    t.ranges.push(R(50, 20, 'גבוה', 200, 300, 0));
    const db = fakeDb(t);
    await inheritAltRanges(db, 10);
    const kept = db.of(20).find(r => r.name === 'גבוה');
    expect(kept.id).toBe(50);
    expect(kept.alt_max).toBe(400);
  });

  it('אזור-אב בלי בלוקים מנקה את הילדים', async () => {
    const t = tree();
    t.ranges = [R(50, 20, 'גבוה', 200, 300, 0)];
    const db = fakeDb(t);
    const stats = await inheritAltRanges(db, 10);
    expect(db.of(20)).toHaveLength(0);
    expect(stats.deleted).toBe(1);
  });

  it('מעגל בעץ (ילד שמצביע חזרה על האב) לא מכניס ללולאה אינסופית', async () => {
    const db = fakeDb({
      zones: [{ id: 10, parent_zone_id: 20 }, { id: 20, parent_zone_id: 10 }],
      ranges: [R(1, 10, 'גבוה', 150, 400, 0)],
    });
    const stats = await inheritAltRanges(db, 10);
    expect(stats.zones).toBe(1);
  });

  it('אין צאצאים - אין כתיבה בכלל', async () => {
    const db = fakeDb({ zones: [{ id: 10, parent_zone_id: null }], ranges: [R(1, 10, 'גבוה', 150, 400, 0)] });
    const stats = await inheritAltRanges(db, 10);
    expect(stats.zones).toBe(0);
    expect(db.writes).toHaveLength(0);
  });
});

describe('הורשה בפועל - מצב מילוי (סנכרון שם/צבע/פוליגון)', () => {
  it('ילד בלי בלוקים יורש', async () => {
    const db = fakeDb({
      zones: [{ id: 10, parent_zone_id: null }, { id: 20, parent_zone_id: 10 }],
      ranges: [R(1, 10, 'גבוה', 150, 400, 0)],
    });
    await inheritAltRanges(db, 10, { mode: 'fill', targetZoneIds: [20] });
    expect(db.of(20)).toHaveLength(1);
  });

  it('ילד עם בלוקים משלו **לא** נדרס', async () => {
    const db = fakeDb({
      zones: [{ id: 10, parent_zone_id: null }, { id: 20, parent_zone_id: 10 }],
      ranges: [R(1, 10, 'גבוה', 150, 400, 0), R(50, 20, 'ביניים', 141, 149, 0)],
    });
    const stats = await inheritAltRanges(db, 10, { mode: 'fill', targetZoneIds: [20] });
    expect(db.of(20).map(r => r.name)).toEqual(['ביניים']);
    expect(stats).toMatchObject({ zones: 0, inserted: 0, deleted: 0 });
  });

  it('אב בלי בלוקים - אין כתיבה בכלל (לא מוחק לילד)', async () => {
    const db = fakeDb({
      zones: [{ id: 10, parent_zone_id: null }, { id: 20, parent_zone_id: 10 }],
      ranges: [R(50, 20, 'ביניים', 141, 149, 0)],
    });
    await inheritAltRanges(db, 10, { mode: 'fill', targetZoneIds: [20] });
    expect(db.of(20)).toHaveLength(1);
    expect(db.writes).toHaveLength(0);
  });

  it('targetZoneIds מגביל לאזורים שנמסרו - נכד לא נגרר', async () => {
    const db = fakeDb({
      zones: [{ id: 10, parent_zone_id: null }, { id: 20, parent_zone_id: 10 }, { id: 30, parent_zone_id: 20 }],
      ranges: [R(1, 10, 'גבוה', 150, 400, 0)],
    });
    await inheritAltRanges(db, 10, { mode: 'fill', targetZoneIds: [20] });
    expect(db.of(20)).toHaveLength(1);
    expect(db.of(30)).toHaveLength(0);
  });
});

describe('חסינות - הורשה לא מפילה את הבקשה שקראה לה', () => {
  it('כשל DB מוחזר כסטטוס ולא כזריקה', async () => {
    const db = { query: async () => { throw new Error('DB down'); } };
    await expect(inheritAltRanges(db, 10)).resolves.toMatchObject({ zones: 0, error: 'DB down' });
  });
});
