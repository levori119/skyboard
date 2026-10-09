// צילום DOM→PNG (html-to-image) - מקור יחיד לשני הצילומים: כפתור 📷 / Ctrl+P
// (screenshot.ts) והצילום שנכנס לתחקיר (stationSnapshot.ts).
//
// html-to-image משכפל את ה-DOM לתוך SVG ומצייר אותו על canvas. אלמנט אחד שהוא
// לא מסוגל לשכפל מפיל את **כל** הצילום - והפקח רק רואה "צילום המסך נכשל".
// מה שהפיל בשחזור (2026-10-09), ולכן מדולג:
//   iframe   - חלון הצצה לעמדה (StationScreenFrame) הוא מאותו מקור, והספרייה
//              משכפלת עמדה שלמה מתוכו: נתקעה ~200 שניות ונכשלה. iframe ממקור זר
//              (מצלמות, מזג אוויר) ממילא יוצא ריק ב-foreignObject.
//   canvas מזוהם - תוכן ממקור זר; toDataURL זורק SecurityError מיד.
//   video / object / embed - אותה בעיה.
// המחיר: המשבצות האלה יוצאות ריקות בתמונה. בעמדת Electron הצילום הוא
// capturePage (פיקסל-לפיקסל) והן נכנסות.
import { toPng } from 'html-to-image';

type NodeLike = {
  nodeType: number;
  tagName?: string;
  hasAttribute?: (name: string) => boolean;
};

const SKIP_TAGS = new Set(['IFRAME', 'VIDEO', 'OBJECT', 'EMBED']);

/** האם canvas מזוהם (לא ניתן לקרוא ממנו פיקסלים) - העתקה זעירה ו-getImageData */
function canvasTainted(canvas: unknown): boolean {
  try {
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    const ctx = probe.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(canvas as HTMLCanvasElement, 0, 0, 1, 1);
    ctx.getImageData(0, 0, 1, 1);
    return false;
  } catch {
    return true;
  }
}

/** אלמנט שלא נכנס לצילום. `tainted` ניתן להזרקה בבדיקות */
export function isUncapturable(node: NodeLike, tainted: (c: unknown) => boolean = canvasTainted): boolean {
  if (node.nodeType !== 1) return false;
  if (node.hasAttribute?.('data-nosnapshot')) return true;
  const tag = (node.tagName || '').toUpperCase();
  if (SKIP_TAGS.has(tag)) return true;
  return tag === 'CANVAS' && tainted(node);
}

/** הרזולוציות לניסיון: המבוקשת, ואם נכשלה - נמוכה יותר (canvas ענק נכשל בזיכרון) */
export function captureRatios(pixelRatio: number): number[] {
  const fallback = pixelRatio > 1 ? 1 : 0.5;
  return pixelRatio > fallback ? [pixelRatio, fallback] : [pixelRatio];
}

/** תקרה לניסיון בודד - כדי שהכפתור לא יישאר "עסוק" לנצח */
const ATTEMPT_TIMEOUT_MS = 60_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms);
    p.then(v => { window.clearTimeout(t); resolve(v); }, e => { window.clearTimeout(t); reject(e); });
  });
}

/**
 * מצלם את #root ומחזיר dataURL של PNG. זורק אם כל הניסיונות נכשלו.
 * השגיאה נרשמת לקונסול - כדי שהסיבה תהיה גלויה ולא רק "נכשל".
 */
export async function captureDom(pixelRatio: number): Promise<string> {
  const target = document.getElementById('root') || document.body;
  let last: unknown;
  for (const ratio of captureRatios(pixelRatio)) {
    try {
      return await withTimeout(toPng(target, {
        cacheBust: true,
        // גופנים מוטמעים מנפחים את התמונה ואינם נחוצים לה
        skipFonts: true,
        pixelRatio: ratio,
        filter: node => !isUncapturable(node as unknown as NodeLike),
      }), ATTEMPT_TIMEOUT_MS);
    } catch (e) {
      last = e;
      // שגיאת טעינת תמונה מגיעה כ-Event ולא כ-Error
      console.warn('[capture] צילום DOM נכשל', { ratio, error: e instanceof Event ? `${e.type} event` : e });
      if (e instanceof Error && e.message.startsWith('timeout')) break;   // ניסיון נוסף יתקע שוב
    }
  }
  throw last instanceof Error ? last : new Error('dom capture failed');
}
