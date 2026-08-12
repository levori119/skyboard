// עזרה לעמדה — רישום נושאי העזרה + סינון לפי מה שבאמת מוצג בעמדה.
//
// עקרון: חלון העזרה מספרר ומסביר **רק** את מה שהמפעיל רואה מולו. כפתור שלא
// נבחר להצגה בבניית העמדה (למשל "דש בורד" בעמדה בלי show_dashboard) לא מופיע
// בעזרה - אחרת העזרה מלמדת על כפתורים שלא קיימים ומאבדת אמון.
//
// המבנה דו-שכבתי: נושא = תפריט / חלון / אזור מסך, ותחתיו פריטים = הכפתורים
// שבתוכו. הספרור הוא n ו-n.m, ורץ **אחרי** הסינון בשתי השכבות.
//
// כדי שזה לא יתיישן: התנאי בכל נושא ופריט חייב להיות **אותו תנאי** שמרנדר את
// הרכיב ב-SectorDashboard. הפניה לתנאי המקורי רשומה ליד כל אחד.

export type HelpContext = {
  hasPresetId: boolean;
  isMissionDeskMode: boolean;
  isGroundMode: boolean;
  isGroundMgmtMode: boolean;
  isClassicMode: boolean;
  isCivilianMode: boolean;
  isFlightZonesMode: boolean;
  isDualMapMode: boolean;
  tableMode: boolean;
  allowViewSwitching: boolean;
  showFullPicture: boolean;
  showDashboard: boolean;
  showSerials: boolean;
  hasCameras: boolean;
  /** יש סקטורים מוגדרים → חלון נקודות ההעברה מרונדר */
  hasTransferPoints: boolean;
  /** למפה יש תמונת רקע → כפתור "מפה עיוורת" */
  hasMapImage: boolean;
  /** המפה מעוגנת גיאוגרפית → כפתור הסגירות */
  hasGeoMap: boolean;
};

type When = (c: HelpContext) => boolean;

export type HelpItem = {
  id: string;
  icon: string;
  /** מפתחות i18n: help.<topicId>_<id>Title / ...Body */
  titleKey: string;
  bodyKey: string;
  when?: When;
};

export type HelpTopic = {
  /** מזהה טכני יציב - משמש כמפתח React, כעוגן `data-help` במסך, ובבדיקות */
  id: string;
  /** אימוג'י מזהה, כמו שמופיע במסך עצמו */
  icon: string;
  /** מפתחות i18n: help.<id>Title / help.<id>Body / help.<id>Where */
  titleKey: string;
  bodyKey: string;
  /** **איפה זה על המסך** - נקרא לצד ההסבר וב"הצג לי" */
  whereKey: string;
  /** הכפתורים שבתוך התפריט / החלון */
  items: HelpItem[];
  /** האם הנושא מוצג בעמדה הזו. ברירת מחדל: תמיד */
  when?: When;
};

/** פריט (כפתור בתוך תפריט). המפתחות נגזרים מ-<topicId>_<id> */
const it = (topicId: string, id: string, icon: string, when?: When): HelpItem => ({
  id, icon, titleKey: `help.${topicId}_${id}Title`, bodyKey: `help.${topicId}_${id}Body`, when,
});

const topic = (id: string, icon: string, when?: When, items: HelpItem[] = []): HelpTopic => ({
  id, icon,
  titleKey: `help.${id}Title`, bodyKey: `help.${id}Body`, whereKey: `help.${id}Where`,
  items, when,
});

// ── תנאי תצוגה חוזרים (מראה של SectorDashboard) ────────────────────────────
const notDesk: When = c => !c.isMissionDeskMode;
const isGround: When = c => c.isGroundMode;
// המפה המרכזית של הבקר. עמדת שדה קרקעי מציגה מפה משלה (GroundView), וקלאסית /
// אזרחית / דסק כלל לא.
const hasCtrlMap: When = c => !c.isMissionDeskMode && !c.isGroundMode && !c.isClassicMode && !c.isCivilianMode;

// הסדר כאן = סדר הספרור בחלון העזרה: קודם הסרגל העליון בסדר הקריאה, ואחריו
// חלונות המסך מימין לשמאל, ולבסוף מונחים.
export const HELP_TOPICS: HelpTopic[] = [
  topic('systemIcon', 'ℹ️'),
  topic('envBadge', '🎓'),
  // {isMissionDeskMode ? <chip שם הדסק> : <button מיזוג/פיצול>}
  topic('deskName', '🗂', c => c.isMissionDeskMode),
  topic('stationName', '🏷', notDesk, [
    it('stationName', 'merge', '🔗'),
    it('stationName', 'split', '✂️'),
  ]),
  topic('userMenu', '👤', undefined, [
    it('userMenu', 'switch', '🔄'),
    it('userMenu', 'crew', '👥'),
    it('userMenu', 'debrief', '📝'),
    it('userMenu', 'calibration', '✍'),
    it('userMenu', 'logout', '🚪'),
  ]),
  topic('signalBoard', '📡', c => c.hasPresetId),
  topic('pressure', '🌡'),
  topic('mazaa', '🛡'),
  // loadLevel !== 'none' && !muteLoadAlerts && !isGroundMgmtMode
  topic('load', '🔴', c => !c.isGroundMgmtMode),
  // myPresetConfig?.show_full_picture && !isMissionDeskMode
  topic('fullPicture', '🌐', c => c.showFullPicture && !c.isMissionDeskMode),
  topic('voice', '🎤', notDesk),
  // myPresetConfig?.show_dashboard
  topic('dashboard', '📊', c => c.showDashboard),
  // !isClassicMode && !isGroundMode && !isMissionDeskMode && !tableMode
  topic('mergeSplitStrip', '🔀', c => !c.isClassicMode && !c.isGroundMode && !c.isMissionDeskMode && !c.tableMode),
  topic('createMenu', '✚', notDesk, [
    it('createMenu', 'provCreate', '➕'),
    it('createMenu', 'provApprove', '✔'),
    it('createMenu', 'provActive', '🔀'),
  ]),
  topic('viewMenu', '🗺', undefined, [
    it('viewMenu', 'messageBoard', '📡'),
    it('viewMenu', 'peek', '🖥'),
    // allow_view_switching !== false && !isMissionDeskMode
    it('viewMenu', 'map', '🗺', c => c.allowViewSwitching && !c.isMissionDeskMode),
    it('viewMenu', 'table', '📋', c => c.allowViewSwitching && !c.isMissionDeskMode),
    it('viewMenu', 'blockView', '📶', notDesk),
    it('viewMenu', 'load', '📈', c => !c.isGroundMgmtMode),
    it('viewMenu', 'weather', '🌦'),
    it('viewMenu', 'dualSwap', '🔄', c => c.isDualMapMode),
    it('viewMenu', 'cameras', '📷', c => c.hasCameras),
    it('viewMenu', 'layers', '🗂', isGround),
    it('viewMenu', 'vehicles', '🚛', isGround),
  ]),
  topic('settingsMenu', '⚙️', undefined, [
    it('settingsMenu', 'loadForecast', '📈', c => !c.isGroundMgmtMode),
    it('settingsMenu', 'muteLoad', '🔕', c => !c.isGroundMgmtMode),
    it('settingsMenu', 'muteBlocks', '🟢'),
    it('settingsMenu', 'contacts', '📡'),
    it('settingsMenu', 'altRange', '📐'),
    it('settingsMenu', 'clickPairing', '🎯', c => c.isFlightZonesMode),
    it('settingsMenu', 'refresh', '🔄'),
    it('settingsMenu', 'clear', '🧹'),
  ]),
  topic('theme', '☀️'),
  topic('notepad', '🖊️'),
  topic('stickyNotes', '📝', undefined, [
    it('stickyNotes', 'add', '➕'),
    it('stickyNotes', 'restore', '📂'),
    it('stickyNotes', 'send', '📨'),
  ]),
  // myPresetConfig?.show_serials !== false
  topic('serials', '🔢', c => c.showSerials),
  topic('clock', '🕐'),

  // ── חלונות המסך ────────────────────────────────────────────────────────
  // allSectors.length > 0 && !isClassicMode && !isGroundMode && !isMissionDeskMode
  topic('transferPanel', '📍', c => c.hasTransferPoints && !c.isClassicMode && !c.isGroundMode && !c.isMissionDeskMode, [
    it('transferPanel', 'point', '📍'),
    it('transferPanel', 'giverReceiver', '↔'),
    it('transferPanel', 'card', '🎫'),
    it('transferPanel', 'accept', '✔'),
    it('transferPanel', 'ack', '👂'),
    it('transferPanel', 'reject', '✖'),
    it('transferPanel', 'note', '💬'),
    it('transferPanel', 'showPending', '👁'),
    it('transferPanel', 'resetFixed', '↺'),
    it('transferPanel', 'prov', '🔀'),
  ]),
  // display: (isGroundMode || isMissionDeskMode) ? 'none'
  topic('stripsPanel', '🎫', c => !c.isGroundMode && !c.isMissionDeskMode, [
    it('stripsPanel', 'pin', '📌'),
    it('stripsPanel', 'filter', '🔍'),
    it('stripsPanel', 'add', '➕'),
    it('stripsPanel', 'groupMode', '🗂', c => c.isFlightZonesMode),
    it('stripsPanel', 'search', '🔎'),
    it('stripsPanel', 'drag', '✋'),
    it('stripsPanel', 'card', '🎫'),
    it('stripsPanel', 'return', '↩'),
  ]),
  topic('mapView', '🗺', hasCtrlMap, [
    it('mapView', 'zones', '🟦', c => c.isFlightZonesMode),
    it('mapView', 'altBlocks', '📶', c => c.isFlightZonesMode),
    it('mapView', 'pins', '✈'),
    it('mapView', 'conflict', '🔴', c => c.isFlightZonesMode),
    it('mapView', 'tPoints', '📍'),
    it('mapView', 'zoneMenu', '🖱', c => c.isFlightZonesMode),
    it('mapView', 'pan', '✋'),
    it('mapView', 'closures', '🚫', c => c.hasGeoMap),
  ]),
  topic('mapToolbar', '🧰', hasCtrlMap, [
    it('mapToolbar', 'brightness', '☀'),
    it('mapToolbar', 'zoom', '➕'),
    it('mapToolbar', 'reset', '↺'),
    it('mapToolbar', 'pan', '▲'),
    it('mapToolbar', 'blind', '🙈', c => c.hasMapImage),
    it('mapToolbar', 'draw', '✏'),
    it('mapToolbar', 'weather', '🌦'),
    it('mapToolbar', 'closures', '🚫', c => c.hasGeoMap),
    it('mapToolbar', 'pinType', '✈', c => c.isFlightZonesMode),
    it('mapToolbar', 'pinSize', '🅰', c => c.isFlightZonesMode),
  ]),
  topic('aidsPanel', '🧰', notDesk, [
    it('aidsPanel', 'pin', '📌'),
    it('aidsPanel', 'items', '📄'),
    it('aidsPanel', 'blocks', '🗂️'),
    it('aidsPanel', 'policies', '📌'),
    it('aidsPanel', 'links', '🔗'),
    it('aidsPanel', 'runways', '🛬'),
    it('aidsPanel', 'taxiways', '🛣'),
    it('aidsPanel', 'atis', '📻'),
    it('aidsPanel', 'contacts', '📞'),
    it('aidsPanel', 'baseStatus', '🏛'),
    it('aidsPanel', 'checklist', '☑'),
    it('aidsPanel', 'bdh', '📋'),
  ]),

  // ── מונחים ─────────────────────────────────────────────────────────────
  topic('glossary', '📖', undefined, [
    it('glossary', 'pmm', '🎫'),
    it('glossary', 'transferPoint', '📍'),
    it('glossary', 'giver', '↩'),
    it('glossary', 'receiver', '↪'),
    it('glossary', 'prov', '🔀'),
    it('glossary', 'zone', '🟦'),
    it('glossary', 'block', '📶'),
    it('glossary', 'serial', '🔢'),
    it('glossary', 'bdh', '📋'),
    it('glossary', 'mazaa', '🛡'),
    it('glossary', 'load', '🔴'),
    it('glossary', 'merge', '🔗'),
  ]),
];

/**
 * רק הנושאים והפריטים שרלוונטיים לעמדה הנוכחית, בסדר התצוגה.
 * הסינון חל על שתי השכבות; נושא נשאר גם אם כל פריטיו סוננו (ההסבר הכללי שלו
 * עדיין נכון), אך נושא שהתנאי שלו נכשל יורד כולו.
 */
export function visibleHelpTopics(ctx: HelpContext): HelpTopic[] {
  return HELP_TOPICS
    .filter(t => !t.when || t.when(ctx))
    .map(t => ({ ...t, items: t.items.filter(i => !i.when || i.when(ctx)) }));
}

/** סך הסעיפים שיוצגו (נושאים + פריטים) — למונה בכותרת החלון */
export function countHelpEntries(topics: HelpTopic[]): number {
  return topics.reduce((n, t) => n + 1 + t.items.length, 0);
}
