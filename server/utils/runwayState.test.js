import { describe, it, expect } from 'vitest';
import { RUNWAY_GROUP_SQL, mergeEndUse, mergeGrf, mergeLighting, mergeNotams } from './runwayState.js';

// מסלול מקושר הוא **מסלול פיזי אחד**, ולכן המצב שלו נפתר בזמן **קריאה** ולא
// מועתק בזמן כתיבה: אין עותקים שמתיישנים, קישור חדש רואה מיד את המידע הקיים,
// וביטול קישור מפריד מיד. כאן נבדקים כללי ההכרעה בתוך הקבוצה.
//
// `local` = המסלול של השדה ששואל · `src` = המסלול שבו השורה באמת נשמרה.

const A = { id: 1, airfield_id: 10, airfield_name: 'שדה א', heading_a: '15L', heading_b: '33R' };
const B = { id: 2, airfield_id: 20, airfield_name: 'שדה ב', heading_a: '33', heading_b: '15' };

const at = (s) => new Date(`2026-08-05T${s}:00Z`).toISOString();

describe('RUNWAY_GROUP_SQL - הרכבת הקבוצה', () => {
  it('כוללת את המסלול עצמו, כדי שגם שדה בלי קישורים יקבל את המצב שלו', () => {
    expect(RUNWAY_GROUP_SQL).toMatch(/rw\.id AS local_id,\s*rw\.id AS src_id/);
  });

  it('הולכת דרך מסלול הראי וקבוצת הקישור', () => {
    expect(RUNWAY_GROUP_SQL).toContain('source_runway_id');
    expect(RUNWAY_GROUP_SQL).toContain('route_link_members');
  });
});

describe('mergeNotams - איחוד, עם מיפוי קצה והצגת המקור', () => {
  it('NOTAM של שכן מוצג אצלי, עם ציון מאיפה הגיע', () => {
    const out = mergeNotams([
      { row: { id: 7, runway_id: 2, notam_type: 'closed' }, src: B, local: A },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].runway_id, 'ממופה למסלול שלי כדי שהלקוח לא ישתנה').toBe(1);
    expect(out[0].id, 'מזהה השורה המקורי נשמר - עריכה ומחיקה עובדות לשני הצדדים').toBe(7);
    expect(out[0].is_linked).toBe(true);
    expect(out[0].source_airfield_name).toBe('שדה ב');
  });

  it('קיצור: המיקום מותאם כשהסדר הפוך אצל השכן', () => {
    // אצל B הקצה 'a' הוא 33; אצלי 33R הוא 'b'
    const out = mergeNotams([
      { row: { id: 8, runway_id: 2, notam_type: 'shortening', shorten_end: 'a', shorten_amount_m: 300 }, src: B, local: A },
    ]);
    expect(out[0].shorten_end).toBe('b');
    expect(out[0].shorten_amount_m).toBe(300);
  });

  it('קיצור שאי אפשר למפות נופל - עדיף בלי קיצור מאשר בקצה ההפוך', () => {
    const other = { id: 3, airfield_id: 30, heading_a: '09', heading_b: '27' };
    const out = mergeNotams([
      { row: { id: 9, runway_id: 3, notam_type: 'shortening', shorten_end: 'a' }, src: other, local: A },
    ]);
    expect(out).toHaveLength(0);
  });

  it('NOTAM טקסטואלי עובר גם בלי התאמת קצוות', () => {
    const other = { id: 3, airfield_id: 30, heading_a: '09', heading_b: '27' };
    const out = mergeNotams([
      { row: { id: 9, runway_id: 3, notam_type: 'text', text_content: 'עבודות' }, src: other, local: A },
    ]);
    expect(out).toHaveLength(1);
  });

  it('שלי ראשון ואז של השכנים - הפקח רואה קודם את מה שהוא כתב', () => {
    const out = mergeNotams([
      { row: { id: 20, runway_id: 2, notam_type: 'closed' }, src: B, local: A },
      { row: { id: 5, runway_id: 1, notam_type: 'text', text_content: 'שלי' }, src: A, local: A },
    ]);
    expect(out.map(n => n.id)).toEqual([5, 20]);
  });
});

describe('mergeGrf - הדיווח האחרון לכל קצה', () => {
  it('דיווח חדש יותר של שכן גובר, ושם הקצה מתורגם לשלי', () => {
    const out = mergeGrf([
      { row: { id: 1, runway_id: 1, heading: '15L', rwycc_t: 5, reported_at: at('08') }, src: A, local: A },
      { row: { id: 2, runway_id: 2, heading: '15', rwycc_t: 2, reported_at: at('10') }, src: B, local: A },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].heading, 'שם הקצה של השדה ששואל').toBe('15L');
    expect(out[0].rwycc_t).toBe(2);
    expect(out[0].is_linked).toBe(true);
  });

  it('דיווח ישן יותר אינו גובר', () => {
    const out = mergeGrf([
      { row: { id: 1, runway_id: 1, heading: '15L', rwycc_t: 5, reported_at: at('12') }, src: A, local: A },
      { row: { id: 2, runway_id: 2, heading: '15', rwycc_t: 2, reported_at: at('10') }, src: B, local: A },
    ]);
    expect(out[0].rwycc_t).toBe(5);
  });

  it('שני קצוות - שתי שורות', () => {
    const out = mergeGrf([
      { row: { id: 1, runway_id: 1, heading: '15L', reported_at: at('10') }, src: A, local: A },
      { row: { id: 2, runway_id: 1, heading: '33R', reported_at: at('10') }, src: A, local: A },
    ]);
    expect(out.map(r => r.heading).sort()).toEqual(['15L', '33R']);
  });
});

describe('mergeLighting - מצב אחד למסלול, האחרון גובר', () => {
  it('העדכון האחרון בקבוצה הוא המצב', () => {
    const out = mergeLighting([
      { row: { id: 1, runway_id: 1, centerline_level: 1, updated_at: at('08') }, src: A, local: A },
      { row: { id: 2, runway_id: 2, centerline_level: 3, updated_at: at('09') }, src: B, local: A },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].centerline_level).toBe(3);
    expect(out[0].runway_id).toBe(1);
  });

  it('בלי תאורות בקבוצה - אין שורה', () => {
    expect(mergeLighting([])).toEqual([]);
  });
});

describe('mergeEndUse - כיוון אחד למסלול, גם כשהשכן קבע כיוון אחר', () => {
  it('שם הקצה מתורגם לשם המקומי', () => {
    const out = mergeEndUse([
      { row: { id: 1, runway_id: 2, end_name: '15', in_takeoff: true, in_landing: false, updated_at: at('09') }, src: B, local: A },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].end_name).toBe('15L');
    expect(out[0].in_takeoff).toBe(true);
  });

  it('כיוון ישן של השכן נופל מול כיוון חדש שלי - לא שני כיוונים בו זמנית', () => {
    const out = mergeEndUse([
      { row: { id: 1, runway_id: 2, end_name: '33', in_landing: true, updated_at: at('08') }, src: B, local: A },
      { row: { id: 2, runway_id: 1, end_name: '15L', in_takeoff: true, updated_at: at('10') }, src: A, local: A },
    ]);
    const inUse = out.filter(r => r.in_takeoff || r.in_landing);
    expect(inUse).toHaveLength(1);
    expect(inUse[0].end_name).toBe('15L');
    expect(out.find(r => r.end_name === '33R')?.in_landing, 'הכיוון הישן כבוי').toBe(false);
  });

  it('אותו קצה בשני הצדדים - העדכון האחרון קובע', () => {
    const out = mergeEndUse([
      { row: { id: 1, runway_id: 1, end_name: '15L', in_takeoff: true, in_landing: false, updated_at: at('08') }, src: A, local: A },
      { row: { id: 2, runway_id: 2, end_name: '15', in_takeoff: true, in_landing: true, updated_at: at('11') }, src: B, local: A },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].in_landing).toBe(true);
  });

  it('שני מסלולים שונים אינם מתחרים ביניהם', () => {
    const C = { id: 4, airfield_id: 10, heading_a: '18', heading_b: '36' };
    const out = mergeEndUse([
      { row: { id: 1, runway_id: 1, end_name: '15L', in_takeoff: true, updated_at: at('08') }, src: A, local: A },
      { row: { id: 2, runway_id: 4, end_name: '18', in_takeoff: true, updated_at: at('10') }, src: C, local: C },
    ]);
    expect(out.filter(r => r.in_takeoff)).toHaveLength(2);
  });
});
