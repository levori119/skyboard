import type { CSSProperties } from 'react';
import { tr } from '../../i18n/tr';
import type { LabelPart } from '../../utils/handwritingLabel';
import type { PinDisplay } from '../../../shared/pinDisplay';

// ── סגנונות התווית של פ"מ על מפת אזורים ──────────────────────────────────────
// שלושת הסגנונות שנוספו ל"כתב יד" / "מוקטן" / "מורחב" / "אייקון". רכיב אחד
// לציור על המפה ולאריח התצוגה המקדימה בבורר, כדי שמה שהפקח בוחר הוא בדיוק
// מה שיופיע לו על המפה.
//
//   text  - כתב רגיל: אותו תוכן של כתב היד (בננה(2) - 105), בגופן מערכת ישר
//           ובלי הטיה. הילה כהה במקום רקע, כדי לא להסתיר את המפה.
//   tag   - תגית: כרטיסון מעוגל עם פס בצבע הפ"מ, או"ק + טייסת ומתחת הגובה.
//   block - בלוק נתונים: כמו בלוק רדאר - גופן ברוחב קבוע, או"ק וטייסת בשורה
//           הראשונה והגובה בשנייה, בלי מסגרת ועם קו מוביל.
//
// כל המידות מתחלקות ב-zoom: התווית יושבת בתוך שכבת המפה שעוברת scale, וכך היא
// שומרת על גודל קריא קבוע בכל רמת זום (כמו שאר הסימונים על המפה).

export type MapPinLabelMode = Extract<PinDisplay, 'text' | 'tag' | 'block'>;

export const isMapPinLabelMode = (m: unknown): m is MapPinLabelMode =>
  m === 'text' || m === 'tag' || m === 'block';

const LABEL_KEY: Record<PinDisplay, string> = {
  handwrite: 'ctrl.pinHandwrite',
  text: 'ctrl.pinText',
  tag: 'ctrl.pinTag',
  block: 'ctrl.pinBlock',
  small: 'ctrl.pinSmall',
  strip: 'ctrl.pinExpanded',
  icon: 'ctrl.pinIcon',
};

/** שם הסגנון לבורר, לתפריט הפין ולניהול. */
export const pinDisplayLabel = (m: PinDisplay): string => tr(LABEL_KEY[m]);

/** אייקון הכפתור בסרגל המפה - מראה את הסגנון שנבחר. */
export const pinDisplayGlyph = (m: string): string =>
  m === 'icon' ? '✈' : m === 'small' ? '📍' : m === 'handwrite' ? '✍'
    : m === 'text' ? 'Aa' : m === 'tag' ? '🏷' : m === 'block' ? '▤' : '📋';

const SANS = "'Segoe UI','Rubik','Arial Hebrew',Arial,sans-serif";
const MONO = "Consolas,'Cascadia Mono','Courier New',monospace";
const HALO = '0 0 2px #000, 0 0 3px #000, 0 1px 3px rgba(0,0,0,0.95)';

export function MapPinLabel({ mode, parts, callSign, sq, alt, color, conflict, zoom, fontPx, dir }: {
  mode: MapPinLabelMode;
  /** אסימוני "כתב יד" (handwritingParts) - התוכן של סגנון text */
  parts: LabelPart[];
  callSign: string;
  sq: string;
  alt: string | null;
  /** צבע הפ"מ (טייסת / סטטוס / אזור) */
  color: string;
  conflict: boolean;
  zoom: number;
  /** גודל הגופן שהפקח קבע ב-A+/A− */
  fontPx: number;
  dir: 'rtl' | 'ltr';
}) {
  const z = zoom || 1;
  const px = (n: number) => `${n / z}px`;
  const main = Math.max(8, (fontPx + 1) / z);
  const sub = Math.max(7, (fontPx - 2) / z);
  const altColor = conflict ? '#fca5a5' : '#e2e8f0';

  if (mode === 'text') {
    return (
      <div data-pin-style="text" style={{ whiteSpace: 'nowrap', direction: dir, textAlign: 'center', fontFamily: SANS, fontWeight: 700, fontSize: `${Math.max(9, (fontPx + 2) / z)}px`, letterSpacing: '0.2px', color: conflict ? '#fca5a5' : '#f8fafc', textShadow: HALO, lineHeight: 1.1 }}>
        {parts.map((p, i) => <bdi key={i} dir={p.ltr ? 'ltr' : undefined}>{p.text}</bdi>)}
        {alt && <div style={{ fontSize: `${sub}px`, fontWeight: 600, color: conflict ? '#fca5a5' : '#cbd5e1' }}><bdi dir="ltr">{alt}</bdi></div>}
      </div>
    );
  }

  if (mode === 'tag') {
    const box: CSSProperties = {
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', direction: dir, textAlign: 'start', whiteSpace: 'nowrap',
      fontFamily: SANS, lineHeight: 1.15,
      background: 'rgba(15,23,42,0.92)',
      border: `${px(1)} solid ${conflict ? '#ef4444' : 'rgba(148,163,184,0.45)'}`,
      borderInlineStart: `${px(4)} solid ${conflict ? '#ef4444' : color}`,
      borderRadius: px(6), padding: `${px(2)} ${px(6)}`,
      boxShadow: '0 2px 8px rgba(0,0,0,0.55)',
    };
    return (
      <div data-pin-style="tag" style={box}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: px(4) }}>
          <span style={{ fontWeight: 800, fontSize: `${main}px`, color: '#f8fafc' }}><bdi>{callSign}</bdi></span>
          {sq && <span style={{ fontWeight: 700, fontSize: `${sub}px`, color }}><bdi dir="ltr">{sq}</bdi></span>}
        </div>
        {alt && <span style={{ fontWeight: 700, fontSize: `${sub}px`, color: altColor }}><bdi dir="ltr">{alt}</bdi></span>}
      </div>
    );
  }

  // block - בלוק נתונים בסגנון רדאר: קו מוביל קצר אל הנקודה, ושתי שורות ברוחב קבוע
  const ink = conflict ? '#fca5a5' : '#86efac';
  return (
    <div data-pin-style="block" style={{ display: 'flex', alignItems: 'center', gap: px(3), direction: dir, whiteSpace: 'nowrap' }}>
      <span style={{ width: px(7), height: px(7), borderRadius: '50%', border: `${px(1.5)} solid ${ink}`, flexShrink: 0, boxShadow: '0 0 3px #000' }} />
      <span style={{ width: px(8), height: px(1.5), background: ink, flexShrink: 0, opacity: 0.8 }} />
      <div style={{ fontFamily: MONO, lineHeight: 1.1, textAlign: 'start', textShadow: HALO, background: 'rgba(2,6,23,0.55)', padding: `${px(1)} ${px(3)}`, borderRadius: px(2) }}>
        <div style={{ fontWeight: 700, fontSize: `${main}px`, color: ink }}>
          <bdi>{callSign}</bdi>{sq && <> <bdi dir="ltr" style={{ color }}>{sq}</bdi></>}
        </div>
        {alt && <div style={{ fontWeight: 700, fontSize: `${sub}px`, color: altColor }}><bdi dir="ltr">{alt}</bdi></div>}
      </div>
    </div>
  );
}
