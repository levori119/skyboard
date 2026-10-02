// חבילת אתחול - עמדה שמעולם לא ראתה את השרת המרכזי.
//
// המראה ממלאת את המאגר המקומי רק כשיש קשר. עמדה שמותקנת ברשת מנותקת עולה
// עם מאגר ריק - בלי סקטורים, בלי עמדות ובלי משתמשים, כלומר אי אפשר אפילו
// להיכנס. חבילת האתחול היא צילום מראה שנשמר לקובץ ומגיע לעמדה ביד.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { createLocalPool } from '../db/localPool.js';
import { ensureMirageReplicaTable, countMirageUsers } from '../auth/mirageReplica.js';
import { hashPassword } from '../../mirage/password.js';
import {
  fetchStationSeed, applySeedIfNewer, readSnapshotMarker, writeSnapshotMarker,
} from './stationSeed.js';

const at = (iso) => new Date(iso).toISOString();
const MIRAGE_USER = {
  personalNumber: '100', firstName: 'בקר', lastName: 'א', apps: { 'SKY-KING': ['user'] },
  passwordHash: hashPassword('Skc#2026!Wxyz'),
};

describe('fetchStationSeed - צילום מלא מהמרכז, בחלקים', () => {
  it('מושך את רשימת הטבלאות, כל קבוצה בנפרד, ואת משתמשי המיראז\'', async () => {
    const seen = [];
    const fetchImpl = async (url, init) => {
      seen.push({ url, headers: init?.headers });
      const u = new URL(url);
      const json = (b) => ({ ok: true, status: 200, json: async () => b });
      if (u.pathname === '/api/sync/mirror/tables') return json({ tables: ['a', 'b', 'c'] });
      if (u.pathname === '/api/sync/mirror/mirage-users') return json({ ok: true, users: [MIRAGE_USER] });
      if (u.pathname === '/api/sync/mirror') {
        const ts = u.searchParams.get('tables').split(',');
        return json({ schema: 'public', at: at('2026-10-01T10:00:00Z'), tables: ts.map(t => ({ table: t, rows: [{ id: 1 }], truncated: false })) });
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
    const seed = await fetchStationSeed({ central: 'https://c.example/', token: 'tok', batch: 2, fetchImpl });
    expect(seed.tables.map(t => t.table)).toEqual(['a', 'b', 'c']);
    expect(seed.mirageUsers).toHaveLength(1);
    expect(seed.at).toBe(at('2026-10-01T10:00:00Z'));
    expect(seen.every(s => s.headers['X-Station-Token'] === 'tok')).toBe(true);
    expect(seen.filter(s => s.url.includes('/api/sync/mirror?')).length).toBe(2);
  });

  it('כשל בטבלאות - נכשל כולו. חבילה חלקית מסוכנת יותר מחבילה שלא נוצרה', async () => {
    const fetchImpl = async (url) => (url.includes('/tables')
      ? { ok: true, status: 200, json: async () => ({ tables: ['a'] }) }
      : { ok: false, status: 502, json: async () => ({}) });
    await expect(fetchStationSeed({ central: 'https://c', token: 't', fetchImpl })).rejects.toThrow();
  });
});

describe('applySeedIfNewer - קליטה רק של מה שחדש ממה שבעמדה', () => {
  let pool; let dir;
  const seedFile = (name, content) => {
    const f = path.join(dir, name);
    writeFileSync(f, JSON.stringify(content));
    return f;
  };
  const seed = (iso) => ({
    schema: 'public', at: at(iso), mirageUsers: [MIRAGE_USER],
    tables: [{ table: 'seed_probe', rows: [{ id: 1, name: iso }], truncated: false }],
  });

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'station-seed-'));
    pool = createLocalPool({ dataDir: 'memory://' });
    await ensureMirageReplicaTable(pool);
    await pool.query('CREATE TABLE seed_probe (id INT PRIMARY KEY, name TEXT)');
  });
  afterAll(async () => { await pool?.end(); rmSync(dir, { recursive: true, force: true }); });

  it('אין קובץ - לא קורה כלום', async () => {
    const r = await applySeedIfNewer({ pool, file: path.join(dir, 'missing.json'), dataDir: dir });
    expect(r.applied).toBe(false);
  });

  it('עמדה ריקה - החבילה נקלטת: טבלאות, משתמשי מיראז\' וסימון הזמן', async () => {
    const r = await applySeedIfNewer({ pool, file: seedFile('s1.json', seed('2026-10-01T10:00:00Z')), dataDir: dir });
    expect(r.applied).toBe(true);
    expect((await pool.query('SELECT name FROM seed_probe')).rows[0].name).toBe('2026-10-01T10:00:00Z');
    expect(await countMirageUsers(pool)).toBe(1);
    expect(readSnapshotMarker(dir)).toBe(Date.parse('2026-10-01T10:00:00Z'));
  });

  // חבילה ישנה שנשכחה בתיקייה אינה דורסת מראה טרייה שהגיעה מהמרכז
  it('חבילה ישנה ממה שבעמדה - מדולגת', async () => {
    writeSnapshotMarker(dir, Date.parse('2026-10-02T00:00:00Z'));
    const r = await applySeedIfNewer({ pool, file: seedFile('s2.json', seed('2026-10-01T12:00:00Z')), dataDir: dir });
    expect(r).toMatchObject({ applied: false, reason: 'older' });
    expect((await pool.query('SELECT name FROM seed_probe')).rows[0].name).toBe('2026-10-01T10:00:00Z');
  });

  it('חבילה חדשה יותר (מגיעה ביד לעמדה מנותקת) - נקלטת', async () => {
    const r = await applySeedIfNewer({ pool, file: seedFile('s3.json', seed('2026-10-03T00:00:00Z')), dataDir: dir });
    expect(r.applied).toBe(true);
    expect((await pool.query('SELECT name FROM seed_probe')).rows[0].name).toBe('2026-10-03T00:00:00Z');
  });

  it('קובץ פגום - לא מפיל את העמדה', async () => {
    const f = path.join(dir, 'bad.json');
    writeFileSync(f, '{ not json');
    const r = await applySeedIfNewer({ pool, file: f, dataDir: dir });
    expect(r).toMatchObject({ applied: false, reason: 'invalid' });
    expect(existsSync(f)).toBe(true);
  });
});
