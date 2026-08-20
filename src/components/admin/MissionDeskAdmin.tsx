// ניהול "דסק משימה כללי" במסך הניהול:
//   · MissionDeskAdmin — tab הדסקים: יצירת דסק, שירותים (אמצעים/טקסט חופשי/טבלה חכמה),
//     ועורך פריסה BSP (פיצול אזורים, גרירת שירות לאזור) — אותה תבנית כמו חלון סטריפים.
//   · MissionDeskPresetConfig — בעורך העמדה: בחירת דסק + הגדרת שיתוף פר-שירות.
// קובץ נפרד מ-managers.tsx (שכבר ענק) — ראה תכנית ARCH.
import { useEffect, useState } from 'react';
import { tr } from '../../i18n/tr';
import { API_URL } from '../../config';
import { customConfirm } from '../shared/ConfirmModal';
import type {
  MDNode, MDLeaf, MissionDesk, MissionDeskService,
  MDTableConfig, MDFreeTextConfig, MDImageConfig, MDLabelConfig, MDColumnType, MDSummaryKind, MDRuleOp,
  MDStripsConfig, MDPresetMapConfig, MDPresetMapSettings,
} from '../../types/missionDesk';
import { mdEmptyMapSettings } from '../../types/missionDesk';
import {
  mdDefaultLeaf, mdSplit, mdRemove, mdUpdate, mdGenId,
  mdMapServices, mdMapSettings, mdMissingMapServices, mdStripsMapServiceId, mdPruneMapConfig,
} from '../../utils/missionDesk';
import { AdminSection, AdminSections, AdminSectionsToolbar } from './AdminSection';
import MissionDeskView from '../missiondesk/MissionDeskView';
import { ImageConfigEditor, RichLabelEditor } from '../missiondesk/configEditors';

type DeskFull = MissionDesk & { services: MissionDeskService[] };

const S = {
  input: { background: '#1e293b', border: '1px solid #475569', borderRadius: 6, color: '#f1f5f9', padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' } as React.CSSProperties,
  btn: (bg: string): React.CSSProperties => ({ padding: '7px 14px', background: bg, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 'bold' }),
  ghost: { padding: '6px 12px', background: 'none', border: '1px dashed #475569', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 12 } as React.CSSProperties,
  label: { display: 'block', margin: '10px 0 4px', color: '#94a3b8', fontSize: 12, fontWeight: 'bold' } as React.CSSProperties,
};

const SERVICE_META: Record<string, { icon: string; nameKey: string }> = {
  buttons: { icon: '🎛', nameKey: 'missiondesk.svcButtons' },
  freetext: { icon: '✍️', nameKey: 'missiondesk.svcFreetext' },
  table: { icon: '📊', nameKey: 'missiondesk.svcTable' },
  image: { icon: '🖼', nameKey: 'missiondesk.svcImage' },
  label: { icon: '🔤', nameKey: 'missiondesk.svcLabel' },
  map: { icon: '🗺', nameKey: 'missiondesk.svcMap' },
  strips: { icon: '✈', nameKey: 'missiondesk.svcStrips' },
};

// ─────────────────────────────────────────────────────────────────────────────
// בונה נוסחאות ויזואלי — שדה → אופרטור → שדה וכן הלאה (בלי להקליד מפתחות).
// הנוסחה נשמרת כמחרוזת מפתחות ("c1a2*c9f3") — אותו פורמט של evalFormula.
// נוסחה ידנית מורכבת (סוגריים/מספרים) שלא מתפרקת לרצף פשוט — נערכת כטקסט.
// ─────────────────────────────────────────────────────────────────────────────
function FormulaBuilder({ formula, numericCols, onChange }: {
  formula: string;
  numericCols: { key: string; title: string }[];
  onChange: (f: string) => void;
}) {
  const keys = numericCols.map(c => c.key);
  const tokens = formula.split(/([+\-*/])/).map(t => t.trim()).filter(Boolean);
  const isSimple = tokens.every((t, i) => i % 2 === 0 ? keys.includes(t) : '+-*/'.includes(t))
    && (tokens.length === 0 || tokens.length % 2 === 1);

  if (!numericCols.length) {
    return <span style={{ fontSize: 12, color: '#f59e0b', flex: 1 }}>{tr('missiondesk.formulaNeedNumeric')}</span>;
  }
  if (!isSimple) {
    // נוסחה מתקדמת — עריכה חופשית
    return <input value={formula} dir="ltr" onChange={e => onChange(e.target.value)} style={{ ...S.input, flex: 1, fontFamily: 'monospace' }} />;
  }

  const fieldSelect = (idx: number) => (
    <select key={idx} value={tokens[idx] || ''}
      onChange={e => { const next = [...tokens]; next[idx] = e.target.value; onChange(next.join('')); }}
      style={S.input}>
      {tokens[idx] ? null : <option value="">{tr('missiondesk.formulaField')}</option>}
      {numericCols.map(c => <option key={c.key} value={c.key}>{c.title || c.key}</option>)}
    </select>
  );
  const opSelect = (idx: number) => (
    <select key={idx} value={tokens[idx]}
      onChange={e => { const next = [...tokens]; next[idx] = e.target.value; onChange(next.join('')); }}
      style={{ ...S.input, width: 52, textAlign: 'center', fontFamily: 'monospace' }}>
      <option value="+">+</option><option value="-">−</option>
      <option value="*">×</option><option value="/">÷</option>
    </select>
  );

  return (
    // dir=ltr — סדר התצוגה זהה לסדר החישוב (a-b ולא b-a)
    <span dir="ltr" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', flex: 1 }}>
      {tokens.length === 0 ? fieldSelect(0) : tokens.map((_, i) => i % 2 === 0 ? fieldSelect(i) : opSelect(i))}
      {tokens.length > 0 && tokens.length % 2 === 1 && (
        <button type="button" onClick={() => onChange([...tokens, '+', keys[0]].join(''))}
          title={tr('missiondesk.formulaAddTerm')}
          style={{ ...S.ghost, padding: '4px 8px' }}>＋</button>
      )}
      {tokens.length >= 3 && (
        <button type="button" onClick={() => onChange(tokens.slice(0, -2).join(''))}
          title={tr('missiondesk.formulaRemoveTerm')}
          style={{ ...S.ghost, padding: '4px 8px', color: '#f87171' }}>−</button>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// עורך קונפיגורציה לשירות טבלה חכמה
// ─────────────────────────────────────────────────────────────────────────────
function TableConfigEditor({ config, onChange }: { config: MDTableConfig; onChange: (c: MDTableConfig) => void }) {
  const cols = config.columns || [];
  const computed = config.computed || [];
  const rules = config.rules || [];
  const summary = config.summary || {};
  const allKeys = [...cols, ...computed];

  const addCol = () => onChange({
    ...config,
    columns: [...cols, { key: `c${mdGenId().slice(0, 4)}`, title: cols.length === 0 ? tr('missiondesk.entityColDefault') : '', type: 'text' }],
  });

  return (
    <div>
      <div style={S.label}>{tr('missiondesk.cfgColumns')}</div>
      {cols.map((c, i) => (
        <div key={c.key} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace', minWidth: 40 }}>{c.key}</span>
          <input value={c.title} placeholder={tr('missiondesk.colTitle')} onChange={e => onChange({ ...config, columns: cols.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} style={{ ...S.input, flex: 1, minWidth: 90 }} />
          <select value={c.type} onChange={e => onChange({ ...config, columns: cols.map((x, j) => j === i ? { ...x, type: e.target.value as MDColumnType } : x) })} style={S.input}>
            <option value="text">{tr('missiondesk.colTypeText')}</option>
            <option value="number">{tr('missiondesk.colTypeNumber')}</option>
            <option value="check">{tr('missiondesk.colTypeCheck')}</option>
            <option value="select">{tr('missiondesk.colTypeSelect')}</option>
          </select>
          {c.type === 'select' && (
            // תת-טבלת ערכים — שדה לכל ערך (לא input מופרד-פסיקים: פיצול בכל
            // הקלדה בלע את הפסיק ולא אפשר להוסיף ערך שני)
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', flex: 1, minWidth: 150 }}>
              {(c.options || []).map((opt, oi) => (
                <span key={oi} style={{ display: 'flex', alignItems: 'center', gap: 2, background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '2px 5px' }}>
                  <input value={opt} placeholder={tr('missiondesk.optionValue')} autoFocus={opt === '' && oi === (c.options || []).length - 1}
                    onChange={e => onChange({ ...config, columns: cols.map((x, j) => j === i ? { ...x, options: (x.options || []).map((o, k) => k === oi ? e.target.value : o) } : x) })}
                    style={{ background: 'transparent', border: 'none', color: '#f1f5f9', fontSize: 12, width: 76, outline: 'none' }} />
                  <button onClick={() => onChange({ ...config, columns: cols.map((x, j) => j === i ? { ...x, options: (x.options || []).filter((_, k) => k !== oi) } : x) })}
                    title={tr('missiondesk.removeOption')}
                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>
                </span>
              ))}
              <button onClick={() => onChange({ ...config, columns: cols.map((x, j) => j === i ? { ...x, options: [...(x.options || []), ''] } : x) })}
                style={{ ...S.ghost, padding: '2px 8px', fontSize: 11 }}>➕ {tr('missiondesk.addOption')}</button>
            </div>
          )}
          <select value={summary[c.key] || ''} title={tr('missiondesk.cfgSummary')}
            onChange={e => { const next = { ...summary }; if (e.target.value) next[c.key] = e.target.value as MDSummaryKind; else delete next[c.key]; onChange({ ...config, summary: next }); }}
            style={S.input}>
            <option value="">{tr('missiondesk.summaryNone')}</option>
            <option value="sum">{tr('missiondesk.summarySum')}</option>
            <option value="count">{tr('missiondesk.summaryCount')}</option>
            <option value="avg">{tr('missiondesk.summaryAvg')}</option>
            <option value="min">{tr('missiondesk.summaryMin')}</option>
            <option value="max">{tr('missiondesk.summaryMax')}</option>
          </select>
          {c.type === 'check' && summary[c.key] === 'count' && (
            <select value={c.countWhat || 'v'} title={tr('missiondesk.countWhat')}
              onChange={e => onChange({ ...config, columns: cols.map((x, j) => j === i ? { ...x, countWhat: e.target.value as 'v' | 'x' } : x) })}
              style={S.input}>
              <option value="v">{tr('missiondesk.countV')}</option>
              <option value="x">{tr('missiondesk.countX')}</option>
            </select>
          )}
          <button onClick={() => onChange({ ...config, columns: cols.filter((_, j) => j !== i) })} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>✕</button>
        </div>
      ))}
      <button onClick={addCol} style={S.ghost}>➕ {tr('missiondesk.addColumn')}</button>

      <div style={S.label}>{tr('missiondesk.cfgComputed')}</div>
      {computed.map((c, i) => (
        <div key={c.key} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
          <input value={c.title} placeholder={tr('missiondesk.colTitle')} onChange={e => onChange({ ...config, computed: computed.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} style={{ ...S.input, width: 120 }} />
          <FormulaBuilder
            formula={c.formula}
            numericCols={cols.filter(col => col.type === 'number').map(col => ({ key: col.key, title: col.title }))}
            onChange={f => onChange({ ...config, computed: computed.map((x, j) => j === i ? { ...x, formula: f } : x) })}
          />
          <select value={summary[c.key] || ''} onChange={e => { const next = { ...summary }; if (e.target.value) next[c.key] = e.target.value as MDSummaryKind; else delete next[c.key]; onChange({ ...config, summary: next }); }} style={S.input}>
            <option value="">{tr('missiondesk.summaryNone')}</option>
            <option value="sum">{tr('missiondesk.summarySum')}</option>
            <option value="avg">{tr('missiondesk.summaryAvg')}</option>
            <option value="min">{tr('missiondesk.summaryMin')}</option>
            <option value="max">{tr('missiondesk.summaryMax')}</option>
          </select>
          <button onClick={() => onChange({ ...config, computed: computed.filter((_, j) => j !== i) })} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>✕</button>
        </div>
      ))}
      <button onClick={() => onChange({ ...config, computed: [...computed, { key: `f${mdGenId().slice(0, 4)}`, title: '', formula: '' }] })} style={S.ghost}>➕ {tr('missiondesk.addComputed')}</button>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{tr('missiondesk.formulaExplain')}</div>

      <div style={S.label}>{tr('missiondesk.cfgRules')}</div>
      {rules.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
          <select value={r.column} onChange={e => onChange({ ...config, rules: rules.map((x, j) => j === i ? { ...x, column: e.target.value } : x) })} style={S.input}>
            <option value="" />
            {allKeys.map(c => <option key={c.key} value={c.key}>{c.title || c.key}</option>)}
          </select>
          <select value={r.op} onChange={e => onChange({ ...config, rules: rules.map((x, j) => j === i ? { ...x, op: e.target.value as MDRuleOp } : x) })} style={S.input}>
            <option value="eq">=</option><option value="neq">≠</option>
            <option value="gt">&gt;</option><option value="lt">&lt;</option>
            <option value="gte">≥</option><option value="lte">≤</option>
            <option value="contains">{tr('missiondesk.opContains')}</option>
            <option value="empty">{tr('missiondesk.opEmpty')}</option>
            <option value="notEmpty">{tr('missiondesk.opNotEmpty')}</option>
          </select>
          {r.op !== 'empty' && r.op !== 'notEmpty' && (
            <input value={r.value || ''} placeholder={tr('missiondesk.ruleValue')} onChange={e => onChange({ ...config, rules: rules.map((x, j) => j === i ? { ...x, value: e.target.value } : x) })} style={{ ...S.input, width: 90 }} />
          )}
          <input type="color" value={r.bg || '#7f1d1d'} title={tr('missiondesk.ruleBg')} onChange={e => onChange({ ...config, rules: rules.map((x, j) => j === i ? { ...x, bg: e.target.value } : x) })} style={{ width: 30, height: 28, border: 'none', background: 'none', cursor: 'pointer' }} />
          <label style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 3 }}>
            <input type="checkbox" checked={!!r.blink} onChange={e => onChange({ ...config, rules: rules.map((x, j) => j === i ? { ...x, blink: e.target.checked } : x) })} />
            {tr('missiondesk.ruleBlink')}
          </label>
          <button onClick={() => onChange({ ...config, rules: rules.filter((_, j) => j !== i) })} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>✕</button>
        </div>
      ))}
      <button onClick={() => onChange({ ...config, rules: [...rules, { column: allKeys[0]?.key || '', op: 'eq' }] })} style={S.ghost}>➕ {tr('missiondesk.addRule')}</button>

      <div style={{ display: 'flex', gap: 16, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 5 }}>
          <input type="checkbox" checked={config.allowAddRows !== false} onChange={e => onChange({ ...config, allowAddRows: e.target.checked })} />
          {tr('missiondesk.allowAddRows')}
        </label>
        <label style={{ fontSize: 13, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 5 }}>
          {tr('missiondesk.initialRows')}
          <input type="number" min={0} max={100} value={config.initialRows || 0} onChange={e => onChange({ ...config, initialRows: Number(e.target.value) || 0 })} style={{ ...S.input, width: 64 }} />
        </label>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// עורך קונפיגורציה לשירות טקסט חופשי
// ─────────────────────────────────────────────────────────────────────────────
function FreeTextConfigEditor({ config, onChange }: { config: MDFreeTextConfig; onChange: (c: MDFreeTextConfig) => void }) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <label style={{ fontSize: 13, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 5 }}>
        {tr('missiondesk.cfgTitle')}
        <input value={config.title || ''} onChange={e => onChange({ ...config, title: e.target.value })} style={{ ...S.input, width: 160 }} />
      </label>
      <label style={{ fontSize: 13, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 5 }}>
        <input type="checkbox" checked={!!config.ruled} onChange={e => onChange({ ...config, ruled: e.target.checked })} />
        {tr('missiondesk.cfgRuled')}
      </label>
      {config.ruled && (
        <label style={{ fontSize: 13, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 5 }}>
          {tr('missiondesk.cfgLineGap')}
          <input type="number" min={18} max={80} value={config.lineGap || 34} onChange={e => onChange({ ...config, lineGap: Number(e.target.value) || 34 })} style={{ ...S.input, width: 64 }} />
        </label>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// עורך פריסה (BSP) — פיצול/מחיקה/שיוך שירות, גרירת שירות לאזור
// ─────────────────────────────────────────────────────────────────────────────
function LayoutEditor({ layout, services, onChange }: { layout: MDNode; services: MissionDeskService[]; onChange: (n: MDNode) => void }) {
  const renderNode = (node: MDNode): React.ReactNode => {
    if (node.type === 'leaf') {
      const svc = services.find(s => s.id === node.service_id);
      return (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const sid = Number(e.dataTransfer.getData('md-service-id'));
            if (sid) onChange(mdUpdate(layout, node.id, (n: MDLeaf) => ({ ...n, service_id: sid })));
          }}
          style={{ flex: 1, minWidth: 0, minHeight: 90, background: svc ? '#16324a' : '#0f172a', border: `2px dashed ${svc ? '#0ea5e9' : '#334155'}`, borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8 }}
        >
          <div style={{ fontSize: 13, color: svc ? '#7dd3fc' : '#64748b', fontWeight: 'bold', textAlign: 'center' }}>
            {svc ? `${SERVICE_META[svc.service_type]?.icon || ''} ${svc.name || tr(SERVICE_META[svc.service_type]?.nameKey || '')}` : tr('missiondesk.dropServiceHere')}
          </div>
          <select value={node.service_id ?? ''} onChange={e => onChange(mdUpdate(layout, node.id, (n: MDLeaf) => ({ ...n, service_id: e.target.value ? Number(e.target.value) : null })))} style={{ ...S.input, fontSize: 12, maxWidth: '90%' }}>
            <option value="">{tr('missiondesk.noService')}</option>
            {services.map(s => <option key={s.id} value={s.id}>{SERVICE_META[s.service_type]?.icon} {s.name || tr(SERVICE_META[s.service_type]?.nameKey || '')}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 4 }}>
            <button title={tr('missiondesk.splitH')} onClick={() => onChange(mdSplit(layout, node.id, 'h'))} style={{ ...S.ghost, padding: '2px 8px' }}>⟺</button>
            <button title={tr('missiondesk.splitV')} onClick={() => onChange(mdSplit(layout, node.id, 'v'))} style={{ ...S.ghost, padding: '2px 8px' }}>⇅</button>
            <button title={tr('missiondesk.removeArea')} onClick={() => onChange(mdRemove(layout, node.id))} style={{ ...S.ghost, padding: '2px 8px', color: '#f87171' }}>✕</button>
          </div>
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', flexDirection: node.direction === 'h' ? 'row' : 'column', gap: 6, flex: 1, minWidth: 0, minHeight: 0 }}>
        {node.children.map((child, i) => (
          <div key={child.id} style={{ display: 'flex', flexBasis: `${node.sizes[i] ?? 100 / node.children.length}%`, flexGrow: 0, flexShrink: 1, minWidth: 0, minHeight: 0 }}>
            {renderNode(child)}
          </div>
        ))}
      </div>
    );
  };
  return <div style={{ display: 'flex', minHeight: 300, background: '#0b1120', borderRadius: 10, padding: 8 }}>{renderNode(layout)}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab הדסקים במסך הניהול
// ─────────────────────────────────────────────────────────────────────────────
export function MissionDeskAdmin() {
  const [desks, setDesks] = useState<DeskFull[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [layout, setLayout] = useState<MDNode | null>(null);
  const [configSvc, setConfigSvc] = useState<MissionDeskService | null>(null);
  const [saved, setSaved] = useState(false);

  const selected = desks.find(d => d.id === selectedId) || null;

  const load = async () => {
    try {
      const data = await fetch(`${API_URL}/mission-desks`).then(r => r.json());
      if (Array.isArray(data)) setDesks(data);
    } catch { /* noop */ }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { setLayout(selected?.layout_json || null); setConfigSvc(null); }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const createDesk = async () => {
    if (!newName.trim()) return;
    try {
      const res = await fetch(`${API_URL}/mission-desks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim() }) });
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      setNewName('');
      await load();
      if (d?.id) setSelectedId(d.id);
    } catch {
      alert(tr('missiondesk.serverError'));
    }
  };

  const deleteDesk = async (id: number) => {
    if (!(await customConfirm(tr('missiondesk.confirmDeleteDesk')))) return;
    await fetch(`${API_URL}/mission-desks/${id}`, { method: 'DELETE' });
    if (selectedId === id) setSelectedId(null);
    await load();
  };

  const addService = async (type: 'buttons' | 'freetext' | 'table' | 'image' | 'label' | 'map' | 'strips') => {
    if (!selected) return;
    const defaults =
      type === 'table' ? { columns: [{ key: 'entity', title: tr('missiondesk.entityColDefault'), type: 'text' }], allowAddRows: true, initialRows: 0 }
      : type === 'freetext' ? { ruled: true, lineGap: 34 }
      : type === 'label' ? { text: '', fontSize: 22, align: 'center', color: '#f1f5f9' }
      : {};
    try {
      const res = await fetch(`${API_URL}/mission-desks/${selected.id}/services`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_type: type, name: tr(SERVICE_META[type].nameKey), config: defaults, sort_order: selected.services.length }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      alert(tr('missiondesk.serverError'));
    }
    await load();
  };

  const updateService = async (sid: number, patch: Partial<MissionDeskService>) => {
    await fetch(`${API_URL}/mission-desk-services/${sid}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    await load();
  };

  const deleteService = async (sid: number) => {
    if (!(await customConfirm(tr('missiondesk.confirmDeleteService')))) return;
    await fetch(`${API_URL}/mission-desk-services/${sid}`, { method: 'DELETE' });
    // ניקוי שיוך מהפריסה
    if (layout) {
      const clean = (n: MDNode): MDNode => n.type === 'leaf' ? (n.service_id === sid ? { ...n, service_id: null } : n) : { ...n, children: n.children.map(clean) };
      setLayout(clean(layout));
    }
    await load();
  };

  const saveDesk = async () => {
    if (!selected) return;
    try {
      const res = await fetch(`${API_URL}/mission-desks/${selected.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selected.name, layout_json: layout }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch {
      alert(tr('missiondesk.serverError'));
    }
    await load();
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 18, color: '#f1f5f9' }}>🗂 {tr('missiondesk.adminTitle')}</h2>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* רשימת דסקים */}
        <div style={{ width: 230, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createDesk()} placeholder={tr('missiondesk.newDeskName')} style={{ ...S.input, flex: 1, minWidth: 0 }} />
            <button onClick={createDesk} style={S.btn('#059669')}>＋</button>
          </div>
          {desks.map(d => (
            <div key={d.id} onClick={() => setSelectedId(d.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 4, background: selectedId === d.id ? '#0c2a40' : '#0f172a', border: `1px solid ${selectedId === d.id ? '#0ea5e9' : '#1e293b'}`, color: selectedId === d.id ? '#7dd3fc' : '#e2e8f0', fontSize: 14 }}>
              🗂 <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
              <button onClick={e => { e.stopPropagation(); deleteDesk(d.id); }} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 13 }}>🗑</button>
            </div>
          ))}
          {!desks.length && <div style={{ color: '#64748b', fontSize: 13 }}>{tr('missiondesk.noDesksYet')}</div>}
        </div>

        {/* עריכת דסק */}
        {selected && (
          <div style={{ flex: 1, minWidth: 320 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <input value={selected.name} onChange={e => setDesks(ds => ds.map(d => d.id === selected.id ? { ...d, name: e.target.value } : d))} style={{ ...S.input, fontSize: 16, fontWeight: 'bold', width: 220 }} />
              <button onClick={saveDesk} style={S.btn('#059669')}>💾 {tr('missiondesk.saveDesk')}</button>
              {saved && <span style={{ color: '#4ade80', fontSize: 13 }}>✓ {tr('missiondesk.saved')}</span>}
            </div>

            {/* שירותים */}
            <div style={{ background: '#0f172a', borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 'bold', color: '#94a3b8' }}>{tr('missiondesk.servicesTitle')}</span>
                <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 6 }}>
                  <button onClick={() => addService('buttons')} style={S.ghost}>🎛 {tr('missiondesk.addSvcButtons')}</button>
                  <button onClick={() => addService('freetext')} style={S.ghost}>✍️ {tr('missiondesk.addSvcFreetext')}</button>
                  <button onClick={() => addService('table')} style={S.ghost}>📊 {tr('missiondesk.addSvcTable')}</button>
                  <button onClick={() => addService('image')} style={S.ghost}>🖼 {tr('missiondesk.addSvcImage')}</button>
                  <button onClick={() => addService('label')} style={S.ghost}>🔤 {tr('missiondesk.addSvcLabel')}</button>
                  <button onClick={() => addService('map')} style={S.ghost}>🗺 {tr('missiondesk.addSvcMap')}</button>
                  <button onClick={() => addService('strips')} style={S.ghost}>✈ {tr('missiondesk.addSvcStrips')}</button>
                </span>
              </div>
              {selected.services.map(svc => (
                <div key={svc.id} style={{ marginBottom: 6 }}>
                  <div
                    draggable
                    onDragStart={e => e.dataTransfer.setData('md-service-id', String(svc.id))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1e293b', borderRadius: 8, padding: '7px 10px', cursor: 'grab', border: configSvc?.id === svc.id ? '1px solid #0ea5e9' : '1px solid #334155' }}>
                    <span>{SERVICE_META[svc.service_type]?.icon}</span>
                    <input value={svc.name} onChange={e => setDesks(ds => ds.map(d => d.id === selected.id ? { ...d, services: d.services.map(s => s.id === svc.id ? { ...s, name: e.target.value } : s) } : d))}
                      onBlur={e => updateService(svc.id, { name: e.target.value })}
                      style={{ ...S.input, flex: 1, minWidth: 0, padding: '4px 8px' }} />
                    <span style={{ fontSize: 11, color: '#64748b' }}>{tr(SERVICE_META[svc.service_type]?.nameKey || '')}</span>
                    {svc.service_type !== 'buttons' && (
                      <button onClick={() => setConfigSvc(configSvc?.id === svc.id ? null : svc)} style={{ ...S.ghost, padding: '3px 8px' }}>⚙ {tr('missiondesk.configure')}</button>
                    )}
                    <button onClick={() => deleteService(svc.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>🗑</button>
                  </div>
                  {configSvc?.id === svc.id && (
                    <div style={{ background: '#0b1120', border: '1px solid #1e293b', borderRadius: 8, padding: 12, marginTop: 4 }}>
                      {svc.service_type === 'table' && (
                        <TableConfigEditor
                          config={(svc.config as MDTableConfig) || { columns: [] }}
                          onChange={c => { setDesks(ds => ds.map(d => d.id === selected.id ? { ...d, services: d.services.map(s => s.id === svc.id ? { ...s, config: c } : s) } : d)); }}
                        />
                      )}
                      {svc.service_type === 'freetext' && (
                        <FreeTextConfigEditor
                          config={(svc.config as MDFreeTextConfig) || {}}
                          onChange={c => { setDesks(ds => ds.map(d => d.id === selected.id ? { ...d, services: d.services.map(s => s.id === svc.id ? { ...s, config: c } : s) } : d)); }}
                        />
                      )}
                      {svc.service_type === 'image' && (
                        <ImageConfigEditor
                          config={(svc.config as MDImageConfig) || {}}
                          onChange={c => { setDesks(ds => ds.map(d => d.id === selected.id ? { ...d, services: d.services.map(s => s.id === svc.id ? { ...s, config: c } : s) } : d)); }}
                        />
                      )}
                      {svc.service_type === 'map' && (
                        <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>🗺 {tr('missiondesk.mapPickedPerStation')}</div>
                      )}
                      {svc.service_type === 'strips' && (
                        <StripsConfigEditor
                          config={(svc.config as MDStripsConfig) || {}}
                          mapServices={mdMapServices(selected.services)}
                          onChange={c => { setDesks(ds => ds.map(dd => dd.id === selected.id ? { ...dd, services: dd.services.map(s => s.id === svc.id ? { ...s, config: c } : s) } : dd)); }}
                        />
                      )}
                      {svc.service_type === 'label' && (
                        <div style={{ height: 200, background: '#0f172a', borderRadius: 8, border: '1px solid #334155' }}>
                          <RichLabelEditor
                            config={(svc.config as MDLabelConfig) || {}}
                            minHeight={80}
                            onChange={c => { setDesks(ds => ds.map(d => d.id === selected.id ? { ...d, services: d.services.map(s => s.id === svc.id ? { ...s, config: c } : s) } : d)); }}
                          />
                        </div>
                      )}
                      <div style={{ marginTop: 10 }}>
                        <button onClick={() => { const cur = selected.services.find(s => s.id === svc.id); if (cur) updateService(svc.id, { config: cur.config }); setConfigSvc(null); }} style={S.btn('#0ea5e9')}>💾 {tr('missiondesk.saveConfig')}</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {!selected.services.length && <div style={{ color: '#64748b', fontSize: 12 }}>{tr('missiondesk.noServicesYet')}</div>}
              {selected.services.some(s => s.service_type === 'buttons') && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{tr('missiondesk.buttonsCreatedAtStation')}</div>
              )}
            </div>

            {/* פריסה */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 'bold', color: '#94a3b8' }}>{tr('missiondesk.layoutTitle')}</span>
              {!layout && <button onClick={() => setLayout(mdDefaultLeaf())} style={S.ghost}>➕ {tr('missiondesk.startLayout')}</button>}
              <span style={{ fontSize: 11, color: '#64748b' }}>{tr('missiondesk.layoutHint')}</span>
            </div>
            {layout && <LayoutEditor layout={layout} services={selected.services} onChange={setLayout} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// חלון פ"ממים - למי הוא שייך. הקישור הוא לשירות המפה (ולא ל-map_id), כי המפה
// עצמה נבחרת פר-עמדה: אותו דסק משרת עמדות שמסתכלות על מפות שונות.
// ─────────────────────────────────────────────────────────────────────────────
function StripsConfigEditor({ config, mapServices, onChange }: {
  config: MDStripsConfig;
  mapServices: MissionDeskService[];
  onChange: (c: MDStripsConfig) => void;
}) {
  if (!mapServices.length) {
    return <div style={{ fontSize: 12, color: '#fbbf24' }}>⚠ {tr('missiondesk.stripsNoMapWindows')}</div>;
  }
  return (
    <div>
      <label style={S.label}>✈ {tr('missiondesk.stripsBindLabel')}</label>
      <select
        value={config.map_service_id ?? ''}
        onChange={e => onChange({ ...config, map_service_id: e.target.value ? Number(e.target.value) : null })}
        style={{ ...S.input, width: '100%' }}>
        <option value="">{tr('missiondesk.stripsBindNone')}</option>
        {mapServices.map(m => <option key={m.id} value={m.id}>🗺 {m.name || tr('missiondesk.mapWindowUnnamed')}</option>)}
      </select>
      <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b' }}>{tr('missiondesk.stripsBindHint')}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// הגדרת חלון מפה בעורך העמדה: איזו מפה, אילו נקודות העברה, אילו מפות סקטור.
// קבוצה אחת לכל חלון מפה בדסק - דסק יכול להחזיק כמה מפות, ולכל אחת הגדרות משלה.
// הרכיב "טיפש": מקבל הגדרה ומחזיר הגדרה, ואינו יודע דבר על הטופס שמעליו.
// ─────────────────────────────────────────────────────────────────────────────
function MapWindowSettings({ settings, maps, sectors, boundStrips, onChange }: {
  settings: MDPresetMapSettings;
  maps: { id: number; name: string; parent_map_id?: number | null }[];
  sectors: { id: number; name: string }[];
  boundStrips: MissionDeskService[];
  onChange: (s: MDPresetMapSettings) => void;
}) {
  const chosen = settings.map_id;
  const sectorMaps = chosen ? maps.filter(m => Number(m.parent_map_id) === Number(chosen)) : [];
  const chip = (on: boolean): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: 14, cursor: 'pointer', fontSize: 12,
    border: `1px solid ${on ? '#0ea5e9' : '#334155'}`,
    background: on ? '#0c2a40' : '#1e293b', color: on ? '#7dd3fc' : '#94a3b8',
    fontWeight: on ? 'bold' : 'normal',
  });

  return (
    <div>
      {/* בחירת המפה - חובה. בלעדיה החלון הוא אזור ריק על מסך העמדה. */}
      <label style={{ ...S.label, color: chosen ? '#7dd3fc' : '#fbbf24' }}>
        🗺 {tr('missiondesk.mapSelectLabel')}{chosen ? '' : ` · ${tr('missiondesk.mapRequiredBadge')}`}
      </label>
      <select
        value={chosen ?? ''}
        onChange={e => onChange({ ...settings, map_id: e.target.value ? Number(e.target.value) : null })}
        style={{ ...S.input, width: '100%', border: chosen ? '1px solid #475569' : '1px solid #f59e0b' }}>
        <option value="">{tr('missiondesk.mapSelectNone')}</option>
        {maps.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>

      {/* חלונות הפ"ממים שקשורים לחלון הזה - כדי שיהיה ברור מה נגרר לאן */}
      {boundStrips.length > 0 && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: '#94a3b8' }}>
          ✈ {tr('missiondesk.stripsWindowFor')}: {boundStrips.map(s => s.name).join(' · ')}
        </p>
      )}

      {/* נקודות ההעברה של החלון הזה - מוצגות בתוך המפה הזו בלבד */}
      <label style={S.label}>📍 {tr('missiondesk.mapTransferPoints')}</label>
      {sectors.length === 0 ? (
        <div style={{ fontSize: 12, color: '#64748b' }}>-</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, direction: 'rtl' }}>
          {sectors.map(s => {
            const on = settings.transfer_points.includes(Number(s.id));
            return (
              <button key={s.id} type="button" style={chip(on)}
                onClick={() => onChange({
                  ...settings,
                  transfer_points: on
                    ? settings.transfer_points.filter(x => x !== Number(s.id))
                    : [...settings.transfer_points, Number(s.id)],
                })}>
                {on ? '✓ ' : ''}{s.name}
              </button>
            );
          })}
        </div>
      )}
      <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b' }}>{tr('missiondesk.mapTransferPointsHint')}</p>

      {/* מצב אזורי טיסה + תצוגת הפ"מ - פר-חלון, כי בדסק כל מפה משמשת למשהו אחר */}
      <label style={S.label}>✈ {tr('missiondesk.mapFlightZones')}</label>
      <div style={{ display: 'flex', gap: 8, direction: 'rtl' }}>
        {[{ val: true, label: '✅' }, { val: false, label: '⬜' }].map(opt => (
          <button key={String(opt.val)} type="button"
            onClick={() => onChange({ ...settings, flight_zones_mode: opt.val })}
            style={chip((settings.flight_zones_mode === true) === opt.val)}>
            {opt.label}
          </button>
        ))}
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b' }}>{tr('missiondesk.mapFlightZonesHint')}</p>

      <label style={S.label}>📍 {tr('missiondesk.mapPinDisplay')}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, direction: 'rtl' }}>
        {([
          { val: 'handwrite', label: tr('ctrl.pinHandwrite') },
          { val: 'strip', label: tr('ctrl.pinExpanded') },
          { val: 'small', label: tr('ctrl.pinSmall') },
          { val: 'icon', label: tr('ctrl.pinIcon') },
        ] as { val: MDPresetMapSettings['fz_pin_display']; label: string }[]).map(opt => (
          <button key={String(opt.val)} type="button"
            onClick={() => onChange({ ...settings, fz_pin_display: opt.val })}
            style={chip((settings.fz_pin_display || 'handwrite') === opt.val)}>
            {opt.label}
          </button>
        ))}
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b' }}>{tr('missiondesk.mapPinDisplayHint')}</p>

      {/* מפות הסקטור של אותה מפה */}
      {chosen != null && (
        <>
          <label style={S.label}>🔍 {tr('missiondesk.mapSectorMaps')}</label>
          {sectorMaps.length === 0 ? (
            <div style={{ fontSize: 11, color: '#64748b' }}>{tr('missiondesk.mapNoSectorMaps')}</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, direction: 'rtl', marginBottom: 8 }}>
                {[{ val: true, label: '✅' }, { val: false, label: '⬜' }].map(opt => (
                  <button key={String(opt.val)} type="button"
                    onClick={() => onChange({ ...settings, sector_maps_enabled: opt.val })}
                    style={chip((settings.sector_maps_enabled === true) === opt.val)}>
                    {opt.label}
                  </button>
                ))}
              </div>
              {settings.sector_maps_enabled && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, direction: 'rtl' }}>
                  {sectorMaps.map(m => {
                    const ids = settings.sector_map_ids || [];
                    const on = ids.includes(Number(m.id));
                    return (
                      <button key={m.id} type="button" style={chip(on)}
                        onClick={() => onChange({
                          ...settings,
                          sector_map_ids: on ? ids.filter(x => x !== Number(m.id)) : [...ids, Number(m.id)],
                        })}>
                        {on ? '✓ ' : ''}{m.name}
                      </button>
                    );
                  })}
                </div>
              )}
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b' }}>{tr('missiondesk.mapSectorMapsHint')}</p>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// קונפיגורציית דסק בעורך העמדה: בחירת דסק + הגדרת חלונות המפה + שיתוף פר-שירות
// ─────────────────────────────────────────────────────────────────────────────
export function MissionDeskPresetConfig({ deskId, sharing, mapConfig, maps, sectors, onChange, allPresets, currentPresetId, currentPresetName, crewName }: {
  deskId: number | '' | null;
  sharing: Record<string, number[]>;
  mapConfig: MDPresetMapConfig;
  maps: { id: number; name: string; parent_map_id?: number | null }[];
  sectors: { id: number; name: string }[];
  onChange: (patch: {
    mission_desk_id?: number | null;
    mission_desk_sharing?: Record<string, number[]>;
    mission_desk_map_config?: MDPresetMapConfig;
  }) => void;
  allPresets: { id: number; name: string; preset_type?: string; mission_desk_id?: number | null }[];
  currentPresetId: number | null;
  currentPresetName?: string;
  crewName?: string;
}) {
  const [desks, setDesks] = useState<DeskFull[]>([]);
  const [configOpen, setConfigOpen] = useState(false);
  useEffect(() => {
    fetch(`${API_URL}/mission-desks`).then(r => r.json()).then(d => Array.isArray(d) && setDesks(d)).catch(() => {});
  }, []);

  const selected = desks.find(d => d.id === Number(deskId)) || null;
  const mapWindowGroups = mdMapServices(selected?.services);
  const missingMaps = mdMissingMapServices(selected?.services, mapConfig);
  // חלונות פ"ממים שלא מקושרים לאף חלון מפה - הם יישארו ריקים בעמדה, ולכן מוצגת אזהרה
  const orphanStrips = (selected?.services || [])
    .filter(s => s.service_type === 'strips' && mdStripsMapServiceId(s, selected?.services) == null);
  const patchMapSettings = (serviceId: number, s: MDPresetMapSettings) =>
    onChange({ mission_desk_map_config: { ...mapConfig, [String(serviceId)]: s } });
  // שיתוף הגיוני רק עם עמדות דסק שבחרו את *אותו* דסק — לאחרות אין את השירותים
  const shareCandidates = allPresets.filter(p =>
    p.id !== currentPresetId &&
    p.preset_type === 'mission_desk' &&
    Number(p.mission_desk_id) === Number(deskId)
  );

  return (
    <div style={{ marginTop: 12, padding: '10px 14px', background: '#0f172a', borderRadius: 8, border: deskId ? '1px solid #0ea5e9' : '1px solid #1e293b' }}>
      <label style={{ display: 'block', marginBottom: 6, color: deskId ? '#7dd3fc' : '#94a3b8', fontSize: 13, fontWeight: 'bold' }}>🗂 {tr('missiondesk.presetDeskLabel')}</label>
      <select
        value={deskId || ''}
        onChange={e => {
          const nextId = e.target.value ? Number(e.target.value) : null;
          // הגדרות חלונות המפה קשורות ל-service_id של דסק מסוים; בהחלפת דסק
          // הן חסרות משמעות, ואם יישארו - הן ייראו כ"מוגדר" בלי שיהיה למה.
          const nextDesk = desks.find(x => x.id === nextId) || null;
          onChange({
            mission_desk_id: nextId,
            mission_desk_sharing: sharing,
            mission_desk_map_config: mdPruneMapConfig(mapConfig, nextDesk?.services),
          });
        }}
        style={{ ...S.input, width: '100%' }}>
        <option value="">{tr('missiondesk.noDeskSelected')}</option>
        {desks.map(d => <option key={d.id} value={d.id}>🗂 {d.name}</option>)}
      </select>

      {/* אמצעים קבועים ונתוני טבלה — פתיחת הדסק האמיתי במצב הגדרה */}
      {selected && (
        currentPresetId ? (
          <button type="button" onClick={() => setConfigOpen(true)}
            style={{ ...S.btn('#b45309'), marginTop: 10, width: '100%' }}>
            📌 {tr('missiondesk.openConfigView')}
          </button>
        ) : (
          <div style={{ marginTop: 8, fontSize: 12, color: '#fbbf24' }}>💡 {tr('missiondesk.saveFirstHint')}</div>
        )
      )}

      {configOpen && currentPresetId && (
        <MissionDeskConfigOverlay
          presetId={currentPresetId}
          presetName={currentPresetName || ''}
          deskId={Number(deskId)}
          allPresets={allPresets}
          crewName={crewName}
          onClose={() => setConfigOpen(false)}
        />
      )}

      {/* קבוצה מכווצת לכל חלון מפה בדסק, ואחריהן "כללי" - כך שדסק עם שש מפות
          עדיין נקרא במבט אחד. בוחרים קבוצה ← נפתח כל מה שקשור לאותה מפה. */}
      {selected && (
        <div style={{ marginTop: 12 }}>
          <AdminSections>
            <AdminSectionsToolbar />
            {mapWindowGroups.length === 0 ? (
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>{tr('missiondesk.mapNoWindowsInDesk')}</div>
            ) : mapWindowGroups.map((svc, i) => {
              const st = mdMapSettings(mapConfig, svc.id);
              const bound = (selected.services || []).filter(s =>
                s.service_type === 'strips' && mdStripsMapServiceId(s, selected.services) === svc.id);
              const mapName = maps.find(m => Number(m.id) === Number(st.map_id))?.name;
              return (
                <AdminSection
                  key={svc.id}
                  id={`md-map-${svc.id}`}
                  icon="🗺"
                  title={`${tr('missiondesk.mapGroupTitle')} ${i + 1} · ${svc.name || tr('missiondesk.mapWindowUnnamed')}`}
                  badge={mapName || tr('missiondesk.mapSelectNone')}
                  attention={st.map_id == null}>
                  <MapWindowSettings
                    settings={st}
                    maps={maps}
                    sectors={sectors}
                    boundStrips={bound}
                    onChange={s => patchMapSettings(svc.id, s)}
                  />
                </AdminSection>
              );
            })}

            {orphanStrips.length > 0 && (
              <div style={{ fontSize: 12, color: '#fbbf24', marginBottom: 10 }}>
                ⚠ {tr('missiondesk.stripsUnlinked')} · {orphanStrips.map(s => s.name).join(' · ')}
              </div>
            )}
            {missingMaps.length > 0 && (
              <div style={{ fontSize: 12, color: '#fbbf24', marginBottom: 10 }}>
                ⚠ {tr('missiondesk.mapMissingSave')}
              </div>
            )}

            <AdminSection id="md-general" icon="⚙" title={tr('missiondesk.generalGroupTitle')}>
              {selected.services.length === 0 ? (
                <div style={{ fontSize: 12, color: '#64748b' }}>{tr('missiondesk.noServicesYet')}</div>
              ) : (<>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 'bold', marginBottom: 6 }}>{tr('missiondesk.sharingTitle')}</div>
          {shareCandidates.length === 0 ? (
            <div style={{ fontSize: 12, color: '#64748b', background: '#1e293b', borderRadius: 8, padding: '8px 10px' }}>
              {tr('missiondesk.noSharePartners')}
            </div>
          ) : (
            <>
              {selected.services.map(svc => {
                const cur = sharing[String(svc.id)] || [];
                return (
                  <div key={svc.id} style={{ marginBottom: 8, background: '#1e293b', borderRadius: 8, padding: '6px 10px' }}>
                    <div style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 4 }}>
                      {SERVICE_META[svc.service_type]?.icon} {svc.name || tr(SERVICE_META[svc.service_type]?.nameKey || '')}
                      {cur.length > 0 && <span style={{ color: '#4ade80', fontSize: 11, marginInlineStart: 6 }}>({cur.length} {tr('missiondesk.sharedWith')})</span>}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {shareCandidates.map(p => (
                        <label key={p.id} style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input type="checkbox" checked={cur.includes(p.id)}
                            onChange={e => {
                              const next = e.target.checked ? [...cur, p.id] : cur.filter(x => x !== p.id);
                              onChange({ mission_desk_id: deskId ? Number(deskId) : null, mission_desk_sharing: { ...sharing, [String(svc.id)]: next } });
                            }} />
                          {p.name}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div style={{ fontSize: 11, color: '#64748b' }}>{tr('missiondesk.sharingHint')}</div>
            </>
          )}
              </>)}
            </AdminSection>
          </AdminSections>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// תצוגת הגדרה — הדסק האמיתי (MissionDeskView) במצב adminMode, מעל עורך העמדה.
// כאן האדמין ממקם אמצעים קבועים (📌) וממלא נתוני טבלה; הכל נשמר ישירות
// ל-state של העמדה (mission_desk_service_state) — מה שהמפעיל יראה בכניסה.
// ─────────────────────────────────────────────────────────────────────────────
function MissionDeskConfigOverlay({ presetId, presetName, deskId, allPresets, crewName, onClose }: {
  presetId: number;
  presetName: string;
  deskId: number;
  allPresets: { id: number; name: string }[];
  crewName?: string;
  onClose: () => void;
}) {
  const fakeSession: any = {
    presetId,
    workstationName: presetName,
    workstationId: String(presetId),
    relevantSectors: [],
    authToken: '',
    crewMember: crewName ? { id: 0, name: crewName, is_admin: true } : undefined,
  };
  const fakePreset = { id: presetId, name: presetName, preset_type: 'mission_desk', mission_desk_id: deskId };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000 }}>
      <MissionDeskView
        session={fakeSession}
        preset={fakePreset}
        allPresets={allPresets}
        onLogout={onClose}
        adminMode
      />
    </div>
  );
}
