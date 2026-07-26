// ─── סמלי בסיסים + מיח"ה — registry ──────────────────────────────────────────
// סמלי placeholder (SVG) עד להטמעת הסמלים הרשמיים. להחלפה לסמל אמיתי:
// רשום את קוד הבסיס ב-BASE_EMBLEMS עם <img src={...} /> (קובץ שיצורף ל-assets).
//
// שני סוגי סמלים:
//   • MichaEmblem  — סמל מיח"ה (מפקדת יחידות הבקרה). גלובלי, מוצג תמיד.
//   • BaseEmblem   — סמל בסיס אב, נבחר לפי קוד הבסיס (getBaseEmblem).
//
// הצבעים הם "צבעי מותג" (כמו צבעי סטטוס) — נשארים קבועים בכל תמה. הכרום מסביב
// (טבעת/זוהר/תוויות) מותאם-תמה ב-RotatingEmblems.

import type { FC } from 'react';
import { useId } from 'react';

export interface EmblemProps {
  size?: number;
  title?: string;
}

// מיח"ה — badge בקרה עגול: מכ"ם + סריקה + כוכב. placeholder עד לסמל רשמי.
export const MichaEmblem: FC<EmblemProps> = ({ size = 64, title }) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" role="img"
      aria-label={title || 'מיח"ה'} xmlns="http://www.w3.org/2000/svg">
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id={`m-disc-${uid}`} cx="50" cy="46" r="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#12336b" />
          <stop offset="100%" stopColor="#071a3a" />
        </radialGradient>
      </defs>
      {/* טבעת חיצונית + זהב */}
      <circle cx="50" cy="50" r="47" fill={`url(#m-disc-${uid})`} stroke="#d4af37" strokeWidth="3" />
      {/* טבעות מכ"ם */}
      <circle cx="50" cy="50" r="34" stroke="#3b82f6" strokeWidth="1.2" opacity="0.55" fill="none" />
      <circle cx="50" cy="50" r="23" stroke="#3b82f6" strokeWidth="1"   opacity="0.4"  fill="none" />
      <circle cx="50" cy="50" r="12" stroke="#3b82f6" strokeWidth="0.9" opacity="0.3"  fill="none" />
      <line x1="50" y1="16" x2="50" y2="84" stroke="#1d4ed8" strokeWidth="0.8" opacity="0.4" />
      <line x1="16" y1="50" x2="84" y2="50" stroke="#1d4ed8" strokeWidth="0.8" opacity="0.4" />
      {/* מגזר סריקה */}
      <path d="M50 50 L50 16 A34 34 0 0 1 79 33 Z" fill="#60a5fa" opacity="0.18" />
      <line x1="50" y1="50" x2="79" y2="33" stroke="#93c5fd" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
      {/* כוכב דוד קטן במרכז */}
      <path d="M50 38 l4 7 h-8 z M50 54 l-4 -7 h8 z" fill="#e5edff" opacity="0.9" />
      <circle cx="50" cy="50" r="2.4" fill="#dbeafe" />
    </svg>
  );
};

// גוונים לבידול בסיסים כשאין סמל רשמי (placeholder בלבד).
const CODE_TINTS = ['#1e5aa8', '#0f766e', '#7c3aed', '#b45309', '#be123c', '#0369a1', '#4d7c0f'];
function tintForCode(code?: string | null): string {
  if (!code) return CODE_TINTS[0];
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return CODE_TINTS[h % CODE_TINTS.length];
}

// סמל בסיס גנרי (placeholder): מגן עגול + מטוס מסוגנן. הגוון נגזר מקוד הבסיס.
export const BaseEmblem: FC<EmblemProps & { code?: string | null }> = ({ size = 64, code, title }) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const tint = tintForCode(code);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" role="img"
      aria-label={title || 'בסיס'} xmlns="http://www.w3.org/2000/svg">
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id={`b-disc-${uid}`} cx="50" cy="44" r="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={tint} />
          <stop offset="100%" stopColor="#0b1220" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill={`url(#b-disc-${uid})`} stroke="#d4af37" strokeWidth="3" />
      <circle cx="50" cy="50" r="40" stroke="#e5edff" strokeWidth="1" opacity="0.35" fill="none" />
      {/* מטוס קרב מסוגנן */}
      <g fill="#eaf1ff" opacity="0.95">
        <polygon points="50,24 53,44 52,64 48,64 47,44" />
        <polygon points="47,42 26,58 47,55" />
        <polygon points="53,42 74,58 53,55" />
        <polygon points="48,63 43,74 48,70" />
        <polygon points="52,63 57,74 52,70" />
      </g>
      <circle cx="50" cy="30" r="2" fill="#fde68a" />
    </svg>
  );
};

// ─── registry: קוד בסיס → סמל ────────────────────────────────────────────────
// כרגע ריק → כל בסיס מקבל את הסמל הגנרי (placeholder). להוספת סמל רשמי:
//   'RMD': ({ size }) => <img src={ramatDavid} width={size} height={size} alt="רמת דוד" />,
type EmblemComponent = FC<EmblemProps & { code?: string | null }>;
const BASE_EMBLEMS: Record<string, EmblemComponent> = {};

// מחזיר קומפוננטת סמל עבור קוד בסיס (או הגנרי אם אין רשום).
export function getBaseEmblem(code?: string | null): EmblemComponent {
  if (code && BASE_EMBLEMS[code]) return BASE_EMBLEMS[code];
  return BaseEmblem;
}
