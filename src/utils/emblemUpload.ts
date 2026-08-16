// ─── העלאת סמל ממסך הניהול — כיווץ אחיד לפני שמירה ב-DB ──────────────────────
// כל תמונה שנבחרת בניהול (סמל בסיס או סמל מיח"ה) עוברת כאן: מכווצת ל-350px
// (אותו גודל של הסמלים המובנים ב-src/assets/emblems/files) ומקודדת ל-data URL.
//
// למה מכווצים בלקוח ולא בשרת: אין בפרויקט ספריית עיבוד תמונה בצד השרת, ו-canvas
// של הדפדפן עושה את זה בחינם. התוצאה - שורה של ~50KB ב-DB במקום צילום של מגה-בייטים.

export const EMBLEM_MAX_PX = 350;

// SVG מוחרג בכוונה: הסמל מוגש מאותו origin ו-SVG יכול להריץ סקריפט.
// אותה החרגה נאכפת גם בשרת (server/utils/emblemImage.js).
export const EMBLEM_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const EMBLEM_ACCEPT = EMBLEM_ALLOWED_TYPES.join(',');

export function isAllowedEmblemFileType(type: string | undefined | null): boolean {
  return !!type && (EMBLEM_ALLOWED_TYPES as readonly string[]).includes(type.toLowerCase());
}

/** גודל היעד בשמירה על יחס, בלי להגדיל תמונה שכבר קטנה מהתקרה. */
export function fitWithin(width: number, height: number, max = EMBLEM_MAX_PX): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** מוציא את סוג ה-MIME מ-data URL ('' אם אינו data URL תקין). */
export function dataUrlMime(dataUrl: string | null | undefined): string {
  const m = /^data:([a-z0-9.+/-]+);base64,/i.exec(String(dataUrl ?? ''));
  return m ? m[1].toLowerCase() : '';
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('failed to read file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('failed to decode image'));
    img.src = src;
  });
}

/**
 * קורא קובץ שנבחר, מכווץ ל-EMBLEM_MAX_PX ומחזיר data URL מוכן לשמירה.
 * WebP כשהדפדפן יודע לקודד אותו (חוסך ~5 מהגודל בצילומי סמל רקום), אחרת PNG.
 * @throws אם סוג הקובץ אינו נתמך או שהתמונה לא ניתנת לפענוח.
 */
export async function fileToEmblemDataUrl(file: File): Promise<string> {
  if (!isAllowedEmblemFileType(file.type)) {
    throw new Error(`unsupported emblem type: ${file.type || 'unknown'}`);
  }
  const raw = await readFile(file);
  const img = await loadImage(raw);
  const { width, height } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return raw;                       // אין canvas — עדיף לשמור כמו שהוא מאשר להיכשל
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  const webp = canvas.toDataURL('image/webp', 0.9);
  if (dataUrlMime(webp) === 'image/webp') return webp;
  return canvas.toDataURL('image/png');
}
