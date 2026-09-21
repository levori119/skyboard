import { describe, it, expect } from 'vitest';
import { createOptimisticOverlay } from './optimisticOverlay';
import { patternTrafficGroups } from './patternTraffic';

// התרחיש שדווח מהעמדה: לחיצה על "ירוקים" בטבלת "בהקפה" נראתה כאילו "לוקח זמן
// להתרפרש". בפועל הכפתור כן נדלק מיד - ואז תמונת פולינג שיצאה **לפני** הלחיצה
// חזרה וכיבתה אותו, והוא נדלק שוב רק בפולינג הבא (עד 5 שניות).

const serverRows = (greens: boolean) => ([{
  strip_id: 7, aircraft_idx: 1, in_pattern: true, pattern_id: null,
  runway_ident: '15L', flight_status: 'downwind', greens, callsign: 'מרגמה',
}]);

const key = (r: any) => `${r.strip_id}|${Number(r.aircraft_idx)}`;
const greensOf = (rows: any[]) =>
  patternTrafficGroups({ aircraft: rows, patterns: [], trackAltByKey: new Map(), elevFt: 0 })[0].rows[0].greens;

describe('טבלת "בהקפה" - הירוקים נשארים דלוקים עד שהשרת יודע עליהם', () => {
  it('תמונת פולינג שיצאה לפני הלחיצה אינה מכבה את הכפתור', () => {
    let t = 1000;
    const overlay = createOptimisticOverlay<Record<string, any>>({ now: () => t });

    const pollStartedAt = t;        // הפולינג יצא לשרת
    t += 200;
    const seq = overlay.set('7|1', { greens: true }); // הפקח לחץ בזמן שהבקשה באוויר
    t += 300;                       // התשובה הישנה (ירוקים=false) חוזרת

    expect(greensOf(overlay.apply(serverRows(false), key, pollStartedAt))).toBe(true);

    // השרת אישר את הכתיבה, ומכאן תמונה טרייה גוברת - גם אם עמדה אחרת שינתה
    t += 100;
    overlay.confirm('7|1', seq);
    t += 100;
    expect(greensOf(overlay.apply(serverRows(true), key, t))).toBe(true);
    expect(greensOf(overlay.apply(serverRows(false), key, t))).toBe(false);
  });

  it('גם הצלע נשארת על מה שהפקח בחר עד שהשרת מדביק', () => {
    let t = 1000;
    const overlay = createOptimisticOverlay<Record<string, any>>({ now: () => t });
    const pollStartedAt = t;
    t += 100;
    overlay.set('7|1', { flight_status: 'final' });
    const rows = overlay.apply(serverRows(false), key, pollStartedAt);
    const table = patternTrafficGroups({ aircraft: rows, patterns: [], trackAltByKey: new Map(), elevFt: 0 });
    expect(table[0].rows[0].leg).toBe('final');
  });
});
