// pdf.js - נקודת הכניסה **היחידה** לספרייה במערכת.
//
// הבנייה ה-legacy ולא הרגילה: pdfjs-dist 5.x בבנייה הרגילה קורא ל-API של
// JS שנכנסו רק ב-Chrome 140 ומעלה (`Uint8Array.prototype.toHex`, `Math.sumPrecise`,
// `Map.prototype.getOrInsert`). ב-Electron 36 (Chromium 136) של העמדה הם חסרים,
// וכל PDF נפל ב"טעינת העזר נכשלה (n.toHex is not a function)" - בדפדפן עדכני
// הכל עבד, ולכן זה נראה כתקלה של אלקטרון בלבד (2026-10-12). ה-legacy נושאת להם
// מימוש חלופי, גם בקובץ ה-worker.
//
// ⚠ לא לייבא את 'pdfjs-dist' ישירות - בדיקה ב-pdfjs.test.ts נופלת על זה.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

if (typeof window !== 'undefined' && !GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href;
}

export { getDocument, GlobalWorkerOptions };
