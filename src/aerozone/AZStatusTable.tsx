import React, { useState } from 'react';
import {
  AZPolygon, AZPolygonStatus,
  OPERATIONAL_LABELS, OPERATIONAL_COLORS, GRF_LABELS, GRF_COLORS, POLYGON_TYPE_LABELS,
} from './types';

interface Props {
  polygons: AZPolygon[];
  statusMap: Record<number, AZPolygonStatus>;
  onSelect: (polygon: AZPolygon) => void;
  selectedId: number | null;
  lightMode?: boolean;
}

export function AZStatusTable({ polygons, statusMap, onSelect, selectedId, lightMode }: Props) {
  const [filterType, setFilterType] = useState<string>('all');
  const [filterOp, setFilterOp] = useState<string>('all');

  const bg = lightMode ? '#ffffff' : '#0f172a';
  const rowBg = lightMode ? '#f8fafc' : '#1e293b';
  const border = lightMode ? '#e2e8f0' : '#334155';
  const textMain = lightMode ? '#0f172a' : '#f1f5f9';
  const textSub = lightMode ? '#64748b' : '#94a3b8';
  const hdrBg = lightMode ? '#e2e8f0' : '#1e293b';

  const filtered = polygons.filter(p => {
    if (filterType !== 'all' && p.type !== filterType) return false;
    const st = statusMap[p.id];
    if (filterOp !== 'all' && st?.operational !== filterOp) return false;
    return true;
  });

  const types = Array.from(new Set(polygons.map(p => p.type)));

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: bg, direction: 'rtl' }}>
      {/* Filters */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${border}`, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: textSub, fontWeight: 'bold' }}>סינון:</span>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          style={{ padding: '5px 10px', background: lightMode ? '#f1f5f9' : '#0f172a', border: `1px solid ${border}`, borderRadius: '6px', color: textMain, fontSize: '12px', cursor: 'pointer' }}>
          <option value="all">כל הסוגים</option>
          {types.map(t => <option key={t} value={t}>{POLYGON_TYPE_LABELS[t as any]}</option>)}
        </select>
        <select value={filterOp} onChange={e => setFilterOp(e.target.value)}
          style={{ padding: '5px 10px', background: lightMode ? '#f1f5f9' : '#0f172a', border: `1px solid ${border}`, borderRadius: '6px', color: textMain, fontSize: '12px', cursor: 'pointer' }}>
          <option value="all">כל הסטטוסים</option>
          <option value="operational">שמיש</option>
          <option value="partial">שמיש חלקי</option>
          <option value="closed">סגור</option>
          <option value="maintenance">שיפוצים</option>
        </select>
        <span style={{ fontSize: '11px', color: textSub, marginRight: 'auto' }}>{filtered.length} אלמנטים</span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr style={{ background: hdrBg }}>
              {['שם', 'סוג', 'מבצעיות', 'GRF', 'RVR', 'הערה', 'עדכון אחרון'].map(h => (
                <th key={h} style={{ padding: '10px 12px', color: textSub, fontWeight: 'bold', textAlign: 'right', borderBottom: `2px solid ${border}`, whiteSpace: 'nowrap', fontSize: '11px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: textSub }}>אין אלמנטים להצגה</td></tr>
            )}
            {filtered.map((polygon, idx) => {
              const st = statusMap[polygon.id];
              const opColor = OPERATIONAL_COLORS[st?.operational || 'operational'];
              const isSelected = selectedId === polygon.id;
              return (
                <tr key={polygon.id}
                  onClick={() => onSelect(polygon)}
                  style={{
                    background: isSelected ? `${opColor}22` : idx % 2 === 0 ? 'transparent' : rowBg,
                    cursor: 'pointer',
                    outline: isSelected ? `2px solid ${opColor}` : 'none',
                    transition: 'background 0.1s',
                  }}>
                  <td style={{ padding: '10px 12px', color: textMain, fontWeight: 'bold' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: polygon.color, flexShrink: 0 }} />
                      {polygon.name}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', color: textSub }}>{POLYGON_TYPE_LABELS[polygon.type]}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: '12px', background: `${opColor}22`, color: opColor, fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      {OPERATIONAL_LABELS[st?.operational || 'operational']}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {st?.grf && (
                      <span style={{ color: GRF_COLORS[st.grf], fontSize: '12px', fontWeight: 'bold' }}>
                        {st.grf === 'wet' ? '💧💧💧' : st.grf === 'slippery' ? '💧' : '☀'} {GRF_LABELS[st.grf]}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', color: textMain, direction: 'ltr', textAlign: 'left' }}>
                    {st?.rvr != null ? `${st.rvr}m` : <span style={{ color: textSub }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 12px', color: textSub, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {st?.note || '—'}
                  </td>
                  <td style={{ padding: '10px 12px', color: textSub, whiteSpace: 'nowrap', fontSize: '11px' }}>
                    {st?.updated_at ? new Date(st.updated_at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
