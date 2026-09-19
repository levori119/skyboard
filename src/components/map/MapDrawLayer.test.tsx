import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapDrawToolbar, MapDrawToggle, MapShapeSvg, PolyDraftSvg, toolbarColors, type ThemeMode } from './MapDrawLayer';
import { DRAW_PALETTE, type DrawTool } from '../../utils/mapDrawing';

// סרגל הציור הוא **רכיב משותף** לעמדת המפה ולעמדת השדה. הבדיקות כאן שומרות על
// מה שהמשתמש רואה: אילו כלים מוצגים, מתי מופיעה שורת המילוי, ושהסרגל קריא
// בשלוש התמות (אור/שחור/כחול) - ocean היא תמה כהה, לא בהירה.

const noop = () => {};

const render = (over: Partial<React.ComponentProps<typeof MapDrawToolbar>> = {}) =>
  renderToStaticMarkup(
    <MapDrawToolbar
      tool="pen" onToolChange={noop}
      color={DRAW_PALETTE[0]} onColorChange={noop}
      size={3} onSizeChange={noop}
      filled={false} onFilledChange={noop}
      onClear={noop} onClose={noop}
      {...over}
    />
  );

/** יחס ניגודיות WCAG בין שני צבעים (hex או rgba על רקע אטום). */
const rgbOf = (c: string): [number, number, number] => {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) { const [r, g, b] = m[1].split(',').map(Number); return [r, g, b]; }
  const h = c.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};
const lum = (c: string) => {
  const ch = rgbOf(c).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('MapDrawToolbar - כלי הציור', () => {
  it('ברירת המחדל: עט, מחק, עיגול, מלבן - בלי או"ק (שייך רק לעמדת המפה)', () => {
    const m = render();
    expect(m).toContain('עט');
    expect(m).toContain('מחק');
    expect(m).toContain('עיגול');
    expect(m).toContain('מלבן');
    expect(m).not.toContain('או"ק');
  });

  it('עמדת המפה מוסיפה את כלי האו"ק דרך prop, בלי לשכפל סרגל', () => {
    const m = render({ tools: ['pen', 'eraser', 'circle', 'rect', 'recognize'] as DrawTool[] });
    expect(m).toContain('או&quot;ק');
  });

  it('שורת המילוי מוצגת רק לכלי צורה', () => {
    expect(render({ tool: 'pen' })).not.toContain('קווי');
    expect(render({ tool: 'circle' })).toContain('קווי');
    expect(render({ tool: 'rect', filled: true })).toContain('מלא');
  });

  it('כל צבעי הפלטה מוצגים, והצבע הפעיל מסומן', () => {
    const m = render({ color: '#22c55e' });
    for (const c of DRAW_PALETTE) expect(m).toContain(`background:${c}`);
    expect(m).toMatch(/background:#22c55e;border:2px solid/);
  });

  it('העובי הנבחר מוצג למשתמש', () => {
    expect(render({ size: 7 })).toContain('>7<');
  });

  it('תוספות של העמדה נכנסות דרך פתחים ולא דרך שכפול הסרגל', () => {
    const m = render({ toolsExtra: <button>MyScript</button>, children: <span>share</span> });
    expect(m).toContain('MyScript');
    expect(m).toContain('share');
  });
});

describe('MapDrawToolbar - פוליגון סגור ופתוח', () => {
  it('שני כלי הפוליגון מוצגים כברירת מחדל, ליד העיגול והמלבן', () => {
    const m = render();
    expect(m).toContain('פוליגון סגור');
    expect(m).toContain('פוליגון פתוח');
    expect(m.indexOf('מלבן')).toBeLessThan(m.indexOf('פוליגון סגור'));
  });

  it('מילוי מוצג לפוליגון סגור ולא לפתוח (קו שבור אינו שטח)', () => {
    expect(render({ tool: 'polygon' })).toContain('קווי');
    expect(render({ tool: 'polyline' })).not.toContain('קווי');
  });

  it('בכלי פוליגון מוצג הסבר, וכפתורי סיום/נקודה אחורה כשיש נקודות', () => {
    const idle = render({ tool: 'polygon', polyDraft: { count: 0, onFinish: noop, onUndo: noop } });
    expect(idle).toContain('דקור נקודות');
    expect(idle).not.toContain('סיום');
    const busy = render({ tool: 'polyline', polyDraft: { count: 2, onFinish: noop, onUndo: noop } });
    expect(busy).toContain('סיום');
    expect(busy).toContain('נקודה אחורה');
  });

  it('בכלי אחר אין הסבר פוליגון', () => {
    expect(render({ tool: 'pen', polyDraft: { count: 0, onFinish: noop, onUndo: noop } })).not.toContain('דקור נקודות');
  });
});

describe('MapShapeSvg / PolyDraftSvg - רינדור', () => {
  const svg = (el: React.ReactElement) => renderToStaticMarkup(<svg>{el}</svg>);
  const base = { id: 'a', color: '#ef4444', filled: false, strokeWidth: 2, x: 0, y: 0, w: 0.5, h: 0.5 };

  it('פוליגון סגור מרונדר כ-polygon (סוגר את האחרונה לראשונה)', () => {
    const m = svg(<MapShapeSvg shape={{ ...base, type: 'polygon', points: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }] }} size={{ w: 100, h: 100 }} />);
    expect(m).toContain('<polygon');
    expect(m).toContain('points="0,0 50,0 50,50"');
  });

  it('פוליגון פתוח מרונדר כ-polyline בלי מילוי', () => {
    const m = svg(<MapShapeSvg shape={{ ...base, type: 'polyline', filled: true, points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }] }} size={{ w: 100, h: 100 }} />);
    expect(m).toContain('<polyline');
    expect(m).toContain('fill="none"');
  });

  it('מלבן ועיגול ממשיכים להתרנדר כמו קודם', () => {
    expect(svg(<MapShapeSvg shape={{ ...base, type: 'rect' }} size={{ w: 100, h: 100 }} />)).toContain('<rect');
    expect(svg(<MapShapeSvg shape={{ ...base, type: 'circle' }} size={{ w: 100, h: 100 }} />)).toContain('<ellipse');
  });

  it('טיוטה: הקו עד המצביע, ובסגור - קו סגירה מקווקו לנקודה הראשונה', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const closed = svg(<PolyDraftSvg type="polygon" points={pts} cursor={{ x: 10, y: 10 }} color="#ef4444" strokeWidth={2} filled={false} />);
    expect(closed).toContain('points="0,0 10,0 10,10"');
    expect(closed).toContain('data-poly-closing');
    const open = svg(<PolyDraftSvg type="polyline" points={pts} cursor={{ x: 10, y: 10 }} color="#ef4444" strokeWidth={2} filled={false} />);
    expect(open).not.toContain('data-poly-closing');
  });

  it('טיוטה ריקה לא מרנדרת כלום', () => {
    expect(svg(<PolyDraftSvg type="polygon" points={[]} cursor={null} color="#ef4444" strokeWidth={2} filled={false} />)).toBe('<svg></svg>');
  });
});

describe('MapDrawToolbar - התאמת תמה', () => {
  const themes: ThemeMode[] = ['light', 'dark', 'ocean'];

  it('לכל תמה פלטה משלה - אין רקע קשיח', () => {
    const panels = themes.map(t => toolbarColors(t).panel);
    expect(new Set(panels).size).toBe(3);
  });

  it('כחול (ocean) היא תמה כהה כמו שחור, לא בהירה', () => {
    expect(lum(toolbarColors('ocean').panel)).toBeLessThan(0.2);
    expect(lum(toolbarColors('dark').panel)).toBeLessThan(0.2);
    expect(lum(toolbarColors('light').panel)).toBeGreaterThan(0.7);
  });

  it('טקסט הכותרת והתוויות קריא בכל תמה (ניגודיות >= 3:1)', () => {
    for (const t of themes) {
      const C = toolbarColors(t);
      expect(contrast(C.title, C.panel), `title ב-${t}`).toBeGreaterThanOrEqual(3);
      expect(contrast(C.label, C.panel), `label ב-${t}`).toBeGreaterThanOrEqual(3);
      expect(contrast(C.offText, C.off), `כפתור כבוי ב-${t}`).toBeGreaterThanOrEqual(3);
      expect(contrast(C.onText, C.on), `כפתור פעיל ב-${t}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('הסרגל מרונדר בצבעי התמה שהועברה', () => {
    expect(render({ themeMode: 'ocean' })).toContain(toolbarColors('ocean').panel);
    expect(render({ themeMode: 'light' })).toContain(toolbarColors('light').panel);
  });
});

describe('MapDrawToggle - כפתור ההדלקה', () => {
  it('מצב פעיל וכבוי נבדלים ויזואלית', () => {
    const on = renderToStaticMarkup(<MapDrawToggle active onToggle={noop} />);
    const off = renderToStaticMarkup(<MapDrawToggle active={false} onToggle={noop} />);
    expect(on).toContain('#7c3aed');
    expect(on).not.toEqual(off);
  });

  it('לכפתור יש הסבר תפעולי (title) בשני המצבים', () => {
    expect(renderToStaticMarkup(<MapDrawToggle active onToggle={noop} />)).toContain('title="כבה ציור"');
    expect(renderToStaticMarkup(<MapDrawToggle active={false} onToggle={noop} />)).toContain('title="הפעל ציור על המפה"');
  });

  // אייקון בלבד נעלם בפאנל השכבות של עמדת השדה - שם הכפתור חייב כיתוב
  it('בגרסה עם כיתוב מופיע גם הטקסט, ולא רק האייקון', () => {
    const labeled = renderToStaticMarkup(<MapDrawToggle active={false} labeled onToggle={noop} />);
    expect(labeled).toContain('ציור');
    expect(labeled).toContain('✏');
    expect(renderToStaticMarkup(<MapDrawToggle active={false} onToggle={noop} />)).not.toContain('>ציור<');
  });
});
