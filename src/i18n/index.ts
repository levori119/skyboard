import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import he from './locales/he.json';
import en from './locales/en.json';
import { buildResources } from './registry';
import { normalizeUiLanguage, resolveLock } from '../../shared/uiLanguage.js';

export const LANG_STORAGE_KEY = 'bt-lang';
/** נעילת השפה של הפריסה כפי שהשרת המרכזי מסר בפעם האחרונה (shared/uiLanguage.js) */
export const LANG_LOCK_KEY = 'sk-lang-lock';
export type AppLang = 'he' | 'en';

function readStorage(key: string): string | null {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null; } catch { return null; }
}

// הנעילה שמורה מקומית: הרינדור הראשון כבר בשפה הנכונה, וגם בנתק (אז עונה
// המאגר המקומי, שאינו סמכותי לגבי הנעילה)
let lockedLang: AppLang | null = normalizeUiLanguage(readStorage(LANG_LOCK_KEY));

// עברית = ברירת מחדל (לפי דרישת הצוות). נשמר ב-localStorage כדי שמסך ה-LOGIN יזכור.
const stored = readStorage(LANG_STORAGE_KEY) as AppLang | null;
const initialLang: AppLang = lockedLang ?? (stored === 'en' || stored === 'he' ? stored : 'he');

i18n.use(initReactI18next).init({
  // 'translation' — מפתחות מובְנים ידניים (t('login.x')) מ-he.json/en.json.
  // שאר ה-namespaces (ctrl/admin/ground/transfers/...) מגיעים מה-**registry**:
  // src/i18n/registry/<group>.json — שם חיים כל הטקסטים (he+en), לא בקוד.
  resources: {
    he: { translation: he, ...buildResources('he') },
    en: { translation: en, ...buildResources('en') },
  },
  ns: ['translation', 'admin', 'blocks', 'classic', 'crew', 'ctrl', 'dashboard', 'dataWindows',
       'ground', 'help', 'links', 'map', 'misc', 'pattern', 'pattern3d', 'permits', 'query', 'seizure', 'shared', 'strips', 'suggest',
       'transfers', 'trips', 'vertical'],
  defaultNS: 'translation',
  lng: initialLang,
  fallbackLng: 'he',
  interpolation: { escapeValue: false }, // React כבר בורח מ-XSS
  returnNull: false,
  // ⚠️ קריטי: ברירת המחדל של i18next היא init **אסינכרוני**. הרינדור הראשון של React
  // קורה לפני שהמשאבים נטענים, ואז tr() מחזיר את ה-defaultValue — שהוא המפתח.
  // מכיוון ש-tr() אינה hook, הרכיבים לא מרונדרים מחדש בסיום ה-init והמפתח נשאר על המסך.
  // המשאבים סטטיים (מיובאים), אז init סינכרוני בטוח ומיידי.
  initImmediate: false,
});

/**
 * דריסות מה-DB — מאפשרות לשנות שמות **בזמן ריצה, בלי build מחדש**.
 * נטען פעם אחת בעליית האפליקציה ממסך "ניהול תרגומים".
 * הקבצים ב-registry הם ברירת המחדל (ב-git); ה-DB דורס אותם.
 */
export async function loadTranslationOverrides(apiUrl: string) {
  try {
    const res = await fetch(`${apiUrl}/translations`);
    if (!res.ok) return;
    const rows: { key: string; he: string | null; en: string | null }[] = await res.json();
    for (const r of rows) {
      const dot = r.key.indexOf('.');
      if (dot < 1) continue;
      const ns = r.key.slice(0, dot);
      const k = r.key.slice(dot + 1);
      if (r.he) i18n.addResource('he', ns, k, r.he);
      // באנגלית: אם אין תרגום אנגלי, נשארים עם הנפילה לעברית
      if (r.en) i18n.addResource('en', ns, k, r.en);
      else if (r.he) i18n.addResource('en', ns, k, r.he);
    }
    i18n.emit('languageChanged', i18n.language); // מרענן את העץ
  } catch { /* אופליין / אין טבלה — ממשיכים עם ברירות המחדל מהקבצים */ }
}

/** השפה הנעולה של הפריסה, או null כשהמשתמש בוחר חופשית */
export function getLockedLanguage(): AppLang | null { return lockedLang; }

/** מחיל את תשובת `/api/ui-config`. תשובה לא סמכותית או פגומה = לא משנה כלום */
export function applyUiConfig(cfg: unknown) {
  const r = resolveLock(cfg);
  if (r.action === 'keep') return;
  lockedLang = r.lock;
  try {
    if (r.lock) localStorage.setItem(LANG_LOCK_KEY, r.lock);
    else localStorage.removeItem(LANG_LOCK_KEY);
  } catch { /* no-op */ }
  if (r.lock && i18n.language !== r.lock) i18n.changeLanguage(r.lock);
  // גם כשהשפה לא השתנתה: בורר השפה במסך הכניסה מופיע/נעלם לפי הנעילה
  else i18n.emit('languageChanged', i18n.language);
}

/** טוען את נעילת השפה מהשרת. נכשל בשקט (נתק) ונשאר עם השמורה */
export async function loadUiConfig(apiUrl: string) {
  try {
    const res = await fetch(`${apiUrl}/ui-config`);
    if (res.ok) applyUiConfig(await res.json());
  } catch { /* אופליין - ממשיכים עם הנעילה השמורה */ }
}

// שינוי שפה + התמדה. הכיווניות עצמה מטופלת במנגנון יחיד ב-root (useDirection).
// בפריסה נעולה אין החלפה - גם אם משהו קורא לזה
export function setAppLanguage(lang: AppLang) {
  if (lockedLang) return;
  try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch { /* no-op */ }
  i18n.changeLanguage(lang);
}

export default i18n;

