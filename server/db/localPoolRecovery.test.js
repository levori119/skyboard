// המאגר המקומי שלא נפתח - העמדה חייבת לעלות בכל זאת.
//
// התקלה (2026-10-16): עמדה שנסגרה ב-`child.kill()` השאירה את תיקיית PGlite
// באמצע כתיבה. בעלייה הבאה `PGlite.create` נפל ב-`Aborted()`, initDb ניסה שוב
// ושוב, השרת המקומי לא הגיע ל-ready - ובנתק לא היה מאגר מקומי ולא העתק מיראז'.
//
// הפגיעה משוחזרת כאן כמו בשטח: `global/pg_control` נדרס, ו-PGlite קורס
// בדיוק באותה שגיאה.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLocalPool } from './localPool.js';

const tmpRoots = [];
function tmpDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skyking-localpool-'));
  tmpRoots.push(root);
  return path.join(root, 'local-db');
}

/** פוגע בתיקייה כמו הריגה באמצע כתיבה - PGlite קורס בפתיחה ב-Aborted() */
function corrupt(dir) {
  fs.writeFileSync(path.join(dir, 'global', 'pg_control'), Buffer.alloc(16));
}

const siblings = (dir, marker) => fs.readdirSync(path.dirname(dir))
  .filter(n => n.startsWith(path.basename(dir) + marker));

afterEach(() => {
  for (const r of tmpRoots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
});

describe('מאגר מקומי שנפגם - התאוששות בעלייה', () => {
  it('מאגר שנפגם ואין גיבוי: עולה ריק, והפגום מועבר הצידה ולא נמחק', async () => {
    const dir = tmpDir();
    const a = createLocalPool({ dataDir: dir });
    await a.query('CREATE TABLE t (v TEXT)');
    await a.end();
    corrupt(dir);

    const b = createLocalPool({ dataDir: dir });
    const r = await b.query('SELECT 1 AS ok');
    expect(r.rows[0].ok).toBe(1);
    expect(b.recovery()).toMatchObject({ recovered: true, from: 'fresh' });
    expect(siblings(dir, '.corrupt-')).toHaveLength(1);
    await b.end();
  }, 120_000);

  it('מאגר שנפגם ויש גיבוי: משוחזר מהגיבוי האחרון, כולל הנתונים', async () => {
    const dir = tmpDir();
    const a = createLocalPool({ dataDir: dir });
    await a.query('CREATE TABLE mirage_users (pn TEXT)');
    await a.query(`INSERT INTO mirage_users VALUES ('1234567')`);
    const bk = await a.backup();
    expect(bk.ok).toBe(true);
    await a.end();
    corrupt(dir);

    const b = createLocalPool({ dataDir: dir });
    const r = await b.query('SELECT pn FROM mirage_users');
    expect(r.rows.map(x => x.pn)).toEqual(['1234567']);
    expect(b.recovery()).toMatchObject({ recovered: true, from: 'backup' });
    await b.end();
  }, 120_000);

  it('גיבוי שנפגם בעצמו: לא נתקעים - עולים ריק', async () => {
    const dir = tmpDir();
    const a = createLocalPool({ dataDir: dir });
    await a.query('SELECT 1');
    await a.backup();
    await a.end();
    corrupt(dir);
    fs.writeFileSync(`${dir}.backup.tar.gz`, 'not a tarball');

    const b = createLocalPool({ dataDir: dir });
    expect((await b.query('SELECT 1 AS ok')).rows[0].ok).toBe(1);
    expect(b.recovery()).toMatchObject({ recovered: true, from: 'fresh' });
    await b.end();
  }, 120_000);

  it('סוד החתימה של העמדה עובר לתיקייה המשוחזרת - המחוברים לא מנותקים', async () => {
    const dir = tmpDir();
    const a = createLocalPool({ dataDir: dir });
    await a.query('SELECT 1');
    await a.end();
    fs.writeFileSync(path.join(dir, 'auth-secret'), 'S'.repeat(64));
    fs.writeFileSync(path.join(dir, 'snapshot-at'), '123');
    corrupt(dir);

    const b = createLocalPool({ dataDir: dir });
    await b.query('SELECT 1');
    expect(fs.readFileSync(path.join(dir, 'auth-secret'), 'utf8')).toBe('S'.repeat(64));
    // מאגר ריק חייב לקלוט שוב את חבילת האתחול - הסימון לא עובר
    expect(fs.existsSync(path.join(dir, 'snapshot-at'))).toBe(false);
    await b.end();
  }, 120_000);

  it('מאגר תקין: אין התאוששות, ואין העברה הצידה', async () => {
    const dir = tmpDir();
    const a = createLocalPool({ dataDir: dir });
    await a.query('CREATE TABLE t (v TEXT)');
    await a.end();

    const b = createLocalPool({ dataDir: dir });
    await b.query('SELECT * FROM t');
    expect(b.recovery()).toMatchObject({ recovered: false });
    expect(siblings(dir, '.corrupt-')).toHaveLength(0);
    await b.end();
  }, 120_000);

  it('נשמרים לכל היותר 2 עותקים פגומים - הדיסק של העמדה לא מתמלא', async () => {
    const dir = tmpDir();
    for (let i = 0; i < 3; i++) {
      const p = createLocalPool({ dataDir: dir });
      await p.query('SELECT 1');
      await p.end();
      corrupt(dir);
    }
    const last = createLocalPool({ dataDir: dir });
    await last.query('SELECT 1');
    await last.end();
    expect(siblings(dir, '.corrupt-').length).toBeLessThanOrEqual(2);
  }, 240_000);
});

describe('גיבוי וסגירה', () => {
  it('end() ממתין לסגירה - פתיחה מחדש מיד אחריו רואה את הנתונים', async () => {
    const dir = tmpDir();
    const a = createLocalPool({ dataDir: dir });
    await a.query('CREATE TABLE t (v TEXT)');
    await a.query(`INSERT INTO t VALUES ('x')`);
    await a.end();
    const b = createLocalPool({ dataDir: dir });
    expect((await b.query('SELECT count(*)::int n FROM t')).rows[0].n).toBe(1);
    expect(b.recovery().recovered).toBe(false);
    await b.end();
  }, 120_000);

  it('הגיבוי נכתב אטומית - לא נשאר קובץ זמני', async () => {
    const dir = tmpDir();
    const a = createLocalPool({ dataDir: dir });
    await a.query('SELECT 1');
    const r = await a.backup();
    expect(r.ok).toBe(true);
    expect(fs.existsSync(`${dir}.backup.tar.gz`)).toBe(true);
    expect(fs.existsSync(`${dir}.backup.tar.gz.tmp`)).toBe(false);
    await a.end();
  }, 120_000);

  it('גיבוי לפני עלייה או במאגר בזיכרון - לא עושה דבר', async () => {
    const idle = createLocalPool({ dataDir: tmpDir() });
    expect(await idle.backup()).toMatchObject({ ok: false, reason: 'not_booted' });
    const mem = createLocalPool({ dataDir: 'memory://' });
    await mem.query('SELECT 1');
    expect(await mem.backup()).toMatchObject({ ok: false, reason: 'memory' });
    await mem.end();
  }, 120_000);
});
