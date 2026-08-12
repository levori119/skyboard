# SKY-KING - פריסה ל-Railway

> מדריך פריסת גרסת ה-web (השרת מגיש את ה-frontend + API). עודכן: 2026-06-22.
> אומת מקומית: build + שרת `NODE_ENV=production` מגיש `/` (SPA) ו-`/api/*` מאותו origin.

---

## מה כבר מוכן בקוד
- `package.json` → `start: node server.js` (Railway מריץ `npm start`)
- `railway.json` → builder: Dockerfile, start: `npm run start`, `healthcheckPath: /api/health`
- `server.js` → מאזין על `process.env.PORT` ב-`0.0.0.0` **מיד**, ומעלה את ה-DB ברקע ✅
- `server/app.js` → ב-`NODE_ENV=production` מגיש את `dist/` + `/api` מאותו origin; route של SPA מקבל `index.html` ✅
- `GET /api/health` → **liveness**. עונה בלי לגעת ב-DB. `phase`: `booting` (200) / `ready` (200) / `failed` (503 + סיבה) ✅
- `GET /api/ready` → **readiness**. 503 כל עוד העלייה לא הושלמה או שה-DB לא מגיב תוך 3ש'; אחרת 200 + `dbLatencyMs`.
  **זה ה-endpoint ש-load balancer צריך לנטר** כדי לנתב תעבורה הצידה ממופע פגום. אל תשתמש בו כ-healthcheck של Railway: בזמן עלייה הוא 503 והקונטיינר היה נהרג באמצע `initDb`. ראה [ARCHITECTURE.md](ARCHITECTURE.md#יתירות-ו-failover)

### למה השרת מאזין לפני שה-DB עולה
שרשרת העלייה (`initDb` → `seedDb` → `checkTableClassification` → `syncAllEnvSchemas`)
נמדדה ב-**~36 שניות ממחשב מקומי מול Neon** (`initDb` לבדו ~29ש', כי הוא ~300
round-trips סדרתיים). מ-Railway, שיושב באזור אחר מ-Neon, זה ארוך משמעותית.

קודם `app.listen` חיכה לסיום השרשרת - ולכן כל אותו זמן הקונטיינר היה חי **בלי מאזין**,
ו-Railway החזיר `Application failed to respond` (502) בלי שום שגיאה בלוג.
עכשיו הפורט נתפס תוך ~0.3ש' ו-`/api/health` מדווח על ההתקדמות.

---

## צעדים ב-Railway
1. **railway.app** → התחבר עם GitHub.
2. **New Project → Deploy from GitHub repo → `levori119/skyboard`**.
3. **Variables** (Settings → Variables) - הוסף:
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | ה-connection string של Neon (אותו אחד מ-`.env`) |
   | `NODE_ENV` | `production` |
   | `AUTH_SECRET` | **חובה.** סוד חתימת אסימוני ההזדהות, 32+ תווים |
   | `MIRAGE_SERVICE_TOKEN` | **חובה למיראז'.** סוד משותף לקריאה שרת-לשרת |
   | `ALLOWED_ORIGINS` | רק אם הלקוח מוגש ממקור אחר. ריק = מקור זהה בלבד |
   | `DRIVER_ACCESS_CODE` | קוד גישה לאפליקציית הנהג. ריק = גישת נהגים סגורה |
   > `PORT` - אל תגדיר; Railway מזריק אוטומטית.

   > ⚠️ **`AUTH_SECRET` הוא חסם עלייה.** שרת פרודקשן בלי סוד תקין **לא יעלה**
   > (`server.js` נכשל מיד עם הודעה) - במכוון: שרת שמשרת מידע שדה מבצעי בלי
   > יכולת לחתום זהות אינו אמור לרוץ. ליצירת סוד:
   > ```bash
   > node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   > ```
   > החלפת הסוד מבטלת את כל האסימונים הקיימים, כלומר מנתקת את כל העמדות.
   > שני מופעים של השרת חייבים **אותו** סוד, אחרת אסימון שהונפק באחד נדחה בשני.

   > ⚠️ **`MIRAGE_SERVICE_TOKEN` הוא סוד משותף לשני שירותים - לא לאחד.**
   > אותו ערך בדיוק חייב להיות מוגדר **גם** בשירות `MIRAGE` (הצד שמאמת)
   > **וגם** בשירות `SKY KING` (הצד ששולח אותו ככותרת `X-Service-Token`).
   > הגדרה בצד אחד בלבד גרועה מכלום:
   >
   > | מוגדר איפה | מה קורה | ההתחברות |
   > |---|---|---|
   > | בשניהם | תקין | ✅ עובדת |
   > | בשניהם, ערכים **שונים** | `401 bad_service_token` | ❌ שבורה |
   > | רק ב-MIRAGE | SKY KING לא שולח כותרת | ❌ `401` |
   > | רק ב-SKY KING | המיראז לא יודע לאמת | ❌ `503` |
   > | בשניהם - **חסר** | `503 service_token_required` | ❌ שבורה |
   >
   > **בפרודקשן זה חוסם התחברות לגמרי** (`/api/authorize` מחזיר 503), ולכן
   > אחרי הגדרתו חובה לפרוס מחדש את **שני** השירותים - משתנה סביבה חדש נכנס
   > לתוקף רק בפריסה. בפיתוח מקומי: `/api/authorize` מקבל מסלול מקל מחוץ
   > לפרודקשן, אבל `GET /api/users` סגור **בכל** סביבה - בלי המשתנה משיכת
   > הרוסטר לא תעבוד גם מקומית.
4. Railway יבנה (`npm run build`) ויריץ (`npm start`). בסיום - יינתן URL ציבורי.

---

## אימות אחרי deploy
1. **`<URL>/api/health`** - התחנה הראשונה בכל בדיקה. עונה גם כשה-DB תקוע:
   | תשובה | משמעות |
   |---|---|
   | `{"phase":"booting"}` 200 | השרת חי, ה-DB עוד עולה. להמתין ולרענן. |
   | `{"phase":"ready"}` 200 | הכל תקין. `bootMs` = כמה זמן העלייה לקחה. |
   | `{"phase":"failed", "error":"..."}` 503 | ה-DB נכשל - ה-`error` הוא הסיבה המדויקת. |
   | 502 / אין תשובה | הקונטיינר לא רץ בכלל, או אי-התאמת פורט. לבדוק Deploy Logs. |
2. פתח את ה-URL → מסך הכניסה אמור להיטען.
3. `<URL>/api/sectors` → JSON.
4. אם רואים מסך לבן / redirect מוזר → כנראה `NODE_ENV=production` לא הוגדר (השרת חושב שהוא ב-dev ומנסה לנתב ל-vite).

---

## תקלות נפוצות
| תקלה | סיבה / פתרון |
|---|---|
| build נכשל: `vite: not found` / `tsc: not found` | devDependencies לא הותקנו בבנייה. Railway/Railpack בד"כ מתקין dev ל-build; אם לא - הוסף Variable `NIXPACKS_INSTALL_CMD=npm install --include=dev` או העבר את `vite`+`typescript` ל-dependencies. |
| מסך לבן / redirect ל-localhost:5000 | חסר `NODE_ENV=production`. |
| `DATABASE_URL not set` / 500 | חסר/שגוי `DATABASE_URL` ב-Variables. |
| **`Application failed to respond` (502)** בזמן ש-deploy ירוק | פנה ל-`/api/health`. אם גם הוא 502 - אף אחד לא מאזין: או שהקונטיינר קרס (Deploy Logs), או שהפורט שRailway מכוון אליו אינו הפורט שהשרת תופס. השרת מדפיס בעלייה `SKY-KING API listening on 0.0.0.0:<PORT>` - להשוות למה שמוגדר בשירות. |
| `/api/health` מחזיר 503 | ה-DB לא עלה. שדה ה-`error` בתשובה הוא הסיבה. חשודים: `DATABASE_URL` שגוי; טבלה ב-`public` שלא מסווגת ב-`server/db/env-tables.js` (העלייה נכשלת בכוונה). |
| **הקונטיינר בלולאת קריסה**: `Starting Container` → `[auth] AUTH_SECRET חסר או קצר מ-32 תווים` → שוב, עד 10 פעמים | חסר `AUTH_SECRET` ב-Variables של **השירות** (לא של הפרויקט). זה חסם עלייה מכוון - ראה שלב 3. הוסף סוד 32+ תווים והפעל פריסה חדשה. `restartPolicyMaxRetries: 10` ב-`railway.json` הוא מספר הניסיונות שיופיעו בלוג לפני ש-Railway מוותר. |
| **אי אפשר להתחבר**: `502 {"error":"mirage_unavailable","reason":"service_token_required"}` | `MIRAGE_SERVICE_TOKEN` חסר. השרת עצמו בריא (`/api/health` ירוק) - **ערוץ ההזדהות** הוא שנפל. הגדר את אותו ערך בשני השירותים ופרוס את שניהם, ראה שלב 3. `reason` בגוף התשובה מגיע מהמיראז ומצביע על הצד השבור: `service_token_required` = המיראז בלי משתנה, `bad_service_token` = הערכים אינם זהים. |

> ⚠️ **פריסה שנכשלת אינה מורידה את השירות - היא משאירה את התמונה הקודמת מגישה.**
> זה נראה כמו הצלחה: `/api/health` מחזיר `{"phase":"ready"}`, האתר עובד, ואין
> שום סימן חיצוני לכך שהקוד החדש **לא** עלה. ב-04.08.2026 זה הסתיר במשך שעה
> שהייצור מגיש גרסה מלפני תיקוני האבטחה, כלומר API פתוח לגמרי בלי הזדהות.
>
> **לכן `/api/health` אינו מספיק כאימות פריסה.** לאמת שהקוד **החדש** חי:
> ```bash
> # ללא אסימון חייב להחזיר 401. אם מחזיר 200 - רץ קוד מלפני SK-01.
> curl -o /dev/null -w "%{http_code}\n" https://<URL>/api/strips
> ```
> ובלוג הפריסה - לוודא שהשורה `SKY-KING API listening` שייכת ל-deployment
> האחרון, ולא לזה שקדם לו. `uptimeMs` ב-`/api/health` מסגיר את זה: אם הוא
> גדול בהרבה מגיל הפריסה, מה שרץ הוא המופע הישן.
| `/api/health` תקוע ב-`booting` דקות ארוכות | `initDb` איטי מול Neon מאזור מרוחק. לבדוק את זמני השלבים בלוג (`[startup] initDb — Xms`) ולשקול Neon באזור של Railway. |
| השרת לא עולה | בדוק שה-PORT לא hardcoded - server.js משתמש ב-`process.env.PORT` ✅. |

---

## הערות
- **DB:** נשאר Neon (ענן). Railway מתחבר אליו דרך `DATABASE_URL`. אפשר גם Postgres של Railway - אז להחליף את ה-URL ולהריץ `initDb`+`seedDb` (קורה אוטומטית בעלייה).
- **timezone:** Railway רץ ב-UTC → אין הסטת שעות (וגם תוקן ב-DB עם `timestamptz`).
- **Auto-deploy:** כל push ל-`main` יפרוס מחדש אוטומטית.
- **Electron (desktop):** נפרד - Railway הוא לגרסת ה-web בלבד.
