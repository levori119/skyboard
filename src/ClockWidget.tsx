import React, { useState, useEffect, useRef, useCallback } from 'react';

interface Reminder {
  id: string;
  hour: number;
  minute: number;
  text: string;
  triggered: boolean;
}

type Tab = 'reminders' | 'timer' | 'stopwatch';

const pad2 = (n: number) => String(Math.floor(n)).padStart(2, '0');

function fmtDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

export function ClockWidget({ lightMode }: { lightMode?: boolean }) {
  const [now, setNow] = useState(new Date());
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('reminders');
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [newHour, setNewHour] = useState('');
  const [newMin, setNewMin] = useState('');
  const [newText, setNewText] = useState('');
  const [activeAlert, setActiveAlert] = useState<Reminder | null>(null);

  // Timer state
  const [timerInput, setTimerInput] = useState('05:00');
  const [timerSecs, setTimerSecs] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerDone, setTimerDone] = useState(false);

  // Stopwatch state
  const [swRunning, setSwRunning] = useState(false);
  const [swElapsed, setSwElapsed] = useState(0);
  const [swLaps, setSwLaps] = useState<number[]>([]);
  const swStartRef = useRef<number>(0);
  const swBaseRef = useRef<number>(0);

  const panelRef = useRef<HTMLDivElement>(null);

  // Live clock tick
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Check reminders every second
  useEffect(() => {
    const check = () => {
      const d = new Date();
      setReminders(prev => prev.map(r => {
        if (!r.triggered && d.getHours() === r.hour && d.getMinutes() === r.minute && d.getSeconds() === 0) {
          setActiveAlert(r);
          // Browser notification if permission granted
          if (Notification.permission === 'granted') {
            new Notification(`⏰ תזכורת — ${pad2(r.hour)}:${pad2(r.minute)}`, { body: r.text, icon: '/favicon.ico' });
          }
          return { ...r, triggered: true };
        }
        return r;
      }));
    };
    const iv = setInterval(check, 1000);
    return () => clearInterval(iv);
  }, []);

  // Timer countdown
  useEffect(() => {
    if (!timerRunning) return;
    if (timerSecs <= 0) { setTimerRunning(false); setTimerDone(true); return; }
    const iv = setInterval(() => setTimerSecs(s => {
      if (s <= 1) { setTimerRunning(false); setTimerDone(true); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(iv);
  }, [timerRunning]);

  // Stopwatch tick
  useEffect(() => {
    if (!swRunning) return;
    swStartRef.current = Date.now();
    const iv = setInterval(() => {
      setSwElapsed(swBaseRef.current + Math.floor((Date.now() - swStartRef.current) / 1000));
    }, 200);
    return () => clearInterval(iv);
  }, [swRunning]);

  const addReminder = () => {
    const h = parseInt(newHour);
    const m = parseInt(newMin);
    if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return;
    if (!newText.trim()) return;
    // Request notification permission
    if (Notification.permission === 'default') Notification.requestPermission();
    setReminders(prev => [...prev, { id: Date.now().toString(), hour: h, minute: m, text: newText.trim(), triggered: false }]);
    setNewHour(''); setNewMin(''); setNewText('');
  };

  const startTimer = () => {
    const parts = timerInput.split(':').map(Number);
    let secs = 0;
    if (parts.length === 2) secs = (parts[0] || 0) * 60 + (parts[1] || 0);
    else if (parts.length === 3) secs = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    if (secs <= 0) return;
    setTimerSecs(secs);
    setTimerRunning(true);
    setTimerDone(false);
  };

  const resetTimer = () => { setTimerRunning(false); setTimerSecs(0); setTimerDone(false); };

  const swStart = () => { swStartRef.current = Date.now(); swBaseRef.current = swElapsed; setSwRunning(true); };
  const swStop = () => { swBaseRef.current = swElapsed; setSwRunning(false); };
  const swLap = () => setSwLaps(prev => [...prev, swElapsed]);
  const swReset = () => { setSwRunning(false); setSwElapsed(0); setSwLaps([]); swBaseRef.current = 0; };

  const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const secStr = pad2(now.getSeconds());
  const pendingReminders = reminders.filter(r => !r.triggered).length;

  const bg = lightMode ? '#f1f5f9' : '#1e293b';
  const border = lightMode ? '#cbd5e1' : '#334155';
  const text = lightMode ? '#1e293b' : '#e2e8f0';
  const sub = lightMode ? '#64748b' : '#94a3b8';
  const panelBg = lightMode ? '#ffffff' : '#0f172a';

  return (
    <>
      {/* Inline clock button */}
      <div ref={panelRef} style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          onClick={() => setOpen(v => !v)}
          title="שעון, תזכורות, טיימר, סטופר"
          style={{
            display: 'flex', alignItems: 'baseline', gap: '2px',
            background: open ? (lightMode ? '#e2e8f0' : '#334155') : (lightMode ? '#f1f5f9' : '#1e293b'),
            border: `1px solid ${pendingReminders > 0 ? '#f59e0b' : border}`,
            borderRadius: '6px', padding: '3px 9px', cursor: 'pointer',
            color: text, userSelect: 'none', fontFamily: 'monospace',
          }}
        >
          <span style={{ fontSize: '16px', fontWeight: 'bold', letterSpacing: '1px', fontFamily: 'monospace' }}>
            {timeStr}<span style={{ fontSize: '12px', fontWeight: 'normal', color: sub }}>:{secStr}</span>
          </span>
          {pendingReminders > 0 && (
            <span style={{ marginRight: '4px', background: '#f59e0b', color: '#000', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold', padding: '0 5px', fontFamily: 'sans-serif' }}>
              {pendingReminders}
            </span>
          )}
        </button>

        {/* Panel */}
        {open && (
          <div
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0,
              zIndex: 9500, width: '310px',
              background: panelBg, border: `2px solid #3b82f6`,
              borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
              direction: 'rtl', overflow: 'hidden',
            }}
          >
            {/* Big clock header */}
            <div style={{ background: '#0a1628', padding: '10px 14px 6px', textAlign: 'center', borderBottom: `1px solid ${border}` }}>
              <div style={{ fontFamily: 'monospace', fontSize: '36px', fontWeight: 'bold', color: '#7dd3fc', letterSpacing: '3px', lineHeight: 1 }}>
                {timeStr}<span style={{ fontSize: '20px', color: '#475569' }}>:{secStr}</span>
              </div>
              <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                {now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${border}` }}>
              {([
                { key: 'reminders', label: '⏰ תזכורות' },
                { key: 'timer', label: '⏱ טיימר' },
                { key: 'stopwatch', label: '🏃 סטופר' },
              ] as { key: Tab; label: string }[]).map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} style={{
                  flex: 1, padding: '7px 4px', fontSize: '12px', fontWeight: tab === t.key ? 'bold' : 'normal',
                  background: tab === t.key ? (lightMode ? '#e0f2fe' : '#0c2a40') : 'transparent',
                  color: tab === t.key ? '#38bdf8' : sub,
                  border: 'none', borderBottom: tab === t.key ? '2px solid #38bdf8' : '2px solid transparent',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>{t.label}</button>
              ))}
            </div>

            <div style={{ padding: '10px', maxHeight: '260px', overflowY: 'auto' }}>
              {/* REMINDERS TAB */}
              {tab === 'reminders' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Add reminder */}
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <input value={newHour} onChange={e => setNewHour(e.target.value.replace(/\D/g, '').slice(0, 2))}
                      placeholder="שע" maxLength={2}
                      style={{ width: '38px', padding: '5px 4px', textAlign: 'center', background: lightMode ? '#f8fafc' : '#1e293b', border: `1px solid ${border}`, borderRadius: '5px', color: text, fontSize: '14px', fontFamily: 'monospace' }} />
                    <span style={{ color: sub, fontFamily: 'monospace', fontWeight: 'bold' }}>:</span>
                    <input value={newMin} onChange={e => setNewMin(e.target.value.replace(/\D/g, '').slice(0, 2))}
                      placeholder="דק" maxLength={2}
                      style={{ width: '38px', padding: '5px 4px', textAlign: 'center', background: lightMode ? '#f8fafc' : '#1e293b', border: `1px solid ${border}`, borderRadius: '5px', color: text, fontSize: '14px', fontFamily: 'monospace' }} />
                    <input value={newText} onChange={e => setNewText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addReminder()}
                      placeholder="תוכן התזכורת..."
                      style={{ flex: 1, padding: '5px 7px', background: lightMode ? '#f8fafc' : '#1e293b', border: `1px solid ${border}`, borderRadius: '5px', color: text, fontSize: '12px', direction: 'rtl' }} />
                    <button onClick={addReminder}
                      style={{ padding: '5px 10px', background: '#15803d', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>+</button>
                  </div>

                  {/* Reminders list */}
                  {reminders.length === 0 ? (
                    <div style={{ textAlign: 'center', color: sub, fontSize: '12px', padding: '10px 0' }}>אין תזכורות</div>
                  ) : (
                    reminders.map(r => (
                      <div key={r.id} style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        background: r.triggered ? (lightMode ? '#f0fdf4' : '#052e16') : (lightMode ? '#f8fafc' : '#1e293b'),
                        border: `1px solid ${r.triggered ? '#22c55e' : border}`, borderRadius: '6px', padding: '6px 8px',
                      }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '15px', color: r.triggered ? '#4ade80' : '#38bdf8', minWidth: '44px' }}>
                          {pad2(r.hour)}:{pad2(r.minute)}
                        </span>
                        <span style={{ flex: 1, fontSize: '12px', color: r.triggered ? '#4ade80' : text, textDecoration: r.triggered ? 'line-through' : 'none' }}>{r.text}</span>
                        {r.triggered && <span title="הופעל">✓</span>}
                        <button onClick={() => setReminders(prev => prev.filter(x => x.id !== r.id))}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', padding: '0 2px', lineHeight: 1 }}>✕</button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TIMER TAB */}
              {tab === 'timer' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: '48px', fontWeight: 'bold', letterSpacing: '3px', color: timerDone ? '#ef4444' : timerRunning ? '#4ade80' : '#7dd3fc', textAlign: 'center', lineHeight: 1, width: '100%' }}>
                    {timerSecs > 0 || timerRunning ? fmtDuration(timerSecs) : (
                      <input
                        value={timerInput}
                        onChange={e => setTimerInput(e.target.value)}
                        placeholder="05:00"
                        onFocus={e => e.target.select()}
                        style={{ width: '180px', textAlign: 'center', fontFamily: 'monospace', fontSize: '40px', background: 'transparent', border: `1px solid ${border}`, borderRadius: '8px', color: '#7dd3fc', padding: '4px 8px' }}
                      />
                    )}
                  </div>
                  {timerDone && <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '16px', animation: 'blink 0.6s step-end infinite' }}>⏰ הטיימר הסתיים!</div>}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {!timerRunning ? (
                      <button onClick={timerSecs > 0 ? () => setTimerRunning(true) : startTimer}
                        style={{ padding: '8px 20px', background: '#15803d', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                        ▶ {timerSecs > 0 ? 'המשך' : 'התחל'}
                      </button>
                    ) : (
                      <button onClick={() => setTimerRunning(false)}
                        style={{ padding: '8px 20px', background: '#d97706', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                        ⏸ עצור
                      </button>
                    )}
                    <button onClick={resetTimer}
                      style={{ padding: '8px 16px', background: lightMode ? '#e2e8f0' : '#334155', color: text, border: `1px solid ${border}`, borderRadius: '7px', cursor: 'pointer', fontSize: '13px' }}>
                      ↺ אפס
                    </button>
                  </div>
                  <div style={{ fontSize: '11px', color: sub, direction: 'rtl', textAlign: 'center' }}>פורמט: דקות:שניות או שעות:דקות:שניות</div>
                </div>
              )}

              {/* STOPWATCH TAB */}
              {tab === 'stopwatch' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: '48px', fontWeight: 'bold', letterSpacing: '2px', color: swRunning ? '#4ade80' : '#7dd3fc', textAlign: 'center', lineHeight: 1 }}>
                    {fmtDuration(swElapsed)}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {!swRunning ? (
                      <button onClick={swStart}
                        style={{ padding: '8px 20px', background: '#15803d', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                        ▶ {swElapsed === 0 ? 'התחל' : 'המשך'}
                      </button>
                    ) : (
                      <button onClick={swStop}
                        style={{ padding: '8px 20px', background: '#d97706', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                        ⏸ עצור
                      </button>
                    )}
                    {swRunning && (
                      <button onClick={swLap}
                        style={{ padding: '8px 14px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                        🏁 קצב
                      </button>
                    )}
                    <button onClick={swReset}
                      style={{ padding: '8px 14px', background: lightMode ? '#e2e8f0' : '#334155', color: text, border: `1px solid ${border}`, borderRadius: '7px', cursor: 'pointer', fontSize: '13px' }}>
                      ↺ אפס
                    </button>
                  </div>
                  {swLaps.length > 0 && (
                    <div style={{ width: '100%', maxHeight: '100px', overflowY: 'auto', direction: 'rtl' }}>
                      {[...swLaps].reverse().map((lap, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 6px', fontSize: '12px', color: sub, borderBottom: `1px solid ${border}`, fontFamily: 'monospace' }}>
                          <span>קצב {swLaps.length - i}</span>
                          <span>{fmtDuration(lap)}</span>
                          {i > 0 && <span style={{ color: '#94a3b8' }}>+{fmtDuration(swLaps[swLaps.length - i] - swLaps[swLaps.length - i - 1])}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Reminder alert modal */}
      {activeAlert && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setActiveAlert(null)}>
          <div style={{
            background: '#0f172a', border: '3px solid #f59e0b', borderRadius: '14px',
            padding: '28px 36px', textAlign: 'center', maxWidth: '360px',
            boxShadow: '0 0 60px rgba(245,158,11,0.4)', direction: 'rtl',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>⏰</div>
            <div style={{ fontSize: '28px', fontFamily: 'monospace', fontWeight: 'bold', color: '#fbbf24', marginBottom: '12px' }}>
              {pad2(activeAlert.hour)}:{pad2(activeAlert.minute)}
            </div>
            <div style={{ fontSize: '18px', color: '#e2e8f0', marginBottom: '20px', lineHeight: 1.4 }}>{activeAlert.text}</div>
            <button
              onClick={() => setActiveAlert(null)}
              style={{ padding: '10px 32px', background: '#f59e0b', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}
            >אישור</button>
          </div>
        </div>
      )}

      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </>
  );
}
