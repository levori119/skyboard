import React from 'react';
import { tr } from '../../i18n/tr';
import {
  DEFAULT_GEOMETRY,
  fitToMap,
  geometryFromRunway,
  mirrorGeometry,
  normalizeGeometry,
  patternPoints,
  reciprocalIdent,
  runwayEnds,
  type PatternGeometry,
  type PatternSide,
  type RunwayEnd,
} from '../../utils/trafficPattern';
import type { PatternElementRow, PatternRow } from '../map/TrafficPatternLayer';

// סקשן ההקפות בטאב "שדות תעופה" של עמדת הניהול.
// ההקפה משויכת ל**קצה מסלול** (33, לא 33/15) - זה מה שמאפשר "שכפול הקפה הפוכה"
// שנותן את השם ההופכי (33 → 15). השרטוט עצמו נערך על המפה, ולא כאן.

const ELEMENT_ICONS = ['📍', '🚩', '⚠️', '🛑', '🗼', '🏔️', '📡', '🔺', '⛽', '🎯'];

interface Props {
  apiUrl: string;
  airfieldId: number;
  patterns: PatternRow[];
  runways: { id: number; name?: string | null; heading_a?: string | null; heading_b?: string | null;
             start_x_pct?: number | null; start_y_pct?: number | null; end_x_pct?: number | null; end_y_pct?: number | null }[];
  aspect: number;
  expanded: boolean;
  onToggle: () => void;
  layerVisible: boolean;
  onToggleLayer: () => void;
  editingPatternId: number | null;
  draft: PatternGeometry | null;
  placingElement: { patternId: number; elementId: number } | null;
  onEditPattern: (patternId: number | null, geometry: PatternGeometry | null) => void;
  onDraftChange: (g: PatternGeometry) => void;
  onPlaceElement: (v: { patternId: number; elementId: number } | null) => void;
  onReload: () => void | Promise<void>;
  confirmDelete: (msg: string) => boolean | Promise<boolean>;
}

const btn = (bg: string, fg: string, border = 'none'): React.CSSProperties => ({
  padding: '3px 8px', background: bg, color: fg, border: border === 'none' ? 'none' : `1px solid ${border}`,
  borderRadius: '4px', cursor: 'pointer', fontSize: '10px', whiteSpace: 'nowrap',
});

export default function PatternsSection({
  apiUrl, airfieldId, patterns, runways, aspect, expanded, onToggle, layerVisible, onToggleLayer,
  editingPatternId, draft, placingElement, onEditPattern, onDraftChange, onPlaceElement,
  onReload, confirmDelete,
}: Props) {
  const [newElementFor, setNewElementFor] = React.useState<number | null>(null);
  const [newElement, setNewElement] = React.useState({ name: '', icon: '📍', color: '#f59e0b' });

  const ends: RunwayEnd[] = runways.flatMap(rw => runwayEnds(rw));
  const runwayById = new Map(runways.map(rw => [rw.id, rw]));

  /** הגאומטריה שתישמר: הטיוטה החיה כשההקפה בעריכה, אחרת מה ששמור. */
  const geometryOf = (p: PatternRow): PatternGeometry =>
    p.id === editingPatternId && draft ? draft : normalizeGeometry(p.geometry);

  /** points נשמרות לצד geometry כדי ששכבת תצוגה תוכל לצייר בלי לדעת יחס תמונה. */
  const bodyOf = (p: PatternRow, g: PatternGeometry, extra: Record<string, unknown> = {}) => ({
    runway_id: p.runway_id ?? null,
    runway_ident: p.runway_ident || '',
    color: p.color || '#38bdf8',
    geometry: g,
    points: patternPoints(g, aspect),
    ...extra,
  });

  const savePattern = async (p: PatternRow, g: PatternGeometry, extra: Record<string, unknown> = {}) => {
    await fetch(`${apiUrl}/airfield-patterns/${p.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyOf(p, g, extra)),
    });
    await onReload();
  };

  const addPattern = async () => {
    // גם ברירת המחדל מותאמת ליחס התמונה: על מפה רחבה מלבן ב"אחוזים" יוצא רחב מדי
    const g = fitToMap(DEFAULT_GEOMETRY, aspect);
    const res = await fetch(`${apiUrl}/airfield-patterns`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ airfield_id: airfieldId, runway_ident: '', geometry: g, points: patternPoints(g, aspect), sort_order: patterns.length }),
    });
    if (!res.ok) return;
    const created = await res.json();
    await onReload();
    onEditPattern(created.id, g); // נכנסים ישר לציור - זה העיקר
  };

  const duplicate = async (p: PatternRow, reverse: boolean) => {
    const g = geometryOf(p);
    const next = reverse ? mirrorGeometry(g, aspect) : g;
    const ident = reverse ? reciprocalIdent(p.runway_ident) : ''; // שכפול רגיל = שדה ריק
    const res = await fetch(`${apiUrl}/airfield-patterns/${p.id}/duplicate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // ההקפה ההפוכה היא של אותו מסלול פיזי, רק מהקצה השני
        runway_id: reverse ? p.runway_id ?? null : null,
        runway_ident: ident, geometry: next, points: patternPoints(next, aspect),
      }),
    });
    if (res.ok) await onReload();
  };

  const removePattern = async (p: PatternRow) => {
    if (!await confirmDelete(tr('pattern.confirmDeletePattern'))) return;
    if (editingPatternId === p.id) onEditPattern(null, null);
    await fetch(`${apiUrl}/airfield-patterns/${p.id}`, { method: 'DELETE' });
    await onReload();
  };

  /** בחירת קצה מסלול. בשיוך הראשון ההקפה גם מיישרת את עצמה למסלול - זה מה שהמשתמש מתכוון אליו. */
  const setRunwayEnd = async (p: PatternRow, key: string) => {
    const end = ends.find(e => `${e.runway_id}:${e.end}` === key);
    const hadRunway = p.runway_id != null;
    let g = geometryOf(p);
    if (end && !hadRunway) {
      const rw = runwayById.get(end.runway_id);
      const aligned = rw && geometryFromRunway(rw, end.end, g.side, aspect);
      if (aligned) g = aligned;
    }
    await savePattern(p, g, { runway_id: end?.runway_id ?? null, runway_ident: end?.ident ?? '' });
    if (p.id === editingPatternId) onDraftChange(g);
  };

  /** יישור מפורש לציר המסלול הנבחר - זמין בעריכה, גם אחרי שהמשתמש סובב ידנית. */
  const alignToRunway = (p: PatternRow) => {
    const rwId = p.runway_id;
    const ident = (p.runway_ident || '').trim();
    const rw = rwId != null ? runwayById.get(rwId) : undefined;
    if (!rw) return;
    const end = runwayEnds(rw).find(e => e.ident === ident)?.end ?? 'a';
    const g = geometryFromRunway(rw, end, geometryOf(p).side, aspect);
    if (g) onDraftChange(g);
    else alert(tr('pattern.noRunwayCoords'));
  };

  const canAlign = (p: PatternRow) => {
    const rwId = p.runway_id;
    const rw = rwId != null ? runwayById.get(rwId) : undefined;
    return !!rw && !!geometryFromRunway(rw, 'a', 'left', aspect);
  };

  const addElement = async (patternId: number) => {
    if (!newElement.name.trim()) return;
    await fetch(`${apiUrl}/airfield-patterns/${patternId}/elements`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newElement, name: newElement.name.trim() }),
    });
    setNewElement({ name: '', icon: '📍', color: '#f59e0b' });
    setNewElementFor(null);
    await onReload();
  };

  const updateElement = async (el: PatternElementRow, patch: Partial<PatternElementRow>) => {
    await fetch(`${apiUrl}/airfield-pattern-elements/${el.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: el.name, icon: el.icon, color: el.color, x_pct: el.x_pct, y_pct: el.y_pct, ...patch }),
    });
    await onReload();
  };

  const removeElement = async (el: PatternElementRow) => {
    if (!await confirmDelete(tr('pattern.confirmDeleteElement'))) return;
    if (placingElement?.elementId === el.id) onPlaceElement(null);
    await fetch(`${apiUrl}/airfield-pattern-elements/${el.id}`, { method: 'DELETE' });
    await onReload();
  };

  return (
    <div data-testid="patterns-section" style={{ borderTop: '1px solid #334155', paddingTop: '10px' }}>
      <div data-testid="patterns-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: expanded ? '6px' : 0, cursor: 'pointer' }}
        onClick={onToggle}>
        <div style={{ color: '#7dd3fc', fontSize: '11px', fontWeight: 'bold', flex: 1 }}>
          {tr('pattern.patterns')} ({patterns.length})
        </div>
        <button onClick={e => { e.stopPropagation(); onToggleLayer(); }}
          title={layerVisible ? tr('pattern.hideLayer') : tr('pattern.showLayer')}
          style={{ padding: '1px 5px', background: 'transparent', border: `1px solid ${layerVisible ? '#7dd3fc' : '#334155'}`, borderRadius: '3px', cursor: 'pointer', fontSize: '10px', color: layerVisible ? '#7dd3fc' : '#475569', marginInlineEnd: '4px', flexShrink: 0 }}>
          {layerVisible ? '✓' : '○'}
        </button>
        {expanded && (
          <button data-testid="pattern-add" onClick={e => { e.stopPropagation(); addPattern(); }} style={btn('#0284c7', 'white')}>
            {tr('pattern.addPattern')}
          </button>
        )}
        <span style={{ color: expanded ? '#7dd3fc' : '#475569', fontSize: '11px', marginInlineStart: '4px' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: expanded ? '4000px' : '0', overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
        {expanded && !ends.length && (
          <div style={{ fontSize: '10px', color: '#f59e0b', background: '#1c1917', border: '1px solid #78350f', borderRadius: '5px', padding: '6px 8px', direction: 'rtl' }}>
            {tr('pattern.noRunways')}
          </div>
        )}

        {patterns.map(p => {
          const editing = p.id === editingPatternId;
          const g = geometryOf(p);
          const rwId = p.runway_id;
          const selKey = rwId != null && ends.some(e => e.runway_id === rwId && e.ident === (p.runway_ident || '').trim())
            ? `${rwId}:${ends.find(e => e.runway_id === rwId && e.ident === (p.runway_ident || '').trim())!.end}`
            : '';
          return (
            <div key={p.id} data-testid="pattern-row" data-pattern-id={p.id} data-runway-ident={(p.runway_ident || '').trim()}
              style={{ background: editing ? '#082f49' : '#0f172a', border: `1px solid ${editing ? '#0ea5e9' : '#1e3a5f'}`, borderRadius: '6px', padding: '7px 8px', direction: 'rtl' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: p.color || '#38bdf8', fontFamily: 'monospace', minWidth: '34px' }}>
                  {(p.runway_ident || '').trim() || tr('pattern.unnamed')}
                </div>

                <select data-testid="pattern-runway-select" value={selKey} onChange={e => setRunwayEnd(p, e.target.value)}
                  style={{ flex: 1, minWidth: '90px', padding: '3px 6px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: '#e2e8f0', fontSize: '10px' }}>
                  <option value="">{tr('pattern.selectRunway')}</option>
                  {ends.map(e => (
                    <option key={`${e.runway_id}:${e.end}`} value={`${e.runway_id}:${e.end}`}>
                      {tr('pattern.runway')} {e.ident}
                    </option>
                  ))}
                </select>

                <input type="color" value={p.color || '#38bdf8'}
                  onChange={e => savePattern(p, g, { color: e.target.value })}
                  style={{ width: '26px', height: '22px', padding: 0, background: 'transparent', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }} />

                {!editing && (
                  <button data-testid="pattern-draw" onClick={() => onEditPattern(p.id, g)} style={btn('#0369a1', 'white')}>{tr('pattern.drawOnMap')}</button>
                )}
                <button data-testid="pattern-duplicate" onClick={() => duplicate(p, false)} title={tr('pattern.duplicateHint')} style={btn('transparent', '#7dd3fc', '#1e3a5f')}>{tr('pattern.duplicate')}</button>
                <button data-testid="pattern-duplicate-reverse" onClick={() => duplicate(p, true)} title={tr('pattern.duplicateReverseHint')} style={btn('transparent', '#c4b5fd', '#4c1d95')}>{tr('pattern.duplicateReverse')}</button>
                <button data-testid="pattern-delete" onClick={() => removePattern(p)} style={btn('transparent', '#fca5a5', '#7f1d1d')}>✕</button>
              </div>

              {editing && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #0c4a6e', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>{tr('pattern.side')}:</span>
                  {(['left', 'right'] as PatternSide[]).map(s => (
                    <button key={s} onClick={() => onDraftChange({ ...g, side: s })}
                      style={btn(g.side === s ? '#0ea5e9' : '#1e293b', g.side === s ? 'white' : '#94a3b8', '#334155')}>
                      {s === 'left' ? tr('pattern.sideLeft') : tr('pattern.sideRight')}
                    </button>
                  ))}
                  <span style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace', marginInlineStart: '4px' }}>{Math.round(g.bearing)}°</span>
                  {canAlign(p) && (
                    <button onClick={() => alignToRunway(p)} title={tr('pattern.alignToRunwayHint')} style={btn('#1e293b', '#86efac', '#166534')}>
                      {tr('pattern.alignToRunway')}
                    </button>
                  )}
                  <div style={{ flex: 1 }} />
                  <button onClick={() => onEditPattern(null, null)} style={btn('#1e293b', '#94a3b8', '#334155')}>{tr('pattern.cancelEdit')}</button>
                  <button data-testid="pattern-save" onClick={async () => { await savePattern(p, g); onEditPattern(null, null); }} style={btn('#16a34a', 'white')}>{tr('shared.save')}</button>
                </div>
              )}

              {/* אלמנטים - שייכים אך ורק להקפה הזו, של המסלול הזה */}
              <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #1e3a5f' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: (p.elements || []).length ? '4px' : 0 }}>
                  <span style={{ fontSize: '10px', color: '#64748b', flex: 1 }}>{tr('pattern.elements')} ({(p.elements || []).length})</span>
                  {newElementFor !== p.id && (
                    <button onClick={() => { setNewElementFor(p.id); setNewElement({ name: '', icon: '📍', color: '#f59e0b' }); }} style={btn('#1e293b', '#fcd34d', '#78350f')}>
                      {tr('pattern.addElement')}
                    </button>
                  )}
                </div>

                {newElementFor === p.id && (
                  <div style={{ background: '#1c1917', border: '1px solid #78350f', borderRadius: '5px', padding: '6px', marginBottom: '5px' }}>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '5px' }}>
                      <input value={newElement.name} autoFocus placeholder={tr('pattern.elementName')}
                        onChange={e => setNewElement(v => ({ ...v, name: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') addElement(p.id); if (e.key === 'Escape') setNewElementFor(null); }}
                        style={{ flex: 1, minWidth: 0, padding: '4px 6px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: '#e2e8f0', fontSize: '11px' }} />
                      <input type="color" value={newElement.color} onChange={e => setNewElement(v => ({ ...v, color: e.target.value }))}
                        style={{ width: '26px', height: '24px', padding: 0, background: 'transparent', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }} />
                      <button data-testid="pattern-element-save" onClick={() => addElement(p.id)} style={btn('#16a34a', 'white')}>{tr('shared.save')}</button>
                      <button onClick={() => setNewElementFor(null)} style={btn('#1e293b', '#94a3b8', '#334155')}>{tr('pattern.cancelEdit')}</button>
                    </div>
                    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                      {ELEMENT_ICONS.map(ic => (
                        <button key={ic} type="button" onClick={() => setNewElement(v => ({ ...v, icon: ic }))}
                          style={{ width: '26px', height: '26px', fontSize: '14px', padding: 0, cursor: 'pointer', borderRadius: '5px',
                                   background: newElement.icon === ic ? '#4c1d95' : '#0f172a', border: `2px solid ${newElement.icon === ic ? '#7c3aed' : '#334155'}` }}>
                          {ic}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {(p.elements || []).map(el => {
                  const placing = placingElement?.elementId === el.id;
                  return (
                    <div key={el.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 0' }}>
                      <span style={{ fontSize: '13px' }}>{el.icon || '📍'}</span>
                      <input value={el.name || ''} onChange={e => updateElement(el, { name: e.target.value })}
                        style={{ flex: 1, minWidth: 0, padding: '2px 5px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: el.color || '#f59e0b', fontSize: '10px' }} />
                      <input type="color" value={el.color || '#f59e0b'} onChange={e => updateElement(el, { color: e.target.value })}
                        style={{ width: '22px', height: '20px', padding: 0, background: 'transparent', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }} />
                      <button onClick={() => onPlaceElement(placing ? null : { patternId: p.id, elementId: el.id })}
                        title={tr('pattern.placeElementHint')}
                        style={btn(placing ? '#92400e' : el.x_pct != null ? '#14532d' : '#1e293b', placing ? '#fde68a' : el.x_pct != null ? '#86efac' : '#94a3b8', placing ? '#f59e0b' : '#334155')}>
                        {tr('pattern.placeElement')}
                      </button>
                      <button onClick={() => removeElement(el)} style={btn('transparent', '#fca5a5', '#7f1d1d')}>✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
