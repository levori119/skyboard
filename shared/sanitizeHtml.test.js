// בדיקות לסניטציה המשותפת (SK-03, SK-44). הבדיקות כתובות כמו וקטורי תקיפה
// ולא כמו "בדיקת תקינות": כל מקרה כאן הוא ניצול שהיה עובד לפני התיקון.
import { describe, it, expect } from 'vitest';
import { sanitizeRichText, sanitizeSvgBody, sanitizeStyle, stripTags } from './sanitizeHtml.js';

describe('SK-03 - תוכן בד"ח', () => {
  it('חוסם את הווקטור המדויק מהסקר', () => {
    const out = sanitizeRichText('<img src=x onerror="fetch(\'//evil\')">');
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/<img/i);
  });

  it('מסיר script יחד עם הגוף שלו, ולא משאיר את הקוד כטקסט', () => {
    const out = sanitizeRichText('לפני<script>alert(1)</script>אחרי');
    expect(out).not.toMatch(/alert/);
    expect(out).toBe('לפניאחרי');
  });

  it('חוסם iframe, object, embed ו-svg מוטבע', () => {
    for (const bad of [
      '<iframe src="//evil"></iframe>',
      '<object data="//evil"></object>',
      '<embed src="//evil">',
      '<svg onload="alert(1)"><script>alert(2)</script></svg>',
    ]) {
      const out = sanitizeRichText(bad);
      expect(out).not.toMatch(/iframe|object|embed|onload|alert/i);
    }
  });

  it('חוסם כל מאפיין on* גם על תגית מותרת', () => {
    const out = sanitizeRichText('<b onclick="x()" onmouseover="y()">טקסט</b>');
    expect(out).toBe('<b>טקסט</b>');
  });

  it('חוסם javascript: ו-url() בתוך style', () => {
    expect(sanitizeRichText('<span style="background-color: url(javascript:alert(1))">א</span>'))
      .toBe('<span>א</span>');
    expect(sanitizeStyle('background-color: url(//evil/x.png)')).toBe('');
    expect(sanitizeStyle('color: expression(alert(1))')).toBe('');
  });

  it('חוסם הערות HTML שמסתירות וקטורים', () => {
    expect(sanitizeRichText('<!--[if IE]><script>x</script><![endif]-->טקסט')).toBe('טקסט');
  });

  it('שומר על העיצוב שהמשתמש באמת צריך', () => {
    expect(sanitizeRichText('<b>מודגש</b> ו<i>נטוי</i>')).toBe('<b>מודגש</b> ו<i>נטוי</i>');
    expect(sanitizeRichText('<span style="color: #ff0000">אדום</span>'))
      .toBe('<span style="color: #ff0000">אדום</span>');
    expect(sanitizeRichText('שורה<br>שנייה')).toBe('שורה<br>שנייה');
    expect(sanitizeRichText('<u>קו</u> <s>מחוק</s>')).toBe('<u>קו</u> <s>מחוק</s>');
  });

  it('סוגר תגיות פתוחות ולא פולט HTML שבור', () => {
    expect(sanitizeRichText('<b>לא נסגר')).toBe('<b>לא נסגר</b>');
    expect(sanitizeRichText('</b>סגירה ללא פתיחה')).toBe('סגירה ללא פתיחה');
  });

  it('מסמן טקסט חופשי כתוכן ולא כתגית', () => {
    expect(sanitizeRichText('גובה < 5000 ו > 3000')).toBe('גובה &lt; 5000 ו &gt; 3000');
  });

  it('קלט ריק / null מוחזר כמחרוזת ריקה', () => {
    for (const v of [null, undefined, '']) expect(sanitizeRichText(v)).toBe('');
    // 0 הוא תוכן לגיטימי ולא "ריק" - פריט בד"ח יכול להיות הספרה 0
    expect(sanitizeRichText(0)).toBe('0');
  });

  it('אינו מכפיל escaping בהרצה חוזרת (הסניטציה idempotent על טקסט נקי)', () => {
    const once = sanitizeRichText('<b>נקי</b>');
    expect(sanitizeRichText(once)).toBe(once);
  });
});

describe('SK-44 - אייקון SVG', () => {
  it('שומר צורות לגיטימיות', () => {
    const svg = '<path d="M4 4 L20 20" stroke-width="2"/><circle cx="12" cy="12" r="6"/>';
    const out = sanitizeSvgBody(svg);
    expect(out).toMatch(/<path d="M4 4 L20 20"/);
    expect(out).toMatch(/<circle cx="12"/);
  });

  it('חוסם script ו-on* בתוך גוף ה-SVG', () => {
    expect(sanitizeSvgBody('<path d="M0 0" onload="alert(1)"/>')).not.toMatch(/onload|alert/i);
    expect(sanitizeSvgBody('<script>alert(1)</script><path d="M0 0"/>')).not.toMatch(/alert/);
    expect(sanitizeSvgBody('<foreignObject><img src=x onerror=alert(1)></foreignObject>')).not.toMatch(/onerror|img/i);
  });

  it('חוסם animate/set שמריצים דרך attributeName', () => {
    expect(sanitizeSvgBody('<set attributeName="onload" to="alert(1)"/>')).not.toMatch(/onload|alert/i);
  });
});

describe('stripTags', () => {
  it('מסיר כל תגית ומשאיר טקסט', () => {
    expect(stripTags('<b>שלום</b> <i>עולם</i>')).toBe('שלום עולם');
  });
});
