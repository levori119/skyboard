// מה החיווי במסך הכניסה אומר - ומתי הוא היה משקר.
import { describe, it, expect } from 'vitest';
import { decideDisplay } from './StartupModeBanner';

const st = (over = {}) => ({
  startup: 'offline' as const, startupAt: 1, lastOkAt: 2,
  progress: null, strips: 113, ...over,
});

describe('decideDisplay - הקשר נקבע בנתב, לא במראה', () => {
  // ⚠️ זו התקלה שדווחה, עם המספרים שנמשכו מהעמדה בפועל: הנתב דיווח
  // serving:'remote' ו-online:true, בעוד המראה עוד החזיקה 'offline'.
  // המסך הכריז "אין קשר למרכז" בזמן שכל בקשה הלכה למרכז.
  it('עמדת WEB: הנתב מגיש מהמרכז - לא מכריזים נתק', () => {
    expect(decideDisplay(
      st({ startup: 'offline' }),
      { serving: 'remote', remote: { online: true }, simulated: false },
    )).toBe('lagging');
  });

  it('נתק אמיתי: הנתב מגיש מקומי והמרכז לא עונה', () => {
    expect(decideDisplay(
      st({ startup: 'offline' }),
      { serving: 'local', remote: { online: false }, simulated: false },
    )).toBe('offline');
  });

  // נתק מדומה הופעל ביד כדי לתרגל נתק. להציג "יש קשר" יסתיר את מה שתורגל.
  it('נתק מדומה נחשב נתק, גם אם המרכז זמין', () => {
    expect(decideDisplay(
      st({ startup: 'offline' }),
      { serving: 'local', remote: { online: true }, simulated: true },
    )).toBe('offline');
  });

  it('מסונכרנת - נשארת מסונכרנת, בלי תלות בנתב', () => {
    expect(decideDisplay(st({ startup: 'synced' }), null)).toBe('synced');
    expect(decideDisplay(st({ startup: 'synced' }),
      { serving: 'local', remote: { online: false } })).toBe('synced');
  });

  it('סנכרון ראשון בעיצומו - מד התקדמות, לא הכרעת קשר', () => {
    expect(decideDisplay(st({ startup: 'syncing' }),
      { serving: 'remote', remote: { online: true } })).toBe('syncing');
    expect(decideDisplay(st({ startup: 'syncing' }), null)).toBe('syncing');
  });

  // עמדה בלי השכבה הזו: אין את מי לשאול, ולא ממציאים קשר שלא הוכח
  it('אין נתב - נופלים בחזרה למה שהמראה אומרת', () => {
    expect(decideDisplay(st({ startup: 'offline' }), null)).toBe('offline');
  });

  it('אין מאגר מקומי בכלל - אין חיווי', () => {
    expect(decideDisplay(st({ startup: 'off' }), { serving: 'remote' })).toBeNull();
    expect(decideDisplay(null, { serving: 'remote' })).toBeNull();
  });
});
