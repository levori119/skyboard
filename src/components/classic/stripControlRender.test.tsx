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
    expect(html).toContain('קלירנס');
    expect(html).toContain('left:19%');
    expect(html).toContain('top:82%');
    expect(html).toContain('translate(-50%, -50%)');
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
