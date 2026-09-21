// קריאת התמה הפעילה מ-`body`, חי.
//
// למה hook ולא prop: יש רכיבים שיושבים **מעל** כל המסכים (חיווי הנתק, פקד
// הנתק המדומה) ואינם מקבלים prop דרך ארבעה ענפי ניתוב. המחלקות על `body`
// (`light-mode` / `ocean-mode`) כבר נקבעות ב-App וב-SectorDashboard, ולכן הן
// מקור האמת הזמין בכל מקום.
//
// ה-`MutationObserver` הוא מה שהופך את זה ל"חי": כשהמפעיל מחליף תמה, הרכיב
// מתעדכן מיד ולא נשאר בצבע הקודם עד הרינדור הבא.
//
// מקור אמת יחיד: הלוגיקה הזו נולדה בתוך `ConnectionBanner` ונשלפה החוצה
// ברגע שרכיב שני נזקק לה - כדי שלא יהיו שתי גרסאות שמתפצלות בשינוי הראשון.

import React from 'react';
import type { ThemeMode } from '../utils/themeMode';

export function useBodyTheme(override?: ThemeMode): ThemeMode {
  const read = React.useCallback((): ThemeMode => {
    if (override) return override;
    const c = document.body.classList;
    return c.contains('light-mode') ? 'light' : c.contains('ocean-mode') ? 'ocean' : 'dark';
  }, [override]);

  const [mode, setMode] = React.useState<ThemeMode>(read);

  React.useEffect(() => {
    setMode(read());
    const obs = new MutationObserver(() => setMode(read()));
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [read]);

  return mode;
}

export default useBodyTheme;
