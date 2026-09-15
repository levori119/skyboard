import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../../i18n/tr';
import { bidiAuto } from '../../utils/bidi';
import { getFormationDisplayName } from '../../utils/strips';
import { customConfirm } from '../shared/ConfirmModal';
import { FaultBadge } from '../shared/FaultBadge';
import { aircraftKey } from '../../airPicture/patternTrack';
import {
  acceptAltitudeLimit, altitudeGroups, distributeAltitudes, occupiedBlocks, toggleAcceptAltitude,
  altToDisplay, altMismatch, buildBlocks, conflictBlocks, displayToAlt, formationAircraft, formationsInBlocks,
  normalizeLeg, greensAlert, FLIGHT_LEGS, DEFAULT_LEG, dropIndices, stripAircraftAlts, isFormationOpen,
  type JoiningPoint, type JoiningPointStripRow, type JoiningAircraftRow, type FormationAircraftRow,
} from '../../utils/joiningPoints';

// ─── טבלת נקודת ההצטרפות ──────────────────────────────────────────────────────
//
// זו התצוגה שמבדילה את נקודת ההצטרפות מנקודת ההעברה. פריסת הטבלה לקוחה מהסדק
// הפיזי: **עמודת הגבהים בצד ההתחלה** (ימין בעברית) והפ"ממים לצדה, מהגבוה
// למטה. השורה העליונה היא מה שמגיע מנקודת המעבר המקושרת ועוד לא שובץ לגובה.
//
// שלוש דרכים לשבץ פ"מ לבלוק, כי כל אחת מהירה במצב אחר:
//   1. "קבל" בשורה העליונה -> טופס גובה מטווח הנקודה (כשהגובה מתואם בדיבור)
//   2. גרירת הכרטיס מהשורה העליונה ישירות לבלוק (קבלה + גובה בתנועה אחת)
//   3. גרירת פ"מ שכבר שלי מרשימת הפ"ממים שבצד (שינוי גובה או הכנסה לנקודה)
//
// גרירה **בתוך** הטבלה מיידית, בלי טופס:
//   - גרירת שורת הפ"מ     -> כל המבנה עובר לבלוק
//   - גרירת מטוס (פרוס)   -> רק המטוס עובר (מבנה של מטוס אחד עובר כולו)
// הטופס נשאר בתפריט ⋯, שבו בוחרים כמה מטוסים בבת אחת.

export interface JoiningPointView extends JoiningPoint {
  sector_id?: number | null;
  sector_name?: string | null;
  sub_label?: string | null;
  color?: string | null;
  x_pct?: number | null;
  y_pct?: number | null;
  display_mode?: string;
  is_override?: boolean;
  /** הגדרת הנקודה: מטוסי הפ"ממים פרוסים כברירת מחדל. */
  expand_aircraft?: boolean;
}

/** קצה מסלול פעיל לנחיתות, מ-`runway_end_use`. */
export interface LandingRunway { ident: string; pattern_id?: number | null }

interface Props {
  point: JoiningPointView;
  themeMode?: 'light' | 'dark' | 'ocean';
  /** העברות שממתינות לי דרך נקודת המעבר המקושרת - השורה העליונה. */
  incoming: any[];
  /** הפ"ממים שכבר משובצים בנקודה, עם `alt` מ-`strips.alt`. */
  assigned: (JoiningPointStripRow & Record<string, any>)[];
  /** מצב המטוסים הבודדים (מסלול / הקפה). */
  aircraft: JoiningAircraftRow[];
  /** `strip_aircraft` לפי מזהה פ"מ - משם מגיע הדת"ק. */
  stripAircraftData?: Record<string, FormationAircraftRow[]>;
  landingRunways: LandingRunway[];
  /**
   * קבלה מהשורה העליונה. `altFt` הוא גובה הפ"מ (גובה המוביל). `groups` נשלח רק
   * כשהמבנה פוצל בטופס לכמה גבהים - קבוצת המוביל ראשונה, והשאר גובה חריג.
   */
  onAcceptIncoming: (transferId: string, altFt: number, groups?: { ft: number; indices: number[] }[]) => void;
  onAssign: (stripId: string, altFt: number) => void;
  onRemoveStrip: (stripId: string) => void;
  onCoordinate: (stripId: string, coordinated: boolean, note: string) => void;
  onUpdateAircraft: (stripId: string, idx: number, patch: { runway_ident?: string; in_pattern?: boolean; pattern_id?: number | null }) => void;
  /** העברת פ״מ - או חלק ממטוסיו - לבלוק גובה. `indices` ריק = כל המבנה. */
  onSplit?: (stripId: string, indices: number[], altFt: number) => void;
  onFlightStatus: (stripId: string, idx: number, status: string) => void;
  /** דיווח הירוקים - דגל עצמאי, ולכן endpoint משלו ולא ערך בסטטוס. */
  onGreens?: (stripId: string, idx: number, greens: boolean) => void;
  onCollapse: () => void;
  onResetPosition?: () => void;
  /** ידית הגרירה של הפאנל (הכותרת). מנוהלת בחוץ, כי המיקום שייך למפה. */
  onHeaderPointerDown?: (e: React.PointerEvent) => void;
  /**
   * שחרור מטוס שנגרר מהטבלה אל המפה. ההורה עושה את פגיעת ההקפה, כי רק הוא
   * מכיר את גבולות תמונת המפה. **Pointer Events ולא HTML5 drag**: עמדת היעד
   * היא Cintiq בעט ובאצבע, שבהם `draggable` פשוט לא עובד (CLAUDE.md §גרירה).
   */
  onAircraftDropOnMap?: (stripId: string, idx: number, clientX: number, clientY: number) => void;
  /**
   * הסרת שורת מטוס מהפ"מ בנקודה - נקראת אחרי ש"נחת" סיים להבהב.
   * פ"מ שנשאר בלי מטוסים יורד מהנקודה כולה (נאכף בשרת).
   */
  onRemoveAircraft?: (stripId: string, idx: number) => void;
  /** פ״מ ששוחרר על **הסמן** וממתין לבחירת גובה בטופס.
   *  נושא את שורת הפ״מ עצמה, כי פ״מ שעדיין אינו בנקודה אינו נמצא ב-`assigned`,
   *  ובלעדיה מספר המטוסים במבנה אינו ידוע והטופס נפתח ריק. */
  pendingMove?: { stripId: string; strip: Record<string, any> } | null;
  onPendingMoveHandled?: () => void;
  /**
   * מעקב הקפה אוטומטי: `aircraftKey` של מטוסים שהרכיב האווירי שלהם עד 3 מייל
   * מהנקודה - השורה מהבהבת בירוק (PATTERN_AUTOTRACK_SPEC §5).
   */
  approachingKeys?: Set<string>;
}

/** תוויות הצלעות, לפי סדר הטיסה. */
const LEG_LABELS: Record<string, string> = {
  downwind: 'joining.statusDownwind',
  base: 'joining.statusBase',
  final: 'joining.statusFinal',
  landed: 'joining.statusLanded',
};
const FLIGHT_ACTIVE_BG = '#1d4ed8';
/** נחת מהבהב באדום לפני שהשורה יורדת - כדי שהפעולה תיראה ולא תקרה בשקט. */
const LANDED_BLINK_MS = 5000;
/** מתחת לתזוזה הזו זו נגיעה ולא גרירה - שלא כל הקשה בעט תזיז מטוס. */
const DRAG_THRESHOLD_PX = 6;
/** רצועת הקצה של טבלת הבלוקים שבה גרירה גוללת אותה. */
const AUTO_SCROLL_EDGE_PX = 28;

export default function JoiningPointPanel({
  point, themeMode = 'dark', incoming, assigned, aircraft, stripAircraftData = {},
  landingRunways, onAcceptIncoming, onAssign, onRemoveStrip, onCoordinate,
  onUpdateAircraft, onFlightStatus, onGreens, onCollapse, onResetPosition,
  onHeaderPointerDown, onAircraftDropOnMap, onSplit, onRemoveAircraft,
  pendingMove, onPendingMoveHandled, approachingKeys,
}: Props) {
  /** המטוס (או מטוס כלשהו מהחלק שהשורה מציגה) מתקרב - הרכיב האווירי שלו עד 3 מייל. */
  const approaching = (sid: string, idxs: number[]) =>
    !!approachingKeys?.size && idxs.some(i => approachingKeys.has(aircraftKey(sid, i)));
  const APPROACH_BLINK = 'skyking-approach-blink 0.6s steps(1) infinite';
  /** פ"ממים שהפקח **שינה** את מצב הפריסה שלהם מברירת המחדל של הנקודה. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragBlock, setDragBlock] = useState<number | null>(null);
  /**
   * טופס הקבלה: אילו גבהים, ואיזה מספר במבנה לאיזה גובה.
   * `selected` - הגבהים שנבחרו (עד `limit` = מספר המטוסים); `mapping` - מטוס -> גובה.
   */
  const [acceptForm, setAcceptForm] = useState<{
    transferId: string; sid: string; label: string; indices: number[]; limit: number;
    selected: number[]; mapping: Record<number, number>;
  } | null>(null);
  const [coordFor, setCoordFor] = useState<{ stripId: string; label: string } | null>(null);
  const [coordNote, setCoordNote] = useState('');
  /** המטוס שמהבהב כרגע אחרי "נחת", עד שהשורה יורדת. */
  const [landingIdx, setLandingIdx] = useState<{ sid: string; idx: number } | null>(null);
  /**
   * מה נגרר כרגע (לצל הגרירה ולעמעום המקור). **המיקום אינו ב-state**: עדכון
   * state בכל pointermove רינדר את כל הטבלה פעמים בשנייה, וזה מה שהפך את
   * הגרירה לקופצנית. הצל זז ישירות ב-DOM דרך ה-ref.
   */
  const [drag, setDrag] = useState<{ key: string; label: string } | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const ghostPos = useRef({ x: 0, y: 0 });
  const blocksScrollRef = useRef<HTMLDivElement | null>(null);
  /** טופס ההעברה לבלוק: כל המבנה או מטוסים נבחרים. */
  const [moveForm, setMoveForm] = useState<{ sid: string; label: string; all: number[]; picked: Set<number>; targetFt: number | null } | null>(null);

  // ocean היא תמה **כהה** - גזירת "כל מה שאינו dark הוא בהיר" מוציאה את הפאנל
  // בלתי-נראה בחדר הבקרה (ראה /ui-adapt).
  const C = themeMode === 'light'
    ? { panel: '#f8fafc', head: '#e2e8f0', border: '#94a3b8', text: '#0f172a', dim: '#475569', row: '#eef2f7', rowAlt: '#e2e8f0', chip: '#ffffff' }
    : themeMode === 'ocean'
      ? { panel: '#05404e', head: '#0a5768', border: '#0e7490', text: '#cffafe', dim: '#7dd3fc', row: '#064a5a', rowAlt: '#053e4c', chip: '#0a5768' }
      : { panel: '#0f172a', head: '#1e293b', border: '#334155', text: '#e2e8f0', dim: '#94a3b8', row: '#111d33', rowAlt: '#0d1729', chip: '#1e293b' };

  // **חריג מתועד לקוד צבע המסגרות** (CLAUDE.md §מסגרת חלון): כאן הצבע מזהה
  // *איזו* נקודה זו, ולא *סוג* חלון, ולכן הוא נשאר צבע הנקודה ולא windowFrame.
  const accent = point.color || '#38bdf8';

  const blocks = useMemo(() => buildBlocks(point), [point]);
  // מעבירים גם את שורות המטוסים: בלעדיהן הגובה החריג של מטוס בודד
  // נשמר ב-DB אבל לא מצויר - ופיצול מבנה נראה כאילו לא קרה.
  const byBlock = useMemo(() => formationsInBlocks(blocks, assigned, aircraft), [blocks, assigned, aircraft]);
  const conflicts = useMemo(() => conflictBlocks(byBlock), [byBlock]);

  const acOf = (stripId: string | number, idx: number) =>
    aircraft.find(a => String(a.strip_id) === String(stripId) && Number(a.aircraft_idx) === idx);

  const isOpenKey = (key: string) => isFormationOpen(!!point.expand_aircraft, expanded, key);
  const toggleExpand = (sid: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(sid) ? n.delete(sid) : n.add(sid); return n; });

  const aircraftOf = (sid: string, row: Record<string, any>) =>
    formationAircraft(stripAircraftData[sid], row.number_of_formation);

  /**
   * פותח את טופס ההעברה לבלוק.
   * הטופס נפתח **תמיד** ולא מעביר בשקט: מבנה יכול להתפצל בין שני גבהים, ולכן
   * "לאן" לבדו אינו מספיק - צריך לדעת גם **מי** עובר.
   */
  const openMoveForm = (sid: string, row: Record<string, any>, indices: number[], targetFt: number | null) => {
    const list = aircraftOf(sid, row).map(a => a.idx);
    const scope = indices.length ? indices : list;
    setMoveForm({
      sid,
      label: getFormationDisplayName(row),
      all: list.length ? list : scope,
      picked: new Set(scope),
      targetFt,
    });
  };

  // פ"מ ששוחרר על הסמן: הטבלה נפרסת וטופס ההעברה נפתח **בלי גובה** - הפקח
  // בוחר לאיזה בלוק. שיבוץ שקט לגובה שרירותי היה מידע שגוי על המסך.
  React.useEffect(() => {
    if (!pendingMove) return;
    const row = assigned.find(r => String(r.strip_id) === String(pendingMove.stripId)) || pendingMove.strip;
    openMoveForm(String(pendingMove.stripId), row, [], null);
    onPendingMoveHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMove]);

  const submitMoveForm = () => {
    if (!moveForm || moveForm.targetFt == null) return;
    const picked = [...moveForm.picked].sort((a, b) => a - b);
    // כל המבנה נבחר = לא פיצול, אלא העברת הפ"מ כולו
    const isAll = picked.length >= moveForm.all.length;
    onSplit?.(moveForm.sid, isAll ? [] : picked, moveForm.targetFt);
    setMoveForm(null);
  };

  const landedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (landedTimer.current) clearTimeout(landedTimer.current); }, []);

  /**
   * "נחת": מסמן, מהבהב באדום, ואז מוריד את שורת המטוס מהפ"מ.
   *
   * ההשהיה אינה קישוט - היא **חלון חרטה**: הפקח רואה שהשורה עומדת לרדת, ולחיצה
   * חוזרת בתוך החלון מבטלת. בלעדיה שורה נעלמת בלי שאיש ראה מה קרה.
   */
  const startLanded = (sid: string, idx: number) => {
    if (landingIdx?.sid === sid && landingIdx?.idx === idx) {   // ביטול בתוך החלון
      if (landedTimer.current) clearTimeout(landedTimer.current);
      setLandingIdx(null);
      onFlightStatus(sid, idx, 'none');
      return;
    }
    if (landedTimer.current) clearTimeout(landedTimer.current);
    setLandingIdx({ sid, idx });
    onFlightStatus(sid, idx, 'landed');
    landedTimer.current = setTimeout(() => {
      setLandingIdx(null);
      onRemoveAircraft?.(sid, idx);
    }, LANDED_BLINK_MS);
  };

  /**
   * העברת מטוסים של פ"מ לבלוק - הגרירה של שורת הפ"מ ושל מטוס בודד נגמרת כאן.
   * `moving` ריק = כל המבנה. `dropIndices` מחליט אם זה פיצול או מעבר של הכל,
   * ומחזיר null כשהשחרור היה על הבלוק שבו הם כבר נמצאים.
   */
  const moveToBlock = (sid: string, row: Record<string, any>, moving: number[], blockFt: number) => {
    const all = aircraftOf(sid, row).map(a => a.idx);
    const indices = dropIndices(all, stripAircraftAlts(byBlock, sid), moving, blockFt);
    if (indices == null) return;
    if (onSplit) onSplit(sid, indices, blockFt);
    else onAssign(sid, blockFt);
  };

  /**
   * גרירה אחת לכל מה שנגרר בטבלה: כרטיס נכנס, שורת פ"מ, מטוס בודד.
   *
   * ⚠ Pointer Events **בלבד** ולא `draggable`: בעט ובאצבע HTML5 drag לא נורה,
   * ובעכבר הוא **חוטף** את הגרירה (dragstart שולח pointercancel) - כך שבאותה
   * תנועה רצו שני מנגנונים שונים לפי סוג המצביע (CLAUDE.md §גרירה).
   *
   * הידית של שורת הפ"מ היא **השורה עצמה** ולא העוטף שלה: כשהעוטף החזיק גם את
   * המטוסים הפרוסים, גרירת מטוס הפעילה במקביל גם את גרירת הפ"מ - שתי לכידות
   * מצביע על אותה תנועה, והמבנה כולו עבר במקום המטוס.
   */
  const startDrag = (
    e: React.PointerEvent,
    opts: { key: string; label: string; onBlock: (ft: number) => void; onOutside?: (x: number, y: number) => void },
  ) => {
    if (e.button > 0) return;
    if ((e.target as HTMLElement).closest('button, select, input')) return;
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const x0 = e.clientX, y0 = e.clientY;
    let active = false;
    let lastFt: number | null = null;

    // רק בלוקים של **הנקודה הזו**: שתי טבלאות פתוחות זו ליד זו, ושחרור על
    // בלוק של השכנה היה משבץ את הפ"מ כאן בגובה שנבחר שם.
    const blockAt = (x: number, y: number): number | null => {
      const hit = document.elementFromPoint(x, y)?.closest(`[data-block-ft][data-joining-point-id="${point.id}"]`);
      const ft = hit?.getAttribute('data-block-ft');
      return ft == null ? null : Number(ft);
    };
    const placeGhost = (x: number, y: number) => {
      ghostPos.current = { x, y };
      const g = ghostRef.current;
      if (!g) return;
      const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;
      g.style.left = `${x / s}px`;
      g.style.top = `${y / s}px`;
    };
    // גלילת הטבלה כשהמצביע בקצה - בלי זה בלוק שמחוץ לתצוגה אינו יעד אפשרי
    const autoScroll = (y: number) => {
      const box = blocksScrollRef.current;
      if (!box) return;
      const r = box.getBoundingClientRect();
      if (y < r.top + AUTO_SCROLL_EDGE_PX && y > r.top - AUTO_SCROLL_EDGE_PX) box.scrollTop -= 12;
      else if (y > r.bottom - AUTO_SCROLL_EDGE_PX && y < r.bottom + AUTO_SCROLL_EDGE_PX) box.scrollTop += 12;
    };

    const move = (me: PointerEvent) => {
      if (!active) {
        if (Math.hypot(me.clientX - x0, me.clientY - y0) <= DRAG_THRESHOLD_PX) return;
        active = true;
        ghostPos.current = { x: me.clientX, y: me.clientY };
        setDrag({ key: opts.key, label: opts.label });
      }
      placeGhost(me.clientX, me.clientY);
      autoScroll(me.clientY);
      const ft = blockAt(me.clientX, me.clientY);
      if (ft !== lastFt) { lastFt = ft; setDragBlock(ft); }
    };
    const finish = (ue: PointerEvent | null) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      setDrag(null);
      setDragBlock(null);
      if (!ue || !active) return;   // נגיעה ולא גרירה, או ביטול של המערכת
      const ft = blockAt(ue.clientX, ue.clientY);
      if (ft != null) opts.onBlock(ft);
      else opts.onOutside?.(ue.clientX, ue.clientY);
    };
    const up = (ue: PointerEvent) => finish(ue);
    const cancel = () => finish(null);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
  };

  /** גרירת פ"מ מרשימת הפ"ממים שבצד (HTML5, מחוץ לפאנל) אל בלוק גובה. */
  const applyDropOnBlock = (data: Record<string, any>, blockFt: number) => {
    setDragBlock(null);
    if (!data.stripId) return;
    const row = assigned.find(r => String(r.strip_id) === String(data.stripId));
    // פ"מ שכבר בנקודה - כל המבנה עובר, כמו גרירת שורת הפ"מ בתוך הטבלה
    if (row) moveToBlock(String(data.stripId), row, [], blockFt);
    else onAssign(String(data.stripId), blockFt);
  };

  const dropOnBlock = (e: React.DragEvent, blockFt: number) => {
    e.preventDefault();
    e.stopPropagation();
    try { applyDropOnBlock(JSON.parse(e.dataTransfer.getData('text/plain')), blockFt); }
    catch { setDragBlock(null); /* גרירה שאינה פ"מ - מתעלמים */ }
  };

  /**
   * שורת מטוס בודד: או"ק ומספר במבנה, דת"ק, מסלול, הקפה, סטטוס.
   * `extra` - פעולות הפ"מ, שבמצב "מטוסים בלבד" יושבות על המטוס הראשון במבנה.
   */
  const aircraftRow = (sid: string, row: Record<string, any>, ac: FormationAircraftRow, extra: React.ReactNode) => {
    const st = acOf(sid, ac.idx);
    const acKey = `a:${sid}:${ac.idx}`;
    return (
      <div
        key={ac.idx}
        data-testid="joining-aircraft"
        data-aircraft-idx={ac.idx}
        data-approaching={approaching(sid, [ac.idx]) ? '1' : '0'}
        title={tr('joining.dragAircraftTitle')}
        onPointerDown={e => startDrag(e, {
          key: acKey,
          label: `${getFormationDisplayName(row)}${ac.idx}`,
          // על בלוק - רק המטוס הזה עובר; מחוץ לטבלה - אל ההקפה במפה
          onBlock: target => moveToBlock(sid, row, [ac.idx], target),
          onOutside: (x, y) => onAircraftDropOnMap?.(sid, ac.idx, x, y),
        })}
        style={{
          display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap',
          background: C.chip, borderRadius: '4px', padding: '1px 4px',
          border: st?.in_pattern ? `1px solid ${accent}` : `1px dashed ${st?.pattern_id ? accent : 'transparent'}`,
          cursor: 'grab', touchAction: 'none', userSelect: 'none',
          opacity: drag?.key === acKey ? 0.4 : 1,
          animation: approaching(sid, [ac.idx]) ? APPROACH_BLINK : undefined,
        }}
      >
        {/* ידית הגרירה - שטח לחיצה מפורש ומסומן. בלעדיה
            האזור הגריר היה הרווחים שבין הכפתורים, וכל
            ניסיון גרירה נחת על בורר המסלול או על כפתור. */}
        <span
          data-testid="joining-aircraft-grip"
          title={tr('joining.dragAircraftTitle')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '3px',
            padding: '2px 6px', margin: '-1px 0', borderRadius: '3px',
            background: themeMode === 'light' ? '#dbeafe' : '#1d4ed833',
            border: `1px solid ${accent}66`, fontWeight: 'bold', cursor: 'grab',
          }}
        >
          <span style={{ opacity: 0.7 }}>⠿</span>
          {bidiAuto(`${getFormationDisplayName(row)}${ac.idx}`)}
        </span>
        {ac.datk != null && <span style={{ color: C.dim }}>{tr('joining.datk')} {ac.datk}</span>}
        <select
          value={st?.runway_ident || ''}
          onChange={e => onUpdateAircraft(sid, ac.idx, { runway_ident: e.target.value, pattern_id: landingRunways.find(r => r.ident === e.target.value)?.pattern_id ?? null })}
          title={tr('joining.pickRunway')}
          style={{ background: C.panel, color: C.text, border: `1px solid ${C.border}`, borderRadius: '3px', fontSize: '11px', padding: '0 3px' }}
        >
          <option value="">{landingRunways.length ? tr('joining.pickRunway') : tr('joining.noActiveRunways')}</option>
          {landingRunways.map(r => <option key={r.ident} value={r.ident}>{r.ident}</option>)}
        </select>
        {/* "שים בהקפה" נעול עד שנבחר מסלול: הקפה משויכת לקצה
            מסלול אחד, ומטוס בהקפה בלי מסלול הוא סימון על
            המפה שאינו אומר לאן הוא נכנס. הוצאה מהקפה תמיד
            זמינה - אחרת מטוס שאיבד את המסלול היה נתקע שם. */}
        {(() => {
          const hasRunway = !!String(st?.runway_ident ?? '').trim();
          const locked = !st?.in_pattern && !hasRunway;
          return (
            <button
              type="button"
              disabled={locked}
              title={locked ? tr('joining.needRunwayFirst') : undefined}
              onClick={() => {
                if (locked) return;
                const entering = !st?.in_pattern;
                onUpdateAircraft(sid, ac.idx, { in_pattern: entering });
                // מטוס שנכנס להקפה מתחיל ב**עה"ר** - זו הצלע
                // שבה הוא ממתין. בלי זה הוא נכנס בלי מצב,
                // והתפריט הראה "ללא" על מטוס שכבר בהקפה.
                if (entering && normalizeLeg(ac.flight_status) === 'none') {
                  onFlightStatus(sid, ac.idx, DEFAULT_LEG);
                }
              }}
              style={{
                ...btn(locked ? '#475569' : st?.in_pattern ? '#7c3aed' : '#1d4ed8'),
                opacity: locked ? 0.5 : 1,
                cursor: locked ? 'not-allowed' : 'pointer',
              }}
            >{st?.in_pattern ? tr('joining.removeFromPattern') : tr('joining.toPattern')}</button>
          );
        })()}
        {(() => {
          const leg = normalizeLeg(ac.flight_status);
          const blinking = landingIdx?.sid === sid && landingIdx?.idx === ac.idx;
          const alert = greensAlert(ac.flight_status, ac.greens);
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: 0 }}>
              {/* איפה המטוס - תפריט לפי **סדר הטיסה**, ולא רשת
                  כפתורים: המצבים בלעדיים וסדרם הוא המידע עצמו. */}
              <select
                data-testid="flight-leg"
                value={leg}
                onChange={e => {
                  const v = e.target.value;
                  if (v === 'landed') startLanded(sid, ac.idx);
                  else onFlightStatus(sid, ac.idx, v);
                }}
                style={{
                  background: blinking ? '#dc2626' : leg === 'none' ? C.panel : FLIGHT_ACTIVE_BG,
                  color: leg === 'none' && !blinking ? C.dim : '#ffffff',
                  border: `1px solid ${C.border}`, borderRadius: '4px',
                  fontSize: '11px', fontWeight: 'bold', padding: '1px 3px',
                  animation: blinking ? 'skyking-landed-blink 0.5s steps(1) infinite' : undefined,
                }}
              >
                <option value="none">{tr('joining.statusNone')}</option>
                {FLIGHT_LEGS.map(k => (
                  <option key={k} value={k}>{tr(LEG_LABELS[k])}</option>
                ))}
              </select>

              {/* ירוקים - **דגל**, לא שלב. ירוק = דיווח. */}
              <button
                type="button"
                data-testid="flight-greens"
                data-on={ac.greens ? '1' : '0'}
                data-alert={alert ? '1' : '0'}
                title={alert ? tr('joining.greensAlert') : undefined}
                onClick={() => onGreens?.(sid, ac.idx, !ac.greens)}
                style={{
                  ...btn(ac.greens ? '#16a34a' : 'transparent', ac.greens || alert ? '#ffffff' : C.dim),
                  // ההתראה היא **הנקודה עצמה מהבהבת באדום** ולא תווית לצדה:
                  // תווית נוספת מוסיפה רעש לשורה צפופה, וההבהוב מושך את העין
                  // בדיוק למקום שבו צריך ללחוץ.
                  animation: alert ? 'skyking-landed-blink 0.5s steps(1) infinite' : undefined,
                }}
              >{ac.greens ? '✓ ' : ''}{tr('joining.statusGreens')}</button>

            </div>
          );
        })()}
        {extra}
      </div>
    );
  };

  const headerRange = `${altToDisplay(Math.min(point.alt_min_ft, point.alt_max_ft))}-${altToDisplay(Math.max(point.alt_min_ft, point.alt_max_ft))}`;

  const btn = (bg: string, fg = '#fff'): React.CSSProperties => ({
    padding: '2px 8px', background: bg, color: fg, border: 'none', borderRadius: '4px',
    cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap',
  });

  return (
    <div
      data-testid="joining-point-panel"
      data-point-id={point.id}
      style={{
        background: C.panel, border: `2px solid ${accent}`, borderRadius: '8px',
        minWidth: '320px', maxWidth: '460px', color: C.text, fontSize: '12px',
        boxShadow: '0 6px 18px rgba(0,0,0,0.45)', overflow: 'hidden',
      }}
    >
      {/* כותרת: שם הנקודה + טווח הגבהים, כמו שנכתב מעל הטבלה על הסדק.
          היא גם **ידית הגרירה** של הפאנל - בעט, באצבע ובעכבר. */}
      <div
        onPointerDown={e => { if (!(e.target as HTMLElement).closest('button')) onHeaderPointerDown?.(e); }}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', background: C.head, borderBottom: `1px solid ${C.border}`, cursor: onHeaderPointerDown ? 'move' : 'default', touchAction: 'none', userSelect: 'none' }}
      >
        <span style={{ fontWeight: 'bold', color: accent, fontFamily: 'monospace' }}>{headerRange}</span>
        <span style={{ fontWeight: 'bold', flex: 1, textAlign: 'start' }}>{bidiAuto(point.name)}</span>
        <span style={{ color: C.dim, fontSize: '10px' }}>{tr('joining.blocksCount')}: {blocks.length}</span>
        {onResetPosition && (
          <button type="button" title={tr('joining.resetPosition')} onClick={onResetPosition} style={btn('transparent', C.dim)}>⟲</button>
        )}
        <button type="button" title={tr('joining.collapse')} onClick={onCollapse} style={btn('transparent', C.dim)}>▾</button>
      </div>

      {/* השורה העליונה: מה שמועבר אליי מנקודת המעבר המקושרת ועוד לא קיבל גובה */}
      <div style={{ display: 'flex', borderBottom: `2px solid ${C.border}` }}>
        <div style={{ width: '56px', flexShrink: 0, padding: '4px', background: C.head, borderInlineEnd: `1px solid ${C.border}`, fontSize: '10px', color: C.dim, textAlign: 'center' }}>
          {tr('joining.incomingRow')}
        </div>
        <div style={{ flex: 1, padding: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px', background: C.head, minHeight: '26px' }}>
          {incoming.length === 0 && <span style={{ color: C.dim, fontSize: '10px' }}>{tr('joining.noIncoming')}</span>}
          {incoming.map(t => {
            // כבר תוכנן לבלוק? אז אין טופס גובה: **הגובה שתוכנן הוא הקובע**,
            // ואם העמדה המוסרת נקבה גובה אחר - זו התראה, לא תיקון שקט.
            const planned = assigned.find(r => String(r.strip_id) === String(t.strip_id));
            const plannedAlt = planned?.planned_alt || null;
            const mismatch = altMismatch(plannedAlt, t.alt);
            return (
              <div
                key={t.id}
                onPointerDown={e => startDrag(e, {
                  key: `in:${t.id}`,
                  label: getFormationDisplayName(t),
                  onBlock: ft => onAcceptIncoming(String(t.id), ft),
                })}
                title={tr('joining.dragToBlock')}
                style={{ touchAction: 'none', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '4px', background: C.chip, border: `1px solid ${mismatch ? '#f59e0b' : accent}`, borderRadius: '4px', padding: '2px 5px', cursor: 'grab', opacity: drag?.key === `in:${t.id}` ? 0.4 : 1 }}
              >
                <span style={{ fontWeight: 'bold' }}>{bidiAuto(getFormationDisplayName(t))}</span>
                {t.sq && <span style={{ color: C.dim }}>/ {bidiAuto(String(t.sq))}</span>}
                {plannedAlt && (
                  <span style={{ color: accent, fontFamily: 'monospace' }} title={tr('joining.plannedTitle')}>
                    ⤵ {altToDisplay(displayToAlt(plannedAlt) ?? 0)}
                  </span>
                )}
                {mismatch && (
                  <span
                    data-testid="joining-alt-mismatch"
                    title={tr('joining.altMismatchTitle', { sent: String(t.alt ?? ''), planned: String(plannedAlt ?? '') })}
                    style={{ background: '#f59e0b', color: '#1c1400', borderRadius: '3px', padding: '0 4px', fontSize: '10px', fontWeight: 'bold' }}
                  >⚠ {tr('joining.altMismatch', { sent: String(t.alt ?? '') })}</span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const ft = displayToAlt(plannedAlt);
                    if (ft != null) onAcceptIncoming(String(t.id), ft);
                    else {
                      const limit = acceptAltitudeLimit(t.number_of_formation);
                      setAcceptForm({
                        transferId: String(t.id), sid: String(t.strip_id ?? ''), label: getFormationDisplayName(t),
                        indices: Array.from({ length: limit }, (_, i) => i + 1), limit, selected: [], mapping: {},
                      });
                    }
                  }}
                  style={btn(mismatch ? '#b45309' : '#059669')}
                >{plannedAlt ? tr('joining.approveTransfer') : tr('joining.accept')}</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* טבלת הבלוקים - מהגבוה למטה */}
      <div ref={blocksScrollRef} style={{ maxHeight: '340px', overflowY: 'auto' }}>
        {blocks.map((ft, i) => {
          const rows = byBlock.get(ft) || [];
          const isConflict = conflicts.has(ft);
          const isDropTarget = dragBlock === ft;
          return (
            <div
              key={ft}
              data-testid="joining-block-row"
              data-block-ft={ft}
              data-joining-point-id={point.id}
              data-conflict={isConflict ? '1' : '0'}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragBlock(ft); }}
              onDragLeave={() => setDragBlock(b => (b === ft ? null : b))}
              onDrop={e => dropOnBlock(e, ft)}
              style={{
                display: 'flex', alignItems: 'stretch',
                // צבעי סטטוס נשארים קבועים בכל תמה - הם נושאים משמעות
                background: isConflict ? '#dc2626' : isDropTarget ? '#0369a1' : (i % 2 ? C.rowAlt : C.row),
                borderBottom: `1px solid ${C.border}`,
                minHeight: '22px',
              }}
            >
              {/* הקונפליקט מסומן גם ב-⚠ ולא בצבע בלבד: צבע לעולם אינו הערוץ
                  היחיד (FAA HF-STD-001 / Ahlstrom & Arend - עיוורון צבעים). */}
              <div title={isConflict ? tr('joining.conflictTitle') : undefined}
                style={{ width: '62px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '13px', color: isConflict ? '#fff' : C.text, borderInlineEnd: `1px solid ${C.border}` }}>
                {isConflict && <span aria-label={tr('joining.conflict')}>⚠</span>}
                {altToDisplay(ft)}
              </div>
              <div style={{ flex: 1, padding: '2px 5px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {rows.length === 0 && isDropTarget && (
                  <span style={{ color: '#e0f2fe', fontSize: '10px' }}>{tr('joining.dropHere')}</span>
                )}
                {rows.map(entry => {
                  const row = entry.strip;
                  const sid = String(row.strip_id);
                  const acList = aircraftOf(sid, row).filter(a => !entry.indices.length || entry.indices.includes(a.idx));
                  const count = entry.indices.length || acList.length;
                  const isOpen = isOpenKey(`${sid}@${ft}`);
                  const rowKey = `f:${sid}@${ft}`;
                  const rowLabel = entry.partial
                    ? `${getFormationDisplayName(row)}/${entry.indices.join('+')}`
                    : getFormationDisplayName(row);
                  // העמדה המוסרת שלחה גובה אחר ממה שתוכנן כאן - שני אנשים
                  // מחזיקים תמונה שונה על אותו מטוס, וזו התראה ולא תיקון שקט.
                  const mismatch = altMismatch(row.planned_alt, row.alt);
                  // פעולות הפ"מ - אותן בשני המצבים. במצב "מטוסים בלבד" אין שורת
                  // פ"מ, והן יושבות על שורת המטוס הראשון במבנה (פעם אחת למבנה).
                  const formationActions = (
                    <>
                      <FaultBadge faults={row.aircraft_faults} size={9} />
                      {mismatch && (
                        <span
                          data-testid="joining-alt-mismatch"
                          title={tr('joining.altMismatchTitle', { sent: String(row.alt ?? ''), planned: String(row.planned_alt ?? '') })}
                          style={{ background: '#f59e0b', color: '#1c1400', borderRadius: '3px', padding: '0 4px', fontSize: '10px', fontWeight: 'bold' }}
                        >⚠ {tr('joining.altMismatch', { sent: String(row.alt ?? '') })}</span>
                      )}
                      <button
                        type="button"
                        data-testid="joining-formation-menu"
                        title={tr('joining.moveTitle')}
                        onClick={() => openMoveForm(sid, row, entry.indices, ft)}
                        style={btn('#334155')}
                      >⋯</button>
                    </>
                  );
                  const formationTail = (
                    <>
                      {row.notes ? (
                        <span title={tr('joining.faultNote')} style={{ color: '#fbbf24' }}>⚠ {bidiAuto(String(row.notes))}</span>
                      ) : null}
                      {row.is_coordinated ? (
                        <span style={{ color: '#86efac', fontSize: '10px' }}>✓ {tr('joining.coordinated')}</span>
                      ) : null}
                      {isConflict && (
                        <button type="button" onClick={() => { setCoordFor({ stripId: sid, label: getFormationDisplayName(row) }); setCoordNote(String(row.coordination_note || '')); }} style={btn('#facc15', '#000')}>
                          {tr('joining.markCoordinated')}
                        </button>
                      )}
                      {/* הסרה מהנקודה אינה שקטה: זו הוצאת פ"מ מתמונת ההצטרפות */}
                      <button
                        type="button"
                        data-testid="joining-formation-remove"
                        title={tr('joining.removeFromPoint')}
                        onClick={async () => { if (await customConfirm(tr('joining.confirmRemove'))) onRemoveStrip(sid); }}
                        style={btn('transparent', isConflict ? '#fecaca' : C.dim)}
                      >✕</button>
                    </>
                  );

                  // **מטוסים בלבד** (הגדרת הנקודה): בלי שורת הפ"מ - כל מטוס שורה משלו,
                  // כאילו המבנה תמיד פרוס. פ"מ בלי מספר מטוסים ידוע נשאר בשורת פ"מ,
                  // אחרת לא היה לו שום ייצוג בטבלה.
                  if (point.expand_aircraft && acList.length > 0) {
                    return (
                      <div key={`${sid}@${ft}`} data-testid="joining-formation" data-strip-id={sid} data-partial={entry.partial ? '1' : '0'} data-aircraft-only="1"
                        style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {acList.map((ac, i) => aircraftRow(sid, row, ac, i === 0 ? <>{formationActions}{formationTail}</> : null))}
                      </div>
                    );
                  }

                  return (
                    <div key={`${sid}@${ft}`} data-testid="joining-formation" data-strip-id={sid} data-partial={entry.partial ? '1' : '0'}>
                      {/* תצוגה מצומצמת: או"ק / טייסת (מספר מטוסים) + הערת תקלה.
                          השורה הזו היא ידית הגרירה של **הפ"מ** - כל המבנה עובר
                          (ובשורה של חלק מפוצל - החלק שהיא מציגה). */}
                      <div
                        data-testid="joining-formation-handle"
                        title={tr('joining.dragFormationTitle')}
                        onPointerDown={e => startDrag(e, {
                          key: rowKey,
                          label: rowLabel,
                          onBlock: target => {
                            // פ"מ בלי מספר מטוסים ידוע - אין ממה לגזור "כבר שם"
                            if (target === ft && !entry.indices.length) return;
                            moveToBlock(sid, row, entry.indices, target);
                          },
                        })}
                        data-approaching={approaching(sid, acList.map(a => a.idx)) ? '1' : '0'}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap',
                          touchAction: 'none', userSelect: 'none', cursor: 'grab',
                          opacity: drag?.key === rowKey ? 0.4 : 1,
                          borderRadius: '3px',
                          animation: approaching(sid, acList.map(a => a.idx)) ? APPROACH_BLINK : undefined,
                        }}
                      >
                        <button
                          type="button"
                          data-testid="joining-expand-toggle"
                          title={isOpen ? tr('joining.collapseAircraft') : tr('joining.expandAircraft')}
                          onClick={() => toggleExpand(`${sid}@${ft}`)}
                          style={btn(isOpen ? '#7c3aed' : '#334155')}
                        >{isOpen ? '−' : '+'}</button>
                        <span style={{ fontWeight: 'bold', color: isConflict ? '#fff' : C.text }}>
                          <span style={{ opacity: 0.6, marginInlineEnd: '3px' }}>⠿</span>
                          {bidiAuto(rowLabel)}
                        </span>
                        {/* תקלה במטוס - הפקח רואה אותה על השורה בבלוק הגובה,
                            בלי לפרוס את המבנה. בפ"מ מפוצל השרת כבר סינן לפי
                            aircraft_indices, ולכן היא מופיעה רק אצל מי שהמטוס
                            נמצא אצלו. */}
                        {formationActions}
                        {row.squadron ? <span style={{ color: isConflict ? '#fee2e2' : C.dim }}>/ {bidiAuto(String(row.squadron))}</span> : null}
                        {count > 0 && <span style={{ color: isConflict ? '#fee2e2' : C.dim }}>({count})</span>}
                        {formationTail}
                      </div>

                      {/* פריסת המטוסים: או"ק ומספר במבנה, דת"ק, מסלול, הקפה, סטטוס */}
                      {isOpen && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px', paddingInlineStart: '10px' }}>
                          {acList.map(ac => aircraftRow(sid, row, ac, null))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* טופס הקבלה - מציע **רק** גבהים מטווח הנקודה. בוחרים גובה אחד (כל המבנה)
          או כמה - עד מספר המטוסים - ומשייכים לכל מספר במבנה את הגובה שלו.
          גובה תפוס כתום ו**ניתן לבחירה**: זו התראה, וההכרעה אצל הפקח. */}
      {acceptForm && (() => {
        const f = acceptForm;
        const occupied = occupiedBlocks(byBlock, f.sid);
        const atLimit = f.limit > 1 && f.selected.length >= f.limit;
        const groups = altitudeGroups(f.mapping);
        const occupiedPicked = [...new Set(Object.values(f.mapping))].filter(ft => occupied.has(ft)).sort((a, b) => b - a);
        const labelsAt = (ft: number) => (occupied.get(ft) || []).map(r => getFormationDisplayName(r)).join(', ');
        const pick = (ft: number) => setAcceptForm(prev => {
          if (!prev) return prev;
          const selected = toggleAcceptAltitude(prev.selected, ft, prev.limit);
          return { ...prev, selected, mapping: distributeAltitudes(prev.indices, selected) };
        });
        const submit = () => {
          if (!groups.length) return;
          onAcceptIncoming(f.transferId, groups[0].ft, groups.length > 1 ? groups : undefined);
          setAcceptForm(null);
        };
        return (
          <div data-testid="joining-accept-form" style={{ padding: '6px 8px', borderTop: `2px solid ${accent}`, background: C.head }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <span style={{ fontWeight: 'bold' }}>{tr('joining.acceptTitle')}</span>
              <span style={{ color: accent }}>{bidiAuto(f.label)}</span>
              {f.limit > 1 && <span style={{ color: C.dim }}>({f.limit})</span>}
              <button type="button" onClick={() => setAcceptForm(null)} style={{ ...btn('transparent', C.dim), marginInlineStart: 'auto' }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline', marginBottom: '3px' }}>
              <span style={{ fontWeight: 'bold', fontSize: '11px' }}>{tr('joining.acceptAlts')}</span>
              <span style={{ color: C.dim, fontSize: '10px' }}>
                {atLimit ? tr('joining.acceptLimitReached', { max: String(f.limit) }) : tr('joining.acceptAltsHint', { max: String(f.limit) })}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '5px' }}>
              {blocks.map(ft => {
                const on = f.selected.includes(ft);
                const occ = occupied.has(ft);
                const locked = atLimit && !on;
                return (
                  <button
                    key={ft}
                    type="button"
                    data-testid="joining-accept-alt"
                    data-occupied={occ ? '1' : '0'}
                    data-selected={on ? '1' : '0'}
                    disabled={locked}
                    title={occ ? tr('joining.acceptOccupiedTitle', { list: labelsAt(ft) }) : undefined}
                    onClick={() => pick(ft)}
                    style={{
                      // צבעי סטטוס קבועים בכל תמה: כתום = תפוס, כחול = נבחר. הבחירה
                      // מסומנת גם ב-✓ והתפוס גם ב-⚠ - צבע אינו הערוץ היחיד.
                      ...btn(occ ? '#f59e0b' : on ? '#0284c7' : '#334155', occ ? '#1c1400' : '#fff'),
                      fontFamily: 'monospace',
                      outline: on ? `2px solid ${occ ? '#0284c7' : '#e0f2fe'}` : 'none',
                      outlineOffset: '-2px',
                      opacity: locked ? 0.4 : 1,
                      cursor: locked ? 'not-allowed' : 'pointer',
                    }}
                  >{on ? '✓ ' : ''}{occ ? '⚠ ' : ''}{altToDisplay(ft)}</button>
                );
              })}
            </div>

            {/* שיוך מטוס -> גובה. מופיע רק כשנבחר יותר מגובה אחד; בגובה אחד
                אין מה לשייך - כל המבנה הולך אליו. */}
            {f.selected.length === 1 && f.limit > 1 && (
              <div style={{ color: C.dim, fontSize: '11px', marginBottom: '5px' }}>
                {tr('joining.acceptWholeTo', { alt: altToDisplay(f.selected[0]) })}
              </div>
            )}
            {f.selected.length > 1 && (
              <div data-testid="joining-accept-mapping" style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '11px' }}>{tr('joining.acceptPerAircraft')}</span>
                {f.indices.map(idx => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                    <span style={{ minWidth: '56px', fontWeight: 'bold' }}>{bidiAuto(`${f.label}${idx}`)}</span>
                    {[...f.selected].sort((a, b) => b - a).map(ft => {
                      const on = f.mapping[idx] === ft;
                      const occ = occupied.has(ft);
                      return (
                        <button
                          key={ft}
                          type="button"
                          data-testid="joining-accept-aircraft-alt"
                          onClick={() => setAcceptForm(prev => (prev ? { ...prev, mapping: { ...prev.mapping, [idx]: ft } } : prev))}
                          style={{
                            ...btn(on ? (occ ? '#f59e0b' : '#16a34a') : '#334155', on && occ ? '#1c1400' : '#fff'),
                            fontFamily: 'monospace',
                          }}
                        >{on ? '✓ ' : ''}{altToDisplay(ft)}</button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {occupiedPicked.length > 0 && (
              <div data-testid="joining-accept-occupied-warn" style={{ background: '#f59e0b', color: '#1c1400', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', fontWeight: 'bold', marginBottom: '5px' }}>
                ⚠ {tr('joining.acceptOccupiedWarn')}: {occupiedPicked.map(ft => `${altToDisplay(ft)} (${labelsAt(ft)})`).join(' · ')}
              </div>
            )}

            <div style={{ display: 'flex', gap: '5px' }}>
              <button type="button" disabled={!groups.length} onClick={submit}
                style={{ ...btn(!groups.length ? '#475569' : occupiedPicked.length ? '#b45309' : '#059669'), opacity: !groups.length ? 0.6 : 1 }}
              >{tr('joining.accept')}</button>
              <button type="button" onClick={() => setAcceptForm(null)} style={btn('#475569')}>{tr('joining.cancel')}</button>
            </div>
          </div>
        );
      })()}

      {/* טופס ההעברה לבלוק: כל המבנה, או מטוסים נבחרים (פיצול בין שני גבהים) */}
      {moveForm && (
        <div data-testid="joining-move-form" style={{ padding: '6px 8px', borderTop: `2px solid ${accent}`, background: C.head }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <span style={{ fontWeight: 'bold' }}>{tr('joining.moveTitle')}</span>
            <span style={{ color: accent }}>{bidiAuto(moveForm.label)}</span>
            <button type="button" onClick={() => setMoveForm(null)} style={{ ...btn('transparent', C.dim), marginInlineStart: 'auto' }}>✕</button>
          </div>

          <div style={{ display: 'flex', gap: '4px', marginBottom: '5px' }}>
            <button type="button"
              onClick={() => setMoveForm(f => (f ? { ...f, picked: new Set(f.all) } : f))}
              style={btn(moveForm.picked.size >= moveForm.all.length ? '#0284c7' : '#334155')}
            >{tr('joining.moveWhole')}</button>
            <span style={{ color: C.dim, fontSize: '10px', alignSelf: 'center' }}>{tr('joining.movePickHint')}</span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '5px' }}>
            {moveForm.all.map(idx => {
              const on = moveForm.picked.has(idx);
              const ac = (stripAircraftData[moveForm.sid] || []).find(a => a.idx === idx);
              return (
                <button key={idx} type="button"
                  data-testid="joining-move-aircraft"
                  onClick={() => setMoveForm(f => {
                    if (!f) return f;
                    const picked = new Set(f.picked);
                    picked.has(idx) ? picked.delete(idx) : picked.add(idx);
                    return { ...f, picked };
                  })}
                  style={{ ...btn(on ? '#16a34a' : '#334155'), fontFamily: 'monospace' }}
                >
                  {on ? '✓ ' : ''}{bidiAuto(`${moveForm.label}${idx}`)}
                  {ac?.datk != null ? ` · ${tr('joining.datk')} ${ac.datk}` : ''}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
            <span style={{ color: C.dim, fontSize: '10px' }}>{tr('joining.moveTo')}</span>
            {blocks.map(ft => (
              <button key={ft} type="button"
                onClick={() => setMoveForm(f => (f ? { ...f, targetFt: ft } : f))}
                style={{ ...btn(moveForm.targetFt === ft ? '#0284c7' : '#334155'), fontFamily: 'monospace' }}
              >{altToDisplay(ft)}</button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '5px', marginTop: '6px' }}>
            <button type="button" disabled={!moveForm.picked.size || moveForm.targetFt == null}
              onClick={submitMoveForm}
              style={{ ...btn(!moveForm.picked.size || moveForm.targetFt == null ? '#475569' : '#16a34a'), opacity: !moveForm.picked.size || moveForm.targetFt == null ? 0.6 : 1 }}
            >{tr('joining.save')}</button>
            <button type="button" onClick={() => setMoveForm(null)} style={btn('#475569')}>{tr('joining.cancel')}</button>
          </div>
        </div>
      )}

      {/* אישור קונפליקט כמתואם - עם הערה, כי זו החלטה בטיחותית שנרשמת ביומן */}
      {coordFor && (
        <div style={{ padding: '6px 8px', borderTop: '2px solid #facc15', background: C.head }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <span style={{ fontWeight: 'bold', color: '#facc15' }}>{tr('joining.conflictTitle')}</span>
            <span>{bidiAuto(coordFor.label)}</span>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input
              value={coordNote}
              onChange={e => setCoordNote(e.target.value)}
              placeholder={tr('joining.coordinationNote')}
              style={{ flex: 1, background: C.panel, color: C.text, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '3px 6px', fontSize: '11px' }}
            />
            <button type="button" onClick={() => { onCoordinate(coordFor.stripId, true, coordNote); setCoordFor(null); }} style={btn('#16a34a')}>{tr('joining.markCoordinated')}</button>
            <button type="button" onClick={() => setCoordFor(null)} style={btn('#475569')}>{tr('joining.cancel')}</button>
          </div>
        </div>
      )}

      {drag && (
        <DragGhost ref={ghostRef} label={drag.label} x={ghostPos.current.x} y={ghostPos.current.y} color={accent}
          target={dragBlock != null ? altToDisplay(dragBlock) : null} />
      )}
    </div>
  );
}

/**
 * צל הגרירה - מה שנגרר, ולאיזה גובה הוא ינחת אם ישוחרר עכשיו.
 * Portal ל-body **מחוץ ל-`#root`**, ולכן `zoom: var(--s)` ידני; והקואורדינטות
 * מחולקות ב---s כי `clientX/clientY` מגיעים בפיקסלים לא-מוגדלים (/ui-adapt).
 * המיקום נקבע כאן רק ברינדור הראשון - משם `startDrag` מזיז אותו ישירות ב-DOM.
 */
const DragGhost = React.forwardRef<HTMLDivElement, { label: string; x: number; y: number; color: string; target: string | null }>(
  function DragGhost({ label, x, y, color, target }, ref) {
    const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;
    return createPortal(
      <div ref={ref} data-testid="joining-drag-ghost" style={{
        position: 'fixed', left: x / s, top: y / s, transform: 'translate(-50%, -140%)',
        zoom: 'var(--s)' as any, pointerEvents: 'none', zIndex: 10000,
        background: '#000000dd', color, border: `1px solid ${color}`, borderRadius: '4px',
        padding: '2px 6px', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap',
      }}>
        {bidiAuto(label)}
        {target && <span style={{ color: '#ffffff', fontFamily: 'monospace', marginInlineStart: '6px' }}>→ {target}</span>}
      </div>,
      document.body,
    );
  },
);

/** ייצוא לשימוש חיצוני: הגובה שנבחר בטופס, במאות רגל כפי ש-`strips.alt` שומר. */
export const altFtToStripAlt = (ft: number): string => altToDisplay(ft);
export { displayToAlt };
