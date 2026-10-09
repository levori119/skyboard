// צילום מסך העמדה לתחקיר — DOM→canvas (html-to-image), בלי הרשאת מסך מהמשתמש.
//
// למה לא getDisplayMedia: הוא פותח דיאלוג בחירת מסך בכל צילום. בעמדה תפעולית,
// באמצע אירוע, זה צעד מיותר. html-to-image מרנדר את ה-DOM עצמו ולכן שקוף למשתמש.
//
// מה **לא** נכנס לצילום (ראה domCapture.ts): כל אלמנט עם `data-nosnapshot` — כך טופס התחקיר עצמו
// (וכל שכבה שנפתחה בגללו) לא מצלם את עצמו. הקריאה חייבת בכל מקרה לקרות לפני
// שהטופס נפתח; ה-attribute הוא רשת הביטחון.
import { captureDom } from './domCapture';

/** ממתין לשני frames — כדי שסגירת התפריט שקדמה לצילום תספיק להיעלם מהמסך */
const nextPaint = () =>
  new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );

/**
 * מצלם את מסך העמדה ומחזיר dataURL (PNG), או מחרוזת ריקה אם הצילום נכשל.
 * הכישלון אינו חריג: התחקיר נשמר גם בלי תמונה.
 */
export async function captureStation(): Promise<string> {
  try {
    await nextPaint();
    // חצי רזולוציה - קריא לתחקיר, ורבע מנפח ה-base64 שנשמר ב-DB
    return await captureDom(0.5);
  } catch {
    return '';
  }
}
