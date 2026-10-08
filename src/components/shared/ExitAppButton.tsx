// כפתור "יציאה" במסך הכניסה - מוריד את האפליקציה.
//
// הלחיצה פותחת מסך פרידה קצר ("תודה שהשתמשת...") ורק אחריו היציאה בפועל.
// מסך הפרידה הוא גם האישור: יש בו "ביטול" עד שהזמן נגמר, כך שלחיצה בטעות
// לא מורידה את העמדה בלי הזדמנות לחזור - ובלי modal נוסף.
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { quitApp, FAREWELL_MS } from '../../utils/appQuit';

type Phase = 'idle' | 'farewell' | 'blocked';

export default function ExitAppButton() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('idle');
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const start = () => {
    setPhase('farewell');
    timer.current = window.setTimeout(async () => {
      timer.current = null;
      const res = await quitApp();
      if (res === 'unsupported') setPhase('blocked');
    }, FAREWELL_MS);
  };

  const cancel = () => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    setPhase('idle');
  };

  return (
    <>
      <button
        onClick={start}
        title={t('login.exitTitle')}
        style={{
          position: 'absolute', top: '16px', insetInlineStart: '20px', zIndex: 10,
          padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold',
          border: '1px solid rgba(248,113,113,0.5)', background: 'rgba(239,68,68,0.12)', color: '#fca5a5',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}
      >
        <span aria-hidden>⏻</span>{t('login.exit')}
      </button>

      {phase !== 'idle' && (
        <div
          role="dialog"
          aria-live="polite"
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '18px',
            background: 'radial-gradient(circle at 50% 40%, #1e3a8a 0%, #0f172a 60%, #020617 100%)',
            color: 'white', textAlign: 'center', padding: '16px',
            animation: 'skExitFade 0.4s ease-out',
          }}
        >
          <style>{`
            @keyframes skExitFade { from { opacity: 0 } to { opacity: 1 } }
            @keyframes skExitFly { 0% { transform: translate(-40vw, 12vh) rotate(-18deg); opacity: 0 }
              15% { opacity: 1 } 100% { transform: translate(40vw, -20vh) rotate(-18deg); opacity: 0 } }
            @keyframes skExitBar { from { transform: scaleX(1) } to { transform: scaleX(0) } }
          `}</style>
          <div style={{ fontSize: '56px', animation: `skExitFly ${FAREWELL_MS}ms ease-in forwards`, direction: 'ltr' }} aria-hidden>✈️</div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '1px' }}>
            {t('login.exitThanks')}
          </div>
          <div style={{ fontSize: '20px', color: '#93c5fd' }}>{t('login.exitBlessing')}</div>
          {phase === 'farewell' ? (
            <>
              <div style={{ width: '240px', maxWidth: '80vw', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#60a5fa', transformOrigin: 'left', animation: `skExitBar ${FAREWELL_MS}ms linear forwards` }} />
              </div>
              <button
                onClick={cancel}
                style={{ marginTop: '6px', padding: '8px 22px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#cbd5e1' }}
              >
                {t('common.cancel')}
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: '14px', color: '#94a3b8' }}>{t('login.exitCloseTab')}</div>
              <button
                onClick={cancel}
                style={{ padding: '8px 22px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#cbd5e1' }}
              >
                {t('login.exitBack')}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
