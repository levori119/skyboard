/**
 * **מפת מטרות ליד הבלוקים** - מפה קטנה ודינאמית בתצוגת הבלוקים (נדלקת בכפתור).
 *
 * מציגה את מרחבי הבלוקים של העמדה, את הפ"מים שעל הלוח ואת נקודות המכוון שלהם,
 * עם קו מהפ"מ לכל מטרה: מלא ועבה לראשונה לביצוע, מקווקו לשאר. המפה מתכווננת
 * לבד לגבולות התוכן, ומתעדכנת עם כל שינוי בפ"מים (שיוך מרחב, נ"צ חדש).
 *
 * לא מפת רקע: אין תלות במפה מעוגנת של העמדה - רק הגאומטריה שהמרחבים והמטרות
 * כבר נושאים בנ"צ. לחיצה/מעבר על פ"מ מדגישה את הקווים שלו.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import { buildTargetMapModel, makeProjection } from '../../utils/targetMapModel';
import { getFormationDisplayName } from '../../utils/strips';

interface Props {
  strips: any[];
  spaces: any[];
  lightMode: boolean;
}

// צבע פר פ"מ - כדי להבדיל בין הקווים של פ"מים שונים שהולכים לאותו אזור
const STRIP_COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#2dd4bf', '#fb7185', '#facc15', '#60a5fa', '#4ade80'];
const STRIP_COLORS_LIGHT = ['#0369a1', '#be185d', '#4d7c0f', '#b45309', '#7e22ce', '#0f766e', '#be123c', '#a16207', '#1d4ed8', '#15803d'];

export default function BlockTargetMap({ strips, spaces, lightMode }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 400, h: 220 });
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setSize({ w: Math.max(e.contentRect.width, 120), h: Math.max(e.contentRect.height, 80) }));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const model = useMemo(() => buildTargetMapModel(strips, spaces, s => getFormationDisplayName(s) || String(s.callsign || s.callSign || '')), [strips, spaces]);

  const c = lightMode
    ? { bg: '#f8fafc', grid: '#e2e8f0', text: '#334155', muted: '#64748b', spaceFill: 'rgba(99,102,241,0.10)', spaceStroke: '#6366f1', halo: '#ffffff' }
    : { bg: '#0b1220', grid: '#1e293b', text: '#e2e8f0', muted: '#94a3b8', spaceFill: 'rgba(129,140,248,0.12)', spaceStroke: '#818cf8', halo: '#0b1220' };
  const palette = lightMode ? STRIP_COLORS_LIGHT : STRIP_COLORS;

  const { w, h } = size;
  const proj = model.bounds ? makeProjection(model.bounds, w, h) : null;

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

  return (
    <div ref={boxRef} data-testid="block-target-map" style={{ position: 'relative', width: '100%', height: '100%', background: c.bg, overflow: 'hidden' }}
      onPointerDown={e => { if (e.target === e.currentTarget || (e.target as Element).tagName === 'svg') setFocusId(null); }}>
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
            return s.targets.map((t, ti) => {
              const b = proj(t);
              return (
                <line key={`ln-${s.id}-${ti}`} x1={a.x + o.dx} y1={a.y + o.dy} x2={b.x} y2={b.y}
                  stroke={col} strokeWidth={t.first ? 2.5 : 1.5} strokeDasharray={t.first ? undefined : '6 4'}
                  opacity={dim ? 0.12 : t.first ? 0.95 : 0.7} />
              );
            });
          })}

          {/* מטרות */}
          {model.strips.map((s, si) => {
            const col = palette[si % palette.length];
            const dim = focusId !== null && focusId !== s.id;
            return s.targets.map((t, ti) => {
              const q = proj(t);
              return (
                <g key={`tg-${s.id}-${ti}`} opacity={dim ? 0.2 : 1}>
                  <title>{`${s.label} - ${t.label}${t.first ? ` (${tr('strips.aimFirstExec')})` : ''}`}</title>
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
              <g key={`st-${s.id}`} opacity={dim ? 0.35 : 1} style={{ cursor: 'pointer' }}
                onPointerEnter={e => { if (e.pointerType === 'mouse') setFocusId(s.id); }}
                onPointerLeave={e => { if (e.pointerType === 'mouse') setFocusId(null); }}
                onPointerDown={e => { e.stopPropagation(); setFocusId(f => (f === s.id ? null : s.id)); }}>
                <rect x={q.x + o.dx - tw / 2} y={q.y + o.dy - 9} width={tw} height={18} rx={4}
                  fill={c.halo} stroke={col} strokeWidth={focused ? 3 : 2} />
                <text x={q.x + o.dx} y={q.y + o.dy + 4} textAnchor="middle" fontSize={11} fontWeight="bold" fill={col}>{s.label}</text>
              </g>
            );
          })}
        </svg>
      )}
      {proj && (
        <div style={{ position: 'absolute', bottom: 4, insetInlineStart: 6, fontSize: '10px', color: c.muted, pointerEvents: 'none', display: 'flex', gap: 10 }}>
          <span>━ {tr('strips.aimFirstExec')}</span>
          <span>┅ {tr('vertical.targetMapOtherTargets')}</span>
        </div>
      )}
    </div>
  );
}
