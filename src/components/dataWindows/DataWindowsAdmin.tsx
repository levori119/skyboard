import React, { useState } from 'react';
import { tr } from '../../i18n/tr';
import { QueryBuilder } from '../query/QueryBuilder';
import { DW_COUNT_BY, DW_MODES, dwDefault, type DataWindowCountBy, type DataWindowDef, type DataWindowMode } from '../../utils/dataWindows';

// ─── עורך חלונות הנתונים של עמדה (מסך הניהול) ─────────────────────────────────
// כל חלון = כותרת + שאילתא + אופן תצוגה. השאילתא נבנית ב-QueryBuilder הקיים,
// אותו רכיב שמשמש את סינון הפ"מים ואת תאי חלון הפ"מים - אין כאן בונה שאילתות שני.

const MODE_LABEL: Record<DataWindowMode, string> = {
  count: 'dataWindows.modeCount',
  count_callsigns: 'dataWindows.modeCountCallsigns',
  count_strips: 'dataWindows.modeCountStrips',
};

const COUNT_BY_LABEL: Record<DataWindowCountBy, string> = {
  strips: 'dataWindows.countByStrips',
  aircraft: 'dataWindows.countByAircraft',
};

const PALETTE = ['#3b82f6', '#22c55e', '#a855f7', '#eab308', '#ef4444', '#06b6d4'];

export const DataWindowsAdmin: React.FC<{
  value: DataWindowDef[];
  onChange: (next: DataWindowDef[]) => void;
  presetNames?: string[];
}> = ({ value, onChange, presetNames = [] }) => {
  const windows = Array.isArray(value) ? value : [];
  const [openId, setOpenId] = useState<string | null>(null);

  const update = (id: string, patch: Partial<DataWindowDef>) =>
    onChange(windows.map(w => w.id === id ? { ...w, ...patch } : w));

  const add = () => {
    // כל חלון חדש נפתח במיקום מוסט מעט, אחרת כולם נערמים בדיוק אחד על השני
    const w = dwDefault({ x: 80 + windows.length * 26, y: 80 + windows.length * 26, color: PALETTE[windows.length % PALETTE.length] });
    onChange([...windows, w]);
    setOpenId(w.id);
  };

  const lbl = { display: 'block', marginBottom: '4px', color: '#94a3b8', fontSize: '12px' } as const;
  const input = { padding: '7px 10px', background: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: 'white', fontSize: '13px', direction: 'rtl' } as const;

  return (
    <div style={{ marginTop: '15px', padding: '12px', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e3a5f', direction: 'rtl' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
        <label style={{ color: '#7dd3fc', fontSize: '13px', fontWeight: 'bold' }}>📊 {tr('dataWindows.sectionTitle')}</label>
        <button type="button" onClick={add}
          style={{ padding: '4px 12px', background: '#052e16', color: '#86efac', border: '1px solid #16a34a', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
          {tr('dataWindows.addWindow')}
        </button>
      </div>
      <p style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#64748b' }}>{tr('dataWindows.sectionHint')}</p>

      {windows.map(w => {
        const isOpen = openId === w.id;
        return (
          <div key={w.id} style={{ marginBottom: '8px', border: `1px solid ${w.color}`, borderRadius: '8px', overflow: 'hidden', background: '#0b1220' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', background: '#111f33' }}>
              <button type="button" onClick={() => setOpenId(isOpen ? null : w.id)}
                style={{ background: 'transparent', border: 'none', color: '#7dd3fc', cursor: 'pointer', fontSize: '13px' }}>
                {isOpen ? '▾' : '◂'}
              </button>
              <input
                value={w.title}
                onChange={e => update(w.id, { title: e.target.value })}
                placeholder={tr('dataWindows.title')}
                style={{ ...input, flex: 1, padding: '5px 8px' }}
              />
              <button type="button" onClick={() => onChange(windows.filter(x => x.id !== w.id))}
                title={tr('dataWindows.delete')}
                style={{ background: '#450a0a', color: '#fca5a5', border: '1px solid #b91c1c', borderRadius: '5px', padding: '3px 9px', cursor: 'pointer', fontSize: '12px' }}>✕</button>
            </div>

            {isOpen && (
              <div style={{ padding: '8px' }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <div>
                    <label style={lbl}>{tr('dataWindows.modeCount')} / {tr('dataWindows.modeCountCallsigns')}</label>
                    <select value={w.mode} onChange={e => update(w.id, { mode: e.target.value as DataWindowMode })} style={input}>
                      {DW_MODES.map(m => <option key={m} value={m}>{tr(MODE_LABEL[m])}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>{tr('dataWindows.countBy')}</label>
                    <select value={w.count_by} onChange={e => update(w.id, { count_by: e.target.value as DataWindowCountBy })} style={input}>
                      {DW_COUNT_BY.map(c => <option key={c} value={c}>{tr(COUNT_BY_LABEL[c])}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>{tr('dataWindows.warnAt')}</label>
                    <input type="number" min={0} value={w.warn_at ?? ''}
                      onChange={e => update(w.id, { warn_at: e.target.value === '' ? null : Number(e.target.value) })}
                      style={{ ...input, width: '80px', textAlign: 'center' }} />
                  </div>
                  <div>
                    <label style={lbl}>{tr('shared.color')}</label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {PALETTE.map(c => (
                        <button key={c} type="button" onClick={() => update(w.id, { color: c })}
                          style={{ width: '22px', height: '22px', borderRadius: '5px', background: c, cursor: 'pointer', border: w.color === c ? '2px solid white' : '1px solid #334155' }} />
                      ))}
                    </div>
                  </div>
                </div>

                <QueryBuilder
                  value={w.query}
                  onChange={q => update(w.id, { query: q })}
                  label={tr('dataWindows.windowQuery')}
                  presetNames={presetNames}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DataWindowsAdmin;
