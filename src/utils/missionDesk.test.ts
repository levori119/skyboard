import { describe, it, expect } from 'vitest';
import {
  mdDefaultLeaf, mdSplit, mdRemove, mdUpdate, mdGetAllLeaves,
  evalFormula, computeCells, computeSummary, summaryLabel,
  matchRule, rowStyle, cycleButtonState, resolveFanout, eraseStrokesAt, isImageDataUrl, normalizeLabelRuns, labelPlainText,
  mdMapServices, mdStripsServices, mdMapSettings, mdMissingMapServices, mdStripsMapServiceId, mdPruneMapConfig,
} from './missionDesk';
import type { MDNode, MDLeaf, MDSplit, MDButton, MDTableConfig, MDTableRow, MissionDeskService, MDServiceType } from '../types/missionDesk';

const leaf = (id: string, service_id: number | null = null): MDLeaf => ({ id, type: 'leaf', service_id });

// ── עץ פריסה ────────────────────────────────────────────────────────────────

describe('עץ פריסה (BSP)', () => {
  it('mdDefaultLeaf יוצר leaf ריק עם id', () => {
    const l = mdDefaultLeaf();
    expect(l.type).toBe('leaf');
    expect(l.id).toBeTruthy();
    expect(l.service_id).toBeNull();
  });

  it('mdSplit מפצל leaf לשניים 50/50 ושומר את המקורי ראשון', () => {
    const out = mdSplit(leaf('a', 7), 'a', 'h') as MDSplit;
    expect(out.type).toBe('split');
    expect(out.direction).toBe('h');
    expect(out.sizes).toEqual([50, 50]);
    expect(out.children[0].id).toBe('a');
    expect((out.children[0] as MDLeaf).service_id).toBe(7);
    expect((out.children[1] as MDLeaf).service_id).toBeNull();
  });

  it('mdSplit יורד לעומק עץ מקונן', () => {
    const root: MDNode = { id: 's', type: 'split', direction: 'v', sizes: [50, 50], children: [leaf('a'), leaf('b')] };
    const out = mdSplit(root, 'b', 'h') as MDSplit;
    expect(out.children[1].type).toBe('split');
  });

  it('mdRemove מסיר ילד ומנרמל sizes ל-100', () => {
    const root: MDNode = { id: 's', type: 'split', direction: 'h', sizes: [20, 30, 50], children: [leaf('a'), leaf('b'), leaf('c')] };
    const out = mdRemove(root, 'b') as MDSplit;
    expect(out.children.map(c => c.id)).toEqual(['a', 'c']);
    expect(out.sizes.reduce((s, x) => s + x, 0)).toBeCloseTo(100);
  });

  it('mdRemove של אח יחיד מקריס את ה-split', () => {
    const root: MDNode = { id: 's', type: 'split', direction: 'h', sizes: [50, 50], children: [leaf('a'), leaf('b')] };
    const out = mdRemove(root, 'b');
    expect(out.id).toBe('a');
    expect(out.type).toBe('leaf');
  });

  it('mdUpdate משנה רק את הצומת המבוקש', () => {
    const root: MDNode = { id: 's', type: 'split', direction: 'h', sizes: [50, 50], children: [leaf('a'), leaf('b')] };
    const out = mdUpdate(root, 'b', n => ({ ...n, service_id: 3 })) as MDSplit;
    expect((out.children[1] as MDLeaf).service_id).toBe(3);
    expect((out.children[0] as MDLeaf).service_id).toBeNull();
  });

  it('mdGetAllLeaves אוסף את כל העלים לפי הסדר', () => {
    const root: MDNode = {
      id: 's', type: 'split', direction: 'h', sizes: [50, 50],
      children: [leaf('a', 1), { id: 's2', type: 'split', direction: 'v', sizes: [50, 50], children: [leaf('b', 2), leaf('c')] }],
    };
    expect(mdGetAllLeaves(root).map(l => l.id)).toEqual(['a', 'b', 'c']);
  });
});

// ── נוסחאות ─────────────────────────────────────────────────────────────────

describe('evalFormula', () => {
  const cells = { a: 10, b: 4, c: '6', name: 'טנק' };

  it('ארבע פעולות בסיסיות', () => {
    expect(evalFormula('a+b', cells)).toBe(14);
    expect(evalFormula('a-b', cells)).toBe(6);
    expect(evalFormula('a*b', cells)).toBe(40);
    expect(evalFormula('a/b', cells)).toBe(2.5);
  });

  it('קדימות כפל על חיבור וסוגריים', () => {
    expect(evalFormula('a+b*2', cells)).toBe(18);
    expect(evalFormula('(a+b)*2', cells)).toBe(28);
  });

  it('ערך מספרי שנשמר כמחרוזת נחשב מספר', () => {
    expect(evalFormula('a+c', cells)).toBe(16);
  });

  it('מפתח חסר או לא-מספרי → null', () => {
    expect(evalFormula('a+missing', cells)).toBeNull();
    expect(evalFormula('a+name', cells)).toBeNull();
  });

  it('חלוקה באפס → null', () => {
    expect(evalFormula('a/0', cells)).toBeNull();
  });

  it('נוסחה שבורה → null (לא זריקה)', () => {
    expect(evalFormula('a+', cells)).toBeNull();
    expect(evalFormula('', cells)).toBeNull();
    expect(evalFormula('a++b', cells)).toBeNull();
  });

  it('רווחים וליטרלים מספריים', () => {
    expect(evalFormula(' a + 5 ', cells)).toBe(15);
    expect(evalFormula('2.5*b', cells)).toBe(10);
  });
});

// ── computeCells + סיכומים ──────────────────────────────────────────────────

const tableCfg: MDTableConfig = {
  columns: [
    { key: 'entity', title: 'ישות', type: 'text' },
    { key: 'qty', title: 'כמות', type: 'number' },
    { key: 'used', title: 'נוצל', type: 'number' },
  ],
  computed: [{ key: 'left', title: 'נותר', formula: 'qty-used' }],
  summary: { qty: 'sum', left: 'sum', entity: 'count', used: 'avg' },
};
const rows: MDTableRow[] = [
  { id: 'r1', cells: { entity: 'טנק', qty: 10, used: 4 } },
  { id: 'r2', cells: { entity: 'נגמש', qty: 6, used: 2 } },
  { id: 'r3', cells: { entity: '', qty: '', used: '' } },
];

describe('computeCells', () => {
  it('ממזג עמודת חישוב לתאים', () => {
    const c = computeCells(rows[0], tableCfg);
    expect(c.left).toBe(6);
    expect(c.entity).toBe('טנק');
  });
  it('שורה ריקה — חישוב null/undefined, לא זריקה', () => {
    const c = computeCells(rows[2], tableCfg);
    expect(c.left == null).toBe(true);
  });
});

describe('computeSummary', () => {
  it('sum / avg / count', () => {
    const s = computeSummary(rows, tableCfg);
    expect(s.qty).toBe(16);
    expect(s.left).toBe(10);       // (10-4)+(6-2), שורה ריקה מדולגת
    expect(s.entity).toBe(2);      // count = תאים לא ריקים
    expect(s.used).toBe(3);        // avg של 4,2
  });
  it('min / max', () => {
    const cfg: MDTableConfig = { ...tableCfg, summary: { qty: 'min', used: 'max' } };
    const s = computeSummary(rows, cfg);
    expect(s.qty).toBe(6);
    expect(s.used).toBe(4);
  });
  it('אין ערכים מספריים → null', () => {
    const cfg: MDTableConfig = { ...tableCfg, summary: { entity: 'sum' } };
    expect(computeSummary(rows, cfg).entity).toBeNull();
  });
  it('summaryLabel מחזיר תווית עברית', () => {
    expect(summaryLabel('sum')).toBeTruthy();
  });
});

// ── עיצוב מותנה ─────────────────────────────────────────────────────────────

describe('matchRule + rowStyle', () => {
  it('השוואות מספריות', () => {
    expect(matchRule({ column: 'qty', op: 'gt', value: '5' }, { qty: 10 })).toBe(true);
    expect(matchRule({ column: 'qty', op: 'lt', value: '5' }, { qty: 10 })).toBe(false);
    expect(matchRule({ column: 'qty', op: 'gte', value: '10' }, { qty: 10 })).toBe(true);
    expect(matchRule({ column: 'qty', op: 'eq', value: '10' }, { qty: '10' })).toBe(true);
  });
  it('טקסט: eq / contains / empty', () => {
    expect(matchRule({ column: 'entity', op: 'eq', value: 'טנק' }, { entity: 'טנק' })).toBe(true);
    expect(matchRule({ column: 'entity', op: 'contains', value: 'נק' }, { entity: 'טנק' })).toBe(true);
    expect(matchRule({ column: 'entity', op: 'empty' }, { entity: '' })).toBe(true);
    expect(matchRule({ column: 'entity', op: 'notEmpty' }, { entity: 'x' })).toBe(true);
  });
  it('boolean (V/X)', () => {
    expect(matchRule({ column: 'ok', op: 'eq', value: 'true' }, { ok: true })).toBe(true);
    expect(matchRule({ column: 'ok', op: 'eq', value: 'false' }, { ok: false })).toBe(true);
  });
  it('rowStyle — הכלל הראשון שמתאים מנצח, אין התאמה → null', () => {
    const rules = [
      { column: 'left', op: 'lt' as const, value: '3', bg: '#f00' },
      { column: 'left', op: 'lt' as const, value: '7', bg: '#fa0' },
    ];
    expect(rowStyle(rules, { left: 1 })?.bg).toBe('#f00');
    expect(rowStyle(rules, { left: 5 })?.bg).toBe('#fa0');
    expect(rowStyle(rules, { left: 9 })).toBeNull();
    expect(rowStyle(undefined, { left: 1 })).toBeNull();
  });
});

// ── כפתורים ─────────────────────────────────────────────────────────────────

describe('cycleButtonState', () => {
  const btn = (n: number, active: number): MDButton => ({
    id: 'b', x: 0, y: 0, text: 'x', activeStateIdx: active,
    states: Array.from({ length: n }, (_, i) => ({ label: String(i), color: '#000' })),
  });
  it('מתקדם ומתגלגל להתחלה', () => {
    expect(cycleButtonState(btn(3, 0))).toBe(1);
    expect(cycleButtonState(btn(3, 2))).toBe(0);
  });
  it('כפתור בלי מצבים → 0 (לא זריקה)', () => {
    expect(cycleButtonState(btn(0, 0))).toBe(0);
  });
});

// ── שיתוף (fan-out) ─────────────────────────────────────────────────────────

describe('resolveFanout', () => {
  it('מפתחות JSONB הם מחרוזות; מחזיר יעדים בלי הכותב', () => {
    expect(resolveFanout({ '5': [2, 3] }, 5, 1)).toEqual([2, 3]);
    expect(resolveFanout({ '5': [1, 2, 2, 3] }, 5, 1)).toEqual([2, 3]); // dedupe + בלי הכותב
  });
  it('שירות לא משותף / sharing ריק → []', () => {
    expect(resolveFanout({}, 5, 1)).toEqual([]);
    expect(resolveFanout(null, 5, 1)).toEqual([]);
    expect(resolveFanout(undefined, 5, 1)).toEqual([]);
  });
  it('ערכים לא-חוקיים מסוננים', () => {
    expect(resolveFanout({ '5': ['x', 2, null] }, 5, 1)).toEqual([2]);
  });
});

// ── פלנלית — מחיקה לפי מיקום ────────────────────────────────────────────────

describe('eraseStrokesAt', () => {
  const stroke = (pts: [number, number][]) => ({ points: pts.map(([x, y]) => ({ x, y })), color: '#fff', size: 2 });
  const strokes = [
    stroke([[0.1, 0.1], [0.2, 0.1]]),   // קו שמאלי-עליון
    stroke([[0.8, 0.8], [0.9, 0.9]]),   // קו ימני-תחתון
  ];

  it('מוחק רק stroke שנקודה שלו בטווח הסמן', () => {
    const out = eraseStrokesAt(strokes, 0.15, 0.1, 0.03);
    expect(out).toHaveLength(1);
    expect(out[0].points[0].x).toBe(0.8);
  });

  it('סמן רחוק — לא מוחק כלום (ומחזיר את אותו מערך)', () => {
    const out = eraseStrokesAt(strokes, 0.5, 0.5, 0.03);
    expect(out).toBe(strokes);
  });

  it('רדיוס גדול מוחק את הכל', () => {
    expect(eraseStrokesAt(strokes, 0.5, 0.5, 1)).toHaveLength(0);
  });

  it('מחיקה גם על קטע בין נקודות (לא רק על קודקוד)', () => {
    // הסמן ב-0.15,0.1 בדיוק על הקו בין (0.1,0.1) ל-(0.2,0.1) גם אם אין שם קודקוד
    const sparse = [stroke([[0.1, 0.1], [0.5, 0.1]])];
    const out = eraseStrokesAt(sparse, 0.3, 0.1, 0.02);
    expect(out).toHaveLength(0);
  });
});

// ── כמות בעמודת V/X ─────────────────────────────────────────────────────────

describe('computeSummary — עמודת V/X', () => {
  const cfg: MDTableConfig = {
    columns: [{ key: 'ok', title: 'שמיש', type: 'check' }],
    summary: { ok: 'count' },
  };
  const vRows: MDTableRow[] = [
    { id: 'a', cells: { ok: true } },
    { id: 'b', cells: { ok: false } },
    { id: 'c', cells: {} },            // טרם סומן — מוצג ✘
    { id: 'd', cells: { ok: true } },
  ];

  it('ברירת מחדל: נספרים רק ✔ (לא ✘ ולא ריק)', () => {
    expect(computeSummary(vRows, cfg).ok).toBe(2);
  });

  it("countWhat:'x' סופר את מה שמוצג ✘ — כולל שורות שטרם סומנו", () => {
    const cfgX: MDTableConfig = { ...cfg, columns: [{ ...cfg.columns[0], countWhat: 'x' }] };
    expect(computeSummary(vRows, cfgX).ok).toBe(2); // false + לא-סומן
  });

  it('עמודת טקסט — הספירה נשארת לפי תאים לא ריקים', () => {
    const cfgT: MDTableConfig = { columns: [{ key: 't', title: 'א', type: 'text' }], summary: { t: 'count' } };
    expect(computeSummary([{ id: 'a', cells: { t: 'x' } }, { id: 'b', cells: { t: '' } }], cfgT).t).toBe(1);
  });
});

// ── תמונה קבועה — ולידציית data URL ─────────────────────────────────────────

describe('isImageDataUrl', () => {
  it('מקבל PNG/JPEG/GIF/WEBP data URL', () => {
    expect(isImageDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isImageDataUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
    expect(isImageDataUrl('data:image/gif;base64,R0lGOD')).toBe(true);
    expect(isImageDataUrl('data:image/webp;base64,UklGR')).toBe(true);
  });
  it('דוחה לא-תמונה, ריק, URL רגיל, ו-svg (הזרקת סקריפט)', () => {
    expect(isImageDataUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(isImageDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isImageDataUrl('https://x/y.png')).toBe(false);
    expect(isImageDataUrl('')).toBe(false);
    expect(isImageDataUrl(undefined as any)).toBe(false);
  });
});

// ── טקסט קבוע — נרמול מקטעי rich-text ──────────────────────────────────────

describe('normalizeLabelRuns', () => {
  it('ממזג מקטעים סמוכים עם אותו עיצוב', () => {
    const out = normalizeLabelRuns([
      { text: 'א', bold: true }, { text: 'ב', bold: true }, { text: 'ג' },
    ]);
    expect(out).toEqual([{ text: 'אב', bold: true }, { text: 'ג' }]);
  });
  it('לא ממזג כשעיצוב שונה', () => {
    const out = normalizeLabelRuns([{ text: 'א', fontSize: 20 }, { text: 'ב', fontSize: 40 }]);
    expect(out).toHaveLength(2);
  });
  it('מדלג על מקטעים ריקים', () => {
    expect(normalizeLabelRuns([{ text: '' }, { text: 'x' }, { text: '' }])).toEqual([{ text: 'x' }]);
  });
  it('שומר שורות חדשות וממזג סביבן לפי עיצוב', () => {
    const out = normalizeLabelRuns([{ text: 'א' }, { text: '\n' }, { text: 'ב' }]);
    expect(out.map(r => r.text).join('')).toBe('א\nב');
  });
  it('קלט ריק → []', () => {
    expect(normalizeLabelRuns([])).toEqual([]);
    expect(normalizeLabelRuns(undefined as any)).toEqual([]);
  });
});

describe('labelPlainText', () => {
  it('runs → טקסט רגיל', () => {
    expect(labelPlainText({ runs: [{ text: 'שלום ' }, { text: 'עולם', bold: true }] })).toBe('שלום עולם');
  });
  it('נופל ל-text legacy כשאין runs', () => {
    expect(labelPlainText({ text: 'ישן' })).toBe('ישן');
  });
  it('ריק → מחרוזת ריקה', () => {
    expect(labelPlainText({})).toBe('');
  });
});

// ── חלונות מפה בדסק משימה ───────────────────────────────────────────────────

const svc = (id: number, service_type: MDServiceType, config: any = {}, sort_order = id): MissionDeskService =>
  ({ id, desk_id: 1, service_type, name: service_type + id, config, sort_order });

describe('חלונות מפה בדסק משימה', () => {
  const maps = [svc(7, 'map', {}, 2), svc(3, 'map', {}, 1)];
  const services = [...maps, svc(9, 'table', { columns: [] }, 3), svc(11, 'strips', { map_service_id: 7 }, 4)];

  it('mdMapServices מחזיר רק חלונות מפה, בסדר ההגדרה', () => {
    expect(mdMapServices(services).map(s => s.id)).toEqual([3, 7]);
  });

  it('mdStripsServices מחזיר רק חלונות פ"ממים', () => {
    expect(mdStripsServices(services).map(s => s.id)).toEqual([11]);
  });

  it('mdMapSettings מחזיר ברירות מחדל לחלון שטרם הוגדר', () => {
    expect(mdMapSettings({}, 3)).toEqual({
      map_id: null, transfer_points: [], sector_maps_enabled: false, sector_map_ids: [],
      flight_zones_mode: false, fz_pin_display: 'handwrite',
    });
  });

  it('mdMapSettings מנרמל ערכים שהגיעו כמחרוזות מה-DB', () => {
    const cfg: any = { '3': { map_id: '12', transfer_points: ['4', 5, 'לא-מספר'], sector_maps_enabled: true, sector_map_ids: ['8'] } };
    expect(mdMapSettings(cfg, 3)).toEqual({
      map_id: 12, transfer_points: [4, 5], sector_maps_enabled: true, sector_map_ids: [8],
      flight_zones_mode: false, fz_pin_display: 'handwrite',
    });
  });

  it('תצוגת פ"מ לא מוכרת נופלת לכתב יד; מוכרת נשמרת', () => {
    expect(mdMapSettings({ '3': { map_id: 1, transfer_points: [], fz_pin_display: 'בלה' } } as any, 3).fz_pin_display).toBe('handwrite');
    expect(mdMapSettings({ '3': { map_id: 1, transfer_points: [], fz_pin_display: 'icon' } } as any, 3).fz_pin_display).toBe('icon');
  });

  it('מצב אזורי טיסה הוא פר-חלון, וברירת המחדל כבויה', () => {
    expect(mdMapSettings({ '3': { map_id: 1, transfer_points: [] } } as any, 3).flight_zones_mode).toBe(false);
    expect(mdMapSettings({ '3': { map_id: 1, transfer_points: [], flight_zones_mode: true } } as any, 3).flight_zones_mode).toBe(true);
  });

  it('map_id אפס/שלילי נחשב "לא נבחרה מפה"', () => {
    expect(mdMapSettings({ '3': { map_id: 0, transfer_points: [] } } as any, 3).map_id).toBeNull();
  });

  it('mdMissingMapServices חוסם כשחלון מפה אחד מתוך שניים ללא מפה', () => {
    const cfg: any = { '3': { map_id: 12, transfer_points: [] } };
    expect(mdMissingMapServices(services, cfg).map(s => s.id)).toEqual([7]);
  });

  it('mdMissingMapServices ריק כשלכל חלון נבחרה מפה', () => {
    const cfg: any = { '3': { map_id: 12, transfer_points: [] }, '7': { map_id: 13, transfer_points: [] } };
    expect(mdMissingMapServices(services, cfg)).toEqual([]);
  });

  it('דסק בלי חלונות מפה לא חוסם שמירה', () => {
    expect(mdMissingMapServices([svc(9, 'table')], {})).toEqual([]);
  });

  it('mdStripsMapServiceId מכבד קישור מפורש', () => {
    expect(mdStripsMapServiceId(svc(11, 'strips', { map_service_id: 7 }), services)).toBe(7);
  });

  it('קישור לשירות מפה שנמחק - נופל לחלון היחיד אם יש כזה, אחרת null', () => {
    expect(mdStripsMapServiceId(svc(11, 'strips', { map_service_id: 99 }), services)).toBeNull();
    expect(mdStripsMapServiceId(svc(11, 'strips', { map_service_id: 99 }), [svc(3, 'map')])).toBe(3);
  });

  it('בלי קישור ובדסק חלון מפה יחיד - זה היעד', () => {
    expect(mdStripsMapServiceId(svc(11, 'strips', {}), [svc(3, 'map')])).toBe(3);
  });

  it('בלי קישור ובדסק כמה חלונות - נדרשת בחירה מפורשת', () => {
    expect(mdStripsMapServiceId(svc(11, 'strips', {}), services)).toBeNull();
  });

  it('mdPruneMapConfig מסיר הגדרות של חלונות שנמחקו מהדסק', () => {
    const cfg: any = { '3': { map_id: 12 }, '99': { map_id: 13 } };
    expect(Object.keys(mdPruneMapConfig(cfg, services))).toEqual(['3']);
  });
});
