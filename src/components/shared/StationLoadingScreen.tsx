// ─── StationLoadingScreen — מסך הטעינה של עליית העמדה ─────────────────────────
// רכיב תצוגה משותף (DRY): מוצג **פעמיים ברצף** באותה עלייה, ובשני המקומות הוא
// אותו מסך בדיוק — ולכן המעבר ביניהם נראה כמסך אחד רציף:
//
//   1. מסך הכניסה (App.tsx) — מרגע אישור טופס חברי העמדה ("כניסה לעמדה"/"דלג")
//      ועד שהסשן נוצר. בלי זה נראתה שוב, לשבריר שנייה, רשימת בחירת העמדה.
//   2. העמדה עצמה (SectorDashboard) — עד שכל המידע הראשוני והמפות הגיעו.
//
// שלבי הטעינה מוגדרים כאן, במקום אחד, כדי ששני המופעים יציגו את אותה רשימה
// באותו סדר; מי שמציג אותו רק מסמן אילו שלבים כבר הסתיימו.

import { useTranslation } from 'react-i18next';
import type { AviationBaseRef } from '../../types';
import { tr } from '../../i18n/tr';
import { LeoLogo } from './LeoLogo';
import { RotatingEmblems } from './RotatingEmblems';
import type { ThemeMode } from '../../utils/themeMode';

// רקע/טקסט לשלוש התמות — אותם ערכים כמו `T` בדשבורד (bg / text / muted), כדי
// שמסך הטעינה לא "יקפוץ" בצבע ברגע שהדשבורד עולה תחתיו.
const LOADER_THEME: Record<ThemeMode, { bg: string; text: string; muted: string }> = {
  light: { bg: '#f8fafc', text: '#1e293b', muted: '#64748b' },
  ocean: { bg: '#02242c', text: '#cffafe', muted: '#22d3ee' },
  dark:  { bg: '#0f172a', text: '#e2e8f0', muted: '#94a3b8' },
};

interface Props {
  /** בסיס האב של העמדה — לסמלים המסתובבים. null → מיח"ה בלבד */
  parentBase?: AviationBaseRef | null;
  themeMode?: ThemeMode;
  /** הסשן נוצר (מסך הכניסה: false עד שהשרת ענה · בעמדה: תמיד true) */
  connected: boolean;
  /** המידע הראשוני של השדה הגיע */
  dataLoaded: boolean;
  /** המפות והאזורים עלו (כולל תמונת המפה) */
  mapsReady: boolean;
  /** הכל מוכן — דעיכה החוצה. ההסרה מה-DOM באחריות המציג */
  fading?: boolean;
}

export default function StationLoadingScreen({
  parentBase, themeMode = 'dark', connected, dataLoaded, mapsReady, fading = false,
}: Props) {
  const { i18n } = useTranslation();
  const dir = i18n.dir();
  const T = LOADER_THEME[themeMode] ?? LOADER_THEME.dark;

  const steps = [
    { label: tr('shared.loadingStepConnect'), done: connected },
    { label: tr('shared.loadingStepData'), done: dataLoaded },
    { label: tr('shared.loadingStepMaps'), done: mapsReady },
  ];

  return (
    <div
      data-testid="station-loading"
      style={{
        position: 'fixed', inset: 0, zIndex: 100000,
        background: T.bg, color: T.text, direction: dir,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '26px',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.5s ease',
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <style>{`@keyframes skLoaderDot{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}`}</style>
      {/* סמלי בסיס האב + מיח"ה מסתובבים — לב מסך הטעינה */}
      <RotatingEmblems variant="loader" parentBase={parentBase} themeMode={themeMode} size={92} />

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '34px', fontWeight: 800, letterSpacing: '4px', fontFamily: 'monospace', color: T.text }}>SKY KING</div>
        <div style={{ fontSize: '15px', color: T.muted, letterSpacing: '2px', marginTop: '4px' }}>{tr('ctrl.skyBoard')}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '18px', fontWeight: 600, color: T.text }}>{tr('ctrl.systemLoading')}</span>
        <span style={{ display: 'inline-flex', gap: '5px' }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#3b82f6', display: 'inline-block', animation: `skLoaderDot 1.2s ${i * 0.18}s infinite ease-in-out` }} />
          ))}
        </span>
      </div>

      {/* שלבי הטעינה */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '220px', fontSize: '14px' }}>
        {steps.map(step => (
          <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: step.done ? T.text : T.muted }}>
            <span style={{ fontSize: '16px', width: '18px', textAlign: 'center' }}>{step.done ? '✓' : '○'}</span>
            <span>{step.label}</span>
          </div>
        ))}
      </div>

      {/* סימן היצרן — מעוגן לתחתית מסך הטעינה (absolute ולא פריט flex, כדי
          שלא יזוז עם מספר שלבי הטעינה), ונכנס באנימציית הרכבה אחרי שסמלי
          היחידות והכיתוב כבר על המסך */}
      <div style={{ position: 'absolute', bottom: '38px', insetInlineStart: 0, insetInlineEnd: 0, display: 'flex', justifyContent: 'center' }}>
        <LeoLogo height={30} themeMode={themeMode} animateIn animateDelay={0.3} />
      </div>
    </div>
  );
}
