// בדיקות צד הכתיבה של הקלטת המסך - קובץ אמיתי בתיקייה זמנית.
// אפיון: SCREEN_RECORDING_SPEC.md
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { createScreenRecorder } = require('./screenRecorder.cjs');

let dir;
let recorder;

/** תשובת /api/screen-recording/config שהתהליך הראשי שואב בעצמו */
function stubConfig(over = {}) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      base_id: 11, base_name: 'בח"א 8', enabled: true, path: dir,
      segmentMinutes: 15, retentionDays: 7, fps: 5, quality: 'medium',
      pathValid: true, ...over,
    }),
  }));
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyrec-'));
  recorder = createScreenRecorder({ apiBase: () => 'http://localhost:3001' });
  stubConfig();
});

afterEach(async () => {
  await recorder.stop().catch(() => {});
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('start', () => {
  it('פותח קובץ בנתיב שהשרת מסר, בשם שנבנה משם הבסיס שב-DB', async () => {
    const res = await recorder.start({ baseId: 11, presetName: 'תל נוף אווירי', token: 't', ext: 'webm' });
    expect(res.ok).toBe(true);
    expect(res.file).toMatch(/^SKYKING_בחא-8_תל-נוף-אווירי_/);
    expect(res.segmentMs).toBe(15 * 60_000);
    expect(res.fps).toBe(5);
    expect(fs.existsSync(path.join(dir, res.file))).toBe(true);
  });

  it('מעביר את האסימון של העמדה לשרת, ולא קורא בעילום זהות', async () => {
    await recorder.start({ baseId: 11, presetName: 'x', token: 'abc', ext: 'webm' });
    const [, init] = global.fetch.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer abc');
  });

  it('נכבה עם סיבה כשההקלטה כבויה לבסיס', async () => {
    stubConfig({ enabled: false });
    expect(await recorder.start({ baseId: 11, presetName: 'x', token: 't' })).toMatchObject({ ok: false, reason: 'disabled' });
  });

  it('הקלטה ידנית רצה גם כשהאוטומטית כבויה - הנתיב הוא מה שנדרש', async () => {
    stubConfig({ enabled: false });
    expect(await recorder.start({ baseId: 11, presetName: 'x', token: 't', manual: true })).toMatchObject({ ok: true });
  });

  it('נכבה עם סיבה כשהנתיב פסול, גם אם הוא כבר שמור ב-DB', async () => {
    stubConfig({ path: 'rec\\video' });
    expect(await recorder.start({ baseId: 11, presetName: 'x', token: 't' })).toMatchObject({ ok: false, reason: 'badPath' });
  });

  it('נכבה עם סיבה כשהתצורה לא נטענה מהשרת', async () => {
    global.fetch = vi.fn(async () => { throw new Error('offline'); });
    expect(await recorder.start({ baseId: 11, presetName: 'x', token: 't' })).toMatchObject({ ok: false, reason: 'configUnavailable' });
  });

  it('בלי בסיס אין הקלטה', async () => {
    expect(await recorder.start({ baseId: 0, presetName: 'x', token: 't' })).toMatchObject({ ok: false, reason: 'noBase' });
  });
});

describe('chunk / rotate / stop', () => {
  it('הנתחים נכתבים בסדר שבו נשלחו', async () => {
    const { file } = await recorder.start({ baseId: 11, presetName: 'x', token: 't', ext: 'webm' });
    await recorder.chunk(new Uint8Array([1, 2, 3]));
    await recorder.chunk(new Uint8Array([4, 5]));
    await recorder.stop();
    expect([...fs.readFileSync(path.join(dir, file))]).toEqual([1, 2, 3, 4, 5]);
  });

  it('נתח בלי הקלטה פעילה אינו יוצר קובץ', async () => {
    expect(await recorder.chunk(new Uint8Array([1]))).toMatchObject({ ok: false, reason: 'notRecording' });
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('החלפת קטע סוגרת קובץ ופותחת חדש - שניהם נשארים', async () => {
    const first = await recorder.start({ baseId: 11, presetName: 'x', token: 't', ext: 'webm' });
    await recorder.chunk(new Uint8Array([1]));
    const rotated = await recorder.rotate();
    expect(rotated.ok).toBe(true);
    expect(rotated.file).not.toBe(first.file);
    await recorder.chunk(new Uint8Array([2]));
    await recorder.stop();
    expect(fs.existsSync(path.join(dir, first.file))).toBe(true);
    expect([...fs.readFileSync(path.join(dir, rotated.file))]).toEqual([2]);
  });
});

describe('keep', () => {
  it('מעביר את הקטע הנוכחי ל-keep בסגירתו', async () => {
    const { file } = await recorder.start({ baseId: 11, presetName: 'x', token: 't', ext: 'webm' });
    await recorder.chunk(new Uint8Array([9]));
    expect(await recorder.keep()).toMatchObject({ ok: true });
    await recorder.stop();
    expect(fs.existsSync(path.join(dir, 'keep', file))).toBe(true);
    expect(fs.existsSync(path.join(dir, file))).toBe(false);
  });

  it('לוקח גם את הקטע הקודם - המפעיל לוחץ אחרי שהאירוע קרה', async () => {
    const first = await recorder.start({ baseId: 11, presetName: 'x', token: 't', ext: 'webm' });
    await recorder.rotate();
    expect((await recorder.keep()).kept).toBe(2);
    expect(fs.existsSync(path.join(dir, 'keep', first.file))).toBe(true);
  });

  it('בלי הקלטה ובלי קטע קודם - אומר שאין מה לשמור', async () => {
    expect(await recorder.keep()).toMatchObject({ ok: false, kept: 0 });
  });
});

describe('מחיקה לפי תקופת שמירה', () => {
  const oldName = 'SKYKING_בחא-8_x_2020-01-01_100000.webm';
  const foreign = 'תחקיר-של-מישהו.mp4';

  it('מוחק קטע עתיק שלנו ולא נוגע בקובץ זר', async () => {
    fs.writeFileSync(path.join(dir, oldName), 'x');
    fs.writeFileSync(path.join(dir, foreign), 'x');
    await recorder.start({ baseId: 11, presetName: 'x', token: 't', ext: 'webm' });
    // הסריקה רצה מיד עם ההתחלה
    await vi.waitFor(() => expect(fs.existsSync(path.join(dir, oldName))).toBe(false));
    expect(fs.existsSync(path.join(dir, foreign))).toBe(true);
  });

  it('תקופת שמירה 0 = לא מוחקים כלום', async () => {
    fs.writeFileSync(path.join(dir, oldName), 'x');
    stubConfig({ retentionDays: 0 });
    await recorder.start({ baseId: 11, presetName: 'x', token: 't', ext: 'webm' });
    await new Promise(r => setTimeout(r, 50));
    expect(fs.existsSync(path.join(dir, oldName))).toBe(true);
  });

  it('לא מוחק קטע ששמור ב-keep, גם אם הוא עתיק', async () => {
    fs.mkdirSync(path.join(dir, 'keep'));
    fs.writeFileSync(path.join(dir, 'keep', oldName), 'x');
    await recorder.start({ baseId: 11, presetName: 'x', token: 't', ext: 'webm' });
    await new Promise(r => setTimeout(r, 50));
    expect(fs.existsSync(path.join(dir, 'keep', oldName))).toBe(true);
  });
});
