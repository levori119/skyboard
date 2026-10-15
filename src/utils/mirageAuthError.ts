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
      if (body?.error === 'workstation_not_permitted') return 'login.mirageWorkstationDenied';
      // עמדה בנתק שלא מכירה את המשתמש - לא שלילת הרשאה, אלא עמדה שעוד לא
      // קיבלה את המשתמשים מהמרכז (server/auth/mirageReplica.js)
      if (body?.error === 'no_local_credential') return 'login.localNoCredential';
      if (body?.error === 'local_credential_expired') return 'login.localCredentialExpired';
      return 'login.mirageDenied';
    case 429:
      return 'login.mirageRateLimited';
    case 502:
      // בעמדה (Electron / סוכן) ה-502 יכול להגיע מהפרוקסי של העמדה עצמה, כשהשרת
      // המרכזי לא עונה - ואז "מיראז' לא זמין" שולח את הפקח לחפש במקום הלא נכון
      // (electron/stationServer.cjs §כניסה בנתק). `upstream unreachable` הוא
      // הקוד של גרסאות עמדה קודמות.
      if (body?.error === 'central_unreachable') {
        return body?.local === 'starting'
          ? 'login.centralUnreachableLocalStarting'
          : 'login.centralUnreachable';
      }
      if (body?.error === 'upstream unreachable') return 'login.centralUnreachable';
      if (body?.error === 'central_timeout') return 'login.centralTimeout';
      // 502 של השרת המרכזי עצמו: הוא חי, *המיראז'* לא ענה
      return 'login.mirageUnavailable';
    default:
      return res.status >= 500 ? 'login.errorServerDown' : 'login.errorLogin';
  }
}
