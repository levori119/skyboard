/**
 * **גובה דסק (גובה במרחב)** - הגובה הפנימי של פ"מ בדסק במוד טבלה, נפרד מהגובה של
 * הפ"מ עצמו. הוא הגובה הראשי לעבודה במרחבים של הדסק - הקונפליקטים והבלוקים - ולא
 * משפיע על עמדות אחרות או על נקודות ההעברה. חל גם על פ"מ שאצלי.
 *
 * פ"מ יכול להיות בכמה דסקים, ובכל אחד בגובה אחר: מכינים את הדסק עוד לפני
 * שהפ"מ הגיע. הגובה שעל הפ"מ (`strips.alt`) שייך לעמדה שמחזיקה אותו - זה הגובה
 * שבו **נקבל** אותו - ולכן בדסק שאינו מחזיק את הפ"מ:
 *
 * | | |
 * |---|---|
 * | **התצוגה** | הגובה שהדסק קבע (`strip_table_assignments.planned_alt`), ובלעדיו - בלי גובה. גם בחלון הפ"מים |
 * | **עריכה** | נשמרת כגובה הדסק, ולא נוגעת בגובה של העמדה המחזיקה |
 * | **גובה קבלה/מסירה** | נפרד מגובה המרחב (`planned_receive_alt`): הגובה שבו הדסק רוצה לקבל את הפ"מ. הוא - ולא גובה המרחב - נכנס להעברה כשהפ"מ בנקודת ההעברה למסירה (`server/db/plannedReceiveAlt.js`) |
 * | **גובה מרחב שונה מגובה הקבלה** | שאלה: לעדכן את העמדה המוסרת? כן = גובה הקבלה = גובה המרחב |
 * | **חריגה מגבהי הקבלה** | התראה כשגובה הקבלה אינו בגבהים שהוגדרו לעמדה בנקודת ההעברה (`receiveAltViolations`) |
 * | **אחרי הקבלה** | הפ"מ אצלי - הגובה שלו הוא האמיתי, וגובה הדסק נמחק בשרת |
 * | **הועבר אליי / דגל "אצלי"** | הפ"מ באחריותי: עדכון גובה **לא** שואל על המוסרת ולא מתריע על גבהי הקבלה (`senderAlertsOff`) |
 *
 * פ"מ שאין לו עמדה מחזיקה (`workstation_preset_id` ריק) אינו "של אחר" - הגובה
 * שלו נערך ישירות, כמו קודם.
 */
import { parseAltHundreds } from './altRecommend';
import { configRules, ruleStation } from '../../shared/transferPointAltRules.js';
import { presetSectorIds } from '../../shared/transferPointStations.js';

export interface DeskAltEntry { alt: string | null; to_sender?: boolean; receive_alt?: string | null; mode?: 'receive' | 'send' | null; mine?: boolean }

const pidOf = (v: unknown) => (v == null || v === '' ? null : Number(v));

/** הפ"מ אצל עמדה אחרת (או בדרך אליי בהעברה) - הגובה שלו אינו של הדסק */
export function isForeignToDesk(strip: any, presetId: number | null | undefined): boolean {
  if (!strip || presetId == null) return false;
  const holder = pidOf(strip.workstation_preset_id);
  if (holder == null) return false;
  return holder !== Number(presetId) || strip.status === 'pending_transfer';
}

/** הרשומה של הדסק הזה על הפ"מ: גובה במרחב, גובה קבלה/מסירה, והבקשה הישנה לעדכן את המוסרת */
export function deskAltEntry(strip: any, presetId: number): DeskAltEntry | null {
  const e = strip?.table_alts?.[String(presetId)];
  if (!e || typeof e !== 'object' || (!e.alt && !e.receive_alt && !e.mode && !e.mine)) return null;
  const mode = e.mode === 'receive' || e.mode === 'send' ? e.mode : null;
  return { alt: e.alt ? String(e.alt) : null, to_sender: !!e.to_sender, receive_alt: e.receive_alt ? String(e.receive_alt) : null, mode, mine: !!e.mine };
}

/**
 * הפ"מ כבר באחריותי, ולכן עדכון גובה **לא** מקפיץ את התראות העמדה המוסרת ("לעדכן
 * את המוסרת?", חריגה מגבהי הקבלה): הוא **הועבר אליי** (העברה פתוחה אל העמדה), או
 * שהפקח סימן עליו את הדגל **"אצלי"** בדסק
 */
export function senderAlertsOff(strip: any, presetId: number | null | undefined, transferredToMe: boolean): boolean {
  if (transferredToMe) return true;
  return presetId != null && !!deskAltEntry(strip, Number(presetId))?.mine;
}

/**
 * הפ"מ כפי שהדסק רואה אותו. `alt` הוא **גובה המרחב** - הגובה הפנימי של הדסק:
 *
 * | | גובה המרחב (`alt`) | גובה מסירה/קבלה (`_handoverAlt`) |
 * |---|---|---|
 * | **פ"מ של עמדה אחרת** | של הדסק, ובלעדיו ריק | תמיד **קבלה**: הגובה שהדסק ביקש, ובלעדיו הגובה שעליו |
 * | **פ"מ שאצלי** | של הדסק, ובלעדיו הגובה שעליו | לפי הדגל (`mode`): **קבלה** (ברירת המחדל - פ"מ שנגרר מחלון הפ"מים בדרך כלל מחכה לקבלה) או **מסירה** - גובה המסירה שנקבע בדסק. קבלת העברה מעבירה למסירה ומוחקת את הערך |
 *
 * הגובה שעל פ"מ של עמדה אחרת נשמר ב-`_receiveAlt`.
 */
export function withDeskAlt<T extends Record<string, any>>(strip: T, presetId: number): T {
  const e = deskAltEntry(strip, presetId);
  if (!isForeignToDesk(strip, presetId)) {
    const mode = e?.mode ?? 'receive';
    return {
      ...strip, alt: e?.alt || strip.alt || '', _receiveAlt: strip.alt ?? '',
      // במסירה - גובה המסירה שנקבע בדסק. אחרי קבלה הוא ריק עד שנקבע (או "גובה נוכחי")
      _handoverAlt: mode === 'receive' ? (e?.receive_alt || strip.alt || '') : (e?.receive_alt ?? ''), _handoverMode: mode,
    };
  }
  return { ...strip, alt: e?.alt ?? '', _receiveAlt: strip.alt ?? '', _handoverAlt: e?.receive_alt || strip.alt || '', _handoverMode: 'receive' };
}

/** גובה המסירה/קבלה כפי שהדסק רואה אותו. פ"מ שאצלי - הגובה שעליו */
export function handoverAltOf(strip: any): string {
  return String(strip?._handoverAlt ?? strip?.alt ?? '');
}

/** 'receive' - השדה הוא הגובה שאני מבקש לקבל; 'send' - גובה המסירה (הגובה שעל הפ"מ) */
export function handoverModeOf(strip: any): 'receive' | 'send' {
  return strip?._handoverMode === 'send' ? 'send' : 'receive';
}

/** "גובה נוכחי": הגובה בבלוק כגובה מסירה - בכמה גבהים (מבנה) הנמוך מהם */
export function lowestAlt(alt: string | null | undefined): string {
  const r = parseAltHundreds(alt);
  return r ? String(r.lo) : '';
}

/** אפשר להחליף קבלה/מסירה רק בפ"מ שאינו אצל עמדה אחרת - פ"מ של אחר הוא תמיד קבלה */
export function canToggleHandover(strip: any, presetId: number | null | undefined): boolean {
  return presetId != null && !!strip && !isForeignToDesk(strip, presetId);
}

/** אותו גובה ("FL120" = "120" = "12000"); שני ריקים - שווים */
export function sameAlt(a: string | null | undefined, b: string | null | undefined): boolean {
  const ra = parseAltHundreds(a), rb = parseAltHundreds(b);
  if (!ra || !rb) return !ra && !rb;
  return ra.lo === rb.lo && ra.hi === rb.hi;
}

export interface AltCondition { alt_min: number | null; alt_max: number | null; parity: 'any' | 'even' | 'odd' }
export interface ReceiveAltViolation { sectorId: number; conditions: AltCondition[] }

const numOrNull = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** גובה במאות רגל עומד בתנאי (זוגיות - לפי האלפים, כמו בבדיקת השליחה) */
export function levelAllowed(v: number, c: AltCondition): boolean {
  if (c.alt_min != null && v < c.alt_min) return false;
  if (c.alt_max != null && v > c.alt_max) return false;
  const thousands = Math.floor(v / 10);
  if (c.parity === 'even' && thousands % 2 !== 0) return false;
  if (c.parity === 'odd' && thousands % 2 === 0) return false;
  return true;
}

const asCondition = (r: any): AltCondition => ({
  alt_min: numOrNull(r?.alt_min), alt_max: numOrNull(r?.alt_max),
  parity: r?.parity === 'even' || r?.parity === 'odd' ? r.parity : 'any',
});
const hasLimit = (c: AltCondition) => c.alt_min != null || c.alt_max != null || c.parity !== 'any';

/**
 * **הגובה חורג מגבהי הקבלה של העמדה בנקודת ההעברה.** הנקודות: של העמדה שלי,
 * ומתוכן - המשותפות לעמדה המוסרת (כשהיא ידועה ויש כאלה). התנאים בנקודה: כללי
 * הגבהים שלי בה (`classic_transfer_points`) ותנאי הקבלה שלי בה
 * (`classic_receive_points`). גובה עומד בנקודה אם תנאי אחד לפחות מתיר את כל
 * גבהי המבנה. נקודה בלי תנאים - אין מה לחרוג ממנו.
 */
export function receiveAltViolations(alt: string, myPreset: any, senderPreset?: any): ReceiveAltViolation[] {
  const r = parseAltHundreds(alt);
  if (!r || !myPreset) return [];
  const myId = Number(myPreset.id);
  const levels: number[] = [];
  for (let v = r.lo; v <= r.hi; v += 10) levels.push(v);
  if (levels[levels.length - 1] !== r.hi) levels.push(r.hi);

  const mine = [...presetSectorIds(myPreset)];
  const theirs = senderPreset ? presetSectorIds(senderPreset) : null;
  const shared = theirs ? mine.filter(id => theirs.has(id)) : [];
  const points = shared.length ? shared : mine;

  const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);
  const out: ReceiveAltViolation[] = [];
  for (const sectorId of points) {
    const tp = list(myPreset.classic_transfer_points).find(p => Number(p?.sector_id) === sectorId);
    const rp = list(myPreset.classic_receive_points).find(p => Number(p?.sector_id) === sectorId);
    const conditions = [
      ...configRules(tp).filter((x: any) => ruleStation(x, myId) === myId).map(asCondition),
      ...(rp ? [asCondition(rp)] : []),
    ].filter(hasLimit);
    if (!conditions.length) continue;
    if (!conditions.some(c => levels.every(v => levelAllowed(v, c)))) out.push({ sectorId, conditions });
  }
  return out;
}
