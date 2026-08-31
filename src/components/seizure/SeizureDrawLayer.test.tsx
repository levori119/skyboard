import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SeizureDrawLayer, { SeizureDrawToolbar } from './SeizureDrawLayer';
import { SEIZURE_MIN_VERTICES } from '../../utils/tempZoneSeizure';

// שני רכיבים ובכוונה: שכבת הציור יושבת **בתוך** מכולת המפה (אותה מערכת
// קואורדינטות של האזורים), והסרגל **מחוץ** לה - כי סרגל כלי המפה נצבע מעל כל
// מה שבמכולה, ולכן סרגל ציור שיושב בפנים נעלם מתחתיו.
//
// הבדיקות כאן שומרות על שתי ההתחייבויות שאי אפשר לראות ב-tsc: שהשכבה באמת
// מקבלת אירועי מגע (`touch-action:none`), ושהסרגל אינו יוצא מהשכבה.

const BOUNDS = { top: 10, left: 20, width: 800, height: 600 };
const TRI = [{ x: 10, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 40 }];
const noop = () => {};

const layer = (pts = TRI) => renderToStaticMarkup(
  <SeizureDrawLayer bounds={BOUNDS} pts={pts} onPtsChange={noop} onDone={noop} onCancel={noop} />
);
const toolbar = (pts = TRI) => renderToStaticMarkup(
  <SeizureDrawToolbar pts={pts} themeMode="dark" top={8} left={78}
    onUndo={noop} onDone={noop} onCancel={noop} />
);

describe('SeizureDrawLayer - שכבת הציור', () => {
  it('יושבת בדיוק על גבולות תמונת המפה', () => {
    const html = layer();
    expect(html).toContain('top:10px');
    expect(html).toContain('left:20px');
    expect(html).toContain('width:800px');
  });

  it('touch-action:none - בלעדיו הדפדפן תופס את התנועה כגלילה ואין ציור באצבע', () => {
    expect(layer()).toContain('touch-action:none');
  });

  it('מציירת את הפוליגון ואת הקודקודים, והראשון גדול יותר - הוא זה שסוגר', () => {
    const html = layer();
    expect(html).toContain('<polygon');
    expect(html).toContain('r="1.1"');
    expect(html).toContain('r="0.8"');
  });

  it('קודקוד בודד - עדיין אין פוליגון לצייר', () => {
    expect(layer([{ x: 5, y: 5 }])).not.toContain('<polygon');
  });

  it('אינה מכילה את הסרגל - הוא מרונדר מחוץ למכולת המפה', () => {
    expect(layer()).not.toContain('data-seizure-draw-toolbar');
    expect(layer()).not.toContain('אשר');
  });
});

describe('SeizureDrawToolbar - הסרגל', () => {
  it('כפתור האישור נקרא "אשר"', () => {
    expect(toolbar()).toContain('אשר');
  });

  it('מוצג ליד סרגל כלי המפה, ברמת הקינון שלו', () => {
    const html = toolbar();
    expect(html).toContain('data-seizure-draw-toolbar');
    expect(html).toContain('left:78px');
  });

  it('מתחת למינימום הקודקודים - האישור מושבת **ומנומק**', () => {
    const html = toolbar(TRI.slice(0, SEIZURE_MIN_VERTICES - 1));
    expect(html).toContain('disabled');
    expect(html).toContain('צריך לפחות 3 קודקודים');
  });

  it('עם מספיק קודקודים - האישור פעיל והנימוק נעלם', () => {
    const html = toolbar();
    expect(html).not.toContain('צריך לפחות 3 קודקודים');
    expect(html).toContain('3 קודקודים');
  });

  it('"בטל קודקוד" מושבת כשאין מה לבטל', () => {
    expect(toolbar([])).toContain('disabled');
  });
});
