import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// אין DOM בבדיקות - מחליפים את מה שנוגע ב-document בטעינה
vi.mock('../shared/HandwritingOverlay', () => ({ default: () => null }));
vi.mock('../shared/FaultBadge', () => ({ FaultBadge: () => null }));

const { CompactTransferRow } = await import('./TransferCards');

// שורת קונפליקט בנקודת העברה = חצי רוחב. או"ק ארוך דחף את הגובה ואת כפתור ✓ (קבל)
// של הפ"מ שנמסר אל מחוץ לשורה. הכלל: השם מתכווץ, הגובה והכפתור לא.
describe('CompactTransferRow - שורה צרה בקונפליקט', () => {
  const t = { id: 7, strip_id: 9, callsign: 'זית 1+2+3', alt: '100', status: 'pending' };
  const html = renderToStaticMarkup(
    <CompactTransferRow t={t} dir="in" isConflict onAction={() => {}} shrunk />,
  );

  it('כפתור הקבלה קיים ואינו מתכווץ', () => {
    expect(html).toMatch(/<button[^>]*title="קבל"[^>]*style="[^"]*flex-shrink:0/);
  });

  it('האו"ק מתכווץ עם אליפסיס ולא דוחף את הכפתור החוצה', () => {
    const label = html.match(/<span style="([^"]*)">זית 1\+2\+3<\/span>/);
    expect(label).not.toBeNull();
    expect(label![1]).toContain('min-width:0');
    expect(label![1]).toContain('text-overflow:ellipsis');
    expect(label![1]).not.toContain('flex-shrink:0');
  });
});
