// צילום מסך לכפתור 📷 - שם הקובץ שנשמר ב-Downloads
import { describe, it, expect } from 'vitest';
import { screenshotFileName } from './screenshot';

const at = new Date(2026, 9, 7, 14, 5, 9); // 2026-10-07 14:05:09 שעון מקומי

describe('screenshotFileName', () => {
  it('שם העמדה + תאריך + שעה עם שניות', () => {
    expect(screenshotFileName('מגדל צפון', at)).toBe('SKYKING_מגדל צפון_2026-10-07_14-05-09.png');
  });

  it('תווים שאסורים בשם קובץ ב-Windows מוחלפים בקו תחתון, ורצף מתכווץ', () => {
    expect(screenshotFileName('בקר/דרום:א', at)).toBe('SKYKING_בקר_דרום_א_2026-10-07_14-05-09.png');
    expect(screenshotFileName('*?<>|\\"מגדל"', at)).toBe('SKYKING_מגדל_2026-10-07_14-05-09.png');
  });

  it('בלי שם עמדה - רק תאריך ושעה', () => {
    expect(screenshotFileName('', at)).toBe('SKYKING_2026-10-07_14-05-09.png');
    expect(screenshotFileName('   ', at)).toBe('SKYKING_2026-10-07_14-05-09.png');
    expect(screenshotFileName(undefined, at)).toBe('SKYKING_2026-10-07_14-05-09.png');
  });
});
