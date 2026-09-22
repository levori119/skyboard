// התראות מתפרצות של ניהול נסיעות - עמדת ניהול שדה תעופה.
//
// ההתראות, וכולן עונות על אותה שאלה: "משהו קרה לנסיעה ואתה צריך להכריע".
//   🚦 הנהג הפעיל את הנסיעה - לחץ "הפעל נסיעה" בחלון הזמן המותר
//   📨 בקשת נסיעה חדשה - הנהג שלח בקשה מאפליקציית DRIVER, והיא ממתינה לאישור
//   🚦 תחילת נסיעה   - 10 דקות לפני היציאה המשוערת (יחד עם עליית הרכב למפה)
//   ✅ הנהג אישר      - הנהג לחץ "מאשר" באפליקציה שלו
//   ✋ הנהג ביקש שינוי - זמן יציאה / תחנות / הערה. הנסיעה חוזרת לממתין (גם אם אושרה)
//                      עד שהמגדל מאשר או דוחה את העדכון
//   🚧 מתקרב לאלמנט סוגר - רכב בנסיעה פעילה 50 מ' מאלמנט שסוגר את הנתיב שלו
//   ↯ סטייה מהנתיב     - רכב בנסיעה פעילה יותר מ-200 מ' מהנתיב שאושר, לאורך זמן
//
// שתי האחרונות **מחושבות בשרת** (GET /api/trips/live) כדי ששני מגדלים יראו אותן
// יחד, והן עומדות בראש הערימה - סכנה פיזית עכשיו, לא בקשה שממתינה. בניגוד לשאר,
// סגירה שלהן אינה סופית: כשהתנאי חולף וחוזר, ההתרעה עולה שוב (pruneDismissedLive).
//
// למה שכבה נפרדת ולא באנר בתוך GroundView: ההתראה שייכת ל**עמדה** ולא למפה,
// היא צריכה להופיע גם כשהמפה מגוללת או מוחלפת, והיא נושאת פעולה (אשר/דחה) -
// באנר במפה אינו המקום לכפתור שמכריע בבקשה של נהג.
//
// **נגררת ובת-עגינה.** ברירת המחדל היא מרכז-עליון, אבל שם היא מכסה בדיוק את
// מה שהפקח מסתכל עליו כשהוא מכריע. לכן אפשר לגרור את הערימה למקום ריק על
// המסך, או לדחוף אותה לקונטיינר החלונות - ואז ההתראות נערמות בעמודה במקום
// לצוף מעל המפה. מיקום הגרירה והעגינה שורדים גם כשהערימה מתרוקנת ונדלקת שוב.
//
// ⚠️ ההתראה עולה **פעם אחת**: יציאה מסומנת בשרת (`departure_alerted_at`) כשהפקח
// סוגר אותה, ופעולות הנהג מתפרצות רק כל עוד הן טריות (isDriverActionFresh).
// בלי זה אותה התראה חוזרת בכל poll, והפקח לומד להתעלם ממנה - וזה בדיוק מה
// שהתראה מתפרצת לא יכולה להרשות לעצמה.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import i18n from '../../i18n';
import { API_URL } from '../../config';
import { windowPalette, type ThemeMode } from '../../utils/windowPalette';
import useDragPosition from '../../hooks/useDragPosition';
import { useDockableWindow } from '../../hooks/useDockableWindow';
import useAirfieldTrips from '../../hooks/useAirfieldTrips';
import {
  asTripStatus, hasPendingDriverChange, isDepartureAlertDue, isDriverActionFresh, isNewDriverRequest,
  minutesUntilDeparture, pendingChangeFields, suggestedVehicleIcon,
} from '../../utils/trips';
import type { Trip } from './TripsManagementWindow';
import useLiveTrips from '../../hooks/useLiveTrips';
import { liveTripAlerts, pruneDismissedLive, type LiveTrip } from '../../utils/liveTrips';
import { alertSound, playTone, unlockAudio, ALERT_TONE_BY_KIND } from '../../../shared/alertSound.js';

/** כל 15 שניות: מספיק צפוף ל-10 דקות התראה, ולא מעמיס את ה-DB. */
const POLL_MS = 15_000;

/** השתקת הצליל - פר-עמדה, ולכן localStorage ולא DB. */
const MUTE_KEY = 'skyking.tripAlerts.muted';
const readMuted = (): boolean => {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
};

type AlertKind = 'departure' | 'ack' | 'change' | 'request' | 'started' | 'blocked' | 'deviation';

interface TripAlert { key: string; kind: AlertKind; trip: Trip | LiveTrip }

const LIVE_KINDS = new Set<AlertKind>(['blocked', 'deviation']);

const KIND_STYLE: Record<AlertKind, { icon: string; accent: string; titleKey: string }> = {
  departure: { icon: '🚦', accent: '#f59e0b', titleKey: 'trips.alertDepartureTitle' },
  ack: { icon: '✅', accent: '#22c55e', titleKey: 'trips.alertDriverAckTitle' },
  change: { icon: '✋', accent: '#ef4444', titleKey: 'trips.alertDriverChangeTitle' },
  request: { icon: '📨', accent: '#38bdf8', titleKey: 'trips.alertDriverRequestTitle' },
  started: { icon: '🚦', accent: '#a78bfa', titleKey: 'trips.alertDriverStartedTitle' },
  blocked: { icon: '🚧', accent: '#f97316', titleKey: 'trips.alertBlockedTitle' },
  deviation: { icon: '↯', accent: '#ef4444', titleKey: 'trips.alertDeviationTitle' },
};

const FIELD_KEY: Record<string, string> = {
  scheduled_at: 'trips.fieldScheduledAt', stops: 'trips.fieldStops', note: 'trips.fieldNote',
};

export interface TripAlertsLayerProps {
  airfieldId: number | null;
  themeMode: ThemeMode;
  /** פתיחת הנסיעה בחלון "ניהול נסיעות" - ההתראה מובילה למקום שבו מטפלים בה */
  onOpenTrip: (tripId: number) => void;
}

export const TripAlertsLayer: React.FC<TripAlertsLayerProps> = ({ airfieldId, themeMode, onOpenTrip }) => {
  const C = windowPalette(themeMode);
  const dir = i18n.dir();
  const { trips, reload } = useAirfieldTrips<Trip>(airfieldId, 'all', POLL_MS);
  const liveTrips = useLiveTrips(airfieldId);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const liveAlerts = useMemo(() => liveTripAlerts(liveTrips), [liveTrips]);

  // התרעת סטייה/חסימה שנסגרה והתנאי שלה חלף - נמחקת מהסגורות, כדי שתעלה שוב
  // כשהרכב יסטה שוב. pruneDismissedLive מחזיר את אותו Set כשאין שינוי.
  useEffect(() => {
    const active = new Set(liveAlerts.map(x => x.key));
    setDismissed(d => pruneDismissedLive(d, active));
  }, [liveAlerts]);
  const stackRef = useRef<HTMLDivElement | null>(null);
  const drag = useDragPosition(stackRef);

  const now = Date.now();
  const alerts = useMemo<TripAlert[]>(() => {
    const out: TripAlert[] = [];
    for (const t of trips) {
      // בקשה חדשה מהנהג - הפקח פותח אותה בחלון ומשלים נתיב ואישור
      if (isNewDriverRequest(t, now)) {
        out.push({ key: `req:${t.id}:${t.driver_requested_at}`, kind: 'request', trip: t });
      }
      // הבקשה קודמת: היא חוסמת יציאה, ולכן צריכה להיות מעל ההתראה על היציאה
      if (hasPendingDriverChange(t) && isDriverActionFresh(t.pending_change_at, now)) {
        out.push({ key: `chg:${t.id}:${t.pending_change_at}`, kind: 'change', trip: t });
      }
      // הנהג לחץ "הפעל נסיעה" - הרכב יוצא לדרך עכשיו
      if (isDriverActionFresh(t.driver_started_at, now)) {
        out.push({ key: `start:${t.id}:${t.driver_started_at}`, kind: 'started', trip: t });
      }
      if (isDriverActionFresh(t.driver_ack_at, now)) {
        out.push({ key: `ack:${t.id}:${t.driver_ack_at}`, kind: 'ack', trip: t });
      }
      if (isDepartureAlertDue(t, now)) {
        out.push({ key: `dep:${t.id}`, kind: 'departure', trip: t });
      }
    }
    // סכנה פיזית עכשיו (חסימה, סטייה) בראש הערימה, לפני בקשות שממתינות
    return [...liveAlerts, ...out].filter(a => !dismissed.has(a.key));
  }, [trips, liveAlerts, dismissed, now]);

  // ── צליל ההתרעה במגדל ──────────────────────────────────────────────────────
  // התראה מתפרצת שעולה בשקט מניחה שהפקח מסתכל על המסך בדיוק ברגע שהיא עלתה.
  // חסימה וסטייה הן סכנה פיזית עכשיו, ולכן הן מצפצפות ומוקראות; השאר - צפצוף
  // בודד, שלא יהפוך את חדר הבקרה לרעש רקע.
  const [muted, setMuted] = useState(readMuted);
  const heardRef = useRef<Set<string>>(new Set());
  const alertKeys = alerts.map(a => a.key).join('|');

  // מדיניות ההפעלה האוטומטית של הדפדפן: בלי מגע קודם ההקשר נולד מושתק
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { capture: true, once: true });
    window.addEventListener('keydown', unlock, { capture: true, once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true });
      window.removeEventListener('keydown', unlock, { capture: true });
    };
  }, []);

  useEffect(() => {
    const fresh = alerts.filter(a => !heardRef.current.has(a.key));
    // מה ששמענו נשמר, ומה שכבר לא על המסך נשכח - כדי שהתרעה שחוזרת תישמע שוב
    heardRef.current = new Set(alerts.map(a => a.key));
    if (muted || !fresh.length) return;
    // הכי חמור קובע את הצליל: צפצוף אחד לערימה, לא אחד לכל התראה
    const worst = fresh.find(a => a.kind === 'blocked') || fresh.find(a => a.kind === 'deviation') || fresh[0];
    const t = worst.trip as Trip & Partial<LiveTrip>;
    const who = t.vehicle_name || t.vehicle_type_name || t.permit_driver_name || t.driver_name || '';
    if (worst.kind === 'blocked') alertSound('stop', tr('trips.alertSpeechBlocked', { vehicle: who }));
    else if (worst.kind === 'deviation') alertSound('caution', tr('trips.alertSpeechDeviation', { vehicle: who }));
    else playTone(ALERT_TONE_BY_KIND[worst.kind] || 'notify');
    // alertKeys ולא alerts: המערך נבנה מחדש בכל רינדור (now), המפתחות יציבים
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertKeys, muted]);

  // הגרירה והעגינה **חייבות** לשבת לפני ההחזרה המוקדמת: הוק שנקרא רק כשיש
  // התראות משנה את סדר ההוקים בין רינדורים ומפיל את React.
  const dragged = drag.dragged;
  const hasAlerts = !!airfieldId && alerts.length > 0;
  // `dockable` כבה כשאין התראות - אחרת הקונטיינר מחזיק משבצת ריקה לחלון שלא
  // מרנדר כלום. המזהה נשאר ברשימה, ולכן הערימה חוזרת למקומה כשהיא נדלקת שוב.
  const dock = useDockableWindow('tripAlerts', tr('trips.alertsTitle'), {
    dockable: hasAlerts,
    setFloatingPos: (x, y) => drag.moveTo(x, y),
    floatingPos: () => drag.pos || { x: 0, y: 12 },
  });

  if (!hasAlerts) return null;

  const drop = (key: string) => setDismissed(s => new Set(s).add(key));

  /** סגירת התראת יציאה מסמנת אותה בשרת - כדי שלא תחזור בעמדה הבאה שנפתחת. */
  const dismissDeparture = async (t: Trip, key: string) => {
    drop(key);
    await fetch(`${API_URL}/entry-permit-trips/${t.id}/alerted`, { method: 'POST' }).catch(() => {});
    await reload();
  };

  const resolveChange = async (t: Trip, key: string, decision: 'approve' | 'reject') => {
    drop(key);
    await fetch(`${API_URL}/entry-permit-trips/${t.id}/change/${decision}`, { method: 'POST' }).catch(() => {});
    await reload();
  };

  /** סימון שהנסיעה יצאה - זה מה שהפקח עושה כשהנהג מתקשר להתחיל נסיעה. */
  const markApproved = async (t: Trip, key: string) => {
    drop(key);
    await fetch(`${API_URL}/entry-permit-trips/${t.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    }).catch(() => {});
    await fetch(`${API_URL}/entry-permit-trips/${t.id}/alerted`, { method: 'POST' }).catch(() => {});
    await reload();
  };

  const btn = (bg: string, fg = '#fff'): React.CSSProperties => ({
    padding: '3px 9px', background: bg, color: fg, border: 'none', borderRadius: 5,
    fontSize: 10, fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap',
  });

  const timingText = (t: Trip): string => {
    const mins = minutesUntilDeparture(t.scheduled_at, now);
    if (mins === null) return tr('trips.noSchedule');
    const rounded = Math.round(mins);
    if (rounded > 0) return tr('trips.alertDeparture', { minutes: rounded });
    if (rounded === 0) return tr('trips.alertDepartureNow');
    return tr('trips.alertDepartureLate', { minutes: -rounded });
  };

  const endpoint = (name: string | null, text: string) => name || text || '-';

  const stack = (
    <div
      ref={stackRef}
      data-testid="trip-alerts"
      style={{
        // ההתראה שייכת לעמדה ולא למפה, ולכן fixed ולא absolute בתוך המפה.
        // מרכז-עליון בעמודה צרה: מעל הכל, אך בלי לכסות את רוחב המסך כולו -
        // באנרי המפה שמתחתיה נשארים קריאים משני הצדדים.
        position: 'fixed',
        // left ולא insetInlineStart: useDragPosition מחזיר x כקואורדינטת
        // **שמאל** (נקראת מ-getBoundingClientRect().left), ובעברית
        // insetInlineStart הוא ה**ימין** - כך שהערימה נחתה ממוזערת לצד הנגדי
        // ולא במקום שהמצביע עזב בו. אותה סיבה למרכוז: transform אינו מודע
        // לכיוון הכתיבה, ולכן left:50% הוא המרכוז היחיד שעובד בשתי השפות.
        ...(dragged
          ? { top: drag.pos!.y, left: drag.pos!.x }
          : { top: 12, left: '50%', transform: 'translateX(-50%)' }),
        zIndex: 9995, display: 'flex', flexDirection: 'column', gap: 6,
        width: 'min(430px, calc(90vw / var(--s, 1)))', direction: dir,
        // השקוף מאפשר ללחוץ על המפה **בין** ההתראות; כל מה שנלחץ מחזיר auto.
        // מעוגן אין מה לחדור אליו, ולכן שם הכל לחיץ.
        pointerEvents: dock.docked ? 'auto' : 'none',
        ...dock.rootStyle,
      }}
    >
      {/* ידית הגרירה - רצועה דקה מעל הערימה. גם ידית העגינה: אותה תנועה
          דוחפת לקונטיינר, בדיוק כמו בכל חלון צף */}
      <div
        {...drag.handleProps}
        onPointerDown={e => { dock.onHeaderPointerDown(e); drag.handleProps.onPointerDown(e); }}
        style={{
          ...drag.handleProps.style, pointerEvents: 'auto',
          display: 'flex', alignItems: 'center', gap: 6,
          background: C.head, color: C.muted,
          border: `1px solid ${C.border}`, borderRadius: 7,
          padding: '2px 8px', fontSize: 10, fontWeight: 'bold',
          boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
        }}
      >
        <span style={{ fontSize: 11 }}>⠿</span>
        <span style={{ flex: 1 }}>{tr('trips.alertsTitle')}</span>
        {/* בלי השתקה, עמדה שמצפצפת היא עמדה שמכבים לה את הרמקול - ואז גם
            ההתרעה הבאה, החשובה, לא תישמע */}
        <button
          type="button"
          title={muted ? tr('trips.alertsUnmute') : tr('trips.alertsMute')}
          aria-pressed={muted}
          onPointerDown={e => e.stopPropagation()}
          onClick={() => { const next = !muted; setMuted(next); try { localStorage.setItem(MUTE_KEY, next ? '1' : '0'); } catch { /* מצב רגעי */ } if (!next) { unlockAudio(); playTone('notify'); } }}
          style={{ background: 'transparent', border: 'none', color: muted ? '#f87171' : C.text, cursor: 'pointer', fontSize: 12, padding: '0 2px', pointerEvents: 'auto' }}
        >{muted ? '🔇' : '🔊'}</button>
        <span style={{ color: C.text }}>{alerts.length}</span>
      </div>
      {alerts.map(a => {
        const ks = KIND_STYLE[a.kind];
        // התרעות המעקב החי נושאות שורת נסיעה מ-/api/trips/live - אותם שדות תצוגה
        const t = a.trip as Trip & Partial<LiveTrip>;
        const isLive = LIVE_KINDS.has(a.kind);
        const label = t.vehicle_name || t.vehicle_type_name || t.permit_driver_name || t.driver_name || '';
        return (
          <div
            key={a.key}
            style={{
              pointerEvents: 'auto',
              background: C.panel, color: C.text,
              border: `2px solid ${ks.accent}`, borderRadius: 8,
              boxShadow: `0 8px 26px rgba(0,0,0,0.55)`,
              padding: '7px 10px',
              animation: 'tripAlertPulse 1.1s ease-in-out infinite alternate',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 17 }}>{ks.icon}</span>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 'bold', color: ks.accent }}>{tr(ks.titleKey)}</span>
              <span style={{ fontSize: 15 }}>{t.icon || suggestedVehicleIcon(t.vehicle_type_name)}</span>
              <span style={{ fontSize: 11, fontWeight: 'bold' }}>{label}</span>
            </div>

            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
              {isLive
                // התרעה חיה בלי מוצא ויעד ידועים - בלי "- → -", שהוא רעש ולא מידע
                ? (t.from_point_name || t.from_text || t.to_point_name || t.to_text
                  ? `${endpoint(t.from_point_name, t.from_text)} → ${endpoint(t.to_point_name, t.to_text)}` : '')
                : `${endpoint(t.from_point_name, t.from_text)} → ${endpoint(t.to_point_name, t.to_text)} · ${timingText(t)}`}
            </div>

            {a.kind === 'deviation' && (
              <div style={{ fontSize: 11, color: ks.accent, fontWeight: 'bold', marginTop: 2 }}>
                {tr('trips.alertDeviation', { meters: Math.round(t.deviation_m ?? 0) })}
              </div>
            )}
            {a.kind === 'blocked' && t.blocking_element && (
              <div style={{ fontSize: 11, color: ks.accent, fontWeight: 'bold', marginTop: 2 }}>
                {tr('trips.alertBlocked', {
                  element: t.blocking_element.name,
                  state: t.blocking_element.state_label || '',
                  meters: Math.round(t.blocking_element.distance_m ?? 0),
                })}
              </div>
            )}
            {/* המיקום כבר לא עדכני - הפקח צריך לדעת שזו ודאות חלקית */}
            {isLive && t.stale && (
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{tr('trips.alertLiveStale')}</div>
            )}

            {a.kind === 'change' && (
              <div style={{ fontSize: 10, color: '#fbbf24', marginTop: 2 }}>
                {tr('trips.pendingChangeFields', {
                  fields: pendingChangeFields(t).map(f => tr(FIELD_KEY[f])).join(', '),
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
              {a.kind === 'change' ? (
                <>
                  <button onClick={() => void resolveChange(t, a.key, 'approve')} style={btn('#22c55e')}>{tr('trips.alertApproveChange')}</button>
                  <button onClick={() => void resolveChange(t, a.key, 'reject')} style={btn('#ef4444')}>{tr('trips.alertRejectChange')}</button>
                </>
              ) : a.kind === 'departure' && asTripStatus(t.status) !== 'approved' ? (
                <button onClick={() => void markApproved(t, a.key)} style={btn('#22c55e')}>{tr('trips.alertStartTrip')}</button>
              ) : null}
              <button onClick={() => { onOpenTrip(t.id); drop(a.key); }} style={btn('#0284c7')}>{tr('trips.alertOpen')}</button>
              <button
                onClick={() => { if (a.kind === 'departure') void dismissDeparture(t, a.key); else drop(a.key); }}
                style={btn(C.border, C.text)}
              >{tr('trips.alertDismiss')}</button>
            </div>
          </div>
        );
      })}
      <style>{`@keyframes tripAlertPulse { from { box-shadow: 0 8px 26px rgba(0,0,0,0.55); } to { box-shadow: 0 8px 26px rgba(0,0,0,0.55), 0 0 0 4px rgba(251,191,36,0.22); } }`}</style>
    </div>
  );

  return dock.render(stack);
};

export default TripAlertsLayer;
