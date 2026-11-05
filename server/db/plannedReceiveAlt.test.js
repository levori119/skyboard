// ─── גובה מתוכנן לקבלה ─────────────────────────────────────────────────────────
// דסק קבע לפ"מ של עמדה אחרת גובה משלו וביקש לעדכן את המוסרת: כשנפתחת העברה
// אליו הגובה נכנס לפ"מ ומסומן בהעברה כשינוי של המקבלת. בלי בקשה - כלום.
import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

let pool, applyPlannedReceiveAlt, clearPlannedAlt, openTransferTo, initiatePresetTransferTx;
const DESK = 7, SENDER = 3;

const stripAlt = async () => (await pool.query('SELECT alt FROM strips WHERE id = 1')).rows[0].alt;
const assignment = async () => (await pool.query('SELECT planned_alt, planned_alt_to_sender FROM strip_table_assignments WHERE strip_id = 1 AND preset_id = $1', [DESK])).rows[0];

beforeAll(async () => {
  process.env.SKYKING_LOCAL_DB = '1';
  process.env.SKYKING_LOCAL_DB_DIR = 'memory://';
  ({ default: pool } = await import('./pool.js'));
  ({ applyPlannedReceiveAlt, clearPlannedAlt, openTransferTo } = await import('./plannedReceiveAlt.js'));
  ({ initiatePresetTransferTx } = await import('../routes/transfers.js'));
  await pool.query(`CREATE TABLE strips (id INTEGER PRIMARY KEY, alt TEXT, status TEXT)`);
  await pool.query(`CREATE TABLE strip_table_assignments (strip_id INTEGER, preset_id INTEGER, planned_alt VARCHAR(40), planned_alt_to_sender BOOLEAN DEFAULT FALSE, PRIMARY KEY (strip_id, preset_id))`);
  await pool.query(`CREATE TABLE strip_transfers (id SERIAL PRIMARY KEY, strip_id INTEGER, from_preset_id INTEGER, to_preset_id INTEGER, to_workstation_id INTEGER,
    status TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), alt_changed_at TIMESTAMPTZ, alt_changed_by INTEGER, alt_ack_from_at TIMESTAMPTZ, alt_ack_to_at TIMESTAMPTZ)`);
}, 120_000);

beforeEach(async () => {
  await pool.query('DELETE FROM strips; DELETE FROM strip_table_assignments; DELETE FROM strip_transfers');
  await pool.query(`INSERT INTO strips (id, alt, status) VALUES (1, '340', 'active')`);
});

afterAll(async () => { await pool?.end?.(); });

describe('applyPlannedReceiveAlt - הפ"מ בנקודת ההעברה למסירה', () => {
  it('בקשה לעדכן את המוסרת - הגובה נכנס לפ"מ, מסומן כשינוי של המקבלת, והבקשה מתממשת פעם אחת', async () => {
    await pool.query(`INSERT INTO strip_table_assignments VALUES (1, $1, '220', TRUE)`, [DESK]);
    const t = await initiatePresetTransferTx(pool, 1, { fromPresetId: SENDER, toPresetId: DESK });
    expect(await stripAlt()).toBe('220');
    expect(t.alt_changed_at).toBeTruthy();
    expect(Number(t.alt_changed_by)).toBe(DESK);
    expect((await assignment()).planned_alt_to_sender).toBe(false);
    expect((await assignment()).planned_alt).toBe('220');
  });

  it('בלי בקשה - הגובה של המוסרת נשאר', async () => {
    await pool.query(`INSERT INTO strip_table_assignments VALUES (1, $1, '220', FALSE)`, [DESK]);
    const t = await initiatePresetTransferTx(pool, 1, { fromPresetId: SENDER, toPresetId: DESK });
    expect(await stripAlt()).toBe('340');
    expect(t.alt_changed_at).toBeFalsy();
  });

  it('העברה לעמדה אחרת - הבקשה של הדסק לא מתממשת', async () => {
    await pool.query(`INSERT INTO strip_table_assignments VALUES (1, $1, '220', TRUE)`, [DESK]);
    await initiatePresetTransferTx(pool, 1, { fromPresetId: SENDER, toPresetId: 99 });
    expect(await stripAlt()).toBe('340');
    expect((await assignment()).planned_alt_to_sender).toBe(true);
  });

  it('העברה לנקודה (to_workstation_id) - אותו דבר', async () => {
    await pool.query(`INSERT INTO strip_table_assignments VALUES (1, $1, '230', TRUE)`, [DESK]);
    const { rows } = await pool.query(`INSERT INTO strip_transfers (strip_id, to_workstation_id, status) VALUES (1, $1, 'pending') RETURNING *`, [DESK]);
    const r = await applyPlannedReceiveAlt(pool, rows[0]);
    expect(r.applied).toBe(true);
    expect(await stripAlt()).toBe('230');
  });

  it('העברה פתוחה אליי - נמצאת; סגורה - לא', async () => {
    await pool.query(`INSERT INTO strip_transfers (strip_id, to_preset_id, status) VALUES (1, $1, 'accepted')`, [DESK]);
    expect(await openTransferTo(pool, 1, DESK)).toBeNull();
    await pool.query(`INSERT INTO strip_transfers (strip_id, to_preset_id, status) VALUES (1, $1, 'pending')`, [DESK]);
    expect((await openTransferTo(pool, 1, DESK))?.status).toBe('pending');
  });

  it('קבלה - גובה הדסק נמחק', async () => {
    await pool.query(`INSERT INTO strip_table_assignments VALUES (1, $1, '220', TRUE)`, [DESK]);
    await clearPlannedAlt(pool, 1, DESK);
    expect(await assignment()).toEqual({ planned_alt: null, planned_alt_to_sender: false });
  });
});
