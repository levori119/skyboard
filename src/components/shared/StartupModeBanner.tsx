// איך העמדה עלתה - נאמר במסך הכניסה, לפני שמתחילים לעבוד.
//
// **למה דווקא כאן:** עמדה שעלתה בנתק עובדת מול המאגר המקומי בלבד. זו אינה
// תקלה - זה בדיוק מה שהמאגר המקומי נועד לו - אבל המפעיל **חייב לדעת זאת
// לפני** שהוא מתחיל, ולא לגלות זאת באמצע משמרת כשמידע חסר. עד היום השאלה
// "על מה אני עובד" נענתה רק אחרי הכניסה, ורק למי שהסתכל על הפקד בפינה.
//
// ⚠️ **בפוטר ובקטן, לא באמצע המסך** (הכרעת אורי): מסך הכניסה נשאר כפי שהיה,
// והחיווי יושב שורה אחת מתחת למספר הגרסה. מי שמחפש אותו מוצא; מי שלא -
// המסך לא השתנה עבורו.
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

/** מה שהנתב מדווח: לאן הבקשות **באמת** הולכות עכשיו. */
type Router = {
  serving?: 'local' | 'remote';
  remote?: { online?: boolean } | null;
  simulated?: boolean;
};

/** מה שמוצג בפועל - ולא בהכרח `startup` כפי שהמראה רשמה אותו. */
export type Display = 'syncing' | 'synced' | 'lagging' | 'offline' | null;

/**
 * מכריעה מה לומר למפעיל, מתוך **שני** מקורות: שירות המראה והנתב.
 *
 * ⚠️ **למה לא די ב-`startup` לבדו** (התקלה שדווחה): `startup` מתאר את
 * **ההעתק המקומי** - האם המראה הספיקה למשוך את המרכז. הוא **אינו** מתאר אם
 * יש קשר למרכז. עמדה שעלתה ב-WEB מקבלת את הדף **מהמרכז עצמו**, וכל בקשה
 * שלה הולכת לשם (`serving: 'remote'`), ובכל זאת המסך הכריז "אין קשר
 * למרכז - העמדה עובדת עצמאית מול המאגר המקומי". זה שקר כפול: גם יש קשר,
 * וגם המידע שעל המסך הגיע מהמרכז ולא מהמאגר המקומי.
 *
 * התשובה ל"האם יש קשר" שייכת לנתב, כי הוא זה שמנתב. המראה עונה רק על
 * "האם ההעתק המקומי מעודכן", וכשהקשר קיים אבל ההעתק מפגר - זו **הסתייגות
 * לגבי הנתק הבא**, לא הכרזה על נתק עכשיו.
 */
export function decideDisplay(st: Status | null, rt: Router | null): Display {
  if (!st || st.startup === 'off') return null;
  // הנתב הוא הקובע לשאלת הקשר. נתק מדומה נחשב נתק - הוא הופעל בכוונה.
  const linkUp = !!rt && !rt.simulated
    && (rt.serving === 'remote' || rt.remote?.online === true);

  if (st.startup === 'synced') return 'synced';
  // אין נתב לשאול (עמדת Electron בלי השכבה, או שהשאילתה נכשלה) - נשארים
  // עם מה שהמראה אומרת, כי זו האמת היחידה שבידינו.
  if (!linkUp) return st.startup === 'syncing' ? 'syncing' : 'offline';
  // יש קשר, וההעתק המקומי עדיין לא שלם
  return st.startup === 'syncing' ? 'syncing' : 'lagging';
}

/** צבעי משמעות, קבועים: מסך הכניסה אינו מקבל תמה. */
const TONE: Record<Exclude<Display, null>, string> = {
  synced: '#22c55e',
  syncing: '#38bdf8',
  // מפגר אינו נתק, אבל גם אינו "הכל תקין": אם הקשר ייפול עכשיו, ההעתק
  // שהעמדה תיפול אליו אינו שלם. זו הסתייגות, ולכן צבע של הסתייגות.
  lagging: '#f59e0b',
  offline: '#f59e0b',
};

/**
 * שואל את המאגר המקומי, קודם במקור של הדף ואז בסוכן שעל המחשב.
 *
 * אותה תבנית כמו בדף המאגר המקומי: עמדת Electron מגישה את הדף בעצמה, ובעמדה
 * שעולה ב-WEB הדף מגיע מהמרכז והסוכן יושב על 127.0.0.1.
 */
async function probe<T>(path: string, ok: (d: any) => boolean): Promise<T | null> {
  for (const base of [location.origin, agentOrigin()]) {
    try {
      const res = await fetch(`${base}${path}`, {
        cache: 'no-store',
        ...({ targetAddressSpace: 'loopback' } as RequestInit),
      });
      // המרכז אינו מכיר את הנתיבים האלה ועונה 401 - מדלגים וממשיכים לסוכן
      if (!res.ok) continue;
      const d = await res.json();
      if (!ok(d)) continue;
      return d as T;
    } catch { /* אין שם מי שיענה - ממשיכים */ }
  }
  return null;
}

const readStartup = () =>
  probe<Status>('/api/__local/__localdb/startup', d => typeof d?.startup === 'string');

/** הנתב של העמדה. אין אחד - מחזיר null, וההכרעה נופלת בחזרה למראה בלבד. */
const readRouter = () =>
  probe<Router>('/api/__station/status', d => typeof d?.serving === 'string');

export default function StartupModeBanner() {
  const [st, setSt] = React.useState<Status | null>(null);
  const [rt, setRt] = React.useState<Router | null>(null);

  React.useEffect(() => {
    let alive = true;
    const tick = async () => {
      // במקביל: שתי שאילתות בלתי תלויות, ושתיהן זולות
      const [d, r] = await Promise.all([readStartup(), readRouter()]);
      if (!alive) return;
      setSt(d);
      setRt(r);
      // כל עוד הסנכרון הראשון רץ, מרעננים מהר - זה מד התקדמות, לא חיווי סטטי
      if (d?.startup === 'syncing') setTimeout(() => { void tick(); }, 2000);
    };
    void tick();
    return () => { alive = false; };
  }, []);

  const mode = decideDisplay(st, rt);
  // אין מאגר מקומי בעמדה הזו - אין מה לומר, ולא ממציאים חיווי ריק
  if (!mode || !st) return null;

  const text = mode === 'syncing'
    ? tr('sync.startupSyncing', {
        done: st.progress?.done ?? 0, total: st.progress?.total ?? 0 })
    : mode === 'synced'
      ? tr('sync.startupSynced')
      : mode === 'lagging'
        ? tr('sync.startupLagging')
        : tr('sync.startupOffline', { n: st.strips ?? 0 });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      // הפוטר כופה LTR ומונוספייס על כל מה שבתוכו; שניהם מעוותים עברית.
      direction: 'rtl',
      fontFamily: 'system-ui, "Segoe UI", Arial, sans-serif',
      fontSize: 11, fontWeight: 600, letterSpacing: 0,
      color: TONE[mode],
      opacity: 0.9,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: TONE[mode],
      }} />
      <span>{text}</span>
    </div>
  );
}
