// ─── ביטול פעולה (CTRL+Z) ──────────────────────────────────────────────────────
// רכיב יחיד שמותקן פעם אחת ב-App: מאזין ל-CTRL+Z בכל המערכת, שואל את השרת מה
// הפעולה הבאה לביטול, ומציג חלון אישור לפני שהוא מבצע.
//
// **אישור לפני ביצוע, תמיד.** זו דרישת האפיון ועקרון UX #8 של SKY-KING: לא
// מחיקה שקטה. הפקח רואה *מה* מתבטל, *מתי* זה נעשה, וכשמישהו אחר נגע באותה
// רשומה מאז - גם את זה, לפני שהוא מחליט.
//
// מאזין אחד ולא אחד לכל מסך: אותו שיקול כמו ביירוט ה-fetch. מסך חדש מקבל
// CTRL+Z אוטומטית, ואין שני מאזינים שנאבקים על אותה הקשה.

import React from 'react';
import { readStoredThemeMode, type ThemeMode } from '../../utils/themeMode';
import { windowFrame } from '../../utils/windowFrame';
import { tr } from '../../i18n/tr';
import {
  fetchNextUndo, applyUndo, undoLabel, relativeAge,
  type UndoAction, type UndoConflict,
} from '../../utils/undoApi';

// פלטה לפי התמה - אין צבעים קשיחים ברכיב (ראה /ui-adapt).
// `warn` הוא צבע סטטוס (התנגשות) ולכן זהה בשלוש התמות, כמו שאר צבעי הסטטוס.
const theme = (mode: ThemeMode) => mode === 'ocean' ? {
  surface: '#05404e', text: '#cffafe', muted: '#7dd3fc', chip: '#033240', cancel: '#0e7490',
} : mode === 'light' ? {
  surface: '#f8fafc', text: '#0f172a', muted: '#475569', chip: '#e2e8f0', cancel: '#cbd5e1',
} : {
  surface: '#1e293b', text: '#e2e8f0', muted: '#94a3b8', chip: '#0f172a', cancel: '#334155',
};

const WARN = '#f59e0b';
const DANGER = '#ef4444';

/** מעל כל חלון צף במערכת (דסק חופשי 9500, סרגל מוגדל 9600) ומתחת ל-ConfirmModal. */
const Z_UNDO = 99000;

type Phase = 'idle' | 'loading' | 'confirm' | 'working' | 'result';

interface Pending {
  action: UndoAction;
  conflicts: UndoConflict[];
  tables: string[];
  blocked?: { table: string; reason: string };
}

/**
 * האם ההקשה שייכת לשדה עריכה.
 *
 * בשדה טקסט CTRL+Z הוא ה-undo של הדפדפן - הפקח מתקן הקלדה, לא מבטל פעולה
 * במערכת. חטיפת ההקשה שם הייתה הופכת תיקון אות לביטול של שינוי ב-DB.
 * מקרה 4 במטריצה (UNDO_SPEC.md §5).
 */
export function isEditableTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node || typeof node.closest !== 'function') return false;
  if (node.isContentEditable) return true;
  const tag = String(node.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** האם ההקשה היא CTRL+Z (ולא CTRL+SHIFT+Z, שהוא חזרה קדימה ואינו בהיקף). */
export function isUndoHotkey(e: KeyboardEvent): boolean {
  if (e.defaultPrevented) return false;            // מסך שכבר טיפל בהקשה בעצמו
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return false;
  return String(e.key).toLowerCase() === 'z';
}

const UndoManager: React.FC = () => {
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [message, setMessage] = React.useState<string>('');
  const [themeMode, setThemeMode] = React.useState<ThemeMode>('dark');
  const busy = React.useRef(false);

  const T = theme(themeMode);

  const close = React.useCallback(() => {
    setPhase('idle');
    setPending(null);
    busy.current = false;
  }, []);

  const showMessage = React.useCallback((text: string) => {
    setMessage(text);
    setPhase('result');
    setPending(null);
    busy.current = false;
    window.setTimeout(() => setPhase(p => (p === 'result' ? 'idle' : p)), 2600);
  }, []);

  const startUndo = React.useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setThemeMode(readStoredThemeMode());
    setPhase('loading');
    try {
      const next = await fetchNextUndo();
      if (!next.action) return showMessage(tr('undo.nothingToUndo'));
      setPending({
        action: next.action,
        conflicts: next.conflicts || [],
        tables: next.tables || [],
        blocked: next.blocked,
      });
      setPhase('confirm');
      busy.current = false;
    } catch {
      showMessage(tr('undo.checkFailed'));
    }
  }, [showMessage]);

  const confirm = React.useCallback(async () => {
    if (!pending || busy.current) return;
    busy.current = true;
    setPhase('working');
    const res = await applyUndo(pending.action.id, pending.conflicts.length > 0);
    if (res.ok) return showMessage(tr('undo.done'));
    // התנגשות שנוצרה **בין** התצוגה המקדימה לאישור: מישהו כתב בזמן שהחלון היה
    // פתוח. חוזרים לאישור עם האזהרה המעודכנת במקום לדרוס בשקט.
    if (res.conflicts?.length) {
      setPending(p => (p ? { ...p, conflicts: res.conflicts as UndoConflict[] } : p));
      setPhase('confirm');
      busy.current = false;
      return;
    }
    showMessage(res.error === 'expired' ? tr('undo.expired')
      : res.error === 'denied' ? tr('undo.denied')
      : tr('undo.failed'));
  }, [pending, showMessage]);

  // ── המאזין הגלובלי ────────────────────────────────────────────────────────
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isUndoHotkey(e) || isEditableTarget(e.target)) return;
      e.preventDefault();
      startUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startUndo]);

  // Esc סוגר, Enter מאשר - הפקח לא צריך לחפש את הכפתור
  React.useEffect(() => {
    if (phase !== 'confirm') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Enter')  { e.preventDefault(); confirm(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, close, confirm]);

  if (phase === 'idle') return null;

  // הודעה קצרה (אין מה לבטל / בוצע / נכשל) - רצועה, לא חלון
  if (phase === 'result') {
    return (
      <div style={{
        position: 'fixed', insetBlockEnd: 24, insetInlineStart: '50%', transform: 'translateX(-50%)',
        zIndex: Z_UNDO, background: T.surface, color: T.text,
        padding: '10px 22px', fontSize: 15, fontWeight: 600,
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        ...windowFrame('view', themeMode, 10),
      }}>
        {message}
      </div>
    );
  }

  const action = pending?.action;
  const conflicts = pending?.conflicts || [];
  const blocked = pending?.blocked || (action && !action.undoable);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: Z_UNDO,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: T.surface, color: T.text,
        padding: '26px 30px', minWidth: 360, maxWidth: 520,
        boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
        // מסגרת כתומה: החלון קיים כדי **לשנות תוכן**, וזה מה שכתום אומר
        // במערכת (CLAUDE.md §מסגרת חלון).
        ...windowFrame('edit', themeMode, 14),
      }}>
        <div style={{ fontSize: 13, color: T.muted, marginBlockEnd: 6, letterSpacing: 0.5 }}>
          {tr('undo.title')}
        </div>

        {phase === 'loading' || !action ? (
          <div style={{ fontSize: 17, paddingBlock: 14 }}>{tr('undo.checking')}</div>
        ) : (
          <>
            <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.4, marginBlockEnd: 10 }}>
              {undoLabel(action)}
            </div>
            <div style={{ fontSize: 14, color: T.muted, marginBlockEnd: conflicts.length || blocked ? 16 : 22 }}>
              {relativeAge(action.createdAt)}
              {action.rowCount > 1 ? ` · ${tr('undo.rowCount', { count: action.rowCount })}` : ''}
            </div>

            {blocked && (
              <div style={{
                background: T.chip, borderInlineStart: `4px solid ${DANGER}`,
                padding: '10px 14px', borderRadius: 8, fontSize: 14, marginBlockEnd: 20,
              }}>
                {tr('undo.blockedExplain')}
              </div>
            )}

            {!blocked && conflicts.length > 0 && (
              <div style={{
                background: T.chip, borderInlineStart: `4px solid ${WARN}`,
                padding: '10px 14px', borderRadius: 8, fontSize: 14, marginBlockEnd: 20,
              }}>
                <div style={{ fontWeight: 700, color: WARN, marginBlockEnd: 4 }}>
                  {tr('undo.conflictTitle')}
                </div>
                <div>{tr(`undo.conflict_${conflicts[0].type}`, { count: conflicts.length })}</div>
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBlockStart: 4 }}>
          {!blocked && action && (
            <button
              autoFocus
              disabled={phase === 'working'}
              onClick={confirm}
              style={{
                background: conflicts.length ? WARN : DANGER, color: '#fff', border: 'none',
                borderRadius: 8, padding: '10px 26px', fontSize: 15, fontWeight: 700,
                cursor: phase === 'working' ? 'wait' : 'pointer', opacity: phase === 'working' ? 0.7 : 1,
              }}
            >
              {phase === 'working' ? tr('undo.working')
                : conflicts.length ? tr('undo.confirmAnyway') : tr('undo.confirm')}
            </button>
          )}
          <button
            onClick={close}
            style={{
              background: T.cancel, color: T.text, border: 'none',
              borderRadius: 8, padding: '10px 26px', fontSize: 15, cursor: 'pointer',
            }}
          >
            {blocked ? tr('undo.close') : tr('undo.keep')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UndoManager;
