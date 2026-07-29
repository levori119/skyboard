// עורכי config לשירותי תמונה/טקסט-קבוע — משותפים בין ה-tab "דסקי משימה"
// (MissionDeskAdmin) לבין מצב ההגדרה בעמדה (MissionDeskView adminMode), כדי
// שאפשר יהיה להגדיר תמונה/טקסט בשני המקומות. קובץ נפרד — מונע import מעגלי.
import { useState } from 'react';
import { tr } from '../../i18n/tr';
import { isImageDataUrl } from '../../utils/missionDesk';
import type { MDImageConfig, MDLabelConfig } from '../../types/missionDesk';

const S = {
  input: { background: '#1e293b', border: '1px solid #475569', borderRadius: 6, color: '#f1f5f9', padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' } as React.CSSProperties,
  ghost: { padding: '6px 12px', background: 'none', border: '1px dashed #475569', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 12 } as React.CSSProperties,
  label: { display: 'block', margin: '10px 0 4px', color: '#94a3b8', fontSize: 12, fontWeight: 'bold' } as React.CSSProperties,
};

const FONTS = ['', 'monospace', 'serif'];

// תמונה גדולה מוקטנת אוטומטית לרוחב ~1600px (מונע data URL ענק ב-config).
export const downscaleImage = (dataUrl: string, maxW = 1600): Promise<string> => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    if (img.width <= maxW) return resolve(dataUrl);
    const scale = maxW / img.width;
    const canvas = document.createElement('canvas');
    canvas.width = maxW; canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return resolve(dataUrl);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    resolve(canvas.toDataURL('image/png'));
  };
  img.onerror = () => resolve(dataUrl);
  img.src = dataUrl;
});

// עורך שירות תמונה — הדבקת print-screen (paste) / גרירה / בחירת קובץ. raster בלבד.
export function ImageConfigEditor({ config, onChange }: { config: MDImageConfig; onChange: (c: MDImageConfig) => void }) {
  const [err, setErr] = useState('');
  const accept = async (dataUrl: string) => {
    if (!isImageDataUrl(dataUrl)) { setErr(tr('missiondesk.imageBadFormat')); return; }
    setErr('');
    onChange({ ...config, dataUrl: await downscaleImage(dataUrl) });
  };
  const readFile = (file: File | null | undefined) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => accept(String(r.result));
    r.readAsDataURL(file);
  };
  return (
    <div>
      <div
        tabIndex={0}
        onPaste={e => {
          const item = [...e.clipboardData.items].find(i => i.type.startsWith('image/'));
          if (item) { e.preventDefault(); readFile(item.getAsFile()); }
        }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); readFile(e.dataTransfer.files?.[0]); }}
        style={{ border: '2px dashed #475569', borderRadius: 8, padding: 14, textAlign: 'center', color: '#94a3b8', fontSize: 13, background: '#0b1120', cursor: 'text', outline: 'none' }}
      >
        📋 {tr('missiondesk.imagePasteHint')}
        <div style={{ marginTop: 8 }}>
          <label style={{ ...S.ghost, display: 'inline-block' }}>
            📁 {tr('missiondesk.imageChooseFile')}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => readFile(e.target.files?.[0])} />
          </label>
        </div>
      </div>
      {err && <div style={{ color: '#f87171', fontSize: 12, marginTop: 6 }}>{err}</div>}
      {config.dataUrl && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <label style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
              {tr('missiondesk.imageFit')}
              <select value={config.fit || 'contain'} onChange={e => onChange({ ...config, fit: e.target.value as 'contain' | 'cover' })} style={S.input}>
                <option value="contain">{tr('missiondesk.imageFitContain')}</option>
                <option value="cover">{tr('missiondesk.imageFitCover')}</option>
              </select>
            </label>
            <button onClick={() => onChange({ ...config, dataUrl: undefined })} style={{ ...S.ghost, color: '#f87171' }}>🗑 {tr('missiondesk.imageRemove')}</button>
          </div>
          <img src={config.dataUrl} alt="" style={{ maxWidth: '100%', maxHeight: 200, border: '1px solid #334155', borderRadius: 6, display: 'block' }} />
        </div>
      )}
    </div>
  );
}

// עורך שירות טקסט קבוע — טקסט + פונט/גודל/עיצוב, עם תצוגה מקדימה חיה.
export function LabelConfigEditor({ config, onChange }: { config: MDLabelConfig; onChange: (c: MDLabelConfig) => void }) {
  return (
    <div>
      <div style={S.label}>{tr('missiondesk.labelText')}</div>
      <textarea value={config.text || ''} onChange={e => onChange({ ...config, text: e.target.value })} rows={2}
        placeholder={tr('missiondesk.labelPlaceholder')}
        style={{ ...S.input, width: '100%', resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 5 }}>
          {tr('missiondesk.fontSize')}
          <input type="number" min={10} max={120} value={config.fontSize || 22} onChange={e => onChange({ ...config, fontSize: Number(e.target.value) || 22 })} style={{ ...S.input, width: 68 }} />
        </label>
        <label style={{ fontSize: 13, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 5 }}>
          {tr('missiondesk.font')}
          <select value={config.font || ''} onChange={e => onChange({ ...config, font: e.target.value })} style={S.input}>
            {FONTS.map(f => <option key={f} value={f}>{f === '' ? tr('missiondesk.fontDefault') : f}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 5 }}>
          <input type="checkbox" checked={!!config.bold} onChange={e => onChange({ ...config, bold: e.target.checked })} />
          {tr('missiondesk.boldFont')}
        </label>
        <label style={{ fontSize: 13, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 5 }}>
          {tr('missiondesk.labelAlign')}
          <select value={config.align || 'center'} onChange={e => onChange({ ...config, align: e.target.value as 'start' | 'center' | 'end' })} style={S.input}>
            <option value="start">{tr('missiondesk.alignStart')}</option>
            <option value="center">{tr('missiondesk.alignCenter')}</option>
            <option value="end">{tr('missiondesk.alignEnd')}</option>
          </select>
        </label>
        <label style={{ fontSize: 13, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 5 }}>
          {tr('missiondesk.labelColor')}
          <input type="color" value={config.color || '#f1f5f9'} onChange={e => onChange({ ...config, color: e.target.value })} style={{ width: 34, height: 28, border: 'none', background: 'none', cursor: 'pointer' }} />
        </label>
      </div>
      <div style={{ marginTop: 10, padding: 12, background: '#0b1120', border: '1px solid #334155', borderRadius: 8, minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: config.align === 'start' ? 'flex-start' : config.align === 'end' ? 'flex-end' : 'center' }}>
        <span style={{ fontSize: config.fontSize || 22, fontFamily: config.font || undefined, fontWeight: config.bold ? 'bold' : 'normal', color: config.color || '#f1f5f9' }}>
          {config.text || tr('missiondesk.labelPreview')}
        </span>
      </div>
    </div>
  );
}
