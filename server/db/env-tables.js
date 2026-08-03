// סביבות תרגול — סיווג כל טבלאות ה-DB. זהו מנגנון הבטיחות המרכזי של הפיצ'ר:
// עם search_path = env_NN, public — טבלה תפעולית שחסרה בסכמת הסביבה תיפול
// בשקט ל-public (תרגול יכתוב לאמת!). לכן הסיווג חייב להיות מלא וסגור:
// checkTableClassification (רץ ב-boot) נכשל בקול על כל טבלה לא-מסווגת.
//
// תפעולית  = מידע שדה בזמן-ריצה — משוכפלת לכל סכמת env_NN (מבודדת פר-סביבה).
// קונפיג   = הגדרות admin/זהות — קיימת רק ב-public ומשותפת לכל 50 הסביבות.
// היברידית = תפעולית שמכילה גם שורות-הגדרה — משוכפלת + שורותיה מועתקות מ-public.

export const OPERATIONAL_TABLES = [
  // פ"מ (סטריפים) וילדיו
  'strips',
  'strip_aircraft',
  'strip_aircraft_armaments',
  'strip_aircraft_systems',
  'strip_table_assignments',
  'strip_station_notes',
  'civilian_strip_assignments',
  'strip_zone_assignments',
  'strip_zone_extra_zones',
  // מצב תפעולי של אזור מפה (בלוקי גובה פעילים + מגבלה) — ההגדרה של האזור
  // עצמו (map_zones) נשארת קונפיג, המצב החי מבודד פר-סביבה
  'map_zone_operational_state',
  // העברות עמדה
  'strip_transfers',
  'provisional_transfer_points',
  // ספרורים
  'serials',
  'strip_serial_selections',
  'strip_serial_dismissals',
  // סגירות + מצב שדה קרקעי בזמן-ריצה
  'closures',
  'airfield_polygon_statuses',
  'runway_grf',
  'runway_lighting',
  'runway_notams',
  'airfield_general_notams',
  'airfield_atis',
  // היברידיות: הגדרה + סטטוס באותה טבלה (שורות ההגדרה מועתקות מ-public)
  'airfield_elements',
  'airfield_taxiways',
  'base_statuses',
  // בלוקים — תוכן הקצאות גובה (המבנה block_spaces/block_tables הוא קונפיג)
  'blocks',
  // היסטוריה, הודעות ומצב תפעולי בין עמדות
  'activity_log',
  'workstation_messages',
  'workstation_signals',
  'bdh_alerts',
  'sticky_notes',
  'sticky_note_recipients',
  'workstation_collab_state',
  'mission_desk_service_state',
  'preset_active_crew',
  'workstation_session_roles',
  'station_sessions',
  'debriefs',
  'position_merges',
  'work_group_notes',
  // רכבים
  'vehicle_requests',
  'vehicle_gps',
  'vehicle_messages',
  // GAPI — תור יציאה + דדופ אירועים נכנסים (מבודדים פר-סביבה)
  'gapi_outbox',
  'gapi_inbound_events',
];

// תפעוליות שנפתחות עם עותק שורות מ-public (הגדרות שדה שסטטוס חי יושב עליהן).
// מגבלה מתועדת: עריכת שורה קיימת ב-public לא מתעדכנת בסכמות קיימות —
// רק שורות חדשות מסונכרנות ב-boot (syncHybridRows).
export const HYBRID_SEED_TABLES = [
  'airfield_elements',
  'airfield_taxiways',
  'base_statuses',
];

export const CONFIG_TABLES = [
  // זהות וצוות
  'crew_members',
  'crew_member_workstations',
  'work_groups',
  'work_group_members',
  'workstations',
  // טופולוגיה ועמדות
  'sectors',
  'sector_neighbors',
  'sub_sectors',
  'workstation_presets',
  'workstation_personal_filters',
  'workstation_contacts',
  'workstation_bdh',
  'preset_links',
  'preset_view_stations',
  'preset_aid_groups',
  'preset_mazaa_thresholds',
  'table_modes',
  // פריסות ותצוגות
  'strip_window_layouts',
  'strip_window_columns',
  'strip_window_cells',
  'classic_strip_tables',
  'classic_strip_rows',
  'block_spaces',
  'block_tables',
  // מפות ושדות
  'maps',
  'map_zones',
  'map_transfer_points',
  'zone_altitude_ranges',
  'airfields',
  'airfield_points',
  'airfield_routes',
  'airfield_runways',
  // הקפות ואלמנטיהן = שרטוט הגדרה של השדה (כמו מסלולים ונתיבים), לא מידע שדה חי
  'airfield_patterns',
  'airfield_pattern_elements',
  'airfield_element_types',
  'airfield_polygons',
  'airfield_sectors',
  'airfield_status_types',
  'element_nav_routes',
  'route_links',
  'route_link_groups',
  'route_link_members',
  'aviation_bases',
  'base_routes',
  // בד"ח ואמצעים
  'bdh_documents',
  'bdh_items',
  'aid_groups',
  'aid_items',
  // דסקים (הגדרה; ה-state תפעולי)
  'mission_desks',
  'mission_desk_services',
  // יחידות מבצעיות (רשימת ערכים לתחקירים) — הגדרה, לא מידע שדה
  'units',
  // מערכת
  'translations',
  // הערות והצעות על המערכת — משוב מהמפעיל למנהל הטכני, לא מידע שדה. חייב לשבת
  // ב-public בלבד: הצעה שנשלחה מתוך תרגול צריכה להגיע לאותה רשימה של מנהל המערכת.
  'suggestions',
  'system_defaults',
  'system_emblems',
  'default_armament_names',
  'default_system_names',
  'learned_digits',
  'learned_strokes',
];

// לא בסקופ הסביבות: legacy של AeroZone, טבלת המיראז' (מנוהלת חיצונית),
// ורישום הסביבות עצמו (חייב לשבת ב-public בלבד).
const IGNORED_EXACT = new Set(['mirage_users', 'environments', 'gapi_env_config']);
const IGNORED_PREFIXES = ['az_'];

const OPS_SET = new Set(OPERATIONAL_TABLES);
const CONFIG_SET = new Set(CONFIG_TABLES);

export function classifyTable(name) {
  if (IGNORED_EXACT.has(name) || IGNORED_PREFIXES.some(p => name.startsWith(p))) return 'ignored';
  if (OPS_SET.has(name)) return 'operational';
  if (CONFIG_SET.has(name)) return 'config';
  return null;
}

// בדיקת שלמות הסיווג מול הסכמה בפועל — רצה ב-boot אחרי initDb.
// טבלה לא-מסווגת ב-public = מפתח שכח לסווג טבלה חדשה → נכשלים בקול,
// כי המשמעות של אי-סיווג היא זליגת תרגול↔אמת שקטה בטבלה הזו.
export async function checkTableClassification(pool) {
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const unclassified = rows.map(r => r.table_name).filter(t => classifyTable(t) === null);
  if (unclassified.length) {
    throw new Error(
      `[environments] טבלאות לא מסווגות ב-server/db/env-tables.js: ${unclassified.join(', ')} — ` +
      `כל טבלה חדשה חייבת סיווג operational/config לפני עלייה`,
    );
  }
}
