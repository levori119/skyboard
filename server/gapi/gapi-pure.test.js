import { describe, it, expect } from 'vitest';
import { toColumns, toGapiData, isOperationalColumn, operationalColumns } from './adapter.js';
import { sign, verify, REPLAY_WINDOW_MS } from './auth.js';
import { shouldApplyIncoming, gapiWinsByTime, shouldEnqueueOutbound } from './conflict.js';
import { ENTITY_NAMES } from './entities.js';

describe('GAPI adapter — מיפוי שדות', () => {
  it('sortie: ממפה שדות תפעוליים ומדלג על שדות שלא נשלחו (partial)', () => {
    const cols = toColumns('sortie', { callsign: 'חנית', airborne: true, sq: '12' });
    expect(cols).toEqual({ callsign: 'חנית', airborne: true, sq: '12' });
    expect('task' in cols).toBe(false);
  });

  it('sortie: שדות פנימיים ל-SKYKING לא נכתבים גם אם GAPI שלח אותם', () => {
    const cols = toColumns('sortie', { callsign: 'כסף', x: 999, on_map: true, held_by_workstation: 'w1', sector_id: 5 });
    expect(cols).toEqual({ callsign: 'כסף' });
    expect(isOperationalColumn('sortie', 'x')).toBe(false);
    expect(isOperationalColumn('sortie', 'held_by_workstation')).toBe(false);
    expect(isOperationalColumn('sortie', 'callsign')).toBe(true);
    expect(isOperationalColumn('sortie', 'takeoff_airfield_id')).toBe(true); // airfield resolve
  });

  it('sortie: זמן נחיתה מתוכנן הוא שדה תפעולי דו-כיווני', () => {
    // הבסיס לחלונות הנתונים בעמדה ("נוחת בעוד פחות מ-X דקות"). בלי המיפוי כאן
    // השו"ב היה מעדכן את השדה ואצל הפקח הוא היה נשאר ריק - בשקט.
    const eta = '2026-08-05T14:40:00.000Z';
    const cols = toColumns('sortie', { callsign: 'כסף', planned_landing_time: eta });
    expect(cols.planned_landing_time).toBe(eta);
    expect(isOperationalColumn('sortie', 'planned_landing_time')).toBe(true);
    // וגם החוצה
    const out = toGapiData('sortie', { callsign: 'כסף', planned_landing_time: eta, x: 5 });
    expect(out.planned_landing_time).toBe(eta);
    expect('x' in out).toBe(false);
  });

  describe('sortie: טבלת נקודות מכוון (aim_points)', () => {
    const AIM = [{
      name: 'אלפא', aim_point: 'א1', coord: 'N3212.4500/E03456.8200',
      alt_ft: '12000', hd: '270', an: '45', an_min: '30', fuze: '0.02',
      armament: 'MK84', bombs: '2', note: 'הערה',
      air_verified: true, cleared_heading: true, abort_attack: false, ground_verified: false,
    }];

    it('נכנסת כ-JSONB ל-strips.targets ויוצאת מפוענחת', () => {
      const cols = toColumns('sortie', { callsign: 'חנית', aim_points: AIM });
      expect(cols.targets).toBe(JSON.stringify(AIM));
      const data = toGapiData('sortie', { callsign: 'חנית', targets: JSON.stringify(AIM), x: 5 });
      expect(data.aim_points).toEqual(AIM);
      expect('targets' in data).toBe(false); // השם החוצה הוא aim_points
    });

    it('כל 15 השדות שורדים את המסע הלוך-חזור, והדגלים נשארים בוליאניים', () => {
      const back = toGapiData('sortie', { targets: toColumns('sortie', { aim_points: AIM }).targets });
      expect(back.aim_points).toEqual(AIM);
      expect(Object.keys(back.aim_points[0])).toHaveLength(15);
      expect(back.aim_points[0].air_verified).toBe(true);
      expect(back.aim_points[0].abort_attack).toBe(false);
    });

    it('שורה בת שני שדות (הפורמט שלפני ההרחבה) עוברת בלי המרה', () => {
      const legacy = [{ name: 'אלפא', aim_point: 'א1' }];
      expect(toGapiData('sortie', { targets: JSON.stringify(legacy) }).aim_points).toEqual(legacy);
    });

    it('מערך ריק מוחק את נקודות המכוון; שדה שלא נשלח לא נוגע בהן', () => {
      expect(toColumns('sortie', { aim_points: [] }).targets).toBe('[]');
      expect(toColumns('sortie', { aim_points: null }).targets).toBe('[]');
      expect('targets' in toColumns('sortie', { callsign: 'חנית' })).toBe(false);
    });

    it('targets היא עמודה תפעולית - נשלחת ונקבעת ע"י GAPI', () => {
      expect(isOperationalColumn('sortie', 'targets')).toBe(true);
      expect(operationalColumns('sortie')).toContain('targets');
    });
  });

  it('closure: שדות JSONB עוברים stringify בכתיבה ו-parse בקריאה', () => {
    const poly = [[32.1, 34.8], [32.2, 34.9]];
    const cols = toColumns('closure', { name: 'סגירה', polygon_geo: poly, dates: [] });
    expect(cols.polygon_geo).toBe(JSON.stringify(poly));
    expect(cols.dates).toBe('[]');
    const data = toGapiData('closure', { name: 'סגירה', polygon_geo: JSON.stringify(poly), dates: '[]', color: '#fff' });
    expect(data.polygon_geo).toEqual(poly);
    expect(data.dates).toEqual([]);
    expect('color' in data).toBe(false); // color פנימי — לא יוצא
  });

  it('closure: JSONB null → מערך ריק בכתיבה', () => {
    const cols = toColumns('closure', { polygon_geo: null });
    expect(cols.polygon_geo).toBe('[]');
  });

  it('toGapiData: מוציא רק שדות תפעוליים (base_status ללא הגדרות עמדה)', () => {
    const row = { name: 'רמת דוד', code: 'RD', air_defense_status: 'ירוק', pressure_inhg: 29.92,
      id: 7, gapi_version: 4, updated_at: 'x', some_internal: 'zzz' };
    const data = toGapiData('base_status', row);
    expect(data.name).toBe('רמת דוד');
    expect(data.air_defense_status).toBe('ירוק');
    expect('some_internal' in data).toBe(false);
    expect('gapi_version' in data).toBe(false);
  });

  it('weather: תת-קבוצת שדות של base_statuses', () => {
    expect(operationalColumns('weather')).toEqual(
      ['pressure_inhg', 'atis_text', 'notam_text', 'bird_status', 'absorption_status']);
  });

  it('כל 5 הישויות מוגדרות', () => {
    expect(ENTITY_NAMES.sort()).toEqual(['base_status', 'closure', 'serial', 'sortie', 'weather']);
  });

  it('ישות לא מוכרת זורקת', () => {
    expect(() => toColumns('nope', {})).toThrow();
  });
});

describe('GAPI auth — HMAC', () => {
  const secret = 's3cr3t';
  const body = JSON.stringify({ events: [{ event_id: 'a' }] });
  const now = 1_700_000_000_000;

  it('sign/verify round-trip תקין', () => {
    const ts = now;
    const sig = sign(secret, ts, body);
    expect(sig.startsWith('sha256=')).toBe(true);
    expect(verify(secret, ts, body, sig, now)).toBe(true);
  });

  it('גוף שונה → נכשל', () => {
    const ts = now;
    const sig = sign(secret, ts, body);
    expect(verify(secret, ts, body + 'x', sig, now)).toBe(false);
  });

  it('secret שונה → נכשל', () => {
    const ts = now;
    const sig = sign('other', ts, body);
    expect(verify(secret, ts, body, sig, now)).toBe(false);
  });

  it('timestamp מחוץ לחלון replay → נכשל', () => {
    const ts = now - REPLAY_WINDOW_MS - 1000;
    const sig = sign(secret, ts, body);
    expect(verify(secret, ts, body, sig, now)).toBe(false);
  });

  it('חתימה חסרה / secret חסר → נכשל', () => {
    expect(verify(secret, now, body, '', now)).toBe(false);
    expect(verify('', now, body, 'sha256=x', now)).toBe(false);
  });
});

describe('GAPI conflict — גרסאות ו-LWW', () => {
  it('shouldApplyIncoming: אין קיים → מחיל', () => {
    expect(shouldApplyIncoming(5, null)).toBe(true);
    expect(shouldApplyIncoming(5, undefined)).toBe(true);
  });
  it('shouldApplyIncoming: נכנס גבוה יותר → מחיל; שווה/נמוך → לא', () => {
    expect(shouldApplyIncoming(6, 5)).toBe(true);
    expect(shouldApplyIncoming(5, 5)).toBe(false);
    expect(shouldApplyIncoming(4, 5)).toBe(false);
  });
  it('shouldApplyIncoming: בלי version נכנס → GAPI סמכותי → מחיל', () => {
    expect(shouldApplyIncoming(null, 5)).toBe(true);
  });
  it('gapiWinsByTime: טרי מנצח; שוויון → GAPI', () => {
    expect(gapiWinsByTime('2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z')).toBe(true);
    expect(gapiWinsByTime('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')).toBe(false);
    expect(gapiWinsByTime('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')).toBe(true);
    expect(gapiWinsByTime('2026-01-01T00:00:00Z', null)).toBe(true);
  });
  it('shouldEnqueueOutbound: echo suppression + feature flag', () => {
    expect(shouldEnqueueOutbound({ enabled: true, fromGapi: false })).toBe(true);
    expect(shouldEnqueueOutbound({ enabled: true, fromGapi: true })).toBe(false);  // echo
    expect(shouldEnqueueOutbound({ enabled: false, fromGapi: false })).toBe(false); // כבוי
  });
});
