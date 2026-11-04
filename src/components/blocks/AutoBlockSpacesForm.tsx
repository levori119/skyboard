/**
 * **טופס עזר: מרחבים לשיוך אוטומטי** - חלון צף בעמדה.
 *
 * החלוקה האוטומטית (דגל עמדה `auto_block_space_by_target`) משייכת פ"מ למרחב
 * שמרכזו הכי קרוב למטרה. לא כל מרחב ניתן לאיוש בכל רגע, ולכן הפקח/בקר מסמן
 * כאן לאילו מרחבים מותר לשייך - והמטרה הולכת למרחב **המותר** הקרוב ביותר.
 *
 * בראש הטופס מתג שמפעיל את החלוקה האוטומטית בעמדה (`auto_block_space_by_target`),
 * כדי שהפריט לא ייעלם מהתפריט כשהיא כבויה - פקד שנעלם נראה כמו פיצ'ר שבור.
 *
 * נשמר ב-DB פר עמדה (`workstation_presets.auto_block_space_ids`), כך שכל מי
 * שיושב בעמדה רואה אותו דבר. null = הטופס לא נערך, כל המרחבים מותרים.
 * מרחב בלי מיקום על המפה לא יכול לקבל פ"מ אוטומטית ולכן מוצג נעול.
 */
import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../../i18n/tr';
import { windowFrame, type FrameTheme } from '../../utils/windowFrame';
import { useDragPosition } from '../../hooks/useDragPosition';

interface Props {
  spaces: any[];
  allowedIds: number[] | null;
  enabled: boolean;
  themeMode: FrameTheme;
  onChange: (ids: number[] | null) => void;
  onToggleEnabled: (on: boolean) => void;
  onClose: () => void;
}

export default function AutoBlockSpacesForm({ spaces, allowedIds, enabled, themeMode, onChange, onToggleEnabled, onClose }: Props) {
  const winRef = useRef<HTMLDivElement | null>(null);
  const drag = useDragPosition(winRef);
  const light = themeMode === 'light';
  const c = light
    ? { bg: '#ffffff', head: '#f1f5f9', text: '#0f172a', muted: '#64748b', row: '#f8fafc', rowOn: '#e0f2fe', line: '#e2e8f0' }
    : { bg: '#0f172a', head: '#1e293b', text: '#e2e8f0', muted: '#94a3b8', row: '#111827', rowOn: '#0c4a6e', line: '#334155' };

  const located = spaces.filter(s => s.center_lat != null && s.center_lon != null);
  const isOn = (id: number) => allowedIds === null || allowedIds.map(Number).includes(Number(id));
  const toggle = (id: number) => {
    const base = allowedIds === null ? located.map(s => Number(s.id)) : allowedIds.map(Number);
    onChange(base.includes(Number(id)) ? base.filter(x => x !== Number(id)) : [...base, Number(id)]);
  };
  const onCount = located.filter(s => isOn(Number(s.id))).length;

  const btn: React.CSSProperties = { background: 'transparent', border: `1px solid ${c.line}`, color: c.text, borderRadius: 5, cursor: 'pointer', padding: '3px 10px', fontSize: '12px' };

  return createPortal(
    <div ref={winRef} data-testid="auto-block-spaces-form" onClick={e => e.stopPropagation()}
      style={{ zoom: 'var(--s)' as any, position: 'fixed', ...(drag.dragged ? { left: drag.pos!.x, top: drag.pos!.y } : { top: 90, insetInlineEnd: 340 }), zIndex: 9000, width: 300, maxHeight: '70vh', display: 'flex', flexDirection: 'column', background: c.bg, color: c.text, boxShadow: '0 10px 30px rgba(0,0,0,0.45)', ...windowFrame('edit', themeMode, 8), overflow: 'hidden' }}>
      <div {...drag.handleProps} style={{ ...drag.handleProps.style, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: c.head, borderBottom: `1px solid ${c.line}` }}>
        <span style={{ fontSize: '14px' }}>📍</span>
        <span style={{ flex: 1, fontWeight: 'bold', fontSize: '13px' }}>{tr('blocks.autoSpacesTitle')}</span>
        <button onPointerDown={e => e.stopPropagation()} onClick={onClose} title={tr('shared.close')} style={{ ...btn, border: 'none', fontSize: '14px', padding: '0 4px' }}>✕</button>
      </div>
      <label data-testid="auto-spaces-enabled" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 10px 0', padding: '7px 8px', borderRadius: 6, cursor: 'pointer', userSelect: 'none', fontSize: '13px', fontWeight: 'bold', background: enabled ? c.rowOn : c.row, border: `1px solid ${enabled ? '#0ea5e9' : '#f59e0b'}` }}>
        <input type="checkbox" checked={enabled} onChange={e => onToggleEnabled(e.target.checked)} style={{ width: 16, height: 16, margin: 0 }} />
        <span style={{ flex: 1 }}>{tr('blocks.autoSpacesEnabled')}</span>
        <span style={{ fontSize: '11px', color: enabled ? '#0ea5e9' : '#f59e0b' }}>{enabled ? tr('blocks.autoSpacesOn') : tr('blocks.autoSpacesOff')}</span>
      </label>
      <div style={{ padding: '8px 10px', fontSize: '11px', color: c.muted, lineHeight: 1.5 }}>{tr('blocks.autoSpacesHint')}</div>
      <div style={{ overflowY: 'auto', padding: '0 10px 6px', display: 'flex', flexDirection: 'column', gap: 4, opacity: enabled ? 1 : 0.6 }}>
        {spaces.length === 0 && <div style={{ fontSize: '12px', color: c.muted, padding: '6px 0' }}>{tr('blocks.autoSpacesNone')}</div>}
        {spaces.map(s => {
          const hasLoc = s.center_lat != null && s.center_lon != null;
          const on = hasLoc && isOn(Number(s.id));
          return (
            <label key={s.id} data-testid={`auto-space-${s.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 6, cursor: hasLoc ? 'pointer' : 'not-allowed', background: on ? c.rowOn : c.row, border: `1px solid ${on ? '#0ea5e9' : c.line}`, opacity: hasLoc ? 1 : 0.55, userSelect: 'none', fontSize: '13px' }}>
              <input type="checkbox" checked={on} disabled={!hasLoc} onChange={() => toggle(Number(s.id))} style={{ width: 16, height: 16, margin: 0 }} />
              <span style={{ flex: 1, fontWeight: on ? 'bold' : 'normal' }}>{s.name}</span>
              {!hasLoc && <span style={{ fontSize: '10px', color: '#f59e0b' }}>{tr('blocks.autoSpacesNoLocation')}</span>}
            </label>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderTop: `1px solid ${c.line}`, background: c.head }}>
        <span style={{ flex: 1, fontSize: '11px', color: onCount === 0 ? '#f59e0b' : c.muted }}>
          {onCount === 0 ? tr('blocks.autoSpacesZero') : tr('blocks.autoSpacesCount', { n: onCount, total: located.length })}
        </span>
        <button data-testid="auto-spaces-all" onClick={() => onChange(null)} style={btn}>{tr('blocks.autoSpacesAll')}</button>
        <button data-testid="auto-spaces-none" onClick={() => onChange([])} style={btn}>{tr('blocks.autoSpacesClear')}</button>
      </div>
    </div>,
    document.body,
  );
}
