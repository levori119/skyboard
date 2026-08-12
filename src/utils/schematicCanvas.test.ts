import { describe, it, expect } from 'vitest';
import { SCHEMATIC_ASPECT, SCHEMATIC_ASPECT_CSS, containBounds } from './schematicCanvas';

// שדה שנבנה **בלי מפת רקע** (שרטוט סכמטי בלבד) חייב משטח ציור משלו: כל שכבות
// המפה ממוקמות לפי `imgBounds`, ובלי משטח הן לא מרונדרות כלל - השרטוט "לא נטען".
// הקואורדינטות נשמרות באחוזים, ולכן **יחס המשטח** חייב להיות זהה בעמדת הניהול
// (שם ציירו) ובעמדה (שם מציגים) - אחרת אותו שרטוט יוצא מעוות.

describe('SCHEMATIC_ASPECT - יחס משטח הציור', () => {
  it('4:3, וזהה לערך ה-CSS שמוזן ל-aspectRatio', () => {
    expect(SCHEMATIC_ASPECT).toBeCloseTo(4 / 3, 10);
    expect(SCHEMATIC_ASPECT_CSS).toBe('4 / 3');
    const [w, h] = SCHEMATIC_ASPECT_CSS.split('/').map(s => Number(s.trim()));
    expect(w / h).toBeCloseTo(SCHEMATIC_ASPECT, 10);
  });
});

describe('containBounds - התאמת משטח למכולה (כמו objectFit: contain)', () => {
  it('מכולה רחבה מהמשטח - המשטח ממלא לגובה וממורכז לרוחב', () => {
    // מכולה 1000x300 (יחס 3.33) מול משטח 4:3 -> גובה 300, רוחב 400
    expect(containBounds(1000, 300, 4 / 3)).toEqual({ left: 300, top: 0, width: 400, height: 300 });
  });

  it('מכולה צרה מהמשטח - המשטח ממלא לרוחב וממורכז לגובה', () => {
    // מכולה 400x600 מול משטח 4:3 -> רוחב 400, גובה 300
    expect(containBounds(400, 600, 4 / 3)).toEqual({ left: 0, top: 150, width: 400, height: 300 });
  });

  it('יחס זהה - המשטח ממלא בדיוק, בלי שוליים', () => {
    expect(containBounds(800, 600, 4 / 3)).toEqual({ left: 0, top: 0, width: 800, height: 600 });
  });

  it('מכולה בלי מידות (עוד לא עלתה) - null, ולא משטח באפס', () => {
    expect(containBounds(0, 600, 4 / 3)).toBeNull();
    expect(containBounds(800, 0, 4 / 3)).toBeNull();
  });

  it('יחס לא חוקי - null (עדיף בלי שכבות מאשר שכבות במקום שגוי)', () => {
    expect(containBounds(800, 600, 0)).toBeNull();
    expect(containBounds(800, 600, Number.NaN)).toBeNull();
  });

  it('אותה נוסחה חלה גם על תמונה אמיתית - יחס מהתמונה, לא קבוע', () => {
    // תמונה פנורמית 2:1 במכולה ריבועית
    expect(containBounds(600, 600, 2)).toEqual({ left: 0, top: 150, width: 600, height: 300 });
  });
});
