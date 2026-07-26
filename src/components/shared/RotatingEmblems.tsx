// ─── RotatingEmblems — סמל בסיס אב + סמל מיח"ה מסתובבים ───────────────────────
// רכיב תצוגה משותף (DRY): מוצג במסך הטעינה (variant='loader') ובסרגל העליון
// (variant='topbar'). מיח"ה מוצג תמיד; סמל הבסיס מוצג רק אם לעמדה יש בסיס אב.
//
// תנועה (מכבד ATC HMI + prefers-reduced-motion):
//   • loader — סיבוב רציף (זמני, נעלם עם סיום הטעינה). שני סמלים מקיפים מרכז
//     משותף ונשארים זקופים (counter-rotate); סמל יחיד מסתובב סביב עצמו כמו מכ"ם.
//   • topbar — סיבוב כניסה חד-פעמי בעליית המערכת, ואז מנוחה (ללא הסחה מתמדת).
//
// התאמת תמה: הצבעים של הסמלים עצמם הם "צבעי מותג" (קבועים); הכרום מסביב
// (טבעת/זוהר/כיתוב) נגזר מ-themeMode. הרכיב יושב ב-#root ולכן מתכווץ אוטומטית
// עם --s (אין portal → אין צורך ב-zoom ידני).

import { useId } from 'react';
import type { AviationBaseRef } from '../../types';
import { tr } from '../../i18n/tr';
import { MichaEmblem, getBaseEmblem } from '../../assets/emblems/emblems';

type ThemeMode = 'light' | 'dark' | 'ocean';

interface RotatingEmblemsProps {
  parentBase?: AviationBaseRef | null;
  size?: number;                 // קוטר סמל בודד (px). ברירת מחדל לפי variant.
  variant?: 'loader' | 'topbar';
  themeMode?: ThemeMode;
  showCaption?: boolean;         // כיתוב שם הבסיס/מיח"ה מתחת (loader בלבד כברירת מחדל)
}

export function RotatingEmblems({
  parentBase,
  size,
  variant = 'loader',
  themeMode = 'dark',
  showCaption,
}: RotatingEmblemsProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const isLoader = variant === 'loader';
  const emblemSize = size ?? (isLoader ? 84 : 30);
  const hasBase = !!parentBase;
  const BaseEmblemComp = getBaseEmblem(parentBase?.name);
  const baseTitle = parentBase?.name || 'בסיס';
  const caption = showCaption ?? isLoader;
  const michaLabel = tr('shared.micha');

  const chrome: Record<ThemeMode, { ring: string; caption: string; glow: string }> = {
    dark:  { ring: '#1e40af', caption: '#93c5fd', glow: 'rgba(59,130,246,0.35)' },
    ocean: { ring: '#1d4ed8', caption: '#0f172a', glow: 'rgba(29,78,216,0.25)' },
    light: { ring: '#1d4ed8', caption: '#1e293b', glow: 'rgba(37,99,235,0.18)' },
  };
  const C = chrome[themeMode] ?? chrome.dark;

  // ── loader: שני סמלים מקיפים / סמל יחיד מסתובב ──
  if (isLoader) {
    const R = emblemSize * 0.62;                       // רדיוס הקפה
    const stage = hasBase ? emblemSize * 2 + R : emblemSize * 1.7;
    const spin = 16;                                   // שנ' לסיבוב מלא
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <style>{loaderCss(uid, spin)}</style>
        <div
          style={{
            position: 'relative', width: stage, height: stage,
            display: 'grid', placeItems: 'center',
            filter: `drop-shadow(0 0 ${emblemSize * 0.18}px ${C.glow})`,
          }}
        >
          {/* טבעת מסלול דקורטיבית */}
          <svg width={stage} height={stage} viewBox="0 0 100 100"
            style={{ position: 'absolute', inset: 0 }} className={`re-ring-${uid}`}>
            <circle cx="50" cy="50" r="46" fill="none" stroke={C.ring} strokeWidth="0.8"
              strokeDasharray="2 4" opacity="0.6" />
          </svg>

          {hasBase ? (
            // שני סמלים על מסלול משותף, זקופים (counter-rotate)
            <div className={`re-orbit-${uid}`} style={{ position: 'absolute', inset: 0 }}>
              <div className="re-item" style={{ transform: `translate(-50%,-50%) translateY(-${R}px)`, top: '50%', left: '50%', position: 'absolute' }}>
                <div className={`re-up-${uid}`}><BaseEmblemComp size={emblemSize} code={parentBase?.code} title={baseTitle} /></div>
              </div>
              <div className="re-item" style={{ transform: `translate(-50%,-50%) translateY(${R}px)`, top: '50%', left: '50%', position: 'absolute' }}>
                <div className={`re-up-${uid}`}><MichaEmblem size={emblemSize} title={michaLabel} /></div>
              </div>
            </div>
          ) : (
            // סמל יחיד — סיבוב עצמי כמו מכ"ם
            <div className={`re-self-${uid}`}>
              <MichaEmblem size={emblemSize} title={michaLabel} />
            </div>
          )}
        </div>

        {caption && (
          <div style={{ fontSize: '13px', letterSpacing: '1px', color: C.caption, textAlign: 'center', fontWeight: 600 }}>
            {hasBase ? `${baseTitle} · ${michaLabel}` : michaLabel}
          </div>
        )}
      </div>
    );
  }

  // ── topbar: סיבוב כניסה חד-פעמי, ואז מנוחה ──
  const gap = Math.round(emblemSize * 0.22);
  return (
    <div
      style={{ display: 'inline-flex', alignItems: 'center', gap, filter: `drop-shadow(0 0 3px ${C.glow})` }}
      title={hasBase ? `${baseTitle} · ${michaLabel}` : michaLabel}
    >
      <style>{topbarCss(uid)}</style>
      {hasBase && (
        <span className={`re-in-${uid}`} style={{ display: 'inline-flex', animationDelay: '0.12s' }}>
          <BaseEmblemComp size={emblemSize} code={parentBase?.code} title={baseTitle} />
        </span>
      )}
      <span className={`re-in-${uid}`} style={{ display: 'inline-flex' }}>
        <MichaEmblem size={emblemSize} title={michaLabel} />
      </span>
    </div>
  );
}

function loaderCss(uid: string, spin: number): string {
  return `
    @keyframes re-orbit-kf-${uid}   { from { transform: rotate(0deg); }   to { transform: rotate(360deg); } }
    @keyframes re-counter-kf-${uid} { from { transform: rotate(0deg); }   to { transform: rotate(-360deg); } }
    @keyframes re-ring-kf-${uid}    { from { transform: rotate(0deg); }   to { transform: rotate(360deg); } }
    .re-orbit-${uid} { animation: re-orbit-kf-${uid} ${spin}s linear infinite; will-change: transform; }
    .re-up-${uid}    { animation: re-counter-kf-${uid} ${spin}s linear infinite; will-change: transform; }
    .re-self-${uid}  { animation: re-ring-kf-${uid} ${spin * 0.7}s linear infinite; will-change: transform; display: inline-flex; }
    .re-ring-${uid}  { animation: re-ring-kf-${uid} ${spin * 2.2}s linear infinite; transform-origin: 50% 50%; will-change: transform; }
    @media (prefers-reduced-motion: reduce) {
      .re-orbit-${uid}, .re-up-${uid}, .re-self-${uid}, .re-ring-${uid} { animation: none; }
    }
  `;
}

function topbarCss(uid: string): string {
  return `
    @keyframes re-in-kf-${uid} {
      0%   { transform: rotate(-220deg) scale(0.3); opacity: 0; }
      70%  { transform: rotate(8deg)    scale(1.06); opacity: 1; }
      100% { transform: rotate(0deg)    scale(1);    opacity: 1; }
    }
    .re-in-${uid} { animation: re-in-kf-${uid} 1.5s cubic-bezier(0.2,0.7,0.2,1) both; will-change: transform; }
    @media (prefers-reduced-motion: reduce) {
      .re-in-${uid} { animation: none; opacity: 1; }
    }
  `;
}
