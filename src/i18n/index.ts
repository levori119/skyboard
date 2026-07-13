import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import he from './locales/he.json';
import en from './locales/en.json';
import { buildResources } from './registry';

export const LANG_STORAGE_KEY = 'bt-lang';
export type AppLang = 'he' | 'en';

// עברית = ברירת מחדל (לפי דרישת הצוות). נשמר ב-localStorage כדי שמסך ה-LOGIN יזכור.
const stored = (typeof localStorage !== 'undefined' && localStorage.getItem(LANG_STORAGE_KEY)) as AppLang | null;
const initialLang: AppLang = stored === 'en' || stored === 'he' ? stored : 'he';

i18n.use(initReactI18next).init({
  // 'translation' — מפתחות מובְנים ידניים (t('login.x')) מ-he.json/en.json.
  // שאר ה-namespaces (ctrl/admin/ground/transfers/...) מגיעים מה-**registry**:
  // src/i18n/registry/<group>.json — שם חיים כל הטקסטים (he+en), לא בקוד.
  resources: {
    he: { translation: he, ...buildResources('he') },
    en: { translation: en, ...buildResources('en') },
  },
  ns: ['translation', 'admin', 'blocks', 'classic', 'ctrl', 'dashboard',
       'ground', 'map', 'misc', 'query', 'shared', 'strips', 'transfers', 'vertical'],
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

// שינוי שפה + התמדה. הכיווניות עצמה מטופלת במנגנון יחיד ב-root (useDirection).
export function setAppLanguage(lang: AppLang) {
  try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch { /* no-op */ }
  i18n.changeLanguage(lang);
}

export default i18n;

