// ─── נקודת העברה: הדלקה / כיבוי פר-עמדה ─────────────────────────────────────
//
// במסך הניהול, בלשונית "נקודות העברה", מכבים נקודה לעמדה מסוימת
// (`sectors.disabled_preset_ids`). הנקודה **יורדת מהמסך** של העמדה (תוך רענון
// אחד, בלי כניסה מחדש), אי אפשר לשלוח אליה, והעברות פתוחות דרכה שקשורות
// לעמדה **חוזרות למוסר** (אותה סגירה של דחייה - `closeTransferTx`).
//
// הלוגיקה כאן טהורה (בלי DB), כדי שאפשר יהיה לבדוק את ההחלטה "איזו העברה חוזרת".

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/** רשימת העמדות הכבויות של נקודה - עמידה לערך שבור */
export function disabledPresetIds(sector) {
  const raw = sector?.disabled_preset_ids;
  const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : []);
  return [...new Set(arr.map(Number).filter(Number.isFinite))];
}

export function isPointDisabledFor(sector, presetId) {
  const p = num(presetId);
  return p !== null && disabledPresetIds(sector).includes(p);
}

/** הרשימה אחרי הדלקה/כיבוי של עמדה אחת */
export function toggleDisabled(sector, presetId, enabled) {
  const p = Number(presetId);
  const cur = disabledPresetIds(sector).filter(x => x !== p);
  return enabled ? cur : [...cur, p];
}

/** אילו נקודות (sector ids) עמדה משתמשת בהן - מורכבת וקלאסית */
export function presetSectorIds(preset) {
  const rel = Array.isArray(preset?.relevant_sectors) ? preset.relevant_sectors : [];
  const tf = Array.isArray(preset?.classic_transfer_points) ? preset.classic_transfer_points.map(x => x?.sector_id) : [];
  const rc = Array.isArray(preset?.classic_receive_points) ? preset.classic_receive_points.map(x => x?.sector_id) : [];
  return new Set([...rel, ...tf, ...rc].map(Number).filter(Number.isFinite));
}

/**
 * העמדות של נקודה, כפי שהוגדרו בניהול: כל עמדה שמשתמשת בנקודה (`presetSectorIds`)
 * והנקודה דולקת אצלה. זו הרשימה של תפריט "עמדה" בכלל הגבהים של הנקודה.
 */
export function pointStationIds(presets, sector) {
  const sid = num(sector?.id);
  if (sid === null) return [];
  return (Array.isArray(presets) ? presets : [])
    .filter(p => presetSectorIds(p).has(sid) && !isPointDisabledFor(sector, p?.id))
    .map(p => Number(p.id)).filter(Number.isFinite);
}

/**
 * ההעברות הפתוחות שחוזרות למוסר כשהנקודה `sectorId` כובתה לעמדה `presetId`.
 *
 * | העברה | חוזרת? |
 * |---|---|
 * | העמדה שכובתה **שלחה** דרך הנקודה | כן |
 * | היעד המפורש הוא העמדה שכובתה (`to_preset_id`/`to_workstation_id`) | כן |
 * | בלי יעד מפורש, ואין עמדה מקבלת אחרת שהנקודה דולקת אצלה | כן - אחרת היא תיתקע |
 * | בלי יעד מפורש, ויש עוד עמדה מקבלת | לא - היא עדיין יכולה לקבל |
 *
 * `receiverIds` = העמדות שמשתמשות בנקודה והיא **דולקת** אצלן אחרי הכיבוי.
 */
export function transfersToReturn(openTransfers, sectorId, presetId, receiverIds) {
  const sid = Number(sectorId), pid = Number(presetId);
  const receivers = new Set([...(receiverIds || [])].map(Number));
  return (openTransfers || []).filter(t => {
    if (num(t.to_sector_id) !== sid) return false;
    const from = num(t.from_workstation_id ?? t.from_preset_id);
    const to = num(t.to_preset_id ?? t.to_workstation_id);
    if (from === pid) return true;
    if (to !== null) return to === pid;
    const others = [...receivers].filter(r => r !== from);
    return others.length === 0;
  });
}

// ─── כיוון עמדה בנקודה: מוסרת / מקבלת / שניהם ────────────────────────────────
//
// בניהול ← נקודות העברה, לכל עמדה שמשתמשת בנקודה נקבע כיוון
// (`sectors.station_directions` = { presetId: 'send' | 'receive' }; חסר = שניהם).
//
// | כיוון | שליחה דרך הנקודה | קבלה בנקודה |
// |---|---|---|
// | `both` (ברירת מחדל) | כן | כן |
// | `send` - מוסרת | כן | לא - אינה יעד בבורר העמדות, ואין לה צד "מקבל" |
// | `receive` - מקבלת | לא - הנקודה אינה יעד שחרור אצלה, והשרת דוחה (409) | כן |

export const DIRECTIONS = ['both', 'send', 'receive'];

/** מפת הכיוונים של נקודה - עמידה לערך שבור */
export function stationDirections(sector) {
  const raw = sector?.station_directions;
  const obj = raw && typeof raw === 'object' ? raw : (typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : {});
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (Number.isFinite(Number(k)) && (v === 'send' || v === 'receive')) out[Number(k)] = v;
  }
  return out;
}

export function stationDirection(sector, presetId) {
  const p = num(presetId);
  if (p === null) return 'both';
  return stationDirections(sector)[p] || 'both';
}

/** העמדה יכולה לשלוח דרך הנקודה (דולקת ולא "מקבלת בלבד") */
export function canSendVia(sector, presetId) {
  return !isPointDisabledFor(sector, presetId) && stationDirection(sector, presetId) !== 'receive';
}

/** העמדה יכולה לקבל בנקודה (דולקת ולא "מוסרת בלבד") */
export function canReceiveVia(sector, presetId) {
  return !isPointDisabledFor(sector, presetId) && stationDirection(sector, presetId) !== 'send';
}

/** המפה אחרי קביעת כיוון לעמדה אחת ('both' נמחק - זו ברירת המחדל) */
export function setDirection(sector, presetId, direction) {
  const p = Number(presetId);
  const next = { ...stationDirections(sector) };
  delete next[p];
  if (direction === 'send' || direction === 'receive') next[p] = direction;
  return next;
}

/**
 * ההעברות הפתוחות שחוזרות למוסר כשעמדה עוברת לכיוון חדש בנקודה.
 *
 * | כיוון חדש | חוזרות |
 * |---|---|
 * | `receive` | מה שהעמדה **שלחה** דרך הנקודה |
 * | `send` | מה שמיועד אליה במפורש, או בלי יעד כשאין עמדה מקבלת אחרת |
 * | `both` | כלום |
 *
 * `receiverIds` = העמדות שיכולות לקבל בנקודה **אחרי** השינוי.
 */
export function transfersToReturnOnDirection(openTransfers, sectorId, presetId, direction, receiverIds) {
  const sid = Number(sectorId), pid = Number(presetId);
  const receivers = new Set([...(receiverIds || [])].map(Number));
  if (direction !== 'send' && direction !== 'receive') return [];
  return (openTransfers || []).filter(t => {
    if (num(t.to_sector_id) !== sid) return false;
    const from = num(t.from_workstation_id ?? t.from_preset_id);
    if (direction === 'receive') return from === pid;
    if (from === pid) return false;
    const to = num(t.to_preset_id ?? t.to_workstation_id);
    if (to !== null) return to === pid;
    return [...receivers].filter(r => r !== from).length === 0;
  });
}
