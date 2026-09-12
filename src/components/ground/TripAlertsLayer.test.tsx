// התראות הנסיעה - גרירה, עגינה, ורוחב הטופס.
//
// אין jsdom בפרויקט, ולכן לא נבדקת כאן גרירה בפועל אלא **החיווט** שבלעדיו
// גרירה לא תעבוד באצבע ובעט (CLAUDE.md §גרירה - מגע ועט), ושבלעדיו העגינה
// לא תעבוד בכלל. אלה בדיוק הפרטים שנשכחים במימוש חוזר, ו-tsc אינו רואה אותם.
//
// ⚠ `renderToStaticMarkup` בורח מגרשיים, ולכן `not.toContain` עם גרשיים
// **עובר תמיד** - כאן בודקים נוכחות, לא היעדר.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const ALERTS = read('src/components/ground/TripAlertsLayer.tsx');
const TRIPS = read('src/components/ground/TripsManagementWindow.tsx');

describe('ערימת ההתראות נגררת', () => {
  it('משתמשת ב-useDragPosition ולא במימוש גרירה משלה', () => {
    // ההוק פותר את ארבע המלכודות (touchAction, setPointerCapture, חלוקה ב---s,
    // בלי preventDefault). מימוש ידני שוכח לפחות אחת מהן
    expect(ALERTS).toContain("import useDragPosition from '../../hooks/useDragPosition'");
    expect(ALERTS).toContain('useDragPosition(stackRef)');
  });

  it('ידית הגרירה נושאת את handleProps - שם יושבים touchAction ו-userSelect', () => {
    expect(ALERTS).toContain('{...drag.handleProps}');
  });

  it('אין גרירה ב-onMouseDown - אירועי עכבר לא נשלחים באצבע', () => {
    expect(ALERTS.includes('onMouseDown')).toBe(false);
    expect(ALERTS.includes('mousemove')).toBe(false);
  });

  it('ידית הגרירה לחיצה גם כשהערימה שקופה ללחיצות', () => {
    // שורש הערימה הוא pointerEvents:none כדי שאפשר יהיה ללחוץ על המפה בין
    // ההתראות; ידית שיורשת את זה פשוט לא תיגרר
    expect(ALERTS).toContain("pointerEvents: 'auto'");
  });

  it('המרכוז ב-translate יורד אחרי גרירה', () => {
    // בלי זה הערימה נוחתת חצי רוחב משמאל למקום שהמצביע עזב בו
    expect(ALERTS).toContain('dragged');
    expect(ALERTS).toMatch(/dragged\s*\n?\s*\?\s*\{\s*top: drag\.pos!\.y, insetInlineStart: drag\.pos!\.x \}/);
  });
});

describe('ערימת ההתראות נעגנת בקונטיינר', () => {
  it('משתמשת ב-useDockableWindow ולא במימוש עגינה ידני', () => {
    expect(ALERTS).toContain("import { useDockableWindow } from '../../hooks/useDockableWindow'");
    expect(ALERTS).toContain("useDockableWindow('tripAlerts'");
  });

  it('ידית הגרירה היא גם ידית העגינה', () => {
    expect(ALERTS).toContain('dock.onHeaderPointerDown(e)');
  });

  it('rootStyle נפרס על השורש, אחרת המיקום הצף שורד בתוך המשבצת', () => {
    expect(ALERTS).toContain('...dock.rootStyle');
  });

  it('ההחזרה עוברת דרך dock.render', () => {
    expect(ALERTS).toContain('return dock.render(stack)');
  });

  it('משבצת ריקה נמנעת - אין עגינה כשאין התראות', () => {
    expect(ALERTS).toContain('dockable: hasAlerts');
  });

  it('שחרור מהקונטיינר מחזיר את הערימה למקום שהמצביע עזב בו', () => {
    // בלי שני אלה השחרור "מעלים" את החלון מעבר לקצה
    expect(ALERTS).toContain('setFloatingPos:');
    expect(ALERTS).toContain('floatingPos:');
  });

  it('ההוקים לפני ההחזרה המוקדמת - אחרת סדר ההוקים משתנה בין רינדורים', () => {
    const dockAt = ALERTS.indexOf("useDockableWindow('tripAlerts'");
    const earlyReturn = ALERTS.indexOf('if (!hasAlerts) return null;');
    expect(dockAt).toBeGreaterThan(0);
    expect(earlyReturn).toBeGreaterThan(dockAt);
  });
});

describe('טופס הנסיעה ברוחב קריא', () => {
  it('הטופס בעמודה ממורכזת ולא נמרח על רוחב החלון', () => {
    expect(TRIPS).toContain('const FORM_MAX_W = 920');
    expect(TRIPS).toContain("marginInline: 'auto'");
  });

  it('גם שורת הכפתורים וגם גוף הטופס באותה עמודה', () => {
    // כפתורי "שמור/מחק/שכפל" בקצה המסך וטופס במרכזו נראים כשני מסכים שונים
    const uses = TRIPS.split('formColumn').length - 1;
    expect(uses, 'formColumn מוחל פחות משלוש פעמים (הגדרה + כותרת + גוף)').toBeGreaterThanOrEqual(3);
  });

  it('הרשימה נשארת על כל רוחב החלון', () => {
    // זו הייתה בקשה מפורשת קודמת - הצמצום נוגע לטופס בלבד
    const listAt = TRIPS.indexOf('const listView = (');
    const formAt = TRIPS.indexOf('const FORM_MAX_W');
    expect(listAt).toBeGreaterThan(0);
    expect(formAt).toBeGreaterThan(listAt);
    expect(TRIPS.slice(listAt, formAt)).not.toContain('formColumn');
  });
});
