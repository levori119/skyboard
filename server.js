import express from 'express';
import cors from 'cors';
import pg from 'pg';

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
  await pool.query(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS target_x REAL DEFAULT 0`);
  await pool.query(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS target_y REAL DEFAULT 0`);
  await pool.query(`ALTER TABLE strip_transfers ADD COLUMN IF NOT EXISTS sub_sector_label VARCHAR(50)`);
  
  console.log('Database initialized');
}

initDb().catch(console.error);

app.get('/api/digits', async (req, res) => {
  try {
    const result = await pool.query('SELECT digit, image_data FROM learned_digits ORDER BY id DESC LIMIT 200');
    res.json(result.rows.map(r => ({ digit: r.digit, imageData: r.image_data })));
  } catch (err) {
    console.error('Error fetching digits:', err);
    res.status(500).json({ error: 'Failed to fetch digits' });
  }
});

app.post('/api/digits', async (req, res) => {
  try {
    const { digit, imageData } = req.body;
    if (!digit || !imageData) {
      return res.status(400).json({ error: 'Missing digit or imageData' });
    }
    await pool.query('INSERT INTO learned_digits (digit, image_data) VALUES ($1, $2)', [digit, imageData]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving digit:', err);
    res.status(500).json({ error: 'Failed to save digit' });
  }
});

app.delete('/api/digits', async (req, res) => {
  try {
    await pool.query('DELETE FROM learned_digits');
    res.json({ success: true });
  } catch (err) {
    console.error('Error clearing digits:', err);
    res.status(500).json({ error: 'Failed to clear digits' });
  }
});

app.get('/api/digits/count', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) as count FROM learned_digits');
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
      airborne: r.airborne
    })));
  } catch (err) {
    console.error('Error fetching strips:', err);
    res.status(500).json({ error: 'Failed to fetch strips' });
  }
});

app.post('/api/strips', async (req, res) => {
  try {
    const { callSign, sq, alt, task, squadron } = req.body;
    const result = await pool.query(
      'INSERT INTO strips (callsign, sq, alt, task, squadron) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [callSign, sq, alt, task, squadron]
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
    const { x, y, onMap, alt } = req.body;
    
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (x !== undefined) { updates.push(`x = $${paramIndex++}`); values.push(x); }
    if (y !== undefined) { updates.push(`y = $${paramIndex++}`); values.push(y); }
    if (onMap !== undefined) { updates.push(`on_map = $${paramIndex++}`); values.push(onMap); }
    if (alt !== undefined) { updates.push(`alt = $${paramIndex++}`); values.push(alt); }
    if (req.body.airborne !== undefined) { updates.push(`airborne = $${paramIndex++}`); values.push(req.body.airborne); }
    
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

app.post('/api/sectors', async (req, res) => {
  try {
    const { name, labelHe, mapAsset } = req.body;
    const result = await pool.query(
      'INSERT INTO sectors (name, label_he, map_asset) VALUES ($1, $2, $3) RETURNING *',
      [name, labelHe, mapAsset]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating sector:', err);
    res.status(500).json({ error: 'Failed to create sector' });
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
      airborne: r.airborne
    })));
  } catch (err) {
    console.error('Error fetching sector strips:', err);
    res.status(500).json({ error: 'Failed to fetch sector strips' });
  }
});

// --- Workstations API ---
app.post('/api/workstations/login', async (req, res) => {
  try {
    const { name, sectorId } = req.body;
    const authToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    
    const result = await pool.query(
      `INSERT INTO workstations (name, sector_id, auth_token, is_active, last_seen) 
       VALUES ($1, $2, $3, TRUE, CURRENT_TIMESTAMP) RETURNING *`,
      [name, sectorId, authToken]
    );
    
    const sector = await pool.query('SELECT * FROM sectors WHERE id = $1', [sectorId]);
    
    res.json({
      workstation: result.rows[0],
      sector: sector.rows[0],
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
    const { toSectorId, workstationId, targetX, targetY, subSectorLabel } = req.body;
    
    const strip = await pool.query('SELECT * FROM strips WHERE id = $1', [stripId]);
    if (strip.rows.length === 0) {
      return res.status(404).json({ error: 'Strip not found' });
    }
    
    const fromSectorId = strip.rows[0].sector_id;
    
    await pool.query(
      'UPDATE strips SET status = $1 WHERE id = $2',
      ['pending_transfer', stripId]
    );
    
    const result = await pool.query(
      `INSERT INTO strip_transfers (strip_id, from_sector_id, to_sector_id, initiated_by, status, target_x, target_y, sub_sector_label) 
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7) RETURNING *`,
      [stripId, fromSectorId, toSectorId, workstationId, targetX || 0, targetY || 0, subSectorLabel || null]
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

app.post('/api/transfers/:id/accept', async (req, res) => {
  try {
    const transferId = req.params.id;
    
    const transfer = await pool.query('SELECT * FROM strip_transfers WHERE id = $1', [transferId]);
    if (transfer.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }
    
    const { strip_id, to_sector_id, target_x, target_y } = transfer.rows[0];
    
    await pool.query(
      'UPDATE strips SET sector_id = $1, status = $2, on_map = $3, x = $4, y = $5 WHERE id = $6',
      [to_sector_id, 'queued', false, target_x || 0, target_y || 0, strip_id]
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
    
    const { strip_id, to_sector_id } = transfer.rows[0];
    
    await pool.query(
      'UPDATE strips SET sector_id = $1, status = $2, on_map = $3, x = $4, y = $5 WHERE id = $6',
      [to_sector_id, 'queued', true, x, y, strip_id]
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
    const { key, value } = req.body;
    await pool.query(
      `INSERT INTO system_defaults (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, value]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving default:', err);
    res.status(500).json({ error: 'Failed to save default' });
  }
});

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server running on port ${PORT}`);
});
