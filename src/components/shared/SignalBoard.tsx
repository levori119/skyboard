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
interface Props { presetId: number; allPresets: { id: number; name: string }[]; catalog: CatInput[]; themeMode?: 'light' | 'dark' | 'ocean'; openTick?: number; }

export default function SignalBoard({ presetId, allPresets, catalog, themeMode = 'dark', openTick = 0 }: Props) {
  const catItems = useMemo<CatItem[]>(() => (catalog || []).map(it => typeof it === 'string'
    ? { text: it, to_all: false, recipients: [], default: false }
    : { text: it.text || '', to_all: !!it.to_all, recipients: Array.isArray(it.recipients) ? it.recipients.map(Number) : [], default: !!it.default }), [catalog]);
  const didSyncRef = useRef(false);
  const [buttons, setButtons] = useState<SignalBtn[]>([]);
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [pos, setPos] = useState({ x: 16, y: 70 });
  const [addOpen, setAddOpen] = useState(false);
  const [recipModal, setRecipModal] = useState<SignalBtn | null>(null);
  const [recipSearch, setRecipSearch] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [groupOrder, setGroupOrder] = useState<number[]>(() => { try { return JSON.parse(localStorage.getItem(`sigGroupOrder_${presetId}`) || '[]'); } catch { return []; } });
  const saveOrder = (o: number[]) => { setGroupOrder(o); try { localStorage.setItem(`sigGroupOrder_${presetId}`, JSON.stringify(o)); } catch { /* ignore */ } };
  // recipient-usage frequency for this workstation (frequent recipients float to the top)
  const freqKey = `sigRecipFreq_${presetId}`;
  const getFreq = (): Record<number, number> => { try { return JSON.parse(localStorage.getItem(freqKey) || '{}'); } catch { return {}; } };
  const bumpFreq = (id: number) => { const f = getFreq(); f[id] = (f[id] || 0) + 1; try { localStorage.setItem(freqKey, JSON.stringify(f)); } catch { /* ignore */ } };

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
  // open from the external "תצוגה" menu
  useEffect(() => { if (openTick > 0) { setCollapsed(false); setManualOpen(true); } }, [openTick]);

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

  // Theme-aware panel colors (אור/שחור/כחול). Buttons (gray/green) stay constant.
  const C = themeMode === 'dark'
    ? { panel: '#0f172a', border: '#334155', hdrBg: '#1e293b', hdrText: '#e2e8f0', hdrBorder: '#334155', muted: '#64748b', pillBg: '#1e293b', pillBorder: '#2563eb', pillText: '#93c5fd' }
    : themeMode === 'ocean'
    ? { panel: '#d6e6f5', border: '#5b8cc0', hdrBg: '#b9d4ee', hdrText: '#0f172a', hdrBorder: '#7ba8d4', muted: '#475569', pillBg: '#b9d4ee', pillBorder: '#5b8cc0', pillText: '#0f172a' }
    : { panel: '#f1f5f9', border: '#94a3b8', hdrBg: '#dbe5f1', hdrText: '#1e293b', hdrBorder: '#94b0cf', muted: '#64748b', pillBg: '#e2e8f0', pillBorder: '#94a3b8', pillText: '#1e293b' };
  const headerBar = { background: C.hdrBg, color: C.hdrText, border: `1px solid ${C.hdrBorder}`, borderRadius: 4, textAlign: 'center' as const, fontWeight: 'bold' as const, fontSize: 12, padding: '3px 4px', marginBottom: 4 };
  const hdrBtn = { background: 'none', border: 'none', color: C.hdrText, cursor: 'pointer', fontSize: 13, fontWeight: 'bold' as const, padding: '0 4px', lineHeight: 1 };

  // No content & not opened → render nothing (reopen from the "תצוגה" menu)
  if (!show) return null;

  return (
    <div style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 9000, width: 196, maxHeight: '78vh', overflowY: 'auto', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, boxShadow: '0 8px 28px rgba(0,0,0,0.45)', direction: 'rtl', padding: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
              <span onClick={() => { setRecipModal(b); setRecipSearch(''); }} title="נמענים" style={{ position: 'absolute', bottom: 1, left: 3, fontSize: 10, cursor: 'pointer', opacity: 0.75 }}>👥</span>
              {b.source === 'adhoc' && <button onClick={() => { if (window.confirm(`להסיר את "${b.text}"?`)) removeButton(b.id); }} title="הסר כפתור" style={{ position: 'absolute', top: -3, left: -3, background: '#475569', color: '#cbd5e1', border: 'none', borderRadius: '50%', width: 11, height: 11, fontSize: 8, cursor: 'pointer', lineHeight: '11px', padding: 0, opacity: 0.6 }}>✕</button>}
            </div>
          ))}
        </div>
      </div>

      {/* Incoming groups — reorderable */}
      {orderedSrc.map((src, idx) => (
        <div key={src}>
          <div style={{ ...headerBar, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 0.7 }}>
              <button onClick={() => moveGroup(src, -1)} disabled={idx === 0} title="למעלה" style={ordBtn(idx === 0, C.hdrText)}>▲</button>
              <button onClick={() => moveGroup(src, 1)} disabled={idx === orderedSrc.length - 1} title="למטה" style={ordBtn(idx === orderedSrc.length - 1, C.hdrText)}>▼</button>
            </span>
            <span>{incomingBySource[src][0].from_preset_name || presetName(src)}</span>
            <span style={{ width: 12 }} />
          </div>
          <div style={grid}>
            {incomingBySource[src].map(s => <span key={s.id} style={cell(true)}>{s.text}</span>)}
          </div>
        </div>
      ))}

      {/* Recipients picker — large external modal with live search + frequent-first */}
      {recipModal && (() => {
        const b = recipModal;
        const freq = getFreq();
        const q = recipSearch.trim();
        const others = allPresets.filter(p => p.id !== presetId);
        const filtered = others
          .filter(p => !q || p.name.includes(q))
          .sort((a, c) => (freq[c.id] || 0) - (freq[a.id] || 0) || a.name.localeCompare(c.name, 'he'));
        const setToAll = (on: boolean) => { setRecipients(b, on, b.recipient_preset_ids); setRecipModal({ ...b, to_all: on }); };
        const toggleId = (id: number, on: boolean) => {
          const ids = on ? [...b.recipient_preset_ids, id] : b.recipient_preset_ids.filter(x => x !== id);
          if (on) bumpFreq(id);
          setRecipients(b, false, ids);
          setRecipModal({ ...b, to_all: false, recipient_preset_ids: ids });
        };
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setRecipModal(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#0f172a', border: '1px solid #2563eb', borderRadius: 12, width: 340, maxHeight: '82vh', display: 'flex', flexDirection: 'column', direction: 'rtl', color: '#e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #334155' }}>
                <span style={{ fontWeight: 'bold', fontSize: 14 }}>נמענים — {b.text}</span>
                <button onClick={() => setRecipModal(null)} style={dlgBtn('#7f1d1d')}>✕</button>
              </div>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e293b' }}>
                <input autoFocus value={recipSearch} onChange={e => setRecipSearch(e.target.value)} placeholder="🔍 חיפוש עמדה..."
                  style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: 7, color: 'white', fontSize: 14, direction: 'rtl', boxSizing: 'border-box' }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, cursor: 'pointer', marginTop: 10, fontWeight: 'bold' }}>
                  <input type="checkbox" checked={b.to_all} onChange={e => setToAll(e.target.checked)} /> כולם
                </label>
              </div>
              {!b.to_all && (
                <div style={{ overflowY: 'auto', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {filtered.length === 0 && <span style={{ fontSize: 12, color: '#475569', padding: 6 }}>אין תוצאות</span>}
                  {filtered.map(p => {
                    const fav = (freq[p.id] || 0) > 0;
                    return (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', padding: '7px 8px', borderRadius: 6, background: b.recipient_preset_ids.includes(p.id) ? '#14532d' : 'transparent' }}>
                        <input type="checkbox" checked={b.recipient_preset_ids.includes(p.id)} onChange={e => toggleId(p.id, e.target.checked)} />
                        <span style={{ flex: 1 }}>{p.name}</span>
                        {fav && <span title="שכיח" style={{ fontSize: 11, color: '#fbbf24' }}>★ שכיח</span>}
                      </label>
                    );
                  })}
                </div>
              )}
              <div style={{ padding: '8px 14px', borderTop: '1px solid #334155' }}>
                <button onClick={() => setRecipModal(null)} style={{ ...dlgBtn('#2563eb'), width: '100%', padding: '8px' }}>סיום</button>
              </div>
            </div>
          </div>
        );
      })()}

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

const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 };
function cell(active: boolean): React.CSSProperties {
  return { boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: 38, border: `1px solid ${active ? '#4a9d4a' : '#9aa0a6'}`, background: active ? '#5cb85c' : '#d6d8da', color: active ? 'white' : '#1e293b', borderRadius: 4, fontWeight: 'bold', fontSize: 12, cursor: 'pointer', padding: '2px 4px', textAlign: 'center', lineHeight: 1.1 };
}
function ordBtn(disabled: boolean, color: string): React.CSSProperties {
  return { background: 'none', border: 'none', color, opacity: disabled ? 0.35 : 0.8, cursor: disabled ? 'default' : 'pointer', fontSize: 9, padding: 0, height: 9, lineHeight: '9px' };
}
function dlgBtn(bg: string): React.CSSProperties {
  return { background: bg, color: 'white', border: 'none', borderRadius: 5, padding: '3px 9px', fontWeight: 'bold', fontSize: 11, cursor: 'pointer' };
}
