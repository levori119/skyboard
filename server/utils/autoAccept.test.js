import { describe, it, expect } from 'vitest';
import {
  AUTO_ACCEPT_MODES,
  normalizeAutoAcceptMode,
  autoAcceptDueAt,
  isAutoAcceptDue,
} from './autoAccept.js';

const MIN = 60 * 1000;
const at = (iso) => new Date(iso);

describe('קבלה אוטומטית בנקודת מעבר - נרמול המצב', () => {
  it('שלושה מצבים חוקיים בלבד', () => {
    expect(AUTO_ACCEPT_MODES).toEqual(['off', 'immediate', 'eta']);
  });

  it('ערך לא מוכר / ריק / null נופל ל-off (fail closed - לא מקבלים פ"מ בטעות)', () => {
    for (const bad of [null, undefined, '', 'yes', 'IMMEDIATE', 0, {}]) {
      expect(normalizeAutoAcceptMode(bad)).toBe('off');
    }
  });

  it('ערך חוקי נשמר כמו שהוא', () => {
    expect(normalizeAutoAcceptMode('immediate')).toBe('immediate');
    expect(normalizeAutoAcceptMode(' eta ')).toBe('eta');
  });
});

describe('קבלה אוטומטית - מתי ההעברה מבשילה', () => {
  const created = '2026-08-12T10:00:00.000Z';

  it('נקודה כבויה לא מבשילה לעולם', () => {
    expect(autoAcceptDueAt({ created_at: created }, 'off')).toBeNull();
    expect(isAutoAcceptDue({ created_at: created }, 'off', at('2030-01-01T00:00:00.000Z'))).toBe(false);
  });

  it('מיידית - מבשילה ברגע השליחה, גם כשהוקצה זמן להגעה', () => {
    const t = { created_at: created, eta_minutes: 20, eta_set_at: created };
    expect(autoAcceptDueAt(t, 'immediate').toISOString()).toBe(created);
    expect(isAutoAcceptDue(t, 'immediate', at(created))).toBe(true);
  });

  it('לפי הזמן המוקצה - לא מבשילה לפני שהזמן חלף', () => {
    const t = { created_at: created, eta_minutes: 15, eta_set_at: created };
    expect(isAutoAcceptDue(t, 'eta', new Date(at(created).getTime() + 14 * MIN))).toBe(false);
  });

  it('לפי הזמן המוקצה - מבשילה בדיוק בתום הזמן ואחריו', () => {
    const t = { created_at: created, eta_minutes: 15, eta_set_at: created };
    expect(isAutoAcceptDue(t, 'eta', new Date(at(created).getTime() + 15 * MIN))).toBe(true);
    expect(isAutoAcceptDue(t, 'eta', new Date(at(created).getTime() + 99 * MIN))).toBe(true);
  });

  it('הספירה מתחילה מ-eta_set_at ולא מיצירת ההעברה (הבקר עדכן זמן באמצע)', () => {
    const setAt = '2026-08-12T10:30:00.000Z';
    const t = { created_at: created, eta_minutes: 10, eta_set_at: setAt };
    expect(autoAcceptDueAt(t, 'eta').toISOString()).toBe('2026-08-12T10:40:00.000Z');
    expect(isAutoAcceptDue(t, 'eta', at('2026-08-12T10:39:00.000Z'))).toBe(false);
    expect(isAutoAcceptDue(t, 'eta', at('2026-08-12T10:40:00.000Z'))).toBe(true);
  });

  it('לא הוקצה זמן להגעה - אין למה לחכות, מבשילה מיד', () => {
    for (const eta of [null, 0, undefined, NaN]) {
      const t = { created_at: created, eta_minutes: eta, eta_set_at: null };
      expect(isAutoAcceptDue(t, 'eta', at(created))).toBe(true);
    }
  });

  it('הוקצה זמן אך אין חותמת - נופלים ליצירת ההעברה כבסיס', () => {
    const t = { created_at: created, eta_minutes: 5, eta_set_at: null };
    expect(autoAcceptDueAt(t, 'eta').toISOString()).toBe('2026-08-12T10:05:00.000Z');
  });

  it('חותמות זמן כמחרוזת (כפי ש-pg מחזיר בחלק מהדרייברים) מטופלות', () => {
    const t = { created_at: created, eta_minutes: 10, eta_set_at: '2026-08-12T10:00:00.000Z' };
    expect(isAutoAcceptDue(t, 'eta', at('2026-08-12T10:10:00.000Z'))).toBe(true);
  });
});
