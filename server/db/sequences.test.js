import { describe, it, expect, vi } from 'vitest';
import { SEQ_SKIP_PREFIXES, buildSequenceRepairPlan, resyncSequences, sequenceFromDefault } from './sequences.js';

// ── תיקון sequences מפגרים ────────────────────────────────────────────────────
// אחרי שחזור dump או seed שכותב id-ים במפורש, ה-sequence נשאר מאחור ו**כל**
// INSERT לטבלה נכשל ב-duplicate key. זה מה שהפיל את שכפול השדה.

const cols = (rows) => ({ rows });

describe('sequenceFromDefault', () => {
  // pg_get_serial_sequence מחזיר NULL כשה-sequence אינו owned - וזה בדיוק המצב
  // אחרי שחזור dump, כלומר בדיוק הטבלאות שנשברו. ברירת המחדל תמיד קיימת.
  it('שולף שם sequence מברירת המחדל', () => {
    expect(sequenceFromDefault(`nextval('airfield_sectors_id_seq'::regclass)`)).toBe('airfield_sectors_id_seq');
  });
  it('תומך בשם מלא-סכמה ומצוטט', () => {
    expect(sequenceFromDefault(`nextval('"public"."x_id_seq"'::regclass)`)).toBe('"public"."x_id_seq"');
    expect(sequenceFromDefault(`nextval('public.x_id_seq'::regclass)`)).toBe('public.x_id_seq');
  });
  it('ברירת מחדל שאינה nextval מחזירה null', () => {
    expect(sequenceFromDefault('now()')).toBeNull();
    expect(sequenceFromDefault(null)).toBeNull();
    expect(sequenceFromDefault('')).toBeNull();
  });
});

describe('buildSequenceRepairPlan', () => {
  it('בוחר רק sequences שמפגרים אחרי max(id)', () => {
    const plan = buildSequenceRepairPlan([
      { table: 'a', column: 'id', sequence: 'a_id_seq', max_id: 10, next_value: 11 },
      { table: 'b', column: 'id', sequence: 'b_id_seq', max_id: 11, next_value: 10 },
      { table: 'c', column: 'id', sequence: 'c_id_seq', max_id: 6, next_value: 2 },
    ]);
    expect(plan.map(p => p.table)).toEqual(['b', 'c']);
  });

  it('next שווה ל-max נחשב מפגר - ה-id הזה כבר תפוס', () => {
    const plan = buildSequenceRepairPlan([{ table: 'a', column: 'id', sequence: 's', max_id: 4, next_value: 4 }]);
    expect(plan).toHaveLength(1);
  });

  it('טבלה ריקה לא נוגעים בה', () => {
    expect(buildSequenceRepairPlan([{ table: 'a', column: 'id', sequence: 's', max_id: 0, next_value: 1 }])).toEqual([]);
  });

  it('מדלג על טבלאות AeroZone (az_) - פרויקט ישן שאינו רלוונטי', () => {
    const plan = buildSequenceRepairPlan([
      { table: 'az_maps', column: 'id', sequence: 's1', max_id: 5, next_value: 1 },
      { table: 'airfield_sectors', column: 'id', sequence: 's2', max_id: 11, next_value: 10 },
    ]);
    expect(plan.map(p => p.table)).toEqual(['airfield_sectors']);
    expect(SEQ_SKIP_PREFIXES).toContain('az_');
  });

  it('ערכים לא מספריים (bigint כמחרוזת מ-pg) מטופלים כמספרים', () => {
    const plan = buildSequenceRepairPlan([{ table: 'a', column: 'id', sequence: 's', max_id: '11', next_value: '10' }]);
    expect(plan).toHaveLength(1);
  });

  it('שורה בלי sequence נזרקת ולא מפילה', () => {
    expect(buildSequenceRepairPlan([{ table: 'a', column: 'id', sequence: null, max_id: 5, next_value: 1 }])).toEqual([]);
  });
});

describe('resyncSequences', () => {
  const makeQuery = (state) => vi.fn(async (sql) => {
    if (sql.includes('pg_attrdef')) return cols(state.defs.map(d => ({ table: d.table, column: d.column, default_expr: `nextval('${d.sequence}'::regclass)` })));
    const m = /SELECT COALESCE\(MAX\("(\w+)"\), 0\) AS max_id FROM "(\w+)"/.exec(sql);
    if (m) return cols([{ max_id: state.maxes[m[2]] ?? 0 }]);
    const s = /FROM ([\w.]+)$/.exec(sql.trim());
    if (sql.includes('last_value') && s) return cols([{ next_value: state.nexts[s[1]] ?? 1 }]);
    if (sql.startsWith('SELECT setval')) { state.setvals.push(sql); return cols([{}]); }
    return cols([]);
  });

  it('מריץ setval רק לטבלאות המפגרות ומחזיר אותן', async () => {
    const state = {
      defs: [
        { table: 'airfield_sectors', column: 'id', sequence: 'public.airfield_sectors_id_seq' },
        { table: 'airfields', column: 'id', sequence: 'public.airfields_id_seq' },
      ],
      maxes: { airfield_sectors: 11, airfields: 21 },
      nexts: { 'public.airfield_sectors_id_seq': 10, 'public.airfields_id_seq': 39 },
      setvals: [],
    };
    const q = makeQuery(state);
    const fixed = await resyncSequences(q);
    expect(fixed).toEqual([{ table: 'airfield_sectors', column: 'id', max_id: 11, next_value: 10 }]);
    expect(state.setvals).toHaveLength(1);
    expect(state.setvals[0]).toContain('airfield_sectors_id_seq');
    expect(state.setvals[0]).toContain('11');
  });

  it('אין מה לתקן - לא נשלח אף setval', async () => {
    const state = {
      defs: [{ table: 'airfields', column: 'id', sequence: 'public.airfields_id_seq' }],
      maxes: { airfields: 21 }, nexts: { 'public.airfields_id_seq': 39 }, setvals: [],
    };
    expect(await resyncSequences(makeQuery(state))).toEqual([]);
    expect(state.setvals).toHaveLength(0);
  });

  it('כשל בטבלה אחת אינו מפיל את השאר', async () => {
    const state = {
      defs: [
        { table: 'broken', column: 'id', sequence: 'public.broken_id_seq' },
        { table: 'airfield_sectors', column: 'id', sequence: 'public.airfield_sectors_id_seq' },
      ],
      maxes: { airfield_sectors: 11 }, nexts: { 'public.airfield_sectors_id_seq': 10 }, setvals: [],
    };
    const base = makeQuery(state);
    const q = async (sql, p) => {
      if (sql.includes('"broken"')) throw new Error('permission denied');
      return base(sql, p);
    };
    const fixed = await resyncSequences(q);
    expect(fixed.map(f => f.table)).toEqual(['airfield_sectors']);
  });

  it('כשל בשאילתת הגילוי מחזיר רשימה ריקה ולא זורק - העלייה לא נופלת בגללו', async () => {
    const fixed = await resyncSequences(async () => { throw new Error('no catalog access'); });
    expect(fixed).toEqual([]);
  });
});
