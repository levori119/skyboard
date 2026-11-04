import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VerticalView } from './VerticalView';

// מה שנבדק: התראות כאות (ב/ק) על מלבן הפ"מ במקום צביעה והבהוב, ובלוקים רק כשנבחרה טבלה.
const strips = [
  { id: 's1', callsign: 'ברק', alt: '340' },
  { id: 's2', callsign: 'עיט', alt: '220' },
];
const blocks = [{ id: 1, block_table_id: 9, alt_from: 200, alt_to: 300, color: '#22c55e', mission: 'קרב' }];
const render = (props: Record<string, unknown>) => renderToStaticMarkup(
  <VerticalView strips={strips} timeField="takeoff" lightMode={false} timeBased={false} {...props} />);

describe('VerticalView - התראות על הפ"מ', () => {
  it('קונפליקט - אות ק, בלי הבהוב ובלי צביעת המלבן', () => {
    const html = render({ externalConflictIds: new Set(['s1']) });
    expect(html).toContain('data-testid="vv-badge-conflict"');
    expect(html).not.toContain('alt-conflict-flash');
    expect(html).not.toContain('block-deviation-flash');
    expect(html).not.toContain('#450a0a');
  });
  it('בלי התראה - אין אותיות', () => {
    const html = render({ externalConflictIds: new Set() });
    expect(html).not.toContain('vv-badge-');
  });
});

describe('VerticalView - בלוקים רק כשנבחרו', () => {
  it('לא נבחרה טבלה - אין פסי בלוקים, ומוסבר למה', () => {
    const html = render({ relevantBlocks: blocks, blocksSelected: false });
    expect(html).toContain('data-testid="vv-no-blocks-selected"');
    expect(html).not.toContain('#22c55e22');
  });
  it('נבחרה טבלה - הבלוקים שלה מוצגים', () => {
    const html = render({ relevantBlocks: blocks, blocksSelected: true });
    expect(html).not.toContain('data-testid="vv-no-blocks-selected"');
    expect(html).toContain('#22c55e22');
  });
});
