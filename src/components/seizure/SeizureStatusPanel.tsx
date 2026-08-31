/**
 * **טופס אישורי העמדות** - מה שהעמדה היוצרת רואה אחרי ההפצה.
 *
 * לכל עמדה: אושר / לא אושר · ההערה שהיא כתבה · **וכמה פ"מים עדיין אצלה בתוך
 * המרחב**. הספירה מגיעה מהעמדה עצמה (`/report`) ולא מהשרת, כי לכל עמדה מפה,
 * עוגנים ואזורים משלה - חישוב מרכזי היה מנחש.
 *
 * "לא אושר" **מהבהב**: זו השורה שדורשת פעולה מהיוצר (להרים טלפון), ואם היא
 * נראית כמו כל שורה אחרת הטבלה הופכת לרשימה שאיש אינו קורא.
 *
 * חלון **צפייה ותפעול** - מסגרת תורכיז, ובר-עגינה בקונטיינר החלונות.
 */

import React, { useCallback, useEffect, useState } from 'react';
import i18n from '../../i18n';
import { tr } from '../../i18n/tr';
import { useDockableWindow } from '../../hooks/useDockableWindow';
import { usePolling } from '../../hooks/usePollingRegistry';
import { windowFrame, type FrameTheme } from '../../utils/windowFrame';
import { startPointerDrag } from '../../utils/pointerDrag';
import { seizureRangeLabel } from '../../utils/tempZoneSeizure';
import { seizurePalette } from './seizureTheme';
import type { TempZoneSeizure, TempZoneSeizureTarget } from '../../types';

interface Props {
  apiUrl: string;
  /** ההלאמות **שאני יצרתי** ופעילות. ריק = החלון אינו מוצג. */
  seizures: TempZoneSeizure[];
  themeMode: FrameTheme;
  onEnd: (seizureId: number) => void;
  onClose: () => void;
}

const fmtTime = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
};

export default function SeizureStatusPanel({ apiUrl, seizures, themeMode, onEnd, onClose }: Props) {
  const P = seizurePalette(themeMode);
  const [pos, setPos] = useState({ x: 80, y: 110 });
  const [openId, setOpenId] = useState<number | null>(seizures[0]?.id ?? null);
  const [targets, setTargets] = useState<Record<number, TempZoneSeizureTarget[]>>({});
  const [confirmEnd, setConfirmEnd] = useState<number | null>(null);

  const dock = useDockableWindow('seizureStatus', tr('seizure.statusTitle'), {
    setFloatingPos: (x, y) => setPos({ x, y }),
    floatingPos: () => pos,
  });

  // ההלאמה הפתוחה נשארת פתוחה; כשהיא מסתיימת נופלים לראשונה שנשארה
  useEffect(() => {
    if (openId != null && seizures.some(s => s.id === openId)) return;
    setOpenId(seizures[0]?.id ?? null);
  }, [seizures, openId]);

  const load = useCallback(async () => {
    if (openId == null) return;
    try {
      const res = await fetch(`${apiUrl}/temp-zone-seizures/${openId}/targets`);
      if (!res.ok) return;
      const rows = await res.json();
      setTargets(prev => ({ ...prev, [openId]: Array.isArray(rows) ? rows : [] }));
    } catch { /* נתק - נשארים על מה שיש */ }
  }, [apiUrl, openId]);

  usePolling(`seizure-targets-${openId ?? 'none'}`, load, openId != null ? 8000 : 0);

  // dx/dy מ-`startPointerDrag` הם ההיסט **המצטבר** מנקודת ההתחלה (וכבר מחולק
  // ב---s), ולכן המיקום נגזר מהמקור שנלכד בירידה ולא מהמצב הקודם.
  const onDragDown = (e: React.PointerEvent) => {
    const origin = { ...pos };
    startPointerDrag(e, { onMove: (dx, dy) => setPos({ x: origin.x + dx, y: origin.y + dy }) });
  };

  if (!seizures.length) return null;
  const rows = openId != null ? (targets[openId] || []) : [];
  const open = seizures.find(s => s.id === openId) || null;

  const cell: React.CSSProperties = { padding: '4px 8px', fontSize: 12, textAlign: 'start' };

  return dock.render(
    <div style={{
      position: 'fixed', left: pos.x, top: pos.y, zIndex: 5000, width: 430,
      maxHeight: 'calc(72vh / var(--s, 1))', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: P.panel, ...windowFrame('view', themeMode, 8), boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
      direction: i18n.dir(), ...dock.rootStyle,
    }}>
      <div
        onPointerDown={e => { dock.onHeaderPointerDown(e); onDragDown(e); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
          background: P.panelAlt, borderBottom: `1px solid ${P.line}`,
          cursor: 'move', touchAction: 'none', userSelect: 'none',
        }}>
        <span style={{ color: P.text, fontWeight: 'bold', fontSize: 13, flex: 1 }}>⛶ {tr('seizure.statusTitle')}</span>
        <button type="button" onClick={onClose}
          style={{ background: 'none', border: 'none', color: P.muted, cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* בורר ההלאמה - מוצג רק כשיש יותר מאחת, אחרת זו שורה ריקה */}
      {seizures.length > 1 && (
        <div style={{ display: 'flex', gap: 4, padding: '6px 8px', flexWrap: 'wrap', borderBottom: `1px solid ${P.line}` }}>
          {seizures.map(s => (
            <button key={s.id} type="button" onClick={() => setOpenId(s.id)}
              style={{
                padding: '3px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                border: `1px solid ${s.id === openId ? s.color : P.line}`,
                background: s.id === openId ? P.panelAlt : 'transparent',
                color: s.id === openId ? P.text : P.muted,
              }}>{s.name}</button>
          ))}
        </div>
      )}

      {open && (
        <div style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${P.line}` }}>
          <span style={{ width: 11, height: 11, borderRadius: 3, background: open.color, flexShrink: 0 }} />
          <span style={{ color: P.text, fontSize: 13, fontWeight: 'bold' }}>{open.name}</span>
          <span style={{ color: P.muted, fontSize: 11, flex: 1 }}>
            {seizureRangeLabel(open) || tr('seizure.allAlts')}
          </span>
          {confirmEnd === open.id ? (
            <>
              <span style={{ color: P.danger, fontSize: 10 }}>{tr('seizure.endConfirm')}</span>
              <button type="button" onClick={() => { setConfirmEnd(null); onEnd(open.id); }}
                style={{ padding: '3px 10px', borderRadius: 5, border: '1px solid #dc2626', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 'bold' }}>
                {tr('shared.acknowledge')}
              </button>
              <button type="button" onClick={() => setConfirmEnd(null)}
                style={{ padding: '3px 8px', borderRadius: 5, border: `1px solid ${P.line}`, background: P.panel, color: P.muted, cursor: 'pointer', fontSize: 11 }}>
                {tr('shared.cancel')}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmEnd(open.id)}
              style={{ padding: '3px 10px', borderRadius: 5, border: `1px solid ${P.danger}`, background: 'transparent', color: P.danger, cursor: 'pointer', fontSize: 11 }}>
              {tr('seizure.endBtn')}
            </button>
          )}
        </div>
      )}

      <div style={{ overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: P.panelAlt }}>
              <th style={{ ...cell, color: P.muted, fontWeight: 'normal' }}>{tr('seizure.colStation')}</th>
              <th style={{ ...cell, color: P.muted, fontWeight: 'normal' }}>{tr('seizure.colStatus')}</th>
              <th style={{ ...cell, color: P.muted, fontWeight: 'normal' }}>{tr('shared.note')}</th>
              <th style={{ ...cell, color: P.muted, fontWeight: 'normal' }}>{tr('seizure.colPins')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(t => (
              <tr key={t.id} style={{ borderTop: `1px solid ${P.line}` }}>
                <td style={{ ...cell, color: P.text }}>{t.preset_name || t.preset_id}</td>
                <td style={{ ...cell, color: t.acked ? P.ok : P.danger, fontWeight: 'bold' }}>
                  {/* "לא אושר" מהבהב - זו השורה שדורשת פעולה */}
                  <span style={{ animation: t.acked ? 'none' : 'voicePulse 1.4s ease-in-out infinite' }}>
                    {t.acked ? `${tr('seizure.acked')} ${fmtTime(t.acked_at)}` : tr('seizure.notAcked')}
                  </span>
                </td>
                <td style={{ ...cell, color: P.muted }}>{t.ack_note || ''}</td>
                <td style={{ ...cell, color: t.pins_in_zone > 0 ? P.accent : P.muted, fontWeight: t.pins_in_zone > 0 ? 'bold' : 'normal' }}>
                  {t.pins_in_zone > 0 ? t.pins_in_zone : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>,
  );
}
