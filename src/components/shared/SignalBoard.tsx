// SignalBoard — compact, always-on status-message board between workstations.
// Layout: a narrow panel of sections, each with a header bar + a 2-column grid of
// rectangular buttons (gray = off, green = on). First section "הודעות שלי" is my
// outgoing buttons (toggle + recipients); the rest are incoming active signals
// grouped by source workstation (display-only), and the groups are reorderable.
// Shown in-view automatically when there are messages; otherwise a small 📡 pill.
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { API_URL } from '../../config';

interface SignalBtn { id: number; preset_id: number; text: string; to_all: boolean; recipient_preset_ids: number[]; active: boolean; source: 'preset' | 'adhoc'; sort_order: number; }
interface Incoming { id: number; from_preset_id: number; from_preset_name: string; text: string; }
type CatItem = { text: string; to_all: boolean; recipients: number[]; default: boolean };
type CatInput = string | { text: string; to_all?: boolean; recipients?: number[]; default?: boolean };
interface Props { presetId: number; allPresets: { id: number; name: string }[]; catalog: CatInput[]; }

export default function SignalBoard({ presetId, allPresets, catalog }: Props) {
  const catItems = useMemo<CatItem[]>(() => (catalog || []).map(it => typeof it === 'string'
    ? { text: it, to_all: false, recipients: [], default: false }
    : { text: it.text || '', to_all: !!it.to_all, recipients: Array.isArray(it.recipients) ? it.recipients.map(Number) : [], default: !!it.default }), [catalog]);
  const didSyncRef = useRef(false);
  const [buttons, setButtons] = useState<SignalBtn[]>([]);
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [pos, setPos] = useState({ x: 16, y: 70 });
  const [addOpen, setAddOpen] = useState(false);
  const [recipFor, setRecipFor] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [groupOrder, setGroupOrder] = useState<number[]>(() => { try { return JSON.parse(localStorage.getItem(`sigGroupOrder_${presetId}`) || '[]'); } catch { return []; } });
  const saveOrder = (o: number[]) => { setGroupOrder(o); try { localStorage.setItem(`sigGroupOrder_${presetId}`, JSON.stringify(o)); } catch { /* ignore */ } };

  const norm = (b: any[]): SignalBtn[] => Array.isArray(b) ? b.map((x: any) => ({ ...x, recipient_preset_ids: Array.isArray(x.recipient_preset_ids) ? x.recipient_preset_ids.map(Number) : [] })) : [];
  const load = useCallback(async () => {
    try {
      const [b, inc] = await Promise.all([
        fetch(`${API_URL}/signals?preset_id=${presetId}`).then(r => r.ok ? r.json() : []),
        fetch(`${API_URL}/signals/incoming?preset_id=${presetId}`).then(r => r.ok ? r.json() : []),
      ]);
      let myBtns = norm(b);
      // one-time: instantiate "ב"מ" (default) catalog items as preset buttons (with their recipients)
      if (!didSyncRef.current && catItems.length) {
        didSyncRef.current = true;
        const existing = new Set(myBtns.map(x => x.text));
        const toCreate = catItems.filter(c => c.default && c.text && !existing.has(c.text));
        if (toCreate.length) {
          await Promise.all(toCreate.map(c => fetch(`${API_URL}/signals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preset_id: presetId, text: c.text, source: 'preset', to_all: c.to_all, recipient_preset_ids: c.recipients }) }).catch(() => {})));
          myBtns = norm(await fetch(`${API_URL}/signals?preset_id=${presetId}`).then(r => r.ok ? r.json() : b).catch(() => b));
        }
      }
      setButtons(myBtns);
      setIncoming(Array.isArray(inc) ? inc : []);
    } catch { /* keep last */ }
  }, [presetId, catItems]);

  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, [load]);

  const apiPut = async (id: number, body: any) => { await fetch(`${API_URL}/signals/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {}); load(); };
  const toggle = (b: SignalBtn) => { setButtons(prev => prev.map(x => x.id === b.id ? { ...x, active: !x.active } : x)); apiPut(b.id, { active: !b.active }); };
  const setRecipients = (b: SignalBtn, to_all: boolean, ids: number[]) => apiPut(b.id, { to_all, recipient_preset_ids: ids });
  const addButton = async (text: string, item?: CatItem) => {
    await fetch(`${API_URL}/signals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preset_id: presetId, text, source: 'adhoc', to_all: item?.to_all || false, recipient_preset_ids: item?.recipients || [] }) }).catch(() => {});
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
  const catalogLeft = catItems.filter(c => c.text && !usedTexts.has(c.text));
  const incomingBySource = incoming.reduce((acc, s) => { (acc[s.from_preset_id] ||= []).push(s); return acc; }, {} as Record<number, Incoming[]>);
  const presentSrc = Object.keys(incomingBySource).map(Number);
  const orderedSrc = [...groupOrder.filter(id => presentSrc.includes(id)), ...presentSrc.filter(id => !groupOrder.includes(id))];
  const moveGroup = (id: number, dir: -1 | 1) => { const cur = [...orderedSrc]; const i = cur.indexOf(id); const j = i + dir; if (j < 0 || j >= cur.length) return; [cur[i], cur[j]] = [cur[j], cur[i]]; saveOrder(cur); };

  const hasContent = buttons.length > 0 || incoming.length > 0;
  const show = !collapsed && (hasContent || manualOpen);

  if (!show) {
    const n = buttons.filter(b => b.active).length + incoming.length;
    return (
      <button onClick={() => { setCollapsed(false); setManualOpen(true); }} title="לוח הודעות"
        style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 9000, background: '#1e293b', border: '1px solid #2563eb', borderRadius: 18, padding: '5px 10px', color: '#93c5fd', fontSize: 12, fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
        📡 {n > 0 && <span style={{ background: '#5cb85c', color: 'white', borderRadius: 9, padding: '0 6px', fontSize: 11 }}>{n}</span>}
      </button>
    );
  }

  return (
    <div style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 9000, width: 196, maxHeight: '78vh', overflowY: 'auto', background: '#f1f5f9', border: '1px solid #64748b', borderRadius: 6, boxShadow: '0 8px 28px rgba(0,0,0,0.45)', direction: 'rtl', padding: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* "הודעות שלי" header = drag handle + controls */}
      <div>
        <div onPointerDown={onDragDown} style={{ ...headerBar, cursor: 'move', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => { setCollapsed(true); setManualOpen(false); }} title="מזער" style={hdrBtn}>—</button>
          <span>הודעות שלי</span>
          <button onClick={() => setAddOpen(true)} title="הוסף" style={hdrBtn}>＋</button>
        </div>
        <div style={grid}>
          {buttons.length === 0 && <span style={{ fontSize: 11, color: '#64748b', gridColumn: '1 / -1', textAlign: 'center', padding: 4 }}>אין כפתורים — ＋</span>}
          {buttons.map(b => (
            <div key={b.id} style={{ position: 'relative' }}>
              <button onClick={() => toggle(b)} title={b.active ? 'פעיל — לחץ לכיבוי' : 'כבוי — לחץ להפעלה'} style={cell(b.active)}>{b.text}</button>
              <span onClick={() => setRecipFor(recipFor === b.id ? null : b.id)} title="נמענים" style={{ position: 'absolute', bottom: 1, left: 3, fontSize: 9, cursor: 'pointer', opacity: 0.7 }}>👥</span>
              {b.source === 'adhoc' && <button onClick={() => removeButton(b.id)} title="הסר" style={{ position: 'absolute', top: -5, left: -5, background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: 14, height: 14, fontSize: 9, cursor: 'pointer', lineHeight: '14px', padding: 0 }}>✕</button>}
              {recipFor === b.id && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 2, background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: 6, zIndex: 10, minWidth: 130, boxShadow: '0 6px 20px #000a', color: '#e2e8f0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer', marginBottom: 3 }}>
                    <input type="checkbox" checked={b.to_all} onChange={e => setRecipients(b, e.target.checked, b.recipient_preset_ids)} /> כולם
                  </label>
                  {!b.to_all && allPresets.filter(p => p.id !== presetId).map(p => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer' }}>
                      <input type="checkbox" checked={b.recipient_preset_ids.includes(p.id)} onChange={e => setRecipients(b, false, e.target.checked ? [...b.recipient_preset_ids, p.id] : b.recipient_preset_ids.filter(x => x !== p.id))} /> {p.name}
                    </label>
                  ))}
                  <button onClick={() => setRecipFor(null)} style={{ ...hdrBtn, marginTop: 4, width: '100%', color: '#cbd5e1' }}>סגור</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Incoming groups — reorderable */}
      {orderedSrc.map((src, idx) => (
        <div key={src}>
          <div style={{ ...headerBar, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 0.7 }}>
              <button onClick={() => moveGroup(src, -1)} disabled={idx === 0} title="למעלה" style={ordBtn(idx === 0)}>▲</button>
              <button onClick={() => moveGroup(src, 1)} disabled={idx === orderedSrc.length - 1} title="למטה" style={ordBtn(idx === orderedSrc.length - 1)}>▼</button>
            </span>
            <span>{incomingBySource[src][0].from_preset_name || presetName(src)}</span>
            <span style={{ width: 12 }} />
          </div>
          <div style={grid}>
            {incomingBySource[src].map(s => <span key={s.id} style={cell(true)}>{s.text}</span>)}
          </div>
        </div>
      ))}

      {/* Add dialog */}
      {addOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setAddOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0f172a', border: '1px solid #2563eb', borderRadius: 10, padding: 14, minWidth: 260, direction: 'rtl', color: '#e2e8f0' }}>
            <div style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 13 }}>➕ הוסף הודעה</div>
            {catalogLeft.length > 0 && <>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>הודעות ידועות:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                {catalogLeft.map(c => <button key={c.text} onClick={() => addButton(c.text, c)} style={dlgBtn('#1e3a5f')}>{c.text}</button>)}
              </div>
            </>}
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>הודעה חדשה (קצרה):</div>
            <AddCustom onAdd={addButton} />
            <button onClick={() => setAddOpen(false)} style={{ ...dlgBtn('#334155'), marginTop: 10, width: '100%' }}>סגור</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddCustom({ onAdd }: { onAdd: (t: string) => void }) {
  const [v, setV] = useState('');
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      <input value={v} onChange={e => setV(e.target.value)} maxLength={120} placeholder="טקסט קצר..." onKeyDown={e => { if (e.key === 'Enter' && v.trim()) { onAdd(v.trim()); setV(''); } }}
        style={{ flex: 1, padding: '5px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: 5, color: 'white', fontSize: 12, direction: 'rtl' }} />
      <button onClick={() => { if (v.trim()) { onAdd(v.trim()); setV(''); } }} style={dlgBtn('#2563eb')}>הוסף</button>
    </div>
  );
}

const headerBar: React.CSSProperties = { background: '#dbe5f1', color: '#1e293b', border: '1px solid #94b0cf', borderRadius: 4, textAlign: 'center', fontWeight: 'bold', fontSize: 12, padding: '3px 4px', marginBottom: 4 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 };
const hdrBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#1e293b', cursor: 'pointer', fontSize: 13, fontWeight: 'bold', padding: '0 4px', lineHeight: 1 };
function cell(active: boolean): React.CSSProperties {
  return { display: 'block', width: '100%', minHeight: 38, border: `1px solid ${active ? '#4a9d4a' : '#9aa0a6'}`, background: active ? '#5cb85c' : '#d6d8da', color: active ? 'white' : '#1e293b', borderRadius: 4, fontWeight: 'bold', fontSize: 12, cursor: 'pointer', padding: '4px 2px', textAlign: 'center' };
}
function ordBtn(disabled: boolean): React.CSSProperties {
  return { background: 'none', border: 'none', color: disabled ? '#b9c4d2' : '#475569', cursor: disabled ? 'default' : 'pointer', fontSize: 9, padding: 0, height: 9, lineHeight: '9px' };
}
function dlgBtn(bg: string): React.CSSProperties {
  return { background: bg, color: 'white', border: 'none', borderRadius: 5, padding: '3px 9px', fontWeight: 'bold', fontSize: 11, cursor: 'pointer' };
}
