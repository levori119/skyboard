// ─── Confirm Modal (extracted from App.tsx lines 61-100) ─────────────────────
import React from 'react';

// ─── customConfirm infrastructure ─────────────────────────────────────────────
type ConfirmFn = (msg: string) => Promise<boolean>;
let _showConfirm: ConfirmFn = (msg) => Promise.resolve(window.confirm(msg));

/**
 * Drop-in replacement for window.confirm() that renders a styled modal.
 * Works only when <ConfirmModal /> is mounted in the React tree.
 */
export const customConfirm = (msg: string) => _showConfirm(msg);

// ─── Component ────────────────────────────────────────────────────────────────
const ConfirmModal: React.FC = () => {
  const [state, setState] = React.useState<{ msg: string; resolve: (v: boolean) => void } | null>(null);

  React.useEffect(() => {
    _showConfirm = (msg) => new Promise(resolve => setState({ msg, resolve }));
    return () => {
      _showConfirm = (msg) => Promise.resolve(window.confirm(msg));
    };
  }, []);

  React.useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { state.resolve(false); setState(null); }
      if (e.key === 'Enter')  { state.resolve(true);  setState(null); }
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
      direction: 'rtl',
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
        }}>
          {state.msg}
        </div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            autoFocus
            onClick={() => { state.resolve(true); setState(null); }}
            style={{
              background: '#ef4444', color: 'white', border: 'none',
              borderRadius: '8px', padding: '10px 28px',
              fontSize: '15px', fontWeight: 'bold', cursor: 'pointer',
            }}
          >
            אישור
          </button>
          <button
            onClick={() => { state.resolve(false); setState(null); }}
            style={{
              background: '#334155', color: '#cbd5e1', border: 'none',
              borderRadius: '8px', padding: '10px 28px',
              fontSize: '15px', cursor: 'pointer',
            }}
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
