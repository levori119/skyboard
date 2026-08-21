// חלון מז"א צף - לתצוגות שאין בהן מפה מעוגנת (טבלה, בלוקים, דסק משימה).
//
// למה חלון ולא שכבה: שכבת המז"א מתלכדת עם מפת השדה לפי **העוגן** שלה. בתצוגה
// שאין בה מפה אין למה להתלכד, ולכן המז"א מקבל משטח משלו - נגרר, ניתן להגדלה,
// ואינטראקטיבי (אפשר להזיז ולזום בתוך מפת Windy עצמה).
//
// תפריט השכבות הוא **אותו רכיב** של השכבה המעוגנת (WeatherMenu) - אותה
// פונקציונליות, אותה לוגיקה, אותו עיצוב. אין כאן חריג.

import { useRef, useState } from 'react';
import { useDragPosition } from '../hooks/useDragPosition';
import { useDockableWindow } from '../hooks/useDockableWindow';
import { windowFrame } from '../utils/windowFrame';
import { tr } from '../i18n/tr';
import i18n from '../i18n';
import type { MapGeoAnchor } from '../utils/geo';
import { anchorCenter } from './fit';
import { windyEmbedUrl } from './windy';
import WeatherMenu from './WeatherMenu';
import { WINDY_SANDBOX, type WeatherStatus } from './WeatherLayer';
import type { WeatherPrefs } from './prefs';

/**
 * מרכז ברירת מחדל כשאין אף מפה מעוגנת בעמדה. מרכז הארץ בזום אזורי - נקודת
 * פתיחה בלבד, שממנה המשתמש גורר. עדיף על אמצע האוקיינוס האטלנטי, שהוא מה
 * ש-Windy מציג בלי מרכז.
 */
const FALLBACK_CENTER = { lat: 31.8, lon: 35.0 };
const FALLBACK_ZOOM = 7;

const MIN_W = 380;
const MIN_H = 300;

interface Props {
  /** עוגן המפה של העמדה, אם יש - כדי שהחלון ייפתח מעל השדה ולא מעל הים. */
  anchor: MapGeoAnchor | null;
  prefs: WeatherPrefs;
  onChange: (next: WeatherPrefs) => void;
  themeMode: 'light' | 'dark' | 'ocean';
  onClose: () => void;
  /** הסבר למה נפתח חלון ולא שכבה (למשל מפה בלי עוגן נ"צ). */
  hint?: string | null;
}

/** סקייל גודל המסך: החלון תחת `zoom: var(--s)` (CLAUDE.md §גרירה, מלכודת 3). */
const rootScale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;

export default function WeatherWindow({ anchor, prefs, onChange, themeMode, onClose, hint }: Props) {
  const winRef = useRef<HTMLDivElement | null>(null);
  const drag = useDragPosition(winRef);
  const dock = useDockableWindow('weather', tr('dock.winWeather'), { onUndock: drag.moveTo });
  const [size, setSize] = useState({ w: 720, h: 480 });
  const [status, setStatus] = useState<WeatherStatus>('loading');

  const light = themeMode === 'light';
  const bg = light ? '#ffffff' : themeMode === 'ocean' ? '#05404e' : '#1e293b';
  const border = light ? '#cbd5e1' : themeMode === 'ocean' ? '#0e7490' : '#334155';
  const text = light ? '#1e293b' : themeMode === 'ocean' ? '#cffafe' : '#e2e8f0';
  const muted = light ? '#64748b' : themeMode === 'ocean' ? '#7dd3fc' : '#94a3b8';
  const accent = light ? '#0284c7' : themeMode === 'ocean' ? '#22d3ee' : '#38bdf8';

  const center = anchorCenter(anchor) || FALLBACK_CENTER;
  const url = windyEmbedUrl({
    lat: center.lat, lon: center.lon,
    zoom: anchorCenter(anchor) ? 9 : FALLBACK_ZOOM,
    overlay: prefs.overlay, level: prefs.level, chrome: 'full',
  });

  // שינוי גודל - Pointer Events, כדי שיעבוד בעט ובאצבע ולא רק בעכבר.
  const onResizeDown = (e: React.PointerEvent) => {
    if (e.button > 0) return;
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const s = rootScale();
    const rtl = i18n.dir() === 'rtl';
    const start = { mx: e.clientX / s, my: e.clientY / s, w: size.w, h: size.h };
    const move = (me: PointerEvent) => {
      // ב-RTL הידית יושבת בפינה השמאלית, ולכן גרירה שמאלה **מגדילה**
      const dx = (me.clientX / s - start.mx) * (rtl ? -1 : 1);
      const dy = me.clientY / s - start.my;
      setSize({ w: Math.max(MIN_W, start.w + dx), h: Math.max(MIN_H, start.h + dy) });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return dock.render(
    <div
      ref={winRef}
      data-weather-window=""
      style={{
        position: 'fixed',
        ...(drag.dragged ? { left: drag.pos!.x, top: drag.pos!.y } : { insetInlineStart: 24, top: 96 }),
        width: size.w, height: size.h,
        background: bg, color: text,
        // חלון **צפייה ותפעול** ולכן מסגרת תורכיז (CLAUDE.md §מסגרת חלון)
        ...windowFrame('view', themeMode, 12),
        boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
        display: 'flex', flexDirection: 'column',
        zIndex: 430, overflow: 'hidden', userSelect: 'none',
        // מעוגן: המשבצת קובעת את המיקום, ולכן העיגון הלוגי מתבטל גם הוא
        ...(dock.docked ? { ...dock.rootStyle, insetInlineStart: 'auto' } : null),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
        <span {...drag.handleProps} onPointerDown={e => { dock.onHeaderPointerDown(e); drag.handleProps.onPointerDown(e); }} style={{ ...drag.handleProps.style, color: muted, cursor: 'grab', fontSize: 13 }}>⠿</span>
        <b style={{ flex: 1, fontSize: 13 }}>{tr('weather.windowTitle')}</b>
        <button onClick={onClose} title={tr('weather.close')}
          style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: 15, padding: 0 }}>✕</button>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ width: 150, flexShrink: 0, padding: '6px 7px', borderInlineEnd: `1px solid ${border}`, overflowY: 'auto' }}>
          <WeatherMenu
            placement="inline"
            prefs={prefs}
            onChange={onChange}
            themeMode={themeMode}
            status={status}
            onClose={onClose}
            hint={hint}
          />
        </div>
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <iframe
            key={url}
            src={url}
            title={tr('weather.windowTitle')}
            sandbox={WINDY_SANDBOX}
            referrerPolicy="no-referrer"
            onLoad={() => setStatus('ok')}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', background: 'transparent' }}
          />
          {status !== 'ok' && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 6, pointerEvents: 'none',
              color: muted, fontSize: 12, textAlign: 'center', padding: 12,
            }}>
              <span style={{ fontSize: 22 }}>🌦</span>
              <span>{tr('weather.loading')}</span>
            </div>
          )}
        </div>
      </div>

      <div
        onPointerDown={onResizeDown}
        onDoubleClick={() => setSize({ w: 720, h: 480 })}
        title={tr('weather.resize')}
        style={{
          position: 'absolute', bottom: 0, insetInlineEnd: 0, width: 16, height: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: i18n.dir() === 'rtl' ? 'nesw-resize' : 'nwse-resize',
          color: accent, fontSize: 12, lineHeight: 1, background: bg,
          borderStartStartRadius: 6, touchAction: 'none', userSelect: 'none',
        }}
      >⇲</div>
    </div>
  );
}
