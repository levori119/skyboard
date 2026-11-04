import { describe, it, expect } from 'vitest';
import { altChangeNeedsAck } from './transferAltChange';

// מה שנבדק: גובה שהעמדה המקבלת שינתה מהבהב בשני הצדדים עד אישור של כל צד בנפרד.
const T0 = '2026-11-04T10:00:00Z', T1 = '2026-11-04T10:01:00Z', TM = '2026-11-04T09:59:00Z';

describe('altChangeNeedsAck', () => {
  it('לא שונה - לא מהבהב', () => {
    expect(altChangeNeedsAck({}, 'from')).toBe(false);
    expect(altChangeNeedsAck(null, 'to')).toBe(false);
  });
  it('שונה ולא אושר - מהבהב בשני הצדדים', () => {
    const t = { alt_changed_at: T0 };
    expect(altChangeNeedsAck(t, 'from')).toBe(true);
    expect(altChangeNeedsAck(t, 'to')).toBe(true);
  });
  it('אישור של צד אחד לא מכבה את השני', () => {
    const t = { alt_changed_at: T0, alt_ack_from_at: T1 };
    expect(altChangeNeedsAck(t, 'from')).toBe(false);
    expect(altChangeNeedsAck(t, 'to')).toBe(true);
  });
  it('אישור ישן משינוי קודם - מהבהב שוב', () => {
    expect(altChangeNeedsAck({ alt_changed_at: T0, alt_ack_to_at: TM }, 'to')).toBe(true);
  });
  it('אישור מקומי (לפני שהשרת ענה) מכבה מיד', () => {
    expect(altChangeNeedsAck({ alt_changed_at: T0 }, 'to', new Date(T1).getTime())).toBe(false);
  });
});
