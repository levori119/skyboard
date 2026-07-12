import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * מנגנון יחיד לכיווניות: מסנכרן את `dir` ו-`lang` ברמת ה-<html> לפי השפה הפעילה.
 * עברית → rtl, English → ltr. כל שאר הרכיבים יורשים את הכיוון הזה
 * (לכן קוד חדש חייב CSS logical properties — marginInlineStart וכו' — לא left/right).
 */
export function useDirection(): 'rtl' | 'ltr' {
  const { i18n } = useTranslation();
  const dir = i18n.dir();
  useEffect(() => {
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', i18n.language);
  }, [dir, i18n.language]);
  return dir as 'rtl' | 'ltr';
}
