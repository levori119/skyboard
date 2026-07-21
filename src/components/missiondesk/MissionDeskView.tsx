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
  const [clock, setClock] = useState(() => new Date());
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
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

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

  const pad2 = (n: number) => String(n).padStart(2, '0');

  return (
    <div style={{ position: 'fixed', inset: 0, background: theme.bg, color: theme.text, display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
      {/* פס עליון — מבנה סטנדרטי כמו בכל עמדה: שם עמדה, בקר + החלפה, פעולות */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px', background: theme.panel, borderBottom: `1px solid ${theme.border}`, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 18, fontWeight: 'bold' }}>🗂 {preset?.name || session.workstationName}</span>
        <span style={{ fontSize: 13, color: theme.subtext }}>{desk?.name || tr('missiondesk.title')}</span>
        {adminMode && <span style={{ fontSize: 13, fontWeight: 'bold', color: '#fbbf24', background: '#78350f', borderRadius: 6, padding: '2px 10px' }}>📌 {tr('missiondesk.configModeBadge')}</span>}
        {!adminMode && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: theme.subtext, background: theme.panelAlt, borderRadius: 6, padding: '3px 10px' }}>
            👤 {session.crewMember?.name || tr('missiondesk.noCrew')}
            {onCrewChange && (
              <button onClick={() => { loadCrewList(); setShowCrewSwap(v => !v); }}
                style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 5, color: theme.accent, cursor: 'pointer', fontSize: 11, padding: '1px 8px' }}>
                {tr('missiondesk.switchCrew')}
              </button>
            )}
          </span>
        )}
        <span style={{ marginInlineStart: 'auto', fontSize: 16, fontVariantNumeric: 'tabular-nums', color: theme.accent }}>
          {pad2(clock.getHours())}:{pad2(clock.getMinutes())}:{pad2(clock.getSeconds())}
        </span>
        {!adminMode && (
          <button onClick={() => setShowCompose(true)} title={tr('missiondesk.composeTitle')}
            style={{ background: '#334155', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: '#fff' }}>
            ✉️ {tr('missiondesk.composeBtn')}
          </button>
        )}
        <button
          onClick={() => setThemeMode(m => m === 'light' ? 'ocean' : m === 'ocean' ? 'dark' : 'light')}
          title={tr('missiondesk.toggleTheme')}
          style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>
          {themeMode === 'light' ? '🌊' : themeMode === 'ocean' ? '🌙' : '☀️'}
        </button>
        <button onClick={onLogout}
          style={{ background: adminMode ? '#059669' : 'none', border: `1px solid ${adminMode ? '#059669' : theme.border}`, borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 13, color: adminMode ? '#fff' : theme.subtext, fontWeight: adminMode ? 'bold' : 'normal' }}>
          {adminMode ? tr('missiondesk.closeConfig') : tr('missiondesk.logout')}
        </button>
      </div>

      {/* החלפת בקר — אותה זרימה כמו בעמדת בקר (onCrewChange של App) */}
      {showCrewSwap && (
        <>
          <div onClick={() => setShowCrewSwap(false)} style={{ position: 'fixed', inset: 0, zIndex: 2999 }} />
          <div style={{ position: 'absolute', top: 44, insetInlineStart: 220, zIndex: 3000, background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', minWidth: 220, maxHeight: 320, overflowY: 'auto', padding: '6px 0' }}>
            <div style={{ padding: '4px 14px 8px', fontSize: 11, color: theme.subtext, borderBottom: `1px solid ${theme.border}` }}>{tr('missiondesk.switchCrewTitle')}</div>
            {crewList.filter(cm => cm.id !== session.crewMember?.id).map(cm => (
              <button key={cm.id}
                onClick={() => { setShowCrewSwap(false); onCrewChange?.(cm); }}
                style={{ display: 'block', width: '100%', padding: '8px 14px', background: 'none', border: 'none', color: theme.text, cursor: 'pointer', fontSize: 14, textAlign: 'start' }}>
                👤 {cm.name}
              </button>
            ))}
            {!crewList.length && <div style={{ padding: '8px 14px', fontSize: 12, color: theme.subtext }}>{tr('missiondesk.loading')}</div>}
          </div>
        </>
      )}

      {/* הודעה לעמדה אחרת — מנגנון workstation-messages הקיים */}
      {showCompose && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowCompose(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 18, width: 'min(420px, 92vw)', color: theme.text }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>✉️ {tr('missiondesk.composeTitle')}</h3>
            <div style={{ maxHeight: 140, overflowY: 'auto', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {allPresets.filter(p => p.id !== presetId).map(p => (
                <label key={p.id} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, color: theme.subtext }}>
                  <input type="checkbox" checked={composeTargets.includes(p.id)}
                    onChange={e => setComposeTargets(cur => e.target.checked ? [...cur, p.id] : cur.filter(x => x !== p.id))} />
                  {p.name}
                </label>
              ))}
            </div>
            <textarea value={composeText} onChange={e => setComposeText(e.target.value)} rows={3}
              placeholder={tr('missiondesk.composePlaceholder')}
              style={{ width: '100%', boxSizing: 'border-box', background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text, padding: 8, fontSize: 14, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCompose(false)} style={{ padding: '8px 16px', background: 'none', border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.subtext, cursor: 'pointer', fontSize: 14 }}>{tr('missiondesk.cancel')}</button>
              <button
                disabled={!composeText.trim() || !composeTargets.length}
                onClick={() => {
                  fetch(`${API_URL}/workstation-messages`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ from_preset_id: presetId, from_preset_name: preset?.name || session.workstationName, to_preset_ids: composeTargets, message: composeText.trim() }),
                  }).catch(() => {});
                  setShowCompose(false); setComposeText(''); setComposeTargets([]);
                }}
                style={{ padding: '8px 20px', background: composeText.trim() && composeTargets.length ? '#7c3aed' : '#334155', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 'bold' }}>
                {tr('missiondesk.composeSend')}
              </button>
            </div>
          </div>
        </div>
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
