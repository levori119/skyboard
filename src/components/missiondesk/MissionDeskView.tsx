// עמדת "דסק משימה כללי" — מסך עצמאי סביב קנבס הדסק (MissionDeskBody).
// משמש היום את **מצב ההגדרה** במסך הניהול (adminMode): כותרת מינימלית + הקנבס.
// העמדה האמיתית רצה בתוך SectorDashboard (preset_type === 'mission_desk'), כדי
// שתקבל את כל מה שמוגדר לה בניהול — עזרים, דש בורד, מצבי בסיס, עומס — כמו כל עמדה.
// התראות מתפרצות (workstation-messages) מוצגות כאן בתבנית ה-toast של SectorDashboard.
import { useCallback, useEffect, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import { API_URL } from '../../config';
import type { CrewMember, WorkstationSession } from '../../types';
import { mdTheme, type MDThemeMode } from './theme';
import { SkyKingLogo } from '../shared/SkyKingLogo';
import { RotatingEmblems } from '../shared/RotatingEmblems';
import EnvironmentBadge from '../shared/EnvironmentBadge';
import MirageCrewSwap from '../shared/MirageCrewSwap';
import { ClockWidget } from '../../ClockWidget';
import { StickyNotesLayer } from '../admin/managers';
import MissionDeskBody, { useMissionDeskName } from './MissionDeskBody';

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

export default function MissionDeskView({ session, preset, allPresets, onLogout, onCrewChange, adminMode }: Props) {
  const presetId = Number(session.presetId || preset?.id);
  const deskId = preset?.mission_desk_id ? Number(preset.mission_desk_id) : null;
  const deskName = useMissionDeskName(deskId);
  const [peerMsgs, setPeerMsgs] = useState<PeerMsg[]>([]);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showCrewSwap, setShowCrewSwap] = useState(false);
  const [crewList, setCrewList] = useState<CrewMember[]>([]);
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

  const seenMsgIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => { localStorage.setItem('bt-themeMode', themeMode); }, [themeMode]);

  // ── polling: התראות מתפרצות ───────────────────────────────────────────────
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
    pollMessages();
    const t = setInterval(pollMessages, POLL_MS);
    return () => clearInterval(t);
  }, [pollMessages]);

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

  return (
    <div style={{ position: 'fixed', inset: 0, background: theme.bg, color: theme.text, display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
      {/* פס עליון — אותה שפה ויזואלית כמו ה-header של כל העמדות (bt-topbar):
          לוגו + SKY KING, כפתור עמדה כחול, כפתור משתמש ירוק עם תפריט, צ'יפים ושעון */}
      <header className="bt-topbar" style={{ padding: '6px 16px', background: theme.panel, color: theme.text, display: 'flex', flexWrap: 'wrap', rowGap: 6, justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* לוגו + סמלי בסיס האב/מיח"ה מתחתיו — עמודה צרה שלא גוזלת רוחב מהסרגל */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <SkyKingLogo size={28} />
              {/* סמלי בסיס האב + מיח"ה — סיבוב כניסה בעליית המערכת */}
              <RotatingEmblems variant="topbar" parentBase={session.parentBase} themeMode={themeMode} size={13} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2, fontFamily: 'monospace', lineHeight: 1 }}>SKY KING</div>
              <div style={{ fontSize: 8, color: '#93c5fd', letterSpacing: 1, lineHeight: 1.2 }}>🗂 {deskName || tr('missiondesk.title')}</div>
            </div>
          </div>
          <EnvironmentBadge themeMode={themeMode} />
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
                          {/* חריג מיראז': בכניסת מיראז' — רק מורשי העמדה ממיראז' + הזדהות מחדש במ.א. (רכיב משותף) */}
                          {session.crewMember?.auth_source === 'mirage' ? (
                            <div style={{ padding: '8px 10px', minWidth: 240 }}>
                              <MirageCrewSwap
                                presetId={presetId}
                                currentPersonalId={session.crewMember?.personal_id}
                                onSwapped={(cm) => { setShowUserMenu(false); setShowCrewSwap(false); onCrewChange?.(cm); }}
                                dark
                              />
                            </div>
                          ) : (
                          <>
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

      {/* גוף הדסק — הרכיב המשותף (אותו קנבס גם בתוך SectorDashboard) */}
      <MissionDeskBody
        presetId={presetId}
        deskId={deskId}
        presetName={preset?.name || session.workstationName}
        crewMemberId={session.crewMember?.id ?? null}
        crewMemberName={session.crewMember?.name ?? null}
        allPresets={allPresets}
        themeMode={themeMode}
        adminMode={adminMode}
      />

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
