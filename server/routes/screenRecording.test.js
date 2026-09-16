// הקלטת מסך מהדפדפן - העמדה שולחת נתחים לשרת, והשרת כותב ל-PATH של הבסיס.
// אפיון: SCREEN_RECORDING_SPEC.md §7
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

let pool, server, base, dir;

const post = (p, body, headers) => fetch(`${base}${p}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const postBytes = (p, bytes) => fetch(`${base}${p}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/octet-stream' },
  body: bytes,
});

const openSession = async (over = {}) => {
  const res = await post('/api/screen-recording/sessions', {
    base_id: 11, preset_name: 'מרחבי 305', ext: 'webm', ...over,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('../db/pool.js'));
  const { default: router } = await import('./screenRecording.js');
  const { listen } = await import('../listen.js');

  await pool.query(`CREATE TABLE aviation_bases (
    id SERIAL PRIMARY KEY, name VARCHAR(100), code VARCHAR(20),
    recording_enabled BOOLEAN DEFAULT FALSE, recording_path TEXT,
    recording_segment_minutes INTEGER DEFAULT 15, recording_retention_days INTEGER DEFAULT 7,
    recording_fps INTEGER DEFAULT 5, recording_quality VARCHAR(10) DEFAULT 'medium')`);

  const app = express();
  app.use(express.json());
  app.use(router);
  server = await listen(app, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

afterAll(async () => {
  await new Promise(r => server?.close(r));
});

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyrec-srv-'));
  await pool.query('DELETE FROM aviation_bases');
  await pool.query(
    `INSERT INTO aviation_bases (id, name, recording_enabled, recording_path) VALUES (11, 'בח"א 8', TRUE, $1)`,
    [dir],
  );
});

describe('פתיחת מקטע הקלטה', () => {
  it('מחזירה מזהה מקטע ופרמטרי קידוד, ופותחת קובץ בנתיב של הבסיס', async () => {
    const { status, body } = await openSession();
    expect(status).toBe(200);
    expect(body.session_id).toBeTruthy();
    expect(body.file).toMatch(/^SKYKING_בחא-8_מרחבי-305_/);
    expect(body).toMatchObject({ fps: 5, segmentMs: 15 * 60_000 });
    expect(fs.existsSync(path.join(dir, body.file))).toBe(true);
  });

  it('שם הבסיס בשם הקובץ מגיע מה-DB ולא מהבקשה', async () => {
    const { body } = await openSession({ base_name: 'נסיון-להחליף-שם' });
    expect(body.file).toContain('בחא-8');
    expect(body.file).not.toContain('נסיון');
  });

  it('דוחה בסיס שאינו קיים', async () => {
    const { status, body } = await openSession({ base_id: 999 });
    expect(status).toBe(404);
    expect(body.error).toBe('base_not_found');
  });

  it('דוחה בסיס בלי נתיב, עם הסיבה', async () => {
    await pool.query('UPDATE aviation_bases SET recording_path=NULL WHERE id=11');
    const { status, body } = await openSession();
    expect(status).toBe(409);
    expect(body.error).toBe('noPath');
  });

  it('דוחה כשההקלטה כבויה לבסיס - אלא אם זו הקלטה ידנית', async () => {
    await pool.query('UPDATE aviation_bases SET recording_enabled=FALSE WHERE id=11');
    expect((await openSession()).body.error).toBe('disabled');
    expect((await openSession({ manual: true })).status).toBe(200);
  });

  it('דוחה נתיב פסול שנשמר ב-DB', async () => {
    await pool.query(`UPDATE aviation_bases SET recording_path='rec\\video' WHERE id=11`);
    expect((await openSession()).body.error).toBe('badPath');
  });
});

describe('נתחים', () => {
  it('נכתבים לקובץ בסדר שבו נשלחו', async () => {
    const { body } = await openSession();
    expect((await postBytes(`/api/screen-recording/sessions/${body.session_id}/chunk`, new Uint8Array([1, 2]))).status).toBe(200);
    await postBytes(`/api/screen-recording/sessions/${body.session_id}/chunk`, new Uint8Array([3]));
    await post(`/api/screen-recording/sessions/${body.session_id}/stop`);
    expect([...fs.readFileSync(path.join(dir, body.file))]).toEqual([1, 2, 3]);
  });

  it('מקטע שאינו מוכר מוחזר 404 ולא יוצר קובץ', async () => {
    const res = await postBytes('/api/screen-recording/sessions/לא-קיים/chunk', new Uint8Array([1]));
    expect(res.status).toBe(404);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('אחרי עצירה הנתחים לא נכתבים עוד', async () => {
    const { body } = await openSession();
    await post(`/api/screen-recording/sessions/${body.session_id}/stop`);
    expect((await postBytes(`/api/screen-recording/sessions/${body.session_id}/chunk`, new Uint8Array([9]))).status).toBe(404);
  });
});

describe('החלפת קטע ושמירה', () => {
  it('החלפה סוגרת קובץ ופותחת חדש - שניהם נשארים', async () => {
    const { body } = await openSession();
    await postBytes(`/api/screen-recording/sessions/${body.session_id}/chunk`, new Uint8Array([1]));
    const rot = await post(`/api/screen-recording/sessions/${body.session_id}/rotate`).then(r => r.json());
    expect(rot.file).not.toBe(body.file);
    await postBytes(`/api/screen-recording/sessions/${body.session_id}/chunk`, new Uint8Array([2]));
    await post(`/api/screen-recording/sessions/${body.session_id}/stop`);
    expect(fs.existsSync(path.join(dir, body.file))).toBe(true);
    expect([...fs.readFileSync(path.join(dir, rot.file))]).toEqual([2]);
  });

  it('"שמור את הקטע הזה" מעביר ל-keep ולא משאיר את הקובץ במקומו', async () => {
    const { body } = await openSession();
    await postBytes(`/api/screen-recording/sessions/${body.session_id}/chunk`, new Uint8Array([7]));
    expect((await post(`/api/screen-recording/sessions/${body.session_id}/keep`).then(r => r.json())).ok).toBe(true);
    await post(`/api/screen-recording/sessions/${body.session_id}/stop`);
    expect(fs.existsSync(path.join(dir, 'keep', body.file))).toBe(true);
    expect(fs.existsSync(path.join(dir, body.file))).toBe(false);
  });
});

describe('עמדה שנעלמה בלי לעצור', () => {
  it('פתיחת מקטע חדש לאותה עמדה סוגרת את הקודם - לא נשארים שני קבצים פתוחים', async () => {
    const first = await openSession();
    await postBytes(`/api/screen-recording/sessions/${first.body.session_id}/chunk`, new Uint8Array([1]));
    const second = await openSession();
    expect(second.body.session_id).not.toBe(first.body.session_id);
    // המקטע הראשון נסגר, ולכן נתח אליו כבר לא נכתב
    expect((await postBytes(`/api/screen-recording/sessions/${first.body.session_id}/chunk`, new Uint8Array([2]))).status).toBe(404);
    await post(`/api/screen-recording/sessions/${second.body.session_id}/stop`);
    expect([...fs.readFileSync(path.join(dir, first.body.file))]).toEqual([1]);
  });
});

describe('מחיקה לפי תקופת שמירה', () => {
  it('רצה בפתיחת מקטע, ולא נוגעת בקובץ שאינו שלנו', async () => {
    const old = 'SKYKING_בחא-8_x_2020-01-01_100000.webm';
    fs.writeFileSync(path.join(dir, old), 'x');
    fs.writeFileSync(path.join(dir, 'תחקיר-של-מישהו.mp4'), 'x');
    await openSession();
    await vi.waitFor(() => expect(fs.existsSync(path.join(dir, old))).toBe(false));
    expect(fs.existsSync(path.join(dir, 'תחקיר-של-מישהו.mp4'))).toBe(true);
  });
});
