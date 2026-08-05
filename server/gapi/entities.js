// GAPI — מקור אמת יחיד למיפוי שדות GAPI↔SKYKING. ראה GAPI-CONTRACT.md §6.
//
// כל ישות מגדירה:
//   table    — טבלת ה-DB ב-SKYKING
//   fields   — שדות תפעוליים (⇄). כל שדה: { gapi, col, json? }.
//              **רק** שדות שברשימה הזו נשלחים/נקלטים; כל השאר פנימי ל-SKYKING
//              (מיקום/דסק/מפה) — לא יוצא ולא נקבע ע"י GAPI. זו אכיפת ההחרגה.
//   airfields— שדות code/name שנפתרים ל-id מול טבלת bases (מטופל ב-sync).
//   hasAircraft — פ"מ נושא מערך aircraft (מטוסים+חימושים+מערכות).
//   matchBy  — 'base' → הישות מתמפה על רשומת base_statuses לפי הבסיס (מז"א).

export const ENTITIES = {
  // פ"מ — strips + strip_aircraft (+ armaments/systems)
  sortie: {
    table: 'strips',
    fields: [
      { gapi: 'callsign',            col: 'callsign' },
      { gapi: 'sq',                  col: 'sq' },
      { gapi: 'task',                col: 'task' },
      { gapi: 'number_of_formation', col: 'number_of_formation' },
      { gapi: 'takeoff_time',        col: 'takeoff_time' },
      { gapi: 'planned_landing_time', col: 'planned_landing_time' },
      { gapi: 'airborne',            col: 'airborne' },
      { gapi: 'landed',              col: 'landed' },
      { gapi: 'erka',                col: 'erka' },
      { gapi: 'koteret',             col: 'koteret' },
      { gapi: 'mivtza',              col: 'mivtza' },
      { gapi: 'tzevet_shilta',       col: 'tzevet_shilta' },
      { gapi: 'ta_shilta',           col: 'ta_shilta' },
    ],
    airfields: [
      { gapi: 'takeoff_airfield', col: 'takeoff_airfield_id', table: 'aviation_bases', by: ['name', 'code'] },
      { gapi: 'landing_airfield', col: 'landing_airfield_id', table: 'aviation_bases', by: ['name', 'code'] },
    ],
    hasAircraft: true,
  },

  // ספרור — serials (הכל)
  serial: {
    table: 'serials',
    fields: [
      { gapi: 'control_station', col: 'control_station' },
      { gapi: 'serial_number',   col: 'serial_number' },
      { gapi: 'essence',         col: 'essence' },
      { gapi: 'relevant_to',     col: 'relevant_to' },
      { gapi: 'created_at',      col: 'created_at' },
    ],
  },

  // סטטוס בסיס — base_statuses (הכל)
  base_status: {
    table: 'base_statuses',
    fields: [
      { gapi: 'name',               col: 'name' },
      { gapi: 'code',               col: 'code' },
      { gapi: 'relevant_to',        col: 'relevant_to' },
      { gapi: 'air_defense_status', col: 'air_defense_status' },
      { gapi: 'absorption_status',  col: 'absorption_status' },
      { gapi: 'bird_status',        col: 'bird_status' },
      { gapi: 'pressure_inhg',      col: 'pressure_inhg' },
      { gapi: 'atis_text',          col: 'atis_text' },
      { gapi: 'notam_text',         col: 'notam_text' },
    ],
    airfields: [
      { gapi: 'airfield', col: 'airfield_id', table: 'airfields', by: ['name', 'custom_name'] },
    ],
  },

  // מז"א — תת-קבוצה של base_statuses (כותב על רשומת הבסיס)
  weather: {
    table: 'base_statuses',
    matchBy: 'base',
    fields: [
      { gapi: 'pressure_inhg',     col: 'pressure_inhg' },
      { gapi: 'atis_text',         col: 'atis_text' },
      { gapi: 'notam_text',        col: 'notam_text' },
      { gapi: 'bird_status',       col: 'bird_status' },
      { gapi: 'absorption_status', col: 'absorption_status' },
    ],
    airfields: [
      { gapi: 'airfield', col: 'airfield_id', table: 'airfields', by: ['name', 'custom_name'] },
    ],
  },

  // סגירה — closures (פעילות)
  closure: {
    table: 'closures',
    fields: [
      { gapi: 'name',           col: 'name' },
      { gapi: 'category',       col: 'category' },
      { gapi: 'alt_min',        col: 'alt_min' },
      { gapi: 'alt_max',        col: 'alt_max' },
      { gapi: 'dates',          col: 'dates', json: true },
      { gapi: 'time_start',     col: 'time_start' },
      { gapi: 'time_end',       col: 'time_end' },
      { gapi: 'closure_status', col: 'closure_status' },
      { gapi: 'active',         col: 'active' },
      { gapi: 'polygon_geo',    col: 'polygon_geo', json: true },
    ],
  },
};

export const ENTITY_NAMES = Object.keys(ENTITIES);

export function getEntityDef(entity) {
  return ENTITIES[entity] || null;
}
