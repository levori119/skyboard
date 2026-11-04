/**
 * **מפת מטרות ליד הבלוקים** - מפה קטנה ודינאמית בתצוגת הבלוקים (נדלקת בכפתור).
 *
 * מציגה את מרחבי הבלוקים של העמדה, את הפ"מים שעל הלוח ואת נקודות המכוון שלהם,
 * עם קו מהפ"מ לכל מטרה: מלא ועבה לראשונה לביצוע, מקווקו לשאר. המפה מתכווננת
 * לבד לגבולות התוכן, ומתעדכנת עם כל שינוי בפ"מים (שיוך מרחב, נ"צ חדש).
 *
 * לא מפת רקע: אין תלות במפה מעוגנת של העמדה - רק הגאומטריה שהמרחבים והמטרות
 * כבר נושאים בנ"צ.
 *
 * תפעול (עכבר, עט ואצבע):
 *  - זום: גלגלת, צביטה בשתי אצבעות, או כפתורי + / − (⟲ חוזר להתאמה אוטומטית)
 *  - הזזה: גרירה על המפה
 *  - בחירת פ"מ: לחיצה על הפ"מ או על מטרה שלו - שאר הפ"מים מוחלשים, והבחירה
 *    **נשארת** עד לחיצה נוספת עליו או על שטח ריק
 *  - "ראשונות / הכל": רק המטרה הראשונה לביצוע של כל פ"מ, או כל המטרות
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import { buildTargetMapModel, makeProjection, type LatLon } from '../../utils/targetMapModel';
import { getFormationDisplayName } from '../../utils/strips';

interface Props {
  strips: any[];
  spaces: any[];
  lightMode: boolean;
}

// צבע פר פ"מ - כדי להבדיל בין הקווים של פ"מים שונים שהולכים לאותו אזור
const STRIP_COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#2dd4bf', '#fb7185', '#facc15', '#60a5fa', '#4ade80'];
const STRIP_COLORS_LIGHT = ['#0369a1', '#be185d', '#4d7c0f', '#b45309', '#7e22ce', '#0f766e', '#be123c', '#a16207', '#1d4ed8', '#15803d'];

const ZOOM_MIN = 1;
const ZOOM_MAX = 40;
const FIRST_ONLY_KEY = 'sk.targetMapFirstOnly';
/** תזוזה (בפיקסלי המפה) שמעליה לחיצה נחשבת גרירה ולא בחירה */
const CLICK_SLOP = 5;

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

export default function BlockTargetMap({ strips, spaces, lightMode }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 400, h: 220 });
  const [focusId, setFocusId] = useState<string | null>(null);
  // תצוגה: זום סביב מרכז המסגרת + הזזה, בפיקסלי המפה
  const [view, setView] = useState({ z: 1, px: 0, py: 0 });
  const [firstOnly, setFirstOnly] = useState<boolean>(() => {
    try { return localStorage.getItem(FIRST_ONLY_KEY) === '1'; } catch { return false; }
  });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  // downItem: הפ"מ שנלחץ (על הפ"מ או מטרה שלו). נקבע ב-pointerdown כי ה-capture על המיכל
  // מפנה אליו את ה-pointerup, והפריט עצמו לא מקבל אותו
  const gesture = useRef<{ moved: boolean; pinchDist: number | null; downItem: string | null }>({ moved: false, pinchDist: null, downItem: null });

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setSize({ w: Math.max(e.contentRect.width, 120), h: Math.max(e.contentRect.height, 80) }));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const model = useMemo(() => buildTargetMapModel(strips, spaces, s => getFormationDisplayName(s) || String(s.callsign || s.callSign || '')), [strips, spaces]);
  // פ"מ שנבחר ויצא מהלוח - הבחירה מתבטלת, אחרת כל המפה נשארת מוחלשת בלי סיבה
  useEffect(() => {
    if (focusId && !model.strips.some(s => s.id === focusId)) setFocusId(null);
  }, [model.strips, focusId]);

  const c = lightMode
    ? { bg: '#f8fafc', text: '#334155', muted: '#64748b', spaceFill: 'rgba(99,102,241,0.10)', spaceStroke: '#6366f1', halo: '#ffffff', btn: '#e2e8f0', btnOn: '#0369a1', line: '#cbd5e1' }
    : { bg: '#0b1220', text: '#e2e8f0', muted: '#94a3b8', spaceFill: 'rgba(129,140,248,0.12)', spaceStroke: '#818cf8', halo: '#0b1220', btn: '#1e293b', btnOn: '#0ea5e9', line: '#334155' };
  const palette = lightMode ? STRIP_COLORS_LIGHT : STRIP_COLORS;

  const { w, h } = size;
  const base = model.bounds ? makeProjection(model.bounds, w, h) : null;
  const proj = base ? (p: LatLon) => {
    const q = base(p);
    return { x: (q.x - w / 2) * view.z + w / 2 + view.px, y: (q.y - h / 2) * view.z + h / 2 + view.py };
  } : null;

  // כמה פ"מים באותו מרחב - נפרסים במעגל קטן סביב המרכז, לא אחד על השני
  const spread = useMemo(() => {
    const bySpace = new Map<string, string[]>();
    for (const s of model.strips) if (s.spaceId && s.pos) bySpace.set(s.spaceId, [...(bySpace.get(s.spaceId) || []), s.id]);
    const off = new Map<string, { dx: number; dy: number }>();
    for (const ids of bySpace.values()) {
      if (ids.length < 2) continue;
      const r = Math.min(10 + ids.length * 3, 34);
      ids.forEach((id, i) => { const a = (2 * Math.PI * i) / ids.length - Math.PI / 2; off.set(id, { dx: r * Math.cos(a), dy: r * Math.sin(a) }); });
    }
    return off;
  }, [model.strips]);

  // ── זום והזזה ────────────────────────────────────────────────────────────
  // הקואורדינטות נמדדות כיחס מתוך המלבן שעל המסך, ולכן אינן תלויות ב-zoom של
  // #root (--s): המצביע והמלבן נמדדים באותן יחידות.
  const toLocal = (clientX: number, clientY: number) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return { x: w / 2, y: h / 2 };
    return { x: ((clientX - r.left) / r.width) * w, y: ((clientY - r.top) / r.height) * h };
  };
  const pxScale = () => {
    const r = boxRef.current?.getBoundingClientRect();
    return r && r.width ? w / r.width : 1;
  };
  /** זום לפקטור חדש כשהנקודה (ax, ay) נשארת במקומה */
  const zoomAt = (factor: number, ax = w / 2, ay = h / 2) => setView(v => {
    const z = clampZoom(v.z * factor);
    const k = z / v.z;
    if (z === ZOOM_MIN) return { z, px: 0, py: 0 };
    return { z, px: (ax - w / 2) * (1 - k) + v.px * k, py: (ay - h / 2) * (1 - k) + v.py * k };
  });

  // גלגלת: מאזין לא-פסיבי, כדי שהגלילה לא תגלגל את העמוד מתחת למפה
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const ax = r.width ? ((e.clientX - r.left) / r.width) * el.clientWidth : 0;
      const ay = r.height ? ((e.clientY - r.top) / r.height) * el.clientHeight : 0;
      zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, ax, ay);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest?.('[data-tm-control]')) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      gesture.current = { moved: false, pinchDist: null, downItem: (e.target as Element).closest?.('[data-tm-item]')?.getAttribute('data-tm-item') ?? null };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.moved = true;
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size >= 2) {
      // צביטה: יחס המרחק בין שתי האצבעות, סביב נקודת האמצע
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const g = gesture.current;
      if (g.pinchDist && d > 0) {
        const mid = toLocal((a.x + b.x) / 2, (a.y + b.y) / 2);
        zoomAt(d / g.pinchDist, mid.x, mid.y);
      }
      g.pinchDist = d;
      return;
    }
    const k = pxScale();
    const dx = (cur.x - prev.x) * k, dy = (cur.y - prev.y) * k;
    if (!gesture.current.moved && Math.hypot(dx, dy) < CLICK_SLOP) {
      pointers.current.set(e.pointerId, prev); // עוד לא גרירה - צוברים מהנקודה המקורית
      return;
    }
    gesture.current.moved = true;
    setView(v => (v.z === ZOOM_MIN ? v : { ...v, px: v.px + dx, py: v.py + dy }));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (pointers.current.size === 0) {
      // לחיצה (בלי גרירה): על פ"מ/מטרה - בוחרת או מבטלת אותו; על שטח ריק - מבטלת את הבחירה
      if (!gesture.current.moved && (e.pointerType !== 'mouse' || e.button <= 0)) {
        const id = gesture.current.downItem;
        setFocusId(f => (id ? (f === id ? null : id) : null));
      }
    } else {
      gesture.current.pinchDist = null;
    }
  };

  const toggleFirstOnly = () => setFirstOnly(v => {
    try { localStorage.setItem(FIRST_ONLY_KEY, v ? '0' : '1'); } catch { /* ignore */ }
    return !v;
  });

  const visibleTargets = (s: (typeof model.strips)[number]) => (firstOnly ? s.targets.filter(t => t.first) : s.targets);

  const ctlBtn = (on = false): React.CSSProperties => ({
    minWidth: 26, height: 26, padding: '0 8px', borderRadius: 5, cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', lineHeight: 1,
    border: `1px solid ${on ? c.btnOn : c.line}`, background: on ? c.btnOn : c.btn, color: on ? '#fff' : c.text,
  });

  return (
    <div ref={boxRef} data-testid="block-target-map"
      style={{ position: 'relative', width: '100%', height: '100%', background: c.bg, overflow: 'hidden', touchAction: 'none', userSelect: 'none', cursor: view.z > ZOOM_MIN ? 'grab' : 'default' }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      {!proj ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.muted, fontSize: '12px', textAlign: 'center', padding: '0 12px' }}>
          {tr('vertical.targetMapEmpty')}
        </div>
      ) : (
        <svg width={w} height={h} style={{ display: 'block' }}>
          {/* מרחבי הבלוקים */}
          {model.spaces.map(sp => (
            <g key={`sp-${sp.id}`}>
              {sp.polygons.map((poly, i) => (
                <polygon key={i} points={poly.map(p => { const q = proj(p); return `${q.x},${q.y}`; }).join(' ')}
                  fill={c.spaceFill} stroke={c.spaceStroke} strokeWidth={1.5} strokeDasharray="5 3" />
              ))}
              {sp.center && (() => { const q = proj(sp.center); return (
                <text x={q.x} y={q.y + 22} textAnchor="middle" fontSize={11} fontWeight="bold" fill={c.spaceStroke}
                  stroke={c.halo} strokeWidth={3} paintOrder="stroke">{sp.name}</text>
              ); })()}
            </g>
          ))}

          {/* קווים: פ"מ ← מטרה */}
          {model.strips.map((s, si) => {
            if (!s.pos) return null;
            const o = spread.get(s.id) || { dx: 0, dy: 0 };
            const a = proj(s.pos);
            const col = palette[si % palette.length];
            const dim = focusId !== null && focusId !== s.id;
            return visibleTargets(s).map((t, ti) => {
              const b = proj(t);
              return (
                <line key={`ln-${s.id}-${ti}`} x1={a.x + o.dx} y1={a.y + o.dy} x2={b.x} y2={b.y}
                  stroke={col} strokeWidth={t.first ? 2.5 : 1.5} strokeDasharray={t.first ? undefined : '6 4'}
                  opacity={dim ? 0.12 : t.first ? 0.95 : 0.7} />
              );
            });
          })}

          {/* מטרות - לחיצה על מטרה בוחרת את הפ"מ שלה */}
          {model.strips.map((s, si) => {
            const col = palette[si % palette.length];
            const dim = focusId !== null && focusId !== s.id;
            return visibleTargets(s).map((t, ti) => {
              const q = proj(t);
              return (
                <g key={`tg-${s.id}-${ti}`} data-tm-item={s.id} opacity={dim ? 0.2 : 1} style={{ cursor: 'pointer' }}>
                  <title>{`${s.label} - ${t.label}${t.first ? ` (${tr('strips.aimFirstExec')})` : ''}`}</title>
                  <circle cx={q.x} cy={q.y} r={10} fill="transparent" />
                  <circle cx={q.x} cy={q.y} r={t.first ? 6 : 4.5} fill="none" stroke={col} strokeWidth={2} />
                  <line x1={q.x - 3} y1={q.y} x2={q.x + 3} y2={q.y} stroke={col} strokeWidth={1.5} />
                  <line x1={q.x} y1={q.y - 3} x2={q.x} y2={q.y + 3} stroke={col} strokeWidth={1.5} />
                  <text x={q.x + 8} y={q.y + 4} fontSize={10} fill={c.text} stroke={c.halo} strokeWidth={3} paintOrder="stroke">{t.label}</text>
                </g>
              );
            });
          })}

          {/* פ"מים */}
          {model.strips.map((s, si) => {
            if (!s.pos) return null;
            const o = spread.get(s.id) || { dx: 0, dy: 0 };
            const q = proj(s.pos);
            const col = palette[si % palette.length];
            const focused = focusId === s.id;
            const dim = focusId !== null && !focused;
            const tw = Math.max(s.label.length * 7 + 12, 28);
            return (
              <g key={`st-${s.id}`} data-tm-item={s.id} data-testid={`tm-strip-${s.id}`} opacity={dim ? 0.35 : 1} style={{ cursor: 'pointer' }}>
                <rect x={q.x + o.dx - tw / 2} y={q.y + o.dy - 9} width={tw} height={18} rx={4}
                  fill={c.halo} stroke={col} strokeWidth={focused ? 3 : 2} />
                <text x={q.x + o.dx} y={q.y + o.dy + 4} textAnchor="middle" fontSize={11} fontWeight="bold" fill={col}>{s.label}</text>
              </g>
            );
          })}
        </svg>
      )}

      {proj && (
        <>
          {/* פקדים: זום + בורר מטרות */}
          <div data-tm-control style={{ position: 'absolute', top: 6, insetInlineStart: 6, display: 'flex', gap: 4, alignItems: 'center' }}>
            <button data-testid="tm-zoom-in" title={tr('vertical.targetMapZoomIn')} onClick={() => zoomAt(1.5)} style={ctlBtn()}>+</button>
            <button data-testid="tm-zoom-out" title={tr('vertical.targetMapZoomOut')} onClick={() => zoomAt(1 / 1.5)} disabled={view.z <= ZOOM_MIN} style={{ ...ctlBtn(), opacity: view.z <= ZOOM_MIN ? 0.4 : 1 }}>−</button>
            <button data-testid="tm-zoom-reset" title={tr('vertical.targetMapZoomReset')} onClick={() => setView({ z: 1, px: 0, py: 0 })} disabled={view.z <= ZOOM_MIN} style={{ ...ctlBtn(), opacity: view.z <= ZOOM_MIN ? 0.4 : 1 }}>⟲</button>
            <span style={{ width: 6 }} />
            <button data-testid="tm-first-only" onClick={() => { if (!firstOnly) toggleFirstOnly(); }} style={ctlBtn(firstOnly)}>{tr('vertical.targetMapFirstOnly')}</button>
            <button data-testid="tm-all-targets" onClick={() => { if (firstOnly) toggleFirstOnly(); }} style={ctlBtn(!firstOnly)}>{tr('vertical.targetMapAllTargets')}</button>
          </div>
          <div style={{ position: 'absolute', bottom: 4, insetInlineStart: 6, fontSize: '10px', color: c.muted, pointerEvents: 'none', display: 'flex', gap: 10 }}>
            <span>━ {tr('strips.aimFirstExec')}</span>
            {!firstOnly && <span>┅ {tr('vertical.targetMapOtherTargets')}</span>}
            {focusId && <span>· {tr('vertical.targetMapClearFocus')}</span>}
          </div>
        </>
      )}
    </div>
  );
}
