// כותרות אבטחה - הגנת עומק ל-SK-03/SK-44 (XSS), וסגירה חלקית של SK-08.
//
// למה בכתיבה עצמית ולא helmet: תלות נוספת ברשת מבודדת (SK-30), עבור חמש כותרות
// קבועות. helmet היה מוסיף ערך אילו היינו צריכים את כל מה שהוא נותן - כאן לא.
//
// ⚠️ מה **לא** נכלל כאן, במכוון: הנחיית `script-src` מלאה. ב-index.html:8 יושב
// סקריפט boot מוטבע (חישוב אלכסון המסך ל---s), ו-`script-src 'self'` בלי nonce
// היה מפיל אותו - כלומר את כל העמדה. השלמת ה-CSP מחייבת להוציא את הסקריפט
// לקובץ נפרד; זה נשאר פתוח כחלק מ-SK-08 ומתועד ב-SECURITY_AUDIT.html.
// מה שכן נכלל הוא כל מה שאפשר להפעיל **בלי לשבור שום מסך**.

const CSP = [
  "default-src 'self'",
  "object-src 'none'",        // חוסם <object>/<embed> - וקטור הרצה ישן
  "base-uri 'self'",          // מונע חטיפת נתיבים יחסיים דרך <base> מוזרק
  "form-action 'self'",       // טופס מוזרק לא יוכל לשלוח נתונים החוצה
  "frame-ancestors 'none'",   // clickjacking על מסך תפעולי
].join('; ');

export function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
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
