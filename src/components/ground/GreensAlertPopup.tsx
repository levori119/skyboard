import { createPortal } from 'react-dom';
import { tr } from '../../i18n/tr';
import { bidiAuto } from '../../utils/bidi';
import type { FrameTheme } from '../../utils/windowFrame';
import type { GreensAlertRow } from '../../utils/joiningPoints';

// ─── התראה מתפרצת: לא דווחו גלגלים ירוקים ───────────────────────────────────
//
// מטוס בבסיס או בפיינל בלי דיווח ירוקים (PATTERN_AUTOTRACK_SPEC §6). פעם אחת
// לכל כניסה למצב (`greensPopupQueue`) - ההבהוב האדום בטבלה, על ההקפה ועל הרכיב
// האווירי נשאר עד הדיווח, והחלון הזה רק מוודא שהפקח **ראה**.
//
// **אישור בלבד, בלי ✕ ובלי Esc** - אותה הכרעה של ההתראה המתפרצת בהלאמת אזור
// (SeizureAlert): התראה בטיחותית שנסגרת בלחיצת Esc שנועדה לחלון אחר היא התראה
// שלא הייתה. האדום הוא צבע סטטוס, ולכן אינו תלוי תמה; הרקע והטקסט כן.

interface Props {
  queue: GreensAlertRow[];
  themeMode: FrameTheme;
  onAck: () => void;
}

const palette = (themeMode: FrameTheme) =>
  themeMode === 'light'
    ? { panel: '#ffffff', text: '#0f172a', muted: '#475569' }
    : themeMode === 'ocean'
      ? { panel: '#05404e', text: '#cffafe', muted: '#7dd3fc' }
      : { panel: '#0f172a', text: '#e2e8f0', muted: '#94a3b8' };

const RED = '#b91c1c';

export default function GreensAlertPopup({ queue, themeMode, onAck }: Props) {
  if (!queue.length) return null;
  const C = palette(themeMode);
  const cur = queue[0];
  return createPortal(
    <div data-testid="greens-alert-popup" style={{
      position: 'fixed', inset: 0, zIndex: 10550,
      background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div role="alertdialog" aria-labelledby="greens-alert-title" style={{
        zoom: 'var(--s)' as any,
        width: 'min(420px, 92vw)', background: C.panel, borderRadius: 10,
        border: `3px solid ${RED}`, boxShadow: '0 18px 50px rgba(0,0,0,0.6)', overflow: 'hidden',
        animation: 'skyking-greens-row-blink 0.6s steps(1) infinite',
      }}>
        <div id="greens-alert-title" style={{ background: RED, color: '#ffffff', padding: '10px 14px', fontSize: 17, fontWeight: 'bold' }}>
          ⚠ {tr('joining.greensPopupTitle')}
        </div>
        <div style={{ padding: '14px', color: C.text, fontSize: 16 }}>
          {bidiAuto(tr('joining.greensPopupBody', { label: cur.label }))}
          {queue.length > 1 && (
            <div style={{ marginTop: 8, color: C.muted, fontSize: 12 }}>
              {tr('joining.greensPopupMore', { count: queue.length - 1 })}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 14px 14px' }}>
          <button
            type="button"
            data-testid="greens-alert-ack"
            autoFocus
            onClick={onAck}
            style={{ padding: '8px 22px', fontSize: 15, fontWeight: 'bold', borderRadius: 6, border: 'none', background: RED, color: '#ffffff', cursor: 'pointer' }}>
            {tr('joining.greensPopupAck')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
