// פקד הנתק המדומה + מצב הסנכרון - פינה שמאלית תחתונה, בכל עמדה.
//
// מה הוא נותן: ניתוק של **העמדה הזו בלבד** מהמאגר המרכזי, בלחיצה אחת. השדה
// ממשיך לעבוד, שאר העמדות אינן יודעות דבר, והעמדה שנותקה עוברת לעבוד מול
// המאגר שלה. כשמחזירים את הקשר, מה שנעשה בנתק נדחף חזרה - ומה שמתנגש עולה
// להכרעה. זה מה שהופך "עמידות בנתק" ממסמך לדבר שאפשר לראות.
//
// למה הוא יושב ב-App ולא ב-SectorDashboard: הוא צריך להיות זמין בכל עמדה
// (בקר, מגדל, דסק, ניהול) בלי שכפול, בדיוק כמו `ConnectionBanner` שלצידו.
//
// /ui-adapt: מסתגל לשלוש התמות. צבעי הסטטוס (ענבר=נתק מדומה, אדום=סתירות)
// **קבועים** בכל תמה - הם נושאי משמעות. יושב ב-#root ולכן מקבל את זום ה---s
// וגדל יחד עם שאר הממשק.
//
// ⚠️ הכפתור נדלק **רק כשיש מה לעשות איתו**: בעמדה בלי מאגר מקומי הוא היה
// נראה כמו פיצ'ר שבור - נדלק ולא קורה דבר (CLAUDE.md §Do NOT). לכן בדפדפן
// הוא מדמה נתק דרך שכבת ה-offline, ומסביר בכותרת שאין מאגר מקומי.

import React from 'react';
import { tr } from '../../i18n/tr';
import { useBodyTheme } from '../../hooks/useBodyTheme';
import { windowFrame } from '../../utils/windowFrame';
import { formatAge } from '../../offline/useNetStatus';
import {
  getStationState, subscribeStation, refreshStationStatus, setSimulatedOutage,
  isSimulatedOutage, hasLocalDb,
} from '../../offline/stationMode';
import {
  getSyncState, subscribeSync, startSyncClient, pushPending, pullMirror,
} from '../../offline/syncClient';
import { getAgentState, subscribeAgent, agentOrigin } from '../../offline/stationAgent';
import SyncConflictsModal from './SyncConflictsModal';

/** צבעי משמעות - קבועים בכל תמה. */
const STATUS = {
  outage: '#f59e0b',   // ענבר - העמדה מנותקת בכוונה
  conflict: '#ef4444', // אדום - יש מה להכריע
  ok: '#22c55e',
};

const SURFACE: Record<'light' | 'dark' | 'ocean', { bg: string; text: string; sub: string; chip: string }> = {
  dark: { bg: '#0f172a', text: '#e2e8f0', sub: '#94a3b8', chip: 'rgba(148,163,184,.18)' },
  ocean: { bg: '#0b2a3a', text: '#e0f2fe', sub: '#7dd3fc', chip: 'rgba(125,211,252,.18)' },
  light: { bg: '#f8fafc', text: '#1e293b', sub: '#475569', chip: 'rgba(100,116,139,.16)' },
};

export default function OutageSimPanel() {
  const themeMode = useBodyTheme();
  const C = SURFACE[themeMode] || SURFACE.dark;

  const station = React.useSyncExternalStore(subscribeStation, getStationState, getStationState);
  const sync = React.useSyncExternalStore(subscribeSync, getSyncState, getSyncState);
  const agentState = React.useSyncExternalStore(subscribeAgent, getAgentState, getAgentState);
  const [open, setOpen] = React.useState(false);
  const [showConflicts, setShowConflicts] = React.useState(false);
  const [, tick] = React.useReducer((n: number) => n + 1, 0);

  const outage = isSimulatedOutage();
  const local = hasLocalDb();
  const since = station.station && typeof station.station === 'object' ? station.station.simulatedSince : null;

  React.useEffect(() => {
    void refreshStationStatus();
    return startSyncClient();
  }, []);

  // שעון הנתק מתקתק **רק** בזמן נתק. כשהכל תקין אין טיימר כלל - מסך בקרה לא
  // משלם רינדור לשנייה על חיווי שאינו משתנה (אותו שיקול כמו ב-useNetStatus).
  React.useEffect(() => {
    if (!outage) return;
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [outage]);

  /**
   * למה אין מאגר מקומי - ולא רק "אין".
   *
   * המשפט "נתק יאפשר צפייה בלבד" נכון, אבל הוא משאיר את הפקח בלי מושג מה
   * לעשות. שלוש הסיבות הן שלוש פעולות שונות לגמרי: להמתין, להתקין סוכן, או
   * לתקן את הכתובת שהסוכן מוגדר מולה.
   */
  const noLocalDbReason = () => {
    // יש שרת עמדה והוא מדווח שאין מאגר - שם הסיבה היא המאגר, לא הסוכן
    if (station.station !== false) return tr('sync.noLocalDb');
    if (agentState.reason === 'searching') return tr('sync.agentSearching');
    if (agentState.reason === 'mismatch') return tr('sync.agentMismatch');
    // חסימת הדפדפן אינה "אין סוכן": הסוכן רץ, וההכרעה בידי המפעיל. בלי
    // ההבחנה הזו הוא מחפש תקלה בשירות שעובד מצוין.
    if (agentState.reason === 'blocked') return tr('sync.agentBlocked');
    if (agentState.reason === 'prompt') return tr('sync.agentPrompt');
    return tr('sync.agentMissing', { origin: agentOrigin().replace(/^https?:\/\//, '') });
  };

  const conflicts = sync.conflicts.length;   // דורש אדם
  const resolved = sync.resolved.length;     // הוכרע אוטומטית - לידיעה בלבד
  const pending = sync.pending;
  // במצב שקט הפקד מצטמצם לנקודה אחת. הוא כלי תרגול, לא חלק מתמונת המצב.
  const quiet = !outage && !conflicts && !resolved && !pending && !open;

  const wrap: React.CSSProperties = {
    position: 'fixed',
    insetBlockEnd: 8,
    // `left` פיזי בכוונה - הפינה נבחרה מפורשות, ואינה אמורה לקפוץ באנגלית
    left: 8,
    zIndex: 8990,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    alignItems: 'flex-start',
    fontSize: 11.5,
    fontWeight: 700,
  };

  const dot: React.CSSProperties = {
    width: 22, height: 22, borderRadius: 11,
    display: 'grid', placeItems: 'center',
    background: C.bg, color: C.sub,
    border: `1px solid ${C.chip}`,
    cursor: 'pointer', fontSize: 12, lineHeight: 1,
    opacity: 0.65,
  };

  const chip = (bg: string): React.CSSProperties => ({
    background: bg, borderRadius: 4, padding: '1px 6px',
    fontSize: 10.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
  });

  const btn = (accent: string): React.CSSProperties => ({
    background: accent, color: '#0f172a', border: 'none', borderRadius: 6,
    padding: '4px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
    touchAction: 'manipulation',
  });

  if (quiet) {
    return (
      <div style={wrap}>
        <button
          type="button"
          style={dot}
          onClick={() => setOpen(true)}
          title={tr('sync.openPanel')}
          aria-label={tr('sync.openPanel')}
        >🔌</button>
      </div>
    );
  }

  return (
    <>
      <div style={wrap}>
        <div
          style={{
            background: C.bg,
            color: C.text,
            padding: '7px 10px',
            minWidth: 190,
            maxWidth: 300,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            textAlign: 'start',
            boxShadow: '0 3px 12px rgba(0,0,0,.4)',
            ...windowFrame(outage ? 'edit' : 'view', themeMode, 8),
          }}
          role="region"
          aria-label={tr('sync.title')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: outage ? STATUS.outage : C.sub }}>
              {outage ? `⚡ ${tr('sync.outageOn')}` : tr('sync.title')}
            </span>
            {outage && since && (
              <span style={chip(C.chip)}>{formatAge(Date.now() - since)}</span>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ ...dot, marginInlineStart: 'auto', opacity: 1 }}
              title={tr('shared.close')}
              aria-label={tr('shared.close')}
            >×</button>
          </div>

          {/* מאיזה מאגר העמדה משרתת עכשיו - התשובה לשאלה "על מה אני מסתכל" */}
          <div style={{ color: C.sub, fontWeight: 600, fontSize: 10.5 }}>
            {local
              ? (outage ? tr('sync.servingLocal') : tr('sync.servingRemote'))
              : noLocalDbReason()}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
            {pending > 0 && (
              <span style={chip(C.chip)}>{tr('sync.pending', { n: pending })}</span>
            )}
            {/* הוכרע לבד - חיווי ולא התראה. הבקר לא נעצר, אבל גם לא מופתע */}
            {resolved > 0 && (
              <span style={chip(C.chip)}>{tr('sync.resolvedAuto', { n: resolved })}</span>
            )}
            {conflicts > 0 && (
              <span style={{ ...chip(STATUS.conflict), color: '#fff' }}>
                {tr('sync.conflicts', { n: conflicts })}
              </span>
            )}
            {sync.lastPushAt && pending === 0 && conflicts === 0 && resolved === 0 && (
              <span style={{ ...chip(C.chip), color: STATUS.ok }}>{tr('sync.allSynced')}</span>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button
              type="button"
              style={btn(outage ? STATUS.ok : STATUS.outage)}
              disabled={station.busy}
              onClick={() => { void setSimulatedOutage(!outage); }}
            >
              {outage ? tr('sync.restore') : tr('sync.simulate')}
            </button>
            {(conflicts > 0 || resolved > 0) && (
              <button
                type="button"
                style={conflicts > 0 ? btn(STATUS.conflict) : { ...btn(C.chip), color: C.text }}
                onClick={() => setShowConflicts(true)}
              >
                {conflicts > 0 ? tr('sync.resolveNow') : tr('sync.showDecisions')}
              </button>
            )}
            {sync.enabled && !outage && pending > 0 && (
              <button
                type="button"
                style={{ ...btn(C.chip), color: C.text }}
                disabled={sync.busy}
                onClick={() => { void pushPending(false); }}
              >{tr('sync.pushNow')}</button>
            )}
            {sync.enabled && !outage && pending === 0 && (
              <button
                type="button"
                style={{ ...btn(C.chip), color: C.text }}
                disabled={sync.busy}
                onClick={() => { void pullMirror(); }}
              >{tr('sync.mirrorNow')}</button>
            )}
          </div>

          {sync.error && (
            <div style={{ color: STATUS.conflict, fontWeight: 600, fontSize: 10.5 }}>
              {tr('sync.lastError')} {sync.error}
            </div>
          )}
        </div>
      </div>

      {showConflicts && <SyncConflictsModal onClose={() => setShowConflicts(false)} />}
    </>
  );
}
