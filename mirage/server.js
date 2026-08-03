// מיראז' — הפעלת שרת הדמו. אפליקציה נפרדת מ-SKY-KING.
// הרצה: node mirage/server.js  (או: npm run mirage)
// ב-Railway: שירות שני מאותו repo עם Start Command = npm run mirage.
import { createMirageApp } from './app.js';
// עזר רשת טהור (ללא תלות בלוגיקת SKY-KING) — ראה ההסבר שם למה לא app.listen(cb)
import { listen } from '../server/listen.js';

// PORT — מוזרק ע"י Railway; מקומית נשאר MIRAGE_PORT/7300
const PORT = process.env.PORT || process.env.MIRAGE_PORT || 7300;

// MIRAGE_DATA_FILE — קובץ אחסון חלופי (בדיקות e2e): מבודד מ-data.json ומ-DB
const app = createMirageApp({ dataFile: process.env.MIRAGE_DATA_FILE });

// אסימון השירות (ממצא SK-54): בלעדיו SKY-KING לא יוכל לקרוא את רשימת המורשים
// לעמדה, ולכן החלפת איש צוות תיכשל. מודיעים על כך בעלייה ולא כשהמסך נשבר.
if (!process.env.MIRAGE_SERVICE_TOKEN) {
  console.warn(
    "MIRAGE — MIRAGE_SERVICE_TOKEN לא הוגדר. רשימת המשתמשים (GET /api/users) סגורה, " +
    "והחלפת איש צוות ב-SKY-KING לא תעבוד. הגדר את אותו ערך בשני התהליכים.",
  );
}

// דיווח על הכתובת שנתפסה בפועל, לא על זו שביקשנו
const ready = (server) => {
  const a = server.address();
  console.log(`MIRAGE — מערכת ניהול משתמשים והרשאות (דמו) — מאזין על ${a.address}:${a.port} — http://localhost:${PORT}`);
};

// '::' (IPv6 dual-stack) ולא '0.0.0.0' — הרשת הפנימית של Railway
// (*.railway.internal) עובדת רק מול שירות שמאזין על IPv6; dual-stack מקבל גם
// IPv4, ולכן SKY-KING יכול לפנות ל-127.0.0.1 (ראה server/routes/mirage.js).
// אם למארח אין IPv6 כלל ה-bind נכשל — שם נופלים ל-IPv4 במקום למות, כדי
// שהזדהות מקומית תמשיך לעבוד. כל שגיאה אחרת (בעיקר EADDRINUSE) נכשלת בקול.
const NO_IPV6 = ['EAFNOSUPPORT', 'EADDRNOTAVAIL', 'EINVAL'];

listen(app, PORT, '::')
  .catch((err) => {
    if (!NO_IPV6.includes(err.code)) throw err;
    console.warn(`MIRAGE — אין IPv6 במארח (${err.code}), נופל ל-IPv4`);
    return listen(app, PORT, '0.0.0.0');
  })
  .then(ready)
  .catch((err) => {
    console.error(`MIRAGE — כשל בהאזנה על פורט ${PORT}: ${err.message}`);
    process.exit(1);
  });
