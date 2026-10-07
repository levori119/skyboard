// צילום מסך לכפתור 📷 - שם הקובץ שנשמר ב-Downloads
import { describe, it, expect } from 'vitest';
import { screenshotFileName, isScreenshotHotkey } from './screenshot';

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

describe('isScreenshotHotkey - Ctrl+P', () => {
  const k = (o: Partial<KeyboardEvent>) => ({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, code: '', key: '', ...o }) as KeyboardEvent;

  it('Ctrl+P - גם במקלדת עברית (key = פ), לפי המקש הפיזי', () => {
    expect(isScreenshotHotkey(k({ ctrlKey: true, code: 'KeyP', key: 'p' }))).toBe(true);
    expect(isScreenshotHotkey(k({ ctrlKey: true, code: 'KeyP', key: 'פ' }))).toBe(true);
    expect(isScreenshotHotkey(k({ metaKey: true, code: 'KeyP', key: 'p' }))).toBe(true);
  });

  it('לא מגיב לשילובים אחרים ולא להחזקת מקש', () => {
    expect(isScreenshotHotkey(k({ code: 'KeyP', key: 'p' }))).toBe(false);
    expect(isScreenshotHotkey(k({ ctrlKey: true, shiftKey: true, code: 'KeyP' }))).toBe(false);
    expect(isScreenshotHotkey(k({ ctrlKey: true, altKey: true, code: 'KeyP' }))).toBe(false);
    expect(isScreenshotHotkey(k({ ctrlKey: true, code: 'KeyO' }))).toBe(false);
    expect(isScreenshotHotkey(k({ ctrlKey: true, code: 'KeyP', repeat: true }))).toBe(false);
  });
});
