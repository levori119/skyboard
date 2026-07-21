import { describe, it, expect } from 'vitest';
import {
  mdDefaultLeaf, mdSplit, mdRemove, mdUpdate, mdGetAllLeaves,
  evalFormula, computeCells, computeSummary, summaryLabel,
  matchRule, rowStyle, cycleButtonState, resolveFanout, eraseStrokesAt,
} from './missionDesk';
import type { MDNode, MDLeaf, MDSplit, MDButton, MDTableConfig, MDTableRow } from '../types/missionDesk';

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
