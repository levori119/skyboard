// הרכבים של הנסיעות הקרובות, על מפת השדה.
//
// כל נסיעה מציגה את הרכב **ליד נקודת המוצא שלה, 10 דקות לפני** היציאה המשוערת
// (src/utils/trips.ts §isVehicleOnMap) - כדי שהפקח יראה מה עומד לצאת לשטח לפני
// שהוא יוצא, ולא אחרי שהוא כבר נוסע.
//
// הרכב **אינו יורד** בשעת היציאה אלא כשהנסיעה מסומנת כהסתיימה: נסיעה שאיחרה
// היא בדיוק זו שצריך לראות. מה שכן מגביל הוא חלון ההתיישנות, כדי שנסיעה
// שאיש לא סגר לא תישאר על המפה לנצח.
//
// יושב בתוך שכבת ה-transform של המפה ולכן מקבל את ה-pan/zoom שלה בחינם -
// המיקום נגזר מ-`ptPos` של GroundView, בדיוק כמו אלמנטי השדה.

import React from 'react';
import { tr } from '../../i18n/tr';
import useAirfieldTrips from '../../hooks/useAirfieldTrips';
import {
  TRIP_STATUS_COLOR, asTripStatus, minutesUntilDeparture, suggestedVehicleIcon,
} from '../../utils/trips';
import type { Trip } from './TripsManagementWindow';

/** כל 15 שניות - אותו קצב של ההתראות, ועל חלון מצומצם שהשרת כבר סינן. */
const POLL_MS = 15_000;

interface MapPoint { id: number; x_pct: number | null; y_pct: number | null; name?: string | null }

export interface TripMapVehiclesProps {
  airfieldId: number | null;
  /** נקודות השדה, כדי למקם את הרכב ליד נקודת המוצא */
  points: MapPoint[];
  /** ממיר אחוזים למיקום בפועל על המפה - אותו חישוב של אלמנטי השדה */
  ptPos: (xPct: number, yPct: number) => React.CSSProperties;
  onOpenTrip?: (tripId: number) => void;
}

export const TripMapVehicles: React.FC<TripMapVehiclesProps> = ({ airfieldId, points, ptPos, onOpenTrip }) => {
  // `scope='upcoming'` - השרת מסנן לחלון ההתראה, ולכן ה-poll קטן גם בשדה עמוס
  const { trips } = useAirfieldTrips<Trip>(airfieldId, 'upcoming', POLL_MS);

  if (!airfieldId || trips.length === 0) return null;

  return (
    <>
      {trips.map(t => {
        // נסיעה שהנהג כבר הפעיל מוצגת במיקומה בפועל (TripLiveVehicles). כאן היא
        // הייתה נשארת תקועה בשער - אותו רכב פעמיים, ואחד מהם במקום הלא נכון.
        if (t.driver_started_at && !t.ended_at) return null;
        const pt = points.find(p => p.id === t.from_point_id);
        // נסיעה שמוצאה נרשם כטקסט חופשי אין לה מקום על המפה - היא מוצגת
        // בחלון "ניהול נסיעות" בלבד, ולא נדחפת לפינה שרירותית
        if (!pt || pt.x_pct == null || pt.y_pct == null) return null;
        const st = asTripStatus(t.status);
        const mins = minutesUntilDeparture(t.scheduled_at);
        const late = mins !== null && mins < 0;
        const color = TRIP_STATUS_COLOR[st];
        const label = t.vehicle_name || t.vehicle_type_name || t.permit_driver_name || t.driver_name || '';
        return (
          <div
            key={t.id}
            data-testid={`trip-vehicle-${t.id}`}
            onClick={() => onOpenTrip?.(t.id)}
            title={tr('trips.mapMarkerTitle', { vehicle: label || '-', from: pt.name || '' })}
            style={{
              position: 'absolute', ...ptPos(pt.x_pct, pt.y_pct),
              // הסטה קטנה מהנקודה עצמה, כדי שלא לכסות את סימון הנקודה שמתחתיה
              transform: 'translate(-50%, -140%)',
              zIndex: 26, cursor: onOpenTrip ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', gap: 3,
              padding: '1px 5px', borderRadius: 9,
              background: '#0f172ae6', border: `1.5px solid ${color}`,
              color: '#e2e8f0', fontSize: 10, whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(0,0,0,0.55)',
              // נסיעה שזמנה עבר ועדיין לא יצאה - מהבהבת, כי היא החריגה
              animation: late ? 'tripVehicleLate 0.9s ease-in-out infinite alternate' : undefined,
            }}
          >
            <span style={{ fontSize: 13 }}>{t.icon || suggestedVehicleIcon(t.vehicle_type_name)}</span>
            {label && <span style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
            {mins !== null && (
              <span style={{ color, fontWeight: 'bold' }}>
                {late
                  ? tr('trips.alertDepartureLate', { minutes: -Math.round(mins) })
                  : tr('trips.alertDeparture', { minutes: Math.round(mins) })}
              </span>
            )}
          </div>
        );
      })}
      <style>{`@keyframes tripVehicleLate { from { opacity: 1; } to { opacity: 0.45; } }`}</style>
    </>
  );
};

export default TripMapVehicles;
