// צילום מסך העמדה לתחקיר — DOM→canvas (html-to-image), בלי הרשאת מסך מהמשתמש.
//
// למה לא getDisplayMedia: הוא פותח דיאלוג בחירת מסך בכל צילום. בעמדה תפעולית,
// באמצע אירוע, זה צעד מיותר. html-to-image מרנדר את ה-DOM עצמו ולכן שקוף למשתמש.
//
// מה **לא** נכנס לצילום: כל אלמנט עם `data-nosnapshot` — כך טופס התחקיר עצמו
// (וכל שכבה שנפתחה בגללו) לא מצלם את עצמו. הקריאה חייבת בכל מקרה לקרות לפני
// שהטופס נפתח; ה-attribute הוא רשת הביטחון.
import { toPng } from 'html-to-image';

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
  const target = document.getElementById('root') || document.body;
  try {
    await nextPaint();
    return await toPng(target, {
      cacheBust: true,
      // גופנים מוטמעים מנפחים את ה-dataURL בעשרות אחוזים ואינם נחוצים לתמונה
      skipFonts: true,
      // חצי רזולוציה — קריא לתחקיר, ורבע מנפח ה-base64 שנשמר ב-DB
      pixelRatio: 0.5,
      filter: node =>
        !(node instanceof HTMLElement && node.hasAttribute('data-nosnapshot')),
    });
  } catch {
    return '';
  }
}
