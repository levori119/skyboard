// קישור מסלולים בין **שדות תעופה**.
//
// ── למה שדה תעופה ולא עמדה ───────────────────────────────────────────────────
// המודל הקודם הצמיד לכל חבר בקישור **עמדה** (`preset_id`) - וזו הייתה טעות
// באפיון: מסלול שייך ל**שדה** (`airfield_routes.airfield_id`), לא לעמדה, ואותו
// מסלול פיזי נראה בשמות שונים כשהוא מוגדר ב**שני שדות**. עמדה רואה את המסלול
// דרך השדה שלה, ולכן העמדה הייתה רובד מיותר שאיפשר קישורים חלקיים ולא עקביים
// (אותה עמדה מקשרת, שכנתה באותו שדה לא).
// כאן חבר = **מסלול**, והשדה נגזר ממנו - כך אי-אפשר לרשום שדה שאינו של המסלול.
//
// ── למה קבוצה ולא זוג ────────────────────────────────────────────────────────
// המודל הראשון היה **זוגי** (`route_a <-> route_b`): כדי לקשר מסלול אחד בין
// שלושה שדות היה צריך לרשום שלושה זוגות ולזכור לתחזק את כולם, וכל אחד מהם ניתן
// היה למחוק בנפרד ולהשאיר קישור חלקי. כאן קישור אחד הוא **קבוצה** של מסלולים,
// N>=2 - שני שדות זה המקרה הפרטי.
//
// ── למה זה לא שייך למסלולי הסעה ──────────────────────────────────────────────
// אותו מסלול פיזי נראה בשני שדות בשמות שונים - וזה נכון גם למסלול המראה
// (מסלול טיסה) וגם למסלול הסעה. לכן הקישור הוא רובד בפני עצמו ביישות השדה,
// והוא חל על **כל** סוגי המסלולים (routeKind).

export interface LinkMember {
  route_id: number;
  /** שמות ושיוך לתצוגה - מגיעים מהשרת ב-GET, אינם נשמרים (השדה נגזר מהמסלול) */
  route_name?: string;
  airfield_id?: number | null;
  airfield_name?: string;
}

export interface LinkGroup {
  id: number;
  name?: string;
  members: LinkMember[];
}

/** קישור של פחות משני מסלולים אינו קישור. */
export const MIN_LINK_MEMBERS = 2;

export type RouteKind = 'runway' | 'aircraft' | 'vehicle' | 'general';

/** סוגי המסלולים שניתן לקשר - כולל מסלול המראה, לא רק הסעה. */
export const ROUTE_KINDS: { key: RouteKind; icon: string; labelKey: string }[] = [
  { key: 'runway',   icon: '🛫', labelKey: 'links.kindRunway' },
  { key: 'aircraft', icon: '✈',  labelKey: 'links.kindAircraft' },
  { key: 'vehicle',  icon: '🚗', labelKey: 'links.kindVehicle' },
  { key: 'general',  icon: '🛤️', labelKey: 'links.kindGeneral' },
];

/** `is_runway` גובר על הקטגוריה: מסלול המראה הוא מסלול טיסה גם אם סווג אחרת. */
export function routeKind(route: { is_runway?: boolean | null; route_category?: string | null }): RouteKind {
  if (route.is_runway) return 'runway';
  const c = String(route.route_category ?? '');
  return c === 'vehicle' || c === 'aircraft' ? c : 'general';
}

export const routeKindIcon = (route: { is_runway?: boolean | null; route_category?: string | null }): string =>
  ROUTE_KINDS.find(k => k.key === routeKind(route))!.icon;

const key = (x: { route_id: number }) => String(x.route_id);

export type LinkValidation = { ok: true } | { ok: false; reason: 'tooFew' | 'incomplete' | 'duplicate' };

/**
 * קבוצה תקינה: לפחות שני מסלולים, לכל חבר מסלול, ובלי אותו מסלול פעמיים.
 * **שני מסלולים שונים מאותו שדה מותרים** - שדה יכול להחזיק שני מסלולים
 * שמקושרים לאותו מסלול פיזי אצל שכנו.
 */
export function validateLinkGroup(members: LinkMember[]): LinkValidation {
  if (members.length < MIN_LINK_MEMBERS) return { ok: false, reason: 'tooFew' };
  if (members.some(x => !x.route_id)) return { ok: false, reason: 'incomplete' };
  if (new Set(members.map(key)).size !== members.length) return { ok: false, reason: 'duplicate' };
  return { ok: true };
}

export const isMemberTaken = (members: LinkMember[], candidate: { route_id: number }): boolean =>
  members.some(x => key(x) === key(candidate));

export const addMember = (members: LinkMember[], candidate: LinkMember): LinkMember[] =>
  isMemberTaken(members, candidate) ? members : [...members, candidate];

export const removeMember = (members: LinkMember[], index: number): LinkMember[] =>
  index < 0 || index >= members.length ? members : members.filter((_, i) => i !== index);

/**
 * כל המסלולים המקושרים למסלולים שלי - בלי שלי עצמם.
 * קבוצה עם חבר בודד אינה מקשרת דבר.
 */
export function linkedRouteIds(groups: LinkGroup[], myRouteIds: number[]): number[] {
  const mine = new Set(myRouteIds.map(Number));
  const out = new Set<number>();
  for (const g of groups) {
    if (g.members.length < MIN_LINK_MEMBERS) continue;
    if (!g.members.some(x => mine.has(Number(x.route_id)))) continue;
    for (const x of g.members) if (!mine.has(Number(x.route_id))) out.add(Number(x.route_id));
  }
  return [...out];
}

export const groupSummary = (g: LinkGroup) => ({
  airfieldCount: new Set(g.members.map(x => x.airfield_id ?? null)).size,
  routeCount: new Set(g.members.map(x => x.route_id)).size,
});
