import React from 'react';
import { tr } from '../../i18n/tr';
import {
  MIN_LINK_MEMBERS,
  addMember,
  groupSummary,
  isMemberTaken,
  removeMember,
  routeKindIcon,
  validateLinkGroup,
  type LinkGroup,
  type LinkMember,
} from '../../utils/routeLinks';

// סקשן "קישורי מסלולים" ביישות שדה התעופה.
//
// ── למה סקשן משלו ────────────────────────────────────────────────────────────
// הקישור ישב בתוך "מסלולי הסעה" ולכן נראה כאילו הוא שייך להסעה בלבד. אותו מסלול
// פיזי נראה בשני שדות בשמות שונים גם כשהוא **מסלול המראה**, ולכן הקישור הוא
// רובד בפני עצמו והבורר מציע כל סוג מסלול (אייקון הסוג מופיע לצד השם).
//
// ── למה שדה תעופה ולא עמדה ───────────────────────────────────────────────────
// הבורר הראשון היה **עמדה**, וזו הייתה טעות באפיון: מסלול שייך לשדה, ועמדה
// רואה אותו דרך השדה שלה. הקישור הוא בין שדות, ולכן בוחרים שדה -> מסלול שלו.
//
// ── למה קבוצה ─────────────────────────────────────────────────────────────────
// המודל הישן היה זוגי: קישור בין שלושה שדות דרש שלושה זוגות נפרדים שכל אחד מהם
// ניתן היה למחוק לבד ולהשאיר קישור חלקי. כאן קישור אחד = קבוצה, N>=2.

interface RouteRow {
  id: number; name?: string | null; airfield_id?: number | null;
  is_runway?: boolean | null; route_category?: string | null;
}
interface AirfieldRow { id: number; name?: string | null }

interface Props {
  apiUrl: string;
  airfieldId: number;
  groups: LinkGroup[];
  airfields: AirfieldRow[];
  routes: RouteRow[];
  expanded: boolean;
  onToggle: () => void;
  onReload: () => void | Promise<void>;
  confirmDelete: (msg: string) => boolean | Promise<boolean>;
}

const btn = (bg: string, fg: string, border = 'none'): React.CSSProperties => ({
  padding: '3px 9px', background: bg, color: fg, border: border === 'none' ? 'none' : `1px solid ${border}`,
  borderRadius: '4px', cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap',
});
const sel: React.CSSProperties = {
  padding: '4px 7px', background: '#1e293b', border: '1px solid #334155',
  borderRadius: '4px', color: '#e2e8f0', fontSize: '11px', direction: 'rtl', minWidth: 0,
};

export default function RouteLinksSection({
  apiUrl, airfieldId, groups, airfields, routes, expanded, onToggle, onReload, confirmDelete,
}: Props) {
  const [editing, setEditing] = React.useState<{ id: number | null; name: string; members: LinkMember[] } | null>(null);
  const [draft, setDraft] = React.useState({ airfieldId: '', routeId: '' });
  const [error, setError] = React.useState('');

  const airfieldById = new Map(airfields.map(a => [a.id, a]));
  const routeById = new Map(routes.map(r => [r.id, r]));

  /** המסלולים שניתן לבחור לשדה - רק שלו. השדה הוא תכונה של המסלול, לא בחירה נפרדת. */
  const routesForAirfield = (afId: number): RouteRow[] =>
    routes.filter(r => Number(r.airfield_id) === Number(afId));

  const routeLabel = (r: RouteRow) => `${routeKindIcon(r)} ${r.name || `#${r.id}`}`;

  /** שם השדה של החבר - נגזר מהמסלול, ורק בהיעדרו נופל למה שהשרת החזיר. */
  const memberAirfieldName = (mem: LinkMember): string => {
    const afId = routeById.get(mem.route_id)?.airfield_id ?? mem.airfield_id;
    return (afId != null ? airfieldById.get(Number(afId))?.name : '') || mem.airfield_name || '';
  };

  const startNew = () => { setEditing({ id: null, name: '', members: [] }); setDraft({ airfieldId: '', routeId: '' }); setError(''); };
  const startEdit = (g: LinkGroup) => {
    setEditing({ id: g.id, name: g.name || '', members: g.members.map(x => ({ ...x })) });
    setDraft({ airfieldId: '', routeId: '' }); setError('');
  };

  const addDraft = () => {
    if (!editing) return;
    const airfield_id = Number(draft.airfieldId), route_id = Number(draft.routeId);
    if (!airfield_id || !route_id) return;
    if (isMemberTaken(editing.members, { route_id })) { setError(tr('links.alreadyInGroup')); return; }
    setEditing({ ...editing, members: addMember(editing.members, {
      route_id,
      airfield_id,
      airfield_name: airfieldById.get(airfield_id)?.name || '',
      route_name: routeById.get(route_id)?.name || '',
    }) });
    setDraft({ airfieldId: '', routeId: '' });
    setError('');
  };

  const save = async () => {
    if (!editing) return;
    const v = validateLinkGroup(editing.members);
    if (!v.ok) { setError(v.reason === 'tooFew' ? tr('links.needTwo') : tr('links.invalidMembers')); return; }
    const body = { name: editing.name, airfield_id: airfieldId, members: editing.members.map(x => ({ route_id: x.route_id })) };
    const res = await fetch(`${apiUrl}/route-link-groups${editing.id ? `/${editing.id}` : ''}`, {
      method: editing.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) { setError(tr('links.saveFailed')); return; }
    setEditing(null);
    await onReload();
  };

  const remove = async (g: LinkGroup) => {
    if (!await confirmDelete(tr('links.confirmDelete'))) return;
    await fetch(`${apiUrl}/route-link-groups/${g.id}`, { method: 'DELETE' });
    if (editing?.id === g.id) setEditing(null);
    await onReload();
  };

  const draftRoutes = draft.airfieldId ? routesForAirfield(Number(draft.airfieldId)) : [];

  return (
    <div data-testid="route-links-section" style={{ borderTop: '1px solid #334155', paddingTop: '10px' }}>
      <div data-testid="route-links-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: expanded ? '6px' : 0, cursor: 'pointer' }}
        onClick={onToggle}>
        <div style={{ color: '#7dd3fc', fontSize: '11px', fontWeight: 'bold', flex: 1 }}>
          {tr('links.routeLinks')} ({groups.length})
        </div>
        {expanded && !editing && (
          <button data-testid="route-link-add" onClick={e => { e.stopPropagation(); startNew(); }} style={btn('#0284c7', 'white')}>
            {tr('links.addLink')}
          </button>
        )}
        <span style={{ color: expanded ? '#7dd3fc' : '#475569', fontSize: '11px', marginInlineStart: '4px' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', direction: 'rtl' }}>
          <div style={{ fontSize: '10px', color: '#64748b' }}>{tr('links.explainer')}</div>

          {!groups.length && !editing && (
            <div style={{ color: '#475569', fontSize: '11px', textAlign: 'center', padding: '4px 0' }}>{tr('links.none')}</div>
          )}

          {groups.map(g => {
            const s = groupSummary(g);
            return (
              <div key={g.id} data-testid="route-link-group" data-group-id={g.id} data-member-count={g.members.length}
                style={{ background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '6px', padding: '7px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ flex: 1, fontSize: '11px', color: '#e2e8f0', fontWeight: 'bold' }}>
                    {g.name || tr('links.unnamed')}
                    <span style={{ color: '#64748b', fontWeight: 'normal', marginInlineStart: '6px' }}>
                      {tr('links.summary', { airfields: s.airfieldCount, routes: s.routeCount })}
                    </span>
                  </span>
                  <button data-testid="route-link-edit" onClick={() => startEdit(g)} style={btn('#1e3a5f', '#93c5fd', '#2563eb')}>✎</button>
                  <button data-testid="route-link-delete" onClick={() => remove(g)} style={btn('transparent', '#fca5a5', '#7f1d1d')}>✕</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {g.members.map(mem => (
                    <span key={mem.route_id} data-testid="route-link-member"
                      style={{ background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: '4px', padding: '2px 6px', fontSize: '10px' }}>
                      <span style={{ color: '#94a3b8' }}>{memberAirfieldName(mem)} / </span>
                      <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>
                        {routeById.has(mem.route_id) ? routeKindIcon(routeById.get(mem.route_id)!) + ' ' : ''}{mem.route_name}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}

          {editing && (
            <div data-testid="route-link-form" style={{ background: '#082f49', border: '1px solid #0ea5e9', borderRadius: '6px', padding: '8px' }}>
              <input value={editing.name} placeholder={tr('links.linkName')}
                onChange={e => setEditing({ ...editing, name: e.target.value })}
                style={{ ...sel, width: '100%', marginBottom: '6px', boxSizing: 'border-box' }} />

              {editing.members.map((mem, i) => (
                <div key={mem.route_id} style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                  <span style={{ flex: 1, fontSize: '11px', color: '#e2e8f0' }}>
                    <span style={{ color: '#94a3b8' }}>{memberAirfieldName(mem)} / </span>
                    <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>
                      {routeById.has(mem.route_id) ? routeKindIcon(routeById.get(mem.route_id)!) + ' ' : ''}{mem.route_name}
                    </span>
                  </span>
                  <button data-testid="route-link-member-remove"
                    onClick={() => setEditing({ ...editing, members: removeMember(editing.members, i) })}
                    style={btn('transparent', '#fca5a5', '#7f1d1d')}>✕</button>
                </div>
              ))}

              <div style={{ display: 'flex', gap: '5px', alignItems: 'center', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #0c4a6e' }}>
                <select data-testid="route-link-airfield" value={draft.airfieldId}
                  onChange={e => setDraft({ airfieldId: e.target.value, routeId: '' })} style={{ ...sel, flex: 1 }}>
                  <option value="">{tr('links.selectAirfield')}</option>
                  {airfields.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <select data-testid="route-link-route" value={draft.routeId} disabled={!draft.airfieldId}
                  onChange={e => setDraft(d => ({ ...d, routeId: e.target.value }))} style={{ ...sel, flex: 1, opacity: draft.airfieldId ? 1 : 0.5 }}>
                  <option value="">{tr('links.selectRoute')}</option>
                  {draftRoutes.map(r => <option key={r.id} value={r.id}>{routeLabel(r)}</option>)}
                </select>
                <button data-testid="route-link-member-add" onClick={addDraft} disabled={!draft.airfieldId || !draft.routeId}
                  style={{ ...btn('#0ea5e9', 'white'), opacity: draft.airfieldId && draft.routeId ? 1 : 0.4 }}>
                  {tr('links.addMember')}
                </button>
              </div>

              {draft.airfieldId && !draftRoutes.length && (
                <div style={{ fontSize: '10px', color: '#f59e0b', marginTop: '4px' }}>{tr('links.noRoutesForAirfield')}</div>
              )}
              {error && <div data-testid="route-link-error" style={{ fontSize: '10px', color: '#fca5a5', marginTop: '4px' }}>{error}</div>}

              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                <button data-testid="route-link-save" onClick={save}
                  disabled={editing.members.length < MIN_LINK_MEMBERS}
                  style={{ ...btn('#16a34a', 'white'), opacity: editing.members.length < MIN_LINK_MEMBERS ? 0.4 : 1 }}>
                  {tr('shared.save')}
                </button>
                <button onClick={() => setEditing(null)} style={btn('#1e293b', '#94a3b8', '#334155')}>{tr('shared.cancel')}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
