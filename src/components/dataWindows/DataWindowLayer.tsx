import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../../i18n/tr';
import { qMinutesFromNow, type QEvalCtx } from '../../utils/queryBuilder';
import { QueryBuilder } from '../query/QueryBuilder';
import { windowFrame } from '../../utils/windowFrame';
import {
  dwEvaluate, dwLoadSession, dwMergeSession, dwNextMode, dwNormalize, dwSaveSession, dwStripLabel, dwSubscribe,
  type DataWindowDef,
} from '../../utils/dataWindows';

// ─── חלונות נתונים צפים ───────────────────────────────────────────────────────
// מונים מוגדרי-שאילתא שצפים מעל מפת השדה. ההגדרה מגיעה מהעמדה; הפקח מזיז,
// מסתיר ומרחיב בסשן שלו בלבד.
//
// שני דברים שקל לפספס כאן:
// 1. **הזמן זז.** "נוחת בעוד פחות מ-15 דקות" נכון רק ביחס לרגע החישוב, ולכן
//    יש טיק שמרענן את המונים גם כשרשימת הפ"מים לא השתנתה.
// 2. **`#root` תחת `zoom: var(--s)`.** `clientX/clientY` הם בפיקסלים לא-מוגדלים
//    ואילו `left/top` כאן הם ביחידות מוגדלות - בלי חלוקה ב---s החלון "בורח"
//    מהעכבר/עט במסכי 18" ו-24".

/** כל כמה זמן המונים נחשבים מחדש. 15 שניות = רבע דקה, מספיק לרזולוציה של דקות */
const TICK_MS = 15000;

// גודל קבוע לכל חלון: לוח החלונות נשאר יציב ולא מסתדר מחדש עם כל שינוי.
// שני גבהים בלבד, לפי מצב התצוגה - מונה נקי הוא מספר אחד ולא צריך את הגובה
// של רשימה, ובחלון קטן יותר נכנסים יותר מונים על המפה בלי להסתיר אותה.
// מתחת לתפריטי הסרגל העליון (2999/3000) ומעל תוכן המפה. חלון צף שמכסה את
// תפריט "הגדרות עמדה" הוא בדיוק המצב שבו הפקח לא מצליח לכבות אותו.
const DW_Z = 2500;
const DW_WIDTH = 230;
const DW_BODY_HEIGHT = 132;
const DW_BODY_HEIGHT_COUNT = DW_BODY_HEIGHT / 2;

const readRootScale = (): number => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--s');
  const n = parseFloat(raw);
  return isFinite(n) && n > 0 ? n : 1;
};

type ThemeMode = 'light' | 'dark' | 'ocean';

/** ocean היא תמה **כהה** - אסור לגזור אותה מ"כל מה שאינו dark" */
const themeColors = (theme: ThemeMode) => theme === 'light'
  ? { panel: '#f1f5f9', header: '#e2e8f0', border: '#94a3b8', text: '#1e293b', dim: '#475569' }
  : theme === 'ocean'
  ? { panel: '#05404e', header: '#0a5568', border: '#0e7490', text: '#cffafe', dim: '#7dd3fc' }
  : { panel: '#0f172a', header: '#1e293b', border: '#334155', text: '#e2e8f0', dim: '#94a3b8' };

/** צבע סטטוס - קבוע בכל התמות, הוא נושא משמעות */
const WARN_COLOR = '#f97316';

export interface DataWindowLayerProps {
  /** הגדרת החלונות של העמדה (`workstation_presets.data_windows`) */
  windows: unknown;
  /** הפ"מים שהחלונות סופרים */
  strips: any[];
  /** context להערכת השאילתא - הבסיס שלי, שם העמדה, בסיסי תעופה */
  evalCtx?: Omit<QEvalCtx, 'now'>;
  presetId: number | string | null | undefined;
  themeMode?: ThemeMode;
  /** קליק על או"ק בחלון - קפיצה לפ"מ */
  onSelectCallsign?: (callsign: string) => void;
}

export const DataWindowLayer: React.FC<DataWindowLayerProps> = ({
  windows, strips, evalCtx, presetId, themeMode = 'dark', onSelectCallsign,
}) => {
  const base = useMemo(() => dwNormalize(windows), [JSON.stringify(windows)]);
  const [session, setSession] = useState<DataWindowDef[]>(() => dwLoadSession(presetId));
  const [now, setNow] = useState(() => Date.now());
  /** החלון שהשאילתא שלו נערכת כרגע בעמדה */
  const [editingId, setEditingId] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  useEffect(() => { setSession(dwLoadSession(presetId)); }, [presetId]);
  // שכבת החלונות וסרגל השחזור חולקים את אותו סשן - כל שמירה מסנכרנת את שניהם
  useEffect(() => dwSubscribe(() => setSession(dwLoadSession(presetId))), [presetId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  const merged = useMemo(() => dwMergeSession(base, session), [base, session]);
  const editing = merged.find(w => w.id === editingId) || null;

  /** ביטול השינוי בסשן - החלון חוזר לשאילתא של העמדה */
  const clearSessionQuery = (id: string) => {
    const fromStation = base.find(w => w.id === id);
    patchSession(id, { query: fromStation ? fromStation.query : null, edited: false });
  };

  const patchSession = (id: string, patch: Partial<DataWindowDef>) => {
    setSession(prev => {
      const idx = prev.findIndex(w => w.id === id);
      const current = prev[idx] || merged.find(w => w.id === id);
      if (!current) return prev;
      const next = idx >= 0
        ? prev.map((w, i) => i === idx ? { ...w, ...patch } : w)
        : [...prev, { ...current, ...patch }];
      dwSaveSession(presetId, next);
      return next;
    });
  };

  const C = themeColors(themeMode);
  const visible = merged.filter(w => !w.hidden);
  if (!visible.length) return null;

  return (
    <>
      {visible.map(w => {
        const res = dwEvaluate(strips, w, { ...evalCtx, now });
        const accent = res.warn ? WARN_COLOR : w.color;
        const showList = w.mode === 'count_callsigns';
        const showStrips = w.mode === 'count_strips';
        return (
          <div
            key={w.id}
            style={{
              position: 'fixed', left: w.x, top: w.y, zIndex: DW_Z,
              width: `${DW_WIDTH}px`,
              background: C.panel, border: `2px solid ${accent}`, borderRadius: '10px',
              boxShadow: '0 6px 24px rgba(0,0,0,0.45)', overflow: 'hidden', direction: 'rtl',
            }}
          >
            <div
              // גרירה בעט/מגע: pointer capture + touchAction none, אחרת המסך גולל במקום להזיז
              onPointerDown={e => {
                // ⚠ כפתורי הכותרת אינם ידית גרירה. בלי היציאה הזו ה-pointer
                // capture על הכותרת בולע את ה-click שלהם, והם פשוט לא נלחצים.
                if ((e.target as HTMLElement).closest('button')) return;
                const s = readRootScale();
                dragRef.current = { id: w.id, dx: e.clientX / s - w.x, dy: e.clientY / s - w.y };
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={e => {
                const d = dragRef.current;
                if (!d || d.id !== w.id) return;
                const s = readRootScale();
                patchSession(w.id, { x: Math.max(0, e.clientX / s - d.dx), y: Math.max(0, e.clientY / s - d.dy) });
              }}
              onPointerUp={e => {
                dragRef.current = null;
                try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* כבר שוחרר */ }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px',
                background: C.header, borderBottom: `1px solid ${C.border}`,
                cursor: 'grab', touchAction: 'none', userSelect: 'none',
              }}
            >
              <span style={{ flex: 1, color: C.text, fontWeight: 'bold', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {w.title || tr('dataWindows.untitled')}
                {w.edited && <span title={tr('dataWindows.editedInSession')} style={{ color: WARN_COLOR, marginInlineStart: '4px' }}>✎</span>}
              </span>
              <button
                onClick={() => setEditingId(w.id)}
                title={tr('dataWindows.editQuery')}
                style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.dim, borderRadius: '4px', padding: '1px 6px', fontSize: '11px', cursor: 'pointer' }}
              >✎</button>
              <button
                onClick={() => patchSession(w.id, { mode: dwNextMode(w.mode) })}
                title={showStrips ? tr('dataWindows.showCountOnly') : showList ? tr('dataWindows.showStrips') : tr('dataWindows.showCallsigns')}
                style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.dim, borderRadius: '4px', padding: '1px 6px', fontSize: '11px', cursor: 'pointer' }}
              >{showStrips ? '⊡' : '⊞'}</button>
              <button
                onClick={() => patchSession(w.id, { hidden: true })}
                title={tr('dataWindows.hide')}
                style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.dim, borderRadius: '4px', padding: '1px 6px', fontSize: '11px', cursor: 'pointer' }}
              >✕</button>
            </div>

            <div style={{ height: `${showList || showStrips ? DW_BODY_HEIGHT : DW_BODY_HEIGHT_COUNT}px`, padding: '4px 8px 8px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: showList || showStrips ? 'flex-start' : 'center', boxSizing: 'border-box', overflow: 'hidden' }}>
              {res.unconfigured ? (
                <div style={{ color: C.dim, fontSize: '11px', padding: '6px 0' }}>{tr('dataWindows.noQuery')}</div>
              ) : (
                <>
                  <div style={{ color: accent, fontSize: '34px', fontWeight: 'bold', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {res.count}
                  </div>
                  {showList && (
                    <div style={{ marginTop: '5px', flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center', alignContent: 'flex-start' }}>
                      {res.callsigns.length === 0
                        ? <span style={{ color: C.dim, fontSize: '11px' }}>{tr('dataWindows.none')}</span>
                        : res.callsigns.map((cs, i) => (
                          <span key={`${cs}-${i}`}
                            onClick={() => onSelectCallsign?.(cs)}
                            style={{ color: C.text, fontSize: '11px', background: C.header, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '1px 5px', cursor: onSelectCallsign ? 'pointer' : 'default' }}>
                            {cs}
                          </span>
                        ))}
                    </div>
                  )}
                  {showStrips && (
                    // שורת פ"מ ולא כרטיס: החלון צף מעל המפה, וכרטיס מלא היה
                    // מכסה את השדה. או"ק · מצבה · גובה/משימה · דקות לנחיתה.
                    <div style={{ marginTop: '6px', flex: 1, minHeight: 0, overflowY: 'auto', textAlign: 'start' }}>
                      {res.strips.length === 0
                        ? <div style={{ color: C.dim, fontSize: '11px', textAlign: 'center' }}>{tr('dataWindows.none')}</div>
                        : res.strips.map((s: any, i: number) => {
                          const eta = qMinutesFromNow(s.planned_landing_time, now);
                          return (
                            <div key={s.id ?? i}
                              onClick={() => onSelectCallsign?.(String(s.callSign || s.callsign || ''))}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 6px',
                                borderTop: i === 0 ? 'none' : `1px solid ${C.border}`,
                                cursor: onSelectCallsign ? 'pointer' : 'default', fontSize: '11px', color: C.text,
                              }}>
                              <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>{dwStripLabel(s)}</span>
                              <span style={{ color: C.dim, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {[s.alt, s.task].filter(Boolean).join(' · ')}
                              </span>
                              {eta != null && (
                                <span style={{ color: eta < 0 ? WARN_COLOR : accent, fontVariantNumeric: 'tabular-nums' }}>
                                  {Math.round(eta)}'
                                </span>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}

      {editing && createPortal(
        // portal ל-body כדי לצאת מהערימה של המפה. מחוץ ל-#root אין zoom,
        // ולכן הוא מוחזר ידנית - אחרת המודל יוצא זעיר במסכי 18"/24".
        <div
          onClick={e => { if (e.target === e.currentTarget) setEditingId(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 10000, zoom: 'var(--s, 1)' as any,
            background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 'calc(100vw / var(--s, 1))', height: 'calc(100vh / var(--s, 1))',
          }}>
          {/* עריכת השאילתא = חלון **עריכה**, ולכן מסגרת כתומה ולא צבע החלון
              עצמו - כך רואים מיד שזה מצב עריכה (CLAUDE.md §מסגרת חלון) */}
          <div style={{
            background: C.panel, ...windowFrame('edit', themeMode, 12),
            width: 'calc(560px)', maxWidth: 'calc(94vw / var(--s, 1))', maxHeight: 'calc(88vh / var(--s, 1))',
            overflowY: 'auto', direction: 'rtl', boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: C.header, borderBottom: `1px solid ${C.border}` }}>
              <span style={{ flex: 1, color: C.text, fontWeight: 'bold', fontSize: '14px' }}>
                🔍 {editing.title || tr('dataWindows.untitled')}
              </span>
              <button onClick={() => setEditingId(null)}
                style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.dim, borderRadius: '5px', padding: '2px 9px', cursor: 'pointer', fontSize: '13px' }}>✕</button>
            </div>
            <div style={{ padding: '10px 12px 14px' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: C.dim, lineHeight: 1.5 }}>
                {tr('dataWindows.sessionScopeHint')}
              </p>
              <QueryBuilder
                value={editing.query}
                onChange={q => patchSession(editing.id, { query: q, edited: true })}
                label={tr('dataWindows.windowQuery')}
              />
              {editing.edited && (
                <button
                  onClick={() => { clearSessionQuery(editing.id); }}
                  style={{ marginTop: '10px', padding: '5px 12px', background: 'transparent', border: `1px solid ${WARN_COLOR}`, color: WARN_COLOR, borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                  {tr('dataWindows.resetToStation')}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

/**
 * סרגל החזרה: חלון שהוסתר בסשן חייב דרך חזרה, אחרת ההסתרה היא מחיקה בפועל
 * עד סוף המשמרת.
 */
export const DataWindowRestoreBar: React.FC<{
  windows: unknown;
  presetId: number | string | null | undefined;
  themeMode?: ThemeMode;
}> = ({ windows, presetId, themeMode = 'dark' }) => {
  const base = useMemo(() => dwNormalize(windows), [JSON.stringify(windows)]);
  const [session, setSession] = useState<DataWindowDef[]>(() => dwLoadSession(presetId));
  useEffect(() => { setSession(dwLoadSession(presetId)); }, [presetId]);
  // שכבת החלונות וסרגל השחזור חולקים את אותו סשן - כל שמירה מסנכרנת את שניהם
  useEffect(() => dwSubscribe(() => setSession(dwLoadSession(presetId))), [presetId]);

  const hidden = dwMergeSession(base, session).filter(w => w.hidden);
  if (!hidden.length) return null;
  const C = themeColors(themeMode);

  const restore = (id: string) => {
    const next = session.some(w => w.id === id)
      ? session.map(w => w.id === id ? { ...w, hidden: false } : w)
      : [...session, { ...(base.find(w => w.id === id) as DataWindowDef), hidden: false }];
    dwSaveSession(presetId, next);
    setSession(next);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', direction: 'rtl' }}>
      <span style={{ color: C.dim, fontSize: '11px' }}>{tr('dataWindows.hiddenWindows')}</span>
      {hidden.map(w => (
        <button key={w.id} onClick={() => restore(w.id)}
          style={{ background: C.header, border: `1px solid ${w.color}`, color: C.text, borderRadius: '5px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}>
          {w.title || tr('dataWindows.untitled')}
        </button>
      ))}
    </div>
  );
};

export default DataWindowLayer;
