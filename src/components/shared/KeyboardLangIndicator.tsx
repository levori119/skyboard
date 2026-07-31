// מחוון מצב מקלדת - רכיב משותף לכל שדה סיסמה.
//
// למה: העמדה רצה במסך מלא ולכן מחוון השפה של Windows מוסתר, ובשדה סיסמה
// התווים מוסתרים - טעות שפה מתגלה רק אחרי כישלון הכניסה.
// כלל DRY: כל מסך שמבקש סיסמה משתמש ברכיב הזה, לא משכפל לוגיקה.
//
// עברית מסומנת בענבר כי סיסמאות הן לרוב לטיניות - זה מצב "שים לב".
// CAPS LOCK מוצג בנפרד, מאותה סיבה.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useKeyboardLanguage } from '../../hooks/useKeyboardLanguage';

interface Props {
  /** רקע כהה (תפריט/מודל כהה) לעומת בהיר (כרטיס ה-LOGIN) */
  dark?: boolean;
}

export default function KeyboardLangIndicator({ dark }: Props) {
  const { t } = useTranslation();
  const { lang, capsLock } = useKeyboardLanguage();

  const label =
    lang === 'he' ? t('login.keyboardHe')
    : lang === 'en' ? t('login.keyboardEn')
    : lang === 'other' ? t('login.keyboardOther')
    : '?';

  // ענבר = שים לב (עברית / CAPS), אחרת ניטרלי
  const alert = lang === 'he';
  const c = dark
    ? {
        bg: alert ? '#422006' : '#1e293b',
        border: alert ? '#b45309' : '#334155',
        text: alert ? '#fcd34d' : '#94a3b8',
        hint: '#64748b',
        capsBg: '#450a0a', capsBorder: '#b91c1c', capsText: '#fca5a5',
      }
    : {
        bg: alert ? '#fef3c7' : '#f1f5f9',
        border: alert ? '#f59e0b' : '#e2e8f0',
        text: alert ? '#92400e' : '#475569',
        hint: '#94a3b8',
        capsBg: '#fee2e2', capsBorder: '#ef4444', capsText: '#991b1b',
      };

  const pill: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '4px 11px', borderRadius: '999px',
    fontSize: '13px', fontWeight: 'bold', lineHeight: 1.6,
    whiteSpace: 'nowrap',
  };

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}
      aria-live="polite"
    >
      <span style={{ ...pill, background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
        <span aria-hidden="true">⌨️</span>
        <span>{t('login.keyboardLabel')}</span>
        <span data-testid="kbd-lang" dir="auto" style={{ unicodeBidi: 'isolate' }}>{label}</span>
      </span>
      {/* הרמז מוצג בשורה ולא כ-tooltip: מסך המגע של העמדה לא יודע hover */}
      {lang === 'unknown' && (
        <span style={{ fontSize: '12px', color: c.hint }}>{t('login.keyboardUnknownHint')}</span>
      )}
      {capsLock && (
        <span data-testid="kbd-caps" style={{ ...pill, background: c.capsBg, border: `1px solid ${c.capsBorder}`, color: c.capsText }}>
          ⇪ {t('login.capsLockOn')}
        </span>
      )}
    </div>
  );
}
