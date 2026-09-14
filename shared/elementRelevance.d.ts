// הצהרות טיפוסים ל-shared/elementRelevance.js - המימוש ESM רגיל כדי שהשרת
// והאפליקציה הראשית (TS/Vite) ישתמשו באותו קובץ.

export type ElementAudience = 'vehicles' | 'aircraft';

export declare const ELEMENT_AUDIENCES: readonly ElementAudience[];
export declare const DEFAULT_RELEVANT_FOR: readonly ElementAudience[];

/** קלט (מערך או JSON) → הקהלים התקינים בסדר קבוע, או null כשאין אף אחד */
export declare function parseRelevantFor(value: unknown): ElementAudience[] | null;

type ElementLike = { relevant_for?: unknown } | null | undefined;

export declare function relevantFor(el: ElementLike): ElementAudience[];
export declare function isRelevantFor(el: ElementLike, audience: ElementAudience): boolean;
export declare function onlyRelevantFor<T extends { relevant_for?: unknown }>(elements: T[] | null | undefined, audience: ElementAudience): T[];
