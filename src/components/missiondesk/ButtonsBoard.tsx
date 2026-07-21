// שירות "מסך ניהול אמצעים" — לוח כפתורים חופשי בדסק משימה כללי.
// מותאם מסך מגע: כל הפעולות בכפתורים גלויים (➕ יצירה, ✏️ מצב עריכה) — קליק ימני
// קיים רק כקיצור לעכבר. כפתורים נגררים למיקום חופשי (Pointer Events — Cintiq),
// לכל כפתור מצבים עם צבע, טקסט חופשי, פונט/גודל/מידות, וטריגר התראה מתפרצת.
// adminMode (הגדרת עמדה): כפתורים שנוצרים מסומנים "קבוע" (📌) — בעמדה אי אפשר
// למחוק/לערוך אותם (רק להפעיל, לגרור ולמלא טקסט חופשי).
import { useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import { API_URL } from '../../config';
import { customConfirm } from '../shared/ConfirmModal';
import type { MDButton, MDButtonsState, MDButtonStateDef } from '../../types/missionDesk';
import { cycleButtonState, mdGenId } from '../../utils/missionDesk';
import type { MDTheme } from './theme';

interface Props {
  serviceName: string;
  state: MDButtonsState;
  onChange: (next: MDButtonsState) => void;
  presetId: number;
  presetName: string;
  allPresets: { id: number; name: string }[];
  theme: MDTheme;
  onInteracting: (busy: boolean) => void;
  postLog: (action: string, details: Record<string, unknown>) => void;
  adminMode?: boolean;
}

const FONTS = ['', 'monospace', 'serif'];

export default function ButtonsBoard({ serviceName, state, onChange, presetId, presetName, allPresets, theme, onInteracting, postLog, adminMode }: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; btnId: string | null } | null>(null);
  const [editing, setEditing] = useState<MDButton | null>(null);
  const [editMode, setEditMode] = useState(false);
  const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

  const buttons = state?.buttons || [];
  const save = (next: MDButton[]) => onChange({ buttons: next });

  const canEditBtn = (btn: MDButton) => adminMode || !btn.fixed;

  const newButton = (x: number, y: number): MDButton => ({
    id: mdGenId(), x, y, text: tr('missiondesk.newButtonText'),
    fixed: adminMode ? true : undefined,
    states: [
      { label: tr('missiondesk.defaultStateOff'), color: '#64748b' },
      { label: tr('missiondesk.defaultStateOn'), color: '#16a34a' },
    ],
    activeStateIdx: 0,
  });

  const fireAlerts = (btn: MDButton, st: MDButtonStateDef) => {
    if (adminMode) return; // במצב הגדרה לא יורים התראות אמת
    const targets = (st.alertPresetIds || []).filter(id => id !== presetId);
    if (!targets.length) return;
    fetch(`${API_URL}/workstation-messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_preset_id: presetId, from_preset_name: presetName, to_preset_ids: targets, message: `${serviceName ? serviceName + ' — ' : ''}${btn.text}: ${st.label}` }),
    }).catch(() => {});
  };

  const clickButton = (btn: MDButton) => {
    if (editMode) {
      if (canEditBtn(btn)) setEditing({ ...btn, states: btn.states.map(s => ({ ...s })) });
      return;
    }
    const nextIdx = cycleButtonState(btn);
    const st = btn.states[nextIdx];
    save(buttons.map(b => b.id === btn.id ? { ...b, activeStateIdx: nextIdx } : b));
    if (st) {
      postLog('mission_desk_button_state_changed', { button: btn.text, state: st.label });
      fireAlerts(btn, st);
    }
  };

  const onBtnPointerDown = (e: React.PointerEvent, btn: MDButton) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { id: btn.id, startX: e.clientX, startY: e.clientY, origX: btn.x, origY: btn.y, moved: false };
    onInteracting(true);
  };
  const onBtnPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    const r = boardRef.current?.getBoundingClientRect(); if (!r) return;
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    const x = Math.min(95, Math.max(0, d.origX + (dx / r.width) * 100));
    const y = Math.min(95, Math.max(0, d.origY + (dy / r.height) * 100));
    save(buttons.map(b => b.id === d.id ? { ...b, x, y } : b));
  };
  const onBtnPointerUp = (_e: React.PointerEvent, btn: MDButton) => {
    const d = dragRef.current;
    dragRef.current = null;
    onInteracting(false);
    if (d && !d.moved) clickButton(btn);
  };

  const editorSave = () => {
    if (!editing) return;
    const exists = buttons.some(b => b.id === editing.id);
    save(exists ? buttons.map(b => b.id === editing.id ? editing : b) : [...buttons, editing]);
    setEditing(null);
  };

  const deleteButton = async (id: string) => {
    setMenu(null);
    if (!(await customConfirm(tr('missiondesk.confirmDeleteButton')))) return;
    save(buttons.filter(b => b.id !== id));
    setEditing(null);
  };

  const inputStyle: React.CSSProperties = { background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 6, color: theme.text, padding: '6px 8px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
  const actionStyle: React.CSSProperties = { background: 'none', border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.subtext, cursor: 'pointer', fontSize: 13, padding: '6px 12px', minHeight: 36 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* פעולות גלויות — מסך מגע, בלי תלות בקליק ימני */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', borderBottom: `1px solid ${theme.border}`, flexWrap: 'wrap' }}>
        <button
          onClick={() => setEditing(newButton(38 + Math.random() * 8, 34 + Math.random() * 8))}
          style={{ ...actionStyle, color: '#4ade80', borderColor: '#166534' }}>
          ➕ {tr('missiondesk.createButton')}
        </button>
        <button
          onClick={() => setEditMode(m => !m)}
          style={{ ...actionStyle, ...(editMode ? { background: '#7c2d12', color: '#fdba74', borderColor: '#ea580c' } : {}) }}>
          ✏️ {tr('missiondesk.editMode')}
        </button>
        {editMode && <span style={{ fontSize: 12, color: theme.subtext }}>{tr('missiondesk.editModeHint')}</span>}
        {adminMode && <span style={{ marginInlineStart: 'auto', fontSize: 12, color: '#fbbf24' }}>📌 {tr('missiondesk.adminButtonsHint')}</span>}
      </div>

      <div
        ref={boardRef}
        data-testid="md-buttons-board"
        style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', touchAction: 'none' }}
        onContextMenu={e => {
          e.preventDefault();
          const r = boardRef.current?.getBoundingClientRect();
          setMenu({ x: e.clientX - (r?.left || 0), y: e.clientY - (r?.top || 0), btnId: null });
        }}
      >
        {buttons.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.subtext, fontSize: 14, pointerEvents: 'none' }}>
            {tr('missiondesk.emptyBoardHint')}
          </div>
        )}

        {buttons.map(btn => {
          const st = btn.states[btn.activeStateIdx] || btn.states[0];
          const editable = canEditBtn(btn);
          return (
            <div
              key={btn.id}
              onPointerDown={e => onBtnPointerDown(e, btn)}
              onPointerMove={onBtnPointerMove}
              onPointerUp={e => onBtnPointerUp(e, btn)}
              onContextMenu={e => {
                e.preventDefault(); e.stopPropagation();
                const r = boardRef.current?.getBoundingClientRect();
                setMenu({ x: e.clientX - (r?.left || 0), y: e.clientY - (r?.top || 0), btnId: btn.id });
              }}
              style={{
                position: 'absolute', left: `${btn.x}%`, top: `${btn.y}%`,
                width: btn.w || undefined, height: btn.h || undefined,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: st?.color || '#64748b', color: '#fff',
                border: editMode && editable ? '2px dashed #fdba74' : '1px solid rgba(0,0,0,0.35)', borderRadius: 8,
                padding: '8px 14px', cursor: 'pointer', userSelect: 'none', boxSizing: 'border-box',
                fontSize: btn.fontSize || 15, fontWeight: btn.bold ? 'bold' : 'normal',
                fontFamily: btn.font || undefined,
                boxShadow: '0 2px 6px rgba(0,0,0,0.35)', minWidth: 60, textAlign: 'center',
                touchAction: 'none', overflow: 'hidden',
              }}
              title={btn.fixed && !adminMode ? `${st?.label || ''} · ${tr('missiondesk.fixedBadge')}` : st?.label || ''}
            >
              <div>{btn.fixed ? '📌 ' : ''}{btn.text}</div>
              {st && <div style={{ fontSize: Math.max(10, (btn.fontSize || 15) - 4), opacity: 0.9 }}>{st.label}</div>}
              {btn.allowFreeText && (
                <input
                  value={btn.freeText || ''}
                  onChange={e => save(buttons.map(b => b.id === btn.id ? { ...b, freeText: e.target.value } : b))}
                  onPointerDown={e => e.stopPropagation()}
                  placeholder={tr('missiondesk.freeTextPlaceholder')}
                  style={{ marginTop: 4, width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.25)', border: 'none', borderRadius: 4, color: '#fff', fontSize: 12, padding: '2px 4px', textAlign: 'center' }}
                />
              )}
            </div>
          );
        })}

        {/* תפריט קליק ימני — קיצור לעכבר בלבד; כל הפעולות זמינות גם מסרגל הפעולות */}
        {menu && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={() => setMenu(null)} onContextMenu={e => { e.preventDefault(); setMenu(null); }} />
            <div style={{ position: 'absolute', left: menu.x, top: menu.y, zIndex: 61, background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.4)', minWidth: 140, overflow: 'hidden' }}>
              {menu.btnId === null ? (
                <button
                  onClick={() => { const pct = { x: (menu.x / (boardRef.current?.clientWidth || 1)) * 100, y: (menu.y / (boardRef.current?.clientHeight || 1)) * 100 }; setEditing(newButton(Math.min(95, pct.x), Math.min(95, pct.y))); setMenu(null); }}
                  style={{ display: 'block', width: '100%', padding: '9px 14px', background: 'none', border: 'none', color: theme.text, cursor: 'pointer', fontSize: 14, textAlign: 'start' }}>
                  ➕ {tr('missiondesk.createButton')}
                </button>
              ) : (() => {
                const b = buttons.find(x => x.id === menu.btnId);
                if (!b || !canEditBtn(b)) return (
                  <div style={{ padding: '9px 14px', color: theme.subtext, fontSize: 13 }}>📌 {tr('missiondesk.fixedBadge')}</div>
                );
                return (
                  <>
                    <button onClick={() => { setEditing({ ...b, states: b.states.map(s => ({ ...s })) }); setMenu(null); }}
                      style={{ display: 'block', width: '100%', padding: '9px 14px', background: 'none', border: 'none', color: theme.text, cursor: 'pointer', fontSize: 14, textAlign: 'start' }}>
                      ✏️ {tr('missiondesk.editButton')}
                    </button>
                    <button onClick={() => deleteButton(b.id)}
                      style={{ display: 'block', width: '100%', padding: '9px 14px', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14, textAlign: 'start' }}>
                      🗑 {tr('missiondesk.deleteButton')}
                    </button>
                  </>
                );
              })()}
            </div>
          </>
        )}
      </div>

      {/* עורך כפתור */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setEditing(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 18, width: 'min(440px, 92vw)', maxHeight: '86vh', overflowY: 'auto', color: theme.text }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>{tr('missiondesk.buttonEditorTitle')}{editing.fixed ? ' 📌' : ''}</h3>

            <label style={{ display: 'block', fontSize: 12, color: theme.subtext, marginBottom: 4 }}>{tr('missiondesk.buttonText')}</label>
            <input value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })} style={inputStyle} />

            <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                <input type="checkbox" checked={!!editing.allowFreeText} onChange={e => setEditing({ ...editing, allowFreeText: e.target.checked })} />
                {tr('missiondesk.allowFreeText')}
              </label>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                <input type="checkbox" checked={!!editing.bold} onChange={e => setEditing({ ...editing, bold: e.target.checked })} />
                {tr('missiondesk.boldFont')}
              </label>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                {tr('missiondesk.fontSize')}
                <input type="number" min={10} max={40} value={editing.fontSize || 15} onChange={e => setEditing({ ...editing, fontSize: Number(e.target.value) || 15 })} style={{ ...inputStyle, width: 64 }} />
              </label>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                {tr('missiondesk.font')}
                <select value={editing.font || ''} onChange={e => setEditing({ ...editing, font: e.target.value })} style={{ ...inputStyle, width: 110 }}>
                  {FONTS.map(f => <option key={f} value={f}>{f === '' ? tr('missiondesk.fontDefault') : f}</option>)}
                </select>
              </label>
            </div>

            {/* גודל הכפתור */}
            <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 'bold', color: theme.subtext }}>{tr('missiondesk.buttonSize')}</span>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                {tr('missiondesk.btnWidth')}
                <input type="number" min={0} max={600} placeholder={tr('missiondesk.sizeAuto')} value={editing.w || ''} onChange={e => setEditing({ ...editing, w: Number(e.target.value) || undefined })} style={{ ...inputStyle, width: 74 }} />
              </label>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                {tr('missiondesk.btnHeight')}
                <input type="number" min={0} max={400} placeholder={tr('missiondesk.sizeAuto')} value={editing.h || ''} onChange={e => setEditing({ ...editing, h: Number(e.target.value) || undefined })} style={{ ...inputStyle, width: 74 }} />
              </label>
              {adminMode && (
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 5, color: '#fbbf24' }}>
                  <input type="checkbox" checked={!!editing.fixed} onChange={e => setEditing({ ...editing, fixed: e.target.checked || undefined })} />
                  📌 {tr('missiondesk.fixedBadge')}
                </label>
              )}
            </div>

            <div style={{ marginTop: 14, fontSize: 13, fontWeight: 'bold', color: theme.subtext }}>{tr('missiondesk.statesTitle')}</div>
            {editing.states.map((st, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap', background: theme.panelAlt, borderRadius: 8, padding: '6px 8px' }}>
                <input value={st.label} onChange={e => setEditing({ ...editing, states: editing.states.map((s, j) => j === i ? { ...s, label: e.target.value } : s) })} placeholder={tr('missiondesk.stateLabel')} style={{ ...inputStyle, flex: 1, minWidth: 90 }} />
                <input type="color" value={st.color} onChange={e => setEditing({ ...editing, states: editing.states.map((s, j) => j === i ? { ...s, color: e.target.value } : s) })} style={{ width: 36, height: 30, border: 'none', background: 'none', cursor: 'pointer' }} />
                <details style={{ fontSize: 12 }}>
                  <summary style={{ cursor: 'pointer', color: (st.alertPresetIds?.length || 0) > 0 ? '#f59e0b' : theme.subtext }}>
                    🔔 {tr('missiondesk.alertTargets')}{(st.alertPresetIds?.length || 0) > 0 ? ` (${st.alertPresetIds!.length})` : ''}
                  </summary>
                  <div style={{ maxHeight: 110, overflowY: 'auto', marginTop: 4 }}>
                    {allPresets.filter(p => p.id !== presetId).map(p => (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 0' }}>
                        <input type="checkbox" checked={(st.alertPresetIds || []).includes(p.id)}
                          onChange={e => {
                            const cur = st.alertPresetIds || [];
                            const next = e.target.checked ? [...cur, p.id] : cur.filter(x => x !== p.id);
                            setEditing({ ...editing, states: editing.states.map((s, j) => j === i ? { ...s, alertPresetIds: next } : s) });
                          }} />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </details>
                {editing.states.length > 1 && (
                  <button onClick={() => setEditing({ ...editing, states: editing.states.filter((_, j) => j !== i), activeStateIdx: 0 })}
                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 15 }} title={tr('missiondesk.removeState')}>✕</button>
                )}
              </div>
            ))}
            <button onClick={() => setEditing({ ...editing, states: [...editing.states, { label: tr('missiondesk.stateLabel'), color: '#f59e0b' }] })}
              style={{ marginTop: 8, background: 'none', border: `1px dashed ${theme.border}`, borderRadius: 6, color: theme.subtext, cursor: 'pointer', padding: '5px 10px', fontSize: 12 }}>
              ➕ {tr('missiondesk.addState')}
            </button>

            <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
              {buttons.some(b => b.id === editing.id) && (adminMode || !editing.fixed) && (
                <button onClick={() => deleteButton(editing.id)}
                  style={{ padding: '8px 14px', background: 'none', border: '1px solid #7f1d1d', borderRadius: 8, color: '#f87171', cursor: 'pointer', fontSize: 14 }}>
                  🗑 {tr('missiondesk.deleteButton')}
                </button>
              )}
              <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 8 }}>
                <button onClick={() => setEditing(null)} style={{ padding: '8px 16px', background: 'none', border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.subtext, cursor: 'pointer', fontSize: 14 }}>{tr('missiondesk.cancel')}</button>
                <button onClick={editorSave} style={{ padding: '8px 20px', background: '#059669', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 'bold' }}>{tr('missiondesk.save')}</button>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
