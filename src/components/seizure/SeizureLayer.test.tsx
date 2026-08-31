import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SeizureLayer, { SEIZURE_DASH } from './SeizureLayer';
import { projectSeizure } from './useTempZoneSeizures';
import type { MapGeoAnchor } from '../../utils/geo';
import type { TempZoneSeizure } from '../../types';

// שכבת המרחבים המולאמים. מה שנבדק כאן הוא ה**הקרנה**: אותו מרחב, שנשמר בנ"צ,
// חייב לנחות במקום הנכון על כל מפה - וזו הטענה שכל הפיצ'ר עומד עליה. מפה בלי
// עוגנים אינה מציירת כלום (ולא מציירת במקום שגוי), וזה ההבדל בין "אין מידע"
// לבין כשל שקט.

const BOUNDS = { top: 0, left: 0, width: 800, height: 600 };

/** עוגן ליניארי פשוט: (0,0)=32.5N/34.5E · (100,100)=31.5N/35.5E */
const ANCHOR: MapGeoAnchor = {
  x1: 0, y1: 0, lat1: 32.5, lon1: 34.5,
  x2: 100, y2: 100, lat2: 31.5, lon2: 35.5,
};
/** מפה אחרת של אותו שטח, בקנה מידה כפול - כדי לבדוק שההקרנה באמת מותאמת למפה */
const ANCHOR_HALF: MapGeoAnchor = {
  x1: 0, y1: 0, lat1: 32.5, lon1: 34.5,
  x2: 50, y2: 50, lat2: 31.5, lon2: 35.5,
};

const SEIZURE: TempZoneSeizure = {
  id: 3, name: 'מרחב מולאם', purpose: '', color: '#a855f7',
  alt_min: 100, alt_max: 140,
  polygon_geo: [
    { lat: 32.25, lon: 34.75 },
    { lat: 32.25, lon: 35.0 },
    { lat: 32.0, lon: 35.0 },
  ],
  polygon: [],
  creator_preset_id: 1, creator_preset_name: 'בקרה מרכז', creator_map_id: 1,
  phone: '', radio: '', note: '', eta_end: null, to_all: false,
  status: 'active', created_at: '2026-08-31T08:00:00.000Z', ended_at: null,
};

const render = (seizures: TempZoneSeizure[], anchor: MapGeoAnchor | null, onOpen?: (s: TempZoneSeizure) => void) =>
  renderToStaticMarkup(<SeizureLayer bounds={BOUNDS} seizures={seizures} anchor={anchor} onOpen={onOpen} />);

describe('projectSeizure - מנ"צ לאחוזי תמונה', () => {
  it('בלי עוגנים אין הקרנה - ולא ניחוש', () => {
    expect(projectSeizure(SEIZURE, null)).toEqual([]);
  });

  it('פוליגון בן פחות מ-3 קודקודים אינו מוקרן', () => {
    expect(projectSeizure({ ...SEIZURE, polygon_geo: [{ lat: 32, lon: 34.8 }] }, ANCHOR)).toEqual([]);
  });

  it('הקודקוד הראשון נוחת במקום שהעוגנים מכתיבים', () => {
    const pts = projectSeizure(SEIZURE, ANCHOR);
    expect(pts).toHaveLength(3);
    expect(pts[0].x).toBeCloseTo(25, 4);  // lon 34.75 מתוך 34.5..35.5
    expect(pts[0].y).toBeCloseTo(25, 4);  // lat 32.25 מתוך 32.5..31.5
  });

  it('אותו מרחב על מפה בקנה מידה אחר - אותו מקום גיאוגרפי, אחוזים אחרים', () => {
    const a = projectSeizure(SEIZURE, ANCHOR);
    const b = projectSeizure(SEIZURE, ANCHOR_HALF);
    expect(b[0].x).toBeCloseTo(a[0].x / 2, 4);
    expect(b[0].y).toBeCloseTo(a[0].y / 2, 4);
  });
});

describe('SeizureLayer - הציור', () => {
  it('מפה בלי עוגנים אינה מציירת כלום', () => {
    expect(render([SEIZURE], null)).toBe('');
  });

  it('בלי הלאמות פעילות - אין שכבה', () => {
    expect(render([], ANCHOR)).toBe('');
  });

  it('מצייר פוליגון בצבע ההלאמה, בקואורדינטות המוקרנות', () => {
    const html = render([SEIZURE], ANCHOR);
    expect(html).toContain('data-seizure-layer');
    expect(html).toContain('<polygon');
    expect(html).toContain('#a855f7');
    expect(html).toContain('25,25');
  });

  it('התווית נושאת את שם ההלאמה, הגבהים והעמדה היוצרת', () => {
    const html = render([SEIZURE], ANCHOR);
    expect(html).toContain('מרחב מולאם');
    expect(html).toContain('100-140');
    expect(html).toContain('בקרה מרכז');
  });

  it('טווח ריק נקרא "כל הגבהים"', () => {
    const html = render([{ ...SEIZURE, alt_min: null, alt_max: null }], ANCHOR);
    expect(html).toContain('כל הגבהים');
  });

  it('אינה חוסמת גרירת פ"מ אל האזור שמתחתיה - זו שכבת מידע, לא פקד', () => {
    expect(render([SEIZURE], ANCHOR)).toContain('pointer-events:none');
  });

  it('הלאמה בלי נ"צ תקין מדולגת, והשאר עדיין מצוירות', () => {
    const broken = { ...SEIZURE, id: 9, name: 'שבורה', polygon_geo: [] };
    const html = render([broken, SEIZURE], ANCHOR);
    expect(html).not.toContain('שבורה');
    expect(html).toContain('מרחב מולאם');
  });
});

describe('SeizureLayer - הקו והלחיצה', () => {
  const noop = () => {};

  it('קו-נקודה, ולא אותו קו מקווקו של גבול אזור', () => {
    const html = render([SEIZURE], ANCHOR);
    expect(html).toContain(SEIZURE_DASH);
    // הקווקו של גבול אזור (2,1) ושל אזור סגור (2.5,1.5) - לא כאן
    expect(html).not.toContain('stroke-dasharray:2,1');
    expect(html).not.toContain('stroke-dasharray="2,1"');
    expect(html).not.toContain('2.5,1.5');
  });

  it('הנקודה שבקו דורשת linecap עגול - אחרת אורך 0 לא מצויר כלל', () => {
    expect(render([SEIZURE], ANCHOR)).toContain('round');
  });

  it('בלי onOpen אין קו תפיסה - השכבה נשארת מידע בלבד', () => {
    const html = render([SEIZURE], ANCHOR);
    expect(html).not.toContain('data-seizure-hit');
  });

  it('עם onOpen נוסף קו תפיסה שתופס **רק על הקו**', () => {
    const html = render([SEIZURE], ANCHOR, noop);
    expect(html).toContain('data-seizure-hit');
    // pointer-events:stroke - פנים המרחב נשאר יעד שחרור של פ"מ
    expect(html).toContain('pointer-events:stroke');
    expect(html).not.toContain('pointer-events:all;cursor:pointer"></polygon>');
  });

  it('קו התפיסה שקוף ואינו משנה את מראה הקו', () => {
    expect(render([SEIZURE], ANCHOR, noop)).toContain('stroke="transparent"');
  });
});
