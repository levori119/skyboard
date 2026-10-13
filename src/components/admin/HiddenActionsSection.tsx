// הגדרות כלליות → כפתורים ופעולות בעמדות.
//
// כל הכפתורים של העמדה במקום אחד, מקובצים לפי היכן שהם יושבים במסך, ודגל לכל
// אחד: מוצג / מוסתר. הקטלוג: shared/hiddenActions.js. כל לחיצה נשמרת מיד (אין
// כפתור "שמור" - מתג שלא נשמר נראה בדיוק כמו מתג שנשמר).
import { useEffect, useState } from 'react';
import { API_URL } from '../../config';
import { tr } from '../../i18n/tr';
import { customConfirm } from '../shared/ConfirmModal';
import { ACTIONS, ACTION_GROUPS, parseHiddenActions } from '../../../shared/hiddenActions';
import { refreshHiddenActions } from '../../hooks/useHiddenActions';

export function HiddenActionsSection() {
  const [hidden, setHidden] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/system/hidden-actions`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setHidden(parseHiddenActions(d.hidden)); })
      .catch(() => {});
  }, []);

  const save = async (next: string[]) => {
    if (saving) return;
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(`${API_URL}/system/hidden-actions`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      setHidden(parseHiddenActions(d.hidden));
      // הניהול רץ לפעמים באותו חלון של עמדה - שתתעדכן מיד ולא בסבב הבא
      void refreshHiddenActions();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id: string) => {
    if (!hidden) return;
    void save(hidden.includes(id) ? hidden.filter(x => x !== id) : [...hidden, id]);
  };

  const showAll = async () => {
    if (!hidden?.length) return;
    if (!await customConfirm(tr('actions.showAllConfirm'))) return;
    void save([]);
  };

  return (
    <div style={{ background: '#1e293b', borderRadius: '10px', padding: '16px 18px', maxWidth: '720px', marginTop: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
        <div style={{ color: '#e2e8f0', fontSize: '16px', fontWeight: 'bold', flex: 1 }}>🎛 {tr('actions.title')}</div>
        {!!hidden?.length && (
          <>
            <span style={{ color: '#f59e0b', fontSize: '12px' }}>{tr('actions.hiddenCount', { count: hidden.length })}</span>
            <button onClick={showAll} disabled={saving}
              style={{ padding: '4px 12px', borderRadius: '7px', border: '1px solid #334155', background: 'none', color: '#94a3b8', fontSize: '12px', cursor: saving ? 'wait' : 'pointer' }}>
              {tr('actions.showAll')}
            </button>
          </>
        )}
      </div>
      <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.6, margin: '0 0 12px' }}>{tr('actions.hint')}</p>
      {error && <p style={{ color: '#f87171', fontSize: '12px', margin: '0 0 10px' }}>{tr('actions.saveFailed')}</p>}

      {ACTION_GROUPS.map(group => (
        <div key={group} style={{ marginBottom: '12px' }}>
          <div style={{ color: '#7dd3fc', fontSize: '12px', fontWeight: 'bold', padding: '4px 0', borderBottom: '1px solid #334155', marginBottom: '6px' }}>
            {tr(`actions.group_${group}`)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px' }}>
            {ACTIONS.filter(a => a.group === group).map(a => {
              const off = !!hidden?.includes(a.id);
              return (
                <button key={a.id} data-testid={`hidden-action-${a.id}`} onClick={() => toggle(a.id)}
                  disabled={saving || hidden == null} aria-pressed={!off}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '7px 10px', borderRadius: '7px', border: `1px solid ${off ? '#f59e0b' : '#334155'}`, background: '#0f172a', color: off ? '#64748b' : '#e2e8f0', fontSize: '13px', textAlign: 'start', cursor: saving ? 'wait' : 'pointer', textDecoration: off ? 'line-through' : 'none' }}>
                  <span>{tr(`actions.${a.id}`)}</span>
                  <span style={{ fontSize: '11px', color: off ? '#f59e0b' : '#22c55e', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    {off ? tr('actions.hidden') : tr('actions.shown')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
