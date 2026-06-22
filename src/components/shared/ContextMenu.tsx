import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ContextMenuProps {
  x: number;
  y: number;
  neighbors: { id: number; label_he?: string; name?: string }[];
  onSelect: (sectorId: number) => void;
  onClose: () => void;
  extraActions?: { label: string; onClick: () => void }[];
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, neighbors, onSelect, onClose, extraActions = [] }) => {
  useEffect(() => {
    const handleClick = () => onClose();
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [onClose]);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y > window.innerHeight - 300 ? 'auto' : y,
        bottom: y > window.innerHeight - 300 ? (window.innerHeight - y) : 'auto',
        background: 'white',
        border: '1px solid #cbd5e1',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 10000,
        minWidth: '150px',
        direction: 'rtl',
        overflow: 'hidden',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ padding: '8px 12px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>
        העבר לנקודת העברה:
      </div>
      {neighbors.length === 0 ? (
        <div style={{ padding: '10px 12px', fontSize: '12px', color: '#94a3b8' }}>אין נקודות העברה נוספות</div>
      ) : (
        neighbors.map(n => (
          <button
            key={n.id}
            onClick={() => onSelect(n.id)}
            style={{ width: '100%', padding: '10px 12px', border: 'none', background: 'white', cursor: 'pointer', textAlign: 'right', fontSize: '13px', borderBottom: '1px solid #f1f5f9' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#dbeafe'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; }}
          >
            {n.label_he || n.name}
          </button>
        ))
      )}
      {extraActions.length > 0 && (
        <>
          <div style={{ padding: '6px 12px', background: '#f1f5f9', borderTop: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>
            ספרורים:
          </div>
          {extraActions.map((action, i) => (
            <button
              key={i}
              onClick={() => { action.onClick(); onClose(); }}
              style={{ width: '100%', padding: '9px 12px', border: 'none', background: 'white', cursor: 'pointer', textAlign: 'right', fontSize: '12px', borderBottom: '1px solid #f1f5f9', color: '#dc2626' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; }}
            >
              {action.label}
            </button>
          ))}
        </>
      )}
    </div>,
    document.body
  );
};

export default ContextMenu;
