import React, { useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import { DRAG_HANDLE_STYLE } from '../../utils/pointerDrag';
import { sgGenId } from '../../utils/stripGrid';
import { controlKeyIssues } from '../../utils/stripControls';
import {
  CONTROL_TYPES_WITH_VALUES, STRIP_CONTROL_TYPES,
  type StripControl, type StripControlType,
} from '../../types/stripControls';

const BOX: React.CSSProperties = { background: '#0f172a', border: '1px solid #334155', borderRadius: '5px', color: 'white', fontSize: '12px', padding: '4px 7px', width: '100%', boxSizing: 'border-box' };
const LBL: React.CSSProperties = { fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '3px' };

/** מפתח תקין: אותיות לועזיות, ספרות וקו תחתון - זהה לאימות בשרת */
const toKey = (raw: string) =>
  raw.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);

const newControl = (index: number): StripControl => ({
  id: sgGenId(),
  key: `ctl_${index + 1}`,
  type: 'button',
  scope: 'window',
  values: [],
  styles: [],
});

/**
 * הגדרת ה**פקדים שבמשבצת**: הוספה, מחיקה, סידור בגרירה, וכל מאפייני הפקד.
 * הגרירה ב-Pointer Events בלבד - העמדה היא מסך מגע, ו-`onMouseDown` פשוט אינו
 * נשלח באצבע (CLAUDE.md §גרירה).
 */
export const StripControlsEditor = ({ controls, onChange }: {
  controls: StripControl[];
  onChange: (next: StripControl[]) => void;
}) => {
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  const issues = controlKeyIssues(controls);
  const update = (id: string, changes: Partial<StripControl>) =>
    onChange(controls.map(c => (c.id === id ? { ...c, ...changes } : c)));
  const remove = (id: string) => onChange(controls.filter(c => c.id !== id));

  // ── גרירה לסידור ─────────────────────────────────────────────────────────
  const startDrag = (e: React.PointerEvent, idx: number) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = idx;
    setDragIdx(idx);
    setOverIdx(idx);
  };
  const moveDrag = (e: React.PointerEvent) => {
    if (dragRef.current == null) return;
    // הצבעה על השורה שמתחת למצביע. `elementFromPoint` עובד בקואורדינטות
    // המצביע האמיתיות, ולכן הוא נכון גם תחת `zoom: var(--s)` של ה-root
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el?.closest('[data-ctl-index]') as HTMLElement | null;
    if (!row) return;
    const to = Number(row.dataset.ctlIndex);
    if (!Number.isNaN(to)) setOverIdx(to);
  };
  const endDrag = () => {
    const from = dragRef.current;
    dragRef.current = null;
    setDragIdx(null);
    const to = overIdx;
    setOverIdx(null);
    if (from == null || to == null || from === to) return;
    const next = [...controls];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div style={{ marginTop: '10px', borderTop: '1px solid #1e293b', paddingTop: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#fbbf24' }}>
          {tr('admin.cellControls')} ({controls.length})
        </span>
        <button
          onClick={() => { const c = newControl(controls.length); onChange([...controls, c]); setOpenId(c.id); }}
          style={{ padding: '3px 10px', background: '#b45309', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
        >+ {tr('admin.addControl')}</button>
      </div>

      {issues.length > 0 && (
        <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: '4px', padding: '5px 8px', marginBottom: '6px', fontSize: '11px', color: '#fca5a5' }}>
          {issues.map((iss, i) => (
            <div key={i}>
              {iss.reason === 'empty' ? tr('admin.controlKeyEmpty') : tr('admin.controlKeyConflict', { key: iss.key })}
            </div>
          ))}
        </div>
      )}

      {controls.map((c, i) => {
        const open = openId === c.id;
        const withValues = CONTROL_TYPES_WITH_VALUES.includes(c.type);
        return (
          <div
            key={c.id}
            data-ctl-index={i}
            style={{
              marginBottom: '4px', borderRadius: '5px', overflow: 'hidden',
              border: `1px solid ${overIdx === i && dragIdx !== null ? '#f59e0b' : '#334155'}`,
              background: '#0b1220', opacity: dragIdx === i ? 0.45 : 1,
            }}
          >
            {/* שורת הכותרת: ידית גרירה, סוג, מפתח, פתיחה, מחיקה */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 6px' }}>
              <span
                onPointerDown={e => startDrag(e, i)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                title={tr('admin.dragToOrder')}
                style={{ ...DRAG_HANDLE_STYLE, color: '#64748b', fontSize: '15px', cursor: 'grab', padding: '0 2px', flexShrink: 0 }}
              >⠿</span>
              <select
                value={c.type}
                onChange={e => update(c.id, { type: e.target.value as StripControlType })}
                style={{ ...BOX, width: 'auto', flexShrink: 0 }}
              >
                {STRIP_CONTROL_TYPES.map(t => (
                  <option key={t.type} value={t.type}>{tr(t.labelKey) || t.fallback}</option>
                ))}
              </select>
              <input
                value={c.label ?? ''}
                onChange={e => {
                  // המפתח נגזר מהתווית כל עוד לא נגעו בו ידנית - כך המנהל
                  // מקבל מפתח תקין בלי לדעת שהוא קיים
                  const auto = toKey(c.label ?? '') === c.key;
                  update(c.id, { label: e.target.value, ...(auto ? { key: toKey(e.target.value) || c.key } : {}) });
                }}
                placeholder={tr('admin.controlLabel')}
                style={{ ...BOX, flex: 1, minWidth: 0 }}
              />
              <span
                title={tr('admin.controlScopeHint')}
                style={{ fontSize: '10px', color: c.scope === 'global' ? '#4ade80' : '#93c5fd', flexShrink: 0, whiteSpace: 'nowrap' }}
              >{c.scope === 'global' ? tr('admin.controlScopeGlobal') : tr('admin.controlScopeWindow')}</span>
              <button onClick={() => setOpenId(open ? null : c.id)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '12px', flexShrink: 0 }}>{open ? '▲' : '▼'}</button>
              <button onClick={() => remove(c.id)} style={{ background: '#7f1d1d', border: 'none', borderRadius: '3px', color: 'white', cursor: 'pointer', fontSize: '10px', padding: '2px 5px', flexShrink: 0 }}>✕</button>
            </div>

            {open && (
              <div style={{ padding: '6px 8px 8px', background: '#0f172a', borderTop: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <div style={{ display: 'flex', gap: '7px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={LBL}>{tr('admin.controlKey')}</label>
                    <input value={c.key} onChange={e => update(c.id, { key: toKey(e.target.value) })} style={BOX} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={LBL}>{tr('admin.controlScope')}</label>
                    <select value={c.scope} onChange={e => update(c.id, { scope: e.target.value as 'window' | 'global' })} style={BOX}>
                      <option value="window">{tr('admin.controlScopeWindow')}</option>
                      <option value="global">{tr('admin.controlScopeGlobal')}</option>
                    </select>
                  </div>
                </div>

                {/* החלפת היקף אינה מעבירה ערכים בין המחסנים (אפיון §8.2, מקרה 10) */}
                <div style={{ fontSize: '10px', color: '#64748b', lineHeight: 1.4 }}>{tr('admin.controlScopeSwitchWarn')}</div>

                {withValues && (
                  <div>
                    <label style={LBL}>{tr('admin.controlValues')}</label>
                    <input
                      value={(c.values || []).join(', ')}
                      onChange={e => update(c.id, { values: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })}
                      placeholder="CLR, TXI, LUW"
                      style={BOX}
                    />
                  </div>
                )}

                {c.type === 'field' && (
                  <div>
                    <label style={LBL}>{tr('admin.controlInputMode')}</label>
                    <select value={c.input || 'keyboard'} onChange={e => update(c.id, { input: e.target.value as any })} style={BOX}>
                      <option value="keyboard">{tr('admin.controlInputKeyboard')}</option>
                      <option value="handwriting">{tr('admin.controlInputHandwriting')}</option>
                      <option value="both">{tr('admin.controlInputBoth')}</option>
                    </select>
                  </div>
                )}

                <div>
                  <label style={LBL}>{tr('admin.controlDefault')}</label>
                  {c.type === 'flag' ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#cbd5e1' }}>
                      <input type="checkbox" checked={c.defaultValue === true} onChange={e => update(c.id, { defaultValue: e.target.checked })} />
                      {c.defaultValue === true ? 'TRUE' : 'FALSE'}
                    </label>
                  ) : (
                    <input
                      value={Array.isArray(c.defaultValue) ? c.defaultValue.join(', ') : String(c.defaultValue ?? '')}
                      onChange={e => update(c.id, {
                        defaultValue: c.type === 'multiselect'
                          ? e.target.value.split(',').map(v => v.trim()).filter(Boolean)
                          : e.target.value,
                      })}
                      placeholder={tr('admin.controlDefaultPlaceholder')}
                      style={BOX}
                    />
                  )}
                </div>

                <div style={{ display: 'flex', gap: '7px' }}>
                  <div style={{ width: '70px' }}>
                    <label style={LBL}>{tr('admin.controlWidth')}</label>
                    <input type="number" min={1} max={12} value={c.flex ?? 1} onChange={e => update(c.id, { flex: Number(e.target.value) || 1 })} style={BOX} />
                  </div>
                  <div style={{ width: '80px' }}>
                    <label style={LBL}>{tr('admin.fontSize')}</label>
                    <input type="number" min={7} max={24} value={c.fontSize ?? 11} onChange={e => update(c.id, { fontSize: Number(e.target.value) || 11 })} style={BOX} />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', fontSize: '12px', color: '#94a3b8', paddingBottom: '5px' }}>
                    <input type="checkbox" checked={!!c.bold} onChange={e => update(c.id, { bold: e.target.checked })} /><b>B</b>
                  </label>
                </div>

                {/* ── עיצוב מותנה על ערך הפקד ── */}
                <div style={{ borderTop: '1px dashed #1e293b', paddingTop: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', color: '#fbbf24' }}>{tr('admin.controlConditionalStyle')}</span>
                    <button
                      onClick={() => update(c.id, { styles: [...(c.styles || []), { id: sgGenId(), match: '', bg: '#1d4ed8', text: '#ffffff' }] })}
                      style={{ padding: '2px 8px', background: '#334155', color: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}
                    >+ {tr('shared.add')}</button>
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px' }}>{tr('admin.controlStyleMatchHint')}</div>
                  {(c.styles || []).map(rule => (
                    <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                      <input
                        value={rule.match}
                        onChange={e => update(c.id, { styles: (c.styles || []).map(s => s.id === rule.id ? { ...s, match: e.target.value } : s) })}
                        placeholder={tr('admin.controlStyleMatch')}
                        style={{ ...BOX, flex: 1, minWidth: 0 }}
                      />
                      <input type="color" value={rule.bg || '#1d4ed8'} title={tr('admin.backgroundColor')}
                        onChange={e => update(c.id, { styles: (c.styles || []).map(s => s.id === rule.id ? { ...s, bg: e.target.value } : s) })}
                        style={{ width: '26px', height: '24px', padding: '1px', border: 'none', borderRadius: '3px', cursor: 'pointer', flexShrink: 0 }} />
                      <input type="color" value={rule.text || '#ffffff'} title={tr('admin.textColor')}
                        onChange={e => update(c.id, { styles: (c.styles || []).map(s => s.id === rule.id ? { ...s, text: e.target.value } : s) })}
                        style={{ width: '26px', height: '24px', padding: '1px', border: 'none', borderRadius: '3px', cursor: 'pointer', flexShrink: 0 }} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px', color: '#94a3b8', flexShrink: 0 }} title={tr('admin.enableBlinking')}>
                        <input type="checkbox" checked={!!rule.blink}
                          onChange={e => update(c.id, { styles: (c.styles || []).map(s => s.id === rule.id ? { ...s, blink: e.target.checked } : s) })} />⚡
                      </label>
                      <button onClick={() => update(c.id, { styles: (c.styles || []).filter(s => s.id !== rule.id) })}
                        style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '11px', flexShrink: 0 }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {controls.length === 0 && (
        <div style={{ fontSize: '11px', color: '#475569', textAlign: 'center', padding: '10px 0' }}>{tr('admin.noControlsInCell')}</div>
      )}
    </div>
  );
};

export default StripControlsEditor;
