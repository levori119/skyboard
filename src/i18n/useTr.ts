import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';

/**
 * tr() — תרגום שבו **המחרוזת העברית עצמה היא המפתח**.
 *
 *   tr('בטל העברה')  →  he: 'בטל העברה'  |  en: 'Cancel transfer'
 *
 * למה כך ולא מפתחות מובנים (`t('x.y')`):
 * - הקוד נשאר **קריא בעברית** לצוות — לא צריך לקפוץ לקובץ תרגום כדי להבין מה כתוב במסך.
 * - המיגרציה של אלפי מחרוזות היא עטיפה מכנית, בלי להמציא שמות מפתח.
 * - Degradation חינני: מחרוזת בלי תרגום אנגלי פשוט תישאר בעברית (defaultValue) —
 *   אף פעם לא מוצג מפתח גולמי למשתמש.
 *
 * הערה: משתמש ב-namespace 'ui' עם keySeparator/nsSeparator כבויים, כדי שנקודות,
 * נקודתיים ומירכאות בתוך המחרוזת העברית לא יתפרשו כנתיב מקונן.
 *
 * ⚠️ לעטוף **רק טקסט תצוגה**. אין לעטוף ערכי-נתונים (סטטוסים כמו 'תקין'/'עוזב אזור')
 * שמושווים או נשמרים ב-DB — זה ישבור את הלוגיקה.
 */
export function useTr() {
  const { t, i18n } = useTranslation();
  const tr = useCallback(
    (he: string) => t(he, { ns: 'ui', keySeparator: false, nsSeparator: false, defaultValue: he }) as string,
    [t, i18n.language]
  );
  return tr;
}
