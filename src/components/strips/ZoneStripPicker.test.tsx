import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ZoneStripPicker, zonePickRows } from './ZoneStripPicker';

// מה שנבדק: תפריט הפ"מים של אזור מציג את מי שאפשר לשבץ, ואומר ליד כל אחד
// איפה הוא - כי זה מה שקובע מה הבחירה תעשה:
//   1. ממתין בנקודת העברה (יש העברה נכנסת) → "בנקודת העברה" + "יתקבל אוטומטית".
//   2. באזור אחר → שם האזור (וכל האזורים הנוספים).
//   3. כבר באזור הזה → לא מוצג.
//   4. בדרך מאיתנו (pending_transfer בלי העברה נכנסת), מבוטל או נדחה → לא מוצג.

const strip = (id: number, extra: Record<string, unknown> = {}) => ({ id: `s${id}`, callSign: `קשר${id}`, sq: '105', alt: 'FL120', status: 'active', ...extra });
const asgn = (strip_id: number, zone_id: number | null, zone_name: string | null, extra: any[] = []) => ({ strip_id, zone_id, zone_name, extra_zones: extra });

describe('zonePickRows', () => {
  const ZONE = 7;
  const rows = zonePickRows({
    zoneId: ZONE,
    strips: [
      strip(1),                                                    // חופשי
      strip(2),                                                    // באזור אחר
      strip(3),                                                    // כבר באזור הזה
      strip(4, { status: 'pending_transfer' }),                    // בנקודת העברה אליי
      strip(5, { status: 'pending_transfer' }),                    // בדרך מאיתנו - אין העברה נכנסת
      strip(6, { status: 'cancelled' }),
      strip(8),                                                    // באזור הזה כאזור נוסף
    ],
    assignments: [
      asgn(2, 9, 'צפון', [{ id: 1, zone_id: 10, zone_name: 'מרכז', zone_color: null }]),
      asgn(3, ZONE, 'דרום'),
      asgn(8, 9, 'צפון', [{ id: 2, zone_id: ZONE, zone_name: 'דרום', zone_color: null }]),
    ],
    transfers: [{ id: 'T4', strip_id: 4, status: 'pending', from_sector_label: 'פלמ"ח' }],
  });
  const byId = (id: number) => rows.find(r => r.id === id);

  it('פ"מ בלי אזור - מוצג כחופשי', () => {
    expect(byId(1)?.where).toEqual({ kind: 'free' });
    expect(byId(1)?.alt).toBe('120');
  });

  it('פ"מ באזור אחר - כל האזורים שלו', () => {
    expect(byId(2)?.where).toEqual({ kind: 'zone', zones: ['צפון', 'מרכז'] });
  });

  it('פ"מ בנקודת העברה - עם מזהה ההעברה ושם הנקודה', () => {
    expect(byId(4)?.where).toEqual({ kind: 'transfer', transferId: 'T4', from: 'פלמ"ח' });
  });

  it('לא מוצגים: כבר באזור (ראשי או נוסף), בדרך מאיתנו, מבוטל', () => {
    expect(byId(3)).toBeUndefined();
    expect(byId(8)).toBeUndefined();
    expect(byId(5)).toBeUndefined();
    expect(byId(6)).toBeUndefined();
    expect(rows.map(r => r.id).sort()).toEqual([1, 2, 4]);
  });

  it('באוויר קודם - כמו הרשימה בסרגל', () => {
    const r = zonePickRows({ zoneId: 1, strips: [strip(1), strip(2, { airborne: true })], assignments: [], transfers: [] });
    expect(r.map(x => x.id)).toEqual([2, 1]);
  });
});

describe('ZoneStripPicker', () => {
  const base = { zoneName: 'דרום', zoneColor: '#22c55e', x: 100, y: 100, themeMode: 'dark' as const, dir: 'rtl' as const, onPick: () => {}, onZoneSettings: () => {}, onClose: () => {} };

  it('כותב ליד כל פ"מ איפה הוא', () => {
    const html = renderToStaticMarkup(<ZoneStripPicker {...base} rows={[
      { id: 1, label: 'קשר1', sq: '105', alt: '120', airborne: false, where: { kind: 'transfer', transferId: 'T1', from: 'פלמח' } },
      { id: 2, label: 'קשר2', sq: '105', alt: '', airborne: false, where: { kind: 'zone', zones: ['צפון'] } },
      { id: 3, label: 'קשר3', sq: '', alt: '', airborne: false, where: { kind: 'free' } },
    ]} />);
    expect(html).toContain('data-where="transfer"');
    expect(html).toContain('פלמח');
    expect(html).toContain('data-where="zone"');
    expect(html).toContain('צפון');
    expect((html.match(/data-zone-pick=/g) || []).length).toBe(3);
  });

  it('רשימה ריקה - הודעה ולא תפריט ריק', () => {
    const html = renderToStaticMarkup(<ZoneStripPicker {...base} rows={[]} />);
    expect(html).not.toContain('data-zone-pick=');
    expect(html).toContain('data-zone-strip-picker');
  });
});
