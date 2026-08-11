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
import {
  AIM_POINT_COLUMNS, EMPTY_AIM_POINT, formatAimPointSummary, fuzeMs,
  invalidAimPointFields, isEmptyAimPoint, normalizeCoord, toAimPoints,
  type AimPoint,
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
  const armaments = useArmamentNames();
  const listId = useRef(`aim-arm-${Math.random().toString(36).slice(2)}`).current;
  const rows = value;

  const setCell = (idx: number, key: keyof AimPoint, val: string) => {
    onChange(rows.map((r, i) => i === idx ? { ...r, [key]: val } : r));
  };
  const commitCell = (idx: number, key: keyof AimPoint, val: string) => {
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
              <th style={{ padding: '4px 6px', fontSize: 10, color: C.muted, fontWeight: 'bold', borderBottom: `1px solid ${C.border}`, width: 30 }}>#</th>
              {AIM_POINT_COLUMNS.map(col => (
                <th key={col.key} style={{ padding: '4px 6px', fontSize: 10, color: C.text, fontWeight: 'bold', borderBottom: `1px solid ${C.border}`, textAlign: 'start', minWidth: col.width, whiteSpace: 'nowrap' }}>
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
              return (
                <tr key={idx} style={{ background: idx % 2 ? C.rowAlt : 'transparent' }}>
                  <td style={{ padding: '3px 6px', fontSize: 10, color: C.muted, textAlign: 'center', borderBottom: `1px solid ${C.line}` }}>{idx + 1}</td>
                  {AIM_POINT_COLUMNS.map(col => (
                    <td key={col.key} style={{ padding: '3px 4px', borderBottom: `1px solid ${C.line}`, minWidth: col.width }}>
                      {readOnly ? (
                        <span style={{ fontSize: 11, color: C.text }}>{row[col.key] || '—'}</span>
                      ) : (
                        <>
                          <input
                            value={row[col.key]}
                            list={col.kind === 'armament' ? listId : undefined}
                            inputMode={col.kind === 'number' ? 'decimal' : undefined}
                            placeholder={tr(col.labelKey)}
                            title={col.hintKey ? tr(col.hintKey) : undefined}
                            onChange={e => setCell(idx, col.key, e.target.value)}
                            onBlur={e => {
                              // נ"צ מודבק כ-17 ספרות רצופות מסודר לפורמט ברגע שעוזבים את השדה
                              const val = col.kind === 'coord' ? normalizeCoord(e.target.value) : e.target.value;
                              commitCell(idx, col.key, val);
                            }}
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
        <button onClick={onClose} title={tr('shared.close')} style={{ background: 'none', border: 'none', color: C.text, fontSize: 15, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>✕</button>
      </div>
      <div style={{ overflow: 'auto', padding: 8, minWidth: 0 }}>
        <AimPointsTable {...tableProps} themeMode={themeMode} />
      </div>
    </div>,
    document.body
  );
};

export default AimPointsTable;
