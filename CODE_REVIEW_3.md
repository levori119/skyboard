# SKY-KING - ביקורת קוד מקיפה #3 (נכונות · אבטחה · סנכרון · UI)

> מעבר מלא על כל הקוד (~130 אלף שורות), 9 סוקרים במקביל, כל אחד על תחום. בוצע: 2026-10-18.
> קודם: [CODE_REVIEW_2.md](CODE_REVIEW_2.md) (2026-06-23).
>
> **בסיס הסקירה:** `feature/i18n-bilingual` ב-`0ac93deb`. ענף זה נמצא 46 קומיטים אחרי `origin/main` (`439ca10a`).
> כל ממצא CRITICAL/HIGH שנמצא בקובץ שהשתנה מאז נבדק מחדש מול `origin/main`, והמצב מסומן בטבלה. מספרי השורות לפי `0ac93deb`, ויכולים לזוז במעט ב-main.
>
> **סימונים:** ✅ = אומת ידנית (קריאת קוד או הרצה) · ללא סימון = דווח ע"י סוקר עם הפניה לקוד · *PLAUSIBLE* = דורש אימות בהרצה.

---

## תקציר מנהלים

| תחום | מצב | הממצא הכי חשוב |
|------|-----|----------------|
| 🔒 אימות והרשאות | 🔴 קריטי | `/API/...` באותיות גדולות עוקף את כל האימות. לוכסן סופי מוריד נתיבי מנהל ל-USER |
| 🔁 סנכרון / עמדה מנותקת | 🔴 קריטי | `pool.query` בסוכן "פותח" טרנזקציה על החיבור היחיד של PGlite. הסיבוב המהיר נחסם ב-403 בייצור |
| ✈️ העברות פ"מ | 🔴 קריטי | `accept`/`cancel`/`reject` בלי נעילת שורה ובלי בדיקת סטטוס. פ"מ יכול לשבת בשתי עמדות |
| ↩️ ביטול (CTRL+Z) | 🔴 קריטי | רשימת החסימה ממומשת כ"אין טריגר", ולכן אפשר לבטל **חלקית** קבלת העברה |
| 🗄️ DB / עלייה | 🟠 גבוה | סכמת תרגול חסרה נופלת בשקט ל-public. DDL עם נעילות בכל עלייה, בלי `lock_timeout` |
| 🖥️ UI עמדות | 🟠 גבוה | שליחת העברה ולחץ ברומטרי בלי בדיקת `res.ok`. רינדור מלא של הדשבורד פעם בשנייה |
| 🛠️ כלי פיתוח | 🟠 גבוה | e2e, docker-compose ו-dev רצים מול ה-DB של הייצור. אין CI שמריץ tsc/בדיקות |
| ✅ SQL injection | תקין | פרמטרים בכל מקום, ומזהים דרך `ident()` או רשימות היתר |
| ✅ Electron | תקין ברובו | `contextIsolation`, בלי `nodeIntegration`, בדיקת origin בכל IPC |

### מה נבדק אוטומטית

| בדיקה | תוצאה |
|-------|-------|
| `tsc -p tsconfig.build.json --noEmit` | ✅ 0 שגיאות |
| `vitest run` (עם `DATABASE_URL` ריק, כדי לא לגעת בייצור) | ✅ 4232 עברו · 8 דולגו · 230 קבצים |
| `npm audit --omit=dev` | ⚠️ 11 פגיעויות (1 critical, 7 high, 2 moderate, 1 low). `xlsx` (prototype pollution + ReDoS, אין תיקון ב-npm), `source-map-js` (יש תיקון) |
| הרצת עקיפת האימות מול `authMiddleware` אמיתי (Express בזיכרון, בלי DB) | ✅ `DELETE /API/activity-log` → **200, ה-handler הגיע**. `DELETE /api/activity-log` → 401 |

> הבדיקות ירוקות, אבל רוב הממצאים כאן הם מרוצים ומסלולי שגיאה שהבדיקות לא מכסות. `transfers.js`, `strips.js` ו-`undo.js` הם החשובים ביותר, ול-`strips.js` ול-`undo.js` אין בדיקות route בכלל.

---

## 🔥 10 הדחופים - לפי סדר תיקון מומלץ

| # | חומרה | מה | איפה | ב-main |
|---|-------|----|------|--------|
| 1 | CRITICAL ✅ | **עקיפת אימות באותיות גדולות.** `path.startsWith('/api')` רגיש לאותיות, וה-Router של Express 5 לא. `GET /API/sync/mirror` שולף את כל ה-DB בלי אסימון | `server/middleware/auth.js:280`, `actionContext.js:66` | פתוח |
| 2 | CRITICAL ✅ | **לוכסן סופי / אותיות עוקפים כללי ADMIN/STAFF.** כל פקח מחובר: `DELETE /api/activity-log/`, `POST /api/environments/11/reset/` (DROP SCHEMA), `PUT /api/air-picture/config/` (הפניית התמונ"א לשרת זר) | `auth.js:251-263` (`requirementFor`) | פתוח |
| 3 | CRITICAL ✅ | **`/api/sync/push` עם `pk:{}` מוחק טבלה שלמה.** `to_jsonb(t) @> '{}'` מתאים לכל שורה, ואין אימות שה-pk מלא. פתוח לכל USER | `server/sync/apply.js:182`, `server/db/rowOps.js:35,114` | פתוח |
| 4 | CRITICAL ✅ | **קבלת העברה כפולה / ביטול אחרי קבלה.** `acceptTransferTx`, `reject` ו-`cancel` לא נועלים (`FOR UPDATE`) ולא בודקים `status`. שתי עמדות מקבלות יחד, ושתיהן מצליחות | `server/routes/transfers.js:362,428,494,627` | פתוח |
| 5 | CRITICAL | **הסוכן קולט מראה דרך `pool.query` על חיבור יחיד.** ה-`BEGIN`/`SET LOCAL`/`replica` נשארים פתוחים, וכתיבות מפעיל נכנסות לתוכם: אובדן שקט, או רישום ביומן ודחיפה חזרה כ"סתירה יש מאין" | `server/sync/daemon.js:129,231`, `server/sync/mirror.js:240-261` | פתוח |
| 6 | CRITICAL ✅ | **ביטול חלקי של קבלת העברה.** על טבלה חסומה אין טריגר, ולכן `blockedTableIn` לא רואה אותה לעולם. CTRL+Z מחזיר את `strips` ומשאיר את `strip_transfers` במצב `accepted` | `server/db/undoJournal.js:222-241`, `server/undo/revert.js:90` | פתוח |
| 7 | HIGH ✅ | **הדלתא (15ש') נחסמת ב-403 בייצור.** `/api/sync/mirror/delta` חסר ב-`STATION_PATHS`. הבדיקות עוקפות את ה-auth ולכן לא תפסו את זה | `auth.js:80-87` | פתוח |
| 8 | HIGH ✅ | **הסיבוב המלא של המראה מת לצמיתות** כשהטיימר שלו נורה בזמן שדלתא רצה: `return` לפני ה-`finally` שמתזמן מחדש | `daemon.js:333` (ב-main `:340`) | פתוח |
| 9 | HIGH ✅ | **אסימון admin מקומי מ-claims שבגוף הבקשה.** `local-session` / `cache-credential` סומכים על loopback, אבל כל בקשה מהדף מגיעה דרך ה-proxy מ-127.0.0.1 | `server/routes/mirage.js:381-437`, `electron/stationServer.cjs:361-388` | פתוח |
| 10 | HIGH | **ניהול GAPI פתוח לכל USER.** `PUT /api/gapi/config` עם `base_url` ו-`hmac_secret` של תוקף מזרים את כל הפ"מים החוצה. בנוסף, `inbound`/`health` לא PUBLIC, ולכן GAPI מקבל 401 לפני בדיקת ה-HMAC | `server/routes/gapi.js:52-105` | פתוח |

---

## 🔒 אבטחה

### CRITICAL / HIGH (מעבר לטבלה למעלה)
- **IDOR באפליקציית הנהג.** ב-`vehicle-messages` (GET/POST) וב-`POST /api/vehicle-gps` אין בדיקת בעלות. נהג קורא ו"צורך" הודעות של רכב אחר, ומזריק GPS מזויף לכל `request_id`, ולכן המגדל רואה רכב במקום שגוי. `server/routes/driver.js:348-405`
- **כשל DB בכניסה הופך משתמש מוגבל ללא מוגבל.** כשהפענוח נכשל, `approvedWorkstations: []` נחתם באסימון, ופירושו "כל העמדות". `server/routes/mirage.js:174-188`
- **`POST /api/sync/mirror` המקומי קולט כל טבלה בלי רשימת היתר**, כולל `mirage_users` ו-`local_credentials`, תחת `replica`. `server/routes/sync.js:408`, `mirror.js:229`

### MEDIUM / LOW
- **גוף 50MB נקרא לפני האימות.** כל אנונימי יכול להעמיס זיכרון ו-CPU. `server/app.js:73-79` מול `:127`
- **אין rate limiting במרכז** על `mirage-login` ועל `auth/driver`.
- **`err.message` חוזר ללקוח** ב-114 מקומות ב-15 קבצי route. גם `/api/ready` ו-`/api/health` הציבוריים מחזירים שגיאות DB.
- **`shell.openExternal` בלי סינון סכמה** (`file:`, `ms-msdt:`, `search-ms:`). `electron-main.cjs:611-621`. בנוסף, Ctrl+Shift+I פותח DevTools במצב kiosk.
- **`POST /api/__station/outage`** מבוצע גם ממקור לא מורשה: ה-CORS חוסם רק את קריאת התשובה. *PLAUSIBLE*
- **`STATION_TOKEN` אחד לכל העמדות**, בטקסט גלוי בקובץ התצורה. עמדה שנגנבה חושפת את טביעות ה-scrypt של כל הצוות. זו הכרעה מתועדת, אבל כדאי לשקול אסימון נפרד לכל עמדה.
- **דאמפ DB בהיסטוריית git.** `skyking_db_export.zip` (קומיט `c88db228`, נמחק ב-`42a06d5b`), כ-21MB: שמות ו-`personal_id`, מפות מבצעיות, `activity_log`, `auth_token`. ניקוי מחייב `git filter-repo` ו-force push, ולכן זו הכרעת צוות. לא נמצאו סיסמאות או מחרוזות חיבור.
- **אסימונים:** אין logout בצד השרת, התוקף 12 שעות, ושינוי תפקיד במיראז' לא נכנס לתוקף עד שהאסימון פג.
- **הקלטת מסך:** כל USER יכול לפתוח או לסגור מקטע של עמדה אחרת, ולכתוב נתחים של 25MB בלי תקרה לדיסק. `screenRecording.js:181-231`

### מצב הממצאים מ-CODE_REVIEW_2

| ממצא | מצב |
|------|-----|
| אין auth על ה-API | **בנוי נכון, פתוח בפועל.** deny-by-default, HMAC-SHA256, סוד מ-`randomBytes`. עקיפות 1-2 מבטלות אותו |
| CORS פתוח | ✅ תוקן (`ALLOWED_ORIGINS`) |
| helmet | ✅ תוקן (`securityHeaders.js`: CSP, nosniff, XFO, HSTS) |
| rate-limit | ❌ פתוח |
| body של 50MB | ❌ פתוח |
| `err.message` ללקוח | 🟡 חלקי |
| indexes | ✅ ההמלצות יושמו (`init.js:2496-2507`). חסרים עדיין: `strip_transfers(strip_id)`, `strips(parent_strip_id)`, `strip_aircraft_armaments/systems(strip_aircraft_id)` |

---

## ✈️ פ"מים והעברות (שרת)

| חומרה | ממצא | מיקום |
|--------|-------|-------|
| HIGH ✅ | **דחייה או ביטול של העברה ישירה לעמדה מאפסים את הבעלים.** השחזור נעשה ל-`from_workstation_id`, אבל `initiatePresetTransferTx` ממלא רק את `from_preset_id`. התיקון: `from_preset_id ?? from_workstation_id` | `transfers.js:505,637` |
| HIGH | **קבלה שממזגת עם האח מוחקת את תקלות המטוסים.** `strip_aircraft` נמחק ב-CASCADE ולא מועתק. בדיוק הבאג שכבר תוקן ב-`merge-partial` | `transfers.js:62` |
| HIGH | **מיזוג פ"מ עם עצמו מוחק אותו.** אין בדיקה ש-`targetId !== sourceId` ושלשניהם אותו מקור | `strips.js:1566,1645` |
| HIGH | **דדלוק ב-PGlite.** `loadLinkGroups` קורא ל-`pool.query` בזמן שה-client מוחזק, והעמדה קופאת ל-60 שניות | `airfield.js:1912,1932` |
| HIGH | **מחיקת מטוס מהמבנה בלי טרנזקציה.** `idx = idx - 1` נופל על `UNIQUE(strip_id, idx)` ומשאיר חור במספור. גם `aircraft_indices` לא מתעדכן | `strips.js:907-933` |
| MEDIUM | אין בשרת חסימה של העברה שנייה לאותו פ"מ (הבדיקה רק בלקוח), ואין טרנזקציה בין עדכון הפ"מ ל-INSERT | `transfers.js:112,168` |
| MEDIUM | "נחת" לא נדלק לעולם בפ"מ מפוצל, כי `COUNT(strip_aircraft)` כולל מטוסים שעזבו | `joiningPoints.js:860-868` |
| MEDIUM | PUT מלא של `custom_fields` דורס ערכי פקדים שעמדה אחרת כתבה. התיקון: `custom_fields \|\| $x::jsonb` | `strips.js:469` |
| MEDIUM | ניקוי שיבוצים מוחק רק `pending` ומשאיר העברות `acknowledged` | `strips.js:356,422` |
| MEDIUM | היפוך כיוון מסלול בשני מגדלים במקביל מכבה את שני הקצוות | `airfield.js:1404-1428` |
| MEDIUM | `live-runway-conflicts` משתמש ב-`route_links` הישן ומתאים לפי **שם** מסלול בלי סינון שדה (המראה ב-26 בבסיס א' מתריעה בבסיס ב'). *PLAUSIBLE* | `airfield.js:1550-1660` |
| MEDIUM | `move` של העברה מתעלם מ-`classic_receive_points` ולא מעדכן את `workstation_preset_id` | `transfers.js:571-585` |
| LOW | `transfer-to-preset` בלי ולידציה. `!= $1` על NULL מסנן העברות. `LIMIT 200` לפני סינון "הבשיל" בקבלה האוטומטית. "כפול היום" לפי יום UTC. `handover` בלי יומן. `/api/strips/global` כבד (6 תת-שאילתות לשורה) | `transfers.js:283,237,712`, `strips.js:276`, `position-merges.js:68` |

> **מה טוב:** המסלולים שעוברים דרך `pool.connect()` (`ground-single-transfer`, `partial-create`, `merge-partial`, `split`, `takeover`) מנוהלים נכון, עם טרנזקציה, ROLLBACK ו-finally. החולשה מרוכזת במכונת המצבים של ההעברה.

---

## 🔁 סנכרון, מאגר מקומי ועמדה מנותקת

| חומרה | ממצא | מיקום | ב-main |
|--------|-------|-------|--------|
| CRITICAL | `pool.query` בסוכן על חיבור יחיד (ראה טופ #5). מחמיר: `pullMirror` בדפדפן רץ במקביל לסוכן כל 45 שניות | `daemon.js:129,231`, `syncClient.ts:253` | פתוח |
| HIGH ✅ | ה-403 על הדלתא ושרשרת הסיבוב המלא שמתה (ראה טופ #7-8) | | פתוח |
| HIGH | **ההגנה "לא חוזרים למרכז לפני ניקוז היומן" לא פועלת בנתק שארוך מדקה.** `drainUntil` נקבע בזמן הנתק ולא בחזרה ממנו, ולכן בחזרה הוא כבר עבר והנתב עובר מיד למרכז | `electron/apiRouter.cjs:168-181` | השתנה, לבדוק |
| HIGH | **אין התאוששות כשהתהליך הבן קורס.** `url` מתאפס ואין הפעלה מחדש | `electron-main.cjs:244-248` | 🟡 **חלקי:** ב-main נוספו שחזור מאגר פגום (`localPool` recovery) וטיפול ב-`disconnect`. הפעלה מחדש של הבן לא נמצאה |
| HIGH | **הדחיפה לא אידמפוטנטית ותשובת ה-ack לא נבדקת.** תשובה שאבדה גורמת לשליחה חוזרת, ובמדיניות STATION `U` דורס כתיבות של אחרים | `syncClient.ts:141`, `apply.js:193-220` | פתוח |
| HIGH ✅ | **client חוזר ל-pool באמצע טרנזקציה שנכשלה.** ב-`mirror` וב-`mirror/delta` אין ROLLBACK ב-catch. הבקשה הבאה שמקבלת את החיבור נופלת ב-`25P02` | `server/routes/sync.js:368-400` | פתוח |
| MEDIUM | **הצילום אינו עקבי.** READ COMMITTED, ובקליטה ה-FK מכובים (`replica`). התיקון: `REPEATABLE READ READ ONLY` | `routes/sync.js:372,394` | פתוח |
| MEDIUM | **חור בחלון הדלתא.** `NOW()` הוא זמן תחילת הטרנזקציה, החפיפה 2 שניות בלבד, והטריגר הוא `BEFORE UPDATE` בלבד (לא על INSERT). התיקון: השוואת `rev` במקום זמן | `versionedTables.js:39,57`, `mirror.js:150,197` | |
| MEDIUM | הדלתא מקדמת את `lastDeltaAt` גם כשטבלה נכשלה. upsert בלי `WHERE t.rev <= EXCLUDED.rev` מחזיר גרסה ישנה | `daemon.js:235-241`, `mirror.js:292-305` | |
| MEDIUM | הכרעת "שלי" מכפה את **כל** היומן, ולכן `U` על פ"מ שנמחק מחזיר אותו לחיים כפ"מ רפאים | `syncClient.ts:222`, `apply.js:205` | |
| MEDIUM | שחרור כפוי של lease אחרי 60 שניות משאיר client פעיל שכותב לתוך הטרנזקציה של המחזיק הבא | `localPool.js:151-158` | השתנה, לבדוק |
| MEDIUM | ניקוז ה-outbox בדפדפן רץ במקביל ומכפיל פריטים. אין single-flight | `src/offline/apiFetch.ts:131,198` | |
| MEDIUM | סביבת תרגול נקלטת לתוך `public` המקומי (`schema='public'` קבוע) | `daemon.js:279` | |
| LOW | השוואת שעונים בין עמדה למרכז. כשל של סיבוב מלא מכריז offline גם כשהדלתא בריאה. `stationWatch` מוותר אחרי 3 החמצות. `continue` מדלג על `RELEASE SAVEPOINT` | `mirror.js:206,271`, `daemon.js:344`, `stationWatch.ts:58` | |

> **הערכה:** המודל הלוגי (יומן בטריגר, `withoutJournal`, רשות מחיקה מ-`keys`) מתוכנן טוב ומתועד. אבל ההנחה ש-`pool.query` בטוח על חיבור יחיד שוברת את כל הבידוד הטרנזקציוני של הסוכן. זה כנראה מקור לחלק מהסתירות ולחלק מהניתוקים שדווחו.

---

## 🗄️ שכבת ה-DB, עלייה וביטול

| חומרה | ממצא | מיקום |
|--------|-------|-------|
| CRITICAL ✅ | רשימת החסימה של הביטול ממומשת כ"אין טריגר", ולכן פעולה מעורבת לא נחסמת (ראה טופ #6). הבדיקה ב-`undo.integration.test.js:133` מאשרת את ההתנהגות השגויה. התיקון: טריגר "סמן" על טבלאות חסומות שמעביר את הפעולה ל-`blocked` | `undoJournal.js:222` |
| HIGH | **סכמת תרגול חסרה נופלת בשקט ל-public.** `search_path TO env_N, public`, ו-`ensured` שמור בזיכרון של התהליך. reset באמצע בקשה, או worktree או בדיקה שמוחקים סכמה, גורמים לכתיבה לנתוני אמת. התיקון: `to_regnamespace` ב-`applyTxnScope` | `envs.js:21,202-221`, `pool.js:114` |
| HIGH | **השרת משרת API לפני שהעלייה הסתיימה ואחרי שנכשלה.** `/api/health` מחזיר 200 במצב booting, וזה ה-healthcheck של Railway. התיקון: 503 עד `ready`, ו-healthcheck על `/api/ready` | `server.js:84-136`, `app.js:86-94`, `railway.json` |
| HIGH | **סערת DDL בכל עלייה.** מאות `ALTER ... IF NOT EXISTS` (נעילת `ACCESS EXCLUSIVE`), FK של `strips` שנמחק ונוסף מחדש, טריגרים על כ-110 טבלאות עם חלון עיוור בין DROP ל-CREATE, ואין `lock_timeout`. כל ריסטארט של שרת פיתוח ב-worktree נועל את הייצור | `init.js`, `init.js:596`, `versionedTables.js:53`, `undoJournal.js:222` |
| MEDIUM | `initDb` בולע שגיאות ומסמן ready. לולאת הניסיונות החוזרים מריצה 6 פעמים גם כשל דטרמיניסטי | `init.js:2611`, `server.js:55-74` |
| MEDIUM | **מרוץ בביצוע ביטול.** בדיקת `active` מחוץ לטרנזקציה, בלי `FOR UPDATE`, ו-UPDATE לא מותנה. לחיצה כפולה מריצה שני reverts | `routes/undo.js:118-160` |
| MEDIUM | ביטול "יצירת פ"מ" מוחק ב-CASCADE העברות שעמדה אחרת יצרה. *PLAUSIBLE* | `foreign-keys.js:140`, `revert.js:63` |
| MEDIUM | 4-5 round-trips לכל כתיבה בהקשר פעולה, ו-`wrapClient` משמיד את החיבור בכל שחרור (TLS חדש מול Neon) | `pool.js:282-358` |
| MEDIUM | **אין timeouts ב-pool:** `statement_timeout`, `idle_in_transaction_session_timeout`, `lock_timeout`. 12 חיבורים בלבד | `pool.js:186-193` |
| MEDIUM | `PK_MATCH` (`to_jsonb(t) @> $1`) סורק את כל הטבלה, והסנכרון רץ עכשיו כל 15 שניות | `rowOps.js:35` |
| LOW | client תפוס בלי מאזין `error` מפיל את התהליך (*PLAUSIBLE*). `entry_permit_vehicles` ו-`vehicle_requests` לא חסומות לביטול. `workstations.auth_token` מועתק ליומן. טריגר ישן לא מוסר כשטבלה נוספת לחסימה. כ-40 הגדרות `TIMESTAMP` נשענות על בלוק המרה בעלייה. `INSERT ... SELECT *` פוזיציוני בסביבות | `pool.js:196`, `undoJournal.js`, `envs.js:138` |

---

## 🌐 שאר נתיבי השרת ו-GAPI

| חומרה | ממצא | מיקום |
|--------|-------|-------|
| HIGH | **`fetch` ל-GAPI בלי timeout.** חיבור תקוע משאיר את `inFlight` במצב `true` לתמיד, וה-outbox וה-reconcile נעצרים בשקט בכל הסביבות | `server/gapi/client.js:17`, `workers.js:24`, `outbox.js:76` |
| HIGH | **שני drains של ה-outbox במקביל שולחים את אותן שורות.** התיקון: `FOR UPDATE SKIP LOCKED` | `gapi/outbox.js:81-145` |
| HIGH | **webhook ו-reconcile מחילים את אותו אירוע**, ונוצרים שני פ"מים לאותו `gapi_id` (האינדקס אינו ייחודי) | `gapi/sync.js:120-170`, `init.js:2393` |
| HIGH | **אירוע GAPI רעיל אחד חוסם את הקליטה לתמיד**, כי ה-cursor מתקדם רק כשאין שגיאות | `gapi/reconcile.js:18` |
| MEDIUM | הודעת מגדל לנהג הולכת לאיבוד: SELECT ואחריו UPDATE גורף. התיקון: `UPDATE ... RETURNING` | `driver.js:361-372` |
| MEDIUM | **אזור סגור לא נאכף בשרת.** `POST /api/strip-zone-assignments` לא בודק `restriction='closed'` | `maps.js:540-557` |
| MEDIUM | כתיבות מרובות בלי טרנזקציה (DELETE ואחריו לולאת INSERT) | `crew.js:24-75`, `admin.js:251`, `maps.js:163-337` |
| MEDIUM | `imageCache` של תמונ"א בלי TTL, ופוליגון הלאמה בלי תקרת קודקודים | `airPicture.js:208`, `tempZoneSeizures.js:80` |
| LOW | חלון תאריכים מוסט ביומן הפעילות. קטע הקלטה שנופל בין סגירה לפתיחה. `deviation_streak` לא אטומי. `PUT /air-picture/config` מחזיר `ok` כשלא נשמר דבר | `admin.js:558`, `screenRecording.js:228`, `permits.js:1334`, `airPicture.js:93` |

---

## 🖥️ לקוח - ליבה, עמדות ומפות

### HIGH
- **401 של סיסמה שגויה זורק את העמדה למסך הכניסה.** היירוט מתייחס לכל 401 כאל אסימון שפג, כולל `mirage-login` בהחלפת איש צוות. `src/utils/authToken.ts:113`
- **מסגרות הצצה לא מותנות.** המיתון מכפיל רק `setInterval` של 2000ms ומעלה, ומנוע הסקר רץ על 1000ms. כל ריבוע ב-`StationPeekBar` מריץ כ-35 סקרים בקצב מלא. `stationPeek.ts:134` מול `usePollingRegistry.ts:21`
- ✅ **לחץ ברומטרי נשמר באמצע הקלדה.** אחרי 800ms כל מספר תקין נשלח, ולכן "2" שנכתב נשמר כ-2.00 inHg ומופץ לכל העמדות. בנוסף, ה-poll מחזיר את הערך לשרת ובולע את ההתראה הבאה. `SectorDashboard.tsx:4283-4294`
- ✅ **שליחת העברה ודחייתה לא בודקות `res.ok`.** ב-409/500 הפ"מ מסומן `pending_transfer` ונרשם ביומן, והבקר בטוח שהעביר. `SectorDashboard.tsx:6841-6852`, `:8138-8156`
- **כל הדשבורד מתרנדר פעם בשנייה.** `setRwNow` (משמש רק לספירה לאחור במסלולים) מרנדר מחדש את `SectorDashboard` ואת `GroundView`. `SectorDashboard.tsx:511`, `GroundView.tsx:570`
- **`strip_aircraft` בעמדת שדה לא נסקר.** הטעינה רצה רק כשמשתנה `strips.length` הגלובלי. `SectorDashboard.tsx:7893-7911`
- **גובה פ"מ שגוי ב-`BlockMiniView`.** יש ערבוב בין `--s` ל-`ResizeObserver`, ונגיעה בלי תזוזה כותבת גובה חדש. `blocks/BlockMiniView.tsx:33-44`. אותה תבנית (נגיעה כותבת גובה, אין `pointercancel`) מופיעה ב-`VerticalView.tsx:660`
- **טיימר "נחת" יחיד בנקודת הצטרפות.** מטוס שני שנוחת בתוך 5 שניות מבטל את ההסרה של הראשון. `ground/JoiningPointPanel.tsx:264-270`
- **Dead reckoning לא חסום.** כשהמאגר קופא ומחזיר 304, מטוס "טס" הלאה, ומופעלות התראות "יצא מהאזור" כוזבות שנכתבות ל-DB. *PLAUSIBLE* `airPicture/useZoneWatch.ts:146`, `track.ts:48`
- **אין ErrorBoundary בכל `src`.** חריגה אחת ברינדור מלבינה את כל המסך. למשל `ManagementPage.tsx:6260` מכניס `{error}` ל-state, ו-`.filter` זורק.

### MEDIUM (בקצרה)
- **apiFetch:**
  - `X-Env` של פריט outbox נדרס בסביבה הנוכחית, ולכן כתיבה מנתק בתרגול נשלחת לטסה (`apiFetch.ts:124` מול `environment.ts:87`).
  - תקרת 8 שניות חלה גם על כתיבות, כך שכתיבה איטית שהצליחה מוצגת כ"נחסמה" ונשלחת שוב (`apiFetch.ts:110,236-272`). ב-main תוקן חלקית להעלאות קבצים.
- **Strip:** כל הקשה בפרטי הפ"מ היא PUT בלי debounce ובלי רצף, וה-poll מחזיר תווים אחורה. `localFaults` לא מתאפס אף פעם. `Strip.tsx:103-170`
- **SectorDashboard:**
  - `loadData` בלי מונה רצף, ולכן תשובת poll ישנה מחזירה העברה שכבר התקבלה (`:5308`).
  - עריכת תא בטבלה לא מוגנת מה-poll ולא בודקת `r.ok` (`:15671-16483`).
  - סקר השדה נעול על `airfield_id` הראשון (`:5704`).
  - התראת בד"ח חוזרת אחרי "הבנתי" (`:1889`).
- **גרירה וקואורדינטות:**
  - בלי חלוקה ב-`--s`: `DraggablePanels.tsx:957`, `ClassicViews.tsx:916` (ציור), `MapDrawLayer` (preview), `GroundVehiclePanel.tsx:370` (וגם בלי `touchAction`), `GroundView.tsx:507`.
  - גרירה בלי `pointercancel`: `OnScreenKeyboard.tsx:58` (בלי `touchAction` ובלי capture), `ButtonsBoard.tsx:243`, `DataWindowLayer`, `BlockVisualPainter.tsx:199` (שני PUT).
- **מפות:**
  - סגירת פוליגון הלאמה בנגיעה בקודקוד הראשון לא קורית לעולם (`SeizureDrawLayer.tsx:70-92`).
  - click אחרי גרירה ב-`MapZoneEditor` מוסיף קודקוד (`:647-672`).
  - מסגרת הסצנה ב-`Pattern3DScene` "נושמת" עם כל דגימת תמונ"א (`:290`).
- **GroundView:** N+1 בסיכומי המבנה (בקשה לכל פ"מ), בניגוד ל-endpoint המרוכז ב-SectorDashboard. `GroundView.tsx:854`

### ניהול (admin)
- **הצלחה מדומה שיטתית:** ב-`ManagementPage` יש 188 קריאות `fetch` מול 91 בדיקות `.ok`. דוגמאות:
  - `saveSector` / `deleteSector` (`:805-854`)
  - `saveBdh`, שמוחק ומוסיף בלי טרנזקציה (`:4337`)
  - `doClearSerials` (`managers.tsx:1378`)
  - איפוס תרגום (`TranslationsManager.tsx:90`)
- **השמירה האחרונה גוברת:** `savePreset` שולח PUT של כ-70 שדות בלי בקרת גרסה, ולכן מנהל א' דורס את מה שמנהל ב' שינה. `ManagementPage.tsx:914-988`
- **מחיקה בלי אישור:**
  - נקודות (`:5079`, כפתור צמוד לעריכה במסך מגע)
  - ספי מזע"ה
  - בלוקים
  - אנשי קשר
- **מחיקת יומן הפעולות** (`DELETE FROM activity_log`) סותרת את "לא למחוק היסטוריה". `admin.js:577`
- **`sanitizeSvgBody` מקנן צורות אחיות** (`<path/><circle/>` יוצא כ-circle בתוך path), ולכן אייקון עם כמה צורות מציג רק את הראשונה. אומת בהרצה. `shared/sanitizeHtml.js`
- **`joinLocalDateTime` משוכפל וסטה:** אצל הנהג תאריך בלי שעה מחזיר null, ובמגדל הוא הופך לחצות. `shared/driverLogic.js:81` מול `TripsManagementWindow.tsx:175`

---

## 🛠️ כלי פיתוח, פריסה והיגיינה

| חומרה | ממצא |
|--------|-------|
| CRITICAL | **e2e רץ מול הייצור.** `playwright.config.ts:44` מרים `node server.js`, שטוען את `.env` המקומי (Neon של Railway). 31 קבצי spec עם POST/DELETE |
| HIGH | **`npm test` נוגע בייצור** כש-`DATABASE_URL` מוגדר: `env-isolation.integration.test.js` מוחק את `env_49` וכותב ל-`public.strips`. התיקון: לרוץ רק על `TEST_DATABASE_URL` מפורש. (בסקירה הזו הורץ עם `DATABASE_URL` ריק) |
| HIGH | `docker-compose.yml` (`env_file: .env`) ו-`npm run dev` מריצים שרת מלא מול ה-DB החי, כולל העבודות המחזוריות פעמיים *PLAUSIBLE*. ראה גם "סערת DDL" למעלה |
| HIGH | **אין CI שבודק.** ב-`.github/workflows` יש רק `build-mac.yml`. main נפרס ל-Railway, וההוראה היא לדחוף בלי לשאול |
| HIGH | `xlsx@0.18.5` (CVE-2023-30533, CVE-2024-22363), ואין לו תיקון ב-npm. צריך tarball 0.20.3 מ-cdn.sheetjs.com. `electron@36` כנראה כבר מחוץ לחלון התמיכה (לא אומת online) |
| MEDIUM | **מספרי גרסה כפולים** בין worktrees מקבילים (1.0.30 מופיעה 3 פעמים, ועוד). התיקון: patch מ-`git rev-list --count`, או short SHA |
| MEDIUM | מפתח `localStorage` כפול ב-`playwright.config.ts:27-33`, ולכן ה-e2e רץ מול מיראז' בניגוד להערה |
| MEDIUM | TS 4.7.4 עם `strict`, אבל רק על `src`. `shared/*.js` וה-`.d.ts` הידניים לא נבדקים זה מול זה, והשרת כולו JS בלי `checkJs` |
| LOW | **ריפו:** HEAD שוקל 67MB וה-pack 119MB. `attached_assets` (31MB, כולל AeroZone). `app_part.tsx`, `app_part_2.tsx` ו-`src/mockData.ts` לא מיובאים. `typescript`/`vite`/`@types` נמצאים ב-`dependencies`. `@replit/connectors-sdk` לא בשימוש. `.claude/settings.json` מתיר `Bash(git push*)`, כולל `--force` |

**כיסוי בדיקות:**
- `src/utils`: 82 קבצים · `server/routes`: 26 · `shared`: 10.
- **בלי בדיקות route:** `strips.js` (1658 שורות), `sectors`, `workstations`, `crew`, `collaboration`, `provisional-transfers`, `position-merges`, `undo`.
- `SectorDashboard.tsx` (22,955 שורות): בדיקה אחת. `ManagementPage.tsx` (8,692 שורות): אפס.

---

## 📐 כללי הפרויקט (CLAUDE.md) - מצב

| כלל | מצב |
|-----|-----|
| **גרירה ב-Pointer Events** | ✅ אין אף `onMouseDown` לגרירה ואין `mousemove` על window. ⚠️ כ-50 אתרי HTML5 DnD (`draggable`/`onDragStart`): ClassicViews, CivilianView, ManagementPage, managers, MissionDeskAdmin. ב-Chromium הם לא אמינים במגע, ו-GroundView כבר הוסיף מסלול Pointer מקביל. ⚠️ `preventDefault` על `pointerdown` (מלכודת 4) ב-6 מקומות |
| **`windowFrame()`** | ⚠️ SectorDashboard: 3 שימושים מול 72 אלמנטים `position:fixed`, ולפחות 25 עם גבול מקודד. GroundView: 0 מול 18. גם `OnScreenKeyboard`, `PatternAlertPopup`, `MapsManager` ופאנל המצלמה בניהול |
| **i18n (`t()`)** | ❌ חוב גדול: כ-850 שורות עברית קשיחה ב-SectorDashboard, כ-290 ב-GroundView, כ-290 ב-ManagementPage, כ-124 ב-managers, ועוד 68 ב-`queryBuilder.ts`. 75 חלונות `alert`/`confirm` עם טקסט מקודד |
| **`dir` רק ב-root** | ❌ `direction:'rtl'` קשיח: 59 ב-GroundView, 20 ב-DraggablePanels, 17 ב-AdminDashboard, 12 ב-ClassicViews, 10 ב-Strip, 9 ב-TransferCards. זה שובר אנגלית |
| **logical properties** | ⚠️ כ-60 מופעים של `marginLeft/Right` / `textAlign:'left'`, בעיקר ב-GroundView וב-GroundVehiclePanel |
| **בלי em-dash בטקסט גלוי** | ⚠️ כ-40 מופעים: ManagementPage, MapZoneEditor, DraggablePanels, TransferCards, ManpowerPage, BlockVisualPainter |
| **תמה** | ⚠️ Strip, DraggablePanels ו-TransferCards בוחרים צבע לפי `lightMode` בוליאני, ואין התאמה ל-ocean |
| **polling** | 🟡 כ-50 לולאות סקר רשת (64 בסקירה הקודמת). כ-37 מאוחדות במנוע הסקר. 3 `setInterval` ב-SectorDashboard עוקפים את המנוע ולא נעצרים בלשונית מוסתרת. `AdminDashboard` סוקר את `/strips/global` כל 2 שניות |

**תחזוקה:** `SectorDashboard.tsx` הוא רכיב יחיד של כ-22,460 שורות, עם 481 `useState`, 121 `useEffect`, 294 `fetch` ו-21 `useMemo` בלבד. `GroundView.tsx` (6.3K) הוא God-component שני. יש DRY שסטה: `getSectorSiblings` מול `getFormationSiblings`, ו-`recentTakeoffTimes`. ה-JSX של VerticalView הודבק פעמיים.

---

## 🧭 סדר עבודה מומלץ

1. **אבטחה, תיקון של כשעה:**
   - נרמול הנתיב ב-`authMiddleware` וב-`requirementFor`: `toLowerCase`, הסרת לוכסן סופי וכפול, ובדיקות לשני המקרים.
   - אימות `pk` מלא ב-`sync/push`.
   - כללי ADMIN ל-GAPI, ו-PUBLIC ל-`inbound`/`health`.
   - בדיקת בעלות בנתיבי הנהג.
   - `local-session` שמאמת את האסימון המרכזי.
2. **מכונת המצבים של ההעברה:** `FOR UPDATE` + `status IN ('pending','acknowledged')` + 409 בארבעת המסלולים. `from_preset_id ?? from_workstation_id`. בדיקת route לכל מעבר.
3. **סנכרון:**
   - הסוכן קולט דרך `pool.connect()`, ולבטל את `pullMirror` כשהסוכן פעיל.
   - הוספת `/api/sync/mirror/delta` ל-`STATION_PATHS`.
   - תזמון מחדש ב-`tick` כשהסוכן תפוס.
   - ROLLBACK ב-`mirror` וב-`mirror/delta`.
   - `drainUntil` במעבר online.
4. **ביטול:** טריגר "סמן" על טבלאות חסומות, ונעילה ב-`routes/undo.js`.
5. **הגנה על הייצור מכלי פיתוח:**
   - e2e ו-integration test על DB נפרד בלבד.
   - סירוב לעלות מול host הייצור כש-`NODE_ENV` אינו production.
   - `lock_timeout` + `statement_timeout`.
   - healthcheck על `/api/ready`.
   - CI עם tsc ו-vitest.
6. **UI תפעולי:**
   - `res.ok` בשליחה ובדחייה של העברות.
   - לחץ ברומטרי רק ב-Enter/blur, עם בדיקת טווח.
   - שעון המסלולים לרכיב נפרד.
   - סקר `strip_aircraft`.
   - טיימר נחת לכל מטוס.
   - `BlockMiniView` ו-`VerticalView`: סף תזוזה ו-`pointercancel`.
   - ErrorBoundary לכל פאנל.
7. **חוב מתמשך:** פירוק `SectorDashboard`, i18n/RTL, `windowFrame`, החלפת HTML5 DnD, `xlsx`, וניקוי ההיסטוריה (הכרעת צוות).
