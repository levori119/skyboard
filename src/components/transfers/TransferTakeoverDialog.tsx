/**
 * **לקיחת פ"מ שכבר בנקודת העברה** - החלון בשתי העמדות, ו**"נמצא גם בעמדה"**.
 *
 * | מצב | למי | כפתורים |
 * |-----|-----|---------|
 * | `requester` פתוחה | העמדה הגוררת - טופס תיאום | בוצע תיאום ומאושר להעביר / לא אושר |
 * | `holder` פתוחה | העמדה שהפ"מ אצלה בדרך לנקודת העברה | אשר / אל תאשר |
 * | תוצאה | הצד שלא הכריע | אישור |
 *
 * ── למה אין ✕ ואין Esc בבקשה פתוחה ──────────────────────────────────────────
 * הבקשה מחזיקה פ"מ "באוויר" בין שתי עמדות. חלון שנסגר בלי הכרעה משאיר את
 * השנייה מחכה לתשובה שלא תגיע. לכן רק שני הכפתורים סוגרים אותו.
 *
 * השמות מגיעים מהשרת כצילום מצב של רגע הבקשה - זה מה שהפקח אישר.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../../i18n/tr';
import { windowFrame, type FrameTheme } from '../../utils/windowFrame';
import { seizurePalette } from '../seizure/seizureTheme';
import { takeoverRole, type TransferTakeoverRequest } from '../../utils/transferTakeover';

interface Props {
  request: TransferTakeoverRequest;
  presetId: number;
  themeMode: FrameTheme;
  /** כמה נוספות ממתינות אחרי זו. */
  queued?: number;
  /** ההכרעה נשלחת - הכפתורים נעולים כדי שלחיצה כפולה לא תשלח פעמיים. */
  busy?: boolean;
  onDecide: (decision: 'approve' | 'deny') => void;
  onAckOutcome: () => void;
}

/** נקודה ריקה = העברה ישירה לעמדה (בלי נקודת העברה). */
const pointOr = (p: string) => p || tr('transfers.takeoverDirect');

export function outcomeText(r: TransferTakeoverRequest, role: 'holder' | 'requester'): string {
  const vars = {
    cs: r.callsign, holder: r.holder_name, requester: r.requester_name,
    point: pointOr(r.new_point_label), dest: r.new_dest_name,
    myPoint: pointOr(r.existing_point_label),
  };
  if (r.status === 'stale') return tr('transfers.takeoverOutcomeStale', vars);
  if (r.status === 'expired') return tr('transfers.takeoverOutcomeExpired', vars);
  if (role === 'requester') {
    return r.status === 'approved'
      ? tr('transfers.takeoverOutcomeApprovedByHolder', vars)
      : tr('transfers.takeoverOutcomeDeniedByHolder', vars);
  }
  return r.status === 'approved'
    ? tr('transfers.takeoverOutcomeApprovedByRequester', vars)
    : tr('transfers.takeoverOutcomeDeniedByRequester', vars);
}

export function TransferTakeoverCard({ request: r, presetId, themeMode, queued = 0, busy = false, onDecide, onAckOutcome }: Props) {
  const P = seizurePalette(themeMode);
  const role = takeoverRole(r, presetId) ?? 'requester';
  const pending = r.status === 'pending';
  const good = r.status === 'approved';
  // צבע הכותרת הוא הודעת המצב - צבע סטטוס ולא צבע תמה
  const headColor = pending ? '#b45309' : good ? '#16a34a' : '#b91c1c';
  const title = !pending ? tr('transfers.takeoverTitleOutcome')
    : role === 'requester' ? tr('transfers.takeoverTitleRequester') : tr('transfers.takeoverTitleHolder');

  const body = !pending ? outcomeText(r, role)
    : role === 'requester'
      ? tr('transfers.takeoverRequesterBody', {
          cs: r.callsign, holder: r.holder_name, point: pointOr(r.existing_point_label), dest: r.existing_dest_name,
        })
      : tr('transfers.takeoverHolderBody', {
          cs: r.callsign, requester: r.requester_name, point: pointOr(r.new_point_label), dest: r.new_dest_name,
          myPoint: pointOr(r.existing_point_label), myDest: r.existing_dest_name,
        });

  const btn = (bg: string): React.CSSProperties => ({
    padding: '9px 20px', borderRadius: 6, border: `1px solid ${bg}`, background: bg, color: '#fff',
    cursor: busy ? 'wait' : 'pointer', fontSize: 14, fontWeight: 'bold', opacity: busy ? 0.6 : 1,
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10650,
      background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 560, maxWidth: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        background: P.panel, ...windowFrame('view', themeMode, 12),
        boxShadow: '0 18px 60px rgba(0,0,0,0.65)',
      }}>
        <div style={{
          background: headColor, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
          borderStartStartRadius: 10, borderStartEndRadius: 10,
        }}>
          <span style={{ fontSize: 20 }}>{pending ? '⚠' : good ? '✅' : '⛔'}</span>
          <span style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 16, flex: 1 }}>{title}</span>
          {queued > 0 && (
            <span style={{ background: 'rgba(0,0,0,0.35)', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>
              +{queued}
            </span>
          )}
        </div>

        <div style={{ padding: '14px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ color: P.text, fontSize: 18, fontWeight: 'bold' }}>✈ {r.callsign}</div>
          <div style={{ color: P.text, fontSize: 15, lineHeight: 1.55, textAlign: 'start' }}>{body}</div>
          {pending && role === 'requester' && (
            <>
              <div style={{ color: P.accent, fontSize: 13 }}>
                {tr('transfers.takeoverRequesterMine', { point: pointOr(r.new_point_label), dest: r.new_dest_name })}
              </div>
              <div style={{ color: P.muted, fontSize: 12 }}>
                {tr('transfers.takeoverRequesterWaiting', { holder: r.holder_name })}
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '10px 16px', borderTop: `1px solid ${P.line}`, background: P.panelAlt, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {pending ? (
            <>
              <button type="button" disabled={busy} onClick={() => onDecide('deny')} style={btn('#b91c1c')}>
                ✖ {role === 'requester' ? tr('transfers.takeoverNotApproved') : tr('transfers.takeoverDontApprove')}
              </button>
              <button type="button" disabled={busy} onClick={() => onDecide('approve')} style={btn('#16a34a')}>
                ✔ {role === 'requester' ? tr('transfers.takeoverApprovedCoordinated') : tr('transfers.takeoverApprove')}
              </button>
            </>
          ) : (
            <button type="button" onClick={onAckOutcome} style={btn(good ? '#16a34a' : '#475569')}>
              {tr('shared.acknowledge')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** portal ל-body - כמו ההתראה המתפרצת של ההלאמה: מעל כל חלון צף ותפריט. */
export default function TransferTakeoverDialog(props: Props) {
  return createPortal(<TransferTakeoverCard {...props} />, document.body);
}

// ─── "שים לב - נמצא גם בעמדה" ────────────────────────────────────────────────
// הודעה בלבד, לא חוסמת: להחזיק פ"מ בכמה עמדות זה לגיטימי (היערכות, גיבוי נתק).
// הפקח צריך רק לדעת. לכן פס עליון שנסגר לבד, ולא מודל.

interface HeldProps {
  notices: { stripId: string; callsign: string; others: string[] }[];
  themeMode: FrameTheme;
  onDismiss: (stripId: string) => void;
}

export function HeldElsewhereCard({ notices, themeMode, onDismiss }: HeldProps) {
  const P = seizurePalette(themeMode);
  if (notices.length === 0) return null;
  return (
    <div style={{
      // רוחב מלא וממורכז ב-flex - סימטרי, ולכן נכון גם ב-RTL וגם ב-LTR
      position: 'fixed', inset: '56px 0 auto 0', zIndex: 10640, pointerEvents: 'none',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    }}>
      {notices.map(n => (
        <div key={n.stripId} role="status" style={{
          pointerEvents: 'auto', maxWidth: '92vw',
          background: P.panel, ...windowFrame('view', themeMode, 8),
          borderInlineStart: '6px solid #f59e0b',
          padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        }}>
          <span style={{ fontSize: 18 }}>⚠</span>
          <span style={{ color: P.text, fontSize: 15, fontWeight: 'bold', flex: 1, textAlign: 'start' }}>
            {tr('transfers.heldElsewhereBody', { cs: n.callsign, stations: n.others.join(', ') })}
          </span>
          <button type="button" onClick={() => onDismiss(n.stripId)}
            style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${P.line}`, background: P.panelAlt, color: P.text, cursor: 'pointer', fontSize: 13 }}>
            {tr('shared.acknowledge')}
          </button>
        </div>
      ))}
    </div>
  );
}

export function HeldElsewhereNotices(props: HeldProps) {
  return createPortal(<HeldElsewhereCard {...props} />, document.body);
}
