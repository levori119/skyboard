import React from 'react';
import { tr } from '../../i18n/tr';
import { useDragPosition } from '../../hooks/useDragPosition';
import { useToolbarScale } from '../../hooks/useToolbarScale';
import { tbPx } from '../../utils/scale';
import { frameColor, windowFrame } from '../../utils/windowFrame';
import {
  DEFAULT_CAMERA, ROT_STEP, TILT_STEP, ZOOM_FACTOR,
  clampTilt, clampZoom, normYaw, northArrow, type Camera3D,
} from '../../utils/pattern3d';
import { DOCKED_BAR_MAX_H, PATTERN3D_MODES, type Pattern3DMode, type SplitOrient } from './pattern3dPrefs';
import type { ThemeMode } from './Pattern3DScene';

// ─── פקדי ההקפה התלת מימדית ───────────────────────────────────────────────────
//
// **רכיב אחד, שני מיקומים** (`placement`), בדיוק כמו `AirPictureControls`:
//
//   floating - חלון צף נגרר, כמו עד היום. **צפייה ותפעול** ולכן מסגרת תורכיז
//              (CLAUDE.md §מסגרת חלון). הגרירה דרך `useDragPosition`, שכבר פותר
//              את חלוקת ה---s, את `setPointerCapture` ואת `touchAction`.
//   docked   - זרימה רגילה, בלי `position:fixed` ובלי מסגרת משלו: הסרגל יושב
//              **בתוך** חלון התלת מימד הצף או בתוך חלונית הפיצול, והמארח הוא
//              שנושא את המסגרת ואת הגרירה. סרגל `fixed` לא יכול לחיות בתוך חלון
//              ובוודאי לא לשרת שתי חלוניות - זה מה שחסם את שני המצבים החדשים.
//
// **כל פקד עובד בשני המיקומים.** ההבדל הוא כיוון הפריסה בלבד: עמודה בחלון הצף,
// סרגל אופקי במארח, שבו הרוחב הוא המשאב הזול והגובה הוא היקר.
//
// ── למה הסרגל המעוגן דחוס כל כך ─────────────────────────────────────────────
// הנקודה של חלון או של חלונית היא **הסצנה**. גרסה קודמת פרשה כאן את אותה עמודה
// לרוחב, והיא נשברה לשלוש שורות שבלעו שליש מחלון 430x330 - כששתיים מהן לא היו
// פקדים כלל. שלוש הכרעות מחזירות את הגובה לסצנה, **בלי למחוק שום יכולת**:
//
//   רמז הגרירה  - הוא הסבר, לא פקד. עובר ל-`title` על הסרגל, שם הוא עולה אפס.
//   חץ הצפון    - קריאון, ולכן מוקטן לגובה כפתור ויושב בשורה עם השאר.
//   תוויות קבוצה - "תצוגה" נשמט (שלושת השבבים מסבירים את עצמם ב-title); "הטיה"
//                 ו"כיוון" **נשארים**, כי בלעדיהם שני קריאונים במעלות נראים זהים.
//
// ועל הכול תקרת `DOCKED_BAR_MAX_H` - מיעוט מוצהר מהחלון המינימלי, כדי שאיש
// (כולל אני, בעוד חצי שנה) לא ינפח את הסרגל בחזרה על חשבון ההקפה.
//
// **המספרים מוצגים כטקסט** (TILT 55° / HDG 015°) ולא רק כמצב של סליידר: פקח
// אינו אומד זווית בעין, ובלי המספר אין לו דרך לתאר לעמית מה הוא רואה.

export type Pattern3DPlacement = 'floating' | 'docked';

/** ידית גרירה של המארח - `useDragPosition().handleProps` או ידנית. */
export interface DragHandleProps {
  onPointerDown: (e: React.PointerEvent) => void;
  style?: React.CSSProperties;
}

interface Props {
  camera: Camera3D;
  onChange: (c: Camera3D) => void;
  /** מרכוז - מחזיר גם את ההזזה לאפס, ולכן הוא של ההורה ולא של החלון. */
  onRecenter: () => void;
  onClose: () => void;
  themeMode?: ThemeMode;
  placement?: Pattern3DPlacement;
  /** מצב התצוגה הנוכחי - מלא / חלון צף / חלונית מפוצלת. */
  mode: Pattern3DMode;
  onModeChange: (m: Pattern3DMode) => void;
  /**
   * ידית הגרירה של המארח, במצב `docked` בלבד. במצב `floating` הסרגל **הוא**
   * החלון ולכן הוא גורר את עצמו.
   */
  dragHandle?: DragHandleProps;
  /** בחירת כיוון הפיצול - רק כשהסרגל יושב בחלונית פיצול. */
  split?: { orient: SplitOrient; onOrientChange: (o: SplitOrient) => void };
}

const pad3 = (n: number) => String(Math.round(n)).padStart(3, '0');

const MODE_LABEL: Record<Pattern3DMode, string> = {
  overlay: 'pattern3d.modeOverlay', window: 'pattern3d.modeWindow', split: 'pattern3d.modeSplit',
};
const MODE_HINT: Record<Pattern3DMode, string> = {
  overlay: 'pattern3d.modeOverlayHint', window: 'pattern3d.modeWindowHint', split: 'pattern3d.modeSplitHint',
};

export default function Pattern3DControls({
  camera, onChange, onRecenter, onClose, themeMode = 'dark',
  placement = 'floating', mode, onModeChange, dragHandle, split,
}: Props) {
  const docked = placement === 'docked';
  const winRef = React.useRef<HTMLDivElement | null>(null);
  const selfDrag = useDragPosition(winRef);
  const tb = useToolbarScale();

  // ocean היא תמה **כהה** - לא לגזור "כל מה שאינו light הוא dark" ולהפך.
  const light = themeMode === 'light';
  const C = light
    ? { panel: 'rgba(255,255,255,0.97)', border: '#cbd5e1', text: '#0f172a', dim: '#475569', btn: '#f1f5f9', btnText: '#1e293b' }
    : themeMode === 'ocean'
      ? { panel: 'rgba(5,64,78,0.97)', border: '#0e7490', text: '#cffafe', dim: '#7dd3fc', btn: '#083d4d', btnText: '#a5f3fc' }
      : { panel: 'rgba(15,23,42,0.97)', border: '#334155', text: '#e2e8f0', dim: '#94a3b8', btn: '#1e293b', btnText: '#e2e8f0' };
  /** צבע ההדגשה נגזר מקוד הצבע של החלונות - מקור אמת יחיד, מותאם לשלוש התמות. */
  const accent = frameColor('view', themeMode);

  const btn: React.CSSProperties = {
    width: tbPx(24, tb), height: tbPx(22, tb), padding: 0, lineHeight: 1,
    borderRadius: '4px', border: `1px solid ${C.border}`, background: C.btn, color: C.btnText,
    cursor: 'pointer', fontSize: tbPx(12, tb), display: 'flex', alignItems: 'center', justifyContent: 'center',
    touchAction: 'manipulation', boxSizing: 'border-box',
  };
  const wide: React.CSSProperties = {
    ...btn, width: 'auto', flex: 1, minWidth: tbPx(50, tb),
    padding: `0 ${tbPx(6, tb)}`, fontSize: tbPx(10, tb),
  };
  /** קבוצת פקדים. בעמודה היא שורה מלאה; בסרגל היא פריט שאינו נמעך. */
  const row: React.CSSProperties = docked
    ? { display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }
    : { display: 'flex', alignItems: 'center', gap: '4px' };
  const readout: React.CSSProperties = {
    fontFamily: 'monospace', fontSize: tbPx(11, tb), color: C.text,
    minWidth: tbPx(docked ? 42 : 52, tb), textAlign: 'center',
  };
  const groupLabel: React.CSSProperties = { fontSize: '10px', color: C.dim, minWidth: docked ? 0 : tbPx(30, tb) };

  const setTilt = (d: number) => onChange({ ...camera, tilt: clampTilt(camera.tilt + d) });
  const setYaw = (d: number) => onChange({ ...camera, yaw: normYaw(camera.yaw + d) });
  const setZoom = (m: number) => onChange({ ...camera, zoom: clampZoom(camera.zoom * m) });

  // חץ הצפון מצויר מהיטל הווקטור (0,-1,0): הוא מסתובב עם ה-yaw **וגם** מתקצר
  // עם ההטיה - ולכן הוא אומר בו-זמנית "לאן צפון" ו"כמה שטוח אני מסתכל".
  // קו ונקודה לא נקראו כחץ; ראש חץ ואות בקצה הופכים אותו לזיהוי במבט אחד.
  // במבט-על עם yaw=0 ההיטל מתנוון לאורך אפס - אז אין כיוון, ומוצגת האות בלבד.
  //
  // בסרגל המעוגן הוא **מוקטן לגובה כפתור** ויושב בשורה עם שאר הפקדים: כל
  // הגאומטריה נגזרת מ-`R`, ולכן זהו שינוי גודל ולא ציור שני. הוא נשאר קריא -
  // הכיוון והאורך היחסי הם המידע, לא הקוטר.
  const n = northArrow(camera);
  const R = docked ? 6 : 14;
  /** שוליים סביב העיגול, כדי שאות הצפון לא תיחתך. */
  const NPAD = docked ? 7 : 11;
  const NGAP = docked ? 4 : 7;
  const nSize = 2 * (R + NPAD);
  const mag = Math.hypot(n.x, n.y);
  const nd = mag > 1e-3 ? { x: n.x / mag, y: n.y / mag } : null;
  const tip = { x: n.x * R, y: n.y * R };
  const HL = R * 0.36, HW = R * 0.23;
  const head = nd
    ? [
      `${tip.x},${tip.y}`,
      `${tip.x - nd.x * HL - nd.y * HW},${tip.y - nd.y * HL + nd.x * HW}`,
      `${tip.x - nd.x * HL + nd.y * HW},${tip.y - nd.y * HL - nd.x * HW}`,
    ].join(' ')
    : null;
  const letterAt = nd ? { x: nd.x * (R + NGAP), y: nd.y * (R + NGAP) } : { x: 0, y: -(R + NGAP) };

  // ידית הגרירה: במצב צף הסרגל גורר את עצמו, במצב מעוגן הוא גורר את המארח.
  // בלי מארח שנגרר (חלונית פיצול) אין ידית כלל - ולא ידית מתה שאינה עושה דבר.
  const handle = docked ? dragHandle : selfDrag.handleProps;

  /** כפתור מצב/כיוון - **מסומן גם במסגרת ובעובי**, לא בצבע בלבד (FAA HF-STD-001). */
  const chip = (active: boolean): React.CSSProperties => ({
    ...btn, width: 'auto', padding: `0 ${tbPx(6, tb)}`, fontSize: tbPx(10, tb),
    border: `1px solid ${active ? accent : C.border}`,
    background: active ? `${accent}33` : C.btn,
    color: active ? C.text : C.dim,
    fontWeight: active ? 'bold' : 'normal',
  });

  return (
    <div
      ref={winRef}
      data-testid="pattern-3d-controls"
      data-placement={placement}
      data-nopan
      /* הרמז הוא הסבר ולא פקד: בסרגל המעוגן הוא חי כאן, בעלות אפס בגובה */
      title={docked ? tr('pattern3d.dragHint') : undefined}
      onPointerDown={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
      style={docked
        ? {
          // זרימה רגילה בתוך המארח - **בלי** position:fixed ובלי מסגרת משלו.
          position: 'relative', width: '100%', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
          gap: '3px 8px', padding: '3px 8px',
          background: C.panel, color: C.text, borderBottom: `1px solid ${C.border}`,
          userSelect: 'none', flexShrink: 0,
          // התקרה שמחזירה את הגובה לסצנה. `auto` ולא `hidden`: פקד שלא נראה
          // עדיין נגיש בגלילה, ולעולם לא נמחק (pattern3dPrefs §DOCKED_BAR_MAX_H).
          maxHeight: DOCKED_BAR_MAX_H, overflowY: 'auto',
        }
        : {
          position: 'fixed', zIndex: 420,
          ...(selfDrag.dragged ? { left: selfDrag.pos!.x, top: selfDrag.pos!.y } : { insetInlineEnd: 14, bottom: 96 }),
          background: C.panel, color: C.text,
          // חלון **צפייה ותפעול** - מסגרת תורכיז, מקור אמת יחיד
          ...windowFrame('view', themeMode, 10),
          padding: '7px 9px 8px', display: 'flex', flexDirection: 'column', gap: '5px',
          minWidth: 168, boxShadow: '0 6px 20px rgba(0,0,0,0.45)', userSelect: 'none',
        }}
    >
      <div style={{ ...row, ...(docked ? {} : { marginBottom: '1px' }) }}>
        {handle && (
          <span {...handle} data-drag-handle=""
            title={docked ? tr('pattern3d.dragWindow') : tr('ctrl.dragToolbar')}
            style={{ ...handle.style, color: C.dim, cursor: 'grab', fontSize: '12px', lineHeight: 1 }}>⠿</span>
        )}
        {/* בסרגל הצר השם הקצר - אותה זהות, שליש מהרוחב. ה-title המלא נשאר
            זמין ב-tooltip של הסרגל. */}
        <b title={tr('pattern3d.title')}
          style={{ flex: docked ? undefined : 1, fontSize: '11px', whiteSpace: 'nowrap' }}>
          {docked ? tr('pattern3d.toggle') : tr('pattern3d.title')}
        </b>
        {!docked && (
          <button data-testid="close" onClick={onClose} title={tr('pattern3d.close')}
            style={{ ...btn, width: tbPx(20, tb), height: tbPx(18, tb), background: 'none', border: 'none', color: C.dim }}>✕</button>
        )}
      </div>

      <div style={row}>
        <span style={groupLabel}>{tr('pattern3d.tilt')}</span>
        <button data-testid="tilt-down" onClick={() => setTilt(-TILT_STEP)} title={tr('pattern3d.tiltDown')} style={btn}>▼</button>
        <span data-testid="tilt-value" style={readout}>{pad3(camera.tilt)}°</span>
        <button data-testid="tilt-up" onClick={() => setTilt(TILT_STEP)} title={tr('pattern3d.tiltUp')} style={btn}>▲</button>
      </div>

      <div style={row}>
        <span style={groupLabel}>{tr('pattern3d.heading')}</span>
        <button data-testid="rot-left" onClick={() => setYaw(-ROT_STEP)} title={tr('pattern3d.rotLeft')} style={btn}>◀</button>
        <span data-testid="yaw-value" style={readout}>{pad3(camera.yaw)}°</span>
        <button data-testid="rot-right" onClick={() => setYaw(ROT_STEP)} title={tr('pattern3d.rotRight')} style={btn}>▶</button>
      </div>

      <div style={row}>
        <button data-testid="zoom-out" onClick={() => setZoom(1 / ZOOM_FACTOR)} title={tr('pattern3d.zoomOut')} style={btn}>−</button>
        <button data-testid="recenter" onClick={onRecenter} title={tr('pattern3d.recenterHint')} style={wide}>
          {tr('pattern3d.recenter')}
        </button>
        <button data-testid="zoom-in" onClick={() => setZoom(ZOOM_FACTOR)} title={tr('pattern3d.zoomIn')} style={btn}>+</button>
      </div>

      {/* בחירת מצב התצוגה - **אותה בחירה בשני המיקומים**. הפקח שפתח תלת מימד
          מלא ורוצה אותו כחלון לצד המפה עושה זאת מכאן, ולא מתפריט אחר. */}
      <div style={{ ...row, gap: '3px' }} data-testid="p3d-mode-picker">
        {/* בסרגל הצר התווית נשמטת - שלושת השבבים מסבירים את עצמם ב-title,
            בניגוד לשני קריאוני המעלות שבלי תווית נראים זהים. */}
        {!docked && <span style={groupLabel}>{tr('pattern3d.mode')}</span>}
        {PATTERN3D_MODES.map(m => (
          <button key={m} data-testid={`p3d-mode-${m}`} data-active={mode === m ? '1' : '0'}
            aria-pressed={mode === m} onClick={() => onModeChange(m)} title={tr(MODE_HINT[m])}
            style={chip(mode === m)}>
            {tr(MODE_LABEL[m])}
          </button>
        ))}
      </div>

      {/* כיוון הפיצול - רק בחלונית פיצול, כי רק שם יש מה לכוון */}
      {split && (
        <div style={{ ...row, gap: '3px' }} data-testid="p3d-split-orient">
          {([['h', '◫', 'pattern3d.splitOrientH'], ['v', '⊟', 'pattern3d.splitOrientV']] as const).map(([o, icon, key]) => (
            <button key={o} data-testid={`p3d-split-${o}`} data-active={split.orient === o ? '1' : '0'}
              aria-pressed={split.orient === o} aria-label={tr(key)}
              onClick={() => split.onOrientChange(o)} title={tr(key)}
              style={chip(split.orient === o)}>
              {icon}
            </button>
          ))}
        </div>
      )}

      <div style={{ ...row, justifyContent: docked ? undefined : 'space-between', gap: '6px' }}>
        <svg data-testid="north-arrow" width={nSize} height={nSize}
          viewBox={`${-R - NPAD} ${-R - NPAD} ${nSize} ${nSize}`} aria-label={tr('pattern3d.north')}
          style={{ flexShrink: 0, display: 'block' }}>
          <title>{tr('pattern3d.north')}</title>
          <circle cx={0} cy={0} r={R} fill="none" stroke={C.border} strokeWidth={R / 14} />
          {nd && (
            <>
              <line x1={0} y1={0} x2={tip.x} y2={tip.y} stroke={C.text} strokeWidth={R / 7} strokeLinecap="round" />
              <polygon data-testid="north-arrow-head" points={head!} fill={C.text} />
            </>
          )}
          <circle cx={0} cy={0} r={R * 0.13} fill="none" stroke={C.text} strokeWidth={R / 11.7} />
          <text x={letterAt.x} y={letterAt.y} textAnchor="middle" dominantBaseline="central"
            fill={C.text} fontSize={R * 0.72} fontWeight="bold">{tr('pattern3d.northLetter')}</text>
        </svg>
        {/* הרמז הוא הסבר ולא פקד. בעמודה יש לו מקום ולכן הוא נקרא במלואו;
            בסרגל המעוגן הוא חי ב-`title` של הסרגל, בעלות אפס בגובה. */}
        {!docked && (
          <span style={{ flex: 1, fontSize: '9px', color: C.dim, lineHeight: 1.35, textAlign: 'start' }}>
            {tr('pattern3d.dragHint')}
          </span>
        )}
      </div>

      {/* במצב מעוגן ה-✕ נדחף לקצה הסרגל - שם העין מחפשת סגירה של חלון */}
      {docked && (
        <button data-testid="close" onClick={onClose} title={tr('pattern3d.close')}
          style={{ ...btn, width: tbPx(20, tb), height: tbPx(18, tb), background: 'none', border: 'none', color: C.dim, marginInlineStart: 'auto' }}>✕</button>
      )}
    </div>
  );
}

/** מצלמת ההתחלה + הזזה מאופסת - "מרכוז" חוזר בדיוק לכאן. */
export const RECENTER: { camera: Camera3D; pan: { x: number; y: number } } = {
  camera: DEFAULT_CAMERA, pan: { x: 0, y: 0 },
};
