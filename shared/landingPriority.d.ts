// הצהרות טיפוסים ל-shared/landingPriority.js - ראה ההסבר בראש המימוש.

/** מספר הדת"ק מתוך שם הנקודה ("דת"ק 5" -> 5). null כשאין. */
export declare function datkNumberOf(name: unknown): number | null;

/** רשימת המסלולים בסדר רץ, מנוקה וללא כפילויות. */
export declare function parseLandingPriority(v: unknown): string[];

/** אותו קצה מסלול ("08" = "8"). */
export declare function sameRunway(a: unknown, b: unknown): boolean;

/** המסלול הראשון בעדיפות שפתוח לנחיתות, או null. */
export declare function pickLandingRunway(priority: string[], landingRunways: string[]): string | null;

/** חלוקת מבנה למסלולים לפי הדת"ק של כל מטוס. מטוס שיש לו מסלול לא נכלל. */
export declare function planLandingRunways(p: {
  aircraft: { idx: number; datk?: unknown; runway_ident?: string | null }[];
  points: { name?: string | null; point_type?: string | null; landing_priority?: unknown }[];
  landingRunways: string[];
}): { idx: number; runway_ident: string }[];

type DatkPointLike = { airfield_id?: unknown; name?: string | null; point_type?: string | null; landing_priority?: unknown };

/** סדר העדיפויות האפקטיבי: של הנקודה, ואם ריק - של אותו דת"ק בשדה אחר בבסיס האב. */
export declare function effectiveLandingPriority(point: DatkPointLike, basePoints: DatkPointLike[]): string[];
