import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { API_URL } from '../../config';
import { TitleSaveButton, type TitleSaveProps } from './FormTitleActions';

/**
 * מודל הגדרות (ניהול). הכותרת **מחוץ** לאזור הגלילה, ולכן נשארת גלויה כשגוללים
 * טופס ארוך. `save` מציב בה את כפתור השמירה של הטופס (ראה FormTitleActions) -
 * אותו handler, נעילה ותווית כמו הכפתור שבתחתית, שנשאר במקומו.
 *
 * ⚠️ אזור הגלילה הוא גוף המודל (`data-testid="settings-modal-body"`), בלי ריפוד
 * עליון: אלמנט דביק בתוכו (כמו הסרגל העליון של טופס העמדה) נצמד ב-`top: 0`.
 */
export const SettingsModal = ({ title, onClose, children, wide = false, save }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; save?: TitleSaveProps }) => (
  <div
    style={{ position: 'fixed', inset: 0, background: 'rgba(2,8,23,0.82)', backdropFilter: 'blur(3px)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', direction: 'rtl' }}
    onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
  >
    <div style={{ background: '#0f172a', border: '1.5px solid #4f46e5', borderRadius: '14px', maxWidth: wide ? '820px' : '660px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', direction: 'rtl', boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(79,70,229,0.2)', position: 'relative' }}>
      <div data-testid="settings-modal-header" style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 28px', padding: '24px 0 16px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: '16px', fontWeight: 'bold', flex: 1, minWidth: 0 }}>{title}</h3>
        {save && <TitleSaveButton {...save} />}
        <button onClick={onClose} style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', cursor: 'pointer', fontSize: '16px', width: '32px', height: '32px', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
      </div>
      <div data-testid="settings-modal-body" style={{ overflowY: 'auto', padding: '0 28px 28px', minHeight: 0 }}>
        <div style={{ height: '20px' }} />
        {children}
      </div>
    </div>
  </div>
);
// Renders children inline when not editing; wraps them in SettingsModal when editing
export const MaybeSettingsModal = ({ show, title, onClose, wide, save, children }: { show: boolean; title: string; onClose: () => void; wide?: boolean; save?: TitleSaveProps; children: React.ReactNode }) => {
  if (!show) return <>{children}</>;
  return <SettingsModal title={title} onClose={onClose} wide={wide} save={save}>{children}</SettingsModal>;
};

// --- תא מרחב בלוקים בטבלה (local state למניעת איפוס על polling) ---
// `onSelect` - השמירה אצל המסך שמשתמש בתא (דסק: מרחב פר עמדה, src/utils/deskSpace); בלעדיו - PUT לפ"מ
export const BlockSpaceCellTable = ({ strip, blockSpaces, lightMode, onSaved, onSelect }: { strip: any; blockSpaces: any[]; lightMode: boolean; onSaved?: (blockSpaceId: number | null) => void; onSelect?: (blockSpaceId: number | null) => void }) => {
  const { t } = useTranslation();
  const savingRef = React.useRef(false);
  const [localValue, setLocalValue] = React.useState(strip.block_space_id ? String(strip.block_space_id) : '');

  React.useEffect(() => {
    if (!savingRef.current) {
      setLocalValue(strip.block_space_id ? String(strip.block_space_id) : '');
    }
  }, [strip.block_space_id]);

  return (
    <select
      value={localValue}
      onChange={async e => {
        const val = e.target.value;
        setLocalValue(val);
        if (onSelect) { onSelect(val ? Number(val) : null); return; }
        savingRef.current = true;
        await fetch(`${API_URL}/strips/${strip.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ block_space_id: val || null })
        });
        // הבעלים מעדכן מיד (קונפליקטים לפי מרחב) - בלי לחכות לסקר הבא
        onSaved?.(val ? Number(val) : null);
        setTimeout(() => { savingRef.current = false; }, 6000);
      }}
      style={{ background: lightMode ? '#f1f5f9' : '#0f172a', color: lightMode ? '#1e293b' : '#e2e8f0', border: `1px solid ${lightMode ? '#cbd5e1' : '#334155'}`, borderRadius: '4px', padding: '3px 6px', fontSize: '12px', direction: 'rtl', width: '100%' }}
    >
      <option value="">{t('common.none')}</option>
      {blockSpaces.map((bs: any) => <option key={bs.id} value={String(bs.id)}>{bs.name}</option>)}
    </select>
  );
};

// --- Partial Transfer Modal ---
