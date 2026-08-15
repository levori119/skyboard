import { describe, it, expect, beforeAll, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClassicStripCard } from './ClassicViews';
import { loadStripFieldCatalog } from '../../utils/stripFieldCatalog';
import type { SGNode } from '../../types/stripGrid';
import type { StripControl } from '../../types/stripControls';

// הקטלוג האמיתי כפי שהוא ב-DB אחרי שהמנהל הגדיר כפתור ושדה
const CATALOG: StripControl[] = [
  { id: '3', key: 'fld_3', label: 'קלירנס', type: 'button', scope: 'global', values: ['ביקש', 'קיבל'], styles: [] },
  { id: '4', key: 'fld_4', label: 'בדיקה', type: 'field', input: 'keyboard', scope: 'global', values: [], defaultValue: '1,2,3', styles: [] },
];

/** הפריסה כפי שנשמרה בתבנית: שני פקדים ב**מיקום חופשי** בתוך תא */
const LAYOUT: SGNode = {
  id: 'root', type: 'split', direction: 'v', sizes: [50, 50],
  children: [
    { id: 'c1', type: 'cell', fieldKey: 'callSign' },
    {
      id: 'c2', type: 'cell', fieldKey: '',
      controls: [
        { id: 'p1', fieldKey: 'fld_3', x: 19, y: 82 },
        { id: 'p2', fieldKey: 'fld_4', x: 68, y: 83 },
      ],
    },
  ],
};

const STRIP = { id: 7, callSign: 'ELAL1', custom_fields: {} as Record<string, unknown> };

const render = (props: Record<string, unknown> = {}) => renderToStaticMarkup(
  <ClassicStripCard strip={STRIP} rows={[]} lightMode={false} layoutJson={LAYOUT} {...props} />
);

beforeAll(async () => {
  // הקטלוג נטען מהשרת; בלעדיו אין הגדרה ואין מה לצייר
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => CATALOG })));
  await loadStripFieldCatalog(true);
});

describe('פקד על הכרטיס - רינדור והפעלה', () => {
  it('פקד במיקום חופשי מצויר במקומו, לפי מרכזו', () => {
    const html = render({ onControlChange: () => {} });
    expect(html).toContain('left:19%');
    expect(html).toContain('top:82%');
    expect(html).toContain('translate(-50%, -50%)');
  });

  // הדרישה: "על השדה עצמו צריך לשים את ערך הב"מ או ריק" - הכותרת דחקה את
  // הערך מחוץ לתא, וכך נראה כאילו הלחיצה לא עשתה כלום
  it('הפקד מציג ערך ולא את שם השדה', () => {
    const html = render({ onControlChange: () => {} });
    // כטקסט על הפקד - לא. כ-tooltip בריחוף - כן, וזה הרצוי
    expect(html).not.toContain('>קלירנס<');
    expect(html).toContain('title="קלירנס"');
    // כפתור בלי ערך ובלי ב"מ נשאר ריק, ולא מציג ממלא-מקום
    expect(html).toContain('<span style="overflow:hidden;text-overflow:ellipsis"></span>');
  });

  it('שם השדה מוצג רק כשהודלק, וכפריט נפרד מהפקד', () => {
    const layout: SGNode = {
      id: 'c', type: 'cell', fieldKey: '',
      controls: [{ id: 'p', fieldKey: 'fld_3', x: 50, y: 50, showLabel: true }],
    };
    const html = renderToStaticMarkup(
      <ClassicStripCard strip={STRIP} rows={[]} lightMode={false} layoutJson={layout} onControlChange={() => {}} />
    );
    expect(html).toContain('קלירנס');
    // ברירת המחדל: מעל הפקד, ובמיקום משלו
    expect(html).toContain('calc(50% - 14px)');
  });

  it('גודל הפקד נשמר בפיקסלים', () => {
    const layout: SGNode = {
      id: 'c', type: 'cell', fieldKey: '',
      controls: [{ id: 'p', fieldKey: 'fld_3', x: 50, y: 50, w: 64, h: 22 }],
    };
    const html = renderToStaticMarkup(
      <ClassicStripCard strip={STRIP} rows={[]} lightMode={false} layoutJson={layout} onControlChange={() => {}} />
    );
    expect(html).toContain('width:64px');
    expect(html).toContain('height:22px');
  });

  // התקלה שדווחה: "לוחץ על הכפתור ולא קורה כלום". הסיבה הייתה כרטיס שרונדר
  // בלי `onControlChange` - הפקד נראה זהה אבל היה קריאה בלבד.
  it('עם onControlChange הפקד לחיץ, ובלעדיו קריאה בלבד', () => {
    expect(render({ onControlChange: () => {} })).toContain('cursor:pointer');
    expect(render()).toContain('cursor:default');
  });

  it('הכפתור מציג את ערכו, ולא רק את תוויתו', () => {
    const withValue = renderToStaticMarkup(
      <ClassicStripCard
        strip={{ ...STRIP, custom_fields: { fld_3: 'קיבל' } }}
        rows={[]} lightMode={false} layoutJson={LAYOUT} onControlChange={() => {}}
      />
    );
    expect(withValue).toContain('קיבל');
  });

  it('שדה בלי ערך שמור מציג את ה-ב"מ שלו', () => {
    expect(render({ onControlChange: () => {} })).toContain('1,2,3');
  });

  it('הפניה לשדה שאינו בקטלוג אינה מציירת דבר ואינה מפילה', () => {
    const layout: SGNode = { id: 'c', type: 'cell', fieldKey: '', controls: [{ id: 'p', fieldKey: 'gone' }] };
    expect(() => renderToStaticMarkup(
      <ClassicStripCard strip={STRIP} rows={[]} lightMode={false} layoutJson={layout} onControlChange={() => {}} />
    )).not.toThrow();
  });
});
