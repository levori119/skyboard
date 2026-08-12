// חיווי "מידע לא חי" — הרכיב הקריטי של עמידות בנתק.
//
// בלעדיו, כל שאר השכבות מסוכנות: העמדה תמשיך להציג פ"מים, המראות וסטטוסים
// כאילו הם חיים, והבקר לא יבחין שהוא מסתכל על תמונת מצב מלפני 4 דקות.
// מסך שמראה מידע ישן בלי לומר זאת גרוע ממסך שקרס.
//
// רכיב משותף אחד לכל העמדות (CTRL / TWR / דסק משימה / ניהול) — הוא יושב
// ב-App מעל כל המסכים, ולכן אין שכפול ואין מסך שנשאר בלי חיווי.
//
// התצוגה היא **בועית קטנה בפינה השמאלית העליונה**, לא באנר ברוחב המסך: החיווי
// חייב להיות נוכח כל זמן הנתק, ובאנר מלא חוסם שורה שלמה מתמונת המצב. כדי שהקוטן
// לא יגרע מההבלטה, מצב הנתק (ענבר) פועם — ראה `.conn-bubble-alert` ב-App.css.
//
// /ui-adapt: מסתגל ל-3 התמות. צבעי הסטטוס (ענבר=נתק, ירוק=חזר, אדום=נחסם)
// **קבועים** בכל תמה - הם נושאי משמעות. יושב ב-#root ולכן מקבל את זום ה---s,
// כך שהבועית והמרווח מהפינה גדלים יחד עם שאר ה-UI.
import React from 'react';
import { API_URL } from '../../config';
import { tr } from '../../i18n/tr';
import { useNetStatus, formatAge } from '../../offline/useNetStatus';

type ThemeMode = 'light' | 'dark' | 'ocean';

type GapiStatus = { enabled: boolean; connected: boolean; last_sync_at: string | null } | null;

const STATUS = {
  offline: '#f59e0b',   // ענבר - עובדים על מידע שאינו חי
  restored: '#22c55e',  // ירוק - הקשר חזר
  blocked: '#ef4444',   // אדום - פעולה נחסמה
};

/** נתק קצר מזה חלף לפני שהמפעיל הספיק לראותו - אין על מה לבשר. */
const MIN_OUTAGE_MS = 4000;
/** כמה זמן בשורת השחזור נשארת על המסך. */
const RESTORED_MS = 4000;

/** שעה מקומית קצרה (14:32) - הפורמט שבקר קורא במבט חטוף. */
const clockOf = (ms: number) =>
  new Date(ms).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * קורא את התמה מ-`body` (`light-mode` / `ocean-mode`) — אותן מחלקות שכבר
 * נקבעות ב-App וב-SectorDashboard. כך הרכיב עצמאי ואינו דורש העברת prop דרך
 * ארבעה ענפי ניתוב, ומתעדכן חי כשהמפעיל מחליף תמה.
 */
function useBodyTheme(override?: ThemeMode): ThemeMode {
  const read = React.useCallback((): ThemeMode => {
    if (override) return override;
    const c = document.body.classList;
    return c.contains('light-mode') ? 'light' : c.contains('ocean-mode') ? 'ocean' : 'dark';
  }, [override]);
  const [mode, setMode] = React.useState<ThemeMode>(read);
  React.useEffect(() => {
    setMode(read());
    const obs = new MutationObserver(() => setMode(read()));
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [read]);
  return mode;
}

export default function ConnectionBanner({ themeMode: themeOverride }: { themeMode?: ThemeMode } = {}) {
  const themeMode = useBodyTheme(themeOverride);
  const net = useNetStatus();
  const [showRestored, setShowRestored] = React.useState(false);
  const [blockedAt, setBlockedAt] = React.useState<number | null>(null);
  const [gapi, setGapi] = React.useState<GapiStatus>(null);
  const outageStart = React.useRef<number | null>(null);

  // "הקשר חזר" מוצג רק אחרי נתק **שהמפעיל הספיק להרגיש בו**, ונעלם מעצמו - הוא
  // בשורה טובה, לא התראה. נתק בן שנייה שחלף מעצמו אינו מידע שימושי: ההודעה
  // עליו חיה 6 שניות על המסך, כלומר רעש ארוך פי כמה מהאירוע עצמו. חריג: אם
  // הצטברו פעולות ב-outbox, השחזור כן משנה - הן נשלחות עכשיו.
  React.useEffect(() => {
    if (!net.online) {
      outageStart.current ??= net.offlineSince ?? Date.now();
      setShowRestored(false);
      return;
    }
    const since = outageStart.current;
    outageStart.current = null;
    if (since == null) return;
    if (Date.now() - since < MIN_OUTAGE_MS && net.queued === 0) return;
    setShowRestored(true);
    const t = setTimeout(() => setShowRestored(false), RESTORED_MS);
    return () => clearTimeout(t);
  }, [net.online]); // eslint-disable-line react-hooks/exhaustive-deps

  // פעולה משותפת שנחסמה - הודעה מתפוגגת, בלי מודאל שחוסם את המסך
  React.useEffect(() => {
    if (!net.lastBlocked) return;
    setBlockedAt(net.lastBlocked.at);
    const t = setTimeout(() => setBlockedAt(null), 7000);
    return () => clearTimeout(t);
  }, [net.lastBlocked?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  // מצב הקשר לשו"ב. הנתיב אינו קיים בכל גרסה - 404 מכבה את החיווי לצמיתות
  // במקום להתריע על משהו שלא הותקן.
  React.useEffect(() => {
    let alive = true, stop = false;
    const poll = async () => {
      if (stop) return;
      try {
        const res = await fetch(`${API_URL}/gapi/status`);
        if (res.status === 404) { stop = true; return; }
        if (!res.ok) return;
        const d = await res.json();
        if (alive) setGapi({ enabled: !!d.enabled, connected: !!d.connected, last_sync_at: d.last_sync_at ?? null });
      } catch { /* נתק - הבאנר הראשי כבר מדווח עליו */ }
    };
    poll();
    const iv = setInterval(poll, 30000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  // ⚠️ הטקסט על הבאנר **קבוע כהה בכל שלוש התמות**, ולא נגזר מהתמה.
  // הסיבה: רקע הבאנר הוא צבע סטטוס קבוע (ענבר/ירוק) ולא משטח של התמה. טקסט
  // בהיר על ענבר נותן 2.18:1 — מתחת לסף 3:1 של WCAG 1.4.11, כלומר לא קריא
  // דווקא בתמה הכהה שהיא ברירת המחדל בחדר בקרה. נמדד ב-e2e, לא הונח.
  // `themeMode` נשאר בשימוש רק לעוצמת הרקע של הצ'יפים.
  const C = {
    text: '#1e293b',
    sub: '#422006',
    chipBg: themeMode === 'light' ? 'rgba(255,255,255,.62)' : 'rgba(255,255,255,.42)',
  };

  const gapiStale = !!gapi?.enabled && !gapi.connected;
  // הטריגר הוא "המידע שעל המסך אינו חי" ולא "אין קשר": שרת שעונה 5xx לאורך זמן
  // מקפיא את התמונה בדיוק כמו כבל מנותק, והמפעיל חייב לדעת גם עליו.
  const nothingToShow = !net.stale && !showRestored && !blockedAt && !gapiStale && net.queued === 0;
  if (nothingToShow) return null;

  const bg = net.stale ? STATUS.offline : showRestored ? STATUS.restored : STATUS.offline;

  // `left` פיזי בכוונה (ולא `insetInlineStart`): הפינה נבחרה מפורשות כמקום
  // שהחיווי יושב בו, והיא לא אמורה לקפוץ לצד השני כשעוברים לאנגלית.
  const bubble: React.CSSProperties = {
    position: 'fixed',
    insetBlockStart: 8,
    left: 8,
    zIndex: 9000,
    maxWidth: 260,
    background: bg,
    color: C.text,
    borderRadius: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    padding: '5px 10px',
    fontSize: 11.5,
    fontWeight: 700,
    lineHeight: 1.35,
    textAlign: 'start',
    boxShadow: '0 3px 12px rgba(0,0,0,.4)',
    pointerEvents: 'none',
  };

  // שורת פרטים - נשברת לשורה נוספת בתוך הבועית במקום להרחיב אותה
  const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5 };

  const chip: React.CSSProperties = {
    background: C.chipBg,
    borderRadius: 4,
    padding: '1px 6px',
    fontSize: 10.5,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
  };

  return (
    <>
      <div
        style={bubble}
        className={!net.online ? 'conn-bubble-alert' : undefined}
        role="status"
        aria-live="polite"
      >
        {net.stale ? (
          <>
            <span>⚠ {tr(net.online ? 'offline.staleTitle' : 'offline.title')}</span>
            <div style={row}>
              {net.lastSuccessAt != null ? (
                <>
                  <span style={chip}>{tr('offline.asOf')}{clockOf(net.lastSuccessAt)}</span>
                  <span style={chip}>{tr('offline.ageLabel')} {formatAge(net.ageMs)}</span>
                </>
              ) : (
                <span style={chip}>{tr('offline.noData')}</span>
              )}
            </div>
            {/* השיתוף בין עמדות מושבת רק בנתק אמיתי - כששרת עונה הוא ממשיך לעבוד */}
            {!net.online && (
              <span style={{ color: C.sub, fontWeight: 600, fontSize: 10.5 }}>{tr('offline.sharingOff')}</span>
            )}
          </>
        ) : showRestored ? (
          <span>✓ {tr('offline.restored')}</span>
        ) : null}

        {(net.queued > 0 || gapiStale) && (
          <div style={row}>
            {net.queued > 0 && (
              <span style={chip}>{net.queued} {tr('offline.queued')}</span>
            )}
            {gapiStale && (
              <span style={chip}>
                ⚠ {tr('offline.gapiOffline')}
                {gapi?.last_sync_at
                  ? ` · ${tr('offline.gapiAgeLabel')} ${formatAge(Date.now() - new Date(gapi.last_sync_at).getTime())}`
                  : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {blockedAt != null && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            insetBlockStart: 46,
            // מירכוז אינו תלוי כיוון - נשאר פיזי בכוונה, כדי שלא יתהפך ב-LTR
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9001,
            maxWidth: 460,
            background: STATUS.blocked,
            color: '#fff',
            borderRadius: 8,
            padding: '10px 16px',
            boxShadow: '0 6px 24px rgba(0,0,0,.45)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14, marginBlockEnd: 4 }}>🚫 {tr('offline.blockedTitle')}</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.5, fontWeight: 500 }}>{tr('offline.blockedBody')}</div>
        </div>
      )}
    </>
  );
}
