import React, { useState, useRef, useEffect } from 'react';
import { normalizeAlt, getTransferSq, getTransferLabel } from '../../utils/strips';
import { parseNoteValue, serializeNoteValue } from '../../utils/notes';
import HandwritingOverlay from '../shared/HandwritingOverlay';

export const TransferStripEditor = ({ transfer, onAltUpdate, onCancel }: { 
  transfer: any; 
  onAltUpdate: (stripId: string, alt: string) => void;
  onCancel: (transferId: string) => void;
}) => {
  const [edit, setEdit] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const altRef = useRef<HTMLSpanElement>(null);

  const handleEditClick = () => {
    if (altRef.current) {
      setAnchorRect(altRef.current.getBoundingClientRect());
    }
    setEdit(true);
  };

  return (
    <div style={{ 
      padding: '8px', 
      background: '#fef3c7', 
      border: '2px dashed #f59e0b', 
      borderRadius: '6px', 
      marginBottom: '6px',
      direction: 'rtl'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontWeight: 'bold', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {getTransferLabel(transfer)}
          </div>
          {getTransferSq(transfer) && <div style={{ fontSize: '9px', color: '#92400e', marginTop: '1px', opacity: 0.8 }}>{getTransferSq(transfer)}</div>}
        </div>
        <span
          ref={altRef}
          onClick={handleEditClick}
          title="לחץ לעדכון גובה"
          style={{ fontSize: '16px', fontWeight: 'bold', color: '#92400e', background: '#fde68a', padding: '2px 7px', borderRadius: '5px', border: '1px solid #f59e0b', cursor: 'pointer', flexShrink: 0, letterSpacing: '0.5px' }}
        >
          {transfer.alt ? normalizeAlt(transfer.alt) : '—'}
        </span>
      </div>
      <div style={{ fontSize: '10px', color: '#92400e', marginTop: '3px', opacity: 0.75 }}>ממתין לאישור...</div>
      <button 
        onClick={() => onCancel(transfer.id)} 
        style={{ 
          marginTop: '6px', 
          width: '100%', 
          padding: '4px', 
          background: '#dc2626', 
          color: 'white', 
          border: 'none', 
          borderRadius: '4px', 
          fontSize: '10px', 
          cursor: 'pointer' 
        }}
      >
        בטל העברה
      </button>
      {edit && (
        <HandwritingOverlay 
          onCancel={() => setEdit(false)} 
          onComplete={(val: string) => { 
            onAltUpdate(transfer.strip_id, val); 
            setEdit(false); 
          }} 
          anchorRect={anchorRect}
        />
      )}
    </div>
  );
};

// parseNoteValue, serializeNoteValue imported from ./utils/notes

// --- כרטיס מוסר בסקטור ---
export const OutgoingTransferCard = ({ t, isConflict, isAltViolation = false, onCancel, onUpdateStripField, lightMode = false, presetId, onUpdateNote }: {
  t: any;
  isConflict: boolean;
  isAltViolation?: boolean;
  onCancel: (id: string) => void;
  onUpdateStripField?: (stripId: string, field: string, value: string) => void;
  lightMode?: boolean;
  presetId?: number | string | null;
  onUpdateNote?: (transferId: string, note: string) => void;
}) => {
  const altRef = useRef<HTMLSpanElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [showHw, setShowHw] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [editBuffer, setEditBuffer] = useState('');
  const sq = getTransferSq(t);

  const hasExternalNote = !!t.note && String(t.note_by_preset_id) !== String(presetId);
  const openNote = () => { setEditBuffer(t.note || ''); setNoteOpen(true); };
  return (
    <>
      <div style={{
        padding: '4px 5px', direction: 'rtl', margin: '2px 0', borderRadius: '6px',
        border: isConflict ? '1px solid #ef4444' : isAltViolation ? '1px solid #f97316' : (lightMode ? '1px solid #d97706' : '1px solid #78350f'),
        background: isConflict ? (lightMode ? '#fef2f2' : '#450a0a') : isAltViolation ? (lightMode ? '#fff7ed' : '#1c0800') : (lightMode ? '#fffbeb' : '#0d0800'),
      }}>
        {/* שורה 1: 💬 | callsign | sq */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginBottom: '2px' }}>
          {onUpdateNote && (
            <button onClick={e => { e.stopPropagation(); noteOpen ? setNoteOpen(false) : openNote(); }} title={noteOpen ? 'סגור הערה' : 'כתוב/ערוך הערה'}
              style={{ background: noteOpen ? '#1e3a5f' : 'transparent', border: `1px solid ${noteOpen ? '#3b82f6' : 'transparent'}`, borderRadius: '3px', cursor: 'pointer', fontSize: '10px', color: t.note ? '#60a5fa' : '#475569', padding: '1px 2px', lineHeight: 1, flexShrink: 0 }}>💬</button>
          )}
          {hasExternalNote && <span title="הערה מעמדה אחרת" style={{ fontSize: '10px', lineHeight: 1, flexShrink: 0 }}>📢</span>}
          <div style={{ flex: 1, fontWeight: 'bold', color: isConflict ? (lightMode ? '#b91c1c' : '#fca5a5') : (lightMode ? '#92400e' : '#fcd34d'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px', minWidth: 0 }}>
            {getTransferLabel(t)}
          </div>
          {sq && <span style={{ fontSize: '9px', color: isConflict ? (lightMode ? '#b91c1c' : '#fca5a5') : (lightMode ? '#a16207' : '#b45309'), flexShrink: 0, opacity: 0.9 }}>{sq}</span>}
        </div>
        {/* שורה 2: alt */}
        <div style={{ display: 'flex', gap: '3px', marginBottom: '2px', alignItems: 'center' }}>
          <span
            ref={altRef}
            title="לחץ לעדכון גובה"
            onClick={() => { if (altRef.current) setAnchorRect(altRef.current.getBoundingClientRect()); setShowHw(true); }}
            style={{ flex: 1, display: 'block', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: isConflict ? (lightMode ? '#b91c1c' : '#fca5a5') : isAltViolation ? (lightMode ? '#c2410c' : '#fb923c') : (lightMode ? '#92400e' : '#fcd34d'), background: isConflict ? (lightMode ? '#fee2e2' : '#7f1d1d') : isAltViolation ? (lightMode ? '#ffedd5' : '#431407') : (lightMode ? '#fef3c7' : '#1c0f00'), padding: '1px 4px', borderRadius: '4px', cursor: 'pointer', letterSpacing: '0.5px', border: `1px dashed ${isConflict ? '#ef4444' : isAltViolation ? '#f97316' : '#d97706'}` }}
          >
            {isConflict && <span style={{ marginInlineEnd: '3px' }}>⚠</span>}{isAltViolation && !isConflict && <span style={{ marginInlineEnd: '2px' }}>📐</span>}{t.alt ? normalizeAlt(t.alt) : '—'}
          </span>
        </div>
        {t.note && !noteOpen && (
          <div style={{ fontSize: '9px', color: hasExternalNote ? '#fca5a5' : '#93c5fd', background: hasExternalNote ? '#2d0505' : '#0c1e35', borderRadius: '3px', padding: '2px 5px', marginBottom: '3px', whiteSpace: 'pre-wrap', lineHeight: 1.4, border: `1px solid ${hasExternalNote ? '#7f1d1d' : '#1e3a5f'}`, direction: 'rtl' }}>
            {t.note}
          </div>
        )}
        {noteOpen && (
          <div style={{ marginBottom: '3px' }} onClick={e => e.stopPropagation()}>
            <textarea
              value={editBuffer}
              onChange={e => setEditBuffer(e.target.value)}
              rows={3}
              style={{ width: '100%', background: '#0c1e35', color: '#e2e8f0', border: '1px solid #3b82f6', borderRadius: '3px', fontSize: '10px', padding: '3px 4px', resize: 'none', direction: 'rtl', boxSizing: 'border-box', outline: 'none' }}
              placeholder="כתוב הערה..."
              autoFocus
            />
            <div style={{ display: 'flex', gap: '3px', marginTop: '2px' }}>
              <button onClick={e => { e.stopPropagation(); if (onUpdateNote) onUpdateNote(String(t.id), editBuffer); setNoteOpen(false); }}
                style={{ flex: 1, fontSize: '9px', padding: '2px', background: '#1e40af', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontWeight: 'bold' }}>שמור</button>
              <button onClick={e => { e.stopPropagation(); setNoteOpen(false); }}
                style={{ flex: 1, fontSize: '9px', padding: '2px', background: '#374151', color: '#94a3b8', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>ביטול</button>
            </div>
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onCancel(t.id); }}
          style={{ width: '100%', padding: '1px', background: isConflict ? (lightMode ? '#fee2e2' : '#7f1d1d') : (lightMode ? '#fde68a' : '#7f1d1d'), color: isConflict ? (lightMode ? '#b91c1c' : '#fca5a5') : (lightMode ? '#78350f' : '#fca5a5'), border: `1px solid ${isConflict ? '#dc2626' : (lightMode ? '#d97706' : '#dc2626')}`, borderRadius: '3px', fontSize: '9px', cursor: 'pointer' }}
        >✕ בטל</button>
      </div>
      {showHw && (
        <HandwritingOverlay
          onCancel={() => setShowHw(false)}
          onComplete={(val: string) => { const n = normalizeAlt(val); setShowHw(false); if (onUpdateStripField) onUpdateStripField(String(t.strip_id), 'alt', n); }}
          anchorRect={anchorRect}
        />
      )}
    </>
  );
};

// --- שורה קומפקטית לנקודת העברה: או"ק/טייסת | גובה (מודגש, לחיץ לעדכון). ימין=מוסר, שמאל=מקבל ---
export const CompactTransferRow = ({ t, dir, isConflict, isAltViolation = false, onUpdateStripField, onAction, lightMode = false, shrunk = false }: {
  t: any;
  dir: 'out' | 'in';
  isConflict: boolean;
  isAltViolation?: boolean;
  onUpdateStripField?: (stripId: string, field: string, value: string) => void;
  onAction: (id: string) => void;
  lightMode?: boolean;
  shrunk?: boolean;
}) => {
  const altRef = useRef<HTMLSpanElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [showHw, setShowHw] = useState(false);
  const sq = getTransferSq(t);
  const isOut = dir === 'out';
  // צבע ראשי: קונפליקט אדום · מוסר ענבר · מקבל ירוק
  const main = isConflict ? '#ef4444' : isOut ? '#f59e0b' : '#22c55e';
  const txt = isConflict ? (lightMode ? '#b91c1c' : '#fca5a5') : isOut ? (lightMode ? '#92400e' : '#fcd34d') : (lightMode ? '#15803d' : '#86efac');
  const bg = isConflict ? (lightMode ? '#fef2f2' : '#3f0a0a') : isOut ? (lightMode ? '#fffbeb' : '#140c00') : (lightMode ? '#f0fdf4' : '#031106');
  return (
    <>
      <div title={isOut ? 'מוסר — ✕ לביטול · לחץ גובה לעדכון' : 'מקבל — ✓ לקבלה · לחץ גובה לעדכון'}
        style={{ display: 'flex', alignItems: 'center', gap: '4px', direction: 'rtl', padding: shrunk ? '0px 4px' : '1px 6px', borderRadius: '5px', border: `1px solid ${main}${isAltViolation && !isConflict ? '66' : '99'}`, background: bg, opacity: isAltViolation && !isConflict ? 0.6 : 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span style={{ fontWeight: 'bold', color: txt, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: shrunk ? '9px' : '11px', minWidth: 0 }}>{getTransferLabel(t)}</span>
        {sq && <span style={{ fontSize: shrunk ? '8px' : '9px', opacity: 0.85, color: txt, flexShrink: 0 }}>{sq}</span>}
        <span style={{ opacity: 0.4, fontSize: '9px', flexShrink: 0 }}>/</span>
        <span ref={altRef} title="לחץ לעדכון גובה"
          onClick={() => { if (altRef.current) setAnchorRect(altRef.current.getBoundingClientRect()); setShowHw(true); }}
          style={{ fontWeight: 'bold', fontSize: shrunk ? '11px' : '13px', color: '#fff', background: main, padding: '0px 5px', borderRadius: '4px', cursor: 'pointer', letterSpacing: '0.5px', flexShrink: 0 }}>
          {isConflict && <span style={{ marginInlineEnd: '2px' }}>⚠</span>}{t.alt ? normalizeAlt(t.alt) : '—'}
        </span>
        <button onClick={e => { e.stopPropagation(); onAction(t.id); }} title={isOut ? 'בטל' : 'קבל'}
          style={{ marginInlineStart: 'auto', border: 'none', background: 'transparent', color: main, cursor: 'pointer', fontSize: shrunk ? '10px' : '12px', padding: '0 2px', flexShrink: 0, lineHeight: 1 }}>{isOut ? '✕' : '✓'}</button>
      </div>
      {showHw && (
        <HandwritingOverlay onCancel={() => setShowHw(false)} anchorRect={anchorRect}
          onComplete={(val: string) => { const n = normalizeAlt(val); setShowHw(false); if (onUpdateStripField) onUpdateStripField(String(t.strip_id), 'alt', n); }} />
      )}
    </>
  );
};

// --- כרטיס קבלה בנקודת העברה (עם ספירה לאחור) ---
export const IncomingTransferCard = ({ t, isConflict, onAccept, onReject, onUpdateStripField, onReply, onSendDirectReply }: {
  t: any;
  isConflict: boolean;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onUpdateStripField?: (stripId: string, field: string, value: string) => void;
  onReply?: () => void;
  onSendDirectReply?: (transfer: any, text: string) => void;
}) => {
  const [countdown, setCountdown] = useState<string | null>(null);
  const [countdownOver, setCountdownOver] = useState(false);
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyText, setReplyText] = useState('');
  const sq = getTransferSq(t);

  useEffect(() => {
    if (!t.eta_minutes || !t.eta_set_at) { setCountdown(null); return; }
    const update = () => {
      const end = new Date(t.eta_set_at).getTime() + Number(t.eta_minutes) * 60000;
      const rem = end - Date.now();
      if (rem <= 0) { setCountdown('00:00'); setCountdownOver(true); return; }
      setCountdownOver(false);
      const m = Math.floor(rem / 60000);
      const s = Math.floor((rem % 60000) / 1000);
      setCountdown(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [t.eta_minutes, t.eta_set_at]);

  const [editingAlt, setEditingAlt] = useState(false);
  const [altAnchor, setAltAnchor] = useState<DOMRect | null>(null);
  const altSpanRef = useRef<HTMLSpanElement>(null);

  return (
    <div className={isConflict ? 'alt-conflict-flash' : ''} style={{
      background: isConflict ? '#7f1d1d' : '#dcfce7',
      border: `1px solid ${isConflict ? '#ef4444' : '#22c55e'}`,
      borderRadius: '4px',
      padding: '5px',
      marginBottom: '4px',
      direction: 'rtl'
    }}>
      {/* שורה 1: callsign + גובה */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '4px', marginBottom: '3px' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontWeight: 'bold', color: isConflict ? '#fca5a5' : '#166534', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px' }}>
            {isConflict && '⚠ '}{getTransferLabel(t)}
          </div>
          {sq && <div style={{ fontSize: '9px', color: isConflict ? '#fca5a5' : '#15803d', marginTop: '1px', opacity: 0.85 }}>{sq}</div>}
        </div>
        <span
          ref={altSpanRef}
          title={onUpdateStripField ? 'לחץ לעדכון גובה' : undefined}
          onPointerDown={e => { if (onUpdateStripField && altSpanRef.current) { e.stopPropagation(); setAltAnchor(altSpanRef.current.getBoundingClientRect()); setEditingAlt(true); } }}
          style={{ fontSize: '14px', fontWeight: 'bold', color: isConflict ? '#fca5a5' : '#166534', background: isConflict ? '#450a0a' : '#bbf7d0', padding: '1px 6px', borderRadius: '4px', cursor: onUpdateStripField ? 'pointer' : 'default', flexShrink: 0, letterSpacing: '0.5px', border: onUpdateStripField ? `1px dashed ${isConflict ? '#ef4444' : '#22c55e'}` : 'none' }}
        >
          {t.alt ? normalizeAlt(t.alt) : '—'}
        </span>
      </div>
      {/* שורה 2: ספירה לאחור (אם קיימת) */}
      {countdown !== null && (
        <div style={{ textAlign: 'center', marginBottom: '3px' }}>
          <span title="זמן עד להגעה לנקודת העברה" style={{ fontSize: '12px', fontWeight: 'bold', color: countdownOver ? '#ef4444' : '#15803d', background: countdownOver ? '#450a0a' : '#bbf7d0', border: `1px solid ${countdownOver ? '#dc2626' : '#22c55e'}`, borderRadius: '4px', padding: '1px 8px', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.5px' }}>
            ⏱ {countdown}
          </span>
        </div>
      )}
      {/* כפתורי קבל/דחה */}
      <div style={{ display: 'flex', gap: '2px' }}>
        <button onClick={(e) => { e.stopPropagation(); onAccept(t.id); }}
          style={{ flex: 1, padding: '2px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '2px', fontSize: '8px', cursor: 'pointer' }}>קבל</button>
        <button onClick={(e) => { e.stopPropagation(); onReject(t.id); }}
          style={{ flex: 1, padding: '2px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '2px', fontSize: '8px', cursor: 'pointer' }}>דחה</button>
        {(onReply || onSendDirectReply) && (
          <button onClick={(e) => { e.stopPropagation(); setShowReplyBox(v => !v); setReplyText(''); }}
            title="כתוב הערה לשולח"
            style={{ padding: '2px 6px', background: showReplyBox ? '#4c1d95' : '#7c3aed', color: 'white', border: 'none', borderRadius: '2px', fontSize: '9px', cursor: 'pointer', flexShrink: 0 }}>💬 הגב</button>
        )}
      </div>
      {/* תיבת תגובה מהירה לשולח */}
      {showReplyBox && (
        <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px' }} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <textarea
            autoFocus
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="כתוב הודעה לשולח..."
            rows={2}
            style={{ width: '100%', resize: 'none', fontSize: '10px', padding: '3px 5px', borderRadius: '3px', border: '1px solid #7c3aed', background: '#1e1b4b', color: 'white', direction: 'rtl', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: '2px' }}>
            <button
              onClick={() => {
                if (!replyText.trim()) return;
                if (onSendDirectReply) onSendDirectReply(t, replyText.trim());
                else if (onReply) onReply();
                setShowReplyBox(false);
                setReplyText('');
              }}
              style={{ flex: 1, padding: '2px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '2px', fontSize: '9px', cursor: 'pointer', fontWeight: 'bold' }}
            >שלח ✉</button>
            <button
              onClick={() => { setShowReplyBox(false); setReplyText(''); }}
              style={{ padding: '2px 6px', background: '#374151', color: '#9ca3af', border: 'none', borderRadius: '2px', fontSize: '9px', cursor: 'pointer' }}
            >ביטול</button>
          </div>
        </div>
      )}
      {editingAlt && altAnchor && (
        <HandwritingOverlay
          onCancel={() => setEditingAlt(false)}
          onComplete={(val: string) => { const n = normalizeAlt(val); setEditingAlt(false); if (onUpdateStripField) onUpdateStripField(String(t.strip_id), 'alt', n); }}
          anchorRect={altAnchor}
        />
      )}
    </div>
  );
};

