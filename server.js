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
  await pool.query(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS target_x REAL DEFAULT 0`);
  await pool.query(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS target_y REAL DEFAULT 0`);
  await pool.query(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS sub_sector_label VARCHAR(50)`);
  await pool.query(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS from_workstation_id INTEGER`);
  await pool.query(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS to_workstation_id INTEGER`);
  
  // Sectors new columns
  await pool.query(`ALTER TABLE sectors ADD COLUMN IF NOT EXISTS category VARCHAR(100)`);
  await pool.query(`ALTER TABLE sectors ADD COLUMN IF NOT EXISTS notes TEXT`);
  
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

  console.log('Database initialized');
}

initDb().catch(console.error);

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
    const { first_name, last_name, personal_id, is_admin, approved_workstations } = req.body;
    const name = `${first_name} ${last_name}`.trim();
    const result = await pool.query(
      'INSERT INTO crew_members (name, first_name, last_name, personal_id, is_admin) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, first_name, last_name, personal_id, is_admin || false]
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
    const { first_name, last_name, personal_id, is_admin, approved_workstations } = req.body;
    const name = `${first_name} ${last_name}`.trim();
    await pool.query(
      'UPDATE crew_members SET name = $1, first_name = $2, last_name = $3, personal_id = $4, is_admin = $5 WHERE id = $6',
      [name, first_name, last_name, personal_id, is_admin, req.params.id]
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
      sq: r.sq,
      alt: r.alt,
      task: r.task,
      squadron: r.squadron,
      x: r.x,
      y: r.y,
      onMap: r.on_map,
      airborne: r.airborne,
      notes: r.notes
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
      takeoff_time: r.takeoff_time || null
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

app.post('/api/strips/:id/assign-workstation', async (req, res) => {
  try {
    const id = parseInt(req.params.id.replace('s', ''));
    const { workstationPresetId } = req.body;
    if (workstationPresetId !== null) {
      await pool.query(
        'UPDATE strips SET workstation_preset_id = $1, status = $2, on_map = $3, held_by_workstation = $4 WHERE id = $5',
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
    const { callSign, sq, alt, task, squadron, sectorId, takeoff_time } = req.body;
    const result = await pool.query(
      'INSERT INTO strips (callsign, sq, alt, task, squadron, sector_id, takeoff_time) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [callSign, sq, alt, task, squadron, sectorId || null, takeoff_time || null]
    );
    res.json({ success: true, id: 's' + result.rows[0].id });
  } catch (err) {
    console.error('Error creating strip:', err);
    res.status(500).json({ error: 'Failed to create strip' });
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
    const { strips } = req.body;
    if (!Array.isArray(strips)) {
      return res.status(400).json({ error: 'Invalid strips data' });
    }
    
    const existingResult = await pool.query('SELECT callsign FROM strips');
    const existingCallSigns = new Set(existingResult.rows.map(r => r.callsign?.toLowerCase()));
    
    let imported = 0;
    let skipped = 0;
    const errors = [];
    
    for (const strip of strips) {
      if (!strip.callSign) {
        errors.push('Missing callSign');
        continue;
      }
      
      if (existingCallSigns.has(strip.callSign.toLowerCase())) {
        skipped++;
        continue;
      }
      
      try {
        await pool.query(
          'INSERT INTO strips (callsign, squadron, alt, task, weapons, targets, systems, shkadia) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [
            strip.callSign,
            strip.squadron || '',
            strip.alt || '',
            strip.task || '',
            JSON.stringify(strip.weapons || []),
            JSON.stringify(strip.targets || []),
            JSON.stringify(strip.systems || []),
            strip.shkadia || null
          ]
        );
        existingCallSigns.add(strip.callSign.toLowerCase());
        imported++;
      } catch (err) {
        errors.push(`Failed to import ${strip.callSign}: ${err.message}`);
      }
    }
    
    res.json({ imported, skipped, errors });
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
      shkadia: r.shkadia
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
    const stripId = parseInt(req.params.id.replace('s', ''));
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
      // Find workstations that have the target sector in their relevant_sectors
      const presetsResult = await pool.query('SELECT * FROM workstation_presets ORDER BY name');
      const presetsWithSector = presetsResult.rows
        .map(row => ({
          ...row,
          relevant_sectors: Array.isArray(row.relevant_sectors) ? row.relevant_sectors : 
            (typeof row.relevant_sectors === 'string' ? JSON.parse(row.relevant_sectors) : [])
        }))
        .filter(preset => 
          preset.relevant_sectors.includes(toSectorId) && 
          preset.id !== fromWorkstationId
        );
      
      if (presetsWithSector.length > 0) {
        resolvedToWorkstationId = presetsWithSector[0].id;
      }
    }
    
    await pool.query(
      'UPDATE strips SET status = $1 WHERE id = $2',
      ['pending_transfer', stripId]
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
      SELECT t.*, s.callsign, s.sq, s.alt, s.task, s.squadron, sec.name as from_sector_name, sec.label_he as from_sector_label,
             t.target_x, t.target_y, t.sub_sector_label
      FROM strip_transfers t
      JOIN strips s ON t.strip_id = s.id
      JOIN sectors sec ON t.from_sector_id = sec.id
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
      SELECT t.*, s.callsign, s.sq, s.alt, s.task, s.squadron, sec.name as to_sector_name, sec.label_he as to_sector_label
      FROM strip_transfers t
      JOIN strips s ON t.strip_id = s.id
      JOIN sectors sec ON t.to_sector_id = sec.id
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
    const result = await pool.query(`
      SELECT t.*, s.callsign, s.sq, s.alt, s.task, s.squadron, 
             sec_from.name as from_sector_name, sec_from.label_he as from_sector_label,
             sec_to.name as to_sector_name, sec_to.label_he as to_sector_label,
             t.target_x, t.target_y, t.sub_sector_label
      FROM strip_transfers t
      JOIN strips s ON t.strip_id = s.id
      JOIN sectors sec_from ON t.from_sector_id = sec_from.id
      JOIN sectors sec_to ON t.to_sector_id = sec_to.id
      WHERE t.to_workstation_id = $1 AND t.status = 'pending'
      ORDER BY t.created_at
    `, [presetId]);
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
      SELECT t.*, s.callsign, s.sq, s.alt, s.task, s.squadron, 
             sec_from.name as from_sector_name, sec_from.label_he as from_sector_label,
             sec_to.name as to_sector_name, sec_to.label_he as to_sector_label
      FROM strip_transfers t
      JOIN strips s ON t.strip_id = s.id
      JOIN sectors sec_from ON t.from_sector_id = sec_from.id
      JOIN sectors sec_to ON t.to_sector_id = sec_to.id
      WHERE t.from_workstation_id = $1 AND t.status = 'pending'
      ORDER BY t.created_at
    `, [presetId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching workstation outgoing transfers:', err);
    res.status(500).json({ error: 'Failed to fetch outgoing transfers' });
  }
});

app.post('/api/transfers/:id/accept', async (req, res) => {
  try {
    const transferId = req.params.id;
    
    const transfer = await pool.query('SELECT * FROM strip_transfers WHERE id = $1', [transferId]);
    if (transfer.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }
    
    const { strip_id, to_sector_id, to_workstation_id, target_x, target_y } = transfer.rows[0];
    
    // Update strip: move to target sector AND assign to receiving workstation
    // This ensures the strip disappears from the sending workstation
    await pool.query(
      'UPDATE strips SET sector_id = $1, status = $2, on_map = $3, x = $4, y = $5, held_by_workstation = $6, workstation_preset_id = $7 WHERE id = $8',
      [to_sector_id, 'queued', false, target_x || 0, target_y || 0, to_workstation_id, to_workstation_id, strip_id]
    );
    
    await pool.query(
      'UPDATE strip_transfers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['accepted', transferId]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error accepting transfer:', err);
    res.status(500).json({ error: 'Failed to accept transfer' });
  }
});

app.post('/api/transfers/:id/accept-to-map', async (req, res) => {
  try {
    const transferId = req.params.id;
    const { x, y } = req.body;
    
    const transfer = await pool.query('SELECT * FROM strip_transfers WHERE id = $1', [transferId]);
    if (transfer.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }
    
    const { strip_id, to_sector_id, to_workstation_id } = transfer.rows[0];
    
    // Update strip: move to target sector AND assign to receiving workstation
    await pool.query(
      'UPDATE strips SET sector_id = $1, status = $2, on_map = $3, x = $4, y = $5, held_by_workstation = $6, workstation_preset_id = $7 WHERE id = $8',
      [to_sector_id, 'queued', true, x, y, to_workstation_id, to_workstation_id, strip_id]
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
    
    await pool.query(
      'UPDATE strips SET status = $1 WHERE id = $2',
      ['queued', transfer.rows[0].strip_id]
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

app.post('/api/transfers/:id/cancel', async (req, res) => {
  try {
    const transferId = req.params.id;
    
    const transfer = await pool.query('SELECT * FROM strip_transfers WHERE id = $1', [transferId]);
    if (transfer.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }
    
    await pool.query(
      'UPDATE strips SET status = $1 WHERE id = $2',
      ['queued', transfer.rows[0].strip_id]
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
    const result = await pool.query('SELECT id, name, created_at FROM maps ORDER BY name');
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
      takeoff_time: r.takeoff_time || null
    })));
  } catch (err) {
    console.error('Error fetching workstation strips:', err);
    res.status(500).json({ error: 'Failed to fetch workstation strips' });
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
      notes: r.notes
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

app.post('/api/workstation-presets', async (req, res) => {
  try {
    const { name, map_id, relevant_sectors, table_mode_id, partial_load, full_load } = req.body;
    const result = await pool.query(
      `INSERT INTO workstation_presets (name, map_id, relevant_sectors, table_mode_id, partial_load, full_load) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, map_id, JSON.stringify(relevant_sectors || []), table_mode_id || null, partial_load ?? 3, full_load ?? 5]
    );
    const row = result.rows[0];
    res.json({ ...row, relevant_sectors: Array.isArray(row.relevant_sectors) ? row.relevant_sectors : JSON.parse(row.relevant_sectors || '[]') });
  } catch (err) {
    console.error('Error creating workstation preset:', err);
    res.status(500).json({ error: 'Failed to create workstation preset' });
  }
});

app.put('/api/workstation-presets/:id', async (req, res) => {
  try {
    const { name, map_id, relevant_sectors, table_mode_id, partial_load, full_load } = req.body;
    const result = await pool.query(
      `UPDATE workstation_presets SET name = $1, map_id = $2, relevant_sectors = $3, table_mode_id = $4, partial_load = $5, full_load = $6 WHERE id = $7 RETURNING *`,
      [name, map_id, JSON.stringify(relevant_sectors || []), table_mode_id || null, partial_load ?? 3, full_load ?? 5, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Preset not found' });
    }
    const row = result.rows[0];
    res.json({ ...row, relevant_sectors: Array.isArray(row.relevant_sectors) ? row.relevant_sectors : JSON.parse(row.relevant_sectors || '[]') });
  } catch (err) {
    console.error('Error updating workstation preset:', err);
    res.status(500).json({ error: 'Failed to update workstation preset' });
  }
});

app.delete('/api/workstation-presets/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM workstation_presets WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting workstation preset:', err);
    res.status(500).json({ error: 'Failed to delete workstation preset' });
  }
});

// Sectors CRUD API
app.post('/api/sectors', async (req, res) => {
  try {
    const { name, label_he, category, notes } = req.body;
    const result = await pool.query(
      'INSERT INTO sectors (name, label_he, category, notes) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, label_he, category || null, notes || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating sector:', err);
    res.status(500).json({ error: 'Failed to create sector' });
  }
});

app.put('/api/sectors/:id', async (req, res) => {
  try {
    const { name, label_he, category, notes } = req.body;
    const result = await pool.query(
      'UPDATE sectors SET name = $1, label_he = $2, category = $3, notes = $4 WHERE id = $5 RETURNING *',
      [name, label_he, category || null, notes || null, req.params.id]
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

// In production, serve the built React app as static files
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get(/^(?!\/api).*$/, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server running on port ${PORT}`);
});
