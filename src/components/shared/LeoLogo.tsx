// ─── LeoLogo — סימן היצרן (LEO²) ─────────────────────────────────────────────
// לוגו החברה המפתחת. רכיב משותף אחד (DRY) שמוצג בכל המסכים כסימן יצרן דיסקרטי:
// קצה הסרגל העליון (בקר / מגדל / דסק משימה), קצה כותרת מסך הניהול, ותחתית
// מסך ההתחברות. אין וריאנט למסך — אותה צורה בכל מקום, רק הגובה משתנה.
//
// למה SVG מוטבע ולא קובץ תמונה:
//   • נשאר חד בכל גודל מסך (--s) ובכל גובה שנבחר, בלי קבצי @2x/@3x.
//   • נטען עם ה-bundle — בלי בקשת רשת שמתחרה במטח קריאות ה-API של עליית הדשבורד
//     (אותו שיקול כמו בסמלים המובנים ב-RotatingEmblems).
//   • מקבל צבע לפי התמה במקום להיות תמונה שטוחה בצבע אחד.
//
// התאמת תמה (חובה לפי /ui-adapt): על רקע כהה הנייבי של המותג בלתי-קריא, ולכן
// מוצגת גרסת ה-reversed המקובלת — הכיתוב בהיר. הכחול הבהיר של הנקודה ושל ה-²
// הוא צבע מותג ונשאר בשתי הגרסאות. הרכיב יושב ב-#root ולכן מתכווץ/גדל
// אוטומטית עם --s (אין portal → אין צורך ב-zoom ידני).
//
// ⚠ **התמה 'ocean' היא תמה כהה** — למרות ההכללה "אור/כחול = רקע בהיר". הסרגלים
// בפועל: SectorDashboard `T.surface = #05404e` ו-MissionDeskView `panel = #123a5c`.
// נייבי על הרקע הזה נותן יחס ניגודיות ~1.3:1 (בלתי נראה), ולכן רק 'light' מקבל
// את גרסת הנייבי. הבדיקה `e2e/leo-logo.spec.ts` מודדת ניגודיות בשלוש התמות.

// אנימציית הכניסה (`animateIn`) מיועדת ל**מסך הטעינה בלבד** — שם התנועה זמנית
// ונעלמת עם הסרת המסך. בסרגלים התפעוליים הסימן סטטי בכוונה: תנועה מתמדת בכרום
// של עמדת בקרה היא הסחה (אותו עיקרון כמו ב-RotatingEmblems, variant='topbar').

import { useId } from 'react';

type ThemeMode = 'light' | 'dark' | 'ocean';

/** יחס רוחב/גובה של הסימן — לחישוב הרוחב מתוך הגובה המבוקש. */
export const LEO_LOGO_ASPECT = 210 / 106;

type LeoLogoProps = {
  /** גובה הסימן ב-px (לפני --s). ברירת מחדל: גובה סרגל עליון. */
  height?: number;
  /** תמת המסך שבו הסימן יושב — קובע נייבי ('light') מול reversed ('dark'/'ocean'). */
  themeMode?: ThemeMode;
  /** עמעום קל בסרגלים תפעוליים, כדי לא להתחרות במידע. */
  opacity?: number;
  /**
   * אנימציית הרכבה חד-פעמית: האותיות עולות, הכנף נפרשת, הקשת מטפסת
   * והנקודה "נוחתת" בקצה. למסך הטעינה בלבד — מכבד `prefers-reduced-motion`.
   */
  animateIn?: boolean;
  /** השהיה (שניות) לפני תחילת אנימציית הכניסה, לתזמור מול שאר המסך. */
  animateDelay?: number;
};

/**
 * ה-CSS של אנימציית הכניסה, מקושר ל-uid של המופע (כמו ב-RotatingEmblems) כדי
 * ששני מופעים באותו עמוד לא יתנגשו על שמות ה-keyframes.
 */
function enterCss(uid: string): string {
  return `
    @keyframes leo-rise-${uid} { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    @keyframes leo-wing-${uid} { from { opacity: 0; transform: scaleX(0.12); }   to { opacity: 1; transform: none; } }
    @keyframes leo-arc-${uid}  { from { opacity: 0; transform: translate(-9px, 12px); } to { opacity: 1; transform: none; } }
    @keyframes leo-sup-${uid}  { from { opacity: 0; transform: translateY(-7px) scale(0.5); } to { opacity: 1; transform: none; } }
    @keyframes leo-pop-${uid} {
        0%   { opacity: 0; transform: scale(0); }
       60%   { opacity: 1; transform: scale(1.8); }
      100%   { opacity: 1; transform: scale(1); }
    }
    .leo-a-${uid} {
      opacity: 0;
      animation-duration: 0.5s;
      animation-timing-function: cubic-bezier(0.22, 0.68, 0.3, 1);
      animation-fill-mode: both;
      transform-box: fill-box;
      will-change: transform, opacity;
    }
    .leo-rise-${uid} { animation-name: leo-rise-${uid}; }
    /* הכנף נפרשת החוצה: הפס הימני מהשורש ימינה, הלהבים מהשורש שמאלה */
    .leo-wingR-${uid} { animation-name: leo-wing-${uid}; transform-origin: 0% 50%; }
    .leo-wingL-${uid} { animation-name: leo-wing-${uid}; transform-origin: 100% 50%; }
    .leo-arc-${uid}   { animation-name: leo-arc-${uid}; animation-duration: 0.6s; }
    .leo-dot-${uid}   { animation-name: leo-pop-${uid}; animation-duration: 0.45s; transform-origin: 50% 50%; }
    .leo-sup-${uid}   { animation-name: leo-sup-${uid}; }
    @media (prefers-reduced-motion: reduce) {
      .leo-a-${uid} { animation: none; opacity: 1; transform: none; }
    }
  `;
}

export function LeoLogo({
  height = 17,
  themeMode = 'dark',
  opacity = 1,
  animateIn = false,
  animateDelay = 0,
}: LeoLogoProps) {
  // רק 'light' הוא רקע בהיר; 'dark' ו-'ocean' שניהם כהים (ראה ההערה למעלה).
  const onLight = themeMode === 'light';
  const mark = onLight ? '#17305c' : '#cbd5e1';
  const accent = onLight ? '#5b9bd5' : '#6aa9dd';

  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  // בלי אנימציה — אין class ואין השהיה, והאלמנטים מצוירים כרגיל (opacity 1)
  const anim = (kind: 'rise' | 'wingR' | 'wingL' | 'arc' | 'dot' | 'sup', delay: number) =>
    animateIn
      ? { className: `leo-a-${uid} leo-${kind}-${uid}`, style: { animationDelay: `${animateDelay + delay}s` } }
      : {};

  return (
    <svg
      role="img"
      aria-label="LEO²"
      width={height * LEO_LOGO_ASPECT}
      height={height}
      viewBox="-2 -2 210 106"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0, opacity, overflow: 'visible' }}
    >
      {animateIn && <style>{enterCss(uid)}</style>}
      {/* סדר ההרכבה: אותיות → הכנף נפרשת → הקשת מטפסת → הנקודה "נוחתת" בקצה.
          כל הרצף ~1.1ש' מתחילת ההשהיה, כדי שגם טעינה מהירה תספיק להשלים אותו. */}
      {/* L */}
      <path d="M0,30 H15 V82 H48 V97 H0 Z" fill={mark} {...anim('rise', 0)} />
      {/* E */}
      <path d="M59,30 H112 V43.5 H73 V56.5 H107 V70 H73 V83.5 H112 V97 H59 Z" fill={mark} {...anim('rise', 0.06)} />
      {/* O — טבעת (stroke ולא שני עיגולים, כדי שעובי הטבעת יישאר אחיד בכל גודל) */}
      <circle cx="155.5" cy="64.5" r="26.5" fill="none" stroke={mark} strokeWidth="18" {...anim('rise', 0.12)} />
      {/* כנף — פס אחד בגובה קבוע, שמשמאל נחצה לשני להבים בעלי חוד שמאלה
          (מוטיב כנפי טיס). הקשת עוברת בחריץ שבין הלהבים לפס הימני. */}
      <path d="M139,10.2 H191 L184,24.4 H131 Z" fill={mark} {...anim('wingR', 0.2)} />
      <path d="M96,10.2 H130 V17.4 H104 Z" fill={mark} {...anim('wingL', 0.25)} />
      <path d="M107,19.2 H127 V24.4 H114.5 Z" fill={mark} {...anim('wingL', 0.29)} />
      {/* מטס — קשת עולה שמסתיימת בנקודה */}
      <path d="M111,51 C119.5,32 137,14.5 163,3.6 C141.5,19 127.5,37 120.5,54 Z" fill={mark} {...anim('arc', 0.36)} />
      <circle cx="168" cy="3.4" r="3.9" fill={accent} {...anim('dot', 0.66)} />
      {/* ² */}
      <path
        d="M188.6,29.4 C188.6,24.6 191.9,21.6 196.1,21.6 C200.4,21.6 203.2,24.4 203.2,28.2
           C203.2,31 201.7,33.1 198.7,35.7 L195.3,38.5 H203.4 V42.4 H188.4 V39 L195.7,32.7
           C197.5,31.1 198.5,29.8 198.5,28.4 C198.5,26.8 197.6,25.8 196,25.8
           C194.3,25.8 193.3,27 193.2,29.4 Z"
        fill={accent}
        {...anim('sup', 0.52)}
      />
    </svg>
  );
}
