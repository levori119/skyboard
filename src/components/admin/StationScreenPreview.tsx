// "הצג מסך לדוגמה" — המסך של העמדה על כל המסך, מתוך מסך הניהול.
//
// מי שמגדיר עמדה לא צריך להתחבר אליה כדי לראות מה יצא: הכפתור בטופס העמדה פותח
// כאן את **המסך האמיתי** שלה, בגודל מלא ובזמן אמת, ואותו רכיב מסגרת שמשמש את
// סרגל ההצצה בעמדה (StationScreenFrame) — אין שכפול של לוגיקת רינדור.
//
// קריאה בלבד, בשתי שכבות: pointer-events חסום על המסגרת, ובנוסף מצב peek חוסם
// כל כתיבה ל-API (installPeekWriteGuard). כך "הצצה" לעולם אינה משנה עמדה חיה.
//
// **מה מוצג זה מה שנשמר**: המסגרת קוראת את הגדרות העמדה מהשרת, ולכן שינויים
// שעדיין בטופס ולא נשמרו אינם בתוכה. במקרה כזה מוצגת אזהרה בכותרת במקום
// להשאיר את המגדיר בהנחה שהוא רואה את השינוי שלו.
import { useEffect } from 'react';
import { tr } from '../../i18n/tr';
import { frameColor } from '../../utils/windowFrame';
import StationScreenFrame from '../shared/StationScreenFrame';

const HEADER_H = 38;

export default function StationScreenPreview({ presetId, stationName, dirty = false, onClose }: {
  presetId: number;
  stationName: string;
  /** בטופס יש שינויים שטרם נשמרו — הם אינם משתקפים במסך */
  dirty?: boolean;
  onClose: () => void;
}) {
  // Esc סוגר — המגדיר לא צריך לחפש את הכפתור
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // חלון **צפייה** — ולכן תורכיז, כמו כל חלון צפייה במערכת (CLAUDE.md §מסגרת חלון)
  const accent = frameColor('view');

  return (
    // יושב מעל מודל הגדרות העמדה (z 4000) ומעל בורר המפה של הניהול (9200)
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9800, background: '#020617',
      display: 'flex', flexDirection: 'column',
      border: `2px solid ${accent}`, boxSizing: 'border-box',
    }}>
      <div style={{
        height: HEADER_H, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px',
        padding: '0 12px', background: '#0f172a', borderBottom: `1px solid ${accent}`,
      }}>
        <span style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {stationName}
        </span>
        <span style={{ color: accent, fontSize: '12px', whiteSpace: 'nowrap' }}>{tr('admin.previewStationScreenTitle')}</span>
        <span style={{ color: '#64748b', fontSize: '11px', whiteSpace: 'nowrap' }}>{tr('ctrl.peekReadOnly')}</span>
        {dirty && (
          <span style={{ color: '#fbbf24', fontSize: '11px', background: '#422006', border: '1px solid #854d0e', borderRadius: '5px', padding: '2px 8px' }}>
            {tr('admin.previewStationScreenDirty')}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ color: '#475569', fontSize: '11px', whiteSpace: 'nowrap' }}>{tr('admin.previewStationScreenEsc')}</span>
        <button
          type="button" onClick={onClose} title={tr('ctrl.peekClose')} aria-label={tr('ctrl.peekClose')}
          style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', width: '28px', height: '24px', borderRadius: '5px', cursor: 'pointer', fontSize: '14px', lineHeight: 1, flexShrink: 0 }}>✕</button>
      </div>

      {/* המסגרת ממלאת את שאר המסך ונמדדת בפועל, כך שקנה המידה נכון בכל גודל מסך */}
      <div style={{ flex: 1, position: 'relative' }}>
        <StationScreenFrame presetId={presetId} />
      </div>
    </div>
  );
}
