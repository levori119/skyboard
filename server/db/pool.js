import pg from 'pg';
import { currentSchema } from './env-context.js';
const { Pool } = pg;

const rawPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 12,                       // מקס' connections מקבילים (Neon pooler מטפל בשאר)
  idleTimeoutMillis: 30000,      // שחרר connection לא-פעיל אחרי 30ש' (מונע connections מתים של Neon)
  connectionTimeoutMillis: 10000, // אם אין connection פנוי תוך 10ש' — שגיאה במקום תקיעה לנצח
});

// מונע קריסה/תקיעה כש-Neon מנתק connection לא-פעיל
rawPool.on('error', (err) => {
  console.error('[pool] idle client error:', err.message);
});

// ── סביבות תרגול ──────────────────────────────────────────────────────────────
// כל שאילתה רצה בסכמת הסביבה של הבקשה הנוכחית (env-context, נקבע ב-middleware).
// סביבות טסות (1-10) → public: מסלול מהיר, אפס תקורה, ההתנהגות המקורית.
// סביבות תרגול (11-50) → SET LOCAL search_path בתוך טרנזקציה. חייב להיות
// SET LOCAL-בתוך-BEGIN ולא SET רגיל: DATABASE_URL מצביע על ה-pooler של Neon
// (pgbouncer במצב transaction) — מצב session לא שורד בין טרנזקציות, וטרנזקציה
// היא היחידה שמובטח לה connection שרת אחד. SET LOCAL גם מתאפס אוטומטית
// ב-COMMIT/ROLLBACK, כך ש-connection לעולם לא חוזר ל-pool עם סכמת תרגול.

const isCmd = (text, cmd) => {
  const t = (typeof text === 'string' ? text : text?.text || '').trimStart().toUpperCase();
  return t.startsWith(cmd);
};

// client בהקשר סביבת תרגול: מזריק SET LOCAL אחרי כל BEGIN, ועוטף שאילתות
// מחוץ לטרנזקציה בטרנזקציית-מיני — כדי שגם הן ירוצו בסכמה הנכונה.
//
// ⚠️ קריטי לבטיחות: כשמחליפים את client.query (reassignment), ה-bookkeeping
// הפנימי של node-postgres יוצא מסנכרון וה-SET LOCAL *דולף* לרמת ה-server
// connection של ה-pooler (pgbouncer) — כך ש-connection שחוזר ל-pool ומשרת אחר-כך
// בקשה "טסה" (public) יקרא/יכתוב בטעות לסכמת התרגול. אומת אמפירית מול Neon.
// לכן connection ששירת סביבת תרגול דרך ה-wrapper הזה **מושמד** בשחרור
// (release עם error) ולעולם לא חוזר ל-pool המשותף. סביבות תרגול בעומס נמוך,
// כך שהחלפת connection לכל טרנזקציה מפורשת היא מחיר זניח מול בטיחות הבידוד.
function wrapClientForSchema(client, schema) {
  const origQuery = client.query.bind(client);
  const origRelease = client.release.bind(client);
  let inTxn = false;
  client.query = async (...args) => {
    const [q] = args;
    if (isCmd(q, 'BEGIN')) {
      const res = await origQuery(...args);
      inTxn = true;
      await origQuery(`SET LOCAL search_path TO ${schema}, public`);
      return res;
    }
    if (isCmd(q, 'COMMIT') || isCmd(q, 'ROLLBACK')) {
      inTxn = false;
      return origQuery(...args);
    }
    if (inTxn) return origQuery(...args);
    await origQuery('BEGIN');
    try {
      await origQuery(`SET LOCAL search_path TO ${schema}, public`);
      const res = await origQuery(...args);
      await origQuery('COMMIT');
      return res;
    } catch (err) {
      try { await origQuery('ROLLBACK'); } catch { /* connection כנראה מת */ }
      throw err;
    }
  };
  // השמדת ה-connection בשחרור — מונע דליפת search_path ל-pool המשותף
  client.release = () => origRelease(new Error('env-scoped connection: discarded to prevent search_path leak'));
  return client;
}

const pool = {
  async query(...args) {
    const schema = currentSchema();
    if (schema === 'public') return rawPool.query(...args);
    const client = await rawPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO ${schema}, public`);
      const res = await client.query(...args);
      await client.query('COMMIT');
      return res;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* connection כנראה מת */ }
      throw err;
    } finally {
      client.release();
    }
  },

  async connect() {
    const schema = currentSchema();
    const client = await rawPool.connect();
    return schema === 'public' ? client : wrapClientForSchema(client, schema);
  },

  on: (...args) => rawPool.on(...args),
  end: (...args) => rawPool.end(...args),
};

// גישה ישירה בלי הקשר סביבה — ל-DDL של ניהול הסכמות בלבד (server/db/envs.js)
export { rawPool };
export default pool;
