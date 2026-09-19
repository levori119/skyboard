// הנתיב שהפקח ביקש לראות מחלון ניהול הנסיעות ("🗺 הצג על מפה"), על המפה הראשית.
//
// יושב בתוך שכבת ה-transform של המפה (כמו TripLiveLayer), ולכן זז עם ה-pan/zoom.
// מקור הנתונים הוא src/utils/tripRoutePreview.ts - החלון כותב, והשכבה הזו היחידה
// שנרשמת, כך שהמפה עצמה אינה מקבלת state חדש.
//
// הצבע סגול ובקו רציף עבה: שונה במכוון מקו הנתיב של נסיעה פעילה (מקווקו, בצבע
// מצב הרכב), כדי שתצוגה מקדימה לא תיקרא כרכב שנוסע עכשיו.

import React from 'react';
import { tr } from '../../i18n/tr';
import type { MapGeoAnchor } from '../../utils/geo';
import { clearTripRoutePreview, previewRoutePct, useTripRoutePreview } from '../../utils/tripRoutePreview';
import type { ImgBounds } from './TripLiveVehicles';

const PREVIEW_COLOR = '#d946ef';

interface Props {
  airfieldId: number | null;
  anchor: MapGeoAnchor | null;
  ptPos: (xPct: number, yPct: number) => React.CSSProperties;
  imgBounds: ImgBounds | null;
}

const TripRoutePreviewLayer: React.FC<Props> = ({ airfieldId, anchor, ptPos, imgBounds }) => {
  const preview = useTripRoutePreview();
  if (!preview) return null;
  // נתיב של שדה אחר אינו מצויר על המפה הזו - האחוזים שלו שייכים לתמונה אחרת
  if (preview.airfieldId != null && airfieldId != null && preview.airfieldId !== airfieldId) return null;
  const pts = previewRoutePct(preview.waypoints, anchor);
  if (!pts.length) return null;

  const svgBox: React.CSSProperties = imgBounds
    ? { top: imgBounds.top, left: imgBounds.left, width: imgBounds.width, height: imgBounds.height }
    : { top: 0, left: 0, width: '100%', height: '100%' };
  const start = pts[0], end = pts[pts.length - 1];
  const dot = (bg: string): React.CSSProperties => ({
    position: 'absolute', width: 14, height: 14, borderRadius: '50%', background: bg,
    border: '2px solid #fff', transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 34,
    boxShadow: '0 0 4px rgba(0,0,0,0.6)',
  });

  return (
    <>
      <svg
        viewBox="0 0 100 100" preserveAspectRatio="none" data-testid="trip-route-preview"
        style={{ position: 'absolute', ...svgBox, pointerEvents: 'none', zIndex: 33 }}
      >
        {/* הילה כהה מתחת לקו - שיקרא גם על מפה בהירה וגם על כהה */}
        <polyline points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#000" strokeOpacity="0.45"
          strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={PREVIEW_COLOR}
          strokeWidth="0.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ ...ptPos(start.x, start.y), ...dot('#22c55e') }} title={tr('trips.previewStart')} />
      <div style={{ ...ptPos(end.x, end.y), ...dot('#ef4444') }} title={tr('trips.previewEnd')} />
      {/* תווית הנתיב ליד המוצא, עם סגירה - התצוגה לא נשארת על המפה בלי דרך להוריד אותה */}
      <div
        data-testid="trip-route-preview-label"
        style={{
          position: 'absolute', ...ptPos(start.x, start.y), transform: 'translate(-50%, calc(-100% - 12px))',
          display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 6,
          background: 'rgba(15,23,42,0.92)', border: `1px solid ${PREVIEW_COLOR}`, color: '#f5d0fe',
          fontSize: 11, fontWeight: 'bold', whiteSpace: 'nowrap', zIndex: 35, pointerEvents: 'auto',
          maxWidth: 320,
        }}
      >
        <span>🗺</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview.label || tr('trips.previewRoute')}</span>
        <button
          data-testid="trip-route-preview-close"
          onClick={e => { e.stopPropagation(); clearTripRoutePreview(); }}
          onPointerDown={e => e.stopPropagation()}
          title={tr('trips.previewHide')}
          style={{ background: 'none', border: 'none', color: '#f5d0fe', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}
        >✕</button>
      </div>
    </>
  );
};

export default TripRoutePreviewLayer;
