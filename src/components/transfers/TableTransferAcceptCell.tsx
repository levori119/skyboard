import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import i18n from '../../i18n';
import { tr } from '../../i18n/tr';
import { useEtaCountdown } from '../../hooks/useEtaCountdown';
import { transferMenuPlacement, type TransferCellState } from '../../utils/tableTransferCell';
import { frameColor } from '../../utils/windowFrame';

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', lineHeight: 1.2 }}>
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
    // קבל והשעון זה מעל זה - כך העמודה נשארת צרה
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', gap: '3px', whiteSpace: 'nowrap' }}>
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
          padding: '4px 10px', fontSize: '12px', fontWeight: 'bold', cursor: busy ? 'wait' : 'pointer',
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
  // פתוחה = המיקום שחושב ברגע הפתיחה (ביחידות מוגדלות, אחרי חלוקה ב---s)
  const [menu, setMenu] = useState<null | {
    side: 'below' | 'above'; top?: number; bottom?: number; maxHeight: number;
    left?: number; right?: number; scale: number;
  }>(null);
  const open = menu !== null;
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const light = themeMode === 'light';

  // הרשימה יושבת ב-portal ולא בתוך התא: בתוך התא השורות שמתחת והעמודות
  // המקובעות (sticky) ציירו מעליה, והטבלה (overflow) חתכה אותה בתחתית.
  const openMenu = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;
    const r = btn.getBoundingClientRect();
    const viewW = window.innerWidth / s;
    const viewH = window.innerHeight / s;
    // כותרת + שורה לכל נקודה (או שורת "אין נקודות")
    const needed = 34 + Math.max(1, transferPoints.length) * 36;
    const place = transferMenuPlacement({ top: r.top / s, bottom: r.bottom / s }, viewH, needed);
    // מיושרת לקצה ה"התחלה" של הכפתור - ימין בעברית, שמאל באנגלית
    const rtl = i18n.dir() === 'rtl';
    setMenu({
      ...place,
      ...(rtl ? { right: Math.max(8, viewW - r.right / s) } : { left: Math.max(8, r.left / s) }),
      scale: s,
    });
  };

  // סגירה: לחיצה מחוץ לכפתור ולרשימה (pointerdown - גם באצבע ובעט), Esc,
  // וגלילה/שינוי גודל - הרשימה ממוקמת fixed ולא הייתה זזה עם השורה.
  useEffect(() => {
    if (!open) return;
    const close = () => setMenu(null);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    const onScroll = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const menuBg = light ? '#ffffff' : themeMode === 'ocean' ? '#0c2a40' : '#0f172a';
  const itemColor = light ? '#1e293b' : '#e2e8f0';
  const itemHover = light ? '#dbeafe' : '#1e3a5f';
  const dir = i18n.dir();

  return (
    <>
      <button
        ref={btnRef}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); if (open) setMenu(null); else openMenu(); }}
        style={{
          background: open ? (light ? '#dbeafe' : '#1e3a5f') : (light ? '#eff6ff' : '#172554'),
          color: light ? '#1d4ed8' : '#93c5fd', border: `1px solid ${light ? '#93c5fd' : '#2563eb'}`,
          borderRadius: '5px', padding: '3px 7px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
          touchAction: 'manipulation', display: 'inline-flex', alignItems: 'center', gap: '4px',
        }}
      >
        {/* הטקסט נשבר לשתי שורות ("העבר" / "לעמדה") כדי שהעמודה תהיה צרה */}
        <span style={{ whiteSpace: 'normal', maxWidth: '4.2em', lineHeight: 1.15, textAlign: 'center' }}>
          {tr('transfers.tableTransferToStation')}
        </span>
        <span style={{ fontSize: '10px' }}>{menu?.side === 'above' ? '▴' : '▾'}</span>
      </button>
      {menu && createPortal(
        <div
          ref={menuRef}
          dir={dir}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', zIndex: 100050,
            // מחוץ ל-#root אין את הזום הגלובלי - מחזירים אותו ידנית (ראה /ui-adapt)
            zoom: 'var(--s)' as any,
            top: menu.top, bottom: menu.bottom, left: menu.left, right: menu.right,
            maxHeight: menu.maxHeight, overflowY: 'auto', minWidth: '210px',
            background: menuBg,
            // מסגרת מודגשת: הרשימה צפה מעל הטבלה וחייבת להיבדל ממנה במבט אחד
            border: `3px solid ${frameColor('view', themeMode)}`, borderRadius: '8px',
            boxShadow: light ? '0 10px 28px rgba(15,23,42,0.35)' : '0 10px 32px rgba(0,0,0,0.75)',
            padding: '4px',
          }}
        >
          <div style={{ padding: '6px 10px 6px', fontSize: '11px', fontWeight: 'bold', color: frameColor('view', themeMode), borderBlockEnd: `1px solid ${light ? '#cbd5e1' : '#334155'}`, marginBlockEnd: '3px' }}>
            {tr('transfers.tablePickTransferPoint')}
          </div>
          {transferPoints.length === 0 && (
            <div style={{ padding: '8px', fontSize: '12px', color: light ? '#64748b' : '#94a3b8', fontStyle: 'italic' }}>
              {tr('transfers.tableNoTransferPoints')}
            </div>
          )}
          {transferPoints.map(p => (
            <button
              key={p.id}
              onClick={() => { setMenu(null); onPickPoint(Number(p.id)); }}
              onMouseEnter={e => { e.currentTarget.style.background = itemHover; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              style={{
                display: 'block', width: '100%', textAlign: 'start', background: 'transparent', color: itemColor,
                border: 'none', padding: '9px 12px', cursor: 'pointer', fontSize: '13px', borderRadius: '4px',
                touchAction: 'manipulation',
              }}
            >↔ {p.name}</button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

export default TableTransferAcceptCell;
