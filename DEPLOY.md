# SKY-KING — פריסה ל-Railway

> מדריך פריסת גרסת ה-web (השרת מגיש את ה-frontend + API). עודכן: 2026-06-22.
> אומת מקומית: build + שרת `NODE_ENV=production` מגיש `/` (SPA) ו-`/api/*` מאותו origin.

---

## מה כבר מוכן בקוד
- `package.json` → `start: node server.js` (Railway מריץ `npm start`)
- `railway.json` → build: `npm run build`, start: `npm run start`
- `server.js` → מאזין על `process.env.PORT` (Railway מזריק PORT אוטומטית) ✅
- `server/app.js` → ב-`NODE_ENV=production` מגיש את `dist/` + `/api` מאותו origin; route של SPA מקבל `index.html` ✅

---

## צעדים ב-Railway
1. **railway.app** → התחבר עם GitHub.
2. **New Project → Deploy from GitHub repo → `levori119/skyboard`**.
3. **Variables** (Settings → Variables) — הוסף:
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | ה-connection string של Neon (אותו אחד מ-`.env`) |
   | `NODE_ENV` | `production` |
   > `PORT` — אל תגדיר; Railway מזריק אוטומטית.
4. Railway יבנה (`npm run build`) ויריץ (`npm start`). בסיום — יינתן URL ציבורי.

---

## אימות אחרי deploy
- פתח את ה-URL → מסך הכניסה אמור להיטען.
- `<URL>/api/sectors` → JSON.
- אם רואים מסך לבן / redirect מוזר → כנראה `NODE_ENV=production` לא הוגדר (השרת חושב שהוא ב-dev ומנסה לנתב ל-vite).

---

## תקלות נפוצות
| תקלה | סיבה / פתרון |
|---|---|
| build נכשל: `vite: not found` / `tsc: not found` | devDependencies לא הותקנו בבנייה. Railway/Railpack בד"כ מתקין dev ל-build; אם לא — הוסף Variable `NIXPACKS_INSTALL_CMD=npm install --include=dev` או העבר את `vite`+`typescript` ל-dependencies. |
| מסך לבן / redirect ל-localhost:5000 | חסר `NODE_ENV=production`. |
| `DATABASE_URL not set` / 500 | חסר/שגוי `DATABASE_URL` ב-Variables. |
| השרת לא עולה | בדוק שה-PORT לא hardcoded — server.js משתמש ב-`process.env.PORT` ✅. |

---

## הערות
- **DB:** נשאר Neon (ענן). Railway מתחבר אליו דרך `DATABASE_URL`. אפשר גם Postgres של Railway — אז להחליף את ה-URL ולהריץ `initDb`+`seedDb` (קורה אוטומטית בעלייה).
- **timezone:** Railway רץ ב-UTC → אין הסטת שעות (וגם תוקן ב-DB עם `timestamptz`).
- **Auto-deploy:** כל push ל-`main` יפרוס מחדש אוטומטית.
- **Electron (desktop):** נפרד — Railway הוא לגרסת ה-web בלבד.
