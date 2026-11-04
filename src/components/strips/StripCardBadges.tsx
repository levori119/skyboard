import React from 'react';
import { tr } from '../../i18n/tr';
import { formationCount, takeoffUrgency } from '../../utils/takeoffUrgency';

/**
 * תגיות כרטיס הפ"מ ברשימת הפ"ממים (מפה וטבלה) - רכיב אחד לשתי הרשימות.
 *
 * - **זמן המראה** בולט: גדול ועבה יותר. ממריא בעוד ≤10 דק' - כתום; הגיע הזמן
 *   ועדיין לא באוויר - אדום מהבהב. הצבעים הם צבעי סטטוס ולכן קבועים בכל התמות.
 * - **כמות המטוסים** - "×4" ליד הטייסת.
 */
export function TakeoffBadge({ takeoff, airborne, label, lightMode }: { takeoff: string | null | undefined; airborne: boolean; label: string; lightMode: boolean }) {
  if (!label) return null;
  const u = takeoffUrgency(takeoff, airborne);
  const bg = u === 'now' ? '#dc2626' : u === 'soon' ? '#d97706' : (lightMode ? '#e2e8f0' : '#0f172a');
  const fg = u === 'none' ? (lightMode ? '#1e293b' : '#e2e8f0') : 'white';
  return (
    <span data-testid="takeoff-badge" data-urgency={u}
      title={u === 'now' ? tr('ctrl.takeoffNow') : u === 'soon' ? tr('ctrl.takeoffSoon') : undefined}
      className={u === 'now' ? 'takeoff-now-blink' : undefined}
      style={{
        fontSize: '12px', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums', color: fg, background: bg,
        padding: '1px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap',
        border: u === 'none' ? `1px solid ${lightMode ? '#cbd5e1' : '#334155'}` : '1px solid transparent',
      }}>
      {u === 'now' && <style>{'@keyframes takeoffNowBlink{0%,100%{opacity:1}50%{opacity:.55}} .takeoff-now-blink{animation:takeoffNowBlink 1s step-end infinite}'}</style>}
      🕐 {label}
    </span>
  );
}

export function FormationCountBadge({ strip, lightMode, textColor }: { strip: any; lightMode: boolean; textColor: string }) {
  const n = formationCount(strip);
  if (n === null) return null;
  return (
    <span data-testid="avail-strip-count" title={tr('ctrl.aircraftCount', { count: n })}
      style={{ direction: 'ltr', unicodeBidi: 'isolate', fontSize: '10px', fontWeight: 'bold', flexShrink: 0, color: textColor, border: `1px solid ${lightMode ? '#cbd5e1' : '#475569'}`, borderRadius: '4px', padding: '0 4px', lineHeight: '14px' }}>
      ×{n}
    </span>
  );
}
