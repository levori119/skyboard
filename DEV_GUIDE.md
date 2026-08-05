# SKY-KING - מדריך מפתח (Developer Guide)

> מסמך onboarding מלא: כל מה שצריך לדעת כדי לעבוד על הפרויקט.
> עודכן: 2026-06-22.

---

## תוכן עניינים

1. [מה זה SKY-KING ב-30 שניות](#מה-זה-sky-king-ב-30-שניות)
2. [Setup סביבת פיתוח](#setup-סביבת-פיתוח)
3. [איך המערכת עובדת - זרימה](#איך-המערכת-עובדת--זרימה)
4. [מילון מונחים (Glossary)](#מילון-מונחים-glossary)
5. [מוסכמות קוד (Conventions)](#מוסכמות-קוד-conventions)
6. [משימות נפוצות (How-To)](#משימות-נפוצות-how-to)
7. [DB - עבודה עם הסכמה](#db--עבודה-עם-הסכמה)
8. [QA - לפני commit](#qa--לפני-commit)
9. [FAQ ובעיות נפוצות](#faq-ובעיות-נפוצות)
10. [סקילים זמינים](#סקילים-זמינים)

---

## מה זה SKY-KING ב-30 שניות

מערכת שמחליפה לוח רישום פיזי ("סדק") של בקרי טיסה. בקר/פקח מנהל **פ"מים** (פלוגות
מטוסים) - כל פ"מ הוא כרטיס (Strip) עם או"ק, טייסת, גובה, משימה. מעבירים פ"מים בין
עמדות (Transfers), עוקבים על מפה, מנהלים גבהים (בלוקים), שדה קרקעי (מגרש), ועוד.
שתי עמדות עיקריות: **בקר (CTRL)** ו**מגדל/פקח (TWR)** - מסכים שונים, רכיבים משותפים.

---

## Setup סביבת פיתוח

### צעדים ראשונים (יום ראשון)
1. `npm install`
2. צור `.env` עם `DATABASE_URL` + `PORT=3001` (ראה [README.md](README.md))
3. `npm run dev` → פתח `http://localhost:5000`
4. השרת (3001) מריץ `initDb()` (יוצר סכמה) ו-`seedDb()` (נתוני אתחול) אוטומטית בעלייה

### ארכיטקטורת הרצה
```
Browser :5000 (Vite + HMR)
   │  /api/*  ו-/driver  → proxy
   ▼
Express :3001 (server.js)
   │
   ▼
PostgreSQL (Neon, via DATABASE_URL)
```

### איך יודעים שזו סביבת פיתוח
**הרקע ורוד.** בהרצה מקומית המערכת צובעת את רקע העמוד בוורוד (`#ec4899`) ומקיפה את
החלון במסגרת ורודה - בשלוש האפליקציות: SKY-KING, מיראז' ו-GAPI. פרודקשן לעולם לא ורוד.

- **SKY-KING / GAPI** - הסימון מותנה ב-`import.meta.env.DEV`, ש-Vite מקפל בזמן build.
  **לא** בדיקת `hostname`: אפליקציית ה-Electron הארוזה טוענת `http://localhost:PORT`,
  ובדיקת מארח הייתה צובעת ורוד דווקא את עמדת העבודה החיה.
- **מיראז'** - מוגש כ-HTML סטטי בלי שלב build, ולכן שם הזיהוי הוא לפי מארח מקומי.
- הוורוד קבוע בכל התמות (צבע סטטוס), והמסגרת היא `pointer-events: none` - לעולם לא חוסמת קליק.
- הוא נשאר **מסביב** לתוכן ולא מתחתיו: משטח נתונים שקוף (טבלה) מקבל רקע אטום בחזרה, כדי שהקריאות לא תיפגע.

**כיבוי הסימון:** `localStorage['bt-dev-marker'] = 'off'`. [playwright.config.ts](playwright.config.ts)
מגדיר אותו דרך `storageState`, כדי שתמונות הייחוס ב-`e2e/__screenshots__/` יתעדו את המוצר
ולא את סביבת ההרצה (Playwright מריץ תמיד את שרת ה-vite, כלומר תמיד DEV).
בשונה מדגל `bt-kiosk` **אין ערך `'on'`**: התנאי החיצוני חייב להישאר `import.meta.env.DEV`
בלבד, אחרת הקוד ישרוד ל-bundle של פרודקשן ותיפתח דרך לצבוע עמדה חיה.

### פקודות
| פקודה | מה עושה |
|-------|---------|
| `npm run dev` | שרת + Vite במקביל (פיתוח) - הרקע ייצבע ורוד |
| `npm run server` | רק שרת API |
| `npm run build` | `tsc && vite build` → `dist/` |
| `npm test` | vitest - בדיקות יחידה ל-utils |
| `npx tsc --noEmit` | בדיקת טייפים בלבד (ה-QA gate המהיר) |
| `npm run electron:dev` | הרצה כ-desktop (טוען את vite המקומי ב-5000) |
| `npm run electron:railway` | עמדת kiosk מול Railway (לקוח דק) |
| `npm run electron:build:railway` | אריזת הלקוח הדק → `release-station/` |
| `npm run electron:build:railway:lite` | אותו לקוח דק בלי מנוע התמלול → `release-station-lite/` (~86MB) |
| `npm run electron:build:railway:lite:mac` | מתקין mac (DMG + ZIP, x64 + arm64) → `release-station-lite/`. **רק ממכונת mac**; מ-Windows יש להריץ את workflow `build-mac` ב-GitHub Actions |
| `npm run whisper:fetch` | מביא את מנוע התמלול הקולי ל-`vendor/whisper/` (~570MB, פעם אחת) |

### זיהוי קולי - למה יש שני מנועים

**ה-Web Speech API לא עובד ב-Electron.** `webkitSpeechRecognition` לא מזהה מקומית - הוא שולח את
האודיו לשירות ענן של גוגל, והמפתחות אליו קומפלו רק לתוך Chrome עצמו. בעמדה הקריאה נכשלת
כשנייה אחרי הלחיצה (`error: 'network'`), ולכן "המיקרופון נסגר מעצמו". באג ידוע ופתוח
([electron#46143](https://github.com/electron/electron/issues/46143)); `GOOGLE_API_KEY` **לא** עוזר.

לכן [src/utils/speech.ts](src/utils/speech.ts) בוחר מנוע לפי הסביבה:

| סביבה | מנוע | הערה |
|---|---|---|
| דפדפן (`npm run dev`) | Web Speech API | עובד מיד, בלי התקנה |
| עמדה (Electron) | whisper.cpp מקומי | דורש `npm run whisper:fetch` פעם אחת |

**בלי `whisper:fetch`, זיהוי קולי בעמדה יציג "מנוע התמלול לא מותקן" - זו לא תקלה.**
האודיו לא עוזב את העמדה. פרסור הפקודות (`parseVoiceCommand` ב-`SectorDashboard`) משותף
לשני המנועים - מוחלף רק מקור הטקסט.

---

## איך המערכת עובדת - זרימה

### מחזור חיי פ"מ (Strip)
```
יצירה → POST /api/strips  (status='queued')
  → מופיע בעמדה לפי filter_query / workstation_preset_id
  → עריכה inline (גובה/הערות) → PUT /api/strips/:id → activity_log
  → העברה: POST /api/strips/:id/transfer → strip_transfers (pending)
     → קבלה: /api/transfers/:id/accept   (sector_id מתעדכן)
     → דחייה: /api/transfers/:id/reject  (חוזר לשולח)
```

### פיצול פ"מ (Partial Formation)
פ"מ "חנית" עם 3 מטוסים → חולצים מטוס 1 → נוצר פ"מ חדש עם `aircraft_indices=[1]`,
שניהם מקבלים אותו `parent_strip_id` (root). פרטים מלאים ב-[data-model.md](data-model.md).

### סנכרון בין עמדות
**כרגע: polling** (~5 שניות). WebSocket עדיין לא מומש - ראה סקיל `/realtime`.

### עמידות בנתק - מה כל מפתח חייב לדעת

העמדה עובדת ברשת מבודדת וחייבת להמשיך לעבוד כשכבל הרשת מנותק. שלושה כללים
שנוגעים לכל קוד חדש:

**1. ❌ אסור למחוק מצב בכישלון רשת.**
```ts
// ❌ אסור - "אין המראות פעילות" הוא מידע שגוי, לא חוסר מידע
} catch { setActiveTakeoffs([]); }
// ✅ נכון - נשארים על המידע האחרון; הבאנר מסמן שהוא אינו חי
} catch { /* נתק — שומרים על המידע האחרון שהוצג */ }
```
זו תקלת **בטיחות**: מסך שמציג נתונים ריקים נראה תקין לבקר. מסך שקרס - לא.
(חריג לגיטימי: ניקוי בעקבות **החלפת מצב** - `if (!isGroundMode) setX([])` - זה
לא כישלון רשת.)

**2. אין צורך לשנות קריאות fetch.** [src/offline/apiFetch.ts](src/offline/apiFetch.ts)
מיירט את `fetch` הגלובלי: GET נשמר ב-IndexedDB ומוגש אוטומטית בנתק. כל
`fetch(\`${API_URL}/...\`)` קיים או חדש מקבל את זה בחינם.

**3. endpoint כתיבה חדש חייב סיווג ב-[policy.ts](src/offline/policy.ts).**
ברירת המחדל היא `shared` = **נחסם בנתק** (fail closed). אם הכתיבה שייכת לעמדה
או למשתמש בלבד ואף עמדה אחרת לא קוראת אותה - הוסף אותה ל-`PRIVATE_PATTERNS`
כדי שתישמר ב-outbox ותישלח כשהקשר חוזר.

> אימות: [e2e/offline-resilience.spec.ts](e2e/offline-resilience.spec.ts) מדמה
> שליפת כבל עם `route.abort('connectionfailed')`. ארכיטקטורה מלאה:
> [ARCHITECTURE.md](ARCHITECTURE.md#עמידות-בנתק).

---

## מילון מונחים (Glossary)

### מונחי דומיין (legacy → SKY-KING)
| מונח | פירוש |
|------|--------|
| **סדק** | לוח הרישום הפיזי - מה ש-SKY-KING מחליף |
| **צ'ינו** | עט הסימון על הסדק |
| **פלנלית** | מחיקה על הסדק |
| **פ"מ** | פלוגת מטוסים - היחידה המנוהלת (Strip) |
| **או"ק** | אות קריאה (callsign) - שם הפ"מ |
| **דת"ק** | מספר חניה של מטוס בודד |
| **כיפה** | מזהה ויזואלי של מטוס בודד |
| **שקדיה** | מערכת במטוס; 🌰 מוצג אם פעילה |
| **מז"א** | מצב מרחב אווירי (ראייה/התראה/מכשירים/סגור) |
| **יבה** | מערכת הגנה אווירית |
| **בלוק** | טווח גובה מוקצה למשימה |
| **מרחב** | קבוצת בלוקים (block space) |
| **נקודת העברה** | סקטור שאליו מעבירים פ"מ (sector) |
| **נקודת העברה קבועה** | מיקום שהוגדר לנקודה על המפה ב"ניהול עמדה" (`map_transfer_points`) ונטען אוטומטית בכל כניסה - במקום גרירה ידנית בכל משמרת |
| **סקטור (על המפה)** | מפת-בת שנחתכה ממפת אב (`maps.parent_map_id` + `parent_rect`). נוצרת ומנוהלת ב"מצב סקטור" של עורך האזורים. **בעמדה הוא תצוגה ולא מפה אחרת:** לחיצה על סקטור ברשימה שבפינת המפה ממקדת את **אותה** מפה על תחומו ("מפה מלאה" מחזירה) - כך הפ"ממים, האזורים ונקודות ההעברה נשארים חיים. אל תבלבל עם **סקטור** במובן נקודת העברה (טבלת `sectors`) |
| **מגרש** | עמדת המגדל / תצוגת השדה הקרקעי (GroundView) |
| **מסלול ראי** | מסלול ב"מסלולי הסעה" שנוצר אוטומטית ממסלול ההמראה שהוגדר ביישות "מסלולים" (`airfield_routes.source_runway_id`). כל שדותיו נגזרים משם, ההערה מציינת את המקור, והוא **אינו ניתן לעריכה** שם - עורכים ביישות שממנה הגיע |
| **בתק** | מצב טבלה (table mode) |
| **זמ"מ** | זמן מעל מטרה |
| **ע"ר / קא** | שדות זהות של הפ"מ |
| **BDH** | מערכת צ'ק-ליסטים מנוהלת ע"י ראש צוות |
| **סיריאל** | מספר סידורי משוייך לפ"מ לפי תחנת בקרה |
| **דסק משימה כללי** | סוג עמדה גנרי לרישום - שירותי אמצעים/טקסט חופשי/טבלה חכמה (MissionDeskBody, רץ בתוך SectorDashboard כמו כל עמדה) |
| **עמדה נצפית** | עמדה שמוצגת כריבוע חי בסרגל התחתון של עמדה אחרת (StationPeekBar) - לקריאה בלבד |
| **מצב צפייה (peek)** | האפליקציה שנטענת בכתובת `?peek=<presetId>` בתוך מסגרת הריבוע: מציגה עמדה אחרת, חוסמת כל כתיבה ל-API וממתנת את הפולינג |
| **חברי העמדה** | מי יושב על העמדה במשמרת (`workstation_session_roles`). נרשם בעליית העמדה ומתעדכן מ"עדכון חברי העמדה" בתפריט המשתמש - אותו רכיב, `StationCrewForm`. **עליית עמדה = הרכב חדש:** הטופס נפתח נקי ורק שדה הבקר/פקח מתמלא במשתמש שנכנס; העדכון והתחקיר טוענים את ההרכב השמור |
| **בקר / פקח** | אותו תפקיד באותו תא (`bakar`): "בקר" בעמדת יב"א, "פקח" בעמדת מגדל. התווית נגזרת מ-`preset_role` |
| **אחורי** | איש הצוות התומך בבקר/פקח |
| **מש"ק** | מש"ק העמדה |
| **קש"פ** | קשר פנים - **מספר**, לא שם |
| **משגיח / מושגח** | משגיח = מי שמשגיח; מושגח = מי שנמצא תחת השגחתו. לבקר/פקח, למפעיל ולמש"ק יכול להיות מושגח - שדה המושגח נפתח בצד שורת האב רק אחרי סימון דגל "קיים משגיח" |
| **תחקיר** | רישום אירוע בעמדה (`debriefs`): חברי הצוות, זמן, מהות, סיווג, פירוט, אחריות, מעורבים וצילום מסך העמדה. נפתח מ"צור תחקיר" בתפריט המשתמש |
| **תפקיד מקצועי** | `positions` במיראז' (בקר / פקח / מש"ק / מפעיל) - **ציר נפרד מההרשאה**. בקר ופקח הם שני מקצועות: יב"א שואבת מהבקרים, מגדל מהפקחים. קובע מאיזה תפריט אנשים כל שדה בטופס חברי העמדה נשאב. ריק = מופיע בכל התפריטים |
| **משמרת עמדה** | מקטע זמן שבו הרכב מסוים ישב על עמדה (`station_sessions`). נסגר ונפתח מחדש בכל החלפת משתמש או עדכון חברי עמדה, ונסגר ביציאה - כדי שהשעות יהיו מדויקות לכל אדם |
| **כשירויות** | מסך שעות העמדה לכל איש צוות, בטבלה או בגרף (ימים/שבועות/חודשים/שנים). נבנה מ-`station_sessions` |
| **כח אדם** | תפקיד `manpower` במיראז' - פותח את מסך "כ"א ותחקירים" ב-LOGIN. הרשאת קריאה, לא הרשאת ניהול. **נוספת ולא חלופית**: אפשר מנהל + כ"א או ראש צוות + כ"א |
| **יחידה** | גוף בשטח (`units`, יב"א / מגדל / אחר) - **נפרד מעמדה**, שהיא תצורת תצוגה במערכת. מנוהל במסך הניהול, לשונית "יחידות", ומשמש כרשימת ערכים ל"מעורבים בתחקיר" |

### מונחים טכניים
| מונח | פירוש |
|------|--------|
| **CTRL** | עמדת בקר טיסה (SectorDashboard) |
| **TWR** | עמדת מגדל פיקוח (GroundView) |
| **preset** | תצורת עמדה (workstation_preset) |
| **Query DSL** | מנוע סינון פ"מים (AND/OR/NOT) - `utils/queryBuilder` |
| **חלון נתונים** | מונה מוגדר-שאילתא שצף מעל מפת השדה בעמדה. מוגדר בניהול (`workstation_presets.data_windows`), מוזז/מוסתר ע"י הפקח בסשן שלו - `utils/dataWindows` |
| **שדה זמן בשאילתא** | `takeoff_time` / `planned_landing_time`. ההשוואה עליהם היא **בדקות מעכשיו** ("פחות מ-15"), לא השוואת מחרוזות |
| **זמן נחיתה מתוכנן** | `strips.planned_landing_time` (TIMESTAMPTZ). **לא** `strip_transfers.eta_minutes` - זו ספירה לאחור לנקודת העברה |
| **SG** | Strip Grid - פריסת תאים בכרטיס סטריפ |
| **SW** | Strip Window - פריסת waypoints |
| **flight zones** | מצב שיוך פ"מ לאזור גובה על מפה |
| **MD** | Mission Desk - עץ פריסה ושירותים של דסק משימה כללי (`types/missionDesk`) |

---

## מוסכמות קוד (Conventions)

### חובה
1. **כל טקסט UI בעברית** (כולל placeholders, errors, tooltips)
2. **RTL + dark mode** - ברירת מחדל
3. **DRY** - לפני יצירת רכיב, לבדוק ב-[SERVICES.md](SERVICES.md) אם קיים
4. **Event Log** - כל שינוי סטטוס → `POST /api/activity-log`
5. **אישור לפני מחיקה** - `customConfirm()` (לא `window.confirm`)

### מבנה מודולים - כלל השכבות
```
Entry → Views → Feature Components → Shared Components → Utils → Types
```
שכבה מייבאת **רק** משכבות מתחתיה. אין תלויות מעגליות.

### קונבנציות קבצים
- רכיב React = `PascalCase.tsx`, מייצא default + named
- util = `camelCase.ts`, מייצא named בלבד
- type = ב-`src/types/`
- API route = `server/routes/<domain>.js`, מייצא `express.Router`

### Backend
- כל route מייבא `pool` מ-`server/db/pool.js`
- שמירת JSONB: `JSON.stringify` בכתיבה
- שגיאות: `res.status(500).json({ error })`

---

## משימות נפוצות (How-To)

### להוסיף API endpoint חדש
1. מצא את הקובץ הנכון ב-`server/routes/` (לפי דומיין)
2. הוסף `router.get/post(...)` - ייבא `pool` אם צריך
3. אם נדרשת טבלה/עמדה חדשה ב-DB → ראה [DB](#db--עבודה-עם-הסכמה)

### להוסיף רכיב frontend
1. בדוק ב-[SERVICES.md](SERVICES.md) שאין רכיב דומה (DRY)
2. צור תחת התיקייה המתאימה ב-`src/components/<area>/`
3. ייבא utils/types משכבות מתחת
4. הוסף לקטלוג ב-SERVICES.md

### לערוך view קיים
- CTRL → `src/components/views/SectorDashboard.tsx`
- TWR → `src/components/views/GroundView.tsx`
- admin → `src/components/admin/ManagementPage.tsx`

### לחפש איפה קוד נמצא
**תמיד להתחיל מ-[SERVICES.md](SERVICES.md)** - קטלוג מלא. אחרת `grep` בתיקייה הרלוונטית.

---

## i18n - דו-לשוניות (עברית/אנגלית)

עברית = **ברירת מחדל**; אנגלית נבחרת. בורר שפה במסך ה-LOGIN, נשמר ב-`localStorage['bt-lang']`.
תשתית: `react-i18next` תחת `src/i18n/` (init: `index.ts`, קבצי תרגום: `locales/he.json` + `locales/en.json`, hook כיווניות: `useDirection.ts`).

### שתי דרכים לתרגם - מתי כל אחת

**1. `tr('טקסט בעברית')` - ברירת המחדל לרוב הקוד.**
המחרוזת העברית **היא המפתח**. הקוד נשאר קריא בעברית לצוות.
```tsx
import { tr } from '../../i18n/tr';
<button>{tr('בטל העברה')}</button>   // he: 'בטל העברה' | en: 'Cancel transfer'
```
- להוספת תרגום: שורה ב-[src/i18n/locales/ui.en.json](src/i18n/locales/ui.en.json) - `"בטל העברה": "Cancel transfer"`.
- **בלי תרגום המחרוזת פשוט נשארת בעברית** - לעולם לא מוצג מפתח גולמי.
- `tr` היא **פונקציה ברמת המודול, לא hook** - בכוונה: יש עשרות רכיבים מקוננים ופונקציות עזר שמרנדרות JSX, ו-hook לא יכול להיות ב-scope בכולם. הריאקטיביות מגיעה מ-`useDirection()` ב-App שמרנדר מחדש את העץ בשינוי שפה.

**2. `t('ns.key')` - למחרוזות עם interpolation או מבנה.**
```tsx
const { t } = useTranslation();
t('login.crewMember', { name })   // "איש צוות: אורי לב"
```
⚠️ **אל תשתמש במשתנה בשם `count`** - i18next מפרש אותו כטריגר לרבים (plural) ושובר את ה-interpolation. השתמש ב-`total`/`n`.

### 🚨 מה **אסור** לעטוף
**רק טקסט תצוגה.** אין לעטוף **ערכי-נתונים** שמושווים או נשמרים ב-DB:
```tsx
if (s.status === 'עוזב אזור')   // ❌ אסור לעטוף - ישבור את הלוגיקה!
```
סטטוסים כמו `'תקין'`, `'שמיש'`, `'תקול'`, `'באזור'`, `'בדרך לאזור'`, `'עוזב אזור'` הם **ערכי enum**, לא טקסט. ה-codemod מדלג עליהם בכוונה.

### 🛡 שומר ה-i18n (רץ ב-`npm test`)
[src/i18n/i18n-guard.test.ts](src/i18n/i18n-guard.test.ts) **מכשיל את הבדיקות** אם:
1. יש טקסט עברי ב-JSX (`>טקסט<`)
2. יש טקסט עברי ב-`title`/`placeholder`/`aria-label`/`alt`
3. יש `tr('group.key')` שאין לו מפתח ב-registry (מפתח יתום)
4. יש מפתח ב-registry בלי טקסט עברי

**זה מה שמונע מהטבלה להתיישן.** כל שדה/פעולה חדשים חייבים להירשם ב-registry.
חריגים מוצדקים ב-`ALLOWLIST` שבקובץ - כל תוספת דורשת נימוק.

### כלי אוטומציה
```bash
node scripts/i18n-codemod.mjs <file>          # dry-run: מה ייעטף
node scripts/i18n-codemod.mjs <file> --write  # עוטף JSX text + title/placeholder בלבד
node scripts/i18n-build-registry.mjs          # בונה מחדש את קבצי ה-registry
```

### כיווניות (RTL/LTR) - קריטי
- ה-`dir` מנוהל **רק** ב-root (`useDirection` מעדכן `<html dir>`). **אל** תוסיף `direction: 'rtl'` inline - זה ישבור LTR באנגלית. אם צריך כיוון מקומי: `dir={i18n.dir()}`.
- **חובה CSS logical properties:** `marginInlineStart/End`, `paddingInlineStart/End`, `insetInlineStart/End`, `textAlign: 'start'/'end'` - **לא** `marginLeft/Right`, `left/right`, `textAlign:'left'`. כך הפריסה מתהפכת אוטומטית.
- **טקסט שהמשתמש הזין - לעטוף ב-`bidiAuto`** ([src/utils/bidi.ts](src/utils/bidi.ts)). שם שמתחיל בספרה (`61 צפון`) נקרא הפוך (`צפון 61`) כשכיוון הבסיס LTR - כלומר בכל המסך במצב אנגלית, ובאזור המפה גם בעברית (`#map-area` יושב במיכל `dir="ltr"` מכוון). `bidiAuto` = `dir="auto"` ברמת המחרוזת (FSI/PDI), ולכן עובד גם ב-SVG `<text>` שאין בו `dir`. `direction: 'rtl'` קשיח **אינו** תחליף - הוא שובר שם לטיני (`61 North` ← `North 61`).

### אימות (חובה - bדיקות סטטיות לא מספיקות)
```bash
npm run test:e2e     # Playwright: מוודא dir=rtl/ltr, שהטקסט מתורגם, ושאין גלישה
```
`tsc`/`build`/unit **לא יכולים** לתפוס "המסך לא התהפך". ה-e2e כן.
טיפ: אחרי המרת פריסה ל-logical properties - **הצילום בעברית חייב לצאת זהה פיקסלית**
(ב-RTL, `marginInlineStart` ≡ `marginRight`). כל סטייה = שגיאת מיפוי.

### מצב נוכחי
- **עטופות:** 1,382 מחרוזות ב-16 רכיבים (LOGIN, SectorDashboard, ManagementPage, GroundView, ...).
- **מתורגמות לאנגלית:** 398. היתר מוצגות בעברית עד שיתורגמו (הוסף ל-`ui.en.json`).
- **פריסה:** SectorDashboard הומר במלואו ל-logical properties ומתהפך ל-LTR.
- **עתידי:** שכבת שמות ה-DB (`*_en` לסקטורים/עמדות) - טרם.

---

## DB - עבודה עם הסכמה

- **סכמה** מוגדרת ב-`server/db/init.js` (`CREATE TABLE` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`)
- **נתוני אתחול** ב-`server/db/seed.js` (`ON CONFLICT DO NOTHING`)
- **טבלה/עמודה חדשה:** הוסף `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` ל-`init.js`, ועדכן [data-model.md](data-model.md)
- **לעולם לא** לשנות `CREATE TABLE` קיים - רק להוסיף `ALTER`
- **אין** `DROP COLUMN` / `DELETE` ללא אישור
- ~50 טבלאות. ליבה: `strips`, `strip_aircraft`, `strip_transfers`, `sectors`, `workstation_presets`, `crew_members`, `activity_log`

---

## QA - לפני commit

הרץ תמיד:
```bash
npx tsc --noEmit     # חייב לעבור נקי
npm test             # בדיקות יחידה (vitest) - חייב לעבור נקי
npx vite build       # bundle נבנה (זמן ~10-20ש')
```
> **בדיקות:** קבצי `*.test.ts` ליד הקוד ב-`src/utils/`. כיסוי נוכחי: strips, queryBuilder, geo, notes, aircraft, stripGrid, stripWindow (68 בדיקות). הוסף בדיקות לכל util/לוגיקה טהורה חדשה.
> **טיפ:** ה-bundle המיוצב הוא ~2,699 kB. שינוי משמעותי בגודל = בדוק שלא הוספת import כבד מיותר.

Checklist:
- [ ] tsc + build עוברים
- [ ] כל UI בעברית
- [ ] רכיב חדש לא משכפל קיים
- [ ] Event Log לשינוי סטטוס
- [ ] עודכן SERVICES.md אם נוסף מודול

---

## FAQ ובעיות נפוצות

**ש: השרת לא עולה / "DATABASE_URL not set"**
ת: ודא `.env` קיים עם `DATABASE_URL` תקין.

**ש: `/api` מחזיר 404 בפיתוח**
ת: השרת (3001) לא רץ. `npm run dev` מריץ את שניהם; אם רצת רק `vite`, הוסף `npm run server`.

**ש: שינוי בקוד לא מופיע**
ת: Vite HMR אמור לעדכן אוטומטית. שינוי ב-`server/` דורש restart של השרת.

**ש: tsc נכשל אחרי שהזזתי קוד**
ת: כנראה חסר import של type/helper משותף. tsc יציין את השם - ייבא מהמודול הנכון (ראה SERVICES.md).

**ש: איפה הקוד של X?**
ת: [SERVICES.md](SERVICES.md) - קטלוג מלא לפי תפקיד.

**ש: בפרודקשן המסך קופץ למסך מלא בכניסה לעמדה - למה, ואיך מבטלים?**
ת: זו התנהגות מכוונת ([src/utils/kiosk.ts](src/utils/kiosk.ts)): עליית עמדה = מסך מלא כמו F11,
בלי שורת כתובת ובלי טאבים, כדי שכל השטח יהיה לוח מידע השדה. יציאה זמנית: `Esc` או `F11`.
ביטול קבוע בעמדה: `localStorage.setItem('bt-kiosk','off')`. לאימות בפיתוח (בלי build):
`localStorage.setItem('bt-kiosk','on')`.

**ב-Electron זה חזק יותר** ([electron-main.cjs](electron-main.cjs)): החלון עצמו נפתח
`fullscreen: true` + `frame: false` (אין X / מקסום / מיזעור) + `kiosk: true` (נעילת מסך מלא),
**גם ב-`npm run electron:dev` וגם בגרסה הארוזה** - מה שנבדק הוא מה שרץ בעמדה.
לתחזוקה: `F11` משחרר/מחזיר את הנעילה, `F5`/`Ctrl+R` טוענים מחדש, `Ctrl+Shift+I` כלי פיתוח,
`Alt+F4` סוגר, ו-`SKYKING_WINDOWED=1` מריץ בחלון רגיל
(`$env:SKYKING_WINDOWED=1; npm run electron:dev`).

**ש: מאיפה עמדת ה-Electron טוענת את האפליקציה?**
ת: העמדה היא **לקוח דק** - בהפצה היא טוענת את `https://sky-king.up.railway.app/` (Railway), בלי שרת
מקומי ובלי `DATABASE_URL`. סדר הקדימויות: `SKYKING_STATION_URL` (משתנה סביבה; **לא** `SKYKING_URL`,
שתפוס למיראז') → `config.json`: `"mode":"local"` (שרת מקומי, legacy) → `config.json`: `"APP_URL"` →
ברירת מחדל (פיתוח: `localhost:5000`, הפצה: Railway). כשאין רשת מוצג
[electron-status.html](electron-status.html) עם סיבה בעברית וניסיון חוזר ב-2/4/8/16/30 שניות.
פירוט: [README.md](README.md) §6.

---

## סקילים זמינים

הפרויקט מוגדר עם סקילים של Claude Code (`.claude/skills/`):

| סקיל | מתי |
|------|-----|
| `/pm` | לפני feature - סטוריית משתמש + acceptance criteria |
| `/arch` | תכנון טכני |
| `/before` | gate לפני קוד |
| `/qa` | בדיקה לפני done |
| `/migrate` | שינוי DB |
| `/transfer-logic` | עבודה על מנגנון העברות |
| `/ctrl-view` / `/ground-view` | context לעמדת בקר / מגדל |
| `/realtime` | מעבר ל-WebSocket |
| `/status` | דו"ח מצב |
| `/seed` | נתוני אתחול |

פירוט מלא ב-[CLAUDE.md](CLAUDE.md).
