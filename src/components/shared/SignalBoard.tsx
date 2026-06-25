// SignalBoard — movable status-message board between workstations.
// My buttons (outgoing) toggle on/off (green/gray) and broadcast to chosen
// recipients; incoming active signals from other workstations are shown grouped
// by source. Catalog of known messages is per-workstation. Recipients see
// display-only. Polls every 6s.
import { useEffect, useRef, useState, useCallback } from 'react';
import { API_URL } from '../../config';

interface SignalBtn { id: number; preset_id: number; text: string; to_all: boolean; recipient_preset_ids: number[]; active: boolean; source: 'preset' | 'adhoc'; sort_order: number; }
interface Incoming { id: number; from_preset_id: number; from_preset_name: string; text: string; }
interface Props { presetId: number; allPresets: { id: number; name: string }[]; catalog: string[]; onClose: () => void; }

export default function SignalBoard({ presetId, allPresets, catalog, onClose }: Props) {
  const [buttons, setButtons] = useState<SignalBtn[]>([]);
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [pos, setPos] = useState({ x: 120, y: 90 });
  const [addOpen, setAddOpen] = useState(false);
  const [recipFor, setRecipFor] = useState<number | null>(null); // button id whose recipient picker is open
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, inc] = await Promise.all([
        fetch(`${API_URL}/signals?preset_id=${presetId}`).then(r => r.ok ? r.json() : []),
        fetch(`${API_URL}/signals/incoming?preset_id=${presetId}`).then(r => r.ok ? r.json() : []),
      ]);
      setButtons(Array.isArray(b) ? b.map((x: any) => ({ ...x, recipient_preset_ids: Array.isArray(x.recipient_preset_ids) ? x.recipient_preset_ids.map(Number) : [] })) : []);
      setIncoming(Array.isArray(inc) ? inc : []);
    } catch { /* keep last */ }
  }, [presetId]);

  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, [load]);

  const apiPut = async (id: number, body: any) => { await fetch(`${API_URL}/signals/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {}); load(); };
  const toggle = (b: SignalBtn) => { setButtons(prev => prev.map(x => x.id === b.id ? { ...x, active: !x.active } : x)); apiPut(b.id, { active: !b.active }); };
  const setRecipients = (b: SignalBtn, to_all: boolean, ids: number[]) => apiPut(b.id, { to_all, recipient_preset_ids: ids });
  const addButton = async (text: string) => {
    await fetch(`${API_URL}/signals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preset_id: presetId, text, source: 'adhoc', to_all: false, recipient_preset_ids: [] }) }).catch(() => {});
    setAddOpen(false); load();
  };
  const removeButton = async (id: number) => { await fetch(`${API_URL}/signals/${id}`, { method: 'DELETE' }).catch(() => {}); load(); };

  const onDragDown = (e: React.PointerEvent) => {
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
    const move = (me: PointerEvent) => { if (dragRef.current) setPos({ x: dragRef.current.ox + me.clientX - dragRef.current.sx, y: dragRef.current.oy + me.clientY - dragRef.current.sy }); };
    const up = () => { dragRef.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const presetName = (id: number) => allPresets.find(p => p.id === id)?.name || `עמדה ${id}`;
  const usedTexts = new Set(buttons.map(b => b.text));
  const catalogLeft = catalog.filter(t => !usedTexts.has(t));
  const incomingBySource = incoming.reduce((acc, s) => { (acc[s.from_preset_id] ||= []).push(s); return acc; }, {} as Record<number, Incoming[]>);

  return (
    <div style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 9000, width: 460, maxHeight: '80vh', background: '#0f172a', border: '2px solid #2563eb', borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.6)', direction: 'rtl', color: '#e2e8f0', display: 'flex', flexDirection: 'column' }}>
      {/* Header (drag handle) */}
      <div onPointerDown={onDragDown} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#1e293b', borderRadius: '12px 12px 0 0', cursor: 'move', borderBottom: '1px solid #334155' }}>
        <span style={{ fontWeight: 'bold', fontSize: 15 }}>📡 לוח הודעות</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setAddOpen(true)} style={btn('#2563eb')}>➕ הוסף</button>
          <button onClick={onClose} style={btn('#7f1d1d')}>✕</button>
        </div>
      </div>

      <div style={{ overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Outgoing (my buttons) */}
        <div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 'bold' }}>שלי (יוצא)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {buttons.length === 0 && <span style={{ fontSize: 12, color: '#475569' }}>אין כפתורים — לחץ "הוסף"</span>}
            {buttons.map(b => (
              <div key={b.id} style={{ position: 'relative' }}>
                <button onClick={() => toggle(b)} title={b.active ? 'פעיל — לחץ לכיבוי' : 'כבוי — לחץ להפעלה'}
                  style={{ minWidth: 110, padding: '10px 12px', borderRadius: 8, border: `2px solid ${b.active ? '#22c55e' : '#475569'}`, background: b.active ? '#16a34a' : '#1e293b', color: b.active ? 'white' : '#94a3b8', fontWeight: 'bold', fontSize: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span>{b.active ? '🟢' : '⚪'} {b.text}</span>
                  <span onClick={e => { e.stopPropagation(); setRecipFor(recipFor === b.id ? null : b.id); }} style={{ fontSize: 10, color: b.active ? '#bbf7d0' : '#64748b', cursor: 'pointer' }}>
                    👥 {b.to_all ? 'כולם' : (b.recipient_preset_ids.length ? b.recipient_preset_ids.map(presetName).join(', ') : 'בחר נמענים')}
                  </span>
                </button>
                {b.source === 'adhoc' && <button onClick={() => removeButton(b.id)} title="הסר כפתור" style={{ position: 'absolute', top: -7, left: -7, background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: 16, height: 16, fontSize: 10, cursor: 'pointer', lineHeight: '16px', padding: 0 }}>✕</button>}
                {recipFor === b.id && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: 8, zIndex: 10, minWidth: 160, boxShadow: '0 6px 20px #000a' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', marginBottom: 4 }}>
                      <input type="checkbox" checked={b.to_all} onChange={e => setRecipients(b, e.target.checked, b.recipient_preset_ids)} /> כולם
                    </label>
                    {!b.to_all && allPresets.filter(p => p.id !== presetId).map(p => (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                        <input type="checkbox" checked={b.recipient_preset_ids.includes(p.id)} onChange={e => setRecipients(b, false, e.target.checked ? [...b.recipient_preset_ids, p.id] : b.recipient_preset_ids.filter(x => x !== p.id))} /> {p.name}
                      </label>
                    ))}
                    <button onClick={() => setRecipFor(null)} style={{ ...btn('#334155'), marginTop: 6, width: '100%' }}>סגור</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Incoming grouped by source */}
        <div style={{ borderTop: '1px solid #334155', paddingTop: 10 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 'bold' }}>נכנס (לפי גורם)</div>
          {Object.keys(incomingBySource).length === 0 && <span style={{ fontSize: 12, color: '#475569' }}>אין הודעות נכנסות</span>}
          {Object.entries(incomingBySource).map(([src, sigs]) => (
            <div key={src} style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: '#93c5fd', fontWeight: 'bold' }}>▸ {sigs[0].from_preset_name || presetName(Number(src))}: </span>
              {sigs.map(s => <span key={s.id} style={{ display: 'inline-block', background: '#14532d', color: '#86efac', border: '1px solid #22c55e', borderRadius: 6, padding: '2px 8px', fontSize: 13, fontWeight: 'bold', margin: '2px 3px' }}>🟢 {s.text}</span>)}
            </div>
          ))}
        </div>
      </div>

      {/* Add dialog */}
      {addOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setAddOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0f172a', border: '2px solid #2563eb', borderRadius: 12, padding: 18, minWidth: 300, direction: 'rtl' }}>
            <div style={{ fontWeight: 'bold', marginBottom: 10 }}>➕ הוסף הודעה</div>
            {catalogLeft.length > 0 && <>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>הודעות ידועות:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {catalogLeft.map(t => <button key={t} onClick={() => addButton(t)} style={btn('#1e3a5f')}>{t}</button>)}
              </div>
            </>}
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>הודעה חדשה (קצרה):</div>
            <AddCustom onAdd={addButton} />
            <button onClick={() => setAddOpen(false)} style={{ ...btn('#334155'), marginTop: 12, width: '100%' }}>סגור</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddCustom({ onAdd }: { onAdd: (t: string) => void }) {
  const [v, setV] = useState('');
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input value={v} onChange={e => setV(e.target.value)} maxLength={120} placeholder="טקסט קצר..." onKeyDown={e => { if (e.key === 'Enter' && v.trim()) { onAdd(v.trim()); setV(''); } }}
        style={{ flex: 1, padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: 'white', fontSize: 13, direction: 'rtl' }} />
      <button onClick={() => { if (v.trim()) { onAdd(v.trim()); setV(''); } }} style={btn('#2563eb')}>הוסף</button>
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return { background: bg, color: 'white', border: 'none', borderRadius: 6, padding: '5px 12px', fontWeight: 'bold', fontSize: 12, cursor: 'pointer' };
}
