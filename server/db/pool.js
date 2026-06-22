import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 12,                       // מקס' connections מקבילים (Neon pooler מטפל בשאר)
  idleTimeoutMillis: 30000,      // שחרר connection לא-פעיל אחרי 30ש' (מונע connections מתים של Neon)
  connectionTimeoutMillis: 10000, // אם אין connection פנוי תוך 10ש' — שגיאה במקום תקיעה לנצח
});

// מונע קריסה/תקיעה כש-Neon מנתק connection לא-פעיל
pool.on('error', (err) => {
  console.error('[pool] idle client error:', err.message);
});

export default pool;
