import { describe, it, expect } from 'vitest';
import {
  stripKeyOf, indexTransfersByStrip, transferCellState, etaCountdown,
  acceptFlashCss, ACCEPT_FLASH_TABLE_MS, ACCEPT_FLASH_DEFAULT_MS, transferMenuPlacement,
} from './tableTransferCell';

describe('stripKeyOf', () => {
  it('מאחד את שלוש הצורות של מזהה פ"מ', () => {
    expect(stripKeyOf('s12')).toBe('12');
    expect(stripKeyOf('12')).toBe('12');
    expect(stripKeyOf(12)).toBe('12');
  });
});

describe('transferCellState', () => {
  const incoming = indexTransfersByStrip([{ id: 1, strip_id: 5, status: 'pending' }, { id: 2, strip_id: 6, status: 'acknowledged' }]);
  const outgoing = indexTransfersByStrip([{ id: 3, strip_id: 7, status: 'pending' }, { id: 4, strip_id: 8, status: 'rejected' }]);

  it('פ"מ בנקודת העברה אליי → קבל', () => {
    const st = transferCellState({ id: 's5' }, incoming, outgoing);
    expect(st.kind).toBe('accept');
    expect((st as any).transfer.id).toBe(1);
  });

  it('העברה שאושרה ("ממתין למעבר") עדיין ממתינה לקבלה', () => {
    expect(transferCellState({ id: 's6' }, incoming, outgoing).kind).toBe('accept');
  });

  it('פ"מ בדרך ממני → ממתין לקבלה, ונדחה → נדחה', () => {
    expect(transferCellState({ id: 's7' }, incoming, outgoing).kind).toBe('pending');
    expect(transferCellState({ id: 's8' }, incoming, outgoing).kind).toBe('rejected');
  });

  it('פ"מ שאצלי → העבר לעמדה', () => {
    expect(transferCellState({ id: 's9' }, incoming, outgoing).kind).toBe('send');
  });

  it('רוח-רפאים של פ"מ שנמסר לא מציעה פעולה', () => {
    expect(transferCellState({ id: 's5', _transferredOut: true }, incoming, outgoing).kind).toBe('transferred');
  });

  it('נכנסת שנדחתה לא מציגה "קבל"', () => {
    const inc = indexTransfersByStrip([{ id: 1, strip_id: 5, status: 'rejected' }]);
    expect(transferCellState({ id: 's5' }, inc, new Map()).kind).toBe('send');
  });
});

describe('etaCountdown', () => {
  const setAt = '2026-09-19T10:00:00Z';
  const t0 = new Date(setAt).getTime();

  it('בלי זמן מוגדר - null', () => {
    expect(etaCountdown(null, setAt, t0)).toBeNull();
    expect(etaCountdown(5, null, t0)).toBeNull();
  });

  it('ספירה לאחור MM:SS', () => {
    expect(etaCountdown(5, setAt, t0 + 30_000)).toEqual({ text: '04:30', over: false });
  });

  it('אחרי הזמן - 00:00 ומסומן שעבר', () => {
    expect(etaCountdown(1, setAt, t0 + 61_000)).toEqual({ text: '00:00', over: true });
  });
});

describe('transferMenuPlacement', () => {
  it('יש מקום מתחת - נפתחת מתחת לכפתור', () => {
    const p = transferMenuPlacement({ top: 100, bottom: 130 }, 800, 200);
    expect(p.side).toBe('below');
    expect(p.top).toBe(134);
  });

  it('שורה בתחתית המסך - נפתחת מעל הכפתור ולא מוסתרת', () => {
    const p = transferMenuPlacement({ top: 700, bottom: 730 }, 800, 200);
    expect(p.side).toBe('above');
    expect(p.bottom).toBe(800 - 700 + 4);
    expect(p.maxHeight).toBeGreaterThanOrEqual(200);
  });

  it('אין מקום באף צד - הצד הגדול יותר, והרשימה נגללת בתוכו', () => {
    const p = transferMenuPlacement({ top: 150, bottom: 180 }, 400, 500);
    expect(p.side).toBe('below');
    expect(p.maxHeight).toBe(400 - 180 - 4 - 8);
  });
});

describe('acceptFlashCss', () => {
  it('ריק כשאין פ"מים', () => {
    expect(acceptFlashCss([], ACCEPT_FLASH_TABLE_MS)).toBe('');
  });

  it('מהבהב כמה פ"מים במקביל', () => {
    const css = acceptFlashCss(['s1', 's2'], ACCEPT_FLASH_TABLE_MS);
    expect(css).toContain('[data-strip-id="s1"]');
    expect(css).toContain('[data-strip-id="s2"]');
  });

  it('20 שניות בטבלה, 5 בשאר (כפי שהיה - 9 מחזורים)', () => {
    expect(acceptFlashCss(['s1'], ACCEPT_FLASH_TABLE_MS)).toContain('ease-in-out 36;');
    expect(acceptFlashCss(['s1'], ACCEPT_FLASH_DEFAULT_MS)).toContain('ease-in-out 9;');
  });
});
