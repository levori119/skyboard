// כפתור צילום מסך 📷 - לחיצה אחת שומרת PNG ב-Downloads בשם העמדה + תאריך ושעה.
// רכיב משותף: אותו כפתור באותה התנהגות בכל מסך (עמדה, ניהול). הלוגיקה ב-utils/screenshot.ts.
// Ctrl+P מצלם גם הוא - ובלי לסגור תפריט / קליק ימני פתוח (לחיצה על הכפתור סוגרת אותם).
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { tr } from '../../i18n/tr';
import { takeScreenshot, isScreenshotHotkey } from '../../utils/screenshot';

interface Props {
  /** שם העמדה - נכנס לשם הקובץ */
  station?: string | null;
  /** עיצוב הכפתור, כדי שישב טבעי בסרגל של המסך המארח */
  style?: CSSProperties;
}

const FEEDBACK_MS = 2500;

export default function ScreenshotButton({ station, style }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const shoot = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const file = await takeScreenshot(station);
    setBusy(false);
    setMsg(file ? { ok: true, text: tr('screenRec.shotSaved', { file }) } : { ok: false, text: tr('screenRec.shotFailed') });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), FEEDBACK_MS);
  };

  // שלב ה-capture + עצירה - כדי שאף מאזין אחר (תפריט שנסגר במקש, הדפסת הדפדפן) לא יגיב
  const shootRef = useRef(shoot);
  shootRef.current = shoot;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isScreenshotHotkey(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void shootRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        data-help="screenshot"
        onClick={shoot}
        disabled={busy}
        title={tr('screenRec.shotButton')}
        aria-label={tr('screenRec.shotButton')}
        style={{
          background: 'transparent', color: 'inherit', border: '1px solid rgba(148,163,184,0.5)',
          borderRadius: '4px', padding: '2px 7px', fontSize: '13px', lineHeight: 1.2,
          cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1, whiteSpace: 'nowrap',
          ...style,
        }}
      >
        📷
      </button>
      {msg && (
        // data-nosnapshot - ההודעה עצמה לא נכנסת לצילום הבא
        <div
          data-nosnapshot
          role="status"
          style={{
            position: 'absolute', top: '100%', insetInlineStart: 0, marginTop: '4px', zIndex: 3000,
            padding: '4px 8px', borderRadius: '4px', fontSize: '11px', whiteSpace: 'nowrap',
            pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
            // צבעי סטטוס (הצלחה/כישלון) - זהים בכל התמות
            background: msg.ok ? '#065f46' : '#7f1d1d', color: msg.ok ? '#d1fae5' : '#fecaca',
            border: `1px solid ${msg.ok ? '#10b981' : '#dc2626'}`,
          }}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
