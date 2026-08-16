// ריליי המפות מהמאגר - בדיקת אינטגרציה מול **מאגר ATSIM אמיתי**.
//
// המאגר מורם כאן בתהליך (אותו `createAtsimApp` שרץ בפרודקשן), ולא מדומה: מה
// שנבדק הוא החוזה בין שתי המערכות, ו-mock של `fetch` היה בודק את ההנחות שלי
// על החוזה במקום את החוזה עצמו.
//
// **הטענה המרכזית שנבדקת כאן: אין כתיבה ל-DB.** לא במיגרציה, לא בטבלה, ולא
// בשאילתה - `pool.query` מנוטר לאורך כל הבדיקה, וכל נגיעה בו מפילה אותה.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createServer } from 'http';

/**
 * איתור ריפו המאגר. הוא **ריפו נפרד** ואינו תלות של SKY-KING, ולכן הבדיקה
 * מדלגת בנקיון כשהוא לא לצדנו (CI, קלון חלקי) במקום להיכשל על משהו שאינו שבור.
 * `ATSIM_REPO` גובר, אחריו האחים המקובלים.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
// הסימן הוא `mapStore.js` ולא `app.js`: מאגר בגרסה שקדמה למפות המעוגנות אינו
// יכול לשרת את הבדיקה הזו, ולזהות אותו כ"נמצא" היה מפיל אותה על היעדר פיצ'ר
// במקום לדלג.
const atsimRepo = [
  process.env.ATSIM_REPO,
  path.resolve(here, '../../../atsim'),
  path.resolve(here, '../../../atsim-anchored-maps'),
].find(p => p && fs.existsSync(path.join(p, 'mapStore.js'))) || null;

if (!atsimRepo) {
  console.warn('ריליי המפות: ריפו ATSIM לא נמצא לצד SKY-KING - הבדיקה מדולגת. ATSIM_REPO=<נתיב> להרצה.');
}

const ANCHORS = { x1: 20, y1: 10, lat1: 33, lon1: 34, x2: 80, y2: 90, lat2: 31, lon2: 35 };
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// ה-pool מנוטר **לפני** שהריליי נטען, אחרת הוא תופס את המקורי.
const queries = [];
vi.mock('../db/pool.js', () => ({
  default: {
    query: (...args) => { queries.push(args[0]); throw new Error('DB לא אמור להיקרא'); },
  },
}));

let atsim, atsimSrv, atsimBase, relay, relaySrv, relayBase, mapId, tmp;

const listen = (app) => new Promise((ok) => {
  const s = createServer(app).listen(0, '127.0.0.1', () => ok(s));
});

beforeAll(async () => {
  // ── המאגר ──
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-atsim-'));
  const { createAtsimApp } = await import(
    /* @vite-ignore */ pathToFileURL(path.join(atsimRepo, 'app.js')).href
  );
  // **מנטרלים DATABASE_URL לרגע ההקמה.** `createStore` של המאגר נופל אליו
  // כשמעבירים מחרוזת ריקה (`||`), והבדיקה הייתה מנסה להתחבר ל-Neon של SKY-KING
  // ונתקעת עד timeout - כישלון שנראה כאילו הריליי שבור.
  const savedDb = { url: process.env.DATABASE_URL, atsim: process.env.ATSIM_DATABASE_URL };
  delete process.env.DATABASE_URL;
  delete process.env.ATSIM_DATABASE_URL;
  try {
    atsim = createAtsimApp({
      dataFile: path.join(tmp, 'data.json'), databaseUrl: '', mapsDir: path.join(tmp, 'maps'),
    });
  } finally {
    if (savedDb.url) process.env.DATABASE_URL = savedDb.url;
    if (savedDb.atsim) process.env.ATSIM_DATABASE_URL = savedDb.atsim;
  }
  await atsim.locals.store.ready();
  await atsim.locals.maps.ready();
  atsimSrv = await listen(atsim);
  atsimBase = `http://127.0.0.1:${atsimSrv.address().port}`;

  const created = await (await fetch(`${atsimBase}/api/maps`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'תל נוף', projection: 'linear', anchors: ANCHORS, width: 1200, height: 900 }),
  })).json();
  mapId = created.id;
  await fetch(`${atsimBase}/api/maps/${mapId}/image`, {
    method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: PNG,
  });

  // ── הריליי של SKY-KING, בלי middleware האימות (הוא נבדק בנפרד) ──
  process.env.AIR_PICTURE_URL = atsimBase;
  const router = (await import('./airPicture.js')).default;
  relay = express();
  relay.use(router);
  relaySrv = await listen(relay);
  relayBase = `http://127.0.0.1:${relaySrv.address().port}`;
});

afterAll(async () => {
  atsim?.locals?.store?.stop();
  await new Promise(r => atsimSrv?.close(r));
  await new Promise(r => relaySrv?.close(r));
  delete process.env.AIR_PICTURE_URL;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* נמחק ממילא */ }
});

describe.skipIf(!atsimRepo)('ריליי המפות', () => {
  it('הרשימה עוברת מהמאגר לעמדה, עם הגבולות', async () => {
    const list = await (await fetch(`${relayBase}/api/air-picture/maps`)).json();
    const m = list.find(x => x.id === mapId);
    expect(m).toBeTruthy();
    expect(m.bounds.lonMin).toBeCloseTo(33.6667, 3);
    expect(m.bounds.latMax).toBeCloseTo(33.25, 3);
    expect(m.projection).toBe('linear');
  });

  it('נקודות העיגון אינן מגיעות לעמדה', async () => {
    const list = await (await fetch(`${relayBase}/api/air-picture/maps`)).json();
    expect(list.every(m => m.anchors === undefined)).toBe(true);
  });

  it('התמונה עוברת בשלמותה', async () => {
    const res = await fetch(`${relayBase}/api/air-picture/maps/${mapId}/image`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');
    expect(Buffer.compare(Buffer.from(await res.arrayBuffer()), PNG)).toBe(0);
  });

  it('ETag נשמר - העמדה לא מורידה מגה-בייטים פעמיים', async () => {
    const first = await fetch(`${relayBase}/api/air-picture/maps/${mapId}/image`);
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    const second = await fetch(`${relayBase}/api/air-picture/maps/${mapId}/image`, {
      headers: { 'If-None-Match': etag },
    });
    expect(second.status).toBe(304);
  });

  it('מפה שאינה קיימת - 502 ולא 200 ריק', async () => {
    expect((await fetch(`${relayBase}/api/air-picture/maps/אין-כזו/image`)).status).toBe(502);
  });

  it('**אפס נגיעה ב-DB** - זו כל הדרישה', async () => {
    // כל שאילתה זורקת ונרשמת. אם הריליי היה שומר את המפה, הבדיקה הזו נופלת.
    queries.length = 0;
    await fetch(`${relayBase}/api/air-picture/maps`);
    await fetch(`${relayBase}/api/air-picture/maps/${mapId}/image`);
    expect(queries).toEqual([]);
  });

  it('מאגר שנפל - 502 עם פירוט, והעמדה ממשיכה לעבוד', async () => {
    await new Promise(r => atsimSrv.close(r));
    const res = await fetch(`${relayBase}/api/air-picture/maps/${mapId}-אחר/image`);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(body.detail).toBeTruthy();     // בלי פירוט זה כישלון שקט
  });
});
