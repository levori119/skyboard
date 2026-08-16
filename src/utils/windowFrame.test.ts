import { describe, it, expect } from 'vitest';
import { frameColor, windowFrame, FRAME_WIDTH } from './windowFrame';

// קוד הצבע הוא הסכם ויזואלי מול הפקח/בקר: כתום = עריכה, תורכיז = צפייה ותפעול.
// הבדיקות כאן שומרות שההסכם לא יישבר בשקט בשינוי עתידי (CLAUDE.md §מסגרת חלון).
describe('windowFrame - קוד צבע מסגרות החלונות', () => {
  const themes = ['light', 'dark', 'ocean'] as const;

  it('חלון עריכה כתום וחלון צפייה תורכיז - בכל התמות', () => {
    for (const theme of themes) {
      expect(frameColor('edit', theme)).not.toBe(frameColor('view', theme));
    }
    // כתום: אדום גבוה, כחול נמוך. תורכיז: כחול גבוה, אדום נמוך.
    for (const theme of themes) {
      const edit = frameColor('edit', theme);
      const view = frameColor('view', theme);
      const r = (c: string) => parseInt(c.slice(1, 3), 16);
      const b = (c: string) => parseInt(c.slice(5, 7), 16);
      expect(r(edit)).toBeGreaterThan(b(edit));
      expect(b(view)).toBeGreaterThan(r(view));
    }
  });

  it('לכל תמה צבע משלה - ocean כהה ולכן שונה מ-light', () => {
    expect(frameColor('view', 'ocean')).not.toBe(frameColor('view', 'light'));
    expect(frameColor('edit', 'ocean')).not.toBe(frameColor('edit', 'light'));
  });

  it('תמה לא מוכרת נופלת ל-dark ולא ל-undefined', () => {
    expect(frameColor('view', 'nope' as any)).toBe(frameColor('view', 'dark'));
  });

  it('windowFrame מחזיר מסגרת מלאה עם רדיוס שהחלון ביקש', () => {
    expect(windowFrame('edit', 'dark', 12)).toEqual({
      border: `${FRAME_WIDTH}px solid ${frameColor('edit', 'dark')}`,
      borderRadius: '12px',
    });
    // רדיוס כמחרוזת עובר כמו שהוא (חלונות שכבר עוגלו ביחידות אחרות)
    expect(windowFrame('view', 'light', '50%').borderRadius).toBe('50%');
  });

  it('ברירת המחדל היא התמה הכהה - חדר בקרה', () => {
    expect(frameColor('view')).toBe(frameColor('view', 'dark'));
  });
});
