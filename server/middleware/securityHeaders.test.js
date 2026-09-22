// בדיקות ה-CSP. הטסט הזה נכתב אחרי תקלת פרודקשן (2026-08-04) שבה מדיניות של
// `default-src 'self'` בלבד הפילה ארבעה חלקים במערכת בבת אחת - בלי שאף בדיקה
// תיפול, כי ב-dev הלקוח מוגש מ-vite ואינו עובר כאן כלל.
//
// לכן כל assertion כאן קשור ליכולת מוצר קיימת, לא ל"נוסח נכון" של הכותרת:
// מפה שנשמרת כ-data URL, keyframes ב-<style>, עמדה נצפית ב-iframe, ובילד
// שאין בו סקריפט מוטבע. מי שמצמצם הנחיה - יראה כאן איזה מסך הוא מכבה.
import { describe, it, expect } from 'vitest';
import { securityHeaders, DRIVER_CSP, LIVE_MAP_CSP, CSP } from './securityHeaders.js';

const headers = ({ secure = false, proto = 'http' } = {}) => {
  const set = {};
  const req = { secure, get: (h) => (h === 'X-Forwarded-Proto' ? proto : undefined) };
  const res = { setHeader: (k, v) => { set[k] = v; } };
  let nexted = false;
  securityHeaders(req, res, () => { nexted = true; });
  return { set, nexted };
};

const directives = (csp) => Object.fromEntries(
  csp.split(';').map(d => d.trim()).filter(Boolean).map(d => {
    const [name, ...values] = d.split(/\s+/);
    return [name, values];
  })
);

const appCsp = () => directives(headers().set['Content-Security-Policy']);

describe('CSP - יכולות מוצר שהמדיניות חייבת להשאיר פתוחות', () => {
  it('data: ו-blob: מותרים בתמונות - מפות השדה, סמלים וכתב יד נשמרים כ-data URL', () => {
    const img = appCsp()['img-src'];
    expect(img).toBeDefined();          // בלי ההנחיה - נופל ל-default-src וחוסם data:
    expect(img).toContain('data:');
    expect(img).toContain('blob:');
  });

  it("style-src מתיר 'unsafe-inline' - style={{...}} ותגי <style> עם keyframes", () => {
    expect(appCsp()['style-src']).toContain("'unsafe-inline'");
  });

  it('frame-ancestors מתיר מסגור עצמי - סרגל "עמדות נוספות" ממסגר את האפליקציה', () => {
    expect(appCsp()['frame-ancestors']).toEqual(["'self'"]);
    expect(headers().set['X-Frame-Options']).toBe('SAMEORIGIN');
  });

  it('frame-src מתיר מקורות חיצוניים - מצלמות בכתובת שהמפעיל מגדיר', () => {
    const frame = appCsp()['frame-src'];
    expect(frame).toContain("'self'");
    expect(frame.some(v => v === 'https:' || v === 'http:')).toBe(true);
  });

  it('worker-src מתיר blob: - ה-worker של tesseract.js נוצר מ-blob URL', () => {
    expect(appCsp()['worker-src']).toContain('blob:');
  });

  it("script-src מתיר wasm - pdfjs ו-tesseract מריצים WebAssembly", () => {
    expect(appCsp()['script-src']).toContain("'wasm-unsafe-eval'");
  });
});

describe('CSP - מה שחייב להישאר סגור', () => {
  it("script-src בעמדה בלי 'unsafe-inline' - זה מה שנותן ל-CSP ערך מול XSS", () => {
    expect(appCsp()['script-src']).not.toContain("'unsafe-inline'");
  });

  it('object-src, base-uri, form-action נשארים נעולים', () => {
    const csp = appCsp();
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(csp['base-uri']).toEqual(["'self'"]);
    expect(csp['form-action']).toEqual(["'self'"]);
  });
});

describe('CSP של אפליקציית הנהג', () => {
  it("מקבלת 'unsafe-inline' - הסקריפט שלה מוטבע ב-HTML", () => {
    expect(directives(DRIVER_CSP)['script-src']).toContain("'unsafe-inline'");
  });

  // הכרעה מתועדת (TRIP_LIVE_TRACKING_SPEC.md §7, אורי 2026-09-13): במסך הנסיעה החי
  // הנהג יכול לעבור למפת Google. ההנחיות נפתחות **רק** למקורות של Google, ורק
  // בדף הנהג. הבדיקה נשארת מחמירה: כל מקור נוסף מעבר לרשימה הזו נכשל כאן.
  const GOOGLE_EXTRA = {
    'style-src': ['https://fonts.googleapis.com'],
    'img-src': ['https://*.googleapis.com', 'https://*.gstatic.com', 'https://*.google.com', 'https://*.googleusercontent.com', 'https://*.ggpht.com'],
    'font-src': ['https://fonts.gstatic.com'],
    'connect-src': ['https://maps.googleapis.com', 'https://*.googleapis.com', 'https://*.gstatic.com'],
  };

  it('שאר ההנחיות = מדיניות העמדה + מקורות Google בלבד, ולא מקור אחד מעבר', () => {
    const driver = directives(DRIVER_CSP);
    const app = appCsp();
    for (const name of Object.keys(app)) {
      if (name === 'script-src') continue;
      expect(driver[name], name).toEqual([...app[name], ...(GOOGLE_EXTRA[name] || [])]);
    }
  });

  it('script-src של הנהג = inline + Google בלבד', () => {
    expect(directives(DRIVER_CSP)['script-src']).toEqual([
      "'self'", "'unsafe-inline'",
      'https://maps.googleapis.com', 'https://*.googleapis.com', 'https://*.gstatic.com', "'unsafe-eval'", 'blob:',
    ]);
  });

  it('frame-src, object-src ו-form-action של הנהג לא נפתחו ל-Google', () => {
    const driver = directives(DRIVER_CSP);
    const app = appCsp();
    for (const name of ['frame-src', 'object-src', 'form-action', 'base-uri', 'frame-ancestors']) {
      expect(driver[name], name).toEqual(app[name]);
    }
  });

  // המפה הצפה של נסיעות בביצוע במגדל, במצב Google. ה-CSP של העמדה עצמה אינו
  // משתנה - Google ו-'unsafe-eval' תחומים לדף הזה, שמוטבע כ-iframe מאותו מקור.
  describe('המפה הצפה (liveMap.html)', () => {
    it('שאר ההנחיות = מדיניות העמדה + מקורות Google בלבד', () => {
      const live = directives(LIVE_MAP_CSP);
      const app = appCsp();
      for (const name of Object.keys(app)) {
        if (name === 'script-src') continue;
        expect(live[name], name).toEqual([...app[name], ...(GOOGLE_EXTRA[name] || [])]);
      }
    });

    // הסקריפט בקובץ נפרד - אין סיבה לתת לדף הזה את החריג של דף הנהג
    it("script-src = self + Google, **בלי 'unsafe-inline'**", () => {
      expect(directives(LIVE_MAP_CSP)['script-src']).toEqual([
        "'self'", 'https://maps.googleapis.com', 'https://*.googleapis.com', 'https://*.gstatic.com', "'unsafe-eval'", 'blob:',
      ]);
    });

    it('ה-CSP של העמדה לא נפתח ל-Google ולא ל-unsafe-eval', () => {
      expect(CSP).not.toContain('googleapis');
      expect(directives(CSP)['script-src']).not.toContain("'unsafe-eval'");
    });
  });
});

// נכתב אחרי תקלה שנייה מאותה משפחה (2026-08-08): `microphone=()` הוא רשימת
// מקורות **ריקה** - כלומר גם העמדה עצמה חסומה, לא רק צד שלישי. הדפדפן דוחה את
// getUserMedia ב-NotAllowedError עוד לפני מטפל ההרשאות של Electron, והבקר קיבל
// "אין הרשאת מיקרופון" בלי שום דיאלוג לאשר בו.
describe('Permissions-Policy - חיישנים', () => {
  const policy = () => Object.fromEntries(
    headers().set['Permissions-Policy'].split(',').map(d => d.trim()).filter(Boolean).map(d => {
      const eq = d.indexOf('=');
      return [d.slice(0, eq).trim(), d.slice(eq + 1).trim()];
    })
  );

  it('microphone פתוח למקור העמדה - הפקודות הקוליות בשולחן הבקרה', () => {
    expect(policy().microphone).toBe('(self)');   // '()' חוסם גם את העמדה עצמה
  });

  it('microphone עדיין חסום למסגרות חיצוניות - סטרים מצלמה לא יאזין לחדר', () => {
    expect(policy().microphone).not.toContain('*');
    expect(policy().microphone).not.toContain('http');
  });

  it('camera, payment ו-usb נשארים סגורים - לא בשימוש במוצר', () => {
    expect(policy().camera).toBe('()');
    expect(policy().payment).toBe('()');
    expect(policy().usb).toBe('()');
  });
});

describe('כותרות נלוות', () => {
  it('HSTS רק כשהחיבור מוצפן', () => {
    expect(headers({ secure: false, proto: 'http' }).set['Strict-Transport-Security']).toBeUndefined();
    expect(headers({ secure: true }).set['Strict-Transport-Security']).toContain('max-age=');
    expect(headers({ proto: 'https' }).set['Strict-Transport-Security']).toContain('max-age=');
  });

  it('nosniff, referrer ו-next', () => {
    const { set, nexted } = headers();
    expect(set['X-Content-Type-Options']).toBe('nosniff');
    expect(set['Referrer-Policy']).toBe('no-referrer');
    expect(nexted).toBe(true);
  });
});

// ── סוכן העמדה ───────────────────────────────────────────────────────────────
// התקלה שזה מתעד: הדף חסם את הפנייה לסוכן עוד לפני שהיא יצאה, בהודעה שמופיעה
// **רק בקונסולה של הדפדפן**. כל השאר עבד - הסוכן רץ, המאגר עלה, ה-CORS היה
// תקין - והמפעיל ראה "אין מאגר מקומי". ראה ARCHITECTURE.md §עמדה שעולה ב-WEB.
describe('connect-src - סוכן העמדה', () => {
  const connect = () => CSP.split('; ').find(d => d.startsWith('connect-src'));

  it('הדף רשאי לפנות לסוכן שעל מחשב המפעיל', () => {
    expect(connect()).toContain('http://127.0.0.1:*');
    expect(connect()).toContain('http://localhost:*');
  });

  // פורט כללי ולא 5100 קבוע: STATION_PORT ניתן לשינוי, ועמדה שנייה על אותו
  // מחשב מקבלת פורט אחר. פינינג היה שובר אותן בשקט.
  it('ההיתר אינו מקובע לפורט אחד', () => {
    expect(connect()).not.toMatch(/127\.0\.0\.1:\d+/);
  });

  it('מארח מרוחק אקראי עדיין חסום', () => {
    expect(connect()).not.toContain('https://*');
    expect(connect()).not.toContain("connect-src *");
  });
});
