import React, { useEffect, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import { DRAG_HANDLE_STYLE } from '../../utils/pointerDrag';
import { sgGenId } from '../../utils/stripGrid';
import { isFreePlacement, parseCommaList } from '../../utils/stripControls';
import { createStripField, updateStripField, useStripFieldCatalog } from '../../utils/stripFieldCatalog';
import {
  CONTROL_TYPES_WITH_VALUES, STRIP_CONTROL_TYPES,
  type StripControl, type StripControlRef, type StripControlType,
} from '../../types/stripControls';

const BOX: React.CSSProperties = { background: '#0f172a', border: '1px solid #334155', borderRadius: '5px', color: 'white', fontSize: '12px', padding: '4px 7px', width: '100%', boxSizing: 'border-box' };
const LBL: React.CSSProperties = { fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '3px' };

/**
 * קלט של **רשימה מופרדת בפסיקים**.
 *
 * הטקסט שמוצג הוא מה שהמנהל הקליד, ולא הרשימה המנורמלת: קלט מבוקר שמציג
 * `values.join(', ')` היה מוחק את הפסיק **ברגע שנכתב** ("CLR," מתפרק ל-
 * `['CLR']` וחוזר כ-"CLR"), וכך אי-אפשר להקליד ערך שני. לכן הטקסט הגולמי חי
 * כאן, הרשימה מתעדכנת בכל הקשה, והנרמול קורה ביציאה מהשדה.
 */
const CommaListInput = ({ values, onChange, placeholder }: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) => {
  const [draft, setDraft] = useState(values.join(', '));
  const typing = useRef(false);
  const joined = values.join(', ');
  useEffect(() => { if (!typing.current) setDraft(joined); }, [joined]);
  return (
    <input
      value={draft}
      placeholder={placeholder}
      onFocus={() => { typing.current = true; }}
      onBlur={() => { typing.current = false; setDraft(joined); }}
      onChange={e => { setDraft(e.target.value); onChange(parseCommaList(e.target.value)); }}
      style={BOX}
    />
  );
};

/**
 * טופס ההגדרה של שדה מותאם - **אותו טופס** בעורך הסטריפ ובמוד הטבלה, כי זו
 * אותה הגדרה בקטלוג. אין כאן שדה "מפתח": המפתח הוא מזהה טכני שהשרת מייצר,
 * ומה שמעניין את המנהל הוא התווית והתנהגות השדה.
 */
export const StripFieldForm = ({ draft, onChange }: {
  draft: Partial<StripControl>;
  onChange: (next: Partial<StripControl>) => void;
}) => {
  const type = (draft.type || 'field') as StripControlType;
  const withValues = CONTROL_TYPES_WITH_VALUES.includes(type);
  const set = (changes: Partial<StripControl>) => onChange({ ...draft, ...changes });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
      <div style={{ display: 'flex', gap: '7px' }}>
        <div style={{ flex: 1 }}>
          <label style={LBL}>{tr('admin.controlLabel')}</label>
          <input value={draft.label ?? ''} onChange={e => set({ label: e.target.value })} style={BOX} autoFocus />
        </div>
        <div style={{ width: '150px' }}>
          <label style={LBL}>{tr('admin.controlType')}</label>
          <select value={type} onChange={e => set({ type: e.target.value as StripControlType })} style={BOX}>
            {STRIP_CONTROL_TYPES.map(t => (
              <option key={t.type} value={t.type}>{tr(t.labelKey) || t.fallback}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label style={LBL}>{tr('admin.controlScope')}</label>
        <select value={draft.scope || 'global'} onChange={e => set({ scope: e.target.value as 'window' | 'global' })} style={BOX}>
          <option value="global">{tr('admin.controlScopeGlobal')}</option>
          <option value="window">{tr('admin.controlScopeWindow')}</option>
        </select>
        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px', lineHeight: 1.4 }}>{tr('admin.controlScopeHint')}</div>
      </div>

      {withValues && (
        <div>
          <label style={LBL}>{tr('admin.controlValues')}</label>
          <CommaListInput values={draft.values || []} onChange={values => set({ values })} placeholder="CLR, TXI, LUW" />
        </div>
      )}

      {type === 'field' && (
        <div>
          <label style={LBL}>{tr('admin.controlInputMode')}</label>
          <select value={draft.input || 'keyboard'} onChange={e => set({ input: e.target.value as any })} style={BOX}>
            <option value="keyboard">{tr('admin.controlInputKeyboard')}</option>
            <option value="handwriting">{tr('admin.controlInputHandwriting')}</option>
            <option value="both">{tr('admin.controlInputBoth')}</option>
          </select>
        </div>
      )}

      <div>
        <label style={LBL}>{tr('admin.controlDefault')}</label>
        {type === 'flag' ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#cbd5e1' }}>
            <input type="checkbox" checked={draft.defaultValue === true} onChange={e => set({ defaultValue: e.target.checked })} />
            {draft.defaultValue === true ? 'TRUE' : 'FALSE'}
          </label>
        ) : type === 'multiselect' ? (
          <CommaListInput
            values={Array.isArray(draft.defaultValue) ? draft.defaultValue : []}
            onChange={next => set({ defaultValue: next })}
            placeholder={tr('admin.controlDefaultPlaceholder')}
          />
        ) : (
          <input
            value={String(draft.defaultValue ?? '')}
            onChange={e => set({ defaultValue: e.target.value })}
            placeholder={tr('admin.controlDefaultPlaceholder')}
            style={BOX}
          />
        )}
      </div>

      {/* ── עיצוב מותנה על ערך השדה ── */}
      <div style={{ borderTop: '1px dashed #1e293b', paddingTop: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '11px', color: '#fbbf24' }}>{tr('admin.controlConditionalStyle')}</span>
          <button
            onClick={() => set({ styles: [...(draft.styles || []), { id: sgGenId(), match: '', bg: '#1d4ed8', text: '#ffffff' }] })}
            style={{ padding: '2px 8px', background: '#334155', color: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}
          >+ {tr('shared.add')}</button>
        </div>
        <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px' }}>{tr('admin.controlStyleMatchHint')}</div>
        {(draft.styles || []).map(rule => (
          <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
            <input
              value={rule.match}
              onChange={e => set({ styles: (draft.styles || []).map(s => s.id === rule.id ? { ...s, match: e.target.value } : s) })}
              placeholder={tr('admin.controlStyleMatch')}
              style={{ ...BOX, flex: 1, minWidth: 0 }}
            />
            <input type="color" value={rule.bg || '#1d4ed8'} title={tr('admin.backgroundColor')}
              onChange={e => set({ styles: (draft.styles || []).map(s => s.id === rule.id ? { ...s, bg: e.target.value } : s) })}
              style={{ width: '26px', height: '24px', padding: '1px', border: 'none', borderRadius: '3px', cursor: 'pointer', flexShrink: 0 }} />
            <input type="color" value={rule.text || '#ffffff'} title={tr('admin.textColor')}
              onChange={e => set({ styles: (draft.styles || []).map(s => s.id === rule.id ? { ...s, text: e.target.value } : s) })}
              style={{ width: '26px', height: '24px', padding: '1px', border: 'none', borderRadius: '3px', cursor: 'pointer', flexShrink: 0 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px', color: '#94a3b8', flexShrink: 0 }} title={tr('admin.enableBlinking')}>
              <input type="checkbox" checked={!!rule.blink}
                onChange={e => set({ styles: (draft.styles || []).map(s => s.id === rule.id ? { ...s, blink: e.target.checked } : s) })} />⚡
            </label>
            <button onClick={() => set({ styles: (draft.styles || []).filter(s => s.id !== rule.id) })}
              style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '11px', flexShrink: 0 }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * מודל להגדרת שדה - יצירה או עריכה. שומר לקטלוג, ולכן השינוי חל **בכל מקום**
 * שבו השדה מוצב: משבצת בסטריפ, עמודה במוד הטבלה, ושדה בשאילתא.
 */
export const StripFieldDialog = ({ initial, onClose, onSaved }: {
  initial?: StripControl | null;
  onClose: () => void;
  onSaved?: (field: StripControl) => void;
}) => {
  const [draft, setDraft] = useState<Partial<StripControl>>(
    initial || { label: '', type: 'field', scope: 'global', input: 'keyboard', values: [], styles: [] }
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const saved = initial?.id
        ? await updateStripField({ ...(initial as StripControl), ...draft } as StripControl)
        : await createStripField(draft);
      if (!saved) { alert(tr('admin.fieldSaveFailed')); return; }
      onSaved?.(saved);
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 10060, display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0a1628', border: '1px solid #78350f', borderRadius: '12px', padding: '18px', width: 'min(92vw, 460px)', maxHeight: '85vh', overflowY: 'auto', color: '#e2e8f0' }}>
        <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#fbbf24', marginBottom: '12px' }}>
          {initial?.id ? tr('admin.editField') : tr('admin.newField')}
        </div>
        <StripFieldForm draft={draft} onChange={setDraft} />
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', background: 'transparent', border: '1px solid #334155', borderRadius: '6px', color: '#94a3b8', cursor: 'pointer', fontSize: '13px' }}>{tr('shared.cancel')}</button>
          <button onClick={save} disabled={saving || !String(draft.label || '').trim()}
            style={{ padding: '7px 20px', background: String(draft.label || '').trim() ? '#b45309' : '#334155', border: 'none', borderRadius: '6px', color: 'white', cursor: String(draft.label || '').trim() ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 'bold' }}>
            {saving ? tr('shared.saving') : tr('shared.save')}
          </button>
        </div>
      </div>
    </div>
  );
};

/** תג קצר שמתאר שדה מהקטלוג: סוג + היקף. משמש בשני העורכים */
export const StripFieldBadge = ({ field }: { field: StripControl }) => (
  <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
    <span style={{ fontSize: '10px', color: '#cbd5e1', background: '#1e293b', borderRadius: '3px', padding: '1px 5px', whiteSpace: 'nowrap' }}>
      {tr(STRIP_CONTROL_TYPES.find(t => t.type === field.type)?.labelKey || '') || field.type}
    </span>
    <span style={{ fontSize: '10px', color: field.scope === 'global' ? '#86efac' : '#fcd34d', background: field.scope === 'global' ? '#14532d' : '#78350f', borderRadius: '3px', padding: '1px 5px', whiteSpace: 'nowrap' }}>
      {field.scope === 'global' ? tr('admin.controlScopeGlobal') : tr('admin.controlScopeWindow')}
    </span>
  </span>
);

const newRef = (fieldKey: string): StripControlRef => ({ id: sgGenId(), fieldKey });

/**
 * ה**הצבה** של שדות במשבצת: אילו שדות מהקטלוג מוצגים כאן, באיזה סדר (גרירה),
 * ובאיזה רוחב. ההגדרה עצמה נערכת בקטלוג ומשותפת עם מוד הטבלה.
 * הגרירה ב-Pointer Events בלבד - העמדה היא מסך מגע (CLAUDE.md §גרירה).
 */
export const StripControlsEditor = ({ controls, onChange }: {
  controls: StripControlRef[];
  onChange: (next: StripControlRef[]) => void;
}) => {
  const catalog = useStripFieldCatalog();
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialogFor, setDialogFor] = useState<{ mode: 'new' | 'edit'; field?: StripControl } | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  const fieldOf = (key: string) => catalog.find(f => f.key === key) || null;
  const update = (id: string, changes: Partial<StripControlRef>) =>
    onChange(controls.map(c => (c.id === id ? { ...c, ...changes } : c)));
  const remove = (id: string) => onChange(controls.filter(c => c.id !== id));

  const startDrag = (e: React.PointerEvent, idx: number) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = idx;
    setDragIdx(idx);
    setOverIdx(idx);
  };
  const moveDrag = (e: React.PointerEvent) => {
    if (dragRef.current == null) return;
    // `elementFromPoint` עובד בקואורדינטות המצביע האמיתיות, ולכן נכון גם תחת
    // `zoom: var(--s)` של ה-root
    const row = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-ctl-index]') as HTMLElement | null;
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

  const unplaced = catalog.filter(f => !controls.some(c => c.fieldKey === f.key));

  return (
    <div style={{ marginTop: '10px', borderTop: '1px solid #1e293b', paddingTop: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', gap: '6px' }}>
        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#fbbf24' }}>
          {tr('admin.cellControls')} ({controls.length})
        </span>
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
          {/* הצבת שדה שכבר קיים בקטלוג - כולל כזה שהוגדר במוד הטבלה */}
          <select
            value=""
            onChange={e => { if (e.target.value) { onChange([...controls, newRef(e.target.value)]); e.currentTarget.value = ''; } }}
            style={{ ...BOX, width: 'auto', maxWidth: '170px' }}
          >
            <option value="">{tr('admin.placeExistingField')}</option>
            {unplaced.map(f => <option key={f.key} value={f.key}>{f.label || f.key}</option>)}
          </select>
          <button
            onClick={() => setDialogFor({ mode: 'new' })}
            style={{ padding: '3px 10px', background: '#b45309', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}
          >+ {tr('admin.newField')}</button>
        </div>
      </div>

      {controls.map((c, i) => {
        const field = fieldOf(c.fieldKey);
        const open = openId === c.id;
        return (
          <div
            key={c.id}
            data-ctl-index={i}
            style={{
              marginBottom: '4px', borderRadius: '5px', overflow: 'hidden',
              border: `1px solid ${overIdx === i && dragIdx !== null ? '#f59e0b' : field ? '#334155' : '#7f1d1d'}`,
              background: '#0b1220', opacity: dragIdx === i ? 0.45 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 6px' }}>
              <span
                onPointerDown={e => startDrag(e, i)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                title={tr('admin.dragToOrder')}
                style={{ ...DRAG_HANDLE_STYLE, color: '#64748b', fontSize: '15px', cursor: 'grab', padding: '0 2px', flexShrink: 0 }}
              >⠿</span>

              {field ? (
                <>
                  <span style={{ flex: 1, minWidth: 0, fontSize: '12px', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{field.label || field.key}</span>
                  <StripFieldBadge field={field} />
                  <button onClick={() => setDialogFor({ mode: 'edit', field })} title={tr('admin.editField')}
                    style={{ background: 'transparent', border: 'none', color: '#fbbf24', cursor: 'pointer', fontSize: '12px', flexShrink: 0 }}>✎</button>
                </>
              ) : (
                // הפניה לשדה שנמחק מהקטלוג: לא נעלמת בשקט, כדי שהמנהל יבחין ויסיר
                <span style={{ flex: 1, fontSize: '11px', color: '#fca5a5' }}>{tr('admin.fieldMissing', { key: c.fieldKey })}</span>
              )}

              <button onClick={() => setOpenId(open ? null : c.id)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '12px', flexShrink: 0 }}>{open ? '▲' : '▼'}</button>
              <button onClick={() => remove(c.id)} style={{ background: '#7f1d1d', border: 'none', borderRadius: '3px', color: 'white', cursor: 'pointer', fontSize: '10px', padding: '2px 5px', flexShrink: 0 }}>✕</button>
            </div>

            {/* מה שמקומי ל**הצבה** הזו בלבד. ההגדרה עצמה נערכת בקטלוג (✎) */}
            {open && (
              <div style={{ padding: '6px 8px 8px', background: '#0f172a', borderTop: '1px solid #1e293b', display: 'flex', gap: '7px', alignItems: 'flex-end' }}>
                <div style={{ width: '80px' }}>
                  <label style={LBL}>{tr('admin.controlWidth')}</label>
                  <input type="number" min={1} max={12} value={c.flex ?? 1} onChange={e => update(c.id, { flex: Number(e.target.value) || 1 })} style={BOX} />
                </div>
                <div style={{ width: '90px' }}>
                  <label style={LBL}>{tr('admin.fontSize')}</label>
                  <input type="number" min={7} max={24} value={c.fontSize ?? 11} onChange={e => update(c.id, { fontSize: Number(e.target.value) || 11 })} style={BOX} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#94a3b8', paddingBottom: '5px' }}>
                  <input type="checkbox" checked={!!c.bold} onChange={e => update(c.id, { bold: e.target.checked })} /><b>B</b>
                </label>
                {/* מיקום חופשי נקבע בגרירת הפקד בתוך המשבצת. כאן רק ההיפוך:
                    החזרה לשורת הפקדים, כדי שגרירה שגויה תהיה הפיכה */}
                {isFreePlacement(c) ? (
                  <button
                    onClick={() => update(c.id, { x: undefined, y: undefined, w: undefined })}
                    style={{ padding: '4px 10px', background: '#334155', color: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', marginBottom: '4px', whiteSpace: 'nowrap' }}
                  >{tr('admin.resetPlacement')}</button>
                ) : (
                  <span style={{ fontSize: '10px', color: '#64748b', paddingBottom: '6px' }}>{tr('admin.dragInCell')}</span>
                )}
                <span style={{ fontSize: '10px', color: '#64748b', paddingBottom: '6px' }}>{tr('admin.placementOnlyHint')}</span>
              </div>
            )}
          </div>
        );
      })}

      {controls.length === 0 && (
        <div style={{ fontSize: '11px', color: '#475569', textAlign: 'center', padding: '10px 0' }}>{tr('admin.noControlsInCell')}</div>
      )}

      {dialogFor && (
        <StripFieldDialog
          initial={dialogFor.mode === 'edit' ? dialogFor.field : null}
          onClose={() => setDialogFor(null)}
          onSaved={f => { if (dialogFor.mode === 'new') onChange([...controls, newRef(f.key)]); }}
        />
      )}
    </div>
  );
};

export default StripControlsEditor;
