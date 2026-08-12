// סניטציית HTML - ממצאי אבטחה SK-03 (בד"ח) ו-SK-44 (אייקון SVG).
//
// למה כאן ולא בשרת או בלקוח בלבד: **שתי השכבות חייבות את אותו כלל**. סניטציה
// בכתיבה בלבד לא מגנה על מה שכבר יושב ב-DB; סניטציה ברינדור בלבד מסתמכת על כך
// שאף לקוח אחר לא יגיע לנתון. הקובץ הזה הוא מקור אמת אחד לשתיהן - עקרון הרכיב
// המשותף (CLAUDE.md): אותו כלל, שני מקומות, בלי שכפול.
//
// למה לא DOMPurify: המערכת נפרסת לרשת מבודדת, וכל תלות נוספת היא נטל בשרשרת
// האספקה (SK-30). התוכן כאן אינו HTML חופשי אלא **עיצוב טקסט של פריט בד"ח**
// ו**נתיב SVG של אייקון** - שתי שפות קטנות וסגורות, שרשימת היתר מכסה במלואן.
//
// הגישה היא allow-list ולא deny-list: כל מה שלא נכתב במפורש נמחק. רשימת חסימה
// היא מרוץ אינסופי מול וקטורים חדשים; רשימת היתר נכשלת לכיוון הבטוח.

/** תגי עיצוב טקסט המותרים בתוכן בד"ח. אין <a>, אין <img>, אין <script>. */
const TEXT_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup',
  'br', 'p', 'div', 'span', 'ul', 'ol', 'li', 'mark', 'small',
]);

/** תגי SVG המותרים בתוך אייקון סוג אלמנט (SK-44). */
const SVG_TAGS = new Set([
  'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'g', 'defs', 'title',
]);

/**
 * מאפיינים מותרים. `style` מותר אך מסונן בנפרד (ראה sanitizeStyle) - הוא
 * הדרך שבה המשתמש צובע פריט בד"ח, ולכן אי אפשר פשוט למחוק אותו.
 */
const TEXT_ATTRS = new Set(['style', 'dir', 'class']);
const SVG_ATTRS = new Set([
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'width', 'height', 'points', 'transform', 'fill', 'stroke',
  'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-rule', 'clip-rule',
]);

/** מאפייני CSS מותרים ב-style. אין url(), אין position, אין behavior. */
const STYLE_PROPS = new Set([
  'color', 'background-color', 'font-weight', 'font-style', 'font-size',
  'text-decoration', 'text-align', 'direction',
]);

/**
 * ערך CSS בטוח: אותיות, ספרות, רווח, #, %, נקודה, פסיק, סוגריים של rgb/rgba
 * ומקף. במפורש **בלי** url(, expression(, javascript: ו-\ (בריחת יוניקוד).
 */
const SAFE_STYLE_VALUE = /^[a-zA-Z0-9#%.,()\s-]+$/;
const FORBIDDEN_IN_VALUE = /url\s*\(|expression\s*\(|javascript:|@import|\\/i;

/** מסנן מחרוזת style למאפיינים ולערכים המותרים בלבד. */
export function sanitizeStyle(style) {
  const out = [];
  for (const decl of String(style || '').split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (!STYLE_PROPS.has(prop)) continue;
    if (!value || value.length > 64) continue;
    if (FORBIDDEN_IN_VALUE.test(value) || !SAFE_STYLE_VALUE.test(value)) continue;
    out.push(`${prop}: ${value}`);
  }
  return out.join('; ');
}

const escapeText = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/** מפרק את מאפייני התגית ומחזיר רק את המותרים, עם ערכים בטוחים. */
function sanitizeAttrs(raw, allowed) {
  const out = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[3] ?? m[4] ?? m[5] ?? '';
    // כל on* נחסם תמיד. זה הווקטור של SK-03 (<img src=x onerror=...>),
    // וגם אילו הוא היה ברשימת ההיתר - הבדיקה הזו קודמת לה.
    if (name.startsWith('on') || !allowed.has(name)) continue;
    if (name === 'style') {
      const safe = sanitizeStyle(value);
      if (safe) out.push(`style="${safe.replace(/"/g, '')}"`);
      continue;
    }
    if (FORBIDDEN_IN_VALUE.test(value)) continue;
    // ערך ארוך חריג אינו עיצוב טקסט - הוא ניסיון הזרקה או נתון פגום
    if (value.length > 512) continue;
    out.push(`${name}="${value.replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`);
  }
  return out.length ? ' ' + out.join(' ') : '';
}

function sanitize(html, tags, attrs) {
  const input = String(html ?? '');
  if (!input) return '';

  // תוכן של script/style/iframe נמחק **יחד עם הגוף שלו**: מחיקת התגית בלבד
  // הייתה משאירה את הקוד כטקסט, וסינק אחר עלול לרנדר אותו שוב.
  let s = input.replace(/<(script|style|iframe|object|embed|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '');
  s = s.replace(/<\/?(script|style|iframe|object|embed|math)\b[^>]*>/gi, '');
  // הערות HTML מסתירות וקטורים ישנים (conditional comments) ואינן נחוצות כאן
  s = s.replace(/<!--[\s\S]*?-->/g, '');

  const open = [];
  let out = '';
  let last = 0;
  const tagRe = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)\/?\s*>/g;
  let m;

  while ((m = tagRe.exec(s)) !== null) {
    out += escapeText(s.slice(last, m.index));
    last = tagRe.lastIndex;

    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    if (!tags.has(name)) continue; // תגית לא מוכרת - נמחקת, התוכן שלה נשאר כטקסט

    if (closing) {
      const at = open.lastIndexOf(name);
      if (at < 0) continue; // סגירה ללא פתיחה - מתעלמים
      // סוגרים גם כל מה שנשאר פתוח מעליה, כדי לא לפלוט HTML שבור
      while (open.length > at) out += `</${open.pop()}>`;
      continue;
    }

    if (name === 'br') { out += '<br>'; continue; }
    out += `<${name}${sanitizeAttrs(m[3] || '', attrs)}>`;
    open.push(name);
  }

  out += escapeText(s.slice(last));
  while (open.length) out += `</${open.pop()}>`;
  return out;
}

/**
 * תוכן עשיר של פריט/כותרת בד"ח. מותר: עיצוב טקסט וצבע. אסור: כל דבר שמריץ קוד.
 * @param {unknown} html
 * @returns {string}
 */
export function sanitizeRichText(html) {
  return sanitize(html, TEXT_TAGS, TEXT_ATTRS);
}

/**
 * גוף אייקון SVG (SK-44). מקבל את מה שיושב אחרי הקידומת `svg:` בשדה
 * `airfield_element_types.icon`, ומחזיר צורות בלבד.
 * @param {unknown} svg
 * @returns {string}
 */
export function sanitizeSvgBody(svg) {
  return sanitize(svg, SVG_TAGS, SVG_ATTRS);
}

/** נוח לשדות שאמורים להיות טקסט נקי - מסיר כל תגית. */
export function stripTags(html) {
  return sanitize(html, new Set(), new Set());
}
