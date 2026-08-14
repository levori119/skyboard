// טבלת נקודות מכוון - הרכיב המשותף היחיד לעריכה ולתצוגה של נ"צי התקיפה בפ"מ.
//
// אותו רכיב משרת את כל המקומות שבהם הטבלה מופיעה (מוד טבלה של הפ"מ, פאנל פרטי
// הפ"מ), כדי שלא ייווצרו שני עורכים שמתפצלים בהתנהגות - עקרון הרכיבים המשותפים.
//
// שלושה ייצוגים, כולם נגזרים מאותו קטלוג `AIM_POINT_COLUMNS`:
//   AimPointsSummary - קריאה בלבד, שורה לכל נ"צ. לתא בטבלה ולפאנל הפ"מ.
//   AimPointsTable   - הטבלה עצמה, לשיבוץ בתוך מיכל קיים.
//   AimPointsWindow  - חלון צף לעריכה: מסגרת **כתומה** (חלון עריכה), נגרר בעט
//                      ובאצבע, ומקבל את זום גודל המסך ידנית כי הוא portal ל-body.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../../i18n/tr';
import i18n from '../../i18n';
import { API_URL } from '../../config';
import { windowFrame } from '../../utils/windowFrame';
import useDragPosition from '../../hooks/useDragPosition';
import { getSubTable, subTableFrozenCount, subTableFrozenLayout } from '../../types/subTables';
import {
  AIM_POINT_COLUMNS, AIM_POINTS_FIELD_KEY, EMPTY_AIM_POINT, aimFieldText, formatAimPointSummary, fuzeMs,
  invalidAimPointFields, isEmptyAimPoint, splitCoord, joinCoord, toAimPoints,
  type AimPoint, type AimPointColumn, type CoordParts,
} from '../../types/aimPoints';

export type ThemeMode = 'light' | 'dark' | 'ocean';

/** צבעי הרכיב לשלוש התמות. ocean היא תמה **כהה** ולכן קרובה ל-dark, לא ל-light. */
function palette(themeMode: ThemeMode) {
  return themeMode === 'light'
    ? { panel: '#f1f5f9', head: '#dbe5f1', border: '#94a3b8', line: '#cbd5e1', text: '#1e293b', muted: '#64748b', input: '#ffffff', rowAlt: '#e8eef6' }
    : themeMode === 'ocean'
    ? { panel: '#0b3a4a', head: '#0e4b5f', border: '#2b7f96', line: '#1d6579', text: '#cffafe', muted: '#7dd3e8', input: '#062c38', rowAlt: '#0d4353' }
    : { panel: '#0f172a', head: '#1e293b', border: '#334155', line: '#243447', text: '#e2e8f0', muted: '#64748b', input: '#0b1220', rowAlt: '#141f33' };
}

/** אדום שגיאה - צבע סטטוס, קבוע בכל תמה */
const ERR = '#ef4444';

// ── קטלוג החימושים ───────────────────────────────────────────────────────────
// נטען פעם אחת לכל חיי העמוד ומשותף לכל מופעי הטבלה: הקטלוג כמעט ואינו משתנה,
// ובמוד טבלה יש מופע אחד לכל שורת פ"מ - בקשה לכל מופע הייתה מציפה את השרת.
let _armamentCache: string[] | null = null;
let _armamentPending: Promise<string[]> | null = null;

export function useArmamentNames(): string[] {
  const [names, setNames] = useState<string[]>(_armamentCache || []);
  useEffect(() => {
    if (_armamentCache) return;
    if (!_armamentPending) {
      _armamentPending = fetch(`${API_URL}/default-armament-names`)
        .then(r => r.ok ? r.json() : [])
        .then((rows: unknown) => {
          const list = Array.isArray(rows)
            ? rows.map((r: Record<string, unknown>) => String(r?.name ?? '')).filter(Boolean)
            : [];
          _armamentCache = list;
          return list;
        })
        .catch(() => { _armamentCache = []; return []; });
    }
    let alive = true;
    _armamentPending.then(list => { if (alive) setNames(list); });
    return () => { alive = false; };
  }, []);
  return names;
}

// ── שדות הנ"צ ────────────────────────────────────────────────────────────────

/**
 * הזנת נ"צ ב**שדות נפרדים**, כמו בעיגון מפה - ולא כטקסט חופשי אחד.
 *
 * שדה אחד ארוך מחייב את הפקח לזכור כמה ספרות בכל מקטע ואיפה הנקודה, ובעמדת
 * עט זו הקלדה שקל לטעות בה בלי לשים לב. כאן לכל מקטע תיבה באורך קבוע, חצי
 * הכדור נבחר מרשימה, והמעבר לשדה הבא **אוטומטי** כשהוא מתמלא - כך ההקלדה
 * רציפה בדיוק כמו בשדה אחד, בלי הסיכון.
 *
 * `direction: ltr` בכוונה: נ"צ נקרא משמאל לימין גם בממשק עברי.
 */
const CoordFields = ({ value, onChange, onCommit, C, bad }: {
  value: string;
  onChange: (coord: string) => void;
  onCommit: (coord: string) => void;
  C: ReturnType<typeof palette>;
  bad: boolean;
}) => {
  const parts = splitCoord(value);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const set = (patch: Partial<CoordParts>, fromIdx?: number) => {
    const next = { ...parts, ...patch };
    onChange(joinCoord(next));
    // מעבר אוטומטי לשדה הבא ברגע שהנוכחי מלא
    if (fromIdx != null) {
      const lens = [4, 4, 5, 4];
      const vals = [next.latDm, next.latFrac, next.lonDm, next.lonFrac];
      if (vals[fromIdx].length === lens[fromIdx]) refs.current[fromIdx + 1]?.focus();
    }
  };

  const num = (v: string, max: number, key: keyof CoordParts, idx: number) => (
    <input
      ref={el => { refs.current[idx] = el; }}
      value={v}
      inputMode="numeric"
      maxLength={max}
      placeholder={'0'.repeat(max)}
      onChange={e => set({ [key]: e.target.value.replace(/\D/g, '').slice(0, max) } as Partial<CoordParts>, idx)}
      onBlur={() => onCommit(joinCoord(parts))}
      onFocus={e => e.currentTarget.select()}
      style={{
        width: `${max + 1.5}ch`, background: C.input, color: C.text,
        border: `1px solid ${bad ? ERR : C.line}`, borderRadius: 3,
        padding: '3px 2px', fontSize: 11, fontFamily: 'monospace', textAlign: 'center',
      }}
    />
  );

  const hemi = (v: string, opts: string[], key: keyof CoordParts) => (
    <select
      value={v}
      onChange={e => { const next = { ...parts, [key]: e.target.value }; onChange(joinCoord(next)); onCommit(joinCoord(next)); }}
      style={{ background: C.input, color: C.text, border: `1px solid ${C.line}`, borderRadius: 3, padding: '3px 1px', fontSize: 11, fontFamily: 'monospace' }}
    >
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  const sep = { color: C.muted, fontSize: 11, fontFamily: 'monospace' } as React.CSSProperties;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1, direction: 'ltr' }}>
      {hemi(parts.latHemi, ['N', 'S'], 'latHemi')}
      {num(parts.latDm, 4, 'latDm', 0)}
      <span style={sep}>.</span>
      {num(parts.latFrac, 4, 'latFrac', 1)}
      <span style={{ ...sep, padding: '0 2px' }}>/</span>
      {hemi(parts.lonHemi, ['E', 'W'], 'lonHemi')}
      {num(parts.lonDm, 5, 'lonDm', 2)}
      <span style={sep}>.</span>
      {num(parts.lonFrac, 4, 'lonFrac', 3)}
    </div>
  );
};

// ── תצוגה בלבד ───────────────────────────────────────────────────────────────

interface SummaryProps {
  value: unknown;
  themeMode?: ThemeMode;
  /** כמה שורות להציג לפני "ועוד N" - בתא טבלה צר לא רוצים רשימה אינסופית */
  max?: number;
  emptyText?: string;
}

export const AimPointsSummary = ({ value, themeMode = 'dark', max = 0, emptyText }: SummaryProps) => {
  const rows = toAimPoints(value).filter(p => !isEmptyAimPoint(p));
  const C = palette(themeMode);
  if (rows.length === 0) {
    return <span style={{ color: C.muted, fontStyle: 'italic', opacity: 0.7 }}>{emptyText ?? tr('strips.noAimPoints')}</span>;
  }
  const shown = max > 0 ? rows.slice(0, max) : rows;
  const rest = rows.length - shown.length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {shown.map((p, i) => (
        <div key={i} style={{ color: themeMode === 'light' ? '#b91c1c' : '#f87171', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {formatAimPointSummary(p) || tr('strips.aimPointRowEmpty')}
        </div>
      ))}
      {rest > 0 && <div style={{ color: C.muted, fontSize: '0.9em' }}>{tr('strips.aimPointsMore', { count: rest })}</div>}
    </div>
  );
};

// ── הטבלה ────────────────────────────────────────────────────────────────────

interface TableProps {
  value: AimPoint[];
  /** כל הקלדה - לעדכון מיידי של המצב המקומי */
  onChange: (next: AimPoint[]) => void;
  /** נטישת שדה / הוספת שורה / מחיקה - הרגע שבו נכון לשמור לשרת */
  onCommit?: (next: AimPoint[]) => void;
  themeMode?: ThemeMode;
  readOnly?: boolean;
}

export const AimPointsTable = ({ value, onChange, onCommit, themeMode = 'dark', readOnly = false }: TableProps) => {
  const C = palette(themeMode);
  // חלון העריכה מציג את **כל** העמודות ולכן תמיד נגלל לצדדים. עמודות הזיהוי
  // מקובעות לפי ברירת המחדל של הטבלה ברישום, אחרת בגלילה רואים מספרים בלי
  // לדעת של איזו נקודה הם.
  const LEAD_W = 30;
  const aimDef = getSubTable(AIM_POINTS_FIELD_KEY);
  const frozen = subTableFrozenCount(AIM_POINTS_FIELD_KEY, null, AIM_POINT_COLUMNS.length);
  const frozenLayout = subTableFrozenLayout(aimDef, AIM_POINT_COLUMNS, frozen, LEAD_W);
  const frozenCell = (i: number, bg: string): React.CSSProperties => {
    const L = frozenLayout[i];
    if (!L) return {};
    return {
      position: 'sticky', insetInlineStart: L.offset, zIndex: 2, background: bg,
      width: L.width, minWidth: L.width, maxWidth: L.width,
      ...(i === frozen - 1 ? { borderInlineEnd: `2px solid ${C.border}` } : {}),
    };
  };
  const armaments = useArmamentNames();
  const listId = useRef(`aim-arm-${Math.random().toString(36).slice(2)}`).current;
  const rows = value;

  const setCell = (idx: number, key: keyof AimPoint, val: string | boolean) => {
    onChange(rows.map((r, i) => i === idx ? { ...r, [key]: val } : r));
  };
  const commitCell = (idx: number, key: keyof AimPoint, val: string | boolean) => {
    const next = rows.map((r, i) => i === idx ? { ...r, [key]: val } : r);
    onChange(next);
    onCommit?.(next);
  };
  const addRow = () => {
    const next = [...rows, { ...EMPTY_AIM_POINT }];
    onChange(next);
    onCommit?.(next);
  };
  const removeRow = (idx: number) => {
    const next = rows.filter((_, i) => i !== idx);
    onChange(next);
    onCommit?.(next);
  };

  const cellStyle = (bad: boolean): React.CSSProperties => ({
    width: '100%', boxSizing: 'border-box', background: C.input, color: C.text,
    border: `1px solid ${bad ? ERR : C.line}`, borderRadius: 3, padding: '3px 5px',
    fontSize: 11, fontFamily: 'inherit', textAlign: 'start', minWidth: 0,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      {/* גלילה אופקית בתוך המיכל - הטבלה רחבה, המסך לא נגלל בגללה */}
      <div style={{ overflowX: 'auto', overflowY: 'visible', border: `1px solid ${C.border}`, borderRadius: 4 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 'max-content' }}>
          <thead>
            <tr style={{ background: C.head }}>
              <th style={{ padding: '4px 6px', fontSize: 10, color: C.muted, fontWeight: 'bold', borderBottom: `1px solid ${C.border}`, width: LEAD_W, ...(frozen > 0 ? { position: 'sticky', insetInlineStart: 0, zIndex: 2, background: C.head } : {}) }}>#</th>
              {AIM_POINT_COLUMNS.map((col, ci) => (
                <th key={col.key} style={{ padding: '4px 6px', fontSize: 10, color: C.text, fontWeight: 'bold', borderBottom: `1px solid ${C.border}`, textAlign: 'start', minWidth: col.width, whiteSpace: 'nowrap', ...frozenCell(ci, C.head) }}>
                  {tr(col.labelKey)}
                </th>
              ))}
              {!readOnly && <th style={{ borderBottom: `1px solid ${C.border}`, width: 28 }} />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const bad = invalidAimPointFields(row);
              const ms = fuzeMs(row.fuze);
              // רקע אטום לתאים המקובעים: תא דביק שקוף היה מראה את מה שנגלל תחתיו
              const rowBg = idx % 2 ? C.rowAlt : C.panel;
              return (
                <tr key={idx} style={{ background: idx % 2 ? C.rowAlt : 'transparent' }}>
                  <td style={{ padding: '3px 6px', fontSize: 10, color: C.muted, textAlign: 'center', borderBottom: `1px solid ${C.line}`, ...(frozen > 0 ? { position: 'sticky', insetInlineStart: 0, zIndex: 2, background: rowBg } : {}) }}>{idx + 1}</td>
                  {AIM_POINT_COLUMNS.map((col, ci) => (
                    <td key={col.key} style={{ padding: '3px 4px', borderBottom: `1px solid ${C.line}`, minWidth: col.width, ...frozenCell(ci, rowBg) }}>
                      {readOnly ? (
                        <span style={{ fontSize: 11, color: C.text }}>{aimFieldText(row, col.key) || '—'}</span>
                      ) : col.kind === 'coord' ? (
                        <CoordFields
                          value={row.coord}
                          C={C}
                          bad={bad.has('coord')}
                          onChange={v => setCell(idx, 'coord', v)}
                          onCommit={v => commitCell(idx, 'coord', v)}
                        />
                      ) : col.kind === 'flag' ? (
                        // דגל = מתג. "עצור תקיפה" נצבע אדום כשהוא דלוק - הוא
                        // הדגל היחיד שאומר לא לתקוף, ואסור שייראה כמו השאר.
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', userSelect: 'none' }}>
                          <input
                            type="checkbox"
                            checked={row[col.key] === true}
                            onChange={e => commitCell(idx, col.key, e.target.checked)}
                            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: col.key === 'abort_attack' ? ERR : undefined, margin: 0 }}
                          />
                          {row[col.key] === true && col.key === 'abort_attack' && (
                            <span style={{ color: ERR, fontSize: 11, fontWeight: 'bold' }}>⛔</span>
                          )}
                        </label>
                      ) : (
                        <>
                          <input
                            value={String(row[col.key] ?? '')}
                            list={col.kind === 'armament' ? listId : undefined}
                            inputMode={col.kind === 'number' ? 'decimal' : undefined}
                            placeholder={tr(col.labelKey)}
                            title={col.hintKey ? tr(col.hintKey) : undefined}
                            onChange={e => setCell(idx, col.key, e.target.value)}
                            onBlur={e => commitCell(idx, col.key, e.target.value)}
                            style={cellStyle(bad.has(col.key))}
                          />
                          {col.key === 'fuze' && ms !== null && (
                            <div style={{ fontSize: 9, color: C.muted, paddingTop: 1 }}>{tr('strips.aimFuzeMs', { ms })}</div>
                          )}
                        </>
                      )}
                    </td>
                  ))}
                  {!readOnly && (
                    <td style={{ padding: '3px 4px', borderBottom: `1px solid ${C.line}`, textAlign: 'center' }}>
                      <button
                        onClick={() => removeRow(idx)}
                        title={tr('strips.removeAimPoint')}
                        style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: 3, padding: '2px 6px', fontSize: 11, cursor: 'pointer', lineHeight: 1 }}
                      >✕</button>
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={AIM_POINT_COLUMNS.length + (readOnly ? 1 : 2)} style={{ padding: '10px', textAlign: 'center', color: C.muted, fontSize: 11, fontStyle: 'italic' }}>
                  {tr('strips.noAimPoints')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* תפריט החימושים - אותו קטלוג של ניהול חימושי הפ"מ, לא רשימה נפרדת */}
      {!readOnly && (
        <datalist id={listId}>
          {armaments.map((n, i) => <option key={i} value={n} />)}
        </datalist>
      )}

      {!readOnly && (
        <button
          onClick={addRow}
          style={{ alignSelf: 'flex-start', background: '#2563eb', color: 'white', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 11, cursor: 'pointer' }}
        >{tr('strips.addAimPoint')}</button>
      )}
    </div>
  );
};

// ── חלון העריכה הצף ──────────────────────────────────────────────────────────

interface WindowProps extends TableProps {
  onClose: () => void;
  /** שם הפ"מ, לכותרת - הפקח פותח כמה חלונות ומזהה אותם לפי הכותרת */
  title?: string;
  /** מיקום פתיחה (px אמיתיים). ברירת מחדל: ממורכז */
  anchor?: { left: number; top: number } | null;
}

export const AimPointsWindow = ({ onClose, title, anchor, ...tableProps }: WindowProps) => {
  const themeMode = tableProps.themeMode ?? 'dark';
  const C = palette(themeMode);
  const winRef = useRef<HTMLDivElement | null>(null);
  const drag = useDragPosition(winRef);

  // ה-portal יושב מחוץ ל-#root ולכן אינו מקבל את `zoom: var(--s)` - מוחל כאן
  // ידנית, אחרת החלון נשאר בגודל 15.6" על מסך 24" (ראה /ui-adapt §מלכודת ה-Portal).
  const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const count = toAimPoints(tableProps.value).filter(p => !isEmptyAimPoint(p)).length;

  return createPortal(
    <div
      ref={winRef}
      style={{
        position: 'fixed', zIndex: 9600, zoom: 'var(--s)' as unknown as number,
        ...(drag.dragged
          ? { left: drag.pos!.x, top: drag.pos!.y }
          : anchor
            ? { left: anchor.left / s, top: anchor.top / s }
            : { left: '50%', top: '12%', transform: 'translateX(-50%)' }),
        width: 'min(1140px, calc(94vw / var(--s, 1)))',
        maxHeight: 'calc(80vh / var(--s, 1))',
        display: 'flex', flexDirection: 'column',
        background: C.panel, color: C.text, direction: i18n.dir(),
        boxShadow: '0 10px 34px rgba(0,0,0,0.5)',
        // חלון **עריכה** - מסגרת כתומה לפי קוד הצבע המשותף (CLAUDE.md §מסגרת חלון)
        ...windowFrame('edit', themeMode, 8),
        overflow: 'hidden',
      }}
    >
      <div
        {...drag.handleProps}
        style={{ ...drag.handleProps.style, background: C.head, borderBottom: `1px solid ${C.border}`, padding: '5px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0 }}
      >
        <span style={{ fontSize: 12, fontWeight: 'bold' }}>
          {tr('strips.aimPointsTable')}{title ? ` · ${title}` : ''}
          <span style={{ color: C.muted, fontWeight: 'normal', marginInlineStart: 6 }}>{tr('strips.aimPointsCount', { count })}</span>
        </span>
        {/* `stopPropagation` על ה-pointerdown: הכפתור יושב **בתוך** ידית הגרירה,
            שתופסת את המצביע (`setPointerCapture`) - ובלי העצירה הלחיצה נבלעה
            בגרירה ולא הגיעה ל-onClick, כלומר ה-X לא סגר את החלון. */}
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={onClose}
          title={tr('shared.close')}
          style={{ background: 'none', border: 'none', color: C.text, fontSize: 15, cursor: 'pointer', lineHeight: 1, padding: '0 6px' }}
        >✕</button>
      </div>
      <div style={{ overflow: 'auto', padding: 8, minWidth: 0 }}>
        <AimPointsTable {...tableProps} themeMode={themeMode} />
      </div>
    </div>,
    document.body
  );
};

export default AimPointsTable;
