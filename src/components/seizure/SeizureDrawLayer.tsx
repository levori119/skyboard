/**
 * **ציור המרחב המולאם** - שני רכיבים, ובכוונה.
 *
 * | רכיב | איפה יושב | למה |
 * |------|-----------|-----|
 * | `SeizureDrawLayer` | **בתוך** מכולת המפה, על גבולות התמונה | הציור חייב להיות באותה מערכת קואורדינטות של האזורים |
 * | `SeizureDrawToolbar` | **מחוץ** למכולה, לצד סרגל המפה | אחרת הוא נופל מתחת לסרגל הכלים |
 *
 * ── למה הסרגל אינו בתוך שכבת הציור ──────────────────────────────────────────
 * סרגל כלי המפה (זום/איפוס/ניווט) הוא **אח** של מכולת המפה ויושב אחריה, ולכן
 * הוא נצבע מעל **כל** מה שבתוכה - בלי קשר ל-`z-index` של הילדים. סרגל ציור
 * שיושב בפנים נעלם מתחתיו, וזה בדיוק מה שקרה. הפתרון אינו z-index גדול יותר
 * אלא **אותה רמת קינון**: הסרגל מרונדר ליד סרגל המפה, ב-`MAP_TOOLBAR_GAP`,
 * בדיוק כמו פאנל הסגירות.
 *
 * מכאן ש-`pts` מוחזק **מחוץ** לשני הרכיבים (בעמדה): שניהם צופים באותו פוליגון.
 *
 * ── Pointer Events, בלי לחצן ימני ───────────────────────────────────────────
 * העמדה היא Wacom Cintiq 24 Touch: הפקח מצייר ב**עט** ובאצבע. `touchAction:'none'`
 * הוא ההבדל בין ציור לבין גלילת דף (בלעדיו `pointermove` לא נשלח כלל באצבע),
 * ו-`setPointerCapture` מחזיק את הגרירה גם כשהמצביע עובר מעל שכבה אחרת.
 *
 * ── "נגיעה" מול "גרירה" ─────────────────────────────────────────────────────
 * נגיעה **מוסיפה** קודקוד, גרירה **מזיזה** קודקוד קיים. ההכרעה לפי מרחק שעבר
 * המצביע (`tapAction`) ולא לפי זמן: אצבע על מסך מגע זזה תמיד קצת, וסף זמן היה
 * הופך כל נגיעה איטית לגרירה.
 *
 * הסרגל הוא פקד **עריכה** ולכן מסגרת כתומה (CLAUDE.md §מסגרת חלון).
 */

import React, { useCallback, useRef } from 'react';
import { tr } from '../../i18n/tr';
import { windowFrame, type FrameTheme } from '../../utils/windowFrame';
import { SEIZURE_MIN_VERTICES, vertexAt, tapAction } from '../../utils/tempZoneSeizure';
import { seizurePalette } from './seizureTheme';

export interface DrawBounds { top: number; left: number; width: number; height: number }
export type DrawPt = { x: number; y: number };

interface LayerProps {
  /** גבולות תמונת המפה בתוך המכולה, בפיקסלים (כמו `mapImgBounds`). */
  bounds: DrawBounds;
  /** הפוליגון הנוכחי, באחוזי תמונת מפה (0..100). מוחזק בעמדה. */
  pts: DrawPt[];
  onPtsChange: (next: DrawPt[]) => void;
  /** הפוליגון נסגר (נגיעה בקודקוד הראשון). */
  onDone: (pts: DrawPt[]) => void;
  onCancel: () => void;
}

export default function SeizureDrawLayer({ bounds, pts, onPtsChange, onDone, onCancel }: LayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const dragIdx = useRef<number | null>(null);
  const startPt = useRef<DrawPt | null>(null);

  /** מיקום המצביע באחוזי תמונת המפה. נמדד מהשכבה עצמה, שיושבת בדיוק על התמונה. */
  const toPct = useCallback((e: React.PointerEvent): DrawPt | null => {
    const el = layerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button > 0) return;
    const p = toPct(e);
    if (!p) return;
    startPt.current = p;
    const hit = vertexAt(pts, p);
    dragIdx.current = hit >= 0 ? hit : null;
    // בלי capture הגרירה נקטעת ברגע שהמצביע עובר מעל שכבה אחרת של המפה
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    // ⚠️ בלי preventDefault: בעט/מגע הוא מבטל את אירועי העכבר התואמים
  }, [pts, toPct]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (dragIdx.current == null) return;
    const p = toPct(e);
    if (!p) return;
    const i = dragIdx.current;
    onPtsChange(pts.map((q, idx) => idx === i ? p : q));
  }, [pts, onPtsChange, toPct]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const p = toPct(e);
    const start = startPt.current;
    const wasDrag = dragIdx.current != null;
    dragIdx.current = null;
    startPt.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (wasDrag || !p || !start) return;
    // ההכרעה עצמה טהורה ונבדקת ב-vitest: זו הלוגיקה שנשברת בשקט כשמשנים סף
    const action = tapAction(pts, start, p);
    if (action === 'none') return;               // המצביע זז - גרירה, לא נגיעה
    if (action === 'close') { onDone(pts); return; }
    onPtsChange([...pts, p]);
  }, [pts, onPtsChange, toPct, onDone]);

  // Esc מבטל את הציור כולו (מקרה 5 באפיון)
  React.useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const poly = pts.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <div
      ref={layerRef}
      data-testid="seizure-draw-layer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: 'absolute', top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height,
        zIndex: 220, cursor: 'crosshair',
        // ⚠️ בלי touchAction:'none' הדפדפן תופס את התנועה כגלילה ולא שולח pointermove
        touchAction: 'none', userSelect: 'none',
      }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
        {pts.length >= 2 && (
          <polygon points={poly} fill="#f9731626" stroke="#f97316" strokeWidth={0.5} strokeDasharray="2,1" />
        )}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 1.1 : 0.8}
            fill={i === 0 ? '#f97316' : '#fdba74'} stroke="#0f172a" strokeWidth={0.25} />
        ))}
      </svg>
    </div>
  );
}

interface ToolbarProps {
  pts: DrawPt[];
  themeMode: FrameTheme;
  /** מיקום מוחלט בתוך פאנל המפה - כמו כל פאנל שנפתח לצד סרגל הכלים. */
  top: number;
  left: number;
  onUndo: () => void;
  onDone: (pts: DrawPt[]) => void;
  onCancel: () => void;
}

export function SeizureDrawToolbar({ pts, themeMode, top, left, onUndo, onDone, onCancel }: ToolbarProps) {
  const P = seizurePalette(themeMode);
  const canClose = pts.length >= SEIZURE_MIN_VERTICES;
  const btn = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 6, fontSize: 12, whiteSpace: 'nowrap',
    border: `1px solid ${active ? '#f97316' : P.line}`,
    background: active ? '#431407' : P.panelAlt,
    color: active ? '#fdba74' : P.muted,
    cursor: active ? 'pointer' : 'not-allowed',
    touchAction: 'manipulation',
  });

  return (
    <div data-seizure-draw-toolbar="" style={{
      position: 'absolute', top, left, zIndex: 216,
      background: P.panel, ...windowFrame('edit', themeMode, 8),
      padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 260,
      boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
    }}>
      <div style={{ color: P.accent, fontSize: 13, fontWeight: 'bold' }}>{tr('seizure.drawTitle')}</div>
      <div style={{ color: P.muted, fontSize: 11, lineHeight: 1.4 }}>{tr('seizure.drawHint')}</div>
      <div style={{ color: canClose ? P.ok : P.danger, fontSize: 11 }}>
        {pts.length} {tr('seizure.vertices')}{canClose ? '' : ` - ${tr('seizure.drawNeed3')}`}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" onClick={onUndo} disabled={!pts.length}
          style={btn(pts.length > 0)}>↶ {tr('seizure.drawUndo')}</button>
        <button type="button" onClick={() => canClose && onDone(pts)} disabled={!canClose}
          style={btn(canClose)}>✓ {tr('seizure.drawClose')}</button>
        <button type="button" onClick={onCancel}
          style={{ ...btn(true), border: `1px solid ${P.line}`, background: P.panelAlt, color: P.danger }}>
          ✕ {tr('shared.cancel')}
        </button>
      </div>
    </div>
  );
}
