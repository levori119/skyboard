import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ZoneCoordList, COORD_SAMPLE } from './ZoneCoordList';
import { imagePctToGeo, fmtCoordPair } from '../../utils/geo';

// רשימת הנ"צ היא מה שהבקר משווה מולו את הפרסום. הבדיקות שומרות על שני הדברים
// שהוא רואה: שהנ"צ מוצג בפורמט שהוא מכיר, ושכשאין כיול הוא מקבל **סיבה** ולא
// שדות מתים.

const anchor = { x1: 10, y1: 10, lat1: 33, lon1: 34, x2: 90, y2: 90, lat2: 32, lon2: 35 };
const points = [{ x: 20, y: 20 }, { x: 60, y: 25 }, { x: 40, y: 70 }];
const noop = () => {};

const render = (over: Partial<React.ComponentProps<typeof ZoneCoordList>> = {}) =>
  renderToStaticMarkup(<ZoneCoordList points={points} anchor={anchor} onChange={noop} {...over} />);

describe('ZoneCoordList', () => {
  it('מציג שורה לכל קודקוד, בפורמט NDDMM.mmm EDDDMM.mmm', () => {
    const html = render();
    for (const p of points) {
      const text = fmtCoordPair(imagePctToGeo(p.x, p.y, anchor));
      expect(text).toMatch(/^[NS]\d{4}\.\d{3} [EW]\d{5}\.\d{3}$/);
      expect(html).toContain(`value="${text}"`);
    }
  });

  it('הכותרת נושאת את מספר הקודקודים', () => {
    expect(render()).toContain('(3)');
  });

  it('שדה ההוספה מדגים את הפורמט', () => {
    expect(render()).toContain(COORD_SAMPLE);
  });

  it('בלי כיול - מוצגת הסיבה ולא שדות נ"צ', () => {
    const html = render({ anchor: null });
    expect(html).toContain('מכוילת');
    expect(html).not.toContain('value="N');
  });

  it('אזור שמור לא יורד מ-3 קודקודים - כפתור המחיקה חסום', () => {
    expect(render({ minPoints: 3 })).toContain('disabled=""');
    expect(render({ minPoints: 0 })).not.toContain('disabled=""');
  });

  it('אזור בציור בלי נקודות - מוסבר מה לעשות, בלי רשימה ריקה שקטה', () => {
    const html = render({ points: [] });
    expect(html).toContain('(0)');
    expect(html).toMatch(/סמנו על המפה|Mark on the map/);
  });
});
