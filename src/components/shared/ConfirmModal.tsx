// ─── Confirm Modal (extracted from App.tsx lines 61-100) ─────────────────────
import React from 'react';
import { useTranslation } from 'react-i18next';

// ─── customConfirm infrastructure ─────────────────────────────────────────────
/** תיבת סימון בתוך דיאלוג האישור - "לנקות גם X?" */
export type ConfirmOption = { key: string; label: string; checked?: boolean };
type ConfirmState = {
  msg: string;
  options: ConfirmOption[];
  resolve: (v: Record<string, boolean> | null) => void;
};
type ShowFn = (msg: string, options: ConfirmOption[]) => Promise<Record<string, boolean> | null>;
// בלי מודל מורכב - window.confirm, והתיבות נשארות בערך ברירת המחדל שלהן
const _fallback: ShowFn = (msg, options) => Promise.resolve(
  window.confirm(msg) ? Object.fromEntries(options.map(o => [o.key, !!o.checked])) : null);
let _show: ShowFn = _fallback;

/**
 * Drop-in replacement for window.confirm() that renders a styled modal.
 * Works only when <ConfirmModal /> is mounted in the React tree.
 */
export const customConfirm = async (msg: string) => (await _show(msg, [])) !== null;

/**
 * אישור עם תיבות סימון: null = בוטל, אחרת מפה key → מסומן.
 * אותו מודל כמו customConfirm (אישור ב-Enter, ביטול ב-Esc) - רק עם שאלות המשך,
 * כדי שהמפעיל יענה על הכול בלחיצה אחת ולא בשרשרת חלונות.
 */
export const customConfirmOptions = (msg: string, options: ConfirmOption[]) => _show(msg, options);

// ─── Component ────────────────────────────────────────────────────────────────
const ConfirmModal: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [state, setState] = React.useState<ConfirmState | null>(null);
  const [checks, setChecks] = React.useState<Record<string, boolean>>({});
  const checksRef = React.useRef(checks);
  checksRef.current = checks;

  React.useEffect(() => {
    _show = (msg, options) => new Promise(resolve => {
      setChecks(Object.fromEntries(options.map(o => [o.key, !!o.checked])));
      setState({ msg, options, resolve });
    });
    return () => { _show = _fallback; };
  }, []);

  const answer = (ok: boolean) => {
    if (!state) return;
    state.resolve(ok ? { ...checksRef.current } : null);
    setState(null);
  };

  React.useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') answer(false);
      if (e.key === 'Enter')  answer(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  if (!state) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      direction: i18n.dir(),
    }}>
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '14px',
        padding: '32px 36px',
        minWidth: '300px',
        maxWidth: '420px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: '20px', color: '#f1f5f9',
          fontWeight: 'bold', marginBottom: '28px', lineHeight: 1.5,
          whiteSpace: 'pre-line',
        }}>
          {state.msg}
        </div>
        {state.options.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '-12px', marginBottom: '24px', textAlign: 'start' }}>
            {state.options.map(o => (
              // שורה שלמה לחיצה (מגע ועט) - לא רק הריבוע הקטן
              <label key={o.key} style={{
                display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                padding: '8px 10px', borderRadius: '8px', fontSize: '15px', color: '#e2e8f0',
                background: checks[o.key] ? 'rgba(234,88,12,0.18)' : 'rgba(51,65,85,0.5)',
                border: `1px solid ${checks[o.key] ? '#ea580c' : '#475569'}`,
                userSelect: 'none',
              }}>
                <input type="checkbox" checked={!!checks[o.key]}
                  onChange={e => { const v = e.target.checked; setChecks(c => ({ ...c, [o.key]: v })); }}
                  style={{ width: 20, height: 20, accentColor: '#ea580c', cursor: 'pointer', flexShrink: 0 }} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            autoFocus
            onClick={() => answer(true)}
            style={{
              background: '#ef4444', color: 'white', border: 'none',
              borderRadius: '8px', padding: '10px 28px',
              fontSize: '15px', fontWeight: 'bold', cursor: 'pointer',
            }}
          >
            {t('common.confirm')}
          </button>
          <button
            onClick={() => answer(false)}
            style={{
              background: '#334155', color: '#cbd5e1', border: 'none',
              borderRadius: '8px', padding: '10px 28px',
              fontSize: '15px', cursor: 'pointer',
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
