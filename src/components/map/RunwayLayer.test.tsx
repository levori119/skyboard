import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import RunwayLayer, { type RunwayRow } from './RunwayLayer';

// שרטוט אמצעי הנחיתה על המסלול. הגאומטריה נבדקת ב-runwayShape.test.ts ולוגיקת
// ההגדרה+סטטוס ב-runwayAids.test.ts; כאן נבדק מה שהפקח **רואה בפועל** בשכבה:
// שהאמצעי מצויר, בצבע הסטטוס, שה-X מופיע רק ב"לא שמיש", ושהערת ההחרגה נמצאת
// ב-HINT (ולא נבלעת בשקט).

const RW: RunwayRow = {
  id: 1, start_x_pct: 50, start_y_pct: 70, end_x_pct: 50, end_y_pct: 30,
  heading_a: '33', heading_b: '15', name: '33/15',
  aids_a: ['ILS', 'GS'], aids_b: ['TACAN'],
};

const aidGroups = (markup: string) => markup.match(/<g data-testid="runway-aid"[\s\S]*?<\/g>/g) || [];
const groupOf = (markup: string, type: string) => aidGroups(markup).find(g => g.includes(`>${type}</text>`))!;

const render = (statuses: any[] = [], rw: RunwayRow = RW) =>
  renderToStaticMarkup(<RunwayLayer runways={[rw]} aspect={1} sz={1} aidStatuses={statuses} />);

describe('RunwayLayer - סימון אמצעי נחיתה', () => {
  it('כל אמצעי מוגדר מצויר, בשני הקצוות', () => {
    const m = render();
    expect(aidGroups(m)).toHaveLength(3);
    for (const type of ['ILS', 'GS', 'TACAN']) expect(m).toContain(`>${type}</text>`);
  });

  it('בלי דיווח - ירוק, בלי X', () => {
    const g = groupOf(render(), 'ILS');
    expect(g).toContain('#22c55e');
    expect(g).not.toContain('<line');
  });

  it('לא שמיש - אדום **עם** X; אחזקה - אותו אדום **בלי** X', () => {
    const uns = groupOf(render([{ runway_id: 1, end_side: 'b', aid_type: 'TACAN', status: 'unserviceable' }]), 'TACAN');
    expect(uns).toContain('#ef4444');
    expect(uns.match(/<line/g)).toHaveLength(2);

    const maint = groupOf(render([{ runway_id: 1, end_side: 'b', aid_type: 'TACAN', status: 'maintenance' }]), 'TACAN');
    expect(maint).toContain('#ef4444');
    expect(maint).not.toContain('<line');
  });

  it('תקין מוחרג - כתום, וה-HINT נושא את הערת ההחרגה', () => {
    const g = groupOf(render([{ runway_id: 1, end_side: 'a', aid_type: 'ILS', status: 'restricted', note: 'ללא GP' }]), 'ILS');
    expect(g).toContain('#f59e0b');
    expect(g).toContain('ILS');
    expect(g).toContain('ללא GP');
    expect(g).not.toContain('<line');
  });

  it('הסימון בכיוון המסלול, בין הזברה למספר', () => {
    const m = render();
    const ils = groupOf(m, 'ILS');
    // מסובב כמו מספר הכיוון של אותו קצה
    expect(ils).toMatch(/rotate\(0 /);
    expect(groupOf(m, 'TACAN')).toMatch(/rotate\(180 /);
    // y של הסימון בין סוף פסי הסף (67.66) למספר הכיוון (62.8) - קצה A
    const y = Number(/<text x="50" y="([\d.]+)"/.exec(ils)![1]);
    expect(y).toBeLessThan(67.6);
    expect(y).toBeGreaterThan(62.9);
  });

  it('מסלול בלי אמצעים מוגדרים - בלי סימון (הגדרה קובעת, לא הסטטוס)', () => {
    const bare = { ...RW, aids_a: [], aids_b: [] };
    // גם כשיש שורת סטטוס יתומה במסד
    const m = render([{ runway_id: 1, end_side: 'a', aid_type: 'ILS', status: 'unserviceable' }], bare);
    expect(aidGroups(m)).toEqual([]);
  });
});
