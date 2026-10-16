import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StripCardLocation, stripCardLocation } from './StripCardLocation';

// מה שנבדק: כרטיס הפ"מ ברשימה של מוד מפה עונה על "איפה הוא" -
//   1. פ"מ באזור - שם האזור (וכל האזורים הנוספים), ולא הגובה.
//   2. פ"מ בלי אזור - הגובה, מנורמל ובגדול.
//   3. אין אזור ואין גובה - כלום (לא תווית ריקה).

const asgn = (extra: Record<string, unknown> = {}) => ({
  zone_id: 7, zone_name: 'צפון', zone_color: '#22c55e', extra_zones: [], ...extra,
});
const PAL = { text: '#e2e8f0', muted: '#94a3b8', border: '#334155', bgAlt: '#0f172a' };

describe('stripCardLocation', () => {
  it('פ"מ באזור - שם האזור וצבעו', () => {
    expect(stripCardLocation(asgn(), '445-455')).toEqual({ kind: 'zone', names: ['צפון'], color: '#22c55e' });
  });

  it('פ"מ בכמה אזורים - כולם, בלי כפילויות', () => {
    const a = asgn({ extra_zones: [
      { id: 1, zone_id: 8, zone_name: 'דרום', zone_color: null },
      { id: 2, zone_id: 7, zone_name: 'צפון', zone_color: null },
    ] });
    expect(stripCardLocation(a, '445-455')).toEqual({ kind: 'zone', names: ['צפון', 'דרום'], color: '#22c55e' });
  });

  it('שיוך בלי אזור (נעץ חופשי על המפה) - הגובה', () => {
    expect(stripCardLocation(asgn({ zone_id: null, zone_name: null }), 'FL445-455')).toEqual({ kind: 'alt', alt: '445-455' });
  });

  it('אזור בלי שם - נופל לגובה ולא מציג תווית ריקה', () => {
    expect(stripCardLocation(asgn({ zone_name: '  ' }), '300')).toEqual({ kind: 'alt', alt: '300' });
  });

  it('בלי שיוך - הגובה; בלי גובה - כלום', () => {
    expect(stripCardLocation(null, '445-455')).toEqual({ kind: 'alt', alt: '445-455' });
    expect(stripCardLocation(undefined, '')).toBeNull();
  });
});

describe('StripCardLocation', () => {
  it('אזור - מציג את השם ולא את הגובה', () => {
    const html = renderToStaticMarkup(<StripCardLocation info={stripCardLocation(asgn(), '445-455')} {...PAL} />);
    expect(html).toContain('strip-card-zone');
    expect(html).toContain('צפון');
    expect(html).not.toContain('445-455');
  });

  it('בלי אזור - הגובה גדול מהתווית', () => {
    const html = renderToStaticMarkup(<StripCardLocation info={stripCardLocation(null, '445-455')} {...PAL} />);
    expect(html).toContain('strip-card-alt');
    expect(html).toContain('font-size:14px;font-weight:bold">445-455');
  });

  it('אין מידע - לא מרונדר כלום', () => {
    expect(renderToStaticMarkup(<StripCardLocation info={null} {...PAL} />)).toBe('');
  });
});
