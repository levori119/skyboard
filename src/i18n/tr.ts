import i18n from './index';

/**
 * tr() — תרגום לפי **מפתח טכני** מה-registry:  tr('transfers.cancel')
 *
 * המחרוזות (עברית ואנגלית) חיות ב-src/i18n/registry/<group>.json ולא בקוד —
 * ולכן ניתן לשנות כל שם, בעברית או באנגלית, **בלי לגעת בקוד**
 * (ובזמן ריצה, דרך מסך "ניהול תרגומים", גם בלי build מחדש).
 *
 * ⚠️ למה `tr` ולא `t`:
 * השם `t` **מוצל** (shadowed) בעשרות מקומות — `const { t } = useTranslation()`,
 * וגם קולבקים כמו `.map(t => ...)`. במקרה כזה `t('ctrl.x')` היה קורא למשתנה
 * המקומי ומחזיר מפתח גולמי — **בלי ש-tsc יתפוס**. `tr` ייחודי ובטוח.
 *
 * זו פונקציה ברמת המודול (לא hook) בכוונה: יש עשרות רכיבים מקוננים ופונקציות
 * עזר שמרנדרות JSX, ו-hook לא יכול להיות ב-scope בכולם.
 * הריאקטיביות מגיעה מ-useDirection() ב-App, שמנוי לשינויי שפה ומרנדר מחדש את העץ.
 *
 * Degradation: מפתח בלי תרגום אנגלי נופל לעברית (ראה buildResources) — לעולם לא
 * מוצג מפתח גולמי למשתמש.
 */
export function tr(key: string): string {
  const dot = key.indexOf('.');
  if (dot < 1) return key;
  const ns = key.slice(0, dot);
  const k = key.slice(dot + 1);
  return i18n.t(k, { ns, keySeparator: false, nsSeparator: false, defaultValue: key }) as string;
}
