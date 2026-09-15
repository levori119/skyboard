import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StripFlowDetail, StripFlowList, flowPalette } from './StripFlowWindow';
import type { StripFlow, FlowEvent } from '../../utils/stripFlow';

// מה שנבדק: ההתחייבויות שהמפעיל נשען עליהן, ולא העיצוב -
//   1. הטבלה המרוכזת מציגה לכל פ"מ "נמצא עכשיו" ואת שרשרת השלבים.
//   2. הפירוט מציג את **העמדה שקיבלה** ואת מי שביצע.
//   3. שלב שירש מהמקור מסומן, כדי שלא ייקרא כאילו קרה לפ"מ הזה עצמו.

const esc = (t: string) => t.replace(/"/g, '&quot;');
const C = flowPalette('dark');

const ev = (id: number, kind: string, at: string, extra: Partial<FlowEvent> = {}): FlowEvent => ({
  id, kind, strip_id: 5, occurred_at: at, callsign: 'בננה', preset_id: null, preset_name: null,
  point_label: null, crew_member_name: null, details: {}, inherited: false, ...extra,
});

const FLOW: StripFlow = {
  strip: { id: 5, callsign: 'בננה', sq: '4', number_of_formation: '2', created_at: '2026-09-15T08:00:00Z', landed: false, airborne: true, status: 'active' },
  current: { kind: 'at_station', presetName: '305', airborne: true, groundStatus: null },
  events: [
    ev(1, 'taxi', '2026-09-15T08:15:00Z', { preset_name: 'מגדל חצור', details: { aircraft: [2, 1] }, crew_member_name: 'אורי לב' }),
    ev(2, 'takeoff', '2026-09-15T08:20:00Z', { details: { runway: '33' }, inherited: true }),
    ev(3, 'transfer_sent', '2026-09-15T08:21:00Z', { point_label: 'פלמח', preset_name: 'מגדל חצור' }),
    ev(4, 'accepted', '2026-09-15T08:22:00Z', { preset_name: '305', point_label: 'פלמח', crew_member_name: 'אורי אלימלך' }),
  ],
};

describe('StripFlowList - הטבלה המרוכזת', () => {
  const html = renderToStaticMarkup(<StripFlowList flows={[FLOW]} C={C} onOpen={() => {}} />);

  it('שורה לכל פ"מ עם או"ק ומספר', () => {
    expect(html).toContain('data-testid="flow-row-5"');
    expect(html).toContain('בננה 4');
  });

  it('"נמצא עכשיו" - העמדה שקיבלה, ותג באוויר', () => {
    expect(html).toContain('בעמדה 305');
    expect(html).toContain('באוויר');
  });

  it('שרשרת השלבים: הסעה, המראה על 33, נקודת העברה, עמדה', () => {
    for (const k of ['taxi', 'takeoff', 'point', 'station']) expect(html).toContain(`data-testid="flow-chip-${k}"`);
    expect(html).toContain('33');
    expect(html).toContain('פלמח');
  });
});

describe('StripFlowDetail - פירוט הפ"מ', () => {
  const html = renderToStaticMarkup(<StripFlowDetail flow={FLOW} C={C} />);

  it('שורה לכל שלב, והקבלה מציינת את העמדה שקיבלה', () => {
    for (const k of ['taxi', 'takeoff', 'transfer_sent', 'accepted']) expect(html).toContain(`data-testid="flow-event-${k}"`);
    expect(html).toContain('התקבל בעמדה 305');
    expect(html).toContain('נשלח לנקודת העברה פלמח');
  });

  it('מי ביצע ואילו מטוסים (1+2)', () => {
    expect(html).toContain('אורי אלימלך');
    expect(html).toContain('1+2');
  });

  it('שלב שירש מהמקור מסומן', () => {
    expect(html).toContain('מהמקור');
  });

  it('בלי em-dash בטקסט המוצג', () => {
    expect(html).not.toContain('—');
    expect(html).not.toContain(esc('–'));
  });
});
