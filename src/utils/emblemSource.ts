// ─── כתובות הסמלים שמנוהלים בניהול + חימום מטמון ─────────────────────────────
// מקור אמת יחיד לכתובות, כדי ש-App (חימום בכניסה) ו-RotatingEmblems (תצוגה)
// ישתמשו באותו URL ולכן באותה רשומת מטמון בדפדפן.

import { API_URL } from '../config';

export const MICHA_EMBLEM_URL = `${API_URL}/emblems/system/micha`;
export const baseEmblemUrl = (id: number | string) => `${API_URL}/emblems/base/${id}`;

/**
 * מושך את הסמלים לרגע שבו הדפדפן פנוי - מיד אחרי הכניסה לעמדה, לפני שהדשבורד
 * מתחיל את מטח קריאות ה-API שלו. בלי זה, בקשת התמונה נתקעת בתור מאחורי המטח
 * (HTTP/1.1 מגביל ל-6 חיבורים למקור) והסמל מגיע שניות אחרי מסך הטעינה.
 */
export function warmEmblems(baseId?: number | string | null): void {
  const urls = [MICHA_EMBLEM_URL, ...(baseId ? [baseEmblemUrl(baseId)] : [])];
  for (const url of urls) {
    const img = new Image();
    img.src = url;   // 404 (אין סמל ב-DB) נבלע - התצוגה נופלת לסמל המובנה
  }
}
