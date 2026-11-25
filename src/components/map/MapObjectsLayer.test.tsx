// אין jsdom בפרויקט, ולכן renderToStaticMarkup (ראה component-tests-no-dom).
// שכבת האובייקטים על מפת העמדה - ראה MAP_OBJECTS_SPEC.md.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapObjectsLayer } from './MapObjectsLayer';
import { normalizeMapObject } from '../../utils/mapObjects';

const bounds = { left: 10, top: 20, width: 1000, height: 500 };
const objs = [
  normalizeMapObject({ id: 1, name: 'מגדל', shape: 'star', x: 50, y: 50, size: 10, color: '#22c55e' }),
  normalizeMapObject({ id: 2, name: 'בלי תווית', shape: 'square', x: 10, y: 10, size: 4, show_label: false, filled: false }),
];
const render = (p: Partial<React.ComponentProps<typeof MapObjectsLayer>> = {}) =>
  renderToStaticMarkup(<MapObjectsLayer objects={objs} bounds={bounds} zoom={1} light={false} {...p} />);

describe('MapObjectsLayer', () => {
  it('אין אובייקטים או אין תיבת מפה - לא מצויר כלום', () => {
    expect(render({ objects: [] })).toBe('');
    expect(render({ bounds: null })).toBe('');
  });

  it('השכבה לא חוסמת את המפה (pointer-events: none) ויושבת על תיבת התמונה', () => {
    const html = render();
    expect(html).toContain('pointer-events:none');
    expect(html).toContain('left:10px');
    expect(html).toContain('width:1000px');
  });

  it('מיקום בפיקסלים לפי אחוזי המפה, ותווית רק כש-show_label', () => {
    const html = render();
    expect(html).toContain('translate(500 250)');
    expect(html).toContain('translate(100 50)');
    expect(html).toContain('מגדל');
    expect(html).not.toContain('בלי תווית');
  });

  it('קו מתאר בלי מילוי; מלא בצבע האובייקט', () => {
    const html = render();
    expect(html).toContain('fill="#22c55e"');
    expect(html).toContain('stroke="#f59e0b"'); // הריבוע - קו מתאר בצבע ברירת המחדל
  });

  it('התווית נשארת בגודל מסך קבוע: בזום 2 גודל הכתב חצי', () => {
    expect(render({ zoom: 1 })).toContain('font-size="12"');
    expect(render({ zoom: 2 })).toContain('font-size="6"');
  });
});
