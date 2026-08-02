// קיבוץ עמדות לפי **בסיס אב** + מיון "האחרון שעודכן/נוצר ראשון".
//
// למה קובץ נפרד ולא בתוך הרכיב: אותו קיבוץ נדרש ביותר ממסך אחד (בורר העמדה
// במסך הכניסה, והפצת בד"ח בעמדת הבקר), והלוגיקה נבדקת בלי DOM.
//
// חותמת הזמן היא **זמן העדכון האחרון**: `updated_at` אם קיים, אחרת `created_at`
// (לעמדה שלא עודכנה מאז שנוצרה השניים שווים - כך מילאה אותם המיגרציה).
// עמדה בלי חותמת בכלל יורדת לסוף הרשימה (0) - ולא קופצת לראש.

export interface PresetLike {
  id: number;
  name: string;
  parent_base_id?: number | null;
  parent_base_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface BaseLike {
  id: number;
  name: string;
}

export interface StationGroup {
  /** null = לעמדות שבקבוצה אין בסיס אב */
  baseId: number | null;
  baseName: string | null;
  presets: PresetLike[];
  /** החותמת העדכנית ביותר בקבוצה (ms) - לפיה הקבוצות מסודרות */
  latest: number;
}

/** החותמת הקובעת למיון: עדכון אחרון, ואם אין - יצירה. חסר/לא תקין → 0 */
export function presetStamp(p: PresetLike | null | undefined): number {
  const raw = p?.updated_at || p?.created_at;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** מיון עמדות: העדכני ביותר ראשון, ובחותמת זהה - לפי שם */
function byRecency(a: PresetLike, b: PresetLike): number {
  const d = presetStamp(b) - presetStamp(a);
  return d !== 0 ? d : String(a.name || '').localeCompare(String(b.name || ''));
}

/**
 * מקבץ עמדות לפי בסיס אב.
 * - הקבוצות מסודרות לפי העמדה העדכנית ביותר שבהן.
 * - קבוצת "ללא בסיס אב" תמיד אחרונה: היא סל שאריות, לא בסיס.
 * - בסיס שנמחק / לא נמצא ברשימת הבסיסים מטופל כקבוצה נפרדת עם שם מה-preset
 *   אם קיים, ואחרת - כאילו אין לו בסיס אב (לא ממציאים שם).
 */
export function groupPresetsByBase(presets: PresetLike[], bases: BaseLike[] = []): StationGroup[] {
  const baseName = new Map<number, string>();
  for (const b of bases || []) {
    if (b && Number.isFinite(Number(b.id))) baseName.set(Number(b.id), b.name);
  }

  const groups = new Map<string, StationGroup>();
  for (const p of presets || []) {
    if (!p) continue;
    const rawId = p.parent_base_id == null ? null : Number(p.parent_base_id);
    const id = rawId != null && Number.isFinite(rawId) ? rawId : null;
    const name = id != null ? (baseName.get(id) || p.parent_base_name || null) : null;
    // בסיס אב שאין לו שם ידוע - לא מציגים מזהה גולמי למשתמש, מאחדים ל"ללא בסיס"
    const key = id != null && name ? `b${id}` : 'none';
    let g = groups.get(key);
    if (!g) {
      g = { baseId: key === 'none' ? null : id, baseName: key === 'none' ? null : name, presets: [], latest: 0 };
      groups.set(key, g);
    }
    g.presets.push(p);
    g.latest = Math.max(g.latest, presetStamp(p));
  }

  const out = [...groups.values()];
  for (const g of out) g.presets.sort(byRecency);
  out.sort((a, b) => {
    if ((a.baseId === null) !== (b.baseId === null)) return a.baseId === null ? 1 : -1;
    const d = b.latest - a.latest;
    return d !== 0 ? d : String(a.baseName || '').localeCompare(String(b.baseName || ''));
  });
  return out;
}

/**
 * כותרות קטגוריה מוצגות רק כשיש **יותר מקבוצה אחת**.
 * בסיס אב יחיד (או רק עמדות בלי בסיס) → אין מה לקבץ, והכותרת רק מוסיפה קליק.
 */
export function shouldShowGroupHeaders(groups: StationGroup[]): boolean {
  return (groups?.length || 0) > 1;
}

const p2 = (n: number) => String(n).padStart(2, '0');

/**
 * חותמת זמן קצרה לצד שם העמדה:
 *   היום        → 14:32
 *   השנה        → 22/06 14:32
 *   שנה אחרת    → 22/06/25 14:32
 * מספרים בלבד - קריא בשתי השפות, ואינו דורש תרגום.
 */
export function formatStationTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const hm = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return hm;
  const dm = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
  if (d.getFullYear() === now.getFullYear()) return `${dm} ${hm}`;
  return `${dm}/${p2(d.getFullYear() % 100)} ${hm}`;
}
