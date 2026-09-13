// שירות "טבלאות מתצוגה" בדסק משימה - ההכרעות הטהורות.
//
// אותו דסק משרת כמה עמדות, ולכן *אילו* טבלאות נפתחות בכל משבצת נקבע בהגדרת
// העמדה (workstation_presets.mission_desk_view_tables) ולא בהגדרת הדסק.

import { describe, it, expect } from 'vitest';
import {
  MD_VIEW_TABLES, mdViewTablesServices, mdViewTablesSettings, mdPruneViewTablesConfig,
  mdViewTableOwners, mdViewTablesNeedAirfield,
} from './missionDesk';
import type { MDNode, MDLeaf, MissionDeskService, MDServiceType } from '../types/missionDesk';

const svc = (id: number, service_type: MDServiceType, sort_order = id): MissionDeskService =>
  ({ id, desk_id: 1, service_type, name: `s${id}`, config: {} as any, sort_order });
const leaf = (id: string, service_id: number | null): MDLeaf => ({ id, type: 'leaf', service_id });

describe('קטלוג הטבלאות', () => {
  it('כולל את הטבלאות של תפריט התצוגה, כל אחת פעם אחת', () => {
    const keys = MD_VIEW_TABLES.map(t => t.key);
    expect(keys).toEqual(['elements', 'trips', 'drivers', 'quantities', 'messages', 'container']);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('לכל טבלה אייקון ומפתח תרגום', () => {
    for (const t of MD_VIEW_TABLES) {
      expect(t.icon).toBeTruthy();
      expect(t.labelKey).toMatch(/^missiondesk\./);
    }
  });
});

describe('mdViewTablesSettings', () => {
  it('משבצת שלא הוגדרה - ריקה ובלי שדה', () => {
    expect(mdViewTablesSettings({}, 5)).toEqual({ tables: [], airfield_id: null });
    expect(mdViewTablesSettings(null, 5)).toEqual({ tables: [], airfield_id: null });
  });

  it('מסנן מפתחות לא מוכרים, מסיר כפילויות ומסדר לפי הקטלוג', () => {
    const cfg: any = { '5': { tables: ['messages', 'בלה', 'elements', 'messages'], airfield_id: 3 } };
    expect(mdViewTablesSettings(cfg, 5)).toEqual({ tables: ['elements', 'messages'], airfield_id: 3 });
  });

  it('שדה לא תקין נחשב "לא נבחר"', () => {
    expect(mdViewTablesSettings({ '5': { tables: [], airfield_id: 0 } } as any, 5).airfield_id).toBeNull();
    expect(mdViewTablesSettings({ '5': { tables: [], airfield_id: 'x' } } as any, 5).airfield_id).toBeNull();
  });

  it('tables שאינו מערך לא מפיל', () => {
    expect(mdViewTablesSettings({ '5': { tables: 'elements' } } as any, 5).tables).toEqual([]);
  });
});

describe('mdViewTablesServices / mdPruneViewTablesConfig', () => {
  const services = [svc(3, 'map'), svc(8, 'view_tables', 2), svc(4, 'view_tables', 1), svc(9, 'table')];

  it('רק שירותי טבלאות מתצוגה, לפי סדר ההגדרה', () => {
    expect(mdViewTablesServices(services).map(s => s.id)).toEqual([4, 8]);
  });

  it('מנקה הגדרות של משבצות שנמחקו מהדסק', () => {
    const cfg: any = { '4': { tables: ['elements'] }, '99': { tables: ['trips'] }, '3': { tables: ['trips'] } };
    expect(Object.keys(mdPruneViewTablesConfig(cfg, services))).toEqual(['4']);
  });
});

describe('mdViewTableOwners - טבלה נפתחת במשבצת אחת בלבד', () => {
  const services = [svc(4, 'view_tables'), svc(8, 'view_tables'), svc(9, 'table')];

  it('טבלה שנבחרה בשתי משבצות שייכת לראשונה בפריסה', () => {
    // בפריסה 8 קודם ל-4 - הסדר על המסך קובע, לא סדר היצירה
    const layout: MDNode = { id: 'r', type: 'split', direction: 'h', sizes: [50, 50], children: [leaf('a', 8), leaf('b', 4)] };
    const cfg: any = { '4': { tables: ['messages', 'elements'] }, '8': { tables: ['messages'] } };
    expect(mdViewTableOwners(layout, services, cfg)).toEqual({ messages: 8, elements: 4 });
  });

  it('שירות שלא הוצב בפריסה אינו מחזיק טבלה', () => {
    const cfg: any = { '4': { tables: ['elements'] } };
    expect(mdViewTableOwners(leaf('a', 9), services, cfg)).toEqual({});
  });

  it('בלי פריסה - אין בעלים', () => {
    expect(mdViewTableOwners(null, services, { '4': { tables: ['elements'] } } as any)).toEqual({});
  });

  it('שירות מסוג אחר עם אותו מזהה בהגדרה אינו נספר', () => {
    const cfg: any = { '9': { tables: ['elements'] } };
    expect(mdViewTableOwners(leaf('a', 9), services, cfg)).toEqual({});
  });
});

describe('mdViewTablesNeedAirfield', () => {
  it('נסיעות ונהגים דורשים שדה תעופה', () => {
    expect(mdViewTablesNeedAirfield({ tables: ['trips'], airfield_id: null })).toBe(true);
    expect(mdViewTablesNeedAirfield({ tables: ['drivers', 'messages'], airfield_id: null })).toBe(true);
  });

  it('שאר הטבלאות לא', () => {
    expect(mdViewTablesNeedAirfield({ tables: ['elements', 'quantities', 'messages', 'container'], airfield_id: null })).toBe(false);
  });
});
