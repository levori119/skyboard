// לוגו SKY KING האנימטיבי (מכ"ם + מטוס) — חולץ מה-header של SectorDashboard
// כרכיב משותף כדי שכל עמדה (כולל דסק משימה כללי) תציג את אותו סרגל עליון.
// filter-id ייחודי לכל מופע (useId) — שני לוגואים באותו עמוד לא מתנגשים.
//
// `launching`: אנימציית לחיצה — שתי טבעות מכ"ם שנפתחות מהמרכז + קפיצת סקייל.
// מופעלת כשלוחצים על הסמל כדי לפתוח את חלון המידע, ומסמנת שהלחיצה נקלטה
// (על Cintiq, לחיצת עט בלי משוב מיידי נקראת כ"לא קרה כלום").
import { useId } from 'react';

export function SkyKingLogo({ size = 28, launching = false }: { size?: number; launching?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const glowId = `hglow-${uid}`;
  return (
    <span style={{ position: 'relative', display: 'inline-flex', lineHeight: 0 }}>
    {/* גלי המכ"ם של הלחיצה — מחוץ ל-SVG בכוונה: בתוכו הם היו נחתכים בגבול
        ה-viewBox ולא היו נראים. יושבים ב-absolute ולא גוזלים מקום בסרגל. */}
    {launching && (<>
      <style>{`@keyframes skLogoLaunch{0%{transform:scale(1)}35%{transform:scale(1.25)}100%{transform:scale(1)}}
@keyframes skLogoPing{0%{transform:translate(-50%,-50%) scale(0.55);opacity:0.95;border-width:3px}100%{transform:translate(-50%,-50%) scale(3.4);opacity:0;border-width:1px}}`}</style>
      {[0, 0.16].map(delay => (
        <span key={delay} aria-hidden style={{
          position: 'absolute', top: '50%', left: '50%', width: size, height: size,
          borderRadius: '50%', border: '3px solid #93c5fd', pointerEvents: 'none',
          animation: `skLogoPing 0.75s ease-out ${delay}s both`,
        }} />
      ))}
    </>)}
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={launching ? { animation: 'skLogoLaunch 0.75s ease-out' } : undefined}>
      <defs>
        <filter id={glowId} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect width="72" height="72" rx="14" fill="#1e3a8a" />
      <line x1="8" y1="24" x2="64" y2="24" stroke="#3b82f6" strokeWidth="1.2" opacity="0.45" />
      <line x1="8" y1="36" x2="64" y2="36" stroke="#3b82f6" strokeWidth="1.2" opacity="0.45" />
      <line x1="8" y1="48" x2="64" y2="48" stroke="#3b82f6" strokeWidth="1.2" opacity="0.45" />
      <line x1="24" y1="8" x2="24" y2="64" stroke="#3b82f6" strokeWidth="1.2" opacity="0.45" />
      <line x1="36" y1="8" x2="36" y2="64" stroke="#3b82f6" strokeWidth="1.2" opacity="0.45" />
      <line x1="48" y1="8" x2="48" y2="64" stroke="#3b82f6" strokeWidth="1.2" opacity="0.45" />
      <g>
        <animateTransform attributeName="transform" type="rotate" from="0 36 36" to="360 36 36" dur="3s" repeatCount="indefinite" />
        <line x1="36" y1="36" x2="59" y2="36" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" opacity="0.75" />
        <path d="M 59,36 A 23,23 0 0 0 36,13" stroke="#3b82f6" strokeWidth="4" opacity="0.12" fill="none" />
      </g>
      <circle cx="55" cy="19" r="0" fill="#60a5fa" filter={`url(#${glowId})`}>
        <animate attributeName="r" values="0;0;3;2;0" keyTimes="0;0.2;0.26;0.5;1" dur="3s" begin="0.7s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0;1;0.6;0" keyTimes="0;0.2;0.26;0.5;1" dur="3s" begin="0.7s" repeatCount="indefinite" />
      </circle>
      <g transform="translate(36,36)">
        <animateTransform attributeName="transform" additive="sum" type="rotate"
          values="-18;18;-18" dur="2.8s" repeatCount="indefinite"
          calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" />
        <polygon points="0,-12  1.4,-7  2,7  -2,7  -1.4,-7" fill="white" />
        <polygon points="-1.4,-5  -14,7  -2,7" fill="#93c5fd" />
        <polygon points="1.4,-5   14,7  2,7" fill="#93c5fd" />
        <polygon points="-2,7  -5,12  -2,9.5" fill="#bfdbfe" />
        <polygon points="2,7   5,12  2,9.5" fill="#bfdbfe" />
        <circle cx="0" cy="-9.5" r="1.2" fill="#dbeafe" opacity="0.8" />
      </g>
      {/* הבזק פנימי קצר בתוך הסמל עצמו, יחד עם גלי המכ"ם שמסביבו */}
      {launching && (
        <circle cx="36" cy="36" r="10" fill="none" stroke="#dbeafe" strokeWidth="3" style={{ pointerEvents: 'none' }}>
          <animate attributeName="r" from="10" to="34" dur="0.5s" fill="freeze" />
          <animate attributeName="opacity" from="0.9" to="0" dur="0.5s" fill="freeze" />
        </circle>
      )}
    </svg>
    </span>
  );
}
