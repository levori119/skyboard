import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import WeatherLayer from './WeatherLayer';
import WeatherMenu from './WeatherMenu';
import { DEFAULT_PREFS } from './prefs';
import { WEATHER_LAYERS } from './windy';
import type { MapGeoAnchor } from '../utils/geo';

const ANCHOR: MapGeoAnchor = {
  x1: 20, y1: 20, lat1: 32.2, lon1: 34.7,
  x2: 80, y2: 80, lat2: 31.8, lon2: 35.2,
};
const BOUNDS = { top: 10, left: 24, width: 800, height: 600 };
const ON = { ...DEFAULT_PREFS, on: true };

describe('WeatherLayer - שכבת המז"א המעוגנת', () => {
  it('כבוי, בלי עוגן או בלי גבולות - לא מרונדר כלום', () => {
    expect(renderToStaticMarkup(<WeatherLayer anchor={ANCHOR} bounds={BOUNDS} prefs={DEFAULT_PREFS} />)).toBe('');
    expect(renderToStaticMarkup(<WeatherLayer anchor={null} bounds={BOUNDS} prefs={ON} />)).toBe('');
    expect(renderToStaticMarkup(<WeatherLayer anchor={ANCHOR} bounds={null} prefs={ON} />)).toBe('');
  });

  it('דלוק - מסגרת Windy עם השכבה הנבחרת, ממוקמת על גבולות תמונת המפה', () => {
    const html = renderToStaticMarkup(<WeatherLayer anchor={ANCHOR} bounds={BOUNDS} prefs={ON} />);
    expect(html).toContain('embed.windy.com');
    expect(html).toContain('overlay=radar');
    expect(html).toContain('width:800px');
    expect(html).toContain('height:600px');
    expect(html).toContain('left:24px');
  });

  it('אינה בולעת לחיצה, גרירה או עט - גם המכולה וגם המסגרת', () => {
    const html = renderToStaticMarkup(<WeatherLayer anchor={ANCHOR} bounds={BOUNDS} prefs={ON} />);
    expect(html.match(/pointer-events:none/g)?.length).toBeGreaterThanOrEqual(2);
    // הטבעת העודפת נחתכת, ואיתה סרגל הזמן והלוגו של Windy
    expect(html).toContain('overflow:hidden');
  });

  it('המסגרת נטענת בארגז חול - בלי ניווט של העמדה כולה', () => {
    const html = renderToStaticMarkup(<WeatherLayer anchor={ANCHOR} bounds={BOUNDS} prefs={ON} />);
    expect(html).toContain('sandbox="allow-scripts allow-same-origin"');
    expect(html).not.toContain('allow-top-navigation');
    expect(html.toLowerCase()).toContain('referrerpolicy="no-referrer"');
  });

  /**
   * מידות ה-**מסגרת**, לא של המכולה. שתיהן נושאות `width/height`, ו-regex תמים
   * תופס את המכולה שקודמת ב-HTML - בדיוק מה שהחליש את הבדיקה הזו קודם. הצמד
   * `left;top` שלפניהן ייחודי ל-iframe (במכולה הסדר הוא `top;left`).
   */
  const frameBox = (html: string) => {
    const m = html.match(/left:(-?[\d.]+)px;top:(-?[\d.]+)px;width:(\d+)px;height:(\d+)px/);
    expect(m, 'לא נמצאו מיקום ומידות מפורשים ל-iframe').not.toBeNull();
    return { left: Number(m![1]), top: Number(m![2]), w: Number(m![3]), h: Number(m![4]) };
  };
  const scaleOf = (html: string) => {
    const m = html.match(/transform:scale\(([\d.]+), ?([\d.]+)\)/);
    expect(m, 'לא נמצא scale על ה-iframe').not.toBeNull();
    return { x: Number(m![1]), y: Number(m![2]) };
  };

  it('ההתאמה הגיאוגרפית נכנסת ל-DOM: scale על מסגרת גדולה מהמפה', () => {
    const html = renderToStaticMarkup(<WeatherLayer anchor={ANCHOR} bounds={BOUNDS} prefs={ON} />);
    const s = scaleOf(html);
    const f = frameBox(html);
    expect(s.x).toBeGreaterThan(0);
    expect(s.y).toBeGreaterThan(0);
    // המסגרת גדולה מאזור התצוגה בשני הצירים - זו הטבעת שנחתכת
    expect(f.w * s.x).toBeGreaterThan(BOUNDS.width);
    expect(f.h * s.y).toBeGreaterThan(BOUNDS.height);
  });

  /**
   * רגרסיה: `inset:0 + margin:auto` ממרכז רק אלמנט **קטן** ממכולתו. המסגרת כאן
   * גדולה בכוונה (overscan), ולכן היא נצמדה לקצה - וכל שכבת המז"א הוסטה בחצי
   * מהעודף. במפת אזורי הקרב זה הציג את דלתת הנילוס מעל ישראל.
   */
  it('המסגרת ממורכזת בחשבון מפורש - מרכז Windy יושב על מרכז המפה', () => {
    const html = renderToStaticMarkup(<WeatherLayer anchor={ANCHOR} bounds={BOUNDS} prefs={ON} />);
    expect(html, 'margin:auto לא ממרכז מסגרת גדולה מהמכולה').not.toContain('margin:auto');

    const f = frameBox(html);
    expect(f.left).toBeCloseTo((BOUNDS.width - f.w) / 2, 3);
    expect(f.top).toBeCloseTo((BOUNDS.height - f.h) / 2, 3);
    // המיקום שלילי: המסגרת חורגת משני הצדדים בשווה, וזו הטבעת שנחתכת
    expect(f.left).toBeLessThan(0);
    expect(f.top).toBeLessThan(0);

    // כלומר מרכז המסגרת מתלכד עם מרכז אזור התצוגה - שם יושב `centerLat/Lon`
    expect(f.left + f.w / 2).toBeCloseTo(BOUNDS.width / 2, 3);
    expect(f.top + f.h / 2).toBeCloseTo(BOUNDS.height / 2, 3);
  });

  it('בהירות ומיזוג נשלטים מההעדפות', () => {
    const html = renderToStaticMarkup(
      <WeatherLayer anchor={ANCHOR} bounds={BOUNDS} prefs={{ ...ON, opacity: 0.35, blend: 'multiply' }} />);
    expect(html).toContain('opacity:0.35');
    expect(html).toContain('mix-blend-mode:multiply');
  });
});

describe('WeatherMenu - תפריט השכבות', () => {
  const menu = (prefs = ON) => renderToStaticMarkup(
    <WeatherMenu prefs={prefs} onChange={() => {}} themeMode="dark" status="ok" onClose={() => {}} />);

  it('כל שכבות הקטלוג מוצעות לבחירה', () => {
    const html = menu();
    for (const l of WEATHER_LAYERS) expect(html, `חסרה שכבה ${l.id}`).toContain(`data-weather-pick="${l.id}"`);
  });

  it('רק השכבה הפעילה מסומנת, וכשהמז"א כבוי אף אחת לא', () => {
    expect(menu({ ...ON, overlay: 'thunder' }).match(/data-active="1"/g)?.length).toBe(1);
    expect(menu({ ...ON, overlay: 'thunder' })).toContain('data-weather-pick="thunder" data-active="1"');
    expect(menu(DEFAULT_PREFS).match(/data-active="1"/g)).toBeNull();
  });

  it('תפריט מכווץ מסתיר את רשימת השכבות ומשאיר את הכותרת', () => {
    const html = menu({ ...ON, menuOpen: false });
    expect(html).not.toContain('data-weather-pick');
    expect(html).toContain('data-weather-menu');
  });

  it('חלון צפייה ותפעול - מסגרת תורכיז לפי קוד הצבע', () => {
    expect(menu()).toContain('border:2px solid #38bdf8');
  });
});
