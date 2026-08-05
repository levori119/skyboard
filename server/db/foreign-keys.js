// ─── מפתחות זרים - השלמה ואכיפה ───────────────────────────────────────────────
// למה הקובץ הזה קיים: כל ה-FK ברשימה כאן **כבר מוצהרים** ב-init.js, בתוך ה-
// CREATE TABLE שלהם. אבל `CREATE TABLE IF NOT EXISTS` מדלג בשקט על טבלה קיימת,
// ו-`ADD COLUMN IF NOT EXISTS` מדלג על עמודה קיימת - ולכן כל FK שנוסף להצהרה
// **אחרי** שהטבלה כבר נוצרה בסביבה, לא נוצר שם מעולם.
//
// ב-31.07.2026 נמדד ש-112 מתוך 121 ה-FK המוצהרים אינם קיימים ב-DB בפועל (93%):
// הצהרה שנראית תקינה בקוד ואינה נאכפת בשום מקום. הבעיה התגלתה כשמחיקת אנשי
// צוות - שאמורה הייתה לגרור CASCADE - השאירה 37 שורות יתומות.
//
// הפתרון: רשימה מפורשת שנגזרה מההצהרות ב-init.js, ופונקציה שמשלימה בכל עלייה
// את מה שחסר. אידמפוטנטית (בודקת pg_constraint לפני), ורצה בהקשר הסכמה הנוכחית
// כך שגם סכמות סביבות התרגול מקבלות אותה.
//
// **כשל אינו מדולג בשקט** - זו בדיוק הטעות שיצרה את המצב הזה מלכתחילה. FK
// שלא ניתן להוסיף (כמעט תמיד בגלל שורות יתומות קיימות) נרשם ללוג בקול, עם
// הסיבה, בכל עלייה - עד שמישהו מטפל בנתונים.
//
// כשמוסיפים FK חדש ל-init.js: להוסיף אותו גם כאן. אחרת הוא ייווצר רק בסביבות
// חדשות, וזו בדיוק הבעיה שהקובץ הזה בא לפתור.

// [טבלה, עמודה, טבלת יעד, עמודת יעד, כלל מחיקה]
export const FOREIGN_KEYS = [
  ['aid_items', 'group_id', 'aid_groups', 'id', 'CASCADE'],
  ['airfield_atis', 'airfield_id', 'airfields', 'id', 'CASCADE'],
  ['airfield_elements', 'airfield_id', 'airfields', 'id', 'CASCADE'],
  ['airfield_elements', 'element_type_id', 'airfield_element_types', 'id', 'SET NULL'],
  ['airfield_general_notams', 'airfield_id', 'airfields', 'id', 'CASCADE'],
  ['airfield_pattern_elements', 'pattern_id', 'airfield_patterns', 'id', 'CASCADE'],
  ['airfield_patterns', 'airfield_id', 'airfields', 'id', 'CASCADE'],
  ['airfield_patterns', 'runway_id', 'airfield_runways', 'id', 'SET NULL'],
  ['airfield_points', 'airfield_id', 'airfields', 'id', 'CASCADE'],
  ['airfield_polygon_statuses', 'polygon_id', 'airfield_polygons', 'id', 'CASCADE'],
  ['airfield_polygon_statuses', 'status_type_id', 'airfield_status_types', 'id', 'SET NULL'],
  ['airfield_polygons', 'airfield_id', 'airfields', 'id', 'CASCADE'],
  ['airfield_polygons', 'parent_id', 'airfield_polygons', 'id', 'SET NULL'],
  ['airfield_routes', 'airfield_id', 'airfields', 'id', 'CASCADE'],
  // מסלול ראי חי ומת עם מסלול ההמראה שממנו נגזר - ראה server/utils/runwayRoute.js
  ['airfield_routes', 'source_runway_id', 'airfield_runways', 'id', 'CASCADE'],
  ['airfield_runways', 'airfield_id', 'airfields', 'id', 'CASCADE'],
  ['airfield_sectors', 'airfield_id', 'airfields', 'id', 'CASCADE'],
  ['airfield_status_types', 'airfield_id', 'airfields', 'id', 'CASCADE'],
  ['airfield_taxiways', 'airfield_id', 'airfields', 'id', 'CASCADE'],
  ['airfields', 'base_id', 'aviation_bases', 'id', 'SET NULL'],
  ['airfields', 'map_id', 'maps', 'id', 'SET NULL'],
  ['base_routes', 'airfield_id', 'airfields', 'id', 'CASCADE'],
  ['base_statuses', 'airfield_id', 'airfields', 'id', 'SET NULL'],
  ['bdh_alerts', 'target_preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['bdh_documents', 'created_by', 'crew_members', 'id', 'SET NULL'],
  ['bdh_documents', 'updated_by', 'crew_members', 'id', 'SET NULL'],
  ['bdh_items', 'bdh_id', 'bdh_documents', 'id', 'CASCADE'],
  ['block_tables', 'block_space_id', 'block_spaces', 'id', 'CASCADE'],
  ['blocks', 'block_table_id', 'block_tables', 'id', 'CASCADE'],
  ['civilian_strip_assignments', 'preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['civilian_strip_assignments', 'strip_id', 'strips', 'id', 'CASCADE'],
  ['classic_strip_rows', 'table_id', 'classic_strip_tables', 'id', 'CASCADE'],
  ['crew_member_workstations', 'crew_member_id', 'crew_members', 'id', 'CASCADE'],
  ['crew_member_workstations', 'workstation_preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['element_nav_routes', 'element_id', 'airfield_elements', 'id', 'CASCADE'],
  ['element_nav_routes', 'from_point_id', 'airfield_points', 'id', 'SET NULL'],
  ['element_nav_routes', 'to_point_id', 'airfield_points', 'id', 'SET NULL'],
  ['learned_digits', 'crew_member_id', 'crew_members', 'id', 'CASCADE'],
  ['map_transfer_points', 'map_id', 'maps', 'id', 'CASCADE'],
  ['map_transfer_points', 'preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['map_transfer_points', 'sector_id', 'sectors', 'id', 'CASCADE'],
  ['map_zone_operational_state', 'zone_id', 'map_zones', 'id', 'CASCADE'],
  ['map_zones', 'map_id', 'maps', 'id', 'CASCADE'],
  ['map_zones', 'parent_zone_id', 'map_zones', 'id', 'SET NULL'],
  ['maps', 'parent_map_id', 'maps', 'id', 'SET NULL'],
  ['mission_desk_service_state', 'preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['mission_desk_service_state', 'service_id', 'mission_desk_services', 'id', 'CASCADE'],
  ['mission_desk_services', 'desk_id', 'mission_desks', 'id', 'CASCADE'],
  ['position_merges', 'covered_preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['position_merges', 'covering_preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['preset_active_crew', 'preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['preset_aid_groups', 'group_id', 'aid_groups', 'id', 'CASCADE'],
  ['preset_aid_groups', 'preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['preset_links', 'preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['preset_view_stations', 'preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['preset_view_stations', 'target_preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['preset_mazaa_thresholds', 'preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['provisional_transfer_points', 'preset_a', 'workstation_presets', 'id', 'CASCADE'],
  ['provisional_transfer_points', 'preset_b', 'workstation_presets', 'id', 'CASCADE'],
  ['route_links', 'preset_id_a', 'workstation_presets', 'id', 'CASCADE'],
  ['route_links', 'preset_id_b', 'workstation_presets', 'id', 'CASCADE'],
  ['route_links', 'route_id_a', 'airfield_routes', 'id', 'CASCADE'],
  ['route_links', 'route_id_b', 'airfield_routes', 'id', 'CASCADE'],
  ['route_link_groups', 'airfield_id', 'airfields', 'id', 'CASCADE'],
  ['route_link_members', 'group_id', 'route_link_groups', 'id', 'CASCADE'],
  // route_link_members.preset_id - **אין** FK בכוונה. הקישור הוא בין שדות תעופה,
  // והעמודה נשארה כהיסטוריה בלבד (אינה נכתבת ואינה נקראת). ב-CASCADE מחיקת עמדה
  // הייתה מוחקת חברים בקישור ושוברת אותו בשקט. ה-FK מוסר ב-init.js.
  ['route_link_members', 'route_id', 'airfield_routes', 'id', 'CASCADE'],
  ['runway_grf', 'runway_id', 'airfield_runways', 'id', 'CASCADE'],
  ['runway_lighting', 'runway_id', 'airfield_runways', 'id', 'CASCADE'],
  ['runway_end_use', 'runway_id', 'airfield_runways', 'id', 'CASCADE'],
  ['runway_notams', 'runway_id', 'airfield_runways', 'id', 'CASCADE'],
  ['sector_neighbors', 'neighbor_id', 'sectors', 'id', 'CASCADE'],
  ['sector_neighbors', 'sector_id', 'sectors', 'id', 'CASCADE'],
  ['sticky_note_recipients', 'preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['sticky_note_recipients', 'sticky_note_id', 'sticky_notes', 'id', 'CASCADE'],
  ['sticky_notes', 'creator_preset_id', 'workstation_presets', 'id', 'SET NULL'],
  ['strip_aircraft_armaments', 'strip_aircraft_id', 'strip_aircraft', 'id', 'CASCADE'],
  ['strip_aircraft_systems', 'strip_aircraft_id', 'strip_aircraft', 'id', 'CASCADE'],
  ['strip_aircraft', 'strip_id', 'strips', 'id', 'CASCADE'],
  ['strip_serial_dismissals', 'serial_id', 'serials', 'id', 'CASCADE'],
  ['strip_serial_selections', 'serial_id', 'serials', 'id', 'SET NULL'],
  ['strip_serial_selections', 'strip_id', 'strips', 'id', 'CASCADE'],
  ['strip_station_notes', 'preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['strip_station_notes', 'strip_id', 'strips', 'id', 'CASCADE'],
  ['strip_table_assignments', 'preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['strip_table_assignments', 'strip_id', 'strips', 'id', 'CASCADE'],
  ['strip_transfers', 'from_sector_id', 'sectors', 'id', 'NO ACTION'],
  ['strip_transfers', 'initiated_by', 'workstations', 'id', 'NO ACTION'],
  ['strip_transfers', 'strip_id', 'strips', 'id', 'CASCADE'],
  ['strip_transfers', 'to_sector_id', 'sectors', 'id', 'NO ACTION'],
  ['strip_window_cells', 'column_id', 'strip_window_columns', 'id', 'CASCADE'],
  ['strip_window_columns', 'layout_id', 'strip_window_layouts', 'id', 'CASCADE'],
  ['strip_zone_assignments', 'altitude_range_id', 'zone_altitude_ranges', 'id', 'SET NULL'],
  ['strip_zone_assignments', 'strip_id', 'strips', 'id', 'CASCADE'],
  ['strip_zone_assignments', 'zone_id', 'map_zones', 'id', 'CASCADE'],
  ['strip_zone_extra_zones', 'strip_id', 'strips', 'id', 'CASCADE'],
  ['strip_zone_extra_zones', 'zone_id', 'map_zones', 'id', 'CASCADE'],
  ['strips', 'block_space_id', 'block_spaces', 'id', 'SET NULL'],
  ['strips', 'creator_crew_id', 'crew_members', 'id', 'SET NULL'],
  ['strips', 'creator_preset_id', 'workstation_presets', 'id', 'SET NULL'],
  ['strips', 'departure_base_id', 'aviation_bases', 'id', 'SET NULL'],
  // strips.held_by_workstation - **אין** FK בכוונה. העמודה הוצהרה מול
  // workstations(id) אבל הסמנטיקה שלה נדדה: מאז מעבר לעמדות-preset נכתב אליה
  // preset id (transfers.js), ובפועל 0 מ-31 הערכים בייצור הם UUID של עמדה
  // ו-31/31 הם workstation_presets.id. הוספת ה-FK הייתה מפילה כל קבלת העברה.
  // איחוד העמודה עם workstation_preset_id הוא רפקטור נפרד.
  ['strips', 'landing_airfield_id', 'aviation_bases', 'id', 'SET NULL'],
  ['strips', 'landing_base_id', 'aviation_bases', 'id', 'SET NULL'],
  ['strips', 'parent_strip_id', 'strips', 'id', 'SET NULL'],
  ['strips', 'sector_id', 'sectors', 'id', 'NO ACTION'],
  ['strips', 'takeoff_airfield_id', 'aviation_bases', 'id', 'SET NULL'],
  ['sub_sectors', 'neighbor_id', 'sectors', 'id', 'CASCADE'],
  ['sub_sectors', 'sector_id', 'sectors', 'id', 'CASCADE'],
  ['vehicle_gps', 'request_id', 'vehicle_requests', 'id', 'CASCADE'],
  ['vehicle_messages', 'request_id', 'vehicle_requests', 'id', 'CASCADE'],
  ['vehicle_requests', 'assigned_route_id', 'base_routes', 'id', 'SET NULL'],
  ['vehicle_requests', 'base_id', 'aviation_bases', 'id', 'SET NULL'],
  ['vehicle_requests', 'from_point_id', 'airfield_points', 'id', 'SET NULL'],
  ['vehicle_requests', 'to_point_id', 'airfield_points', 'id', 'SET NULL'],
  ['work_group_members', 'preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['work_group_members', 'work_group_id', 'work_groups', 'id', 'CASCADE'],
  ['work_group_notes', 'work_group_id', 'work_groups', 'id', 'CASCADE'],
  ['work_groups', 'admin_preset_id', 'workstation_presets', 'id', 'SET NULL'],
  ['workstation_bdh', 'bdh_id', 'bdh_documents', 'id', 'CASCADE'],
  ['workstation_bdh', 'preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['workstation_collab_state', 'preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['workstation_contacts', 'preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['workstation_personal_filters', 'crew_member_id', 'crew_members', 'id', 'CASCADE'],
  ['workstation_personal_filters', 'preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['workstation_presets', 'airfield_id', 'airfields', 'id', 'SET NULL'],
  ['workstation_presets', 'classic_strip_table_id', 'classic_strip_tables', 'id', 'SET NULL'],
  ['workstation_presets', 'classic_strip_table_id_night', 'classic_strip_tables', 'id', 'SET NULL'],
  ['workstation_presets', 'map2_id', 'maps', 'id', 'SET NULL'],
  ['workstation_presets', 'mission_desk_id', 'mission_desks', 'id', 'NO ACTION'],
  ['workstation_presets', 'sector_id', 'sectors', 'id', 'SET NULL'],
  ['workstation_presets', 'strip_window_id', 'strip_window_layouts', 'id', 'SET NULL'],
  ['workstation_presets', 'table_mode_id', 'table_modes', 'id', 'SET NULL'],
  ['workstation_session_roles', 'preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['debriefs', 'preset_id', 'workstation_presets', 'id', 'SET NULL'],
  ['station_sessions', 'preset_id', 'workstation_presets', 'id', 'SET NULL'],
  ['workstation_signals', 'preset_id', 'workstation_presets', 'id', 'CASCADE'],
  ['workstations', 'sector_id', 'sectors', 'id', 'NO ACTION'],
  ['zone_altitude_ranges', 'zone_id', 'map_zones', 'id', 'CASCADE'],
];

const RULE_SQL = { 'CASCADE': 'ON DELETE CASCADE', 'SET NULL': 'ON DELETE SET NULL', 'NO ACTION': '' };

// שם אחיד וצפוי, כדי שההוספה תישאר אידמפוטנטית גם בין גרסאות.
export const fkName = (table, col) => `fk_${table}_${col}`;

/**
 * משלים כל FK מוצהר שאינו קיים בסכמה הנוכחית.
 * @param {(q: string, p?: any[]) => Promise<{rows: any[]}>} query - pool.query או client.query
 * @returns {Promise<{added: string[], existed: number, skipped: string[], failed: {fk: string, reason: string}[]}>}
 */
export async function ensureForeignKeys(query) {
  const added = [], skipped = [], failed = [];
  let existed = 0;

  // כל ה-FK הקיימים בסכמה הנוכחית בשאילתה אחת - זול מ-120 בדיקות נפרדות.
  const { rows } = await query(`
    SELECT src.relname AS tbl, a.attname AS col
      FROM pg_constraint k
      JOIN pg_class src ON src.oid = k.conrelid
      JOIN pg_namespace n ON n.oid = src.relnamespace
      JOIN unnest(k.conkey) u(attnum) ON TRUE
      JOIN pg_attribute a ON a.attrelid = src.oid AND a.attnum = u.attnum
     WHERE k.contype = 'f' AND n.nspname = current_schema()`);
  const have = new Set(rows.map(r => `${r.tbl}.${r.col}`));

  for (const [table, col, refTable, refCol, rule] of FOREIGN_KEYS) {
    const fk = `${table}.${col}`;
    if (have.has(fk)) { existed++; continue; }
    try {
      // בכוונה **לא** NOT VALID: המטרה היא לתפוס שורות יתומות קיימות ולדווח
      // עליהן, לא להוסיף אילוץ שנראה קיים אך אינו מכסה את הנתונים הישנים.
      await query(`ALTER TABLE ${table} ADD CONSTRAINT ${fkName(table, col)}
        FOREIGN KEY (${col}) REFERENCES ${refTable}(${refCol}) ${RULE_SQL[rule]}`);
      added.push(fk);
    } catch (e) {
      const reason = String(e.message).split('\n')[0].slice(0, 110);
      // טבלה/עמודה שאינה קיימת בסכמת סביבה היא מצב תקין: חלק מהטבלאות
      // (קונפיגורציה, מיראז', GAPI) יושבות ב-public בלבד.
      if (/does not exist/i.test(reason)) skipped.push(fk);
      else failed.push({ fk, reason });
    }
  }
  return { added, existed, skipped, failed };
}
