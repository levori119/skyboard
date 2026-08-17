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
import { joinAirPicture } from './poller';
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
  /** הזיהוי פועל רק במוד אזורים, ורק כשהוגדר לעמדה. */
  enabled: boolean;
  maps: ZoneWatchMap[];
  /** קצב הדגימה מקונפיג המאגר - נדרש כשה-hook מצטרף למאגר בעצמו. */
  pollMs?: number;
  /** נקרא רק לפ"מים של העמדה שלי, ורק כשהסטטוס באמת השתנה. */
  onStatusChange: (stripId: number, status: string) => void;
}

/** רכיב אווירי חורג, אחרי השלכה למפה - להדגשה כשהתמונה כבויה. */
export interface ZoneWatchOffender {
  trackId: string;
  cs: string;
  /** אחוזי תמונת מפה. */
  x: number;
  y: number;
  alt: number;
  mapId: number | null;
  /** `true` = רכיב זר שנכנס; `false` = הרכיב של הפ"מ עצמו שחרג. */
  intruder: boolean;
}

export interface UseZoneWatchResult {
  /** ההתראות שלא בוטלו - לבאנר. */
  alerts: ZoneAlert[];
  /** **כל** ההתראות החיות - לטבעת המהבהבת סביב הפין, גם אחרי ביטול הבאנר. */
  alertedStripIds: Set<number>;
  alertedZoneIds: Set<number>;
  /**
   * הרכיבים האוויריים שמאחורי ההתראות. מתעדכן בכל טיק (גם בלי שינוי בהתראות),
   * כי המיקום זז - וזה מה שמצויר כשהתמונה כבויה.
   */
  offenders: ZoneWatchOffender[];
  dismiss: (key: string) => void;
  /** מוחק את **כל** ההתראות בבת אחת. */
  dismissAll: () => void;
}

const EMPTY_STRIPS: Set<number> = new Set();
const EMPTY_ZONES: Set<number> = new Set();

/** חתימה זולה למיקומי החורגים - כדי לא לרנדר כשאיש לא זז ממש. */
const offSignature = (list: ZoneWatchOffender[]): string =>
  list.map(o => `${o.trackId}:${o.x.toFixed(2)},${o.y.toFixed(2)}`).join('|');

export function useZoneWatch({ enabled, maps, pollMs, onStatusChange }: UseZoneWatchOptions): UseZoneWatchResult {
  // הקלט נקרא מתוך הטיימר ולא נסגר עליו: `maps` נבנה מחדש בכל רינדור של
  // הדשבורד, ותלות בו הייתה מקימה טיימר חדש כל שנייה.
  const mapsRef = useRef(maps);
  mapsRef.current = maps;
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const stateRef = useRef<Record<string, ZoneWatchState>>({});
  const writtenRef = useRef<Map<number, { status: string; at: number }>>(new Map());
  const signatureRef = useRef('');

  const offSigRef = useRef('');

  const [alerts, setAlerts] = useState<ZoneAlert[]>([]);
  const [offenders, setOffenders] = useState<ZoneWatchOffender[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const dismiss = useCallback((key: string) => {
    setDismissed(prev => { const next = new Set(prev); next.add(key); return next; });
  }, []);

  // "מחק הכל" - משתיק את כל מה שחי **כרגע**. התראה חדשה שתיווצר אחר כך תופיע,
  // כי הביטול נשמר לפי מפתח ההתראה ולא כדגל גורף.
  const dismissAll = useCallback(() => {
    setDismissed(prev => {
      const next = new Set(prev);
      for (const a of alerts) next.add(a.key);
      return next;
    });
  }, [alerts]);

  // הצטרפות למאגר **בזכות עצמה**: כשהתמונה כבויה `AirPictureLayer` אינו מרונדר
  // ואיש אינו דוגם, ואז "התראות גם בלי תמונה" לא היה מקבל נתונים כלל. ה-poller
  // סופר מנויים, ולכן כשהשכבה כן רצה זו אינה תעבורה כפולה.
  useEffect(() => {
    if (!enabled) return;
    return joinAirPicture({ pollMs });
  }, [enabled, pollMs]);

  useEffect(() => {
    if (!enabled) {
      stateRef.current = {};
      writtenRef.current.clear();
      if (signatureRef.current !== '') { signatureRef.current = ''; setAlerts([]); }
      if (offSigRef.current !== '') { offSigRef.current = ''; setOffenders([]); }
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
      const offList: ZoneWatchOffender[] = [];
      const seenOff = new Set<string>();

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
        const byId = new Map(placed.map(t => [t.id, t]));
        for (const a of r.alerts) {
          const id = `${a.kind}|${a.stripId}|${a.intruderCs ?? ''}`;
          if (seenAlert.has(id)) continue;
          seenAlert.add(id);
          merged.push(a);

          // מי הרכיב שמאחורי ההתראה: בכניסה ללא תיאום זה הזר, ובחריגה אלו
          // הרכיבים של הפ"מ עצמו (מבנה - יותר מאחד).
          const ids = a.kind === 'intruder'
            ? (a.trackId ? [a.trackId] : [])
            : (r.trackIdsByStrip.get(a.stripId) ?? []);
          for (const tid of ids) {
            const t = byId.get(tid);
            if (!t || seenOff.has(tid)) continue;
            seenOff.add(tid);
            offList.push({ trackId: tid, cs: t.cs, x: t.x, y: t.y, alt: t.alt, mapId: m.mapId, intruder: a.kind === 'intruder' });
          }
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
      // המיקום זז גם כשרשימת ההתראות זהה, ולכן חתימה נפרדת. העיגול לשתי ספרות
      // הוא מה שמונע רינדור על רעש של אלפית אחוז.
      const osig = offSignature(offList);
      if (osig !== offSigRef.current) { offSigRef.current = osig; setOffenders(offList); }
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
    // הטבעת וההדגשה על המפה נגזרות מ**כל** ההתראות החיות ולא מהמסוננות: ביטול
    // הבאנר משתיק טקסט, לא מצב. הרכיב עדיין חורג.
    alertedStripIds: alerts.length === 0 ? EMPTY_STRIPS : new Set(alerts.map(a => a.stripId)),
    alertedZoneIds: alerts.length === 0 ? EMPTY_ZONES : new Set(alerts.map(a => a.zoneId)),
    offenders,
    dismiss,
    dismissAll,
  };
}
