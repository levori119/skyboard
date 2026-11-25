// עריכת אובייקטים על מפה - כלי "אובייקטים" בעורך המפה (MapZoneEditor).
// ראה MAP_OBJECTS_SPEC.md.
//
// שלושה חלקים, כדי שהעורך הגדול רק ירכיב אותם:
//   useMapObjectsEditor  - ה-state והקריאות לשרת
//   MapObjectsEditOverlay - הציור על המפה + גרירה (עט/אצבע/עכבר)
//   MapObjectsPanel      - הטופס ורשימת האובייקטים בתפריט הצד
//
// העורך כולו בעיצוב כהה קבוע (כמו MapZoneEditor), ולכן הצבעים כאן קבועים לכהה.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import { API_URL } from '../../config';
import { bidiAuto } from '../../utils/bidi';
import { customConfirm } from '../shared/ConfirmModal';
import { DECOR_COLORS } from '../../utils/tableCellDisplay';
import { invalidateMapObjects } from '../../hooks/useMapObjects';
import { MapObjectGlyph } from './MapObjectGlyph';
import {
  MAP_OBJECT_SHAPES, MAP_OBJECT_SIZE_MIN, MAP_OBJECT_SIZE_MAX, MAP_OBJECT_SIZE_DEFAULT, MAP_OBJECT_DEFAULT_COLOR,
  MAP_OBJECT_NAME_MAX, mapObjectPath, mapObjectShapeKey, normalizeMapObject, sortMapObjects,
  type MapObject, type MapObjectShape,
} from '../../utils/mapObjects';

/** הסגנון שבו ייווצר האובייקט הבא (כשאין אובייקט נבחר). */
type NewObjectStyle = Pick<MapObject, 'name' | 'shape' | 'size' | 'color' | 'filled' | 'show_label'>;
const INITIAL_STYLE: NewObjectStyle = {
  name: '', shape: 'circle', size: MAP_OBJECT_SIZE_DEFAULT, color: MAP_OBJECT_DEFAULT_COLOR, filled: true, show_label: true,
};

/** השהיית שמירה בזמן הקלדה/גרירת סליידר - שמירה אחת בסוף ולא עשרות. */
const PERSIST_DELAY_MS = 400;

export function useMapObjectsEditor(mapId: number) {
  const [objects, setObjects] = useState<MapObject[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [style, setStyle] = useState<NewObjectStyle>(INITIAL_STYLE);
  const [loadFailed, setLoadFailed] = useState(false);
  const pending = useRef(new Map<number, Partial<MapObject>>());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/maps/${mapId}/objects`);
      if (!res.ok) { setLoadFailed(true); return; }
      const rows = await res.json();
      setObjects(sortMapObjects((Array.isArray(rows) ? rows : []).map(normalizeMapObject)));
      setLoadFailed(false);
    } catch { setLoadFailed(true); }
  }, [mapId]);
  useEffect(() => { load(); setSelectedId(null); }, [load]);

  const flush = useCallback(async (id: number) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
    const patch = pending.current.get(id);
    if (!patch) return;
    pending.current.delete(id);
    try {
      const res = await fetch(`${API_URL}/map-objects/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      // תשובת השרת (מנורמלת) נקלטת רק אם לא נוספו שינויים בינתיים - אחרת
      // היא הייתה דורסת את מה שהמנהל הקליד בזמן שהבקשה הייתה באוויר.
      if (res.ok && !pending.current.has(id)) {
        const row = normalizeMapObject(await res.json());
        setObjects(prev => prev.map(o => (o.id === id ? row : o)));
      }
    } catch { /* השינוי נשאר מקומי; הטעינה הבאה תציג את מצב השרת */ }
    invalidateMapObjects(mapId);
  }, [mapId]);

  // יציאה מהעורך באמצע הקלדה - לשמור את מה שנאסף ולא לאבד אותו
  useEffect(() => () => { for (const id of [...pending.current.keys()]) void flush(id); }, [flush]);

  /** עדכון אובייקט: מיד על המסך, לשרת אחרי השהיה (או מיד, בסוף גרירה). */
  const update = useCallback((id: number, patch: Partial<MapObject>, immediate = false) => {
    setObjects(prev => prev.map(o => (o.id === id ? { ...o, ...patch } : o)));
    pending.current.set(id, { ...(pending.current.get(id) || {}), ...patch });
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    if (immediate) { void flush(id); return; }
    timers.current.set(id, setTimeout(() => { void flush(id); }, PERSIST_DELAY_MS));
  }, [flush]);

  const create = useCallback(async (x: number, y: number) => {
    try {
      const res = await fetch(`${API_URL}/maps/${mapId}/objects`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...style, x, y, sort_order: 0 }),
      });
      if (!res.ok) return;
      const row = normalizeMapObject(await res.json());
      setObjects(prev => sortMapObjects([...prev, row]));
      // האובייקט החדש נבחר מיד - כך אפשר לתת לו שם ולכוונן בלי לחפש אותו
      setSelectedId(row.id ?? null);
      setStyle(s => ({ ...s, name: '' }));
      invalidateMapObjects(mapId);
    } catch { /* נשאר בלי אובייקט חדש - הלחיצה הבאה תנסה שוב */ }
  }, [mapId, style]);

  const remove = useCallback(async (o: MapObject) => {
    if (o.id == null) return;
    const label = o.name || tr(mapObjectShapeKey(o.shape));
    if (!await customConfirm(tr('map.objConfirmDelete', { name: label }))) return;
    const t = timers.current.get(o.id);
    if (t) { clearTimeout(t); timers.current.delete(o.id); }
    pending.current.delete(o.id);
    try {
      const res = await fetch(`${API_URL}/map-objects/${o.id}`, { method: 'DELETE' });
      if (!res.ok) return;
      setObjects(prev => prev.filter(x => x.id !== o.id));
      setSelectedId(cur => (cur === o.id ? null : cur));
      invalidateMapObjects(mapId);
    } catch { /* לא נמחק - נשאר ברשימה */ }
  }, [mapId]);

  const selected = objects.find(o => o.id === selectedId) ?? null;
  return { objects, selected, selectedId, setSelectedId, style, setStyle, update, create, remove, loadFailed, reload: load };
}

export type MapObjectsEditorState = ReturnType<typeof useMapObjectsEditor>;

/**
 * ציור האובייקטים בעורך. כשהכלי פעיל (active) אפשר לבחור ולגרור אובייקט;
 * כשהוא כבוי הם מוצגים בלבד ואינם מפריעים לעריכת אזורים.
 *
 * לחיצה על שטח ריק עוברת דרך השכבה (pointerEvents: none בשורש) אל ה-SVG של
 * העורך, שם היא יוצרת אובייקט חדש.
 */
export const MapObjectsEditOverlay = ({ ed, bounds, zoom, active, getPoint }: {
  ed: MapObjectsEditorState;
  bounds: { left: number; top: number; width: number; height: number };
  zoom: number;
  active: boolean;
  /** נקודת המצביע באחוזי תמונת המפה (אותה פונקציה של עורך האזורים) */
  getPoint: (e: React.PointerEvent) => { x: number; y: number } | null;
}) => {
  // המיקום החי נשמר גם ב-ref: שחרור שמגיע לפני הרינדור הבא לא יקרא מיקום ישן מה-state
  const dragRef = useRef<{ id: number; pointerId: number; sx: number; sy: number; ox: number; oy: number; x: number; y: number; moved: boolean } | null>(null);
  const [dragPos, setDragPos] = useState<{ id: number; x: number; y: number } | null>(null);
  const clamp = (n: number) => Math.min(100, Math.max(0, n));

  const end = (commit: boolean) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragPos(null);
    if (commit && d?.moved) ed.update(d.id, { x: d.x, y: d.y }, true);
  };

  return (
    <svg data-map-objects-editor=""
      style={{ position: 'absolute', left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, pointerEvents: 'none', overflow: 'visible' }}>
      {ed.objects.map(o => {
        const shown = dragPos && dragPos.id === o.id ? { ...o, x: dragPos.x, y: dragPos.y } : o;
        return (
          <MapObjectGlyph key={o.id} o={shown} W={bounds.width} H={bounds.height} zoom={zoom} light={false}
            selected={active && o.id === ed.selectedId}
            hitPad={active ? 14 : 0}
            gProps={active ? {
              style: { pointerEvents: 'auto', cursor: 'grab', touchAction: 'none' },
              onPointerDown: e => {
                // בלי preventDefault (CLAUDE.md §גרירה): בעט/מגע הוא היה מבטל את אירועי העכבר התואמים
                e.stopPropagation();
                if (o.id == null) return;
                const pt = getPoint(e);
                if (!pt) return;
                (e.currentTarget as Element).setPointerCapture(e.pointerId);
                dragRef.current = { id: o.id, pointerId: e.pointerId, sx: pt.x, sy: pt.y, ox: o.x, oy: o.y, x: o.x, y: o.y, moved: false };
                ed.setSelectedId(o.id);
              },
              onPointerMove: e => {
                const d = dragRef.current;
                if (!d || d.pointerId !== e.pointerId) return;
                const pt = getPoint(e);
                if (!pt) return;
                const dx = pt.x - d.sx, dy = pt.y - d.sy;
                if (!d.moved && Math.hypot(dx, dy) < 0.2) return;
                d.moved = true;
                d.x = clamp(d.ox + dx); d.y = clamp(d.oy + dy);
                setDragPos({ id: d.id, x: d.x, y: d.y });
              },
              onPointerUp: e => { if (dragRef.current?.pointerId === e.pointerId) end(true); },
              onPointerCancel: () => end(false),
              onClick: e => e.stopPropagation(),
            } : { style: { pointerEvents: 'none' } }}
          />
        );
      })}
    </svg>
  );
};

// ── תפריט הצד ────────────────────────────────────────────────────────────────

const C = {
  border: '#334155', panel: '#1e293b', text: '#e2e8f0', muted: '#94a3b8', faint: '#64748b',
  accent: '#f97316', accentBg: 'rgba(249,115,22,0.10)', accentText: '#fdba74',
};

const ShapeIcon = ({ shape, color, filled, size = 22 }: { shape: string; color: string; filled: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="-12 -12 24 24" style={{ display: 'block', flexShrink: 0 }}>
    <path d={mapObjectPath(shape, 9)} fill={filled ? color : 'none'} stroke={color} strokeWidth={filled ? 1 : 2} strokeLinejoin="round" />
  </svg>
);

const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: '10px' }}>
    <div style={{ color: C.faint, fontSize: '11px', marginBottom: '5px' }}>{label}</div>
    {children}
  </div>
);

export const MapObjectsPanel = ({ ed }: { ed: MapObjectsEditorState }) => {
  const sel = ed.selected;
  // הטופס אחד: כשיש אובייקט נבחר הוא עורך אותו, אחרת את הסגנון של הבא
  const v: NewObjectStyle = sel ?? ed.style;
  const set = (patch: Partial<NewObjectStyle>) => {
    if (sel?.id != null) ed.update(sel.id, patch);
    else ed.setStyle(s => ({ ...s, ...patch }));
  };
  const toggleBtn = (on: boolean): React.CSSProperties => ({
    flex: 1, padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap',
    border: `1px solid ${on ? C.accent : C.border}`, background: on ? C.accentBg : C.panel,
    color: on ? C.accentText : C.muted, fontWeight: on ? 'bold' : 'normal', touchAction: 'manipulation',
  });

  return (
    <div data-map-objects-panel="" style={{ padding: '14px', borderBottom: `1px solid ${C.accent}55`, background: 'rgba(249,115,22,0.04)' }}>
      <div style={{ color: C.accentText, fontSize: '12px', fontWeight: 'bold', marginBottom: '6px' }}>🔷 {tr('map.objTitle')}</div>
      <div style={{ color: C.faint, fontSize: '11px', marginBottom: '10px', lineHeight: 1.5 }}>
        {sel ? tr('map.objEditingHint') : tr('map.objClickToPlace')}
      </div>
      {ed.loadFailed && <div style={{ color: '#f87171', fontSize: '11px', marginBottom: '8px' }}>{tr('map.objLoadFailed')}</div>}

      <div style={{ color: C.text, fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>
        {sel ? tr('map.objEditSelected') : tr('map.objNewStyle')}
      </div>

      <input value={v.name} maxLength={MAP_OBJECT_NAME_MAX}
        onChange={e => set({ name: e.target.value })}
        placeholder={tr('map.objName')}
        style={{ width: '100%', padding: '7px 10px', borderRadius: '4px', border: '1px solid #475569', background: C.panel, color: 'white', fontSize: '13px', boxSizing: 'border-box', marginBottom: '10px' }} />

      <Section label={tr('map.objShape')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {MAP_OBJECT_SHAPES.map((s: MapObjectShape) => {
            const on = v.shape === s;
            return (
              <button key={s} onClick={() => set({ shape: s })} title={tr(mapObjectShapeKey(s))} aria-label={tr(mapObjectShapeKey(s))}
                data-shape={s}
                style={{ height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', cursor: 'pointer', padding: 0,
                  border: `${on ? 2 : 1}px solid ${on ? C.accent : C.border}`, background: on ? C.accentBg : C.panel, touchAction: 'manipulation' }}>
                <ShapeIcon shape={s} color={v.color} filled={v.filled} />
              </button>
            );
          })}
        </div>
      </Section>

      <Section label={`${tr('map.objSize')}: ${v.size.toFixed(1)}%`}>
        <input type="range" min={MAP_OBJECT_SIZE_MIN} max={MAP_OBJECT_SIZE_MAX} step={0.1} value={v.size}
          onChange={e => set({ size: Number(e.target.value) })}
          style={{ width: '100%', accentColor: C.accent }} />
      </Section>

      <Section label={tr('map.objColor')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
          {DECOR_COLORS.map(c => (
            <button key={c} onClick={() => set({ color: c })} title={c} aria-label={c}
              style={{ width: '24px', height: '24px', borderRadius: '50%', background: c, cursor: 'pointer', padding: 0,
                border: v.color.toLowerCase() === c ? '3px solid white' : '2px solid #475569', touchAction: 'manipulation' }} />
          ))}
          <input type="color" value={v.color.length === 4 ? `#${v.color[1]}${v.color[1]}${v.color[2]}${v.color[2]}${v.color[3]}${v.color[3]}` : v.color}
            onChange={e => set({ color: e.target.value })}
            title={tr('map.objCustomColor')} aria-label={tr('map.objCustomColor')}
            style={{ width: '30px', height: '26px', padding: 0, border: `1px solid ${C.border}`, borderRadius: '4px', background: 'transparent', cursor: 'pointer' }} />
        </div>
      </Section>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
        <button onClick={() => set({ filled: true })} style={toggleBtn(v.filled)}>{tr('map.objFilled')}</button>
        <button onClick={() => set({ filled: false })} style={toggleBtn(!v.filled)}>{tr('map.objOutline')}</button>
      </div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        <button onClick={() => set({ show_label: !v.show_label })} style={toggleBtn(v.show_label)} aria-pressed={v.show_label}>
          {v.show_label ? '✓ ' : ''}{tr('map.objShowLabel')}
        </button>
      </div>

      {sel && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
          <button onClick={() => ed.setSelectedId(null)}
            style={{ flex: 1, background: '#059669', color: 'white', border: 'none', borderRadius: '4px', padding: '7px', cursor: 'pointer', fontSize: '12px' }}>
            {tr('map.objDone')}
          </button>
          <button onClick={() => ed.remove(sel)} title={tr('map.objDelete')}
            style={{ background: C.panel, color: '#f87171', border: '1px solid #7f1d1d', borderRadius: '4px', padding: '7px 10px', cursor: 'pointer', fontSize: '12px' }}>
            🗑 {tr('map.objDelete')}
          </button>
        </div>
      )}

      <div style={{ color: C.faint, fontSize: '11px', marginBottom: '6px' }}>{tr('map.objList', { n: ed.objects.length })}</div>
      {ed.objects.length === 0 ? (
        <div style={{ color: C.faint, fontSize: '11px' }}>{tr('map.objNone')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '260px', overflowY: 'auto' }}>
          {ed.objects.map(o => {
            const on = o.id === ed.selectedId;
            return (
              <div key={o.id} data-map-object-row={o.id}
                onClick={() => ed.setSelectedId(on ? null : (o.id ?? null))}
                style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 8px', borderRadius: '6px', cursor: 'pointer',
                  background: on ? C.accentBg : C.panel, border: `1px solid ${on ? C.accent : C.border}` }}>
                <ShapeIcon shape={o.shape} color={o.color} filled={o.filled} size={18} />
                <span style={{ flex: 1, minWidth: 0, color: o.name ? C.text : C.faint, fontSize: '12px', fontStyle: o.name ? 'normal' : 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.name ? bidiAuto(o.name) : `${tr(mapObjectShapeKey(o.shape))} (${tr('map.objUnnamed')})`}
                </span>
                <button onClick={e => { e.stopPropagation(); ed.remove(o); }} title={tr('map.objDelete')} aria-label={tr('map.objDelete')}
                  style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13px', padding: '0 3px' }}>🗑</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
