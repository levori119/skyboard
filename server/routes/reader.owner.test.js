// חלון קריאה - של מי הסימניות, וכמה גדול יכול להיות קובץ.
//
// שני באגים שנתפסו בשימוש (2026-10-11):
//   1. **"לא מצליח לשמור בוקמארק".** הבעלות נקבעה לפי `crewMemberId` מהאסימון,
//      אבל משתמש מיראז' שאין לו שורה ב-`crew_members` נכנס עם `crewMemberId:
//      null` - והשרת דחה כל סימנייה שלו ב-403, בשקט. הזהות שקיימת **תמיד**
//      למשתמש היא המספר האישי (`personalId`), ולכן הבעלות עוברת אליו.
//   2. **"לא להגביל גודל קובץ".** הקובץ עלה כ-base64 בתוך JSON, שחסום ב-50MB
//      ומנפח פי 1.33. ההעלאה עוברת לבתים גולמיים, והתקרה היחידה היא של
//      PostgreSQL עצמו (1GB לשדה BYTEA).
//
// ה-pool מדומה: מה שנבדק הוא **מה השרת שולח ל-DB** (בעלים, בתים) - לא ה-DB.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import { createServer } from 'http';

const calls = [];
vi.mock('../db/pool.js', () => ({
  default: {
    query: async (sql, params = []) => {
      calls.push({ sql: String(sql), params });
      if (/FROM system_defaults/.test(sql)) return { rows: [] };
      if (/INSERT INTO reader_docs/.test(sql)) {
        return { rows: [{ id: 9, name: params[0], source_kind: 'file', url: '', url_key: '', file_name: params[1], ext: params[2], mime: params[3], byte_size: params[4], has_file: true, has_pdf: false, convert_error: '' }] };
      }
      if (/UPDATE reader_docs SET pdf_data/.test(sql)) return { rows: [{ id: 9, name: 'x', has_file: true, has_pdf: true, convert_error: '' }] };
      if (/INSERT INTO reader_bookmarks/.test(sql)) return { rows: [{ id: 1 }] };
      if (/UPDATE reader_bookmarks/.test(sql)) return { rows: [{ id: 1 }] };
      if (/INSERT INTO reader_quick_items/.test(sql)) return { rows: [{ id: 1 }] };
      return { rows: [] };
    },
  },
}));

let srv, base, currentUser;

beforeAll(async () => {
  const { default: readerRouter } = await import('./reader.js');
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use((req, _res, next) => { req.user = currentUser; next(); });
  app.use(readerRouter);
  await new Promise(ok => { srv = createServer(app).listen(0, '127.0.0.1', ok); });
  base = `http://127.0.0.1:${srv.address().port}`;
});
afterAll(() => new Promise(ok => srv.close(ok)));
beforeEach(() => { calls.length = 0; });

const json = (method, path, body) => fetch(`${base}${path}`, {
  method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
});
const lastSql = (re) => calls.filter(c => re.test(c.sql)).pop();

// משתמש מיראז' בלי שורה ב-crew_members - בדיוק מי שלא הצליח לשמור
const MIRAGE_ONLY = { crewMemberId: null, personalId: '5551234', name: 'פקח' };
const CREW = { crewMemberId: 42, personalId: '7770001', name: 'בקר' };

describe('סימניות - הבעלות לפי המספר האישי', () => {
  it('משתמש מיראז\' בלי crew_members שומר סימנייה (היה 403 בשקט)', async () => {
    currentUser = MIRAGE_ONLY;
    const r = await json('POST', '/api/reader/bookmarks', { docId: 3, pageNo: 4, label: 'נוהל' });
    expect(r.status).toBe(200);
    const ins = lastSql(/INSERT INTO reader_bookmarks/);
    expect(ins.sql).toMatch(/owner_pid/);
    expect(ins.params).toContain('5551234');
    expect(ins.params).toContain(null);   // crew_member_id ריק ולא מומצא
  });

  it('איש צוות רשום - נשמרים גם המספר האישי וגם המזהה', async () => {
    currentUser = CREW;
    await json('POST', '/api/reader/bookmarks', { docId: 3, pageNo: 1, label: 'א' });
    const ins = lastSql(/INSERT INTO reader_bookmarks/);
    expect(ins.params).toContain('7770001');
    expect(ins.params).toContain(42);
  });

  it('רשימה, עדכון ומחיקה מסננים על המספר האישי', async () => {
    currentUser = MIRAGE_ONLY;
    await json('GET', '/api/reader/bookmarks/3');
    await json('PUT', '/api/reader/bookmarks/1', { pageNo: 2, label: 'ב' });
    await json('DELETE', '/api/reader/bookmarks/1');
    for (const re of [/SELECT \* FROM reader_bookmarks/, /UPDATE reader_bookmarks/, /DELETE FROM reader_bookmarks/]) {
      const c = lastSql(re);
      expect(c.sql).toMatch(/owner_pid\s*=/);
      expect(c.params).toContain('5551234');
    }
  });

  it('בלי מספר אישי (אסימון עמדה/שירות) - אין סימניות', async () => {
    currentUser = { crewMemberId: null, personalId: null, name: 'station:x' };
    expect((await json('POST', '/api/reader/bookmarks', { docId: 3 })).status).toBe(403);
    expect(lastSql(/INSERT INTO reader_bookmarks/)).toBeUndefined();
  });

  it('גם המדף האישי (קריאה מהירה) עובד למשתמש מיראז\'', async () => {
    currentUser = MIRAGE_ONLY;
    expect((await json('POST', '/api/reader/quick', { docId: 3 })).status).toBe(200);
    const ins = lastSql(/INSERT INTO reader_quick_items/);
    expect(ins.sql).toMatch(/ON CONFLICT \(owner_pid, doc_id\)/);
    expect(ins.params).toContain('5551234');
  });
});

describe('העלאת קובץ - בלי מגבלת גודל של המערכת', () => {
  it('בתים גולמיים: קובץ של 60MB עולה (מעל תקרת ה-JSON של 50MB)', async () => {
    currentUser = CREW;
    const buf = Buffer.alloc(60 * 1024 * 1024, 7);
    const r = await fetch(`${base}/api/reader/docs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent('נוהל שדה.pdf'),
        'X-File-Mime': 'application/pdf',
        'X-Doc-Name': encodeURIComponent('נוהל שדה'),
      },
      body: buf,
    });
    expect(r.status).toBe(200);
    const ins = lastSql(/INSERT INTO reader_docs/);
    expect(ins.params).toContain('נוהל שדה.pdf');
    expect(ins.params).toContain('נוהל שדה');
    const data = ins.params.find(p => Buffer.isBuffer(p));
    expect(data.length).toBe(buf.length);
  }, 60000);

  it('גרסת PDF מצורפת - גם היא בבתים גולמיים', async () => {
    currentUser = CREW;
    const buf = Buffer.alloc(1024, 1);
    const r = await fetch(`${base}/api/reader/docs/9/pdf`, {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buf,
    });
    expect(r.status).toBe(200);
    expect(lastSql(/UPDATE reader_docs SET pdf_data/).params[0].length).toBe(1024);
  });

  it('תאימות לאחור: base64 בתוך JSON עדיין עובד', async () => {
    currentUser = CREW;
    const r = await json('POST', '/api/reader/docs', { name: 'a', fileName: 'a.pdf', mime: 'application/pdf', dataBase64: Buffer.from('%PDF').toString('base64') });
    expect(r.status).toBe(200);
  });

  it('קובץ ריק נדחה', async () => {
    currentUser = CREW;
    const r = await fetch(`${base}/api/reader/docs`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: Buffer.alloc(0) });
    expect(r.status).toBe(400);
  });
});

describe('PUT /api/reader/config - עדכון חלקי', () => {
  // ההגדרה מוצגת בשני מסכים: "הגדרות כלליות" (איפה נפתח עזר בלבד) ו"חומר
  // קריאה" (שתיהן). שמירה ממסך אחד אסור שתדרוס את ההגדרה שהוא לא מציג.
  it('רק openMode נשלח - officeMode לא נכתב', async () => {
    currentUser = CREW;
    const r = await json('PUT', '/api/reader/config', { openMode: 'window' });
    expect(r.status).toBe(200);
    const writes = calls.filter(c => /INSERT INTO system_defaults/.test(c.sql));
    expect(writes.map(w => w.params[0])).toEqual(['readerOpenMode']);
    expect(writes[0].params[1]).toBe('window');
  });
  it('שתיהן נשלחות - שתיהן נכתבות', async () => {
    currentUser = CREW;
    await json('PUT', '/api/reader/config', { openMode: 'external', officeMode: 'server' });
    expect(calls.filter(c => /INSERT INTO system_defaults/.test(c.sql)).map(w => w.params[0]).sort())
      .toEqual(['readerOfficeMode', 'readerOpenMode']);
  });
});
