import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function initDb() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS learned_digits (
      id SERIAL PRIMARY KEY,
      digit VARCHAR(1) NOT NULL,
      image_data TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sectors (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) NOT NULL UNIQUE,
      label_he VARCHAR(50),
      map_asset TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sector_neighbors (
      id SERIAL PRIMARY KEY,
      sector_id INTEGER REFERENCES sectors(id) ON DELETE CASCADE,
      neighbor_id INTEGER REFERENCES sectors(id) ON DELETE CASCADE,
      UNIQUE(sector_id, neighbor_id)
    )
  `);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workstations (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name VARCHAR(50) NOT NULL,
      sector_id INTEGER REFERENCES sectors(id),
      auth_token VARCHAR(64),
      last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS strips (
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
    )
  `);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS strip_transfers (
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
    )
  `);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sub_sectors (
      id SERIAL PRIMARY KEY,
      sector_id INTEGER REFERENCES sectors(id) ON DELETE CASCADE,
      neighbor_id INTEGER REFERENCES sectors(id) ON DELETE CASCADE,
      label VARCHAR(50) NOT NULL,
      default_x REAL DEFAULT 0.2,
      default_y REAL DEFAULT 0.2,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS sector_id INTEGER REFERENCES sectors(id)`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'queued'`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS held_by_workstation VARCHAR(36)`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS notes TEXT`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS weapons JSONB DEFAULT '[]'`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS targets JSONB DEFAULT '[]'`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS systems JSONB DEFAULT '[]'`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS shkadia TEXT`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS takeoff_time TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS airborne BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS squadron VARCHAR(100)`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS number_of_formation VARCHAR(50)`);
  await pool.query(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS target_x REAL DEFAULT 0`);
  await pool.query(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS target_y REAL DEFAULT 0`);
  await pool.query(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS sub_sector_label VARCHAR(50)`);
  await pool.query(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS from_workstation_id INTEGER`);
  await pool.query(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS to_workstation_id INTEGER`);
  
  // Sectors new columns
  await pool.query(`ALTER TABLE sectors ADD COLUMN IF NOT EXISTS category VARCHAR(100)`);
  await pool.query(`ALTER TABLE sectors ADD COLUMN IF NOT EXISTS notes TEXT`);
  await pool.query(`ALTER TABLE sectors ADD COLUMN IF NOT EXISTS conflict_alt_delta INTEGER DEFAULT 500`);
  // Migrate old "hundreds of feet" values to direct feet (multiply by 100)
  await pool.query(`UPDATE sectors SET conflict_alt_delta = conflict_alt_delta * 100 WHERE conflict_alt_delta > 0 AND conflict_alt_delta < 100`);
  
  // Workstation presets table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workstation_presets (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      sector_id INTEGER REFERENCES sectors(id) ON DELETE SET NULL,
      map_id INTEGER,
      my_sub_sectors JSONB DEFAULT '[]',
      neighbor_sub_sectors JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Add relevant_sectors column
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS relevant_sectors JSONB DEFAULT '[]'`);

  // Table modes
  await pool.query(`
    CREATE TABLE IF NOT EXISTS table_modes (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      columns JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS table_mode_id INTEGER REFERENCES table_modes(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE table_modes ADD COLUMN IF NOT EXISTS frozen_columns INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS partial_load INTEGER DEFAULT 3`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS full_load INTEGER DEFAULT 5`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS filter_query JSONB`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS conflict_alt_delta INTEGER DEFAULT 500`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS relevant_control_stations JSONB`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS in_table BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS erka VARCHAR(100)`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS koteret VARCHAR(200)`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS mivtza VARCHAR(100)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workstation_personal_filters (
      id SERIAL PRIMARY KEY,
      preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE CASCADE,
      crew_member_id INTEGER REFERENCES crew_members(id) ON DELETE CASCADE,
      filter_query JSONB,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(preset_id, crew_member_id)
    )
  `);

  // Crew members table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crew_members (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      is_admin BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Add new columns to crew_members
  await pool.query(`ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS first_name VARCHAR(50)`);
  await pool.query(`ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS last_name VARCHAR(50)`);
  await pool.query(`ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS personal_id VARCHAR(20)`);
  await pool.query(`ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS is_team_lead BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS undo_duration_ms INTEGER`);
  await pool.query(`ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS ground_datk_filter INTEGER`);
  await pool.query(`ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS ground_status_filter JSONB`);
  await pool.query(`ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS ground_filter_mode VARCHAR(3)`);
  await pool.query(`ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS classic_panel_orders JSONB`);
  
  // Junction table for crew member approved workstations
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crew_member_workstations (
      id SERIAL PRIMARY KEY,
      crew_member_id INTEGER REFERENCES crew_members(id) ON DELETE CASCADE,
      workstation_preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE CASCADE,
      UNIQUE(crew_member_id, workstation_preset_id)
    )
  `);
  
  // Add crew_member_id to learned_digits
  await pool.query(`ALTER TABLE learned_digits ADD COLUMN IF NOT EXISTS crew_member_id INTEGER REFERENCES crew_members(id) ON DELETE CASCADE`);
  
  // Insert default admin
  await pool.query(`INSERT INTO crew_members (name, first_name, last_name, is_admin) VALUES ('אורי לב', 'אורי', 'לב', TRUE) ON CONFLICT (name) DO NOTHING`);

  // --- Seed production data ---

  // Additional crew members
  await pool.query(`INSERT INTO crew_members (name, first_name, last_name, personal_id, is_admin) VALUES ('אורן בן דור', 'אורן', 'בן דור', '5229214', FALSE) ON CONFLICT (name) DO NOTHING`);
  await pool.query(`INSERT INTO crew_members (name, first_name, last_name, personal_id, is_admin) VALUES ('יוחאי שטיינברג', 'יוחאי', 'שטיינברג', '34234', TRUE) ON CONFLICT (name) DO NOTHING`);

  // Sectors (transfer points)
  const sectorsToSeed = [
    { name: 'CENTER',            label_he: 'מרכז',              category: null,                notes: null },
    { name: 'SOUTH',             label_he: 'דרום',              category: null,                notes: null },
    { name: 'Ctr6',              label_he: 'חצרים',             category: null,                notes: null },
    { name: 'Ctr8',              label_he: 'תלנוף',             category: null,                notes: null },
    { name: 'GILO',              label_he: 'גילה',              category: 'מעבר בין 305-304', notes: 'כעגכצצת-40' },
    { name: 'תווך - מטרו צפון', label_he: 'תווך - מטרו צפון', category: null,                notes: 'מעבר בין תווך למטרו' },
    { name: 'תווך - מטרו מרכז', label_he: 'תווך - מטרו מרכז', category: null,                notes: 'מעבר בין תווך למטרו מרכז' },
  ];
  for (const s of sectorsToSeed) {
    await pool.query(
      `INSERT INTO sectors (name, label_he, category, notes) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO NOTHING`,
      [s.name, s.label_he, s.category, s.notes]
    );
  }

  // Build sector name→id lookup
  const { rows: allSectors } = await pool.query(`SELECT id, name FROM sectors`);
  const sectorByName = {};
  for (const row of allSectors) sectorByName[row.name] = row.id;

  // Sector neighbors (CENTER ↔ SOUTH)
  const neighborPairs = [['CENTER', 'SOUTH'], ['SOUTH', 'CENTER']];
  for (const [a, b] of neighborPairs) {
    if (sectorByName[a] && sectorByName[b]) {
      await pool.query(
        `INSERT INTO sector_neighbors (sector_id, neighbor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [sectorByName[a], sectorByName[b]]
      );
    }
  }

  // Sub-sectors (only if table is empty)
  const { rows: ssCount } = await pool.query(`SELECT COUNT(*) FROM sub_sectors`);
  if (ssCount[0].count === '0') {
    const subSectorsToSeed = [
      { sector: 'CENTER', neighbor: 'SOUTH', label: 'דרום-מערב', x: 0.2, y: 0.8 },
      { sector: 'CENTER', neighbor: 'SOUTH', label: 'דרום-מזרח', x: 0.8, y: 0.8 },
      { sector: 'SOUTH',  neighbor: 'CENTER', label: 'מרכז-צפון', x: 0.5, y: 0.2 },
    ];
    for (const ss of subSectorsToSeed) {
      if (sectorByName[ss.sector] && sectorByName[ss.neighbor]) {
        await pool.query(
          `INSERT INTO sub_sectors (sector_id, neighbor_id, label, default_x, default_y) VALUES ($1, $2, $3, $4, $5)`,
          [sectorByName[ss.sector], sectorByName[ss.neighbor], ss.label, ss.x, ss.y]
        );
      }
    }
  }

  // Table modes (only if table is empty)
  const { rows: tmCount } = await pool.query(`SELECT COUNT(*) FROM table_modes`);
  if (tmCount[0].count === '0') {
    const tableModeCols = JSON.stringify([
      {"id":"1773735155535","key":"callSign","field":"callSign","label":"או\"ק","editable":"none","isCustom":false},
      {"id":"1773735157671","key":"squadron","field":"squadron","label":"טייסת","editable":"none","isCustom":false},
      {"id":"1773735158284","key":"alt","field":"alt","label":"גובה","editable":"none","isCustom":false},
      {"id":"1773735158452","key":"weapons","field":"weapons","label":"חימושים","editable":"none","isCustom":false},
      {"id":"1773735158857","key":"targets","field":"targets","label":"מטרות","editable":"none","isCustom":false},
      {"id":"1773735169469","key":"shkadia","field":"shkadia","label":"שקדיה","editable":"keyboard","isCustom":false},
      {"id":"1773735174949","key":"sector","field":"sector","label":"אזור","editable":"none","isCustom":false},
      {"id":"1773735179082","key":"notes","field":"notes","label":"הערות","editable":"handwriting","isCustom":false},
      {"id":"1773735184891","key":"transfer","field":"transfer","label":"סתם טקסט","editable":"none","isCustom":false},
      {"id":"custom_1773737467768","key":"custom_1773737467768","label":"ספרור פסחים","editable":"both","isCustom":true}
    ]);
    await pool.query(`INSERT INTO table_modes (name, columns) VALUES ('בתק עומק', $1)`, [tableModeCols]);
  }

  // Workstation presets (only if table is empty)
  const { rows: wpCount } = await pool.query(`SELECT COUNT(*) FROM workstation_presets`);
  if (wpCount[0].count === '0') {
    const { rows: tmRows } = await pool.query(`SELECT id FROM table_modes WHERE name = 'בתק עומק' LIMIT 1`);
    const tmId = tmRows.length > 0 ? tmRows[0].id : null;

    const presetsToSeed = [
      { name: 'מרחבי 305', sectors: ['GILO'],                                      tableMode: null },
      { name: 'מרחבי 304', sectors: ['GILO'],                                      tableMode: null },
      { name: 'מטרו צפון', sectors: ['תווך - מטרו צפון'],                          tableMode: tmId },
      { name: 'תווך',      sectors: ['תווך - מטרו צפון', 'תווך - מטרו מרכז'],     tableMode: tmId },
      { name: 'מטרו מרכז', sectors: ['תווך - מטרו מרכז'],                          tableMode: tmId },
    ];

    for (const p of presetsToSeed) {
      const relevantIds = p.sectors.map(n => sectorByName[n]).filter(Boolean);
      await pool.query(
        `INSERT INTO workstation_presets (name, map_id, relevant_sectors, table_mode_id) VALUES ($1, NULL, $2, $3)`,
        [p.name, JSON.stringify(relevantIds), p.tableMode]
      );
    }

    // Link all crew members to all presets
    const { rows: allCrew }    = await pool.query(`SELECT id FROM crew_members`);
    const { rows: allPresets } = await pool.query(`SELECT id FROM workstation_presets`);
    for (const crew of allCrew) {
      for (const preset of allPresets) {
        await pool.query(
          `INSERT INTO crew_member_workstations (crew_member_id, workstation_preset_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [crew.id, preset.id]
        );
      }
    }
  }

  // Work Groups
  await pool.query(`
    CREATE TABLE IF NOT EXISTS work_groups (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS work_group_members (
      work_group_id INTEGER REFERENCES work_groups(id) ON DELETE CASCADE,
      preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE CASCADE,
      PRIMARY KEY (work_group_id, preset_id)
    )
  `);

  // Work group admin + notes
  await pool.query(`ALTER TABLE work_groups ADD COLUMN IF NOT EXISTS admin_preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE SET NULL`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS work_group_notes (
      id SERIAL PRIMARY KEY,
      work_group_id INTEGER NOT NULL REFERENCES work_groups(id) ON DELETE CASCADE,
      title VARCHAR(200) DEFAULT '',
      content TEXT DEFAULT '',
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_by_name VARCHAR(100) DEFAULT ''
    )
  `);

  // Preset links
  await pool.query(`
    CREATE TABLE IF NOT EXISTS preset_links (
      id SERIAL PRIMARY KEY,
      preset_id INTEGER NOT NULL REFERENCES workstation_presets(id) ON DELETE CASCADE,
      url TEXT NOT NULL DEFAULT '',
      name VARCHAR(200) NOT NULL DEFAULT '',
      category VARCHAR(100) DEFAULT '',
      note TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    )
  `);

  // Sticky Notes
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sticky_notes (
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
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sticky_note_recipients (
      sticky_note_id INTEGER REFERENCES sticky_notes(id) ON DELETE CASCADE,
      preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE CASCADE,
      x FLOAT DEFAULT 100,
      y FLOAT DEFAULT 100,
      minimized BOOLEAN DEFAULT FALSE,
      PRIMARY KEY (sticky_note_id, preset_id)
    )
  `);

  // Workstation Aids
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aid_groups (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aid_items (
      id SERIAL PRIMARY KEY,
      group_id INTEGER REFERENCES aid_groups(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      type VARCHAR(10) NOT NULL CHECK (type IN ('image','text')),
      content TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS preset_aid_groups (
      preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES aid_groups(id) ON DELETE CASCADE,
      PRIMARY KEY (preset_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS serials (
      id SERIAL PRIMARY KEY,
      control_station VARCHAR(100) NOT NULL,
      serial_number INTEGER NOT NULL,
      essence TEXT,
      relevant_to VARCHAR(200),
      created_at TIMESTAMPTZ NOT NULL,
      imported_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS strip_serial_selections (
      id SERIAL PRIMARY KEY,
      strip_id INTEGER REFERENCES strips(id) ON DELETE CASCADE,
      control_station VARCHAR(100) NOT NULL,
      serial_id INTEGER REFERENCES serials(id) ON DELETE SET NULL,
      dismissed BOOLEAN DEFAULT false,
      assigned_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(strip_id, control_station)
    )
  `);
  await pool.query(`ALTER TABLE strip_serial_selections ADD COLUMN IF NOT EXISTS acted_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE strip_serial_selections ADD COLUMN IF NOT EXISTS acted_by TEXT`);
  await pool.query(`ALTER TABLE strip_serial_selections ADD COLUMN IF NOT EXISTS acted_by_workstation TEXT`);

  // Per-serial dismissals (tracks which specific serials were marked "not relevant" per strip)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS strip_serial_dismissals (
      strip_id INTEGER NOT NULL,
      serial_id INTEGER NOT NULL REFERENCES serials(id) ON DELETE CASCADE,
      dismissed_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (strip_id, serial_id)
    )
  `);

  // --- Block Spaces & Block Tables ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS block_spaces (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS block_tables (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      block_space_id INTEGER REFERENCES block_spaces(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocks (
      id SERIAL PRIMARY KEY,
      block_table_id INTEGER REFERENCES block_tables(id) ON DELETE CASCADE,
      alt_from INTEGER NOT NULL,
      alt_to INTEGER NOT NULL,
      mission VARCHAR(100),
      color VARCHAR(20) DEFAULT '#3b82f6',
      workstations JSONB DEFAULT '[]',
      platforms JSONB DEFAULT '[]',
      sort_order INTEGER DEFAULT 0
    )
  `);

  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS block_table_ids JSONB DEFAULT '[]'`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS vertical_time_based BOOLEAN DEFAULT TRUE`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS view_alt_min INTEGER`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS view_alt_max INTEGER`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS block_space_id INTEGER REFERENCES block_spaces(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS block_deviation BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE block_tables ADD COLUMN IF NOT EXISTS note TEXT`);
  await pool.query(`ALTER TABLE block_tables ADD COLUMN IF NOT EXISTS category VARCHAR(100)`);
  await pool.query(`ALTER TABLE block_tables ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);
  await pool.query(`ALTER TABLE blocks ADD COLUMN IF NOT EXISTS note TEXT`);
  await pool.query(`ALTER TABLE blocks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);

  // --- BDH ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bdh_documents (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      category VARCHAR(200) NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      created_by INTEGER REFERENCES crew_members(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES crew_members(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bdh_items (
      id SERIAL PRIMARY KEY,
      bdh_id INTEGER REFERENCES bdh_documents(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL DEFAULT '',
      is_header BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workstation_bdh (
      preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE CASCADE,
      bdh_id INTEGER REFERENCES bdh_documents(id) ON DELETE CASCADE,
      PRIMARY KEY (preset_id, bdh_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bdh_alerts (
      id SERIAL PRIMARY KEY,
      target_preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      bdh_name VARCHAR(200),
      sender_preset_name VARCHAR(200),
      strip_ref VARCHAR(200),
      dismissed BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // --- Classic Strip Tables ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS classic_strip_tables (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS classic_strip_rows (
      id SERIAL PRIMARY KEY,
      table_id INTEGER REFERENCES classic_strip_tables(id) ON DELETE CASCADE,
      row_number INTEGER NOT NULL DEFAULT 1,
      field_name VARCHAR(50),
      editable BOOLEAN DEFAULT false,
      text_color VARCHAR(30) DEFAULT '#000000',
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
    )
  `);
  await pool.query(`ALTER TABLE classic_strip_rows ADD COLUMN IF NOT EXISTS fields JSONB DEFAULT NULL`);
  await pool.query(`ALTER TABLE classic_strip_rows ADD COLUMN IF NOT EXISTS separator VARCHAR(10) DEFAULT ' / '`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS display_mode VARCHAR DEFAULT 'complex'`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS show_serials BOOLEAN DEFAULT TRUE`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS allow_view_switching BOOLEAN DEFAULT TRUE`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS classic_strip_table_id INTEGER REFERENCES classic_strip_tables(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS classic_strip_table_id_night INTEGER REFERENCES classic_strip_tables(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS classic_receive_points JSONB DEFAULT '[]'`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS classic_transfer_points JSONB DEFAULT '[]'`);

  // Ground (GROUND workstation) tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS airfields (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      notes TEXT,
      map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS airfield_points (
      id SERIAL PRIMARY KEY,
      airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      x_pct FLOAT NOT NULL DEFAULT 50,
      y_pct FLOAT NOT NULL DEFAULT 50,
      display_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE airfield_points ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#3b82f6'`);
  await pool.query(`ALTER TABLE airfield_points ADD COLUMN IF NOT EXISTS marker VARCHAR(30) DEFAULT 'circle'`);
  await pool.query(`ALTER TABLE airfield_points ADD COLUMN IF NOT EXISTS density_warn INT DEFAULT 3`);
  await pool.query(`ALTER TABLE airfield_points ADD COLUMN IF NOT EXISTS point_type VARCHAR(10) DEFAULT NULL`);
  await pool.query(`ALTER TABLE airfields ADD COLUMN IF NOT EXISTS sids JSONB DEFAULT '[]'`);
  await pool.query(`ALTER TABLE airfields ADD COLUMN IF NOT EXISTS stars JSONB DEFAULT '[]'`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS ground_status VARCHAR(30) DEFAULT 'none'`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS aircraft_positions JSONB DEFAULT '[]'`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS preset_type VARCHAR(20) DEFAULT 'standard'`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS airfield_id INTEGER REFERENCES airfields(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS classic_partner_preset_ids JSONB DEFAULT '[]'`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS classic_incoming_partner_preset_ids JSONB DEFAULT '[]'`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS classic_outgoing_partner_preset_ids JSONB DEFAULT '[]'`);
  // One-time migration: copy legacy bidirectional partners into both incoming and outgoing arrays
  await pool.query(`
    UPDATE workstation_presets
    SET classic_incoming_partner_preset_ids = classic_partner_preset_ids,
        classic_outgoing_partner_preset_ids = classic_partner_preset_ids
    WHERE classic_partner_preset_ids IS NOT NULL
      AND classic_partner_preset_ids::text <> '[]'
      AND (classic_incoming_partner_preset_ids IS NULL OR classic_incoming_partner_preset_ids::text = '[]')
      AND (classic_outgoing_partner_preset_ids IS NULL OR classic_outgoing_partner_preset_ids::text = '[]')
  `);
  await pool.query(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS to_preset_id INTEGER`);
  await pool.query(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS from_preset_id INTEGER`);
  await pool.query(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS note TEXT`);
  await pool.query(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS note_by_preset_id INTEGER`);
  // Fix legacy rows where text_color was incorrectly defaulted to '#000000' — reset to empty so dark mode works
  await pool.query(`UPDATE classic_strip_rows SET text_color = '' WHERE text_color = '#000000'`);
  // Fix classic_strip_rows default to empty string (not black) for new rows
  await pool.query(`ALTER TABLE classic_strip_rows ALTER COLUMN text_color SET DEFAULT ''`);
  // Fix strips.workstation_preset_id FK from NO ACTION → SET NULL so preset deletion works
  await pool.query(`ALTER TABLE strips DROP CONSTRAINT IF EXISTS strips_workstation_preset_id_fkey`);
  await pool.query(`ALTER TABLE strips ADD CONSTRAINT strips_workstation_preset_id_fkey FOREIGN KEY (workstation_preset_id) REFERENCES workstation_presets(id) ON DELETE SET NULL`);

  // strip_aircraft — per-aircraft datk/kipa data for ground workstation
  await pool.query(`
    CREATE TABLE IF NOT EXISTS strip_aircraft (
      id SERIAL PRIMARY KEY,
      strip_id INTEGER REFERENCES strips(id) ON DELETE CASCADE,
      idx INTEGER NOT NULL,
      datk INTEGER,
      kipa VARCHAR(100),
      UNIQUE(strip_id, idx)
    )
  `);

  // default_armament_names / default_system_names — admin configurable quick-pick lists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS default_armament_names (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL UNIQUE,
      sort_order INTEGER DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS default_system_names (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL UNIQUE,
      sort_order INTEGER DEFAULT 0
    )
  `);

  // strip_aircraft_armaments — per-aircraft armament/payload configuration
  await pool.query(`
    CREATE TABLE IF NOT EXISTS strip_aircraft_armaments (
      id SERIAL PRIMARY KEY,
      strip_aircraft_id INTEGER REFERENCES strip_aircraft(id) ON DELETE CASCADE,
      armament_name VARCHAR(200) NOT NULL DEFAULT '',
      quantity INTEGER DEFAULT 1
    )
  `);

  // strip_aircraft_systems — per-aircraft systems with operational status
  await pool.query(`
    CREATE TABLE IF NOT EXISTS strip_aircraft_systems (
      id SERIAL PRIMARY KEY,
      strip_aircraft_id INTEGER REFERENCES strip_aircraft(id) ON DELETE CASCADE,
      system_name VARCHAR(200) NOT NULL DEFAULT '',
      status VARCHAR(20) DEFAULT 'שמיש'
    )
  `);

  // map_zones — named polygon zones on any map
  await pool.query(`
    CREATE TABLE IF NOT EXISTS map_zones (
      id SERIAL PRIMARY KEY,
      map_id INTEGER REFERENCES maps(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      color VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
      polygon TEXT NOT NULL DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // zone_altitude_ranges — altitude ranges per map zone (for flight zones mode)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS zone_altitude_ranges (
      id SERIAL PRIMARY KEY,
      zone_id INTEGER NOT NULL REFERENCES map_zones(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL DEFAULT '',
      alt_min INTEGER,
      alt_max INTEGER,
      sort_order INTEGER DEFAULT 0
    )
  `);

  // strip_zone_assignments — strip assigned to a zone+altitude in flight zones mode
  await pool.query(`
    CREATE TABLE IF NOT EXISTS strip_zone_assignments (
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
    )
  `);

  await pool.query(`ALTER TABLE strip_zone_assignments ADD COLUMN IF NOT EXISTS pos_x FLOAT`);
  await pool.query(`ALTER TABLE strip_zone_assignments ADD COLUMN IF NOT EXISTS pos_y FLOAT`);
  await pool.query(`ALTER TABLE strip_zone_assignments ADD COLUMN IF NOT EXISTS requested_zone_ids JSONB DEFAULT '[]'`);
  await pool.query(`ALTER TABLE strip_zone_assignments ADD COLUMN IF NOT EXISTS map_id INTEGER`);
  try { await pool.query(`ALTER TABLE strip_zone_assignments ALTER COLUMN zone_id DROP NOT NULL`); } catch(_){}
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS flight_zones_mode BOOLEAN DEFAULT false`);

  // strip_zone_extra_zones — additional zones per strip (replaces requested_zone_ids JSONB)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS strip_zone_extra_zones (
      id SERIAL PRIMARY KEY,
      strip_id INTEGER NOT NULL REFERENCES strips(id) ON DELETE CASCADE,
      zone_id INTEGER NOT NULL REFERENCES map_zones(id) ON DELETE CASCADE,
      map_id INTEGER,
      UNIQUE(strip_id, zone_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_log (
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
    )
  `);

  // Base statuses
  await pool.query(`
    CREATE TABLE IF NOT EXISTS base_statuses (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      code VARCHAR(20),
      relevant_to VARCHAR(50) DEFAULT 'כולם',
      air_defense_status VARCHAR(100),
      absorption_status VARCHAR(100),
      bird_status VARCHAR(100),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS show_base_statuses BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS base_status_ids JSONB DEFAULT '[]'`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS parent_base_id INTEGER`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS can_update_pressure BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS show_dashboard BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS can_update_mazaa BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE bdh_alerts ADD COLUMN IF NOT EXISTS strip_ref VARCHAR(200)`);
  await pool.query(`ALTER TABLE work_groups ADD COLUMN IF NOT EXISTS mazaa_regional VARCHAR(100)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS preset_mazaa_thresholds (
      id SERIAL PRIMARY KEY,
      preset_id INTEGER NOT NULL REFERENCES workstation_presets(id) ON DELETE CASCADE,
      mazaa_status VARCHAR(100) NOT NULL,
      partial_load INTEGER NOT NULL DEFAULT 3,
      full_load INTEGER NOT NULL DEFAULT 5,
      UNIQUE(preset_id, mazaa_status)
    )
  `);
  await pool.query(`ALTER TABLE workstation_presets DROP CONSTRAINT IF EXISTS workstation_presets_parent_base_id_fkey`);
  await pool.query(`ALTER TABLE base_statuses ADD COLUMN IF NOT EXISTS pressure_inhg FLOAT`);
  // pressure_inhg lives on aviation_bases (parent base for shared pressure)
  await pool.query(`ALTER TABLE aviation_bases ADD COLUMN IF NOT EXISTS pressure_inhg FLOAT`);

  // Aviation bases — SID/STAR management
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aviation_bases (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      code VARCHAR(20),
      coord_n VARCHAR(10),
      coord_e VARCHAR(10),
      sids JSONB DEFAULT '[]',
      stars JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  // Airfield routes — taxi instruction paths
  await pool.query(`
    CREATE TABLE IF NOT EXISTS airfield_routes (
      id SERIAL PRIMARY KEY,
      airfield_id INTEGER REFERENCES airfields(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      color VARCHAR(20) DEFAULT '#3b82f6',
      route_path JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workstation_contacts (
      id SERIAL PRIMARY KEY,
      preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE CASCADE,
      mahut VARCHAR(200) DEFAULT '',
      oketz VARCHAR(100) DEFAULT '',
      frequency VARCHAR(100) DEFAULT '',
      note VARCHAR(300) DEFAULT '',
      sort_order INTEGER DEFAULT 0
    )
  `);
  await pool.query(`ALTER TABLE workstation_contacts ADD COLUMN IF NOT EXISTS device_type VARCHAR(50) DEFAULT ''`);
  await pool.query(`ALTER TABLE workstation_contacts ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'ראשי'`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS preset_active_crew (
      preset_id INTEGER PRIMARY KEY REFERENCES workstation_presets(id) ON DELETE CASCADE,
      crew_name VARCHAR(200) DEFAULT '',
      crew_id INTEGER,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  // Strip SID/STAR and departure/landing base fields
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS sid VARCHAR(50)`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS star VARCHAR(50)`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS departure_base_id INTEGER REFERENCES aviation_bases(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS landing_base_id INTEGER REFERENCES aviation_bases(id) ON DELETE SET NULL`);
  // Workstation preset role: 'tower' | 'approach' | null
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS preset_role VARCHAR(20)`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS datk_show_minutes INTEGER DEFAULT NULL`);
  // Airfield route notes and polygon
  await pool.query(`ALTER TABLE airfield_routes ADD COLUMN IF NOT EXISTS notes TEXT`);
  // Airfield vector data
  await pool.query(`ALTER TABLE airfields ADD COLUMN IF NOT EXISTS vector_data JSONB DEFAULT NULL`);
  // Airfield element types (global list: כבל, רשת, כבאית, etc.)
  await pool.query(`CREATE TABLE IF NOT EXISTS airfield_element_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    color VARCHAR(20) DEFAULT '#f59e0b',
    icon VARCHAR(10) DEFAULT '🔧'
  )`);
  // Airfield elements (per-airfield instances)
  await pool.query(`CREATE TABLE IF NOT EXISTS airfield_elements (
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
  await pool.query(`ALTER TABLE airfield_elements ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT ''`);
  await pool.query(`ALTER TABLE airfield_element_types ADD COLUMN IF NOT EXISTS can_change_status BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE airfield_element_types ADD COLUMN IF NOT EXISTS allowed_statuses JSONB DEFAULT '[]'`);
  await pool.query(`CREATE TABLE IF NOT EXISTS workstation_session_roles (
    id SERIAL PRIMARY KEY,
    preset_id INTEGER UNIQUE REFERENCES workstation_presets(id) ON DELETE CASCADE,
    kshp VARCHAR(200) DEFAULT '',
    mefale VARCHAR(200) DEFAULT '',
    achori VARCHAR(200) DEFAULT '',
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // Partial formation support
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS parent_strip_id INTEGER REFERENCES strips(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS aircraft_indices JSONB DEFAULT NULL`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS original_formation_count INTEGER DEFAULT NULL`);

  // פ"מ אב — formation-level fields
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS formation_notes TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS parent_callsign VARCHAR(100) DEFAULT ''`);
  await pool.query(`ALTER TABLE strips DROP COLUMN IF EXISTS takeoff_airfield`);
  await pool.query(`ALTER TABLE strips DROP COLUMN IF EXISTS landing_airfield`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS takeoff_airfield_id INTEGER REFERENCES aviation_bases(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS landing_airfield_id INTEGER REFERENCES aviation_bases(id) ON DELETE SET NULL`);

  // Geo-anchoring system — map calibration and geographic positioning
  await pool.query(`ALTER TABLE maps ADD COLUMN IF NOT EXISTS anchor1_x_img REAL`);
  await pool.query(`ALTER TABLE maps ADD COLUMN IF NOT EXISTS anchor1_y_img REAL`);
  await pool.query(`ALTER TABLE maps ADD COLUMN IF NOT EXISTS anchor1_lat DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE maps ADD COLUMN IF NOT EXISTS anchor1_lon DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE maps ADD COLUMN IF NOT EXISTS anchor2_x_img REAL`);
  await pool.query(`ALTER TABLE maps ADD COLUMN IF NOT EXISTS anchor2_y_img REAL`);
  await pool.query(`ALTER TABLE maps ADD COLUMN IF NOT EXISTS anchor2_lat DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE maps ADD COLUMN IF NOT EXISTS anchor2_lon DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS map_lat DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS map_lon DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE map_zones ADD COLUMN IF NOT EXISTS polygon_geo TEXT DEFAULT '[]'`);

  // Many-to-many: which workstation presets a strip is explicitly assigned to (table mode)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS strip_table_assignments (
      strip_id  INTEGER NOT NULL REFERENCES strips(id) ON DELETE CASCADE,
      preset_id INTEGER NOT NULL REFERENCES workstation_presets(id) ON DELETE CASCADE,
      assigned_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (strip_id, preset_id)
    )
  `);

  // Civilian strip mode
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS civilian_columns JSONB DEFAULT '[]'`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS civ_status VARCHAR(50) DEFAULT ''`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS civ_stand VARCHAR(50) DEFAULT ''`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS civ_dest VARCHAR(20) DEFAULT ''`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS civ_ssr VARCHAR(20) DEFAULT ''`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS civ_fl VARCHAR(20) DEFAULT ''`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS civ_route TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS civ_time VARCHAR(10) DEFAULT ''`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS civ_runway VARCHAR(10) DEFAULT ''`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS map_zone_name VARCHAR(100) DEFAULT ''`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS map_zone_alts VARCHAR(200) DEFAULT ''`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS map_pin_x FLOAT`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS map_pin_y FLOAT`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS strip_type VARCHAR(50) DEFAULT ''`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS creator_preset_id INTEGER REFERENCES workstation_presets(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS manual_entry BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS creator_crew_id INTEGER REFERENCES crew_members(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS creator_crew_name VARCHAR(100)`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS creator_preset_name VARCHAR(100)`);
  await pool.query(`ALTER TABLE strips ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS use_map_zones BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS dual_map_mode BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS map2_id INTEGER REFERENCES maps(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS dual_map_layout VARCHAR(20) DEFAULT 'side-by-side'`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS dual_map_split INTEGER DEFAULT 50`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS suggest_alt_range BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS show_full_picture BOOLEAN DEFAULT false`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS civilian_strip_assignments (
      id SERIAL PRIMARY KEY,
      strip_id INTEGER NOT NULL REFERENCES strips(id) ON DELETE CASCADE,
      preset_id INTEGER NOT NULL REFERENCES workstation_presets(id) ON DELETE CASCADE,
      col_key VARCHAR(100) NOT NULL DEFAULT '',
      sub_col VARCHAR(50) NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(strip_id, preset_id)
    )
  `);

  await pool.query(`ALTER TABLE workstation_presets ADD COLUMN IF NOT EXISTS civilian_board_bg VARCHAR(20) DEFAULT ''`);

  console.log('Database initialized');
}

// Cleanup expired manual-entry strips every hour
async function cleanupExpiredStrips() {
  try {
    const result = await pool.query(
      `DELETE FROM strips WHERE manual_entry = TRUE AND expires_at IS NOT NULL AND expires_at < NOW()`
    );
    if (result.rowCount > 0) console.log(`[cleanup] Deleted ${result.rowCount} expired manual strips`);
  } catch (err) {
    console.error('[cleanup] Error deleting expired strips:', err.message);
  }
}

initDb().then(() => {
  cleanupExpiredStrips();
  setInterval(cleanupExpiredStrips, 60 * 60 * 1000);
}).catch(console.error);

// --- Crew Members API ---
app.get('/api/crew-members', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cm.*, 
        COALESCE(
          (SELECT json_agg(cmw.workstation_preset_id) 
           FROM crew_member_workstations cmw 
           WHERE cmw.crew_member_id = cm.id), '[]'
        ) as approved_workstations
      FROM crew_members cm 
      ORDER BY cm.last_name, cm.first_name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching crew members:', err);
    res.status(500).json({ error: 'Failed to fetch crew members' });
  }
});

app.post('/api/crew-members', async (req, res) => {
  try {
    const { first_name, last_name, personal_id, is_admin, is_team_lead, approved_workstations } = req.body;
    const name = `${first_name} ${last_name}`.trim();
    const result = await pool.query(
      'INSERT INTO crew_members (name, first_name, last_name, personal_id, is_admin, is_team_lead) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, first_name, last_name, personal_id, is_admin || false, is_team_lead || false]
    );
    const crewMemberId = result.rows[0].id;
    
    // Add approved workstations
    if (approved_workstations && approved_workstations.length > 0) {
      for (const wsId of approved_workstations) {
        await pool.query(
          'INSERT INTO crew_member_workstations (crew_member_id, workstation_preset_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [crewMemberId, wsId]
        );
      }
    }
    
    res.json({ ...result.rows[0], approved_workstations: approved_workstations || [] });
  } catch (err) {
    console.error('Error creating crew member:', err);
    res.status(500).json({ error: 'Failed to create crew member' });
  }
});

app.put('/api/crew-members/:id', async (req, res) => {
  try {
    const { first_name, last_name, personal_id, is_admin, is_team_lead, approved_workstations } = req.body;
    const name = `${first_name} ${last_name}`.trim();
    await pool.query(
      'UPDATE crew_members SET name = $1, first_name = $2, last_name = $3, personal_id = $4, is_admin = $5, is_team_lead = $6 WHERE id = $7',
      [name, first_name, last_name, personal_id, is_admin, is_team_lead || false, req.params.id]
    );
    
    // Update approved workstations
    await pool.query('DELETE FROM crew_member_workstations WHERE crew_member_id = $1', [req.params.id]);
    if (approved_workstations && approved_workstations.length > 0) {
      for (const wsId of approved_workstations) {
        await pool.query(
          'INSERT INTO crew_member_workstations (crew_member_id, workstation_preset_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [req.params.id, wsId]
        );
      }
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating crew member:', err);
    res.status(500).json({ error: 'Failed to update crew member' });
  }
});

app.patch('/api/crew-members/:id/preferences', async (req, res) => {
  try {
    const { undo_duration_ms, ground_datk_filter, ground_status_filter, ground_filter_mode, classic_panel_orders } = req.body;
    const fields = [];
    const values = [];
    let idx = 1;
    if ('undo_duration_ms' in req.body) { fields.push(`undo_duration_ms = $${idx++}`); values.push(undo_duration_ms ?? null); }
    if ('ground_datk_filter' in req.body) { fields.push(`ground_datk_filter = $${idx++}`); values.push(ground_datk_filter ?? null); }
    if ('ground_status_filter' in req.body) { fields.push(`ground_status_filter = $${idx++}`); values.push(ground_status_filter !== undefined ? JSON.stringify(ground_status_filter) : null); }
    if ('ground_filter_mode' in req.body) { fields.push(`ground_filter_mode = $${idx++}`); values.push(ground_filter_mode ?? null); }
    if ('classic_panel_orders' in req.body) { fields.push(`classic_panel_orders = COALESCE(classic_panel_orders, '{}'::jsonb) || $${idx++}::jsonb`); values.push(classic_panel_orders !== undefined ? JSON.stringify(classic_panel_orders) : '{}'); }
    if (fields.length > 0) {
      values.push(req.params.id);
      await pool.query(`UPDATE crew_members SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating crew member preferences:', err);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

app.delete('/api/crew-members/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM crew_members WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting crew member:', err);
    res.status(500).json({ error: 'Failed to delete crew member' });
  }
});

// --- Digits API (per crew member) ---
app.get('/api/digits', async (req, res) => {
  try {
    const crewMemberId = req.query.crew_member_id;
    let query = 'SELECT digit, image_data FROM learned_digits';
    let params = [];
    if (crewMemberId) {
      query += ' WHERE crew_member_id = $1';
      params.push(crewMemberId);
    }
    query += ' ORDER BY id DESC LIMIT 200';
    const result = await pool.query(query, params);
    res.json(result.rows.map(r => ({ digit: r.digit, imageData: r.image_data })));
  } catch (err) {
    console.error('Error fetching digits:', err);
    res.status(500).json({ error: 'Failed to fetch digits' });
  }
});

app.post('/api/digits', async (req, res) => {
  try {
    const { digit, imageData, crew_member_id } = req.body;
    if (!digit || !imageData) {
      return res.status(400).json({ error: 'Missing digit or imageData' });
    }
    await pool.query(
      'INSERT INTO learned_digits (digit, image_data, crew_member_id) VALUES ($1, $2, $3)',
      [digit, imageData, crew_member_id || null]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving digit:', err);
    res.status(500).json({ error: 'Failed to save digit' });
  }
});

app.delete('/api/digits', async (req, res) => {
  try {
    const crewMemberId = req.query.crew_member_id;
    if (crewMemberId) {
      await pool.query('DELETE FROM learned_digits WHERE crew_member_id = $1', [crewMemberId]);
    } else {
      await pool.query('DELETE FROM learned_digits');
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error clearing digits:', err);
    res.status(500).json({ error: 'Failed to clear digits' });
  }
});

app.get('/api/digits/count', async (req, res) => {
  try {
    const crewMemberId = req.query.crew_member_id;
    let query = 'SELECT COUNT(*) as count FROM learned_digits';
    let params = [];
    if (crewMemberId) {
      query += ' WHERE crew_member_id = $1';
      params.push(crewMemberId);
    }
    const result = await pool.query(query, params);
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('Error counting digits:', err);
    res.status(500).json({ error: 'Failed to count digits' });
  }
});

// --- Strips API ---
app.get('/api/strips', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM strips ORDER BY id');
    res.json(result.rows.map(r => ({
      id: 's' + r.id,
      callSign: r.callsign,
      numberOfFormation: r.number_of_formation || null,
      sq: r.sq,
      alt: r.alt,
      task: r.task,
      squadron: r.squadron,
      x: r.x,
      y: r.y,
      onMap: r.on_map,
      airborne: r.airborne,
      notes: r.notes,
      erka: r.erka || '',
      koteret: r.koteret || '',
      mivtza: r.mivtza || ''
    })));
  } catch (err) {
    console.error('Error fetching strips:', err);
    res.status(500).json({ error: 'Failed to fetch strips' });
  }
});

app.get('/api/strips/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM strips ORDER BY id');
    res.json(result.rows.map(r => ({
      id: 's' + r.id,
      call_sign: r.callsign,
      number_of_formation: r.number_of_formation || null,
      sq: r.sq,
      alt: r.alt,
      task: r.task,
      squadron: r.squadron,
      sector_id: r.sector_id,
      workstation_preset_id: r.workstation_preset_id,
      x: r.x,
      y: r.y,
      on_map: r.on_map,
      airborne: r.airborne,
      weapons: r.weapons || [],
      targets: r.targets || [],
      systems: r.systems || [],
      shkadia: r.shkadia || '',
      takeoff_time: r.takeoff_time || null,
      erka: r.erka || '',
      koteret: r.koteret || '',
      mivtza: r.mivtza || '',
      block_space_id: r.block_space_id || null,
      block_deviation: r.block_deviation || false,
      takeoff_airfield_id: r.takeoff_airfield_id || null,
      landing_airfield_id: r.landing_airfield_id || null
    })));
  } catch (err) {
    console.error('Error fetching all strips:', err);
    res.status(500).json({ error: 'Failed to fetch strips' });
  }
});

app.post('/api/strips/:id/assign', async (req, res) => {
  try {
    const id = parseInt(req.params.id.replace('s', ''));
    const { sectorId } = req.body;
    await pool.query('UPDATE strips SET sector_id = $1 WHERE id = $2', [sectorId, id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error assigning strip:', err);
    res.status(500).json({ error: 'Failed to assign strip' });
  }
});

// Accept a queued (distributed) strip — moves it from receive panel to mine panel
app.post('/api/strips/:id/accept-queued', async (req, res) => {
  try {
    const id = parseInt(req.params.id.replace('s', ''));
    await pool.query("UPDATE strips SET status = NULL, in_table = true WHERE id = $1 AND status = 'queued'", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error accepting queued strip:', err);
    res.status(500).json({ error: 'Failed to accept strip' });
  }
});

app.post('/api/strips/:id/assign-workstation', async (req, res) => {
  try {
    const id = parseInt(req.params.id.replace('s', ''));
    const { workstationPresetId } = req.body;
    if (workstationPresetId !== null) {
      await pool.query(
        'UPDATE strips SET workstation_preset_id = $1, status = $2, on_map = $3, held_by_workstation = $4, in_table = false WHERE id = $5',
        [workstationPresetId, 'queued', false, null, id]
      );
    } else {
      await pool.query('UPDATE strips SET workstation_preset_id = NULL WHERE id = $1', [id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error assigning strip to workstation:', err);
    res.status(500).json({ error: 'Failed to assign strip to workstation' });
  }
});

app.post('/api/strips', async (req, res) => {
  try {
    const {
      callSign, sq, alt, task, squadron, sectorId, takeoff_time, numberOfFormation,
      erka, koteret, mivtza, block_space_id, workstation_preset_id,
      manual_entry, creator_crew_id, creator_crew_name, creator_preset_name, force_duplicate
    } = req.body;

    const isManual = manual_entry === true || manual_entry === 'true';

    // Duplicate check for manual entries (same callsign today, unless forced)
    if (isManual && callSign && !force_duplicate) {
      const dup = await pool.query(
        `SELECT id FROM strips WHERE LOWER(callsign) = LOWER($1) AND DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE AND manual_entry = TRUE LIMIT 1`,
        [callSign.trim()]
      );
      if (dup.rowCount > 0) {
        return res.json({ duplicate: true, message: `פ"מ עם או"ק "${callSign.trim()}" כבר קיים היום` });
      }
    }

    const expiresAt = isManual ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
    const presetId = workstation_preset_id ? parseInt(workstation_preset_id) : null;

    // Manual entries with a preset go straight into that workstation's table
    const inTable = isManual && presetId ? true : false;

    const result = await pool.query(
      `INSERT INTO strips
        (callsign, sq, alt, task, squadron, sector_id, takeoff_time, number_of_formation,
         erka, koteret, mivtza, block_space_id, workstation_preset_id, creator_preset_id,
         in_table, manual_entry, creator_crew_id, creator_crew_name, creator_preset_name, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id`,
      [
        callSign, sq, alt, task, squadron, sectorId || null,
        takeoff_time || null, numberOfFormation || null,
        erka || null, koteret || null, mivtza || null,
        block_space_id ? parseInt(block_space_id) : null,
        presetId,
        inTable,
        isManual,
        creator_crew_id ? parseInt(creator_crew_id) : null,
        creator_crew_name || null,
        creator_preset_name || null,
        expiresAt
      ]
    );
    res.json({ success: true, id: 's' + result.rows[0].id });
  } catch (err) {
    console.error('Error creating strip:', err);
    res.status(500).json({ error: 'Failed to create strip' });
  }
});

// POST /api/strip-aircraft/ensure-all — create randomized aircraft for every strip that has number_of_formation
app.post('/api/strip-aircraft/ensure-all', async (req, res) => {
  try {
    const { randomize } = req.body;
    const strips = await pool.query(
      `SELECT id, number_of_formation FROM strips WHERE number_of_formation IS NOT NULL AND number_of_formation != ''`
    );
    let totalAircraft = 0;
    for (const strip of strips.rows) {
      const n = Math.max(1, Math.min(parseInt(strip.number_of_formation) || 0, 16));
      if (!n) continue;
      for (let i = 1; i <= n; i++) {
        if (randomize) {
          const datk = Math.floor(Math.random() * 4) + 1;
          const kipa = String(Math.floor(Math.random() * 8) + 1);
          await pool.query(
            `INSERT INTO strip_aircraft (strip_id, idx, datk, kipa) VALUES ($1, $2, $3, $4)
             ON CONFLICT (strip_id, idx) DO UPDATE SET datk=EXCLUDED.datk, kipa=EXCLUDED.kipa`,
            [strip.id, i, datk, kipa]
          );
        } else {
          await pool.query(
            `INSERT INTO strip_aircraft (strip_id, idx) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [strip.id, i]
          );
        }
        totalAircraft++;
      }
    }
    res.json({ strips: strips.rowCount, aircraft: totalAircraft });
  } catch (err) {
    console.error('[ensure-all]', err);
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/strips/update-takeoff-to-today — keep HH:MM but set date to today
app.put('/api/strips/update-takeoff-to-today', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE strips
       SET takeoff_time = (CURRENT_DATE::timestamp + (takeoff_time AT TIME ZONE 'UTC')::time) AT TIME ZONE 'UTC'
       WHERE takeoff_time IS NOT NULL
       RETURNING id`
    );
    res.json({ updated: result.rowCount });
  } catch (err) {
    console.error('[update-takeoff-to-today]', err);
    res.status(500).json({ error: String(err) });
  }
});

app.put('/api/strips/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id.replace('s', ''));
    const { x, y, onMap, alt, notes, weapons, targets, systems, shkadia } = req.body;
    
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (x !== undefined) { updates.push(`x = $${paramIndex++}`); values.push(x); }
    if (y !== undefined) { updates.push(`y = $${paramIndex++}`); values.push(y); }
    if (onMap !== undefined) { updates.push(`on_map = $${paramIndex++}`); values.push(onMap); }
    if (alt !== undefined) { updates.push(`alt = $${paramIndex++}`); values.push(alt); }
    if (req.body.airborne !== undefined) { updates.push(`airborne = $${paramIndex++}`); values.push(req.body.airborne); }
    if (notes !== undefined) { updates.push(`notes = $${paramIndex++}`); values.push(notes); }
    if (weapons !== undefined) { updates.push(`weapons = $${paramIndex++}`); values.push(JSON.stringify(weapons)); }
    if (targets !== undefined) { updates.push(`targets = $${paramIndex++}`); values.push(JSON.stringify(targets)); }
    if (systems !== undefined) { updates.push(`systems = $${paramIndex++}`); values.push(JSON.stringify(systems)); }
    if (shkadia !== undefined) { updates.push(`shkadia = $${paramIndex++}`); values.push(shkadia); }
    if (req.body.custom_fields !== undefined) { updates.push(`custom_fields = $${paramIndex++}`); values.push(JSON.stringify(req.body.custom_fields)); }
    if (req.body.takeoff_time !== undefined) { updates.push(`takeoff_time = $${paramIndex++}`); values.push(req.body.takeoff_time || null); }
    if (req.body.sq !== undefined) { updates.push(`sq = $${paramIndex++}`); values.push(req.body.sq); }
    if (req.body.numberOfFormation !== undefined) { updates.push(`number_of_formation = $${paramIndex++}`); values.push(req.body.numberOfFormation || null); }
    if (req.body.number_of_formation !== undefined) { updates.push(`number_of_formation = $${paramIndex++}`); values.push(req.body.number_of_formation || null); }
    if (req.body.erka !== undefined) { updates.push(`erka = $${paramIndex++}`); values.push(req.body.erka || null); }
    if (req.body.koteret !== undefined) { updates.push(`koteret = $${paramIndex++}`); values.push(req.body.koteret || null); }
    if (req.body.mivtza !== undefined) { updates.push(`mivtza = $${paramIndex++}`); values.push(req.body.mivtza || null); }
    if (req.body.block_space_id !== undefined) { updates.push(`block_space_id = $${paramIndex++}`); values.push(req.body.block_space_id ? parseInt(req.body.block_space_id) : null); }
    if (req.body.block_deviation !== undefined) { updates.push(`block_deviation = $${paramIndex++}`); values.push(!!req.body.block_deviation); }
    if (req.body.callSign !== undefined) { updates.push(`callsign = $${paramIndex++}`); values.push(req.body.callSign); }
    if (req.body.callsign !== undefined && req.body.callSign === undefined) { updates.push(`callsign = $${paramIndex++}`); values.push(req.body.callsign); }
    if (req.body.task !== undefined) { updates.push(`task = $${paramIndex++}`); values.push(req.body.task); }
    if (req.body.workstation_preset_id !== undefined) { updates.push(`workstation_preset_id = $${paramIndex++}`); values.push(req.body.workstation_preset_id ? parseInt(req.body.workstation_preset_id) : null); }
    if (req.body.sid !== undefined) { updates.push(`sid = $${paramIndex++}`); values.push(req.body.sid || null); }
    if (req.body.star !== undefined) { updates.push(`star = $${paramIndex++}`); values.push(req.body.star || null); }
    if (req.body.departure_base_id !== undefined) { updates.push(`departure_base_id = $${paramIndex++}`); values.push(req.body.departure_base_id ? parseInt(req.body.departure_base_id) : null); }
    if (req.body.landing_base_id !== undefined) { updates.push(`landing_base_id = $${paramIndex++}`); values.push(req.body.landing_base_id ? parseInt(req.body.landing_base_id) : null); }
    if (req.body.takeoff_airfield_id !== undefined) { updates.push(`takeoff_airfield_id = $${paramIndex++}`); values.push(req.body.takeoff_airfield_id ? parseInt(req.body.takeoff_airfield_id) : null); }
    if (req.body.landing_airfield_id !== undefined) { updates.push(`landing_airfield_id = $${paramIndex++}`); values.push(req.body.landing_airfield_id ? parseInt(req.body.landing_airfield_id) : null); }
    if (req.body.civ_status !== undefined) { updates.push(`civ_status = $${paramIndex++}`); values.push(req.body.civ_status); }
    if (req.body.civ_stand !== undefined) { updates.push(`civ_stand = $${paramIndex++}`); values.push(req.body.civ_stand); }
    if (req.body.civ_dest !== undefined) { updates.push(`civ_dest = $${paramIndex++}`); values.push(req.body.civ_dest); }
    if (req.body.civ_ssr !== undefined) { updates.push(`civ_ssr = $${paramIndex++}`); values.push(req.body.civ_ssr); }
    if (req.body.civ_fl !== undefined) { updates.push(`civ_fl = $${paramIndex++}`); values.push(req.body.civ_fl); }
    if (req.body.civ_route !== undefined) { updates.push(`civ_route = $${paramIndex++}`); values.push(req.body.civ_route); }
    if (req.body.civ_time !== undefined) { updates.push(`civ_time = $${paramIndex++}`); values.push(req.body.civ_time); }
    if (req.body.civ_runway !== undefined) { updates.push(`civ_runway = $${paramIndex++}`); values.push(req.body.civ_runway); }
    if (req.body.unit !== undefined) { updates.push(`unit = $${paramIndex++}`); values.push(req.body.unit); }
    if (req.body.map_zone_name !== undefined) { updates.push(`map_zone_name = $${paramIndex++}`); values.push(req.body.map_zone_name); }
    if (req.body.map_zone_alts !== undefined) { updates.push(`map_zone_alts = $${paramIndex++}`); values.push(req.body.map_zone_alts); }
    if (req.body.map_pin_x !== undefined) { updates.push(`map_pin_x = $${paramIndex++}`); values.push(req.body.map_pin_x !== null ? Number(req.body.map_pin_x) : null); }
    if (req.body.map_pin_y !== undefined) { updates.push(`map_pin_y = $${paramIndex++}`); values.push(req.body.map_pin_y !== null ? Number(req.body.map_pin_y) : null); }

    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE strips SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating strip:', err);
    res.status(500).json({ error: 'Failed to update strip' });
  }
});

app.delete('/api/strips/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id.replace('s', ''));
    await pool.query('DELETE FROM strips WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting strip:', err);
    res.status(500).json({ error: 'Failed to delete strip' });
  }
});

app.post('/api/strips/import', async (req, res) => {
  try {
    const { strips, creator_preset_id } = req.body;
    if (!Array.isArray(strips)) {
      return res.status(400).json({ error: 'Invalid strips data' });
    }
    
    const existingResult = await pool.query('SELECT id, callsign FROM strips');
    const existingMap = new Map(existingResult.rows.map(r => [r.callsign?.toLowerCase(), r.id]));
    
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];
    const unresolvedAirfields = new Set();
    
    for (const strip of strips) {
      if (!strip.callSign) {
        errors.push('Missing callSign');
        continue;
      }
      
      const existingId = existingMap.get(strip.callSign.toLowerCase());
      
      if (existingId) {
        // Build UPDATE for non-empty fields only
        const updateParts = [];
        const updateVals = [];
        let pi = 1;
        const addField = (col, val) => {
          if (val !== undefined && val !== null && val !== '') {
            updateParts.push(`${col} = $${pi++}`);
            updateVals.push(val);
          }
        };
        addField('sq', strip.sq);
        addField('squadron', strip.squadron);
        addField('alt', strip.alt);
        addField('task', strip.task);
        addField('number_of_formation', strip.numberOfFormation);
        addField('takeoff_time', strip.takeoff_time);
        addField('shkadia', strip.shkadia);
        addField('erka', strip.erka);
        addField('koteret', strip.koteret);
        addField('mivtza', strip.mivtza);
        addField('parent_callsign', strip.parent_callsign);
        if (strip.takeoff_airfield_id != null) { updateParts.push(`takeoff_airfield_id = $${pi++}`); updateVals.push(strip.takeoff_airfield_id || null); }
        if (strip.landing_airfield_id != null) { updateParts.push(`landing_airfield_id = $${pi++}`); updateVals.push(strip.landing_airfield_id || null); }
        if (strip.takeoff_airfield_name) {
          const tbRes = await pool.query('SELECT id FROM aviation_bases WHERE LOWER(name)=LOWER($1) OR LOWER(code)=LOWER($1) LIMIT 1', [strip.takeoff_airfield_name]);
          if (tbRes.rows.length > 0) { updateParts.push(`takeoff_airfield_id = $${pi++}`); updateVals.push(tbRes.rows[0].id); }
          else { unresolvedAirfields.add(strip.takeoff_airfield_name); }
        }
        if (strip.landing_airfield_name) {
          const lbRes = await pool.query('SELECT id FROM aviation_bases WHERE LOWER(name)=LOWER($1) OR LOWER(code)=LOWER($1) LIMIT 1', [strip.landing_airfield_name]);
          if (lbRes.rows.length > 0) { updateParts.push(`landing_airfield_id = $${pi++}`); updateVals.push(lbRes.rows[0].id); }
          else { unresolvedAirfields.add(strip.landing_airfield_name); }
        }
        if (strip.weapons && strip.weapons.length > 0) { updateParts.push(`weapons = $${pi++}`); updateVals.push(JSON.stringify(strip.weapons)); }
        if (strip.targets && strip.targets.length > 0) { updateParts.push(`targets = $${pi++}`); updateVals.push(JSON.stringify(strip.targets)); }
        if (strip.systems && strip.systems.length > 0) { updateParts.push(`systems = $${pi++}`); updateVals.push(JSON.stringify(strip.systems)); }

        if (updateParts.length === 0) {
          skipped++;
          continue;
        }
        try {
          updateVals.push(existingId);
          await pool.query(`UPDATE strips SET ${updateParts.join(', ')} WHERE id = $${pi}`, updateVals);
          updated++;
        } catch (err) {
          errors.push(`Failed to update ${strip.callSign}: ${err.message}`);
        }
      } else {
        try {
          await pool.query(
            'INSERT INTO strips (callsign, sq, squadron, alt, task, weapons, targets, systems, shkadia, takeoff_time, number_of_formation, erka, koteret, mivtza, parent_callsign, takeoff_airfield_id, landing_airfield_id, creator_preset_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)',
            [
              strip.callSign,
              strip.sq || '',
              strip.squadron || '',
              strip.alt || '',
              strip.task || '',
              JSON.stringify(strip.weapons || []),
              JSON.stringify(strip.targets || []),
              JSON.stringify(strip.systems || []),
              strip.shkadia || null,
              strip.takeoff_time || null,
              strip.numberOfFormation || null,
              strip.erka || null,
              strip.koteret || null,
              strip.mivtza || null,
              strip.parent_callsign || null,
              (() => { if (strip.takeoff_airfield_id) return strip.takeoff_airfield_id; return null; })(),
              (() => { if (strip.landing_airfield_id) return strip.landing_airfield_id; return null; })(),
              creator_preset_id || null
            ]
          );
          // Resolve airfield names for newly inserted strips
          if (strip.takeoff_airfield_name || strip.landing_airfield_name) {
            const updateAirfieldParts = [], updateAirfieldVals = [];
            let api = 1;
            if (strip.takeoff_airfield_name) {
              const tbRes = await pool.query('SELECT id FROM aviation_bases WHERE LOWER(name)=LOWER($1) OR LOWER(code)=LOWER($1) LIMIT 1', [strip.takeoff_airfield_name]);
              if (tbRes.rows.length > 0) { updateAirfieldParts.push(`takeoff_airfield_id = $${api++}`); updateAirfieldVals.push(tbRes.rows[0].id); }
              else { unresolvedAirfields.add(strip.takeoff_airfield_name); }
            }
            if (strip.landing_airfield_name) {
              const lbRes = await pool.query('SELECT id FROM aviation_bases WHERE LOWER(name)=LOWER($1) OR LOWER(code)=LOWER($1) LIMIT 1', [strip.landing_airfield_name]);
              if (lbRes.rows.length > 0) { updateAirfieldParts.push(`landing_airfield_id = $${api++}`); updateAirfieldVals.push(lbRes.rows[0].id); }
              else { unresolvedAirfields.add(strip.landing_airfield_name); }
            }
            if (updateAirfieldParts.length > 0) {
              updateAirfieldVals.push(strip.callSign.toLowerCase());
              await pool.query(`UPDATE strips SET ${updateAirfieldParts.join(', ')} WHERE LOWER(callsign) = $${api}`, updateAirfieldVals);
            }
          }
          existingMap.set(strip.callSign.toLowerCase(), true);
          imported++;
        } catch (err) {
          errors.push(`Failed to import ${strip.callSign}: ${err.message}`);
        }
      }
    }
    
    res.json({ imported, updated, skipped, errors, unresolvedAirfields: [...unresolvedAirfields] });
  } catch (err) {
    console.error('Error importing strips:', err);
    res.status(500).json({ error: 'Failed to import strips' });
  }
});

// --- Sectors API ---
app.get('/api/sectors', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sectors ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching sectors:', err);
    res.status(500).json({ error: 'Failed to fetch sectors' });
  }
});


app.get('/api/sectors/:id/neighbors', async (req, res) => {
  try {
    const sectorId = parseInt(req.params.id);
    const result = await pool.query(`
      SELECT s.* FROM sectors s 
      JOIN sector_neighbors sn ON s.id = sn.neighbor_id 
      WHERE sn.sector_id = $1
    `, [sectorId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching neighbors:', err);
    res.status(500).json({ error: 'Failed to fetch neighbors' });
  }
});

app.post('/api/sectors/:id/neighbors', async (req, res) => {
  try {
    const sectorId = parseInt(req.params.id);
    const { neighborId } = req.body;
    await pool.query(
      'INSERT INTO sector_neighbors (sector_id, neighbor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [sectorId, neighborId]
    );
    await pool.query(
      'INSERT INTO sector_neighbors (sector_id, neighbor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [neighborId, sectorId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error adding neighbor:', err);
    res.status(500).json({ error: 'Failed to add neighbor' });
  }
});

app.get('/api/sectors/:id/strips', async (req, res) => {
  try {
    const sectorId = parseInt(req.params.id);
    const result = await pool.query(
      'SELECT * FROM strips WHERE sector_id = $1 ORDER BY id',
      [sectorId]
    );
    res.json(result.rows.map(r => ({
      id: 's' + r.id,
      callSign: r.callsign,
      numberOfFormation: r.number_of_formation || null,
      sq: r.sq,
      alt: r.alt,
      task: r.task,
      squadron: r.squadron,
      sectorId: r.sector_id,
      status: r.status,
      x: r.x,
      y: r.y,
      onMap: r.on_map,
      airborne: r.airborne,
      notes: r.notes,
      weapons: r.weapons || [],
      targets: r.targets || [],
      systems: r.systems || [],
      shkadia: r.shkadia,
      erka: r.erka || '',
      koteret: r.koteret || '',
      mivtza: r.mivtza || '',
      block_space_id: r.block_space_id || null,
      block_deviation: r.block_deviation || false
    })));
  } catch (err) {
    console.error('Error fetching sector strips:', err);
    res.status(500).json({ error: 'Failed to fetch sector strips' });
  }
});

// --- Workstations API ---
app.post('/api/workstations/login', async (req, res) => {
  try {
    const { name } = req.body;
    const authToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    
    const result = await pool.query(
      `INSERT INTO workstations (name, auth_token, is_active, last_seen) 
       VALUES ($1, $2, TRUE, CURRENT_TIMESTAMP) RETURNING *`,
      [name, authToken]
    );
    
    res.json({
      workstation: result.rows[0],
      authToken
    });
  } catch (err) {
    console.error('Error logging in workstation:', err);
    res.status(500).json({ error: 'Failed to login workstation' });
  }
});

app.get('/api/workstations/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT w.*, s.name as sector_name, s.label_he, s.map_asset 
       FROM workstations w 
       LEFT JOIN sectors s ON w.sector_id = s.id 
       WHERE w.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workstation not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching workstation:', err);
    res.status(500).json({ error: 'Failed to fetch workstation' });
  }
});

app.patch('/api/workstations/:id/heartbeat', async (req, res) => {
  try {
    await pool.query(
      'UPDATE workstations SET last_seen = CURRENT_TIMESTAMP WHERE id = $1',
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating heartbeat:', err);
    res.status(500).json({ error: 'Failed to update heartbeat' });
  }
});

// --- Sub-sectors API ---
app.get('/api/sectors/:id/sub-sectors', async (req, res) => {
  try {
    const sectorId = parseInt(req.params.id);
    const result = await pool.query(`
      SELECT ss.*, s.name as neighbor_name, s.label_he as neighbor_label
      FROM sub_sectors ss
      JOIN sectors s ON ss.neighbor_id = s.id
      WHERE ss.sector_id = $1
      ORDER BY ss.id
    `, [sectorId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching sub-sectors:', err);
    res.status(500).json({ error: 'Failed to fetch sub-sectors' });
  }
});

app.post('/api/sectors/:id/sub-sectors', async (req, res) => {
  try {
    const sectorId = parseInt(req.params.id);
    const { neighborId, label, defaultX, defaultY } = req.body;
    const result = await pool.query(
      `INSERT INTO sub_sectors (sector_id, neighbor_id, label, default_x, default_y) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [sectorId, neighborId, label, defaultX || 0.2, defaultY || 0.2]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating sub-sector:', err);
    res.status(500).json({ error: 'Failed to create sub-sector' });
  }
});

app.put('/api/sub-sectors/:id', async (req, res) => {
  try {
    const subSectorId = parseInt(req.params.id);
    const { label, defaultX, defaultY } = req.body;
    
    let query, params;
    if (defaultX !== undefined && defaultY !== undefined) {
      query = `UPDATE sub_sectors SET label = $1, default_x = $2, default_y = $3 WHERE id = $4 RETURNING *`;
      params = [label, defaultX, defaultY, subSectorId];
    } else {
      query = `UPDATE sub_sectors SET label = $1 WHERE id = $2 RETURNING *`;
      params = [label, subSectorId];
    }
    
    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sub-sector not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating sub-sector:', err);
    res.status(500).json({ error: 'Failed to update sub-sector' });
  }
});

app.delete('/api/sub-sectors/:id', async (req, res) => {
  try {
    const subSectorId = parseInt(req.params.id);
    const result = await pool.query('DELETE FROM sub_sectors WHERE id = $1 RETURNING *', [subSectorId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sub-sector not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting sub-sector:', err);
    res.status(500).json({ error: 'Failed to delete sub-sector' });
  }
});

// --- Transfer API ---
app.post('/api/strips/:id/transfer', async (req, res) => {
  try {
    const stripId = parseInt(String(req.params.id).replace(/^s/, ''));
    if (isNaN(stripId)) return res.status(400).json({ error: 'Invalid strip id' });
    const { toSectorId, workstationId, targetX, targetY, subSectorLabel, fromWorkstationId, toWorkstationId } = req.body;
    
    const strip = await pool.query('SELECT * FROM strips WHERE id = $1', [stripId]);
    if (strip.rows.length === 0) {
      return res.status(404).json({ error: 'Strip not found' });
    }
    
    let fromSectorId = strip.rows[0].sector_id;
    
    // If the strip has no sector (assigned via distribution), infer from sender's workstation
    if (!fromSectorId && fromWorkstationId) {
      const senderPreset = await pool.query('SELECT relevant_sectors FROM workstation_presets WHERE id = $1', [fromWorkstationId]);
      if (senderPreset.rows.length > 0) {
        let senderSectors = senderPreset.rows[0].relevant_sectors;
        if (typeof senderSectors === 'string') senderSectors = JSON.parse(senderSectors);
        if (Array.isArray(senderSectors) && senderSectors.length > 0) {
          fromSectorId = senderSectors[0];
        }
      }
    }

    // Auto-resolve target workstation if not provided
    let resolvedToWorkstationId = toWorkstationId;
    if (!resolvedToWorkstationId && fromWorkstationId) {
      // Find workstations that have the target sector in their relevant_sectors OR classic_receive_points
      const presetsResult = await pool.query('SELECT * FROM workstation_presets ORDER BY name');
      const presetsWithSector = presetsResult.rows
        .map(row => {
          const relevant = Array.isArray(row.relevant_sectors) ? row.relevant_sectors :
            (typeof row.relevant_sectors === 'string' ? JSON.parse(row.relevant_sectors) : []);
          const recvPts = Array.isArray(row.classic_receive_points) ? row.classic_receive_points :
            (typeof row.classic_receive_points === 'string' ? JSON.parse(row.classic_receive_points) : []);
          const recvSectorIds = recvPts.map(p => Number(p.sector_id)).filter(Number.isFinite);
          return { ...row, relevant_sectors: relevant, recv_sector_ids: recvSectorIds };
        })
        .filter(preset =>
          (preset.relevant_sectors.includes(toSectorId) || preset.recv_sector_ids.includes(Number(toSectorId))) &&
          preset.id !== fromWorkstationId
        );
      
      if (presetsWithSector.length > 0) {
        resolvedToWorkstationId = presetsWithSector[0].id;
      }
    }
    
    await pool.query(
      'UPDATE strips SET status = $1, workstation_preset_id = $2 WHERE id = $3',
      ['pending_transfer', resolvedToWorkstationId || null, stripId]
    );
    
    const result = await pool.query(
      `INSERT INTO strip_transfers (strip_id, from_sector_id, to_sector_id, initiated_by, status, target_x, target_y, sub_sector_label, from_workstation_id, to_workstation_id) 
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9) RETURNING *`,
      [stripId, fromSectorId, toSectorId, workstationId, targetX || 0, targetY || 0, subSectorLabel || null, fromWorkstationId || null, resolvedToWorkstationId || null]
    );
    
    res.json({ transfer: result.rows[0] });
  } catch (err) {
    console.error('Error initiating transfer:', err);
    res.status(500).json({ error: 'Failed to initiate transfer' });
  }
});

app.get('/api/sectors/:id/incoming-transfers', async (req, res) => {
  try {
    const sectorId = parseInt(req.params.id);
    const result = await pool.query(`
      SELECT t.*, s.callsign, s.sq, s.alt, s.task, s.squadron, s.aircraft_indices,
             sec.name as from_sector_name, sec.label_he as from_sector_label,
             t.target_x, t.target_y, t.sub_sector_label
      FROM strip_transfers t
      JOIN strips s ON t.strip_id = s.id
      LEFT JOIN sectors sec ON t.from_sector_id = sec.id
      WHERE t.to_sector_id = $1 AND t.status = 'pending'
      ORDER BY t.created_at
    `, [sectorId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching incoming transfers:', err);
    res.status(500).json({ error: 'Failed to fetch incoming transfers' });
  }
});

app.get('/api/sectors/:id/outgoing-transfers', async (req, res) => {
  try {
    const sectorId = parseInt(req.params.id);
    const result = await pool.query(`
      SELECT t.*, s.callsign, s.sq, s.alt, s.task, s.squadron, s.aircraft_indices,
             sec.name as to_sector_name, sec.label_he as to_sector_label
      FROM strip_transfers t
      JOIN strips s ON t.strip_id = s.id
      LEFT JOIN sectors sec ON t.to_sector_id = sec.id
      WHERE t.from_sector_id = $1 AND t.status = 'pending'
      ORDER BY t.created_at
    `, [sectorId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching outgoing transfers:', err);
    res.status(500).json({ error: 'Failed to fetch outgoing transfers' });
  }
});

// Workstation-based transfer endpoints (filter by workstation, not just sector)
app.get('/api/workstations/:presetId/incoming-transfers', async (req, res) => {
  try {
    const presetId = parseInt(req.params.presetId);

    // Get the preset's relevant_sectors so we can show shared-sector transfers to all sharing workstations
    const presetRes = await pool.query('SELECT relevant_sectors FROM workstation_presets WHERE id = $1', [presetId]);
    let relevantSectors = [];
    if (presetRes.rows.length > 0) {
      const rs = presetRes.rows[0].relevant_sectors;
      relevantSectors = Array.isArray(rs) ? rs : (typeof rs === 'string' ? JSON.parse(rs || '[]') : []);
    }

    const result = await pool.query(`
      SELECT t.*, s.callsign, s.sq, s.alt, s.task, s.squadron, s.airborne, s.takeoff_time, s.aircraft_indices,
             sec_from.name as from_sector_name, sec_from.label_he as from_sector_label,
             sec_to.name as to_sector_name, sec_to.label_he as to_sector_label,
             t.target_x, t.target_y, t.sub_sector_label
      FROM strip_transfers t
      JOIN strips s ON t.strip_id = s.id
      LEFT JOIN sectors sec_from ON t.from_sector_id = sec_from.id
      LEFT JOIN sectors sec_to ON t.to_sector_id = sec_to.id
      WHERE t.status = 'pending'
        AND (
          t.to_workstation_id = $1
          OR (t.to_sector_id = ANY($2::int[]) AND t.from_workstation_id != $1)
        )
      ORDER BY t.created_at
    `, [presetId, relevantSectors]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching workstation incoming transfers:', err);
    res.status(500).json({ error: 'Failed to fetch incoming transfers' });
  }
});

app.get('/api/workstations/:presetId/outgoing-transfers', async (req, res) => {
  try {
    const presetId = parseInt(req.params.presetId);
    const result = await pool.query(`
      SELECT t.*, s.callsign, s.sq, s.alt, s.task, s.squadron, s.aircraft_indices,
             sec_from.name as from_sector_name, sec_from.label_he as from_sector_label,
             sec_to.name as to_sector_name, sec_to.label_he as to_sector_label
      FROM strip_transfers t
      JOIN strips s ON t.strip_id = s.id
      LEFT JOIN sectors sec_from ON t.from_sector_id = sec_from.id
      LEFT JOIN sectors sec_to ON t.to_sector_id = sec_to.id
      WHERE t.from_workstation_id = $1 AND t.status = 'pending'
      ORDER BY t.created_at
    `, [presetId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching workstation outgoing transfers:', err);
    res.status(500).json({ error: 'Failed to fetch outgoing transfers' });
  }
});

// Global pending transfers — used for cross-workstation altitude conflict detection
app.get('/api/transfers/pending-all', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.id, t.strip_id, t.from_sector_id, t.to_sector_id,
             t.from_workstation_id, t.to_workstation_id, t.sub_sector_label,
             s.alt, s.callsign
      FROM strip_transfers t
      JOIN strips s ON t.strip_id = s.id
      WHERE t.status = 'pending'
      ORDER BY t.created_at
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching all pending transfers:', err);
    res.status(500).json({ error: 'Failed to fetch transfers' });
  }
});

// Classic preset-to-preset transfer initiation
app.post('/api/strips/:id/transfer-to-preset', async (req, res) => {
  try {
    const stripId = parseInt(req.params.id.replace('s', ''));
    const { fromPresetId, toPresetId } = req.body;
    await pool.query('UPDATE strips SET status = $1 WHERE id = $2', ['pending_transfer', stripId]);
    const result = await pool.query(
      `INSERT INTO strip_transfers (strip_id, from_preset_id, to_preset_id, status)
       VALUES ($1, $2, $3, 'pending') RETURNING *`,
      [stripId, fromPresetId, toPresetId]
    );
    res.json({ transfer: result.rows[0] });
  } catch (err) {
    console.error('Error initiating classic transfer:', err);
    res.status(500).json({ error: 'Failed to initiate transfer' });
  }
});

// Classic incoming transfers for a preset:
//   - Direct preset-to-preset (to_preset_id = presetId)
//   - Sector-based transfers TO any sector listed in this preset's classic_receive_points
app.get('/api/presets/:presetId/classic-incoming', async (req, res) => {
  try {
    const presetId = parseInt(req.params.presetId);
    const presetRow = await pool.query('SELECT classic_receive_points, classic_incoming_partner_preset_ids, relevant_sectors FROM workstation_presets WHERE id = $1', [presetId]);
    let recvPoints = [];
    let incomingPartnerIds = [];
    if (presetRow.rows.length > 0) {
      const raw = presetRow.rows[0].classic_receive_points;
      recvPoints = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
      const rawIn = presetRow.rows[0].classic_incoming_partner_preset_ids;
      incomingPartnerIds = (Array.isArray(rawIn) ? rawIn : (typeof rawIn === 'string' ? JSON.parse(rawIn) : []))
        .map(Number).filter(Number.isFinite);
    }
    let recvSectorIds = recvPoints
      .map(p => Number(p.sector_id))
      .filter(n => Number.isFinite(n));
    // Fall back to relevant_sectors when no explicit receive-points are configured
    if (recvSectorIds.length === 0 && presetRow.rows.length > 0) {
      const rawRel = presetRow.rows[0].relevant_sectors;
      const relSectors = Array.isArray(rawRel) ? rawRel : (typeof rawRel === 'string' ? JSON.parse(rawRel) : []);
      recvSectorIds = relSectors.map(Number).filter(Number.isFinite);
    }
    const result = await pool.query(`
      SELECT t.*, s.callsign, s.sq, s.alt, s.task, s.squadron, s.takeoff_time, s.notes, s.erka, s.mivtza, s.koteret, s.number_of_formation, s.aircraft_indices,
             p.name as from_preset_name,
             sec_from.name as from_sector_name, sec_from.label_he as from_sector_label,
             sec_to.name as to_sector_name, sec_to.label_he as to_sector_label
      FROM strip_transfers t
      JOIN strips s ON t.strip_id = s.id
      LEFT JOIN workstation_presets p ON t.from_preset_id = p.id
      LEFT JOIN sectors sec_from ON t.from_sector_id = sec_from.id
      LEFT JOIN sectors sec_to ON t.to_sector_id = sec_to.id
      WHERE t.status = 'pending'
        AND (
          (t.to_preset_id = $1 AND (cardinality($3::int[]) = 0 OR t.from_preset_id = ANY($3::int[])))
          OR (
            t.to_preset_id IS NULL
            AND t.to_sector_id = ANY($2::int[])
            AND (t.from_workstation_id IS NULL OR t.from_workstation_id <> $1)
          )
        )
      ORDER BY t.created_at
    `, [presetId, recvSectorIds, incomingPartnerIds]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching classic incoming transfers:', err);
    res.status(500).json({ error: 'Failed to fetch transfers' });
  }
});

// Classic outgoing transfers from a preset:
//   - Direct preset-to-preset (from_preset_id = presetId)
//   - Sector-based transfers initiated by this preset (from_workstation_id = presetId, no to_preset_id)
app.get('/api/presets/:presetId/classic-outgoing', async (req, res) => {
  try {
    const presetId = parseInt(req.params.presetId);
    const result = await pool.query(`
      SELECT t.*, s.callsign, s.sq, s.alt, s.task, s.squadron, s.takeoff_time, s.notes, s.erka, s.mivtza, s.koteret, s.number_of_formation, s.aircraft_indices,
             p.name as to_preset_name,
             sec_from.name as from_sector_name, sec_from.label_he as from_sector_label,
             sec_to.name as to_sector_name, sec_to.label_he as to_sector_label
      FROM strip_transfers t
      JOIN strips s ON t.strip_id = s.id
      LEFT JOIN workstation_presets p ON t.to_preset_id = p.id
      LEFT JOIN sectors sec_from ON t.from_sector_id = sec_from.id
      LEFT JOIN sectors sec_to ON t.to_sector_id = sec_to.id
      WHERE t.status = 'pending'
        AND (
          t.from_preset_id = $1
          OR (t.from_preset_id IS NULL AND t.to_preset_id IS NULL AND t.from_workstation_id = $1)
        )
      ORDER BY t.created_at
    `, [presetId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching classic outgoing transfers:', err);
    res.status(500).json({ error: 'Failed to fetch transfers' });
  }
});

app.post('/api/transfers/:id/accept', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const transferId = req.params.id;
    
    const transfer = await client.query('SELECT * FROM strip_transfers WHERE id = $1', [transferId]);
    if (transfer.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }
    
    const { strip_id, to_sector_id, to_workstation_id, target_x, target_y, to_preset_id } = transfer.rows[0];
    const { receivingPresetId } = req.body || {};
    const assignedPresetId = receivingPresetId || to_preset_id || to_workstation_id || null;

    // Check if incoming strip is a partial and if a sibling partial already exists at destination
    const incomingStrip = (await client.query('SELECT * FROM strips WHERE id=$1', [strip_id])).rows[0];
    let mergedIntoId = null;
    if (incomingStrip && incomingStrip.parent_strip_id) {
      // Look for another partial of the same parent already at the receiving workstation
      const sibling = await client.query(
        `SELECT * FROM strips WHERE parent_strip_id=$1 AND id!=$2 AND workstation_preset_id=$3 AND status NOT IN ('pending_transfer','deleted')`,
        [incomingStrip.parent_strip_id, strip_id, assignedPresetId]
      );
      if (sibling.rows.length > 0) {
        // Auto-merge incoming into existing sibling
        const sibId = sibling.rows[0].id;
        const parseIdx = (r) => {
          if (Array.isArray(r.aircraft_indices)) return r.aircraft_indices;
          if (r.aircraft_indices) { try { return JSON.parse(r.aircraft_indices); } catch { return null; } }
          return null;
        };
        const sibIdx = parseIdx(sibling.rows[0]) || Array.from({ length: parseInt(sibling.rows[0].number_of_formation||'1')||1 }, (_,i)=>i+1);
        const incIdx = parseIdx(incomingStrip) || Array.from({ length: parseInt(incomingStrip.number_of_formation||'1')||1 }, (_,i)=>i+1);
        const combinedIdx = [...new Set([...sibIdx, ...incIdx])].sort((a,b)=>a-b);
        const origCount = sibling.rows[0].original_formation_count || incomingStrip.original_formation_count;
        const isFull = origCount !== null && combinedIdx.length >= origCount;
        const mergedNotes = [sibling.rows[0].notes, incomingStrip.notes].filter(Boolean).join('\n---\n');
        await client.query(
          `UPDATE strips SET number_of_formation=$1, aircraft_indices=$2, original_formation_count=$3, parent_strip_id=$4, notes=$5 WHERE id=$6`,
          [String(combinedIdx.length), isFull ? null : JSON.stringify(combinedIdx), isFull ? null : origCount, isFull ? null : incomingStrip.parent_strip_id, mergedNotes || null, sibId]
        );
        await client.query('DELETE FROM strips WHERE id=$1', [strip_id]);
        mergedIntoId = 's' + sibId;
      }
    }

    if (!mergedIntoId) {
      if (to_preset_id) {
        await client.query('UPDATE strips SET status=$1, workstation_preset_id=$2, in_table=true WHERE id=$3', ['active', assignedPresetId, strip_id]);
      } else {
        await client.query(
          'UPDATE strips SET sector_id=$1, status=$2, on_map=$3, x=$4, y=$5, held_by_workstation=$6, workstation_preset_id=$7, in_table=true WHERE id=$8',
          [to_sector_id, 'queued', false, target_x||0, target_y||0, assignedPresetId, assignedPresetId, strip_id]
        );
      }
    }
    
    await client.query('UPDATE strip_transfers SET status=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', ['accepted', transferId]);
    // Record explicit assignment in many-to-many table
    if (assignedPresetId && !mergedIntoId) {
      await client.query(
        'INSERT INTO strip_table_assignments (strip_id, preset_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [strip_id, assignedPresetId]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, mergedIntoId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error accepting transfer:', err);
    res.status(500).json({ error: 'Failed to accept transfer' });
  } finally {
    client.release();
  }
});

app.post('/api/transfers/:id/accept-to-map', async (req, res) => {
  try {
    const transferId = req.params.id;
    const { x, y, receivingPresetId } = req.body;
    
    const transfer = await pool.query('SELECT * FROM strip_transfers WHERE id = $1', [transferId]);
    if (transfer.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }
    
    const { strip_id, to_sector_id, to_workstation_id } = transfer.rows[0];
    // Prefer the receiving workstation sent by the client; fall back to transfer record
    const assignedPresetId = receivingPresetId || to_workstation_id || null;
    const mapLat = req.body.map_lat ?? null;
    const mapLon = req.body.map_lon ?? null;
    
    // Update strip: move to target sector AND assign to receiving workstation, place on map
    await pool.query(
      'UPDATE strips SET sector_id = $1, status = $2, on_map = $3, x = $4, y = $5, held_by_workstation = $6, workstation_preset_id = $7, in_table = true, map_lat = $9, map_lon = $10 WHERE id = $8',
      [to_sector_id, 'queued', true, x, y, assignedPresetId, assignedPresetId, strip_id, mapLat, mapLon]
    );
    
    await pool.query(
      'UPDATE strip_transfers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['accepted', transferId]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error accepting transfer to map:', err);
    res.status(500).json({ error: 'Failed to accept transfer to map' });
  }
});

app.post('/api/transfers/:id/reject', async (req, res) => {
  try {
    const transferId = req.params.id;
    
    const transfer = await pool.query('SELECT * FROM strip_transfers WHERE id = $1', [transferId]);
    if (transfer.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }
    
    const stripId = transfer.rows[0].strip_id;
    const fromWorkstationId = transfer.rows[0].from_workstation_id ?? null;
    const stripRow = await pool.query('SELECT on_map, in_table FROM strips WHERE id = $1', [stripId]);
    const sr = stripRow.rows[0];
    const wasOnMap = sr && sr.on_map && !sr.in_table;

    await pool.query(
      'UPDATE strips SET status = $1, workstation_preset_id = $2 WHERE id = $3',
      [wasOnMap ? 'active' : 'queued', fromWorkstationId, stripId]
    );
    
    await pool.query(
      'UPDATE strip_transfers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['rejected', transferId]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error rejecting transfer:', err);
    res.status(500).json({ error: 'Failed to reject transfer' });
  }
});

// Move a pending transfer to a different destination (sector or preset).
// Used by the classic view to drag an already-transferred strip between transfer points / partner stations.
app.post('/api/transfers/:id/move', async (req, res) => {
  try {
    const transferId = req.params.id;
    const { to_sector_id, to_preset_id } = req.body || {};
    if (!to_sector_id && !to_preset_id) {
      return res.status(400).json({ error: 'Must specify to_sector_id or to_preset_id' });
    }
    const existing = await pool.query("SELECT * FROM strip_transfers WHERE id = $1 AND status = 'pending'", [transferId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found or not pending' });
    }
    const t = existing.rows[0];
    if (to_preset_id) {
      // No-op if already targeting this preset.
      if (Number(t.to_preset_id) === Number(to_preset_id)) {
        return res.json({ success: true, noop: true });
      }
      await pool.query(
        "UPDATE strip_transfers SET to_preset_id = $1, to_sector_id = NULL, to_workstation_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [Number(to_preset_id), transferId]
      );
    } else {
      // No-op if already targeting this sector (and not via preset).
      if (!t.to_preset_id && Number(t.to_sector_id) === Number(to_sector_id)) {
        return res.json({ success: true, noop: true });
      }
      // Recompute to_workstation_id from the new sector — same logic used at transfer creation
      // (find a preset whose relevant_sectors contains the sector, excluding the sender).
      let resolvedToWorkstationId = null;
      const presetsResult = await pool.query('SELECT * FROM workstation_presets ORDER BY name');
      const presetsWithSector = presetsResult.rows
        .map(row => ({
          ...row,
          relevant_sectors: Array.isArray(row.relevant_sectors) ? row.relevant_sectors :
            (typeof row.relevant_sectors === 'string' ? JSON.parse(row.relevant_sectors) : [])
        }))
        .filter(preset => preset.relevant_sectors.includes(Number(to_sector_id)) && preset.id !== t.from_workstation_id);
      if (presetsWithSector.length > 0) {
        resolvedToWorkstationId = presetsWithSector[0].id;
      }
      await pool.query(
        "UPDATE strip_transfers SET to_sector_id = $1, to_preset_id = NULL, to_workstation_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
        [Number(to_sector_id), resolvedToWorkstationId, transferId]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error moving transfer:', err);
    res.status(500).json({ error: 'Failed to move transfer' });
  }
});

app.patch('/api/transfers/:id/note', async (req, res) => {
  try {
    const { note, preset_id } = req.body;
    const result = await pool.query(
      'UPDATE strip_transfers SET note=$1, note_by_preset_id=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3 RETURNING id',
      [note || null, preset_id || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Transfer not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating transfer note:', err);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

app.post('/api/transfers/:id/cancel', async (req, res) => {
  try {
    const transferId = req.params.id;
    
    const transfer = await pool.query('SELECT * FROM strip_transfers WHERE id = $1', [transferId]);
    if (transfer.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }
    
    const stripId = transfer.rows[0].strip_id;
    const fromWorkstationId = transfer.rows[0].from_workstation_id ?? null;
    const stripRow = await pool.query('SELECT on_map, in_table FROM strips WHERE id = $1', [stripId]);
    const sr = stripRow.rows[0];
    const wasOnMap = sr && sr.on_map && !sr.in_table;
    
    await pool.query(
      'UPDATE strips SET status = $1, workstation_preset_id = $2 WHERE id = $3',
      [wasOnMap ? 'active' : 'queued', fromWorkstationId, stripId]
    );
    
    await pool.query(
      'UPDATE strip_transfers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['cancelled', transferId]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error cancelling transfer:', err);
    res.status(500).json({ error: 'Failed to cancel transfer' });
  }
});

// Maps API
app.get('/api/maps', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, created_at, anchor1_x_img, anchor1_y_img, anchor1_lat, anchor1_lon, anchor2_x_img, anchor2_y_img, anchor2_lat, anchor2_lon FROM maps ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching maps:', err);
    res.status(500).json({ error: 'Failed to fetch maps' });
  }
});

app.get('/api/maps/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM maps WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Map not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching map:', err);
    res.status(500).json({ error: 'Failed to fetch map' });
  }
});

app.post('/api/maps', async (req, res) => {
  try {
    const { name, image_data } = req.body;
    const result = await pool.query(
      'INSERT INTO maps (name, image_data) VALUES ($1, $2) RETURNING id, name, created_at',
      [name, image_data]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating map:', err);
    res.status(500).json({ error: 'Failed to create map' });
  }
});

app.delete('/api/maps/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM maps WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting map:', err);
    res.status(500).json({ error: 'Failed to delete map' });
  }
});

app.patch('/api/maps/:id/anchors', async (req, res) => {
  try {
    const { anchor1_x_img, anchor1_y_img, anchor1_lat, anchor1_lon, anchor2_x_img, anchor2_y_img, anchor2_lat, anchor2_lon } = req.body;
    const result = await pool.query(
      `UPDATE maps SET anchor1_x_img=$1, anchor1_y_img=$2, anchor1_lat=$3, anchor1_lon=$4, anchor2_x_img=$5, anchor2_y_img=$6, anchor2_lat=$7, anchor2_lon=$8 WHERE id=$9
       RETURNING id, name, anchor1_x_img, anchor1_y_img, anchor1_lat, anchor1_lon, anchor2_x_img, anchor2_y_img, anchor2_lat, anchor2_lon`,
      [anchor1_x_img, anchor1_y_img, anchor1_lat, anchor1_lon, anchor2_x_img, anchor2_y_img, anchor2_lat, anchor2_lon, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Map not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating map anchors:', err);
    res.status(500).json({ error: 'Failed to update map anchors' });
  }
});

// Map Zones API
app.get('/api/map-zones', async (req, res) => {
  try {
    const { map_id } = req.query;
    if (!map_id) return res.status(400).json({ error: 'map_id required' });
    const result = await pool.query(
      'SELECT * FROM map_zones WHERE map_id = $1 ORDER BY id',
      [map_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching map zones:', err);
    res.status(500).json({ error: 'Failed to fetch map zones' });
  }
});

app.post('/api/map-zones', async (req, res) => {
  try {
    const { map_id, name, color, polygon, polygon_geo } = req.body;
    const result = await pool.query(
      'INSERT INTO map_zones (map_id, name, color, polygon, polygon_geo) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [map_id, name, color || '#3b82f6', JSON.stringify(polygon || []), JSON.stringify(polygon_geo || [])]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating map zone:', err);
    res.status(500).json({ error: 'Failed to create map zone' });
  }
});

app.put('/api/map-zones/:id', async (req, res) => {
  try {
    const { name, color, polygon, polygon_geo } = req.body;
    const result = await pool.query(
      'UPDATE map_zones SET name = $1, color = $2, polygon = $3, polygon_geo = $4 WHERE id = $5 RETURNING *',
      [name, color, JSON.stringify(polygon || []), JSON.stringify(polygon_geo || []), req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Zone not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating map zone:', err);
    res.status(500).json({ error: 'Failed to update map zone' });
  }
});

app.delete('/api/map-zones/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM map_zones WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting map zone:', err);
    res.status(500).json({ error: 'Failed to delete map zone' });
  }
});

// Zone Altitude Ranges API
app.get('/api/zone-altitude-ranges', async (req, res) => {
  try {
    const { zone_id } = req.query;
    if (!zone_id) return res.status(400).json({ error: 'zone_id required' });
    const result = await pool.query('SELECT * FROM zone_altitude_ranges WHERE zone_id = $1 ORDER BY sort_order, id', [zone_id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});
app.post('/api/zone-altitude-ranges', async (req, res) => {
  try {
    const { zone_id, name, alt_min, alt_max, sort_order } = req.body;
    const r = await pool.query('INSERT INTO zone_altitude_ranges (zone_id, name, alt_min, alt_max, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING *', [zone_id, name || '', alt_min ?? null, alt_max ?? null, sort_order ?? 0]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});
app.put('/api/zone-altitude-ranges/:id', async (req, res) => {
  try {
    const { name, alt_min, alt_max, sort_order } = req.body;
    const r = await pool.query('UPDATE zone_altitude_ranges SET name=$1, alt_min=$2, alt_max=$3, sort_order=$4 WHERE id=$5 RETURNING *', [name || '', alt_min ?? null, alt_max ?? null, sort_order ?? 0, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});
app.delete('/api/zone-altitude-ranges/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM zone_altitude_ranges WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// Strip Zone Assignments API
app.get('/api/strip-zone-assignments', async (req, res) => {
  try {
    const { map_id } = req.query;
    if (!map_id) return res.status(400).json({ error: 'map_id required' });
    const r = await pool.query(`
      SELECT sza.*, mz.name AS zone_name, mz.color AS zone_color,
             zar.name AS alt_range_name, zar.alt_min, zar.alt_max,
             COALESCE(
               (SELECT json_agg(json_build_object('id', sze.id, 'zone_id', sze.zone_id, 'zone_name', emz.name, 'zone_color', emz.color))
                FROM strip_zone_extra_zones sze
                LEFT JOIN map_zones emz ON emz.id = sze.zone_id
                WHERE sze.strip_id = sza.strip_id),
               '[]'::json
             ) AS extra_zones
      FROM strip_zone_assignments sza
      LEFT JOIN map_zones mz ON mz.id = sza.zone_id
      LEFT JOIN zone_altitude_ranges zar ON zar.id = sza.altitude_range_id
      WHERE (mz.map_id = $1 OR (sza.zone_id IS NULL AND sza.map_id = $1::integer))
      ORDER BY sza.id`, [map_id]);
    r.rows = r.rows.map(row => ({ ...row, requested_zone_ids: row.requested_zone_ids || [], extra_zones: row.extra_zones || [] }));
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/strip-zone-extra-zones', async (req, res) => {
  try {
    const { strip_id, map_id } = req.query;
    let q = `SELECT sze.*, mz.name AS zone_name, mz.color AS zone_color FROM strip_zone_extra_zones sze LEFT JOIN map_zones mz ON mz.id = sze.zone_id WHERE 1=1`;
    const params = [];
    if (strip_id) { params.push(strip_id); q += ` AND sze.strip_id = $${params.length}`; }
    if (map_id) { params.push(map_id); q += ` AND sze.map_id = $${params.length}`; }
    q += ' ORDER BY sze.id';
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/strip-zone-extra-zones', async (req, res) => {
  try {
    const { strip_id, zone_id, map_id } = req.body;
    if (!strip_id || !zone_id) return res.status(400).json({ error: 'strip_id and zone_id required' });
    const r = await pool.query(
      `INSERT INTO strip_zone_extra_zones (strip_id, zone_id, map_id) VALUES ($1,$2,$3)
       ON CONFLICT (strip_id, zone_id) DO UPDATE SET map_id=$3 RETURNING *`,
      [strip_id, zone_id, map_id || null]
    );
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/strip-zone-extra-zones/by-strip/:strip_id', async (req, res) => {
  try {
    await pool.query('DELETE FROM strip_zone_extra_zones WHERE strip_id=$1', [req.params.strip_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/strip-zone-extra-zones/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM strip_zone_extra_zones WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});
app.post('/api/strip-zone-assignments', async (req, res) => {
  try {
    const { strip_id, zone_id, altitude_range_id, status, note, coordination_note, is_coordinated, pos_x, pos_y, requested_zone_ids, map_id } = req.body;
    const r = await pool.query(`
      INSERT INTO strip_zone_assignments (strip_id, zone_id, altitude_range_id, status, note, coordination_note, is_coordinated, pos_x, pos_y, requested_zone_ids, map_id, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
      ON CONFLICT (strip_id) DO UPDATE SET zone_id=$2, altitude_range_id=$3, status=$4, note=$5, coordination_note=$6, is_coordinated=$7, pos_x=$8, pos_y=$9, requested_zone_ids=$10, map_id=$11, updated_at=NOW()
      RETURNING *`, [strip_id, zone_id || null, altitude_range_id || null, status || 'planned', note || '', coordination_note || '', is_coordinated === true, pos_x ?? null, pos_y ?? null, JSON.stringify(requested_zone_ids || []), map_id || null]);
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});
app.delete('/api/strip-zone-assignments/:strip_id', async (req, res) => {
  try {
    await pool.query('DELETE FROM strip_zone_assignments WHERE strip_id=$1', [req.params.strip_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// Civilian strip assignments
app.get('/api/civilian-assignments', async (req, res) => {
  try {
    const { preset_id } = req.query;
    if (!preset_id) return res.json([]);
    const result = await pool.query('SELECT * FROM civilian_strip_assignments WHERE preset_id = $1 ORDER BY col_key, sort_order', [preset_id]);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});
app.post('/api/civilian-assignments', async (req, res) => {
  try {
    const { strip_id, preset_id, col_key, sub_col, sort_order } = req.body;
    if (!strip_id || !preset_id) return res.status(400).json({ error: 'strip_id and preset_id required' });
    const result = await pool.query(
      `INSERT INTO civilian_strip_assignments (strip_id, preset_id, col_key, sub_col, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (strip_id, preset_id) DO UPDATE SET col_key = $3, sub_col = $4, sort_order = $5
       RETURNING *`,
      [strip_id, preset_id, col_key || '', sub_col || '', sort_order ?? 0]
    );
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});
app.delete('/api/civilian-assignments/:stripId/:presetId', async (req, res) => {
  try {
    await pool.query('DELETE FROM civilian_strip_assignments WHERE strip_id = $1 AND preset_id = $2', [req.params.stripId, req.params.presetId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// ─── Civilian Strips API ─────────────────────────────────────────────────────
app.get('/api/civ-strips', async (req, res) => {
  const { preset_id } = req.query;
  if (!preset_id) return res.status(400).json({ error: 'preset_id required' });
  try {
    const result = await pool.query(`
      SELECT s.*, csa.col_key, csa.sub_col, csa.sort_order, csa.id as assignment_id
      FROM strips s
      JOIN civilian_strip_assignments csa ON s.id = csa.strip_id AND csa.preset_id = $1
      ORDER BY csa.col_key, csa.sort_order, s.id
    `, [preset_id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/civ-strips', async (req, res) => {
  const { preset_id, col_key = '', sub_col = '', callSign, unit, civ_fl, civ_stand, civ_dest, civ_time, civ_route, civ_ssr, civ_runway, civ_status } = req.body;
  if (!preset_id) return res.status(400).json({ error: 'preset_id required' });
  try {
    const stripRes = await pool.query(
      `INSERT INTO strips (callsign, unit, status, in_table, civ_status, civ_stand, civ_dest, civ_ssr, civ_fl, civ_route, civ_time, civ_runway)
       VALUES ($1,$2,'active',true,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [callSign||'', unit||'', civ_status||'', civ_stand||'', civ_dest||'', civ_ssr||'', civ_fl||'', civ_route||'', civ_time||'', civ_runway||'']
    );
    const strip = stripRes.rows[0];
    await pool.query(
      `INSERT INTO civilian_strip_assignments (strip_id, preset_id, col_key, sub_col, sort_order) VALUES ($1,$2,$3,$4,0)`,
      [strip.id, preset_id, col_key, sub_col]
    );
    res.json({ ...strip, col_key, sub_col, sort_order: 0, assignment_id: null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/civ-strips/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM strips WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// System Defaults API
app.get('/api/defaults', async (req, res) => {
  try {
    const result = await pool.query('SELECT key, value FROM system_defaults');
    const defaults = {};
    result.rows.forEach((r) => { defaults[r.key] = r.value; });
    res.json(defaults);
  } catch (err) {
    console.error('Error fetching defaults:', err);
    res.status(500).json({ error: 'Failed to fetch defaults' });
  }
});

app.post('/api/defaults', async (req, res) => {
  try {
    const { workstationName, defaultSector, defaultMap } = req.body;
    const updates = [
      ['workstationName', workstationName || ''],
      ['defaultSector', defaultSector || ''],
      ['defaultMap', defaultMap || '']
    ];
    
    for (const [key, value] of updates) {
      await pool.query(
        `INSERT INTO system_defaults (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, value]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving default:', err);
    res.status(500).json({ error: 'Failed to save default' });
  }
});

// Get strips for a workstation - filters by sectors AND held_by_workstation
app.get('/api/workstations/:presetId/strips', async (req, res) => {
  try {
    const presetId = parseInt(req.params.presetId);
    
    // Get the workstation's relevant sectors
    const presetResult = await pool.query('SELECT relevant_sectors FROM workstation_presets WHERE id = $1', [presetId]);
    if (presetResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workstation preset not found' });
    }
    
    let relevantSectors = presetResult.rows[0].relevant_sectors;
    if (typeof relevantSectors === 'string') {
      relevantSectors = JSON.parse(relevantSectors);
    }
    if (!Array.isArray(relevantSectors)) {
      relevantSectors = [];
    }
    
    // Get workstation UUID from preset
    const wsResult = await pool.query(
      'SELECT id FROM workstations WHERE name = (SELECT name FROM workstation_presets WHERE id = $1)',
      [presetId]
    );
    const workstationUuid = wsResult.rows.length > 0 ? wsResult.rows[0].id : null;
    
    // Get strips that:
    // 1. Are assigned directly to this workstation preset (workstation_preset_id = presetId), OR
    // 2. Are in one of the workstation's sectors AND not held by another workstation
    let result;
    if (relevantSectors.length > 0) {
      result = await pool.query(`
        SELECT * FROM strips 
        WHERE 
          workstation_preset_id = $4
          OR (
            sector_id = ANY($1::int[])
            AND (held_by_workstation IS NULL 
                 OR held_by_workstation = $2 
                 OR held_by_workstation = $3)
          )
        ORDER BY id
      `, [relevantSectors, workstationUuid, String(presetId), presetId]);
    } else {
      result = await pool.query(
        'SELECT * FROM strips WHERE workstation_preset_id = $1 ORDER BY id',
        [presetId]
      );
    }
    
    res.json(result.rows.map(r => ({
      id: 's' + r.id,
      callSign: r.callsign,
      numberOfFormation: r.number_of_formation || null,
      sq: r.sq,
      alt: r.alt,
      task: r.task,
      squadron: r.squadron,
      sectorId: r.sector_id,
      status: r.status,
      x: r.x,
      y: r.y,
      onMap: r.on_map,
      airborne: r.airborne,
      notes: r.notes,
      weapons: r.weapons || [],
      targets: r.targets || [],
      systems: r.systems || [],
      shkadia: r.shkadia,
      workstation_preset_id: r.workstation_preset_id,
      custom_fields: r.custom_fields || {},
      takeoff_time: r.takeoff_time || null,
      inTable: r.in_table || false,
      erka: r.erka || '',
      koteret: r.koteret || '',
      mivtza: r.mivtza || '',
      block_space_id: r.block_space_id || null,
      block_deviation: r.block_deviation || false,
      aircraft_positions: Array.isArray(r.aircraft_positions) ? r.aircraft_positions : (r.aircraft_positions ? (() => { try { return JSON.parse(r.aircraft_positions); } catch { return []; } })() : []),
      ground_status: r.ground_status || 'none',
      parent_strip_id: r.parent_strip_id || null,
      aircraft_indices: Array.isArray(r.aircraft_indices) ? r.aircraft_indices : (r.aircraft_indices ? (() => { try { return JSON.parse(r.aircraft_indices); } catch { return null; } })() : null),
      original_formation_count: r.original_formation_count || null,
      map_lat: r.map_lat ?? null,
      map_lon: r.map_lon ?? null
    })));
  } catch (err) {
    console.error('Error fetching workstation strips:', err);
    res.status(500).json({ error: 'Failed to fetch workstation strips' });
  }
});

// All strips in workstation-compatible format (for classic mode query-based filtering)
// --- Strip Table Assignments (many-to-many) ---
app.post('/api/strip-table-assignments', async (req, res) => {
  const { strip_id, preset_id } = req.body;
  if (!strip_id || !preset_id) return res.status(400).json({ error: 'strip_id and preset_id required' });
  try {
    await pool.query(
      'INSERT INTO strip_table_assignments (strip_id, preset_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [parseInt(strip_id), parseInt(preset_id)]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/strip-table-assignments/:stripId/:presetId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM strip_table_assignments WHERE strip_id=$1 AND preset_id=$2',
      [parseInt(req.params.stripId), parseInt(req.params.presetId)]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/strips/global', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*,
        COALESCE(
          array_agg(sta.preset_id ORDER BY sta.preset_id) FILTER (WHERE sta.preset_id IS NOT NULL),
          '{}'::integer[]
        ) AS table_preset_ids
      FROM strips s
      LEFT JOIN strip_table_assignments sta ON sta.strip_id = s.id
      GROUP BY s.id
      ORDER BY s.id
    `);
    res.json(result.rows.map(r => ({
      id: 's' + r.id,
      callSign: r.callsign,
      numberOfFormation: r.number_of_formation || null,
      sq: r.sq,
      alt: r.alt,
      task: r.task,
      squadron: r.squadron,
      sectorId: r.sector_id,
      status: r.status,
      x: r.x,
      y: r.y,
      onMap: r.on_map,
      airborne: r.airborne,
      notes: r.notes,
      weapons: r.weapons || [],
      targets: r.targets || [],
      systems: r.systems || [],
      shkadia: r.shkadia,
      workstation_preset_id: r.workstation_preset_id,
      custom_fields: r.custom_fields || {},
      takeoff_time: r.takeoff_time || null,
      inTable: r.in_table || false,
      erka: r.erka || '',
      koteret: r.koteret || '',
      mivtza: r.mivtza || '',
      block_space_id: r.block_space_id || null,
      block_deviation: r.block_deviation || false,
      aircraft_positions: Array.isArray(r.aircraft_positions) ? r.aircraft_positions : (r.aircraft_positions ? (() => { try { return JSON.parse(r.aircraft_positions); } catch { return []; } })() : []),
      ground_status: r.ground_status || 'none',
      parent_strip_id: r.parent_strip_id || null,
      aircraft_indices: Array.isArray(r.aircraft_indices) ? r.aircraft_indices : (r.aircraft_indices ? (() => { try { return JSON.parse(r.aircraft_indices); } catch { return null; } })() : null),
      original_formation_count: r.original_formation_count || null,
      takeoff_airfield_id: r.takeoff_airfield_id || null,
      landing_airfield_id: r.landing_airfield_id || null,
      map_lat: r.map_lat ?? null,
      map_lon: r.map_lon ?? null,
      table_preset_ids: Array.isArray(r.table_preset_ids) ? r.table_preset_ids.map(Number) : [],
      creator_preset_id: r.creator_preset_id ?? null,
      creator_preset_name: r.creator_preset_name ?? null,
    })));
  } catch (err) {
    console.error('Error fetching global strips:', err);
    res.status(500).json({ error: 'Failed to fetch strips' });
  }
});

// Get strips waiting for a workstation preset
app.get('/api/workstation-presets/:id/waiting-strips', async (req, res) => {
  try {
    const presetId = parseInt(req.params.id);
    const result = await pool.query(
      'SELECT * FROM strips WHERE workstation_preset_id = $1 AND (sector_id IS NULL OR on_map = false) ORDER BY id',
      [presetId]
    );
    res.json(result.rows.map(r => ({
      id: 's' + r.id,
      callSign: r.callsign,
      numberOfFormation: r.number_of_formation || null,
      sq: r.sq,
      alt: r.alt,
      task: r.task,
      squadron: r.squadron,
      sectorId: r.sector_id,
      workstationPresetId: r.workstation_preset_id,
      x: r.x,
      y: r.y,
      onMap: r.on_map,
      airborne: r.airborne,
      notes: r.notes,
      erka: r.erka || '',
      koteret: r.koteret || '',
      mivtza: r.mivtza || '',
      block_space_id: r.block_space_id || null,
      block_deviation: r.block_deviation || false
    })));
  } catch (err) {
    console.error('Error fetching waiting strips:', err);
    res.status(500).json({ error: 'Failed to fetch waiting strips' });
  }
});

// Get workstations that have a specific sector in their relevant_sectors
app.get('/api/sectors/:sectorId/workstations', async (req, res) => {
  try {
    const sectorId = parseInt(req.params.sectorId);
    const result = await pool.query('SELECT * FROM workstation_presets ORDER BY name');
    const presets = result.rows
      .map(row => ({
        ...row,
        relevant_sectors: Array.isArray(row.relevant_sectors) ? row.relevant_sectors : 
          (typeof row.relevant_sectors === 'string' ? JSON.parse(row.relevant_sectors) : [])
      }))
      .filter(preset => preset.relevant_sectors.includes(sectorId));
    res.json(presets);
  } catch (err) {
    console.error('Error fetching workstations by sector:', err);
    res.status(500).json({ error: 'Failed to fetch workstations' });
  }
});

// Table Modes API
app.get('/api/table-modes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM table_modes ORDER BY name');
    res.json(result.rows.map(r => ({
      ...r,
      columns: Array.isArray(r.columns) ? r.columns : (typeof r.columns === 'string' ? JSON.parse(r.columns) : []),
      frozenColumns: r.frozen_columns || 0
    })));
  } catch (err) {
    console.error('Error fetching table modes:', err);
    res.status(500).json({ error: 'Failed to fetch table modes' });
  }
});

app.post('/api/table-modes', async (req, res) => {
  try {
    const { name, columns, frozenColumns } = req.body;
    const result = await pool.query(
      'INSERT INTO table_modes (name, columns, frozen_columns) VALUES ($1, $2, $3) RETURNING *',
      [name, JSON.stringify(columns || []), frozenColumns || 0]
    );
    const row = result.rows[0];
    res.json({ ...row, columns: Array.isArray(row.columns) ? row.columns : JSON.parse(row.columns || '[]'), frozenColumns: row.frozen_columns || 0 });
  } catch (err) {
    console.error('Error creating table mode:', err);
    res.status(500).json({ error: 'Failed to create table mode' });
  }
});

app.put('/api/table-modes/:id', async (req, res) => {
  try {
    const { name, columns, frozenColumns } = req.body;
    const result = await pool.query(
      'UPDATE table_modes SET name = $1, columns = $2, frozen_columns = $3 WHERE id = $4 RETURNING *',
      [name, JSON.stringify(columns || []), frozenColumns || 0, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Table mode not found' });
    const row = result.rows[0];
    res.json({ ...row, columns: Array.isArray(row.columns) ? row.columns : JSON.parse(row.columns || '[]'), frozenColumns: row.frozen_columns || 0 });
  } catch (err) {
    console.error('Error updating table mode:', err);
    res.status(500).json({ error: 'Failed to update table mode' });
  }
});

app.delete('/api/table-modes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM table_modes WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting table mode:', err);
    res.status(500).json({ error: 'Failed to delete table mode' });
  }
});

// Helper: mirror directional partner relationships across other classic presets.
// When preset A says "I receive from X" → X must say "I transfer to A".
// When preset A says "I transfer to Y" → Y must say "I receive from A".
// Removed entries are mirrored as removals on the other side.
async function mirrorClassicPartnerLinks(savedPresetId, incomingIds, outgoingIds) {
  try {
    const meId = Number(savedPresetId);
    const inSet = new Set((Array.isArray(incomingIds) ? incomingIds : []).map(Number).filter(Number.isFinite));
    const outSet = new Set((Array.isArray(outgoingIds) ? outgoingIds : []).map(Number).filter(Number.isFinite));
    const others = await pool.query(
      `SELECT id, classic_incoming_partner_preset_ids, classic_outgoing_partner_preset_ids
       FROM workstation_presets
       WHERE preset_type = 'classic' AND id <> $1`,
      [meId]
    );
    for (const row of others.rows) {
      const oid = Number(row.id);
      const otherIn = new Set((Array.isArray(row.classic_incoming_partner_preset_ids) ? row.classic_incoming_partner_preset_ids : []).map(Number).filter(Number.isFinite));
      const otherOut = new Set((Array.isArray(row.classic_outgoing_partner_preset_ids) ? row.classic_outgoing_partner_preset_ids : []).map(Number).filter(Number.isFinite));
      const beforeIn = JSON.stringify([...otherIn].sort());
      const beforeOut = JSON.stringify([...otherOut].sort());
      // If I (meId) listed `oid` in my outgoing → ensure `meId` is in their incoming. If not → remove me from their incoming.
      if (outSet.has(oid)) otherIn.add(meId); else otherIn.delete(meId);
      // If I (meId) listed `oid` in my incoming → ensure `meId` is in their outgoing. If not → remove me from their outgoing.
      if (inSet.has(oid)) otherOut.add(meId); else otherOut.delete(meId);
      const afterIn = JSON.stringify([...otherIn].sort());
      const afterOut = JSON.stringify([...otherOut].sort());
      if (afterIn !== beforeIn || afterOut !== beforeOut) {
        const otherLegacyUnion = Array.from(new Set([...otherIn, ...otherOut]));
        await pool.query(
          `UPDATE workstation_presets
           SET classic_incoming_partner_preset_ids = $1,
               classic_outgoing_partner_preset_ids = $2,
               classic_partner_preset_ids = $3
           WHERE id = $4`,
          [JSON.stringify([...otherIn]), JSON.stringify([...otherOut]), JSON.stringify(otherLegacyUnion), oid]
        );
      }
    }
  } catch (err) {
    console.error('Error mirroring classic partner links:', err);
  }
}

// Workstation Presets API
app.get('/api/workstation-presets', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM workstation_presets ORDER BY name');
    const presets = result.rows.map(row => ({
      ...row,
      relevant_sectors: Array.isArray(row.relevant_sectors) ? row.relevant_sectors : 
        (typeof row.relevant_sectors === 'string' ? JSON.parse(row.relevant_sectors) : [])
    }));
    res.json(presets);
  } catch (err) {
    console.error('Error fetching workstation presets:', err);
    res.status(500).json({ error: 'Failed to fetch workstation presets' });
  }
});

app.get('/api/workstation-presets/:id/config', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM workstation_presets WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    const row = result.rows[0];
    res.json({ ...row, relevant_sectors: Array.isArray(row.relevant_sectors) ? row.relevant_sectors : (typeof row.relevant_sectors === 'string' ? JSON.parse(row.relevant_sectors) : []) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch preset config' });
  }
});

app.post('/api/workstation-presets', async (req, res) => {
  try {
    const { name, map_id, relevant_sectors, table_mode_id, partial_load, full_load, filter_query, conflict_alt_delta, relevant_control_stations, vertical_time_based, display_mode, classic_strip_table_id, classic_strip_table_id_night, classic_receive_points, classic_transfer_points, preset_type, airfield_id, classic_partner_preset_ids, classic_incoming_partner_preset_ids, classic_outgoing_partner_preset_ids, show_serials, allow_view_switching, show_base_statuses, base_status_ids, preset_role, parent_base_id, can_update_pressure, datk_show_minutes, show_dashboard, can_update_mazaa, civilian_columns, use_map_zones, civilian_board_bg, dual_map_mode, map2_id, dual_map_layout, dual_map_split, suggest_alt_range, show_full_picture } = req.body;
    // Backward-compat: if only legacy single list provided, treat as both directions
    const incomingIds = Array.isArray(classic_incoming_partner_preset_ids) ? classic_incoming_partner_preset_ids : (Array.isArray(classic_partner_preset_ids) ? classic_partner_preset_ids : []);
    const outgoingIds = Array.isArray(classic_outgoing_partner_preset_ids) ? classic_outgoing_partner_preset_ids : (Array.isArray(classic_partner_preset_ids) ? classic_partner_preset_ids : []);
    const legacyUnion = Array.from(new Set([...(incomingIds || []), ...(outgoingIds || [])].map(Number).filter(Number.isFinite)));
    const result = await pool.query(
      `INSERT INTO workstation_presets (name, map_id, relevant_sectors, table_mode_id, partial_load, full_load, filter_query, conflict_alt_delta, relevant_control_stations, vertical_time_based, display_mode, classic_strip_table_id, classic_strip_table_id_night, classic_receive_points, classic_transfer_points, preset_type, airfield_id, classic_partner_preset_ids, classic_incoming_partner_preset_ids, classic_outgoing_partner_preset_ids, show_serials, allow_view_switching, show_base_statuses, base_status_ids, preset_role, parent_base_id, can_update_pressure, datk_show_minutes, show_dashboard, can_update_mazaa, civilian_columns, use_map_zones, civilian_board_bg, dual_map_mode, map2_id, dual_map_layout, dual_map_split, suggest_alt_range, show_full_picture) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39) RETURNING *`,
      [name, map_id, JSON.stringify(relevant_sectors || []), table_mode_id || null, partial_load ?? 3, full_load ?? 5, filter_query ? JSON.stringify(filter_query) : null, conflict_alt_delta ?? 500, relevant_control_stations ? JSON.stringify(relevant_control_stations) : null, vertical_time_based !== false, display_mode || 'complex', classic_strip_table_id || null, classic_strip_table_id_night || null, JSON.stringify(classic_receive_points || []), JSON.stringify(classic_transfer_points || []), preset_type || 'standard', airfield_id || null, JSON.stringify(legacyUnion), JSON.stringify(incomingIds || []), JSON.stringify(outgoingIds || []), show_serials !== false, allow_view_switching !== false, show_base_statuses === true, JSON.stringify(base_status_ids || []), preset_role || null, parent_base_id || null, can_update_pressure === true, datk_show_minutes != null ? parseInt(datk_show_minutes) : null, show_dashboard === true, can_update_mazaa === true, JSON.stringify(civilian_columns || []), use_map_zones === true, civilian_board_bg || '', dual_map_mode === true, map2_id || null, dual_map_layout || 'side-by-side', dual_map_split ?? 50, suggest_alt_range === true, show_full_picture === true]
    );
    const row = result.rows[0];
    await mirrorClassicPartnerLinks(row.id, incomingIds, outgoingIds);
    res.json({ ...row, relevant_sectors: Array.isArray(row.relevant_sectors) ? row.relevant_sectors : JSON.parse(row.relevant_sectors || '[]') });
  } catch (err) {
    console.error('Error creating workstation preset:', err);
    res.status(500).json({ error: 'Failed to create workstation preset' });
  }
});

app.put('/api/workstation-presets/:id', async (req, res) => {
  try {
    const { name, map_id, relevant_sectors, table_mode_id, partial_load, full_load, filter_query, conflict_alt_delta, relevant_control_stations, block_table_ids, vertical_time_based, view_alt_min, view_alt_max, display_mode, classic_strip_table_id, classic_strip_table_id_night, classic_receive_points, classic_transfer_points, preset_type, airfield_id, classic_partner_preset_ids, classic_incoming_partner_preset_ids, classic_outgoing_partner_preset_ids, show_serials, allow_view_switching, show_base_statuses, base_status_ids, preset_role, parent_base_id, can_update_pressure, datk_show_minutes, show_dashboard, flight_zones_mode, can_update_mazaa, civilian_columns, use_map_zones, civilian_board_bg, dual_map_mode, map2_id, dual_map_layout, dual_map_split, suggest_alt_range, show_full_picture } = req.body;
    const incomingIds = Array.isArray(classic_incoming_partner_preset_ids) ? classic_incoming_partner_preset_ids : (Array.isArray(classic_partner_preset_ids) ? classic_partner_preset_ids : []);
    const outgoingIds = Array.isArray(classic_outgoing_partner_preset_ids) ? classic_outgoing_partner_preset_ids : (Array.isArray(classic_partner_preset_ids) ? classic_partner_preset_ids : []);
    const legacyUnion = Array.from(new Set([...(incomingIds || []), ...(outgoingIds || [])].map(Number).filter(Number.isFinite)));
    const result = await pool.query(
      `UPDATE workstation_presets SET name = $1, map_id = $2, relevant_sectors = $3, table_mode_id = $4, partial_load = $5, full_load = $6, filter_query = $7, conflict_alt_delta = $8, relevant_control_stations = $9, block_table_ids = $10, vertical_time_based = $11, view_alt_min = $12, view_alt_max = $13, display_mode = $14, classic_strip_table_id = $15, classic_strip_table_id_night = $16, classic_receive_points = $17, classic_transfer_points = $18, preset_type = $19, airfield_id = $20, classic_partner_preset_ids = $21, classic_incoming_partner_preset_ids = $23, classic_outgoing_partner_preset_ids = $24, show_serials = $25, allow_view_switching = $26, show_base_statuses = $27, base_status_ids = $28, preset_role = $29, parent_base_id = $30, can_update_pressure = $31, datk_show_minutes = $32, show_dashboard = $33, flight_zones_mode = $34, can_update_mazaa = $35, civilian_columns = $36, use_map_zones = $37, civilian_board_bg = $38, dual_map_mode = $39, map2_id = $40, dual_map_layout = $41, dual_map_split = $42, suggest_alt_range = $43, show_full_picture = $44 WHERE id = $22 RETURNING *`,
      [name, map_id, JSON.stringify(relevant_sectors || []), table_mode_id || null, partial_load ?? 3, full_load ?? 5, filter_query ? JSON.stringify(filter_query) : null, conflict_alt_delta ?? 500, relevant_control_stations ? JSON.stringify(relevant_control_stations) : null, JSON.stringify(block_table_ids || []), vertical_time_based !== false, view_alt_min ?? null, view_alt_max ?? null, display_mode || 'complex', classic_strip_table_id || null, classic_strip_table_id_night || null, JSON.stringify(classic_receive_points || []), JSON.stringify(classic_transfer_points || []), preset_type || 'standard', airfield_id || null, JSON.stringify(legacyUnion), req.params.id, JSON.stringify(incomingIds || []), JSON.stringify(outgoingIds || []), show_serials !== false, allow_view_switching !== false, show_base_statuses === true, JSON.stringify(base_status_ids || []), preset_role || null, parent_base_id || null, can_update_pressure === true, datk_show_minutes != null ? parseInt(datk_show_minutes) : null, show_dashboard === true, flight_zones_mode === true, can_update_mazaa === true, JSON.stringify(civilian_columns || []), use_map_zones === true, civilian_board_bg || '', dual_map_mode === true, map2_id || null, dual_map_layout || 'side-by-side', dual_map_split ?? 50, suggest_alt_range === true, show_full_picture === true]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Preset not found' });
    }
    const row = result.rows[0];
    await mirrorClassicPartnerLinks(row.id, incomingIds, outgoingIds);
    res.json({ ...row, relevant_sectors: Array.isArray(row.relevant_sectors) ? row.relevant_sectors : JSON.parse(row.relevant_sectors || '[]') });
  } catch (err) {
    console.error('Error updating workstation preset:', err);
    res.status(500).json({ error: 'Failed to update workstation preset' });
  }
});

app.post('/api/workstation-presets/:id/duplicate', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM workstation_presets WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Preset not found' });
    const src = rows[0];
    const newName = `${src.name} העתק`;
    const result = await pool.query(
      `INSERT INTO workstation_presets (name, map_id, relevant_sectors, table_mode_id, partial_load, full_load, filter_query, conflict_alt_delta, relevant_control_stations, block_table_ids, vertical_time_based, view_alt_min, view_alt_max, display_mode, classic_strip_table_id, classic_strip_table_id_night, classic_receive_points, classic_transfer_points, preset_type, airfield_id, classic_partner_preset_ids, classic_incoming_partner_preset_ids, classic_outgoing_partner_preset_ids, show_serials, allow_view_switching, show_base_statuses, base_status_ids, preset_role, parent_base_id, can_update_pressure, datk_show_minutes, show_dashboard)
       SELECT $1, map_id, relevant_sectors, table_mode_id, partial_load, full_load, filter_query, conflict_alt_delta, relevant_control_stations, block_table_ids, vertical_time_based, view_alt_min, view_alt_max, display_mode, classic_strip_table_id, classic_strip_table_id_night, classic_receive_points, classic_transfer_points, preset_type, airfield_id, classic_partner_preset_ids, classic_incoming_partner_preset_ids, classic_outgoing_partner_preset_ids, show_serials, allow_view_switching, show_base_statuses, base_status_ids, preset_role, parent_base_id, can_update_pressure, datk_show_minutes, show_dashboard
       FROM workstation_presets WHERE id = $2 RETURNING *`,
      [newName, req.params.id]
    );
    const row = result.rows[0];
    res.json({ ...row, relevant_sectors: Array.isArray(row.relevant_sectors) ? row.relevant_sectors : JSON.parse(row.relevant_sectors || '[]') });
  } catch (err) {
    console.error('Error duplicating workstation preset:', err);
    res.status(500).json({ error: 'Failed to duplicate workstation preset' });
  }
});

app.delete('/api/workstation-presets/:id', async (req, res) => {
  try {
    // Unassign strips before deleting so the FK (NO ACTION) doesn't block
    await pool.query('UPDATE strips SET workstation_preset_id = NULL WHERE workstation_preset_id = $1', [req.params.id]);
    await pool.query('DELETE FROM workstation_presets WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting workstation preset:', err);
    res.status(500).json({ error: 'Failed to delete workstation preset' });
  }
});

// PATCH — update only load thresholds for a preset
app.patch('/api/workstation-presets/:id/thresholds', async (req, res) => {
  try {
    const { partial_load, full_load } = req.body;
    const { rows } = await pool.query(
      'UPDATE workstation_presets SET partial_load = $1, full_load = $2 WHERE id = $3 RETURNING id, partial_load, full_load',
      [partial_load ?? 3, full_load ?? 5, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating thresholds:', err);
    res.status(500).json({ error: 'Failed to update thresholds' });
  }
});

// GET — dashboard load counts per workstation preset
app.get('/api/dashboard/load', async (req, res) => {
  try {
    const ids = (req.query.preset_ids || '').toString().split(',').map(Number).filter(Boolean);
    if (!ids.length) return res.json({});
    const { rows } = await pool.query(`
      SELECT
        workstation_preset_id AS preset_id,
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COUNT(*) FILTER (WHERE status = 'active' AND on_map = true) AS on_map,
        COUNT(*) FILTER (WHERE status = 'active' AND in_table = true AND airborne = true) AS in_table_airborne,
        COUNT(*) FILTER (WHERE status = 'active' AND (ground_status IS NULL OR ground_status NOT IN ('takeoff'))) AS ground_active
      FROM strips WHERE workstation_preset_id = ANY($1)
      GROUP BY workstation_preset_id
    `, [ids]);
    const result = {};
    for (const r of rows) result[r.preset_id] = r;
    res.json(result);
  } catch (err) {
    console.error('Error fetching dashboard load:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard load' });
  }
});

// --- Classic Strip Tables API ---
app.get('/api/classic-strip-tables', async (req, res) => {
  try {
    const tables = await pool.query('SELECT * FROM classic_strip_tables ORDER BY name');
    const rows = await pool.query('SELECT * FROM classic_strip_rows ORDER BY table_id, row_number');
    const result = tables.rows.map(t => ({
      ...t,
      rows: rows.rows.filter(r => r.table_id === t.id)
    }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch classic strip tables' });
  }
});

app.post('/api/classic-strip-tables', async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query('INSERT INTO classic_strip_tables (name) VALUES ($1) RETURNING *', [name]);
    const t = result.rows[0];
    // Create 3 default rows with sensible field defaults
    const defaultFields = ['callSign', 'alt', 'task'];
    for (let i = 1; i <= 3; i++) {
      await pool.query(
        `INSERT INTO classic_strip_rows (table_id, row_number, field_name, font_size, bold, text_align)
         VALUES ($1, $2, $3, 14, $4, 'center') ON CONFLICT DO NOTHING`,
        [t.id, i, defaultFields[i - 1], i === 1]
      );
    }
    const rows = await pool.query('SELECT * FROM classic_strip_rows WHERE table_id = $1 ORDER BY row_number', [t.id]);
    res.json({ ...t, rows: rows.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create classic strip table' });
  }
});

app.put('/api/classic-strip-tables/:id', async (req, res) => {
  try {
    const { name } = req.body;
    await pool.query('UPDATE classic_strip_tables SET name = $1 WHERE id = $2', [name, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update classic strip table' });
  }
});

app.delete('/api/classic-strip-tables/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM classic_strip_tables WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete classic strip table' });
  }
});

// Update all 3 rows for a table at once
app.put('/api/classic-strip-tables/:id/rows', async (req, res) => {
  try {
    const { rows } = req.body; // array of row objects
    for (const row of rows) {
      await pool.query(
        `INSERT INTO classic_strip_rows (table_id, row_number, field_name, editable, text_color, bg_color, font_size, bold, italic, underline, border_color, border_width, text_align, row_label, fields, separator)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (table_id, row_number) DO UPDATE SET
           field_name = $3, editable = $4, text_color = $5, bg_color = $6, font_size = $7, bold = $8, italic = $9, underline = $10, border_color = $11, border_width = $12, text_align = $13, row_label = $14, fields = $15, separator = $16`,
        [req.params.id, row.row_number, row.field_name || null, row.editable || false, row.text_color || '', row.bg_color || '', row.font_size || 14, row.bold || false, row.italic || false, row.underline || false, row.border_color || '', row.border_width || 0, row.text_align || 'center', row.row_label || '', row.fields ? JSON.stringify(row.fields) : null, row.separator || ' / ']
      );
    }
    const result = await pool.query('SELECT * FROM classic_strip_rows WHERE table_id = $1 ORDER BY row_number', [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update classic strip rows' });
  }
});

// --- Airfields API (GROUND workstation) ---
app.get('/api/airfields', async (req, res) => {
  try {
    const afs = await pool.query('SELECT * FROM airfields ORDER BY name');
    const pts = await pool.query('SELECT * FROM airfield_points ORDER BY airfield_id, display_order, id');
    const fields = afs.rows.map(af => ({
      ...af,
      points: pts.rows.filter(p => p.airfield_id === af.id)
    }));
    res.json(fields);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch airfields' });
  }
});

app.post('/api/airfields', async (req, res) => {
  try {
    const { name, notes, map_id, sids, stars } = req.body;
    const newSids = Array.isArray(sids) ? sids : [];
    const newStars = Array.isArray(stars) ? stars : [];
    const result = await pool.query(
      'INSERT INTO airfields (name, notes, map_id, sids, stars) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, notes || null, map_id || null, JSON.stringify(newSids), JSON.stringify(newStars)]
    );
    const airfieldId = result.rows[0].id;
    for (const sid of newSids) {
      await pool.query('INSERT INTO airfield_points (airfield_id, name, x_pct, y_pct, display_order, color, marker, density_warn, point_type) VALUES ($1,$2,50,50,0,$3,$4,3,$5)',
        [airfieldId, sid, '#3b82f6', 'circle', 'sid']);
    }
    for (const star of newStars) {
      await pool.query('INSERT INTO airfield_points (airfield_id, name, x_pct, y_pct, display_order, color, marker, density_warn, point_type) VALUES ($1,$2,50,50,0,$3,$4,3,$5)',
        [airfieldId, star, '#f59e0b', 'circle', 'star']);
    }
    const pts = await pool.query('SELECT * FROM airfield_points WHERE airfield_id=$1 ORDER BY display_order, id', [airfieldId]);
    res.json({ ...result.rows[0], points: pts.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create airfield' });
  }
});

app.put('/api/airfields/:id', async (req, res) => {
  try {
    const { name, notes, map_id, sids, stars } = req.body;
    const newSids = Array.isArray(sids) ? sids : [];
    const newStars = Array.isArray(stars) ? stars : [];

    // Sync SID points
    const existingSidPts = await pool.query("SELECT * FROM airfield_points WHERE airfield_id=$1 AND point_type='sid'", [req.params.id]);
    for (const pt of existingSidPts.rows) {
      if (!newSids.includes(pt.name)) await pool.query('DELETE FROM airfield_points WHERE id=$1', [pt.id]);
    }
    const existingSidNames = existingSidPts.rows.map(p => p.name);
    for (const sid of newSids) {
      if (!existingSidNames.includes(sid)) {
        await pool.query('INSERT INTO airfield_points (airfield_id, name, x_pct, y_pct, display_order, color, marker, density_warn, point_type) VALUES ($1,$2,50,50,0,$3,$4,3,$5)',
          [req.params.id, sid, '#3b82f6', 'circle', 'sid']);
      }
    }

    // Sync STAR points
    const existingStarPts = await pool.query("SELECT * FROM airfield_points WHERE airfield_id=$1 AND point_type='star'", [req.params.id]);
    for (const pt of existingStarPts.rows) {
      if (!newStars.includes(pt.name)) await pool.query('DELETE FROM airfield_points WHERE id=$1', [pt.id]);
    }
    const existingStarNames = existingStarPts.rows.map(p => p.name);
    for (const star of newStars) {
      if (!existingStarNames.includes(star)) {
        await pool.query('INSERT INTO airfield_points (airfield_id, name, x_pct, y_pct, display_order, color, marker, density_warn, point_type) VALUES ($1,$2,50,50,0,$3,$4,3,$5)',
          [req.params.id, star, '#f59e0b', 'circle', 'star']);
      }
    }

    const result = await pool.query(
      'UPDATE airfields SET name=$1, notes=$2, map_id=$3, sids=$4, stars=$5 WHERE id=$6 RETURNING *',
      [name, notes || null, map_id || null, JSON.stringify(newSids), JSON.stringify(newStars), req.params.id]
    );
    const pts = await pool.query('SELECT * FROM airfield_points WHERE airfield_id=$1 ORDER BY display_order, id', [req.params.id]);
    res.json({ ...result.rows[0], points: pts.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update airfield' });
  }
});

app.delete('/api/airfields/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM airfields WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete airfield' });
  }
});

app.put('/api/airfields/:id/vector', async (req, res) => {
  try {
    const { vector_data } = req.body;
    const result = await pool.query(
      'UPDATE airfields SET vector_data=$1 WHERE id=$2 RETURNING *',
      [vector_data ? JSON.stringify(vector_data) : null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save vector data' });
  }
});

// --- Airfield Element Types ---
app.get('/api/airfield-element-types', async (req, res) => {
  try { res.json((await pool.query('SELECT * FROM airfield_element_types ORDER BY name')).rows); }
  catch (err) { res.status(500).json({ error: 'Failed' }); }
});
app.post('/api/airfield-element-types', async (req, res) => {
  try {
    const { name, color, icon, can_change_status, allowed_statuses } = req.body;
    const r = await pool.query(
      'INSERT INTO airfield_element_types (name,color,icon,can_change_status,allowed_statuses) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, color || '#f59e0b', icon || '🔧', can_change_status === true, JSON.stringify(allowed_statuses || [])]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});
app.put('/api/airfield-element-types/:id', async (req, res) => {
  try {
    const { name, color, icon, can_change_status, allowed_statuses } = req.body;
    const r = await pool.query(
      'UPDATE airfield_element_types SET name=$1,color=$2,icon=$3,can_change_status=$4,allowed_statuses=$5 WHERE id=$6 RETURNING *',
      [name, color || '#f59e0b', icon || '🔧', can_change_status === true, JSON.stringify(allowed_statuses || []), req.params.id]
    );
    res.json(r.rows[0] || {});
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});
app.delete('/api/airfield-element-types/:id', async (req, res) => {
  try { await pool.query('DELETE FROM airfield_element_types WHERE id=$1', [req.params.id]); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// --- Airfield Elements ---
app.get('/api/airfield-elements', async (req, res) => {
  try {
    const q = req.query.airfield_id
      ? 'SELECT ae.*, aet.name as type_name, aet.color as type_color, aet.icon as type_icon, aet.can_change_status as type_can_change_status, aet.allowed_statuses as type_allowed_statuses FROM airfield_elements ae LEFT JOIN airfield_element_types aet ON ae.element_type_id=aet.id WHERE ae.airfield_id=$1 ORDER BY ae.id'
      : 'SELECT ae.*, aet.name as type_name, aet.color as type_color, aet.icon as type_icon, aet.can_change_status as type_can_change_status, aet.allowed_statuses as type_allowed_statuses FROM airfield_elements ae LEFT JOIN airfield_element_types aet ON ae.element_type_id=aet.id ORDER BY ae.airfield_id, ae.id';
    const params = req.query.airfield_id ? [req.query.airfield_id] : [];
    res.json((await pool.query(q, params)).rows);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});
app.post('/api/airfield-elements', async (req, res) => {
  try {
    const { airfield_id, element_type_id, name, status, note, x_pct, y_pct, category } = req.body;
    const r = await pool.query(
      'INSERT INTO airfield_elements (airfield_id,element_type_id,name,status,note,x_pct,y_pct,category) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [airfield_id, element_type_id || null, name, status || 'תקין', note || null, x_pct ?? null, y_pct ?? null, category || '']
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});
app.put('/api/airfield-elements/:id', async (req, res) => {
  try {
    const { element_type_id, name, status, note, x_pct, y_pct, category } = req.body;
    const r = await pool.query(
      'UPDATE airfield_elements SET element_type_id=$1,name=$2,status=$3,note=$4,x_pct=$5,y_pct=$6,category=$7 WHERE id=$8 RETURNING *',
      [element_type_id || null, name, status || 'תקין', note || null, x_pct ?? null, y_pct ?? null, category || '', req.params.id]
    );
    res.json(r.rows[0] || {});
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});
app.delete('/api/airfield-elements/:id', async (req, res) => {
  try { await pool.query('DELETE FROM airfield_elements WHERE id=$1', [req.params.id]); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/airfields/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM airfields WHERE id=$1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch airfield' });
  }
});

app.get('/api/airfields/:id/points', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM airfield_points WHERE airfield_id=$1 ORDER BY display_order, id', [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch airfield points' });
  }
});

app.post('/api/airfields/:id/points', async (req, res) => {
  try {
    const { name, x_pct, y_pct, display_order } = req.body;
    const result = await pool.query(
      'INSERT INTO airfield_points (airfield_id, name, x_pct, y_pct, display_order, color, marker, density_warn, point_type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [req.params.id, name, x_pct ?? 50, y_pct ?? 50, display_order ?? 0, req.body.color || '#3b82f6', req.body.marker || 'circle', req.body.density_warn ?? 3, req.body.point_type || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create airfield point' });
  }
});

app.put('/api/airfield-points/:id', async (req, res) => {
  try {
    const { name, x_pct, y_pct, display_order } = req.body;
    const result = await pool.query(
      'UPDATE airfield_points SET name=$1, x_pct=$2, y_pct=$3, display_order=$4, color=$5, marker=$6, density_warn=$7, point_type=$8 WHERE id=$9 RETURNING *',
      [name, x_pct ?? 50, y_pct ?? 50, display_order ?? 0, req.body.color || '#3b82f6', req.body.marker || 'circle', req.body.density_warn ?? 3, req.body.point_type || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update airfield point' });
  }
});

app.delete('/api/airfield-points/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM airfield_points WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete airfield point' });
  }
});

// Update strip aircraft positions and ground_status
app.put('/api/strips/:id/aircraft', async (req, res) => {
  try {
    const stripId = parseInt(String(req.params.id).replace('s', ''));
    const { aircraft_positions, ground_status } = req.body;
    const fields = [];
    const vals = [];
    let idx = 1;
    if (aircraft_positions !== undefined) { fields.push(`aircraft_positions=$${idx++}`); vals.push(JSON.stringify(aircraft_positions)); }
    if (ground_status !== undefined) { fields.push(`ground_status=$${idx++}`); vals.push(ground_status); }
    if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(stripId);
    const result = await pool.query(`UPDATE strips SET ${fields.join(', ')} WHERE id=$${idx} RETURNING *`, vals);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update strip aircraft data' });
  }
});

// GET strip_aircraft for multiple strips: ?strip_ids=1,2,3 (also handles 's'-prefixed IDs like 's416')
app.get('/api/strip-aircraft', async (req, res) => {
  try {
    const ids = String(req.query.strip_ids || '').split(',').map(s => parseInt(s.replace(/^s/, ''))).filter(n => !isNaN(n) && n > 0);
    if (ids.length === 0) return res.json([]);
    const result = await pool.query(
      `SELECT * FROM strip_aircraft WHERE strip_id = ANY($1) ORDER BY strip_id, idx`,
      [ids]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get strip aircraft' });
  }
});

// PUT single aircraft row datk/kipa
app.put('/api/strip-aircraft/:stripId/:idx', async (req, res) => {
  try {
    const stripId = parseInt(req.params.stripId.replace(/^s/, ''));
    const idx = parseInt(req.params.idx);
    if (isNaN(stripId) || isNaN(idx) || idx < 1) {
      return res.status(400).json({ error: 'Invalid stripId or idx' });
    }
    const { datk, kipa } = req.body;
    await pool.query(
      `INSERT INTO strip_aircraft (strip_id, idx, datk, kipa)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (strip_id, idx) DO UPDATE SET datk = EXCLUDED.datk, kipa = EXCLUDED.kipa`,
      [stripId, idx, datk ?? null, kipa ?? null]
    );
    const result = await pool.query('SELECT * FROM strip_aircraft WHERE strip_id=$1 AND idx=$2', [stripId, idx]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update strip aircraft' });
  }
});

// POST /api/strips/ground-single-transfer
// Extracts one aircraft from a ground strip and creates a new 1-aircraft strip ready for transfer.
// Body: { sourceStripId, aircraftIdx }
// Returns: { newStripId, remaining, sourceDeleted }
app.post('/api/strips/ground-single-transfer', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { sourceStripId, aircraftIdx } = req.body;
    const rawId = parseInt(String(sourceStripId).replace(/^s/, ''));
    const aidx = parseInt(String(aircraftIdx));
    if (isNaN(rawId) || isNaN(aidx) || aidx < 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid sourceStripId or aircraftIdx' });
    }

    const srcRow = await client.query('SELECT * FROM strips WHERE id=$1', [rawId]);
    if (srcRow.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Source strip not found' });
    }
    const src = srcRow.rows[0];

    // Determine parent tracking
    const rootParentId = src.parent_strip_id || src.id;
    const origCount = src.original_formation_count || parseInt(src.number_of_formation || '1') || 1;
    const srcIndices = Array.isArray(src.aircraft_indices)
      ? src.aircraft_indices
      : (src.aircraft_indices ? (() => { try { return JSON.parse(src.aircraft_indices); } catch { return null; } })() : null)
        || Array.from({ length: origCount }, (_, i) => i + 1);

    // Map sequential aidx (strip_aircraft.idx, may be renumbered) to the original aircraft index.
    // If aidx is already present in srcIndices (not renumbered), use it directly.
    // Otherwise fall back to positional mapping using the sorted srcIndices array.
    const sortedSrcIndices = [...srcIndices].sort((a, b) => a - b);
    const originalIndex = sortedSrcIndices.includes(aidx) ? aidx : (sortedSrcIndices[aidx - 1] ?? aidx);

    // Get the strip_aircraft row for this aircraft by original index
    const saRow = await client.query('SELECT * FROM strip_aircraft WHERE strip_id=$1 AND idx=$2', [rawId, originalIndex]);
    const sa = saRow.rows[0] || null;

    // Create new 1-aircraft strip (clone of source fields)
    const newRes = await client.query(
      `INSERT INTO strips (callsign, sq, alt, task, squadron, sector_id, takeoff_time,
         number_of_formation, erka, koteret, mivtza, notes, status, workstation_preset_id,
         in_table, parent_strip_id, aircraft_indices, original_formation_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'1',$8,$9,$10,$11,'active',$12,true,$13,$14,$15)
       RETURNING id`,
      [
        src.callsign, src.sq, src.alt, src.task, src.squadron,
        src.sector_id, src.takeoff_time,
        src.erka, src.koteret, src.mivtza, src.notes,
        src.workstation_preset_id,
        rootParentId, JSON.stringify([originalIndex]), origCount
      ]
    );
    const newStripId = newRes.rows[0].id;

    // Copy strip_aircraft row to new strip, preserving the original index
    if (sa) {
      await client.query(
        'INSERT INTO strip_aircraft (strip_id, idx, datk, kipa) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [newStripId, originalIndex, sa.datk, sa.kipa]
      );
    }

    // Remove the aircraft from the source strip_aircraft (no renumbering — preserve original indices)
    await client.query('DELETE FROM strip_aircraft WHERE strip_id=$1 AND idx=$2', [rawId, originalIndex]);

    // Decrement source or delete if last aircraft
    const newCount = Math.max(0, (parseInt(src.number_of_formation || '1') || 1) - 1);
    let sourceDeleted = false;
    if (newCount <= 0) {
      await client.query('DELETE FROM strips WHERE id=$1', [rawId]);
      sourceDeleted = true;
    } else {
      const remainingIndices = srcIndices.filter(i => i !== originalIndex);
      const srcPositions = Array.isArray(src.aircraft_positions)
        ? src.aircraft_positions
        : (src.aircraft_positions ? (() => { try { return JSON.parse(src.aircraft_positions); } catch { return []; } })() : []);
      const remainingPositions = srcPositions.filter(p => p.idx !== originalIndex);
      await client.query(
        `UPDATE strips SET number_of_formation=$1, aircraft_indices=$2, aircraft_positions=$3,
           parent_strip_id=$4, original_formation_count=$5 WHERE id=$6`,
        [String(newCount), JSON.stringify(remainingIndices), JSON.stringify(remainingPositions), rootParentId, origCount, rawId]
      );
    }

    await client.query('COMMIT');
    res.json({ newStripId: 's' + newStripId, remaining: newCount, sourceDeleted });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error in ground-single-transfer:', err);
    res.status(500).json({ error: 'Failed to extract aircraft from ground strip' });
  } finally {
    client.release();
  }
});

// POST create a new strip directly from ground workstation
app.post('/api/strips/ground-create', async (req, res) => {
  try {
    const { callSign, sq, number_of_formation, workstation_preset_id, sector_id, strip_type, creator_preset_name } = req.body;
    const count = Math.max(1, Math.min(parseInt(number_of_formation) || 1, 16));
    const defaultPositions = Array.from({ length: count }, (_, i) => ({ idx: i + 1, point_id: null, status: 'none' }));
    const result = await pool.query(
      `INSERT INTO strips (callsign, sq, number_of_formation, aircraft_positions, workstation_preset_id, creator_preset_id, sector_id, status, in_table, strip_type, creator_preset_name)
       VALUES ($1, $2, $3, $4, $5, $5, $6, 'active', true, $7, $8) RETURNING *`,
      [callSign || '?', sq || '', count, JSON.stringify(defaultPositions), workstation_preset_id || null, sector_id || null, strip_type || '', creator_preset_name || null]
    );
    const strip = result.rows[0];
    // Auto-create strip_aircraft rows
    for (let i = 1; i <= count; i++) {
      await pool.query(
        `INSERT INTO strip_aircraft (strip_id, idx) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [strip.id, i]
      );
    }
    res.json(strip);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create strip' });
  }
});

// POST ensure strip_aircraft rows exist for a strip (idempotent)
app.post('/api/strip-aircraft/ensure/:stripId', async (req, res) => {
  try {
    const stripId = parseInt(req.params.stripId.replace(/^s/, ''));
    const { count, randomize } = req.body;
    const n = Math.max(1, Math.min(parseInt(count) || 1, 16));
    for (let i = 1; i <= n; i++) {
      if (randomize) {
        const datk = Math.floor(Math.random() * 4) + 1;
        const kipa = String(Math.floor(Math.random() * 8) + 1);
        await pool.query(
          `INSERT INTO strip_aircraft (strip_id, idx, datk, kipa) VALUES ($1, $2, $3, $4)
           ON CONFLICT (strip_id, idx) DO UPDATE SET datk=EXCLUDED.datk, kipa=EXCLUDED.kipa`,
          [stripId, i, datk, kipa]
        );
      } else {
        await pool.query(
          `INSERT INTO strip_aircraft (strip_id, idx) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [stripId, i]
        );
      }
    }
    const result = await pool.query('SELECT * FROM strip_aircraft WHERE strip_id=$1 ORDER BY idx', [stripId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to ensure strip aircraft' });
  }
});


// POST /api/strip-aircraft/bulk-import — bulk upsert aircraft rows by formation callsign
app.post('/api/strip-aircraft/bulk-import', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No rows provided' });
    let imported = 0, skipped = 0;
    const errors = [];
    for (const row of rows) {
      const callsign = String(row.formation_callsign || row.callsign || '').trim();
      const idx = parseInt(row.idx);
      const datk = (row.datk !== undefined && row.datk !== '') ? parseInt(row.datk) : null;
      const kipa = (row.kipa !== undefined && String(row.kipa).trim() !== '') ? String(row.kipa).trim() : null;
      if (!callsign || isNaN(idx) || idx < 1) { skipped++; continue; }
      const stripResult = await pool.query('SELECT id FROM strips WHERE LOWER(callsign) = LOWER($1) LIMIT 1', [callsign]);
      if (stripResult.rows.length === 0) { errors.push(`פ"מ "${callsign}" לא נמצא`); skipped++; continue; }
      const strip_id = stripResult.rows[0].id;
      await pool.query(
        `INSERT INTO strip_aircraft (strip_id, idx, datk, kipa) VALUES ($1, $2, $3, $4)
         ON CONFLICT (strip_id, idx) DO UPDATE SET datk=EXCLUDED.datk, kipa=EXCLUDED.kipa`,
        [strip_id, idx, isNaN(datk) ? null : datk, kipa]
      );
      // get strip_aircraft id for armaments/systems
      const saRes = await pool.query('SELECT id FROM strip_aircraft WHERE strip_id=$1 AND idx=$2', [strip_id, idx]);
      const sa_id = saRes.rows[0]?.id;
      if (sa_id) {
        if (Array.isArray(row.armaments) && row.armaments.length > 0) {
          await pool.query('DELETE FROM strip_aircraft_armaments WHERE strip_aircraft_id=$1', [sa_id]);
          for (const arm of row.armaments) {
            if (arm.name) await pool.query(
              'INSERT INTO strip_aircraft_armaments (strip_aircraft_id, armament_name, quantity) VALUES ($1,$2,$3)',
              [sa_id, String(arm.name).trim(), parseInt(arm.quantity) || 1]
            );
          }
        }
        if (Array.isArray(row.systems) && row.systems.length > 0) {
          await pool.query('DELETE FROM strip_aircraft_systems WHERE strip_aircraft_id=$1', [sa_id]);
          for (const sys of row.systems) {
            if (sys.name) await pool.query(
              'INSERT INTO strip_aircraft_systems (strip_aircraft_id, system_name, status) VALUES ($1,$2,$3)',
              [sa_id, String(sys.name).trim(), String(sys.status || 'שמיש').trim()]
            );
          }
        }
      }
      imported++;
    }
    res.json({ imported, skipped, errors });
  } catch (err) {
    console.error('[bulk-import aircraft]', err);
    res.status(500).json({ error: String(err) });
  }
});

// DELETE single aircraft from a strip (ground mode single-aircraft transfer)
// Renumbers the remaining aircraft so indices stay sequential (1, 2, 3, ...)
app.delete('/api/strip-aircraft/:stripId/:idx', async (req, res) => {
  try {
    const stripId = parseInt(req.params.stripId.replace(/^s/, ''));
    const idx = parseInt(req.params.idx);
    if (isNaN(stripId) || isNaN(idx) || idx < 1) {
      return res.status(400).json({ error: 'Invalid stripId or idx' });
    }

    // Remove the aircraft row
    await pool.query('DELETE FROM strip_aircraft WHERE strip_id=$1 AND idx=$2', [stripId, idx]);

    // Renumber remaining rows: any idx > removed idx shifts down by 1
    await pool.query(
      'UPDATE strip_aircraft SET idx = idx - 1 WHERE strip_id=$1 AND idx > $2',
      [stripId, idx]
    );

    // Update aircraft_positions on the strip:
    //  - remove the deleted entry
    //  - shift higher indices down by 1
    //  - decrement number_of_formation
    const updated = await pool.query(
      `UPDATE strips SET
        aircraft_positions = (
          SELECT COALESCE(
            jsonb_agg(
              CASE WHEN (elem->>'idx')::int > $2
                THEN jsonb_set(elem, '{idx}', to_jsonb((elem->>'idx')::int - 1))
                ELSE elem
              END
              ORDER BY (elem->>'idx')::int
            ),
            '[]'::jsonb
          )
          FROM jsonb_array_elements(COALESCE(aircraft_positions, '[]'::jsonb)) elem
          WHERE (elem->>'idx')::int != $2
        ),
        number_of_formation = GREATEST(0, COALESCE(number_of_formation::int, 1) - 1)::text
       WHERE id=$1
       RETURNING id, number_of_formation, aircraft_positions`,
      [stripId, idx]
    );
    const row = updated.rows[0];
    res.json({
      id: row.id,
      numberOfFormation: parseInt(row.number_of_formation || '0') || 0,
      aircraftPositions: row.aircraft_positions || []
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove aircraft' });
  }
});

// ─── Strip Aircraft Armaments API ─────────────────────────────────────────
app.get('/api/strip-aircraft-armaments', async (req, res) => {
  try {
    const { aircraft_id } = req.query;
    if (!aircraft_id) return res.json([]);
    const { rows } = await pool.query(
      'SELECT * FROM strip_aircraft_armaments WHERE strip_aircraft_id=$1 ORDER BY id',
      [aircraft_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch armaments' }); }
});

// Bulk fetch: ?aircraft_ids=1,2,3
app.get('/api/strip-aircraft-armaments/bulk', async (req, res) => {
  try {
    const ids = String(req.query.aircraft_ids || '').split(',').map(Number).filter(Boolean);
    if (ids.length === 0) return res.json([]);
    const { rows } = await pool.query(
      'SELECT * FROM strip_aircraft_armaments WHERE strip_aircraft_id = ANY($1) ORDER BY strip_aircraft_id, id',
      [ids]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch armaments' }); }
});

app.post('/api/strip-aircraft-armaments', async (req, res) => {
  try {
    const { strip_aircraft_id, armament_name, quantity } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO strip_aircraft_armaments (strip_aircraft_id, armament_name, quantity) VALUES ($1,$2,$3) RETURNING *',
      [strip_aircraft_id, armament_name || '', quantity || 1]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to add armament' }); }
});

app.put('/api/strip-aircraft-armaments/:id', async (req, res) => {
  try {
    const { armament_name, quantity } = req.body;
    const { rows } = await pool.query(
      'UPDATE strip_aircraft_armaments SET armament_name=$1, quantity=$2 WHERE id=$3 RETURNING *',
      [armament_name || '', quantity || 1, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update armament' }); }
});

app.delete('/api/strip-aircraft-armaments/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM strip_aircraft_armaments WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete armament' }); }
});

// ─── Strip Aircraft Systems API ────────────────────────────────────────────
app.get('/api/strip-aircraft-systems', async (req, res) => {
  try {
    const { aircraft_id } = req.query;
    if (!aircraft_id) return res.json([]);
    const { rows } = await pool.query(
      'SELECT * FROM strip_aircraft_systems WHERE strip_aircraft_id=$1 ORDER BY id',
      [aircraft_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch systems' }); }
});

// Bulk fetch: ?aircraft_ids=1,2,3
app.get('/api/strip-aircraft-systems/bulk', async (req, res) => {
  try {
    const ids = String(req.query.aircraft_ids || '').split(',').map(Number).filter(Boolean);
    if (ids.length === 0) return res.json([]);
    const { rows } = await pool.query(
      'SELECT * FROM strip_aircraft_systems WHERE strip_aircraft_id = ANY($1) ORDER BY strip_aircraft_id, id',
      [ids]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch systems' }); }
});

app.post('/api/strip-aircraft-systems', async (req, res) => {
  try {
    const { strip_aircraft_id, system_name, status } = req.body;
    const { rows } = await pool.query(
      "INSERT INTO strip_aircraft_systems (strip_aircraft_id, system_name, status) VALUES ($1,$2,$3) RETURNING *",
      [strip_aircraft_id, system_name || '', status || 'שמיש']
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to add system' }); }
});

app.put('/api/strip-aircraft-systems/:id', async (req, res) => {
  try {
    const { system_name, status } = req.body;
    const { rows } = await pool.query(
      'UPDATE strip_aircraft_systems SET system_name=$1, status=$2 WHERE id=$3 RETURNING *',
      [system_name || '', status || 'שמיש', req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update system' }); }
});

app.delete('/api/strip-aircraft-systems/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM strip_aircraft_systems WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete system' }); }
});

// ─── Formation Summary for a strip (פ"מ אב) ───────────────────────────────
// Returns: { hasShakadia, armaments: [{name,totalQty,aircraftNums}], systemsByAircraft: [{idx,systems}] }
app.get('/api/strips/:id/formation-summary', async (req, res) => {
  try {
    const stripId = parseInt(String(req.params.id).replace(/^s/, ''));
    if (isNaN(stripId)) return res.json({ hasShakadia: false, armaments: [], systemsByAircraft: [] });
    const saRows = await pool.query('SELECT * FROM strip_aircraft WHERE strip_id=$1 ORDER BY idx', [stripId]);
    const aircraftRows = saRows.rows;
    if (aircraftRows.length === 0) return res.json({ hasShakadia: false, armaments: [], systemsByAircraft: [] });

    const acIds = aircraftRows.map(r => r.id);

    const [armRes, sysRes] = await Promise.all([
      pool.query('SELECT * FROM strip_aircraft_armaments WHERE strip_aircraft_id = ANY($1) ORDER BY strip_aircraft_id, id', [acIds]),
      pool.query('SELECT * FROM strip_aircraft_systems WHERE strip_aircraft_id = ANY($1) ORDER BY strip_aircraft_id, id', [acIds])
    ]);

    // Map aircraft id → idx
    const idToIdx = {};
    aircraftRows.forEach(r => { idToIdx[r.id] = r.idx; });

    // Compute armament summary
    const armMap = {};
    armRes.rows.forEach(r => {
      const idx = idToIdx[r.strip_aircraft_id];
      if (!armMap[r.armament_name]) armMap[r.armament_name] = { totalQty: 0, aircraftNums: [] };
      armMap[r.armament_name].totalQty += r.quantity;
      if (!armMap[r.armament_name].aircraftNums.includes(idx)) armMap[r.armament_name].aircraftNums.push(idx);
    });
    const armaments = Object.entries(armMap).map(([name, v]) => ({ name, totalQty: v.totalQty, aircraftNums: v.aircraftNums.sort((a,b)=>a-b) }));

    // Compute שקדיה: any aircraft with system matching שקד with status שמיש
    const SHAKADIA_NAMES = ['שקדיה', 'שקדייה', 'שקדה', 'שקדיה '];
    const hasShakadia = sysRes.rows.some(r =>
      SHAKADIA_NAMES.some(n => r.system_name.trim().toLowerCase() === n.trim().toLowerCase()) &&
      r.status === 'שמיש'
    );

    // Systems by aircraft
    const systemsByAircraft = aircraftRows.map(ar => ({
      idx: ar.idx,
      systems: sysRes.rows.filter(r => r.strip_aircraft_id === ar.id)
    }));

    res.json({ hasShakadia, armaments, systemsByAircraft });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to get formation summary' }); }
});

// ─── Formation Meta Update (formation_notes + parent_callsign) ────────────
app.put('/api/strips/:id/formation-meta', async (req, res) => {
  try {
    const { formation_notes, parent_callsign } = req.body;
    const { rows } = await pool.query(
      `UPDATE strips SET
        formation_notes = COALESCE($1, formation_notes),
        parent_callsign = COALESCE($2, parent_callsign)
       WHERE id=$3 RETURNING id, formation_notes, parent_callsign`,
      [formation_notes ?? null, parent_callsign ?? null, req.params.id]
    );
    res.json(rows[0] || {});
  } catch (err) { res.status(500).json({ error: 'Failed to update formation meta' }); }
});

// ─── Bulk Formation Summaries ─────────────────────────────────────────────
app.get('/api/strips/formation-summaries', async (req, res) => {
  try {
    const ids = String(req.query.strip_ids || '').split(',').map(Number).filter(Boolean);
    if (ids.length === 0) return res.json({});
    const result = {};
    const saRows = await pool.query(
      'SELECT * FROM strip_aircraft WHERE strip_id = ANY($1) ORDER BY strip_id, idx', [ids]
    );
    const acIds = saRows.rows.map(r => r.id);
    if (acIds.length === 0) {
      ids.forEach(id => { result[id] = { hasShakadia: false, armaments: [] }; });
      return res.json(result);
    }
    const [armRes, sysRes] = await Promise.all([
      pool.query('SELECT * FROM strip_aircraft_armaments WHERE strip_aircraft_id = ANY($1)', [acIds]),
      pool.query('SELECT * FROM strip_aircraft_systems WHERE strip_aircraft_id = ANY($1)', [acIds])
    ]);
    const SHAKADIA_NAMES = ['שקדיה', 'שקדייה', 'שקדה'];
    ids.forEach(stripId => {
      const stripAc = saRows.rows.filter(r => r.strip_id === stripId);
      const stripAcIds = stripAc.map(r => r.id);
      const idToIdx = {};
      stripAc.forEach(r => { idToIdx[r.id] = r.idx; });
      const arms = armRes.rows.filter(r => stripAcIds.includes(r.strip_aircraft_id));
      const syss = sysRes.rows.filter(r => stripAcIds.includes(r.strip_aircraft_id));
      const armMap = {};
      arms.forEach(r => {
        const idx = idToIdx[r.strip_aircraft_id];
        if (!armMap[r.armament_name]) armMap[r.armament_name] = { totalQty: 0, aircraftNums: [] };
        armMap[r.armament_name].totalQty += r.quantity;
        if (!armMap[r.armament_name].aircraftNums.includes(idx)) armMap[r.armament_name].aircraftNums.push(idx);
      });
      const armaments = Object.entries(armMap).map(([name, v]) => ({ name, totalQty: v.totalQty, aircraftNums: v.aircraftNums.sort((a, b) => a - b) }));
      const hasShakadia = syss.some(r =>
        SHAKADIA_NAMES.some(n => r.system_name.trim().toLowerCase() === n.toLowerCase()) && r.status === 'שמיש'
      );
      result[stripId] = { hasShakadia, armaments };
    });
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to get bulk summaries' }); }
});

// ─── Default Armament Names ────────────────────────────────────────────────
app.get('/api/default-armament-names', async (req, res) => {
  try { const { rows } = await pool.query('SELECT * FROM default_armament_names ORDER BY sort_order, name'); res.json(rows); }
  catch (err) { res.status(500).json({ error: 'Failed to fetch default armament names' }); }
});
app.post('/api/default-armament-names', async (req, res) => {
  try { const { name } = req.body; const { rows } = await pool.query('INSERT INTO default_armament_names (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING *', [name || '']); res.json(rows[0] || {}); }
  catch (err) { res.status(500).json({ error: 'Failed to add armament name' }); }
});
app.put('/api/default-armament-names/:id', async (req, res) => {
  try { const { name, sort_order } = req.body; const { rows } = await pool.query('UPDATE default_armament_names SET name=$1, sort_order=$2 WHERE id=$3 RETURNING *', [name || '', sort_order ?? 0, req.params.id]); res.json(rows[0]); }
  catch (err) { res.status(500).json({ error: 'Failed to update armament name' }); }
});
app.delete('/api/default-armament-names/:id', async (req, res) => {
  try { await pool.query('DELETE FROM default_armament_names WHERE id=$1', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: 'Failed to delete armament name' }); }
});

// ─── Default System Names ─────────────────────────────────────────────────
app.get('/api/default-system-names', async (req, res) => {
  try { const { rows } = await pool.query('SELECT * FROM default_system_names ORDER BY sort_order, name'); res.json(rows); }
  catch (err) { res.status(500).json({ error: 'Failed to fetch default system names' }); }
});
app.post('/api/default-system-names', async (req, res) => {
  try { const { name } = req.body; const { rows } = await pool.query('INSERT INTO default_system_names (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING *', [name || '']); res.json(rows[0] || {}); }
  catch (err) { res.status(500).json({ error: 'Failed to add system name' }); }
});
app.put('/api/default-system-names/:id', async (req, res) => {
  try { const { name, sort_order } = req.body; const { rows } = await pool.query('UPDATE default_system_names SET name=$1, sort_order=$2 WHERE id=$3 RETURNING *', [name || '', sort_order ?? 0, req.params.id]); res.json(rows[0]); }
  catch (err) { res.status(500).json({ error: 'Failed to update system name' }); }
});
app.delete('/api/default-system-names/:id', async (req, res) => {
  try { await pool.query('DELETE FROM default_system_names WHERE id=$1', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: 'Failed to delete system name' }); }
});

// ─── Partial Formation API ─────────────────────────────────────────────────

// POST /api/strips/partial-create
// Creates a new partial-formation strip from a subset of aircraft of an existing strip.
// Body: { sourceStripId, aircraftIndices: number[], workstation_preset_id?, sector_id? }
// The source strip's aircraft_indices and number_of_formation are updated to reflect removal.
// Returns: { partialStripId, partialStrip, sourceStrip }
app.post('/api/strips/partial-create', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { sourceStripId, aircraftIndices, workstation_preset_id, sector_id } = req.body;
    if (!sourceStripId || !Array.isArray(aircraftIndices) || aircraftIndices.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'sourceStripId and aircraftIndices[] required' });
    }
    const rawId = parseInt(String(sourceStripId).replace(/^s/, ''));
    const srcRow = await client.query('SELECT * FROM strips WHERE id=$1', [rawId]);
    if (srcRow.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Source strip not found' }); }
    const src = srcRow.rows[0];

    // Determine root parent and original count
    const rootParentId = src.parent_strip_id || src.id;
    const origCount = src.original_formation_count || parseInt(src.number_of_formation || '1') || 1;
    const srcIndices = Array.isArray(src.aircraft_indices)
      ? src.aircraft_indices
      : (src.aircraft_indices ? (() => { try { return JSON.parse(src.aircraft_indices); } catch { return null; } })() : null)
      || Array.from({ length: origCount }, (_, i) => i + 1);

    // Filter requested indices to only valid ones present in source
    const validIndices = aircraftIndices.map(Number).filter(n => srcIndices.includes(n));
    if (validIndices.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'No valid aircraft indices' }); }

    // Remaining indices stay in source
    const remainingIndices = srcIndices.filter(i => !validIndices.includes(i));

    // Build aircraft_positions for partial (only selected indices)
    const srcPositions = Array.isArray(src.aircraft_positions)
      ? src.aircraft_positions
      : (src.aircraft_positions ? (() => { try { return JSON.parse(src.aircraft_positions); } catch { return []; } })() : []);
    const partialPositions = srcPositions.filter(p => validIndices.includes(p.idx));
    const remainingPositions = srcPositions.filter(p => remainingIndices.includes(p.idx));

    // Merge notes helper
    const mergeNotes = (a, b) => [a, b].filter(Boolean).join('\n---\n');

    // If source is on the map, place the new partial strip on the map offset slightly
    const srcOnMap = !!src.on_map;
    const newX = srcOnMap ? (parseFloat(src.x || 0) + 65) : 0;
    const newY = srcOnMap ? (parseFloat(src.y || 0) + 45) : 0;

    // Create the partial strip (clone of source)
    const partialResult = await client.query(
      `INSERT INTO strips (callsign, sq, alt, task, squadron, sector_id, takeoff_time, number_of_formation,
        erka, koteret, mivtza, notes, status, workstation_preset_id, in_table,
        parent_strip_id, aircraft_indices, original_formation_count, aircraft_positions,
        on_map, x, y)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active',$13,true,$14,$15,$16,$17,$18,$19,$20)
       RETURNING id`,
      [
        src.callsign, src.sq, src.alt, src.task, src.squadron,
        sector_id || src.sector_id, src.takeoff_time,
        String(validIndices.length),
        src.erka, src.koteret, src.mivtza, src.notes,
        workstation_preset_id || src.workstation_preset_id,
        rootParentId, JSON.stringify(validIndices), origCount,
        JSON.stringify(partialPositions),
        srcOnMap, newX, newY
      ]
    );
    const partialStripId = partialResult.rows[0].id;

    // Copy strip_aircraft rows for selected indices
    for (const idx of validIndices) {
      const sa = await client.query('SELECT * FROM strip_aircraft WHERE strip_id=$1 AND idx=$2', [rawId, idx]);
      if (sa.rows.length > 0) {
        await client.query(
          'INSERT INTO strip_aircraft (strip_id, idx, datk, kipa) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
          [partialStripId, idx, sa.rows[0].datk, sa.rows[0].kipa]
        );
      }
    }

    // Copy strip_table_assignments from source to new partial strip
    const srcAssignments = await client.query('SELECT preset_id FROM strip_table_assignments WHERE strip_id=$1', [rawId]);
    for (const row of srcAssignments.rows) {
      await client.query(
        'INSERT INTO strip_table_assignments (strip_id, preset_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [partialStripId, row.preset_id]
      );
    }

    // Update source strip: remove transferred aircraft
    if (remainingIndices.length === 0) {
      // All aircraft transferred — delete source strip
      await client.query('DELETE FROM strips WHERE id=$1', [rawId]);
    } else {
      await client.query(
        `UPDATE strips SET number_of_formation=$1, aircraft_indices=$2, aircraft_positions=$3,
          parent_strip_id=$4, original_formation_count=$5 WHERE id=$6`,
        [
          String(remainingIndices.length),
          JSON.stringify(remainingIndices),
          JSON.stringify(remainingPositions),
          rootParentId, origCount, rawId
        ]
      );
    }

    await client.query('COMMIT');
    res.json({ partialStripId: 's' + partialStripId, sourceDeleted: remainingIndices.length === 0 });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating partial strip:', err);
    res.status(500).json({ error: 'Failed to create partial strip' });
  } finally {
    client.release();
  }
});

// POST /api/strips/:id/merge-partial
// Merges another partial strip (sourceStripId) INTO this strip (target = :id).
// Combines aircraft_indices, notes. If combined = original_formation_count → becomes full formation.
// Body: { sourceStripId }
app.post('/api/strips/:id/merge-partial', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const targetId = parseInt(req.params.id.replace(/^s/, ''));
    const rawSourceId = parseInt(String(req.body.sourceStripId || '').replace(/^s/, ''));
    if (isNaN(targetId) || isNaN(rawSourceId)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Invalid IDs' }); }

    const [tRow, sRow] = await Promise.all([
      client.query('SELECT * FROM strips WHERE id=$1', [targetId]),
      client.query('SELECT * FROM strips WHERE id=$1', [rawSourceId])
    ]);
    if (tRow.rows.length === 0 || sRow.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Strip not found' }); }

    const target = tRow.rows[0];
    const source = sRow.rows[0];

    const parseIndices = (r) => {
      if (Array.isArray(r.aircraft_indices)) return r.aircraft_indices;
      if (r.aircraft_indices) { try { return JSON.parse(r.aircraft_indices); } catch { return null; } }
      return null;
    };
    const parsePositions = (r) => {
      if (Array.isArray(r.aircraft_positions)) return r.aircraft_positions;
      if (r.aircraft_positions) { try { return JSON.parse(r.aircraft_positions); } catch { return []; } }
      return [];
    };

    const origCount = target.original_formation_count || source.original_formation_count || null;
    const tIdx = parseIndices(target) || Array.from({ length: parseInt(target.number_of_formation || '1') || 1 }, (_, i) => i + 1);
    const sIdx = parseIndices(source) || Array.from({ length: parseInt(source.number_of_formation || '1') || 1 }, (_, i) => i + 1);
    const combinedIdx = [...new Set([...tIdx, ...sIdx])].sort((a, b) => a - b);

    // Merge aircraft_positions
    const tPos = parsePositions(target);
    const sPos = parsePositions(source);
    const combinedPos = [...tPos, ...sPos.filter(sp => !tPos.find(tp => tp.idx === sp.idx))];

    // Merge notes
    const mergedNotes = [target.notes, source.notes].filter(Boolean).join('\n---\n');

    // Check serial match for datk note
    const tSa = await client.query('SELECT * FROM strip_aircraft WHERE strip_id=$1', [targetId]);
    const sSa = await client.query('SELECT * FROM strip_aircraft WHERE strip_id=$1', [rawSourceId]);
    const allDatk = [...tSa.rows, ...sSa.rows].map(r => r.datk).filter(d => d !== null && d !== undefined);
    const datkmMismatch = allDatk.length > 0 && new Set(allDatk).size > 1;
    const finalNotes = datkmMismatch ? (mergedNotes ? mergedNotes + '\nלא כל המטוסים מעודכנים' : 'לא כל המטוסים מעודכנים') : mergedNotes;

    // Is full formation?
    const isFull = origCount !== null && combinedIdx.length >= origCount;

    await client.query(
      `UPDATE strips SET number_of_formation=$1, aircraft_indices=$2, original_formation_count=$3,
        parent_strip_id=$4, aircraft_positions=$5, notes=$6 WHERE id=$7`,
      [
        String(combinedIdx.length),
        isFull ? null : JSON.stringify(combinedIdx),
        isFull ? null : origCount,
        isFull ? null : (target.parent_strip_id || source.parent_strip_id),
        JSON.stringify(combinedPos),
        finalNotes || null,
        targetId
      ]
    );

    // Copy source strip_aircraft rows to target (skip if already present)
    for (const sa of sSa.rows) {
      await client.query(
        'INSERT INTO strip_aircraft (strip_id, idx, datk, kipa) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [targetId, sa.idx, sa.datk, sa.kipa]
      );
    }

    // Delete source strip
    await client.query('DELETE FROM strips WHERE id=$1', [rawSourceId]);

    await client.query('COMMIT');
    res.json({ success: true, isFull, combinedIndices: combinedIdx });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error merging partial strips:', err);
    res.status(500).json({ error: 'Failed to merge partial strips' });
  } finally {
    client.release();
  }
});

// Personal filters CRUD API
app.get('/api/workstation-personal-filters', async (req, res) => {
  try {
    const { preset_id, crew_member_id } = req.query;
    if (!preset_id || !crew_member_id) return res.json(null);
    const result = await pool.query(
      'SELECT filter_query FROM workstation_personal_filters WHERE preset_id = $1 AND crew_member_id = $2',
      [preset_id, crew_member_id]
    );
    res.json(result.rows[0] ? result.rows[0].filter_query : null);
  } catch (err) {
    console.error('Error fetching personal filter:', err);
    res.status(500).json({ error: 'Failed to fetch personal filter' });
  }
});

app.put('/api/workstation-personal-filters', async (req, res) => {
  try {
    const { preset_id, crew_member_id, filter_query } = req.body;
    if (!preset_id || !crew_member_id) return res.status(400).json({ error: 'preset_id and crew_member_id required' });
    if (filter_query === null || filter_query === undefined) {
      await pool.query(
        'DELETE FROM workstation_personal_filters WHERE preset_id = $1 AND crew_member_id = $2',
        [preset_id, crew_member_id]
      );
    } else {
      await pool.query(
        `INSERT INTO workstation_personal_filters (preset_id, crew_member_id, filter_query)
         VALUES ($1, $2, $3)
         ON CONFLICT (preset_id, crew_member_id) DO UPDATE SET filter_query = $3, updated_at = CURRENT_TIMESTAMP`,
        [preset_id, crew_member_id, JSON.stringify(filter_query)]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving personal filter:', err);
    res.status(500).json({ error: 'Failed to save personal filter' });
  }
});

// Sectors CRUD API
app.post('/api/sectors', async (req, res) => {
  try {
    const { name, label_he, category, notes, conflict_alt_delta } = req.body;
    const result = await pool.query(
      'INSERT INTO sectors (name, label_he, category, notes, conflict_alt_delta) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, label_he, category || null, notes || null, conflict_alt_delta ?? 500]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating sector:', err);
    res.status(500).json({ error: 'Failed to create sector' });
  }
});

app.put('/api/sectors/:id', async (req, res) => {
  try {
    const { name, label_he, category, notes, conflict_alt_delta } = req.body;
    const result = await pool.query(
      'UPDATE sectors SET name = $1, label_he = $2, category = $3, notes = $4, conflict_alt_delta = $5 WHERE id = $6 RETURNING *',
      [name, label_he, category || null, notes || null, conflict_alt_delta ?? 500, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sector not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating sector:', err);
    res.status(500).json({ error: 'Failed to update sector' });
  }
});

app.delete('/api/sectors/:id', async (req, res) => {
  try {
    const sectorId = req.params.id;
    // Clean up related records first
    await pool.query('UPDATE workstations SET sector_id = NULL WHERE sector_id = $1', [sectorId]);
    await pool.query('UPDATE strips SET sector_id = NULL WHERE sector_id = $1', [sectorId]);
    await pool.query('DELETE FROM strip_transfers WHERE from_sector_id = $1 OR to_sector_id = $1', [sectorId]);
    // Now delete the sector (sector_neighbors and sub_sectors have CASCADE)
    await pool.query('DELETE FROM sectors WHERE id = $1', [sectorId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting sector:', err);
    res.status(500).json({ error: 'Failed to delete sector' });
  }
});

// Update sector notes only (for workstation use)
app.put('/api/sectors/:id/notes', async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await pool.query(
      'UPDATE sectors SET notes = $1 WHERE id = $2 RETURNING *',
      [notes || null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sector not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating sector notes:', err);
    res.status(500).json({ error: 'Failed to update sector notes' });
  }
});

// Sector neighbors management
app.post('/api/sectors/:id/neighbors', async (req, res) => {
  try {
    const { neighbor_id } = req.body;
    await pool.query(
      'INSERT INTO sector_neighbors (sector_id, neighbor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, neighbor_id]
    );
    // Add reverse relationship
    await pool.query(
      'INSERT INTO sector_neighbors (sector_id, neighbor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [neighbor_id, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error adding sector neighbor:', err);
    res.status(500).json({ error: 'Failed to add sector neighbor' });
  }
});

app.delete('/api/sectors/:id/neighbors/:neighborId', async (req, res) => {
  try {
    await pool.query('DELETE FROM sector_neighbors WHERE sector_id = $1 AND neighbor_id = $2', [req.params.id, req.params.neighborId]);
    await pool.query('DELETE FROM sector_neighbors WHERE sector_id = $1 AND neighbor_id = $2', [req.params.neighborId, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing sector neighbor:', err);
    res.status(500).json({ error: 'Failed to remove sector neighbor' });
  }
});

// --- Work Groups API ---
app.get('/api/work-groups', async (req, res) => {
  try {
    const { rows: groups } = await pool.query(`SELECT * FROM work_groups ORDER BY name`);
    const { rows: members } = await pool.query(`
      SELECT wgm.work_group_id, wgm.preset_id, wp.name as preset_name
      FROM work_group_members wgm
      JOIN workstation_presets wp ON wp.id = wgm.preset_id
      ORDER BY wp.name
    `);
    const result = groups.map(g => ({
      ...g,
      members: members.filter(m => m.work_group_id === g.id).map(m => ({ preset_id: m.preset_id, preset_name: m.preset_name }))
    }));
    res.json(result);
  } catch (err) {
    console.error('Error fetching work groups:', err);
    res.status(500).json({ error: 'Failed to fetch work groups' });
  }
});

app.get('/api/work-group-notes/for-preset/:presetId', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT wgn.*, wg.name as group_name, wg.admin_preset_id
      FROM work_group_notes wgn
      JOIN work_groups wg ON wg.id = wgn.work_group_id
      JOIN work_group_members wgm ON wgm.work_group_id = wg.id
      WHERE wgm.preset_id = $1
      ORDER BY wg.name, wgn.id
    `, [req.params.presetId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

app.get('/api/work-groups/:id/notes', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM work_group_notes WHERE work_group_id=$1 ORDER BY id`, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

app.post('/api/work-groups/:id/notes', async (req, res) => {
  try {
    const { title, content, updated_by_name } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO work_group_notes (work_group_id, title, content, updated_by_name, updated_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING *`,
      [req.params.id, title || '', content || '', updated_by_name || '']
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create note' });
  }
});

app.put('/api/work-group-notes/:id', async (req, res) => {
  try {
    const { title, content, updated_by_name } = req.body;
    await pool.query(
      `UPDATE work_group_notes SET title=$1, content=$2, updated_by_name=$3, updated_at=NOW() WHERE id=$4`,
      [title || '', content || '', updated_by_name || '', req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update note' });
  }
});

app.delete('/api/work-group-notes/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM work_group_notes WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

app.post('/api/work-groups', async (req, res) => {
  try {
    const { name } = req.body;
    const { rows } = await pool.query(`INSERT INTO work_groups (name) VALUES ($1) RETURNING *`, [name]);
    res.json({ ...rows[0], members: [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create work group' });
  }
});

app.put('/api/work-groups/:id', async (req, res) => {
  try {
    const { name, admin_preset_id } = req.body;
    if (name !== undefined && admin_preset_id !== undefined) {
      await pool.query(`UPDATE work_groups SET name=$1, admin_preset_id=$2 WHERE id=$3`, [name, admin_preset_id || null, req.params.id]);
    } else if (name !== undefined) {
      await pool.query(`UPDATE work_groups SET name=$1 WHERE id=$2`, [name, req.params.id]);
    } else if (admin_preset_id !== undefined) {
      await pool.query(`UPDATE work_groups SET admin_preset_id=$1 WHERE id=$2`, [admin_preset_id || null, req.params.id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update work group' });
  }
});

app.delete('/api/work-groups/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM work_groups WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete work group' });
  }
});

app.post('/api/work-groups/:id/members', async (req, res) => {
  try {
    const { preset_id } = req.body;
    await pool.query(`INSERT INTO work_group_members (work_group_id, preset_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [req.params.id, preset_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add member' });
  }
});

app.delete('/api/work-groups/:id/members/:presetId', async (req, res) => {
  try {
    await pool.query(`DELETE FROM work_group_members WHERE work_group_id=$1 AND preset_id=$2`, [req.params.id, req.params.presetId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// מצב מז"א מרחבי per work group
app.get('/api/work-group-mazaa/:groupId', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT mazaa_regional FROM work_groups WHERE id=$1`, [req.params.groupId]);
    if (!rows.length) return res.status(404).json({ error: 'Group not found' });
    res.json({ mazaa_regional: rows[0].mazaa_regional || '' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get mazaa regional' });
  }
});

app.patch('/api/work-group-mazaa/:groupId', async (req, res) => {
  try {
    const { mazaa_regional } = req.body;
    await pool.query(`UPDATE work_groups SET mazaa_regional=$1 WHERE id=$2`, [mazaa_regional || null, req.params.groupId]);
    res.json({ success: true, mazaa_regional: mazaa_regional || '' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update mazaa regional' });
  }
});

// מד עומס לפי מצב מז"א — per-preset thresholds
app.get('/api/preset-mazaa-thresholds', async (req, res) => {
  try {
    const { preset_id } = req.query;
    if (!preset_id) return res.status(400).json({ error: 'preset_id required' });
    const { rows } = await pool.query(`SELECT * FROM preset_mazaa_thresholds WHERE preset_id=$1 ORDER BY id`, [preset_id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch mazaa thresholds' });
  }
});

app.post('/api/preset-mazaa-thresholds', async (req, res) => {
  try {
    const { preset_id, mazaa_status, partial_load, full_load } = req.body;
    if (!preset_id || !mazaa_status) return res.status(400).json({ error: 'preset_id and mazaa_status required' });
    const { rows } = await pool.query(
      `INSERT INTO preset_mazaa_thresholds (preset_id, mazaa_status, partial_load, full_load)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (preset_id, mazaa_status)
       DO UPDATE SET partial_load=EXCLUDED.partial_load, full_load=EXCLUDED.full_load
       RETURNING *`,
      [preset_id, mazaa_status, partial_load ?? 3, full_load ?? 5]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save mazaa threshold' });
  }
});

app.put('/api/preset-mazaa-thresholds/:id', async (req, res) => {
  try {
    const { partial_load, full_load } = req.body;
    const { rows } = await pool.query(
      `UPDATE preset_mazaa_thresholds SET partial_load=$1, full_load=$2 WHERE id=$3 RETURNING *`,
      [partial_load ?? 3, full_load ?? 5, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update mazaa threshold' });
  }
});

app.delete('/api/preset-mazaa-thresholds/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM preset_mazaa_thresholds WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete mazaa threshold' });
  }
});

// Get all workstation peers (other workstations in same work groups) for a preset
app.get('/api/workstations/:presetId/work-group-peers', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT wp.id, wp.name,
        ARRAY_AGG(DISTINCT wg.name ORDER BY wg.name) as groups
      FROM work_group_members wgm1
      JOIN work_group_members wgm2 ON wgm1.work_group_id = wgm2.work_group_id
      JOIN workstation_presets wp ON wp.id = wgm2.preset_id
      JOIN work_groups wg ON wg.id = wgm1.work_group_id
      WHERE wgm1.preset_id = $1
      GROUP BY wp.id, wp.name
      ORDER BY wp.name
    `, [req.params.presetId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch peers' });
  }
});

// --- Preset Links API ---
app.get('/api/preset-links/:presetId', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM preset_links WHERE preset_id=$1 ORDER BY sort_order, id`, [req.params.presetId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch links' });
  }
});

app.post('/api/preset-links/:presetId', async (req, res) => {
  try {
    const { url, name, category, note, sort_order } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO preset_links (preset_id, url, name, category, note, sort_order) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.presetId, url || '', name || '', category || '', note || '', sort_order || 0]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create link' });
  }
});

app.put('/api/preset-links/:id', async (req, res) => {
  try {
    const { url, name, category, note, sort_order } = req.body;
    await pool.query(
      `UPDATE preset_links SET url=$1, name=$2, category=$3, note=$4, sort_order=$5 WHERE id=$6`,
      [url || '', name || '', category || '', note || '', sort_order || 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update link' });
  }
});

app.delete('/api/preset-links/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM preset_links WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete link' });
  }
});

// --- Sticky Notes API ---
app.get('/api/sticky-notes', async (req, res) => {
  try {
    const { presetId } = req.query;
    if (!presetId) return res.status(400).json({ error: 'presetId required' });
    // Return notes created by this preset OR distributed to this preset
    const { rows } = await pool.query(`
      SELECT sn.*,
        snr.x, snr.y, snr.minimized,
        TRUE as is_recipient
      FROM sticky_notes sn
      JOIN sticky_note_recipients snr ON snr.sticky_note_id = sn.id
      WHERE snr.preset_id = $1
      UNION ALL
      SELECT sn.*,
        COALESCE((SELECT x FROM sticky_note_recipients WHERE sticky_note_id=sn.id AND preset_id=$1), 100) as x,
        COALESCE((SELECT y FROM sticky_note_recipients WHERE sticky_note_id=sn.id AND preset_id=$1), 100) as y,
        COALESCE((SELECT minimized FROM sticky_note_recipients WHERE sticky_note_id=sn.id AND preset_id=$1), FALSE) as minimized,
        FALSE as is_recipient
      FROM sticky_notes sn
      WHERE sn.creator_preset_id = $1
        AND NOT EXISTS (SELECT 1 FROM sticky_note_recipients WHERE sticky_note_id=sn.id AND preset_id=$1)
    `, [presetId]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching sticky notes:', err);
    res.status(500).json({ error: 'Failed to fetch sticky notes' });
  }
});

app.post('/api/sticky-notes', async (req, res) => {
  try {
    const { title, content, background_color, creator_preset_id, creator_preset_name, creator_crew_name, allow_all_edit, x, y } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO sticky_notes (title, content, background_color, creator_preset_id, creator_preset_name, creator_crew_name, allow_all_edit)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [title || '', content || '', background_color || '#fef08a', creator_preset_id, creator_preset_name, creator_crew_name, allow_all_edit || false]);
    const note = rows[0];
    // Add to own recipients list with initial position
    await pool.query(`
      INSERT INTO sticky_note_recipients (sticky_note_id, preset_id, x, y, minimized)
      VALUES ($1, $2, $3, $4, FALSE) ON CONFLICT DO NOTHING
    `, [note.id, creator_preset_id, x || 100, y || 100]);
    res.json({ ...note, x: x || 100, y: y || 100, minimized: false });
  } catch (err) {
    console.error('Error creating sticky note:', err);
    res.status(500).json({ error: 'Failed to create sticky note' });
  }
});

app.put('/api/sticky-notes/:id', async (req, res) => {
  try {
    const { title, content, background_color, allow_all_edit, x, y, minimized, preset_id, crew_name } = req.body;
    const fields = [];
    const vals = [];
    let idx = 1;
    if (title !== undefined) { fields.push(`title=$${idx++}`); vals.push(title); }
    if (content !== undefined) { fields.push(`content=$${idx++}`); vals.push(content); }
    if (background_color !== undefined) { fields.push(`background_color=$${idx++}`); vals.push(background_color); }
    if (allow_all_edit !== undefined) { fields.push(`allow_all_edit=$${idx++}`); vals.push(allow_all_edit); }
    if (fields.length > 0) {
      if (preset_id) {
        fields.push(`last_edited_by_preset_name=$${idx++}`); vals.push(req.body.preset_name || '');
        fields.push(`last_edited_by_crew_name=$${idx++}`); vals.push(crew_name || '');
        fields.push(`last_edited_at=NOW()`);
      }
      vals.push(req.params.id);
      await pool.query(`UPDATE sticky_notes SET ${fields.join(', ')} WHERE id=$${idx}`, vals);
    }
    // Update per-recipient position/minimized
    if (preset_id && (x !== undefined || y !== undefined || minimized !== undefined)) {
      const posFields = [];
      const posVals = [];
      let pi = 1;
      if (x !== undefined) { posFields.push(`x=$${pi++}`); posVals.push(x); }
      if (y !== undefined) { posFields.push(`y=$${pi++}`); posVals.push(y); }
      if (minimized !== undefined) { posFields.push(`minimized=$${pi++}`); posVals.push(minimized); }
      posVals.push(req.params.id, preset_id);
      await pool.query(`UPDATE sticky_note_recipients SET ${posFields.join(', ')} WHERE sticky_note_id=$${pi} AND preset_id=$${pi+1}`, posVals);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating sticky note:', err);
    res.status(500).json({ error: 'Failed to update sticky note' });
  }
});

app.delete('/api/sticky-notes/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM sticky_notes WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete sticky note' });
  }
});

app.post('/api/sticky-notes/:id/distribute', async (req, res) => {
  try {
    const { preset_ids } = req.body; // array of preset IDs to send to
    for (const pid of preset_ids) {
      await pool.query(`
        INSERT INTO sticky_note_recipients (sticky_note_id, preset_id, x, y, minimized)
        VALUES ($1, $2, 120, 120, FALSE) ON CONFLICT DO NOTHING
      `, [req.params.id, pid]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to distribute sticky note' });
  }
});

// --- Activity Log API ---
app.post('/api/activity-log', async (req, res) => {
  try {
    const { event_type, severity, workstation_preset_id, workstation_name, crew_member_id, crew_member_name, strip_id, strip_callsign, details, related_preset_id, related_preset_name } = req.body;
    const result = await pool.query(`
      INSERT INTO activity_log (event_type, severity, workstation_preset_id, workstation_name, crew_member_id, crew_member_name, strip_id, strip_callsign, details, related_preset_id, related_preset_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *
    `, [
      event_type,
      severity || 'normal',
      workstation_preset_id || null,
      workstation_name || null,
      crew_member_id || null,
      crew_member_name || null,
      strip_id || null,
      strip_callsign || null,
      JSON.stringify(details || {}),
      related_preset_id || null,
      related_preset_name || null
    ]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating activity log entry:', err);
    res.status(500).json({ error: 'Failed to create activity log entry' });
  }
});

app.get('/api/activity-log', async (req, res) => {
  try {
    const { event_type, date_from, date_to, workstation_preset_id, crew_member_id, severity } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 500, 1000);
    const offset = parseInt(req.query.offset) || 0;
    const conditions = [];
    const params = [];
    let idx = 1;
    if (event_type) { conditions.push(`event_type = $${idx++}`); params.push(event_type); }
    if (severity) { conditions.push(`severity = $${idx++}`); params.push(severity); }
    if (date_from) { conditions.push(`timestamp >= $${idx++}`); params.push(date_from); }
    if (date_to) { conditions.push(`timestamp <= $${idx++}`); params.push(new Date(date_to + 'T23:59:59')); }
    if (workstation_preset_id) { conditions.push(`workstation_preset_id = $${idx++}`); params.push(parseInt(workstation_preset_id)); }
    if (crew_member_id) { conditions.push(`crew_member_id = $${idx++}`); params.push(parseInt(crew_member_id)); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows, count] = await Promise.all([
      pool.query(`SELECT * FROM activity_log ${where} ORDER BY timestamp DESC LIMIT $${idx++} OFFSET $${idx++}`, [...params, limit, offset]),
      pool.query(`SELECT COUNT(*) FROM activity_log ${where}`, params)
    ]);
    res.json({ rows: rows.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    console.error('Error fetching activity log:', err);
    res.status(500).json({ error: 'Failed to fetch activity log' });
  }
});

app.delete('/api/activity-log', async (req, res) => {
  try {
    await pool.query('DELETE FROM activity_log');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear activity log' });
  }
});

// Serve frontend
if (process.env.NODE_ENV === 'production') {
  // Production: serve built React app
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get(/^(?!\/api).*$/, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
} else {
  // Development: redirect non-API requests to Vite dev server on port 5000
  app.get(/^(?!\/api).*$/, (req, res) => {
    const viteUrl = `${req.protocol}://${req.hostname}:5000${req.originalUrl}`;
    res.redirect(302, viteUrl);
  });
}

// --- Aid Groups API ---

// GET all aid groups (with item count)
app.get('/api/aid-groups', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ag.*, COUNT(ai.id)::int as item_count
      FROM aid_groups ag
      LEFT JOIN aid_items ai ON ai.group_id = ag.id
      GROUP BY ag.id ORDER BY ag.name
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to get aid groups' }); }
});

// GET single aid group with items
app.get('/api/aid-groups/:id', async (req, res) => {
  try {
    const grp = await pool.query('SELECT * FROM aid_groups WHERE id=$1', [req.params.id]);
    if (!grp.rows.length) return res.status(404).json({ error: 'Not found' });
    const items = await pool.query('SELECT * FROM aid_items WHERE group_id=$1 ORDER BY sort_order, id', [req.params.id]);
    res.json({ ...grp.rows[0], items: items.rows });
  } catch (err) { res.status(500).json({ error: 'Failed to get aid group' }); }
});

// POST create aid group
app.post('/api/aid-groups', async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query('INSERT INTO aid_groups (name) VALUES ($1) RETURNING *', [name]);
    res.json({ ...result.rows[0], items: [] });
  } catch (err) { res.status(500).json({ error: 'Failed to create aid group' }); }
});

// PUT update aid group name
app.put('/api/aid-groups/:id', async (req, res) => {
  try {
    const { name } = req.body;
    await pool.query('UPDATE aid_groups SET name=$1 WHERE id=$2', [name, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to update aid group' }); }
});

// DELETE aid group
app.delete('/api/aid-groups/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM aid_groups WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete aid group' }); }
});

// POST add item to group
app.post('/api/aid-groups/:id/items', async (req, res) => {
  try {
    const { name, type, content, sort_order } = req.body;
    const result = await pool.query(
      'INSERT INTO aid_items (group_id, name, type, content, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.id, name, type, content || '', sort_order || 0]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to add aid item' }); }
});

// PUT update aid item
app.put('/api/aid-items/:id', async (req, res) => {
  try {
    const { name, type, content, sort_order } = req.body;
    const fields = []; const vals = []; let i = 1;
    if (name !== undefined) { fields.push(`name=$${i++}`); vals.push(name); }
    if (type !== undefined) { fields.push(`type=$${i++}`); vals.push(type); }
    if (content !== undefined) { fields.push(`content=$${i++}`); vals.push(content); }
    if (sort_order !== undefined) { fields.push(`sort_order=$${i++}`); vals.push(sort_order); }
    if (!fields.length) return res.json({ success: true });
    vals.push(req.params.id);
    await pool.query(`UPDATE aid_items SET ${fields.join(', ')} WHERE id=$${i}`, vals);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to update aid item' }); }
});

// DELETE aid item
app.delete('/api/aid-items/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM aid_items WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete aid item' }); }
});

// GET aid group for a preset (with items)
app.get('/api/presets/:id/aid-group', async (req, res) => {
  try {
    const link = await pool.query('SELECT group_id FROM preset_aid_groups WHERE preset_id=$1', [req.params.id]);
    if (!link.rows.length) return res.json(null);
    const grpId = link.rows[0].group_id;
    const grp = await pool.query('SELECT * FROM aid_groups WHERE id=$1', [grpId]);
    const items = await pool.query('SELECT id,name,type,content,sort_order FROM aid_items WHERE group_id=$1 ORDER BY sort_order, id', [grpId]);
    // count how many presets share this group and get their names
    const shared = await pool.query(
      `SELECT pag.preset_id, wp.name
       FROM preset_aid_groups pag
       JOIN workstation_presets wp ON wp.id = pag.preset_id
       WHERE pag.group_id=$1`,
      [grpId]
    );
    const linked_presets = shared.rows.filter(r => String(r.preset_id) !== String(req.params.id)).map(r => r.name);
    res.json({ ...grp.rows[0], items: items.rows, shared_count: shared.rows.length, linked_presets });
  } catch (err) { res.status(500).json({ error: 'Failed to get preset aid group' }); }
});

// PUT set/change aid group for a preset (group_id=null unlinks)
app.put('/api/presets/:id/aid-group', async (req, res) => {
  try {
    const { group_id } = req.body;
    if (group_id === null || group_id === undefined) {
      await pool.query('DELETE FROM preset_aid_groups WHERE preset_id=$1', [req.params.id]);
    } else {
      await pool.query(
        'INSERT INTO preset_aid_groups (preset_id, group_id) VALUES ($1,$2) ON CONFLICT (preset_id) DO UPDATE SET group_id=$2',
        [req.params.id, group_id]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to set preset aid group' }); }
});

// POST duplicate aid group to target presets (creates independent copy per target)
app.post('/api/aid-groups/:id/duplicate', async (req, res) => {
  try {
    const { preset_ids } = req.body; // array of preset IDs
    const src = await pool.query('SELECT * FROM aid_groups WHERE id=$1', [req.params.id]);
    if (!src.rows.length) return res.status(404).json({ error: 'Source group not found' });
    const srcItems = await pool.query('SELECT * FROM aid_items WHERE group_id=$1 ORDER BY sort_order, id', [req.params.id]);
    for (const pid of preset_ids) {
      const newGrp = await pool.query('INSERT INTO aid_groups (name) VALUES ($1) RETURNING id', [src.rows[0].name]);
      const newId = newGrp.rows[0].id;
      for (const item of srcItems.rows) {
        await pool.query('INSERT INTO aid_items (group_id, name, type, content, sort_order) VALUES ($1,$2,$3,$4,$5)',
          [newId, item.name, item.type, item.content, item.sort_order]);
      }
      await pool.query('INSERT INTO preset_aid_groups (preset_id, group_id) VALUES ($1,$2) ON CONFLICT (preset_id) DO UPDATE SET group_id=$2', [pid, newId]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to duplicate aid group' }); }
});

// POST link aid group to additional presets (shared - same group_id)
app.post('/api/aid-groups/:id/link', async (req, res) => {
  try {
    const { preset_ids } = req.body;
    for (const pid of preset_ids) {
      await pool.query('INSERT INTO preset_aid_groups (preset_id, group_id) VALUES ($1,$2) ON CONFLICT (preset_id) DO UPDATE SET group_id=$2', [pid, req.params.id]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to link aid group' }); }
});

// --- Serials API ---
app.get('/api/serials', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM serials ORDER BY control_station, serial_number DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch serials' }); }
});

app.post('/api/serials/import', async (req, res) => {
  try {
    const { rows } = req.body;
    let inserted = 0, updated = 0, skipped = 0;
    for (const row of rows) {
      const { control_station, serial_number, essence, relevant_to, created_at } = row;
      if (!control_station || serial_number == null || serial_number === '') continue;
      const existing = await pool.query(
        'SELECT id, essence FROM serials WHERE control_station = $1 AND serial_number = $2',
        [control_station, serial_number]
      );
      if (existing.rows.length > 0) {
        const existingEssence = existing.rows[0].essence || '';
        const newEssence = essence || '';
        if (existingEssence === newEssence) {
          skipped++;
        } else {
          await pool.query(
            'UPDATE serials SET essence = $1, relevant_to = $2, created_at = $3 WHERE id = $4',
            [essence || null, relevant_to || null, created_at ? new Date(created_at) : new Date(), existing.rows[0].id]
          );
          updated++;
        }
      } else {
        await pool.query(
          'INSERT INTO serials (control_station, serial_number, essence, relevant_to, created_at) VALUES ($1,$2,$3,$4,$5)',
          [control_station, serial_number, essence || null, relevant_to || null, created_at ? new Date(created_at) : new Date()]
        );
        inserted++;
      }
    }
    res.json({ imported: inserted + updated, inserted, updated, skipped });
  } catch (err) { res.status(500).json({ error: 'Failed to import serials' }); }
});

app.delete('/api/serials/all', async (req, res) => {
  try {
    await pool.query('DELETE FROM serials');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete serials' }); }
});

// --- Strip Serial Selections API ---
app.get('/api/strip-serial-selections', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sss.*, s.serial_number, s.essence, s.control_station as serial_control_station
      FROM strip_serial_selections sss
      LEFT JOIN serials s ON sss.serial_id = s.id
      ORDER BY sss.strip_id, sss.control_station
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch strip serial selections' }); }
});

app.post('/api/strip-serial-selections', async (req, res) => {
  try {
    const { strip_id: rawStripId, control_station, serial_id, dismissed, acted_by, acted_by_workstation } = req.body;
    const strip_id = parseInt(String(rawStripId).replace(/^s/, ''), 10);
    if (isNaN(strip_id)) return res.status(400).json({ error: 'Invalid strip_id' });
    await pool.query(
      `INSERT INTO strip_serial_selections (strip_id, control_station, serial_id, dismissed, assigned_at, acted_at, acted_by, acted_by_workstation)
       VALUES ($1,$2,$3,$4,NOW(),NOW(),$5,$6)
       ON CONFLICT (strip_id, control_station) DO UPDATE SET serial_id=$3, dismissed=$4, assigned_at=NOW(), acted_at=NOW(), acted_by=$5, acted_by_workstation=$6`,
      [strip_id, control_station, serial_id || null, dismissed || false, acted_by || null, acted_by_workstation || null]
    );
    const result = await pool.query('SELECT * FROM strip_serial_selections WHERE strip_id=$1 AND control_station=$2', [strip_id, control_station]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to save strip serial selection' }); }
});

app.delete('/api/strip-serial-selections', async (req, res) => {
  try {
    const { strip_id: rawStripId, control_station } = req.body;
    const strip_id = parseInt(String(rawStripId).replace(/^s/, ''), 10);
    if (isNaN(strip_id)) return res.status(400).json({ error: 'Invalid strip_id' });
    await pool.query('DELETE FROM strip_serial_selections WHERE strip_id=$1 AND control_station=$2', [strip_id, control_station]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete strip serial selection' }); }
});

// --- Strip Serial Dismissals API (per-serial "not relevant" per strip) ---
app.get('/api/strip-serial-dismissals', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ssd.strip_id, ssd.serial_id, ssd.dismissed_at, s.serial_number, s.control_station
      FROM strip_serial_dismissals ssd
      LEFT JOIN serials s ON ssd.serial_id = s.id
      ORDER BY ssd.dismissed_at DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch strip serial dismissals' }); }
});

app.post('/api/strip-serial-dismissals', async (req, res) => {
  try {
    const { strip_id: rawStripId, serial_id } = req.body;
    const strip_id = parseInt(String(rawStripId).replace(/^s/, ''), 10);
    if (isNaN(strip_id) || !serial_id) return res.status(400).json({ error: 'Invalid params' });
    await pool.query(
      'INSERT INTO strip_serial_dismissals (strip_id, serial_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [strip_id, serial_id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to save dismissal' }); }
});

app.delete('/api/strip-serial-dismissals', async (req, res) => {
  try {
    const { strip_id: rawStripId, serial_id } = req.body;
    const strip_id = parseInt(String(rawStripId).replace(/^s/, ''), 10);
    if (isNaN(strip_id) || !serial_id) return res.status(400).json({ error: 'Invalid params' });
    await pool.query('DELETE FROM strip_serial_dismissals WHERE strip_id=$1 AND serial_id=$2', [strip_id, serial_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to remove dismissal' }); }
});

// --- Block Spaces API ---
app.get('/api/block-spaces', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM block_spaces ORDER BY name');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch block spaces' }); }
});

app.post('/api/block-spaces', async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query('INSERT INTO block_spaces (name) VALUES ($1) RETURNING *', [name]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create block space' }); }
});

app.put('/api/block-spaces/:id', async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query('UPDATE block_spaces SET name=$1 WHERE id=$2 RETURNING *', [name, req.params.id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update block space' }); }
});

app.delete('/api/block-spaces/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM block_spaces WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete block space' }); }
});

// --- Block Tables API ---
app.get('/api/block-tables', async (req, res) => {
  try {
    const tables = await pool.query('SELECT bt.*, bs.name as space_name FROM block_tables bt LEFT JOIN block_spaces bs ON bt.block_space_id = bs.id ORDER BY bt.name');
    const blocks = await pool.query('SELECT * FROM blocks ORDER BY alt_from DESC');
    const rows = tables.rows.map(t => ({ ...t, blocks: blocks.rows.filter(b => b.block_table_id === t.id) }));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch block tables' }); }
});

app.post('/api/block-tables', async (req, res) => {
  try {
    const { name, block_space_id, note, category } = req.body;
    const result = await pool.query(
      'INSERT INTO block_tables (name, block_space_id, note, category, updated_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING *',
      [name, block_space_id || null, note || null, category || null]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create block table' }); }
});

app.put('/api/block-tables/:id', async (req, res) => {
  try {
    const { name, block_space_id, note, category } = req.body;
    const result = await pool.query(
      'UPDATE block_tables SET name=$1, block_space_id=$2, note=$3, category=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
      [name, block_space_id || null, note || null, category || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update block table' }); }
});

app.delete('/api/block-tables/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM block_tables WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete block table' }); }
});

app.post('/api/block-tables/:id/duplicate', async (req, res) => {
  try {
    const srcId = req.params.id;
    const src = await pool.query('SELECT * FROM block_tables WHERE id=$1', [srcId]);
    if (src.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const orig = src.rows[0];
    const newTable = await pool.query(
      'INSERT INTO block_tables (name, block_space_id, note, category, updated_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
      [orig.name + ' (עותק)', orig.block_space_id, orig.note, orig.category]
    );
    const newId = newTable.rows[0].id;
    const blocks = await pool.query('SELECT * FROM blocks WHERE block_table_id=$1 ORDER BY sort_order', [srcId]);
    for (const blk of blocks.rows) {
      await pool.query(
        'INSERT INTO blocks (block_table_id, alt_from, alt_to, mission, color, workstations, platforms, sort_order, note, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())',
        [newId, blk.alt_from, blk.alt_to, blk.mission, blk.color, JSON.stringify(blk.workstations || []), JSON.stringify(blk.platforms || []), blk.sort_order, blk.note]
      );
    }
    res.json(newTable.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to duplicate block table' }); }
});

// --- Blocks API ---
app.get('/api/blocks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM blocks ORDER BY block_table_id, sort_order, alt_from');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching blocks:', err);
    res.status(500).json({ error: 'Failed to fetch blocks' });
  }
});

app.post('/api/blocks', async (req, res) => {
  try {
    const { block_table_id, alt_from, alt_to, mission, color, workstations, platforms, sort_order, note } = req.body;
    const result = await pool.query(
      'INSERT INTO blocks (block_table_id, alt_from, alt_to, mission, color, workstations, platforms, sort_order, note, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING *',
      [block_table_id, alt_from, alt_to, mission || null, color || '#3b82f6', JSON.stringify(workstations || []), JSON.stringify(platforms || []), sort_order || 0, note || null]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create block' }); }
});

app.put('/api/blocks/:id', async (req, res) => {
  try {
    const { alt_from, alt_to, mission, color, workstations, platforms, sort_order, note } = req.body;
    const result = await pool.query(
      'UPDATE blocks SET alt_from=$1, alt_to=$2, mission=$3, color=$4, workstations=$5, platforms=$6, sort_order=$7, note=$8, updated_at=NOW() WHERE id=$9 RETURNING *',
      [alt_from, alt_to, mission || null, color || '#3b82f6', JSON.stringify(workstations || []), JSON.stringify(platforms || []), sort_order || 0, note || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update block' }); }
});

app.delete('/api/blocks/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM blocks WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete block' }); }
});

// --- Strip block_space / block_deviation ---
app.patch('/api/strips/:id/block-space', async (req, res) => {
  try {
    const { block_space_id } = req.body;
    const result = await pool.query('UPDATE strips SET block_space_id=$1 WHERE id=$2 RETURNING *', [block_space_id || null, req.params.id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update strip block space' }); }
});

app.patch('/api/strips/:id/block-deviation', async (req, res) => {
  try {
    const { block_deviation } = req.body;
    const result = await pool.query('UPDATE strips SET block_deviation=$1 WHERE id=$2 RETURNING *', [!!block_deviation, req.params.id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update block deviation' }); }
});

// --- BDH API ---
app.get('/api/bdh', async (req, res) => {
  try {
    const docs = await pool.query(`
      SELECT bd.*, 
        cc.name as creator_name, cu.name as updater_name
      FROM bdh_documents bd
      LEFT JOIN crew_members cc ON bd.created_by = cc.id
      LEFT JOIN crew_members cu ON bd.updated_by = cu.id
      ORDER BY bd.category, bd.name
    `);
    const items = await pool.query('SELECT * FROM bdh_items ORDER BY bdh_id, order_index, id');
    const result = docs.rows.map(doc => ({
      ...doc,
      items: items.rows.filter(i => i.bdh_id === doc.id)
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch BDH' }); }
});

app.post('/api/bdh', async (req, res) => {
  try {
    const { name, category, title, created_by, items } = req.body;
    const doc = await pool.query(
      'INSERT INTO bdh_documents (name, category, title, created_by, updated_by, updated_at) VALUES ($1,$2,$3,$4,$4,NOW()) RETURNING *',
      [name, category || '', title || '', created_by || null]
    );
    const docId = doc.rows[0].id;
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        await pool.query('INSERT INTO bdh_items (bdh_id, order_index, content, is_header) VALUES ($1,$2,$3,$4)', [docId, i, items[i].content || '', !!items[i].is_header]);
      }
    }
    const fullItems = await pool.query('SELECT * FROM bdh_items WHERE bdh_id=$1 ORDER BY order_index, id', [docId]);
    res.json({ ...doc.rows[0], items: fullItems.rows });
  } catch (err) { res.status(500).json({ error: 'Failed to create BDH' }); }
});

app.put('/api/bdh/:id', async (req, res) => {
  try {
    const { name, category, title, updated_by } = req.body;
    const doc = await pool.query(
      'UPDATE bdh_documents SET name=$1, category=$2, title=$3, updated_by=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
      [name, category || '', title || '', updated_by || null, req.params.id]
    );
    res.json(doc.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update BDH' }); }
});

app.delete('/api/bdh/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM bdh_documents WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete BDH' }); }
});

app.post('/api/bdh/:id/items', async (req, res) => {
  try {
    const { content, order_index, is_header } = req.body;
    const maxOrder = await pool.query('SELECT COALESCE(MAX(order_index),0) as m FROM bdh_items WHERE bdh_id=$1', [req.params.id]);
    const idx = order_index ?? (maxOrder.rows[0].m + 1);
    const item = await pool.query('INSERT INTO bdh_items (bdh_id, order_index, content, is_header) VALUES ($1,$2,$3,$4) RETURNING *', [req.params.id, idx, content || '', !!is_header]);
    res.json(item.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to add BDH item' }); }
});

app.put('/api/bdh-items/:id', async (req, res) => {
  try {
    const { content, order_index, is_header } = req.body;
    const fields = [], vals = [];
    let i = 1;
    if (content !== undefined) { fields.push(`content=$${i++}`); vals.push(content); }
    if (order_index !== undefined) { fields.push(`order_index=$${i++}`); vals.push(order_index); }
    if (is_header !== undefined) { fields.push(`is_header=$${i++}`); vals.push(!!is_header); }
    if (!fields.length) return res.json({});
    vals.push(req.params.id);
    const result = await pool.query(`UPDATE bdh_items SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, vals);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update BDH item' }); }
});

app.delete('/api/bdh-items/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM bdh_items WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete BDH item' }); }
});

app.put('/api/bdh/:id/items/reorder', async (req, res) => {
  try {
    const { orderedIds } = req.body;
    for (let i = 0; i < orderedIds.length; i++) {
      await pool.query('UPDATE bdh_items SET order_index=$1 WHERE id=$2 AND bdh_id=$3', [i, orderedIds[i], req.params.id]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to reorder BDH items' }); }
});

app.get('/api/presets/:id/bdh', async (req, res) => {
  try {
    const links = await pool.query('SELECT bdh_id FROM workstation_bdh WHERE preset_id=$1', [req.params.id]);
    const bdhIds = links.rows.map(r => r.bdh_id);
    res.json(bdhIds);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch preset BDH' }); }
});

app.put('/api/presets/:id/bdh', async (req, res) => {
  try {
    const { bdh_ids } = req.body;
    await pool.query('DELETE FROM workstation_bdh WHERE preset_id=$1', [req.params.id]);
    for (const bdhId of (bdh_ids || [])) {
      await pool.query('INSERT INTO workstation_bdh (preset_id, bdh_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, bdhId]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to update preset BDH' }); }
});

app.get('/api/bdh-preset-assignments', async (req, res) => {
  try {
    const result = await pool.query('SELECT preset_id, bdh_id FROM workstation_bdh');
    const map = {};
    for (const row of result.rows) {
      if (!map[row.preset_id]) map[row.preset_id] = [];
      map[row.preset_id].push(row.bdh_id);
    }
    res.json(map);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch BDH assignments' }); }
});

// --- BDH Alerts ---
app.get('/api/bdh-alerts', async (req, res) => {
  try {
    const { preset_id } = req.query;
    if (!preset_id) return res.json([]);
    const result = await pool.query(
      'SELECT * FROM bdh_alerts WHERE target_preset_id=$1 AND dismissed=false ORDER BY created_at DESC',
      [preset_id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch BDH alerts' }); }
});

app.post('/api/bdh-alerts', async (req, res) => {
  try {
    const { target_preset_ids, message, bdh_name, sender_preset_name, strip_ref } = req.body;
    const ids = [];
    for (const pid of (target_preset_ids || [])) {
      const r = await pool.query(
        'INSERT INTO bdh_alerts (target_preset_id, message, bdh_name, sender_preset_name, strip_ref) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [pid, message, bdh_name || '', sender_preset_name || '', strip_ref || null]
      );
      ids.push(r.rows[0].id);
    }
    res.json({ success: true, ids });
  } catch (err) { res.status(500).json({ error: 'Failed to create BDH alerts' }); }
});

app.patch('/api/bdh-alerts/:id/dismiss', async (req, res) => {
  try {
    await pool.query('UPDATE bdh_alerts SET dismissed=true WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to dismiss BDH alert' }); }
});

// --- Base Pressure API (shared atmospheric pressure per base) ---

app.get('/api/base-pressure/:baseId', async (req, res) => {
  try {
    const id = parseInt(req.params.baseId);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid baseId' });
    const r = await pool.query('SELECT pressure_inhg FROM aviation_bases WHERE id=$1', [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Base not found' });
    res.json({ pressure_inhg: r.rows[0].pressure_inhg ?? null });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch base pressure' }); }
});

app.put('/api/base-pressure/:baseId', async (req, res) => {
  try {
    const id = parseInt(req.params.baseId);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid baseId' });
    const raw = req.body.pressure_inhg;
    const val = (raw !== null && raw !== '' && !isNaN(parseFloat(raw))) ? parseFloat(raw) : null;
    await pool.query('UPDATE aviation_bases SET pressure_inhg=$1 WHERE id=$2', [val, id]);
    res.json({ pressure_inhg: val });
  } catch (err) { res.status(500).json({ error: 'Failed to update base pressure' }); }
});

// --- Base Statuses API ---
app.get('/api/base-statuses', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM base_statuses ORDER BY name');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch base statuses' }); }
});

app.post('/api/base-statuses', async (req, res) => {
  try {
    const { name, code, relevant_to, air_defense_status, absorption_status, bird_status } = req.body;
    const result = await pool.query(
      `INSERT INTO base_statuses (name, code, relevant_to, air_defense_status, absorption_status, bird_status, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING *`,
      [name, code || null, relevant_to || 'כולם', air_defense_status || null, absorption_status || null, bird_status || null]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create base status' }); }
});

app.put('/api/base-statuses/:id', async (req, res) => {
  try {
    const { name, code, relevant_to, air_defense_status, absorption_status, bird_status } = req.body;
    const result = await pool.query(
      `UPDATE base_statuses SET name=$1, code=$2, relevant_to=$3, air_defense_status=$4, absorption_status=$5, bird_status=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [name, code || null, relevant_to || 'כולם', air_defense_status || null, absorption_status || null, bird_status || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update base status' }); }
});

app.patch('/api/base-statuses/:id/air-defense', async (req, res) => {
  try {
    const { air_defense_status } = req.body;
    const result = await pool.query(
      `UPDATE base_statuses SET air_defense_status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [air_defense_status || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update air defense status' }); }
});

app.delete('/api/base-statuses/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM base_statuses WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete base status' }); }
});

// --- Aviation Bases API ---
app.get('/api/aviation-bases', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM aviation_bases ORDER BY name');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch aviation bases' }); }
});

app.post('/api/aviation-bases', async (req, res) => {
  try {
    const { name, code, coord_n, coord_e, sids, stars } = req.body;
    const result = await pool.query(
      `INSERT INTO aviation_bases (name, code, coord_n, coord_e, sids, stars) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, code || null, coord_n || null, coord_e || null, JSON.stringify(sids || []), JSON.stringify(stars || [])]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create aviation base' }); }
});

app.put('/api/aviation-bases/:id', async (req, res) => {
  try {
    const { name, code, coord_n, coord_e, sids, stars } = req.body;
    const result = await pool.query(
      `UPDATE aviation_bases SET name=$1, code=$2, coord_n=$3, coord_e=$4, sids=$5, stars=$6 WHERE id=$7 RETURNING *`,
      [name, code || null, coord_n || null, coord_e || null, JSON.stringify(sids || []), JSON.stringify(stars || []), req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update aviation base' }); }
});

app.delete('/api/aviation-bases/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM aviation_bases WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete aviation base' }); }
});

// --- Airfield Routes API ---
app.get('/api/airfield-routes', async (req, res) => {
  try {
    const { airfield_id } = req.query;
    let query = 'SELECT * FROM airfield_routes';
    const params = [];
    if (airfield_id) { query += ' WHERE airfield_id=$1'; params.push(airfield_id); }
    query += ' ORDER BY name';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch airfield routes' }); }
});

app.post('/api/airfield-routes', async (req, res) => {
  try {
    const { airfield_id, name, color, route_path, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO airfield_routes (airfield_id, name, color, route_path, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [airfield_id, name, color || '#3b82f6', JSON.stringify(route_path || []), notes || null]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create airfield route' }); }
});

app.put('/api/airfield-routes/:id', async (req, res) => {
  try {
    const { name, color, route_path, notes } = req.body;
    const result = await pool.query(
      `UPDATE airfield_routes SET name=$1, color=$2, route_path=$3, notes=$4 WHERE id=$5 RETURNING *`,
      [name, color || '#3b82f6', JSON.stringify(route_path || []), notes || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update airfield route' }); }
});

app.delete('/api/airfield-routes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM airfield_routes WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete airfield route' }); }
});

// ── Workstation Contacts ─────────────────────────────────────────────────────
app.get('/api/workstation-contacts', async (req, res) => {
  try {
    const { preset_id } = req.query;
    if (!preset_id) return res.json([]);
    const result = await pool.query(
      'SELECT * FROM workstation_contacts WHERE preset_id=$1 ORDER BY sort_order, id',
      [preset_id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch contacts' }); }
});

app.get('/api/workstation-session-roles', async (req, res) => {
  try {
    const { preset_id } = req.query;
    if (preset_id) {
      const result = await pool.query(
        `SELECT * FROM workstation_session_roles WHERE preset_id = $1`, [preset_id]
      );
      res.json(result.rows[0] || { preset_id: Number(preset_id), kshp: '', mefale: '', achori: '' });
    } else {
      const result = await pool.query(
        `SELECT wsr.*, wp.name AS preset_name FROM workstation_session_roles wsr
         JOIN workstation_presets wp ON wp.id = wsr.preset_id
         ORDER BY wp.name`
      );
      res.json(result.rows);
    }
  } catch (err) { res.status(500).json({ error: 'Failed to fetch session roles' }); }
});

app.put('/api/workstation-session-roles/:preset_id', async (req, res) => {
  try {
    const { preset_id } = req.params;
    const { kshp, mefale, achori } = req.body;
    const result = await pool.query(
      `INSERT INTO workstation_session_roles (preset_id, kshp, mefale, achori, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (preset_id) DO UPDATE SET kshp=$2, mefale=$3, achori=$4, updated_at=NOW()
       RETURNING *`,
      [preset_id, kshp || '', mefale || '', achori || '']
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to save session roles' }); }
});

app.get('/api/workstation-contacts/all', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT wc.*, wp.name AS preset_name, wp.relevant_sectors, wp.classic_transfer_points
       FROM workstation_contacts wc
       JOIN workstation_presets wp ON wp.id = wc.preset_id
       ORDER BY wp.name, wc.sort_order, wc.id`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch all contacts' }); }
});

app.post('/api/workstation-contacts', async (req, res) => {
  try {
    const { preset_id, mahut, oketz, frequency, note, sort_order, device_type, priority } = req.body;
    const result = await pool.query(
      `INSERT INTO workstation_contacts (preset_id, mahut, oketz, frequency, note, sort_order, device_type, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [preset_id, mahut || '', oketz || '', frequency || '', note || '', sort_order || 0, device_type || '', priority || 'ראשי']
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create contact' }); }
});

app.put('/api/workstation-contacts/:id', async (req, res) => {
  try {
    const { mahut, oketz, frequency, note, sort_order, device_type, priority } = req.body;
    const result = await pool.query(
      `UPDATE workstation_contacts SET mahut=$1, oketz=$2, frequency=$3, note=$4, sort_order=$5, device_type=$6, priority=$7
       WHERE id=$8 RETURNING *`,
      [mahut || '', oketz || '', frequency || '', note || '', sort_order || 0, device_type || '', priority || 'ראשי', req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update contact' }); }
});

app.delete('/api/workstation-contacts/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM workstation_contacts WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete contact' }); }
});

// --- Preset Active Crew ---
app.get('/api/preset-active-crew', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM preset_active_crew ORDER BY preset_id');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch active crew' }); }
});

app.put('/api/preset-active-crew/:presetId', async (req, res) => {
  try {
    const { presetId } = req.params;
    const { crew_name, crew_id } = req.body;
    await pool.query(
      `INSERT INTO preset_active_crew (preset_id, crew_name, crew_id, updated_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (preset_id) DO UPDATE SET crew_name=$2, crew_id=$3, updated_at=NOW()`,
      [presetId, crew_name || '', crew_id || null]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to update active crew' }); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server running on port ${PORT}`);
});
