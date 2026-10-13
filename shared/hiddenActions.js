// קטלוג הכפתורים והפעולות של העמדה - מקור אמת יחיד להסתרה גורפת.
//
// הבקשה (אורי, 2026-10-13): "יכולת בהגדרות כלליות להוריד כללית פעולות וכפתורים.
// לרכז את כל הכפתורים ולשים דגל האם להציג למשתמשים או לא."
//
// כל פעולה כאן מקבלת דגל אחד, כלל-מערכתי, ב"הגדרות כלליות" בניהול. כבוי = הכפתור
// **לא מרונדר בכלל** באף עמדה (לא מושבת ולא אפור - פקד שאי אפשר ללחוץ עליו הוא רעש).
// ההסתרה נוספת **על** התנאים הקיימים (הגדרת עמדה, סוג עמדה): היא יכולה רק להוריד.
//
// נשמר ב-`system_defaults` (key=HIDDEN_ACTIONS_KEY) כמערך JSON של ה-id המוסתרים.
// כך פעולה חדשה שנוספת לקטלוג מוצגת כברירת מחדל - אין צורך במיגרציה.
//
// ⚠️ **מה לא נכנס, בכוונה:** יציאה מהמערכת, ותפריטי "תצוגה" ו"הגדרות" עצמם
// (הפריטים שבתוכם כן). הסתרה שלהם משאירה את הפקח בלי דרך החוצה או בלי גישה לכל
// השאר, וזו מלכודת ולא הגדרה.
//
// להוספת כפתור: שורה כאן + תווית ב-src/i18n/registry/actions.json (actions.<id>)
// + `show('<id>') &&` על הכפתור עצמו (useHiddenActions).

export const HIDDEN_ACTIONS_KEY = 'hiddenActions';

/** סדר הקבוצות במסך הניהול. התווית: actions.group_<id> */
export const ACTION_GROUPS = ['topbar', 'userMenu', 'createMenu', 'viewMenu', 'alerts', 'settingsMenu'];

/** @type {{ id: string, group: string }[]} */
export const ACTIONS = [
  // ── סרגל עליון ─────────────────────────────────────────────────────────
  { id: 'fullPicture', group: 'topbar' },
  { id: 'voice', group: 'topbar' },
  { id: 'dashboard', group: 'topbar' },
  { id: 'mergeSplit', group: 'topbar' },
  { id: 'createMenu', group: 'topbar' },
  { id: 'theme', group: 'topbar' },
  { id: 'freeDesk', group: 'topbar' },
  { id: 'stickyNotes', group: 'topbar' },
  { id: 'serials', group: 'topbar' },
  { id: 'screenshot', group: 'topbar' },
  // ── תפריט משתמש ────────────────────────────────────────────────────────
  { id: 'switchUser', group: 'userMenu' },
  { id: 'updateCrew', group: 'userMenu' },
  { id: 'debrief', group: 'userMenu' },
  { id: 'screenRecording', group: 'userMenu' },
  { id: 'handwritingCalibration', group: 'userMenu' },
  // ── תפריט יצירה ────────────────────────────────────────────────────────
  { id: 'provPoint', group: 'createMenu' },
  { id: 'seizeZone', group: 'createMenu' },
  // ── תפריט תצוגה ────────────────────────────────────────────────────────
  { id: 'messageBoard', group: 'viewMenu' },
  { id: 'peekBar', group: 'viewMenu' },
  { id: 'quickRead', group: 'viewMenu' },
  { id: 'windowContainer', group: 'viewMenu' },
  { id: 'switchView', group: 'viewMenu' },
  { id: 'blockView', group: 'viewMenu' },
  { id: 'loadView', group: 'viewMenu' },
  { id: 'weather', group: 'viewMenu' },
  { id: 'cameraBoard', group: 'viewMenu' },
  { id: 'stripFlow', group: 'viewMenu' },
  { id: 'elementsTable', group: 'viewMenu' },
  { id: 'patternTraffic', group: 'viewMenu' },
  { id: 'groundLayers', group: 'viewMenu' },
  { id: 'vehicleEntry', group: 'viewMenu' },
  { id: 'refreshSettings', group: 'viewMenu' },
  // ── השתקת התראות ───────────────────────────────────────────────────────
  { id: 'muteBlocks', group: 'alerts' },
  { id: 'muteConflicts', group: 'alerts' },
  { id: 'muteLoad', group: 'alerts' },
  // ── תפריט הגדרות ───────────────────────────────────────────────────────
  { id: 'dataWindowsCount', group: 'settingsMenu' },
  { id: 'contactsOnTransfer', group: 'settingsMenu' },
  { id: 'altRangeFormation', group: 'settingsMenu' },
  { id: 'clickPairing', group: 'settingsMenu' },
  { id: 'clearStation', group: 'settingsMenu' },
];

const KNOWN = new Set(ACTIONS.map(a => a.id));

/**
 * ערך גולמי (מה-DB או מגוף הבקשה) -> רשימת id מוסתרים, מנוקה.
 * id שאינו בקטלוג נזרק (פעולה שהוסרה מהקוד לא נגררת לנצח), וכך גם כפילויות.
 * ערך פגום = כלום מוסתר: ברירת המחדל הבטוחה היא המערכת כפי שהייתה.
 */
export function parseHiddenActions(value) {
  let arr = value;
  if (typeof value === 'string') {
    try { arr = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const v of arr) {
    if (typeof v === 'string' && KNOWN.has(v) && !out.includes(v)) out.push(v);
  }
  return out;
}
