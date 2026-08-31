/**
 * **פרטי ההלאמה** - נפתח בלחיצה על קו המרחב המולאם על המפה.
 *
 * הבעיה שהוא פותר: אחרי שההתראה אושרה, המרחב נשאר על המפה ואיתו כל המידע
 * שנדרש כדי לפעול - למי מתקשרים, עד מתי, ולטובת מה - אבל לא הייתה שום דרך
 * לראות אותו שוב. פוליגון על מפה בלי דרך לשאול אותו "מה אתה" הוא בדיוק
 * הכשל של הסדק הפיזי, ששם צריך לזכור מה הצ'ינו הזה אומר.
 *
 * החלון הוא גם **הדרך חזרה לטופס אישורי העמדות**: היוצר שסגר אותו לא נשאר
 * בלי דרך לפתוח אותו מחדש.
 *
 * חלון **צפייה ותפעול** - מסגרת תורכיז (CLAUDE.md §מסגרת חלון).
 */

import React, { useEffect, useRef, useState } from 'react';
import i18n from '../../i18n';
import { tr } from '../../i18n/tr';
import { windowFrame, type FrameTheme } from '../../utils/windowFrame';
import { startPointerDrag } from '../../utils/pointerDrag';
import { seizureRangeLabel, elapsedLabel } from '../../utils/tempZoneSeizure';
import { seizurePalette } from './seizureTheme';
import type { TempZoneSeizure } from '../../types';

interface Props {
  seizure: TempZoneSeizure;
  themeMode: FrameTheme;
  /** האם העמדה הזו היא היוצרת - רק לה יש "סיים" ו"אישורי עמדות". */
  isCreator: boolean;
  /** מקומו בערימת חלונות ההלאמה. ראה §סדר הערימה ב-SectorDashboard. */
  zIndex: number;
  /** לחיצה בכל מקום בחלון מעלה אותו לראש הערימה. */
  onFocus: () => void;
  onOpenAcks: () => void;
  onEnd: () => void;
  onClose: () => void;
}

const fmtTime = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? ''
    : d.toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
};

export default function SeizureDetails({ seizure, themeMode, isCreator, zIndex, onFocus, onOpenAcks, onEnd, onClose }: Props) {
  const P = seizurePalette(themeMode);
  const [pos, setPos] = useState({ x: 140, y: 130 });
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const posRef = useRef(pos);
  posRef.current = pos;

  // שעון רץ - אותו זמן שמוצג בטופס האישורים, כדי ששני המסכים לא יסתרו זה את זה
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Esc סוגר - זה חלון מידע, לא התראה בטיחותית
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onDragDown = (e: React.PointerEvent) => {
    const origin = { ...posRef.current };
    startPointerDrag(e, { onMove: (dx, dy) => setPos({ x: origin.x + dx, y: origin.y + dy }) });
  };

  const range = seizureRangeLabel(seizure);
  const row = (k: string, v: React.ReactNode) => !v ? null : (
    <div style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'baseline' }}>
      <span style={{ color: P.muted, minWidth: 96, flexShrink: 0 }}>{k}</span>
      <span style={{ color: P.text, fontWeight: 'bold', wordBreak: 'break-word' }}>{v}</span>
    </div>
  );
  const btn = (color: string): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
    border: `1px solid ${color}`, background: 'transparent', color,
  });

  return (
    <div onPointerDownCapture={onFocus} style={{
      position: 'fixed', left: pos.x, top: pos.y,
      // מעל תפריטי הכותרת (3000) ומעל סרגלי המפה - חלון שנופל מתחתיהם נראה
      // למפעיל כאילו הלחיצה על המרחב לא עשתה כלום
      zIndex, width: 380, maxHeight: 'calc(80vh / var(--s, 1))',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: P.panel, ...windowFrame('view', themeMode, 8),
      boxShadow: '0 8px 28px rgba(0,0,0,0.45)', direction: i18n.dir(),
    }}>
      <div onPointerDown={onDragDown}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
          background: P.panelAlt, borderBottom: `1px solid ${P.line}`,
          cursor: 'move', touchAction: 'none', userSelect: 'none',
        }}>
        <span style={{ width: 12, height: 12, borderRadius: 3, background: seizure.color, flexShrink: 0 }} />
        <span style={{ color: P.text, fontWeight: 'bold', fontSize: 13, flex: 1 }}>{tr('seizure.detailsTitle')}</span>
        <button type="button" onClick={onClose}
          style={{ background: 'none', border: 'none', color: P.muted, cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      <div style={{ padding: '10px 12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ color: P.text, fontSize: 17, fontWeight: 'bold' }}>{seizure.name}</div>
        {row(tr('seizure.alertAlts'), range || tr('seizure.allAlts'))}
        {row(tr('seizure.fCreator'), seizure.creator_preset_name)}
        {row(tr('seizure.fPurpose'), seizure.purpose)}
        {row(tr('seizure.fPhone'), seizure.phone)}
        {row(tr('seizure.fRadio'), seizure.radio)}
        {row(tr('seizure.createdAt'), fmtTime(seizure.created_at))}
        {row(tr('seizure.elapsed'), elapsedLabel(seizure.created_at, now))}
        {row(tr('seizure.fEta'), fmtTime(seizure.eta_end))}
        {row(tr('shared.note'), seizure.note)}
        {!isCreator && (
          <div style={{ color: seizure.my_acked ? P.ok : P.danger, fontSize: 12, marginTop: 4 }}>
            {seizure.my_acked ? `✔ ${tr('seizure.myAck')}` : `⚠ ${tr('seizure.notMyAck')}`}
          </div>
        )}
      </div>

      {isCreator && (
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${P.line}`, background: P.panelAlt, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={onOpenAcks} style={btn(P.accent)}>⛶ {tr('seizure.openAcks')}</button>
          {confirmEnd ? (
            <>
              <span style={{ color: P.danger, fontSize: 10, flex: 1 }}>{tr('seizure.endConfirm')}</span>
              <button type="button" onClick={() => { setConfirmEnd(false); onEnd(); }}
                style={{ ...btn('#dc2626'), background: '#dc2626', color: '#fff', fontWeight: 'bold' }}>
                {tr('shared.acknowledge')}
              </button>
              <button type="button" onClick={() => setConfirmEnd(false)} style={btn(P.line)}>{tr('shared.cancel')}</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmEnd(true)} style={{ ...btn(P.danger), marginInlineStart: 'auto' }}>
              {tr('seizure.endBtn')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
