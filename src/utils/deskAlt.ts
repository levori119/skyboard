/**
 * **גובה דסק** - הגובה של פ"מ בדסק במוד טבלה, נפרד מהגובה של הפ"מ עצמו.
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
 *
 * פ"מ שאין לו עמדה מחזיקה (`workstation_preset_id` ריק) אינו "של אחר" - הגובה
 * שלו נערך ישירות, כמו קודם.
 */
import { parseAltHundreds } from './altRecommend';
import { configRules, ruleStation } from '../../shared/transferPointAltRules.js';
import { presetSectorIds } from '../../shared/transferPointStations.js';

export interface DeskAltEntry { alt: string | null; to_sender?: boolean; receive_alt?: string | null }

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
  if (!e || typeof e !== 'object' || (!e.alt && !e.receive_alt)) return null;
  return { alt: e.alt ? String(e.alt) : null, to_sender: !!e.to_sender, receive_alt: e.receive_alt ? String(e.receive_alt) : null };
}

/**
 * הפ"מ כפי שהדסק רואה אותו: לפ"מ של עמדה אחרת - גובה המרחב של הדסק (או ריק),
 * הגובה שעליו ב-`_receiveAlt`, וגובה הקבלה/מסירה ב-`_handoverAlt` (של הדסק
 * כשנקבע, ובלעדיו - הגובה שעל הפ"מ, שבו הוא יגיע לנקודת ההעברה).
 */
export function withDeskAlt<T extends Record<string, any>>(strip: T, presetId: number): T {
  if (!isForeignToDesk(strip, presetId)) return strip;
  const e = deskAltEntry(strip, presetId);
  return { ...strip, alt: e?.alt ?? '', _receiveAlt: strip.alt ?? '', _handoverAlt: e?.receive_alt || strip.alt || '' };
}

/** גובה הקבלה/מסירה כפי שהדסק רואה אותו. פ"מ שאצלי - הגובה שעליו */
export function handoverAltOf(strip: any): string {
  return String(strip?._handoverAlt ?? strip?.alt ?? '');
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
