import React, { useState } from 'react';
import { API_URL } from '../../config';
import { tr } from '../../i18n/tr';
import { disabledPresetIds, presetSectorIds, stationDirection, type StationDirection } from '../../../shared/transferPointStations.js';

/**
 * **עמדות של נקודת העברה** - הדלקה / כיבוי פר-עמדה (ניהול ← נקודות העברה).
 *
 * נקודה כבויה לעמדה ממשיכה להופיע אצלה, אבל לא רגישה: אי אפשר לשלוח אליה,
 * והעברות פתוחות דרכה שקשורות לעמדה **חוזרות למוסר** (עם הערה בפופאפ). השינוי
 * חל **מיד** - בלי כפתור "עדכון" - כי הוא פעולה תפעולית ולא עריכת טופס.
 */
export default function TransferPointStationsEditor({ sector, presets, onChanged }: { sector: any; presets: any[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const sid = Number(sector?.id);
  const using = presets.filter(p => presetSectorIds(p).has(sid));
  const off = new Set(disabledPresetIds(sector));

  // כיוון העמדה בנקודה: מוסרת / מקבלת / שניהם. חל מיד, כמו ההדלקה
  const setDir = async (p: any, direction: StationDirection) => {
    if (stationDirection(sector, p.id) === direction) return;
    setBusy(Number(p.id)); setMsg(null);
    try {
      const r = await fetch(`${API_URL}/sectors/${sid}/stations/${p.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || String(r.status));
      if (j.returned > 0) setMsg(tr('admin.tpStationReturned', { count: j.returned }));
      onChanged();
    } catch {
      setMsg(tr('admin.tpStationFailed'));
    } finally { setBusy(null); }
  };

  const toggle = async (p: any) => {
    const enabled = off.has(Number(p.id));
    if (!enabled && !window.confirm(tr('admin.tpStationOffConfirm', { station: p.name }))) return;
    setBusy(Number(p.id)); setMsg(null);
    try {
      const r = await fetch(`${API_URL}/sectors/${sid}/stations/${p.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || String(r.status));
      if (!enabled && j.returned > 0) setMsg(tr('admin.tpStationReturned', { count: j.returned }));
      onChanged();
    } catch {
      setMsg(tr('admin.tpStationFailed'));
    } finally { setBusy(null); }
  };

  return (
    <div data-testid="tp-stations" style={{ marginTop: '15px', padding: '12px', background: '#0f172a', borderRadius: '8px', border: '1px solid #334155' }}>
      <div style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>{tr('admin.tpStationsTitle')}</div>
      <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '8px' }}>{tr('admin.tpStationsHint')}</div>
      {using.length === 0 && <div style={{ color: '#64748b', fontSize: '12px' }}>{tr('admin.tpStationsNone')}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {using.map(p => {
          const isOn = !off.has(Number(p.id));
          const dir = stationDirection(sector, p.id);
          const DIRS: { v: StationDirection; label: string }[] = [
            { v: 'both', label: `⇄ ${tr('admin.tpDirBoth')}` },
            { v: 'send', label: `📤 ${tr('admin.tpDirSend')}` },
            { v: 'receive', label: `📥 ${tr('admin.tpDirReceive')}` },
          ];
          return (
            <div key={p.id} style={{ display: 'inline-flex', flexDirection: 'column', gap: '3px' }}>
            <button type="button" data-testid="tp-station" data-on={isOn || undefined} disabled={busy !== null}
              onClick={() => toggle(p)} title={tr(isOn ? 'admin.tpStationTurnOff' : 'admin.tpStationTurnOn')}
              style={{
                padding: '5px 10px', borderRadius: '6px', cursor: busy !== null ? 'wait' : 'pointer', fontSize: '12px', fontFamily: 'inherit',
                border: `1px solid ${isOn ? '#22c55e' : '#475569'}`, background: isOn ? '#14532d' : '#1e293b',
                color: isOn ? '#86efac' : '#94a3b8', textDecoration: isOn ? 'none' : 'line-through',
              }}>
              {isOn ? '⏻ ' : '⭘ '}{p.name}
            </button>
            {isOn && (
              <div role="group" aria-label={tr('admin.tpDirTitle')} style={{ display: 'flex', gap: '2px' }}>
                {DIRS.map(o => (
                  <button key={o.v} type="button" data-testid="tp-dir" data-dir={o.v} data-on={dir === o.v || undefined} disabled={busy !== null}
                    onClick={() => setDir(p, o.v)}
                    style={{ flex: 1, padding: '2px 4px', fontSize: '10px', fontFamily: 'inherit', borderRadius: '4px', cursor: busy !== null ? 'wait' : 'pointer',
                      border: `1px solid ${dir === o.v ? '#0ea5e9' : '#334155'}`, background: dir === o.v ? '#0c4a6e' : 'transparent', color: dir === o.v ? '#e0f2fe' : '#64748b' }}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            </div>
          );
        })}
      </div>
      {msg && <div style={{ marginTop: '8px', fontSize: '12px', color: '#fbbf24' }}>{msg}</div>}
    </div>
  );
}
