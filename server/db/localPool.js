// מאגר מקומי בעמדה — Postgres שרץ **בתוך** העמדה, בלי שרת ובלי רשת.
//
// למה זה קיים: כשהקשר לשרת המרכזי נופל, הבקר עדיין צריך לגרור פ"מ על המפה,
// להעביר לנקודת מעבר ולקלוט בנקודת הצטרפות. עד היום כל כתיבה כזו נחסמה
// (`OFFLINE_SHARED_WRITE`), והעמדה הפכה למסך צפייה בלבד. כאן היא ממשיכה לעבוד
// מול מאגר משלה.
//
// למה PGlite ולא SQLite: הסכמה של SKY-KING היא Postgres לעומקה — JSONB,
// pgcrypto/gen_random_uuid, סכמות נפרדות לסביבות תרגול, `ANY($1::int[])`,
// TIMESTAMPTZ. PGlite הוא PostgreSQL 18 מהודר ל-WASM, ולכן `server/db/init.js`
// ו-457 ה-endpoints רצים עליו **בלי שורת קוד אחת שמשתנה**. SQLite היה מחייב
// לשכתב את כולם, ולתחזק שתי גרסאות של כל שאילתה — בדיוק ה-duplication
// שהפרויקט אוסר.
//
// ⚠️ **חיבור יחיד.** PGlite אינו pool: יש בו connection אחד. שתי טרנזקציות
// שרצות במקביל היו משתרגות זו בזו (ה-BEGIN של האחת נופל בתוך הטרנזקציה של
// השנייה, וה-COMMIT סוגר את שתיהן). לכן כל גישה עוברת דרך נעילה, ו-`connect()`
// מחזיק אותה עד ה-`release()`. זה מסדר את הבקשות בתור במקום להריץ 12 במקביל —
// מחיר סביר לעמדה בודדת, שהעומס עליה הוא של מפעיל אחד.

import path from 'path';

/**
 * נעילה סדרתית עם החזקה (lease).
 *
 * `acquire()` נפתר ל**פונקציית שחרור** רק אחרי שהמחזיק הקודם שחרר. כך
 * `connect()` יכול להחזיק את החיבור לאורך טרנזקציה שלמה, ובקשה מקבילה ממתינה
 * בתור במקום להשתרג לתוכה.
 */
function createLock() {
  let tail = Promise.resolve();
  return function acquire() {
    let release;
    const held = new Promise(res => { release = res; });
    const myTurn = tail;
    tail = tail.then(() => held);
    return myTurn.then(() => release);
  };
}

/** מעבר לזמן הזה טרנזקציה שמחזיקה את החיבור נחשבת דלף — העמדה תיתקע בלעדיו. */
const LEASE_WARN_MS = 15_000;
const LEASE_FORCE_MS = 60_000;

/** ריבוי פקודות בשאילתה אחת — PGlite דוחה זאת ב-query() ודורש exec(). */
const MULTI_CMD = /cannot insert multiple commands into a prepared statement/i;

/**
 * ממיר תשובת PGlite לצורת התשובה של node-postgres.
 *
 * `rowCount` ב-pg הוא מספר השורות שחזרו בקריאה, ומספר השורות שהושפעו בכתיבה.
 * ב-PGlite `affectedRows` מאוכלס בכתיבה בלבד ושווה **0** בקריאה — ולכן `??`
 * אינו מספיק כאן (אפס אינו nullish). בלי ההפרדה הזו כל `SELECT` היה מחזיר
 * `rowCount: 0`, וכל route שבודק `rowCount === 0` כדי להחזיר 404 היה מכריז
 * "לא נמצא" על פ"מ שנקרא זה עתה בהצלחה.
 *
 * שלושת המקרים: קריאה → אורך השורות · כתיבה בלי RETURNING → affectedRows ·
 * כתיבה עם RETURNING → שניהם זהים.
 */
function toPgResult(res) {
  const rows = res?.rows ?? [];
  return {
    rows,
    rowCount: rows.length > 0 ? rows.length : (res?.affectedRows ?? 0),
    fields: res?.fields ?? [],
    command: '',
  };
}

/** pool.query מקבל גם מחרוזת וגם `{ text, values }` (צורת prepared של pg). */
function unpack(text, params) {
  if (text && typeof text === 'object' && 'text' in text) {
    return { sql: text.text, values: text.values ?? params ?? [] };
  }
  return { sql: text, values: params ?? [] };
}

/**
 * בונה מאגר מקומי עם ממשק תואם ל-pg.Pool.
 *
 * העלייה **עצלה**: PGlite לוקח כ-2 שניות לעלות, ואין סיבה לשלם אותן בטעינת
 * המודול כשהעמדה עובדת מול השרת המרכזי ולא תיגע במאגר המקומי כלל.
 */
export function createLocalPool({ dataDir } = {}) {
  const dir = dataDir || process.env.SKYKING_LOCAL_DB_DIR
    || path.join(process.cwd(), '.skyking-local-db');

  const acquire = createLock();
  let bootPromise = null;
  const handlers = { error: [] };

  async function boot() {
    const { PGlite } = await import('@electric-sql/pglite');
    const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
    const t0 = Date.now();
    const db = await PGlite.create({ dataDir: dir, extensions: { pgcrypto } });
    console.log(`[localPool] המאגר המקומי עלה תוך ${Date.now() - t0}ms — ${dir}`);
    return db;
  }

  const ready = () => (bootPromise ??= boot().catch(err => {
    bootPromise = null; // כשל עלייה אינו סופי — הניסיון הבא ינסה שוב
    for (const h of handlers.error) h(err);
    throw err;
  }));

  /** מריץ שאילתה על החיבור. **מניח שהנעילה כבר בידי הקורא.** */
  async function runHeld(db, text, params) {
    const { sql, values } = unpack(text, params);
    try {
      return toPgResult(values.length ? await db.query(sql, values) : await db.query(sql));
    } catch (err) {
      // ריבוי פקודות: נופלים ל-exec, שמריץ אותן ברצף. מזוהה לפי השגיאה ולא לפי
      // ניתוח ה-SQL — ";" בתוך מחרוזת או הערה היה מטעה כל parser שנכתוב כאן.
      if (MULTI_CMD.test(String(err?.message)) && !values.length) {
        const results = await db.exec(sql);
        return toPgResult(results[results.length - 1]);
      }
      throw err;
    }
  }

  async function query(text, params) {
    const db = await ready();
    const release = await acquire();
    try {
      return await runHeld(db, text, params);
    } finally {
      release();
    }
  }

  async function connect() {
    const db = await ready();
    const release = await acquire();

    let released = false;
    const doRelease = () => {
      if (released) return;
      released = true;
      clearTimeout(warnTimer);
      clearTimeout(forceTimer);
      release();
    };

    // דלף של client נועל את **כל** העמדה, כי החיבור יחיד. ב-pg דלף כזה מכרסם
    // אחד מ-12 חיבורים ונבלע; כאן הוא משתק את המסך, ולכן הוא חייב להישבר בקול.
    const warnTimer = setTimeout(() => {
      console.warn('[localPool] טרנזקציה מחזיקה את המאגר המקומי מעל 15ש\' — בדוק client.release() חסר');
    }, LEASE_WARN_MS);
    const forceTimer = setTimeout(async () => {
      console.error('[localPool] טרנזקציה תקועה מעל 60ש\' — מבצע ROLLBACK ומשחרר את המאגר');
      try { await db.query('ROLLBACK'); } catch { /* אולי לא בטרנזקציה */ }
      doRelease();
    }, LEASE_FORCE_MS);

    return {
      query: (text, params) => runHeld(db, text, params),
      release: doRelease,
    };
  }

  return {
    query,
    connect,
    on: (event, handler) => { (handlers[event] ??= []).push(handler); },
    end: async () => { if (bootPromise) (await bootPromise).close(); },
    /** לבדיקות ולחיווי: האם המאגר כבר עלה */
    isBooted: () => bootPromise !== null,
    dataDir: dir,
  };
}

/** האם התהליך הזה אמור לעבוד מול המאגר המקומי במקום מול Postgres מרוחק. */
export function isLocalDbMode() {
  return process.env.SKYKING_LOCAL_DB === '1';
}
