import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import he from './locales/he.json';
import en from './locales/en.json';
import uiEn from './locales/ui.en.json';

export const LANG_STORAGE_KEY = 'bt-lang';
export type AppLang = 'he' | 'en';

// עברית = ברירת מחדל (לפי דרישת הצוות). נשמר ב-localStorage כדי שמסך ה-LOGIN יזכור.
const stored = (typeof localStorage !== 'undefined' && localStorage.getItem(LANG_STORAGE_KEY)) as AppLang | null;
const initialLang: AppLang = stored === 'en' || stored === 'he' ? stored : 'he';

i18n.use(initReactI18next).init({
  // 'translation' = ברירת המחדל, מפתחות מובְנים (t('login.x')).
  // 'ui'          = מפתחות שהם המחרוזת העברית עצמה (ראה useTr). ב-he ריק בכוונה:
  //                 ה-defaultValue מחזיר את המפתח, שהוא כבר העברית.
  resources: {
    he: { translation: he, ui: {} },
    en: { translation: en, ui: uiEn },
  },
  lng: initialLang,
  fallbackLng: 'he',
  interpolation: { escapeValue: false }, // React כבר בורח מ-XSS
  returnNull: false,
});

// שינוי שפה + התמדה. הכיווניות עצמה מטופלת במנגנון יחיד ב-root (useDirection).
export function setAppLanguage(lang: AppLang) {
  try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch { /* no-op */ }
  i18n.changeLanguage(lang);
}

export default i18n;
