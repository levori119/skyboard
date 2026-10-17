// טבלת האייקונים של מוד הטבלה - יושבת בלשונית "מודי טבלה" בניהול.
// מובנים: צלליות המטוסים של המערכת (קריאה בלבד). מועלים: תמונה קטנה עם שם,
// שנבחרת אחר כך במיפוי ערך → אייקון של עמודה. ראה TABLE_MODE_DISPLAY_SPEC.md
import React, { useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import { customConfirm } from '../shared/ConfirmModal';
import { BUILTIN_DISPLAY_ICONS } from '../../utils/tableCellDisplay';
import { useDisplayIcons, saveDisplayIcon, deleteDisplayIcon } from '../../utils/displayIcons';
import DisplayIcon from '../shared/DisplayIcon';

/** תואם לתקרה בשרת (DISPLAY_ICON_MAX_CHARS) - נבדק כאן כדי לתת הודעה ברורה */
const MAX_DATA_URL_CHARS = 400 * 1024;

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result || ''));
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});

export default function DisplayIconsManager() {
  const icons = useDisplayIcons(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<number, string>>({});

  const onFiles = async (files: FileList | null) => {
    setError(null);
    for (const file of Array.from(files || [])) {
      if (!file.type.startsWith('image/')) { setError(tr('tableDisplay.iconNotImage')); continue; }
      const data = await readAsDataUrl(file);
      if (data.length > MAX_DATA_URL_CHARS) { setError(tr('tableDisplay.iconTooLarge')); continue; }
      const ok = await saveDisplayIcon({ name: file.name.replace(/\.[^.]+$/, '').slice(0, 100), image_data: data });
      if (!ok) setError(tr('tableDisplay.iconSaveFailed'));
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div style={{ background: '#0f172a', borderRadius: '8px', padding: '20px', marginBlockStart: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBlockEnd: '10px' }}>
        <h3 style={{ margin: 0, fontSize: '15px', color: '#94a3b8' }}>{tr('tableDisplay.iconTableTitle')}</h3>
        <button onClick={() => fileRef.current?.click()} style={{ padding: '6px 16px', background: '#0e7490', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px' }}>
          + {tr('tableDisplay.uploadIcon')}
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp,image/gif" multiple style={{ display: 'none' }} onChange={e => onFiles(e.target.files)} />
      </div>
      <div style={{ fontSize: '12px', color: '#64748b', marginBlockEnd: '10px' }}>{tr('tableDisplay.iconTableHint')}</div>
      {error && <div style={{ color: '#fca5a5', fontSize: '12px', marginBlockEnd: '8px' }}>{error}</div>}

      <div style={{ fontSize: '12px', color: '#94a3b8', marginBlockEnd: '6px' }}>{tr('tableDisplay.builtinIcons')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBlockEnd: '14px' }}>
        {BUILTIN_DISPLAY_ICONS.map(b => (
          <div key={b.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', width: '64px', padding: '6px 2px', background: '#1e293b', borderRadius: '6px' }}>
            <DisplayIcon iconRef={`builtin:${b.id}`} icons={icons} color="#e2e8f0" size={30} title={b.label} />
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>{b.label}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: '12px', color: '#94a3b8', marginBlockEnd: '6px' }}>{tr('tableDisplay.uploadedIcons')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {icons.map(icon => (
          <div key={icon.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', width: '110px', padding: '8px 4px', background: '#1e293b', borderRadius: '6px' }}>
            <DisplayIcon iconRef={`img:${icon.id}`} icons={icons} color="#e2e8f0" size={36} />
            <input
              value={names[icon.id] ?? icon.name}
              onChange={e => setNames(n => ({ ...n, [icon.id]: e.target.value }))}
              onBlur={async () => {
                const name = (names[icon.id] ?? icon.name).trim();
                if (name && name !== icon.name) await saveDisplayIcon({ id: icon.id, name });
                setNames(n => { const c = { ...n }; delete c[icon.id]; return c; });
              }}
              style={{ width: '100%', background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '4px', padding: '2px 4px', fontSize: '11px', textAlign: 'center', boxSizing: 'border-box' }}
            />
            <button
              onClick={async () => { if (await customConfirm(tr('tableDisplay.deleteIconConfirm'))) await deleteDisplayIcon(icon.id); }}
              style={{ padding: '1px 8px', background: '#7f1d1d', color: '#fecaca', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}
            >{tr('shared.delete')}</button>
          </div>
        ))}
        {icons.length === 0 && <div style={{ fontSize: '12px', color: '#475569' }}>{tr('tableDisplay.noUploadedIcons')}</div>}
      </div>
    </div>
  );
}
