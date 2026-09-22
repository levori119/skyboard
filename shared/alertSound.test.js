import { describe, it, expect } from 'vitest';
import { TONES, toneOf, beepSchedule, ALERT_TONE_BY_KIND } from './alertSound.js';

describe('toneOf', () => {
  it('שם מוכר מחזיר את הטון', () => {
    expect(toneOf('stop')).toBe(TONES.stop);
  });
  it('שם לא מוכר נופל ל-notify, ולא לשקט', () => {
    expect(toneOf('אין כזה')).toBe(TONES.notify);
    expect(toneOf(undefined)).toBe(TONES.notify);
  });
});

describe('beepSchedule - הצפצופים לפי זמן', () => {
  it('עצור: ארבעה צפצופים בטון גבוה, בלי חפיפה', () => {
    const s = beepSchedule(TONES.stop);
    expect(s).toHaveLength(4);
    expect(s.every(b => b.freq === 880)).toBe(true);
    expect(s[1].at).toBeGreaterThanOrEqual(s[0].at + s[0].len);
  });

  it('זהירות: שני צפצופים, ובטון נמוך יותר מ"עצור"', () => {
    const s = beepSchedule(TONES.caution);
    expect(s).toHaveLength(2);
    expect(s[0].freq).toBeLessThan(TONES.stop.freq);
  });

  // "נפתח" חייב להישמע אחרת מ"עצור", אחרת הנהג שומע צפצוף ועוצר בדיוק כשמותר לו לנסוע
  it('נפתח: צליל עולה, ולא אותו צליל של עצור', () => {
    const s = beepSchedule(TONES.clear);
    expect(s.length).toBeGreaterThanOrEqual(2);
    expect(s[s.length - 1].freq).toBeGreaterThan(s[0].freq);
    expect(s[0].type).not.toBe(TONES.stop.type);
  });

  it('כל צפצוף באורך חיובי ובעוצמה חיובית', () => {
    for (const name of Object.keys(TONES)) {
      for (const b of beepSchedule(TONES[name])) {
        expect(b.len).toBeGreaterThan(0);
        expect(b.gain).toBeGreaterThan(0);
        expect(b.at).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('ALERT_TONE_BY_KIND - סוג ההתרעה -> צליל', () => {
  it('מסלול טיסה ואלמנט סוגר - עצור', () => {
    expect(ALERT_TONE_BY_KIND.runway).toBe('stop');
    expect(ALERT_TONE_BY_KIND.element).toBe('stop');
  });
  it('מסלול הסעה - זהירות', () => {
    expect(ALERT_TONE_BY_KIND.taxiway).toBe('caution');
  });
  it('התרעות המגדל: אלמנט סוגר - עצור, סטייה - זהירות', () => {
    expect(ALERT_TONE_BY_KIND.blocked).toBe('stop');
    expect(ALERT_TONE_BY_KIND.deviation).toBe('caution');
  });
});
