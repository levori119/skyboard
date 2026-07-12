import i18n from './index';

/**
 * tr() — תרגום שבו **המחרוזת העברית עצמה היא המפתח**.
 *
 *   tr('בטל העברה')  →  he: 'בטל העברה'  |  en: 'Cancel transfer'
 *
 * זו פונקציה ברמת המודול (לא hook) **בכוונה**: הקוד מכיל עשרות רכיבים מקוננים
 * ופונקציות עזר שמרנדרות JSX, ו-hook לא יכול להיות ב-scope בכולם.
 *
 * ריאקטיביות: `useDirection()` ב-App משתמש ב-useTranslation ולכן מנוי לשינויי שפה.
 * החלפת שפה מרנדרת מחדש את App ואת כל העץ — ואז tr() נקרא שוב ומחזיר את הערך החדש.
 *
 * Degradation חינני: מחרוזת בלי תרגום נשארת בעברית (defaultValue = המפתח) —
 * אף פעם לא מוצג מפתח גולמי למשתמש.
 *
 * ⚠️ לעטוף **רק טקסט תצוגה**. אין לעטוף ערכי-נתונים (סטטוסים כמו 'תקין'/'עוזב אזור')
 * שמושווים או נשמרים ב-DB — זה ישבור את הלוגיקה.
 */
export function tr(he: string): string {
  return i18n.t(he, {
    ns: 'ui',
    keySeparator: false,
    nsSeparator: false,
    defaultValue: he,
  }) as string;
}
