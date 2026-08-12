import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AirPictureLayer from '../../src/airPicture/AirPictureLayer';
import { airPictureStore } from '../../src/airPicture/store';
import { DEFAULT_PREFS } from '../../src/airPicture/prefs';
import type { MapGeoAnchor } from '../../src/utils/geo';

/**
 * מתקן בדיקה לשכבת התמונ"א ב**מצב סכמטי** - שדה מעוגן בלי תמונת מפה.
 *
 * זה בדיוק ההבדל בין עמדה שעובדת (מפה ארצית) לעמדה שלא: העוגן מכסה כמה
 * קילומטרים בלבד, הקנבס הוא תיבת 4:3 בתוך המכולה, ואין תמונת רקע. המתקן
 * משחזר את שלושתם, כדי שאפשר יהיה לענות על שאלה אחת: האם המטוס **נצבע**.
 */
const params = new URLSearchParams(location.search);
document.documentElement.style.setProperty('--s', params.get('s') || '1');

// העוגנים האמיתיים של "בחא 8 - הקפה" - שדה מעוגן ללא מפה.
const ANCHOR: MapGeoAnchor = {
  x1: 54, y1: 32, lat1: 31.84686111111111, lon1: 34.818472222222226,
  x2: 77, y2: 58, lat2: 31.828888888888887, lon2: 34.83883333333333,
};
const BOUNDS = { left: 40, top: 20, width: 480, height: 360 };

function Fixture() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // מטוס בדיוק במרכז השדה - בין שני העוגנים.
    airPictureStore.setSnapshot(Date.now(), 1, [{
      id: 't1', cs: 'בדיקה 1',
      lat: (ANCHOR.lat1 + ANCHOR.lat2) / 2,
      lon: (ANCHOR.lon1 + ANCHOR.lon2) / 2,
      alt: 3000, spd: 120, hdg: 90, cls: 'friend', typ: 'f16', resp: '',
    }], Date.now());
    setReady(true);
  }, []);

  const [visible, setVisible] = useState<number | null>(null);
  return (
    <div id="map-area" style={{ position: 'relative', width: 560, height: 400, background: '#0b1220', overflow: 'hidden' }}>
      {/* רקע סכמטי - בדיוק כמו בעמדת השדה: אין תמונה, יש משטח משובץ */}
      <div data-testid="schematic" style={{
        position: 'absolute', left: BOUNDS.left, top: BOUNDS.top,
        width: BOUNDS.width, height: BOUNDS.height,
        background: 'repeating-linear-gradient(0deg, #0b1220 0 39px, #16233a 39px 40px)',
        pointerEvents: 'none',
      }} />
      {ready && (
        <AirPictureLayer
          anchor={ANCHOR}
          bounds={BOUNDS}
          mapZoom={1}
          prefs={{ ...DEFAULT_PREFS, opacity: 1 }}
          onVisibleCount={setVisible}
        />
      )}
      <div id="visible-count" style={{ position: 'absolute', bottom: 0, right: 0, color: '#fff' }}>{visible ?? '-'}</div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Fixture />);
