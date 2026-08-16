// ─── הורשת בלוקי גבהים מאזור-אב לאזורי-הילד ──────────────────────────────────
//
// מפת סקטור נחתכת לתת-מפות (מפת אזורי קרב → מרחבי 305 → אזורי ים / אזורי יבשה),
// וכל אזור בתת-מפה מצביע על אזור-האב שלו ב-`map_zones.parent_zone_id`. הסנכרון
// שהיה קיים העביר לילד **שם, צבע ופוליגון בלבד** - ולכן אזור שהוגדרו לו בלוקי
// גבהים במפת האב הופיע בתת-המפה בלי אף בלוק, והפ"מ לא היה יכול לשבת בגובה.
//
// שני מצבים, ובכוונה לא אחד:
//
// | מצב | מתי | מה קורה לילד |
// |---|---|---|
// | `mirror` | עריכת בלוק **על האב** (הוספה/עדכון/מחיקה של `zone_altitude_ranges`) | מראה מלאה, כולל מחיקת בלוק שאין לאב |
// | `fill` | סנכרון האזור מהאב (שם/צבע/פוליגון, יצירת ילד חדש) | מילוי בלבד - ילד שכבר יש לו בלוקים לא נדרס |
//
// ההפרדה נחוצה: שינוי **שם** של אזור לא אמור למחוק חלוקת גבהים שנקבעה ידנית
// בתת-מפה, בעוד מחיקת בלוק על האב כן צריכה להתגלגל למטה.
//
// ההתאמה בין בלוק-אב לבלוק-ילד היא **לפי שם**, והשורה הקיימת מתעדכנת במקומה.
// זה לא ניואנס סגנוני: `strip_zone_assignments.altitude_range_id` מצביע על
// השורה, וה-FK הוא `ON DELETE SET NULL` - מחיקה והכנסה מחדש היו מפילות כל פ"מ
// מוצב מהבלוק שלו בכל עדכון של האב.

const SELECT_RANGES =
  'SELECT id, name, alt_min, alt_max, sort_order FROM zone_altitude_ranges WHERE zone_id = $1 ORDER BY sort_order, id';

const norm = (name) => String(name ?? '').trim();

/**
 * מה צריך לקרות לאזור-ילד כדי שבלוקיו יהיו כשל האב.
 * טהורה, בלי DB - מקבלת את שתי הרשימות ומחזירה תכנית.
 *
 * @param {Array<{id:number,name:string,alt_min:?number,alt_max:?number,sort_order:?number}>} parentRanges
 * @param {Array<{id:number,name:string,alt_min:?number,alt_max:?number,sort_order:?number}>} childRanges
 * @returns {{inserts:Array, updates:Array, deletes:number[]}}
 */
export function planAltRangeMirror(parentRanges, childRanges) {
  const inserts = [], updates = [];
  // עותק בר-צריכה: כל שורת-ילד מותאמת לכל היותר לבלוק-אב אחד, ולכן שם כפול
  // אצל האב מקבל שורה נפרדת אצל הילד במקום ששניהם ידרסו את אותה שורה.
  const pool = [...(childRanges || [])];
  for (const p of parentRanges || []) {
    const name = norm(p.name);
    const i = pool.findIndex(c => norm(c.name) === name);
    const row = { name, alt_min: p.alt_min ?? null, alt_max: p.alt_max ?? null, sort_order: p.sort_order ?? 0 };
    if (i === -1) inserts.push(row);
    else { updates.push({ id: pool[i].id, ...row }); pool.splice(i, 1); }
  }
  return { inserts, updates, deletes: pool.map(c => c.id) };
}

/** כל צאצאי האזור לכל עומק (ילדים, נכדים...), עם שמירה מפני מעגל בעץ */
async function descendantZoneIds(db, rootZoneId) {
  const seen = new Set([rootZoneId]);
  const out = [];
  let frontier = [rootZoneId];
  while (frontier.length) {
    const r = await db.query('SELECT id FROM map_zones WHERE parent_zone_id = ANY($1::int[])', [frontier]);
    const next = r.rows.map(row => row.id).filter(id => !seen.has(id));
    for (const id of next) seen.add(id);
    out.push(...next);
    frontier = next;
  }
  return out;
}

/**
 * מחיל את בלוקי אזור-האב על צאצאיו.
 *
 * @param {{query: Function}} db - ה-pool (מוזרק כדי שהמודול יהיה בדיק)
 * @param {number} sourceZoneId - אזור-האב שממנו יורשים
 * @param {{mode?: 'mirror'|'fill', targetZoneIds?: number[]|null}} opts
 *        `targetZoneIds` מגביל לאזורים שנמסרו (בלי ירידה לנכדים) - לשימוש
 *        מסלולי הסנכרון שכבר יודעים בדיוק איזה ילד נגעו בו.
 * @returns {Promise<{zones:number, inserted:number, updated:number, deleted:number, error?:string}>}
 *          לעולם לא זורקת: הורשה היא תופעת-לוואי של הבקשה, ולא סיבה להפיל אותה.
 */
export async function inheritAltRanges(db, sourceZoneId, { mode = 'mirror', targetZoneIds = null } = {}) {
  const stats = { zones: 0, inserted: 0, updated: 0, deleted: 0 };
  try {
    const parentRanges = (await db.query(SELECT_RANGES, [sourceZoneId])).rows;
    // אב בלי בלוקים במצב מילוי = אין מה להוריש. במצב מראה זו מחיקה מכוונת.
    if (!parentRanges.length && mode === 'fill') return stats;

    const targets = targetZoneIds ?? await descendantZoneIds(db, sourceZoneId);
    for (const zoneId of targets) {
      if (zoneId === sourceZoneId) continue;
      const childRanges = (await db.query(SELECT_RANGES, [zoneId])).rows;
      if (mode === 'fill' && childRanges.length) continue;
      const plan = planAltRangeMirror(parentRanges, childRanges);
      if (!plan.inserts.length && !plan.updates.length && !plan.deletes.length) continue;
      for (const row of plan.inserts) {
        await db.query(
          'INSERT INTO zone_altitude_ranges (zone_id, name, alt_min, alt_max, sort_order) VALUES ($1,$2,$3,$4,$5)',
          [zoneId, row.name, row.alt_min, row.alt_max, row.sort_order]
        );
        stats.inserted++;
      }
      for (const row of plan.updates) {
        await db.query(
          'UPDATE zone_altitude_ranges SET name=$1, alt_min=$2, alt_max=$3, sort_order=$4 WHERE id=$5',
          [row.name, row.alt_min, row.alt_max, row.sort_order, row.id]
        );
        stats.updated++;
      }
      if (plan.deletes.length) {
        await db.query('DELETE FROM zone_altitude_ranges WHERE id = ANY($1::int[])', [plan.deletes]);
        stats.deleted += plan.deletes.length;
      }
      stats.zones++;
    }
    return stats;
  } catch (err) {
    console.error('הורשת בלוקי גבהים נכשלה:', err);
    return { ...stats, error: err.message };
  }
}
