// תפריט שכבות המז"א - **רכיב משותף** לשכבה המעוגנת על המפה ולחלון הצף.
//
// המבנה זהה לתפריט המהיר של Windy שהוצג באפיון: עמודה של כפתורי גלולה, לכל
// אחד עיגול צבע שמזהה את השכבה במבט אחד. שני הבדלים מכוונים מול המקור -
//
//   1. **הכיתוב בעברית ודרך ה-registry.** התפריט של Windy עצמו מוסתר
//      (`menu=` ריק בכתובת ההטמעה), כי שפת העמדה נקבעת בבורר השפה של SKY-KING
//      ולא בהעדפות של אתר חיצוני.
//   2. **עיגולי הצבע הם CSS ולא תמונות.** ה-CSP חוסם תמונות ממקור חיצוני
//      (`img-src 'self' data: blob:`), ותמונות מוטבעות היו מנפחות את הבאנדל
//      בלי להוסיף מידע - העיגול עונה על "איזו שכבה זו" בדיוק כמו התצוגה
//      המוקטנת באתר.

import { useRef } from 'react';
import { useDragPosition } from '../hooks/useDragPosition';
import { windowFrame } from '../utils/windowFrame';
import { tr } from '../i18n/tr';
import { WEATHER_LAYERS, WINDY_LEVELS, weatherLayer, type WeatherLayerGroup, type WindyOverlay, type WindyLevel } from './windy';
import type { WeatherPrefs, WeatherBlend } from './prefs';
import type { WeatherStatus } from './WeatherLayer';

interface Props {
  prefs: WeatherPrefs;
  onChange: (next: WeatherPrefs) => void;
  themeMode: 'light' | 'dark' | 'ocean';
  status: WeatherStatus;
  onClose: () => void;
  /**
   * `floating` - חלון נגרר על המפה, עם מסגרת לפי קוד הצבע.
   * `inline` - עמודה בתוך חלון המז"א הצף, שכבר יש לו מסגרת וכותרת משלו.
   */
  placement?: 'floating' | 'inline';
  /** מוצג כשאין עוגן למפה, במקום להשאיר את המשתמש מול תפריט שלא עושה דבר. */
  hint?: string | null;
  /**
   * פתיחת חלון עיון בנקודה. קיים רק לצד השכבה המעוגנת: שם ה-iframe אינו מקבל
   * לחיצות (אחרת היה בולע כל גרירה על המפה), ולכן קריאת רוח בנקודה נעשית
   * בחלון - ושם לחיצה על המפה פותחת טבלת רוח, משבים וכיוון לפי שעות.
   */
  onProbe?: () => void;
}

/** הסדר = מהנפוץ לנדיר: `normal` הוא ברירת המחדל, ו-`screen` לשכבות בהירות. */
const BLENDS: WeatherBlend[] = ['normal', 'multiply', 'screen'];
const GROUPS: WeatherLayerGroup[] = ['quick', 'aviation'];

export default function WeatherMenu({
  prefs, onChange, themeMode, status, onClose, placement = 'floating', hint, onProbe,
}: Props) {
  const floating = placement === 'floating';
  const winRef = useRef<HTMLDivElement | null>(null);
  const drag = useDragPosition(winRef);

  // צבעי המשטח נגזרים מהתמה ולא מקודדים קשיח. ocean היא תמה **כהה**.
  const light = themeMode === 'light';
  const bg = light ? '#ffffff' : themeMode === 'ocean' ? '#05404e' : '#1e293b';
  const border = light ? '#cbd5e1' : themeMode === 'ocean' ? '#0e7490' : '#334155';
  const text = light ? '#1e293b' : themeMode === 'ocean' ? '#cffafe' : '#e2e8f0';
  const muted = light ? '#64748b' : themeMode === 'ocean' ? '#7dd3fc' : '#94a3b8';
  const accent = light ? '#0284c7' : themeMode === 'ocean' ? '#22d3ee' : '#38bdf8';
  const pillBg = light ? '#f1f5f9' : themeMode === 'ocean' ? '#0b5566' : '#334155';

  const set = (patch: Partial<WeatherPrefs>) => onChange({ ...prefs, ...patch });

  /**
   * לחיצה על שכבה **מדליקה** את המז"א אם היה כבוי, ולחיצה חוזרת על השכבה
   * הפעילה מכבה. זו הפעולה שהמשתמש מצפה לה: הוא בא לבחור מכ"ם, לא להדליק
   * תצוגה ואז לבחור מכ"ם.
   */
  const pick = (id: WindyOverlay) => {
    if (prefs.on && prefs.overlay === id) set({ on: false });
    else set({ on: true, overlay: id });
  };

  const statusLine = status === 'blocked'
    ? { color: '#fca5a5', text: tr('weather.blocked') }
    : status === 'loading' && prefs.on
      ? { color: muted, text: tr('weather.loading') }
      : { color: muted, text: tr('weather.source') };

  return (
    <div
      ref={winRef}
      data-weather-menu=""
      style={{
        ...(floating
          ? {
            position: 'fixed' as const,
            ...(drag.dragged ? { left: drag.pos!.x, top: drag.pos!.y } : { insetInlineStart: 12, top: 92 }),
            background: bg,
            // חלון **צפייה ותפעול** ולכן מסגרת תורכיז (CLAUDE.md §מסגרת חלון)
            ...windowFrame('view', themeMode, 12),
            boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
            zIndex: 420,
          }
          : { position: 'relative' as const, background: 'transparent' }),
        color: text,
        padding: floating ? '6px 8px 8px' : 0,
        // הפאנל יושב תחת #root{zoom:var(--s)} - כל המידות כאן נמדדות ביחידות
        // מוגדלות ולכן גדלות עם גודל המסך בלי חישוב נוסף.
        fontSize: 12,
        userSelect: 'none',
        maxHeight: floating ? '84vh' : undefined,
        overflowY: 'auto',
      }}
    >
      {/* כותרת - ידית הגרירה, שם, וכיווץ לתפריט סגור כמו באפיון */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: prefs.menuOpen ? 6 : 0 }}>
        {floating && (
          <span {...drag.handleProps} style={{ ...drag.handleProps.style, color: muted, cursor: 'grab' }}>⠿</span>
        )}
        <button
          onClick={() => set({ menuOpen: !prefs.menuOpen })}
          title={tr('weather.menu')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, flex: 1, textAlign: 'start',
            background: 'none', border: 'none', color: text, cursor: 'pointer',
            fontSize: 13, fontWeight: 'bold', padding: 0,
          }}
        >
          <span style={{ fontSize: 15, lineHeight: 1 }}>{prefs.menuOpen ? '☰' : '🌦'}</span>
          <span style={{ flex: 1 }}>{tr('weather.title')}</span>
          {prefs.on && <span style={{ fontSize: 10, color: accent, fontWeight: 'normal' }}>{tr('weather.active')}</span>}
        </button>
        {floating && (
          <button onClick={onClose} title={tr('weather.close')}
            style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
        )}
      </div>

      {prefs.menuOpen && (<>
        {GROUPS.map(group => (
          <div key={group} style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 9, color: muted, padding: '3px 2px 2px' }}>
              {tr(group === 'quick' ? 'weather.groupQuick' : 'weather.groupAviation')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {WEATHER_LAYERS.filter(l => l.group === group).map(l => {
                const active = prefs.on && prefs.overlay === l.id;
                return (
                  <button
                    key={l.id}
                    data-weather-pick={l.id}
                    data-active={active ? '1' : '0'}
                    onClick={() => pick(l.id)}
                    title={tr(l.labelKey)}
                    style={{
                      // עיגול הצבע ראשון בסדר ה-DOM ולכן יושב ב-inline-start:
                      // בעברית זהו הצד הימני, כמו באפיון, ובאנגלית השמאלי.
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', textAlign: 'start', cursor: 'pointer',
                      padding: '3px 8px 3px 4px',
                      borderRadius: 999,
                      border: `1px solid ${active ? accent : 'transparent'}`,
                      background: active ? `${accent}22` : pillBg,
                      color: active ? accent : text,
                      fontSize: 12, fontWeight: active ? 'bold' : 'normal',
                    }}
                  >
                    <span style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                      background: l.swatch,
                      boxShadow: active ? `0 0 0 2px ${accent}` : `inset 0 0 0 1px ${border}`,
                    }} />
                    <span style={{ flex: 1 }}>{tr(l.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* גובה - רק לשכבות שיש להן משמעות בגובה. מכ"ם ולוויין הם תצפית
            פני-שטח, ובורר גובה עליהם הוא פקד שלא עושה דבר. */}
        {weatherLayer(prefs.overlay)?.levels && (
          <div style={{ borderTop: `1px solid ${border}`, paddingTop: 6 }}>
            <div style={{ fontSize: 9, color: muted, padding: '0 2px 3px' }}>{tr('weather.level')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {WINDY_LEVELS.map(l => {
                const on = prefs.level === l.id;
                return (
                  <button key={l.id} data-weather-level={l.id} data-active={on ? '1' : '0'}
                    onClick={() => set({ level: l.id as WindyLevel })}
                    style={{
                      flex: '1 1 30%', padding: '2px 3px', fontSize: 10, cursor: 'pointer', borderRadius: 5,
                      border: `1px solid ${on ? accent : border}`,
                      background: on ? `${accent}22` : 'transparent',
                      color: on ? accent : muted, fontWeight: on ? 'bold' : 'normal',
                    }}>
                    {tr(l.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* עיון בנקודה - נפתח בחלון, כי השכבה המעוגנת אינה מקבלת לחיצות */}
        {onProbe && (
          <button onClick={onProbe}
            style={{
              width: '100%', marginTop: 6, padding: '4px 6px', fontSize: 11, cursor: 'pointer',
              borderRadius: 6, border: `1px solid ${border}`, background: 'transparent', color: text,
              display: 'flex', alignItems: 'center', gap: 6, textAlign: 'start',
            }}>
            <span>🔍</span><span style={{ flex: 1 }}>{tr('weather.probe')}</span>
          </button>
        )}

        {/* בהירות ומיזוג - מה שמכריע אם מפת השדה נשארת קריאה מתחת למז"א */}
        <div style={{ borderTop: `1px solid ${border}`, paddingTop: 6, marginTop: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: muted, fontSize: 11, minWidth: 46 }}>{tr('weather.opacity')}</span>
            <input type="range" min={0.15} max={1} step={0.05} value={prefs.opacity}
              onChange={e => set({ opacity: Number(e.target.value) })} style={{ flex: 1 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5 }}>
            <span style={{ color: muted, fontSize: 11, minWidth: 46 }}>{tr('weather.blend')}</span>
            {BLENDS.map(b => (
              <button key={b} onClick={() => set({ blend: b })}
                style={{
                  flex: 1, padding: '2px 4px', fontSize: 10, cursor: 'pointer', borderRadius: 5,
                  border: `1px solid ${prefs.blend === b ? accent : border}`,
                  background: prefs.blend === b ? `${accent}22` : 'transparent',
                  color: prefs.blend === b ? accent : muted,
                }}>
                {tr(`weather.blend_${b}`)}
              </button>
            ))}
          </div>
        </div>

        {hint && (
          <div style={{ marginTop: 6, fontSize: 10, color: muted, lineHeight: 1.35 }}>{hint}</div>
        )}
        <div style={{ marginTop: 5, fontSize: 10, color: statusLine.color, lineHeight: 1.35 }}>
          {statusLine.text}
        </div>
      </>)}
    </div>
  );
}
