import React, { useEffect, useRef, useState } from 'react';
import { InteractiveInkEditor } from 'iink-ts';

// POC: בדיקת איכות זיהוי כתב-יד של MyScript iink (בעברית) מול הזיהוי המקומי הקיים.
// מפתחות trial מ-.env (gitignored). עובד מול MyScript Cloud — דורש אינטרנט (לבדיקה בלבד).
const APP_KEY = (import.meta as any).env?.VITE_MYSCRIPT_APP_KEY as string | undefined;
const HMAC_KEY = (import.meta as any).env?.VITE_MYSCRIPT_HMAC_KEY as string | undefined;

const LANGS: { code: string; label: string }[] = [
  { code: 'he_IL', label: 'עברית' },
  { code: 'en_US', label: 'English' },
];

const MyScriptTestPanel = ({ onClose }: { onClose: () => void }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('מאתחל…');
  const [lang, setLang] = useState('he_IL');

  useEffect(() => {
    if (!hostRef.current) return;
    if (!APP_KEY || !HMAC_KEY) { setStatus('⚠️ חסרים מפתחות MyScript ב-.env (VITE_MYSCRIPT_APP_KEY / VITE_MYSCRIPT_HMAC_KEY)'); return; }
    let editor: any;
    let disposed = false;
    (async () => {
      try {
        editor = new InteractiveInkEditor(hostRef.current as HTMLElement, {
          configuration: {
            server: { scheme: 'https', host: 'cloud.myscript.com', applicationKey: APP_KEY, hmacKey: HMAC_KEY },
            recognition: { type: 'TEXT', lang },
          },
        } as any);
        editorRef.current = editor;
        editor.event.addEventListener('exported', (e: any) => {
          const t = e?.detail?.['text/plain'];
          if (typeof t === 'string') setText(t);
        });
        editor.event.addEventListener('error', (e: any) => {
          setStatus('❌ שגיאת זיהוי: ' + (e?.detail?.message || e?.detail?.error || JSON.stringify(e?.detail) || 'לא ידועה'));
        });
        await editor.initialize();
        if (!disposed) setStatus('✅ מוכן — כתוב או"ק בעט/אצבע');
      } catch (err: any) {
        if (!disposed) setStatus('❌ כשל אתחול: ' + (err?.message || String(err)));
      }
    })();
    return () => { disposed = true; try { editor?.destroy?.(); } catch { /* ignore */ } };
  }, [lang]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 16, width: 580, maxWidth: '92vw', direction: 'rtl', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0, color: '#1e293b' }}>🧪 בדיקת זיהוי MyScript</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={lang} onChange={e => { setText(''); setLang(e.target.value); }} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}>
              {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{status}</div>
        <div ref={hostRef} style={{ width: '100%', height: 240, border: '2px solid #cbd5e1', borderRadius: 8, touchAction: 'none', background: '#fff', position: 'relative', overflow: 'hidden' }} />
        <div style={{ marginTop: 10, padding: '10px 12px', background: '#f1f5f9', borderRadius: 8, fontSize: 20, fontWeight: 'bold', color: '#0f172a', minHeight: 30, textAlign: 'center' }}>
          {text || '—'}
        </div>
        <button onClick={() => { try { editorRef.current?.clear?.(); } catch { /* ignore */ } setText(''); }}
          style={{ marginTop: 8, padding: '6px 16px', background: '#475569', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>נקה</button>
      </div>
    </div>
  );
};

export default MyScriptTestPanel;
