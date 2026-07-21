// שירות "מוד טבלה חכמה" — טבלת מעקב בדסק משימה כללי.
// עמודות לפי הגדרת האדמין (טקסט/מספר/V-X/תפריט), עמודות מחושבות (נוסחה),
// עיצוב מותנה פר-שורה ושורת סיכום — הכל לוגיקה טהורה מ-utils/missionDesk.
import { useEffect } from 'react';
import { tr } from '../../i18n/tr';
import { customConfirm } from '../shared/ConfirmModal';
import type { MDTableConfig, MDTableState, MDTableRow, MDCellValue } from '../../types/missionDesk';
import { computeCells, computeSummary, rowStyle, summaryLabel, mdGenId } from '../../utils/missionDesk';
import type { MDTheme } from './theme';

interface Props {
  config: MDTableConfig;
  state: MDTableState;
  onChange: (next: MDTableState) => void;
  theme: MDTheme;
  postLog: (action: string, details: Record<string, unknown>) => void;
  adminMode?: boolean; // הגדרת עמדה: שורות שנוצרות מסומנות "קבוע" ולא נמחקות בעמדה
}

let blinkInjected = false;
const ensureBlinkStyle = () => {
  if (blinkInjected) return;
  const el = document.createElement('style');
  el.textContent = '@keyframes md-row-blink { 0%,49%{opacity:1;} 50%,100%{opacity:0.35;} }';
  document.head.appendChild(el);
  blinkInjected = true;
};

const emptyRow = (fixed?: boolean): MDTableRow => ({ id: mdGenId(), cells: {}, ...(fixed ? { fixed: true } : {}) });

export default function SmartTable({ config, state, onChange, theme, postLog, adminMode }: Props) {
  const rows = state?.rows || [];
  useEffect(() => { ensureBlinkStyle(); }, []);

  // אתחול שורות התחלתיות (הגדרת אדמין) — פעם אחת כשאין state
  useEffect(() => {
    if (!rows.length && (config.initialRows || 0) > 0) {
      onChange({ rows: Array.from({ length: config.initialRows! }, () => emptyRow()) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setCell = (rowId: string, key: string, value: MDCellValue) =>
    onChange({ rows: rows.map(r => r.id === rowId ? { ...r, cells: { ...r.cells, [key]: value } } : r) });

  const addRow = () => {
    onChange({ rows: [...rows, emptyRow(adminMode)] });
    postLog('mission_desk_row_added', { rows: rows.length + 1 });
  };

  const removeRow = async (rowId: string) => {
    if (!(await customConfirm(tr('missiondesk.confirmDeleteRow')))) return;
    onChange({ rows: rows.filter(r => r.id !== rowId) });
  };

  const summary = computeSummary(rows, config);
  const summaryKeys = Object.keys(config.summary || {});
  const allCols = [...config.columns, ...(config.computed || []).map(c => ({ key: c.key, title: c.title, type: 'number' as const }))];

  const cellStyle: React.CSSProperties = { border: `1px solid ${theme.border}`, padding: '4px 6px', fontSize: 14 };
  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none', color: 'inherit', fontSize: 14, padding: '3px 2px', outline: 'none', textAlign: 'start' };

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', padding: 6, boxSizing: 'border-box' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', color: theme.text }}>
        <thead>
          <tr>
            {allCols.map(c => (
              <th key={c.key} style={{ ...cellStyle, background: theme.headerBg, color: theme.subtext, fontSize: 13, position: 'sticky', top: 0, zIndex: 1 }}>{c.title}</th>
            ))}
            <th style={{ ...cellStyle, background: theme.headerBg, width: 30 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const cells = computeCells(row, config);
            const style = rowStyle(config.rules, cells);
            return (
              <tr key={row.id} style={{
                background: style?.bg || 'transparent',
                color: style?.text || theme.text,
                animation: style?.blink ? 'md-row-blink 1s infinite' : undefined,
              }}>
                {config.columns.map(col => (
                  <td key={col.key} style={cellStyle}>
                    {col.type === 'check' ? (
                      <button
                        onClick={() => setCell(row.id, col.key, !(row.cells[col.key] === true))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, width: '100%', color: row.cells[col.key] === true ? '#22c55e' : '#ef4444' }}>
                        {row.cells[col.key] === true ? '✔' : '✘'}
                      </button>
                    ) : col.type === 'select' ? (
                      <select value={String(row.cells[col.key] ?? '')} onChange={e => setCell(row.id, col.key, e.target.value)}
                        style={{ ...inputStyle, background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 4 }}>
                        <option value="" />
                        {(col.options || []).filter(o => o.trim() !== '').map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        type={col.type === 'number' ? 'number' : 'text'}
                        value={String(row.cells[col.key] ?? '')}
                        onChange={e => setCell(row.id, col.key, col.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)}
                        style={inputStyle}
                      />
                    )}
                  </td>
                ))}
                {(config.computed || []).map(c => (
                  <td key={c.key} style={{ ...cellStyle, fontWeight: 'bold', textAlign: 'center' }}>
                    {cells[c.key] !== undefined ? String(cells[c.key]) : '—'}
                  </td>
                ))}
                <td style={{ ...cellStyle, textAlign: 'center' }}>
                  {row.fixed && !adminMode ? (
                    <span title={tr('missiondesk.fixedBadge')} style={{ fontSize: 11 }}>📌</span>
                  ) : (
                    <button onClick={() => removeRow(row.id)} title={tr('missiondesk.deleteRow')}
                      style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 13 }}>✕</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        {summaryKeys.length > 0 && (
          <tfoot>
            <tr style={{ background: theme.panelAlt, fontWeight: 'bold' }}>
              {allCols.map(c => (
                <td key={c.key} style={{ ...cellStyle, color: theme.accent, fontSize: 13 }}>
                  {config.summary?.[c.key]
                    ? `${summaryLabel(config.summary[c.key])}: ${summary[c.key] !== null && summary[c.key] !== undefined ? Number.isInteger(summary[c.key]) ? summary[c.key] : (summary[c.key] as number).toFixed(1) : '—'}`
                    : ''}
                </td>
              ))}
              <td style={cellStyle} />
            </tr>
          </tfoot>
        )}
      </table>
      {(adminMode || config.allowAddRows !== false) && (
        <button onClick={addRow}
          style={{ marginTop: 8, padding: '6px 16px', background: 'none', border: `1px dashed ${theme.border}`, borderRadius: 8, color: theme.subtext, cursor: 'pointer', fontSize: 13 }}>
          ➕ {tr('missiondesk.addRow')}
        </button>
      )}
    </div>
  );
}
