// סמלי אלמנטי השדה (מחסום, רמזורים, STOP BAR, רכבי שדה) - **מקור אמת יחיד**.
//
// שני צרכנים שחייבים להיראות זהה:
//   האפליקציה הראשית - renderGroundSvgIcon (src/components/ground/groundShared.tsx)
//   אפליקציית הנהג   - מפת השדה ומפת Google במסך הנסיעה (public/driver.html)
//
// אפליקציית הנהג היא HTML סטטי בלי React, ולכן הסמלים כאן כמחרוזות SVG. React
// מקבל את אותו גוף SVG, וכך סמל שמשתנה כאן משתנה בשני המקומות. ES module בלי
// תלויות: נטען ב-Vite, ב-vitest ובדף הנהג (/driver/symbols.js).

const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** תגית SVG. מאפיינים בסדר שנמסרו; undefined/null מדולג - כמו React. */
const h = (tag, attrs, children = '') => {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  return `<${tag}${a}>${children}</${tag}>`;
};

/**
 * גוף הסמל (בלי תגית ה-svg החיצונית), או '' לסמל לא מוכר.
 * `status` / `displayState` - בדיוק כמו ב-renderGroundSvgIcon: מהבהב, פתוח, כבוי.
 */
export function groundSvgIconBody(iconKey, status, displayState) {
  const isBlinking = displayState === 'blink' || (!displayState && status === 'מנצנץ');
  const isOpen = displayState === 'open' || (!displayState && status === 'פתוח');
  const isOff = displayState === 'off';
  const blink = isBlinking && !isOff ? 'elem-blink' : undefined;
  const barrierOpen = () =>
    h('rect', { x: '1', y: '5', width: '2.5', height: '15', rx: '1', fill: '#555' }) +
    h('g', { transform: 'rotate(-70, 2.25, 12.5)' },
      h('rect', { x: '2.25', y: '10.5', width: '19', height: '4', rx: '1', fill: 'white', stroke: '#888', 'stroke-width': '0.4' }) +
      h('rect', { x: '2.25', y: '10.5', width: '3.5', height: '4', fill: '#22c55e' }) +
      h('rect', { x: '9', y: '10.5', width: '3.5', height: '4', fill: '#22c55e' }) +
      h('rect', { x: '15.7', y: '10.5', width: '3.5', height: '4', fill: '#22c55e' })) +
    h('rect', { x: '20.5', y: '17', width: '2.5', height: '4', rx: '1', fill: '#444' });
  const wheels = (y, x2) =>
    h('circle', { cx: '5', cy: y, r: '2.5', fill: '#333' }) + h('circle', { cx: '5', cy: y, r: '1', fill: '#888' }) +
    h('circle', { cx: x2, cy: y, r: '2.5', fill: '#333' }) + h('circle', { cx: x2, cy: y, r: '1', fill: '#888' });

  switch (iconKey) {
    case 'MAP:barrier':
      if (isOpen) return barrierOpen();
      return h('rect', { x: '2', y: '10.5', width: '20', height: '4', rx: '1', fill: 'white', stroke: '#888', 'stroke-width': '0.4' }) +
        h('rect', { x: '2', y: '10.5', width: '3.5', height: '4', fill: '#ef4444' }) +
        h('rect', { x: '9', y: '10.5', width: '3.5', height: '4', fill: '#ef4444' }) +
        h('rect', { x: '16', y: '10.5', width: '3.5', height: '4', fill: '#ef4444' }) +
        h('rect', { x: '1', y: '7', width: '2.5', height: '10', rx: '1', fill: '#555' }) +
        h('rect', { x: '20.5', y: '7', width: '2.5', height: '10', rx: '1', fill: '#555' });
    case 'MAP:barrier-open':
      return barrierOpen();
    case 'MAP:traffic-red-single':
    case 'MAP:traffic-orange-single':
      return h('rect', { x: '7', y: '5', width: '10', height: '13', rx: '3', fill: '#1e293b', stroke: '#555', 'stroke-width': '0.5' }) +
        h('circle', {
          cx: '12', cy: '11.5', r: '4',
          fill: isOff ? '#1e293b' : (iconKey === 'MAP:traffic-red-single' ? '#ef4444' : '#f97316'),
          stroke: isOff ? '#555' : 'none', 'stroke-width': isOff ? '0.8' : '0', class: blink,
        }) +
        h('rect', { x: '11', y: '18', width: '2', height: '4', fill: '#555' });
    case 'MAP:stopbar':
      return h('text', { x: '12', y: '8', 'text-anchor': 'middle', 'font-size': '4.5', fill: isOff ? '#475569' : '#ef4444', 'font-family': 'monospace', 'font-weight': 'bold' }, 'STOP BAR') +
        h('rect', { x: '1', y: '11', width: '22', height: '5', rx: '1', fill: '#1e293b', stroke: '#555', 'stroke-width': '0.4' }) +
        ['3.2', '7.4', '11.6', '15.8', '20.0'].map(cx =>
          h('circle', { cx, cy: '13.5', r: '1.6', fill: isOff ? '#334155' : '#ef4444', class: blink })).join('');
    case 'MAP:traffic-red':
    case 'MAP:traffic-orange':
    case 'MAP:traffic-green': {
      const lit = { 'MAP:traffic-red': 0, 'MAP:traffic-orange': 1, 'MAP:traffic-green': 2 }[iconKey];
      const dark = ['#2d1515', iconKey === 'MAP:traffic-green' ? '#2d1c09' : '#2d1515', '#14260e'];
      const on = ['#ef4444', '#f97316', '#22c55e'];
      const offLit = ['#1a1212', '#1a1000', '#0a160a'];
      const lamp = (i, cy) => (i === lit
        ? h('circle', { cx: '12', cy, r: '2.5', fill: isOff ? offLit[i] : on[i], class: blink })
        : h('circle', { cx: '12', cy, r: '2.5', fill: dark[i] }));
      return h('rect', { x: '8', y: '2', width: '8', height: '20', rx: '3', fill: '#1e293b', stroke: '#555', 'stroke-width': '0.5' }) +
        lamp(0, '7') + lamp(1, '12') + lamp(2, '17') +
        h('rect', { x: '11', y: '22', width: '2', height: '2', fill: '#555' });
    }
    case 'MAP:sweeper':
      return h('rect', { x: '2', y: '9', width: '14', height: '8', rx: '2', fill: '#f59e0b' }) +
        h('rect', { x: '14', y: '11', width: '6', height: '4', rx: '1', fill: '#f59e0b' }) +
        h('rect', { x: '14', y: '9', width: '5', height: '3', rx: '1', fill: '#fcd34d' }) +
        h('circle', { cx: '5', cy: '19', r: '2.5', fill: '#333' }) + h('circle', { cx: '5', cy: '19', r: '1', fill: '#888' }) +
        h('circle', { cx: '14', cy: '19', r: '2.5', fill: '#333' }) + h('circle', { cx: '14', cy: '19', r: '1', fill: '#888' }) +
        h('circle', { cx: '4', cy: '14', r: '3', fill: 'none', stroke: '#f97316', 'stroke-width': '1.5' }) +
        h('line', { x1: '4', y1: '11', x2: '4', y2: '17', stroke: '#f97316', 'stroke-width': '1' }) +
        h('line', { x1: '1', y1: '14', x2: '7', y2: '14', stroke: '#f97316', 'stroke-width': '1' });
    case 'MAP:firetruck':
      return h('rect', { x: '1', y: '10', width: '18', height: '8', rx: '2', fill: '#ef4444' }) +
        h('rect', { x: '16', y: '7', width: '6', height: '5', rx: '1', fill: '#ef4444' }) +
        h('rect', { x: '16.5', y: '7.5', width: '4.5', height: '2.5', rx: '0.5', fill: '#93c5fd' }) +
        h('line', { x1: '3', y1: '10', x2: '15', y2: '10', stroke: '#fca5a5', 'stroke-width': '1' }) +
        h('line', { x1: '3', y1: '8', x2: '15', y2: '8', stroke: '#fca5a5', 'stroke-width': '1' }) +
        h('line', { x1: '3', y1: '6', x2: '15', y2: '6', stroke: '#fca5a5', 'stroke-width': '1' }) +
        wheels('20', '16');
    case 'MAP:birdcar':
      return h('rect', { x: '1', y: '12', width: '18', height: '7', rx: '2', fill: '#64748b' }) +
        h('rect', { x: '13', y: '8', width: '6', height: '5', rx: '1', fill: '#64748b' }) +
        h('rect', { x: '13.5', y: '8.5', width: '5', height: '3', rx: '0.5', fill: '#93c5fd' }) +
        wheels('21', '15') +
        h('path', { d: 'M5,9 C5,7 7,6 9,7 C8,5 10,4 12,5 C11,3 14,3 14,5 L12,8 L9,9 Z', fill: '#cbd5e1' }) +
        h('circle', { cx: '13', cy: '5', r: '1', fill: '#1e293b' });
    case 'MAP:opsvehicle':
      return h('rect', { x: '1', y: '11', width: '18', height: '8', rx: '2', fill: '#16a34a' }) +
        h('rect', { x: '13', y: '7', width: '6', height: '5', rx: '1', fill: '#16a34a' }) +
        h('rect', { x: '13.5', y: '7.5', width: '5', height: '3', rx: '0.5', fill: '#86efac' }) +
        h('rect', { x: '2', y: '12', width: '5', height: '5', fill: '#15803d' }) +
        wheels('21', '16') +
        h('rect', { x: '3', y: '8', width: '8', height: '3', rx: '1', fill: '#4ade80', opacity: '0.7' });
    default:
      return '';
  }
}

/** אנימציית ההבהוב - אותן הגדרות כמו ב-App.css. מוטמעת בסמל שנטען כתמונה (מפת Google). */
export const ELEMENT_BLINK_CSS =
  '@keyframes elemBlink{0%,100%{opacity:1}50%{opacity:.08}}.elem-blink{animation:elemBlink .75s ease-in-out infinite}' +
  '@keyframes af-elem-blink{0%,49%{opacity:1}50%,100%{opacity:.18}}.af-elem-blink{animation:af-elem-blink 1s step-end infinite}';

// ── הסמל של אלמנט מסוים ──────────────────────────────────────────────────────

const TRAFFIC_MULTI = ['MAP:traffic-red', 'MAP:traffic-orange', 'MAP:traffic-green'];

const parseObj = v => {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return p && typeof p === 'object' && !Array.isArray(p) ? p : null; } catch { return null; } }
  return null;
};

/**
 * איזה סמל מציגים לאלמנט עכשיו - הכלל של מפת המגדל:
 * סגור -> סמל הסגירה (של האלמנט, אחרת של הסוג); פתוח -> סמל הפתיחה; אחרת סמל
 * שהוגדר לכשירות הנוכחית, ואחרת סמל הסוג. רמזור רב-נורות עובר לאדום/ירוק
 * במצב עצור/עבור.
 */
export function elementSymbolKey(el) {
  const dState = el?.display_state || 'normal';
  const base = el?.type_icon || '';
  const effective = TRAFFIC_MULTI.includes(base)
    ? (dState === 'stop' ? 'MAP:traffic-red' : dState === 'go' ? 'MAP:traffic-green' : base)
    : base;
  const statusIcon = el?.status ? (parseObj(el?.type_status_icons) || {})[el.status] : null;
  const statusMapIcon = typeof statusIcon === 'string' && statusIcon.startsWith('MAP:') ? statusIcon : null;
  if (dState === 'close') return el?.close_icon_key || el?.type_close_icon || effective;
  if (dState === 'open') return el?.open_icon_key || el?.type_open_icon || effective;
  return statusMapIcon || effective;
}

/** צבעי הכשירות והמצב התפעולי - כמו במפת המגדל */
const SERVICE_COLORS = { 'תקין': '#22c55e', 'לא תקין': '#ef4444', 'חלקי': '#f97316', 'שמיש': '#22c55e', 'תקול': '#ef4444', 'לא שמיש': '#ef4444' };
const OP_COLORS = { 'דולק': '#22c55e', 'כבוי': '#64748b', 'מנצנץ': '#f59e0b', 'נוסע': '#3b82f6', 'עומד': '#a855f7', 'פתוח': '#22c55e', 'סגור': '#ef4444' };

/**
 * צבע המסגרת של סמל SVG לפי המצב התפעולי - סגור/עצור אדום, פתוח/עבור ירוק,
 * כבוי אפור, ואחרת צבע הסטטוס.
 */
export function elementStateColor(el) {
  const dState = el?.display_state || 'normal';
  if (dState === 'close' || dState === 'stop') return '#ef4444';
  if (dState === 'off') return '#475569';
  if (dState === 'go' || dState === 'open') return '#22c55e';
  return OP_COLORS[el?.status] || SERVICE_COLORS[el?.status] || '#94a3b8';
}

/** אלמנט שאינו כשיר - מסומן ב-X אדום על הסמל */
export const isElementBroken = el => el?.status === 'לא תקין' || el?.status === 'לא שמיש';

/**
 * סמל אלמנט שלם כ-SVG עצמאי: מסגרת בצבע המצב, סיבוב, הבהוב ו-X לאלמנט לא כשיר.
 * לאפליקציית הנהג - אותו מראה כמו במפת המגדל, גם כתמונה (מפת Google) וגם מוטמע.
 * סוג בלי סמל SVG (אימוג'י) - עיגול עם האימוג'י, כמו במגדל.
 */
export function elementMarkerSvg(el, size = 30) {
  const dState = el?.display_state || 'normal';
  const isBlinking = dState === 'blink';
  const isOff = dState === 'off';
  const color = elementStateColor(el);
  const rotation = Number(el?.rotation) || 0;
  const broken = isElementBroken(el);
  const key = elementSymbolKey(el);
  const body = typeof key === 'string' && key.startsWith('MAP:') ? groundSvgIconBody(key, el?.status, dState) : '';
  const style = h('style', {}, ELEMENT_BLINK_CSS);
  let inner;
  if (body) {
    // 28 מתוך 32: המסגרת של המגדל (outline 2px סביב קופסה של 28px)
    inner = h('rect', { x: '1', y: '1', width: '30', height: '30', rx: '5', fill: `${color}22`, stroke: color, 'stroke-width': '2' }) +
      h('g', { transform: `translate(3 3) rotate(${rotation} 13 13)` },
        h('svg', { width: '26', height: '26', viewBox: '0 0 24 24' }, body));
  } else {
    const glyph = isOff ? '○' : (broken ? '' : String(el?.type_icon || '🔧'));
    inner = h('g', { class: isBlinking ? 'af-elem-blink' : undefined, opacity: isOff ? '0.5' : undefined },
      h('circle', { cx: '16', cy: '16', r: '12', fill: broken ? '#ef4444' : '#1e293b', stroke: broken ? '#ef4444' : color, 'stroke-width': '3' }) +
      h('text', { x: '16', y: '16', 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': '13', transform: rotation ? `rotate(${rotation} 16 16)` : undefined }, esc(glyph)));
  }
  if (broken) {
    // קווים ולא התו ✕: בטלפון הגופן מצייר את התו בצבע משלו, וה-X יצא שחור
    const x = (stroke, w) =>
      h('line', { x1: '8', y1: '8', x2: '24', y2: '24', stroke, 'stroke-width': w, 'stroke-linecap': 'round' }) +
      h('line', { x1: '24', y1: '8', x2: '8', y2: '24', stroke, 'stroke-width': w, 'stroke-linecap': 'round' });
    inner += h('g', { class: 'el-broken' }, x('#000', '5.5') + x('#ef4444', '3'));
  }
  return h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: size, height: size, viewBox: '0 0 32 32' }, style + inner);
}
