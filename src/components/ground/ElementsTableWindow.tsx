import React from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../../i18n/tr';
import { useDockableWindow } from '../../hooks/useDockableWindow';
import { useDragPosition } from '../../hooks/useDragPosition';
import { windowFrame, type FrameTheme } from '../../utils/windowFrame';
import {
  EMPTY_ELEMENT_FILTERS,
  elementFilterOptions,
  filterElements,
  sortElements,
  type ElementFilters,
  type ElementRow,
  type SortDir,
} from '../../utils/elementTable';
import { ELEMENT_SERVICEABILITY, canChangeElementStatus, displayStateOptions, serviceabilityStyle } from '../../utils/elementStatus';
import { getElemDisplayStateOpts } from './groundShared';

// ─── טבלת האלמנטים ───────────────────────────────────────────────────────────
//
// הפאנל הצדדי עונה על "מה קורה עם האלמנט הזה"; הטבלה עונה על השאלה ההפוכה -
// "מה **לא** שמיש עכשיו בכל הבסיס", "מה מהבהב", "מה מוסתר מהמפה". לכן היא
// חוצה שדות תעופה (כל השדות של אותו בסיס אב) ומסננת על כל עמודה.
//
// הכשירות והסטטוס התפעולי נערכים כאן דרך **אותו מקור** שממנו עובד הפופאפ שעל
// המפה (`utils/elementStatus`), כדי שלא תיווצר כאן שפה שלישית.

type SortKey = 'airfield_name' | 'name' | 'category' | 'type_name' | 'status' | 'display_state';

interface Props {
  rows: ElementRow[];
  themeMode: FrameTheme;
  onClose: () => void;
  onUpdateStatus: (id: number, status: string) => void;
  onUpdateDisplayState: (id: number, displayState: string) => void;
}

const palette = (themeMode: FrameTheme) =>
  themeMode === 'dark'
    ? { panel: 'rgba(15,23,42,0.97)', head: '#0f172a', border: '#1e3a5f', line: '#1e293b', text: '#e2e8f0', muted: '#94a3b8', input: '#1e293b', inputBorder: '#334155', rowAlt: 'rgba(30,41,59,0.4)' }
    : themeMode === 'ocean'
    ? { panel: 'rgba(214,230,245,0.98)', head: '#c2dbf0', border: '#5b8cc0', line: '#a9c8e4', text: '#0f2a44', muted: '#456', input: '#e8f2fb', inputBorder: '#7ba8d4', rowAlt: 'rgba(194,219,240,0.45)' }
    : { panel: 'rgba(248,250,252,0.98)', head: '#e2e8f0', border: '#94a3b8', line: '#cbd5e1', text: '#1e293b', muted: '#475569', input: '#ffffff', inputBorder: '#cbd5e1', rowAlt: 'rgba(226,232,240,0.5)' };

export default function ElementsTableWindow({ rows, themeMode, onClose, onUpdateStatus, onUpdateDisplayState }: Props) {
  const C = palette(themeMode);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const drag = useDragPosition(rootRef);
  const dock = useDockableWindow('elementsTable', tr('dock.winElements'), {
    setFloatingPos: (x, y) => drag.moveTo(x, y),
    floatingPos: () => drag.pos ?? { x: 60, y: 70 },
  });

  const [filters, setFilters] = React.useState<ElementFilters>(EMPTY_ELEMENT_FILTERS);
  const [sortKey, setSortKey] = React.useState<SortKey>('airfield_name');
  const [sortDir, setSortDir] = React.useState<SortDir>('asc');

  const opts = React.useMemo(() => elementFilterOptions(rows), [rows]);
  const shown = React.useMemo(
    () => sortElements(filterElements(rows, filters), sortKey, sortDir),
    [rows, filters, sortKey, sortDir]);

  const set = <K extends keyof ElementFilters>(k: K, v: ElementFilters[K]) => setFilters(f => ({ ...f, [k]: v }));
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  };

  const selStyle: React.CSSProperties = {
    padding: '3px 6px', background: C.input, border: `1px solid ${C.inputBorder}`,
    borderRadius: '4px', color: C.text, fontSize: '11px', minWidth: 0, maxWidth: '130px',
  };
  const thStyle = (k: SortKey): React.CSSProperties => ({
    padding: '5px 7px', textAlign: 'start', fontSize: '10px', fontWeight: 'bold',
    color: sortKey === k ? '#38bdf8' : C.muted, cursor: 'pointer', whiteSpace: 'nowrap',
    borderBottom: `1px solid ${C.line}`, userSelect: 'none',
  });
  const tdStyle: React.CSSProperties = {
    padding: '3px 7px', fontSize: '11px', color: C.text, whiteSpace: 'nowrap',
    borderBottom: `1px solid ${C.line}`,
  };
  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const win = (
    <div
      ref={rootRef}
      data-testid="elements-table-window"
      style={{
        position: 'fixed', zIndex: 8800,
        zoom: (dock.docked ? 1 : 'var(--s)') as any,
        ...(drag.pos ? { left: drag.pos.x, top: drag.pos.y } : { left: 60, top: 70 }),
        width: 'min(860px, 94vw)', maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        background: C.panel, ...windowFrame('view', themeMode, 8),
        boxShadow: '0 10px 34px rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        ...dock.rootStyle,
      }}>
      {/* Header — drag handle */}
      <div
        {...drag.handleProps}
        onPointerDown={e => { dock.onHeaderPointerDown(e); drag.handleProps.onPointerDown(e); }}
        style={{ ...drag.handleProps.style, display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: C.head, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <span style={{ fontSize: '12px', fontWeight: 'bold', color: C.text, flex: 1 }}>
          {tr('ground.elementsTable')}
          <span style={{ color: C.muted, fontWeight: 'normal', marginInlineStart: '8px', fontSize: '10px' }}>
            {tr('ground.elementsShown', { shown: shown.length, total: rows.length })}
          </span>
        </span>
        {/* במשבצת דסק אין סגירה - המשבצת קבועה (useDockableWindow §EmbeddedWindow) */}
        {!dock.embedded && <button
          onPointerDown={e => e.stopPropagation()}
          onClick={onClose}
          title={tr('shared.close')}
          style={{ width: '22px', height: '22px', borderRadius: '4px', border: `1px solid ${C.inputBorder}`, background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: '13px', lineHeight: 1, flexShrink: 0 }}>
          ✕
        </button>}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center', padding: '6px 10px', borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
        <input
          data-testid="elements-table-search"
          value={filters.search}
          onChange={e => set('search', e.target.value)}
          placeholder={tr('shared.search')}
          style={{ ...selStyle, maxWidth: '170px', flex: '1 1 130px' }} />
        {opts.airfields.length > 1 && (
          <select value={filters.airfieldId ?? ''} onChange={e => set('airfieldId', e.target.value ? Number(e.target.value) : null)} style={selStyle}>
            <option value="">{tr('ground.airfieldCol')}: {tr('shared.all')}</option>
            {opts.airfields.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <select value={filters.category} onChange={e => set('category', e.target.value)} style={selStyle}>
          <option value="">{tr('shared.category')}: {tr('shared.all')}</option>
          {opts.categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filters.type} onChange={e => set('type', e.target.value)} style={selStyle}>
          <option value="">{tr('shared.type')}: {tr('shared.all')}</option>
          {opts.types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select data-testid="elements-table-filter-status" value={filters.status} onChange={e => set('status', e.target.value)} style={selStyle}>
          <option value="">{tr('ground.serviceability')}: {tr('shared.all')}</option>
          {opts.statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.displayState} onChange={e => set('displayState', e.target.value)} style={selStyle}>
          <option value="">{tr('ground.operationalStatus')}: {tr('shared.all')}</option>
          {opts.displayStates.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filters.onMap} onChange={e => set('onMap', e.target.value as ElementFilters['onMap'])} style={selStyle}>
          <option value="all">{tr('ground.showOnMap')}: {tr('shared.all')}</option>
          <option value="yes">✓</option>
          <option value="no">–</option>
        </select>
        <button
          onClick={() => setFilters(EMPTY_ELEMENT_FILTERS)}
          style={{ padding: '3px 9px', background: 'transparent', border: `1px solid ${C.inputBorder}`, borderRadius: '4px', color: C.muted, cursor: 'pointer', fontSize: '11px' }}>
          {tr('shared.clear')}
        </button>
      </div>

      {/* Table — its own scroller so the page never scrolls sideways */}
      <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, background: C.head, zIndex: 1 }}>
            <tr>
              {opts.airfields.length > 1 && <th style={thStyle('airfield_name')} onClick={() => toggleSort('airfield_name')}>{tr('ground.airfieldCol')}{arrow('airfield_name')}</th>}
              <th style={thStyle('name')} onClick={() => toggleSort('name')}>{tr('shared.name')}{arrow('name')}</th>
              <th style={thStyle('category')} onClick={() => toggleSort('category')}>{tr('shared.category')}{arrow('category')}</th>
              <th style={thStyle('type_name')} onClick={() => toggleSort('type_name')}>{tr('shared.type')}{arrow('type_name')}</th>
              <th style={thStyle('status')} onClick={() => toggleSort('status')}>{tr('ground.serviceability')}{arrow('status')}</th>
              <th style={thStyle('display_state')} onClick={() => toggleSort('display_state')}>{tr('ground.operationalStatus')}{arrow('display_state')}</th>
              <th style={{ ...thStyle('name'), cursor: 'default', color: C.muted }}>{tr('ground.showOnMap')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((el, i) => {
              const st = serviceabilityStyle(el.status);
              const dsOpts = canChangeElementStatus(el)
                ? displayStateOptions(el.type_allowed_statuses, getElemDisplayStateOpts(String(el.type_icon || '')))
                : [];
              const curDs = String(el.display_state || 'normal');
              return (
                <tr key={el.id} data-testid={`elements-table-row-${el.id}`} style={{ background: i % 2 ? C.rowAlt : 'transparent' }}>
                  {opts.airfields.length > 1 && <td style={{ ...tdStyle, color: C.muted }}>{el.airfield_name}</td>}
                  <td style={{ ...tdStyle, fontWeight: 'bold' }}>{el.name}</td>
                  <td style={{ ...tdStyle, color: C.muted }}>{el.category}</td>
                  <td style={{ ...tdStyle, color: C.muted }}>{el.type_name}</td>
                  <td style={tdStyle}>
                    <select
                      data-testid={`elements-table-status-${el.id}`}
                      value={ELEMENT_SERVICEABILITY.some(s => s.value === el.status) ? String(el.status) : ''}
                      onChange={e => onUpdateStatus(el.id, e.target.value)}
                      style={{ ...selStyle, color: st.color, fontWeight: 'bold', borderColor: st.color }}>
                      {/* ערך ישן שאינו בר-בחירה מוצג, ויוצא מהרשימה ברגע שנבחר ערך תקף */}
                      {!ELEMENT_SERVICEABILITY.some(s => s.value === el.status) && (
                        <option value="">{el.status || '?'}</option>
                      )}
                      {ELEMENT_SERVICEABILITY.map(s => <option key={s.value} value={s.value}>{s.value}</option>)}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    {dsOpts.length > 0 ? (
                      <select
                        data-testid={`elements-table-ds-${el.id}`}
                        value={dsOpts.some(o => o.key === curDs) ? curDs : ''}
                        onChange={e => onUpdateDisplayState(el.id, e.target.value)}
                        style={{ ...selStyle, color: dsOpts.find(o => o.key === curDs)?.color || C.muted }}>
                        {!dsOpts.some(o => o.key === curDs) && <option value="">{curDs}</option>}
                        {dsOpts.map(o => <option key={o.key + o.label} value={o.key}>{o.label}</option>)}
                      </select>
                    ) : (
                      <span data-testid={`elements-table-no-status-${el.id}`} style={{ color: C.muted }}>{tr('ground.noStatus')}</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', color: el.hidden_on_map ? C.muted : '#22c55e', fontWeight: 'bold' }}>
                    {el.hidden_on_map ? '–' : '✓'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && (
          <div style={{ padding: '18px', textAlign: 'center', color: C.muted, fontSize: '11px' }}>
            {tr('ground.noElementsMatch')}
          </div>
        )}
      </div>
    </div>
  );

  // חלון שכבר מרונדר ב-portal מחליף רק את היעד - בלי dock.render (ראה useDockableWindow)
  // מוטמע במשבצת דסק - נשאר במקומו בעץ; portal ל-body היה מוציא אותו מהמשבצת
  if (dock.embedded) return win;
  return createPortal(win, dock.slotEl ?? document.body);
}
