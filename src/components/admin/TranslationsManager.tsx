import React, { useMemo, useState, useEffect } from 'react';
import { API_URL } from '../../config';
import { registryRows, REGISTRY } from '../../i18n/registry';
import i18n, { loadTranslationOverrides } from '../../i18n';
import { tr } from '../../i18n/tr';

type Row = { key: string; group: string; groupLabel: string; he: string; en: string };
type Edit = { he: string; en: string };

/**
 * ניהול תרגומים — טבלה של: שם טכני | עברית | אנגלית, מקובצת לפי דומיין.
 *
 * ברירות המחדל מגיעות מהקבצים (src/i18n/registry/*.json, ב-git).
 * מה שנערך כאן נשמר ל-DB ו**דורס** אותן בזמן ריצה — בלי build מחדש, בלי שינוי קוד.
 * "איפוס" מוחק את הדריסה ומחזיר את הערך שבקובץ.
 */
export default function TranslationsManager({ crewMemberName }: { crewMemberName?: string | null }) {
  const base = useMemo(() => registryRows(), []);
  const [overrides, setOverrides] = useState<Record<string, Edit>>({});   // מה-DB
  const [edits, setEdits] = useState<Record<string, Edit>>({});           // עריכות שטרם נשמרו
  const [group, setGroup] = useState<string>('all');
  const [q, setQ] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/translations`)
      .then(r => (r.ok ? r.json() : []))
      .then((rows: { key: string; he: string | null; en: string | null }[]) => {
        const o: Record<string, Edit> = {};
        for (const r of rows) o[r.key] = { he: r.he ?? '', en: r.en ?? '' };
        setOverrides(o);
      })
      .catch(() => {});
  }, []);

  // הערך התקף: עריכה שלא נשמרה > דריסה מה-DB > ברירת המחדל מהקובץ
  const val = (row: Row, f: 'he' | 'en') =>
    edits[row.key]?.[f] ?? overrides[row.key]?.[f] ?? row[f];

  const isOverridden = (row: Row) => !!overrides[row.key];
  const isDirty = (row: Row) => !!edits[row.key];

  const setField = (row: Row, f: 'he' | 'en', v: string) =>
    setEdits(prev => ({
      ...prev,
      [row.key]: { he: f === 'he' ? v : val(row, 'he'), en: f === 'en' ? v : val(row, 'en') },
    }));

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return base.filter(r => {
      if (group !== 'all' && r.group !== group) return false;
      if (onlyMissing && val(r, 'en').trim()) return false;
      if (!needle) return true;
      return (
        r.key.toLowerCase().includes(needle) ||
        val(r, 'he').toLowerCase().includes(needle) ||
        val(r, 'en').toLowerCase().includes(needle)
      );
    });
  }, [base, group, q, onlyMissing, edits, overrides]);

  const dirtyCount = Object.keys(edits).length;
  const missingCount = base.filter(r => !val(r, 'en').trim()).length;

  const save = async () => {
    if (!dirtyCount) return;
    setSaving(true);
    setMsg('');
    try {
      const payload = Object.entries(edits).map(([key, e]) => ({ key, he: e.he, en: e.en }));
      const res = await fetch(`${API_URL}/translations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payload, updatedBy: crewMemberName ?? null }),
      });
      if (!res.ok) throw new Error('save failed');
      setOverrides(prev => ({ ...prev, ...edits }));
      setEdits({});
      await loadTranslationOverrides(API_URL); // חל מיד — בלי רענון
      setMsg(`✅ נשמרו ${payload.length} שינויים — הוחלו מיד`);
    } catch {
      setMsg('❌ שמירה נכשלה');
    }
    setSaving(false);
  };

  const reset = async (row: Row) => {
    await fetch(`${API_URL}/translations/${encodeURIComponent(row.key)}`, { method: 'DELETE' }).catch(() => {});
    setOverrides(prev => { const n = { ...prev }; delete n[row.key]; return n; });
    setEdits(prev => { const n = { ...prev }; delete n[row.key]; return n; });
    i18n.addResource('he', row.group, row.key.split('.').slice(1).join('.'), row.he);
    i18n.addResource('en', row.group, row.key.split('.').slice(1).join('.'), row.en || row.he);
    setMsg(`↺ ${row.key} אופס לברירת המחדל שבקובץ`);
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '5px 7px', borderRadius: 5, border: '1px solid #334155',
    background: '#0f172a', color: '#e2e8f0', fontSize: 13, boxSizing: 'border-box',
  };
  const th: React.CSSProperties = {
    padding: '8px 10px', textAlign: 'start', fontSize: 12, fontWeight: 'bold',
    color: '#94a3b8', borderBottom: '1px solid #334155', position: 'sticky', top: 0, background: '#1e293b',
  };

  return (
    <div style={{ color: '#e2e8f0' }}>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10, lineHeight: 1.6 }}>
        {tr('admin.translationsHint')}
      </div>

      {/* סרגל: קבוצה · חיפוש · חסרים · שמירה */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <select value={group} onChange={e => setGroup(e.target.value)} style={{ ...inp, width: 'auto', minWidth: 190 }}>
          <option value="all">כל הקבוצות ({base.length})</option>
          {Object.entries(REGISTRY).map(([g, data]) => (
            <option key={g} value={g}>
              {data._group} — {g} ({Object.keys(data.keys).length})
            </option>
          ))}
        </select>

        <input value={q} onChange={e => setQ(e.target.value)} placeholder={tr('admin.trSearchPlaceholder')}
          style={{ ...inp, width: 'auto', flex: 1, minWidth: 200 }} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} />
          חסרי אנגלית ({missingCount})
        </label>

        <button onClick={save} disabled={!dirtyCount || saving}
          style={{ padding: '7px 16px', borderRadius: 7, border: 'none', cursor: dirtyCount ? 'pointer' : 'default',
                   background: dirtyCount ? '#2563eb' : '#334155', color: dirtyCount ? 'white' : '#64748b',
                   fontWeight: 'bold', fontSize: 13, whiteSpace: 'nowrap' }}>
          {saving ? '...' : `💾 שמור (${dirtyCount})`}
        </button>
      </div>

      {msg && <div style={{ fontSize: 12, color: msg.startsWith('❌') ? '#fca5a5' : '#86efac', marginBottom: 8 }}>{msg}</div>}

      <div style={{ maxHeight: '58vh', overflowY: 'auto', border: '1px solid #334155', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: '26%' }}>{tr('admin.colTechnicalKey')}</th>
              <th style={{ ...th, width: '32%' }}>{tr('admin.colHebrew')}</th>
              <th style={{ ...th, width: '32%' }}>{tr('admin.colEnglish')}</th>
              <th style={{ ...th, width: '10%' }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const dirty = isDirty(r);
              const over = isOverridden(r);
              return (
                <tr key={r.key} style={{ background: dirty ? '#1e3a5f' : 'transparent', borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '5px 10px', verticalAlign: 'middle' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#93c5fd', direction: 'ltr', textAlign: 'start' }}>{r.key}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>
                      {r.groupLabel}{over && <span style={{ color: '#fbbf24' }}> {tr('admin.overridden')}</span>}
                    </div>
                  </td>
                  <td style={{ padding: '5px 6px' }}>
                    <input value={val(r, 'he')} onChange={e => setField(r, 'he', e.target.value)} style={inp} dir="rtl" />
                  </td>
                  <td style={{ padding: '5px 6px' }}>
                    <input value={val(r, 'en')} onChange={e => setField(r, 'en', e.target.value)} dir="ltr"
                      placeholder={tr('admin.trMissingEnPlaceholder')}
                      style={{ ...inp, borderColor: val(r, 'en').trim() ? '#334155' : '#7c2d12' }} />
                  </td>
                  <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                    {over && (
                      <button onClick={() => reset(r)} title={tr('admin.trResetTitle')}
                        style={{ background: '#334155', border: 'none', color: '#94a3b8', borderRadius: 5, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>↺</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>{tr('admin.noResults')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
        מוצגות {rows.length} מתוך {base.length} · מתורגמות לאנגלית: {base.length - missingCount}
      </div>
    </div>
  );
}
