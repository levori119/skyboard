// יציאה מהאפליקציה - כפתור "יציאה" במסך הכניסה.
//
// בעמדה (Electron) הגשר `window.skyking.quitApp` מבקש מהתהליך הראשי לסגור
// את האפליקציה כולה. בדפדפן אין גשר, ו-`window.close()` עובד רק בלשונית
// שנפתחה מסקריפט - ולכן מחזירים אם היציאה באמת התבצעה, כדי שהמסך יוכל
// להציע "סגור את הלשונית" במקום להיתקע בלי חיווי.

interface QuitBridge {
  quitApp?: () => Promise<{ ok: boolean; reason?: string }>;
}

/** משך מסך הפרידה לפני היציאה בפועל (ms) */
export const FAREWELL_MS = 2600;

export type QuitResult = 'electron' | 'window' | 'unsupported';

export async function quitApp(w: Window = window): Promise<QuitResult> {
  const bridge = (w as unknown as { skyking?: QuitBridge }).skyking;
  if (bridge?.quitApp) {
    try {
      const res = await bridge.quitApp();
      if (res?.ok) return 'electron';
    } catch { /* נופלים לסגירת החלון */ }
  }
  try { w.close(); } catch { /* נחסם בדפדפן */ }
  // ניסיון שני: לשונית ש"נפתחה מסקריפט" מותרת בסגירה - פתיחה עצמית ל-_self
  // מספיקה בחלק מהדפדפנים (ובכרום כשללשונית אין היסטוריית ניווט).
  if (!w.closed) {
    try { w.open('', '_self')?.close(); } catch { /* נחסם */ }
  }
  return w.closed ? 'window' : 'unsupported';
}
