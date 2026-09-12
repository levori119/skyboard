// התראות מתפרצות של ניהול נסיעות - עמדת ניהול שדה תעופה.
//
// שלוש התראות, וכולן עונות על אותה שאלה: "משהו קרה לנסיעה ואתה צריך להכריע".
//   🚦 תחילת נסיעה   - 10 דקות לפני היציאה המשוערת (יחד עם עליית הרכב למפה)
//   ✅ הנהג אישר      - הנהג לחץ "מאשר" באפליקציה שלו
//   ✋ הנהג ביקש שינוי - זמן יציאה / תחנות / הערה, וממתין לאישור **נוסף** של המגדל
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

import React, { useMemo, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import i18n from '../../i18n';
import { API_URL } from '../../config';
import { windowPalette, type ThemeMode } from '../../utils/windowPalette';
import useDragPosition from '../../hooks/useDragPosition';
import { useDockableWindow } from '../../hooks/useDockableWindow';
import useAirfieldTrips from '../../hooks/useAirfieldTrips';
import {
  asTripStatus, hasPendingDriverChange, isDepartureAlertDue, isDriverActionFresh,
  minutesUntilDeparture, pendingChangeFields, suggestedVehicleIcon,
} from '../../utils/trips';
import type { Trip } from './TripsManagementWindow';

/** כל 15 שניות: מספיק צפוף ל-10 דקות התראה, ולא מעמיס את ה-DB. */
const POLL_MS = 15_000;

type AlertKind = 'departure' | 'ack' | 'change';

interface TripAlert { key: string; kind: AlertKind; trip: Trip }

const KIND_STYLE: Record<AlertKind, { icon: string; accent: string; titleKey: string }> = {
  departure: { icon: '🚦', accent: '#f59e0b', titleKey: 'trips.alertDepartureTitle' },
  ack: { icon: '✅', accent: '#22c55e', titleKey: 'trips.alertDriverAckTitle' },
  change: { icon: '✋', accent: '#ef4444', titleKey: 'trips.alertDriverChangeTitle' },
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
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const stackRef = useRef<HTMLDivElement | null>(null);
  const drag = useDragPosition(stackRef);

  const now = Date.now();
  const alerts = useMemo<TripAlert[]>(() => {
    const out: TripAlert[] = [];
    for (const t of trips) {
      // הבקשה קודמת: היא חוסמת יציאה, ולכן צריכה להיות מעל ההתראה על היציאה
      if (hasPendingDriverChange(t) && isDriverActionFresh(t.pending_change_at, now)) {
        out.push({ key: `chg:${t.id}:${t.pending_change_at}`, kind: 'change', trip: t });
      }
      if (isDriverActionFresh(t.driver_ack_at, now)) {
        out.push({ key: `ack:${t.id}:${t.driver_ack_at}`, kind: 'ack', trip: t });
      }
      if (isDepartureAlertDue(t, now)) {
        out.push({ key: `dep:${t.id}`, kind: 'departure', trip: t });
      }
    }
    return out.filter(a => !dismissed.has(a.key));
  }, [trips, dismissed, now]);

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
        <span style={{ color: C.text }}>{alerts.length}</span>
      </div>
      {alerts.map(a => {
        const ks = KIND_STYLE[a.kind];
        const t = a.trip;
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
              {`${endpoint(t.from_point_name, t.from_text)} → ${endpoint(t.to_point_name, t.to_text)} · ${timingText(t)}`}
            </div>

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
