// המפה הצפה של נסיעות בביצוע - מה שנקבע ברינדור הראשון.
//
// אין jsdom, ולכן הבדיקה על ה-HTML שנוצר בשרת: אפקטים (סקר, מדידת החלון,
// ה-iframe) אינם רצים. מה שנבדק כאן הוא מה שהפקח רואה מיד כשהחלון נפתח - המקרא
// עם כל נסיעה בצבע שלה, כפתורי ההיסטוריה, ובחירת המפה.
//
// ⚠ `renderToStaticMarkup` בורח מגרשיים - בודקים רק נוכחות, לא היעדר מחרוזת עם גרשיים.

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TripLiveMapWindow from './TripLiveMapWindow';
import { LIVE_MAP_COLORS } from '../../utils/liveMap';
import { frameColor } from '../../utils/windowFrame';

vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })));

const ANCHOR = { x1: 0, y1: 0, lat1: 31.3, lon1: 34.6, x2: 100, y2: 100, lat2: 31.2, lon2: 34.7 };
const noop = () => {};

const render = (over: Partial<React.ComponentProps<typeof TripLiveMapWindow>> = {}) => renderToStaticMarkup(
  <TripLiveMapWindow
    airfieldId={1} themeMode="dark" mapSrc="data:image/png;base64,AAAA" anchor={ANCHOR}
    tripIds={[7, 3]} historyIds={[]} onToggleHistory={noop} onRemove={noop} onClose={noop}
    {...over}
  />,
);

describe('המפה הצפה - הרינדור הראשון', () => {
  it('שורה במקרא לכל נסיעה, כל אחת בצבע אחר', () => {
    const html = render();
    expect(html).toContain(LIVE_MAP_COLORS[0]);
    expect(html).toContain(LIVE_MAP_COLORS[1]);
  });

  // לפני שהמיקום החי הגיע הנסיעה אינה ברשימת הפעילות - והמקרא אומר זאת בטקסט,
  // ולא מציג שורה ריקה שנראית כמו תקלה
  it('נסיעה שעוד לא נמצאה ברשימה החיה מסומנת בטקסט', () => {
    expect(render()).toContain('הנסיעה הסתיימה');
  });

  it('כפתור "הראה היסטוריה" לכל נסיעה, ו"הסתר" למי שהשובל שלה מוצג', () => {
    const off = render();
    expect(off.match(/הראה היסטוריה/g)?.length).toBe(2);
    const on = render({ historyIds: [3] });
    expect(on).toContain('הסתר היסטוריה');
  });

  it('שתי המפות לבחירה, ו"התאם לרכבים" דלוק בפתיחה', () => {
    const html = render();
    expect(html).toContain('מפת הבסיס');
    expect(html).toContain('Google');
    expect(html).toContain('התאם לרכבים');
    expect(html).toContain('aria-pressed="true"');
  });

  // חלון צפייה ותפעול - מסגרת תורכיז ולא כתומה (CLAUDE.md §מסגרת חלון)
  it('מסגרת של חלון צפייה', () => {
    expect(render()).toContain(frameColor('view', 'dark'));
    expect(render()).not.toContain(frameColor('edit', 'dark'));
  });

  it('בלי מפת בסיס - הכפתור שלה כבוי, עם הסיבה', () => {
    const html = render({ mapSrc: null });
    expect(html).toContain('לשדה אין מפה מעוגנת');
  });

  it('זום בגרירה ובאצבע: touch-action none על שטח המפה', () => {
    expect(render()).toContain('touch-action:none');
  });
});
