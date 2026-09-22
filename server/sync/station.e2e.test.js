// עמדה מנותקת מקצה לקצה - שרת עמדה אמיתי, שני מאגרים אמיתיים, HTTP אמיתי.
//
// **למה הבדיקה הזו קיימת:** דווח ש"בנתק לא מצליח להעביר פ"מ, והערה וגובה לא
// נשמרים". כל השכבות בנפרד היו ירוקות, והשבר היה דווקא **ביניהן**:
//
//   1. לא הייתה דרך להרים עמדה עם מאגר מקומי מחוץ לגרסה הארוזה, ולכן בפועל
//      נבדק דפדפן בלי מאגר - שם "נתק" הוא צפייה בלבד, בהגדרה.
//   2. גשר הזהות הנפיק אסימון מקומי **רק ברגע כניסה**. פקח שנכנס ואז רענן את
//      הדף לא עבר כניסה חדשה, ולכן ברגע המעבר למאגר המקומי כל בקשה חזרה 401.
//
// לכן כאן נבדקת השרשרת כולה, בדיוק כפי שהיא רצה בעמדה: אסימון שנחתם במרכז
// בלבד (**בלי** כניסה דרך העמדה - כמו אחרי רענון), מעבר לנתק, כתיבה, וחזרה.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createStationServer } = require('../../electron/stationServer.cjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** סוד החתימה של ה**מרכז**. לעמדה יהיה סוד משלה - וזה בדיוק מה שנבדק. */
const CENTRAL_SECRET = 'e2e-central-secret-that-is-long-enough-32';

let central, stationLocal, station, dist, token, dirs = [];
/** מזהה עמדה שנלכד מהמראה - נקרא לפני הנתק, כי אז הנתיב למרכז חסום. */
let presetId = null;

/** ה-API מחזיר מזהי פ"מ בצורה 's4242'. */
const idOf = (v) => Number(String(v).replace(/[^0-9]/g, ''));

/** מרים `server/local.js` כתהליך בן ומחכה שיודיע שהוא מוכן. */
function forkLocal({ label, seed = false, secret = null }) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `skyking-${label}-`));
  dirs.push(dataDir);
  const env = {
    ...process.env,
    SKYKING_LOCAL_DB: '1',
    SKYKING_LOCAL_DB_DIR: dataDir,
    SKYKING_STATION_KEY: label,
    SKYKING_LOCAL_SEED: seed ? '1' : '0',
  };
  if (secret) env.AUTH_SECRET = secret;
  else delete env.AUTH_SECRET;

  const child = fork(path.join(ROOT, 'server', 'local.js'), [], {
    cwd: ROOT, env, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} לא עלה בזמן`)), 120000);
    child.on('message', msg => {
      if (msg?.type === 'local-api-ready') {
        clearTimeout(timer);
        resolve({ url: msg.url, child });
      }
      if (msg?.type === 'local-api-failed') {
        clearTimeout(timer);
        reject(new Error(`${label}: ${msg.error}`));
      }
    });
    child.on('exit', c => { clearTimeout(timer); reject(new Error(`${label} הסתיים (${c})`)); });
  });
}

/** בקשה דרך **שרת העמדה**, כמו שהדפדפן שולח אותה. */
const call = async (p, init = {}) => {
  const res = await fetch(`${station.url}${p}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Station': 'arik',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
};

const outage = (on) => call('/api/__station/outage', { method: 'POST', body: JSON.stringify({ on }) });

/** צילום טבלה מהמרכז - גם דרך העמדה, כדי לא לפתוח ערוץ שאינו קיים בפועל. */
const centralRows = async (table) => {
  const { body } = await call(`/api/__remote/sync/mirror?tables=${table}`);
  return body.tables?.find(t => t.table === table)?.rows ?? [];
};

beforeAll(async () => {
  // הסוד נקבע **לפני** הייבוא: token.js מטמין אותו בקריאה הראשונה
  process.env.AUTH_SECRET = CENTRAL_SECRET;
  const { signToken } = await import('../auth/token.js');
  token = signToken({
    crewMemberId: 1, personalId: '1234567', name: 'בודק',
    isAdmin: true, isTeamLead: false, isManpower: false, approvedWorkstations: [],
  });

  central = await forkLocal({ label: 'central', seed: true, secret: CENTRAL_SECRET });
  stationLocal = await forkLocal({ label: 'station' }); // סוד חתימה משלה

  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'skyking-dist-e2e-'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<html>SKY-KING</html>');

  station = await createStationServer({
    distDir: dist,
    apiTarget: central.url,
    localApiTarget: () => stationLocal.url,
    timeoutMs: 8000,
  });
}, 300000);

afterAll(async () => {
  await station?.close().catch(() => {});
  central?.child?.kill();
  stationLocal?.child?.kill();
  for (const d of [...dirs, dist]) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* נעול */ }
  }
});

describe('עמדה מנותקת - מקצה לקצה', () => {
  it('מחובר: הבקשה מגיעה למרכז', async () => {
    const r = await call('/api/sectors');
    expect(r.status).toBe(200);
  });

  it('אסימון מקומי מונפק **בלי כניסה חדשה** - זה מה ששבר את הנתק', async () => {
    // האסימון נחתם במרכז ומעולם לא עבר דרך מסלול הכניסה של העמדה (בדיוק כמו
    // פקח שנכנס אתמול ורק רענן את הדף). לפני התיקון לא היה לו מקביל מקומי,
    // ולכן בנתק כל בקשה חזרה 401.
    await call('/api/sectors');
    for (let i = 0; i < 40; i++) {
      const { body } = await call('/api/__station/status');
      if (body.offlineSessions > 0) break;
      await new Promise(r => setTimeout(r, 100));
    }
    const { body } = await call('/api/__station/status');
    expect(body.offlineSessions).toBeGreaterThan(0);
  });

  it('מראה: מה שיש במרכז מגיע למאגר של העמדה', async () => {
    // פ"מ נוצר במרכז דרך נתיב הסנכרון - צורה ידועה, בלי לתלות את הבדיקה
    // בגוף הבקשה של יצירת פ"מ.
    const push = await call('/api/__remote/sync/push', {
      method: 'POST',
      body: JSON.stringify({
        ops: [{
          key: 'strips#1', table_schema: 'public', table_name: 'strips',
          pk: { id: 4242 }, op: 'I', baseRev: null, journalIds: [],
          row: { id: 4242, callsign: 'ARIK1', alt: '100', status: 'queued' },
        }],
      }),
    });
    expect(push.body.results[0].status).toBe('applied');

    const snap = await call('/api/__remote/sync/mirror');
    const ingest = await call('/api/__local/sync/mirror', {
      method: 'POST', body: JSON.stringify(snap.body),
    });
    expect(ingest.body.ok).toBe(true);

    const local = await call('/api/strips/all');
    expect(JSON.stringify(local.body)).toContain('ARIK1');

    // נלכד עכשיו: בזמן הנתק הנתיב המפורש למרכז חסום בכוונה
    presetId = (await centralRows('workstation_presets'))[0]?.id ?? null;
  });

  it('בנתק: עדכון גובה **נשמר** (זו התקלה שדווחה)', async () => {
    await outage(true);
    const r = await call('/api/strips/4242', {
      method: 'PUT', body: JSON.stringify({ alt: '250' }),
    });
    expect(r.status).toBe(200);

    const local = await call('/api/strips/all');
    const mine = local.body.find(s => idOf(s.id) === 4242);
    expect(mine.alt).toBe('250');
  });

  it('בנתק: הערת עמדה **נשמרת** (זו התקלה שדווחה)', async () => {
    expect(presetId).not.toBeNull();

    const r = await call('/api/strips/4242/station-note', {
      method: 'PATCH',
      body: JSON.stringify({ preset_id: presetId, note: 'נכתב בנתק' }),
    });
    expect(r.status).toBe(200);
    expect(r.body.note).toBe('נכתב בנתק');
  });

  it('בנתק: העברת פ"מ לעמדה אחרת **עוברת** (זו התקלה שדווחה)', async () => {
    const r = await call('/api/strips/4242/transfer-to-preset', {
      method: 'POST',
      body: JSON.stringify({ fromPresetId: presetId, toPresetId: presetId }),
    });
    expect(r.status).toBe(200);
    expect(r.body.transfer?.status).toBe('pending');
  });

  it('בנתק: המרכז לא נגע - ההפרדה בין העמדות עובדת', async () => {
    const rows = await centralRows('strips');
    // ⚠️ הנתיב המפורש למרכז חסום בזמן דימוי, ולכן זו גם בדיקה שהדימוי אמיתי
    expect(rows).toEqual([]);
  });

  it('הכל נרשם ביומן וממתין לסנכרון', async () => {
    const { body } = await call('/api/__local/sync/state');
    expect(body.pending).toBeGreaterThan(0);
  });

  it('אחרי החזרת הקשר: העבודה מהנתק מגיעה למרכז', async () => {
    await outage(false);

    const out = await call('/api/__local/sync/outbound');
    expect(out.body.ops.length).toBeGreaterThan(0);

    const push = await call('/api/__remote/sync/push', {
      method: 'POST',
      body: JSON.stringify({ ops: out.body.ops, stationNow: new Date().toISOString() }),
    });
    await call('/api/__local/sync/ack', {
      method: 'POST', body: JSON.stringify({ results: push.body.results }),
    });

    const rows = await centralRows('strips');
    const mine = rows.find(r => idOf(r.id) === 4242);
    expect(mine?.alt).toBe('250');

    const notes = await centralRows('strip_station_notes');
    expect(notes.find(n => idOf(n.strip_id) === 4242)?.note).toBe('נכתב בנתק');

    // ההעברה שנוצרה בנתק הגיעה גם היא - שלוש התקלות שדווחו, מקצה לקצה
    const transfers = await centralRows('strip_transfers');
    expect(transfers.find(t => idOf(t.strip_id) === 4242)?.status).toBe('pending');

    const state = await call('/api/__local/sync/state');
    expect(state.body.pending).toBe(0);
  });
});
