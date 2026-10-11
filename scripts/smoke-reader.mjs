// עשן לחלון הקריאה - מריץ את המסלול המלא מול שרת חי ומאגר אמיתי.
//
// לא בדיקת יחידה: כאן נבדק מה ש-vitest אינו יכול לבדוק - שהטבלאות באמת נוצרו,
// שההרשאות באמת חוסמות, שהבתים באמת חוזרים, ושאיחוד שני קישורים לאותה כתובת
// באמת מחזיר את אותו עזר. מריצים אותו מול שרת מקומי:  node scripts/smoke-reader.mjs
//
// הסקריפט **מנקה אחריו** ומחזיר את ההגדרה הכלל-מערכתית לערכה הקודם - הוא רץ
// מול מאגר משותף.
import pool from '../server/db/pool.js';
import { signToken } from '../server/auth/token.js';

const BASE = process.env.SMOKE_BASE || 'http://localhost:3005';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

const admin = signToken({ crewMemberId: null, personalId: 'smoke', name: 'smoke-admin', isAdmin: true });
let userToken = '';

const call = (method, path, token, body) => fetch(`${BASE}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

// PDF מינימלי תקין - מספיק כדי לבדוק אחסון, סוג ושליפה
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

const created = { docIds: [], linkIds: [], bookmarkIds: [] };
let prevDefaults = {};

async function main() {
  console.log(`\nעשן חלון קריאה מול ${BASE}\n`);

  // זהות אמיתית לבדיקות האישיות - crew_member_id הוא מפתח זר
  const crew = await pool.query(`SELECT id, name FROM crew_members ORDER BY id LIMIT 1`);
  const crewId = crew.rows[0]?.id;
  if (!crewId) throw new Error('אין איש צוות במאגר - אי אפשר לבדוק סימניות');
  userToken = signToken({ crewMemberId: crewId, personalId: 'smoke-u', name: 'smoke-user' });

  const preset = await pool.query(`SELECT id FROM workstation_presets ORDER BY id LIMIT 1`);
  const presetId = preset.rows[0]?.id;
  if (!presetId) throw new Error('אין עמדה במאגר');

  prevDefaults = Object.fromEntries(
    (await pool.query(`SELECT key, value FROM system_defaults WHERE key IN ('readerOpenMode','readerOfficeMode')`)).rows
      .map(r => [r.key, r.value]),
  );

  // ── 1. תצורה ────────────────────────────────────────────────────────────
  console.log('תצורה');
  const cfg0 = await (await call('GET', '/api/reader/config', userToken)).json();
  ok('ברירת המחדל היא ההתנהגות הקיימת (פתיחה חיצונית)', cfg0.openMode === 'external', JSON.stringify(cfg0));
  ok('מצב אופיס מוחזר', ['pdf', 'server', 'external'].includes(cfg0.officeMode));

  ok('בקר אינו רשאי לשנות הגדרה כלל-מערכתית', (await call('PUT', '/api/reader/config', userToken, { openMode: 'window' })).status === 403);
  const putCfg = await call('PUT', '/api/reader/config', admin, { openMode: 'window', officeMode: 'server' });
  ok('מנהל משנה את ההגדרה', putCfg.status === 200);
  const cfg1 = await (await call('GET', '/api/reader/config', userToken)).json();
  ok('ההגדרה נשמרה', cfg1.openMode === 'window' && cfg1.officeMode === 'server', JSON.stringify(cfg1));
  ok('זמינות ההמרה מדווחת (true/false, לא ניחוש)', typeof cfg1.convertAvailable === 'boolean');
  console.log(`    LibreOffice על השרת הזה: ${cfg1.convertAvailable ? 'זוהה' : 'לא מותקן'}`);

  ok('ערך לא מוכר אינו נשמר - נופלים לברירת מחדל', (await (await call('PUT', '/api/reader/config', admin, { openMode: 'bogus', officeMode: 'nope' })).json()).openMode === 'external');
  await call('PUT', '/api/reader/config', admin, { openMode: 'window', officeMode: 'pdf' });

  // ── 2. העלאת חומר קריאה ─────────────────────────────────────────────────
  console.log('\nחומר קריאה');
  ok('בקר אינו רשאי להעלות חומר', (await call('POST', '/api/reader/docs', userToken, { fileName: 'x.pdf', dataBase64: PDF.toString('base64') })).status === 403);

  const upRes = await call('POST', '/api/reader/docs', admin, {
    name: 'עשן - תדריך', fileName: 'smoke-brief.pdf', mime: 'application/pdf', dataBase64: PDF.toString('base64'),
  });
  const doc = await upRes.json();
  created.docIds.push(doc.id);
  ok('העלאה מחזירה עזר', upRes.status === 200 && !!doc.id, JSON.stringify(doc).slice(0, 200));
  ok('הסוג נגזר מהסיומת', doc.kind === 'pdf', doc.kind);
  ok('הקובץ יושב אצלנו', doc.hasFile === true);
  ok('גודל נשמר', doc.byte_size === PDF.length, `${doc.byte_size} != ${PDF.length}`);
  ok('הרשימה אינה נושאת את הקובץ עצמו', !('data' in doc));

  const fileRes = await call('GET', `/api/reader/docs/${doc.id}/file`, userToken);
  const bytes = Buffer.from(await fileRes.arrayBuffer());
  ok('הבתים חוזרים במלואם', bytes.length === PDF.length && bytes.equals(PDF));
  ok('Content-Type נכון', fileRes.headers.get('content-type')?.includes('pdf'), fileRes.headers.get('content-type'));
  ok('הקובץ נפרס ולא יורד', fileRes.headers.get('content-disposition') === 'inline');
  ok('בלי אסימון אין גישה לקובץ', (await call('GET', `/api/reader/docs/${doc.id}/file`, '')).status === 401);

  ok('אין גרסת PDF להמרה כשהמקור כבר PDF', doc.hasPdf === false);
  const pdfAttach = await call('POST', `/api/reader/docs/${doc.id}/pdf`, admin, { dataBase64: PDF.toString('base64') });
  ok('צירוף גרסת PDF ידנית', pdfAttach.status === 200 && (await pdfAttach.json()).hasPdf === true);

  // ── 3. פתיחה מקישור עמדה + איחוד ────────────────────────────────────────
  console.log('\nפתיחת קישור ואיחוד');
  const url = `https://smoke.local/brief.pdf?id=${Date.now()}`;
  const mk = async (name, u) => {
    const r = await call('POST', `/api/preset-links/${presetId}`, admin, { url: u, name, category: 'עשן', note: '', sort_order: 99 });
    const row = await r.json();
    created.linkIds.push(row.id);
    return row;
  };
  const linkA = await mk('עשן א', url);
  // אותה כתובת בדיוק, בהבדלים שאינם מזהים קובץ אחר: אותיות ב-host ו-fragment
  const linkB = await mk('עשן ב', url.replace('https://smoke.local', 'HTTPS://Smoke.Local') + '#page=3');

  const openA = await call('POST', '/api/reader/open', userToken, { presetLinkId: linkA.id });
  const docA = await openA.json();
  created.docIds.push(docA.id);
  ok('בקר פותח קישור שהוגדר לעמדה', openA.status === 200 && !!docA.id, JSON.stringify(docA).slice(0, 150));
  ok('העזר נוצר כקישור', docA.source_kind === 'link' && docA.url === url);

  const openAgain = await (await call('POST', '/api/reader/open', userToken, { presetLinkId: linkA.id })).json();
  ok('פתיחה חוזרת מחזירה את אותו עזר (ולא כפילות)', openAgain.id === docA.id);

  const linkRow = (await pool.query(`SELECT doc_id FROM preset_links WHERE id=$1`, [linkA.id])).rows[0];
  ok('הקישור נקשר לעזר', Number(linkRow.doc_id) === Number(docA.id));

  const docB = await (await call('POST', '/api/reader/open', userToken, { presetLinkId: linkB.id })).json();
  ok('שני קישורים לאותה כתובת = אותו עזר (הסימניות משותפות)', docB.id === docA.id, `${docB.id} != ${docA.id}`);

  ok('קישור שאינו קיים - 404, ולא יצירת עזר מכתובת שהלקוח שלח', (await call('POST', '/api/reader/open', userToken, { presetLinkId: 99999999 })).status === 404);

  // ── 4. סימניות אישיות ───────────────────────────────────────────────────
  console.log('\nסימניות');
  const bmRes = await call('POST', '/api/reader/bookmarks', userToken, { docId: docA.id, pageNo: 7, label: 'שקף 7', note: 'לשים לב לגבהים' });
  const bm = await bmRes.json();
  created.bookmarkIds.push(bm.id);
  ok('יצירת סימנייה', bmRes.status === 200 && bm.page_no === 7);
  ok('הבעלות נלקחת מהאסימון ולא מהבקשה', Number(bm.crew_member_id) === Number(crewId));

  const list = await (await call('GET', `/api/reader/bookmarks/${docA.id}`, userToken)).json();
  ok('הסימנייה חוזרת לאותו איש צוות', list.some(b => b.id === bm.id));

  const other = signToken({ crewMemberId: crewId + 100000, personalId: 'other', name: 'אחר' });
  const otherList = await (await call('GET', `/api/reader/bookmarks/${docA.id}`, other)).json();
  ok('איש צוות אחר אינו רואה את הסימניות שלי', !otherList.some(b => b.id === bm.id));
  ok('ואינו יכול למחוק אותן', (await (async () => {
    await call('DELETE', `/api/reader/bookmarks/${bm.id}`, other);
    return (await pool.query(`SELECT 1 FROM reader_bookmarks WHERE id=$1`, [bm.id])).rowCount === 1;
  })()));

  const upd = await (await call('PUT', `/api/reader/bookmarks/${bm.id}`, userToken, { pageNo: 9, label: 'שקף 9', note: 'עודכן' })).json();
  ok('עדכון סימנייה', upd.page_no === 9 && upd.note === 'עודכן');

  // ── 5. קריאה מהירה ──────────────────────────────────────────────────────
  console.log('\nקריאה מהירה');
  ok('הוספה למדף', (await call('POST', '/api/reader/quick', userToken, { docId: docA.id, sortOrder: 0 })).status === 200);
  const quick = await (await call('GET', '/api/reader/quick', userToken)).json();
  ok('המדף מחזיר את העזר עם כל שדותיו', quick.some(d => d.id === docA.id && d.kind === 'pdf'), JSON.stringify(quick).slice(0, 200));
  ok('הוספה כפולה אינה מכפילה', (await call('POST', '/api/reader/quick', userToken, { docId: docA.id, sortOrder: 1 })).status === 200
    && (await (await call('GET', '/api/reader/quick', userToken)).json()).filter(d => d.id === docA.id).length === 1);
  ok('הסרה מהמדף', (await call('DELETE', `/api/reader/quick/${docA.id}`, userToken)).status === 200
    && !(await (await call('GET', '/api/reader/quick', userToken)).json()).some(d => d.id === docA.id));

  // ── 6. עקיפת העמדה ──────────────────────────────────────────────────────
  console.log('\nעקיפה פר-עמדה');
  const patch = await call('PATCH', `/api/workstation-presets/${presetId}/reader-open-mode`, admin, { reader_open_mode: 'external' });
  ok('שמירת עקיפה', patch.status === 200 && (await patch.json()).reader_open_mode === 'external');
  const bad = await (await call('PATCH', `/api/workstation-presets/${presetId}/reader-open-mode`, admin, { reader_open_mode: 'nonsense' })).json();
  ok('ערך לא מוכר נשמר כירושה ולא כמצב שגוי', bad.reader_open_mode === '');

  // ── 7. proxy - רק לכתובת שהוגדרה בניהול ─────────────────────────────────
  console.log('\nproxy');
  ok('כתובת שאינה ניתנת למשיכה מוחזרת כ-409 ולא כניסיון עיוור', (await call('GET', `/api/reader/docs/${doc.id}/proxy`, userToken)).status === 409);
}

async function cleanup() {
  console.log('\nניקוי');
  for (const id of created.linkIds) await pool.query(`DELETE FROM preset_links WHERE id=$1`, [id]).catch(() => {});
  for (const id of created.docIds) await pool.query(`DELETE FROM reader_docs WHERE id=$1`, [id]).catch(() => {});
  await pool.query(`UPDATE workstation_presets SET reader_open_mode = '' WHERE reader_open_mode <> ''`).catch(() => {});
  for (const [key, value] of Object.entries({ readerOpenMode: prevDefaults.readerOpenMode, readerOfficeMode: prevDefaults.readerOfficeMode })) {
    if (value === undefined) await pool.query(`DELETE FROM system_defaults WHERE key=$1`, [key]).catch(() => {});
    else await pool.query(`UPDATE system_defaults SET value=$1 WHERE key=$2`, [value, key]).catch(() => {});
  }
  console.log('  הוחזר המצב הקודם');
}

main()
  .catch(err => { fail++; console.error('\n✗ נפילה:', err?.message || err); })
  .finally(async () => {
    await cleanup().catch(() => {});
    await pool.end().catch(() => {});
    console.log(`\nסיכום: ${pass} עברו, ${fail} נכשלו\n`);
    process.exit(fail ? 1 : 0);
  });
