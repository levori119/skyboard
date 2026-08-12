// מיפוי תשובת שגיאה של הזדהות מיראז' למפתח i18n — רכיב לוגי משותף.
// אותה הזדהות מתבצעת בשני מקומות (מסך LOGIN ו-MirageCrewSwap להחלפת איש
// צוות בעמדה), ולפני זה כל אחד מהם מיפה סטטוסים בעצמו — עם נוסחים שהתחילו
// להיפרד. מחזיר מפתח ולא טקסט מתורגם, כדי שהקורא יפעיל t() ושהבדיקה תרוץ
// בלי i18n.
//
// הבחנת ה-5xx היא הלב: כשהשרת של SKY-KING עצמו לא רץ, פרוקסי Vite מחזיר 500
// והמשתמש קיבל "שגיאה בכניסה" — כאילו הסיסמה שלו שגויה. בעמדה מבצעית ההבדל
// בין "טעיתי בסיסמה" ל"המערכת למטה" הוא ההבדל בין ניסיון נוסף לקריאה לתמיכה.

/** מה שהמיפוי צורך מתשובת ה-fetch — כדי שאפשר יהיה לבדוק בלי Response אמיתי */
export interface MirageErrorResponse {
  status: number;
  json: () => Promise<any>;
}

export async function mirageAuthErrorKey(res: MirageErrorResponse): Promise<string> {
  // 500 של פרוקסי Vite הוא text/plain — json() זורק, וזו לא סיבה לאבד את המיפוי
  const body = await res.json().catch(() => ({} as any));

  switch (res.status) {
    case 401:
      return body?.error === 'password_not_set'
        ? 'login.miragePasswordNotSet'
        : 'login.mirageBadCredentials';
    case 403:
      return body?.error === 'workstation_not_permitted'
        ? 'login.mirageWorkstationDenied'
        : 'login.mirageDenied';
    case 429:
      return 'login.mirageRateLimited';
    case 502:
      // 502 ספציפי: השרת שלנו חי אבל *המיראז'* לא ענה
      return 'login.mirageUnavailable';
    default:
      return res.status >= 500 ? 'login.errorServerDown' : 'login.errorLogin';
  }
}
