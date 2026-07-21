// עמדת "דסק משימה כללי" — המסך שרואה המפעיל בעמדה מסוג mission_desk.
// טוען את הגדרת הדסק (עץ BSP + שירותים) ואת ה-state של העמדה, מרנדר כל שירות
// באזור שלו, ומסנכרן ב-polling (כמו שאר המערכת — אין WebSocket):
//   · GET /api/mission-desk-state — מצב השירותים (כולל עדכונים מעמדות משותפות)
//   · GET /api/workstation-messages — התראות מתפרצות (toast, תבנית SectorDashboard)
// עריכה מקומית לא נדרסת: בזמן אינטראקציה או מיד אחרי כתיבה מקומית — הדילוג על apply.
import { useCallback, useEffect, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import { API_URL } from '../../config';
import type { WorkstationSession } from '../../types';
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
  // מצב הגדרה (מתוך עורך העמדה): אמצעים/שורות שנוצרים מסומנים "קבוע",
  // לא נשלחות התראות אמת, וכפתור הסגירה מחליף את ההתנתקות.
  adminMode?: boolean;
}

interface PeerMsg { id: number; from_preset_name: string; message: string; created_at: string }

const POLL_MS = 5000;
// גדול ממחזור ה-poll: כתיבה מקומית לא תידרס ע"י GET שרץ לפני שה-PUT התחייב ב-DB
// (Neon latency). עדכונים משותפים לשירותים שלא נערכים כרגע — עדיין ≤ POLL_MS.
const LOCAL_WRITE_GRACE_MS = 8000;

export default function MissionDeskView({ session, preset, allPresets, onLogout, adminMode }: Props) {
  const presetId = Number(session.presetId || preset?.id);
  const [desk, setDesk] = useState<(MissionDesk & { services: MissionDeskService[] }) | null>(null);
  const [deskMissing, setDeskMissing] = useState(false);
  const [states, setStates] = useState<Record<number, MDServiceState>>({});
  const [peerMsgs, setPeerMsgs] = useState<PeerMsg[]>([]);
  const [clock, setClock] = useState(() => new Date());
  const [themeMode, setThemeMode] = useState<MDThemeMode>(() => {
    const s = localStorage.getItem('bt-themeMode');
    return s === 'light' || s === 'ocean' ? s : 'dark';
  });
  const theme = mdTheme(themeMode);

  const interactingRef = useRef<Set<number>>(new Set());
  const lastLocalWriteRef = useRef<Record<number, number>>({});
  const seenMsgIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => { localStorage.setItem('bt-themeMode', themeMode); }, [themeMode]);
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
  const saveState = useCallback((serviceId: number, next: MDServiceState) => {
    setStates(prev => ({ ...prev, [serviceId]: next }));
    lastLocalWriteRef.current[serviceId] = Date.now();
    fetch(`${API_URL}/mission-desk-state/${serviceId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset_id: presetId, state: next }),
    }).catch(() => {});
  }, [presetId]);

  const setInteracting = useCallback((serviceId: number, busy: boolean) => {
    if (busy) interactingRef.current.add(serviceId);
    else interactingRef.current.delete(serviceId);
  }, []);

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
            <InkPad
              config={(svc.config as any) || {}}
              state={(st as MDFreeTextState) || { strokes: [] }}
              onChange={s => saveState(svc.id, s)}
              theme={theme}
              onInteracting={b => setInteracting(svc.id, b)}
            />
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

  const renderNode = (node: MDNode): React.ReactNode => {
    if (node.type === 'leaf') {
      return (
        <div key={node.id} style={{ flex: 1, minWidth: 0, minHeight: 0, background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {renderService(node.service_id)}
        </div>
      );
    }
    return (
      <div key={node.id} style={{ display: 'flex', flexDirection: node.direction === 'h' ? 'row' : 'column', gap: 6, flex: 1, minWidth: 0, minHeight: 0 }}>
        {node.children.map((child, i) => (
          <div key={child.id} style={{ display: 'flex', flexBasis: `${node.sizes[i] ?? 100 / node.children.length}%`, flexGrow: 0, flexShrink: 1, minWidth: 0, minHeight: 0 }}>
            {renderNode(child)}
          </div>
        ))}
      </div>
    );
  };

  const pad2 = (n: number) => String(n).padStart(2, '0');

  return (
    <div style={{ position: 'fixed', inset: 0, background: theme.bg, color: theme.text, display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
      {/* פס עליון */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 14px', background: theme.panel, borderBottom: `1px solid ${theme.border}` }}>
        <span style={{ fontSize: 17, fontWeight: 'bold' }}>🗂 {desk?.name || tr('missiondesk.title')}</span>
        <span style={{ fontSize: 13, color: theme.subtext }}>{preset?.name || session.workstationName}</span>
        {adminMode && <span style={{ fontSize: 13, fontWeight: 'bold', color: '#fbbf24', background: '#78350f', borderRadius: 6, padding: '2px 10px' }}>📌 {tr('missiondesk.configModeBadge')}</span>}
        {session.crewMember?.name && <span style={{ fontSize: 13, color: theme.subtext }}>· {session.crewMember.name}</span>}
        <span style={{ marginInlineStart: 'auto', fontSize: 16, fontVariantNumeric: 'tabular-nums', color: theme.accent }}>
          {pad2(clock.getHours())}:{pad2(clock.getMinutes())}:{pad2(clock.getSeconds())}
        </span>
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
