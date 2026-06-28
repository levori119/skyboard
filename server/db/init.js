import pool from './pool.js';

export async function initDb() {
  const sq = async (q, p) => {
    try { return await pool.query(q, p); }
    catch(e) { console.warn('[initDb]', e.message.slice(0, 120)); return { rows: [], rowCount: 0 }; }
  };

  await sq(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  // ── Core tables ──────────────────────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS learned_digits (
    id SERIAL PRIMARY KEY,
    digit VARCHAR(1) NOT NULL,
    image_data TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // Stroke-based handwriting templates (offline $P recognizer). One row per
  // enrolled sample: a label + the raw strokes the user drew. source 'seed'|'user'.
  await sq(`CREATE TABLE IF NOT EXISTS learned_strokes (
    id SERIAL PRIMARY KEY,
    label VARCHAR(16) NOT NULL,
    strokes JSONB NOT NULL,
    source VARCHAR(8) NOT NULL DEFAULT 'user',
    crew_member_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await sq(`CREATE INDEX IF NOT EXISTS idx_learned_strokes_crew ON learned_strokes(crew_member_id)`);

  await sq(`CREATE TABLE IF NOT EXISTS sectors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    label_he VARCHAR(50),
    map_asset TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS sector_neighbors (
    id SERIAL PRIMARY KEY,
    sector_id INTEGER REFERENCES sectors(id) ON DELETE CASCADE,
    neighbor_id INTEGER REFERENCES sectors(id) ON DELETE CASCADE,
    UNIQUE(sector_id, neighbor_id)
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS workstations (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(50) NOT NULL,
    sector_id INTEGER REFERENCES sectors(id),
    auth_token VARCHAR(64),
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS strips (
    id SERIAL PRIMARY KEY,
    callsign VARCHAR(50) NOT NULL,
    sq VARCHAR(10),
    alt VARCHAR(10),
    task VARCHAR(50),
    sector_id INTEGER REFERENCES sectors(id),
    status VARCHAR(20) DEFAULT 'queued',
    x REAL DEFAULT 0,
    y REAL DEFAULT 0,
    on_map BOOLEAN DEFAULT FALSE,
    held_by_workstation VARCHAR(36) REFERENCES workstations(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS strip_transfers (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    strip_id INTEGER REFERENCES strips(id) ON DELETE CASCADE,
    from_sector_id INTEGER REFERENCES sectors(id),
    to_sector_id INTEGER REFERENCES sectors(id),
    initiated_by VARCHAR(36) REFERENCES workstations(id),
    status VARCHAR(20) DEFAULT 'pending',
    target_x REAL DEFAULT 0,
    target_y REAL DEFAULT 0,
    sub_sector_label VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS sub_sectors (
    id SERIAL PRIMARY KEY,
    sector_id INTEGER REFERENCES sectors(id) ON DELETE CASCADE,
    neighbor_id INTEGER REFERENCES sectors(id) ON DELETE CASCADE,
    label VARCHAR(50) NOT NULL,
    default_x REAL DEFAULT 0.2,
    default_y REAL DEFAULT 0.2,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── strips columns migrations ─────────────────────────────────────────────

  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS sector_id INTEGER REFERENCES sectors(id)`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'queued'`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS held_by_workstation VARCHAR(36)`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS notes TEXT`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS weapons JSONB DEFAULT '[]'`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS targets JSONB DEFAULT '[]'`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS systems JSONB DEFAULT '[]'`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS shkadia TEXT`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS takeoff_time TIMESTAMPTZ`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS airborne BOOLEAN DEFAULT FALSE`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS squadron VARCHAR(100)`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS number_of_formation VARCHAR(50)`);
  await sq(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS target_x REAL DEFAULT 0`);
  await sq(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS target_y REAL DEFAULT 0`);
  await sq(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS sub_sector_label VARCHAR(50)`);
  await sq(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS from_workstation_id INTEGER`);
  await sq(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS to_workstation_id INTEGER`);
  await sq(`ALTER TABLE sectors ADD COLUMN IF NOT EXISTS category VARCHAR(100)`);
  await sq(`ALTER TABLE sectors ADD COLUMN IF NOT EXISTS notes TEXT`);
  await sq(`ALTER TABLE sectors ADD COLUMN IF NOT EXISTS conflict_alt_delta INTEGER DEFAULT 500`);
  await sq(`UPDATE sectors SET conflict_alt_delta = conflict_alt_delta * 100 WHERE conflict_alt_delta > 0 AND conflict_alt_delta < 100`);

  // ── Workstation presets ───────────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS workstation_presets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    sector_id INTEGER REFERENCES sectors(id) ON DELETE SET NULL,
    map_id INTEGER,
    my_sub_sectors JSONB DEFAULT '[]',
    neighbor_sub_sectors JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS table_modes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    columns JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS relevant_sectors JSONB DEFAULT '[]'`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS table_mode_id INTEGER REFERENCES table_modes(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE table_modes ADD COLUMN IF NOT EXISTS frozen_columns INTEGER DEFAULT 0`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS partial_load INTEGER DEFAULT 3`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS full_load INTEGER DEFAULT 5`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS filter_query JSONB`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS conflict_alt_delta INTEGER DEFAULT 500`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS relevant_control_stations JSONB`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS in_table BOOLEAN DEFAULT false`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS erka VARCHAR(100)`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS koteret VARCHAR(200)`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS mivtza VARCHAR(100)`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS tzevet_shilta VARCHAR(100)`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS ta_shilta VARCHAR(100)`);

  // ── Crew members ──────────────────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS crew_members (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS workstation_personal_filters (
    id SERIAL PRIMARY KEY,
    preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE CASCADE,
    crew_member_id INTEGER REFERENCES crew_members(id) ON DELETE CASCADE,
    filter_query JSONB,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(preset_id, crew_member_id)
  )`);

  await sq(`ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS first_name VARCHAR(50)`);
  await sq(`ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS last_name VARCHAR(50)`);
  await sq(`ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS personal_id VARCHAR(20)`);
  await sq(`ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS is_team_lead BOOLEAN DEFAULT FALSE`);
  await sq(`ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS undo_duration_ms INTEGER`);
  await sq(`ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS ground_datk_filter INTEGER`);
  await sq(`ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS ground_status_filter JSONB`);
  await sq(`ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS ground_filter_mode VARCHAR(3)`);
  await sq(`ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS classic_panel_orders JSONB`);

  await sq(`CREATE TABLE IF NOT EXISTS crew_member_workstations (
    id SERIAL PRIMARY KEY,
    crew_member_id INTEGER REFERENCES crew_members(id) ON DELETE CASCADE,
    workstation_preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE CASCADE,
    UNIQUE(crew_member_id, workstation_preset_id)
  )`);

  await sq(`ALTER TABLE learned_digits ADD COLUMN IF NOT EXISTS crew_member_id INTEGER REFERENCES crew_members(id) ON DELETE CASCADE`);

  // ── Work groups ───────────────────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS work_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS work_group_members (
    work_group_id INTEGER REFERENCES work_groups(id) ON DELETE CASCADE,
    preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE CASCADE,
    PRIMARY KEY (work_group_id, preset_id)
  )`);

  await sq(`ALTER TABLE work_groups ADD COLUMN IF NOT EXISTS admin_preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE work_groups ADD COLUMN IF NOT EXISTS mazaa_regional VARCHAR(100)`);

  await sq(`CREATE TABLE IF NOT EXISTS work_group_notes (
    id SERIAL PRIMARY KEY,
    work_group_id INTEGER NOT NULL REFERENCES work_groups(id) ON DELETE CASCADE,
    title VARCHAR(200) DEFAULT '',
    content TEXT DEFAULT '',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by_name VARCHAR(100) DEFAULT ''
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS preset_links (
    id SERIAL PRIMARY KEY,
    preset_id INTEGER NOT NULL REFERENCES workstation_presets(id) ON DELETE CASCADE,
    url TEXT NOT NULL DEFAULT '',
    name VARCHAR(200) NOT NULL DEFAULT '',
    category VARCHAR(100) DEFAULT '',
    note TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0
  )`);

  // ── Sticky notes ─────────────────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS sticky_notes (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) DEFAULT '',
    content TEXT DEFAULT '',
    background_color VARCHAR(20) DEFAULT '#fef08a',
    creator_preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE SET NULL,
    creator_preset_name VARCHAR(100),
    creator_crew_name VARCHAR(100),
    allow_all_edit BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    last_edited_by_preset_name VARCHAR(100),
    last_edited_by_crew_name VARCHAR(100),
    last_edited_at TIMESTAMP
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS sticky_note_recipients (
    sticky_note_id INTEGER REFERENCES sticky_notes(id) ON DELETE CASCADE,
    preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE CASCADE,
    x FLOAT DEFAULT 100,
    y FLOAT DEFAULT 100,
    minimized BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (sticky_note_id, preset_id)
  )`);

  // ── Aid groups ────────────────────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS aid_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS aid_items (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES aid_groups(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('image','text')),
    content TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS preset_aid_groups (
    preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE CASCADE,
    group_id INTEGER REFERENCES aid_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (preset_id)
  )`);

  // ── Serials ───────────────────────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS serials (
    id SERIAL PRIMARY KEY,
    control_station VARCHAR(100) NOT NULL,
    serial_number INTEGER NOT NULL,
    essence TEXT,
    relevant_to VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL,
    imported_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS strip_serial_selections (
    id SERIAL PRIMARY KEY,
    strip_id INTEGER REFERENCES strips(id) ON DELETE CASCADE,
    control_station VARCHAR(100) NOT NULL,
    serial_id INTEGER REFERENCES serials(id) ON DELETE SET NULL,
    dismissed BOOLEAN DEFAULT false,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(strip_id, control_station)
  )`);

  await sq(`ALTER TABLE strip_serial_selections ADD COLUMN IF NOT EXISTS acted_at TIMESTAMPTZ`);
  await sq(`ALTER TABLE strip_serial_selections ADD COLUMN IF NOT EXISTS acted_by TEXT`);
  await sq(`ALTER TABLE strip_serial_selections ADD COLUMN IF NOT EXISTS acted_by_workstation TEXT`);

  await sq(`CREATE TABLE IF NOT EXISTS strip_serial_dismissals (
    strip_id INTEGER NOT NULL,
    serial_id INTEGER NOT NULL REFERENCES serials(id) ON DELETE CASCADE,
    dismissed_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (strip_id, serial_id)
  )`);

  // ── Block spaces ──────────────────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS block_spaces (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS block_tables (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    block_space_id INTEGER REFERENCES block_spaces(id) ON DELETE CASCADE
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS blocks (
    id SERIAL PRIMARY KEY,
    block_table_id INTEGER REFERENCES block_tables(id) ON DELETE CASCADE,
    alt_from INTEGER NOT NULL,
    alt_to INTEGER NOT NULL,
    mission VARCHAR(100),
    color VARCHAR(20) DEFAULT '#3b82f6',
    workstations JSONB DEFAULT '[]',
    platforms JSONB DEFAULT '[]',
    sort_order INTEGER DEFAULT 0
  )`);

  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS block_table_ids JSONB DEFAULT '[]'`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS vertical_time_based BOOLEAN DEFAULT TRUE`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS view_alt_min INTEGER`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS view_alt_max INTEGER`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS block_space_id INTEGER REFERENCES block_spaces(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS block_deviation BOOLEAN DEFAULT FALSE`);
  await sq(`ALTER TABLE block_tables ADD COLUMN IF NOT EXISTS note TEXT`);
  await sq(`ALTER TABLE block_tables ADD COLUMN IF NOT EXISTS category VARCHAR(100)`);
  await sq(`ALTER TABLE block_tables ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);
  await sq(`ALTER TABLE blocks ADD COLUMN IF NOT EXISTS note TEXT`);
  await sq(`ALTER TABLE blocks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);

  // ── BDH documents ─────────────────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS bdh_documents (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(200) NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES crew_members(id) ON DELETE SET NULL,
    updated_by INTEGER REFERENCES crew_members(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS bdh_items (
    id SERIAL PRIMARY KEY,
    bdh_id INTEGER REFERENCES bdh_documents(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL DEFAULT '',
    is_header BOOLEAN NOT NULL DEFAULT FALSE
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS workstation_bdh (
    preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE CASCADE,
    bdh_id INTEGER REFERENCES bdh_documents(id) ON DELETE CASCADE,
    PRIMARY KEY (preset_id, bdh_id)
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS bdh_alerts (
    id SERIAL PRIMARY KEY,
    target_preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    bdh_name VARCHAR(200),
    sender_preset_name VARCHAR(200),
    strip_ref VARCHAR(200),
    dismissed BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await sq(`ALTER TABLE bdh_alerts ADD COLUMN IF NOT EXISTS strip_ref VARCHAR(200)`);

  // ── Classic strip tables ──────────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS classic_strip_tables (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS classic_strip_rows (
    id SERIAL PRIMARY KEY,
    table_id INTEGER REFERENCES classic_strip_tables(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL DEFAULT 1,
    field_name VARCHAR(50),
    editable BOOLEAN DEFAULT false,
    text_color VARCHAR(30) DEFAULT '',
    bg_color VARCHAR(30) DEFAULT '',
    font_size INTEGER DEFAULT 14,
    bold BOOLEAN DEFAULT false,
    italic BOOLEAN DEFAULT false,
    underline BOOLEAN DEFAULT false,
    border_color VARCHAR(30) DEFAULT '',
    border_width INTEGER DEFAULT 0,
    text_align VARCHAR(10) DEFAULT 'center',
    row_label VARCHAR(50) DEFAULT '',
    UNIQUE(table_id, row_number)
  )`);

  await sq(`ALTER TABLE classic_strip_rows ADD COLUMN IF NOT EXISTS fields JSONB DEFAULT NULL`);
  await sq(`ALTER TABLE classic_strip_rows ADD COLUMN IF NOT EXISTS separator VARCHAR(10) DEFAULT ' / '`);
  await sq(`ALTER TABLE classic_strip_rows ALTER COLUMN text_color SET DEFAULT ''`);
  await sq(`UPDATE classic_strip_rows SET text_color = '' WHERE text_color = '#000000'`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS display_mode VARCHAR DEFAULT 'complex'`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS show_serials BOOLEAN DEFAULT TRUE`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS allow_view_switching BOOLEAN DEFAULT TRUE`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS classic_strip_table_id INTEGER REFERENCES classic_strip_tables(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS classic_strip_table_id_night INTEGER REFERENCES classic_strip_tables(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE classic_strip_tables ADD COLUMN IF NOT EXISTS layout_json JSONB`);
  await sq(`ALTER TABLE classic_strip_tables ADD COLUMN IF NOT EXISTS conditions_json JSONB`);
  await sq(`ALTER TABLE classic_strip_tables ADD COLUMN IF NOT EXISTS mode VARCHAR DEFAULT '3rows'`);
  await sq(`ALTER TABLE classic_strip_tables ADD COLUMN IF NOT EXISTS strip_height INTEGER DEFAULT 48`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS classic_receive_points JSONB DEFAULT '[]'`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS classic_transfer_points JSONB DEFAULT '[]'`);

  // ── Maps ──────────────────────────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS maps (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    image_data TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  // ── Airfields & ground ops ────────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS airfields (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    notes TEXT,
    map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS airfield_points (
    id SERIAL PRIMARY KEY,
    airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    x_pct FLOAT NOT NULL DEFAULT 50,
    y_pct FLOAT NOT NULL DEFAULT 50,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await sq(`ALTER TABLE airfield_points ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#3b82f6'`);
  await sq(`ALTER TABLE airfield_points ADD COLUMN IF NOT EXISTS marker VARCHAR(30) DEFAULT 'circle'`);
  await sq(`ALTER TABLE airfield_points ADD COLUMN IF NOT EXISTS density_warn INT DEFAULT 3`);
  await sq(`ALTER TABLE airfield_points ADD COLUMN IF NOT EXISTS point_type VARCHAR(10) DEFAULT NULL`);
  await sq(`ALTER TABLE airfield_points ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION DEFAULT NULL`);
  await sq(`ALTER TABLE airfield_points ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION DEFAULT NULL`);
  await sq(`ALTER TABLE airfield_points ADD COLUMN IF NOT EXISTS show_in_driver BOOLEAN DEFAULT false`);
  await sq(`ALTER TABLE airfields ADD COLUMN IF NOT EXISTS sids JSONB DEFAULT '[]'`);
  await sq(`ALTER TABLE airfields ADD COLUMN IF NOT EXISTS stars JSONB DEFAULT '[]'`);
  await sq(`ALTER TABLE airfields ADD COLUMN IF NOT EXISTS vector_data JSONB DEFAULT NULL`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS ground_status VARCHAR(30) DEFAULT 'none'`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS aircraft_positions JSONB DEFAULT '[]'`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS preset_type VARCHAR(20) DEFAULT 'standard'`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS airfield_id INTEGER REFERENCES airfields(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS classic_partner_preset_ids JSONB DEFAULT '[]'`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS classic_incoming_partner_preset_ids JSONB DEFAULT '[]'`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS classic_outgoing_partner_preset_ids JSONB DEFAULT '[]'`);
  await sq(`UPDATE workstation_presets
    SET classic_incoming_partner_preset_ids = classic_partner_preset_ids,
        classic_outgoing_partner_preset_ids = classic_partner_preset_ids
    WHERE classic_partner_preset_ids IS NOT NULL
      AND classic_partner_preset_ids::text <> '[]'
      AND (classic_incoming_partner_preset_ids IS NULL OR classic_incoming_partner_preset_ids::text = '[]')
      AND (classic_outgoing_partner_preset_ids IS NULL OR classic_outgoing_partner_preset_ids::text = '[]')`);
  await sq(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS to_preset_id INTEGER`);
  await sq(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS from_preset_id INTEGER`);
  await sq(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS note TEXT`);
  await sq(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS note_by_preset_id INTEGER`);
  await sq(`ALTER TABLE strips DROP CONSTRAINT IF EXISTS strips_workstation_preset_id_fkey`);
  await sq(`ALTER TABLE strips ADD CONSTRAINT strips_workstation_preset_id_fkey FOREIGN KEY (workstation_preset_id) REFERENCES workstation_presets(id) ON DELETE SET NULL`);

  // ── Per-aircraft tables ───────────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS strip_aircraft (
    id SERIAL PRIMARY KEY,
    strip_id INTEGER REFERENCES strips(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    datk INTEGER,
    kipa VARCHAR(100),
    UNIQUE(strip_id, idx)
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS default_armament_names (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 0
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS default_system_names (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 0
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS strip_aircraft_armaments (
    id SERIAL PRIMARY KEY,
    strip_aircraft_id INTEGER REFERENCES strip_aircraft(id) ON DELETE CASCADE,
    armament_name VARCHAR(200) NOT NULL DEFAULT '',
    quantity INTEGER DEFAULT 1
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS strip_aircraft_systems (
    id SERIAL PRIMARY KEY,
    strip_aircraft_id INTEGER REFERENCES strip_aircraft(id) ON DELETE CASCADE,
    system_name VARCHAR(200) NOT NULL DEFAULT '',
    status VARCHAR(20) DEFAULT 'שמיש'
  )`);

  // ── Map zones & flight zones ──────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS map_zones (
    id SERIAL PRIMARY KEY,
    map_id INTEGER REFERENCES maps(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
    polygon TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS zone_altitude_ranges (
    id SERIAL PRIMARY KEY,
    zone_id INTEGER NOT NULL REFERENCES map_zones(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL DEFAULT '',
    alt_min INTEGER,
    alt_max INTEGER,
    sort_order INTEGER DEFAULT 0
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS strip_zone_assignments (
    id SERIAL PRIMARY KEY,
    strip_id INTEGER NOT NULL REFERENCES strips(id) ON DELETE CASCADE,
    zone_id INTEGER NOT NULL REFERENCES map_zones(id) ON DELETE CASCADE,
    altitude_range_id INTEGER REFERENCES zone_altitude_ranges(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'planned',
    note TEXT DEFAULT '',
    coordination_note TEXT DEFAULT '',
    is_coordinated BOOLEAN DEFAULT false,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(strip_id)
  )`);

  await sq(`ALTER TABLE strip_zone_assignments ADD COLUMN IF NOT EXISTS pos_x FLOAT`);
  await sq(`ALTER TABLE strip_zone_assignments ADD COLUMN IF NOT EXISTS pos_y FLOAT`);
  await sq(`ALTER TABLE strip_zone_assignments ADD COLUMN IF NOT EXISTS requested_zone_ids JSONB DEFAULT '[]'`);
  await sq(`ALTER TABLE strip_zone_assignments ADD COLUMN IF NOT EXISTS map_id INTEGER`);
  try { await sq(`ALTER TABLE strip_zone_assignments ALTER COLUMN zone_id DROP NOT NULL`); } catch(_){}
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS flight_zones_mode BOOLEAN DEFAULT false`);

  await sq(`CREATE TABLE IF NOT EXISTS strip_zone_extra_zones (
    id SERIAL PRIMARY KEY,
    strip_id INTEGER NOT NULL REFERENCES strips(id) ON DELETE CASCADE,
    zone_id INTEGER NOT NULL REFERENCES map_zones(id) ON DELETE CASCADE,
    map_id INTEGER,
    UNIQUE(strip_id, zone_id)
  )`);

  // ── Activity log ──────────────────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    event_type VARCHAR(64) NOT NULL,
    severity VARCHAR(16) DEFAULT 'normal',
    workstation_preset_id INTEGER,
    workstation_name VARCHAR(255),
    crew_member_id INTEGER,
    crew_member_name VARCHAR(255),
    strip_id VARCHAR(64),
    strip_callsign VARCHAR(64),
    details JSONB DEFAULT '{}',
    related_preset_id INTEGER,
    related_preset_name VARCHAR(255)
  )`);

  // ── Base statuses ─────────────────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS base_statuses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),
    relevant_to VARCHAR(50) DEFAULT 'כולם',
    air_defense_status VARCHAR(100),
    absorption_status VARCHAR(100),
    bird_status VARCHAR(100),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS show_base_statuses BOOLEAN DEFAULT FALSE`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS base_status_ids JSONB DEFAULT '[]'`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS parent_base_id INTEGER`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS can_update_pressure BOOLEAN DEFAULT FALSE`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS show_dashboard BOOLEAN DEFAULT FALSE`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS can_update_mazaa BOOLEAN DEFAULT FALSE`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS can_update_atis BOOLEAN DEFAULT FALSE`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS can_update_notam BOOLEAN DEFAULT FALSE`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS mazaa_update_base_id INTEGER`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS fz_pin_display VARCHAR DEFAULT 'strip'`);

  await sq(`CREATE TABLE IF NOT EXISTS preset_mazaa_thresholds (
    id SERIAL PRIMARY KEY,
    preset_id INTEGER NOT NULL REFERENCES workstation_presets(id) ON DELETE CASCADE,
    mazaa_status VARCHAR(100) NOT NULL,
    partial_load INTEGER NOT NULL DEFAULT 3,
    full_load INTEGER NOT NULL DEFAULT 5,
    UNIQUE(preset_id, mazaa_status)
  )`);

  await sq(`ALTER TABLE workstation_presets DROP CONSTRAINT IF EXISTS workstation_presets_parent_base_id_fkey`);
  await sq(`ALTER TABLE base_statuses ADD COLUMN IF NOT EXISTS pressure_inhg FLOAT`);
  await sq(`ALTER TABLE base_statuses ADD COLUMN IF NOT EXISTS notam_text TEXT`);
  await sq(`ALTER TABLE base_statuses ADD COLUMN IF NOT EXISTS atis_text TEXT`);
  await sq(`ALTER TABLE base_statuses ADD COLUMN IF NOT EXISTS airfield_id INTEGER REFERENCES airfields(id) ON DELETE SET NULL`);

  // ── Aviation bases ────────────────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS aviation_bases (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),
    coord_n VARCHAR(10),
    coord_e VARCHAR(10),
    sids JSONB DEFAULT '[]',
    stars JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await sq(`ALTER TABLE aviation_bases ADD COLUMN IF NOT EXISTS pressure_inhg FLOAT`);
  await sq(`ALTER TABLE airfields ADD COLUMN IF NOT EXISTS base_id INTEGER REFERENCES aviation_bases(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE airfields ADD COLUMN IF NOT EXISTS custom_name VARCHAR(100)`);

  // ── Airfield routes & elements ────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS airfield_routes (
    id SERIAL PRIMARY KEY,
    airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) DEFAULT '#3b82f6',
    route_path JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await sq(`ALTER TABLE airfield_routes ADD COLUMN IF NOT EXISTS notes TEXT`);
  await sq(`ALTER TABLE airfield_routes ADD COLUMN IF NOT EXISTS route_category VARCHAR(20) DEFAULT 'general'`);
  await sq(`ALTER TABLE airfield_routes ADD COLUMN IF NOT EXISTS is_runway BOOLEAN DEFAULT FALSE`);
  await sq(`ALTER TABLE airfield_routes ADD COLUMN IF NOT EXISTS end_a_name VARCHAR(20)`);
  await sq(`ALTER TABLE airfield_routes ADD COLUMN IF NOT EXISTS end_b_name VARCHAR(20)`);

  await sq(`CREATE TABLE IF NOT EXISTS airfield_element_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    color VARCHAR(20) DEFAULT '#f59e0b',
    icon VARCHAR(200) DEFAULT '🔧'
  )`);

  await sq(`ALTER TABLE airfield_element_types ADD COLUMN IF NOT EXISTS can_change_status BOOLEAN DEFAULT FALSE`);
  await sq(`ALTER TABLE airfield_element_types ADD COLUMN IF NOT EXISTS allowed_statuses JSONB DEFAULT '[]'`);
  await sq(`ALTER TABLE airfield_element_types ADD COLUMN IF NOT EXISTS open_icon VARCHAR(200) DEFAULT NULL`);
  await sq(`ALTER TABLE airfield_element_types ADD COLUMN IF NOT EXISTS close_icon VARCHAR(200) DEFAULT NULL`);
  await sq(`ALTER TABLE airfield_element_types ADD COLUMN IF NOT EXISTS can_have_route BOOLEAN DEFAULT FALSE`);
  await sq(`ALTER TABLE airfield_element_types ADD COLUMN IF NOT EXISTS status_icons JSONB DEFAULT '{}'`);

  await sq(`CREATE TABLE IF NOT EXISTS airfield_elements (
    id SERIAL PRIMARY KEY,
    airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    element_type_id INTEGER REFERENCES airfield_element_types(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    status VARCHAR(20) DEFAULT 'תקין',
    note TEXT,
    x_pct FLOAT,
    y_pct FLOAT,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await sq(`ALTER TABLE airfield_elements ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT ''`);
  await sq(`ALTER TABLE airfield_elements ADD COLUMN IF NOT EXISTS display_state VARCHAR(20) DEFAULT 'normal'`);
  await sq(`ALTER TABLE airfield_elements ADD COLUMN IF NOT EXISTS blink_rate FLOAT DEFAULT 1.0`);
  await sq(`ALTER TABLE airfield_elements ADD COLUMN IF NOT EXISTS blink_colors VARCHAR(200) DEFAULT NULL`);
  await sq(`ALTER TABLE airfield_elements ADD COLUMN IF NOT EXISTS open_icon_key VARCHAR(200) DEFAULT NULL`);
  await sq(`ALTER TABLE airfield_elements ADD COLUMN IF NOT EXISTS close_icon_key VARCHAR(200) DEFAULT NULL`);
  await sq(`ALTER TABLE airfield_elements ADD COLUMN IF NOT EXISTS rotation SMALLINT DEFAULT 0`);
  await sq(`ALTER TABLE airfield_elements ADD COLUMN IF NOT EXISTS camera_url TEXT DEFAULT NULL`);
  await sq(`ALTER TABLE airfield_elements ADD COLUMN IF NOT EXISTS relevant_routes JSONB DEFAULT '[]'`);
  await sq(`ALTER TABLE airfield_elements ADD COLUMN IF NOT EXISTS blocking_statuses JSONB DEFAULT '[]'`);
  await sq(`ALTER TABLE airfield_elements ADD COLUMN IF NOT EXISTS hidden_on_map BOOLEAN DEFAULT false`);
  await sq(`ALTER TABLE airfield_elements ADD COLUMN IF NOT EXISTS show_in_driver BOOLEAN DEFAULT false`);

  // ── Workstation contacts & session ────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS workstation_contacts (
    id SERIAL PRIMARY KEY,
    preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE CASCADE,
    mahut VARCHAR(200) DEFAULT '',
    oketz VARCHAR(100) DEFAULT '',
    frequency VARCHAR(100) DEFAULT '',
    note VARCHAR(300) DEFAULT '',
    sort_order INTEGER DEFAULT 0
  )`);

  await sq(`ALTER TABLE workstation_contacts ADD COLUMN IF NOT EXISTS device_type VARCHAR(50) DEFAULT ''`);
  await sq(`ALTER TABLE workstation_contacts ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'ראשי'`);

  await sq(`CREATE TABLE IF NOT EXISTS preset_active_crew (
    preset_id INTEGER PRIMARY KEY REFERENCES workstation_presets(id) ON DELETE CASCADE,
    crew_name VARCHAR(200) DEFAULT '',
    crew_id INTEGER,
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // ── Strips: SID/STAR + partial formation + civilian ───────────────────────

  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS sid VARCHAR(50)`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS star VARCHAR(50)`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS departure_base_id INTEGER REFERENCES aviation_bases(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS landing_base_id INTEGER REFERENCES aviation_bases(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS preset_role VARCHAR(20)`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS datk_show_minutes INTEGER DEFAULT NULL`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS parent_strip_id INTEGER REFERENCES strips(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS aircraft_indices JSONB DEFAULT NULL`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS original_formation_count INTEGER DEFAULT NULL`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS formation_notes TEXT DEFAULT ''`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS parent_callsign VARCHAR(100) DEFAULT ''`);
  await sq(`ALTER TABLE strips DROP COLUMN IF EXISTS takeoff_airfield`);
  await sq(`ALTER TABLE strips DROP COLUMN IF EXISTS landing_airfield`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS takeoff_airfield_id INTEGER REFERENCES aviation_bases(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS landing_airfield_id INTEGER REFERENCES aviation_bases(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS civ_status VARCHAR(50) DEFAULT ''`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS civ_stand VARCHAR(50) DEFAULT ''`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS civ_dest VARCHAR(20) DEFAULT ''`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS civ_ssr VARCHAR(20) DEFAULT ''`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS civ_fl VARCHAR(20) DEFAULT ''`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS civ_route TEXT DEFAULT ''`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS civ_time VARCHAR(10) DEFAULT ''`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS civ_runway VARCHAR(10) DEFAULT ''`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS map_zone_name VARCHAR(100) DEFAULT ''`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS map_zone_alts VARCHAR(200) DEFAULT ''`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS map_pin_x FLOAT`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS map_pin_y FLOAT`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS strip_type VARCHAR(50) DEFAULT ''`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS creator_preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS manual_entry BOOLEAN DEFAULT FALSE`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS creator_crew_id INTEGER REFERENCES crew_members(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS creator_crew_name VARCHAR(100)`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS creator_preset_name VARCHAR(100)`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);

  // ── Geo-anchoring ─────────────────────────────────────────────────────────

  await sq(`ALTER TABLE maps ADD COLUMN IF NOT EXISTS anchor1_x_img REAL`);
  await sq(`ALTER TABLE maps ADD COLUMN IF NOT EXISTS anchor1_y_img REAL`);
  await sq(`ALTER TABLE maps ADD COLUMN IF NOT EXISTS anchor1_lat DOUBLE PRECISION`);
  await sq(`ALTER TABLE maps ADD COLUMN IF NOT EXISTS anchor1_lon DOUBLE PRECISION`);
  await sq(`ALTER TABLE maps ADD COLUMN IF NOT EXISTS anchor2_x_img REAL`);
  await sq(`ALTER TABLE maps ADD COLUMN IF NOT EXISTS anchor2_y_img REAL`);
  await sq(`ALTER TABLE maps ADD COLUMN IF NOT EXISTS anchor2_lat DOUBLE PRECISION`);
  await sq(`ALTER TABLE maps ADD COLUMN IF NOT EXISTS anchor2_lon DOUBLE PRECISION`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS map_lat DOUBLE PRECISION`);
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS map_lon DOUBLE PRECISION`);
  // per-strip override of the map pin display style ('icon' | 'strip'); null = follow preset/runtime default
  await sq(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS pin_display VARCHAR(8)`);
  await sq(`ALTER TABLE map_zones ADD COLUMN IF NOT EXISTS polygon_geo TEXT DEFAULT '[]'`);
  await sq(`ALTER TABLE map_zones ADD COLUMN IF NOT EXISTS parent_zone_id INTEGER REFERENCES map_zones(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE map_zones ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true`);
  await sq(`ALTER TABLE maps ADD COLUMN IF NOT EXISTS parent_map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE maps ADD COLUMN IF NOT EXISTS parent_rect JSONB`);

  // ── Strip table assignments & preset config ───────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS strip_table_assignments (
    strip_id  INTEGER NOT NULL REFERENCES strips(id) ON DELETE CASCADE,
    preset_id INTEGER NOT NULL REFERENCES workstation_presets(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (strip_id, preset_id)
  )`);

  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS civilian_columns JSONB DEFAULT '[]'`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS civilian_board_bg VARCHAR(20) DEFAULT ''`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS use_map_zones BOOLEAN DEFAULT false`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS dual_map_mode BOOLEAN DEFAULT false`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS map2_id INTEGER REFERENCES maps(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS dual_map_layout VARCHAR(20) DEFAULT 'side-by-side'`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS dual_map_split INTEGER DEFAULT 50`);
  // dual-map: transfer-point sectors shown on map 2 (map 1 uses relevant_sectors)
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS map2_transfer_points JSONB DEFAULT '[]'`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS suggest_alt_range BOOLEAN DEFAULT false`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS show_full_picture BOOLEAN DEFAULT false`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS blind_map_default BOOLEAN DEFAULT false`);
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS conflict_alt_rules JSONB DEFAULT '[]'`);

  // ── Strip window layouts ──────────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS strip_window_layouts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS strip_window_columns (
    id SERIAL PRIMARY KEY,
    layout_id INTEGER NOT NULL REFERENCES strip_window_layouts(id) ON DELETE CASCADE,
    col_index INTEGER NOT NULL DEFAULT 0,
    width INTEGER DEFAULT 120
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS strip_window_cells (
    id SERIAL PRIMARY KEY,
    column_id INTEGER NOT NULL REFERENCES strip_window_columns(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL DEFAULT 0,
    waypoint VARCHAR(100) DEFAULT '',
    bg_color VARCHAR(20) DEFAULT '#1e293b',
    header_color VARCHAR(20) DEFAULT '#f1f5f9'
  )`);

  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS strip_window_id INTEGER REFERENCES strip_window_layouts(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE strip_window_layouts ADD COLUMN IF NOT EXISTS layout_json JSONB`);

  // ── Civilian strip assignments ────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS civilian_strip_assignments (
    id SERIAL PRIMARY KEY,
    strip_id INTEGER NOT NULL REFERENCES strips(id) ON DELETE CASCADE,
    preset_id INTEGER NOT NULL REFERENCES workstation_presets(id) ON DELETE CASCADE,
    col_key VARCHAR(100) NOT NULL DEFAULT '',
    sub_col VARCHAR(50) NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE(strip_id, preset_id)
  )`);

  // ── Collab state & messages ───────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS workstation_collab_state (
    preset_id INTEGER PRIMARY KEY REFERENCES workstation_presets(id) ON DELETE CASCADE,
    pen_strokes JSONB DEFAULT '[]',
    map_shapes JSONB DEFAULT '[]',
    conflict_resolutions JSONB DEFAULT '{}',
    clear_at TEXT DEFAULT '',
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS workstation_messages (
    id SERIAL PRIMARY KEY,
    from_preset_id INTEGER,
    from_preset_name VARCHAR(100),
    to_preset_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    seen BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`);

  // ── Signal board: persistent toggle-able status messages between workstations.
  // Each row is a button owned by a preset; when active=true it shows (green) to its
  // recipients (to_all = all presets, else recipient_preset_ids). source 'preset'
  // (configured, persists) | 'adhoc' (session-only, cleared on logout).
  await sq(`CREATE TABLE IF NOT EXISTS workstation_signals (
    id SERIAL PRIMARY KEY,
    preset_id INTEGER NOT NULL REFERENCES workstation_presets(id) ON DELETE CASCADE,
    text VARCHAR(120) NOT NULL,
    to_all BOOLEAN DEFAULT false,
    recipient_preset_ids JSONB DEFAULT '[]',
    active BOOLEAN DEFAULT false,
    source VARCHAR(8) NOT NULL DEFAULT 'adhoc',
    sort_order INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await sq(`CREATE INDEX IF NOT EXISTS idx_ws_signals_preset ON workstation_signals(preset_id)`);
  await sq(`CREATE INDEX IF NOT EXISTS idx_ws_signals_active ON workstation_signals(active)`);
  // per-workstation catalog of known message texts (NOT global — avoids clutter)
  await sq(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS signal_catalog JSONB DEFAULT '[]'`);

  // ── Position merges (איחוד/פיצול עמדה) ──────────────────────────────────────
  // עמדה A מכסה עמדה B בזמן ריצה. ended_at IS NULL = פעיל. בעלות פריטים לא משתנה
  // באיחוד (עמדת מקור נשמרת) — רק handover בפיצול מעביר בעלות (ראה route).
  await sq(`CREATE TABLE IF NOT EXISTS position_merges (
    id SERIAL PRIMARY KEY,
    covering_preset_id INTEGER NOT NULL REFERENCES workstation_presets(id) ON DELETE CASCADE,
    covered_preset_id  INTEGER NOT NULL REFERENCES workstation_presets(id) ON DELETE CASCADE,
    started_by INTEGER,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at   TIMESTAMPTZ
  )`);
  // עמדה מכוסה ע"י לכל היותר עמדה אחת בו-זמנית
  await sq(`CREATE UNIQUE INDEX IF NOT EXISTS uq_position_merges_covered_active ON position_merges(covered_preset_id) WHERE ended_at IS NULL`);
  await sq(`CREATE INDEX IF NOT EXISTS idx_position_merges_covering_active ON position_merges(covering_preset_id) WHERE ended_at IS NULL`);

  // ── Element nav routes ────────────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS element_nav_routes (
    element_id INTEGER PRIMARY KEY REFERENCES airfield_elements(id) ON DELETE CASCADE,
    from_point_id INTEGER REFERENCES airfield_points(id) ON DELETE SET NULL,
    to_point_id INTEGER REFERENCES airfield_points(id) ON DELETE SET NULL,
    via_route_ids JSONB DEFAULT '[]',
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS route_links (
    id SERIAL PRIMARY KEY,
    preset_id_a INTEGER NOT NULL REFERENCES workstation_presets(id) ON DELETE CASCADE,
    route_id_a INTEGER NOT NULL REFERENCES airfield_routes(id) ON DELETE CASCADE,
    preset_id_b INTEGER NOT NULL REFERENCES workstation_presets(id) ON DELETE CASCADE,
    route_id_b INTEGER NOT NULL REFERENCES airfield_routes(id) ON DELETE CASCADE,
    UNIQUE(preset_id_a, route_id_a, preset_id_b)
  )`);

  // ── Airfield runways, taxiways, GRF, lighting, NOTAMs, ATIS ─────────────

  await sq(`CREATE TABLE IF NOT EXISTS airfield_runways (
    id SERIAL PRIMARY KEY,
    airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    name VARCHAR(20),
    heading_a VARCHAR(4),
    heading_b VARCHAR(4),
    length_ft INTEGER,
    length_m INTEGER,
    sort_order INTEGER DEFAULT 0
  )`);

  await sq(`ALTER TABLE airfield_runways ADD COLUMN IF NOT EXISTS true_bearing INT`);
  await sq(`ALTER TABLE airfield_runways ADD COLUMN IF NOT EXISTS heading_a_true INT`);
  await sq(`ALTER TABLE airfield_runways ADD COLUMN IF NOT EXISTS heading_b_true INT`);
  await sq(`ALTER TABLE airfield_runways ADD COLUMN IF NOT EXISTS start_x_pct FLOAT`);
  await sq(`ALTER TABLE airfield_runways ADD COLUMN IF NOT EXISTS start_y_pct FLOAT`);
  await sq(`ALTER TABLE airfield_runways ADD COLUMN IF NOT EXISTS end_x_pct FLOAT`);
  await sq(`ALTER TABLE airfield_runways ADD COLUMN IF NOT EXISTS end_y_pct FLOAT`);
  await sq(`ALTER TABLE airfield_runways ADD COLUMN IF NOT EXISTS tora_m INT`);
  await sq(`ALTER TABLE airfield_runways ADD COLUMN IF NOT EXISTS toda_m INT`);
  await sq(`ALTER TABLE airfield_runways ADD COLUMN IF NOT EXISTS asda_m INT`);
  await sq(`ALTER TABLE airfield_runways ADD COLUMN IF NOT EXISTS lda_m INT`);
  await sq(`ALTER TABLE airfield_runways ADD COLUMN IF NOT EXISTS clearway_m INT`);
  await sq(`ALTER TABLE airfield_runways ADD COLUMN IF NOT EXISTS tora_b_m INT`);
  await sq(`ALTER TABLE airfield_runways ADD COLUMN IF NOT EXISTS toda_b_m INT`);
  await sq(`ALTER TABLE airfield_runways ADD COLUMN IF NOT EXISTS asda_b_m INT`);
  await sq(`ALTER TABLE airfield_runways ADD COLUMN IF NOT EXISTS lda_b_m INT`);
  await sq(`ALTER TABLE airfield_runways ADD COLUMN IF NOT EXISTS clearway_b_m INT`);

  await sq(`CREATE TABLE IF NOT EXISTS airfield_taxiways (
    id SERIAL PRIMARY KEY,
    airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL DEFAULT '',
    notam_text TEXT,
    is_closed BOOLEAN NOT NULL DEFAULT false,
    is_closed_vehicles BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS runway_notams (
    id SERIAL PRIMARY KEY,
    runway_id INTEGER REFERENCES airfield_runways(id) ON DELETE CASCADE,
    notam_type VARCHAR(20) DEFAULT 'text',
    text_content TEXT,
    shorten_end VARCHAR(2),
    shorten_amount_ft INTEGER,
    shorten_amount_m INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS airfield_general_notams (
    id SERIAL PRIMARY KEY,
    airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    text_content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS airfield_atis (
    id SERIAL PRIMARY KEY,
    airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    letter CHAR(1) NOT NULL DEFAULT 'A',
    obs_time VARCHAR(6),
    approach_type VARCHAR(50),
    landing_runway VARCHAR(100),
    departure_runway VARCHAR(100),
    ceiling_value INTEGER,
    ceiling_type VARCHAR(10),
    visibility VARCHAR(20),
    weather_phenomena TEXT,
    temperature INTEGER,
    dewpoint INTEGER,
    wind_direction INTEGER,
    wind_speed INTEGER,
    wind_gust INTEGER,
    altimeter_qnh VARCHAR(20),
    notam_info TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(airfield_id)
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS runway_grf (
    id SERIAL PRIMARY KEY,
    runway_id INTEGER REFERENCES airfield_runways(id) ON DELETE CASCADE,
    heading VARCHAR(4) NOT NULL,
    rwycc_t INTEGER, coverage_t INTEGER, depth_t VARCHAR(10), contaminant_t VARCHAR(50),
    rwycc_m INTEGER, coverage_m INTEGER, depth_m VARCHAR(10), contaminant_m VARCHAR(50),
    rwycc_r INTEGER, coverage_r INTEGER, depth_r VARCHAR(10), contaminant_r VARCHAR(50),
    reported_at TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    notes TEXT,
    UNIQUE(runway_id, heading)
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS runway_lighting (
    id SERIAL PRIMARY KEY,
    runway_id INTEGER REFERENCES airfield_runways(id) ON DELETE CASCADE UNIQUE,
    centerline_level INTEGER NOT NULL DEFAULT 0 CHECK (centerline_level BETWEEN 0 AND 3),
    edge_level INTEGER NOT NULL DEFAULT 0 CHECK (edge_level BETWEEN 0 AND 3),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await sq(`ALTER TABLE runway_lighting ADD COLUMN IF NOT EXISTS threshold_lights INTEGER NOT NULL DEFAULT 0`);
  await sq(`ALTER TABLE runway_lighting ADD COLUMN IF NOT EXISTS end_lights INTEGER NOT NULL DEFAULT 0`);

  // ── Airfield polygons & sectors ───────────────────────────────────────────

  await sq(`ALTER TABLE airfield_polygon_statuses ADD COLUMN IF NOT EXISTS grf_status VARCHAR(20) DEFAULT NULL`);
  await sq(`ALTER TABLE airfield_polygon_statuses ADD COLUMN IF NOT EXISTS rvr_meters INTEGER DEFAULT NULL`);

  // ── Session roles ─────────────────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS workstation_session_roles (
    id SERIAL PRIMARY KEY,
    preset_id INTEGER UNIQUE REFERENCES workstation_presets(id) ON DELETE CASCADE,
    kshp VARCHAR(200) DEFAULT '',
    mefale VARCHAR(200) DEFAULT '',
    achori VARCHAR(200) DEFAULT '',
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // ── Closures ──────────────────────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS closures (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL DEFAULT '',
    category VARCHAR(100) DEFAULT '',
    color VARCHAR(20) DEFAULT '#ef4444',
    alt_min INTEGER,
    alt_max INTEGER,
    dates JSONB DEFAULT '[]',
    time_start VARCHAR(5) DEFAULT '',
    time_end VARCHAR(5) DEFAULT '',
    closure_status VARCHAR(20) DEFAULT 'coordinated',
    active BOOLEAN DEFAULT true,
    polygon_geo JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ── Vehicle / Driver system ───────────────────────────────────────────────

  await sq(`CREATE TABLE IF NOT EXISTS base_routes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    waypoints JSONB DEFAULT '[]',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await sq(`ALTER TABLE base_routes ADD COLUMN IF NOT EXISTS airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE`);
  await sq(`ALTER TABLE base_routes ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#f97316'`);
  await sq(`ALTER TABLE base_routes ADD COLUMN IF NOT EXISTS route_type VARCHAR(20) DEFAULT 'vehicle'`);

  await sq(`CREATE TABLE IF NOT EXISTS vehicle_requests (
    id SERIAL PRIMARY KEY,
    driver_name VARCHAR(100) NOT NULL,
    base_name VARCHAR(100) NOT NULL,
    supply_type VARCHAR(100) NOT NULL,
    destination VARCHAR(200) NOT NULL,
    vehicle_type VARCHAR(100) DEFAULT '',
    plate_number VARCHAR(50) DEFAULT '',
    status VARCHAR(30) DEFAULT 'pending',
    assigned_route_id INTEGER REFERENCES base_routes(id) ON DELETE SET NULL,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await sq(`ALTER TABLE vehicle_requests ADD COLUMN IF NOT EXISTS origin VARCHAR(200) DEFAULT ''`);
  await sq(`ALTER TABLE vehicle_requests ADD COLUMN IF NOT EXISTS from_point_id INTEGER REFERENCES airfield_points(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE vehicle_requests ADD COLUMN IF NOT EXISTS to_point_id INTEGER REFERENCES airfield_points(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE vehicle_requests ADD COLUMN IF NOT EXISTS base_id INTEGER REFERENCES aviation_bases(id) ON DELETE SET NULL`);
  await sq(`ALTER TABLE vehicle_requests ADD COLUMN IF NOT EXISTS via_route_ids JSONB DEFAULT '[]'`);
  await sq(`ALTER TABLE vehicle_requests ADD COLUMN IF NOT EXISTS show_on_map BOOLEAN DEFAULT false`);

  await sq(`CREATE TABLE IF NOT EXISTS vehicle_gps (
    id SERIAL PRIMARY KEY,
    request_id INTEGER REFERENCES vehicle_requests(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    heading DOUBLE PRECISION DEFAULT 0,
    speed DOUBLE PRECISION DEFAULT 0,
    timestamp TIMESTAMPTZ DEFAULT NOW()
  )`);

  await sq(`CREATE INDEX IF NOT EXISTS vehicle_gps_req_idx ON vehicle_gps(request_id, timestamp DESC)`);

  await sq(`CREATE TABLE IF NOT EXISTS vehicle_messages (
    id SERIAL PRIMARY KEY,
    request_id INTEGER REFERENCES vehicle_requests(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    seen BOOLEAN DEFAULT FALSE
  )`);

  // ── System defaults ───────────────────────────────────────────────────────
  await sq(`CREATE TABLE IF NOT EXISTS system_defaults (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT DEFAULT '',
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // ── Airfield polygons, sectors, status types (missing from original initDb) ──
  await sq(`CREATE TABLE IF NOT EXISTS airfield_polygons (
    id SERIAL PRIMARY KEY,
    airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES airfield_polygons(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL DEFAULT '',
    color VARCHAR(20) DEFAULT '#3b82f6',
    notes TEXT,
    polygon JSONB DEFAULT '[]',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS airfield_sectors (
    id SERIAL PRIMARY KEY,
    airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL DEFAULT '',
    notes TEXT,
    rect JSONB DEFAULT '{"x":10,"y":10,"w":30,"h":20}',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS airfield_status_types (
    id SERIAL PRIMARY KEY,
    airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL DEFAULT '',
    color VARCHAR(20) DEFAULT '#6b7280',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await sq(`CREATE TABLE IF NOT EXISTS airfield_polygon_statuses (
    id SERIAL PRIMARY KEY,
    polygon_id INTEGER NOT NULL REFERENCES airfield_polygons(id) ON DELETE CASCADE,
    status_type_id INTEGER REFERENCES airfield_status_types(id) ON DELETE SET NULL,
    note TEXT DEFAULT '',
    grf_status VARCHAR(20) DEFAULT NULL,
    rvr_meters INTEGER DEFAULT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(polygon_id)
  )`);

  // ── Performance indexes: עמודות חמות שנשאלות בתדירות גבוהה ──────────────────
  // ללא index הן נסרקות seq-scan; עם latency ~250ms ל-Neon ו-polling תכוף זה מצטבר.
  // CREATE INDEX IF NOT EXISTS — idempotent ובטוח (טבלאות קטנות → מיידי). ראה CODE_REVIEW_2.md.
  await sq(`CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp DESC)`);
  await sq(`CREATE INDEX IF NOT EXISTS idx_strips_preset ON strips(workstation_preset_id)`);
  await sq(`CREATE INDEX IF NOT EXISTS idx_strips_status ON strips(status)`);
  await sq(`CREATE INDEX IF NOT EXISTS idx_transfers_to_preset ON strip_transfers(to_preset_id)`);
  await sq(`CREATE INDEX IF NOT EXISTS idx_transfers_from_preset ON strip_transfers(from_preset_id)`);
  await sq(`CREATE INDEX IF NOT EXISTS idx_transfers_status ON strip_transfers(status)`);
  await sq(`CREATE INDEX IF NOT EXISTS idx_map_zones_map ON map_zones(map_id)`);
  await sq(`CREATE INDEX IF NOT EXISTS idx_airfield_elements_af ON airfield_elements(airfield_id)`);
  await sq(`CREATE INDEX IF NOT EXISTS idx_airfield_polygons_af ON airfield_polygons(airfield_id)`);
  await sq(`CREATE INDEX IF NOT EXISTS idx_bdh_alerts_target ON bdh_alerts(target_preset_id, created_at DESC)`);
  await sq(`CREATE INDEX IF NOT EXISTS idx_ws_messages_to ON workstation_messages(to_preset_id)`);
  await sq(`CREATE INDEX IF NOT EXISTS idx_sticky_recipients_preset ON sticky_note_recipients(preset_id)`);

  // ── Timezone fix: כל עמדות הזמן חייבות להיות timestamptz ────────────────────
  // עמודת 'timestamp without time zone' נקראת ע"י pg כזמן מקומי → הסטה כשהשרת לא ב-UTC
  // (למשל UTC+3 בישראל), מה ששבר השוואות זמן (התראות בד"ח) ותצוגות שעה.
  // ההמרה מפרשת ערכים קיימים כ-UTC (כך נשמרו ע"י NOW()/CURRENT_TIMESTAMP על שרת UTC),
  // מדלגת על טבלאות az_* (AeroZone הישן), ו-idempotent (רצה רק על עמודות שעוד לא הומרו).
  await sq(`DO $$
    DECLARE r record;
    BEGIN
      FOR r IN SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema='public' AND data_type='timestamp without time zone'
          AND table_name NOT LIKE 'az\\_%'
      LOOP
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE ''UTC''',
                       r.table_name, r.column_name, r.column_name);
      END LOOP;
    END $$;`);

  console.log('[DB] Schema initialized');
}

export async function cleanupExpiredStrips() {
  try {
    const result = await pool.query(
      `DELETE FROM strips WHERE manual_entry = TRUE AND expires_at IS NOT NULL AND expires_at < NOW()`
    );
    if (result.rowCount > 0) console.log(`[cleanup] Deleted ${result.rowCount} expired manual strips`);
  } catch (err) {
    console.error('[cleanup] Error deleting expired strips:', err.message);
  }
}
