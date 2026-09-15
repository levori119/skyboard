// חיבור מנוע מעקב ההקפה (patternTrack.ts) לעמדת המגדל.
//
// אותה תבנית של useZoneWatch: **הרכיב אינו נרשם ל-store של התמונ"א** (מנוי היה
// מרנדר את מסך המגדל בכל דגימה). טיימר של שנייה קורא את הסנאפשוט ישירות, מריץ
// את המנוע, שולח את הפעולות דרך **אותם handlers** שהפקח לוחץ עליהם, ומעדכן
// state רק כשמה שמוצג (הבהוב ירוק, שיוך רכיב) באמת השתנה.
//
// ראה PATTERN_AUTOTRACK_SPEC.md.

import { useEffect, useRef, useState } from 'react';
import { airPictureStore, pictureFresh } from './store';
import { joinAirPicture } from './poller';
import {
  tickPatternAutotrack, emptyPatternTrackState, aircraftKey,
  type AutoAction, type AutoAircraft, type PatternTrackState,
} from './patternTrack';
import { autotrackInputs, patternGeoOf } from './patternTrackInputs';
import type { MapGeoAnchor } from '../utils/geo';

const TICK_MS = 1000;
/** כמו `LANDED_BLINK_MS` של הפאנל: "נחת" מהבהב ואז המטוס יורד מההקפה. */
const LANDED_REMOVE_MS = 5000;

type Row = Record<string, any>;

export interface PatternAutotrackHandlers {
  updateJoiningAircraft: (pointId: number | null, sid: string, idx: number, patch: Record<string, unknown>) => Promise<void> | void;
  setFlightStatus: (sid: string, idx: number, status: string) => Promise<void> | void;
  removeAircraft: (sid: string, idx: number) => Promise<void> | void;
}

export interface UsePatternAutotrackOptions {
  /** עמדת מגדל + תמונ"א זמינה + מפה מעוגנת. */
  enabled: boolean;
  anchor: MapGeoAnchor | null;
  aspect: number;
  /** ההקפות **המוצגות** (מסלולים פעילים) - מטוס אינו מזוהה על הקפה כבויה. */
  patterns: Row[];
  joiningPoints: Row[];
  joiningPointStrips: Row[];
  joiningPointAircraft: Row[];
  stripAircraft: Record<string, Row[]> | null | undefined;
  presetId: number | string | null | undefined;
  /** גובה השדה - לגובה המתוכנן המוחלט על הצלע (סטייה מותרת מהגובה). */
  elevFt?: number | null;
  pollMs?: number;
  handlers: PatternAutotrackHandlers;
}

export interface UsePatternAutotrackResult {
  /** `aircraftKey` של מטוסים שממתינים בנקודה ורכיב שלהם עד 3 מייל ממנה - הבהוב ירוק. */
  nearPoint: Set<string>;
  /** `aircraftKey` → מזהה הרכיב האווירי המשודך - להבהוב הרכיב ולגובה בטבלה. */
  trackIdByKey: Map<string, string>;
}

const EMPTY_SET: Set<string> = new Set();
const EMPTY_MAP: Map<string, string> = new Map();

export function usePatternAutotrack(o: UsePatternAutotrackOptions): UsePatternAutotrackResult {
  // הקלט נקרא מתוך הטיימר ולא נסגר עליו - אחרת כל רינדור מקים טיימר חדש
  const optsRef = useRef(o);
  optsRef.current = o;
  const stateRef = useRef<PatternTrackState>(emptyPatternTrackState());
  /**
   * תור כתיבות **לכל מטוס**. המנוע מוציא כל פעולה פעם אחת בלבד (מבוסס מעברים),
   * ולכן אסור לזרוק פעולה כשקודמת עוד בדרך - "יצא מהנקודה" ומיד "עם הרוח" חייבים
   * לצאת שניהם, ובסדר הזה.
   */
  const queueRef = useRef<Map<string, Promise<void>>>(new Map());
  const sigRef = useRef('');
  const [view, setView] = useState<UsePatternAutotrackResult>({ nearPoint: EMPTY_SET, trackIdByKey: EMPTY_MAP });

  useEffect(() => {
    if (!o.enabled) return;
    return joinAirPicture({ pollMs: o.pollMs });
  }, [o.enabled, o.pollMs]);

  useEffect(() => {
    if (!o.enabled) {
      stateRef.current = emptyPatternTrackState();
      if (sigRef.current !== '') { sigRef.current = ''; setView({ nearPoint: EMPTY_SET, trackIdByKey: EMPTY_MAP }); }
      return;
    }

    const run = (a: AutoAction, ac: AutoAircraft | undefined) => {
      const key = aircraftKey(a.stripId, a.idx);
      const prev = queueRef.current.get(key) ?? Promise.resolve();
      const next = prev.then(() => write(a, ac)).catch(() => { /* נתק - הפולינג יסנכרן */ });
      queueRef.current.set(key, next);
      void next.then(() => { if (queueRef.current.get(key) === next) queueRef.current.delete(key); });
    };

    const write = async (a: AutoAction, ac: AutoAircraft | undefined) => {
      const { handlers: h } = optsRef.current;
      if (a.kind === 'leave-point') {
        await h.updateJoiningAircraft(ac?.pointId ?? null, a.stripId, a.idx,
          { in_pattern: true, pattern_id: a.patternId, runway_ident: a.runwayIdent });
      } else if (a.kind === 'set-leg') {
        if (!a.inPattern) {
          await h.updateJoiningAircraft(ac?.pointId ?? null, a.stripId, a.idx,
            { in_pattern: true, pattern_id: a.patternId, runway_ident: a.runwayIdent });
        }
        await h.setFlightStatus(a.stripId, a.idx, a.leg);
      } else {
        await h.setFlightStatus(a.stripId, a.idx, 'landed');
        setTimeout(() => { void optsRef.current.handlers.removeAircraft(a.stripId, a.idx); }, LANDED_REMOVE_MS);
      }
    };

    const tick = () => {
      const snap = airPictureStore.getSnapshot();
      const now = Date.now();
      // תמונה ישנה **מקפיאה** את המנוע. הפער בטיקים מאפס בו את הספירות, כך
      // שמטוס שנעלם לפני ההקפאה אינו "נוחת" ברגע שהתמונה חוזרת. הטריות לפי
      // האישור האחרון מהמאגר (כולל 304) ולא לפי זמן הדגימה - ראה pictureFresh.
      if (!pictureFresh(snap, airPictureStore.lastConfirmedAt(), now)) return;
      const cur = optsRef.current;
      if (!cur.anchor) return;

      const { strips, aircraft } = autotrackInputs({
        joiningPoints: cur.joiningPoints, joiningPointStrips: cur.joiningPointStrips,
        joiningPointAircraft: cur.joiningPointAircraft, stripAircraft: cur.stripAircraft,
        presetId: cur.presetId, anchor: cur.anchor,
      });
      const patterns = cur.patterns.map(p => patternGeoOf(p, cur.aspect, cur.anchor, cur.elevFt)).filter(Boolean) as NonNullable<ReturnType<typeof patternGeoOf>>[];
      const r = tickPatternAutotrack(stateRef.current, {
        strips, aircraft, patterns, now,
        tracks: snap.tracks.map(t => ({ id: t.id, cs: t.cs, lat: t.lat, lon: t.lon, alt: t.alt, spd: t.spd, hdg: t.hdg })),
      });
      stateRef.current = r.state;

      for (const a of r.actions) {
        run(a, aircraft.find(x => x.stripId === a.stripId && x.idx === a.idx));
      }

      const sig = `${[...r.nearPoint].sort().join(',')}#${[...r.trackIdByKey].map(([k, v]) => `${k}=${v}`).sort().join(',')}`;
      if (sig !== sigRef.current) {
        sigRef.current = sig;
        setView({ nearPoint: r.nearPoint, trackIdByKey: r.trackIdByKey });
      }
    };

    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [o.enabled]);

  return view;
}
