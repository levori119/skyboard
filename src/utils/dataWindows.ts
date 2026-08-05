// ─── חלונות נתונים בעמדה ──────────────────────────────────────────────────────
// מונה מוגדר-שאילתא שצף מעל מפת השדה: "מסוקים באזורים", "קרב שנוחתים בעוד
// פחות מ-15 דקות". השאילתא היא אותו DSL של QueryBuilder - אין כאן מנוע סינון
// שני, רק הגדרה של **מה מציגים** מעל תוצאות המנוע הקיים.
//
// חלוקת אחריות: המנהל מגדיר את החלונות לעמדה (`workstation_presets.data_windows`),
// והפקח מזיז/מסתיר/מרחיב אותם בסשן שלו בלבד (sessionStorage) - כדי ששינוי
// באמצע משמרת לא ישנה את העמדה לכל המשמרות הבאות.

import type { QGroup } from '../types';
import { evaluateQuery, hasConditions, getQFieldValue, qGenId, type QEvalCtx } from './queryBuilder';

/** `count` = מספר בלבד · `count_callsigns` = מספר גדול + האו"קים שמתחתיו */
export const DW_MODES = ['count', 'count_callsigns'] as const;
export type DataWindowMode = typeof DW_MODES[number];

/** `strips` = כל פ"מ נספר פעם אחת · `aircraft` = לפי מצבת המטוסים בפ"מ */
export const DW_COUNT_BY = ['strips', 'aircraft'] as const;
export type DataWindowCountBy = typeof DW_COUNT_BY[number];

export interface DataWindowDef {
  id: string;
  title: string;
  query: QGroup | null;
  mode: DataWindowMode;
  count_by: DataWindowCountBy;
  /** מיקום החלון על המסך, בפיקסלים */
  x: number;
  y: number;
  color: string;
  hidden?: boolean;
  /** מעל הסף הזה המונה נצבע באזהרה. null = בלי סף */
  warn_at?: number | null;
  /** חלון שהפקח הוסיף בסשן שלו ולא קיים בהגדרת העמדה */
  own?: boolean;
}

export interface DataWindowResult {
  count: number;
  callsigns: string[];
  /** אין שאילתא - החלון עדיין לא הוגדר */
  unconfigured: boolean;
  warn: boolean;
}

export const DW_DEFAULT_COLOR = '#3b82f6';

export const dwDefault = (over: Partial<DataWindowDef> = {}): DataWindowDef => ({
  id: qGenId(),
  title: '',
  query: null,
  mode: 'count',
  count_by: 'strips',
  x: 80,
  y: 80,
  color: DW_DEFAULT_COLOR,
  warn_at: null,
  ...over,
});

const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
};

/**
 * ניקוי הגדרות שהגיעו מ-JSONB או מ-sessionStorage. שני המקורות אינם מובטחים:
 * עמדה ותיקה יכולה להחזיק `{}` במקום מערך, וסשן יכול להכיל שארית מגרסה קודמת.
 */
export function dwNormalize(raw: unknown): DataWindowDef[] {
  if (!Array.isArray(raw)) return [];
  const out: DataWindowDef[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const w = item as Partial<DataWindowDef>;
    out.push({
      id: String(w.id || qGenId()),
      title: String(w.title || ''),
      query: (w.query && typeof w.query === 'object') ? w.query as QGroup : null,
      mode: (DW_MODES as readonly string[]).includes(String(w.mode)) ? w.mode as DataWindowMode : 'count',
      count_by: (DW_COUNT_BY as readonly string[]).includes(String(w.count_by)) ? w.count_by as DataWindowCountBy : 'strips',
      x: num(w.x, 80 + i * 24),
      y: num(w.y, 80 + i * 24),
      color: String(w.color || DW_DEFAULT_COLOR),
      hidden: !!w.hidden,
      warn_at: w.warn_at == null || !isFinite(Number(w.warn_at)) ? null : Number(w.warn_at),
      ...(w.own ? { own: true } : {}),
    });
  });
  return out;
}

/** מצבת המטוסים בפ"מ. ערך חסר או לא מספרי = מטוס אחד, כדי שפ"מ לא ייעלם מהספירה */
const aircraftCount = (strip: any): number => {
  const n = parseInt(String(strip?.number_of_formation ?? strip?.numberOfFormation ?? ''), 10);
  return isFinite(n) && n > 0 ? n : 1;
};

/** הרצת חלון על רשימת הפ"מים. `ctx` נמסר מהעמדה (עכשיו, הבסיס שלי, ...) */
export function dwEvaluate(strips: any[], def: DataWindowDef, ctx?: QEvalCtx): DataWindowResult {
  if (!def.query || !hasConditions(def.query)) {
    return { count: 0, callsigns: [], unconfigured: true, warn: false };
  }
  const matched = (strips || []).filter(s => evaluateQuery(s, def.query as QGroup, ctx));
  const count = def.count_by === 'aircraft'
    ? matched.reduce((sum, s) => sum + aircraftCount(s), 0)
    : matched.length;
  const callsigns = matched.map(s => String(getQFieldValue(s, 'callSign', ctx) || '')).filter(Boolean);
  return {
    count,
    callsigns,
    unconfigured: false,
    warn: def.warn_at != null && count >= def.warn_at,
  };
}

// ─── מיזוג הגדרת העמדה עם שינויי הסשן ─────────────────────────────────────────

/** מה מותר לפקח לשנות בסשן על חלון של המנהל - תצוגה ומיקום, לא התוכן */
type SessionOverride = Pick<DataWindowDef, 'id'> & Partial<Pick<DataWindowDef, 'x' | 'y' | 'mode' | 'hidden'>>;

/**
 * הגדרת העמדה היא מקור האמת לרשימת החלונות ולשאילתות שלהם; הסשן דורס רק
 * תצוגה. חלון שהמנהל מחק נעלם גם אם נשאר בסשן - אחרת שארית סשן הייתה מחזירה
 * לחיים חלון שהוסר בכוונה.
 */
export function dwMergeSession(base: DataWindowDef[], session: (SessionOverride | DataWindowDef)[] | null | undefined): DataWindowDef[] {
  const overrides = new Map<string, any>();
  const ownWindows: DataWindowDef[] = [];
  for (const s of (session || [])) {
    if (!s || !s.id) continue;
    if ((s as DataWindowDef).own) ownWindows.push(s as DataWindowDef);
    else overrides.set(String(s.id), s);
  }
  const merged = base.map(w => {
    const o = overrides.get(String(w.id));
    if (!o) return w;
    return {
      ...w,
      x: o.x == null ? w.x : num(o.x, w.x),
      y: o.y == null ? w.y : num(o.y, w.y),
      mode: (DW_MODES as readonly string[]).includes(String(o.mode)) ? o.mode as DataWindowMode : w.mode,
      hidden: o.hidden == null ? w.hidden : !!o.hidden,
    };
  });
  return [...merged, ...ownWindows];
}

// ─── אחסון הסשן ───────────────────────────────────────────────────────────────

export const dwSessionKey = (presetId: number | string | null | undefined) => `skyking.dataWindows.${presetId ?? 'none'}`;

// שני צרכנים קוראים את אותו סשן (שכבת החלונות וסרגל השחזור). בלי הודעה
// ביניהם, הסתרת חלון בשכבה לא הייתה מופיעה בסרגל עד רענון.
type DwListener = () => void;
const dwListeners = new Set<DwListener>();

/** מנוי לשינויי סשן. מחזיר פונקציית ביטול */
export function dwSubscribe(cb: DwListener): () => void {
  dwListeners.add(cb);
  return () => { dwListeners.delete(cb); };
}

export function dwLoadSession(presetId: number | string | null | undefined): DataWindowDef[] {
  try {
    const raw = sessionStorage.getItem(dwSessionKey(presetId));
    return raw ? dwNormalize(JSON.parse(raw)) : [];
  } catch { return []; }
}

export function dwSaveSession(presetId: number | string | null | undefined, windows: DataWindowDef[]): void {
  try { sessionStorage.setItem(dwSessionKey(presetId), JSON.stringify(windows)); } catch { /* מצב פרטי / מכסת אחסון - התצוגה פשוט לא נשמרת */ }
  dwListeners.forEach(cb => { try { cb(); } catch { /* מאזין שנפל לא יפיל את השמירה */ } });
}
