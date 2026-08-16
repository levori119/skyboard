import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MapDrawToggle, MapDrawToolbar, MapDrawSurface, useMapDrawing } from '../../src/components/map/MapDrawLayer';

/**
 * מתקן בדיקה לסרגל הציור המשותף (עמדת מפה + עמדת שדה).
 *
 * משחזר את המבנה האמיתי: מכולת מפה עם שכבת תוכן שמקבלת `transform` של זום/פאן,
 * וקנבס הציור **בתוכה**. כך נבדק מה שבאמת שובר ציור על מפה - העט/האצבע לא
 * נשלחים בלי `touchAction:'none'`, והקואורדינטות מוסטות תחת transform ותחת
 * הזום הגלובלי של גודל המסך (`?s=1.65` = מסך 24").
 */

const params = new URLSearchParams(location.search);
const rootScale = Number(params.get('s') || 1);
const staticParent = params.get('sp') === '1';
document.documentElement.style.setProperty('--s', String(rootScale));

function Fixture() {
  const draw = useMapDrawing();
  const [zoom, setZoom] = useState(1);
  const [wide, setWide] = useState(false);

  return (
    <div id="root-zoom" style={{ zoom: rootScale as any }}>
      <div id="map-area"
        style={{ position: 'relative', overflow: 'hidden', width: wide ? 900 : 600, height: 400, background: '#0b1220', touchAction: 'none' }}>
        {/* שכבת תוכן המפה - זו שמקבלת זום/פאן. `zIndex:0` + `isolation` סוגרים
            אותה כקונטקסט ערימה, בדיוק כמו בעמדת השדה: בלי זה הקנבס (z=200)
            דולף החוצה ומכסה את סרגל הציור. */}
        <div id="map-content" style={{ position: 'absolute', inset: 0, zIndex: 0, isolation: 'isolate', transform: zoom === 1 ? '' : `scale(${zoom})`, transformOrigin: 'center center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg,#0b1220 0 39px,#16233a 39px 40px)' }} />
          {/* `?sp=1` - ההורה הישיר של המשטח הוא `position:static` בגודל **אחר**
              מבלוק ההכלה. זה בדיוק מה שקרה בעמדת השדה (689 מול 1055): מנוע שמודד
              את ההורה בונה bitmap בגודל אחד בעוד ששכבת הצורות מפרשת אותו באחר,
              והצורה נוחתת מוסטת ומוקטנת. המשטח חייב למדוד את **עצמו**. */}
          {staticParent
            ? <div style={{ position: 'static', width: 400, height: 300 }}><MapDrawSurface engine={draw} /></div>
            : <MapDrawSurface engine={draw} />}
        </div>
        <div style={{ position: 'absolute', bottom: 8, left: 8, zIndex: 31, width: 90 }}>
          <MapDrawToggle active={draw.active} labeled onToggle={() => draw.setActive(v => !v)} />
        </div>
        {draw.active && (
          <MapDrawToolbar
            style={{ bottom: 36, left: 8 }}
            tool={draw.tool} onToolChange={draw.setTool}
            color={draw.color} onColorChange={draw.setColor}
            size={draw.size} onSizeChange={draw.setSize}
            filled={draw.filled} onFilledChange={draw.setFilled}
            onClear={draw.clear}
            onClose={() => draw.setActive(false)}
          />
        )}
      </div>
      {/* פקדי המתקן - מדמים זום מפה ושינוי גודל חלון */}
      <button id="zoom-in" onClick={() => setZoom(2)}>zoom</button>
      <button id="resize" onClick={() => setWide(w => !w)}>resize</button>
      <span id="shape-count">{draw.shapes.length}</span>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Fixture />);
