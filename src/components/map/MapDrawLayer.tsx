import React from 'react';
import { tr } from '../../i18n/tr';
import { TOOL_BTN, TOOL_GAP, toolBtn } from '../../utils/toolbarStandard';
import { useDragPosition } from '../../hooks/useDragPosition';
import { windowFrame } from '../../utils/windowFrame';
import { readRootScale } from '../../utils/pointerDrag';
import {
  DRAW_PALETTE, LINE_STYLES, POLY_MIN_POINTS, POLY_SNAP_SCREEN_PX, applyStrokeStyle, crossMarks, crossSize, crossSpacing,
  dashArray, eraseShapesAt, eraserRadius, isPolyTool, outlinePoints, polyPointsToPx, polyShapeFromPoints,
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

/**
 * אייקון לכל כלי - **SVG** ולא תו יוניקוד: תווים כמו מחומש או קו שבור חסרים
 * בגופני Windows ונופלים לריבוע. השם המלא של הכלי ב-title (סטנדרט הסרגלים).
 */
const ToolIcon: React.FC<{ tool: DrawTool }> = ({ tool }) => {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
      {tool === 'pen' && <><path {...p} d="M4 20l1-5L16 4l4 4L9 19z" /><path {...p} d="M13.5 6.5l4 4" /></>}
      {tool === 'eraser' && <><path {...p} d="M20 20H8l-4-4 10-10 7 7-6 7" /><path {...p} d="M7.5 11.5l5 5" /></>}
      {tool === 'circle' && <circle {...p} cx={12} cy={12} r={8} />}
      {tool === 'rect' && <rect {...p} x={4} y={6} width={16} height={12} rx={1} />}
      {tool === 'polygon' && <path {...p} d="M12 3l8.5 6.2-3.2 10H6.7L3.5 9.2z" />}
      {tool === 'polyline' && <path {...p} d="M3 18l5-9 5 6 4-9 4 5" />}
      {tool === 'recognize' && <text x={12} y={17} textAnchor="middle" fontSize={13} fontWeight="bold" fill="currentColor">Aa</text>}
    </svg>
  );
};

/** תווית שורה ("צבע:") כ-title - בלי הנקודתיים שבסוף. */
const asHint = (label: string) => label.replace(/[:：]\s*$/, '');

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
  // גרירה בעט ובאצבע דרך ה-hook המשותף - הוא כבר פותר את חלוקת ה---s, את
  // setPointerCapture ואת touchAction. מימוש ידני כאן היה חוזר על שלוש
  // המלכודות (CLAUDE.md §גרירה).
  const winRef = React.useRef<HTMLDivElement | null>(null);
  const drag = useDragPosition(winRef);
  /** כפתור סרגל - סטנדרט 40x40 (`utils/toolbarStandard`) בצבעי סרגל הציור. */
  const chip = (active: boolean): React.CSSProperties => ({
    ...toolBtn(themeMode, { active }),
    border: `1px solid ${active ? C.onBorder : C.offBorder}`,
    boxShadow: active ? `inset 0 0 0 1px ${C.onBorder}` : undefined,
    background: active ? C.on : C.off,
    color: active ? C.onText : C.offText,
  });
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: TOOL_GAP, flexWrap: 'wrap' };

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
        padding: '6px 8px', display: 'flex', flexDirection: 'column',
        gap: '6px', maxWidth: TOOL_BTN * 6 + TOOL_GAP * 5 + 20, boxShadow: '0 4px 20px rgba(0,0,0,0.6)', cursor: 'default',
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
      <div style={row}>
        {tools.map(t => (
          <button key={t} data-draw-tool={t} aria-pressed={tool === t} onClick={() => onToolChange(t)}
            title={tr(TOOL_LABELS[t])} aria-label={tr(TOOL_LABELS[t])} style={chip(tool === t)}>
            <ToolIcon tool={t} />
          </button>
        ))}
        {toolsExtra}
      </div>

      {/* צבע */}
      <div style={{ ...row, gap: '6px' }} title={asHint(tr('shared.color2'))}>
        {DRAW_PALETTE.map(c => (
          <button key={c} onClick={() => onColorChange(c)} title={c} aria-label={c}
            style={{ width: 26, height: 26, padding: 0, borderRadius: '50%', background: c, border: color === c ? `2px solid ${C.accent}` : `1px solid ${C.offBorder}`, cursor: 'pointer', flexShrink: 0 }} />
        ))}
        <input type="color" value={color} onChange={e => onColorChange(e.target.value)} title={tr('map.drawCustomColor')}
          style={{ width: 30, height: 30, padding: 0, border: 'none', borderRadius: '3px', cursor: 'pointer', background: 'transparent' }} />
      </div>

      {/* עובי */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title={asHint(tr('ctrl.thickness'))}>
        <input type="range" min={1} max={20} value={size} onChange={e => onSizeChange(parseInt(e.target.value))}
          style={{ flex: 1, accentColor: C.accent, height: 20 }} />
        <span style={{ fontSize: '14px', fontWeight: 'bold', color: C.value, width: 24, textAlign: 'center' }}>{size}</span>
      </div>

      {/* סגנון הקו - רק לצורות. העט הוא כתב יד, ושם קו מקווקו רק מקשה על הקריאה.
          הכפתור מראה את הסגנון עצמו ולא שם שלו - מזוהה במבט אחד, ובלי תרגום. */}
      {SHAPE_TOOLS.includes(tool) && (
        <div style={row} title={asHint(tr('map.drawLineStyle'))}>
          {LINE_STYLES.map(s => (
            <button key={s} data-line-style={s} aria-pressed={lineStyle === s}
              onClick={() => onLineStyleChange?.(s)} title={tr(LINE_STYLE_LABELS[s])} aria-label={tr(LINE_STYLE_LABELS[s])}
              style={chip(lineStyle === s)}>
              <LineStylePreview style={s} color={lineStyle === s ? C.onText : C.offText} width={30} />
            </button>
          ))}
        </div>
      )}

      {/* מילוי - רק לצורות שהן שטח (פוליגון פתוח הוא קו, לא שטח) */}
      {(tool === 'circle' || tool === 'rect' || tool === 'polygon') && (
        <div style={row}>
          <button data-fill-toggle="" aria-pressed={filled} onClick={() => onFilledChange(!filled)}
            title={`${asHint(tr('ctrl.fill'))} ${filled ? tr('map.drawFilled') : tr('map.drawOutline')}`}
            style={chip(filled)}>
            {filled ? '■' : '□'}
          </button>
        </div>
      )}

      {/* פוליגון: איך מסיימים + סיום / נקודה אחורה. בעט ובאצבע אין דאבל-קליק
          אמין ואין מקלדת בהישג יד, ולכן כפתורים ולא רק Enter/Backspace. */}
      {isPolyTool(tool) && (
        // ההסבר "איך מסיימים" הוא HINT - ב-title של השורה, לא טקסט מוצג
        <div data-poly-hint="" title={tr(tool === 'polygon' ? 'map.drawPolyHintClosed' : 'map.drawPolyHintOpen')}
          style={{ ...row, borderTop: `1px solid ${C.sep}`, paddingTop: '6px', minHeight: TOOL_BTN }}>
          {polyDraft && polyDraft.count > 0 && (
            <>
              <button onClick={polyDraft.onFinish} disabled={polyDraft.count < POLY_MIN_POINTS[tool]}
                title={tr('map.drawPolyFinish', { count: polyDraft.count })}
                style={{ ...chip(true), opacity: polyDraft.count < POLY_MIN_POINTS[tool] ? 0.5 : 1 }}>
                ✓
              </button>
              <button onClick={polyDraft.onUndo} title={tr('map.drawPolyUndo')} style={chip(false)}>
                ↶
              </button>
            </>
          )}
        </div>
      )}

      {children}

      {/* נקה / סגור */}
      <div style={{ ...row, marginTop: '2px' }}>
        <button data-draw-action="clear" onClick={onClear} title={tr('shared.clear3')} aria-label={tr('shared.clear3')}
          style={{ ...chip(false), flex: 1, background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b' }}>
          🗑
        </button>
        <button data-draw-action="close" onClick={onClose} title={tr('shared.close2')} aria-label={tr('shared.close2')}
          style={{ ...chip(false), flex: 1 }}>
          ✕
        </button>
      </div>
    </div>
  );
};

/**
 * כפתור ההדלקה/כיבוי של מצב הציור - אותו כפתור ✏ בשתי העמדות.
 *
 * סטנדרט הסרגלים: 40x40 כמו כפתורי סרגל המפה, **אייקון בלבד** וההסבר ב-title.
 * `labeled` נשאר לתאימות קריאות קיימות ואינו מוסיף כיתוב - ריבוע 40 נמצא בעין
 * גם בפאנל השכבות של עמדת השדה, שבגללו נולד הכיתוב כשהכפתור היה 20px.
 */
export const MapDrawToggle: React.FC<{
  active: boolean;
  onToggle: () => void;
  themeMode?: ThemeMode;
  /** @deprecated - אין כיתוב בסטנדרט הסרגלים. */
  labeled?: boolean;
  style?: React.CSSProperties;
}> = ({ active, onToggle, themeMode = 'dark', style }) => {
  const C = toolbarColors(themeMode);
  return (
    <button onClick={onToggle} data-nopan aria-pressed={active}
      onPointerDown={e => e.stopPropagation()}
      title={active ? tr('map.drawDisable') : tr('map.drawEnable')}
      style={{
        ...toolBtn(themeMode, { active }),
        background: active ? '#7c3aed' : C.off,
        color: active ? '#ffffff' : C.offText, border: `1px solid ${active ? C.onBorder : C.offBorder}`,
        ...style,
      }}>
      ✏
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

/**
 * סמן המחק על המפה - טבעת ב**גודל האמיתי** של המחק: מה שבתוכה נמחק, ומה שמחוצה
 * לה לא. הרדיוס מגיע מאותו חישוב שמוחק בפועל (`eraserRadius`), ולכן העלאת העובי
 * בסרגל מגדילה את הטבעת ואת המחיקה יחד.
 *
 * שתי טבעות (כהה מתחת, בהירה מעל) כדי שתיראה גם על מפה בהירה וגם על כהה.
 */
export const EraserCursorSvg: React.FC<{ x: number; y: number; r: number }> = ({ x, y, r }) => (
  <g data-eraser-cursor="" pointerEvents="none">
    <circle cx={x} cy={y} r={r} fill="none" stroke="rgba(0,0,0,0.75)" strokeWidth={3} />
    <circle cx={x} cy={y} r={r} fill="rgba(255,255,255,0.10)" stroke="#ffffff" strokeWidth={1.2} />
  </g>
);

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
  /** מיקום המחק על הקנבס (פיקסלי bitmap), לציור הטבעת בגודלו האמיתי. */
  const [eraserAt, setEraserAt] = React.useState<{ x: number; y: number } | null>(null);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const strokesRef = React.useRef<PenStroke[]>([]);
  const currentRef = React.useRef<PenStroke | null>(null);
  const lastRef = React.useRef<{ x: number; y: number } | null>(null);
  const shapeStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const isDrawingRef = React.useRef(false);
  const seqRef = React.useRef(0);

  const isShapeTool = tool === 'circle' || tool === 'rect';

  /**
   * המחק על צורה מוחק אותה **כולה** - צורה היא אובייקט ולא פיקסלים, ומחיקה
   * חלקית שלה לא קיימת. הנקודה מגיעה בפיקסלי bitmap ומומרת לפיקסלי המשטח,
   * שבהם חיות הצורות (ראה `bitmapPx`).
   */
  const eraseShapeUnder = (p: { x: number; y: number }, canvas: HTMLCanvasElement) => {
    const scale = canvas.width ? surface.w / canvas.width : 1;
    const tol = eraserRadius(size) * scale;
    setShapes(prev => eraseShapesAt(prev, { x: p.x * scale, y: p.y * scale }, surface, tol).shapes);
  };

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
    if (tool === 'eraser') { setEraserAt(p); eraseShapeUnder(p, e.currentTarget); }
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
    // הטבעת עוקבת גם בריחוף (בלי לחיצה) - כך רואים מה יימחק *לפני* שמוחקים
    if (tool === 'eraser') { setEraserAt(p); if (isDrawingRef.current) eraseShapeUnder(p, e.currentTarget); }
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
    setEraserAt(null);
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
    lineStyle, setLineStyle, shapes, preview, surface, canvasRef, clear, poly, eraserAt, setEraserAt,
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
  // נקודות הטיוטה והמחק בפיקסלי bitmap, ה-SVG בפיקסלי פריסה (ראה bitmapPx)
  const bmpW = engine.canvasRef.current?.width || surface.w || 1;
  const scale = surface.w / bmpW;
  const eraserAt = tool === 'eraser' && active ? engine.eraserAt : null;
  const hasShapes = shapes.length > 0 || (preview && (tool === 'circle' || tool === 'rect')) || (polyTool && engine.poly.points.length > 0) || !!eraserAt;
  return (
    <>
      <canvas
        ref={engine.canvasRef}
        data-draw-canvas=""
        {...engine.handlers}
        onPointerLeave={e => { engine.setEraserAt(null); engine.handlers.onPointerLeave(e); }}
        style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          pointerEvents: active ? 'auto' : 'none',
          // הטבעת **היא** הסמן במחק - סמן נוסף היה מציג שני גדלים סותרים
          cursor: !active ? 'default' : (tool === 'eraser' && engine.eraserAt ? 'none' : drawCursor(tool)),
          touchAction: 'none', zIndex,
        }}
      />
      {hasShapes && (
        <svg data-draw-shapes="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: zIndex + 1, overflow: 'visible' }}>
          {shapes.map(s => <MapShapeSvg key={s.id} shape={s} size={surface} />)}
          {polyTool && (
            <PolyDraftSvg type={polyTool} points={engine.poly.points} cursor={engine.poly.cursor}
              color={color} strokeWidth={size} filled={filled} lineStyle={lineStyle} scale={scale} />
          )}
          {eraserAt && (
            <EraserCursorSvg x={eraserAt.x * scale} y={eraserAt.y * scale} r={eraserRadius(size) * scale} />
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
