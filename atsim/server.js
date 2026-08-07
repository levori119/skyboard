// ATSIM - הפעלת מאגר התמונ"א. אפליקציה נפרדת מ-SKY-KING.
// הרצה: node atsim/server.js  (או: npm run atsim)
//
// **לא נפרס ב-Railway ולא משתמש ב-Neon** (AIR_PICTURE_SPEC.md §9): המאגר עומד
// בפני עצמו, רץ היכן שהעמדה יכולה להגיע אליו, והאחסון הוא קובץ מקומי.
import { createAtsimApp } from './app.js';
// אותו עזר רשת של SKY-KING ומיראז' - ראה ההסבר שם למה לא app.listen(cb).
import { listen } from '../server/listen.js';

const PORT = process.env.ATSIM_PORT || 7400;

const app = createAtsimApp({ dataFile: process.env.ATSIM_DATA_FILE });

if (!process.env.ATSIM_TOKEN) {
  console.warn(
    'ATSIM - ATSIM_TOKEN לא הוגדר. AirTrafficAPI פתוח לכל מי שמגיע לפורט. ' +
    'מקובל בפיתוח מקומי; ברשת אמיתית יש להגדיר אותו ולהזריק אותו משרת העמדה.',
  );
}

const ready = (server) => {
  const a = server.address();
  console.log(`ATSIM - מאגר תמונ"א - מאזין על ${a.address}:${a.port}`);
  console.log(`ATSIM - FRONT:         http://localhost:${PORT}/`);
  console.log(`ATSIM - AirTrafficAPI: http://localhost:${PORT}/air-picture`);
};

// '::' (dual-stack) קודם, ונפילה ל-IPv4 אם למארח אין IPv6 - בדיוק כמו במיראז'.
// כל שגיאה אחרת (בעיקר EADDRINUSE) נכשלת בקול ולא בשקט.
const NO_IPV6 = ['EAFNOSUPPORT', 'EADDRNOTAVAIL', 'EINVAL'];

listen(app, PORT, '::')
  .catch((err) => {
    if (!NO_IPV6.includes(err.code)) throw err;
    console.warn(`ATSIM - אין IPv6 במארח (${err.code}), נופל ל-IPv4`);
    return listen(app, PORT, '0.0.0.0');
  })
  .then(ready)
  .catch((err) => {
    console.error(`ATSIM - כשל בהאזנה על פורט ${PORT}: ${err.message}`);
    process.exit(1);
  });
