// סקריפט boot - חישוב סקייל המסך (--s) לפני הרינדור הראשון, כדי שהעמדה לא
// תיפתח בגודל שגוי ותקפוץ. חייב לרוץ סינכרונית ב-<head>.
//
// ⚠️ למה קובץ נפרד ולא <script> מוטבע ב-index.html: ה-CSP מגדיר
// `script-src 'self'` (ראה server/middleware/securityHeaders.js). סקריפט מוטבע
// נחסם שם, ואז --s נשאר על 1 ו-data-screen לא נקבע - כלומר כל העמדות הגדולות
// (18"/24") נפתחות בסקייל של 15.6". אל תחזיר את הקוד הזה לתוך ה-HTML.
(function () {
  var sizeMap = { '15.6': 1.00, '16': 1.05, '18': 1.22, '24': 1.65 };
  var stored = localStorage.getItem('bt-screenSize');
  var s = (stored && sizeMap[stored]) ? sizeMap[stored] : null;

  if (!s) {
    var w = screen.width * (window.devicePixelRatio || 1);
    var h = screen.height * (window.devicePixelRatio || 1);
    var diag = Math.sqrt(w * w + h * h);
    s = 1.00;
    if (diag >= 3600 && diag < 4200) s = 1.05;
    if (diag >= 4200 && diag < 5000) s = 1.22;
    if (diag >= 5000) s = 1.65;
  }

  document.documentElement.style.setProperty('--s', s);
  document.documentElement.setAttribute('data-screen',
    s >= 1.65 ? '24' : s >= 1.22 ? '18' : s >= 1.05 ? '16' : '15'
  );
})();
