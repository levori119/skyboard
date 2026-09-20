import React from 'react';
import { tr } from '../../i18n/tr';
import { useToolbarScale } from '../../hooks/useToolbarScale';
import { tbPx } from '../../utils/scale';
import { useDragPosition } from '../../hooks/useDragPosition';
import { windowFrame } from '../../utils/windowFrame';
import { readRootScale } from '../../utils/pointerDrag';
import {
  DRAW_PALETTE, LINE_STYLES, POLY_MIN_POINTS, POLY_SNAP_SCREEN_PX, applyStrokeStyle, crossMarks, crossSize, crossSpacing,
  dashArray, isPolyTool, outlinePoints, polyPointsToPx, polyShapeFromPoints,
  polyTapAction, pxToFrac, redrawStrokes, shapeFromDrag, shapeToPx, syncCanvasBitmap,
  type DrawTool, type LineStyle, type MapShape, type PenStroke, type PolyTool,
} from '../../utils/mapDrawing';

/**
 * סרגל הציור על המפה - **רכיב משותף** לעמדת המפה (SectorDashboard) ולעמדת השדה
 * (GroundView). אותו כלי, אותה התנהגות, אותו עיצוב בשתי העמדות; מה שמשתנה הוא
 * רק **על מה** מציירים.
 *
 * הקובץ מכיל שלושה חלקים:
 *   `MapDrawToolbar`  - סרגל הכלים (תצוגה בלבד; מקבל מצב + callbacks).
 *   `useMapDrawing`   - מנוע הציור לקנבס בודד (עמדת שדה). עמדת המפה מריצה מנוע
 *                       משלה כי הציור שם מסונכרן בין חברי העמדה ומזין את זיהוי
 *                       הכתב, ולכן היא מחוברת רק לסרגל.
 *   `MapDrawSurface`  - קנבס הציור + שכבת הצורות, מחוברים למנוע.
 *
 * גרירה: Pointer Events + `touchAction:'none'` + `setPointerCapture` - חובה כדי
 * שהעט והאצבע ב-Cintiq יעבדו, לא רק העכבר (ראה CLAUDE.md §גרירה).
 */

export type ThemeMode = 'light' | 'dark' | 'ocean';

/** פלטת הסרגל לפי תמה. ocean היא תמה **כהה** - לא לגזור "לא dark = בהיר". */
export const toolbarColors = (theme: ThemeMode) =>
  theme === 'light'
    ? { panel: 'rgba(255,255,255,0.98)', border: '#7c3aed', title: '#6d28d9', label: '#475569', off: '#f1f5f9', offBorder: '#cbd5e1', offText: '#475569', on: '#ddd6fe', onBorder: '#7c3aed', onText: '#4c1d95', value: '#6d28d9', sep: '#e2e8f0', accent: '#7c3aed' }
    : theme === 'ocean'
    ? { panel: 'rgba(5,64,78,0.97)', border: '#38bdf8', title: '#a5f3fc', label: '#7dd3fc', off: '#083d4d', offBorder: '#0e7490', offText: '#a5f3fc', on: '#0e7490', onBorder: '#38bdf8', onText: '#cffafe', value: '#a5f3fc', sep: '#0e7490', accent: '#38bdf8' }
    : { panel: 'rgba(15,23,42,0.97)', border: '#7c3aed', title: '#c4b5fd', label: '#94a3b8', off: '#1e293b', offBorder: '#334155', offText: '#94a3b8', on: '#4c1d95', onBorder: '#a78bfa', onText: '#e9d5ff', value: '#c4b5fd', sep: '#334155', accent: '#a78bfa' };

const TOOL_LABELS: Record<DrawTool, string> = {
  pen: 'map.drawPen',
  eraser: 'map.drawEraser',
  circle: 'map.drawCircle',
  rect: 'map.drawRect',
  polygon: 'map.drawPolygon',
  polyline: 'map.drawPolyline',
  recognize: 'map.drawRecognize',
};

export const DEFAULT_DRAW_TOOLS: DrawTool[] = ['pen', 'eraser', 'circle', 'rect', 'polygon', 'polyline'];

/** הכלים שמייצרים **צורה** - להם יש סגנון קו, ולחלקם גם מילוי. */
export const SHAPE_TOOLS: DrawTool[] = ['circle', 'rect', 'polygon', 'polyline'];

const LINE_STYLE_LABELS: Record<LineStyle, string> = {
  solid: 'map.lineSolid',
  dashed: 'map.lineDashed',
  dotted: 'map.lineDotted',
  dashdot: 'map.lineDashDot',
  cross: 'map.lineCross',
};

/** הסגנון עצמו כקו קטן בתוך הכפתור - כך הבחירה נקראת במבט ולא בקריאת מילה. */
export const LineStylePreview: React.FC<{ style: LineStyle; color: string; width: number }> = ({ style, color, width }) => {
  const h = 10, y = h / 2;
  return (
    <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} aria-hidden="true" style={{ display: 'block' }}>
      <line x1={1} y1={y} x2={width - 1} y2={y} stroke={color} strokeWidth={1.5} strokeDasharray={dashArray(style, 1.5)} strokeLinecap="round" />
      {style === 'cross' && crossMarks([{ x: 1, y }, { x: width - 1, y }], false, width / 3).map((m, i) => (
        <g key={i} transform={`translate(${m.x} ${m.y})`}>
          <line x1={-3} y1={-3} x2={3} y2={3} stroke={color} strokeWidth={1.5} />
          <line x1={-3} y1={3} x2={3} y2={-3} stroke={color} strokeWidth={1.5} />
        </g>
      ))}
    </svg>
  );
};

/** סמן העט/המחק על הקנבס. */
export const drawCursor = (tool: DrawTool): string =>
  tool === 'eraser'
    ? 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23000\' stroke-width=\'2\'%3E%3Cpath d=\'M20 20H7L3 16c-.8-.8-.8-2 0-2.8l10-10c.8-.8 2-.8 2.8 0l7 7c.8.8.8 2 0 2.8L14 22\'/%3E%3Cpath d=\'M6.5 13.5 15 5\'/%3E%3C/svg%3E") 12 12, auto'
    : 'crosshair';

// ─────────────────────────────────────────────────────────────────────────────
// סרגל הכלים
// ─────────────────────────────────────────────────────────────────────────────

export type MapDrawToolbarProps = {
  tool: DrawTool;
  onToolChange: (t: DrawTool) => void;
  color: string;
  onColorChange: (c: string) => void;
  size: number;
  onSizeChange: (n: number) => void;
  filled: boolean;
  onFilledChange: (v: boolean) => void;
  /** סגנון הקו של הצורות. בלעדיו הסרגל לא מציג את השורה (תאימות לעמדה ישנה). */
  lineStyle?: LineStyle;
  onLineStyleChange?: (s: LineStyle) => void;
  onClear: () => void;
  onClose: () => void;
  themeMode?: ThemeMode;
  /** אילו כלים להציג. ברירת מחדל: עט/מחק/עיגול/מלבן. */
  tools?: DrawTool[];
  /** כפתורים נוספים בשורת הכלים (למשל בדיקת זיהוי בעמדת המפה). */
  toolsExtra?: React.ReactNode;
  /** טיוטת הפוליגון בציור: כמה נקודות נדקרו + סיום / נקודה אחורה. */
  polyDraft?: { count: number; onFinish: () => void; onUndo: () => void };
  /** שורות נוספות מעל "נקה/סגור" (למשל הסבר או"ק, שיתוף עמדה). */
  children?: React.ReactNode;
  /** מיקום הסרגל על המפה. */
  style?: React.CSSProperties;
};

export const MapDrawToolbar: React.FC<MapDrawToolbarProps> = ({
  tool, onToolChange, color, onColorChange, size, onSizeChange, filled, onFilledChange,
  lineStyle = 'solid', onLineStyleChange, onClear, onClose, themeMode = 'dark', tools = DEFAULT_DRAW_TOOLS, toolsExtra, polyDraft, children, style,
}) => {
  const C = toolbarColors(themeMode);
  const tb = useToolbarScale();
  // גרירה בעט ובאצבע דרך ה-hook המשותף - הוא כבר פותר את חלוקת ה---s, את
  // setPointerCapture ואת touchAction. מימוש ידני כאן היה חוזר על שלוש
  // המלכודות (CLAUDE.md §גרירה).
  const winRef = React.useRef<HTMLDivElement | null>(null);
  const drag = useDragPosition(winRef);
  const chip = (active: boolean): React.CSSProperties => ({
    padding: `${tbPx(3, tb)} ${tbPx(7, tb)}`,
    fontSize: tbPx(11, tb),
    borderRadius: '4px',
    border: `1px solid ${active ? C.onBorder : C.offBorder}`,
    background: active ? C.on : C.off,
    color: active ? C.onText : C.offText,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  return (
    <div
      ref={winRef}
      data-nopan
      data-draw-toolbar=""
      // הסרגל יושב על המפה: לחיצה עליו לא מתגלגלת למפה ולא מתחילה ציור/פאן
      onPointerDown={e => e.stopPropagation()}
      style={{
        // חלון **עריכה** (ציור על המפה) ולכן מסגרת כתומה - CLAUDE.md §מסגרת חלון
        position: 'absolute', zIndex: 210, background: C.panel, ...windowFrame('edit', themeMode, 8),
        padding: '8px 10px', display: 'flex', flexDirection: 'column',
        gap: '6px', minWidth: '160px', boxShadow: '0 4px 20px rgba(0,0,0,0.6)', cursor: 'default',
        userSelect: 'none',
        ...style,
        // הגרירה גוברת על המיקום שהעמדה קבעה, ולכן היא **אחרי** ה-style.
        // `position:fixed` בזמן גרירה: useDragPosition מחזיר קואורדינטות מסך,
        // ומיקום absolute היה מודד אותן מול ההורה במקום מול החלון.
        ...(drag.dragged ? { position: 'fixed' as const, left: drag.pos!.x, top: drag.pos!.y, right: 'auto', bottom: 'auto' } : null),
      }}
    >
      {/* ידית הגרירה. הסרגל מכסה את המפה, והפקח חייב יכולת להזיז אותו כדי
          לראות מה שמתחתיו - בעט ובאצבע, לא רק בעכבר (CLAUDE.md §גרירה). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
        <span {...drag.handleProps}
          data-drag-handle=""
          title={tr('ctrl.dragToolbar')}
          style={{ ...drag.handleProps.style, color: C.title, cursor: 'grab', fontSize: '12px', lineHeight: 1 }}>⠿</span>
        <div style={{ fontSize: '11px', color: C.title, fontWeight: 'bold', flex: 1 }}>{tr('ctrl.drawingTools')}</div>
      </div>

      {/* בחירת כלי */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {tools.map(t => (
          <button key={t} onClick={() => onToolChange(t)} style={chip(tool === t)}>
            {tr(TOOL_LABELS[t])}
          </button>
        ))}
        {toolsExtra}
      </div>

      {/* צבע */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '10px', color: C.label }}>{tr('shared.color2')}</span>
        {DRAW_PALETTE.map(c => (
          <button key={c} onClick={() => onColorChange(c)} title={c} aria-label={c}
            style={{ width: tbPx(14, tb), height: tbPx(14, tb), padding: 0, borderRadius: '50%', background: c, border: color === c ? `2px solid ${C.accent}` : `1px solid ${C.offBorder}`, cursor: 'pointer', flexShrink: 0 }} />
        ))}
        <input type="color" value={color} onChange={e => onColorChange(e.target.value)} title={tr('map.drawCustomColor')}
          style={{ width: tbPx(18, tb), height: tbPx(18, tb), padding: 0, border: 'none', borderRadius: '3px', cursor: 'pointer', background: 'transparent' }} />
      </div>

      {/* עובי */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '10px', color: C.label, whiteSpace: 'nowrap' }}>{tr('ctrl.thickness')}</span>
        <input type="range" min={1} max={20} value={size} onChange={e => onSizeChange(parseInt(e.target.value))}
          style={{ flex: 1, accentColor: C.accent, height: 12 }} />
        <span style={{ fontSize: '10px', color: C.value, width: 18, textAlign: 'center' }}>{size}</span>
      </div>

      {/* סגנון הקו - רק לצורות. העט הוא כתב יד, ושם קו מקווקו רק מקשה על הקריאה.
          הכפתור מראה את הסגנון עצמו ולא שם שלו - מזוהה במבט אחד, ובלי תרגום. */}
      {SHAPE_TOOLS.includes(tool) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '10px', color: C.label, whiteSpace: 'nowrap' }}>{tr('map.drawLineStyle')}</span>
          {LINE_STYLES.map(s => (
            <button key={s} data-line-style={s} aria-pressed={lineStyle === s}
              onClick={() => onLineStyleChange?.(s)} title={tr(LINE_STYLE_LABELS[s])} aria-label={tr(LINE_STYLE_LABELS[s])}
              style={{ ...chip(lineStyle === s), padding: `${tbPx(2, tb)} ${tbPx(4, tb)}`, lineHeight: 0 }}>
              <LineStylePreview style={s} color={lineStyle === s ? C.onText : C.offText} width={Math.round(26 * tb)} />
            </button>
          ))}
        </div>
      )}

      {/* מילוי - רק לצורות שהן שטח (פוליגון פתוח הוא קו, לא שטח) */}
      {(tool === 'circle' || tool === 'rect' || tool === 'polygon') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10px', color: C.label }}>{tr('ctrl.fill')}</span>
          <button onClick={() => onFilledChange(!filled)} style={{ ...chip(filled), padding: `${tbPx(2, tb)} ${tbPx(8, tb)}`, fontSize: tbPx(10, tb) }}>
            {filled ? tr('map.drawFilled') : tr('map.drawOutline')}
          </button>
        </div>
      )}

      {/* פוליגון: איך מסיימים + סיום / נקודה אחורה. בעט ובאצבע אין דאבל-קליק
          אמין ואין מקלדת בהישג יד, ולכן כפתורים ולא רק Enter/Backspace. */}
      {isPolyTool(tool) && (
        <div data-poly-hint="" style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: `1px solid ${C.sep}`, paddingTop: '6px' }}>
          <div style={{ fontSize: '10px', color: C.label, lineHeight: 1.4, maxWidth: '260px' }}>
            {tr(tool === 'polygon' ? 'map.drawPolyHintClosed' : 'map.drawPolyHintOpen')}
          </div>
          {polyDraft && polyDraft.count > 0 && (
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={polyDraft.onFinish} disabled={polyDraft.count < POLY_MIN_POINTS[tool]}
                style={{ ...chip(true), flex: 1, opacity: polyDraft.count < POLY_MIN_POINTS[tool] ? 0.5 : 1 }}>
                {tr('map.drawPolyFinish', { count: polyDraft.count })}
              </button>
              <button onClick={polyDraft.onUndo} style={{ ...chip(false), flex: 1 }}>
                {tr('map.drawPolyUndo')}
              </button>
            </div>
          )}
        </div>
      )}

      {children}

      {/* נקה / סגור */}
      <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
        <button onClick={onClear}
          style={{ flex: 1, padding: `${tbPx(3, tb)} 0`, fontSize: tbPx(10, tb), background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b', borderRadius: '4px', cursor: 'pointer' }}>
          {tr('shared.clear3')}
        </button>
        <button onClick={onClose}
          style={{ flex: 1, padding: `${tbPx(3, tb)} 0`, fontSize: tbPx(10, tb), background: C.off, color: C.offText, border: `1px solid ${C.offBorder}`, borderRadius: '4px', cursor: 'pointer' }}>
          {tr('shared.close2')}
        </button>
      </div>
    </div>
  );
};

/**
 * כפתור ההדלקה/כיבוי של מצב הציור - אותו כפתור ✏ בשתי העמדות.
 *
 * `labeled` מוסיף כיתוב לצד האייקון. בעמדת המפה הכפתור יושב בסרגל אנכי צר ולכן
 * אייקון בלבד; בעמדת השדה הוא יושב בפאנל השכבות, ושם ריבוע 20px בלי כיתוב פשוט
 * לא נמצא בעין.
 */
export const MapDrawToggle: React.FC<{
  active: boolean;
  onToggle: () => void;
  themeMode?: ThemeMode;
  labeled?: boolean;
  style?: React.CSSProperties;
}> = ({ active, onToggle, themeMode = 'dark', labeled = false, style }) => {
  const C = toolbarColors(themeMode);
  const tb = useToolbarScale();
  return (
    <button onClick={onToggle} data-nopan
      onPointerDown={e => e.stopPropagation()}
      title={active ? tr('map.drawDisable') : tr('map.drawEnable')}
      style={{
        background: active ? '#7c3aed' : C.off,
        color: active ? '#ffffff' : C.offText, border: `1px solid ${active ? C.onBorder : C.offBorder}`,
        borderRadius: '4px', cursor: 'pointer', fontSize: tbPx(11, tb), lineHeight: 1,
        fontWeight: active ? 'bold' : 'normal', whiteSpace: 'nowrap',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: labeled ? '5px' : 0,
        ...(labeled
          ? { width: '100%', padding: `${tbPx(4, tb)} ${tbPx(8, tb)}` }
          : { width: tbPx(20, tb), height: tbPx(20, tb), padding: 0 }),
        ...style,
      }}>
      <span style={{ fontSize: tbPx(12, tb) }}>✏</span>
      {labeled && <span>{tr('map.drawLabel')}</span>}
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// רינדור צורה + טיוטת פוליגון - משותף לשתי העמדות
// ─────────────────────────────────────────────────────────────────────────────

type Pt = { x: number; y: number };

/**
 * האיקסים שיושבים על קו המתאר. הם **סימנים** ולא תבנית מקווקוות, ולכן הם נבנים
 * מהגאומטריה של הצורה (`outlinePoints`) ומסתובבים עם כיוון הקו.
 */
export const CrossMarksSvg: React.FC<{ points: Pt[]; closed: boolean; color: string; strokeWidth: number }> = ({ points, closed, color, strokeWidth }) => {
  const r = crossSize(strokeWidth);
  return (
    <>
      {crossMarks(points, closed, crossSpacing(strokeWidth)).map((m, i) => (
        <g key={i} data-cross-mark="" transform={`translate(${m.x} ${m.y}) rotate(${m.angle * 180 / Math.PI})`}>
          <line x1={-r} y1={-r} x2={r} y2={r} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          <line x1={-r} y1={r} x2={r} y2={-r} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        </g>
      ))}
    </>
  );
};

/** צורה שמורה (בשברים) כאלמנט SVG בגודל המשטח הנוכחי, בסגנון הקו שלה. */
export const MapShapeSvg: React.FC<{ shape: MapShape; size: { w: number; h: number } }> = ({ shape: s, size }) => {
  const fill = s.filled ? s.color + '55' : 'none';
  const dash = dashArray(s.lineStyle, s.strokeWidth);
  const line = { stroke: s.color, strokeWidth: s.strokeWidth, strokeDasharray: dash, strokeLinecap: dash ? ('round' as const) : undefined };
  const outline = s.lineStyle === 'cross' ? outlinePoints(s, size) : null;
  const p = shapeToPx(s, size);
  return (
    <>
      {s.type === 'polygon' && <polygon points={polyPointsToPx(s, size)} fill={fill} strokeLinejoin="round" {...line} />}
      {s.type === 'polyline' && <polyline points={polyPointsToPx(s, size)} fill="none" strokeLinejoin="round" {...line} />}
      {s.type === 'rect' && <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={2} fill={fill} {...line} />}
      {s.type === 'circle' && <ellipse cx={p.x + p.w / 2} cy={p.y + p.h / 2} rx={p.w / 2} ry={p.h / 2} fill={fill} {...line} />}
      {outline && <CrossMarksSvg points={outline.points} closed={outline.closed} color={s.color} strokeWidth={s.strokeWidth} />}
    </>
  );
};

/**
 * הפוליגון בזמן הדקירה: הצלעות שנדקרו + "גומייה" עד המצביע, ובסגור - קו סגירה
 * מקווקו לנקודה הראשונה, כדי שיהיה ברור מראש איך הצורה תיסגר. הנקודה הראשונה
 * מוגדלת בסגור - דקירה עליה סוגרת.
 *
 * `scale` ממיר את יחידות הנקודות ליחידות ה-SVG (בעמדת השדה הנקודות בפיקסלי
 * bitmap וה-SVG בפיקסלי פריסה).
 */
export const PolyDraftSvg: React.FC<{
  type: PolyTool; points: Pt[]; cursor: Pt | null;
  color: string; strokeWidth: number; filled: boolean; lineStyle?: LineStyle; scale?: number;
}> = ({ type, points, cursor, color, strokeWidth, filled, lineStyle = 'solid', scale = 1 }) => {
  if (!points.length) return null;
  const sc = (p: Pt) => `${p.x * scale},${p.y * scale}`;
  const path = [...points, ...(cursor ? [cursor] : [])];
  const dash = dashArray(lineStyle, strokeWidth);
  const scaled = path.map(p => ({ x: p.x * scale, y: p.y * scale }));
  const first = points[0];
  const last = path[path.length - 1];
  const r = Math.max(3, strokeWidth + 1.5);
  return (
    <g data-poly-draft="" opacity={0.9}>
      {type === 'polygon' && filled && path.length >= 3 && (
        <polygon points={path.map(sc).join(' ')} fill={color + '33'} stroke="none" />
      )}
      <polyline points={path.map(sc).join(' ')} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={dash} strokeLinejoin="round" strokeLinecap="round" />
      {/* הסגנון נראה כבר בזמן הדקירה - אחרת הצורה "משתנה" ברגע הסיום */}
      {lineStyle === 'cross' && scaled.length >= 2 && (
        <CrossMarksSvg points={scaled} closed={false} color={color} strokeWidth={strokeWidth} />
      )}
      {type === 'polygon' && path.length >= 2 && (
        <line data-poly-closing="" x1={last.x * scale} y1={last.y * scale} x2={first.x * scale} y2={first.y * scale}
          stroke={color} strokeWidth={Math.max(1, strokeWidth * 0.75)} strokeDasharray="6 4" />
      )}
      {points.map((p, i) => (
        <circle key={i} cx={p.x * scale} cy={p.y * scale}
          r={i === 0 && type === 'polygon' ? r * 1.6 : r}
          fill={i === 0 ? '#ffffff' : color} stroke={color} strokeWidth={1.5} />
      ))}
    </g>
  );
};

/** מרחק ה"הצמדה" לנקודה קיימת ביחידות התוכן - קבוע על המסך בכל זום. */
export const polySnapTol = (contentPerScreenPx: number) => POLY_SNAP_SCREEN_PX * contentPerScreenPx;

/**
 * טיוטת פוליגון - הדקירות, המצביע ואיך מסיימים. משותף למנוע של עמדת השדה
 * (`useMapDrawing`) ולמנוע של עמדת המפה, כדי שהכלי יתנהג זהה בשתיהן.
 *
 * הנקודות ביחידות שהמנוע בוחר (פיקסלי תוכן); `commit` מקבל אותן בסיום.
 * מקלדת (רק כשיש טיוטה): Enter מסיים, Backspace מוחק נקודה, Esc מבטל את
 * הטיוטה **בלבד** - בלי לסגור את מצב הציור (ה-listener ב-capture ועוצר).
 */
export function usePolyDraft(type: PolyTool | null, commit: (points: Pt[], type: PolyTool) => void) {
  const [points, setPoints] = React.useState<Pt[]>([]);
  const [cursor, setCursor] = React.useState<Pt | null>(null);
  const pointsRef = React.useRef(points);
  pointsRef.current = points;
  const commitRef = React.useRef(commit);
  commitRef.current = commit;

  const cancel = React.useCallback(() => { pointsRef.current = []; setPoints([]); setCursor(null); }, []);
  // החלפת כלי זורקת טיוטה פתוחה - אחרת הדקירה הבאה בכלי אחר "ממשיכה" אותה
  React.useEffect(cancel, [type, cancel]);

  const finish = React.useCallback(() => {
    const cur = pointsRef.current;
    if (type && cur.length >= POLY_MIN_POINTS[type]) commitRef.current(cur, type);
    cancel();
  }, [type, cancel]);

  const undo = React.useCallback(() => {
    pointsRef.current = pointsRef.current.slice(0, -1);
    setPoints(pointsRef.current);
    if (!pointsRef.current.length) setCursor(null);
  }, []);

  /** דקירה: מוסיפה נקודה, או מסיימת (על האחרונה / על הראשונה בסגור). `tol` ביחידות הנקודות. */
  const tap = (p: Pt, tol: number) => {
    if (!type) return;
    const action = polyTapAction(pointsRef.current, p, type, tol);
    if (action === 'add') { pointsRef.current = [...pointsRef.current, p]; setPoints(pointsRef.current); }
    else if (action === 'finish') finish();
  };

  const move = (p: Pt) => { if (pointsRef.current.length) setCursor(p); };

  const hasDraft = points.length > 0;
  React.useEffect(() => {
    if (!hasDraft) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Enter') finish();
      else if (e.key === 'Backspace') undo();
      else if (e.key === 'Escape') cancel();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [hasDraft, finish, undo, cancel]);

  return { points, cursor, tap, move, finish, undo, cancel };
}

// ─────────────────────────────────────────────────────────────────────────────
// מנוע הציור
// ─────────────────────────────────────────────────────────────────────────────

export type MapDrawingEngine = ReturnType<typeof useMapDrawing>;

/**
 * מנוע ציור לקנבס בודד שיושב על מפה.
 *
 * הקנבס מודד את עצמו מול ההורה שלו (`ResizeObserver`), והמשיכות נשמרות בשברים
 * ומצוירות מחדש בכל סיזור - כך הציור לא נמתח ולא "בורח" מהמפה.
 */
export function useMapDrawing() {
  const [active, setActive] = React.useState(false);
  const [tool, setTool] = React.useState<DrawTool>('pen');
  const [color, setColor] = React.useState(DRAW_PALETTE[0]);
  const [size, setSize] = React.useState(1.5);
  const [filled, setFilled] = React.useState(false);
  const [lineStyle, setLineStyle] = React.useState<LineStyle>('solid');
  const [shapes, setShapes] = React.useState<MapShape[]>([]);
  const [preview, setPreview] = React.useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [surface, setSurface] = React.useState({ w: 0, h: 0 });

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const strokesRef = React.useRef<PenStroke[]>([]);
  const currentRef = React.useRef<PenStroke | null>(null);
  const lastRef = React.useRef<{ x: number; y: number } | null>(null);
  const shapeStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const isDrawingRef = React.useRef(false);
  const seqRef = React.useRef(0);

  const isShapeTool = tool === 'circle' || tool === 'rect';
  const poly = usePolyDraft(isPolyTool(tool) ? tool : null, (pts, type) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const shape = polyShapeFromPoints(pts, canvas.width, canvas.height, {
      id: `g${++seqRef.current}`, type, color, filled, strokeWidth: size, lineStyle,
    });
    if (shape) setShapes(prev => [...prev, shape]);
  });

  // גודל ה-bitmap = הקופסה של **הקנבס עצמו**, נמדדת ב-clientWidth (פיקסלי
  // פריסה - כך הזום/פאן של המפה, שהוא CSS transform, לא מנפח אותה) ומוכפלת
  // ב-`--s` כדי שה-bitmap יהיה בפיקסלי **מסך**: פיקסל קנבס = פיקסל על הזכוכית.
  // בלי ההכפלה הדפדפן מותח את ה-bitmap פי --s והקו נראה עבה ומטושטש פי 1.65
  // בעמדת 24" (ראה `bitmapPx`). שכבת הצורות לעומת זאת נשארת בפיקסלי פריסה.
  //
  // ⚠ למה הקנבס ולא ההורה: הקנבס ושכבת הצורות שניהם `width:100%`, כלומר שניהם
  // נמדדים מול **בלוק ההכלה** - האב הממוקם הקרוב - ולא בהכרח מול ה-parentElement.
  // כשההורה הישיר הוא `position:static` השניים נפרדים, ה-bitmap נבנה בגודל אחד
  // בעוד ש-SVG הצורות מפרש את אותם מספרים בגודל אחר, והצורה נוחתת בקנה מידה
  // שגוי (עמדת שדה: 689 מול 1055 = הצורה קטנה ומוסטת ב-35%). מדידת הקנבס עצמו
  // היא היחידה שמובטח שתסכים עם שכבת הצורות, בכל מקום שבו הרכיב יורכב.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sync = () => {
      const w = Math.round(canvas.clientWidth), h = Math.round(canvas.clientHeight);
      if (!w || !h) return;
      if (syncCanvasBitmap(canvas, { width: w, height: h }, readRootScale())) {
        redrawStrokes(canvas, strokesRef.current); // מהשברים - אחרת הציור נמתח
      }
      setSurface(prev => (prev.w !== w || prev.h !== h ? { w, h } : prev));
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(canvas);
    if (canvas.parentElement) ro.observe(canvas.parentElement); // שינוי גודל שלא נוגע בקנבס עצמו
    return () => ro.disconnect();
  }, []);

  // Esc סוגר את מצב הציור - יציאה מהירה בלי לחפש את הכפתור
  React.useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActive(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  /** מצביע → פיקסלי קנבס. ה-rect סופג את זום/פאן המפה ואת סקייל המסך (--s). */
  const toCanvasPx = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active) return;
    e.stopPropagation();
    // בלי capture הציור נקטע כשהעט יוצא מהקנבס או עובר מעל iframe (סרגל הצצה).
    // בלי preventDefault - בעט/מגע הוא מבטל את אירועי העכבר התואמים.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const p = toCanvasPx(e);
    if (isPolyTool(tool)) {
      const rect = e.currentTarget.getBoundingClientRect();
      poly.tap(p, polySnapTol(rect.width ? e.currentTarget.width / rect.width : 1));
      return;
    }
    if (isShapeTool) {
      shapeStartRef.current = p;
      setPreview({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      return;
    }
    isDrawingRef.current = true;
    lastRef.current = p;
    currentRef.current = { id: `g${++seqRef.current}-${p.x | 0}-${p.y | 0}`, points: [p], color, size, eraser: tool === 'eraser' };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active) return;
    const p = toCanvasPx(e);
    if (isPolyTool(tool)) { e.stopPropagation(); poly.move(p); return; }
    if (shapeStartRef.current) {
      e.stopPropagation();
      setPreview(prev => (prev ? { ...prev, x2: p.x, y2: p.y } : prev));
      return;
    }
    if (!isDrawingRef.current || !lastRef.current) return;
    e.stopPropagation();
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    applyStrokeStyle(ctx, { color, size, eraser: tool === 'eraser' });
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    currentRef.current?.points.push(p);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active) return;
    e.stopPropagation();
    const canvas = e.currentTarget;
    if (shapeStartRef.current) {
      const end = toCanvasPx(e);
      const shape = shapeFromDrag(shapeStartRef.current, end, canvas.width, canvas.height, {
        id: `g${++seqRef.current}`, type: tool === 'rect' ? 'rect' : 'circle', color, filled, strokeWidth: size, lineStyle,
      });
      if (shape) setShapes(prev => [...prev, shape]);
      shapeStartRef.current = null;
      setPreview(null);
      return;
    }
    // שמירה בשברים - כך המשיכה נשארת מעוגנת למפה אחרי סיזור/זום
    const stroke = currentRef.current;
    if (stroke && stroke.points.length > 1) {
      stroke.points = stroke.points.map(p => pxToFrac(p, canvas));
      strokesRef.current = [...strokesRef.current, stroke];
    }
    currentRef.current = null;
    isDrawingRef.current = false;
    lastRef.current = null;
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    currentRef.current = null;
    isDrawingRef.current = false;
    lastRef.current = null;
    shapeStartRef.current = null;
    setPreview(null);
    e.stopPropagation();
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokesRef.current = [];
    setShapes([]);
    setPreview(null);
    poly.cancel();
  };

  return {
    active, setActive, tool, setTool, color, setColor, size, setSize, filled, setFilled,
    lineStyle, setLineStyle, shapes, preview, surface, canvasRef, clear, poly,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerLeave: onPointerUp, onPointerCancel },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// משטח הציור
// ─────────────────────────────────────────────────────────────────────────────

/**
 * קנבס הציור + שכבת הצורות. יושב **בתוך** שכבת התוכן של המפה (זו שמקבלת את
 * הזום/פאן), ולכן הציור זז ומתקרב עם המפה.
 *
 * ⚠ שכבת התוכן שמכילה אותו **חייבת** להיות קונטקסט ערימה סגור (transform או
 * `zIndex` + `isolation`). אחרת ה-`zIndex` של הקנבס דולף לקונטקסט של מכולת
 * המפה, הקנבס מכסה את סרגל הציור עצמו, ואי אפשר ללחוץ על כפתוריו.
 */
export const MapDrawSurface: React.FC<{ engine: MapDrawingEngine; zIndex?: number }> = ({ engine, zIndex = 200 }) => {
  const { active, tool, color, size, filled, lineStyle, shapes, preview, surface } = engine;
  const polyTool = isPolyTool(tool) ? tool : null;
  const hasShapes = shapes.length > 0 || (preview && (tool === 'circle' || tool === 'rect')) || (polyTool && engine.poly.points.length > 0);
  // נקודות הטיוטה בפיקסלי bitmap, ה-SVG בפיקסלי פריסה (ראה bitmapPx)
  const bmpW = engine.canvasRef.current?.width || surface.w || 1;
  return (
    <>
      <canvas
        ref={engine.canvasRef}
        data-draw-canvas=""
        {...engine.handlers}
        style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          pointerEvents: active ? 'auto' : 'none',
          cursor: active ? drawCursor(tool) : 'default',
          touchAction: 'none', zIndex,
        }}
      />
      {hasShapes && (
        <svg data-draw-shapes="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: zIndex + 1, overflow: 'visible' }}>
          {shapes.map(s => <MapShapeSvg key={s.id} shape={s} size={surface} />)}
          {polyTool && (
            <PolyDraftSvg type={polyTool} points={engine.poly.points} cursor={engine.poly.cursor}
              color={color} strokeWidth={size} filled={filled} lineStyle={lineStyle} scale={surface.w / bmpW} />
          )}
          {preview && (tool === 'circle' || tool === 'rect') && (() => {
            const x = Math.min(preview.x1, preview.x2), y = Math.min(preview.y1, preview.y2);
            const w = Math.abs(preview.x2 - preview.x1), h = Math.abs(preview.y2 - preview.y1);
            return tool === 'rect'
              ? <rect x={x} y={y} width={w} height={h} rx={2} fill={filled ? color + '33' : 'none'} stroke={color} strokeWidth={size} strokeDasharray="6 3" opacity={0.85} />
              : <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={filled ? color + '33' : 'none'} stroke={color} strokeWidth={size} strokeDasharray="6 3" opacity={0.85} />;
          })()}
        </svg>
      )}
    </>
  );
};

export default MapDrawToolbar;
