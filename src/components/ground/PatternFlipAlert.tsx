/**
 * התראה מרוכזת: **היפוך הקפה עם מטוסים בהקפה** (PATTERN_FLIP_SPEC.md).
 *
 * הקצה של ההקפה כבר אינו בשימוש, ועליה מטוסים. הפקח מכריע **גורף + חריגים**:
 * כפתור אחד לכולם (ממשיכים / להקפה פעילה), ולכל מטוס בחירה משלו לפני האישור.
 *
 * ── למה בלי רקע מחשיך ──────────────────────────────────────────────────────
 * בניגוד להלאמה, כאן הפקח צריך **להמשיך לעבוד** בזמן שההתראה פתוחה: לראות את
 * המטוסים במפה, לדבר איתם, ואולי לגרור אחד ידנית (גרירה להקפה פעילה מוציאה
 * אותו מההתראה - #12). חלון שחוסם את המפה היה מכריח אותו להכריע בעיוורון.
 *
 * ── למה בלי ✕ ───────────────────────────────────────────────────────────────
 * ההתראה **אינה מצב מקומי**: היא קיימת כל עוד בשרת יש מטוס `pending`, ולכן
 * היא מופיעה בכל עמדות המגדל ונסגרת אצל כולן ברגע שאחת הכריעה. סגירה מקומית
 * הייתה משאירה את המטוס בלי הכרעה - ובלי שאיש יודע.
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../../i18n/tr';
import { bidiAuto } from '../../utils/bidi';
import { windowFrame, type FrameTheme } from '../../utils/windowFrame';
import { seizurePalette } from '../seizure/seizureTheme';
import { aircraftKey, PATTERN_KEPT_COLOR, type FlipChoice, type OrphanAircraftRow } from '../../utils/patternFlip';

export interface FlipPattern { id: number; runway_ident?: string | null; color?: string | null }

export interface FlipGroup {
  pattern: FlipPattern;
  aircraft: (OrphanAircraftRow & { label?: string })[];
  /** הקפות פעילות להעברה - הקצה הנגדי קודם (`flipTargets`). ריק = רק המשך. */
  targets: FlipPattern[];
}

interface Props {
  groups: FlipGroup[];
  themeMode: FrameTheme;
  onConfirm: (choices: { aircraft: OrphanAircraftRow; choice: FlipChoice }[]) => Promise<void> | void;
}

const ident = (p: FlipPattern) => String(p.runway_ident ?? '').trim();

/** שם יעד: "15", ולקצה עם כמה הקפות "15 (2)" - אחרת שתי אפשרויות נראות זהות. */
function targetName(p: FlipPattern, all: FlipPattern[]): string {
  const same = all.filter(x => ident(x) === ident(p));
  return same.length > 1 ? `${ident(p)} (${same.indexOf(p) + 1})` : ident(p);
}

/** ברירת המחדל: הקפת הקצה הנגדי. בלי יעד - ממשיך. */
const defaultChoice = (g: FlipGroup): FlipChoice => (g.targets[0] ? g.targets[0].id : 'keep');

export function PatternFlipAlertCard({ groups, themeMode, onConfirm }: Props) {
  const P = seizurePalette(themeMode);
  const [choices, setChoices] = useState<Record<string, FlipChoice>>({});
  const [busy, setBusy] = useState(false);
  if (!groups.length) return null;

  const choiceOf = (g: FlipGroup, a: OrphanAircraftRow) => choices[aircraftKey(a)] ?? defaultChoice(g);
  const setAll = (g: FlipGroup, c: FlipChoice) =>
    setChoices(prev => ({ ...prev, ...Object.fromEntries(g.aircraft.map(a => [aircraftKey(a), c])) }));

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(groups.flatMap(g => g.aircraft.map(a => ({ aircraft: a, choice: choiceOf(g, a) }))));
    } finally { setBusy(false); }
  };

  const chip = (active: boolean, color: string, label: string, onClick: () => void, testId: string) => (
    <button type="button" data-testid={testId} data-active={active ? '1' : '0'} onClick={onClick}
      style={{
        minHeight: 34, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 'bold',
        border: `2px solid ${color}`, background: active ? color : 'transparent',
        color: active ? '#0f172a' : color, touchAction: 'manipulation',
      }}>
      {bidiAuto(label)}
    </button>
  );

  return (
    <div data-testid="pattern-flip-alert" role="alertdialog"
      style={{
        position: 'fixed', top: 70, insetInline: 0, marginInline: 'auto', zIndex: 10550,
        width: 520, maxWidth: '94vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        background: P.panel, ...windowFrame('view', themeMode, 12),
        boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
      }}>
      {/* כותרת - צבע סטטוס (כתום = דורש הכרעה), מהבהבת כמו התראות ההקפה */}
      <div style={{
        background: PATTERN_KEPT_COLOR, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 10,
        borderStartStartRadius: 10, borderStartEndRadius: 10, animation: 'skyking-greens-row-blink 1s steps(1) infinite',
      }}>
        <span style={{ fontSize: 18 }}>🔄</span>
        <span style={{ color: '#0f172a', fontWeight: 'bold', fontSize: 15, flex: 1 }}>{tr('pattern.flipTitle')}</span>
      </div>

      <div style={{ padding: '10px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {groups.map(g => {
          const old = ident(g.pattern);
          const allKeep = g.aircraft.every(a => choiceOf(g, a) === 'keep');
          return (
            <div key={g.pattern.id} data-testid="pattern-flip-group" data-pattern-id={g.pattern.id}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ color: P.text, fontSize: 14 }}>
                {tr('pattern.flipBody', { rwy: old, count: g.aircraft.length })}
              </div>

              {/* גורף - פעולה אחת במקרה הרגיל */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {chip(allKeep, PATTERN_KEPT_COLOR, tr('pattern.flipKeepAll', { rwy: old }), () => setAll(g, 'keep'), 'flip-all-keep')}
                {g.targets.map(t => chip(
                  g.aircraft.every(a => choiceOf(g, a) === t.id), t.color || '#38bdf8',
                  tr('pattern.flipMoveAll', { rwy: targetName(t, g.targets) }), () => setAll(g, t.id), 'flip-all-move'))}
              </div>
              {!g.targets.length && (
                <div style={{ color: P.muted, fontSize: 12 }}>{tr('pattern.flipNoTargets')}</div>
              )}

              {/* חריגים - לכל מטוס */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {g.aircraft.map(a => {
                  const c = choiceOf(g, a);
                  return (
                    <div key={aircraftKey(a)} data-testid="pattern-flip-row" data-key={aircraftKey(a)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, background: P.panelAlt, borderRadius: 6, padding: '4px 8px', flexWrap: 'wrap' }}>
                      <span style={{ color: P.text, fontWeight: 'bold', minWidth: 90, fontSize: 14 }}>
                        ✈ {bidiAuto(a.label || String(a.aircraft_idx))}
                      </span>
                      <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {chip(c === 'keep', PATTERN_KEPT_COLOR, tr('pattern.flipKeep', { rwy: old }),
                          () => setChoices(p => ({ ...p, [aircraftKey(a)]: 'keep' })), 'flip-row-keep')}
                        {g.targets.map(t => chip(c === t.id, t.color || '#38bdf8', tr('pattern.flipTo', { rwy: targetName(t, g.targets) }),
                          () => setChoices(p => ({ ...p, [aircraftKey(a)]: t.id })), 'flip-row-move'))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: '9px 14px', borderTop: `1px solid ${P.line}`, background: P.panelAlt, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: P.muted, fontSize: 11, flex: 1 }}>{tr('pattern.flipShared')}</span>
        <button type="button" data-testid="pattern-flip-confirm" disabled={busy} onClick={confirm}
          style={{
            minHeight: 38, padding: '7px 24px', borderRadius: 6, border: '1px solid #16a34a',
            background: '#16a34a', color: '#fff', cursor: busy ? 'wait' : 'pointer', fontSize: 14, fontWeight: 'bold',
            opacity: busy ? 0.6 : 1,
          }}>
          ✔ {tr('pattern.flipConfirm')}
        </button>
      </div>
    </div>
  );
}

/** portal ל-body - מעל כל החלונות הצפים, כמו יתר ההתראות (`PatternAlertPopup`). */
export default function PatternFlipAlert(props: Props) {
  return createPortal(<PatternFlipAlertCard {...props} />, document.body);
}
