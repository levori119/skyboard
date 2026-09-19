import React, { useEffect, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import { useEtaCountdown } from '../../hooks/useEtaCountdown';
import type { TransferCellState } from '../../utils/tableTransferCell';

type ThemeMode = 'light' | 'dark' | 'ocean';

interface TransferPoint { id: number; name: string }

/**
 * תא "העברה/קבלה" במוד הטבלה.
 *
 * - בנקודת העברה אליי → כפתור **קבל** ירוק + ⏱ זמן ההגעה (אותו חישוב של כרטיס
 *   ההעברה). הקבלה עוברת באותו handler של הקבלה מנקודת ההעברה - לכן גם
 *   ההבהוב והכנסת הפ"מ לטבלה זהים בשני המקומות.
 * - אצלי → **העבר לעמדה**: רשימת נקודות ההעברה של העמדה. הבחירה ממשיכה בדיוק
 *   כמו גרירת שורה לנקודת העברה - בורר עמדות כשיש כמה, ואז אישור עם זמן.
 * - בדרך ממני → סטטוס בלבד ("ממתין לקבלה" / "נדחה") עם שם הנקודה.
 */
export function TableTransferAcceptCell({
  state, transferPoints, onAccept, onPickPoint, themeMode,
}: {
  state: TransferCellState;
  transferPoints: TransferPoint[];
  onAccept: (transferId: string) => void;
  onPickPoint: (sectorId: number) => void;
  themeMode: ThemeMode;
}) {
  const light = themeMode === 'light';
  const muted = light ? '#64748b' : '#94a3b8';

  if (state.kind === 'transferred') {
    return <span style={{ color: muted, fontSize: '11px' }}>-</span>;
  }

  if (state.kind === 'accept') {
    return <AcceptButton transfer={state.transfer} onAccept={onAccept} />;
  }

  if (state.kind === 'pending' || state.kind === 'rejected') {
    const t = state.transfer;
    const pointName = transferPoints.find(p => Number(p.id) === Number(t.to_sector_id))?.name
      || t.to_sector_name || '';
    const rejected = state.kind === 'rejected';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', whiteSpace: 'nowrap' }}>
        <span style={{ fontWeight: 'bold', color: rejected ? '#ef4444' : (light ? '#b45309' : '#fbbf24') }}>
          {rejected ? tr('transfers.tableTransferRejected') : tr('transfers.tableAwaitingAccept')}
        </span>
        {pointName && <span style={{ color: muted }}>→ {pointName}</span>}
      </div>
    );
  }

  return <SendButton transferPoints={transferPoints} onPickPoint={onPickPoint} themeMode={themeMode} />;
}

function AcceptButton({ transfer, onAccept }: { transfer: any; onAccept: (id: string) => void }) {
  const eta = useEtaCountdown(transfer.eta_minutes, transfer.eta_set_at);
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
      <button
        title={tr('transfers.tableAcceptHint')}
        disabled={busy}
        // בלי stopPropagation הלחיצה הייתה נבלעת גם בבחירת השורה / תפריט ההקשר
        onPointerDown={e => e.stopPropagation()}
        onClick={e => {
          e.stopPropagation();
          if (busy) return;
          setBusy(true);
          Promise.resolve(onAccept(String(transfer.id))).finally(() => setBusy(false));
        }}
        style={{
          background: '#16a34a', color: '#ffffff', border: '1px solid #22c55e', borderRadius: '5px',
          padding: '4px 14px', fontSize: '12px', fontWeight: 'bold', cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1, touchAction: 'manipulation',
        }}
      >{tr('transfers.tableAccept')}</button>
      {eta && (
        <span
          title={tr('transfers.timeUntilArrivalAt')}
          style={{
            fontSize: '12px', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums',
            color: eta.over ? '#ef4444' : '#15803d', background: eta.over ? '#450a0a' : '#bbf7d0',
            border: `1px solid ${eta.over ? '#dc2626' : '#22c55e'}`, borderRadius: '4px', padding: '1px 6px',
          }}
        >⏱ {eta.text}</span>
      )}
    </div>
  );
}

function SendButton({ transferPoints, onPickPoint, themeMode }: {
  transferPoints: TransferPoint[];
  onPickPoint: (sectorId: number) => void;
  themeMode: ThemeMode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const light = themeMode === 'light';

  // סגירה בלחיצה מחוץ לרשימה - pointerdown כדי שיעבוד גם באצבע ובעט
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const menuBg = light ? '#ffffff' : themeMode === 'ocean' ? '#0c2a40' : '#0f172a';
  const menuBorder = light ? '#93c5fd' : '#3b82f6';
  const itemColor = light ? '#1e293b' : '#e2e8f0';
  const itemHover = light ? '#dbeafe' : '#1e3a5f';

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          background: open ? (light ? '#dbeafe' : '#1e3a5f') : (light ? '#eff6ff' : '#172554'),
          color: light ? '#1d4ed8' : '#93c5fd', border: `1px solid ${light ? '#93c5fd' : '#2563eb'}`,
          borderRadius: '5px', padding: '4px 10px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
          whiteSpace: 'nowrap', touchAction: 'manipulation',
        }}
      >{tr('transfers.tableTransferToStation')} ▾</button>
      {open && (
        <div
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', insetInlineStart: 0, marginBlockStart: '3px', zIndex: 9999,
            background: menuBg, border: `1px solid ${menuBorder}`, borderRadius: '6px', minWidth: '190px',
            maxHeight: '260px', overflowY: 'auto', boxShadow: '0 6px 20px rgba(0,0,0,0.45)', padding: '4px',
          }}
        >
          <div style={{ padding: '4px 8px 6px', fontSize: '10px', fontWeight: 'bold', color: light ? '#64748b' : '#94a3b8' }}>
            {tr('transfers.tablePickTransferPoint')}
          </div>
          {transferPoints.length === 0 && (
            <div style={{ padding: '8px', fontSize: '11px', color: light ? '#64748b' : '#94a3b8', fontStyle: 'italic' }}>
              {tr('transfers.tableNoTransferPoints')}
            </div>
          )}
          {transferPoints.map(p => (
            <button
              key={p.id}
              onClick={() => { setOpen(false); onPickPoint(Number(p.id)); }}
              onMouseEnter={e => { e.currentTarget.style.background = itemHover; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              style={{
                display: 'block', width: '100%', textAlign: 'start', background: 'transparent', color: itemColor,
                border: 'none', padding: '8px 10px', cursor: 'pointer', fontSize: '12px', borderRadius: '4px',
                touchAction: 'manipulation',
              }}
            >↔ {p.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default TableTransferAcceptCell;
