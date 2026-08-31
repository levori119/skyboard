import { describe, it, expect, beforeEach } from 'vitest';
import {
  DOCK_DEFAULT_WIDTH, DOCK_MAX_WIDTH, DOCK_MIN_WIDTH,
  DEFAULT_DOCK_POSITION, DOCK_COL_WIDTH, DOCK_MAX_COLS, DOCK_POSITION_ORDER, dockColumns, dockInsertIndexGrid,
  dockInsertIndex, dockLoad, dockPlace, dockPut, dockRemove, dockSetPosition, dockSetWidth, setDockDefaultPosition,
  isDockEnabled, isDocked, setDockEnabled, setDockPreset, __resetDockForTests,
} from './windowDock';

// מה שנבדק כאן הוא ה**סידור** שהפקח רואה בקונטיינר: לאיזו משבצת נכנס חלון
// שנגרר, ומה קורה כשמזיזים חלון שכבר מעוגן. בדיקת הפגיעה עצמה תלוית DOM
// (getBoundingClientRect) ואינה זמינה כאן - ולכן חושבה לפונקציה טהורה מעל
// אמצעי המשבצות, וזו הנבדקת.

/** localStorage מינימלי - אין jsdom בסביבת הבדיקות */
function stubStorage(): void {
  const mem = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); },
    clear: () => mem.clear(),
  };
}

beforeEach(() => {
  __resetDockForTests();
  stubStorage();
});

describe('dockPlace - סדר החלונות בקונטיינר', () => {
  it('מכניס חלון חדש בדיוק במקום שאליו שוחרר', () => {
    expect(dockPlace(['a', 'b'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(dockPlace(['a', 'b'], 'c', 1)).toEqual(['a', 'c', 'b']);
    expect(dockPlace(['a', 'b'], 'c', 2)).toEqual(['a', 'b', 'c']);
  });

  it('index מעבר לקצוות נצמד לקצה - שחרור מתחת לרשימה מוסיף בסוף', () => {
    expect(dockPlace(['a', 'b'], 'c', 99)).toEqual(['a', 'b', 'c']);
    expect(dockPlace(['a', 'b'], 'c', -5)).toEqual(['c', 'a', 'b']);
  });

  it('חלון מעוגן לא מופיע פעמיים - הזזה ולא הוספה', () => {
    expect(dockPlace(['a', 'b', 'c'], 'a', 3)).toEqual(['b', 'c', 'a']);
    expect(dockPlace(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
  });

  it('שחרור בדיוק במקום הנוכחי לא מזיז - הקיזוז בגרירה כלפי מטה', () => {
    // 'a' יושב במשבצת 0; שחרור מתחת לאמצע שלה מחזיר index=1 מבדיקת הפגיעה
    expect(dockPlace(['a', 'b', 'c'], 'a', 1)).toEqual(['a', 'b', 'c']);
    expect(dockPlace(['a', 'b', 'c'], 'b', 2)).toEqual(['a', 'b', 'c']);
  });

  it('גרירה כלפי מטה משבצת אחת מזיזה בדיוק אחת', () => {
    expect(dockPlace(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'a', 'c']);
  });
});

describe('dockInsertIndex - לאיזו משבצת שוחרר החלון', () => {
  const mids = [100, 200, 300]; // אמצעי שלוש משבצות

  it('מעל האמצע של הראשונה - נכנס לפניה', () => {
    expect(dockInsertIndex(mids, 40)).toBe(0);
    expect(dockInsertIndex(mids, 99)).toBe(0);
  });

  it('בין האמצעים - נכנס בין המשבצות', () => {
    expect(dockInsertIndex(mids, 101)).toBe(1);
    expect(dockInsertIndex(mids, 250)).toBe(2);
  });

  it('מתחת לאמצע האחרונה - נכנס בסוף', () => {
    expect(dockInsertIndex(mids, 301)).toBe(3);
  });

  it('קונטיינר ריק - כל שחרור נכנס למשבצת הראשונה', () => {
    expect(dockInsertIndex([], 500)).toBe(0);
  });
});

describe('מצב הקונטיינר', () => {
  it('כשהקונטיינר סגור שום חלון אינו מעוגן - גם אם נשמר סידור', () => {
    setDockPreset(7);
    setDockEnabled(true);
    dockPut('sticky:1', 0);
    expect(isDocked('sticky:1')).toBe(true);

    setDockEnabled(false);
    expect(isDockEnabled()).toBe(false);
    // החלון חוזר לצוף, אבל הסידור נשמר לפתיחה הבאה
    expect(isDocked('sticky:1')).toBe(false);
    expect(dockLoad().items).toEqual(['sticky:1']);
  });

  it('הסידור נפרד לכל עמדה', () => {
    setDockEnabled(true);
    setDockPreset(1);
    dockPut('signalBoard', 0);
    setDockPreset(2);
    expect(dockLoad().items).toEqual([]);
    setDockPreset(1);
    expect(dockLoad().items).toEqual(['signalBoard']);
  });

  it('שחרור חלון מוציא אותו מהרשימה', () => {
    setDockEnabled(true);
    setDockPreset(3);
    dockPut('a', 0);
    dockPut('b', 1);
    dockRemove('a');
    expect(dockLoad().items).toEqual(['b']);
  });
});

describe('רוחב הקונטיינר', () => {
  it('ברירת מחדל כשאין שמירה', () => {
    setDockPreset(9);
    expect(dockLoad().width).toBe(DOCK_DEFAULT_WIDTH);
  });

  it('נצמד לתחום - גרירת הספליטר לא מבטלת את הקונטיינר ולא בולעת את המסך', () => {
    setDockPreset(9);
    dockSetWidth(10);
    expect(dockLoad().width).toBe(DOCK_MIN_WIDTH);
    dockSetWidth(5000);
    expect(dockLoad().width).toBe(DOCK_MAX_WIDTH);
  });

  it('רוחב פגום באחסון לא מפיל את הקונטיינר', () => {
    setDockPreset(9);
    localStorage.setItem('skWindowDock_9', JSON.stringify({ items: ['a'], width: 'רחב' }));
    expect(dockLoad()).toEqual({ items: ['a'], width: DOCK_DEFAULT_WIDTH, position: DEFAULT_DOCK_POSITION });
  });

  it('JSON פגום באחסון מחזיר מצב ריק ולא חריגה', () => {
    setDockPreset(9);
    localStorage.setItem('skWindowDock_9', '{לא JSON');
    expect(dockLoad()).toEqual({ items: [], width: DOCK_DEFAULT_WIDTH, position: DEFAULT_DOCK_POSITION });
  });
});

describe('מיקום הקונטיינר בשורת העמדה', () => {
  it('ברירת מחדל: בין הפ"מים לעזרים', () => {
    setDockPreset(11);
    expect(dockLoad().position).toBe('beforeAids');
  });

  it('הבחירה נשמרת ונטענת מחדש', () => {
    setDockPreset(11);
    dockSetPosition('right');
    expect(dockLoad().position).toBe('right');
    setDockPreset(12);
    expect(dockLoad().position).toBe(DEFAULT_DOCK_POSITION); // פר-עמדה
    setDockPreset(11);
    expect(dockLoad().position).toBe('right');
  });

  it('שינוי מיקום לא מאבד את סידור החלונות ואת הרוחב', () => {
    setDockEnabled(true);
    setDockPreset(13);
    dockPut('a', 0);
    dockPut('b', 1);
    dockSetWidth(320);
    dockSetPosition('left');
    const st = dockLoad();
    expect(st.items).toEqual(['a', 'b']);
    expect(st.width).toBe(320);
    expect(st.position).toBe('left');
  });

  it('מיקום פגום באחסון נופל לברירת המחדל ולא מעלים את הקונטיינר', () => {
    setDockPreset(14);
    localStorage.setItem('skWindowDock_14', JSON.stringify({ items: [], width: 280, position: 'מאחורה' }));
    expect(dockLoad().position).toBe(DEFAULT_DOCK_POSITION);
  });

  it('ה-order של כל מיקום נופל בין העמודות הנכונות', () => {
    // נקודות=1|3 · מפה=2 · פ"מים=5 · עזרים=7
    expect(DOCK_POSITION_ORDER.left).toBeLessThan(1);
    expect(DOCK_POSITION_ORDER.mapRight).toBeGreaterThan(3);
    expect(DOCK_POSITION_ORDER.mapRight).toBeLessThan(5);
    expect(DOCK_POSITION_ORDER.beforeAids).toBeGreaterThan(5);
    expect(DOCK_POSITION_ORDER.beforeAids).toBeLessThan(7);
    expect(DOCK_POSITION_ORDER.right).toBeGreaterThan(7);
  });
});

describe('פריסה לרוחב - כמה חלונות זה לצד זה', () => {
  it('ברוחב רגיל עמודה אחת, ומעבר לו שניים זה לצד זה', () => {
    expect(dockColumns(DOCK_COL_WIDTH - 1)).toBe(1);
    expect(dockColumns(DOCK_COL_WIDTH)).toBe(1);
    expect(dockColumns(DOCK_COL_WIDTH * 2)).toBe(2);
    expect(dockColumns(DOCK_COL_WIDTH * 3)).toBe(3);
  });

  it('לא יורד מעמודה אחת ולא עובר את התקרה', () => {
    expect(dockColumns(0)).toBe(1);
    expect(dockColumns(50)).toBe(1);
    expect(dockColumns(99999)).toBe(DOCK_MAX_COLS);
  });
});

describe('dockInsertIndexGrid - שחרור ברשת', () => {
  // שתי שורות, שתי עמודות: 0,1 למעלה · 2,3 למטה
  const rects = [
    { top: 0, bottom: 100, left: 0, right: 100 },
    { top: 0, bottom: 100, left: 100, right: 200 },
    { top: 100, bottom: 200, left: 0, right: 100 },
    { top: 100, bottom: 200, left: 100, right: 200 },
  ];

  it('בחצי השמאלי של משבצת - נכנס לפניה', () => {
    expect(dockInsertIndexGrid(rects, 10, 50)).toBe(0);
    expect(dockInsertIndexGrid(rects, 110, 50)).toBe(1);
  });

  it('בחצי הימני - נכנס אחריה', () => {
    expect(dockInsertIndexGrid(rects, 90, 50)).toBe(1);
    expect(dockInsertIndexGrid(rects, 190, 50)).toBe(2);
  });

  it('בשורה השנייה - ממשיך את סדר הקריאה', () => {
    expect(dockInsertIndexGrid(rects, 10, 150)).toBe(2);
    expect(dockInsertIndexGrid(rects, 190, 150)).toBe(4);
  });

  it('מתחת לכל השורות - בסוף הרשימה', () => {
    expect(dockInsertIndexGrid(rects, 50, 500)).toBe(4);
  });

  it('רשת ריקה - המשבצת הראשונה', () => {
    expect(dockInsertIndexGrid([], 50, 50)).toBe(0);
  });
});

describe('ברירת המחדל של העמדה למיקום', () => {
  it('חלה כל עוד הפקח לא בחר בעצמו', () => {
    setDockPreset(21);
    setDockDefaultPosition('right');
    expect(dockLoad().position).toBe('right');
  });

  it('בחירת הפקח גוברת על ברירת המחדל', () => {
    setDockPreset(22);
    setDockDefaultPosition('right');
    dockSetPosition('left');
    expect(dockLoad().position).toBe('left');
    // שינוי ההגדרה בניהול לא דורס את מי שכבר בחר
    setDockDefaultPosition('mapRight');
    expect(dockLoad().position).toBe('left');
  });

  it('שינוי ההגדרה בניהול חל מיד על מי שלא בחר', () => {
    setDockPreset(23);
    expect(dockLoad().position).toBe(DEFAULT_DOCK_POSITION);
    setDockDefaultPosition('mapRight');
    expect(dockLoad().position).toBe('mapRight');
  });

  it('עגינה ושינוי רוחב לא מקבעים את ברירת המחדל כבחירה', () => {
    setDockEnabled(true);
    setDockPreset(24);
    setDockDefaultPosition('right');
    dockPut('a', 0);
    dockSetWidth(300);
    // עדיין "לא נבחר" - ולכן שינוי בניהול ממשיך לחול
    setDockDefaultPosition('left');
    expect(dockLoad().position).toBe('left');
    expect(dockLoad().items).toEqual(['a']);
  });

  it('ערך פגום מהשרת נופל לברירת המחדל של המערכת', () => {
    setDockPreset(25);
    setDockDefaultPosition('בצד' as never);
    expect(dockLoad().position).toBe(DEFAULT_DOCK_POSITION);
  });
});
