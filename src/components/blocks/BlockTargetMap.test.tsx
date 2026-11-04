import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BlockTargetMap from './BlockTargetMap';

// מה שנבדק: קו לכל מטרה (מלא לראשונה לביצוע, מקווקו לשאר), ומצב ריק.
const spaces = [{ id: 1, name: 'צפון', center_lat: 31.6, center_lon: 34.5, polygons: [[{ lat: 31.5, lon: 34.4 }, { lat: 31.7, lon: 34.4 }, { lat: 31.7, lon: 34.6 }]] }];

describe('BlockTargetMap', () => {
  it('פ"מ במרחב עם שתי מטרות - שני קווים, אחד מקווקו', () => {
    const html = renderToStaticMarkup(<BlockTargetMap lightMode={false} spaces={spaces}
      strips={[{ id: 's1', callsign: 'ברק', block_space_id: 1, targets: [{ coord: 'N3130.0000/E03430.0000', first_exec: true }, { coord: 'N3120.0000/E03420.0000' }] }]} />);
    expect(html).toContain('<polygon');
    const lines = html.match(/<line [^>]*stroke-width="(2\.5|1\.5)"[^>]*>/g) || [];
    expect(lines.filter(l => l.includes('stroke-width="2.5"'))).toHaveLength(1);
    expect(lines.filter(l => l.includes('stroke-dasharray="6 4"'))).toHaveLength(1);
  });
  it('אין נ"צ בכלל - הודעת מצב ריק, בלי svg', () => {
    const html = renderToStaticMarkup(<BlockTargetMap lightMode spaces={[]} strips={[{ id: 's1', callsign: 'א', targets: [] }]} />);
    expect(html).not.toMatch(/<svg/);
  });
});
