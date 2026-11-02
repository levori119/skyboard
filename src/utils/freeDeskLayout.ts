/**
 * פריסת **משטח הדסק החופשי** - הלוגיקה הטהורה.
 *
 * המשטח (`FreeDeskPad`) משותף לדסק החופשי ולפתקיות, ולכן גם הפריסה שלו:
 *
 * | שדה | משמעות |
 * |-----|--------|
 * | `mode`        | מקלדת / כתב יד / שניהם |
 * | `orientation` | במצב "שניהם": אחד מעל השני (`stacked`) או זה לצד זה (`side`) |
 * | `swapped`     | היפוך: כתב היד ראשון (למעלה / בתחילת השורה) והמקלדת אחריו |
 * | `split`       | החלק של **המקלדת** מהשטח, בגרירת הספליטר. תמיד של המקלדת - לא "החלק הראשון" - כדי שהיפוך לא יהפוך גם את היחס |
 * | `bg`          | רקע הדף (שורות/משבצות), ראה `deskBackground.ts` |
 *
 * בדסק החופשי הפריסה נשמרת פר-עמדה ב-localStorage; בפתקית היא חלק מהפתקית
 * (`sticky_notes.pad_layout`), כי הפתקית מופצת ונראית אותו דבר אצל כל הנמענים.
 */
import { DEFAULT_DESK_BACKGROUND, loadDeskBackground, normalizeDeskBackground, type DeskBackground } from './deskBackground';

export type PadMode = 'keyboard' | 'handwriting' | 'both';
export type PadOrientation = 'stacked' | 'side';
export type PadPane = 'text' | 'ink';

export interface PadLayout {
  mode: PadMode;
  orientation: PadOrientation;
  swapped: boolean;
  split: number;
  bg: DeskBackground;
}

/** אף חלק לא מתכווץ עד שנעלם - חלק שנעלם הוא חלק שהמפעיל לא מוצא */
export const PAD_SPLIT_MIN = 0.15;
export const PAD_SPLIT_MAX = 0.85;
const DEFAULT_SPLIT = 0.45;

export const DEFAULT_PAD_LAYOUT: PadLayout = {
  mode: 'handwriting', orientation: 'stacked', swapped: false, split: DEFAULT_SPLIT, bg: DEFAULT_DESK_BACKGROUND,
};

export function clampSplit(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SPLIT;
  return Math.min(PAD_SPLIT_MAX, Math.max(PAD_SPLIT_MIN, n));
}

/** כל שדה לא תקין חוזר לברירת המחדל שלו בלבד - לא הפריסה כולה */
export function normalizePadLayout(raw: unknown): PadLayout {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const mode = (['keyboard', 'handwriting', 'both'] as const).find(k => k === o.mode) ?? DEFAULT_PAD_LAYOUT.mode;
  const orientation = (['stacked', 'side'] as const).find(k => k === o.orientation) ?? DEFAULT_PAD_LAYOUT.orientation;
  return {
    mode,
    orientation,
    swapped: o.swapped === true,
    split: typeof o.split === 'number' ? clampSplit(o.split) : DEFAULT_SPLIT,
    bg: normalizeDeskBackground(o.bg),
  };
}

/** סדר החלקים על המסך (ראשון = למעלה, או בתחילת השורה לפי כיוון השפה) */
export function padPaneOrder(layout: PadLayout): PadPane[] {
  if (layout.mode === 'keyboard') return ['text'];
  if (layout.mode === 'handwriting') return ['ink'];
  return layout.swapped ? ['ink', 'text'] : ['text', 'ink'];
}

/**
 * היחס החדש אחרי גרירת הספליטר ב-`deltaPx` (חיובי = למטה / ימינה במסך).
 *
 * גרירה לכיוון החלק השני מגדילה את הראשון. ב-RTL זה לצד זה, החלק הראשון
 * יושב **מימין**, ולכן גרירה ימינה דווקא מקטינה אותו.
 */
export function splitAfterDrag(layout: PadLayout, deltaPx: number, totalPx: number, dir: 'rtl' | 'ltr'): number {
  if (!(totalPx > 0)) return layout.split;
  const towardSecond = layout.orientation === 'side' && dir === 'rtl' ? -deltaPx : deltaPx;
  const textFirst = !layout.swapped;
  const growText = textFirst ? towardSecond : -towardSecond;
  return clampSplit(layout.split + growText / totalPx);
}

const padKey = (presetId: number | string | null | undefined): string => `skyking.freeDesk.layout_${presetId ?? 'none'}`;

/**
 * פריסת הדסק החופשי השמורה לעמדה. עמדה שבחרה רקע לפני שהייתה פריסה (המפתח
 * הישן `freeDesk.bg_*`) ממשיכה לקבל את הרקע שבחרה.
 */
export function loadPadLayout(presetId: number | string | null | undefined): PadLayout {
  try {
    const raw = localStorage.getItem(padKey(presetId));
    if (raw) return normalizePadLayout(JSON.parse(raw));
  } catch { /* ערך שבור / אחסון חסום */ }
  return { ...DEFAULT_PAD_LAYOUT, bg: loadDeskBackground(presetId) };
}

export function savePadLayout(presetId: number | string | null | undefined, layout: PadLayout): void {
  try { localStorage.setItem(padKey(presetId), JSON.stringify(layout)); } catch { /* מצב פרטי */ }
}
