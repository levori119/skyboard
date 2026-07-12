import { tr } from '../../i18n/tr';
import React, { useState, useEffect } from 'react';
import type { QGroup, QLeaf, QNode, QCompare, QOperator } from '../../types';
import { Q_FIELDS, Q_TEXT_OPS, Q_BOOL_OPS, Q_OPERATOR_LABELS, qGenId, emptyQGroup, hasConditions } from '../../utils/queryBuilder';

export const QBuilderCtx = React.createContext<{ presetNames: string[] }>({ presetNames: [] });

// --- Query Builder Components ---
const QLeafEditor = ({ leaf, onUpdate, onDelete }: { leaf: QLeaf; onUpdate: (l: QLeaf) => void; onDelete: () => void }) => {
  const { presetNames } = React.useContext(QBuilderCtx);
  const fieldDef = Q_FIELDS.find(f => f.key === leaf.field) || Q_FIELDS[0];
  const ops = fieldDef.ftype === 'bool' ? Q_BOOL_OPS : Q_TEXT_OPS;
  const needsValue = leaf.compare !== 'empty' && leaf.compare !== 'not_empty';
  const isPresetSelect = fieldDef.ftype === 'preset_select';

  const selectedNames = (leaf.value || '').split(',').map((v: string) => v.trim()).filter(Boolean);
  const togglePreset = (name: string) => {
    const next = selectedNames.includes(name)
      ? selectedNames.filter((n: string) => n !== name)
      : [...selectedNames, name];
    onUpdate({ ...leaf, value: next.join(',') });
  };

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '6px 8px', flexWrap: 'wrap', direction: 'rtl' }}>
      <select value={leaf.field} onChange={e => {
        const fd = Q_FIELDS.find(f => f.key === e.target.value) || Q_FIELDS[0];
        const boolDefault = (e.target.value === 'airborne') ? 'באוויר' : 'כן';
        const defaultVal = fd.ftype === 'bool' ? boolDefault : '';
        const defaultCmp: QCompare = fd.ftype === 'bool' ? 'eq' : fd.ftype === 'preset_select' ? 'in' : 'contains';
        onUpdate({ ...leaf, field: e.target.value, compare: defaultCmp, value: defaultVal });
      }}
        style={{ padding: '4px 6px', background: '#1e293b', color: '#60a5fa', border: '1px solid #3b82f6', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}>
        {Q_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>

      {!isPresetSelect && (
        <select value={leaf.compare} onChange={e => onUpdate({ ...leaf, compare: e.target.value as QCompare })}
          style={{ padding: '4px 6px', background: '#1e293b', color: '#a78bfa', border: '1px solid #6d28d9', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}>
          {ops.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      )}

      {needsValue && (
        isPresetSelect ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflowY: 'auto', padding: '4px 6px', background: '#1e293b', border: '1px solid #475569', borderRadius: '4px', minWidth: '150px' }}>
            {presetNames.length === 0 && (
              <span style={{ color: '#64748b', fontSize: '12px' }}>{tr("אין עמדות זמינות")}</span>
            )}
            {presetNames.map(name => (
              <label key={name} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', direction: 'rtl', fontSize: '13px', color: selectedNames.includes(name) ? '#60a5fa' : '#cbd5e1', whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={selectedNames.includes(name)}
                  onChange={() => togglePreset(name)}
                  style={{ accentColor: '#3b82f6', cursor: 'pointer' }}
                />
                {name}
              </label>
            ))}
          </div>
        ) : fieldDef.ftype === 'bool' ? (
          leaf.field === 'airborne' ? (
            <select value={leaf.value || 'באוויר'} onChange={e => onUpdate({ ...leaf, value: e.target.value })}
              style={{ padding: '4px 6px', background: '#1e293b', color: 'white', border: '1px solid #475569', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}>
              <option value="באוויר">{tr("✈ באוויר")}</option>
              <option value="קרקע">{tr("⬛ קרקע")}</option>
            </select>
          ) : (
            <select value={leaf.value || 'כן'} onChange={e => onUpdate({ ...leaf, value: e.target.value })}
              style={{ padding: '4px 6px', background: '#1e293b', color: 'white', border: '1px solid #475569', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}>
              <option value="כן">{tr("✅ כן")}</option>
              <option value="לא">{tr("❌ לא")}</option>
            </select>
          )
        ) : (
          <input type="text" value={leaf.value} onChange={e => onUpdate({ ...leaf, value: e.target.value })}
            placeholder={leaf.compare === 'in' || leaf.compare === 'not_in' ? 'ערך1, ערך2, ...' : 'ערך...'}
            style={{ padding: '4px 8px', background: '#1e293b', color: 'white', border: '1px solid #475569', borderRadius: '4px', fontSize: '13px', width: '110px', direction: 'rtl' }} />
        )
      )}
      <button onClick={onDelete} title={tr("מחק תנאי")} style={{ padding: '2px 8px', background: '#450a0a', color: '#fca5a5', border: '1px solid #b91c1c', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', marginRight: 'auto', alignSelf: 'center' }}>✕</button>
    </div>
  );
};

export const QGroupEditor = ({ group, onUpdate, onDelete, isRoot = false, depth = 0 }: {
  group: QGroup; onUpdate: (g: QGroup) => void; onDelete?: () => void; isRoot?: boolean; depth?: number;
}) => {
  const addLeaf = () => {
    const leaf: QLeaf = { id: qGenId(), type: 'leaf', field: 'task', compare: 'contains', value: '' };
    onUpdate({ ...group, children: [...group.children, leaf] });
  };
  const addGroup = () => {
    onUpdate({ ...group, children: [...group.children, emptyQGroup()] });
  };
  const updateChild = (updated: QNode) => {
    onUpdate({ ...group, children: group.children.map(c => c.id === updated.id ? updated : c) });
  };
  const deleteChild = (id: string) => {
    onUpdate({ ...group, children: group.children.filter(c => c.id !== id) });
  };

  const borderColor = depth === 0 ? '#2563eb' : depth === 1 ? '#7c3aed' : '#059669';
  return (
    <div style={{ borderRight: `3px solid ${borderColor}`, paddingRight: '12px', marginRight: depth > 0 ? '8px' : '0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', direction: 'rtl' }}>
        <select value={group.operator} onChange={e => onUpdate({ ...group, operator: e.target.value as QOperator })}
          style={{ padding: '5px 10px', background: '#1e3a5f', color: '#93c5fd', border: `1px solid ${borderColor}`, borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>
          {(Object.keys(Q_OPERATOR_LABELS) as QOperator[]).map(op => (
            <option key={op} value={op}>{Q_OPERATOR_LABELS[op]}</option>
          ))}
        </select>
        <button onClick={addLeaf} style={{ padding: '4px 10px', background: '#052e16', color: '#86efac', border: '1px solid #16a34a', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>{tr("+ תנאי")}</button>
        <button onClick={addGroup} style={{ padding: '4px 10px', background: '#1e1b4b', color: '#c4b5fd', border: '1px solid #7c3aed', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>{tr("+ קבוצה")}</button>
        {!isRoot && onDelete && (
          <button onClick={onDelete} style={{ padding: '4px 8px', background: '#450a0a', color: '#fca5a5', border: '1px solid #b91c1c', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>{tr("✕ קבוצה")}</button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {group.children.map(child =>
          child.type === 'group' ? (
            <QGroupEditor key={child.id} group={child} onUpdate={updateChild} onDelete={() => deleteChild(child.id)} depth={depth + 1} />
          ) : (
            <QLeafEditor key={child.id} leaf={child as QLeaf} onUpdate={updateChild as any} onDelete={() => deleteChild(child.id)} />
          )
        )}
        {group.children.length === 0 && (
          <div style={{ color: '#475569', fontSize: '12px', padding: '10px', textAlign: 'center', border: '1px dashed #334155', borderRadius: '6px', direction: 'rtl' }}>
            לחץ &quot;+ תנאי&quot; כדי להוסיף תנאי ראשון
          </div>
        )}
      </div>
    </div>
  );
};

export const QueryBuilder = ({ value, onChange, label = 'שאילתת סינון פממים', presetNames = [] }: { value: QGroup | null; onChange: (q: QGroup | null) => void; label?: string; presetNames?: string[] }) => {
  const [group, setGroup] = useState<QGroup>(value || emptyQGroup());

  useEffect(() => {
    if (value) setGroup(value);
    else setGroup(emptyQGroup());
  }, [JSON.stringify(value)]);

  const handleUpdate = (g: QGroup) => { setGroup(g); onChange(hasConditions(g) ? g : null); };
  const addCondition = () => {
    const leaf: QLeaf = { id: qGenId(), type: 'leaf', field: 'task', compare: 'contains', value: '' };
    const updated = { ...group, children: [...group.children, leaf] };
    setGroup(updated);
    onChange(hasConditions(updated) ? updated : null);
  };

  const isActive = hasConditions(group);

  return (
    <QBuilderCtx.Provider value={{ presetNames }}>
      <div style={{ marginTop: '15px', padding: '14px', background: '#1e293b', borderRadius: '8px', border: `1px solid ${isActive ? '#2563eb' : '#334155'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', direction: 'rtl' }}>
          <span style={{ color: isActive ? '#60a5fa' : '#94a3b8', fontSize: '14px', fontWeight: 'bold' }}>
            🔍 {label} {isActive && <span style={{ fontSize: '11px', color: '#4ade80', fontWeight: 'normal' }}>(פעיל — {group.children.length} תנאים)</span>}
          </span>
          <button onClick={addCondition}
            style={{ padding: '5px 14px', background: '#052e16', color: '#86efac', border: '1px solid #16a34a', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
            + הוסף תנאי
          </button>
        </div>
        <QGroupEditor group={group} isRoot onUpdate={handleUpdate} />
      </div>
    </QBuilderCtx.Provider>
  );
};

