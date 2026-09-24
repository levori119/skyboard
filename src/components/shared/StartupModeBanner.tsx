// איך העמדה עלתה - נאמר במסך הכניסה, לפני שמתחילים לעבוד.
//
// **למה דווקא כאן:** עמדה שעלתה בנתק עובדת מול המאגר המקומי בלבד. זו אינה
// תקלה - זה בדיוק מה שהמאגר המקומי נועד לו - אבל המפעיל **חייב לדעת זאת
// לפני** שהוא מתחיל, ולא לגלות זאת באמצע משמרת כשמידע חסר. עד היום השאלה
// "על מה אני עובד" נענתה רק אחרי הכניסה, ורק למי שהסתכל על הפקד בפינה.
//
// ⚠️ **נקרא בלי הזדהות, ולכן מציג מצב בלבד.** הנתיב `/api/__localdb/startup`
// קיים רק במאגר המקומי ומחזיר מצב עלייה - לא מידע שדה. ראה server/routes/localDb.js.

import React from 'react';
import { tr } from '../../i18n/tr';
import { agentOrigin } from '../../offline/stationAgent';

type Startup = 'syncing' | 'synced' | 'offline' | 'off';

type Status = {
  startup: Startup;
  startupAt: number | null;
  lastOkAt: number | null;
  progress: { done: number; total: number } | null;
  strips: number | null;
};

/** צבעי משמעות, קבועים: מסך הכניסה אינו מקבל תמה. */
const TONE: Record<Startup, string> = {
  synced: '#22c55e',
  syncing: '#38bdf8',
  offline: '#f59e0b',
  off: '#64748b',
};

/**
 * שואל את המאגר המקומי, קודם במקור של הדף ואז בסוכן שעל המחשב.
 *
 * אותה תבנית כמו בדף המאגר המקומי: עמדת Electron מגישה את הדף בעצמה, ובעמדה
 * שעולה ב-WEB הדף מגיע מהמרכז והסוכן יושב על 127.0.0.1.
 */
async function readStartup(): Promise<Status | null> {
  const paths = [`${location.origin}/api/__local/__localdb/startup`,
    `${agentOrigin()}/api/__local/__localdb/startup`];
  for (const url of paths) {
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        ...({ targetAddressSpace: 'loopback' } as RequestInit),
      });
      if (!res.ok) continue;
      const d = await res.json();
      if (typeof d?.startup !== 'string') continue;
      return d as Status;
    } catch { /* אין מאגר מקומי שם - ממשיכים */ }
  }
  return null;
}

export default function StartupModeBanner() {
  const [st, setSt] = React.useState<Status | null>(null);

  React.useEffect(() => {
    let alive = true;
    const tick = async () => {
      const d = await readStartup();
      if (!alive) return;
      setSt(d);
      // כל עוד הסנכרון הראשון רץ, מרעננים מהר - זה מד התקדמות, לא חיווי סטטי
      if (d?.startup === 'syncing') setTimeout(() => { void tick(); }, 2000);
    };
    void tick();
    return () => { alive = false; };
  }, []);

  // אין מאגר מקומי בעמדה הזו - אין מה לומר, ולא ממציאים חיווי ריק
  if (!st || st.startup === 'off') return null;

  const text = st.startup === 'syncing'
    ? tr('sync.startupSyncing', {
        done: st.progress?.done ?? 0, total: st.progress?.total ?? 0 })
    : st.startup === 'synced'
      ? tr('sync.startupSynced')
      : tr('sync.startupOffline', { n: st.strips ?? 0 });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      margin: '0 auto 14px', maxWidth: 420, padding: '8px 14px',
      borderRadius: 8, fontSize: 13, fontWeight: 700,
      // מסגרת ולא מילוי: זו הודעת מצב, לא התראה שדורשת פעולה
      border: `1px solid ${TONE[st.startup]}`,
      color: TONE[st.startup],
      background: 'rgba(15,23,42,.55)',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: TONE[st.startup],
      }} />
      <span>{text}</span>
    </div>
  );
}
