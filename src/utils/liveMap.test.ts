import { describe, it, expect } from 'vitest';
import {
  LIVE_MAP_COLORS, addToLiveMap, addToOpenLiveMap, fitLiveMap, isInProgressTrip, liveMapColor, liveMapTripsFor,
  openLiveMap, removeLiveMapTrip, toggleLiveMapHistory,
  removeFromLiveMap, tripTabOf,
} from './liveMap';

const started = { driver_started_at: '2026-09-15T08:00:00Z', ended_at: null, status: 'approved' };

describe('נסיעה בביצוע', () => {
  it('הופעלה ולא הסתיימה', () => {
    expect(isInProgressTrip(started)).toBe(true);
  });

  it('לא הופעלה, או הסתיימה - אינה בביצוע', () => {
    expect(isInProgressTrip({ ...started, driver_started_at: null })).toBe(false);
    expect(isInProgressTrip({ ...started, ended_at: '2026-09-15T08:30:00Z' })).toBe(false);
    expect(isInProgressTrip({ ...started, status: 'ended' })).toBe(false);
  });
});

describe('הטאב של הנסיעה', () => {
  // נסיעה שהופעלה ומועדה עבר הייתה נופלת להיסטוריה - בדיוק כשהרכב נוסע עכשיו
  it('"בביצוע" גובר גם כשמועד היציאה כבר עבר', () => {
    expect(tripTabOf(started, true)).toBe('active');
  });

  it('שאר הנסיעות - קרובות או היסטוריה לפי המועד', () => {
    expect(tripTabOf({ ...started, driver_started_at: null }, false)).toBe('upcoming');
    expect(tripTabOf({ ...started, driver_started_at: null }, true)).toBe('history');
    expect(tripTabOf({ ...started, status: 'ended', ended_at: 'x' }, true)).toBe('history');
  });
});

describe('צבעי הנסיעות במפה', () => {
  it('כל נסיעה בצבע אחר, לפי סדר ההוספה', () => {
    const ids = [7, 3, 9];
    const colors = ids.map(id => liveMapColor(ids, id));
    expect(new Set(colors).size).toBe(3);
    expect(colors[0]).toBe(LIVE_MAP_COLORS[0]);
  });

  // הוספת נסיעה אחרת לא צובעת מחדש את מה שכבר על המפה
  it('נסיעה שומרת על צבעה כשמוסיפים אחרות', () => {
    const before = liveMapColor([7, 3], 3);
    expect(liveMapColor(addToLiveMap([7, 3], 12), 3)).toBe(before);
  });

  // כחול/אדום/כתום/אפור אומרים נוסע/סוטה/חסום/אות אבד במפת המגדל
  it('הצבעים אינם צבעי הסטטוס של הרכב', () => {
    for (const status of ['#0ea5e9', '#ef4444', '#f97316', '#64748b']) {
      expect(LIVE_MAP_COLORS).not.toContain(status);
    }
  });

  it('מעבר לשמונה הצבעים חוזרים ולא נגמרים', () => {
    const ids = Array.from({ length: 10 }, (_, i) => i + 1);
    expect(liveMapColor(ids, 9)).toBe(LIVE_MAP_COLORS[0]);
  });
});

describe('הוספה והסרה', () => {
  it('הוספה בלי כפילות, בסוף הרשימה', () => {
    expect(addToLiveMap([1, 2], 3)).toEqual([1, 2, 3]);
    expect(addToLiveMap([1, 2], 2)).toEqual([1, 2]);
  });

  it('הסרה', () => {
    expect(removeFromLiveMap([1, 2, 3], 2)).toEqual([1, 3]);
  });
});

describe('התאמת המפה לרכבים', () => {
  it('רכב אחד - ממורכז, בזום קבוע', () => {
    const f = fitLiveMap([{ x: 30, y: 60 }], 1000, 750, 600, 400, { single: 4 });
    expect(f).toEqual({ center: { x: 30, y: 60 }, zoom: 4 });
  });

  it('כמה רכבים - במרכז התיבה שלהם, ובזום שבו כולם בחלון', () => {
    const f = fitLiveMap([{ x: 20, y: 50 }, { x: 60, y: 50 }], 1000, 750, 600, 400, { padding: 0 })!;
    expect(f.center).toEqual({ x: 40, y: 50 });
    // 40% מתוך 1000 = 400px, והחלון 600px - זום 1.5 ממלא אותו בדיוק
    expect(f.zoom).toBeCloseTo(1.5);
  });

  // שני רכבים צמודים לא יגדילו את המפה עד פיקסל
  it('הזום נחסם לגבולות', () => {
    const f = fitLiveMap([{ x: 50, y: 50 }, { x: 50.01, y: 50 }], 1000, 750, 600, 400, { max: 12 })!;
    expect(f.zoom).toBeLessThanOrEqual(12);
    const far = fitLiveMap([{ x: 0, y: 0 }, { x: 100, y: 100 }], 1000, 750, 600, 400, { min: 1 })!;
    expect(far.zoom).toBeGreaterThanOrEqual(1);
  });

  it('בלי נקודות, או חלון בלי גודל - אין התאמה ולא זריקה', () => {
    expect(fitLiveMap([], 1000, 750, 600, 400)).toBeNull();
    expect(fitLiveMap([{ x: 1, y: 1 }], 1000, 750, 0, 400)).toBeNull();
    expect(fitLiveMap([{ x: NaN, y: 1 }], 1000, 750, 600, 400)).toBeNull();
  });
});

describe('מצב המפה הצפה - שדה אחד למפה', () => {
  it('"פתח במפה צפה" - מפה לנסיעה הזו בלבד', () => {
    expect(openLiveMap(1, 7)).toEqual({ airfieldId: 1, tripIds: [7], historyIds: [] });
  });

  it('"הוסף למפה פתוחה" באותו שדה - מצטרפת לנסיעות הקיימות', () => {
    const m = { airfieldId: 1, tripIds: [7], historyIds: [7] };
    expect(addToOpenLiveMap(m, 1, 3)).toEqual({ airfieldId: 1, tripIds: [7, 3], historyIds: [7] });
  });

  // רכב של שדה אחד על התמונה של שדה אחר נראה במקום שהוא אינו בו
  it('הוספה משדה אחר מחליפה את המפה ולא מערבבת', () => {
    const m = { airfieldId: 1, tripIds: [7], historyIds: [7] };
    expect(addToOpenLiveMap(m, 2, 3)).toEqual({ airfieldId: 2, tripIds: [3], historyIds: [] });
  });

  it('הוספה כשאין מפה פתוחה - פותחת', () => {
    expect(addToOpenLiveMap(null, 1, 3)).toEqual({ airfieldId: 1, tripIds: [3], historyIds: [] });
  });

  it('טבלה של שדה אחר אינה מסמנת נסיעות כ"במפה"', () => {
    const m = { airfieldId: 1, tripIds: [7], historyIds: [] };
    expect(liveMapTripsFor(m, 1)).toEqual([7]);
    expect(liveMapTripsFor(m, 2)).toEqual([]);
    expect(liveMapTripsFor(null, 1)).toEqual([]);
    expect(liveMapTripsFor(m, null)).toEqual([]);
  });

  it('שובל: הדלקה וכיבוי', () => {
    const m = { airfieldId: 1, tripIds: [7, 3], historyIds: [] };
    const on = toggleLiveMapHistory(m, 3)!;
    expect(on.historyIds).toEqual([3]);
    expect(toggleLiveMapHistory(on, 3)!.historyIds).toEqual([]);
  });

  it('הסרת נסיעה מורידה גם את השובל שלה, והמפה שהתרוקנה נסגרת', () => {
    const m = { airfieldId: 1, tripIds: [7, 3], historyIds: [3] };
    expect(removeLiveMapTrip(m, 3)).toEqual({ airfieldId: 1, tripIds: [7], historyIds: [] });
    expect(removeLiveMapTrip({ airfieldId: 1, tripIds: [7], historyIds: [] }, 7)).toBeNull();
  });
});
