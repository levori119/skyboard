// סביבות תרגול — בדיקות סיווג הטבלאות (TDD, לפני מימוש)
// הסיווג הוא מנגנון הבטיחות המרכזי: טבלה תפעולית שחסרה בסכמת env תגרום
// ל-fallthrough שקט ל-public (תרגול כותב לאמת) — לכן הסיווג חייב להיות מלא וסגור.
import { describe, it, expect } from 'vitest';
import {
  OPERATIONAL_TABLES, HYBRID_SEED_TABLES, CONFIG_TABLES, classifyTable,
} from './env-tables.js';

describe('env-tables — עקביות הסיווג', () => {
  it('אין טבלה גם תפעולית וגם קונפיגורציה', () => {
    const config = new Set(CONFIG_TABLES);
    const overlap = OPERATIONAL_TABLES.filter(t => config.has(t));
    expect(overlap).toEqual([]);
  });

  it('טבלאות היברידיות (העתקת שורות מ-public) הן תת-קבוצה של התפעוליות', () => {
    const ops = new Set(OPERATIONAL_TABLES);
    for (const t of HYBRID_SEED_TABLES) {
      expect(ops.has(t), `${t} חייבת להיות מסווגת תפעולית`).toBe(true);
    }
  });

  it('אין כפילויות בתוך רשימה', () => {
    expect(new Set(OPERATIONAL_TABLES).size).toBe(OPERATIONAL_TABLES.length);
    expect(new Set(CONFIG_TABLES).size).toBe(CONFIG_TABLES.length);
  });
});

describe('env-tables — סיווג טבלאות מפתח', () => {
  const mustBeOperational = [
    // פ"מ וילדיו
    'strips', 'strip_aircraft', 'strip_aircraft_armaments', 'strip_aircraft_systems',
    'strip_table_assignments', 'civilian_strip_assignments',
    'strip_zone_assignments', 'strip_zone_extra_zones',
    // העברות
    'strip_transfers', 'provisional_transfer_points',
    // ספרורים
    'serials', 'strip_serial_selections', 'strip_serial_dismissals',
    // סגירות + מצב שדה קרקעי בזמן-ריצה
    'closures', 'airfield_polygon_statuses', 'runway_grf', 'runway_lighting',
    'runway_notams', 'airfield_general_notams', 'airfield_atis',
    // לוג + הודעות + מצב תפעולי
    'activity_log', 'workstation_messages', 'workstation_signals', 'bdh_alerts',
    'sticky_notes', 'sticky_note_recipients', 'workstation_collab_state',
    'mission_desk_service_state', 'preset_active_crew', 'workstation_session_roles',
    'position_merges', 'work_group_notes',
    // מצב בסיס + רכבים
    'base_statuses', 'vehicle_requests', 'vehicle_gps', 'vehicle_messages',
  ];
  const mustBeConfig = [
    'sectors', 'sector_neighbors', 'workstations', 'workstation_presets',
    'crew_members', 'maps', 'map_zones', 'translations', 'airfields',
    'airfield_element_types', 'airfield_runways',
    'classic_strip_tables', 'classic_strip_rows',
    'mission_desks', 'mission_desk_services', 'learned_digits', 'learned_strokes',
    'system_defaults', 'aviation_bases',
  ];

  it.each(mustBeOperational)('%s → תפעולית (מבודדת פר-סביבה)', (t) => {
    expect(classifyTable(t)).toBe('operational');
  });

  it.each(mustBeConfig)('%s → קונפיגורציה (משותפת, public בלבד)', (t) => {
    expect(classifyTable(t)).toBe('config');
  });

  it('טבלאות היברידיות — בדיוק שלוש: הגדרה+סטטוס באותה טבלה', () => {
    expect([...HYBRID_SEED_TABLES].sort()).toEqual(
      ['airfield_elements', 'airfield_taxiways', 'base_statuses'],
    );
  });

  it('טבלאות מוחרגות: legacy של AeroZone, מיראז\', רישום הסביבות עצמו', () => {
    expect(classifyTable('az_anything')).toBe('ignored');
    expect(classifyTable('mirage_users')).toBe('ignored');
    expect(classifyTable('environments')).toBe('ignored');
  });

  it('טבלה לא מוכרת → null (בדיקת ה-boot תיכשל עליה בקול)', () => {
    expect(classifyTable('some_future_table')).toBe(null);
  });
});
