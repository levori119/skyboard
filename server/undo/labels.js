// התווית שהמפעיל רואה בחלון האישור: "לבטל את *מחיקת הפ"מ*?"
//
// טבלת כללים בסגנון ה-RULES של middleware/auth.js — **הכלל הראשון שמתאים
// מנצח**, ולכן הסדר הוא חלק מהנכונות: נתיב ספציפי קודם לתחילית רחבה.
//
// הערך הוא **מפתח i18n** ולא מחרוזת: התווית מוצגת בעברית ובאנגלית, וניתן
// לשנות אותה במסך ניהול התרגומים בלי build (src/i18n/registry/undo.json).
//
// ⚠️ נתיב שאין לו כלל **עדיין ניתן לביטול**. הוא נופל ל-`undo.changeEntity`
// עם שם הישות שנגזר מהנתיב. תווית חסרה היא חוסר נוחות, לא אובדן פונקציונליות —
// אחרת כל endpoint חדש היה מאבד את הביטול שלו בשקט.

const WRITE_VERB = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };

/**
 * @type {Array<{m: string[]|null, p: RegExp, key: string}>}
 */
const RULES = [
  // ── פ"מ ────────────────────────────────────────────────────────────────────
  { m: ['POST'],   p: /^\/api\/strips$/,                          key: 'undo.createStrip' },
  { m: ['DELETE'], p: /^\/api\/strips\/\d+$/,                     key: 'undo.deleteStrip' },
  { m: ['PUT', 'PATCH'], p: /^\/api\/strips\/\d+$/,               key: 'undo.updateStrip' },
  { m: ['PATCH'],  p: /^\/api\/strips\/\d+\/block-(space|deviation)$/, key: 'undo.updateStripBlock' },
  { m: ['PUT'],    p: /^\/api\/strips\/\d+\/control-field$/,      key: 'undo.updateStripControl' },
  { m: null,       p: /^\/api\/strip-control-values/,             key: 'undo.updateStripControl' },
  { m: null,       p: /^\/api\/strip-zone-/,                      key: 'undo.moveStripToZone' },
  { m: null,       p: /^\/api\/strip-table-assignments/,          key: 'undo.moveStripToTable' },
  { m: null,       p: /^\/api\/strip-station-notes/,              key: 'undo.stripNote' },
  { m: null,       p: /^\/api\/strip-aircraft\/[^/]+\/\d+\/flight-status$/, key: 'undo.flightStatus' },
  { m: null,       p: /^\/api\/strip-aircraft\/[^/]+\/\d+\/fault$/,         key: 'undo.aircraftFault' },
  { m: null,       p: /^\/api\/strip-aircraft/,                   key: 'undo.updateAircraft' },
  { m: null,       p: /^\/api\/strip-serial-(selections|dismissals)/, key: 'undo.stripSerial' },

  // ── נקודות הצטרפות ────────────────────────────────────────────────────────
  { m: null,       p: /^\/api\/joining-point-strips/,             key: 'undo.joiningPointStrip' },
  { m: null,       p: /^\/api\/joining-point-aircraft/,           key: 'undo.joiningPointAircraft' },
  { m: null,       p: /^\/api\/joining-points/,                   key: 'undo.joiningPointDef' },

  // ── מפה ואזורים ───────────────────────────────────────────────────────────
  { m: null,       p: /^\/api\/map-zones/,                        key: 'undo.mapZone' },
  { m: null,       p: /^\/api\/zone-altitude-ranges/,             key: 'undo.zoneAltitudes' },
  { m: null,       p: /^\/api\/map-transfer-points/,              key: 'undo.mapTransferPoint' },
  { m: null,       p: /^\/api\/closures/,                         key: 'undo.closure' },
  { m: null,       p: /^\/api\/maps/,                             key: 'undo.map' },

  // ── שדה קרקעי (מגדל) ──────────────────────────────────────────────────────
  { m: null,       p: /^\/api\/airfield-elements/,                key: 'undo.airfieldElement' },
  { m: null,       p: /^\/api\/airfield-polygons/,                key: 'undo.airfieldPolygon' },
  { m: null,       p: /^\/api\/airfield-runways/,                 key: 'undo.runway' },
  { m: null,       p: /^\/api\/runway-(notams|lighting|grf|aid-status|end-use)/, key: 'undo.runwayStatus' },
  { m: null,       p: /^\/api\/airfield-(points|taxiways|routes|patterns)/, key: 'undo.airfieldDef' },

  // ── בלוקים ─────────────────────────────────────────────────────────────────
  { m: null,       p: /^\/api\/blocks/,                           key: 'undo.block' },

  // ── שיתופיות ───────────────────────────────────────────────────────────────
  { m: null,       p: /^\/api\/sticky-notes/,                     key: 'undo.stickyNote' },
  { m: null,       p: /^\/api\/workstation-messages/,             key: 'undo.message' },
  { m: null,       p: /^\/api\/workstation-signals/,              key: 'undo.signal' },
  { m: null,       p: /^\/api\/bdh-alerts/,                       key: 'undo.bdhAlert' },
  { m: null,       p: /^\/api\/work-group-notes/,                 key: 'undo.workGroupNote' },

  // ── סקטורים ובסיסים ───────────────────────────────────────────────────────
  { m: ['PUT'],    p: /^\/api\/sectors\/\d+\/notes$/,             key: 'undo.sectorNote' },
  { m: null,       p: /^\/api\/(sectors|sub-sectors)/,            key: 'undo.sector' },
  { m: null,       p: /^\/api\/base-statuses/,                    key: 'undo.baseStatus' },
  { m: null,       p: /^\/api\/aviation-bases/,                   key: 'undo.base' },

  // ── דסק משימה ולוחות ──────────────────────────────────────────────────────
  { m: null,       p: /^\/api\/mission-desk-state/,               key: 'undo.missionDeskState' },
  { m: null,       p: /^\/api\/mission-desks/,                    key: 'undo.missionDesk' },
  { m: null,       p: /^\/api\/classic-strip-(tables|rows)/,      key: 'undo.classicTable' },

  // ── ניהול ──────────────────────────────────────────────────────────────────
  { m: null,       p: /^\/api\/workstation-presets/,              key: 'undo.preset' },
  { m: null,       p: /^\/api\/crew-members/,                     key: 'undo.crewMember' },
  { m: null,       p: /^\/api\/(value-lists|default-names|units|table-modes)/, key: 'undo.valueList' },
  { m: null,       p: /^\/api\/(aid-groups|aid-items)/,           key: 'undo.aid' },
  { m: null,       p: /^\/api\/(bdh|bdh-items)/,                  key: 'undo.bdhDoc' },
];

/**
 * שם הישות מתוך הנתיב, לגיבוי כשאין כלל: `/api/route-links/7` → `routeLinks`.
 * camelCase כדי שיוכל לשמש מפתח ב-`undo.entity.*` שב-registry.
 */
export function entityFromPath(path) {
  const seg = String(path || '').split('?')[0].split('/').filter(Boolean)[1] || '';
  return seg.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * מחזיר `{ key, params }` לתווית הפעולה.
 * `params.entity` נשלח תמיד — הלקוח משתמש בו בגיבוי.
 */
export function labelFor(method, path) {
  const m = String(method || '').toUpperCase();
  const clean = String(path || '').split('?')[0];
  for (const rule of RULES) {
    if (rule.m && !rule.m.includes(m)) continue;
    if (!rule.p.test(clean)) continue;
    return { key: rule.key, params: {} };
  }
  return {
    key: `undo.${WRITE_VERB[m] || 'change'}Entity`,
    params: { entity: entityFromPath(clean) },
  };
}
