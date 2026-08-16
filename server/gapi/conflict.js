// GAPI — פתרון התנגשויות (ראה GAPI-CONTRACT.md §8).
// בעלות שדה: תפעולי → GAPI מנצח · פנימי → SKYKING מנצח (לא נשלח כלל).
// version מונע החלה של אירוע ישן/כפול; updated_at הוא tiebreak (LWW).

// האם להחיל אירוע נכנס מ-GAPI על הרשומה הקיימת.
// - אין רשומה / אין version קיים → מחילים.
// - אין version נכנס → GAPI סמכותי → מחילים.
// - אחרת מחילים רק אם version נכנס > version קיים.
export function shouldApplyIncoming(incomingVersion, existingVersion) {
  if (existingVersion === null || existingVersion === undefined) return true;
  if (incomingVersion === null || incomingVersion === undefined) return true;
  return Number(incomingVersion) > Number(existingVersion);
}

// LWW על שדה משותף ששני הצדדים עשויים לערוך: הטרי מנצח, שוויון → GAPI (סמכותי).
export function gapiWinsByTime(gapiUpdatedAt, localUpdatedAt) {
  if (!localUpdatedAt) return true;
  if (!gapiUpdatedAt) return false;
  const g = new Date(gapiUpdatedAt).getTime();
  const l = new Date(localUpdatedAt).getTime();
  if (!Number.isFinite(g)) return false;
  if (!Number.isFinite(l)) return true;
  return g >= l; // שוויון → GAPI מנצח
}

// האם שינוי מקומי צריך להיכנס ל-outbox. מדכא echo: שינוי שמקורו בהחלת אירוע
// נכנס (fromGapi=true) לא נדחף חזרה. שאר השינויים (עריכת משתמש SKYKING) — כן.
export function shouldEnqueueOutbound({ fromGapi = false, enabled = false } = {}) {
  if (!enabled) return false;
  if (fromGapi) return false;
  return true;
}
