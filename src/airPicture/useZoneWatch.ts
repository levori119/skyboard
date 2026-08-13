// חיבור מנוע הזיהוי (zoneWatch.ts) לעמדה.
//
// **הרכיב שקורא ל-hook הזה אינו נרשם ל-store של התמונ"א.** זו כל הנקודה: מנוי
// היה מרנדר מחדש את SectorDashboard (18,700 שורות) בכל דגימה, 30 פעם בדקה.
// במקום זה יש טיימר של שנייה שקורא את הסנאפשוט ישירות, מריץ את המנוע בזיכרון,
// ומעדכן state **רק כשרשימת ההתראות באמת השתנתה** - כלומר כמה פעמים במשמרת.
//
// ראה AIR_PICTURE_SPEC.md §5.2.

import { useCallback, useEffect, useRef, useState } from 'react';
import { airPictureStore } from './store';
import { place, ageSec, STALE_AFTER_SEC } from './track';
import {
  tickZoneWatch, emptyZoneWatchState, alertsSignature,
  type ZoneWatchState, type ZoneAlert, type WatchZone, type WatchAssignment,
} from './zoneWatch';
import type { MapGeoAnchor } from '../utils/geo';

/** קצב הבדיקה. התמונה מתעדכנת כל 2 שניות - שנייה היא כבר מרווח בטחון. */
const TICK_MS = 1000;

/**
 * חלון החסימה של כתיבה חוזרת. הרענון של ההקצאות רץ כל 5 שניות, ולכן עד שהוא
 * חוזר המנוע רואה את הסטטוס הישן ומבקש לכתוב שוב את מה שכבר נכתב. אחרי החלון
 * הכתיבה כן חוזרת - כך שסטטוס שנדרס ידנית מתוקן מעצמו.
 */
const REWRITE_GUARD_MS = 20000;

export interface ZoneWatchMap {
  /** מזהה המפה - מפריד את מצב המנוע בין המפה הראשית למפה השנייה. */
  mapId: number | null;
  /** עוגן המפה. בלעדיו אין השלכה לנ"צ, ולכן אין זיהוי. */
  anchor: MapGeoAnchor | null;
  zones: WatchZone[];
  assignments: WatchAssignment[];
}

export interface UseZoneWatchOptions {
  /** הזיהוי פועל רק במוד אזורים, עם תמונ"א דולקת ומפה מעוגנת. */
  enabled: boolean;
  maps: ZoneWatchMap[];
  /** נקרא רק לפ"מים של העמדה שלי, ורק כשהסטטוס באמת השתנה. */
  onStatusChange: (stripId: number, status: string) => void;
}

export interface UseZoneWatchResult {
  /** ההתראות שלא בוטלו - לבאנר. */
  alerts: ZoneAlert[];
  /** **כל** ההתראות החיות - לטבעת המהבהבת סביב הפין, גם אחרי ביטול הבאנר. */
  alertedStripIds: Set<number>;
  alertedZoneIds: Set<number>;
  dismiss: (key: string) => void;
}

const EMPTY_STRIPS: Set<number> = new Set();
const EMPTY_ZONES: Set<number> = new Set();

export function useZoneWatch({ enabled, maps, onStatusChange }: UseZoneWatchOptions): UseZoneWatchResult {
  // הקלט נקרא מתוך הטיימר ולא נסגר עליו: `maps` נבנה מחדש בכל רינדור של
  // הדשבורד, ותלות בו הייתה מקימה טיימר חדש כל שנייה.
  const mapsRef = useRef(maps);
  mapsRef.current = maps;
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const stateRef = useRef<Record<string, ZoneWatchState>>({});
  const writtenRef = useRef<Map<number, { status: string; at: number }>>(new Map());
  const signatureRef = useRef('');

  const [alerts, setAlerts] = useState<ZoneAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const dismiss = useCallback((key: string) => {
    setDismissed(prev => { const next = new Set(prev); next.add(key); return next; });
  }, []);

  useEffect(() => {
    if (!enabled) {
      stateRef.current = {};
      writtenRef.current.clear();
      if (signatureRef.current !== '') { signatureRef.current = ''; setAlerts([]); }
      return;
    }

    const tick = () => {
      const snap = airPictureStore.getSnapshot();
      const now = Date.now();
      // תמונה שאינה חיה **מקפיאה** את הזיהוי ואינה מאפסת אותו: חישוב-חשבון על
      // דגימה ישנה היה מטיס את המטוס אל מחוץ לאזור ומדווח חריגה שלא קרתה.
      if (snap.status !== 'live' || !snap.t || ageSec(snap.t, now) > STALE_AFTER_SEC) return;
      const dtSec = Math.max(0, (now - snap.receivedAt) / 1000);

      const merged: ZoneAlert[] = [];
      const seenAlert = new Set<string>();
      const seenStrip = new Set<number>();
      const nextState: Record<string, ZoneWatchState> = {};

      for (const m of mapsRef.current) {
        if (!m.anchor || m.zones.length === 0 || m.assignments.length === 0) continue;
        const key = String(m.mapId ?? 'main');
        const placed = place(snap.tracks, m.anchor, dtSec)
          .map(t => ({ id: t.id, cs: t.cs, x: t.x, y: t.y, alt: t.alt }));

        const r = tickZoneWatch(stateRef.current[key] ?? emptyZoneWatchState(), {
          zones: m.zones, assignments: m.assignments, tracks: placed, now,
        });
        nextState[key] = r.state;

        // דו-מפה: אותה הקצאה משתקפת גם על מפת הבן, ולכן אותו אירוע היה מדווח
        // פעמיים. הזהות היא **תפעולית** (סוג, פ"מ, מי הזר) ולא לפי מזהה האזור.
        for (const a of r.alerts) {
          const id = `${a.kind}|${a.stripId}|${a.intruderCs ?? ''}`;
          if (seenAlert.has(id)) continue;
          seenAlert.add(id);
          merged.push(a);
        }
        for (const c of r.statusChanges) {
          if (seenStrip.has(c.stripId)) continue;
          seenStrip.add(c.stripId);
          const last = writtenRef.current.get(c.stripId);
          if (last && last.status === c.status && now - last.at < REWRITE_GUARD_MS) continue;
          writtenRef.current.set(c.stripId, { status: c.status, at: now });
          onStatusChangeRef.current(c.stripId, c.status);
        }
      }

      stateRef.current = nextState;
      const sig = alertsSignature(merged);
      if (sig !== signatureRef.current) { signatureRef.current = sig; setAlerts(merged); }
    };

    tick();
    const iv = setInterval(tick, TICK_MS);
    return () => clearInterval(iv);
  }, [enabled]);

  // ביטול נמחק ברגע שההתראה חלפה, כדי שאותו אירוע בפעם הבאה יופיע שוב.
  useEffect(() => {
    setDismissed(prev => {
      if (prev.size === 0) return prev;
      const live = new Set(alerts.map(a => a.key));
      const next = new Set([...prev].filter(k => live.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [alerts]);

  return {
    alerts: dismissed.size === 0 ? alerts : alerts.filter(a => !dismissed.has(a.key)),
    alertedStripIds: alerts.length === 0 ? EMPTY_STRIPS : new Set(alerts.map(a => a.stripId)),
    alertedZoneIds: alerts.length === 0 ? EMPTY_ZONES : new Set(alerts.map(a => a.zoneId)),
    dismiss,
  };
}
