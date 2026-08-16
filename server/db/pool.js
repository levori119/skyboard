import pg from 'pg';
import { currentSchema } from './env-context.js';
import { currentActionId } from './action-context.js';
import { createLocalPool, isLocalDbMode } from './localPool.js';
const { Pool } = pg;

// ── בחירת הדרייבר ─────────────────────────────────────────────────────────────
// שני מאגרים אפשריים, ממשק אחד. זו נקודת ההחלפה **היחידה** בכל השרת: כל שאר
// הקוד (457 endpoints, initDb, seedDb) עובר דרך `pool`/`rawPool` ואינו יודע
// מי עונה לו.
//
//   ברירת מחדל  → Postgres מרוחק דרך DATABASE_URL (השרת המרכזי).
//   SKYKING_LOCAL_DB=1 → המאגר המקומי בעמדה (PGlite), בלי רשת כלל.
//
// כך "עבודה מנותקת" אינה מימוש מקביל של הלוגיקה אלא אותה לוגיקה בדיוק מול
// מאגר אחר — ופיצ'ר חדש עובד בנתק ביום שהוא נכתב, בלי לזכור לתמוך בו.
const rawPool = isLocalDbMode()
  ? createLocalPool()
  : new Pool({
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

// ── שרידות ל-failover של ה-DB ────────────────────────────────────────────────
// כשה-DB עובר failover / restart, כל ה-connections הפתוחים מתים בבת אחת. בלי
// טיפול, גל של 500 מגיע לכל העמדות בו-זמנית — ובעמדת בקרה זה נראה כמו קריסת
// מערכת, לא כמו הבהוב של שנייה.
//
// ⚠️ **קריאות בלבד.** ניסיון חוזר על כתיבה מסוכן: כשה-connection מת אי אפשר
// לדעת אם השאילתה הספיקה להתבצע בצד השרת, ושידור חוזר של INSERT/UPDATE עלול
// לשכפל פ"מ או העברה. לכן הסיווג fail closed — כל מה שאינו SELECT מובהק
// נחשב כתיבה ואינו חוזר.

const TRANSIENT_PG_CODES = new Set([
  '57P01', // admin_shutdown — השרת סגר את ה-connection (failover/restart)
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now — השרת עדיין עולה
  '08000', '08001', '08003', '08004', '08006', '08007', // connection exceptions
]);

const TRANSIENT_NODE_CODES = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED']);

export function isTransientDbError(err) {
  if (!err) return false;
  if (TRANSIENT_PG_CODES.has(err.code) || TRANSIENT_NODE_CODES.has(err.code)) return true;
  const m = String(err.message || '');
  return /connection terminated|terminating connection|server closed the connection|socket hang up/i.test(m);
}

/**
 * האם השאילתה היא קריאה טהורה שבטוח לשדר שוב.
 * שמרני בכוונה: מחזיר true רק ל-SELECT (או CTE שכולו קריאה).
 */
export function isReadOnlySql(text) {
  const raw = typeof text === 'string' ? text : text?.text || '';
  // מסיר הערות כדי ש-"-- update" בתחילת שאילתה לא יטעה לכאן או לכאן
  const sql = raw.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
  if (!sql) return false;
  const head = sql.toUpperCase();
  if (!/^(SELECT|WITH)\b/.test(head)) return false;
  // CTE שמכיל כתיבה (WITH x AS (INSERT ... RETURNING)) אינו קריאה
  return !/\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE)\b/.test(head);
}

const RETRY_DELAYS_MS = [120, 400];

/** מריץ קריאה עם ניסיונות חוזרים על כשל connection. כתיבה עוברת כמו שהיא. */
async function withReadRetry(text, run) {
  if (!isReadOnlySql(text)) return run();
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (!isTransientDbError(err) || attempt === RETRY_DELAYS_MS.length) throw err;
      lastErr = err;
      console.warn(`[pool] כשל connection זמני (${err.code || err.message}) — ניסיון ${attempt + 2}`);
      await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastErr;
}

// ── מצב הטרנזקציה: סכמה + פעולה ───────────────────────────────────────────────
// שני דברים נקבעים בתוך הטרנזקציה עצמה: באיזו סכמה היא רצה (סביבות תרגול),
// ולאיזו **פעולה** של מפעיל הכתיבה שייכת (יומן הביטול, CTRL+Z).
//
// `set_config(..., is_local => true)` ולא `SET LOCAL app.action_id = '...'`:
// הצורה הזו מקבלת פרמטר, ולכן המזהה לעולם אינו משורבב ל-SQL כמחרוזת.
const setActionSql = `SELECT set_config('app.action_id', $1, true)`;

async function applyTxnScope(q, schema, actionId) {
  if (schema !== 'public') await q(`SET LOCAL search_path TO ${schema}, public`);
  // גם כשריק, ובמפורש: כך שורה שנכתבת ב-connection שהחזיק מזהה קודם לא
  // תיתפס בטעות לפעולה של מישהו אחר, וביטול לא יחזיר שינוי זר.
  await q(setActionSql, [actionId]);
}

// client בהקשר מוגדר: מזריק SET LOCAL אחרי כל BEGIN, ועוטף שאילתות מחוץ
// לטרנזקציה בטרנזקציית-מיני — כדי שגם הן יישאו את הסכמה ואת מזהה הפעולה.
//
// ⚠️ קריטי לבטיחות: כשמחליפים את client.query (reassignment), ה-bookkeeping
// הפנימי של node-postgres יוצא מסנכרון וה-SET LOCAL *דולף* לרמת ה-server
// connection של ה-pooler (pgbouncer) — כך ש-connection שחוזר ל-pool ומשרת אחר-כך
// בקשה "טסה" (public) יקרא/יכתוב בטעות לסכמת התרגול. אומת אמפירית מול Neon.
// לכן connection ששירת דרך ה-wrapper הזה **מושמד** בשחרור (release עם error)
// ולעולם לא חוזר ל-pool המשותף.
//
// זה חל גם על מזהה הפעולה, ומאותה סיבה: מזהה שדולף היה מצרף כתיבה של בקשה
// אחרת לפעולה ישנה, וביטול הפעולה ההיא היה מחזיר לאחור שינוי שאיש לא ביקש
// להחזיר. 19 אתרי `pool.connect()` בלבד משתמשים בנתיב הזה (טרנזקציות מפורשות,
// פעולות כבדות ממילא) — החלפת connection בכל אחת היא מחיר זניח מול הסיכון.
function wrapClient(client, schema, actionId) {
  const origQuery = client.query.bind(client);
  const origRelease = client.release.bind(client);
  let inTxn = false;
  const scope = () => applyTxnScope(origQuery, schema, actionId);
  client.query = async (...args) => {
    const [q] = args;
    if (isCmd(q, 'BEGIN')) {
      const res = await origQuery(...args);
      inTxn = true;
      await scope();
      return res;
    }
    if (isCmd(q, 'COMMIT') || isCmd(q, 'ROLLBACK')) {
      inTxn = false;
      return origQuery(...args);
    }
    if (inTxn) return origQuery(...args);
    await origQuery('BEGIN');
    try {
      await scope();
      const res = await origQuery(...args);
      await origQuery('COMMIT');
      return res;
    } catch (err) {
      try { await origQuery('ROLLBACK'); } catch { /* connection כנראה מת */ }
      throw err;
    }
  };
  // השמדת ה-connection בשחרור — מונע דליפת SET LOCAL ל-pool המשותף
  client.release = () => origRelease(new Error('scoped connection: discarded to prevent SET LOCAL leak'));
  return client;
}

const pool = {
  async query(...args) {
    const schema = currentSchema();
    // קריאה אינה מפעילה טריגרים ואינה צריכה הקשר פעולה — נשארת במסלול המהיר.
    const actionId = isReadOnlySql(args[0]) ? '' : currentActionId();
    if (schema === 'public' && !actionId) return withReadRetry(args[0], () => rawPool.query(...args));
    return withReadRetry(args[0], async () => {
      const client = await rawPool.connect();
      try {
        await client.query('BEGIN');
        await applyTxnScope((q, p) => client.query(q, p), schema, actionId);
        const res = await client.query(...args);
        await client.query('COMMIT');
        return res;
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* connection כנראה מת */ }
        throw err;
      } finally {
        // לא נעשה כאן reassignment ל-client.query, ולכן ה-SET LOCAL מתאפס
        // ב-COMMIT כרגיל וה-connection בטוח לחזור ל-pool.
        client.release();
      }
    });
  },

  async connect() {
    const schema = currentSchema();
    const actionId = currentActionId();
    const client = await rawPool.connect();
    return (schema === 'public' && !actionId) ? client : wrapClient(client, schema, actionId);
  },

  on: (...args) => rawPool.on(...args),
  end: (...args) => rawPool.end(...args),
};

// גישה ישירה בלי הקשר סביבה — ל-DDL של ניהול הסכמות בלבד (server/db/envs.js)
export { rawPool };
export default pool;
