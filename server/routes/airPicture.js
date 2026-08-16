// תמונ"א על הדסק - קונפיגורציה וריליי.
//
// שים לב למה ש**אין** כאן: אין טבלת מטוסים, אין INSERT, ואין קריאה ל-DB בנתיב
// הנתונים. התמונ"א היא מידע חיצוני קריא-בלבד בקצב גבוה, ואילו היא הייתה נכתבת
// ל-DB זה היה 300 UPDATE כל 2 שניות (AIR_PICTURE_SPEC.md §2). ה-DB נוגע רק
// ב**הגדרה**: לאן לפנות, באיזה קצב, ואילו עמדות מציגות.
//
// זכור: מה שזורם כאן הוא **המטוס הפיזי בשמיים**, לא הפ"מ.

import express from 'express';
import pool from '../db/pool.js';
import { currentEnv } from '../db/env-context.js';

const router = express.Router();

/**
 * קריאת הקונפיג הגלובלי. שורה יחידה (id=1) - סינגלטון, לא רשימה.
 *
 * **משתני הסביבה גוברים על ה-DB.** הסיבה מעשית: הכתובת של המאגר שונה בין
 * סביבות (מקומי `127.0.0.1:7400`, ב-Railway `atsim.railway.internal`), וכתובת
 * שיושבת רק ב-DB מחייבת לכתוב ל-DB של פרודקשן כדי לשנות אותה. משתנה סביבה
 * הוא הדרך הנכונה להגדיר **מיקום** - ה-DB נשאר להגדרות תפעוליות.
 */
async function readConfig() {
  const envUrl = (process.env.AIR_PICTURE_URL || '').trim();
  let row = null;
  try {
    const r = await pool.query(
      'SELECT id, base_url, auth_token, poll_ms, enabled, updated_at FROM air_picture_config ORDER BY id LIMIT 1',
    );
    row = r.rows[0] || null;
  } catch (err) {
    // בלי DB עדיין אפשר לעבוד אם הכתובת מגיעה מהסביבה - אחרת נכשלים כרגיל.
    if (!envUrl) throw err;
  }
  if (!envUrl) return row;
  return {
    ...(row || { id: null, poll_ms: 2000, updated_at: null }),
    base_url: envUrl,
    auth_token: process.env.AIR_PICTURE_TOKEN || row?.auth_token || null,
    // כתובת מפורשת בסביבה = כוונה להפעיל. אחרת היה צריך גם להגדיר משתנה וגם
    // לזכור לדלוק את המתג ב-DB, וזו בדיוק השכחה שמייצרת "למה זה לא עובד".
    enabled: process.env.AIR_PICTURE_ENABLED === 'false' ? false : true,
    from_env: true,
  };
}

/**
 * לעמדה - **בלי הטוקן**.
 * העמדה צריכה לדעת רק אם המאגר דלוק ובאיזה קצב לדגום. טוקן שמגיע ל-renderer
 * הוא טוקן שדולף לכל סקריפט שרץ בעמוד, ואין שום סיבה שהוא יגיע לשם.
 */
router.get('/api/air-picture/config', async (_req, res) => {
  try {
    const cfg = await readConfig();
    res.json({
      enabled: !!cfg?.enabled && !!cfg?.base_url,
      pollMs: cfg?.poll_ms || 2000,
      configured: !!cfg?.base_url,
    });
  } catch (err) {
    console.error('air-picture config:', err.message);
    res.status(500).json({ error: 'failed to read air picture config' });
  }
});

/** למסך הניהול - כולל הכתובת, ועם הטוקן ממוסך לאורך בלבד. */
router.get('/api/air-picture/admin-config', async (_req, res) => {
  try {
    const cfg = await readConfig();
    res.json({
      base_url: cfg?.base_url || '',
      poll_ms: cfg?.poll_ms || 2000,
      enabled: !!cfg?.enabled,
      has_token: !!cfg?.auth_token,
      updated_at: cfg?.updated_at || null,
      // כשהכתובת מגיעה מהסביבה, עריכה במסך הניהול לא תשפיע - עדיף לומר זאת
      // מאשר לתת למישהו לשמור ולתהות למה כלום לא השתנה.
      from_env: !!cfg?.from_env,
    });
  } catch (err) {
    console.error('air-picture admin-config:', err.message);
    res.status(500).json({ error: 'failed to read air picture config' });
  }
});

router.put('/api/air-picture/config', async (req, res) => {
  try {
    const { base_url, auth_token, poll_ms, enabled } = req.body || {};
    const ms = Number(poll_ms);
    // `auth_token` undefined = "לא נגעתי בטוקן" ולכן נשמר; מחרוזת ריקה = מחיקה
    // מפורשת. בלי ההבחנה, כל שמירה של הכתובת הייתה מוחקת את הטוקן בשקט.
    await pool.query(
      `UPDATE air_picture_config SET
         base_url   = $1,
         auth_token = CASE WHEN $2::text IS NULL THEN auth_token ELSE NULLIF($2, '') END,
         poll_ms    = $3,
         enabled    = $4,
         updated_at = NOW()
       WHERE id = (SELECT id FROM air_picture_config ORDER BY id LIMIT 1)`,
      [base_url || null, auth_token === undefined ? null : String(auth_token),
        Number.isFinite(ms) && ms >= 500 ? Math.round(ms) : 2000, enabled === true],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('air-picture config update:', err.message);
    res.status(500).json({ error: 'failed to update air picture config' });
  }
});

/**
 * הריליי - **מסלול הגיבוי**, לא המסלול המיועד.
 *
 * בעמדת Electron שרת העמדה עונה על אותו נתיב **ישירות מהמאגר** ולא מגיע לכאן
 * בכלל (§7.3) - זו הדרישה "חיבור ישיר לעמדה בלי מאגר SKY-KING". הריליי קיים
 * כדי שפיתוח בדפדפן ועמדות שאין להן שרת מקומי ימשיכו לעבוד.
 *
 * גם כאן אין DB בנתיב הנתונים: רק קריאת קונפיג (מטמון קצר) והעברה.
 */
let cfgCache = { at: 0, cfg: null };
const CFG_TTL_MS = 15000;

router.get('/api/air-picture/live', async (req, res) => {
  try {
    const now = Date.now();
    if (now - cfgCache.at > CFG_TTL_MS) {
      cfgCache = { at: now, cfg: await readConfig() };
    }
    const cfg = cfgCache.cfg;
    if (!cfg?.enabled || !cfg.base_url) return res.status(503).json({ error: 'air picture disabled' });

    const ac = new AbortController();
    // קצר מקצב הדגימה: בקשה תקועה חייבת להשתחרר לפני שהבאה יוצאת, אחרת
    // נבנה תור חופף בדיוק כמו ב-setInterval.
    const killer = setTimeout(() => ac.abort(), 1800);
    try {
      const upstream = await fetch(`${cfg.base_url.replace(/\/+$/, '')}/air-picture`, {
        signal: ac.signal,
        headers: {
          ...(cfg.auth_token ? { Authorization: `Bearer ${cfg.auth_token}` } : {}),
          ...(req.headers['if-none-match'] ? { 'If-None-Match': req.headers['if-none-match'] } : {}),
          // **הסביבה עוברת למאגר.** לכל אחת מ-50 הסביבות תמונ"א משלה (1-10 הן
          // סביבה חיה אחת), והמאגר הוא זה שמסנן. הכותרת נלקחת מהבקשה כמות שהיא
          // ולא מ-`currentEnv()`: היא כבר עברה את אימות ה-middleware, ולהעביר
          // אותה הלאה שומר את המאגר כמקור אמת אחד להחלטה.
          //
          // ריליי שהיה שוכח את הכותרת היה מחזיר לעמדת תרגול את התמונה החיה -
          // ולכן העמדה מאמתת את `env` שחוזר בסנאפשוט (src/airPicture/poller.ts).
          'X-Env': String(currentEnv()),
        },
      });
      const etag = upstream.headers.get('etag');
      if (etag) res.set('ETag', etag);
      res.set('Cache-Control', 'no-store');
      if (upstream.status === 304) return res.status(304).end();
      if (!upstream.ok) return res.status(502).json({ error: `repository ${upstream.status}` });
      res.json(await upstream.json());
    } finally {
      clearTimeout(killer);
    }
  } catch (err) {
    // 502 ולא 500: התקלה היא במאגר החיצוני, לא ב-SKY-KING. ההבחנה חשובה -
    // העמדה מציגה "אין קשר למאגר" ולא "השרת נפל".
    //
    // **הסיבה עוברת כמות שהיא.** "repository unreachable" בלי פירוט הוא כישלון
    // שקט: DNS, TLS ואסימון שגוי נראים זהים, ומי שמדבג נשאר לנחש. זו כבר
    // הפעם הרביעית היום שהודעה בלי פירוט שלחה לכיוון הלא נכון.
    const detail = [err.name, err.message, err.cause?.code, err.cause?.message]
      .filter(Boolean).join(' | ').slice(0, 300);
    console.error('air-picture relay:', detail);
    res.status(502).json({
      error: err.name === 'AbortError' ? 'repository timeout' : 'repository unreachable',
      detail,
    });
  }
});

// ── מפות מעוגנות מהמאגר - קריאה בלבד ────────────────────────────────────────
//
// **מה שאין כאן הוא העיקר: אין DB.**
//
// הדרישה היא לשתף מפות מ-ATSIM אל SKY-KING **בלי שלמאגר תהיה יכולת לעדכן את
// ה-DB של SKY-KING**. לכן המפה אינה נכנסת לטבלת `maps`, אין מיגרציה, ואין שום
// כתיבה: SKY-KING מושך אותה דרך אותו ריליי שכבר מושך את התמונ"א, עם אותו
// `base_url` ואותו אסימון. המאגר אינו מחזיק credentials ל-DB ואינו יכול לקבל
// אותם - לא קיים נתיב שבו הוא כותב.
//
// המחיר מפורש: כשהמאגר לא זמין אין מפה. עדיף כך מאשר עותק ב-DB שנשאר אחרי
// שמישהו שינה את המפה במאגר, ואיש לא יודע שמה שרואים ישן.
//
// המטמון כאן הוא **בזיכרון התהליך בלבד**, ותפקידו למנוע משיכה של מגה-בייטים
// בכל טעינת מסך. הוא נמחק בכל דיפלוי, וזה בסדר גמור.

const mapsCache = { at: 0, list: null };
const MAPS_TTL_MS = 30000;
/** התמונות שנמשכו. מוגבל במספר - מפה היא מגה-בייטים, לא קילו. */
const imageCache = new Map();
const IMAGE_CACHE_MAX = 4;

/** הקונפיג של המאגר, עם אותו מטמון קצר של נתיב התמונ"א. */
async function upstreamConfig() {
  const now = Date.now();
  if (now - cfgCache.at > CFG_TTL_MS) cfgCache = { at: now, cfg: await readConfig() };
  return cfgCache.cfg;
}

const upstreamHeaders = (cfg) => (cfg.auth_token ? { Authorization: `Bearer ${cfg.auth_token}` } : {});
const upstreamBase = (cfg) => cfg.base_url.replace(/\/+$/, '');
const failDetail = (err) => [err.name, err.message, err.cause?.code].filter(Boolean).join(' | ').slice(0, 200);

/**
 * רשימת המפות שהמאגר משתף - הגבולות בלבד, בלי נקודות עיגון ובלי תמונות.
 * מפה בלי גבולות מסוננת גם כאן ולא רק במאגר: העמדה אינה אמורה לקבל מפה
 * שאי-אפשר להציב עליה מטוס.
 */
router.get('/api/air-picture/maps', async (_req, res) => {
  try {
    const cfg = await upstreamConfig();
    if (!cfg?.enabled || !cfg.base_url) return res.json([]);

    const now = Date.now();
    if (mapsCache.list && now - mapsCache.at < MAPS_TTL_MS) return res.json(mapsCache.list);

    const ac = new AbortController();
    const killer = setTimeout(() => ac.abort(), 4000);
    try {
      const upstream = await fetch(`${upstreamBase(cfg)}/air-picture/maps`, {
        signal: ac.signal, headers: upstreamHeaders(cfg),
      });
      if (!upstream.ok) return res.status(502).json({ error: `repository ${upstream.status}` });
      const list = (await upstream.json()).filter(m => m?.id && m?.bounds);
      mapsCache.at = now;
      mapsCache.list = list;
      res.json(list);
    } finally { clearTimeout(killer); }
  } catch (err) {
    const detail = failDetail(err);
    console.error('air-picture maps:', detail);
    res.status(502).json({ error: 'repository unreachable', detail });
  }
});

/**
 * בייטים של מפה - **pull-through**: נמשכים מהמאגר ומוגשים, בלי לגעת ב-DB.
 * ה-`ETag` של המאגר עובר כמות שהוא, ולכן הדפדפן של העמדה מקבל 304 ואינו
 * מוריד את התמונה שוב בכל מעבר מסך.
 */
router.get('/api/air-picture/maps/:id/image', async (req, res) => {
  try {
    const cfg = await upstreamConfig();
    if (!cfg?.enabled || !cfg.base_url) return res.status(503).json({ error: 'air picture disabled' });

    const id = String(req.params.id);
    const serve = ({ bytes, etag, mime }) => {
      res.set('ETag', etag);
      res.set('Cache-Control', 'private, max-age=300, must-revalidate');
      if (req.headers['if-none-match'] === etag) return res.status(304).end();
      res.type(mime).send(bytes);
    };

    const hit = imageCache.get(id);
    if (hit) return serve(hit);

    const ac = new AbortController();
    // ארוך יותר מהתמונ"א בכוונה: מפה היא מגה-בייטים ולא סנאפשוט, והיא נמשכת
    // פעם אחת ולא כל שתי שניות.
    const killer = setTimeout(() => ac.abort(), 15000);
    try {
      const upstream = await fetch(
        `${upstreamBase(cfg)}/air-picture/maps/${encodeURIComponent(id)}/image`,
        { signal: ac.signal, headers: upstreamHeaders(cfg) },
      );
      if (!upstream.ok) return res.status(502).json({ error: `repository ${upstream.status}` });
      const entry = {
        bytes: Buffer.from(await upstream.arrayBuffer()),
        etag: upstream.headers.get('etag') || `W/"${id}-${Date.now()}"`,
        mime: upstream.headers.get('content-type') || 'image/png',
      };
      if (imageCache.size >= IMAGE_CACHE_MAX) imageCache.delete(imageCache.keys().next().value);
      imageCache.set(id, entry);
      serve(entry);
    } finally { clearTimeout(killer); }
  } catch (err) {
    const detail = failDetail(err);
    console.error('air-picture map image:', detail);
    res.status(502).json({ error: 'repository unreachable', detail });
  }
});

export default router;
