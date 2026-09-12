import { describe, it, expect } from 'vitest';
import {
  ELEMENT_SERVICEABILITY,
  SERVICEABLE,
  UNSERVICEABLE,
  displayStateOptions,
  nextServiceability,
  serviceabilityStyle,
} from './elementStatus';

// ─── מצב אלמנט בשדה - מקור אמת יחיד ──────────────────────────────────────────
//
// ה-POPUP שעל המפה הוא **הקובע**: הוא מציע כשירות 'שמיש'/'לא שמיש' בלבד.
// הפאנל הצדדי החזיק רשימה משלו - 'תקין', 'חלקי', 'לא תקין', 'תקול' - ולכן
// לחיצה בפאנל הכניסה את האלמנט לערך שאי אפשר להגיע אליו (או לצאת ממנו) מהמפה,
// וזה מה שנראה בשטח: מחסום שנתקע על "חלקי". כאן שני המסכים נשענים על אותו מקור.

describe('ELEMENT_SERVICEABILITY - בדיוק מה שה-POPUP מציע', () => {
  it('שני ערכים, באותו סדר שבפופאפ', () => {
    expect(ELEMENT_SERVICEABILITY.map(s => s.value)).toEqual([SERVICEABLE, UNSERVICEABLE]);
  });

  it('הערכים הישנים אינם ברשימה - אי אפשר להגיע אליהם יותר בלחיצה', () => {
    const values = ELEMENT_SERVICEABILITY.map(s => s.value);
    for (const legacy of ['תקין', 'חלקי', 'לא תקין', 'תקול']) {
      expect(values, `${legacy} הוא ערך ישן ולא אמור להיות בר-בחירה`).not.toContain(legacy);
    }
  });
});

describe('nextServiceability - התג מחליף בין שני הערכים', () => {
  it('שמיש -> לא שמיש', () => {
    expect(nextServiceability(SERVICEABLE)).toBe(UNSERVICEABLE);
  });

  it('לא שמיש -> שמיש', () => {
    expect(nextServiceability(UNSERVICEABLE)).toBe(SERVICEABLE);
  });

  it('ערך ישן נכנס למסלול בלחיצה אחת, ולא נתקע', () => {
    // זה הלב: אלמנט שתקוע על 'חלקי' חייב להיחלץ בלחיצה אחת
    for (const legacy of ['חלקי', 'תקין', 'לא תקין', 'תקול']) {
      expect(nextServiceability(legacy)).toBe(SERVICEABLE);
    }
  });

  it('ערך ריק או חסר מתחיל מ"שמיש"', () => {
    expect(nextServiceability('')).toBe(SERVICEABLE);
    expect(nextServiceability(undefined)).toBe(SERVICEABLE);
  });
});

describe('serviceabilityStyle - ערך ישן עדיין נקרא, ולא נעלם', () => {
  it('שמיש ירוק, לא שמיש אדום', () => {
    expect(serviceabilityStyle(SERVICEABLE).color).toBe('#22c55e');
    expect(serviceabilityStyle(UNSERVICEABLE).color).toBe('#ef4444');
  });

  it('ערך ישן מוצג כמו שהוא ומסומן כלא-מוכר, כדי שלא ייראה כמו מצב תקף', () => {
    const s = serviceabilityStyle('חלקי');
    expect(s.isLegacy, 'הפקח צריך לראות שזה ערך שיצא משימוש').toBe(true);
    expect(s.color).toBeTruthy();
  });

  it('ערך מוכר אינו מסומן כישן', () => {
    expect(serviceabilityStyle(SERVICEABLE).isLegacy).toBe(false);
  });
});

// ─── הסטטוס התפעולי: רק מה שהוגדר לסוג האלמנט ────────────────────────────────
// `allowed_statuses` הוא רשימת התוויות בעברית שהוגדרו לסוג; `display_state`
// הוא המפתח שנשמר. המיפוי חייב להיות משותף, אחרת תפריט בפאנל היה כותב מפתח
// אחר מזה שהפופאפ כותב לאותה תווית.

const FALLBACK = [{ key: 'normal', label: 'רגיל', color: '#94a3b8' }];

describe('displayStateOptions - נגזר מ-allowed_statuses של הסוג', () => {
  it('ממפה תווית למפתח שנשמר ב-display_state', () => {
    const opts = displayStateOptions(['פתוח', 'סגור'], FALLBACK);
    expect(opts.map(o => [o.label, o.key])).toEqual([['פתוח', 'open'], ['סגור', 'close']]);
  });

  it('רמזור: כל ארבעת הסטטוסים עוברים, בסדר שהוגדר', () => {
    const opts = displayStateOptions(['מנצנץ', 'סגור', 'כבוי', 'פתוח'], FALLBACK);
    expect(opts.map(o => o.key)).toEqual(['blink', 'close', 'off', 'open']);
  });

  it('מקבל גם JSON כמחרוזת - כך זה חוזר מ-jsonb דרך ה-API', () => {
    const opts = displayStateOptions('["פתוח","סגור"]', FALLBACK);
    expect(opts.map(o => o.key)).toEqual(['open', 'close']);
  });

  it('תווית שאינה מוכרת נופלת, ולא כותבת מפתח שגוי', () => {
    const opts = displayStateOptions(['פתוח', 'המצאה'], FALLBACK);
    expect(opts.map(o => o.label)).toEqual(['פתוח']);
  });

  it('סוג בלי הגדרה נופל לברירת המחדל לפי האייקון', () => {
    expect(displayStateOptions([], FALLBACK)).toEqual(FALLBACK);
    expect(displayStateOptions(null, FALLBACK)).toEqual(FALLBACK);
    expect(displayStateOptions('לא JSON', FALLBACK)).toEqual(FALLBACK);
  });

  it('לכל אפשרות יש צבע - התפריט בפאנל צובע כמו הפופאפ', () => {
    for (const o of displayStateOptions(['פתוח', 'סגור', 'מנצנץ', 'כבוי'], FALLBACK)) {
      expect(o.color, o.label).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
