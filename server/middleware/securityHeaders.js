// כותרות אבטחה - הגנת עומק ל-SK-03/SK-44 (XSS), וסגירה חלקית של SK-08.
//
// למה בכתיבה עצמית ולא helmet: תלות נוספת ברשת מבודדת (SK-30), עבור חמש כותרות
// קבועות. helmet היה מוסיף ערך אילו היינו צריכים את כל מה שהוא נותן - כאן לא.
//
// ⚠️ הכלל שהפיל את הפרודקשן (2026-08-04): **`default-src` הוא ברירת המחדל של
// כל הנחיה שלא נכתבה במפורש**. גרסה קודמת הסתפקה ב-`default-src 'self'` מתוך
// הנחה שהשמטת `script-src`/`img-src`/`style-src` משאירה אותם פתוחים - ההפך הוא
// הנכון: הן ירשו `'self'` וחסמו את המערכת בארבע חזיתות בבת אחת -
//   1. תמונות `data:` (מפות השדה ב-maps.image_data, כתב יד, סמלים) לא נטענו,
//      ובעמדת השדה imgBounds נשאר null - ולכן כל טוגל בסרגל התצוגה "לא הגיב".
//   2. תגי <style> מוטבעים (RotatingEmblems, GroundView, ClockWidget) נחסמו -
//      אייקוני מסך הטעינה לא הסתובבו ואלמנטים מהבהבים קפאו.
//   3. `frame-ancestors 'none'` חסם גם מסגור מאותו מקור - סרגל "עמדות נוספות"
//      (StationPeekBar) מציג את האפליקציה עצמה ב-iframe ונשאר ריק.
//   4. סקריפט ה-boot המוטבע ב-index.html נחסם - --s נשאר 1 ו-data-screen לא
//      נקבע. הוא הוצא מאז ל-public/boot.js, ולכן `script-src 'self'` תקין.
// כל הנחיה כאן קיימת בגלל צורך מוכח במוצר. לפני שמצמצמים אחת - לוודא מול
// הרשימה למעלה, ולבדוק בדפדפן עם קונסולה פתוחה בבילד פרודקשן, לא ב-dev.

// ללא 'unsafe-inline' - זו ההנחיה שנושאת את ערך ה-CSP מול XSS. אין בעמדה
// סקריפט מוטבע (ראה public/boot.js). 'wasm-unsafe-eval' נדרש ל-pdfjs-dist
// ול-tesseract.js, ששניהם מריצים WebAssembly בעיבוד מפות וזיהוי כתב.
const SCRIPT_SRC = "script-src 'self' 'wasm-unsafe-eval'";

const csp = (scriptSrc) => [
  "default-src 'self'",

  scriptSrc,

  // 'unsafe-inline' בלית ברירה: הלקוח מסגנן ב-style={{...}} (מאות מופעים) ומזריק
  // <style> עם keyframes דינמיים. style-src בלי inline משבית את שניהם.
  "style-src 'self' 'unsafe-inline'",

  // data: - מפות השדה, סמלי בסיס וכתב יד נשמרים ב-DB כ-data URL.
  // blob:  - html-to-image ו-canvas.toBlob בייצוא לוח ובצילום מסך.
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",

  // ה-worker של tesseract.js נוצר מ-blob URL.
  "worker-src 'self' blob:",

  // api.sunrise-sunset.org - זמני אור ראשון/אחרון בתצוגה האנכית. נכשל בשקט
  // ברשת מבודדת (יש catch), ולכן מותר ולא נדרש.
  "connect-src 'self' https://api.sunrise-sunset.org",

  // מסגרות: העמדות הנצפות (מאותו מקור) ומצלמות שהמפעיל מגדיר בכתובת חופשית -
  // סטרים בכתובת IP ברשת המקומית או קישור YouTube. אין דרך לרשום אותן מראש.
  "frame-src 'self' https: http:",

  // 'self' ולא 'none': הצפייה בעמדות נוספות היא מסגור עצמי. אתר חיצוני עדיין
  // אינו יכול למסגר את העמדה.
  "frame-ancestors 'self'",

  "object-src 'none'",        // חוסם <object>/<embed> - וקטור הרצה ישן
  "base-uri 'self'",          // מונע חטיפת נתיבים יחסיים דרך <base> מוזרק
  "form-action 'self'",       // טופס מוזרק לא יוכל לשלוח נתונים החוצה
].join('; ');

const CSP = csp(SCRIPT_SRC);

// חריג מתועד: public/driver.html הוא דף עצמאי בן קובץ אחד - סקריפט מוטבע של
// ~980 שורות ו-23 מטפלי onclick/onchange בתגיות. תחת script-src 'self' הדף
// עולה ריק לחלוטין. עד שהסקריפט יוצא לקובץ וההאזנות יעברו ל-addEventListener,
// הנתיב הזה מקבל 'unsafe-inline'. הנזק תחום: הדף אינו קורא מידע עמדות, ואסימון
// הנהג מוגבל לנתיבי /api/driver בלבד (ראה server/routes/driver.js).
export const DRIVER_CSP = csp("script-src 'self' 'unsafe-inline'");

export function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // SAMEORIGIN ולא DENY - סרגל "עמדות נוספות" ממסגר את האפליקציה בעצמה.
  // בדפדפנים שמכבדים frame-ancestors הכותרת הזו מתעלמת ממילא.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // חוסם גישה לחיישנים מקוד מוזרק. מיקום נשאר פתוח - אפליקציית הנהג משתמשת בו.
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), payment=(), usb=()');
  // HSTS רק כשהחיבור באמת מוצפן: על HTTP מקומי (Electron טוען localhost) הכותרת
  // חסרת משמעות, ובדפדפן היא עלולה לנעול מקור פיתוח ל-HTTPS שאינו קיים.
  if (req.secure || req.get('X-Forwarded-Proto') === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}
