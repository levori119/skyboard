import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Pattern3DControls from './Pattern3DControls';
import Pattern3DWindow from './Pattern3DWindow';
import Pattern3DSplitPane, { splitMapInset, splitPaneInset } from './Pattern3DSplitPane';
import { DEFAULT_PATTERN3D_PREFS, DOCKED_BAR_MAX_H, MIN_WIN_H, MIN_WIN_W } from './pattern3dPrefs';
import { DEFAULT_CAMERA } from '../../utils/pattern3d';
import { frameColor } from '../../utils/windowFrame';

// שלוש הדרכים להציג את אותה סצנה. מה שנבדק כאן הוא מה שהפקח **רואה ויכול
// ללחוץ עליו** - שאף פקד לא נעלם כשהסרגל עובר מהחלון הצף אל תוך חלון/חלונית,
// ושהמסגרות והמיקומים לוגיים (דו-לשוניות) ולא פיזיים.

const ctrlBase = {
  camera: DEFAULT_CAMERA,
  onChange: () => {},
  onRecenter: () => {},
  onClose: () => {},
  themeMode: 'dark' as const,
  mode: 'overlay' as const,
  onModeChange: () => {},
};

/** כל הפקדים שחייבים להתקיים בשני המיקומים. */
const EVERY_CONTROL = [
  'tilt-down', 'tilt-up', 'tilt-value', 'rot-left', 'rot-right', 'yaw-value',
  'zoom-in', 'zoom-out', 'recenter', 'north-arrow', 'close', 'p3d-mode-picker',
];

describe('פקדי התלת מימד - אותו רכיב, שני מיקומים', () => {
  it('צף: position:fixed, מסגרת תורכיז וידית גרירה משלו', () => {
    const m = renderToStaticMarkup(<Pattern3DControls {...ctrlBase} />);
    expect(m).toContain('data-placement="floating"');
    expect(m).toContain('position:fixed');
    expect(m).toContain(`solid ${frameColor('view', 'dark')}`);
    expect(m).toContain('data-drag-handle');
  });

  it('מעוגן: בלי position:fixed ובלי מסגרת משלו - המארח נושא אותן', () => {
    const m = renderToStaticMarkup(<Pattern3DControls {...ctrlBase} placement="docked" />);
    expect(m).toContain('data-placement="docked"');
    expect(m).not.toContain('position:fixed');
    // המסגרת התורכיז שייכת למארח; הסרגל מפריד את עצמו בקו תחתון בלבד
    expect(m).not.toContain(`2px solid ${frameColor('view', 'dark')}`);
  });

  it('מעוגן בלי מארח נגרר (חלונית פיצול) - אין ידית גרירה מתה', () => {
    const m = renderToStaticMarkup(<Pattern3DControls {...ctrlBase} placement="docked" />);
    expect(m).not.toContain('data-drag-handle');
  });

  it('מעוגן עם מארח נגרר (חלון צף) - ידית הגרירה של המארח מוצגת', () => {
    const m = renderToStaticMarkup(
      <Pattern3DControls {...ctrlBase} placement="docked" dragHandle={{ onPointerDown: () => {} }} />);
    expect(m).toContain('data-drag-handle');
  });

  it('**כל** פקד קיים בשני המיקומים - שום יכולת לא הולכת לאיבוד', () => {
    for (const placement of ['floating', 'docked'] as const) {
      const m = renderToStaticMarkup(<Pattern3DControls {...ctrlBase} placement={placement} />);
      for (const id of EVERY_CONTROL) {
        expect(m, `${id} חסר במיקום ${placement}`).toContain(`data-testid="${id}"`);
      }
    }
  });

  it('בסרגל המעוגן הרמז אינו גוזל שורה - הוא חי ב-tooltip', () => {
    const hint = 'גרירה = סיבוב';
    /** הרמז כ**טקסט מוצג** (בין תגים) - זה מה שתופס שורה. */
    const asVisibleText = (m: string) => new RegExp(`>[^<]*${hint}`).test(m);
    const floating = renderToStaticMarkup(<Pattern3DControls {...ctrlBase} />);
    const docked = renderToStaticMarkup(<Pattern3DControls {...ctrlBase} placement="docked" />);
    // בעמודה יש לו מקום, והוא נקרא במלואו
    expect(asVisibleText(floating)).toBe(true);
    // בסרגל הוא קיים - אבל כ-tooltip בלבד, ולא כשורה שגוזלת מהסצנה
    expect(asVisibleText(docked)).toBe(false);
    expect(docked).toContain(`title="${hint}`.slice(0, 12));
  });

  it('חץ הצפון בסרגל מוקטן לגובה פקד, ובעמודה נשאר גדול', () => {
    const floating = renderToStaticMarkup(<Pattern3DControls {...ctrlBase} />);
    const docked = renderToStaticMarkup(<Pattern3DControls {...ctrlBase} placement="docked" />);
    const heightOf = (m: string) => Number(
      m.match(/data-testid="north-arrow" width="(\d+)"/)?.[1] ?? NaN);
    expect(heightOf(floating)).toBe(50);
    expect(heightOf(docked)).toBeLessThanOrEqual(26);
    // ועדיין חץ מלא - כיוון וראש חץ, לא נקודה
    expect(docked).toContain('data-testid="north-arrow-head"');
  });

  it('בורר המצב מסמן את המצב הפעיל - גם במסגרת ובעובי, לא בצבע בלבד', () => {
    const m = renderToStaticMarkup(<Pattern3DControls {...ctrlBase} mode="split" />);
    expect(m).toContain('data-testid="p3d-mode-split" data-active="1"');
    expect(m).toContain('data-testid="p3d-mode-window" data-active="0"');
    expect(m).toContain('aria-pressed="true"');
    expect(m).toContain('font-weight:bold');
  });

  it('כיוון הפיצול מוצע רק כשיש פיצול לכוון', () => {
    const without = renderToStaticMarkup(<Pattern3DControls {...ctrlBase} placement="docked" />);
    expect(without).not.toContain('data-testid="p3d-split-orient"');
    const withSplit = renderToStaticMarkup(
      <Pattern3DControls {...ctrlBase} placement="docked" mode="split"
        split={{ orient: 'v', onOrientChange: () => {} }} />);
    expect(withSplit).toContain('data-testid="p3d-split-orient"');
    expect(withSplit).toContain('data-testid="p3d-split-v" data-active="1"');
    expect(withSplit).toContain('data-testid="p3d-split-h" data-active="0"');
  });
});

describe('חלון התלת מימד הצף', () => {
  const win = (over = {}) => renderToStaticMarkup(
    <Pattern3DWindow
      geom={DEFAULT_PATTERN3D_PREFS.win}
      onGeomChange={() => {}}
      themeMode="dark"
      bar={h => <Pattern3DControls {...ctrlBase} placement="docked" dragHandle={h} />}
      {...over}
    >
      <div data-testid="scene" />
    </Pattern3DWindow>,
  );

  it('חלון **צפייה ותפעול** - מסגרת תורכיז, לא צבע משלו', () => {
    expect(win()).toContain(`2px solid ${frameColor('view', 'dark')}`);
  });

  it('סרגל הבקרה יושב בתוכו, וכל פקדיו נגישים', () => {
    const m = win();
    expect(m).toContain('data-placement="docked"');
    for (const id of EVERY_CONTROL) expect(m).toContain(`data-testid="${id}"`);
    expect(m).toContain('data-testid="scene"');
  });

  it('ניתן להגדלה - ידית ⇲ בפינה ה-inline-end, שהיא הפינה שזזה בשתי השפות', () => {
    const m = win();
    expect(m).toContain('data-testid="pattern-3d-window-resize"');
    expect(m).toContain('inset-inline-end:0');
    // touch-action:none - בלעדיו אין pointermove באצבע כלל
    expect(m).toContain('touch-action:none');
  });

  it('מיקומו לוגי ולא פיזי - טרם הוזז נפתח בפינת inline-start', () => {
    const m = win();
    expect(m).toContain('inset-inline-start:28px');
    expect(m).not.toMatch(/style="[^"]*[;"]left:/);
  });

  it('אחרי הזזה והגדלה - הגאומטריה השמורה היא שמוצגת', () => {
    const m = win({ geom: { x: 120, y: 64, w: 640, h: 480 } });
    expect(m).toContain('inset-inline-start:120px');
    expect(m).toContain('top:64px');
    expect(m).toContain('width:640px');
    expect(m).toContain('height:480px');
  });

  /**
   * ⛔ המבחן שמונע נסיגה: **הנקודה של החלון היא הסצנה.**
   *
   * גרסה קודמת פרשה את עמודת הפקדים לרוחב, היא נשברה לשלוש שורות ובלעה שליש
   * מחלון 430x330 - ויותר ממחצית מהחלון המינימלי. שתי הטענות כאן ביחד קובעות
   * את החלוקה: לסרגל יש תקרה שהיא **מיעוט מוצהר**, ולסצנה יש `flex:1` שלוקח
   * את כל היתר. מי שיוסיף שורה לסרגל יישבר כאן ולא אצל הפקח.
   */
  it('גם בחלון המינימלי הסרגל הוא מיעוט - הרוב שייך לסצנה', () => {
    // התקרה עצמה: פחות ממחצית מהחלון הקטן ביותר שאפשר להגיע אליו
    expect(DOCKED_BAR_MAX_H * 2).toBeLessThan(MIN_WIN_H);

    const m = win({ geom: { x: null, y: null, w: MIN_WIN_W, h: MIN_WIN_H } });
    // הסרגל חסום בגובה - ולא ב-hidden, כדי שאף פקד לא יימחק
    expect(m).toContain(`max-height:${DOCKED_BAR_MAX_H}px`);
    expect(m).toContain('overflow-y:auto');
    // והסצנה לוקחת את כל מה שנשאר
    expect(m).toContain('data-testid="pattern-3d-body"');
    expect(m).toMatch(/data-testid="pattern-3d-body" style="flex:1;[^"]*min-height:0/);

    // הרוב בפועל: לכל היותר DOCKED_BAR_MAX_H לסרגל, השאר לסצנה
    const sceneMin = MIN_WIN_H - DOCKED_BAR_MAX_H;
    expect(sceneMin).toBeGreaterThan(MIN_WIN_H / 2);
  });
});

describe('חלונית הפיצול', () => {
  it('היסטי המפה והחלונית משלימים זה את זה בדיוק', () => {
    expect(splitMapInset(0.6, 'h')).toEqual({
      position: 'absolute', top: 0, bottom: 0, insetInlineStart: 0, insetInlineEnd: '40.000%',
    });
    expect(splitPaneInset(0.6, 'h')).toEqual({
      position: 'absolute', top: 0, bottom: 0, insetInlineEnd: 0, insetInlineStart: '60.000%',
    });
    expect(splitMapInset(0.25, 'v')).toEqual({
      position: 'absolute', insetInlineStart: 0, insetInlineEnd: 0, top: 0, bottom: '75.000%',
    });
    expect(splitPaneInset(0.25, 'v')).toEqual({
      position: 'absolute', insetInlineStart: 0, insetInlineEnd: 0, bottom: 0, top: '25.000%',
    });
  });

  it('יחס פגום או קיצוני אינו מעלים אף אחת מהתצוגות', () => {
    expect(splitPaneInset(5, 'h').insetInlineStart).toBe('80.000%');
    expect(splitPaneInset(-5, 'h').insetInlineStart).toBe('20.000%');
    expect(splitPaneInset(NaN, 'h').insetInlineStart)
      .toBe(`${(DEFAULT_PATTERN3D_PREFS.split.ratio * 100).toFixed(3)}%`);
  });

  const pane = (orient: 'h' | 'v') => renderToStaticMarkup(
    <Pattern3DSplitPane
      ratio={0.6} orient={orient} onRatioChange={() => {}}
      areaRef={{ current: null }} themeMode="dark"
      bar={<Pattern3DControls {...ctrlBase} placement="docked" mode="split" />}
    >
      <div data-testid="scene" />
    </Pattern3DSplitPane>,
  );

  it('הספליטר הוא ידית מגע אמיתית - touch-action:none ותפקיד נגיש', () => {
    const m = pane('h');
    expect(m).toContain('data-testid="pattern-3d-splitter"');
    expect(m).toContain('role="separator"');
    expect(m).toContain('aria-orientation="vertical"');
    expect(m).toContain('touch-action:none');
    expect(m).toContain('cursor:col-resize');
  });

  it('פיצול אנכי (זה מעל זה) נתמך גם הוא', () => {
    const m = pane('v');
    expect(m).toContain('data-orient="v"');
    expect(m).toContain('aria-orientation="horizontal"');
    expect(m).toContain('cursor:row-resize');
  });

  it('החלונית נושאת את הסרגל ואת הסצנה, ויושבת מתחת לפאנלי המפה', () => {
    const m = pane('h');
    expect(m).toContain('data-placement="docked"');
    expect(m).toContain('data-testid="scene"');
    // z=20 כמו הסצנה במצב המלא: פאנל השכבות (z=30) נשאר לחיץ מעליה
    expect(m).toContain('z-index:20');
  });

  it('גם בפיצול אנכי, שבו החלונית נמוכה, הסרגל חסום והסצנה מקבלת את היתר', () => {
    const m = pane('v');
    expect(m).toContain(`max-height:${DOCKED_BAR_MAX_H}px`);
    expect(m).toMatch(/data-testid="pattern-3d-body" style="flex:1;[^"]*min-height:0/);
  });
});
