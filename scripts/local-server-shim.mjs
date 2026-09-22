// shim ל-bundle של שרת העמדה: ממלא את מה ש-CommonJS מצפה לו בתוך פלט ESM.
//
// דרך `inject` ולא דרך `banner`: הזרקה מחליפה רק מזהים **חופשיים**, ולכן מודול
// שמגדיר לעצמו `__dirname` (כמו server/app.js) נשאר כמו שהוא. banner היה
// מכריז עליהם ברמת הקובץ ונופל על "Identifier '__filename' has already been
// declared".
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export { __filename, __dirname };
