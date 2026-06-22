# SKY-KING — לוח שמיים ✈️

**Desk אלקטרוני חכם לבקרי טיסה ופקחי מגדל** — מחליף את הסדק הפלסטיק הפיזי
(לוח רישום שכותבים עליו בצ'ינו ומוחקים בפלנלית) במערכת דיגיטלית לרישום, ניהול
ותצוגה של מידע שדה אווירי וקרקעי באזורים המבצעיים.

מפותח ע"י **אורי לב** ו**אורי אלימלך** — בקרי טיסה בחיל האוויר.

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
| Database | PostgreSQL (Neon) — דרך `pg` |
| OCR | Tesseract.js (זיהוי כתב יד) |
| מפות | Leaflet, pdfjs-dist |
| Desktop | Electron (אריזה ל-Windows/Mac/Linux) |

---

## דרישות מקדימות

- **Node.js** 18+ ו-npm
- **PostgreSQL** — חיבור פעיל (מקומי או Neon)

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
> בהפצת Electron, ההגדרה נשמרת ב-`config.json` בתיקיית userData (ראה `config.example.json`).

### 3. הרצה בפיתוח
```bash
npm run dev
```
מריץ במקביל:
- **שרת API** על פורט `3001` (`node server.js`)
- **Vite dev** על פורט `5000` (עם HMR)

Vite מנתב `/api` ו-`/driver` אוטומטית לשרת ב-3001. פתח `http://localhost:5000`.

### 4. בדיקות
```bash
npm test           # vitest run — בדיקות יחידה ל-utils
npm run test:watch # מצב watch
```

### 5. בנייה לפרודקשן
```bash
npm run build      # tsc + vite build → dist/
npm run server     # מריץ את השרת שמגיש את dist/
```

### 6. אריזת Electron
```bash
npm run electron:dev          # הרצה מקומית כ-desktop
npm run electron:build:win    # אריזה ל-Windows (nsis)
npm run electron:build:mac    # אריזה ל-Mac (dmg)
npm run electron:build:linux  # אריזה ל-Linux (AppImage)
```

---

## מבנה הפרויקט

הקוד **מודולרי** (פורק משני מונוליטים — server.js ו-App.tsx):

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

> 📖 **לקטלוג מלא של כל מודול — ראה [SERVICES.md](SERVICES.md).**

---

## מסמכי הפרויקט

| מסמך | תוכן |
|------|------|
| [SERVICES.md](SERVICES.md) | קטלוג כל המודולים — שם, מיקום, תפקיד |
| [ARCHITECTURE.md](ARCHITECTURE.md) | מבנה מערכת, זרימת נתונים, דיאגרמות |
| [DEV_GUIDE.md](DEV_GUIDE.md) | מדריך מפתח — setup, conventions, glossary, FAQ |
| [data-model.md](data-model.md) | מבנה ה-DB |
| [USER_STORIES.md](USER_STORIES.md) | סטוריות משתמש |
| [REFACTOR_LOG.md](REFACTOR_LOG.md) | לוג שינויים ארגוניים + QA |
| [CLAUDE.md](CLAUDE.md) | הנחיות Claude Code + עקרונות הפרויקט |

---

## עקרונות ליבה

- **כל UI בעברית**, RTL, dark mode ברירת מחדל
- **DRY** — לא לשכפל רכיבים; רכיב משותף = שינוי אחד חל על כל המסכים
- **מהירות תפעולית** — כל פעולה חייבת להיות מהירה יותר מהסדק הפיזי
- **Event Log** — כל שינוי סטטוס נרשם ב-`activity_log`
