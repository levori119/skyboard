import React from 'react'
import ReactDOM from 'react-dom/client'
import './App.css'
import './i18n' // אתחול i18next (עברית ברירת מחדל) — חייב לפני רינדור
import { loadTranslationOverrides } from './i18n'
import { API_URL } from './config'
import { installEnvFetchInterceptor } from './utils/environment'
import App from './App'

// סביבות תרגול: כל קריאת API נושאת את כותרת X-Env של הסביבה המחוברת. חייב
// להיות מותקן לפני כל fetch — כולל loadTranslationOverrides שרץ מיד למטה.
installEnvFetchInterceptor()

// דריסות תרגום שנערכו במסך "ניהול תרגומים" — חלות בזמן ריצה, בלי build מחדש.
// לא חוסם רינדור: ברירות המחדל מהקבצים מוצגות מיד, והדריסות מתעדכנות כשהן מגיעות.
loadTranslationOverrides(API_URL)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
