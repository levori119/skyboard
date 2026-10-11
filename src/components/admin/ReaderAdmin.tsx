// ניהול חלון הקריאה - שלושה רכיבים, ולכל אחד מקום משלו במסך הניהול:
//
//   ReaderSystemSettings  - טאב "חומר קריאה": ההגדרה הכלל-מערכתית + מאגר החומר
//   ReaderPresetOpenMode  - בעורך העמדה: עקיפת ההגדרה לעמדה בודדת
//   ReaderLinkFile        - בשורת קישור: העלאת הקובץ עצמו ושיוכו לקישור
//
// ההגדרה הכלל-מערכתית פתוחה למנהל בלבד (השרת אוכף - ראה auth.js), ולכן
// הרכיב מציג אותה לקריאה בלבד לראש צוות במקום להסתיר אותה: ראש צוות צריך
// לדעת למה מצגת שהעלה נפתחת בחוץ.
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '../../config';
import { tr } from '../../i18n/tr';
import { docIcon, shapeReaderDoc, type ReaderConfig, type ReaderDoc } from '../../utils/reader';

const MAX_MB = 32;

const readFileAsBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result || '').replace(/^data:[^,]*,/, ''));
  fr.onerror = () => reject(new Error('read'));
  fr.readAsDataURL(file);
});

// ── ההגדרה הכלל-מערכתית + מאגר חומר הקריאה ─────────────────────────────────

export function ReaderSystemSettings({ isAdmin }: { isAdmin: boolean }) {
  const [config, setConfig] = useState<ReaderConfig>({ openMode: 'external', officeMode: 'pdf', convertAvailable: null });
  const [docs, setDocs] = useState<ReaderDoc[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      // probe=1: מסך הניהול הוא המקום שבו צריך לדעת אם ההמרה בכלל אפשרית כאן
      const r = await fetch(`${API_URL}/reader/config?probe=1`);
      if (r.ok) setConfig(await r.json());
    } catch { /* מנותק */ }
  }, []);

  const loadDocs = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/reader/docs`);
      if (r.ok) setDocs((await r.json()).map(shapeReaderDoc));
    } catch { /* מנותק */ }
  }, []);

  useEffect(() => { loadConfig(); loadDocs(); }, [loadConfig, loadDocs]);

  const save = async (patch: Partial<ReaderConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    try {
      await fetch(`${API_URL}/reader/config`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openMode: next.openMode, officeMode: next.officeMode }),
      });
      loadConfig();
    } catch { /* מנותק */ }
  };

  const upload = async (file: File) => {
    setError('');
    if (file.size > MAX_MB * 1024 * 1024) { setError(tr('reader.fileTooLarge', { mb: MAX_MB })); return; }
    setBusy(file.name);
    try {
      const dataBase64 = await readFileAsBase64(file);
      const r = await fetch(`${API_URL}/reader/docs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, fileName: file.name, mime: file.type, dataBase64 }),
      });
      if (!r.ok) setError(tr('reader.uploadFailed'));
      await loadDocs();
    } catch { setError(tr('reader.uploadFailed')); }
    setBusy('');
  };

  const attachPdf = async (doc: ReaderDoc, file: File) => {
    setBusy(doc.name);
    try {
      const dataBase64 = await readFileAsBase64(file);
      await fetch(`${API_URL}/reader/docs/${doc.id}/pdf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataBase64 }),
      });
      await loadDocs();
    } catch { setError(tr('reader.uploadFailed')); }
    setBusy('');
  };

  const remove = async (doc: ReaderDoc) => {
    if (!window.confirm(`${tr('shared.delete2')} "${doc.name}"?`)) return;
    try { await fetch(`${API_URL}/reader/docs/${doc.id}`, { method: 'DELETE' }); } catch { /* מנותק */ }
    loadDocs();
  };

  const convert = async (doc: ReaderDoc) => {
    setBusy(doc.name);
    try { await fetch(`${API_URL}/reader/docs/${doc.id}/convert`, { method: 'POST' }); } catch { /* מנותק */ }
    await loadDocs();
    setBusy('');
  };

  const label = { display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '3px' } as const;
  const select = {
    width: '100%', padding: '6px 8px', background: '#0f172a', color: 'white',
    border: '1px solid #334155', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' as const,
  };
  const card = { background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '12px', marginBottom: '14px', direction: 'rtl' as const };

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={card}>
        <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#e2e8f0', marginBottom: '10px' }}>⚙ {tr('reader.adminSection')}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={label}>{tr('reader.openModeLabel')}</label>
            <select value={config.openMode} disabled={!isAdmin} style={select}
              onChange={e => save({ openMode: e.target.value as ReaderConfig['openMode'] })}>
              <option value="external">{tr('reader.openModeExternal')}</option>
              <option value="window">{tr('reader.openModeWindow')}</option>
            </select>
          </div>
          <div>
            <label style={label}>{tr('reader.officeModeLabel')}</label>
            <select value={config.officeMode} disabled={!isAdmin} style={select}
              onChange={e => save({ officeMode: e.target.value as ReaderConfig['officeMode'] })}>
              <option value="pdf">{tr('reader.officeModePdf')}</option>
              <option value="server">{tr('reader.officeModeServer')}</option>
              <option value="external">{tr('reader.officeModeExternal')}</option>
            </select>
          </div>
        </div>

        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px', lineHeight: 1.6 }}>{tr('reader.officeModeNote')}</div>
        {config.officeMode === 'server' && config.convertAvailable === false && (
          <div style={{ fontSize: '11px', color: '#fca5a5', marginTop: '4px' }}>⚠ {tr('reader.convertUnavailable')}</div>
        )}
        {config.officeMode === 'server' && config.convertAvailable === true && (
          <div style={{ fontSize: '11px', color: '#86efac', marginTop: '4px' }}>✓ {tr('reader.convertAvailable')}</div>
        )}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#e2e8f0' }}>📚 {tr('reader.material')}</span>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy}
            style={{ background: '#5b21b6', color: 'white', border: 'none', borderRadius: '5px', padding: '5px 14px', fontSize: '12px', cursor: busy ? 'default' : 'pointer' }}>
            {busy ? tr('reader.uploading') : tr('reader.uploadFile')}
          </button>
          <input ref={fileRef} type="file" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
        </div>

        {error && <div style={{ color: '#fca5a5', fontSize: '11px', marginBottom: '6px' }}>{error}</div>}

        {docs.length === 0 && <div style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', padding: '8px 0' }}>—</div>}
        {docs.map(d => (
          <div key={d.id} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '7px 10px', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ flexShrink: 0 }}>{docIcon(d.kind)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
              <div style={{ fontSize: '10px', color: '#6366f1', direction: 'ltr', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.source_kind === 'file' ? `${d.file_name} · ${Math.round(d.byte_size / 1024)} KB` : d.url}
              </div>
              {d.convertError && <div style={{ fontSize: '10px', color: '#fca5a5' }}>{d.convertError}</div>}
            </div>
            {d.hasPdf && <span style={{ fontSize: '10px', color: '#86efac', flexShrink: 0 }}>{tr('reader.pdfAttached')}</span>}
            {d.kind === 'office' && !d.hasPdf && (
              <>
                <AttachPdfButton onPick={f => attachPdf(d, f)} />
                {config.officeMode === 'server' && (
                  <button type="button" onClick={() => convert(d)} disabled={busy === d.name}
                    style={{ background: 'transparent', color: '#a78bfa', border: '1px solid #4c1d95', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', flexShrink: 0 }}>
                    {busy === d.name ? tr('reader.converting') : tr('reader.convertNow')}
                  </button>
                )}
              </>
            )}
            <button type="button" onClick={() => remove(d)} title={tr('shared.delete2')} aria-label={tr('shared.delete2')}
              style={{ background: 'transparent', color: '#fca5a5', border: 'none', fontSize: '12px', cursor: 'pointer', flexShrink: 0 }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AttachPdfButton({ onPick }: { onPick: (f: File) => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.click()}
        style={{ background: 'transparent', color: '#a78bfa', border: '1px solid #4c1d95', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', flexShrink: 0 }}>
        {tr('reader.attachPdf')}
      </button>
      <input ref={ref} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }} />
    </>
  );
}

// ── עקיפה פר-עמדה ──────────────────────────────────────────────────────────

export function ReaderPresetOpenMode({ presetId, value }: { presetId: number; value?: string | null }) {
  const [mode, setMode] = useState(value || '');
  useEffect(() => { setMode(value || ''); }, [value, presetId]);

  const save = async (next: string) => {
    setMode(next);
    try {
      await fetch(`${API_URL}/workstation-presets/${presetId}/reader-open-mode`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reader_open_mode: next }),
      });
    } catch { /* מנותק */ }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', direction: 'rtl' }}>
      <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>📖 {tr('reader.presetOverride')}</span>
      <select value={mode} onChange={e => save(e.target.value)}
        style={{ padding: '4px 7px', background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: '4px', fontSize: '12px' }}>
        <option value="">{tr('reader.inherit')}</option>
        <option value="window">{tr('reader.openModeWindow')}</option>
        <option value="external">{tr('reader.openModeExternal')}</option>
      </select>
    </div>
  );
}

// ── קובץ מצורף לשורת קישור ─────────────────────────────────────────────────

/**
 * מעלה קובץ כעזר קריאה ומשייך אותו לשורת קישור. מחזיר '' בהצלחה, או הודעת
 * שגיאה להצגה. משותף לכפתור שבשורת קישור קיימת ולבוחר הקבצים שבטופס "קישור
 * חדש" - אותה העלאה בדיוק, לא שתיים.
 */
export async function uploadFileToLink(linkId: number, name: string, file: File): Promise<string> {
  if (file.size > MAX_MB * 1024 * 1024) return tr('reader.fileTooLarge', { mb: MAX_MB });
  try {
    const dataBase64 = await readFileAsBase64(file);
    const r = await fetch(`${API_URL}/reader/docs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || file.name, fileName: file.name, mime: file.type, dataBase64 }),
    });
    if (!r.ok) return tr('reader.uploadFailed');
    const doc = await r.json();
    const a = await fetch(`${API_URL}/preset-links/${linkId}/doc`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ docId: doc.id }),
    });
    return a.ok ? '' : tr('reader.uploadFailed');
  } catch { return tr('reader.uploadFailed'); }
}

export function ReaderLinkFile({ link, onChanged }: { link: { id: number; doc_id?: number | null; name?: string }; onChanged: () => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const upload = async (file: File) => {
    setError('');
    setBusy(true);
    const err = await uploadFileToLink(link.id, link.name || '', file);
    if (err) setError(err); else onChanged();
    setBusy(false);
  };

  const detach = async () => {
    try {
      await fetch(`${API_URL}/preset-links/${link.id}/doc`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ docId: null }),
      });
      onChanged();
    } catch { /* מנותק */ }
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
      {error && <span style={{ fontSize: '10px', color: '#fca5a5' }}>{error}</span>}
      {link.doc_id ? (
        <button type="button" onClick={detach} title={tr('reader.removeFile')}
          style={{ background: 'transparent', color: '#86efac', border: '1px solid #14532d', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer' }}>
          📎 {tr('reader.attachedFile')} ✕
        </button>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} disabled={busy} title={tr('reader.uploadFile')}
          style={{ background: 'transparent', color: '#a78bfa', border: '1px solid #4c1d95', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: busy ? 'default' : 'pointer' }}>
          {busy ? tr('reader.uploading') : `📎 ${tr('reader.uploadFile')}`}
        </button>
      )}
      <input ref={ref} type="file" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
    </span>
  );
}
