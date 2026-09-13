// "אין סטטוס" ומילוי ניטרלי לסמל אלמנט - החיווט בשלושת מקומות התצוגה.
//
// אין jsdom, ולכן הבדיקה על הקוד עצמו: שכל אחד משלושת המקומות שואל את
// **אותה** פונקציה, ושהסמל על המפה אינו נצבע בצבע הסוג. בדיוק הפרטים שנשכחים
// כשמוסיפים מקום תצוגה רביעי, ושאינם נראים ב-tsc.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// מה-util הטהור ולא מ-GroundView: ייבוא המסך גורר רכיבים שנוגעים ב-document בטעינה
import { ELEMENT_NEUTRAL_FILL } from '../../utils/elementStatus';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const GROUND = read('src/components/views/GroundView.tsx');
const DASH = read('src/components/views/SectorDashboard.tsx');
const TABLE = read('src/components/ground/ElementsTableWindow.tsx');
const REGISTRY = JSON.parse(read('src/i18n/registry/ground.json'));

describe('סמל האלמנט על המפה', () => {
  it('המילוי ניטרלי ולא בצבע הסוג', () => {
    expect(ELEMENT_NEUTRAL_FILL).toBe('#1e293b');
    // השורה שמילאה בצבע הסוג כברירת מחדל - ה-elColor שבסוף ה-ternary
    expect(GROUND.includes("(isTakul || isLaTakin || isLaShamish) ? '#ef4444' : elColor,")).toBe(false);
    expect(GROUND).toContain("(isTakul || isLaTakin || isLaShamish) ? '#ef4444' : ELEMENT_NEUTRAL_FILL,");
  });

  it('תקלה עדיין ממלאת באדום - כדי שלא תוחמץ', () => {
    expect(GROUND).toContain("? '#ef4444' : ELEMENT_NEUTRAL_FILL");
  });

  it('סגור וכבוי קודמים לתקלה, כמו לפני השינוי', () => {
    expect(GROUND).toContain("background: (isClosed || isOff) ? ELEMENT_NEUTRAL_FILL : (isTakul");
  });

  it('צבע הסוג נשאר לתווית השם', () => {
    expect(GROUND).toContain('const elColor = el.type_color');
  });
});

describe('"אין סטטוס" - אותה תשובה בכל מקום', () => {
  it('המפתח קיים בעברית ובאנגלית', () => {
    expect(REGISTRY.keys.noStatus.he).toBe('אין סטטוס');
    expect(REGISTRY.keys.noStatus.en).toBeTruthy();
  });

  it('הפופאפ שעל המפה שואל אם הסוג בר-שינוי', () => {
    expect(GROUND).toContain('!canChangeElementStatus(el) ? (');
    expect(GROUND).toContain("elem-popup-no-status-");
  });

  it('פאנל האלמנטים מציג "אין סטטוס" במקום מקום ריק', () => {
    expect(DASH).toContain('const dsOpts = canChangeElementStatus(el)');
    expect(DASH).toContain('elem-no-status-');
  });

  it('טבלת האלמנטים מציגה "אין סטטוס" ולא מקף', () => {
    expect(TABLE).toContain('const dsOpts = canChangeElementStatus(el)');
    expect(TABLE).toContain('elements-table-no-status-');
  });

  it('אף מקום אינו שואל את השדה ישירות - רק דרך הפונקציה המשותפת', () => {
    for (const [name, src] of [['GroundView', GROUND], ['SectorDashboard', DASH], ['ElementsTableWindow', TABLE]] as const) {
      expect(src.includes("type_can_change_status === 'true'"), name).toBe(false);
      expect(src.includes('dsOpts = el.type_can_change_status'), name).toBe(false);
    }
  });
});
