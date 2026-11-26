// ─── המראה אוטומטית (strips.auto_airborne) ───────────────────────────────────
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

let pool, runAutoAirborneOnce;

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('./pool.js'));
  await pool.query(`CREATE TABLE strips (id SERIAL PRIMARY KEY, callsign TEXT, status TEXT, workstation_preset_id INTEGER,
    takeoff_time TIMESTAMPTZ, airborne BOOLEAN DEFAULT FALSE, auto_airborne BOOLEAN DEFAULT FALSE, landed BOOLEAN DEFAULT FALSE)`);
  await pool.query(`INSERT INTO strips (callsign, status, takeoff_time, airborne, auto_airborne) VALUES
    ('עבר-מסומן',   'queued', NOW() - INTERVAL '1 minute', FALSE, TRUE),
    ('עתידי',       'queued', NOW() + INTERVAL '10 minute', FALSE, TRUE),
    ('עבר-לא-מסומן','queued', NOW() - INTERVAL '1 minute', FALSE, FALSE),
    ('בלי-זמן',     'queued', NULL, FALSE, TRUE),
    ('נחת',         'landed', NOW() - INTERVAL '1 minute', FALSE, TRUE)`);
  // נחיתה נרשמת ב-strips.landed (joiningPoints, GAPI) ולא ב-status - כך הפ"מים
  // שהונחתו ב-2026-11-26 הוחזרו לאוויר תוך 15 שניות
  await pool.query(`INSERT INTO strips (callsign, status, takeoff_time, airborne, auto_airborne, landed) VALUES
    ('נחת-בשדה', 'queued', NOW() - INTERVAL '1 minute', FALSE, TRUE, TRUE)`);
  ({ runAutoAirborneOnce } = await import('./autoAirborne.js'));
});

afterAll(async () => { await pool?.end?.(); });

const airborneOf = async (cs) => (await pool.query('SELECT airborne FROM strips WHERE callsign = $1', [cs])).rows[0].airborne;

describe('runAutoAirborneOnce', () => {
  it('ממריא רק פ"מ מסומן שזמנו הגיע; לא עתידי, לא לא-מסומן, לא בלי זמן, לא נחת', async () => {
    const r = await runAutoAirborneOnce(pool);
    expect(r.map(x => x.callsign)).toEqual(['עבר-מסומן']);
    expect(await airborneOf('עבר-מסומן')).toBe(true);
    expect(await airborneOf('עתידי')).toBe(false);
    expect(await airborneOf('עבר-לא-מסומן')).toBe(false);
    expect(await airborneOf('בלי-זמן')).toBe(false);
    expect(await airborneOf('נחת')).toBe(false);
    expect(await airborneOf('נחת-בשדה')).toBe(false);
  });
  it('חד-פעמי: אחרי ההמראה הדגל כבה, ופקח שביטל "מאוויר" לא נדרס בסבב הבא', async () => {
    const { rows } = await pool.query("SELECT auto_airborne FROM strips WHERE callsign = 'עבר-מסומן'");
    expect(rows[0].auto_airborne).toBe(false);
    await pool.query("UPDATE strips SET airborne = FALSE WHERE callsign = 'עבר-מסומן'");
    expect(await runAutoAirborneOnce(pool)).toEqual([]);
    expect(await airborneOf('עבר-מסומן')).toBe(false);
  });
  it('סבב שני לא מחזיר שוב את מי שכבר המריא', async () => {
    expect(await runAutoAirborneOnce(pool)).toEqual([]);
  });
});
