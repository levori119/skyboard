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

import fs from 'fs';
import path from 'path';

/** כמה עותקים פגומים נשמרים לצד המאגר. כל אחד ~100MB - לא צוברים בלי סוף. */
const KEEP_CORRUPT = 2;

/** קבצי העמדה (לא של Postgres) שעוברים מתיקייה פגומה לזו שהחליפה אותה */
const CARRY_OVER_FILES = ['auth-secret'];

const isMemoryDir = dir => !dir || String(dir).startsWith('memory://') || String(dir).startsWith('idb://');

/** תיקייה שכבר הכילה מאגר - רק אותה מעבירים הצידה. תיקייה ריקה היא עלייה ראשונה. */
function hasDataDir(dir) {
  try { return fs.existsSync(path.join(dir, 'PG_VERSION')); } catch { return false; }
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

function pruneCorrupt(dir, keep) {
  const parent = path.dirname(dir);
  const prefix = `${path.basename(dir)}.corrupt-`;
  const old = fs.readdirSync(parent).filter(n => n.startsWith(prefix)).sort().reverse().slice(keep);
  for (const n of old) {
    try { fs.rmSync(path.join(parent, n), { recursive: true, force: true }); } catch { /* נעול - בפעם הבאה */ }
  }
}

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
  let recovery = { recovered: false };
  const handlers = { error: [] };
  const onDisk = !isMemoryDir(dir);
  const backupFile = `${dir}.backup.tar.gz`;

  async function boot() {
    const { PGlite } = await import('@electric-sql/pglite');
    const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
    const open = (extra = {}) => PGlite.create({ dataDir: dir, extensions: { pgcrypto }, ...extra });
    const t0 = Date.now();
    let db;
    try {
      db = await open();
    } catch (err) {
      if (!onDisk || !hasDataDir(dir)) throw err;
      db = await recoverDataDir(open, err);
    }
    console.log(`[localPool] המאגר המקומי עלה תוך ${Date.now() - t0}ms — ${dir}`);
    return db;
  }

  /**
   * המאגר שבדיסק לא נפתח - העמדה עולה בכל זאת.
   *
   * הסיבה הנפוצה: התהליך נהרג באמצע כתיבה (כיבוי, קריסה, `child.kill()`),
   * ו-PGlite קורס בפתיחה הבאה ב-`Aborted()`. בלי הטיפול הזה initDb מנסה שוב
   * ושוב, השרת המקומי לא מגיע ל-ready, ובנתק אין מאגר ואין העתק מיראז'.
   *
   * הפגום **מועבר הצידה ולא נמחק** (שני האחרונים נשמרים, לחקירה ולחילוץ ידני).
   * ואז: הגיבוי האחרון-תקין אם יש (`backup()`), אחרת מאגר ריק שהמראה וחבילת
   * האתחול ממלאים. גיבוי שגם הוא לא נפתח - נופלים למאגר ריק, לא נתקעים.
   */
  async function recoverDataDir(open, cause) {
    const aside = `${dir}.corrupt-${stamp()}`;
    console.error(`[localPool] ⚠️ המאגר המקומי לא נפתח (${String(cause?.message || cause).slice(0, 120)}) - מועבר ל-${aside}`);
    // ⚠️ **העתקה וריקון, לא rename.** ב-Windows ה-PGlite שקרס ממשיך להחזיק
    // ידית על התיקייה עד סוף התהליך, ו-rename נופל ב-EPERM. העתקה וריקון
    // התוכן עוברים (נבדק), והתיקייה הריקה היא בדיוק מה ש-loadDataDir דורש.
    fs.cpSync(dir, aside, { recursive: true });
    for (const name of fs.readdirSync(dir)) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    pruneCorrupt(dir, KEEP_CORRUPT);

    let db = null;
    if (fs.existsSync(backupFile)) {
      try {
        db = await open({ loadDataDir: new Blob([fs.readFileSync(backupFile)]) });
        recovery = { recovered: true, from: 'backup', aside, backupAt: fs.statSync(backupFile).mtime.toISOString() };
        console.error(`[localPool] ✅ המאגר שוחזר מהגיבוי של ${recovery.backupAt}`);
      } catch (err) {
        console.error(`[localPool] גם הגיבוי לא נפתח (${String(err?.message || err).slice(0, 120)}) - עולה מאגר ריק`);
        for (const name of fs.readdirSync(dir)) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
      }
    }
    if (!db) {
      db = await open();
      recovery = { recovered: true, from: 'fresh', aside };
      console.error('[localPool] ✅ עלה מאגר ריק - המראה תמלא אותו כשיחזור קשר למרכז');
    }
    // קבצי העמדה שיושבים בתוך התיקייה ואינם חלק מ-Postgres. סוד החתימה
    // (server/local.js) עובר - בלעדיו כל מי שמחובר היה מנותק בעלייה הבאה.
    // `snapshot-at` בכוונה **לא**: מאגר ריק חייב לקלוט שוב את חבילת האתחול.
    for (const name of CARRY_OVER_FILES) {
      const from = path.join(aside, name);
      const to = path.join(dir, name);
      try { if (fs.existsSync(from) && !fs.existsSync(to)) fs.copyFileSync(from, to); } catch { /* לא קריטי */ }
    }
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

  /**
   * גיבוי אחרון-תקין של המאגר כולו, לקובץ אחד לצד התיקייה.
   *
   * רץ **תחת הנעילה**: החיבור יחיד, ו-dump באמצע טרנזקציה של מפעיל היה
   * מצלם מצב חצוי. נכתב ל-`.tmp` ואז rename - כיבוי באמצע הכתיבה משאיר את
   * הגיבוי הקודם שלם, ולא קובץ חתוך שישחזר זבל.
   */
  async function backup() {
    if (!onDisk) return { ok: false, reason: 'memory' };
    if (!bootPromise) return { ok: false, reason: 'not_booted' };
    const db = await ready();
    const release = await acquire();
    try {
      const t0 = Date.now();
      const blob = await db.dumpDataDir('gzip');
      const buf = Buffer.from(await blob.arrayBuffer());
      const tmp = `${backupFile}.tmp`;
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, backupFile);
      return { ok: true, bytes: buf.length, ms: Date.now() - t0 };
    } finally {
      release();
    }
  }

  return {
    query,
    connect,
    on: (event, handler) => { (handlers[event] ??= []).push(handler); },
    // ⚠️ **ממתינים ל-close.** סגירה שלא הושלמה לפני יציאת התהליך משאירה את
    // התיקייה כמו הריגה - בדיוק מה שהפיל את העמדה בעלייה הבאה.
    // תחת הנעילה: סגירה באמצע שאילתה של סיבוב מראה הייתה חותכת אותה.
    end: async () => {
      if (!bootPromise) return;
      const db = await bootPromise.catch(() => null);
      bootPromise = null;
      if (!db || db.closed) return;
      const release = await acquire();
      try { await db.close(); } finally { release(); }
    },
    backup,
    /** האם המאגר עלה מתוך התאוששות (ומאיזה מקור) - לחיווי ולבדיקות */
    recovery: () => recovery,
    /** לבדיקות ולחיווי: האם המאגר כבר עלה */
    isBooted: () => bootPromise !== null,
    dataDir: dir,
  };
}

/** האם התהליך הזה אמור לעבוד מול המאגר המקומי במקום מול Postgres מרוחק. */
export function isLocalDbMode() {
  return process.env.SKYKING_LOCAL_DB === '1';
}
