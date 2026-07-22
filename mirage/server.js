// מיראז' — הפעלת שרת הדמו. אפליקציה נפרדת מ-SKY-KING.
// הרצה: node mirage/server.js  (או: npm run mirage)
// ב-Railway: שירות שני מאותו repo עם Start Command = npm run mirage.
import { createMirageApp } from './app.js';

// PORT — מוזרק ע"י Railway; מקומית נשאר MIRAGE_PORT/7300
const PORT = process.env.PORT || process.env.MIRAGE_PORT || 7300;

// '::' (IPv6 dual-stack) ולא '0.0.0.0' — הרשת הפנימית של Railway
// (*.railway.internal) עובדת רק מול שירות שמאזין על IPv6; מקבל גם IPv4.
createMirageApp().listen(PORT, '::', () => {
  console.log(`MIRAGE — מערכת ניהול משתמשים והרשאות (דמו) — http://localhost:${PORT}`);
});
