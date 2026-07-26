// ─── סמלי בסיסים + מיח"ה — registry ──────────────────────────────────────────
// סמלים אמיתיים (הורדו מ-Wikimedia/ויקיפדיה — ראה SOURCES.md בתיקייה זו).
// המפתח הוא **שם הבסיס** (`aviation_bases.name`), כי עמודת ה-code ריקה במערכת.
// להוספת/החלפת בסיס: הורד קובץ ל-`files/` ורשום ב-BASE_EMBLEMS לפי השם המדויק.
//
//   • MichaEmblem  — סמל מיח"ה (מוצג תמיד). כרגע סמל חה"א הכללי (Coat of arms, PD).
//   • BaseEmblem   — סמל בסיס, נבחר לפי שם הבסיס (getBaseEmblem). fallback: placeholder מצויר.
//
// הסמלים הם תמונות (PNG שקוף/SVG) — "צבעי מותג", קבועים בכל תמה. הכרום מסביב
// (טבעת/זוהר/תוויות) מותאם-תמה ב-RotatingEmblems.

import type { FC } from 'react';
import { useId } from 'react';

// ── קבצי הסמלים (מיובאים כ-assets; Vite מחזיר URL) ──
import ramatDavid from './files/ramat-david.png';
import hatzor from './files/hatzor.png';
import ramon from './files/ramon.png';
import hatzerim from './files/hatzerim.png';
import telNof from './files/tel-nof.png';
import ovda from './files/ovda.png';
import nevatim from './files/nevatim.png';
import palmachim from './files/palmachim.png';
import iafCoat from './files/iaf-coat.svg';

export interface EmblemProps {
  size?: number;
  title?: string;
  code?: string | null; // לא בשימוש לסמלי תמונה; נשמר לתאימות ל-placeholder המצויר
}

type EmblemComponent = FC<EmblemProps>;

// עוטף תמונת סמל בקומפוננטה אחידה. הסמלים עגולים עם רקע שקוף — נשמרים כמות שהם.
function imgEmblem(src: string, fallbackTitle: string): EmblemComponent {
  const C: EmblemComponent = ({ size = 64, title }) => (
    <img
      src={src}
      width={size}
      height={size}
      alt={title || fallbackTitle}
      draggable={false}
      style={{ objectFit: 'contain', display: 'block', width: size, height: size }}
    />
  );
  return C;
}

// מיח"ה — סמל חה"א הכללי (Coat of arms, נחלת הכלל). מוצג תמיד.
export const MichaEmblem: EmblemComponent = imgEmblem(iafCoat, 'מיח"ה');

// ─── registry: שם בסיס → סמל ──────────────────────────────────────────────────
const BASE_EMBLEMS: Record<string, EmblemComponent> = {
  'כנף 1': imgEmblem(ramatDavid, 'רמת דוד'),
  'כנף 4': imgEmblem(hatzor, 'חצור'),
  'כנף 25': imgEmblem(ramon, 'רמון'),
  'בחא 6': imgEmblem(hatzerim, 'חצרים'),
  'בחא 8': imgEmblem(telNof, 'תל נוף'),
  'בחא 10': imgEmblem(ovda, 'עובדה'),
  'בחא 28': imgEmblem(nevatim, 'נבטים'),
  'בחא 30': imgEmblem(palmachim, 'פלמחים'),
};

// מחזיר קומפוננטת סמל לפי שם הבסיס (או placeholder מצויר אם אין סמל רשום).
export function getBaseEmblem(name?: string | null): EmblemComponent {
  if (name && BASE_EMBLEMS[name]) return BASE_EMBLEMS[name];
  return BaseEmblem;
}

// ── placeholder מצויר — fallback לבסיס ללא סמל רשום ──
const CODE_TINTS = ['#1e5aa8', '#0f766e', '#7c3aed', '#b45309', '#be123c', '#0369a1', '#4d7c0f'];
function tintForKey(key?: string | null): string {
  if (!key) return CODE_TINTS[0];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return CODE_TINTS[h % CODE_TINTS.length];
}

export const BaseEmblem: EmblemComponent = ({ size = 64, code, title }) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const tint = tintForKey(code || title);
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
