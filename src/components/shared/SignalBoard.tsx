// SignalBoard — compact, always-on status-message board between workstations.
// Layout: a narrow panel of sections, each with a header bar + a 2-column grid of
// rectangular buttons (gray = off, colored by severity when on). First section
// "הודעות שלי" is my outgoing buttons (toggle + recipients + severity); the rest
// are incoming active signals grouped by source workstation (display-only), and
// the groups are reorderable.
// חומרת ההודעה (רגיל ירוק / חמור אדום / קריטי אדום מהבהב) נקבעת לכל הודעה
// בנפרד - כאן בעמדה, ולהודעות הקבועות גם מראש במאגר שבהגדרת העמדה.
// Shown in-view automatically when there are messages; otherwise a small 📡 pill.
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { API_URL } from '../../config';
import { frameColor } from '../../utils/windowFrame';
import { CRITICAL_BLINK_CLASS, SIGNAL_SEVERITIES, normSeverity, severityPaint, type SignalSeverity } from '../../utils/signalSeverity';

interface SignalBtn { id: number; preset_id: number; text: string; to_all: boolean; recipient_preset_ids: number[]; active: boolean; source: 'preset' | 'adhoc'; sort_order: number; severity: SignalSeverity; }
interface Incoming { id: number; from_preset_id: number; from_preset_name: string; text: string; severity: SignalSeverity; }
type CatItem = { text: string; to_all: boolean; recipients: number[]; default: boolean; severity: SignalSeverity };
type CatInput = string | { text: string; to_all?: boolean; recipients?: number[]; default?: boolean; severity?: string };
interface Props { presetId: number; allPresets: { id: number; name: string }[]; catalog: CatInput[]; themeMode?: 'light' | 'dark' | 'ocean'; openTick?: number; }

/** רוחב החלון ב-scale=1. כל מידה בחלון נגזרת ממנו, כדי שגרירת הפינה תגדיל הכל יחד. */
const BASE_W = 196;
const MIN_SCALE = 0.75;
const MAX_SCALE = 2.6;

export default function SignalBoard({ presetId, allPresets, catalog, themeMode = 'dark', openTick = 0 }: Props) {
  const { t, i18n } = useTranslation();
  const catItems = useMemo<CatItem[]>(() => (catalog || []).map(it => typeof it === 'string'
    ? { text: it, to_all: false, recipients: [], default: false, severity: 'normal' as SignalSeverity }
    : { text: it.text || '', to_all: !!it.to_all, recipients: Array.isArray(it.recipients) ? it.recipients.map(Number) : [], default: !!it.default, severity: normSeverity(it.severity) }), [catalog]);
  const didSyncRef = useRef(false);
  const [buttons, setButtons] = useState<SignalBtn[]>([]);
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [pos, setPos] = useState({ x: 16, y: 70 });
  const [addOpen, setAddOpen] = useState(false);
  const [recipModal, setRecipModal] = useState<SignalBtn | null>(null);
  const [recipSearch, setRecipSearch] = useState('');
  const [sevModal, setSevModal] = useState<SignalBtn | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  // גודל החלון: מקדם יחיד שכל המידות מוכפלות בו (חלון, כפתורים, טקסט) - נשמר לעמדה
  const scaleKey = `sigBoardScale_${presetId}`;
  const [scale, setScale] = useState<number>(() => {
    try { const v = parseFloat(localStorage.getItem(scaleKey) || '1'); return v >= MIN_SCALE && v <= MAX_SCALE ? v : 1; } catch { return 1; }
  });
  const scaleRef = useRef(scale);
  const px = (n: number) => Math.round(n * scale);
  const applyScale = (v: number, persist = false) => {
    const n = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));
    scaleRef.current = n;
    setScale(n);
    if (persist) { try { localStorage.setItem(scaleKey, String(n)); } catch { /* ignore */ } }
  };
  const [groupOrder, setGroupOrder] = useState<number[]>(() => { try { return JSON.parse(localStorage.getItem(`sigGroupOrder_${presetId}`) || '[]'); } catch { return []; } });
  const saveOrder = (o: number[]) => { setGroupOrder(o); try { localStorage.setItem(`sigGroupOrder_${presetId}`, JSON.stringify(o)); } catch { /* ignore */ } };
  // recipient-usage frequency for this workstation (frequent recipients float to the top)
  const freqKey = `sigRecipFreq_${presetId}`;
  const getFreq = (): Record<number, number> => { try { return JSON.parse(localStorage.getItem(freqKey) || '{}'); } catch { return {}; } };
  const bumpFreq = (id: number) => { const f = getFreq(); f[id] = (f[id] || 0) + 1; try { localStorage.setItem(freqKey, JSON.stringify(f)); } catch { /* ignore */ } };

  const norm = (b: any[]): SignalBtn[] => Array.isArray(b) ? b.map((x: any) => ({ ...x, recipient_preset_ids: Array.isArray(x.recipient_preset_ids) ? x.recipient_preset_ids.map(Number) : [], severity: normSeverity(x.severity) })) : [];
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
          await Promise.all(toCreate.map(c => fetch(`${API_URL}/signals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preset_id: presetId, text: c.text, source: 'preset', to_all: c.to_all, recipient_preset_ids: c.recipients, severity: c.severity }) }).catch(() => {})));
          myBtns = norm(await fetch(`${API_URL}/signals?preset_id=${presetId}`).then(r => r.ok ? r.json() : b).catch(() => b));
        }
      }
      setButtons(myBtns);
      setIncoming(Array.isArray(inc) ? inc.map((s: any) => ({ ...s, severity: normSeverity(s.severity) })) : []);
    } catch { /* keep last */ }
  }, [presetId, catItems]);

  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, [load]);
  // open from the external "תצוגה" menu
  useEffect(() => { if (openTick > 0) { setCollapsed(false); setManualOpen(true); } }, [openTick]);

  const apiPut = async (id: number, body: any) => { await fetch(`${API_URL}/signals/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {}); load(); };
  const toggle = (b: SignalBtn) => { setButtons(prev => prev.map(x => x.id === b.id ? { ...x, active: !x.active } : x)); apiPut(b.id, { active: !b.active }); };
  const setRecipients = (b: SignalBtn, to_all: boolean, ids: number[]) => apiPut(b.id, { to_all, recipient_preset_ids: ids });
  // חומרה נשמרת מיד (אופטימי) - הפקח רואה את שינוי הצבע בלי להמתין לשרת
  const setSeverity = (b: SignalBtn, severity: SignalSeverity) => {
    setButtons(prev => prev.map(x => x.id === b.id ? { ...x, severity } : x));
    apiPut(b.id, { severity });
  };
  const addButton = async (text: string, item?: CatItem) => {
    await fetch(`${API_URL}/signals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preset_id: presetId, text, source: 'adhoc', to_all: item?.to_all || false, recipient_preset_ids: item?.recipients || [], severity: item?.severity || 'normal' }) }).catch(() => {});
    setAddOpen(false); load();
  };
  const removeButton = async (id: number) => { await fetch(`${API_URL}/signals/${id}`, { method: 'DELETE' }).catch(() => {}); load(); };

  /** סקייל גודל המסך: החלון יושב תחת `zoom: var(--s)`, ולכן clientX/clientY בפיקסלים
   *  אמיתיים בעוד left/top ביחידות מוגדלות (CLAUDE.md §גרירה, מלכודת 3). */
  const rootScale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;

  // גרירת מיקום מהכותרת - Pointer Events + setPointerCapture, שתעבוד בעט ובאצבע
  const onDragDown = (e: React.PointerEvent) => {
    if (e.button > 0) return;
    if ((e.target as HTMLElement).closest('button')) return; // ＋ / — הם כפתורים, לא ידית
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const s = rootScale();
    dragRef.current = { sx: e.clientX / s, sy: e.clientY / s, ox: pos.x, oy: pos.y };
    const move = (me: PointerEvent) => { const d = dragRef.current; if (d) setPos({ x: d.ox + me.clientX / s - d.sx, y: d.oy + me.clientY / s - d.sy }); };
    const up = () => {
      dragRef.current = null;
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  // גרירת גודל מהפינה ⇲ - מקדם אחד, ולכן הכפתורים והטקסט גדלים יחד עם החלון.
  // הידית חייבת Pointer Events + touchAction:'none' + setPointerCapture (עט/אצבע).
  const onResizeDown = (e: React.PointerEvent) => {
    if (e.button > 0) return;
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const s = rootScale();
    const rtl = i18n.dir() === 'rtl';
    const start = { mx: e.clientX / s, my: e.clientY / s, w: BASE_W * scaleRef.current };
    const move = (me: PointerEvent) => {
      const dx = (me.clientX / s - start.mx) * (rtl ? -1 : 1); // ב-RTL הידית בפינה השמאלית
      const dy = me.clientY / s - start.my;
      applyScale((start.w + (dx + dy) / 2) / BASE_W); // הטלה על האלכסון - גרירה אלכסונית טבעית
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      applyScale(scaleRef.current, true);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const presetName = (id: number) => allPresets.find(p => p.id === id)?.name || t('signalBoard.workstation', { id });
  const usedTexts = new Set(buttons.map(b => b.text));
  const catalogLeft = catItems.filter(c => c.text && !usedTexts.has(c.text));
  const incomingBySource = incoming.reduce((acc, s) => { (acc[s.from_preset_id] ||= []).push(s); return acc; }, {} as Record<number, Incoming[]>);
  const presentSrc = Object.keys(incomingBySource).map(Number);
  const orderedSrc = [...groupOrder.filter(id => presentSrc.includes(id)), ...presentSrc.filter(id => !groupOrder.includes(id))];
  const moveGroup = (id: number, dir: -1 | 1) => { const cur = [...orderedSrc]; const i = cur.indexOf(id); const j = i + dir; if (j < 0 || j >= cur.length) return; [cur[i], cur[j]] = [cur[j], cur[i]]; saveOrder(cur); };

  const hasContent = buttons.length > 0 || incoming.length > 0;
  const show = !collapsed && (hasContent || manualOpen);

  // Theme-aware panel colors (אור/שחור/כחול). Buttons (gray/green) stay constant.
  // accent = מסגרת החלון. לוח ההודעות הוא חלון **צפייה ותפעול** ולכן תורכיז,
  // לפי קוד הצבע המשותף ב-utils/windowFrame (CLAUDE.md §מסגרת חלון).
  const accent = frameColor('view', themeMode);
  const C = themeMode === 'dark'
    ? { panel: '#0f172a', border: '#334155', accent, hdrBg: '#1e293b', hdrText: '#e2e8f0', hdrBorder: '#334155', muted: '#64748b', pillBg: '#1e293b', pillBorder: '#2563eb', pillText: '#93c5fd' }
    : themeMode === 'ocean'
    ? { panel: '#d6e6f5', border: '#5b8cc0', accent, hdrBg: '#b9d4ee', hdrText: '#0f172a', hdrBorder: '#7ba8d4', muted: '#475569', pillBg: '#b9d4ee', pillBorder: '#5b8cc0', pillText: '#0f172a' }
    : { panel: '#f1f5f9', border: '#94a3b8', accent, hdrBg: '#dbe5f1', hdrText: '#1e293b', hdrBorder: '#94b0cf', muted: '#64748b', pillBg: '#e2e8f0', pillBorder: '#94a3b8', pillText: '#1e293b' };
  const headerBar = { background: C.hdrBg, color: C.hdrText, border: `1px solid ${C.hdrBorder}`, borderRadius: px(4), textAlign: 'center' as const, fontWeight: 'bold' as const, fontSize: px(12), padding: `${px(3)}px ${px(4)}px`, marginBottom: px(4) };
  const hdrBtn = { background: 'none', border: 'none', color: C.hdrText, cursor: 'pointer', fontSize: px(13), fontWeight: 'bold' as const, padding: `0 ${px(4)}px`, lineHeight: 1 };

  // No content & not opened → render nothing (reopen from the "תצוגה" menu)
  if (!show) return null;

  return (
    <div style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 9000, width: px(BASE_W), maxHeight: '78vh', background: C.panel, border: `2px solid ${C.accent}`, borderRadius: px(8), boxShadow: '0 8px 28px rgba(0,0,0,0.45)', direction: i18n.dir(), display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* גוף גולל - הידית ⇲ יושבת מחוצה לו כדי שלא תיגלל עם התוכן */}
      <div style={{ overflowY: 'auto', overflowX: 'hidden', padding: px(6), paddingBottom: px(17), display: 'flex', flexDirection: 'column', gap: px(8) }}>
      {/* "הודעות שלי" header = drag handle + controls */}
      <div>
        <div onPointerDown={onDragDown} style={{ ...headerBar, cursor: 'move', touchAction: 'none', userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => { setCollapsed(true); setManualOpen(false); }} title={t('common.minimize')} style={hdrBtn}>—</button>
          <span>{t('signalBoard.myMessages')}</span>
          <button onClick={() => setAddOpen(true)} title={t('common.add')} style={hdrBtn}>＋</button>
        </div>
        <div style={grid(px)}>
          {buttons.length === 0 && <span style={{ fontSize: px(11), color: '#64748b', gridColumn: '1 / -1', textAlign: 'center', padding: px(4) }}>{t('signalBoard.noButtons')}</span>}
          {buttons.map(b => (
            <div key={b.id} style={{ position: 'relative' }}>
              <button onClick={() => toggle(b)} className={b.active && b.severity === 'critical' ? CRITICAL_BLINK_CLASS : undefined} title={b.active ? t('signalBoard.activeClickOff') : t('signalBoard.inactiveClickOn')} style={cell(b.active, px, b.severity)}>{b.text}</button>
              <span onClick={() => { setRecipModal(b); setRecipSearch(''); }} title={t('signalBoard.recipients')} style={{ position: 'absolute', bottom: px(1), insetInlineStart: px(3), fontSize: px(10), cursor: 'pointer', opacity: 0.75 }}>👥</span>
              {/* חיווי החומרה - גם כשההודעה כבויה (אפורה) רואים באיזו חומרה היא תידלק */}
              <span onClick={() => setSevModal(b)} title={t('signalBoard.severity')}
                style={{ position: 'absolute', bottom: 0, insetInlineEnd: 0, width: px(15), height: px(15), display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <span style={{ width: px(8), height: px(8), borderRadius: '50%', background: severityPaint(b.severity).bg, border: `${Math.max(1, px(1))}px solid rgba(255,255,255,0.85)`, boxSizing: 'border-box' }} />
              </span>
              {b.source === 'adhoc' && <button onClick={() => { if (window.confirm(t('signalBoard.removeConfirm', { text: b.text }))) removeButton(b.id); }} title={t('signalBoard.removeButton')} style={{ position: 'absolute', top: px(-3), insetInlineStart: px(-3), background: '#475569', color: '#cbd5e1', border: 'none', borderRadius: '50%', width: px(11), height: px(11), fontSize: px(8), cursor: 'pointer', lineHeight: `${px(11)}px`, padding: 0, opacity: 0.6 }}>✕</button>}
            </div>
          ))}
        </div>
      </div>

      {/* Incoming groups — reorderable */}
      {orderedSrc.map((src, idx) => (
        <div key={src}>
          <div style={{ ...headerBar, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 0.7 }}>
              <button onClick={() => moveGroup(src, -1)} disabled={idx === 0} title={t('common.up')} style={ordBtn(idx === 0, C.hdrText, px)}>▲</button>
              <button onClick={() => moveGroup(src, 1)} disabled={idx === orderedSrc.length - 1} title={t('common.down')} style={ordBtn(idx === orderedSrc.length - 1, C.hdrText, px)}>▼</button>
            </span>
            <span>{incomingBySource[src][0].from_preset_name || presetName(src)}</span>
            <span style={{ width: px(12) }} />
          </div>
          <div style={grid(px)}>
            {incomingBySource[src].map(s => <span key={s.id} className={s.severity === 'critical' ? CRITICAL_BLINK_CLASS : undefined} style={cell(true, px, s.severity)}>{s.text}</span>)}
          </div>
        </div>
      ))}
      </div>

      {/* ידית שינוי גודל - גרירה מגדילה את החלון ואת הכפתורים יחד; לחיצה כפולה מאפסת */}
      <div
        onPointerDown={onResizeDown}
        onDoubleClick={() => applyScale(1, true)}
        title={t('signalBoard.resize')}
        style={{
          position: 'absolute', bottom: 0, insetInlineEnd: 0, width: px(16), height: px(16),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: i18n.dir() === 'rtl' ? 'nesw-resize' : 'nwse-resize',
          color: C.accent, fontSize: px(12), lineHeight: 1, background: C.panel,
          borderStartStartRadius: px(6), touchAction: 'none', userSelect: 'none',
        }}
      >⇲</div>

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
            <div onClick={e => e.stopPropagation()} style={{ background: '#0f172a', border: '1px solid #2563eb', borderRadius: 12, width: 340, maxHeight: '82vh', display: 'flex', flexDirection: 'column', direction: i18n.dir(), color: '#e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #334155' }}>
                <span style={{ fontWeight: 'bold', fontSize: 14 }}>{t('signalBoard.recipientsFor', { text: b.text })}</span>
                <button onClick={() => setRecipModal(null)} style={dlgBtn('#7f1d1d')}>✕</button>
              </div>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e293b' }}>
                <input autoFocus value={recipSearch} onChange={e => setRecipSearch(e.target.value)} placeholder={t('signalBoard.searchWorkstation')}
                  style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: 7, color: 'white', fontSize: 14, direction: i18n.dir(), boxSizing: 'border-box' }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, cursor: 'pointer', marginTop: 10, fontWeight: 'bold' }}>
                  <input type="checkbox" checked={b.to_all} onChange={e => setToAll(e.target.checked)} /> {t('common.all')}
                </label>
              </div>
              {!b.to_all && (
                <div style={{ overflowY: 'auto', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {filtered.length === 0 && <span style={{ fontSize: 12, color: '#475569', padding: 6 }}>{t('common.noResults')}</span>}
                  {filtered.map(p => {
                    const fav = (freq[p.id] || 0) > 0;
                    return (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', padding: '7px 8px', borderRadius: 6, background: b.recipient_preset_ids.includes(p.id) ? '#14532d' : 'transparent' }}>
                        <input type="checkbox" checked={b.recipient_preset_ids.includes(p.id)} onChange={e => toggleId(p.id, e.target.checked)} />
                        <span style={{ flex: 1 }}>{p.name}</span>
                        {fav && <span title={t('signalBoard.frequent')} style={{ fontSize: 11, color: '#fbbf24' }}>★ {t('signalBoard.frequent')}</span>}
                      </label>
                    );
                  })}
                </div>
              )}
              <div style={{ padding: '8px 14px', borderTop: '1px solid #334155' }}>
                <button onClick={() => setRecipModal(null)} style={{ ...dlgBtn('#2563eb'), width: '100%', padding: '8px' }}>{t('common.done')}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* בורר חומרה להודעה בודדת - שלוש אפשרויות גדולות (מגע/עט), עם תצוגה מקדימה של הצבע */}
      {sevModal && (() => {
        const b = sevModal;
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSevModal(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#0f172a', border: '1px solid #2563eb', borderRadius: 12, width: 300, direction: i18n.dir(), color: '#e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #334155' }}>
                <span style={{ fontWeight: 'bold', fontSize: 14 }}>{t('signalBoard.severityFor', { text: b.text })}</span>
                <button onClick={() => setSevModal(null)} style={dlgBtn('#7f1d1d')}>✕</button>
              </div>
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {SIGNAL_SEVERITIES.map(sev => {
                  const paint = severityPaint(sev);
                  const chosen = b.severity === sev;
                  return (
                    <button key={sev}
                      onClick={() => { setSeverity(b, sev); setSevModal({ ...b, severity: sev }); }}
                      className={sev === 'critical' ? CRITICAL_BLINK_CLASS : undefined}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', padding: '12px 14px', background: paint.bg, color: paint.text, border: `2px solid ${chosen ? '#ffffff' : paint.border}`, borderRadius: 8, fontWeight: 'bold', fontSize: 14, cursor: 'pointer' }}>
                      <span>{t(`signalBoard.sev_${sev}`)}</span>
                      <span style={{ fontSize: 15 }}>{chosen ? '✔' : ''}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ padding: '0 12px 12px' }}>
                <button onClick={() => setSevModal(null)} style={{ ...dlgBtn('#2563eb'), width: '100%', padding: '8px' }}>{t('common.done')}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add dialog */}
      {addOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setAddOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0f172a', border: '1px solid #2563eb', borderRadius: 10, padding: 14, minWidth: 260, direction: i18n.dir(), color: '#e2e8f0' }}>
            <div style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 13 }}>{t('signalBoard.addMessage')}</div>
            {catalogLeft.length > 0 && <>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{t('signalBoard.knownMessages')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                {/* הנקודה מראה באיזו חומרה ההודעה הקבועה הוגדרה בהגדרת העמדה */}
                {catalogLeft.map(c => (
                  <button key={c.text} onClick={() => addButton(c.text, c)} style={{ ...dlgBtn('#1e3a5f'), display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: severityPaint(c.severity).bg, flexShrink: 0 }} />
                    {c.text}
                  </button>
                ))}
              </div>
            </>}
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{t('signalBoard.newMessage')}</div>
            <AddCustom onAdd={addButton} />
            <button onClick={() => setAddOpen(false)} style={{ ...dlgBtn('#334155'), marginTop: 10, width: '100%' }}>{t('common.close')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddCustom({ onAdd }: { onAdd: (t: string) => void }) {
  const { t, i18n } = useTranslation();
  const [v, setV] = useState('');
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      <input value={v} onChange={e => setV(e.target.value)} maxLength={120} placeholder={t('signalBoard.shortText')} onKeyDown={e => { if (e.key === 'Enter' && v.trim()) { onAdd(v.trim()); setV(''); } }}
        style={{ flex: 1, padding: '5px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: 5, color: 'white', fontSize: 12, direction: i18n.dir() }} />
      <button onClick={() => { if (v.trim()) { onAdd(v.trim()); setV(''); } }} style={dlgBtn('#2563eb')}>{t('common.add')}</button>
    </div>
  );
}

// כל המידות עוברות דרך px() של החלון, כדי שגרירת הפינה תגדיל טקסט וכפתורים יחד עם המסגרת
type Px = (n: number) => number;
function grid(px: Px): React.CSSProperties {
  return { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: px(5) };
}
/** כבוי = אפור בכל חומרה; פעיל = צבע החומרה (ירוק/אדום), וקריטי מקבל גם הבהוב. */
function cell(active: boolean, px: Px, severity: SignalSeverity = 'normal'): React.CSSProperties {
  const s = severityPaint(severity);
  return { boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: px(38), border: `${Math.max(1, px(1))}px solid ${active ? s.border : '#9aa0a6'}`, background: active ? s.bg : '#d6d8da', color: active ? s.text : '#1e293b', borderRadius: px(4), fontWeight: 'bold', fontSize: px(12), cursor: 'pointer', padding: `${px(2)}px ${px(4)}px`, textAlign: 'center', lineHeight: 1.1 };
}
function ordBtn(disabled: boolean, color: string, px: Px): React.CSSProperties {
  return { background: 'none', border: 'none', color, opacity: disabled ? 0.35 : 0.8, cursor: disabled ? 'default' : 'pointer', fontSize: px(9), padding: 0, height: px(9), lineHeight: `${px(9)}px` };
}
function dlgBtn(bg: string): React.CSSProperties {
  return { background: bg, color: 'white', border: 'none', borderRadius: 5, padding: '3px 9px', fontWeight: 'bold', fontSize: 11, cursor: 'pointer' };
}
