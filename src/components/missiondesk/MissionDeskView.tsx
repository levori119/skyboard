// עמדת "דסק משימה כללי" — המסך שרואה המפעיל בעמדה מסוג mission_desk.
// טוען את הגדרת הדסק (עץ BSP + שירותים) ואת ה-state של העמדה, מרנדר כל שירות
// באזור שלו, ומסנכרן ב-polling (כמו שאר המערכת — אין WebSocket):
//   · GET /api/mission-desk-state — מצב השירותים (כולל עדכונים מעמדות משותפות)
//   · GET /api/workstation-messages — התראות מתפרצות (toast, תבנית SectorDashboard)
// עריכה מקומית לא נדרסת: בזמן אינטראקציה או מיד אחרי כתיבה מקומית — הדילוג על apply.
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import { API_URL } from '../../config';
import type { CrewMember, WorkstationSession } from '../../types';
import type {
  MDNode, MissionDesk, MissionDeskService,
  MDButtonsState, MDFreeTextState, MDTableState, MDServiceState,
} from '../../types/missionDesk';
import { mdTheme, type MDThemeMode } from './theme';
import { SkyKingLogo } from '../shared/SkyKingLogo';
import { ClockWidget } from '../../ClockWidget';
import { StickyNotesLayer } from '../admin/managers';
import ButtonsBoard from './ButtonsBoard';
import InkPad from './InkPad';
import SmartTable from './SmartTable';

interface Props {
  session: WorkstationSession;
  preset: any; // שורת workstation_presets של העמדה (כולל mission_desk_id)
  allPresets: { id: number; name: string }[];
  onLogout: () => void;
  onCrewChange?: (cm: CrewMember) => void; // החלפת בקר — אותה זרימה כמו SectorDashboard
  // מצב הגדרה (מתוך עורך העמדה): אמצעים/שורות שנוצרים מסומנים "קבוע",
  // לא נשלחות התראות אמת, וכפתור הסגירה מחליף את ההתנתקות.
  adminMode?: boolean;
}

interface PeerMsg { id: number; from_preset_name: string; message: string; created_at: string }

const POLL_MS = 5000;
// גדול ממחזור ה-poll: כתיבה מקומית לא תידרס ע"י GET שרץ לפני שה-PUT התחייב ב-DB
// (Neon latency). עדכונים משותפים לשירותים שלא נערכים כרגע — עדיין ≤ POLL_MS.
const LOCAL_WRITE_GRACE_MS = 8000;

export default function MissionDeskView({ session, preset, allPresets, onLogout, onCrewChange, adminMode }: Props) {
  const presetId = Number(session.presetId || preset?.id);
  const [desk, setDesk] = useState<(MissionDesk & { services: MissionDeskService[] }) | null>(null);
  const [deskMissing, setDeskMissing] = useState(false);
  const [states, setStates] = useState<Record<number, MDServiceState>>({});
  const [peerMsgs, setPeerMsgs] = useState<PeerMsg[]>([]);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showCrewSwap, setShowCrewSwap] = useState(false);
  const [crewList, setCrewList] = useState<CrewMember[]>([]);
  // חלוקת אזורים אישית לעמדה — override על sizes של הפריסה, נשמר מקומית
  // (localStorage) ולא בהגדרת הדסק, כדי שכיוונון ארגונומי לא ישנה עמדות אחרות.
  const [splitOverrides, setSplitOverrides] = useState<Record<string, number[]>>({});
  const splitDragRef = useRef<{ nodeId: string; idx: number; start: number; orig: number[]; len: number; horizontal: boolean } | null>(null);
  const splitsStorageKey = `bt-md-splits-${presetId}-${preset?.mission_desk_id || 0}`;
  const [showCompose, setShowCompose] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [composeTargets, setComposeTargets] = useState<number[]>([]);
  // פתקיות — אותו רכיב ואותה זרימה כמו בכל העמדות (StickyNotesLayer + polling 15ש')
  const [stickyNotes, setStickyNotes] = useState<any[]>([]);
  const [showStickyDropdown, setShowStickyDropdown] = useState(false);
  useEffect(() => {
    if (adminMode || !presetId) return;
    const loadStickyNotes = async () => {
      try {
        const res = await fetch(`${API_URL}/sticky-notes?presetId=${presetId}`);
        if (res.ok) setStickyNotes(await res.json());
      } catch { /* polling — שקט */ }
    };
    loadStickyNotes();
    const interval = setInterval(loadStickyNotes, 15000);
    return () => clearInterval(interval);
  }, [presetId, adminMode]);
  const [themeMode, setThemeMode] = useState<MDThemeMode>(() => {
    const s = localStorage.getItem('bt-themeMode');
    return s === 'light' || s === 'ocean' ? s : 'dark';
  });
  const theme = mdTheme(themeMode);

  const interactingRef = useRef<Set<number>>(new Set());
  const lastLocalWriteRef = useRef<Record<number, number>>({});
  const seenMsgIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => { localStorage.setItem('bt-themeMode', themeMode); }, [themeMode]);

  // שחזור חלוקת האזורים האישית של העמדה
  useEffect(() => {
    try {
      const saved = localStorage.getItem(splitsStorageKey);
      if (saved) setSplitOverrides(JSON.parse(saved));
    } catch { /* noop */ }
  }, [splitsStorageKey]);

  const postLog = useCallback((action: string, details: Record<string, unknown>) => {
    fetch(`${API_URL}/activity-log`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: action,
        workstation_preset_id: presetId,
        workstation_name: preset?.name || session.workstationName,
        crew_member_id: session.crewMember?.id ?? null,
        crew_member_name: session.crewMember?.name ?? null,
        details,
      }),
    }).catch(() => {});
  }, [presetId, session.crewMember, preset?.name, session.workstationName]);

  // ── טעינת הגדרת הדסק ──────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const desks = await fetch(`${API_URL}/mission-desks`).then(r => r.json());
        if (!alive) return;
        const mine = Array.isArray(desks) ? desks.find((d: any) => d.id === preset?.mission_desk_id) : null;
        if (mine) setDesk(mine); else setDeskMissing(true);
      } catch { if (alive) setDeskMissing(true); }
    })();
    return () => { alive = false; };
  }, [preset?.mission_desk_id]);

  // ── polling: state + התראות ───────────────────────────────────────────────
  const pollState = useCallback(async () => {
    try {
      const rows: { service_id: number; state: MDServiceState; updated_at: string }[] =
        await fetch(`${API_URL}/mission-desk-state?preset_id=${presetId}`).then(r => r.json());
      if (!Array.isArray(rows)) return;
      setStates(prev => {
        const next = { ...prev };
        for (const row of rows) {
          const sid = row.service_id;
          if (interactingRef.current.has(sid)) continue;
          if (Date.now() - (lastLocalWriteRef.current[sid] || 0) < LOCAL_WRITE_GRACE_MS) continue;
          next[sid] = row.state;
        }
        return next;
      });
    } catch { /* polling — שקט */ }
  }, [presetId]);

  const pollMessages = useCallback(async () => {
    if (adminMode) return; // מצב הגדרה: לא צורכים (ולא מסמנים seen) הודעות אמת של העמדה
    try {
      const rows: (PeerMsg & { seen: boolean })[] =
        await fetch(`${API_URL}/workstation-messages?preset_id=${presetId}`).then(r => r.json());
      if (!Array.isArray(rows)) return;
      const fresh = rows.filter(m => !m.seen && !seenMsgIdsRef.current.has(m.id));
      if (!fresh.length) return;
      fresh.forEach(m => seenMsgIdsRef.current.add(m.id));
      setPeerMsgs(prev => [...prev, ...fresh]);
      fetch(`${API_URL}/workstation-messages/seen`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: fresh.map(m => m.id) }),
      }).catch(() => {});
    } catch { /* polling — שקט */ }
  }, [presetId, adminMode]);

  useEffect(() => {
    pollState(); pollMessages();
    const t = setInterval(() => { pollState(); pollMessages(); }, POLL_MS);
    return () => clearInterval(t);
  }, [pollState, pollMessages]);

  // ── כתיבת state (אופטימי + PUT; fan-out בשרת) ─────────────────────────────
  // debounce ל-PUT: גרירה/שינוי-גודל/הקלדה יורים onChange עשרות פעמים —
  // כותבים לרשת רק אחרי שקט קצר (המצב המקומי מתעדכן מיידית). flush ביציאה.
  const putTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const pendingRef = useRef<Record<number, MDServiceState>>({});
  const flushPut = useCallback((serviceId: number) => {
    const state = pendingRef.current[serviceId];
    if (state === undefined) return;
    delete pendingRef.current[serviceId];
    lastLocalWriteRef.current[serviceId] = Date.now();
    fetch(`${API_URL}/mission-desk-state/${serviceId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset_id: presetId, state }),
    }).catch(() => {});
  }, [presetId]);

  const saveState = useCallback((serviceId: number, next: MDServiceState) => {
    setStates(prev => ({ ...prev, [serviceId]: next }));
    lastLocalWriteRef.current[serviceId] = Date.now();
    pendingRef.current[serviceId] = next;
    clearTimeout(putTimersRef.current[serviceId]);
    putTimersRef.current[serviceId] = setTimeout(() => flushPut(serviceId), 400);
  }, [flushPut]);

  useEffect(() => () => {
    // unmount — לשלוח כל מה שממתין
    Object.keys(pendingRef.current).forEach(sid => flushPut(Number(sid)));
    Object.values(putTimersRef.current).forEach(clearTimeout);
  }, [flushPut]);

  const setInteracting = useCallback((serviceId: number, busy: boolean) => {
    if (busy) interactingRef.current.add(serviceId);
    else interactingRef.current.delete(serviceId);
  }, []);

  const sendCompose = () => {
    if (!composeText.trim() || !composeTargets.length) return;
    fetch(`${API_URL}/workstation-messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_preset_id: presetId, from_preset_name: preset?.name || session.workstationName, to_preset_ids: composeTargets, message: composeText.trim() }),
    }).catch(() => {});
    setShowCompose(false); setComposeText(''); setComposeTargets([]);
  };

  // רשימת בקרים להחלפה — מסונן לפי approved_workstations (כמו SectorDashboard)
  const loadCrewList = useCallback(async () => {
    try {
      const all: CrewMember[] = await fetch(`${API_URL}/crew-members`).then(r => r.json());
      if (!Array.isArray(all)) return;
      setCrewList(all.filter(cm => {
        if (cm.is_admin) return true;
        const approved: number[] = (cm as any).approved_workstations || [];
        return approved.length === 0 || approved.includes(presetId);
      }));
    } catch { /* noop */ }
  }, [presetId]);

  // ── רנדור עץ הפריסה ───────────────────────────────────────────────────────
  const renderService = (serviceId: number | null) => {
    const svc = desk?.services.find(s => s.id === serviceId);
    if (!svc) return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.subtext, fontSize: 13 }}>
        {tr('missiondesk.noServiceAssigned')}
      </div>
    );
    const st = states[svc.id];
    const common = { theme, postLog };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div style={{ padding: '4px 10px', background: theme.headerBg, borderBottom: `1px solid ${theme.border}`, fontSize: 13, fontWeight: 'bold', color: theme.subtext, display: 'flex', alignItems: 'center', gap: 6 }}>
          {svc.service_type === 'buttons' ? '🎛' : svc.service_type === 'freetext' ? '✍️' : '📊'} {svc.name || tr('missiondesk.unnamedService')}
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {svc.service_type === 'buttons' && (
            <ButtonsBoard
              serviceName={svc.name}
              state={(st as MDButtonsState) || { buttons: [] }}
              onChange={s => saveState(svc.id, s)}
              presetId={presetId}
              presetName={preset?.name || session.workstationName}
              allPresets={allPresets}
              onInteracting={b => setInteracting(svc.id, b)}
              adminMode={adminMode}
              {...common}
            />
          )}
          {svc.service_type === 'freetext' && (
            adminMode ? (
              // בהגדרה לא מציגים שרבוטי עט — הכתיבה שייכת לעמדה
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.subtext, fontSize: 13, textAlign: 'center', padding: 12 }}>
                ✍️ {tr('missiondesk.freetextNotInSetup')}
              </div>
            ) : (
              <InkPad
                config={(svc.config as any) || {}}
                state={(st as MDFreeTextState) || { strokes: [] }}
                onChange={s => saveState(svc.id, s)}
                theme={theme}
                onInteracting={b => setInteracting(svc.id, b)}
              />
            )
          )}
          {svc.service_type === 'table' && (
            <SmartTable
              config={(svc.config as any) || { columns: [] }}
              state={(st as MDTableState) || { rows: [] }}
              onChange={s => saveState(svc.id, s)}
              adminMode={adminMode}
              {...common}
            />
          )}
        </div>
      </div>
    );
  };

  // ── ספליטרים בין אזורים — כיוונון אישי לעמדה, מותאם מגע/עט ────────────────
  const sizesFor = (node: { id: string; sizes: number[]; children: unknown[] }): number[] => {
    const ov = splitOverrides[node.id];
    return ov && ov.length === node.children.length ? ov : node.sizes;
  };

  const onSplitDown = (e: React.PointerEvent, node: { id: string; sizes: number[]; children: unknown[] }, idx: number, horizontal: boolean) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const parent = (e.currentTarget as HTMLElement).parentElement;
    const rect = parent?.getBoundingClientRect();
    splitDragRef.current = {
      nodeId: node.id, idx,
      start: horizontal ? e.clientX : e.clientY,
      orig: [...sizesFor(node)],
      len: (horizontal ? rect?.width : rect?.height) || 1,
      horizontal,
    };
  };
  const onSplitMove = (e: React.PointerEvent) => {
    const d = splitDragRef.current; if (!d) return;
    const rtl = document.documentElement.dir === 'rtl';
    const raw = (d.horizontal ? e.clientX : e.clientY) - d.start;
    const deltaPct = ((d.horizontal && rtl ? -raw : raw) / d.len) * 100;
    const a = d.orig[d.idx - 1] + deltaPct;
    const b = d.orig[d.idx] - deltaPct;
    if (a < 8 || b < 8) return; // מינימום 8% לאזור
    const next = [...d.orig];
    next[d.idx - 1] = a; next[d.idx] = b;
    setSplitOverrides(prev => ({ ...prev, [d.nodeId]: next }));
  };
  const onSplitUp = () => {
    if (!splitDragRef.current) return;
    splitDragRef.current = null;
    setSplitOverrides(prev => {
      try { localStorage.setItem(splitsStorageKey, JSON.stringify(prev)); } catch { /* noop */ }
      return prev;
    });
  };

  const renderNode = (node: MDNode): React.ReactNode => {
    if (node.type === 'leaf') {
      return (
        <div key={node.id} style={{ flex: 1, minWidth: 0, minHeight: 0, background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {renderService(node.service_id)}
        </div>
      );
    }
    const horizontal = node.direction === 'h';
    const sizes = sizesFor(node);
    return (
      <div key={node.id} style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', flex: 1, minWidth: 0, minHeight: 0 }}>
        {node.children.map((child, i) => (
          <Fragment key={child.id}>
            {i > 0 && (
              /* ספליטר רחב (12px) — נוח לאצבע/עט; pointer capture + touchAction:none */
              <div
                onPointerDown={e => onSplitDown(e, node, i, horizontal)}
                onPointerMove={onSplitMove}
                onPointerUp={onSplitUp}
                onPointerCancel={onSplitUp}
                title={tr('missiondesk.resizeSplitter')}
                style={{
                  flex: '0 0 12px', alignSelf: 'stretch', touchAction: 'none', zIndex: 5,
                  cursor: horizontal ? 'col-resize' : 'row-resize',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <div style={{
                  width: horizontal ? 4 : 34, height: horizontal ? 34 : 4,
                  borderRadius: 3, background: theme.border,
                }} />
              </div>
            )}
            <div style={{ display: 'flex', flexBasis: `${sizes[i] ?? 100 / node.children.length}%`, flexGrow: 0, flexShrink: 1, minWidth: 0, minHeight: 0 }}>
              {renderNode(child)}
            </div>
          </Fragment>
        ))}
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: theme.bg, color: theme.text, display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
      {/* פס עליון — אותה שפה ויזואלית כמו ה-header של כל העמדות (bt-topbar):
          לוגו + SKY KING, כפתור עמדה כחול, כפתור משתמש ירוק עם תפריט, צ'יפים ושעון */}
      <header className="bt-topbar" style={{ padding: '6px 16px', background: theme.panel, color: theme.text, display: 'flex', flexWrap: 'wrap', rowGap: 6, justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SkyKingLogo size={28} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2, fontFamily: 'monospace', lineHeight: 1 }}>SKY KING</div>
              <div style={{ fontSize: 8, color: '#93c5fd', letterSpacing: 1, lineHeight: 1.2 }}>🗂 {desk?.name || tr('missiondesk.title')}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {/* שם העמדה — כחול, כמו בכל עמדה */}
            <span style={{ background: '#2563eb', padding: '3px 8px', borderRadius: 4, fontSize: 11, textAlign: 'center', whiteSpace: 'nowrap', color: 'white', fontWeight: 'bold' }}>
              {preset?.name || session.workstationName}
            </span>
            {adminMode && <span style={{ fontSize: 11, fontWeight: 'bold', color: '#fbbf24', background: '#78350f', borderRadius: 4, padding: '3px 8px', whiteSpace: 'nowrap' }}>📌 {tr('missiondesk.configModeBadge')}</span>}
            {/* כפתור משתמש — ירוק עם תפריט (החלף משתמש / התנתק), כמו בעמדת בקר */}
            {!adminMode && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => { setShowUserMenu(v => !v); setShowCrewSwap(false); }}
                  style={{ background: showUserMenu ? '#047857' : '#059669', color: 'white', border: '1px solid #059669', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap', fontWeight: 'bold', justifyContent: 'center' }}>
                  {session.crewMember?.name || tr('missiondesk.noCrew')} {showUserMenu ? '▲' : '▼'}
                </button>
                {showUserMenu && (
                  <>
                    <div onClick={() => { setShowUserMenu(false); setShowCrewSwap(false); }} style={{ position: 'fixed', inset: 0, zIndex: 2999 }} />
                    <div style={{ position: 'absolute', top: '100%', insetInlineEnd: 0, marginTop: 4, background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 8, zIndex: 3000, minWidth: 180, maxHeight: 320, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
                      {!showCrewSwap ? (
                        <>
                          <div style={{ padding: '6px 12px', fontSize: 10, color: theme.subtext, borderBottom: `1px solid ${theme.border}` }}>
                            {session.crewMember?.name || tr('missiondesk.noCrew')}
                          </div>
                          {onCrewChange && (
                            <button onClick={() => { loadCrewList(); setShowCrewSwap(true); }}
                              style={{ display: 'block', width: '100%', textAlign: 'start', padding: '9px 14px', background: 'none', border: 'none', color: '#fbbf24', cursor: 'pointer', fontSize: 13 }}>
                              {tr('ctrl.switchUser')}
                            </button>
                          )}
                          <div style={{ borderTop: `1px solid ${theme.border}` }}>
                            <button onClick={onLogout}
                              style={{ display: 'block', width: '100%', textAlign: 'start', padding: '9px 14px', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 13 }}>
                              {tr('ctrl.logOut')}
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ padding: '6px 12px', fontSize: 10, color: theme.subtext, borderBottom: `1px solid ${theme.border}` }}>{tr('missiondesk.switchCrewTitle')}</div>
                          {crewList.filter(cm => cm.id !== session.crewMember?.id).map(cm => (
                            <button key={cm.id}
                              onClick={() => { setShowUserMenu(false); setShowCrewSwap(false); onCrewChange?.(cm); }}
                              style={{ display: 'block', width: '100%', padding: '9px 14px', background: 'none', border: 'none', color: theme.text, cursor: 'pointer', fontSize: 13, textAlign: 'start' }}>
                              👤 {cm.name}
                            </button>
                          ))}
                          {!crewList.length && <div style={{ padding: '8px 14px', fontSize: 12, color: theme.subtext }}>{tr('missiondesk.loading')}</div>}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* פתקיות — אותו כפתור/תפריט כמו בעמדת בקר */}
          {!adminMode && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowStickyDropdown(v => !v)}
                title={tr('ctrl.sharedNotes')}
                style={{ background: showStickyDropdown ? '#475569' : '#334155', padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, border: 'none', color: 'white', display: 'flex', alignItems: 'center', gap: 4 }}>
                {tr('ctrl.stickyNotes')}
                {stickyNotes.filter(n => !n.minimized).length > 0 && (
                  <span title={tr('ctrl.openNotes')} style={{ background: '#2563eb', color: 'white', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 'bold', minWidth: 16, textAlign: 'center' }}>
                    {stickyNotes.filter(n => !n.minimized).length}
                  </span>
                )}
                {stickyNotes.filter(n => n.minimized).length > 0 && (
                  <span title={tr('ctrl.closedNotes')} style={{ background: '#64748b', color: 'white', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 'bold', minWidth: 16, textAlign: 'center' }}>
                    {stickyNotes.filter(n => n.minimized).length} {tr('ctrl.closed2')}
                  </span>
                )}
              </button>
              {showStickyDropdown && (
                <>
                  <div onClick={() => setShowStickyDropdown(false)} style={{ position: 'fixed', inset: 0, zIndex: 2999 }} />
                  <div onClick={e => e.stopPropagation()}
                    style={{ position: 'absolute', top: '110%', insetInlineEnd: 0, background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '6px 0', minWidth: 220, zIndex: 3000, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                    <div style={{ padding: '4px 12px 6px', fontSize: 10, color: '#64748b', borderBottom: '1px solid #334155', marginBottom: 4 }}>{tr('ctrl.closedNotes')}</div>
                    {stickyNotes.filter(n => n.minimized).length === 0 && (
                      <div style={{ padding: '6px 12px', fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>{tr('ctrl.noClosedNotes')}</div>
                    )}
                    {stickyNotes.filter(n => n.minimized).map(note => (
                      <button key={note.id} onClick={() => {
                        setStickyNotes(prev => prev.map(n => n.id === note.id ? { ...n, minimized: false } : n));
                        fetch(`${API_URL}/sticky-notes/${note.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minimized: false, preset_id: presetId }) });
                      }}
                        style={{ display: 'block', width: '100%', textAlign: 'start', padding: '6px 12px', background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 12 }}>
                        📝 {note.title || tr('missiondesk.untitledNote')}
                      </button>
                    ))}
                    <div style={{ borderTop: '1px solid #334155', marginTop: 4, paddingTop: 4 }}>
                      <button onClick={async () => {
                        const x = 120 + (stickyNotes.length % 5) * 30;
                        const y = 140 + (stickyNotes.length % 5) * 30;
                        const res = await fetch(`${API_URL}/sticky-notes`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ title: '', content: '', creator_preset_id: presetId, creator_preset_name: preset?.name || session.workstationName, creator_crew_name: session.crewMember?.name || '', x, y }),
                        });
                        if (res.ok) { const note = await res.json(); setStickyNotes(prev => [...prev, note]); }
                        setShowStickyDropdown(false);
                      }}
                        style={{ display: 'block', width: '100%', textAlign: 'start', padding: '6px 12px', background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                        {tr('ctrl.addANewSticky')}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          {!adminMode && (
            <button onClick={() => setShowCompose(true)} title={tr('missiondesk.composeTitle')}
              style={{ background: '#334155', padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, border: 'none', color: 'white', display: 'flex', alignItems: 'center', gap: 4 }}>
              ✉️ {tr('missiondesk.composeBtn')}
            </button>
          )}
          <button
            onClick={() => setThemeMode(m => m === 'dark' ? 'light' : m === 'light' ? 'ocean' : 'dark')}
            title={tr('missiondesk.toggleTheme')}
            style={{ background: themeMode === 'ocean' ? '#1e3a5c' : themeMode === 'light' ? '#334155' : '#1e293b', border: `1px solid ${themeMode === 'ocean' ? '#38bdf8' : 'transparent'}`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 15, lineHeight: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
            {themeMode === 'light' ? '🌊' : themeMode === 'ocean' ? '🌙' : '☀️'}
          </button>
          {adminMode && (
            <button onClick={onLogout}
              style={{ background: '#059669', border: 'none', borderRadius: 4, padding: '5px 12px', cursor: 'pointer', fontSize: 12, color: '#fff', fontWeight: 'bold' }}>
              {tr('missiondesk.closeConfig')}
            </button>
          )}
          <ClockWidget lightMode={themeMode === 'light'} />
        </div>
      </header>

      {/* הודעה לעמדה — אותו מודל compose סגול כמו בכל העמדות (workstation-messages) */}
      {showCompose && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9986, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowCompose(false)}>
          <div style={{ background: '#1e293b', border: '1.5px solid #7c3aed', borderRadius: 12, padding: 20, width: 360, maxWidth: '95vw', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 'bold', color: '#c4b5fd', marginBottom: 10 }}>💬 {tr('missiondesk.composeTitle')}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{tr('admin.nmanym2')}</div>
            <div style={{ maxHeight: 130, overflowY: 'auto', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {allPresets.filter(p => p.id !== presetId).map(p => (
                <label key={p.id} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: composeTargets.includes(p.id) ? '#c4b5fd' : '#94a3b8' }}>
                  <input type="checkbox" checked={composeTargets.includes(p.id)}
                    onChange={e => setComposeTargets(cur => e.target.checked ? [...cur, p.id] : cur.filter(x => x !== p.id))} />
                  {p.name}
                </label>
              ))}
            </div>
            <textarea
              autoFocus
              value={composeText}
              onChange={e => setComposeText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && composeText.trim() && composeTargets.length) { e.preventDefault(); sendCompose(); } }}
              placeholder={tr('ctrl.writeAMessageEnter')}
              style={{ width: '100%', minHeight: 80, background: '#0f172a', color: 'white', border: '1px solid #7c3aed', borderRadius: 6, padding: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={sendCompose} disabled={!composeText.trim() || !composeTargets.length}
                style={{ padding: '8px 20px', background: composeText.trim() && composeTargets.length ? '#7c3aed' : '#374155', color: 'white', border: 'none', borderRadius: 6, cursor: composeText.trim() && composeTargets.length ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 'bold' }}>
                {'📨 ' + tr('missiondesk.composeSend')}
              </button>
              <button onClick={() => setShowCompose(false)}
                style={{ padding: '8px 16px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                {tr('shared.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* פתקיות — הרכיב המשותף של כל העמדות */}
      {!adminMode && (
        <StickyNotesLayer
          presetId={presetId}
          presetName={preset?.name || session.workstationName || ''}
          crewName={session.crewMember?.name || ''}
          notes={stickyNotes}
          setNotes={setStickyNotes}
        />
      )}

      {/* גוף הדסק */}
      <div style={{ flex: 1, display: 'flex', padding: 6, minHeight: 0 }}>
        {deskMissing || !preset?.mission_desk_id ? (
          <div style={{ margin: 'auto', textAlign: 'center', color: theme.subtext }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🗂</div>
            <div style={{ fontSize: 16 }}>{tr('missiondesk.noDeskConfigured')}</div>
          </div>
        ) : !desk ? (
          <div style={{ margin: 'auto', color: theme.subtext }}>{tr('missiondesk.loading')}</div>
        ) : !desk.layout_json ? (
          <div style={{ margin: 'auto', textAlign: 'center', color: theme.subtext }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📐</div>
            <div style={{ fontSize: 16 }}>{tr('missiondesk.noLayoutConfigured')}</div>
          </div>
        ) : renderNode(desk.layout_json)}
      </div>

      {/* התראות מתפרצות (תבנית ה-toast הסגול של SectorDashboard) */}
      {peerMsgs.length > 0 && (
        <div style={{ position: 'fixed', top: 60, insetInlineStart: '50%', transform: 'translateX(-50%)', zIndex: 9985, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420, width: '92vw' }}>
          {peerMsgs.map(m => (
            <div key={m.id} style={{ background: '#7c3aed', color: '#fff', borderRadius: 10, padding: '10px 14px', boxShadow: '0 6px 20px rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🔔</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, opacity: 0.85 }}>{m.from_preset_name}</div>
                <div style={{ fontSize: 15, fontWeight: 'bold', overflowWrap: 'break-word' }}>{m.message}</div>
              </div>
              <button onClick={() => setPeerMsgs(prev => prev.filter(x => x.id !== m.id))}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
