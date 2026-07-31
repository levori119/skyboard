import React from 'react'
import ReactDOM from 'react-dom/client'
import './App.css'
import './i18n' // אתחול i18next (עברית ברירת מחדל) — חייב לפני רינדור
import { loadTranslationOverrides } from './i18n'
import { API_URL } from './config'
import { installEnvFetchInterceptor } from './utils/environment'
import { installPeekWriteGuard, installPeekPollThrottle } from './utils/stationPeek'
import App from './App'

// הפרדה בין פיתוח לפרודקשן: הרצה מקומית נצבעת ורוד (ראה body.dev-mode ב-App.css).
// הסימון נקבע כאן פעם אחת על body, ולכן חל על *כל* המסכים בלי שכפול.
// למה import.meta.env.DEV ולא בדיקת hostname: Vite מקפל את התנאי בזמן build, כך
// שבכל build של פרודקשן הקוד הזה נעלם לגמרי. זה קריטי בגלל Electron — האפליקציה
// הארוזה טוענת http://localhost:PORT (electron-main.cjs), ובדיקת hostname הייתה
// צובעת ורוד דווקא את עמדת העבודה החיה.
//
// 'bt-dev-marker' = 'off' מכבה את הסימון, ומשמש את ה-e2e כדי שתמונות הייחוס
// יתעדו את המוצר ולא את סביבת ההרצה (playwright.config.ts). בשונה מדגל 'bt-kiosk'
// אין כאן 'on': התנאי החיצוני חייב להישאר import.meta.env.DEV בלבד, אחרת הקוד
// ישרוד ל-bundle של פרודקשן ותיפתח דרך לצבוע עמדה חיה.
if (import.meta.env.DEV && localStorage.getItem('bt-dev-marker') !== 'off') {
  document.body.classList.add('dev-mode')
}

// סביבות תרגול: כל קריאת API נושאת את כותרת X-Env של הסביבה המחוברת. חייב
// להיות מותקן לפני כל fetch — כולל loadTranslationOverrides שרץ מיד למטה.
installEnvFetchInterceptor()

// מסגרת צפייה בעמדה אחרת (?peek=) — לקריאה בלבד. נעטף *אחרי* מתווך הסביבה כדי
// שכל כתיבה תיחסם עוד לפני שהיא מתויגת ונשלחת. בעמדה רגילה זו פעולה ריקה.
installPeekWriteGuard()
// ...ובנוסף ממתן את קצב הפולינג שלה, כדי שכמה ריבועים חיים לא יכפילו את העומס
installPeekPollThrottle()

// דריסות תרגום שנערכו במסך "ניהול תרגומים" — חלות בזמן ריצה, בלי build מחדש.
// לא חוסם רינדור: ברירות המחדל מהקבצים מוצגות מיד, והדריסות מתעדכנות כשהן מגיעות.
loadTranslationOverrides(API_URL)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
