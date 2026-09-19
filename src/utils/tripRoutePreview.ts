// "הצג על מפה" לנתיב שחושב בניהול נסיעות - הנתיב מצויר על **המפה הראשית**.
//
// חלון ניהול הנסיעות והמפה (GroundView) הם רכיבים רחוקים זה מזה בעץ, ולכן
// ה-state יושב כאן, **מחוץ ל-React**: החלון כותב, ורק שכבת התצוגה במפה נרשמת
// (useSyncExternalStore). כך אף רכיב-אב לא מרונדר מחדש בגלל התצוגה המקדימה -
// אותה תבנית של src/airPicture/store.ts.
//
// נתיב אחד בכל רגע: לחיצה על נתיב אחר מחליפה, ולחיצה חוזרת על אותו נתיב מסתירה.

import { useSyncExternalStore } from 'react';
import { geoToImagePct, type MapGeoAnchor } from './geo';
import type { RouteWaypoint } from './trips';

export interface TripRoutePreview {
  /** מזהה הנתיב המוצג (חתימת הנתיב) - לפיו הכפתור יודע שהוא "דולק" */
  id: string;
  /** שדה התעופה של הנסיעה. מפה של שדה אחר לא מציירת את הנתיב */
  airfieldId: number | null;
  label: string;
  waypoints: RouteWaypoint[];
}

let current: TripRoutePreview | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function getTripRoutePreview(): TripRoutePreview | null {
  return current;
}

export function showTripRoutePreview(p: TripRoutePreview): void {
  current = p;
  emit();
}

export function clearTripRoutePreview(id?: string): void {
  // עם מזהה: מנקה רק אם זה הנתיב המוצג - חלון שנסגר לא מוחק נתיב שחלון אחר הציג
  if (!current || (id !== undefined && current.id !== id)) return;
  current = null;
  emit();
}

/** לחיצה על הכפתור: אותו נתיב - מסתיר, אחר - מציג במקומו */
export function toggleTripRoutePreview(p: TripRoutePreview): void {
  if (current?.id === p.id) clearTripRoutePreview();
  else showTripRoutePreview(p);
}

export function subscribeTripRoutePreview(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useTripRoutePreview(): TripRoutePreview | null {
  return useSyncExternalStore(subscribeTripRoutePreview, getTripRoutePreview, getTripRoutePreview);
}

/** נתיב שאפשר לצייר: לפחות שתי נקודות עם אחוזים או נ"צ */
export function hasDrawableRoute(waypoints: RouteWaypoint[] | undefined | null): boolean {
  if (!Array.isArray(waypoints)) return false;
  return waypoints.filter(w =>
    (Number.isFinite(w?.xPct) && Number.isFinite(w?.yPct)) ||
    (Number.isFinite(w?.lat) && Number.isFinite(w?.lon))).length >= 2;
}

/** הנתיב באחוזי מפה: האחוזים השמורים, ובהיעדרם מהנ"צ דרך עוגן המפה */
export function previewRoutePct(
  waypoints: RouteWaypoint[], anchor: MapGeoAnchor | null,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const w of waypoints || []) {
    if (Number.isFinite(w.xPct) && Number.isFinite(w.yPct)) { out.push({ x: w.xPct as number, y: w.yPct as number }); continue; }
    if (anchor && Number.isFinite(w.lat) && Number.isFinite(w.lon)) {
      const p = geoToImagePct(w.lat as number, w.lon as number, anchor);
      if (Number.isFinite(p.x) && Number.isFinite(p.y)) out.push(p);
    }
  }
  return out.length >= 2 ? out : [];
}
