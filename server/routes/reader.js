// חלון קריאה - עזרים, מצגות ו-PDF שנפרסים בתוך המערכת עם סימניות אישיות.
//
// שלוש שכבות, ולכל אחת הרשאה משלה (server/middleware/auth.js):
//   1. **תצורה** (`/config`)     - מנהל בלבד. איך נפתחים עזרים בכל המערכת.
//   2. **חומר הקריאה** (`/docs`) - ראש צוות ומעלה. העלאה, גרסת PDF, מחיקה.
//   3. **סימניות ומדף** (`/bookmarks`, `/quick`) - כל מזוהה, ו**רק על עצמו**:
//      הבעלים הוא **המספר האישי** מהאסימון (`req.user.personalId`), ולעולם לא
//      גוף הבקשה. לא crewMemberId: למשתמש מיראז' בלי שורה ב-crew_members הוא
//      null, וכל סימנייה שלו נדחתה (2026-10-11).
//
// למה יש proxy (`/docs/:id/proxy`): pdfjs חייב את **בתי** הקובץ, וקישור למערכת
// מסמכים חיצונית נחסם ב-CORS. הסיכון המוכר בשרת שמושך כתובת מטעם הלקוח הוא
// SSRF, ולכן הנתיב **אינו מקבל כתובת מהלקוח בכלל**: הוא מושך רק את הכתובת
// שכבר רשומה בשורת `reader_docs`, כלומר כתובת שראש צוות הגדיר במסך הניהול.

import express, { Router } from 'express';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import pool from '../db/pool.js';
import {
  READER_OPEN_MODES, READER_OFFICE_MODES, DEFAULT_OPEN_MODE, DEFAULT_OFFICE_MODE,
  docExtOf, docKindOf, normalizeDocUrl, isFetchableUrl, resolveOfficeMode, needsServerConvert,
} from '../../shared/readerDocs.js';

const router = new Router();

/**
 * אין מגבלת גודל של המערכת (אפיון, 2026-10-11). התקרה היחידה היא של PostgreSQL:
 * שדה BYTEA בודד מוגבל ל-1GB. הקובץ עולה כ**בתים גולמיים** (`express.raw`) ולא
 * כ-base64 בתוך JSON - ה-JSON חסום ב-50MB גלובלית ומנפח כל קובץ פי 1.33.
 */
const MAX_DOC_BYTES = 1024 * 1024 * 1024 - 1;
const MAX_FETCH_BYTES = MAX_DOC_BYTES;
const rawBody = express.raw({ type: 'application/octet-stream', limit: MAX_DOC_BYTES });

/** כותרת שקודדה ב-encodeURIComponent (שם קובץ בעברית אינו עובר ככותרת גולמית). */
const headerText = (req, name) => {
  const v = req.get(name);
  if (!v) return '';
  try { return decodeURIComponent(v); } catch { return v; }
};

/**
 * הבתים של קובץ שעלה, בשתי הצורות: גולמי (`application/octet-stream`, הדרך
 * הרגילה) או base64 בתוך JSON (תאימות לאחור). null = לא נשלח כלום.
 */
function uploadedBytes(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const base64 = String(req.body?.dataBase64 || '');
  if (!base64) return null;
  return Buffer.from(base64.replace(/^data:[^,]*,/, ''), 'base64');
}
const FETCH_TIMEOUT_MS = 20000;
// מצגת של עשרות מגה עם תמונות נמשכת דקות ב-LibreOffice
const CONVERT_TIMEOUT_MS = 10 * 60 * 1000;

const OPEN_MODE_KEY = 'readerOpenMode';
const OFFICE_MODE_KEY = 'readerOfficeMode';

/**
 * העמודות שאינן הקובץ עצמו. שליפת `data` לרשימה הייתה מושכת כל מצגת ל-RAM,
 * ולכן נוכחות הקובץ מוחזרת כדגל בלבד. `alias` נדרש כשיש JOIN.
 */
const metaCols = (alias = '') => {
  const p = alias ? `${alias}.` : '';
  return `${p}id, ${p}name, ${p}source_kind, ${p}url, ${p}url_key, ${p}file_name, ${p}ext, ${p}mime, ${p}byte_size,
    (${p}data IS NOT NULL) AS has_file, (${p}pdf_data IS NOT NULL) AS has_pdf,
    ${p}converted_at, ${p}convert_error, ${p}created_by, ${p}created_at, ${p}updated_at`;
};
const META_COLS = metaCols();

const clip = (v, max) => String(v ?? '').trim().slice(0, max);
const intOf = (v, dflt = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : dflt);

/** מזהה איש הצוות - **מהאסימון בלבד**. null למשתמש מיראז' בלי שורה ב-crew_members. */
function crewIdOf(req) {
  const id = Number(req.user?.crewMemberId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** בעלי הנתונים האישיים - המספר האישי מהאסימון. בלעדיו (עמדה/שירות) אין נתונים אישיים. */
function ownerOf(req) {
  const pid = String(req.user?.personalId ?? '').trim().slice(0, 50);
  return pid || null;
}

/** מוסיף לשורת המסמך את השדות הנגזרים שהלקוח צריך כדי לבחור מנוע. */
function shapeDoc(row) {
  if (!row) return null;
  const ext = row.ext || docExtOf(row.file_name || row.url);
  return {
    ...row,
    ext,
    kind: docKindOf(ext, row.mime),
    hasFile: !!row.has_file,
    hasPdf: !!row.has_pdf,
    convertError: row.convert_error || '',
  };
}

async function readDefaults() {
  const { rows } = await pool.query(
    `SELECT key, value FROM system_defaults WHERE key = ANY($1::text[])`,
    [[OPEN_MODE_KEY, OFFICE_MODE_KEY]],
  );
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    openMode: READER_OPEN_MODES.includes(map[OPEN_MODE_KEY]) ? map[OPEN_MODE_KEY] : DEFAULT_OPEN_MODE,
    officeMode: READER_OFFICE_MODES.includes(map[OFFICE_MODE_KEY]) ? map[OFFICE_MODE_KEY] : DEFAULT_OFFICE_MODE,
  };
}

// ── תצורה ──────────────────────────────────────────────────────────────────

// נקרא בכל עמדה בעלייה, ולכן מחזיר גם את זמינות ההמרה: מסך הניהול חייב לדעת
// שהוא מציע מצב שאינו אפשרי בשרת הזה, ולא לגלות זאת רק כשמצגת לא נפתחת.
//
// הבדיקה עצמה (spawn של soffice) **אינה** רצה בכל בקשה: על שרת בלי LibreOffice
// היא הייתה מוסיפה שניות לכל עליית עמדה. היא רצה כשההמרה בכלל רלוונטית
// (officeMode='server') או כשמסך הניהול מבקש אותה במפורש (?probe=1), ונשמרת
// לכל חיי התהליך. `null` = טרם נבדק.
router.get('/api/reader/config', async (req, res) => {
  try {
    const cfg = await readDefaults();
    const probe = req.query.probe === '1' || cfg.officeMode === 'server';
    const convertAvailable = probe
      ? await sofficeAvailable()
      : (sofficeCache === null ? null : !!sofficeCache);
    res.json({ ...cfg, convertAvailable });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read reader config' });
  }
});

router.put('/api/reader/config', async (req, res) => {
  try {
    const openMode = READER_OPEN_MODES.includes(req.body?.openMode) ? req.body.openMode : DEFAULT_OPEN_MODE;
    const officeMode = resolveOfficeMode(req.body?.officeMode);
    for (const [key, value] of [[OPEN_MODE_KEY, openMode], [OFFICE_MODE_KEY, officeMode]]) {
      await pool.query(
        `INSERT INTO system_defaults (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, value],
      );
    }
    res.json({ openMode, officeMode });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save reader config' });
  }
});

// ── חומר הקריאה ────────────────────────────────────────────────────────────

router.get('/api/reader/docs', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT ${META_COLS} FROM reader_docs ORDER BY name, id`);
    res.json(rows.map(shapeDoc));
  } catch (err) {
    res.status(500).json({ error: 'Failed to list reader docs' });
  }
});

router.get('/api/reader/docs/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT ${META_COLS} FROM reader_docs WHERE id=$1`, [intOf(req.params.id)]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(shapeDoc(rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reader doc' });
  }
});

/**
 * פתיחת עזר מתוך העמדה: מחזיר את שורת ה-`reader_docs` של הקישור, ויוצר אותה
 * בפעם הראשונה. **כל מזוהה** רשאי - זו קריאה תפעולית ולא הגדרה.
 *
 * ההגנה: הכתובת אינה נלקחת מגוף הבקשה אלא נשלפת מ-`preset_links` לפי המזהה.
 * כך אי-אפשר לרשום דרך העמדה עזר לכתובת שלא הוגדרה בניהול.
 */
router.post('/api/reader/open', async (req, res) => {
  try {
    const linkId = intOf(req.body?.presetLinkId);
    if (!linkId) return res.status(400).json({ error: 'presetLinkId required' });

    const { rows: linkRows } = await pool.query(
      `SELECT id, url, name, doc_id FROM preset_links WHERE id=$1`, [linkId],
    );
    const link = linkRows[0];
    if (!link) return res.status(404).json({ error: 'Link not found' });

    if (link.doc_id) {
      const { rows } = await pool.query(`SELECT ${META_COLS} FROM reader_docs WHERE id=$1`, [link.doc_id]);
      if (rows[0]) return res.json(shapeDoc(rows[0]));
      // שורת העזר נמחקה מתחת לקישור - נוצרת מחדש למטה במקום להיכשל
    }

    const url = String(link.url || '').trim();
    if (!url) return res.status(400).json({ error: 'Link has no url' });
    const urlKey = normalizeDocUrl(url);
    const ext = docExtOf(url);

    // איחוד: קישור שני לאותה כתובת מצטרף לעזר הקיים, ואיתו לסימניות שכבר נכתבו
    const { rows } = await pool.query(
      `INSERT INTO reader_docs (name, source_kind, url, url_key, ext, created_by)
       VALUES ($1, 'link', $2, $3, $4, $5)
       ON CONFLICT (url_key) WHERE url_key <> '' DO UPDATE SET updated_at = NOW()
       RETURNING ${META_COLS}`,
      [clip(link.name || url, 200), url, urlKey, ext, crewIdOf(req)],
    );
    const doc = rows[0];
    await pool.query(`UPDATE preset_links SET doc_id=$1 WHERE id=$2`, [doc.id, linkId]);
    res.json(shapeDoc(doc));
  } catch (err) {
    res.status(500).json({ error: 'Failed to open reader doc' });
  }
});

/** העלאת קובץ (base64). ראש צוות ומעלה - זו הגדרת חומר קריאה. */
router.post('/api/reader/docs', rawBody, async (req, res) => {
  try {
    const raw = Buffer.isBuffer(req.body);
    const name = clip(raw ? headerText(req, 'X-Doc-Name') : req.body?.name, 200);
    const fileName = clip(raw ? headerText(req, 'X-File-Name') : req.body?.fileName, 300);
    const mime = clip(raw ? headerText(req, 'X-File-Mime') : req.body?.mime, 150);
    const buf = uploadedBytes(req);
    if (!buf) return res.status(400).json({ error: 'file required' });
    if (!buf.length) return res.status(400).json({ error: 'Empty file' });
    if (buf.length > MAX_DOC_BYTES) {
      return res.status(413).json({ error: 'File too large', maxBytes: MAX_DOC_BYTES });
    }

    const ext = docExtOf(fileName);
    const { rows } = await pool.query(
      `INSERT INTO reader_docs (name, source_kind, file_name, ext, mime, byte_size, data, created_by)
       VALUES ($1, 'file', $2, $3, $4, $5, $6, $7) RETURNING ${META_COLS}`,
      [name || fileName, fileName, ext, mime, buf.length, buf, crewIdOf(req)],
    );
    const doc = shapeDoc(rows[0]);

    // המרה בהעלאה ולא בפתיחה: המסלול התפעולי חייב להיות דטרמיניסטי, ומנהל
    // שהעלה מצגת אמור לדעת **מיד** אם ההמרה לא עבדה בשרת הזה.
    // ההמרה רצה **ברקע** ולא מעכבת את ההעלאה: מצגת גדולה נמשכת דקות, והמנהל
    // לא צריך להמתין לה. העמדה שפותחת את העזר לפני שהסתיימה מצטרפת לאותה
    // המרה (convertDoc מאחד בקשות על אותו מסמך) ומציגה "ממיר...".
    const { officeMode } = await readDefaults();
    if (needsServerConvert(doc, officeMode)) void convertDoc(doc.id).catch(() => {});
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload reader doc' });
  }
});

/** מצרף לעזר קיים גרסת PDF שהומרה ידנית (מצב 'pdf'). */
router.post('/api/reader/docs/:id/pdf', rawBody, async (req, res) => {
  try {
    const id = intOf(req.params.id);
    const buf = uploadedBytes(req);
    if (!buf) return res.status(400).json({ error: 'file required' });
    if (!buf.length) return res.status(400).json({ error: 'Empty file' });
    if (buf.length > MAX_DOC_BYTES) return res.status(413).json({ error: 'File too large' });

    const { rows } = await pool.query(
      `UPDATE reader_docs SET pdf_data=$1, converted_at=NOW(), convert_error='', updated_at=NOW()
       WHERE id=$2 RETURNING ${META_COLS}`, [buf, id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(shapeDoc(rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'Failed to attach pdf' });
  }
});

router.delete('/api/reader/docs/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM reader_docs WHERE id=$1`, [intOf(req.params.id)]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete reader doc' });
  }
});

/** בתי הקובץ. `?pdf=1` מחזיר את גרסת ה-PDF שהומרה. */
router.get('/api/reader/docs/:id/file', async (req, res) => {
  try {
    const wantPdf = req.query.pdf === '1';
    const col = wantPdf ? 'pdf_data' : 'data';
    const { rows } = await pool.query(
      `SELECT ${col} AS bytes, file_name, mime FROM reader_docs WHERE id=$1`, [intOf(req.params.id)],
    );
    const row = rows[0];
    if (!row || !row.bytes) return res.status(404).json({ error: 'No content' });
    res.setHeader('Content-Type', wantPdf ? 'application/pdf' : (row.mime || 'application/octet-stream'));
    // inline ולא attachment: החלון פורס את הקובץ, לא מוריד אותו לעמדה
    res.setHeader('Content-Disposition', 'inline');
    res.send(row.bytes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read file' });
  }
});

/**
 * מושך את הכתובת של העזר דרך השרת (CORS). ראה ההסבר בראש הקובץ: הכתובת
 * מגיעה מהשורה ולא מהלקוח, ולכן אין כאן וקטור SSRF פתוח.
 */
router.get('/api/reader/docs/:id/proxy', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT url, mime FROM reader_docs WHERE id=$1`, [intOf(req.params.id)]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (!isFetchableUrl(row.url)) return res.status(409).json({ error: 'Url is not fetchable' });

    const upstream = await fetchUrl(row.url);
    if (!upstream.ok) return res.status(502).json({ error: `Upstream ${upstream.status}` });
    res.setHeader('Content-Type', upstream.mime || row.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.send(upstream.buf);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch source' });
  }
});

/** המרה בשרת (LibreOffice). נשמרת, ולכן רצה פעם אחת לכל עזר. */
router.post('/api/reader/docs/:id/convert', async (req, res) => {
  try {
    const out = await convertDoc(intOf(req.params.id));
    if (!out.ok) return res.status(422).json({ error: out.error });
    res.json(shapeDoc(out.doc));
  } catch (err) {
    res.status(500).json({ error: 'Failed to convert' });
  }
});

// ── סימניות - אישיות לאיש הצוות ────────────────────────────────────────────

router.get('/api/reader/bookmarks/:docId', async (req, res) => {
  try {
    const owner = ownerOf(req);
    if (!owner) return res.json([]);
    const { rows } = await pool.query(
      `SELECT * FROM reader_bookmarks WHERE doc_id=$1 AND owner_pid=$2
       ORDER BY page_no, sort_order, id`,
      [intOf(req.params.docId), owner],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list bookmarks' });
  }
});

router.post('/api/reader/bookmarks', async (req, res) => {
  try {
    const owner = ownerOf(req);
    if (!owner) return res.status(403).json({ error: 'No personal identity' });
    const { rows } = await pool.query(
      `INSERT INTO reader_bookmarks (doc_id, owner_pid, crew_member_id, page_no, label, note, color, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [intOf(req.body?.docId), owner, crewIdOf(req), Math.max(0, intOf(req.body?.pageNo, 1)),
        clip(req.body?.label, 200), String(req.body?.note ?? ''), clip(req.body?.color, 20),
        intOf(req.body?.sortOrder)],
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create bookmark' });
  }
});

// העדכון והמחיקה מסננים גם על הבעלים (owner_pid): מזהה של סימנייה של מישהו אחר
// לא ייגע בה, גם אם נשלח במפורש.
router.put('/api/reader/bookmarks/:id', async (req, res) => {
  try {
    const owner = ownerOf(req);
    if (!owner) return res.status(403).json({ error: 'No personal identity' });
    const { rows } = await pool.query(
      `UPDATE reader_bookmarks SET page_no=$1, label=$2, note=$3, color=$4, sort_order=$5, updated_at=NOW()
       WHERE id=$6 AND owner_pid=$7 RETURNING *`,
      [Math.max(0, intOf(req.body?.pageNo, 1)), clip(req.body?.label, 200), String(req.body?.note ?? ''),
        clip(req.body?.color, 20), intOf(req.body?.sortOrder), intOf(req.params.id), owner],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update bookmark' });
  }
});

router.delete('/api/reader/bookmarks/:id', async (req, res) => {
  try {
    const owner = ownerOf(req);
    if (!owner) return res.status(403).json({ error: 'No personal identity' });
    await pool.query(`DELETE FROM reader_bookmarks WHERE id=$1 AND owner_pid=$2`, [intOf(req.params.id), owner]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete bookmark' });
  }
});

// ── קריאה מהירה - המדף האישי בסרגל התחתון ──────────────────────────────────

router.get('/api/reader/quick', async (req, res) => {
  try {
    const owner = ownerOf(req);
    if (!owner) return res.json([]);
    // `id` הוא של המסמך (לא של שורת המדף) - הלקוח מזהה עזר לפי מזהה המסמך
    const { rows } = await pool.query(
      `SELECT ${metaCols('d')}, q.sort_order AS quick_sort
       FROM reader_quick_items q JOIN reader_docs d ON d.id = q.doc_id
       WHERE q.owner_pid=$1 ORDER BY q.sort_order, q.id`,
      [owner],
    );
    res.json(rows.map(shapeDoc));
  } catch (err) {
    res.status(500).json({ error: 'Failed to list quick items' });
  }
});

router.post('/api/reader/quick', async (req, res) => {
  try {
    const owner = ownerOf(req);
    if (!owner) return res.status(403).json({ error: 'No personal identity' });
    const { rows } = await pool.query(
      `INSERT INTO reader_quick_items (owner_pid, crew_member_id, doc_id, sort_order)
       VALUES ($1,$2,$3,$4) ON CONFLICT (owner_pid, doc_id) DO UPDATE SET sort_order = EXCLUDED.sort_order
       RETURNING *`,
      [owner, crewIdOf(req), intOf(req.body?.docId), intOf(req.body?.sortOrder)],
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add quick item' });
  }
});

router.delete('/api/reader/quick/:docId', async (req, res) => {
  try {
    const owner = ownerOf(req);
    if (!owner) return res.status(403).json({ error: 'No personal identity' });
    await pool.query(`DELETE FROM reader_quick_items WHERE owner_pid=$1 AND doc_id=$2`,
      [owner, intOf(req.params.docId)]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove quick item' });
  }
});

// ── המרה ל-PDF (LibreOffice headless) ──────────────────────────────────────

// מאותרת פעם אחת ונשמרת: `soffice` אינו קיים ברוב ההתקנות, ובדיקה בכל בקשה
// הייתה מייצרת spawn כושל על כל פתיחת מצגת.
let sofficeCache = null;
const SOFFICE_CANDIDATES = process.platform === 'win32'
  ? ['soffice.com', 'soffice.exe', 'C:/Program Files/LibreOffice/program/soffice.exe']
  : ['soffice', 'libreoffice', '/usr/bin/soffice'];

function runProcess(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true });
    } catch (err) {
      return resolve({ code: -1, err: String(err?.message || err) });
    }
    let stderr = '';
    const timer = setTimeout(() => { try { child.kill(); } catch { /* כבר מת */ } }, timeoutMs);
    child.stderr?.on('data', d => { stderr += String(d).slice(0, 500); });
    child.on('error', err => { clearTimeout(timer); resolve({ code: -1, err: String(err?.message || err) }); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, err: stderr }); });
  });
}

export async function sofficeAvailable() {
  if (sofficeCache !== null) return !!sofficeCache;
  for (const cmd of SOFFICE_CANDIDATES) {
    const r = await runProcess(cmd, ['--version'], 15000);
    if (r.code === 0) { sofficeCache = cmd; return true; }
  }
  sofficeCache = '';
  return false;
}

async function fetchUrl(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    if (!r.ok) return { ok: false, status: r.status };
    const ab = await r.arrayBuffer();
    if (ab.byteLength > MAX_FETCH_BYTES) return { ok: false, status: 413 };
    return { ok: true, buf: Buffer.from(ab), mime: r.headers.get('content-type') || '' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ממיר עזר ל-PDF ושומר את התוצר. מחזיר `{ok, doc}` או `{ok:false, error}`.
 * הכישלון נרשם על השורה (`convert_error`) כדי שהעמדה תציג סיבה ולא "טוען..."
 * לנצח, וכדי שהמנהל יראה אותה במסך הניהול.
 */
/** המרות שרצות עכשיו, לפי מזהה מסמך - שתי עמדות שפותחות יחד מצטרפות לאחת. */
const convertsInFlight = new Map();

function convertDoc(id) {
  if (convertsInFlight.has(id)) return convertsInFlight.get(id);
  const p = convertDocOnce(id).finally(() => convertsInFlight.delete(id));
  convertsInFlight.set(id, p);
  return p;
}

async function convertDocOnce(id) {
  const { rows } = await pool.query(`SELECT id, url, data, file_name, ext FROM reader_docs WHERE id=$1`, [id]);
  const row = rows[0];
  if (!row) return { ok: false, error: 'not-found' };

  if (!await sofficeAvailable()) {
    await noteConvertError(id, 'LibreOffice (soffice) לא נמצא על השרת');
    return { ok: false, error: 'soffice-missing' };
  }

  let bytes = row.data;
  if (!bytes && isFetchableUrl(row.url)) {
    const got = await fetchUrl(row.url).catch(() => ({ ok: false }));
    if (!got.ok) { await noteConvertError(id, 'משיכת הקובץ מהכתובת נכשלה'); return { ok: false, error: 'fetch-failed' }; }
    bytes = got.buf;
  }
  if (!bytes) { await noteConvertError(id, 'אין קובץ להמרה'); return { ok: false, error: 'no-bytes' }; }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skyking-reader-'));
  try {
    const ext = row.ext || docExtOf(row.file_name || row.url) || 'bin';
    const src = path.join(dir, `doc.${ext}`);
    await fs.writeFile(src, bytes);
    // פרופיל משתמש נפרד לכל המרה: שני תהליכי soffice עם אותו פרופיל נועלים זה
    // את זה, והשני נכשל בשקט. גם HOME של המשתמש בקונטיינר אינו מובטח כתיב.
    const profile = pathToFileURL(path.join(dir, 'profile')).href;
    const r = await runProcess(sofficeCache, [`-env:UserInstallation=${profile}`, '--headless', '--convert-to', 'pdf', '--outdir', dir, src], CONVERT_TIMEOUT_MS);
    const outPath = path.join(dir, 'doc.pdf');
    const pdf = await fs.readFile(outPath).catch(() => null);
    if (!pdf) {
      await noteConvertError(id, `ההמרה נכשלה (${r.code}) ${String(r.err || '').slice(0, 200)}`);
      return { ok: false, error: 'convert-failed' };
    }
    const saved = await pool.query(
      `UPDATE reader_docs SET pdf_data=$1, converted_at=NOW(), convert_error='', updated_at=NOW()
       WHERE id=$2 RETURNING ${META_COLS}`, [pdf, id],
    );
    return { ok: true, doc: saved.rows[0] };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function noteConvertError(id, message) {
  await pool.query(`UPDATE reader_docs SET convert_error=$1, updated_at=NOW() WHERE id=$2`,
    [String(message).slice(0, 500), id]).catch(() => {});
}

export default router;
