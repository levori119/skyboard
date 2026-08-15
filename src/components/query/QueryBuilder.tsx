import { tr } from '../../i18n/tr';
import React, { useState, useEffect } from 'react';
import { API_URL } from '../../config';
import type { QGroup, QLeaf, QNode, QCompare, QOperator } from '../../types';
import { Q_TEXT_OPS, Q_BOOL_OPS, Q_TIME_OPS, Q_PRESET_OPS, Q_OPERATOR_LABELS, qGenId, emptyQGroup, hasConditions, getQFields, subscribeQFields } from '../../utils/queryBuilder';

/**
 * שדות השאילתא: הקבועים + הפקדים ה**גלובליים** שהמנהל הגדיר בתבניות.
 * הרשימה נרשמת בזמן ריצה (`setStripControlRegistry`), ולכן היא נקראת דרך
 * מנוי ולא כקבוע מיובא - אחרת פקד חדש לא היה מופיע עד רענון הדף.
 */
const useQFields = () => React.useSyncExternalStore(subscribeQFields, getQFields, getQFields);

export const QBuilderCtx = React.createContext<{ presetNames: string[] }>({ presetNames: [] });

// ─── רשימת העמדות לתפריט ──────────────────────────────────────────────────────
// "נמצא בעמדה" הוא בחירה מתפריט ולא הקלדת שם, ולכן כל בונה שאילתות במסך צריך
// את רשימת העמדות. חלק מהם (השאילתא הכללית, תאי חלון הפ"מים) לא מקבלים אותה
// כ-prop, ולכן היא נטענת כאן פעם אחת ומשותפת לכולם - במקום לחווט אותה דרך
// שרשרת ה-props של כל מסך בנפרד.
let cachedPresetNames: string[] | null = null;
let presetNamesInFlight: Promise<string[]> | null = null;

function fetchPresetNames(): Promise<string[]> {
  if (cachedPresetNames) return Promise.resolve(cachedPresetNames);
  if (!presetNamesInFlight) {
    presetNamesInFlight = fetch(`${API_URL}/workstation-presets`)
      .then(r => (r.ok ? r.json() : []))
      .then((list: any) => {
        const names = (Array.isArray(list) ? list : []).map((p: any) => p?.name).filter(Boolean);
        if (names.length) cachedPresetNames = names;
        return names;
      })
      .catch(() => [])
      .finally(() => { presetNamesInFlight = null; });
  }
  return presetNamesInFlight;
}

/** הרשימה שנמסרה כ-prop גוברת; בלעדיה נטענת רשימת העמדות מהשרת */
export function usePresetNames(provided?: string[]): string[] {
  const hasProvided = !!provided && provided.length > 0;
  const [names, setNames] = useState<string[]>(hasProvided ? provided! : (cachedPresetNames || []));
  useEffect(() => {
    if (hasProvided) { setNames(provided!); return; }
    let alive = true;
    fetchPresetNames().then(n => { if (alive && n.length) setNames(n); });
    return () => { alive = false; };
  }, [hasProvided ? provided!.join('|') : '']);
  return names;
}

// --- Query Builder Components ---
const QLeafEditor = ({ leaf, onUpdate, onDelete }: { leaf: QLeaf; onUpdate: (l: QLeaf) => void; onDelete: () => void }) => {
  const ctxPresetNames = React.useContext(QBuilderCtx).presetNames;
  const presetNames = usePresetNames(ctxPresetNames);
  const qFields = useQFields();
  const fieldDef = qFields.find(f => f.key === leaf.field) || qFields[0];
  const isTime = fieldDef.ftype === 'time';
  const typeOps = fieldDef.ftype === 'bool' ? Q_BOOL_OPS
    : isTime ? Q_TIME_OPS
    : fieldDef.ftype === 'preset_select' ? Q_PRESET_OPS
    : Q_TEXT_OPS;
  // שאילתא שמורה יכולה להחזיק אופרטור שאינו ברשימה של סוג השדה (למשל "מכיל"
  // על שדה שהפך לשדה זמן). מוסיפים אותו לרשימה במקום להציג בורר ריק - כדי
  // שמה שמוצג יהיה מה שהתנאי באמת עושה.
  const ops = typeOps.some(o => o.key === leaf.compare)
    ? typeOps
    : [...typeOps, Q_TEXT_OPS.find(o => o.key === leaf.compare) || { key: leaf.compare, label: leaf.compare }];
  // "כבר עבר" הוא תנאי שלם בפני עצמו - אין מה להקליד אחריו
  const needsValue = leaf.compare !== 'empty' && leaf.compare !== 'not_empty' && leaf.compare !== 'passed';
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
        const fd = qFields.find(f => f.key === e.target.value) || qFields[0];
        const boolDefault = (e.target.value === 'airborne') ? 'באוויר' : 'כן';
        const defaultVal = fd.ftype === 'bool' ? boolDefault : '';
        const defaultCmp: QCompare = fd.ftype === 'bool' ? 'eq'
          : fd.ftype === 'preset_select' ? 'in'
          : fd.ftype === 'time' ? 'lt'
          : 'contains';
        onUpdate({ ...leaf, field: e.target.value, compare: defaultCmp, value: defaultVal });
      }}
        style={{ padding: '4px 6px', background: '#1e293b', color: '#60a5fa', border: '1px solid #3b82f6', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}>
        {qFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>

      <select value={leaf.compare} onChange={e => onUpdate({ ...leaf, compare: e.target.value as QCompare })}
        style={{ padding: '4px 6px', background: '#1e293b', color: '#a78bfa', border: '1px solid #6d28d9', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}>
        {ops.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>

      {needsValue && (
        isPresetSelect ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflowY: 'auto', padding: '4px 6px', background: '#1e293b', border: '1px solid #475569', borderRadius: '4px', minWidth: '150px' }}>
            {presetNames.length === 0 && (
              <span style={{ color: '#64748b', fontSize: '12px' }}>{tr('query.noWorkstationsAvailable')}</span>
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
              <option value="באוויר">{tr('query.airborne')}</option>
              <option value="קרקע">{tr('query.ground')}</option>
            </select>
          ) : (
            <select value={leaf.value || 'כן'} onChange={e => onUpdate({ ...leaf, value: e.target.value })}
              style={{ padding: '4px 6px', background: '#1e293b', color: 'white', border: '1px solid #475569', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}>
              <option value="כן">{tr('query.yes')}</option>
              <option value="לא">{tr('query.no')}</option>
            </select>
          )
        ) : isTime ? (
          // שדה זמן: הערך הוא **דקות מעכשיו**, לא שעה. "פחות מ-15" = נוחת בעוד
          // פחות מרבע שעה, ונשאר נכון בכל רגע שבו החלון מתרענן.
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input type="number" inputMode="numeric" min={0} value={leaf.value}
              onChange={e => onUpdate({ ...leaf, value: e.target.value })}
              placeholder="15"
              style={{ padding: '4px 8px', background: '#1e293b', color: 'white', border: '1px solid #475569', borderRadius: '4px', fontSize: '13px', width: '70px' }} />
            <span style={{ color: '#94a3b8', fontSize: '12px', whiteSpace: 'nowrap' }}>{tr('query.minutesFromNow')}</span>
          </span>
        ) : (
          <input type="text" value={leaf.value} onChange={e => onUpdate({ ...leaf, value: e.target.value })}
            placeholder={leaf.compare === 'in' || leaf.compare === 'not_in' ? 'ערך1, ערך2, ...' : 'ערך...'}
            style={{ padding: '4px 8px', background: '#1e293b', color: 'white', border: '1px solid #475569', borderRadius: '4px', fontSize: '13px', width: '110px', direction: 'rtl' }} />
        )
      )}
      <button onClick={onDelete} title={tr('query.deleteCondition')} style={{ padding: '2px 8px', background: '#450a0a', color: '#fca5a5', border: '1px solid #b91c1c', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', marginRight: 'auto', alignSelf: 'center' }}>✕</button>
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
        <button onClick={addLeaf} style={{ padding: '4px 10px', background: '#052e16', color: '#86efac', border: '1px solid #16a34a', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>{tr('query.condition')}</button>
        <button onClick={addGroup} style={{ padding: '4px 10px', background: '#1e1b4b', color: '#c4b5fd', border: '1px solid #7c3aed', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>{tr('query.group')}</button>
        {!isRoot && onDelete && (
          <button onClick={onDelete} style={{ padding: '4px 8px', background: '#450a0a', color: '#fca5a5', border: '1px solid #b91c1c', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>{tr('query.group2')}</button>
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
            🔍 {label} {isActive && <span style={{ fontSize: '11px', color: '#4ade80', fontWeight: 'normal' }}>{tr('query.active')} {group.children.length} {tr('shared.conditions')}</span>}
          </span>
          <button onClick={addCondition}
            style={{ padding: '5px 14px', background: '#052e16', color: '#86efac', border: '1px solid #16a34a', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
            {tr('query.addCondition')}
          </button>
        </div>
        <QGroupEditor group={group} isRoot onUpdate={handleUpdate} />
      </div>
    </QBuilderCtx.Provider>
  );
};

