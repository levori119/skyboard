// שכבת התמונ"א על המפה - **רכיב משותף** לעמדת הבקר ולעמדת המגדל.
//
// הרכיב דק בכוונה: הוא מנוי ל-store (מחוץ ל-React), מחזיק קנבס אחד, ומריץ
// לולאת ציור. **אין בו state של מטוסים**, ולכן דגימה חדשה לא מרנדרת אותו -
// היא נצבעת. זה מה שמאפשר לתמונ"א לחיות בתוך SectorDashboard בלי לגעת בו.
//
// ראה AIR_PICTURE_SPEC.md §5.

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { airPictureStore } from './store';
import { joinAirPicture } from './poller';
import { prepare, countOnScreen, ageSec, filtersOf, STALE_AFTER_SEC } from './track';
import { renderFrame, densityFor, clearLabelCache } from './render';
import type { AirPicturePrefs } from './prefs';
import type { MapGeoAnchor } from '../utils/geo';

export interface MapImgBounds { top: number; left: number; width: number; height: number }

interface Props {
  /** עוגן המפה. `null` = מפה לא מעוגנת → השכבה לא מרונדרת כלל. */
  anchor: MapGeoAnchor | null;
  /** גבולות תמונת המפה בתוך שכבת התוכן, בפיקסלי CSS. */
  bounds: MapImgBounds | null;
  /** זום המפה - נכנס לצפיפות הביטמאפ כדי שהטקסט יישאר חד. */
  mapZoom: number;
  prefs: AirPicturePrefs;
  /** קצב הדגימה מקונפיג המאגר. */
  pollMs?: number;
  /** מתחת לשכבות SKY-KING ומעל תמונת המפה. */
  zIndex?: number;
  /**
   * כמה מטוסים **בתצוגה הזו** אחרי סינון גיאוגרפי. הפאנל הציג את המספר
   * הגלובלי מהמאגר, וזה הטעה: בעמדת שדה שהקנבס שלה מכסה 8 ק"מ, "232 מטוסים"
   * לצד מסך ריק נראה כמו תקלה - בזמן שפשוט אף מטוס לא מעל השדה.
   */
  onVisibleCount?: (n: number) => void;
}

/** 10fps. תמונה שמתעדכנת כל 2 שניות לא צריכה 60 - זה פי 6 פחות עבודה. */
const FRAME_MS = 100;
/** מעל זה השכבה מורידה את עצמה לציור-בדגימה-בלבד. */
const FRAME_BUDGET_MS = 3;
/** כמה פריימים חורגים ברצף לפני הורדת רמה. פריים בודד יקר הוא רעש. */
const BUDGET_STRIKES = 12;

const rootScale = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;

export default function AirPictureLayer({
  anchor, bounds, mapZoom, prefs, pollMs, zIndex = 0, onVisibleCount,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snap = useSyncExternalStore(airPictureStore.subscribe, airPictureStore.getSnapshot);

  // ההעדפות נקראות בלולאת הציור, לא ב-render: הזזת סליידר משנה ref ולא state,
  // ולכן היא לא מרנדרת מחדש דבר - היא פשוט משנה את הפריים הבא.
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  const zoomRef = useRef(mapZoom);
  zoomRef.current = mapZoom;
  const reportRef = useRef(onVisibleCount);
  reportRef.current = onVisibleCount;

  const on = prefs.on && !!anchor && !!bounds;

  // ── הצטרפות לתמונ"א ────────────────────────────────────────────────────────
  // ה-poller יחיד לעמדה וסופר מנויים, ולכן דו-מפה לא מכפילה תעבורה.
  useEffect(() => {
    if (!on) return;
    return joinAirPicture({ pollMs });
  }, [on, pollMs]);

  // ── לולאת הציור ────────────────────────────────────────────────────────────
  useEffect(() => {
    const cv = canvasRef.current;
    if (!on || !cv || !bounds) return;
    const cx = cv.getContext('2d');
    if (!cx) return;

    let raf = 0;
    let last = 0;
    let strikes = 0;
    let degraded = false;
    let lastSeq = -1;
    let lastCount = -1;
    let density = 0;

    const sizeCanvas = (d: number) => {
      const w = Math.max(1, Math.round(bounds.width * d));
      const h = Math.max(1, Math.round(bounds.height * d));
      if (cv.width === w && cv.height === h) return;
      cv.width = w;
      cv.height = h;
      // שינוי צפיפות פוסל את כל הביטמאפים - הם נוצרו לגודל אחר.
      clearLabelCache();
    };

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (ts - last < FRAME_MS) return;
      last = ts;

      const s = snapRef.current;
      const a = anchorRef.current;
      if (!a) return;

      // ברמה מופחתת מציירים **רק** כשהגיעה דגימה חדשה: המטוסים מנתרים כל
      // 2 שניות, אבל העמדה נשארת מהירה. ההעדפה הזו מכוונת - עמדה שמגיבה
      // לאט לעט היא תקלה, תמונ"א מנתרת היא אי-נוחות.
      if (degraded && s.seq === lastSeq) return;

      const now = Date.now();
      const d = densityFor(window.devicePixelRatio || 1, rootScale(), zoomRef.current);
      if (d !== density) { density = d; sizeCanvas(d); }

      const p = prefsRef.current;
      // אותם מסננים בדיוק של הסצנה התלת מימדית - מטוס שסונן כאן אינו יכול
      // להופיע שם, וההפך. ראה track.filtersOf
      const filters = filtersOf(p);
      // חישוב-החשבון מתבצע מרגע **קבלת** הדגימה בעמדה, ולא מחותמת המאגר:
      // הפער ביניהן הוא זמן הרשת, והוא כבר מגולם במיקום שהמאגר מסר.
      const dt = degraded ? 0 : Math.max(0, (now - s.receivedAt) / 1000);
      const age = s.t ? ageSec(s.t, now) : 0;

      const t0 = performance.now();
      const tracks = prepare(s.tracks, a, dt, filters);
      renderFrame(cx, tracks, {
        width: bounds.width, height: bounds.height,
        scale: p.scale, opacity: p.opacity, labels: p.labels,
        density: d, stale: age > STALE_AFTER_SEC || s.status !== 'live',
      });
      // מדווח את מה שבאמת **על המסך**, בלי שולי הסינון שנחתכים ע"י הקנבס.
      // רק כשהמספר משתנה - זו לולאת ציור, לא מקום ל-setState בכל פריים.
      const onScreen = countOnScreen(tracks);
      if (onScreen !== lastCount) { lastCount = onScreen; reportRef.current?.(onScreen); }
      lastSeq = s.seq;

      if (!degraded) {
        strikes = performance.now() - t0 > FRAME_BUDGET_MS ? strikes + 1 : 0;
        if (strikes >= BUDGET_STRIKES) {
          degraded = true;
          console.warn('[airPicture] חריגה מתקציב הציור - ירידה לציור בדגימה בלבד');
        }
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [on, bounds]);

  if (!on || !bounds) return null;

  return (
    <canvas
      ref={canvasRef}
      data-air-picture=""
      style={{
        position: 'absolute',
        top: bounds.top, left: bounds.left,
        width: bounds.width, height: bounds.height,
        // חובה: בלעדיו הקנבס בולע כל גרירה, לחיצה וציור על המפה - כלומר שובר
        // את כל העמדה. התמונ"א היא מודעות מצבית, לא יישות שנוגעים בה.
        pointerEvents: 'none',
        zIndex,
      }}
    />
  );
}
