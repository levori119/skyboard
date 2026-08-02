import { describe, it, expect } from 'vitest';
import { HELP_TOPICS, visibleHelpTopics, countHelpEntries, type HelpContext } from './helpTopics';
import { REGISTRY } from '../i18n/registry';

// עמדת CTRL "מלאה" — כל הדגלים דלוקים
const FULL: HelpContext = {
  hasPresetId: true,
  isMissionDeskMode: false,
  isGroundMode: false,
  isGroundMgmtMode: false,
  isClassicMode: false,
  isCivilianMode: false,
  isFlightZonesMode: true,
  isDualMapMode: true,
  tableMode: false,
  allowViewSwitching: true,
  showFullPicture: true,
  showDashboard: true,
  showSerials: true,
  hasCameras: true,
  hasTransferPoints: true,
  hasMapImage: true,
  hasGeoMap: true,
};

const ids = (ctx: HelpContext) => visibleHelpTopics(ctx).map(t => t.id);
const itemIds = (ctx: HelpContext, topicId: string) =>
  visibleHelpTopics(ctx).find(t => t.id === topicId)?.items.map(i => i.id) ?? [];

const keyExists = (k: string) => {
  const dot = k.indexOf('.');
  return !!REGISTRY[k.slice(0, dot)]?.keys?.[k.slice(dot + 1)];
};

describe('עזרה לעמדה — מוצג רק מה שקיים בעמדה', () => {
  it('לכל נושא ולכל כפתור שבתוכו יש כותרת וגוף ב-registry', () => {
    const missing: string[] = [];
    for (const t of HELP_TOPICS) {
      for (const k of [t.titleKey, t.bodyKey]) if (!keyExists(k)) missing.push(k);
      for (const item of t.items) {
        for (const k of [item.titleKey, item.bodyKey]) if (!keyExists(k)) missing.push(k);
      }
    }
    expect(missing, `מפתחות עזרה חסרים ב-registry:\n${missing.join('\n')}`).toEqual([]);
  });

  it('מזהי הנושאים ייחודיים, וגם מזהי הכפתורים בתוך כל נושא', () => {
    const seen = HELP_TOPICS.map(t => t.id);
    expect(new Set(seen).size).toBe(seen.length);
    for (const t of HELP_TOPICS) {
      const inner = t.items.map(i => i.id);
      expect(new Set(inner).size, `כפתורים כפולים בנושא ${t.id}`).toBe(inner.length);
    }
  });

  it('כל נושא וכל כפתור נגישים באיזשהו סוג עמדה (אין סעיף מת)', () => {
    const covered = new Set<string>();
    for (const ctx of [FULL, { ...FULL, isMissionDeskMode: true }, { ...FULL, isGroundMode: true }]) {
      for (const t of visibleHelpTopics(ctx)) {
        covered.add(t.id);
        for (const i of t.items) covered.add(`${t.id}.${i.id}`);
      }
    }
    const dead: string[] = [];
    for (const t of HELP_TOPICS) {
      if (!covered.has(t.id)) dead.push(t.id);
      for (const i of t.items) if (!covered.has(`${t.id}.${i.id}`)) dead.push(`${t.id}.${i.id}`);
    }
    expect(dead, `סעיפי עזרה שלא מוצגים באף עמדה:\n${dead.join('\n')}`).toEqual([]);
  });

  it('עמדת CTRL מלאה — כל מה שאינו ייחודי לדסק/שדה', () => {
    const modeOnly = ['deskName'];
    expect(ids(FULL)).toEqual(HELP_TOPICS.filter(t => !modeOnly.includes(t.id)).map(t => t.id));
  });

  it('כפתור שלא הוגדר לעמדה לא מקבל סעיף עזרה', () => {
    const lean = ids({ ...FULL, showDashboard: false, showSerials: false, showFullPicture: false });
    expect(lean).not.toContain('dashboard');
    expect(lean).not.toContain('serials');
    expect(lean).not.toContain('fullPicture');
    expect(lean).toContain('viewMenu');
    expect(lean).toContain('userMenu');
  });

  it('פריט בתוך תפריט נעלם לפי אותו תנאי שמרנדר אותו', () => {
    // מצלמות: הפריט בתפריט תצוגה קיים רק כשיש אלמנט עם מצלמה
    expect(itemIds(FULL, 'viewMenu')).toContain('cameras');
    expect(itemIds({ ...FULL, hasCameras: false }, 'viewMenu')).not.toContain('cameras');
    // דו-מפה
    expect(itemIds({ ...FULL, isDualMapMode: false }, 'viewMenu')).not.toContain('dualSwap');
    // שידוך בלחיצה — רק במסך אזורי טיסה
    expect(itemIds(FULL, 'settingsMenu')).toContain('clickPairing');
    expect(itemIds({ ...FULL, isFlightZonesMode: false }, 'settingsMenu')).not.toContain('clickPairing');
    // מפה עיוורת רק כשיש תמונת רקע, סגירות רק במפה מעוגנת נ"צ
    expect(itemIds({ ...FULL, hasMapImage: false }, 'mapToolbar')).not.toContain('blind');
    expect(itemIds({ ...FULL, hasGeoMap: false }, 'mapToolbar')).not.toContain('closures');
  });

  it('כל תפריט מפרט את הכפתורים שבתוכו', () => {
    for (const id of ['userMenu', 'viewMenu', 'settingsMenu', 'createMenu', 'stationName']) {
      const t = HELP_TOPICS.find(x => x.id === id)!;
      expect(t.items.length, `לתפריט ${id} אין פירוט כפתורים`).toBeGreaterThan(1);
    }
  });

  it('המסך מתואר: חלונות פ"ממים, נקודות העברה, עזרים, מפה וסרגל המפה + מונחים', () => {
    const all = ids(FULL);
    for (const id of ['stripsPanel', 'transferPanel', 'aidsPanel', 'mapView', 'mapToolbar', 'glossary']) {
      expect(all, `חסר נושא ${id}`).toContain(id);
    }
    expect(itemIds(FULL, 'glossary'), 'המונחים כוללים נקודת העברה').toContain('transferPoint');
  });

  it('דסק משימה — בלי פ"ממים, מפה ונקודות העברה, עם שם דסק', () => {
    const desk = ids({ ...FULL, isMissionDeskMode: true });
    expect(desk).toContain('deskName');
    expect(desk).not.toContain('stationName');
    expect(desk).not.toContain('stripsPanel');
    expect(desk).not.toContain('transferPanel');
    expect(desk).not.toContain('mapView');
    expect(desk).not.toContain('mapToolbar');
    expect(desk).not.toContain('aidsPanel');
    expect(desk).not.toContain('createMenu');
    // בתפריט התצוגה נשארים רק הפריטים שאינם תלויי פ"ממים
    const deskView = itemIds({ ...FULL, isMissionDeskMode: true }, 'viewMenu');
    expect(deskView).toContain('messageBoard');
    expect(deskView).not.toContain('map');
    expect(deskView).not.toContain('blockView');
  });

  it('עמדת שדה קרקעי — שכבות ורכבים בתפריט התצוגה, בלי חלון פ"ממים ומפת בקר', () => {
    const ctx = { ...FULL, isGroundMode: true };
    expect(itemIds(ctx, 'viewMenu')).toEqual(expect.arrayContaining(['layers', 'vehicles']));
    expect(ids(ctx)).not.toContain('stripsPanel');
    expect(ids(ctx)).not.toContain('mapView');
    expect(ids(ctx)).not.toContain('mergeSplitStrip');
  });

  it('המונה סופר נושאים + כפתורים', () => {
    const topics = visibleHelpTopics(FULL);
    const expected = topics.length + topics.reduce((n, t) => n + t.items.length, 0);
    expect(countHelpEntries(topics)).toBe(expected);
    expect(countHelpEntries(topics)).toBeGreaterThan(topics.length);
  });
});
