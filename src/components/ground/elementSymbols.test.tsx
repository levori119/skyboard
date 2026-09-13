// סמלי האלמנטים - מקור אמת יחיד לאפליקציה הראשית ולאפליקציית הנהג.
//
// אפליקציית הנהג אינה React, ולכן הסמלים יושבים ב-shared/elementSymbols.js
// כמחרוזות SVG, ו-renderGroundSvgIcon מרנדר את אותו גוף. הבדיקה כאן מקבעת
// שהסמל של React **זהה תו בתו** לסמל המשותף בכל מפתח ובכל מצב - כלומר שמפת
// המגדל ומפת הנהג לא יכולות להיפרד. (אין jsdom: renderToStaticMarkup.)
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderGroundSvgIcon, GROUND_SVG_ICON_KEYS } from './groundShared';
import {
  groundSvgIconBody, elementSymbolKey, elementStateColor, elementMarkerSvg, isElementBroken, ELEMENT_BLINK_CSS,
} from '../../../shared/elementSymbols';

const STATES: [string | undefined, string | undefined][] = [
  [undefined, undefined], [undefined, 'normal'], [undefined, 'blink'], [undefined, 'off'], [undefined, 'open'],
  [undefined, 'close'], [undefined, 'stop'], [undefined, 'go'], ['מנצנץ', undefined], ['פתוח', undefined], ['שמיש', 'blink'],
];

describe('הסמל של React זהה לסמל המשותף', () => {
  for (const { key } of GROUND_SVG_ICON_KEYS) {
    it(key, () => {
      for (const [status, ds] of STATES) {
        const react = renderToStaticMarkup(renderGroundSvgIcon(key, 26, status, ds)!);
        const shared = `<svg width="26" height="26" viewBox="0 0 24 24" style="display:block">${groundSvgIconBody(key, status, ds)}</svg>`;
        expect(react, `${key} status=${status} ds=${ds}`).toBe(shared);
      }
    });
  }

  it('מפתח לא מוכר - אין סמל בשני המקומות', () => {
    expect(renderGroundSvgIcon('MAP:nope', 26)).toBeNull();
    expect(groundSvgIconBody('MAP:nope')).toBe('');
  });

  it('הבהוב: הנורות מקבלות elem-blink, וכבוי מבטל אותו', () => {
    expect(groundSvgIconBody('MAP:traffic-red', undefined, 'blink')).toContain('class="elem-blink"');
    expect(groundSvgIconBody('MAP:traffic-red', undefined, 'off')).not.toContain('elem-blink');
    expect(ELEMENT_BLINK_CSS).toContain('.elem-blink{animation:elemBlink');
  });
});

describe('elementSymbolKey - איזה סמל לאלמנט עכשיו', () => {
  it('רמזור רב-נורות: עצור -> אדום, עבור -> ירוק', () => {
    expect(elementSymbolKey({ type_icon: 'MAP:traffic-orange', display_state: 'stop' })).toBe('MAP:traffic-red');
    expect(elementSymbolKey({ type_icon: 'MAP:traffic-orange', display_state: 'go' })).toBe('MAP:traffic-green');
    expect(elementSymbolKey({ type_icon: 'MAP:traffic-orange', display_state: 'blink' })).toBe('MAP:traffic-orange');
  });

  it('סגור/פתוח: סמל האלמנט, אחרת של הסוג, אחרת הבסיס', () => {
    expect(elementSymbolKey({ type_icon: 'MAP:barrier', display_state: 'open', type_open_icon: 'MAP:barrier-open' })).toBe('MAP:barrier-open');
    expect(elementSymbolKey({ type_icon: 'MAP:barrier', display_state: 'close', close_icon_key: 'MAP:stopbar', type_close_icon: 'MAP:x' })).toBe('MAP:stopbar');
    expect(elementSymbolKey({ type_icon: 'MAP:barrier', display_state: 'close' })).toBe('MAP:barrier');
  });

  it('סמל לכשירות (status_icons של הסוג) - גם כמחרוזת JSON', () => {
    expect(elementSymbolKey({ type_icon: 'MAP:barrier', status: 'פתוח', type_status_icons: '{"פתוח":"MAP:barrier-open"}' })).toBe('MAP:barrier-open');
    expect(elementSymbolKey({ type_icon: 'MAP:barrier', status: 'פתוח', type_status_icons: { 'פתוח': '🟢' } })).toBe('MAP:barrier');
  });
});

describe('elementMarkerSvg - הסמל השלם לאפליקציית הנהג', () => {
  it('סמל SVG: מסגרת בצבע המצב, הגוף המשותף וסיבוב', () => {
    const el = { type_icon: 'MAP:traffic-red', display_state: 'stop', rotation: 90, status: 'שמיש' };
    const svg = elementMarkerSvg(el, 30);
    expect(elementStateColor(el)).toBe('#ef4444');
    expect(svg).toContain('stroke="#ef4444"');
    expect(svg).toContain(groundSvgIconBody('MAP:traffic-red', 'שמיש', 'stop'));
    expect(svg).toContain('rotate(90 13 13)');
    expect(svg).toContain('width="30"');
  });

  it('מהבהב: האנימציה מוטמעת בסמל - כדי שתעבוד גם כתמונה במפת Google', () => {
    const svg = elementMarkerSvg({ type_icon: 'MAP:stopbar', display_state: 'blink' });
    expect(svg).toContain('class="elem-blink"');
    expect(svg).toContain('<style>');
  });

  it('לא כשיר - X אדום', () => {
    expect(isElementBroken({ status: 'לא שמיש' })).toBe(true);
    const svg = elementMarkerSvg({ type_icon: 'MAP:barrier', status: 'לא שמיש' });
    expect(svg).toContain('class="el-broken"');
    expect(svg).toContain('stroke="#ef4444"');
    expect(elementMarkerSvg({ type_icon: 'MAP:barrier', status: 'שמיש' })).not.toContain('el-broken');
  });

  it('סוג עם אימוג\'י - עיגול עם האימוג\'י, מהבהב כולו', () => {
    const svg = elementMarkerSvg({ type_icon: '🚧', display_state: 'blink', status: 'שמיש' });
    expect(svg).toContain('🚧');
    expect(svg).toContain('class="af-elem-blink"');
  });

  it('שם אלמנט או אימוג\'י עם תווי HTML - מוברחים', () => {
    expect(elementMarkerSvg({ type_icon: '<b>' })).not.toContain('<b>');
  });
});
