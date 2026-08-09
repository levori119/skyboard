import { createRoot } from 'react-dom/client';
import CursorGeoReadout from '../../src/components/ground/CursorGeoReadout';
import type { MapGeoAnchor } from '../../src/utils/geo';

/**
 * מתקן בדיקה לקריאת הנ"צ תחת הסמן, באותה תצורה שבה היא נחוצה: שדה **מעוגן
 * ללא מפה**, מכולה בזום `--s`, ומפה שאפשר להגדיל בתוכה.
 *
 * הבדיקה שהמתקן מאפשר היא היחידה שחשובה: האם הנ"צ שמוצג הוא הנ"צ **הנכון**
 * לנקודה שמצביעים עליה. אם הוא לא - העיגון של השדה שגוי, וזו התשובה שחיפשנו.
 */
const params = new URLSearchParams(location.search);
document.documentElement.style.setProperty('--s', params.get('s') || '1');
const zoom = Number(params.get('zoom') || '1');

// העוגנים האמיתיים של "בחא 8 - הקפה" (= תל נוף), שדה מעוגן ללא מפה.
const ANCHOR: MapGeoAnchor = {
  x1: 54, y1: 32, lat1: 31.84686111111111, lon1: 34.818472222222226,
  x2: 77, y2: 58, lat2: 31.828888888888887, lon2: 34.83883333333333,
};
const BOUNDS = { left: 40, top: 20, width: 480, height: 360 };

function Fixture() {
  return (
    /* מוצמד לפינה השמאלית בכוונה: בדף RTL בלוק ברוחב קבוע נדחף לצד ימין,
       ובזום 2 חצי מהמפה יוצא מהחלון ואי-אפשר להצביע עליה בבדיקה. */
    <div id="map-area" style={{ position: 'absolute', left: 0, top: 0, width: 560, height: 400, background: '#0b1220', overflow: 'hidden' }}>
      {/* שכבת התוכן של עמדת השדה נושאת את הזום; המתקן משחזר גם אותה. */}
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
        <div data-testid="schematic" style={{
          position: 'absolute', left: BOUNDS.left, top: BOUNDS.top,
          width: BOUNDS.width, height: BOUNDS.height,
          background: 'repeating-linear-gradient(0deg, #0b1220 0 39px, #16233a 39px 40px)',
          pointerEvents: 'none',
        }} />
        <CursorGeoReadout anchor={ANCHOR} bounds={BOUNDS} mapZoom={zoom} themeMode="dark" />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Fixture />);
