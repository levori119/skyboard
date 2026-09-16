// הקלטת פעולות במסך - הסעיף בניהול הטכני. אפיון: SCREEN_RECORDING_SPEC.md
//
// יושב בלשונית "בסיסים" (אותה טבלה מחזיקה בסיסים **ויב"אות**), ומוצג למנהל
// הטכני בלבד: ה-PATH הוא פרט תשתית - שם שרת ושיתוף ברשת הבסיס - וההגדרה
// חלה על **כל** עמדות אותו בסיס.
//
// למה האומדן מוצג ליד ההגדרה: מי שקובע 10 fps באיכות גבוהה על דיסק רשת צריך
// לראות באותו מסך שהוא הזמין לשם ~100GB לשבוע, ולא לגלות זאת מהדיסק.
//
// המסך הזה כהה בקביעות, כמו כל מסך הניהול (`themeMode="dark"` מקובע בו) -
// ולכן הצבעים כאן קשיחים כמו בסעיפים השכנים, במכוון ולא בהיסח הדעת.
import React, { useEffect, useState } from 'react';
import { tr } from '../../i18n/tr';
import {
  estimateRecordingBytes, isSafeRecordingPath, normalizeRecordingConfig,
  RECORDING_LIMITS, type RecordingQuality,
} from '../../../shared/screenRecording';

interface BaseRow {
  id: number;
  name: string;
  code: string | null;
  recording_enabled: boolean;
  recording_path: string | null;
  recording_segment_minutes: number;
  recording_retention_days: number;
  recording_fps: number;
  recording_quality: RecordingQuality;
}

type Form = {
  enabled: boolean; path: string; segmentMinutes: number;
  retentionDays: number; fps: number; quality: RecordingQuality;
};

const formOf = (row: BaseRow): Form => normalizeRecordingConfig(row) as Form;

const QUALITIES: { value: RecordingQuality; labelKey: string }[] = [
  { value: 'low', labelKey: 'screenRec.qualityLow' },
  { value: 'medium', labelKey: 'screenRec.qualityMedium' },
  { value: 'high', labelKey: 'screenRec.qualityHigh' },
];

/** נפח קריא לאדם. GB/TB - זו יחידת השיחה מול מי שמקצה דיסק. */
function humanSize(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  if (gb >= 10) return `${Math.round(gb)} GB`;
  return `${gb.toFixed(1)} GB`;
}

const label: React.CSSProperties = { fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '3px' };
const input: React.CSSProperties = {
  background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155',
  borderRadius: '5px', padding: '6px 8px', fontSize: '12px', width: '100%',
};

export interface ScreenRecordingSectionProps {
  apiUrl: string;
}

export default function ScreenRecordingSection({ apiUrl }: ScreenRecordingSectionProps) {
  const [rows, setRows] = useState<BaseRow[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [msg, setMsg] = useState<{ id: number; text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetch(`${apiUrl}/screen-recording/bases`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => setRows(Array.isArray(d) ? d : []))
      .catch(() => { /* נתק - נשארים עם מה שיש */ });
  };
  useEffect(load, [apiUrl]);

  const openRow = (row: BaseRow) => {
    setMsg(null);
    if (openId === row.id) { setOpenId(null); setForm(null); return; }
    setOpenId(row.id);
    setForm(formOf(row));
  };

  const save = async (row: BaseRow) => {
    if (!form) return;
    // אימות מקומי לפני הבקשה: המנהל מקבל את הסיבה ליד השדה, לא "שגיאה בשמירה"
    if (form.path && !isSafeRecordingPath(form.path)) {
      setMsg({ id: row.id, text: tr('screenRec.adminInvalidPath'), ok: false });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${apiUrl}/screen-recording/bases/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recording_enabled: form.enabled,
          recording_path: form.path,
          recording_segment_minutes: form.segmentMinutes,
          recording_retention_days: form.retentionDays,
          recording_fps: form.fps,
          recording_quality: form.quality,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setMsg({ id: row.id, text: body?.error === 'invalid_path' ? tr('screenRec.adminInvalidPath') : tr('screenRec.adminSaveFailed'), ok: false });
        return;
      }
      const saved: BaseRow = await res.json();
      setRows(prev => prev.map(r => (r.id === saved.id ? saved : r)));
      setForm(formOf(saved));
      setMsg({ id: row.id, text: tr('screenRec.adminSaved'), ok: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155', marginBottom: '16px' }}>
      <h3 style={{ margin: '0 0 6px 0', fontSize: '14px', color: '#7dd3fc' }}>{tr('screenRec.adminTitle')}</h3>
      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px', lineHeight: 1.5 }}>{tr('screenRec.adminHint')}</div>
      <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>{tr('screenRec.adminKeepNote')}</div>
      <div style={{ fontSize: '11px', color: '#fbbf24', marginBottom: '12px', lineHeight: 1.5 }}>{tr('screenRec.adminBrowserNote')}</div>

      {rows.map(row => {
        const isOpen = openId === row.id;
        const cfg = normalizeRecordingConfig(row);
        const pathBad = Boolean(cfg.path) && !isSafeRecordingPath(cfg.path);
        return (
          <div key={row.id} style={{ borderTop: '1px solid #334155', paddingBlock: '8px' }}>
            <div
              onClick={() => openRow(row)}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
            >
              <span style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: 'bold', minWidth: '90px' }}>{row.name}</span>
              <span style={{ fontSize: '11px', color: cfg.enabled ? '#86efac' : '#64748b' }}>
                {cfg.enabled ? '● ' + tr('screenRec.adminEnabled') : '○ ' + tr('screenRec.adminEnabled')}
              </span>
              <span dir="ltr" style={{ fontSize: '11px', color: pathBad ? '#f87171' : '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'start' }}>
                {cfg.path || '-'}
              </span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            {isOpen && form && (
              <div style={{ marginTop: '10px', display: 'grid', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#e2e8f0' }}>
                  <input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />
                  {tr('screenRec.adminEnabled')}
                </label>

                <div>
                  <span style={label}>{tr('screenRec.adminPath')}</span>
                  <input
                    dir="ltr"
                    value={form.path}
                    placeholder={tr('screenRec.adminPathPlaceholder')}
                    onChange={e => setForm({ ...form, path: e.target.value })}
                    style={{ ...input, textAlign: 'start' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
                  <div>
                    <span style={label}>{tr('screenRec.adminSegment')}</span>
                    <input
                      type="number" min={RECORDING_LIMITS.segmentMinutes.min} max={RECORDING_LIMITS.segmentMinutes.max}
                      value={form.segmentMinutes}
                      onChange={e => setForm({ ...form, segmentMinutes: Number(e.target.value) })}
                      style={input}
                    />
                  </div>
                  <div>
                    <span style={label}>{tr('screenRec.adminRetention')}</span>
                    <input
                      type="number" min={RECORDING_LIMITS.retentionDays.min} max={RECORDING_LIMITS.retentionDays.max}
                      value={form.retentionDays}
                      onChange={e => setForm({ ...form, retentionDays: Number(e.target.value) })}
                      style={input}
                    />
                  </div>
                  <div>
                    <span style={label}>{tr('screenRec.adminFps')}</span>
                    <input
                      type="number" min={RECORDING_LIMITS.fps.min} max={RECORDING_LIMITS.fps.max}
                      value={form.fps}
                      onChange={e => setForm({ ...form, fps: Number(e.target.value) })}
                      style={input}
                    />
                  </div>
                  <div>
                    <span style={label}>{tr('screenRec.adminQuality')}</span>
                    <select value={form.quality} onChange={e => setForm({ ...form, quality: e.target.value as RecordingQuality })} style={input}>
                      {QUALITIES.map(q => <option key={q.value} value={q.value}>{tr(q.labelKey)}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ fontSize: '11px', color: '#fbbf24' }}>
                  {tr('screenRec.adminEstimate', {
                    size: humanSize(estimateRecordingBytes({ quality: form.quality, hoursPerDay: 8, retentionDays: form.retentionDays })),
                  })}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    onClick={() => void save(row)} disabled={saving}
                    style={{ padding: '6px 16px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', cursor: saving ? 'default' : 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >
                    {tr('shared.save')}
                  </button>
                  {msg && msg.id === row.id && (
                    <span style={{ fontSize: '11px', color: msg.ok ? '#86efac' : '#f87171' }}>{msg.text}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
