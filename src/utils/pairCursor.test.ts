import { describe, it, expect } from 'vitest';
import { FZ_PAIR_CURSOR_IDLE, FZ_PAIR_CURSOR_ARMED, FZ_PAIR_CURSOR_VARS } from './pairCursor';
import { MAP_PAN_CURSOR } from './mapPan';

describe('סמני מצב "שידוך בלחיצה"', () => {
  for (const [name, cur] of [['idle', FZ_PAIR_CURSOR_IDLE], ['armed', FZ_PAIR_CURSOR_ARMED]] as const) {
    it(`${name} - data-URI עם נקודת אחיזה במרכז ונפילה ל-crosshair`, () => {
      expect(cur).toMatch(/^url\("data:image\/svg\+xml,/);
      expect(cur).toMatch(/\) 16 16, crosshair$/);
    });

    it(`${name} - ה-SVG מקודד, בלי תווים ששוברים ערך ב-CSS`, () => {
      expect(cur).not.toMatch(/[<>#]/);
    });

    it(`${name} - ריבוע ולא עיגול (זו ההבחנה מסמן גרירת המפה)`, () => {
      const svg = decodeURIComponent(cur.slice(cur.indexOf(',') + 1, cur.lastIndexOf('")')));
      expect(svg).toContain('<rect');
    });
  }

  it('שני המצבים נבדלים זה מזה - אחרת אין משמעות ל"נבחר פ"מ"', () => {
    expect(FZ_PAIR_CURSOR_IDLE).not.toBe(FZ_PAIR_CURSOR_ARMED);
  });

  it('נבדל מסמן גרירת המפה - שלוש משמעויות, שלושה סמנים', () => {
    expect(FZ_PAIR_CURSOR_ARMED).not.toBe(MAP_PAN_CURSOR);
    const pan = decodeURIComponent(MAP_PAN_CURSOR.slice(MAP_PAN_CURSOR.indexOf(',') + 1, MAP_PAN_CURSOR.lastIndexOf('")')));
    expect(pan).not.toContain('<rect'); // הכוונת של הפאן עגולה
  });

  it('שמות משתני ה-CSS מוגדרים במקום אחד ונצרכים ב-App.css', () => {
    expect(FZ_PAIR_CURSOR_VARS.idle).toBe('--fz-pair-cursor-idle');
    expect(FZ_PAIR_CURSOR_VARS.armed).toBe('--fz-pair-cursor-armed');
  });
});
