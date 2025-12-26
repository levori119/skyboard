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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS learned_digits (
      id SERIAL PRIMARY KEY,
      digit VARCHAR(1) NOT NULL,
      image_data TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
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

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server running on port ${PORT}`);
});
