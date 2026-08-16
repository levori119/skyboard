// מסך מלא בעליית עמדה (kiosk) — בפרודקשן העמדה עולה כמו F11: בלי שורת כתובת
// ובלי טאבים, כדי שכל השטח יהיה לוח מידע השדה (כמו הסדק הפיזי).
//
// הערות מימוש:
// • Fullscreen API דורש user gesture — לכן קוראים לזה מתוך ה-click של הכניסה
//   לעמדה (WorkstationLogin), לא מתוך useEffect. בלי gesture הדפדפן דוחה בשקט.
// • תמיד על document.documentElement (ה-root) ולא על אלמנט פנימי — כך portals
//   שמרונדרים ל-<body> (מודלים, מקלדת וירטואלית, tooltips) נשארים גלויים.
// • דגל עקיפה ב-localStorage תחת 'bt-kiosk': 'off' מבטל (גם בפרודקשן),
//   'on' מפעיל גם בפיתוח — לאימות מקומי בלי לבנות.

export const KIOSK_FLAG_KEY = 'bt-kiosk';

// document-like מינימלי — מאפשר בדיקות בלי jsdom
type FullscreenDoc = {
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  documentElement?: any;
};

const defaultDoc = (): FullscreenDoc | undefined =>
  typeof document !== 'undefined' ? (document as unknown as FullscreenDoc) : undefined;

const readFlag = (): string | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(KIOSK_FLAG_KEY) : null;
  } catch {
    return null; // אין אחסון (בדיקות/מצב פרטי) — נשארים לפי סוג הבנייה
  }
};

// ברירת המחדל היא סוג הבנייה: build (פרודקשן) → מסך מלא, dev → לא
export function isKioskEnabled(isProd: boolean = !!import.meta.env?.PROD): boolean {
  const flag = readFlag();
  if (flag === 'off') return false;
  if (flag === 'on') return true;
  return isProd;
}

export function isFullscreen(doc: FullscreenDoc | undefined = defaultDoc()): boolean {
  if (!doc) return false;
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
}

/**
 * מעלה את העמדה למסך מלא. אידמפוטנטי — אם כבר במסך מלא לא עושה כלום.
 * לא זורק לעולם: דחיית הדפדפן (אין gesture / מדיניות iframe) מחזירה false.
 */
export async function enterKioskFullscreen(
  doc: FullscreenDoc | undefined = defaultDoc()
): Promise<boolean> {
  if (!doc || !isKioskEnabled()) return false;
  if (isFullscreen(doc)) return true;

  const root: any = doc.documentElement;
  const request: any = root && (
    root.requestFullscreen ||
    root.webkitRequestFullscreen ||   // Safari / דפדפנים ישנים
    root.mozRequestFullScreen ||
    root.msRequestFullscreen
  );
  if (typeof request !== 'function') return false;

  try {
    await request.call(root, { navigationUI: 'hide' });
    return true;
  } catch {
    return false;
  }
}
