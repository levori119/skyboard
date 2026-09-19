import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TripRoutePreviewLayer from './TripRoutePreviewLayer';
import { clearTripRoutePreview, showTripRoutePreview } from '../../utils/tripRoutePreview';
import type { RouteWaypoint } from '../../utils/trips';

const wp = (x: number, y: number): RouteWaypoint => ({ xPct: x, yPct: y, lat: null, lon: null, routeType: 'vehicle', isCrossing: false });
const ptPos = (x: number, y: number): React.CSSProperties => ({ left: `${x}%`, top: `${y}%` });
const render = (airfieldId: number | null) => renderToStaticMarkup(
  <TripRoutePreviewLayer airfieldId={airfieldId} anchor={null} ptPos={ptPos} imgBounds={null} />,
);

describe('הצג על מפה - השכבה במפה הראשית', () => {
  afterEach(() => clearTripRoutePreview());

  it('בלי נתיב מוצג - לא מרונדר כלום', () => {
    expect(render(1)).toBe('');
  });

  it('נתיב מוצג - קו הנתיב, התווית וכפתור הסגירה', () => {
    showTripRoutePreview({ id: 'a', airfieldId: 1, label: 'ג׳יפ · ראשי', waypoints: [wp(10, 10), wp(50, 10), wp(50, 60)] });
    const html = render(1);
    expect(html).toContain('data-testid="trip-route-preview"');
    expect(html).toContain('10,10 50,10 50,60');
    expect(html).toContain('trip-route-preview-close');
    expect(html).toContain('ראשי');
  });

  it('נתיב של שדה אחר אינו מצויר על המפה הזו', () => {
    showTripRoutePreview({ id: 'a', airfieldId: 2, label: 'x', waypoints: [wp(10, 10), wp(50, 10)] });
    expect(render(1)).toBe('');
  });
});
