// "הצג לי" — מאיר על המסך את הרכיב שהמפעיל בחר בחלון העזרה.
//
// למה: הסבר טקסטואלי לא עונה על "איפה זה נמצא". כאן החלון נסגר לרגע, המסך
// מוחשך, והרכיב האמיתי מקבל טבעת פועמת + תווית עם שמו ומיקומו. זה מלמד את
// מפת המסך, לא רק את הפונקציה.
//
// עוגן: כל רכיב שניתן להצביע עליו נושא `data-help="<topicId>"` ב-SectorDashboard,
// ולכן אין כאן רשימת סלקטורים משוכפלת.
//
// ⚠️ סקייל: הרכיב יושב בתוך #root ולכן מקבל `zoom: var(--s)`, בעוד
// getBoundingClientRect מחזיר פיקסלים אמיתיים של המסך. לכן כל קואורדינטה
// מחולקת ב---s (ראה /ui-adapt).
import { useEffect, useLayoutEffect, useState } from 'react';
import { tr } from '../../i18n/tr';
import { crewPalette, type ThemeMode } from './StationCrewForm';

export interface HelpSpotlightProps {
  /** ה-id של נושא העזרה - מחפש [data-help="<id>"] */
  targetId: string;
  title: string;
  where: string;
  themeMode?: ThemeMode;
  onClose: () => void;
}

type Box = { top: number; left: number; width: number; height: number };

const PAD = 6;
const LABEL_W = 320;
const EDGE = 10;

/** הזום הגלובלי (--s). כל המדידות מומרות דרכו ליחידות שבהן אנחנו ממקמים. */
const cssZoom = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;

export default function HelpSpotlight({ targetId, title, where, themeMode = 'dark', onClose }: HelpSpotlightProps) {
  const c = crewPalette(themeMode);
  const [box, setBox] = useState<Box | null>(null);
  const [missing, setMissing] = useState(false);
  // גודל החלון **ביחידות מוגדלות** - אחרת התווית נחתכת ב-24" (ראה /ui-adapt)
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));

  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector(`[data-help="${targetId}"]`) as HTMLElement | null;
      if (!el) { setMissing(true); setBox(null); return; }
      setMissing(false);
      const r = el.getBoundingClientRect();
      // --s: הזום הגלובלי. הקואורדינטות של rect הן פיקסלי מסך, והמיקום שלנו
      // נמדד ביחידות מוגדלות - ולכן מחלקים.
      const s = cssZoom();
      setView({ w: window.innerWidth / s, h: window.innerHeight / s });
      setBox({
        top: r.top / s - PAD, left: r.left / s - PAD,
        width: r.width / s + PAD * 2, height: r.height / s + PAD * 2,
      });
    };
    measure();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('resize', measure);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('keydown', onKey); };
  }, [targetId, onClose]);

  // מעקב אחרי רכיבים שזזים (פאנל שנפתח, סרגל שנשבר לשורה) - מדידה חוזרת קצרה
  useEffect(() => {
    const iv = setInterval(() => {
      const el = document.querySelector(`[data-help="${targetId}"]`) as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const s = cssZoom();
      setBox(prev => {
        const next = { top: r.top / s - PAD, left: r.left / s - PAD, width: r.width / s + PAD * 2, height: r.height / s + PAD * 2 };
        return prev && Math.abs(prev.top - next.top) < 1 && Math.abs(prev.left - next.left) < 1
          && Math.abs(prev.width - next.width) < 1 && Math.abs(prev.height - next.height) < 1 ? prev : next;
      });
    }, 400);
    return () => clearInterval(iv);
  }, [targetId]);

  // התווית נצמדת מתחת לרכיב, ואם אין מקום - מעליו; אופקית היא נשארת בתוך המסך
  const labelBelow = box ? box.top + box.height + 10 : 0;
  const labelTop = box && labelBelow > view.h - 140 ? Math.max(EDGE, box.top - 128) : labelBelow;
  const labelLeft = box
    ? Math.max(EDGE, Math.min(box.left, view.w - LABEL_W - EDGE))
    : EDGE;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10020 }} onClick={onClose}>
      <style>{`@keyframes helpSpotPulse{0%,100%{box-shadow:0 0 0 9999px rgba(0,0,0,0.62),0 0 0 2px #38bdf8,0 0 18px 4px rgba(56,189,248,0.55)}50%{box-shadow:0 0 0 9999px rgba(0,0,0,0.62),0 0 0 4px #7dd3fc,0 0 30px 10px rgba(56,189,248,0.85)}}`}</style>

      {/* טבעת ההדגשה סביב הרכיב האמיתי. ה-box-shadow הענק הוא "החור" בהחשכה. */}
      {box && (
        <div
          data-testid="help-spotlight-ring"
          style={{
            position: 'fixed', top: box.top, left: box.left, width: box.width, height: box.height,
            borderRadius: '10px', pointerEvents: 'none',
            animation: 'helpSpotPulse 1.1s ease-in-out infinite',
          }}
        />
      )}

      {/* אין רכיב תואם (למשל תפריט שנסגר) - מחשיכים ומסבירים במרכז */}
      {missing && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.62)' }} />}

      <div
        onClick={e => e.stopPropagation()}
        data-testid="help-spotlight"
        style={{
          position: 'fixed',
          top: missing ? '50%' : labelTop,
          left: missing ? '50%' : labelLeft,
          transform: missing ? 'translate(-50%,-50%)' : undefined,
          width: `${LABEL_W}px`, maxWidth: 'calc(92vw / var(--s, 1))',
          // border-box: בלי זה ה-padding וה-border מתווספים ל-320 והתווית גולשת
          // מקצה המסך כשהרכיב יושב בצד ימין
          boxSizing: 'border-box',
          background: c.card, border: `2px solid ${c.accent}`, borderRadius: '12px',
          padding: '12px 14px', boxShadow: '0 10px 32px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: 'bold', color: c.title, marginBottom: '4px' }}>{title}</div>
        <div style={{ fontSize: '12px', color: c.label, lineHeight: 1.5, marginBottom: '10px' }}>
          <span aria-hidden style={{ marginInlineEnd: '4px' }}>📍</span>
          {missing ? tr('help.spotlightMissing') : where}
        </div>
        <button
          onClick={onClose}
          style={{ width: '100%', padding: '8px', background: c.accent, color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
        >{tr('help.backToHelp')}</button>
      </div>
    </div>
  );
}
