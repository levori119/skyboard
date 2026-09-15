import React from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../../i18n/tr';
import { bidiAuto } from '../../utils/bidi';
import { useDockableWindow } from '../../hooks/useDockableWindow';
import { useDragPosition } from '../../hooks/useDragPosition';
import { windowFrame, type FrameTheme } from '../../utils/windowFrame';
import { altToDisplay, FLIGHT_LEGS } from '../../utils/joiningPoints';
import { patternTrafficGroups } from '../../utils/patternTraffic';
import { airPictureStore } from '../../airPicture/store';

// ─── טבלת "בהקפה" ────────────────────────────────────────────────────────────
//
// מטוס שעזב את נקודת ההצטרפות יצא מהטבלה שלה, ועד עכשיו לא היה מקום שבו רואים
// אותו ולא הייתה דרך לגעת בו. כאן - שורה לכל מטוס, מקובצת לפי מסלול הנחיתה
// וממוינת לפי גובה (PATTERN_AUTOTRACK_SPEC §7).
//
// הפעולות (צלע, ירוקים) הן **אותם handlers** של פאנל הנקודה - מעקב ההקפה
// האוטומטי כותב דרכם, והפקח מתקן דרכם. מקור אחד, כך שתיקון ידני כאן ומעבר
// אוטומטי שם אינם שתי שפות.
//
// חלון **צפייה ותפעול** - מסגרת תורכיז (CLAUDE.md §מסגרת חלון).

interface Props {
  /** שורות ההקפה (`joining_point_aircraft` עם תווית וסטטוס) - אותן של שכבת ההקפה. */
  aircraft: Record<string, any>[];
  patterns: Record<string, any>[];
  /** `aircraftKey` → הרכיב האווירי המשודך (usePatternAutotrack). */
  trackIdByKey: Map<string, string>;
  elevFt: number | null;
  themeMode: FrameTheme;
  onClose: () => void;
  onFlightStatus: (stripId: string, idx: number, status: string) => void;
  onGreens: (stripId: string, idx: number, greens: boolean) => void;
}

const LEG_LABEL: Record<string, string> = {
  downwind: 'joining.statusDownwind',
  base: 'joining.statusBase',
  final: 'joining.statusFinal',
  landed: 'joining.statusLanded',
};

const palette = (themeMode: FrameTheme) =>
  themeMode === 'light'
    ? { panel: 'rgba(248,250,252,0.98)', head: '#e2e8f0', group: '#cbd5e1', line: '#cbd5e1', text: '#1e293b', muted: '#475569', input: '#ffffff', inputBorder: '#94a3b8' }
    : themeMode === 'ocean'
      ? { panel: 'rgba(5,64,78,0.97)', head: '#0a5768', group: '#064a5a', line: '#0e7490', text: '#cffafe', muted: '#7dd3fc', input: '#083d4d', inputBorder: '#0e7490' }
      : { panel: 'rgba(15,23,42,0.97)', head: '#0f172a', group: '#1e293b', line: '#1e293b', text: '#e2e8f0', muted: '#94a3b8', input: '#1e293b', inputBorder: '#334155' };

/** צבעי סטטוס - קבועים בכל התמות. */
const GREENS_ON = '#16a34a';
const ALERT = '#dc2626';

export default function PatternTrafficWindow({ aircraft, patterns, trackIdByKey, elevFt, themeMode, onClose, onFlightStatus, onGreens }: Props) {
  const C = palette(themeMode);
  // הגובה של הרכיב משתנה בכל דגימה בלי שהשורות משתנות. המנוי כאן ולא במסך
  // המגדל - כמו בסצנה התלת מימדית - כדי שדגימה תרנדר את החלון ולא את העמדה.
  const snap = React.useSyncExternalStore(airPictureStore.subscribe, airPictureStore.getSnapshot, airPictureStore.getSnapshot);
  const groups = React.useMemo(() => {
    const altById = new Map(snap.tracks.map(t => [t.id, t.alt]));
    const trackAltByKey = new Map<string, number>();
    for (const [key, tid] of trackIdByKey) {
      const alt = altById.get(tid);
      if (alt != null) trackAltByKey.set(key, alt);
    }
    return patternTrafficGroups({ aircraft, patterns, trackAltByKey, elevFt });
  }, [snap.tracks, trackIdByKey, aircraft, patterns, elevFt]);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const drag = useDragPosition(rootRef);
  const dock = useDockableWindow('patternTraffic', tr('dock.winPatternTraffic'), {
    setFloatingPos: (x, y) => drag.moveTo(x, y),
    floatingPos: () => drag.pos ?? { x: 90, y: 90 },
  });
  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  const td: React.CSSProperties = { padding: '3px 6px', fontSize: '12px', color: C.text, whiteSpace: 'nowrap', borderBottom: `1px solid ${C.line}` };
  const th: React.CSSProperties = { padding: '4px 6px', fontSize: '10px', fontWeight: 'bold', color: C.muted, textAlign: 'start', borderBottom: `1px solid ${C.line}` };

  const win = (
    <div
      ref={rootRef}
      data-testid="pattern-traffic-window"
      style={{
        position: 'fixed', zIndex: 8800,
        zoom: (dock.docked ? 1 : 'var(--s)') as any,
        ...(drag.pos ? { left: drag.pos.x, top: drag.pos.y } : { left: 90, top: 90 }),
        width: 'min(380px, 94vw)', maxHeight: '70vh',
        display: 'flex', flexDirection: 'column',
        background: C.panel, ...windowFrame('view', themeMode, 8),
        boxShadow: '0 10px 34px rgba(0,0,0,0.55)',
        ...dock.rootStyle,
      }}>
      <div
        {...drag.handleProps}
        onPointerDown={e => { dock.onHeaderPointerDown(e); drag.handleProps.onPointerDown(e); }}
        style={{ ...drag.handleProps.style, display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: C.head, borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
        <span style={{ fontSize: '13px', fontWeight: 'bold', color: C.text, flex: 1 }}>
          {tr('dock.winPatternTraffic')}
          <span style={{ color: C.muted, fontWeight: 'normal', marginInlineStart: '8px', fontSize: '10px' }}>
            {tr('joining.ptCount', { count: total })}
          </span>
        </span>
        {!dock.embedded && (
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={onClose}
            title={tr('shared.close')}
            style={{ width: '22px', height: '22px', borderRadius: '4px', border: `1px solid ${C.inputBorder}`, background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: '13px', lineHeight: 1, flexShrink: 0 }}>
            ✕
          </button>
        )}
      </div>

      <div style={{ overflow: 'auto', flex: 1 }}>
        {total === 0 ? (
          <div data-testid="pattern-traffic-empty" style={{ padding: '16px', textAlign: 'center', color: C.muted, fontSize: '12px' }}>
            {tr('joining.ptEmpty')}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{tr('joining.ptColAircraft')}</th>
                <th style={th}>{tr('joining.ptColAlt')}</th>
                <th style={th}>{tr('joining.ptColLeg')}</th>
                <th style={th}>{tr('joining.statusGreens')}</th>
              </tr>
            </thead>
            {groups.map(g => (
              <tbody key={g.runwayIdent || '-'} data-testid="pattern-traffic-group" data-runway={g.runwayIdent}>
                <tr>
                  <td colSpan={4} style={{ ...td, background: C.group, fontWeight: 'bold', fontSize: '11px' }}>
                    {g.runwayIdent ? bidiAuto(g.runwayIdent) : tr('joining.ptNoRunway')}
                  </td>
                </tr>
                {g.rows.map(r => (
                  <tr key={r.key} data-testid="pattern-traffic-row" data-strip-id={r.stripId} data-aircraft-idx={r.idx}
                    data-greens-alert={r.greensAlert ? '1' : '0'}
                    style={{ animation: r.greensAlert ? 'skyking-greens-tr-blink 0.6s steps(1) infinite' : undefined }}>
                    <td style={{ ...td, fontWeight: 'bold' }}>
                      <span title={r.altSource === 'track' ? tr('joining.ptTracked') : tr('joining.ptUntracked')}
                        style={{ color: r.altSource === 'track' ? '#22c55e' : C.muted, marginInlineEnd: '4px' }}>
                        {r.altSource === 'track' ? '●' : '○'}
                      </span>
                      {bidiAuto(r.label)}
                    </td>
                    <td style={{ ...td, fontFamily: 'monospace' }}
                      title={r.altSource === 'track' ? tr('joining.ptAltTrack') : tr('joining.ptAltPlanned')}>
                      {r.altFt == null ? '-' : (
                        <span style={{ fontStyle: r.altSource === 'planned' ? 'italic' : undefined, opacity: r.altSource === 'planned' ? 0.75 : 1 }}>
                          {altToDisplay(r.altFt)}
                        </span>
                      )}
                    </td>
                    <td style={td}>
                      <select
                        data-testid="pattern-traffic-leg"
                        value={r.leg === 'none' ? '' : r.leg}
                        onChange={e => e.target.value && onFlightStatus(r.stripId, r.idx, e.target.value)}
                        style={{ padding: '2px 4px', background: C.input, border: `1px solid ${C.inputBorder}`, borderRadius: '4px', color: C.text, fontSize: '12px' }}>
                        {r.leg === 'none' && <option value="">-</option>}
                        {FLIGHT_LEGS.map(l => <option key={l} value={l}>{tr(LEG_LABEL[l])}</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      <button
                        type="button"
                        data-testid="pattern-traffic-greens"
                        onClick={() => onGreens(r.stripId, r.idx, !r.greens)}
                        title={r.greensAlert ? tr('joining.greensAlert') : undefined}
                        style={{
                          padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
                          border: `1px solid ${r.greensAlert ? ALERT : r.greens ? GREENS_ON : C.inputBorder}`,
                          background: r.greens ? GREENS_ON : r.greensAlert ? ALERT : 'transparent',
                          color: r.greens || r.greensAlert ? '#ffffff' : C.muted,
                        }}>
                        {r.greens ? '✓' : tr('joining.greensAlertShort')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        )}
      </div>
    </div>
  );

  if (dock.embedded) return win;
  return createPortal(win, dock.slotEl ?? document.body);
}
