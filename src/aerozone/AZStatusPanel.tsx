import React, { useState, useEffect } from 'react';
import {
  AZPolygon, AZPolygonStatus, OperationalStatus, GRFStatus, VisibilityCategory,
  OPERATIONAL_LABELS, OPERATIONAL_COLORS, GRF_LABELS, GRF_COLORS, POLYGON_TYPE_LABELS,
  VISIBILITY_LABELS,
} from './types';

interface Props {
  polygon: AZPolygon | null;
  status: AZPolygonStatus | null;
  onSave: (polygonId: number, patch: Partial<AZPolygonStatus>) => Promise<void>;
  onClose: () => void;
  lightMode?: boolean;
}

export function AZStatusPanel({ polygon, status, onSave, onClose, lightMode }: Props) {
  const [operational, setOperational] = useState<OperationalStatus>('operational');
  const [grf, setGrf] = useState<GRFStatus>('dry');
  const [rvr, setRvr] = useState<string>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status) {
      setOperational(status.operational);
      setGrf(status.grf);
      setRvr(status.rvr != null ? String(status.rvr) : '');
      setNote(status.note || '');
    } else {
      setOperational('operational');
      setGrf('dry');
      setRvr('');
      setNote('');
    }
  }, [polygon?.id, status]);

  if (!polygon) return null;

  const bg = lightMode ? '#ffffff' : '#1e293b';
  const border = lightMode ? '#e2e8f0' : '#334155';
  const textMain = lightMode ? '#0f172a' : '#f1f5f9';
  const textSub = lightMode ? '#64748b' : '#94a3b8';

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(polygon.id, {
        operational,
        grf,
        rvr: rvr ? parseInt(rvr) : null,
        note: note || null,
      });
    } finally {
      setSaving(false);
    }
  };

  const visibilityCategory: VisibilityCategory = (() => {
    const v = parseInt(rvr || '9999');
    if (v >= 800) return 'good';
    if (v >= 400) return 'reduced';
    return 'low';
  })();

  return (
    <div style={{ width: 280, background: bg, borderLeft: `1px solid ${border}`, display: 'flex', flexDirection: 'column', direction: 'rtl', flexShrink: 0 }}>
      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '15px', color: textMain }}>{polygon.name}</div>
          <div style={{ fontSize: '11px', color: textSub, marginTop: '2px' }}>{POLYGON_TYPE_LABELS[polygon.type]}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: textSub, cursor: 'pointer', fontSize: '18px', padding: '2px 6px' }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {/* Current status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: OPERATIONAL_COLORS[operational] }} />
          <span style={{ color: OPERATIONAL_COLORS[operational], fontWeight: 'bold', fontSize: '14px' }}>{OPERATIONAL_LABELS[operational]}</span>
          {status?.updated_at && (
            <span style={{ fontSize: '10px', color: textSub, marginRight: 'auto' }}>
              {new Date(status.updated_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* Operational status buttons */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', color: textSub, marginBottom: '6px', fontWeight: 'bold' }}>סטטוס מבצעיות</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {(['operational', 'partial', 'closed', 'maintenance'] as OperationalStatus[]).map(s => (
              <button key={s} onClick={() => setOperational(s)}
                style={{
                  padding: '10px 6px', border: `2px solid ${operational === s ? OPERATIONAL_COLORS[s] : border}`,
                  borderRadius: '8px', background: operational === s ? `${OPERATIONAL_COLORS[s]}22` : 'transparent',
                  color: operational === s ? OPERATIONAL_COLORS[s] : textSub,
                  cursor: 'pointer', fontSize: '12px', fontWeight: operational === s ? 'bold' : 'normal',
                  transition: 'all 0.15s',
                }}>
                {OPERATIONAL_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* GRF */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', color: textSub, marginBottom: '6px', fontWeight: 'bold' }}>🌧 סטטוס GRF (רטיבות)</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['dry', 'slippery', 'wet'] as GRFStatus[]).map(g => (
              <button key={g} onClick={() => setGrf(g)}
                style={{
                  flex: 1, padding: '8px 4px', border: `2px solid ${grf === g ? GRF_COLORS[g] : border}`,
                  borderRadius: '7px', background: grf === g ? `${GRF_COLORS[g]}22` : 'transparent',
                  color: grf === g ? GRF_COLORS[g] : textSub,
                  cursor: 'pointer', fontSize: '11px', fontWeight: grf === g ? 'bold' : 'normal',
                  transition: 'all 0.15s',
                }}>
                {GRF_LABELS[g]}
              </button>
            ))}
          </div>
        </div>

        {/* RVR */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', color: textSub, marginBottom: '6px', fontWeight: 'bold' }}>👁 ראות RVR (מטרים)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="number" value={rvr} onChange={e => setRvr(e.target.value)}
              placeholder="ריק = טובה"
              min={0} max={9999} step={50}
              style={{ flex: 1, padding: '7px 10px', background: lightMode ? '#f8fafc' : '#0f172a', border: `1px solid ${border}`, borderRadius: '6px', color: textMain, fontSize: '13px', direction: 'ltr' }}
            />
            <div style={{
              padding: '6px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold',
              background: visibilityCategory === 'good' ? '#16a34a22' : visibilityCategory === 'reduced' ? '#9ca3af22' : '#1f2937',
              color: visibilityCategory === 'good' ? '#22c55e' : visibilityCategory === 'reduced' ? '#9ca3af' : '#4b5563',
            }}>
              {VISIBILITY_LABELS[visibilityCategory]}
            </div>
          </div>
          {rvr && (
            <input type="range" min={0} max={2000} step={50} value={parseInt(rvr) || 0}
              onChange={e => setRvr(e.target.value)}
              style={{ width: '100%', marginTop: '6px', accentColor: '#3b82f6' }}
            />
          )}
        </div>

        {/* Note */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', color: textSub, marginBottom: '6px', fontWeight: 'bold' }}>📝 הערה</div>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="הוסף הערה..."
            rows={3}
            style={{ width: '100%', padding: '8px 10px', background: lightMode ? '#f8fafc' : '#0f172a', border: `1px solid ${border}`, borderRadius: '6px', color: textMain, fontSize: '12px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', direction: 'rtl' }}
          />
        </div>
      </div>

      {/* Save button */}
      <div style={{ padding: '12px 14px', borderTop: `1px solid ${border}` }}>
        <button onClick={handleSave} disabled={saving}
          style={{ width: '100%', padding: '11px', background: saving ? '#334155' : '#1d4ed8', color: 'white', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
          {saving ? '...שומר' : '💾 עדכן סטטוס'}
        </button>
      </div>
    </div>
  );
}
