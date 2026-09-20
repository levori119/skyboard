import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StripControl } from './StripControl';
import type { StripControl as StripControlDef } from '../../types/stripControls';

/** שדה טקסט מהקטלוג, כפי שהוא נראה ב-DB */
const FIELD: StripControlDef = {
  id: '4', key: 'custom_1', label: 'הערה', type: 'field', input: 'keyboard',
  scope: 'global', values: [], styles: [],
};
const BUTTON: StripControlDef = {
  id: '3', key: 'fld_3', label: 'קלירנס', type: 'button',
  scope: 'global', values: ['ביקש', 'קיבל'], styles: [],
};

const render = (control: StripControlDef, variant?: 'strip' | 'table', value: any = '') =>
  renderToStaticMarkup(<StripControl control={control} value={value} onChange={() => {}} variant={variant} />);

describe('StripControl - וריאנט טבלה', () => {
  it('שדה טקסט במוד טבלה מסומן בקו תחתון, בלי קופסה', () => {
    const html = render(FIELD, 'table');
    expect(html).toContain('border-bottom:1px dashed');
    expect(html).toContain('background:transparent');
  });

  it('אותו שדה על הסטריפ נשאר קופסה תחומה', () => {
    const html = render(FIELD);
    expect(html).toContain('border-radius:3px');
    expect(html).not.toContain('border-bottom:1px dashed');
  });

  it('כפתור נשאר קופסה גם בטבלה - הוא פקד ולא טקסט', () => {
    const html = render(BUTTON, 'table');
    expect(html).toContain('border-radius:3px');
    expect(html).not.toContain('border-bottom:1px dashed');
  });

  it('שדה עם צבע מותנה נשאר קופסה צבועה - שם הצבע הוא המסר', () => {
    const colored: StripControlDef = {
      ...FIELD, styles: [{ id: 's1', match: 'דחוף', bg: '#b91c1c', text: '#ffffff' } as any],
    };
    const html = render(colored, 'table', 'דחוף');
    expect(html).toContain('#b91c1c');
    expect(html).not.toContain('border-bottom:1px dashed');
  });
});
