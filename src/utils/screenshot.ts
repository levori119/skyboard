// צילום מסך (כפתור 📷) - לחיצה אחת, קובץ PNG ב-Downloads בשם העמדה + תאריך ושעה.
//
// שני מסלולים:
//   עמדת Electron - התהליך הראשי מצלם את החלון (capturePage) וכותב ישר ל-Downloads,
//                   בלי דיאלוג. מצלם הכל כמו שהוא על המסך, כולל מפות ו-3D.
//   דפדפן         - צילום DOM (html-to-image) והורדה רגילה, שהדפדפן שומר ב-Downloads.
//
// בניגוד ל-captureStation (stationSnapshot.ts) שמצלם בחצי רזולוציה לתחקיר
// שנשמר ב-DB, כאן הרזולוציה מלאה - זו תמונה שהפקח שומר לעצמו.
import { toPng } from 'html-to-image';

/** תווים שאסורים בשם קובץ ב-Windows */
const ILLEGAL = /[<>:"/\\|?*\x00-\x1f]+/g;

const pad = (n: number) => String(n).padStart(2, '0');

/** SKYKING_<עמדה>_YYYY-MM-DD_HH-MM-SS.png (שעון מקומי) */
export function screenshotFileName(station: string | undefined | null, at: Date = new Date()): string {
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}_${pad(at.getHours())}-${pad(at.getMinutes())}-${pad(at.getSeconds())}`;
  const name = String(station ?? '').replace(ILLEGAL, '_').replace(/_+/g, '_').replace(/^[\s_.]+|[\s_.]+$/g, '');
  return name ? `SKYKING_${name}_${stamp}.png` : `SKYKING_${stamp}.png`;
}

/**
 * Ctrl+P (או Cmd+P) - צילום מסך מהמקלדת. בניגוד ללחיצה על 📷, המקלדת לא סוגרת
 * תפריט / קליק ימני פתוח, ולכן זו הדרך לצלם אותם. לפי `code` (המקש הפיזי) כדי
 * שיעבוד גם כשהמקלדת בעברית (key = 'פ'). החזקת מקש לא מצלמת שוב ושוב.
 */
export function isScreenshotHotkey(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && !e.repeat && e.code === 'KeyP';
}

type ShotResult = { ok: boolean; path?: string; reason?: string };
type ShotBridge = { screenshot?: (fileName: string) => Promise<ShotResult> };

function bridge(): ShotBridge | null {
  const w = window as unknown as { skyking?: ShotBridge };
  return w.skyking?.screenshot ? w.skyking : null;
}

/** ממתין לשני frames - כדי שהמשוב של הלחיצה עצמה לא ייכנס לתמונה */
const nextPaint = () =>
  new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/**
 * מצלם את המסך ושומר ל-Downloads. מחזיר את שם הקובץ, או null אם נכשל.
 * אלמנטים עם `data-nosnapshot` לא נכנסים לצילום ה-DOM (במסלול הדפדפן).
 */
export async function takeScreenshot(station: string | undefined | null): Promise<string | null> {
  const fileName = screenshotFileName(station);
  await nextPaint();

  const api = bridge();
  if (api) {
    try {
      const r = await api.screenshot!(fileName);
      if (r?.ok) return (r.path || fileName).split(/[\\/]/).pop() || fileName;
    } catch { /* נופלים למסלול הדפדפן */ }
  }

  try {
    const target = document.getElementById('root') || document.body;
    const dataUrl = await toPng(target, {
      cacheBust: true,
      skipFonts: true,
      pixelRatio: window.devicePixelRatio || 1,
      filter: node => !(node instanceof HTMLElement && node.hasAttribute('data-nosnapshot')),
    });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return fileName;
  } catch {
    return null;
  }
}
