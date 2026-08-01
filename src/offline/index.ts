// עמידות בנתק — נקודת כניסה אחת.
//
// הרקע: העמדה עובדת ברשת מבודדת (נתיב רקיע) מול DB SKY-KING. שני נתקים
// אפשריים — GAPI↔DB (מטופל בשרת, server/gapi/outbox.js) ו-DB↔עמדה (מטופל כאן).
// הדרישה: גם כשכבל הרשת של העמדה מנותק, ממשיכים לעבוד על המידע שהיה נכון
// לרגע הנתק, בלי שיתוף בין עמדות, ובלי שהמסך יציג מידע שגוי.
//
// מפת המודולים:
//   policy.ts    — מה מותר לכתוב בנתק (פרטי) ומה נחסם (משותף)
//   store.ts     — אחסון מקומי (IndexedDB, עם נפילה לזיכרון)
//   outbox.ts    — תור כתיבות פרטיות שממתין לחזרת הקשר
//   netStatus.ts — מצב הקשר וגיל המידע, מקור אמת יחיד לממשק
//   apiFetch.ts  — היירוט שמחבר את הכל
//   useNetStatus — hook לרכיבי React

export { installOfflineFetch, createOfflineFetch, cacheKey, BLOCKED_CODE, HDR_FROM_CACHE, HDR_CACHED_AT } from './apiFetch';
export { classifyWrite, isApiRequest, normalizePath, type WritePolicy } from './policy';
export { getNetSnapshot, subscribeNet, dataAgeMs, type NetSnapshot } from './netStatus';
export { useNetStatus, formatAge } from './useNetStatus';
