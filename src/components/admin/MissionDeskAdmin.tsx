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
  MDTableConfig, MDFreeTextConfig, MDColumnType, MDSummaryKind, MDRuleOp,
} from '../../types/missionDesk';
import { mdDefaultLeaf, mdSplit, mdRemove, mdUpdate, mdGenId } from '../../utils/missionDesk';

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
};

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
            <input value={(c.options || []).join(',')} placeholder={tr('missiondesk.selectOptionsHint')}
              onChange={e => onChange({ ...config, columns: cols.map((x, j) => j === i ? { ...x, options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } : x) })}
              style={{ ...S.input, flex: 1, minWidth: 110 }} />
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
          <button onClick={() => onChange({ ...config, columns: cols.filter((_, j) => j !== i) })} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>✕</button>
        </div>
      ))}
      <button onClick={addCol} style={S.ghost}>➕ {tr('missiondesk.addColumn')}</button>

      <div style={S.label}>{tr('missiondesk.cfgComputed')}</div>
      {computed.map((c, i) => (
        <div key={c.key} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
          <input value={c.title} placeholder={tr('missiondesk.colTitle')} onChange={e => onChange({ ...config, computed: computed.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} style={{ ...S.input, width: 120 }} />
          <input value={c.formula} placeholder={tr('missiondesk.formulaHint')} dir="ltr" onChange={e => onChange({ ...config, computed: computed.map((x, j) => j === i ? { ...x, formula: e.target.value } : x) })} style={{ ...S.input, flex: 1, fontFamily: 'monospace' }} />
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

  const addService = async (type: 'buttons' | 'freetext' | 'table') => {
    if (!selected) return;
    const defaults = type === 'table'
      ? { columns: [{ key: 'entity', title: tr('missiondesk.entityColDefault'), type: 'text' }], allowAddRows: true, initialRows: 0 }
      : type === 'freetext' ? { ruled: true, lineGap: 34 } : {};
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
// קונפיגורציית דסק בעורך העמדה: בחירת דסק + שיתוף פר-שירות
// ─────────────────────────────────────────────────────────────────────────────
export function MissionDeskPresetConfig({ deskId, sharing, onChange, allPresets, currentPresetId }: {
  deskId: number | '' | null;
  sharing: Record<string, number[]>;
  onChange: (patch: { mission_desk_id: number | null; mission_desk_sharing: Record<string, number[]> }) => void;
  allPresets: { id: number; name: string }[];
  currentPresetId: number | null;
}) {
  const [desks, setDesks] = useState<DeskFull[]>([]);
  useEffect(() => {
    fetch(`${API_URL}/mission-desks`).then(r => r.json()).then(d => Array.isArray(d) && setDesks(d)).catch(() => {});
  }, []);

  const selected = desks.find(d => d.id === Number(deskId)) || null;

  return (
    <div style={{ marginTop: 12, padding: '10px 14px', background: '#0f172a', borderRadius: 8, border: deskId ? '1px solid #0ea5e9' : '1px solid #1e293b' }}>
      <label style={{ display: 'block', marginBottom: 6, color: deskId ? '#7dd3fc' : '#94a3b8', fontSize: 13, fontWeight: 'bold' }}>🗂 {tr('missiondesk.presetDeskLabel')}</label>
      <select
        value={deskId || ''}
        onChange={e => onChange({ mission_desk_id: e.target.value ? Number(e.target.value) : null, mission_desk_sharing: sharing })}
        style={{ ...S.input, width: '100%' }}>
        <option value="">{tr('missiondesk.noDeskSelected')}</option>
        {desks.map(d => <option key={d.id} value={d.id}>🗂 {d.name}</option>)}
      </select>

      {selected && selected.services.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 'bold', marginBottom: 6 }}>{tr('missiondesk.sharingTitle')}</div>
          {selected.services.map(svc => {
            const cur = sharing[String(svc.id)] || [];
            return (
              <div key={svc.id} style={{ marginBottom: 8, background: '#1e293b', borderRadius: 8, padding: '6px 10px' }}>
                <div style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 4 }}>
                  {SERVICE_META[svc.service_type]?.icon} {svc.name || tr(SERVICE_META[svc.service_type]?.nameKey || '')}
                  {cur.length > 0 && <span style={{ color: '#4ade80', fontSize: 11, marginInlineStart: 6 }}>({cur.length} {tr('missiondesk.sharedWith')})</span>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {allPresets.filter(p => p.id !== currentPresetId).map(p => (
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
        </div>
      )}
    </div>
  );
}
