// האזנה אמינה — מחליף את app.listen(port, host, cb) של Express.
//
// למה זה קיים: Express 5 רושם את ה-callback של app.listen גם כמאזין ל-'error'
// (application.js: `server.once('error', done)`). לכן bind שנכשל מפעיל דווקא את
// ה-callback ה"מוצלח" — השרת מדפיס "listening" בזמן ש-server.address() הוא null
// ואין לו מאזין כלל. גרוע מזה: עצם קיום מאזין ל-'error' מונע קריסה, אז התהליך
// נשאר חי, שקט, וללא פורט.
//
// כך נראתה תקלה אמיתית: לפי הלוג השרת "עלה", בפועל כל /api חזר 500 דרך פרוקסי
// Vite, ובמסך ה-LOGIN הוצג "שגיאה בכניסה" — כאילו הסיסמה של הפקח שגויה.
//
// כאן נשענים על אירוע 'listening' עצמו (אמין) ומחזירים Promise: resolve רק
// כשבאמת מאזינים, reject עם השגיאה אחרת.
//
// משותף ל-SKY-KING (server.js) ולמיראז' (mirage/server.js) — עזר רשת טהור,
// בלי תלות בלוגיקה של אף אחד מהם. שניהם נארזים לאותו image (ראה Dockerfile).
export function listen(app, port, host) {
  return new Promise((resolve, reject) => {
    // בלי callback — כדי ש-Express לא ירשום אותו כמאזין ל-'error'
    const server = app.listen(port, host);
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });
}
