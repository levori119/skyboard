// מיראז' — הפעלת שרת הדמו. אפליקציה נפרדת מ-SKY-KING.
// הרצה: node mirage/server.js  (או: npm run mirage)
import { createMirageApp } from './app.js';

const PORT = process.env.MIRAGE_PORT || 7300;

createMirageApp().listen(PORT, '0.0.0.0', () => {
  console.log(`MIRAGE — מערכת ניהול משתמשים והרשאות (דמו) — http://localhost:${PORT}`);
});
