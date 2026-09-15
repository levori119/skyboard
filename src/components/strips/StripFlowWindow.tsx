import React from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../../i18n/tr';
import { API_URL } from '../../config';
import { useDockableWindow } from '../../hooks/useDockableWindow';
import { useDragPosition } from '../../hooks/useDragPosition';
import { windowFrame, type FrameTheme } from '../../utils/windowFrame';
import { evaluateQuery, hasConditions, type QEvalCtx } from '../../utils/queryBuilder';
import type { QGroup } from '../../types';
import { QueryBuilder } from '../query/QueryBuilder';
import {
  flowChain, flowCurrentDescriptor, flowEventDescriptor, flowStripId, flowTime, formatAircraft,
  type FlowChainStep, type StripFlow,
} from '../../utils/stripFlow';

// ─── FLOW של פ"מ ──────────────────────────────────────────────────────────────
//
// חלון **צפייה** אחד בכל העמדה, בשני מצבים:
//   • טבלה מרוכזת - כל הפ"מים (אחרי חיפוש/שאילתא): נמצא עכשיו + שרשרת השלבים
//   • פירוט - כל שלבי פ"מ אחד עם שעה, מקום, מטוסים ומי ביצע
//
// נפתח מכל מקום דרך openStripFlow(id) (utils/stripFlow). הנתונים והחישוב של
// "נמצא עכשיו" מגיעים מהשרת - אותה תשובה בכל עמדה. ראה STRIP_FLOW_SPEC.md.

const POLL_MS = 5000;
const MAX_IDS = 500;

export const flowPalette = (themeMode: FrameTheme) =>
  themeMode === 'dark'
    ? { panel: 'rgba(15,23,42,0.97)', head: '#0f172a', border: '#1e3a5f', line: '#1e293b', text: '#e2e8f0', muted: '#94a3b8', input: '#1e293b', inputBorder: '#334155', rowAlt: 'rgba(30,41,59,0.4)', chip: '#1e293b', accent: '#38bdf8', hover: 'rgba(56,189,248,0.10)' }
    : themeMode === 'ocean'
    ? { panel: 'rgba(8,47,73,0.97)', head: '#05404e', border: '#0e7490', line: '#155e75', text: '#cffafe', muted: '#7dd3fc', input: '#083344', inputBorder: '#0e7490', rowAlt: 'rgba(14,116,144,0.18)', chip: '#083344', accent: '#67e8f9', hover: 'rgba(103,232,249,0.12)' }
    : { panel: 'rgba(248,250,252,0.98)', head: '#e2e8f0', border: '#94a3b8', line: '#cbd5e1', text: '#1e293b', muted: '#475569', input: '#ffffff', inputBorder: '#cbd5e1', rowAlt: 'rgba(226,232,240,0.5)', chip: '#e2e8f0', accent: '#0369a1', hover: 'rgba(3,105,161,0.08)' };
type Pal = ReturnType<typeof flowPalette>;

// צבעי השלבים הם צבעי סטטוס - קבועים בכל תמה (אותם צבעים כמו סטטוסי הקרקע במגדל)
const STEP_COLOR: Record<FlowChainStep['kind'], string> = {
  datk: '#a78bfa', taxi: '#22c55e', takeoff: '#ef4444', point: '#f59e0b', station: '#3b82f6', landed: '#64748b',
};
const GROUND_COLOR: Record<string, string> = { taxi: '#22c55e', lineup: '#3b82f6', takeoff: '#ef4444' };

const stripTitle = (s: StripFlow['strip']) => [s.callsign, s.sq].filter(Boolean).join(' ') || `#${s.id}`;

/** שרשרת השלבים: "יצא מהדת"ק 11:00 ← הסיע 11:15 ← המריא 33 ← פלמח ← 305" */
export function FlowChainView({ steps, C }: { steps: FlowChainStep[]; C: Pal }) {
  if (steps.length === 0) return <span style={{ color: C.muted, fontSize: '11px' }}>{tr('flow.noSteps')}</span>;
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '3px' }}>
      {steps.map((st, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span aria-hidden style={{ color: C.muted, fontSize: '11px' }}>{tr('flow.arrow')}</span>}
          <span
            data-testid={`flow-chip-${st.kind}`}
            title={tr(`flow.chip_${st.kind}`)}
            style={{
              display: 'inline-flex', alignItems: 'baseline', gap: '4px', padding: '1px 6px', borderRadius: '4px',
              background: C.chip, borderInlineStart: `3px solid ${STEP_COLOR[st.kind]}`, color: C.text,
              fontSize: '11px', whiteSpace: 'nowrap',
            }}>
            <span style={{ fontWeight: 'bold' }}>
              {st.label ?? tr(`flow.chip_${st.kind}`)}
            </span>
            {(st.kind === 'datk' || st.kind === 'takeoff') && st.label && (
              <span style={{ color: C.muted, fontSize: '10px' }}>{tr(`flow.chip_${st.kind}`)}</span>
            )}
            <span style={{ color: C.muted, fontSize: '10px', fontVariantNumeric: 'tabular-nums' }}>{flowTime(st.at)}</span>
          </span>
        </React.Fragment>
      ))}
    </span>
  );
}

/** "נמצא עכשיו" - משפט אחד + תג סטטוס קרקעי / באוויר */
export function FlowNowView({ flow, C }: { flow: StripFlow; C: Pal }) {
  const d = flowCurrentDescriptor(flow.current);
  const airborne = flow.current.kind !== 'landed' && (flow.current as any).airborne === true;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
      <span style={{ color: flow.current.kind === 'landed' ? C.muted : C.text, fontWeight: 'bold' }}>{tr(d.key, d.params)}</span>
      {d.groundStatus && (
        <span style={{ fontSize: '10px', padding: '0 5px', borderRadius: '3px', border: `1px solid ${GROUND_COLOR[d.groundStatus]}`, color: GROUND_COLOR[d.groundStatus] }}>
          {tr(`flow.ground_${d.groundStatus}`)}
        </span>
      )}
      {airborne && (
        <span style={{ fontSize: '10px', padding: '0 5px', borderRadius: '3px', border: '1px solid #3b82f6', color: '#3b82f6' }}>
          {tr('flow.airborneTag')}
        </span>
      )}
    </span>
  );
}

/** הטבלה המרוכזת */
export function StripFlowList({ flows, C, onOpen }: { flows: StripFlow[]; C: Pal; onOpen: (id: number) => void }) {
  const th: React.CSSProperties = { padding: '5px 8px', textAlign: 'start', fontSize: '10px', fontWeight: 'bold', color: C.muted, whiteSpace: 'nowrap', borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 0, background: C.head };
  const td: React.CSSProperties = { padding: '5px 8px', fontSize: '12px', color: C.text, borderBottom: `1px solid ${C.line}`, verticalAlign: 'top' };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={th}>{tr('flow.colStrip')}</th>
          <th style={th}>{tr('flow.colNow')}</th>
          <th style={th}>{tr('flow.colFlow')}</th>
          <th style={th}>{tr('flow.colLast')}</th>
        </tr>
      </thead>
      <tbody>
        {flows.map((f, i) => {
          const last = f.events[f.events.length - 1];
          return (
            <tr
              key={f.strip.id}
              data-testid={`flow-row-${f.strip.id}`}
              onClick={() => onOpen(f.strip.id)}
              style={{ cursor: 'pointer', background: i % 2 ? C.rowAlt : 'transparent' }}
              onPointerEnter={e => { e.currentTarget.style.background = C.hover; }}
              onPointerLeave={e => { e.currentTarget.style.background = i % 2 ? C.rowAlt : 'transparent'; }}>
              <td style={{ ...td, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                {stripTitle(f.strip)}
                {f.strip.number_of_formation && <span style={{ color: C.muted, fontWeight: 'normal', fontSize: '10px', marginInlineStart: '5px' }}>x{f.strip.number_of_formation}</span>}
              </td>
              <td style={{ ...td, minWidth: '150px' }}><FlowNowView flow={f} C={C} /></td>
              <td style={td}><FlowChainView steps={flowChain(f.events)} C={C} /></td>
              <td style={{ ...td, whiteSpace: 'nowrap', color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{flowTime(last?.occurred_at)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** פירוט פ"מ אחד - שורה לכל שלב */
export function StripFlowDetail({ flow, C }: { flow: StripFlow; C: Pal }) {
  const th: React.CSSProperties = { padding: '5px 8px', textAlign: 'start', fontSize: '10px', fontWeight: 'bold', color: C.muted, whiteSpace: 'nowrap', borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 0, background: C.head };
  const td: React.CSSProperties = { padding: '5px 8px', fontSize: '12px', color: C.text, borderBottom: `1px solid ${C.line}`, verticalAlign: 'top' };
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 10px', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
          <span data-testid="flow-detail-title" style={{ fontSize: '16px', fontWeight: 'bold', color: C.text }}>{stripTitle(flow.strip)}</span>
          <span style={{ fontSize: '11px', color: C.muted }}>{tr('flow.colNow')}:</span>
          <FlowNowView flow={flow} C={C} />
        </div>
        <FlowChainView steps={flowChain(flow.events)} C={C} />
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>{tr('flow.colTime')}</th>
            <th style={th}>{tr('flow.colStep')}</th>
            <th style={th}>{tr('flow.colPlace')}</th>
            <th style={th}>{tr('flow.colAircraft')}</th>
            <th style={th}>{tr('flow.colBy')}</th>
            <th style={th}>{tr('flow.colNote')}</th>
          </tr>
        </thead>
        <tbody>
          {flow.events.map((e, i) => {
            const d = flowEventDescriptor(e);
            // מקום: העמדה שבה קרה השלב. בשליחה - העמדה המוסרת; בקבלה - המקבלת
            const place = e.kind === 'transfer_sent' || e.kind === 'ground_point' ? e.preset_name : (e.preset_name || e.point_label);
            return (
              <tr key={String(e.id)} data-testid={`flow-event-${e.kind}`} style={{ background: i % 2 ? C.rowAlt : 'transparent', opacity: e.inherited ? 0.72 : 1 }}>
                <td style={{ ...td, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{flowTime(e.occurred_at)}</td>
                <td style={{ ...td, fontWeight: e.kind === 'accepted' ? 'bold' : 'normal' }}>
                  {tr(d.key, d.params)}
                  {e.inherited && (
                    <span title={tr('flow.inheritedHint')} style={{ marginInlineStart: '6px', fontSize: '10px', color: C.muted, border: `1px dashed ${C.muted}`, borderRadius: '3px', padding: '0 4px' }}>
                      {tr('flow.inherited')}
                    </span>
                  )}
                </td>
                <td style={td}>{place || ''}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{formatAircraft(e.details?.aircraft)}</td>
                <td style={{ ...td, color: C.muted }}>{e.crew_member_name || ''}</td>
                <td style={{ ...td, color: C.muted }}>{e.details?.note || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface Props {
  /** הפ"מים שהעמדה טענה (הרשימה הגלובלית) - עליהם רצים החיפוש והשאילתא */
  strips: any[];
  /** השאילתא הפעילה של העמדה (אם יש) */
  stationFilter: QGroup | null;
  qCtx: QEvalCtx;
  presetNames?: string[];
  themeMode: FrameTheme;
  /** נפתח ישירות לפירוט של פ"מ; null = הטבלה המרוכזת */
  stripId: number | null;
  onSelectStrip: (id: number | null) => void;
  onClose: () => void;
}

export default function StripFlowWindow({ strips, stationFilter, qCtx, presetNames, themeMode, stripId, onSelectStrip, onClose }: Props) {
  const C = flowPalette(themeMode);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const drag = useDragPosition(rootRef);
  const dock = useDockableWindow('stripFlow', tr('flow.title'), {
    setFloatingPos: (x, y) => drag.moveTo(x, y),
    floatingPos: () => drag.pos ?? { x: 80, y: 80 },
  });

  const [search, setSearch] = React.useState('');
  const [useStation, setUseStation] = React.useState(false);
  const [query, setQuery] = React.useState<QGroup | null>(null);
  const [editingQuery, setEditingQuery] = React.useState(false);
  const [hideLanded, setHideLanded] = React.useState(false);
  const [flows, setFlows] = React.useState<StripFlow[] | null>(null);
  const [detail, setDetail] = React.useState<StripFlow | null>(null);
  const [error, setError] = React.useState<'failed' | 'notFound' | null>(null);

  // הסינון בלקוח - אותו מנוע שאילתות כמו חלון הפ"מים
  const filteredIds = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const activeQueries = [useStation ? stationFilter : null, query].filter(g => hasConditions(g)) as QGroup[];
    const ids: number[] = [];
    for (const s of strips || []) {
      const id = flowStripId(s.id);
      if (id === null) continue;
      const cs = String(s.callSign ?? s.callsign ?? '').toLowerCase();
      if (q && !cs.includes(q)) continue;
      let ok = true;
      for (const g of activeQueries) {
        try { if (!evaluateQuery(s, g, qCtx)) { ok = false; break; } } catch { ok = false; break; }
      }
      if (ok) ids.push(id);
    }
    return ids;
  }, [strips, search, useStation, stationFilter, query, qCtx]);
  const tooMany = filteredIds.length > MAX_IDS;
  const idsKey = filteredIds.slice(0, MAX_IDS).join(',');

  // טבלה מרוכזת - polling כל עוד היא מוצגת
  React.useEffect(() => {
    if (stripId !== null) return;
    let alive = true;
    const load = async () => {
      if (!idsKey) { if (alive) { setFlows([]); setError(null); } return; }
      try {
        const r = await fetch(`${API_URL}/strip-flows?ids=${idsKey}`);
        if (!r.ok) throw new Error(String(r.status));
        const body = await r.json();
        if (alive) { setFlows(Array.isArray(body?.flows) ? body.flows : []); setError(null); }
      } catch { if (alive) setError('failed'); }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [stripId, idsKey]);

  // פירוט פ"מ
  React.useEffect(() => {
    if (stripId === null) { setDetail(null); return; }
    let alive = true;
    setDetail(null);
    const load = async () => {
      try {
        const r = await fetch(`${API_URL}/strips/${stripId}/flow`);
        if (r.status === 404) { if (alive) setError('notFound'); return; }
        if (!r.ok) throw new Error(String(r.status));
        const body = await r.json();
        if (alive) { setDetail(body); setError(null); }
      } catch { if (alive) setError('failed'); }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [stripId]);

  const shownFlows = React.useMemo(() => {
    const list = (flows || []).filter(f => !(hideLanded && f.current.kind === 'landed'));
    // האחרון שזז למעלה - מה שקורה עכשיו
    const lastAt = (f: StripFlow) => new Date(f.events[f.events.length - 1]?.occurred_at || 0).getTime();
    return [...list].sort((a, b) => lastAt(b) - lastAt(a));
  }, [flows, hideLanded]);

  const inputStyle: React.CSSProperties = {
    padding: '3px 7px', background: C.input, border: `1px solid ${C.inputBorder}`, borderRadius: '4px',
    color: C.text, fontSize: '12px', minWidth: 0,
  };
  const btn = (active = false): React.CSSProperties => ({
    padding: '3px 9px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap',
    border: `1px solid ${active ? C.accent : C.inputBorder}`, background: active ? C.hover : 'transparent',
    color: active ? C.accent : C.text,
  });
  const queryOn = hasConditions(query);

  const note = (text: string) => <div style={{ padding: '18px', textAlign: 'center', color: C.muted, fontSize: '12px' }}>{text}</div>;

  const win = (
    <div
      ref={rootRef}
      data-testid="strip-flow-window"
      style={{
        position: 'fixed', zIndex: 8850,
        zoom: (dock.docked ? 1 : 'var(--s)') as any,
        ...(drag.pos ? { left: drag.pos.x, top: drag.pos.y } : { left: 80, top: 80 }),
        width: 'min(980px, calc(94vw / var(--s, 1)))', maxHeight: 'calc(80vh / var(--s, 1))',
        display: 'flex', flexDirection: 'column',
        background: C.panel, ...windowFrame('view', themeMode, 8),
        boxShadow: '0 10px 34px rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        ...dock.rootStyle,
      }}>
      {/* כותרת - ידית גרירה */}
      <div
        {...drag.handleProps}
        onPointerDown={e => { dock.onHeaderPointerDown(e); drag.handleProps.onPointerDown(e); }}
        style={{ ...drag.handleProps.style, display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: C.head, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {stripId !== null && (
          <button data-testid="strip-flow-back" onPointerDown={e => e.stopPropagation()} onClick={() => onSelectStrip(null)} style={btn()}>
            {tr('flow.arrow')} {tr('flow.back')}
          </button>
        )}
        <span style={{ fontSize: '13px', fontWeight: 'bold', color: C.text, flex: 1 }}>
          {tr('flow.title')}
          {stripId === null && flows && (
            <span style={{ color: C.muted, fontWeight: 'normal', marginInlineStart: '8px', fontSize: '11px' }}>
              {tr('flow.shown', { shown: shownFlows.length, total: (strips || []).length })}
            </span>
          )}
        </span>
        {!dock.embedded && (
          <button onPointerDown={e => e.stopPropagation()} onClick={onClose} title={tr('shared.close')}
            style={{ width: '24px', height: '24px', borderRadius: '4px', border: `1px solid ${C.inputBorder}`, background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: '13px', lineHeight: 1, flexShrink: 0 }}>
            ✕
          </button>
        )}
      </div>

      {stripId === null && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', padding: '6px 10px', borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
          <input
            data-testid="strip-flow-search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={tr('flow.searchCallsign')} style={{ ...inputStyle, flex: '1 1 140px', maxWidth: '200px' }} />
          <button data-testid="strip-flow-query" onClick={() => setEditingQuery(true)} style={btn(queryOn)}>
            {queryOn ? tr('flow.queryActive') : tr('flow.editQuery')}
          </button>
          {queryOn && <button onClick={() => setQuery(null)} style={btn()}>{tr('flow.clearQuery')}</button>}
          {hasConditions(stationFilter) && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: C.text, cursor: 'pointer' }}>
              <input type="checkbox" checked={useStation} onChange={e => setUseStation(e.target.checked)} />
              {tr('flow.useStationQuery')}
            </label>
          )}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: C.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={hideLanded} onChange={e => setHideLanded(e.target.checked)} />
            {tr('flow.hideLanded')}
          </label>
          {tooMany && <span style={{ fontSize: '11px', color: '#f59e0b' }}>{tr('flow.tooMany', { max: MAX_IDS })}</span>}
        </div>
      )}

      <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        {error === 'failed' && note(tr('flow.loadFailed'))}
        {stripId !== null
          ? (error === 'notFound' ? note(tr('flow.notFound')) : detail ? <StripFlowDetail flow={detail} C={C} /> : note(tr('flow.loading')))
          : (flows === null ? note(tr('flow.loading')) : shownFlows.length === 0 ? note(tr('flow.empty')) : <StripFlowList flows={shownFlows} C={C} onOpen={onSelectStrip} />)}
      </div>
    </div>
  );

  const queryModal = editingQuery && createPortal(
    // portal ל-body - מחוץ ל-#root אין zoom, ולכן הוא מוחזר ידנית (ראה DataWindowLayer)
    <div
      onClick={e => { if (e.target === e.currentTarget) setEditingQuery(false); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000, zoom: 'var(--s, 1)' as any,
        background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 'calc(100vw / var(--s, 1))', height: 'calc(100vh / var(--s, 1))',
      }}>
      {/* עריכת שאילתא = חלון עריכה - מסגרת כתומה (CLAUDE.md §מסגרת חלון) */}
      <div style={{
        background: C.panel, ...windowFrame('edit', themeMode, 12),
        width: '560px', maxWidth: 'calc(94vw / var(--s, 1))', maxHeight: 'calc(88vh / var(--s, 1))',
        overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: C.head, borderBottom: `1px solid ${C.border}` }}>
          <span style={{ flex: 1, color: C.text, fontWeight: 'bold', fontSize: '14px' }}>{tr('flow.queryTitle')}</span>
          <button onClick={() => setEditingQuery(false)} title={tr('shared.close')}
            style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, borderRadius: '5px', padding: '2px 9px', cursor: 'pointer', fontSize: '13px' }}>✕</button>
        </div>
        <div style={{ padding: '10px 12px 14px' }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: C.muted, lineHeight: 1.5 }}>{tr('flow.queryHint')}</p>
          <QueryBuilder value={query} onChange={setQuery} label={tr('flow.windowQuery')} presetNames={presetNames} />
        </div>
      </div>
    </div>,
    document.body,
  );

  if (dock.embedded) return <>{win}{queryModal}</>;
  return <>{createPortal(win, dock.slotEl ?? document.body)}{queryModal}</>;
}
