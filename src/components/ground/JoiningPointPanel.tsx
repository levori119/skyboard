import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../../i18n/tr';
import { bidiAuto } from '../../utils/bidi';
import { getFormationDisplayName } from '../../utils/strips';
import { customConfirm } from '../shared/ConfirmModal';
import {
  altToDisplay, altMismatch, buildBlocks, conflictBlocks, displayToAlt, formationAircraft, formationsInBlocks,
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

export interface JoiningPointView extends JoiningPoint {
  sector_id?: number | null;
  sector_name?: string | null;
  sub_label?: string | null;
  color?: string | null;
  x_pct?: number | null;
  y_pct?: number | null;
  display_mode?: string;
  is_override?: boolean;
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
  onAcceptIncoming: (transferId: string, altFt: number) => void;
  onAssign: (stripId: string, altFt: number) => void;
  onRemoveStrip: (stripId: string) => void;
  onCoordinate: (stripId: string, coordinated: boolean, note: string) => void;
  onUpdateAircraft: (stripId: string, idx: number, patch: { runway_ident?: string; in_pattern?: boolean; pattern_id?: number | null }) => void;
  /** העברת פ״מ - או חלק ממטוסיו - לבלוק גובה. `indices` ריק = כל המבנה. */
  onSplit?: (stripId: string, indices: number[], altFt: number) => void;
  onFlightStatus: (stripId: string, idx: number, status: string) => void;
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
}

const FLIGHT_STATUS_KEYS: { key: string; label: string; color: string }[] = [
  { key: 'greens', label: 'joining.statusGreens', color: '#22c55e' },
  { key: 'cleared_to_land', label: 'joining.statusClearedToLand', color: '#38bdf8' },
  { key: 'landed', label: 'joining.statusLanded', color: '#a78bfa' },
];

export default function JoiningPointPanel({
  point, themeMode = 'dark', incoming, assigned, aircraft, stripAircraftData = {},
  landingRunways, onAcceptIncoming, onAssign, onRemoveStrip, onCoordinate,
  onUpdateAircraft, onFlightStatus, onCollapse, onResetPosition,
  onHeaderPointerDown, onAircraftDropOnMap, onSplit,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragBlock, setDragBlock] = useState<number | null>(null);
  const [altPicker, setAltPicker] = useState<{ transferId: string; label: string } | null>(null);
  const [coordFor, setCoordFor] = useState<{ stripId: string; label: string } | null>(null);
  const [coordNote, setCoordNote] = useState('');
  /** המטוס שנגרר כרגע אל המפה, עם מיקום המצביע לצל הגרירה. */
  const [acDrag, setAcDrag] = useState<{ sid: string; idx: number; label: string; x: number; y: number } | null>(null);
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
  const byBlock = useMemo(() => formationsInBlocks(blocks, assigned), [blocks, assigned]);
  const conflicts = useMemo(() => conflictBlocks(byBlock), [byBlock]);

  const acOf = (stripId: string | number, idx: number) =>
    aircraft.find(a => String(a.strip_id) === String(stripId) && Number(a.aircraft_idx) === idx);

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

  const submitMoveForm = () => {
    if (!moveForm || moveForm.targetFt == null) return;
    const picked = [...moveForm.picked].sort((a, b) => a - b);
    // כל המבנה נבחר = לא פיצול, אלא העברת הפ"מ כולו
    const isAll = picked.length >= moveForm.all.length;
    onSplit?.(moveForm.sid, isAll ? [] : picked, moveForm.targetFt);
    setMoveForm(null);
  };

  /**
   * גרירת שבב (העברה נכנסת / מבנה בטבלה) אל בלוק גובה.
   *
   * ⚠ Pointer Events ולא `draggable`: עמדת היעד היא Cintiq בעט ובאצבע, ושם
   * HTML5 drag פשוט לא נורה - הגרירה עבדה בעכבר בלבד (CLAUDE.md §גרירה).
   * ה-HTML5 נשאר במקביל כדי לא לשבור גרירה מחוץ לפאנל שכבר עובדת בעכבר.
   */
  const startChipDrag = (e: React.PointerEvent, payload: Record<string, unknown>) => {
    if (e.button > 0) return;
    if ((e.target as HTMLElement).closest('button, select, input')) return;
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const blockAt = (x: number, y: number): number | null => {
      const hit = document.elementFromPoint(x, y)?.closest('[data-block-ft]');
      const ft = hit?.getAttribute('data-block-ft');
      return ft == null ? null : Number(ft);
    };
    const move = (me: PointerEvent) => setDragBlock(blockAt(me.clientX, me.clientY));
    const done = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', done);
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      setDragBlock(null);
    };
    const up = (ue: PointerEvent) => {
      const ft = blockAt(ue.clientX, ue.clientY);
      done();
      // תזוזה זניחה = לחיצה, לא גרירה
      if (ft != null && Math.hypot(ue.clientX - e.clientX, ue.clientY - e.clientY) > 8) {
        applyDropOnBlock(payload, ft);
      }
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', done);
  };

  /** גרירת מטוס אל המפה - Pointer Events, כדי שתעבוד בעט ובאצבע. */
  const startAircraftDrag = (e: React.PointerEvent, sid: string, idx: number, label: string) => {
    if (e.button > 0) return;
    if ((e.target as HTMLElement).closest('button, select, input')) return;
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    setAcDrag({ sid, idx, label, x: e.clientX, y: e.clientY });
    const move = (me: PointerEvent) => setAcDrag(d => (d ? { ...d, x: me.clientX, y: me.clientY } : d));
    const up = (ue: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      setAcDrag(null);
      // תזוזה זניחה = לחיצה, לא גרירה - שלא כל נגיעה תשלח מטוס להקפה
      if (Math.hypot(ue.clientX - e.clientX, ue.clientY - e.clientY) > 8) {
        onAircraftDropOnMap?.(sid, idx, ue.clientX, ue.clientY);
      }
    };
    const cancel = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      setAcDrag(null);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
  };

  /** גרירה של פ"מ (מהשורה העליונה או מרשימת הפ"ממים שבצד) אל בלוק גובה. */
  /** מה שקורה כשמשהו נחת על בלוק - משותף ל-HTML5 ול-Pointer Events. */
  const applyDropOnBlock = (data: Record<string, any>, blockFt: number) => {
    setDragBlock(null);
    {
      if (data.joiningMove) {
        // מעבר בין בלוקים בתוך הטבלה - תמיד דרך הטופס, כי אולי רק חלק מהמבנה עובר
        if (String(data.joiningMove.stripId) === '' || data.joiningMove.fromFt === blockFt) return;
        const row = assigned.find(r => String(r.strip_id) === String(data.joiningMove.stripId));
        if (row) openMoveForm(String(row.strip_id), row, [], blockFt);
      } else if (data.joiningTransferId) onAcceptIncoming(String(data.joiningTransferId), blockFt);
      else if (data.stripId) {
        // גרירה מרשימת הפ"ממים שבצד - גם היא דרך הטופס, כדי שאפשר יהיה
        // להעביר רק חלק מהמבנה בלי לגרור כל מטוס בנפרד
        const row = assigned.find(r => String(r.strip_id) === String(data.stripId));
        if (row) openMoveForm(String(data.stripId), row, [], blockFt);
        else onAssign(String(data.stripId), blockFt);
      }
    }
  };

  const dropOnBlock = (e: React.DragEvent, blockFt: number) => {
    e.preventDefault();
    e.stopPropagation();
    try { applyDropOnBlock(JSON.parse(e.dataTransfer.getData('text/plain')), blockFt); }
    catch { setDragBlock(null); /* גרירה שאינה פ"מ - מתעלמים */ }
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
                draggable
                onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify({ joiningTransferId: t.id }))}
                onPointerDown={e => startChipDrag(e, { joiningTransferId: t.id })}
                title={tr('joining.dragToBlock')}
                style={{ touchAction: 'none', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '4px', background: C.chip, border: `1px solid ${mismatch ? '#f59e0b' : accent}`, borderRadius: '4px', padding: '2px 5px', cursor: 'grab' }}
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
                    else setAltPicker({ transferId: String(t.id), label: getFormationDisplayName(t) });
                  }}
                  style={btn(mismatch ? '#b45309' : '#059669')}
                >{plannedAlt ? tr('joining.approveTransfer') : tr('joining.accept')}</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* טבלת הבלוקים - מהגבוה למטה */}
      <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
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
                  const isOpen = expanded.has(`${sid}@${ft}`);
                  // העמדה המוסרת שלחה גובה אחר ממה שתוכנן כאן - שני אנשים
                  // מחזיקים תמונה שונה על אותו מטוס, וזו התראה ולא תיקון שקט.
                  const mismatch = altMismatch(row.planned_alt, row.alt);
                  return (
                    <div key={`${sid}@${ft}`} data-testid="joining-formation" data-strip-id={sid} data-partial={entry.partial ? '1' : '0'}
                      draggable
                      onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', JSON.stringify({ joiningMove: { stripId: sid, fromFt: ft } })); }}
                      onPointerDown={e => startChipDrag(e, { joiningMove: { stripId: sid, fromFt: ft } })}
                      style={{ touchAction: 'none', userSelect: 'none' }}
                    >
                      {/* תצוגה מצומצמת: או"ק / טייסת (מספר מטוסים) + הערת תקלה */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          title={isOpen ? tr('joining.collapseAircraft') : tr('joining.expandAircraft')}
                          onClick={() => toggleExpand(`${sid}@${ft}`)}
                          style={btn(isOpen ? '#7c3aed' : '#334155')}
                        >{isOpen ? '−' : '+'}</button>
                        <span style={{ fontWeight: 'bold', color: isConflict ? '#fff' : C.text }}>
                          {bidiAuto(entry.partial
                            ? `${getFormationDisplayName(row)}/${entry.indices.join('+')}`
                            : getFormationDisplayName(row))}
                        </span>
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
                        {row.squadron ? <span style={{ color: isConflict ? '#fee2e2' : C.dim }}>/ {bidiAuto(String(row.squadron))}</span> : null}
                        {count > 0 && <span style={{ color: isConflict ? '#fee2e2' : C.dim }}>({count})</span>}
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
                          title={tr('joining.removeFromPoint')}
                          onClick={async () => { if (await customConfirm(tr('joining.confirmRemove'))) onRemoveStrip(sid); }}
                          style={btn('transparent', isConflict ? '#fecaca' : C.dim)}
                        >✕</button>
                      </div>

                      {/* פריסת המטוסים: או"ק ומספר במבנה, דת"ק, מסלול, הקפה, סטטוס */}
                      {isOpen && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px', paddingInlineStart: '10px' }}>
                          {acList.map(ac => {
                            const st = acOf(sid, ac.idx);
                            return (
                              <div
                                key={ac.idx}
                                data-testid="joining-aircraft"
                                data-aircraft-idx={ac.idx}
                                title={tr('joining.dragToPattern')}
                                onPointerDown={e => startAircraftDrag(e, sid, ac.idx, `${getFormationDisplayName(row)}${ac.idx}`)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap',
                                  background: C.chip, borderRadius: '4px', padding: '1px 4px',
                                  border: st?.in_pattern ? `1px solid ${accent}` : `1px dashed ${st?.pattern_id ? accent : 'transparent'}`,
                                  cursor: 'grab', touchAction: 'none', userSelect: 'none',
                                  opacity: acDrag && acDrag.sid === sid && acDrag.idx === ac.idx ? 0.4 : 1,
                                }}
                              >
                                {/* ידית הגרירה - שטח לחיצה מפורש ומסומן. בלעדיה
                                    האזור הגריר היה הרווחים שבין הכפתורים, וכל
                                    ניסיון גרירה נחת על בורר המסלול או על כפתור. */}
                                <span
                                  data-testid="joining-aircraft-grip"
                                  title={tr('joining.dragToPattern')}
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
                                <button
                                  type="button"
                                  onClick={() => onUpdateAircraft(sid, ac.idx, { in_pattern: !st?.in_pattern })}
                                  style={btn(st?.in_pattern ? '#7c3aed' : '#1d4ed8')}
                                >{st?.in_pattern ? tr('joining.removeFromPattern') : tr('joining.toPattern')}</button>
                                {FLIGHT_STATUS_KEYS.map(s => (
                                  <button
                                    key={s.key}
                                    type="button"
                                    onClick={() => onFlightStatus(sid, ac.idx, ac.flight_status === s.key ? 'none' : s.key)}
                                    style={btn(ac.flight_status === s.key ? s.color : 'transparent', ac.flight_status === s.key ? '#0f172a' : C.dim)}
                                  >{tr(s.label)}</button>
                                ))}
                              </div>
                            );
                          })}
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

      {/* טופס גובה - מציע **רק** גבהים מטווח הנקודה, ולכן אי אפשר לשבץ מחוץ לטווח */}
      {altPicker && (
        <div style={{ padding: '6px 8px', borderTop: `2px solid ${accent}`, background: C.head }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <span style={{ fontWeight: 'bold' }}>{tr('joining.acceptTitle')}</span>
            <span style={{ color: accent }}>{bidiAuto(altPicker.label)}</span>
            <button type="button" onClick={() => setAltPicker(null)} style={{ ...btn('transparent', C.dim), marginInlineStart: 'auto' }}>✕</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {blocks.map(ft => (
              <button
                key={ft}
                type="button"
                onClick={() => { onAcceptIncoming(altPicker.transferId, ft); setAltPicker(null); }}
                style={{ ...btn('#1d4ed8'), fontFamily: 'monospace' }}
              >{altToDisplay(ft)}</button>
            ))}
          </div>
        </div>
      )}

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

      {acDrag && <AircraftDragGhost label={acDrag.label} x={acDrag.x} y={acDrag.y} color={accent} />}
    </div>
  );
}

/**
 * צל הגרירה של מטוס בדרך להקפה.
 * Portal ל-body **מחוץ ל-`#root`**, ולכן `zoom: var(--s)` ידני; והקואורדינטות
 * מחולקות ב---s כי `clientX/clientY` מגיעים בפיקסלים לא-מוגדלים (/ui-adapt).
 */
function AircraftDragGhost({ label, x, y, color }: { label: string; x: number; y: number; color: string }) {
  const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;
  return createPortal(
    <div style={{
      position: 'fixed', left: x / s, top: y / s, transform: 'translate(-50%, -140%)',
      zoom: 'var(--s)' as any, pointerEvents: 'none', zIndex: 10000,
      background: '#000000dd', color, border: `1px solid ${color}`, borderRadius: '4px',
      padding: '2px 6px', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap',
    }}>{bidiAuto(label)}</div>,
    document.body,
  );
}

/** ייצוא לשימוש חיצוני: הגובה שנבחר בטופס, במאות רגל כפי ש-`strips.alt` שומר. */
export const altFtToStripAlt = (ft: number): string => altToDisplay(ft);
export { displayToAlt };
