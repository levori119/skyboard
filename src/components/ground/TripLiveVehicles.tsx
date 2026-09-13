// הרכבים בנסיעה פעילה, **במיקומם בפועל**, על מפת השדה במגדל (TRIP_LIVE_TRACKING_SPEC.md §6 T1-T12).
//
// להבדיל מ-TripMapVehicles, שמציג את הנסיעות **הקרובות** ליד נקודת המוצא שלהן:
// מרגע שהנהג לחץ "הפעל נסיעה" הרכב מוצג כאן, במקום שה-GPS שלו מדווח, עם הנתיב
// שהמגדל אישר לו. TripMapVehicles מדלג על נסיעה שהופעלה - אחרת אותו רכב היה
// מופיע פעמיים, פעם בשער ופעם בשטח.
//
// צבע הרכב אומר מה המצב (liveVehicleTone): כחול נוסע, סגול ממתין למיקום, אפור
// אות אבד, אדום סוטה, כתום מול אלמנט סוגר. **תמיד יחד עם טקסט** - לא בצבע בלבד.
//
// שני הרכיבים: TripLiveVehicles מציג (ונבדק ברינדור סטטי), TripLiveLayer מושך
// את הנתונים דרך useLiveTrips ומעביר אותם.
//
// יושב בתוך שכבת ה-transform של המפה, ולכן מקבל את ה-pan/zoom בחינם - בדיוק כמו
// אלמנטי השדה ו-TripMapVehicles.

import React from 'react';
import { tr } from '../../i18n/tr';
import { geoToImagePct, type MapGeoAnchor } from '../../utils/geo';
import { suggestedVehicleIcon } from '../../utils/trips';
import { LIVE_TONE_COLOR, liveVehicleTone, type LiveTone, type LiveTrip } from '../../utils/liveTrips';
import useLiveTrips from '../../hooks/useLiveTrips';

interface MapPoint { id: number; x_pct: number | null; y_pct: number | null; name?: string | null }

export interface ImgBounds { top: number; left: number; width: number; height: number }

export interface TripLiveVehiclesProps {
  trips: LiveTrip[];
  /** עוגן המפה. בלעדיו אין דרך למקם נ"צ על התמונה (T10) */
  anchor: MapGeoAnchor | null;
  /** נקודות השדה - רכב בלי מיקום מוצג בנקודת המוצא שלו */
  points: MapPoint[];
  /** אחוזים → מיקום על המפה, אותו חישוב של אלמנטי השדה */
  ptPos: (xPct: number, yPct: number) => React.CSSProperties;
  /** גבולות התמונה על המסך - לקו הנתיב. null = המפה ממלאת את המיכל */
  imgBounds: ImgBounds | null;
  onOpenTrip?: (tripId: number) => void;
}

/**
 * השכבה לפי חומרה. כשרכבים קרובים זה לזה (שיירה, רחבה עמוסה) התוויות חופפות -
 * ורכב שמתריע אסור שיוסתר מאחורי רכב שנוסע כרגיל. נמצא בצילום מסך של בדיקת
 * הדפדפן: ארבעה רכבים סמוכים, והתווית של המתריע כוסתה.
 */
export const TONE_Z: Record<LiveTone, number> = { normal: 28, waiting: 29, stale: 30, deviating: 31, blocked: 32 };

/** קוטר עיגול הרכב - מרכזו הוא המיקום המדויק על המפה */
const MARKER_SIZE = 24;

/** מיקום הרכב באחוזים, או null כשאין מיקום או אין עוגן */
function vehiclePct(t: LiveTrip, anchor: MapGeoAnchor | null): { x: number; y: number } | null {
  if (!t.position || !anchor) return null;
  const p = geoToImagePct(t.position.lat, t.position.lng, anchor);
  return Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
}

/** קו הנתיב באחוזים: האחוזים השמורים, ובהיעדרם מהנ"צ דרך העוגן */
function routePct(t: LiveTrip, anchor: MapGeoAnchor | null): { x: number; y: number }[] {
  if (!t.has_route || !Array.isArray(t.route)) return [];
  const out: { x: number; y: number }[] = [];
  for (const w of t.route) {
    if (Number.isFinite(w.xPct) && Number.isFinite(w.yPct)) { out.push({ x: w.xPct as number, y: w.yPct as number }); continue; }
    if (anchor && Number.isFinite(w.lat) && Number.isFinite(w.lon)) out.push(geoToImagePct(w.lat, w.lon, anchor));
  }
  return out.length >= 2 ? out : [];
}

/** השורה שמתחת לשם - מה שהפקח צריך לדעת עכשיו על הרכב */
function detailText(t: LiveTrip, tone: LiveTone, anchored: boolean): string {
  if (!anchored) return tr('trips.liveNoAnchor');
  switch (tone) {
    case 'waiting': return tr('trips.liveWaiting');
    case 'stale': return tr('trips.liveStale');
    case 'blocked':
      return tr('trips.liveBlocked', {
        element: t.blocking_element?.name || '',
        state: t.blocking_element?.state_label || '',
      });
    case 'deviating': return tr('trips.liveDeviation', { meters: Math.round(t.deviation_m ?? 0) });
    default:
      return t.position?.speed_kmh != null ? tr('trips.liveSpeed', { speed: Math.round(t.position.speed_kmh) }) : '';
  }
}

export const TripLiveVehicles: React.FC<TripLiveVehiclesProps> = ({ trips, anchor, points, ptPos, imgBounds, onOpenTrip }) => {
  if (!Array.isArray(trips) || trips.length === 0) return null;

  const svgBox: React.CSSProperties = imgBounds
    ? { top: imgBounds.top, left: imgBounds.left, width: imgBounds.width, height: imgBounds.height }
    : { top: 0, left: 0, width: '100%', height: '100%' };

  return (
    <>
      {/* הנתיבים שאושרו - מתחת לרכבים */}
      {anchor && (
        <svg
          viewBox="0 0 100 100" preserveAspectRatio="none" data-testid="live-routes"
          style={{ position: 'absolute', ...svgBox, pointerEvents: 'none', zIndex: 3 }}
        >
          {trips.map(t => {
            const pts = routePct(t, anchor);
            if (!pts.length) return null;
            const color = LIVE_TONE_COLOR[liveVehicleTone(t)];
            return (
              <polyline
                key={t.id} data-testid={`live-route-${t.id}`}
                points={pts.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none" stroke={color} strokeWidth="0.45" strokeOpacity="0.85"
                strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1.4,0.8"
              />
            );
          })}
        </svg>
      )}

      {trips.map(t => {
        const tone = liveVehicleTone(t);
        const color = LIVE_TONE_COLOR[tone];
        const anchored = !!anchor;
        let pos = vehiclePct(t, anchor);
        // בלי מיקום (ממתין) או בלי עוגן - הרכב בנקודת המוצא, עם הסבר למה
        if (!pos) {
          const origin = points.find(p => p.id === t.from_point_id);
          if (!origin || origin.x_pct == null || origin.y_pct == null) return null;
          pos = { x: origin.x_pct, y: origin.y_pct };
        }
        const label = t.vehicle_name || t.vehicle_type_name || t.permit_driver_name || t.driver_name || '';
        const detail = detailText(t, tone, anchored);
        const alarming = tone === 'deviating' || tone === 'blocked';
        const heading = t.position?.heading ?? 0;
        return (
          <div
            key={t.id}
            data-testid={`live-vehicle-${t.id}`}
            data-tone={tone}
            onClick={() => onOpenTrip?.(t.id)}
            title={[tr('trips.liveMarkerTitle', { vehicle: label || '-' }), detailText(t, 'normal', anchored)].filter(Boolean).join(' · ')}
            style={{
              position: 'absolute', ...ptPos(pos.x, pos.y),
              // **מרכז העיגול** על הנקודה, והתווית תלויה מתחתיו. translate(-50%,-50%)
              // מירכז את העיגול והתווית יחד - והעיגול עלה חצי גובה תווית מעל המיקום
              // האמיתי (17 פיקסלים, עשרות מטרים בזום). נמצא בבדיקת דפדפן, לא ברינדור סטטי.
              transform: `translate(-50%, -${MARKER_SIZE / 2}px)`, zIndex: TONE_Z[tone],
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              cursor: onOpenTrip ? 'pointer' : 'default', pointerEvents: 'auto',
            }}
          >
            <div style={{ position: 'relative', width: MARKER_SIZE, height: MARKER_SIZE }}>
              {alarming && (
                <div style={{
                  position: 'absolute', inset: -7, borderRadius: '50%', border: `2px solid ${color}`,
                  animation: 'tripLivePulse 1s ease-out infinite', pointerEvents: 'none',
                }} />
              )}
              <div style={{
                width: MARKER_SIZE, height: MARKER_SIZE, borderRadius: '50%', background: color,
                border: '2px solid #ffffff', boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: tone === 'stale' ? 0.7 : 1,
              }}>
                {t.position
                  // ▲ מצביע צפונה, והכיוון מהטלפון נמדד מהצפון
                  ? <span style={{ color: '#ffffff', fontSize: 11, lineHeight: 1, transform: `rotate(${heading}deg)` }}>▲</span>
                  : <span style={{ fontSize: 12, lineHeight: 1 }}>{t.icon || suggestedVehicleIcon(t.vehicle_type_name ?? null)}</span>}
              </div>
            </div>
            <div style={{
              marginTop: 3, display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '1px 6px', borderRadius: 7, background: '#0f172ae6',
              border: `1.5px solid ${color}`, color: '#e2e8f0', fontSize: 10, whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(0,0,0,0.55)',
            }}>
              <span style={{ fontWeight: 'bold' }}>
                {t.icon || suggestedVehicleIcon(t.vehicle_type_name ?? null)} {label}
              </span>
              {detail && (tone !== 'normal' || !anchored) && <span style={{ color, fontWeight: 'bold' }}>{detail}</span>}
              {/* T9: בלי נתיב שמור המגדל לא יקבל התרעת סטייה - ואומרים זאת */}
              {!t.has_route && anchored && <span style={{ color: '#94a3b8', fontSize: 9 }}>{tr('trips.liveNoRoute')}</span>}
            </div>
          </div>
        );
      })}
      <style>{'@keyframes tripLivePulse { from { transform: scale(0.8); opacity: 0.9; } to { transform: scale(1.5); opacity: 0; } }'}</style>
    </>
  );
};

export interface TripLiveLayerProps extends Omit<TripLiveVehiclesProps, 'trips'> {
  airfieldId: number | null;
}

/** השכבה על המפה: מושכת את הנסיעות הפעילות ומציגה אותן */
export const TripLiveLayer: React.FC<TripLiveLayerProps> = ({ airfieldId, ...rest }) => {
  const trips = useLiveTrips(airfieldId);
  return <TripLiveVehicles trips={trips} {...rest} />;
};

export default TripLiveLayer;
