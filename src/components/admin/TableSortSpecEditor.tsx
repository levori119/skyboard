// סדר המיון של מוד טבלה בניהול - רשימת רמות לפי עדיפות: שדה + עולה/יורד.
// הראשונה קובעת, השנייה מכריעה בין שווים וכן הלאה (utils/tableSort.ts).
// בעמדה זה סדר ברירת המחדל של הלוח; לחיצה של הפקח על כותרת גוברת עליו.
import React from 'react';
import { tr } from '../../i18n/tr';
import { normalizeSortSpec, type TableSortLevel } from '../../utils/tableSort';

interface Props {
  /** הרמות כפי שנשמרו על המוד */
  spec: TableSortLevel[];
  /** השדות שאפשר למיין לפיהם - עמודות המוד (לא טבלאות בן) */
  fields: { key: string; label: string }[];
  onChange: (spec: TableSortLevel[]) => void;
}

const box: React.CSSProperties = { background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '4px', padding: '4px 8px', fontSize: '13px' };
const iconBtn: React.CSSProperties = { padding: '3px 7px', background: 'transparent', color: '#94a3b8', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', flexShrink: 0 };

export default function TableSortSpecEditor({ spec, fields, onChange }: Props) {
  const levels = normalizeSortSpec(spec);
  const set = (i: number, patch: Partial<TableSortLevel>) => onChange(levels.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= levels.length) return;
    const next = [...levels];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const free = (own?: string) => fields.filter(f => f.key === own || !levels.some(l => l.key === f.key));
  const firstFree = free()[0];

  return (
    <div data-testid="table-mode-sort" style={{ marginTop: '16px', padding: '12px', background: '#111c33', border: '1px solid #334155', borderRadius: '6px' }}>
      <div style={{ color: '#cbd5e1', fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>{tr('tableDisplay.sortTitle')}</div>
      <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '10px' }}>{tr('tableDisplay.sortHint')}</div>
      {levels.length === 0 && (
        <div style={{ color: '#475569', fontSize: '12px', marginBottom: '8px' }}>{tr('tableDisplay.sortNone')}</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {levels.map((l, i) => {
          const known = fields.some(f => f.key === l.key);
          return (
            <div key={l.key} data-testid="table-mode-sort-level" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ color: '#38bdf8', fontWeight: 'bold', fontSize: '13px', minWidth: '22px' }}>{tr('tableDisplay.sortLevel', { n: i + 1 })}</span>
              <select value={l.key} onChange={e => set(i, { key: e.target.value })} style={{ ...box, minWidth: '150px' }}>
                {!known && <option value={l.key}>{l.key}</option>}
                {free(l.key).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              <button type="button" data-testid="table-mode-sort-dir" onClick={() => set(i, { dir: l.dir === 'asc' ? 'desc' : 'asc' })}
                style={{ ...box, cursor: 'pointer', minWidth: '84px', background: l.dir === 'desc' ? '#3b0764' : '#082f49', borderColor: l.dir === 'desc' ? '#7c3aed' : '#0369a1' }}>
                {tr(l.dir === 'desc' ? 'tableDisplay.sortDesc' : 'tableDisplay.sortAsc')}
              </button>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title={tr('tableDisplay.sortUp')} style={{ ...iconBtn, opacity: i === 0 ? 0.35 : 1 }}>▲</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === levels.length - 1} title={tr('tableDisplay.sortDown')} style={{ ...iconBtn, opacity: i === levels.length - 1 ? 0.35 : 1 }}>▼</button>
              <button type="button" onClick={() => onChange(levels.filter((_, j) => j !== i))} title={tr('tableDisplay.sortRemove')} style={{ ...iconBtn, color: '#f87171' }}>✕</button>
            </div>
          );
        })}
      </div>
      {firstFree && (
        <button type="button" data-testid="table-mode-sort-add" onClick={() => onChange([...levels, { key: firstFree.key, dir: 'asc' }])}
          style={{ marginTop: '8px', padding: '5px 14px', background: '#0e7490', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>
          {tr('tableDisplay.sortAdd')}
        </button>
      )}
    </div>
  );
}
