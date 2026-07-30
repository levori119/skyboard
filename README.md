# SKY-KING - לוח שמיים ✈️

**Desk אלקטרוני חכם לבקרי טיסה ופקחי מגדל** - מחליף את הסדק הפלסטיק הפיזי
(לוח רישום שכותבים עליו בצ'ינו ומוחקים בפלנלית) במערכת דיגיטלית לרישום, ניהול
ותצוגה של מידע שדה אווירי וקרקעי באזורים המבצעיים.

מפותח ע"י **אורי לב** ו**אורי אלימלך** - בקרי טיסה בחיל האוויר.

---

## למי זה מיועד

| עמדה | קוד | תפקיד |
|------|-----|-------|
| בקר טיסה | CTRL | ניהול ורישום מידע שדה בשולחן הבקרה |
| מגדל פיקוח | TWR | ניהול שדה אווירי וקרקעי באזורים המבצעיים |

---

## Tech Stack

| שכבה | טכנולוגיה |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| UI | Tailwind CSS, Framer Motion, Lucide Icons |
| Backend | Node.js (ESM) + Express 5 |
| Database | PostgreSQL (Neon) - דרך `pg` |
| OCR | Tesseract.js (זיהוי כתב יד) |
| מפות | Leaflet, pdfjs-dist |
| Desktop | Electron (אריזה ל-Windows/Mac/Linux) |

---

## דרישות מקדימות

- **Node.js** 18+ ו-npm
- **PostgreSQL** - חיבור פעיל (מקומי או Neon)

---

## התקנה והרצה

### 1. התקנת תלויות
```bash
npm install
```

### 2. הגדרת חיבור ל-DB
צור קובץ `.env` בשורש הפרויקט:
```
DATABASE_URL=postgres://username:password@host:5432/database_name
PORT=3001
```
> בהפצת Electron זה נדרש רק במצב שרת מקומי (`"mode": "local"` ב-`config.json` שבתיקיית ה-userData,
> ראה `config.example.json`). עמדת ברירת המחדל היא **לקוח דק** מול Railway ואינה צריכה DB - ראה §6.

### 3. הרצה בפיתוח
```bash
npm run dev
```
מריץ במקביל:
- **שרת API** על פורט `3001` (`node server.js`)
- **Vite dev** על פורט `5000` (עם HMR)

Vite מנתב `/api` ו-`/driver` אוטומטית לשרת ב-3001. פתח `http://localhost:5000`.

**מיראז' (דמו - ניהול משתמשים והרשאות):** מסך ה-LOGIN מזדהה כברירת מחדל דרך מיראז'
(אפשר לבטל את הסימון ולהיכנס עם משתמשי המערכת). להרצת הדמו:
```bash
npm run mirage     # שרת מיראז' נפרד על פורט 7300 + מסך ניהול ב-http://localhost:7300
```
משתני סביבה: `MIRAGE_URL` (ברירת מחדל `http://localhost:7300`), `MIRAGE_PORT`, `MIRAGE_APP_NAME`,
`SKYKING_URL` (למיראז' - מקור שמות העמדות לתפריט הבחירה, ברירת מחדל `http://localhost:3001`).

**סיסמאות מיראז' (לפי התקן):** כל משתמש נדרש לסיסמה חזקה - 12+ תווים, אות גדולה, קטנה, ספרה
ותו מיוחד (NIST 800-63B). נשמרות מוצפנות (scrypt+salt) בלבד. **סיסמת הדמו של משתמשי ה-seed: `Demo!Mirage#26`**.
5 ניסיונות כושלים - חסימה לדקה. משתמש חדש במסך הניהול מחייב סיסמה; "עריכה" מחליפה סיסמה.

### 4. בדיקות
```bash
npm test           # vitest run - בדיקות יחידה ל-utils
npm run test:watch # מצב watch
```

### 5. בנייה לפרודקשן
```bash
npm run build      # tsc + vite build → dist/
npm run server     # מריץ את השרת שמגיש את dist/
```

### 6. עמדת Electron (kiosk)

חלון העמדה עולה תמיד **מסך מלא נעול**: `fullscreen` + `frame: false` (בלי X/מקסום/מיזעור) + `kiosk`.
`F11` משחרר/מחזיר את הנעילה · `F5` / `Ctrl+R` טעינה מחדש · `Ctrl+Shift+I` כלי פיתוח ·
`SKYKING_WINDOWED=1` מריץ בחלון רגיל לתחזוקה.

**א. לקוח דק מול Railway (ברירת המחדל בהפצה)** - העמדה רק מציגה; אין שרת מקומי ואין DB להגדיר:
```bash
npm run electron:railway            # kiosk מול https://sky-king.up.railway.app/
npm run electron:railway:windowed   # אותו דבר בחלון רגיל (בדיקות)
npm run electron:build:railway      # אריזה ללקוח דק → release-station/
```

**ב. עמדה עם שרת מקומי (legacy)** - אורזת את `dist/` + `server.js` ומצריכה `DATABASE_URL`:
```bash
npm run electron:dev          # הרצה מקומית (טוען את vite ב-5000)
npm run electron:build:win    # אריזה ל-Windows (nsis)
npm run electron:build:mac    # אריזה ל-Mac (dmg)
npm run electron:build:linux  # אריזה ל-Linux (AppImage)
```

**איזו כתובת נטענת** (לפי סדר קדימויות):

| מקור | מתי |
|------|-----|
| `SKYKING_STATION_URL` | משתנה סביבה - גובר על הכל (בדיקות). לא `SKYKING_URL`, שתפוס למיראז' |
| `config.json` → `"mode": "local"` | מריץ שרת מקומי בתוך העמדה (דורש `DATABASE_URL`) |
| `config.json` → `"APP_URL"` | הפניית עמדה לכתובת אחרת בלי לבנות מחדש |
| ברירת מחדל | פיתוח: `http://localhost:5000` · הפצה: `https://sky-king.up.railway.app/` |

`config.json` יושב בתיקיית ה-userData (`%APPDATA%\sky-king\config.json` ב-Windows) ונוצר אוטומטית בהרצה הראשונה.

**כשאין רשת:** מוצג מסך מצב מקומי ("אין חיבור לשרת" + סיבה בעברית + ספירה לאחור), וניסיון חוזר
אוטומטי ב-2/4/8/16/30 שניות. גם סטטוס HTTP ≥400 (למשל 502 בזמן פריסה מחדש ב-Railway) נחשב כשל
ומטופל כך - כדי שלא יוצג עמוד שגיאה זר על העמדה.

---

## מבנה הפרויקט

הקוד **מודולרי** (פורק משני מונוליטים - server.js ו-App.tsx):

```
server.js              ← entry point (initDb → seedDb → listen)
server/
  db/                  ← pool, init (schema), seed (נתונים)
  routes/              ← 14 קבצי API (353 endpoints)
  app.js               ← express setup
src/
  App.tsx              ← routing + מסך כניסה
  components/          ← views, admin, strips, transfers, map, ground, blocks, query, classic, shared
  utils/               ← scale, queryBuilder, strips, geo, digits, ...
  types/               ← הגדרות TypeScript
electron-main.cjs      ← עטיפת Electron
```

> 📖 **לקטלוג מלא של כל מודול - ראה [SERVICES.md](SERVICES.md).**

---

## מסמכי הפרויקט

| מסמך | תוכן |
|------|------|
| [SERVICES.md](SERVICES.md) | קטלוג כל המודולים - שם, מיקום, תפקיד |
| [SHARED_LANGUAGE.md](SHARED_LANGUAGE.md) | שפה משותפת - 19 השירותים בשם עסקי |
| [MAP_SERVICES.md](MAP_SERVICES.md) | שירותי מפה גנריים - עיגון, פוליגונים, דרכים, ניתוב |
| [DEPLOY.md](DEPLOY.md) | פריסה ל-Railway |
| [ARCHITECTURE.md](ARCHITECTURE.md) | מבנה מערכת, זרימת נתונים, דיאגרמות |
| [DEV_GUIDE.md](DEV_GUIDE.md) | מדריך מפתח - setup, conventions, glossary, FAQ |
| [data-model.md](data-model.md) | מבנה ה-DB |
| [USER_STORIES.md](USER_STORIES.md) | סטוריות משתמש |
| [REFACTOR_LOG.md](REFACTOR_LOG.md) | לוג שינויים ארגוניים + QA |
| [CLAUDE.md](CLAUDE.md) | הנחיות Claude Code + עקרונות הפרויקט |

---

## עקרונות ליבה

- **כל UI בעברית**, RTL, dark mode ברירת מחדל
- **DRY** - לא לשכפל רכיבים; רכיב משותף = שינוי אחד חל על כל המסכים
- **מהירות תפעולית** - כל פעולה חייבת להיות מהירה יותר מהסדק הפיזי
- **Event Log** - כל שינוי סטטוס נרשם ב-`activity_log`
