// עורכי config לשירותי תמונה/טקסט-קבוע — משותפים בין ה-tab "דסקי משימה"
// (MissionDeskAdmin) לבין מצב ההגדרה בעמדה (MissionDeskView adminMode), כדי
// שאפשר יהיה להגדיר תמונה/טקסט בשני המקומות. קובץ נפרד — מונע import מעגלי.
import { useEffect, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import { isImageDataUrl, normalizeLabelRuns } from '../../utils/missionDesk';
import type { MDImageConfig, MDLabelConfig, MDLabelRun } from '../../types/missionDesk';

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

// ─────────────────────────────────────────────────────────────────────────────
// פאנלים ל-WYSIWYG במצב ההגדרה בעמדה — התוכן מוצג בדיוק כפי שהמפעיל יראה
// (ממלא את האזור, אותו fit/פונט/גודל), עם סרגל עריכה צף מעל.
// ─────────────────────────────────────────────────────────────────────────────
const barBtn: React.CSSProperties = { background: '#1e293b', border: '1px solid #475569', borderRadius: 6, color: '#e2e8f0', cursor: 'pointer', fontSize: 12, padding: '4px 8px' };
const barSel: React.CSSProperties = { background: '#1e293b', border: '1px solid #475569', borderRadius: 6, color: '#e2e8f0', fontSize: 12, padding: '4px 6px' };

export function ImageSetupPanel({ config, onChange }: { config: MDImageConfig; onChange: (c: MDImageConfig) => void }) {
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
    <div
      tabIndex={0}
      onPaste={e => {
        const item = [...e.clipboardData.items].find(i => i.type.startsWith('image/'));
        if (item) { e.preventDefault(); readFile(item.getAsFile()); }
      }}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); readFile(e.dataTransfer.files?.[0]); }}
      style={{ position: 'relative', width: '100%', height: '100%', outline: 'none', overflow: 'hidden' }}
    >
      {/* סרגל עריכה צף */}
      <div style={{ position: 'absolute', insetInlineStart: 8, top: 8, zIndex: 5, display: 'flex', gap: 6, alignItems: 'center', background: 'rgba(15,23,42,0.85)', borderRadius: 8, padding: '4px 6px', flexWrap: 'wrap' }}>
        <label style={{ ...barBtn }}>📁 {tr('missiondesk.imageChooseFile')}
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => readFile(e.target.files?.[0])} />
        </label>
        {config.dataUrl && (
          <>
            <select value={config.fit || 'contain'} onChange={e => onChange({ ...config, fit: e.target.value as 'contain' | 'cover' })} style={barSel}>
              <option value="contain">{tr('missiondesk.imageFitContain')}</option>
              <option value="cover">{tr('missiondesk.imageFitCover')}</option>
            </select>
            <button onClick={() => onChange({ ...config, dataUrl: undefined })} style={{ ...barBtn, color: '#f87171' }}>🗑</button>
          </>
        )}
      </div>
      {config.dataUrl ? (
        // בדיוק כמו בעמדה
        <img src={config.dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: config.fit || 'contain', display: 'block' }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 14, textAlign: 'center', padding: 16, border: '2px dashed #475569', borderRadius: 8, margin: 8, boxSizing: 'border-box' }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🖼</div>
          {tr('missiondesk.imagePasteHint')}
        </div>
      )}
      {err && <div style={{ position: 'absolute', insetInlineEnd: 8, bottom: 8, color: '#fca5a5', fontSize: 12, background: 'rgba(15,23,42,0.85)', borderRadius: 6, padding: '3px 8px' }}>{err}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// עורך rich-text לטקסט קבוע — כתיבה ישירות בלוח (contentEditable), עם עיצוב
// פר-בחירה: מסמנים חלק מהטקסט ומחילים גודל/פונט/צבע/מודגש רק עליו. נשמר כ-runs.
// התצוגה בעמדה (renderLabelRuns) בונה spans מה-runs — בלי innerHTML (ללא הזרקה).
// ─────────────────────────────────────────────────────────────────────────────
export function renderLabelRuns(cfg: MDLabelConfig): React.ReactNode {
  const runs: MDLabelRun[] = (cfg.runs && cfg.runs.length) ? cfg.runs
    : (cfg.text ? [{ text: cfg.text }] : []);
  return runs.map((r, i) => (
    <span key={i} style={{
      fontSize: r.fontSize || cfg.fontSize || 22,
      fontFamily: r.font || cfg.font || undefined,
      fontWeight: (r.bold ?? cfg.bold) ? 'bold' : 'normal',
      color: r.color || cfg.color || '#f1f5f9',
    }}>{r.text}</span>
  ));
}

// serialize של ה-contentEditable ל-runs, תוך מעקב אחר עיצוב הספאנים.
function serializeEditable(root: HTMLElement): MDLabelRun[] {
  const runs: MDLabelRun[] = [];
  const walk = (node: ChildNode, style: MDLabelRun) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) runs.push({ ...style, text: node.textContent });
      return;
    }
    if (node.nodeName === 'BR') { runs.push({ ...style, text: '\n' }); return; }
    const el = node as HTMLElement;
    if ((el.nodeName === 'DIV' || el.nodeName === 'P') && runs.length && runs[runs.length - 1].text !== '\n') {
      runs.push({ text: '\n' });
    }
    const s: MDLabelRun = { ...style };
    const st = el.style;
    if (st) {
      if (st.fontWeight === 'bold' || Number(st.fontWeight) >= 600) s.bold = true;
      else if (st.fontWeight === 'normal') s.bold = false;
      if (st.color) s.color = st.color;
      if (st.fontFamily) s.font = st.fontFamily.replace(/["']/g, '');
      if (st.fontSize) s.fontSize = parseInt(st.fontSize, 10) || style.fontSize;
    }
    node.childNodes.forEach(c => walk(c, s));
  };
  root.childNodes.forEach(c => walk(c, {} as MDLabelRun));
  return normalizeLabelRuns(runs);
}

// החלת עיצוב על הבחירה הנוכחית ע"י עטיפת הטווח ב-span מעוצב.
function applyToSelection(root: HTMLElement, patch: Partial<CSSStyleDeclaration>): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (range.collapsed || !root.contains(range.commonAncestorContainer)) return false;
  const span = document.createElement('span');
  Object.assign(span.style, patch);
  try {
    range.surroundContents(span);
  } catch {
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
  sel.removeAllRanges();
  const nr = document.createRange();
  nr.selectNodeContents(span);
  sel.addRange(nr);
  return true;
}

export function RichLabelEditor({ config, onChange, minHeight = 120 }: {
  config: MDLabelConfig; onChange: (c: MDLabelConfig) => void; minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // אתחול חד-פעמי של ה-DOM מה-runs (React לא שולט על contentEditable)
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const runs: MDLabelRun[] = (config.runs && config.runs.length) ? config.runs : (config.text ? [{ text: config.text }] : []);
    el.innerHTML = '';
    for (const r of runs) {
      const parts = r.text.split('\n');
      parts.forEach((part, i) => {
        if (i > 0) el.appendChild(document.createElement('br'));
        if (part === '') return;
        const span = document.createElement('span');
        if (r.fontSize) span.style.fontSize = r.fontSize + 'px';
        if (r.font) span.style.fontFamily = r.font;
        if (r.bold !== undefined) span.style.fontWeight = r.bold ? 'bold' : 'normal';
        if (r.color) span.style.color = r.color;
        span.textContent = part;
        el.appendChild(span);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flush = () => { if (ref.current) onChange({ ...config, runs: serializeEditable(ref.current), text: undefined }); };
  const apply = (patch: Partial<CSSStyleDeclaration>) => {
    if (ref.current) { ref.current.focus(); if (applyToSelection(ref.current, patch)) flush(); }
  };

  const [size, setSize] = useState(config.fontSize || 22);
  const [font, setFont] = useState('');
  const [color, setColor] = useState('#f1f5f9');

  const justify = config.align === 'start' ? 'flex-start' : config.align === 'end' ? 'flex-end' : 'center';
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* סרגל עיצוב — חל על מה שמסומן בלוח */}
      <div style={{ position: 'absolute', insetInlineStart: 8, top: 8, zIndex: 5, display: 'flex', gap: 6, alignItems: 'center', background: 'rgba(15,23,42,0.92)', borderRadius: 8, padding: '5px 7px', flexWrap: 'wrap', maxWidth: 'calc(100% - 16px)' }}>
        <span style={{ fontSize: 10, color: '#64748b' }}>{tr('missiondesk.labelSelectHint')}</span>
        <input type="number" min={10} max={120} value={size} onChange={e => setSize(Number(e.target.value) || 22)}
          style={{ ...barSel, width: 52 }} title={tr('missiondesk.fontSize')} />
        <button onMouseDown={e => e.preventDefault()} onClick={() => apply({ fontSize: size + 'px' })} style={barBtn} title={tr('missiondesk.applySize')}>A↕</button>
        <select value={font} onChange={e => { setFont(e.target.value); apply({ fontFamily: e.target.value || 'inherit' }); }} style={barSel} title={tr('missiondesk.font')}>
          {['', 'monospace', 'serif'].map(f => <option key={f} value={f}>{f === '' ? tr('missiondesk.fontDefault') : f}</option>)}
        </select>
        <button onMouseDown={e => e.preventDefault()} onClick={() => apply({ fontWeight: 'bold' })} style={{ ...barBtn, fontWeight: 'bold' }} title={tr('missiondesk.boldFont')}>B</button>
        <button onMouseDown={e => e.preventDefault()} onClick={() => apply({ fontWeight: 'normal' })} style={barBtn} title={tr('missiondesk.unbold')}>b</button>
        <input type="color" value={color} onChange={e => { setColor(e.target.value); apply({ color: e.target.value }); }} style={{ width: 28, height: 24, border: 'none', background: 'none', cursor: 'pointer' }} title={tr('missiondesk.labelColor')} />
        <select value={config.align || 'center'} onChange={e => onChange({ ...config, align: e.target.value as 'start' | 'center' | 'end' })} style={barSel} title={tr('missiondesk.labelAlign')}>
          <option value="start">{tr('missiondesk.alignStart')}</option>
          <option value="center">{tr('missiondesk.alignCenter')}</option>
          <option value="end">{tr('missiondesk.alignEnd')}</option>
        </select>
      </div>
      {/* הלוח — כותבים כאן ישירות */}
      <div style={{ display: 'flex', alignItems: 'center', height: '100%', padding: '46px 12px 12px', justifyContent: justify }}>
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          dir="auto"
          onInput={flush}
          style={{ minHeight, minWidth: 60, outline: 'none', fontSize: config.fontSize || 22, fontFamily: config.font || undefined, fontWeight: config.bold ? 'bold' : 'normal', color: config.color || '#f1f5f9', textAlign: config.align || 'center', whiteSpace: 'pre-wrap', width: '100%' }}
        />
      </div>
    </div>
  );
}
