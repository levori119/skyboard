import React, { useState, useRef, useEffect } from 'react';
import { API_URL } from '../../config';

export const SettingsModal = ({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) => (
  <div
    style={{ position: 'fixed', inset: 0, background: 'rgba(2,8,23,0.82)', backdropFilter: 'blur(3px)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', direction: 'rtl' }}
    onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
  >
    <div style={{ background: '#0f172a', border: '1.5px solid #4f46e5', borderRadius: '14px', padding: '28px', maxWidth: wide ? '820px' : '660px', width: '100%', maxHeight: '90vh', overflowY: 'auto', direction: 'rtl', boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(79,70,229,0.2)', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #1e293b' }}>
        <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: '16px', fontWeight: 'bold' }}>{title}</h3>
        <button onClick={onClose} style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', cursor: 'pointer', fontSize: '16px', width: '32px', height: '32px', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);
// Renders children inline when not editing; wraps them in SettingsModal when editing
export const MaybeSettingsModal = ({ show, title, onClose, wide, children }: { show: boolean; title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) => {
  if (!show) return <>{children}</>;
  return <SettingsModal title={title} onClose={onClose} wide={wide}>{children}</SettingsModal>;
};

// --- תא מרחב בלוקים בטבלה (local state למניעת איפוס על polling) ---
export const BlockSpaceCellTable = ({ strip, blockSpaces, lightMode }: { strip: any; blockSpaces: any[]; lightMode: boolean }) => {
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
        savingRef.current = true;
        await fetch(`${API_URL}/strips/${strip.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ block_space_id: val || null })
        });
        setTimeout(() => { savingRef.current = false; }, 6000);
      }}
      style={{ background: lightMode ? '#f1f5f9' : '#0f172a', color: lightMode ? '#1e293b' : '#e2e8f0', border: `1px solid ${lightMode ? '#cbd5e1' : '#334155'}`, borderRadius: '4px', padding: '3px 6px', fontSize: '12px', direction: 'rtl', width: '100%' }}
    >
      <option value="">ללא</option>
      {blockSpaces.map((bs: any) => <option key={bs.id} value={String(bs.id)}>{bs.name}</option>)}
    </select>
  );
};

// --- Partial Transfer Modal ---
