# SKY-KING — קטלוג מודולים (Services Catalog)

> מסמך זה מתעד כל מודול במערכת: שם, מיקום, תפקיד, ותלויות עיקריות.
> עודכן: 2026-06-22 | אחרי פירוק מלא של המונוליטים (server.js + App.tsx).

---

## תוכן עניינים

1. [Backend — DB Layer](#backend--db-layer)
2. [Backend — API Routes](#backend--api-routes)
3. [Frontend — Types](#frontend--types)
4. [Frontend — Offline (עמידות בנתק)](#frontend--offline-עמידות-בנתק)
5. [Frontend — Utils](#frontend--utils)
5. [Frontend — Shared Components](#frontend--shared-components)
6. [Frontend — Feature Components](#frontend--feature-components)
7. [Frontend — Views (מסכים ראשיים)](#frontend--views-מסכים-ראשיים)
8. [Frontend — Admin](#frontend--admin)
9. [Entry Points](#entry-points)

---

## Backend — DB Layer

### `server/db/pool.js` (כולל שרידות ל-failover)
**תוספת:** `SELECT` בלבד משודר שוב (2 ניסיונות, 120/400ms) על שגיאת connection (`57P01`, `08006`, `ECONNRESET`...), כך ש-failover של ה-DB הוא הבהוב ולא גל 500 בכל העמדות. **כתיבה לעולם אינה משודרת שוב** - `isReadOnlySql` הוא fail closed (גם CTE שמכיל `INSERT`/`DELETE` נפסל), כי אחרי מות connection אי אפשר לדעת אם ה-INSERT הספיק להתבצע. **מייצא בנוסף:** `isTransientDbError`, `isReadOnlySql`.

### `server/db/pool.js`
**תפקיד:** מופע יחיד (singleton) של PostgreSQL connection pool. מתחבר ל-Neon דרך `DATABASE_URL`. **עוטף** את ה-pool כך שכל שאילתה רצה בסכמת ה**סביבה** הנוכחית (`env-context`): סביבות טסות (1-10)→`public` (מסלול מהיר), תרגול (11-50)→`SET LOCAL search_path` בטרנזקציה. connection ששירת סביבת תרגול דרך `connect()` **מושמד** בשחרור (מונע דליפת search_path ב-pooler).
**מייצא:** `pool` (default, עטוף לפי סביבה), `rawPool` (גישה ישירה ל-DDL של ניהול סכמות).
**הערה:** כל קובץ ב-backend מייבא את ה-pool מכאן — מקור אמת יחיד לחיבור ה-DB.

### `server/db/env-context.js`
**תפקיד:** הקשר הסביבה של הבקשה הנוכחית דרך `AsyncLocalStorage`. ממפה מספר סביבה→שם סכמה (1-10→`public`, 11-50→`env_NN`) עם אימות טווח (הגנת injection).
**מייצא:** `runWithEnv`, `currentEnv`, `currentSchema`, `schemaForEnv`, `isValidEnv`, `ENV_MIN/ENV_MAX/FLYING_MAX/DEFAULT_ENV`.

### `server/db/sequences.js`
**תפקיד:** **תיקון sequences מפגרים בעלייה.** עמודת `SERIAL` שואבת מ-sequence; שחזור dump או seed שכותב `id` במפורש אינם מקדמים אותו, ומאותו רגע **כל** INSERT לטבלה נכשל ב-`duplicate key ... _pkey`. כך נשבר שכפול שדה התעופה - `airfield_sectors` (max=11, next=10), `airfield_polygons` (max=4, next=4) ו-`airfield_status_types` (max=6, next=2) פיגרו, וגם הוספה רגילה של סקטור לשדה הייתה נכשלת. הריצה אידמפוטנטית: `setval` ל-max(id) רק היכן שה-sequence מפגר.
**⚠ לא `pg_get_serial_sequence`:** הפונקציה מחזירה NULL כשה-sequence אינו **owned** על ידי העמודה - וזה בדיוק המצב אחרי שחזור dump, כלומר בדיוק הטבלאות השבורות. שם ה-sequence נשלף מברירת המחדל של העמודה (`nextval('...')`). טבלאות `az_*` (AeroZone) מדולגות. מכוסה בדיקות (`sequences.test.js`, 13).
**מייצא:** `SEQ_SKIP_PREFIXES`, `sequenceFromDefault`, `buildSequenceRepairPlan`, `resyncSequences`.

### `server/db/env-tables.js`
**תפקיד:** סיווג כל טבלאות ה-DB — מקור אמת יחיד לבידוד. `operational` (מבודדת פר-סביבה), `config` (משותפת ב-public), `hybrid` (עותק שורות מ-public). `checkTableClassification` מפיל את ה-boot אם טבלה ב-public אינה מסווגת.
**מייצא:** `OPERATIONAL_TABLES`, `CONFIG_TABLES`, `HYBRID_SEED_TABLES`, `classifyTable`, `checkTableClassification`.

### `server/db/envs.js`
**תפקיד:** ניהול סכמות התרגול — יצירה עצלה (`CREATE TABLE LIKE` + שכפול FKs + עותק שורות היברידיות, כ-DDL אחד ב-round-trip בודד), סנכרון ב-boot, איפוס, רישום ב-`environments`.
**מייצא:** `ensureEnvSchema`, `dropEnvSchema`, `resetEnvSchema`, `syncAllEnvSchemas`, `listEnvironments`, `touchEnvironment`, `forEachEnvironment`.

### `server/db/init.js`
**תפקיד:** יצירת סכמת ה-DB. מכיל `initDb()` שיוצר את כל ~50 הטבלאות (`CREATE TABLE IF NOT EXISTS`) + מיגרציות עמודות (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
**מייצא:** `initDb()`, `cleanupExpiredStrips()` (ניקוי שעתי של פ"מ ידניים שפג תוקפם).
**הערה:** schema בלבד — אין כאן נתוני אתחול.

### `server/db/seed.js`
**תפקיד:** נתוני אתחול (seed). מכניס בקרים ברירת מחדל, סקטורים, sub-sectors, table modes ועמדות, רק אם הטבלאות ריקות (`ON CONFLICT DO NOTHING`).
**מייצא:** `seedDb()`.
**הערה:** הופרד מ-init כדי שלא יערבב נתונים עם סכמה.

---

## Backend — Middleware

### `server/middleware/environment.js`
**תפקיד:** קובע את הקשר הסביבה לכל בקשה מכותרת `X-Env` (ברירת מחדל 1). מאמת טווח (400 על לא-חוקי), יוצר סכמת תרגול עצלנית (`ensure`), ומריץ את שאר ה-handler ב-`runWithEnv` — כך `pool.query` מכוון אוטומטית לסכמה בלי לגעת ב-353 ה-routes.
**מייצא:** `createEnvironmentMiddleware({ ensure })`.

---

## Backend — API Routes

> כל קובץ route מייצא `express.Router`. סך הכל **428 endpoints**.

### `server/routes/environments.js` — 3 routes
**תפקיד:** ניהול סביבות התרגול. נטען *לפני* ה-middleware (עובד ישירות מול `public`).
**Endpoints:** `GET /api/environments` (רשימת 50 הסביבות למסך הכניסה), `POST /api/environments/:env/enter` (יצירת סכמה + חותמת כניסה), `POST /api/environments/:env/reset` (איפוס סביבת תרגול — DROP + יצירה מחדש).

### `server/routes/crew.js` — 25 routes
**תפקיד:** ניהול בקרים (crew members), אימות כניסה לעמדה, OCR digits, **חברי העמדה**, בקר פעיל לעמדה, **תחקירים**.
**Endpoints עיקריים:** `/api/crew-members`, `/api/digits`, `/api/workstations/login`, `/api/workstation-session-roles`, `/api/preset-active-crew`, `/api/debriefs`.
**חברי העמדה (`workstation_session_roles`):** `bakar` הוא אותו תא לבקר (יב"א) ולפקח (מגדל) — התווית משתנה לפי `preset_role`, הנתון זהה. שלושת דגלי ההשגחה (`has_mushgach` / `has_mefale_mushgach` / `has_mashak_mushgach`) נשמרים בנפרד מהשם, כדי ש"קיים משגיח" יישאר מסומן גם כשעדיין לא הוקלד שם; דגל כבוי מנקה את השם בשמירה (מצב אחד ולא שניים).
**משמרות עמדה (`/api/station-sessions`):** `POST` פותח מקטע (וסוגר קודם מקטע פתוח קיים לאותה עמדה), `POST /close` סוגר, `GET` מחזיר רשימה עם `hours` ו-`open` **מחושבים בשרת** כדי שכל הצרכנים יראו את אותו מספר. מקטע נסגר בכל אירוע שמשנה מי יושב על העמדה — החלפת משתמש, עדכון חברי העמדה, יציאה — ונפתח מיד חדש (למעט יציאה), אחרת כל שעות המשמרת נזקפות למי שישב בסוף. אינדקס UNIQUE חלקי מבטיח מקטע פתוח אחד לעמדה. סגירה שאין לה מקטע פתוח מחזירה 200 עם `null` ולא שגיאה — יציאה מעמדה שלא נפתחה בה משמרת אינה תקלה.
**תחקירים (`/api/debriefs`):** `GET` (רשימה, **בלי** ה-`screenshot` — dataURL של מסך שלם; מוחזר `has_screenshot` בלבד), `GET /:id` (כולל תמונה), `POST`. `crew`/`involved` נשמרים כ-JSONB snapshot ולא כ-FK — התחקיר חייב להישאר קריא גם אחרי שהעמדה או הצוות השתנו.

### `server/routes/strips.js` — 45 routes
**תפקיד:** ליבת ניהול הפ"מים — CRUD, ייבוא, מטוסים בודדים (`strip_aircraft`), חימושים, מערכות, פיצול/מיזוג תצורה, סיכומי תצורה.
**Endpoints עיקריים:** `/api/strips`, `/api/strip-aircraft`, `/api/strips/partial-create`, `/api/strips/:id/merge-partial`, `/api/strips/ground-create`.

### `server/routes/transfers.js` — 18 routes
**תפקיד:** מנגנון ההעברות בין עמדות/סקטורים — שליחה, קבלה, **אישור (acknowledge)**, דחייה עם הערה, ביטול, ETA, קבלה למפה, העברה קלאסית.
**Endpoints עיקריים:** `/api/strips/:id/transfer`, `/api/transfers/:id/accept`, `/api/transfers/:id/acknowledge`, `/api/transfers/:id/reject`, `/api/transfers/:id/dismiss`, `/api/presets/:id/classic-incoming`.
**מצבי סטטוס:** `pending → acknowledged → accepted` / `rejected` (ראה data-model.md).

### `server/routes/sectors.js` — 17 routes
**תפקיד:** ניהול סקטורים (נקודות העברה), קשרי שכנות, sub-sectors, תצורת נקודות העברה.
**Endpoints עיקריים:** `/api/sectors`, `/api/sectors/:id/neighbors`, `/api/sub-sectors`.

### `server/routes/workstations.js` — 18 routes
**תפקיד:** תצורות עמדה (presets), פילטרים אישיים, סטריפים לעמדה, עומס עמדה, קישורי קבוצת עבודה, **עמדות לצפייה** (הריבועים בסרגל התחתון).
**Endpoints עיקריים:** `/api/workstation-presets`, `/api/workstation-personal-filters`, `/api/workstations/:id/strips`, `/api/preset-view-stations/:presetId`.
**רשימת העמדות:** `GET /api/workstation-presets` מחזיר `LEFT JOIN aviation_bases` — כלומר גם `parent_base_name`, כדי שצרכן לא ייאלץ לטעון בנפרד את טבלת הבסיסים רק כדי לקבץ לפי בסיס. הסדר: `COALESCE(updated_at, created_at) DESC` (העדכני ביותר ראשון — הסדר שבורר העמדה במסך הכניסה מציג). `PUT /:id` ו-`PATCH /:id/thresholds` דורסים `updated_at = NOW()`.

### `server/routes/maps.js` — 33 routes
**תפקיד:** מפות, אזורי מפה (polygons), טווחי גובה לאזור, שיוך פ"מ לאזור (flight zones), סגירות מרחב, **נקודות העברה קבועות על המפה**.
**Endpoints עיקריים:** `/api/maps`, `/api/map-zones`, `/api/zone-altitude-ranges`, `/api/strip-zone-assignments`, `/api/closures`, `/api/map-transfer-points`.

**סקטורים (מפות-בת):** מפה עם `parent_map_id` + `parent_rect` היא **סקטור** של מפת האב — נחתכת ממנה ב"מצב סקטור" של עורך האזורים. `PATCH /api/maps/:id` מעדכן **חלקית** (שם / `image_data` / `parent_rect` / `parent_base_id`) — כך ששינוי שם לא מוחק את התמונה; שם כפול מוחזר 409. אחרי **תיחום מחדש** יש לקרוא ל-`POST /api/maps/:id/sync-zones-from-parent`, שמקרין את אזורי האב לתחום החדש — וגם **יוצר** אזור-בת לאזור שנכנס לתחום רק עכשיו (בלי זה הרחבת תחום הייתה משאירה אזורים חדשים מחוץ למפת הסקטור).

### `server/routes/blocks.js` — 15 routes
**תפקיד:** ניהול בלוקי גובה — מרחבים, טבלאות, בלוקים, חריגות גובה.
**Endpoints עיקריים:** `/api/block-spaces`, `/api/block-tables`, `/api/blocks`, `/api/strips/:id/block-deviation`.

### `server/routes/airfield.js` — 86 routes (הגדול ביותר)
**תפקיד:** כל תפעול השדה הקרקעי — שדות תעופה, נקודות, מסלולי גלגול, מסלולי המראה, **הקפות**, taxiways, אלמנטים (רמזורים/מחסומים), פוליגונים, ATIS, NOTAMs, GRF, תאורה, זיהוי קונפליקטים על מסלול.
**Endpoints עיקריים:** `/api/airfields`, `/api/airfield-elements`, `/api/airfield-runways`, `/api/airfield-patterns`, `/api/route-link-groups`, `/api/live-runway-conflicts`, `/api/airfield-atis`.

**הקפות (`/api/airfield-patterns`):** הקפה משוייכת ל-**קצה מסלול** (`runway_id` + `runway_ident`, למשל "33" ולא "33/15") — זה מה שמאפשר שכפול הפוך שנותן את השם ההופכי (33 ← 15). GET מחזיר כל הקפה עם `elements[]` מקוננים. `POST /:id/duplicate` מעתיק **שרטוט בלבד** — הגאומטריה והשם מגיעים מהלקוח (`src/utils/trafficPattern.ts`) כדי שלא תשוכפל לוגיקה גאומטרית לשרת.

### `server/routes/base.js` — 18 routes
**תפקיד:** בסיסי תעופה, סטטוס בסיסים (מז"א/ספיגה/ציפורים), לחץ אטמוספרי, קשרים (תדרים/ערוצים).
**Endpoints עיקריים:** `/api/aviation-bases`, `/api/base-statuses`, `/api/workstation-contacts`.
> `GET /api/aviation-bases` מחזיר `has_emblem` (בוליאני) ולא את תמונת הסמל — הרשימה נטענת בכל כניסה לעמדה.

### `server/routes/emblem.js` — 6 routes
**תפקיד:** סמלים שמנוהלים ממסך הניהול — סמל בסיס (`aviation_bases.emblem_data`) וסמל מערכת (`system_emblems`, כרגע מיח"ה). GET מגיש תמונה **בינארית** (ETag + `no-cache`) כדי שה-`<img>` בעמדה ייטען ישירות מה-URL ויוטמן; 404 = אין סמל, והלקוח נופל לסמל המובנה.
**Endpoints:** `GET/PUT/DELETE /api/emblems/base/:id`, `GET/PUT/DELETE /api/emblems/system/:key`.

### `server/utils/emblemImage.js`
**תפקיד:** שער הכניסה היחיד לכתיבת סמל — מפענח data URL, מאמת סוג (PNG/JPEG/WebP/GIF, **בלי SVG** — הוא מוגש מאותו origin ויכול להריץ סקריפט) ותקרת גודל. **מייצא:** `parseEmblemDataUrl`, `MAX_EMBLEM_BYTES`.

### `server/utils/linkedRunways.js`
**תפקיד:** **מצב אחד למסלול פיזי מקושר.** אותו מסלול מוגדר בשני שדות בשמות שונים, וקישור המסלולים מצהיר שהם אותו דבר - ולכן סגירה, קיצור, תאורות והמסלולים שבשימוש הם מצב **פיזי** אחד. הגשר הוא מסלול הראי: מסלול המראה -> הראי שלו -> קבוצת הקישור -> הראי השכן -> מסלול ההמראה שלו (`LINKED_RUNWAYS_SQL`). `matchEndName` מתאים קצוות **לפי המספר** ולא לפי המיקום, כי שדה אחד יכול להגדיר `heading_a='18'` והשני `heading_a='36'` - התאמה לפי מיקום הייתה סוגרת את הקצה ההפוך; `matchEndSlot` עושה את אותו הדבר ל-NOTAM של קיצור, שנשמר לפי מיקום ('a'/'b'). מכוסה בדיקות (`linkedRunways.test.js`, 13). **מייצא:** `LINKED_RUNWAYS_SQL`, `linkedRunwayIds`, `matchEndName`, `matchEndSlot`.

### `server/utils/runwayRoute.js`
**תפקיד:** **מסלול המראה כמסלול הסעה ("מסלול ראי").** מסלול המראה הוגדר פעמיים ידנית — ביישות "מסלולים" (`airfield_runways`) וב"מסלולי הסעה" (`airfield_routes`, השרטוט שאליו נקשרים קישורים והתראות המראה) — ושתי ההגדרות יכלו לסתור זו את זו בשקט. כאן נגזרים כל שדות מסלול ההסעה ממסלול ההמראה: שם (או הקצוות כשאין שם), קצוות, שרטוט מהקואורדינטות, קטגוריה, צבע אחיד, והערה שאומרת מאיפה הגיע. `matchesRunway` **מאמץ** מסלול קיים שמתאים במקום ליצור כפילות (התאמה לפי שם או לפי **שני** הקצוות — קצה בודד תואם גם בין מסלולים שונים). `syncRunwayRoute` נקרא באותה טרנזקציה של POST/PUT של המסלול; `syncAllRunwayRoutes` משלים בעליית השרת. מכוסה בדיקות (`runwayRoute.test.js`, 17). **מייצא:** `RUNWAY_ROUTE_COLOR`, `runwayRouteName`, `runwayRoutePath`, `runwayRouteNote`, `routeFieldsFromRunway`, `matchesRunway`, `syncRunwayRoute`, `syncAllRunwayRoutes`.

### `server/routes/collaboration.js` — 27 routes
**תפקיד:** כלי שיתוף — קבוצות עבודה, הערות קבוצתיות, sticky notes, מצב ציור משותף (pen/shapes), הודעות בין עמדות, ספי מז"א.
**Endpoints עיקריים:** `/api/work-groups`, `/api/sticky-notes`, `/api/collab-state`, `/api/workstation-messages`.

### `server/routes/admin.js` — 48 routes
**תפקיד:** ניהול — סיריאלים, BDH ו**רשימת תיוג** (אותה טבלה, `kind='bdh'|'checklist'`), כלי עזר (aids), מצבי טבלה, לוג תחקיר (activity log).
**Endpoints עיקריים:** `/api/serials`, `/api/bdh`, `/api/aid-groups`, `/api/table-modes`, `/api/activity-log`, `/api/defaults`.

### `server/routes/classic.js` — 15 routes
**תפקיד:** טבלאות סטריפ קלאסיות + פריסות חלון סטריפ (strip window layouts/columns/cells).
**Endpoints עיקריים:** `/api/classic-strip-tables`, `/api/strip-window-layouts`.

### `server/routes/civilian.js` — 6 routes
**תפקיד:** סטריפים אזרחיים ושיוכם לעמדות.
**Endpoints עיקריים:** `/api/civ-strips`, `/api/civilian-assignments`.

### `server/routes/driver.js` — 20 routes
**תפקיד:** מערכת נהג/רכב — בקשות רכב, GPS, הודעות, מסלולי בסיס, חישוב נתיב (A*), אפליקציית נהג (`/driver`).
**Endpoints עיקריים:** `/api/vehicle-requests`, `/api/vehicle-gps`, `/api/route-plan`, `/api/base-routes`.

### `server/routes/provisional-transfers.js` — 6 routes
**תפקיד:** נקודות העברה **זמניות** (ad-hoc) בין 2 עמדות — נוצרות בזמן אמת מתפריט "יצירה" (לא במסך ניהול). A יוצר (`pending`) → B מאשר (`active`). דו-כיווני. גרירת פ"מ אליה = העברת עמדה-לעמדה (`transfer-to-preset`) + `touch`. ניקוי אוטומטי: >12ש' ללא שימוש **וגם** אחרי חצות.
**Endpoints:** `GET/POST /api/provisional-transfer-points`, `POST /api/provisional-transfer-points/:id/approve`, `POST /api/provisional-transfer-points/:id/touch`, `PATCH /api/provisional-transfer-points/:id/pos`, `DELETE /api/provisional-transfer-points/:id`. (ראה `provisional_transfer_points` ב-data-model.md)

### `server/routes/missionDesks.js` — 9 routes
**תפקיד:** דסק משימה כללי — CRUD דסקים (`mission_desks` + `layout_json`), שירותים (`mission_desk_services`), ו-state פר (שירות, עמדה) עם **fan-out שיתוף**: כתיבת state מועתקת לעמדות שב-`workstation_presets.mission_desk_sharing`.
**Endpoints:** `GET/POST /api/mission-desks`, `PUT/DELETE /api/mission-desks/:id`, `POST /api/mission-desks/:id/services`, `PUT/DELETE /api/mission-desk-services/:sid`, `GET /api/mission-desk-state`, `PUT /api/mission-desk-state/:serviceId`. (ראה `mission_desks` ב-data-model.md)

### `server/routes/suggestions.js` — 4 routes
**תפקיד:** הערות והצעות מהשטח. המפעיל שולח מחלון "אודות" (סמל המערכת) בכל עמדה, ומנהל המערכת הטכני רואה את כולן בטאב "הערות והצעות" במסך הניהול. **התאריך והשעה נרשמים בשרת** (`created_at DEFAULT NOW()`) ולא מגיעים מהלקוח. הטבלה `suggestions` היא **קונפיג** ב-`env-tables.js` — הצעה שנשלחה מתוך סביבת תרגול מגיעה לאותה רשימה ולא נמחקת עם שחרור הסביבה.
**Endpoints:** `GET /api/suggestions` (חדשה→ישנה, `?status=new|in_review|done|rejected` לסינון), `POST /api/suggestions` (חובה: `full_name`, `subject`, `details`; אחרת 400 `missing_fields`), `PATCH /api/suggestions/:id` (סטטוס והערת מנהל בלבד — תוכן ההצעה אינו נערך), `DELETE /api/suggestions/:id`. (ראה `suggestions` ב-data-model.md)

### `server/routes/mirage.js` — 3 routes
**תפקיד:** הזדהות דרך **מיראז'** (מערכת ניהול משתמשים והרשאות חיצונית — דמו ב-`mirage/`). מתווך: שולח `{app, personalNumber}` למיראז' (`MIRAGE_URL`, ברירת מחדל `http://localhost:7300`), ממפה roles → `is_admin`/`is_team_lead`, ומאחד עם איש צוות קיים לפי `personal_id` (שומר עמדות מאושרות). אין איש צוות תואם → משתמש וירטואלי (`id: null`).
**הגבלת עמדות ממיראז':** `workstations` בתשובת authorize מפוענח מול `workstation_presets` — עם `id` = השוואת ID טכני, בלי `id` = השוואת טקסט השם (trim). בכניסת מיראז' **מיראז' הוא המקור הבלעדי לעמדות**: רשימה ריקה = כל העמדות (לא רשימת ה-DB); הגבלה שלא זוהתה כלל → `[-1]` (שום עמדה). התוצאה → `approved_workstations`, וההגבלה חלה **גם על admin** (חריג מפורש מהתנהגות הכניסה הפנימית).
**Endpoints:** `POST /api/auth/mirage-login` (אופציונלי `presetId` — אכיפת הרשאת עמדה בהחלפת איש צוות; 403 `workstation_not_permitted`) → `{crewMember, roles, source}`; `GET /api/auth/mirage-eligible?presetId=N` → `{eligible:[{personalNumber, fullName, roles}]}` — המורשים לעמדה לפי מיראז' (להחלפת איש צוות). שגיאות: 403 `not_authorized`, 502 `mirage_unavailable`.
**תפקיד `manpower` ("כח אדם"):** הרשאה **נוספת ולא חלופית** — היא מצטרפת לתפקיד הבסיסי, ולכן `roles` יכול להיות `["admin","manpower"]` או `["team_lead","manpower"]`. במסך הניהול של המיראז' היא תיבת סימון נפרדת מבורר התפקיד, ולא עוד אפשרות בתוכו. פותחת את מסך "כ"א ותחקירים" ב-LOGIN (`crewMember.is_manpower`), ו**אינה** מקנה הרשאת ניהול בפני עצמה — הדגלים `is_admin`/`is_team_lead`/`is_manpower` נגזרים זה מזה בנפרד.
**תפקידים מקצועיים (`positions`) — ציר נפרד מ-`roles`:** `roles` (admin/team_lead/manpower/user) הוא ציר ההרשאה, ו-`roles.length > 0` הוא התנאי לגישה לאפליקציה; `positions` (`bakar` / `pakach` / `mashak` / `mefale`) הוא **מה האדם עושה**. אילו "בקר" היה נכנס לאותה רשימה, סימון תפקיד מקצועי היה מעניק גישה למערכת — ובנוסף אדם יכול להיות גם admin וגם בקר. נקבע פר-משתמש במסך הניהול של המיראז' ומוחזר גם ב-`POST /api/authorize`.

**אנשי הצוות למילוי חברי העמדה:** `GET /api/auth/mirage-crew?presetId=N` → `{presetId, presetName, byPosition:{bakar:[], mashak:[], mefale:[]}}`. הסינון הראשון הוא **הרשאה לעמדה** (אותו כלל בדיוק כמו `mirage-eligible`), ואז קיבוץ לפי התפקיד המקצועי: `bakar` מזין את שורת האב, המושגח והאחורי **בעמדת יב"א** · `pakach` את אותן שלוש **בעמדת מגדל** (בקר ופקח הם שני מקצועות, ומי שמוסמך ליב"א אינו בהכרח מוסמך למגדל) · `mashak` את המש"ק ומשגיחו · `mefale` את המפעיל ומשגיחו. **שמות בלבד** — אין כאן הזדהות ואין הרשאה, ולכן במכוון אין מספרים אישיים (בניגוד ל-`mirage-eligible`, ששם המספר דרוש להזדהות מחדש). משתמש **בלי** `positions` מופיע בכל התפריטים: רשימה ריקה פירושה "לא הוגדר" ולא "אף תפקיד", ובלי הכלל הזה כל התפריטים היו נפתחים ריקים בעמדה עד שמישהו יעבור על כל המשתמשים במיראז'. שירות שאינו זמין (502) → השדות נשארים טקסט חופשי, בלי לחסום.
**החלפת איש צוות בכניסת מיראז':** רכיב משותף `src/components/shared/MirageCrewSwap.tsx` (ב-SectorDashboard וב-MissionDeskView) — רשימה מסוננת לפי `mirage-eligible` + הזדהות מחדש במ.א. מול מיראז' (כולל בדיקת התאמה לאיש שנבחר) לפני ההחלפה.
**אפליקציית הדמו (`mirage/`, פורט 7300):** `POST /api/authorize`, `GET/POST/PUT/DELETE /api/users`, `GET /api/workstation-options` (מושך שמות עמדות מ-SKY-KING דרך `SKYKING_URL`, ברירת מחדל `http://localhost:3001`), מסך ניהול ב-`/` עם בחירה מרובה של עמדות + הזנה ידנית.
**סיסמאות (לפי התקן, NIST 800-63B):** `mirage/password.js` — מדיניות (12+ תווים, גדולה+קטנה+ספרה+תו מיוחד, בלי פרטים אישיים, בלי סיסמאות נפוצות) + scrypt עם salt פר-משתמש (פורמט `s2$salt$hash`, לעולם לא plaintext). `authorize` דורש `password`; שגויה/לא-קיים → `bad_credentials` אחיד (בלי חשיפת קיום); 5 כישלונות → חסימת דקה (`rate_limited`, ‏429). המתווך ממפה: ‏401 `bad_credentials`/`password_not_set`, ‏429 `rate_limited`. מיגרציה: pg store משלים hash-ים חסרים מ-data.json ב-boot; משתמש בלי סיסמה מסומן ⚠ במסך הניהול ומוגדר דרך "עריכה".

### `server/app.js`
**תפקיד:** הרכבת Express — middleware (cors, json), חיבור כל ה-routers תחת `/api`, הגשת static (production) / redirect ל-Vite (dev).

### `server/listen.js`
**תפקיד:** האזנה אמינה — מחליף את `app.listen(port, host, cb)`. Express 5 רושם את ה-callback שלך **גם** כמאזין ל-`'error'`, ולכן bind כושל מפעיל את ה-callback ה"מוצלח": השרת מדפיס "listening" בזמן ש-`address()` הוא `null`, וקיום המאזין מונע קריסה — התהליך נשאר חי, שקט וללא פורט. כאן נשענים על אירוע `'listening'` עצמו ומחזירים Promise (resolve רק כשבאמת מאזינים). משמש את `server.js` ואת `mirage/server.js` — עזר רשת טהור, בלי תלות בלוגיקה של אף אחד מהם.
**מייצא:** `listen(app, port, host)`.

---

## Frontend — Types

### `src/types/index.ts`
**תפקיד:** הגדרות TypeScript מרכזיות.
**מייצא:** `AircraftIconType`, `CrewMember`, `WorkstationSession`, `Strip`, `Transfer`, query types (`QOperator`/`QCompare`/`QLeaf`/`QGroup`/`QNode`), map types (`MapZone`/`ZoneAltRange`/`StripZoneAssignment`/`MapGeoAnchor`), ground types (`AircraftPos`/`GroundAircraftRow`).

### `src/types/ground.ts`
**תפקיד:** טיפוסי runtime של תפעול קרקעי (frontend-parsed shapes).
**מייצא:** `GroundStatusKey`, `AircraftPos`, `GroundAircraftRow`, `MapZone`, `ZoneAltRange`, `StripZoneAssignment`, `VectorLine`, `VectorData`.

### `src/types/stripGrid.ts`
**תפקיד:** טיפוסי פריסת Strip Grid (SG) + קטלוג שדות סטריפ קלאסי.
**מייצא:** `SGCell`, `SGSplit`, `SGNode`, `SGCondition`, `CLASSIC_STRIP_FIELDS`.

### `src/types/stripFields.ts`
**תפקיד:** קטלוגי שדות וקבועים משותפים לעריכה.
**מייצא:** `STRIP_FIELD_DEFS`, `CUSTOM_FIELD_EDITABLE_OPTIONS`, `EDITABLE_LABELS`, `STICKY_COLORS`.

### `src/types/missionDesk.ts`
**תפקיד:** טיפוסי דסק משימה כללי — עץ פריסה (BSP), שירותים (buttons/freetext/table), config ו-state.
**מייצא:** `MDNode`, `MDSplit`, `MDLeaf`, `MDServiceType`, `MissionDesk`, `MissionDeskService`, `MDTableConfig`, `MDFreeTextConfig`, `MDButton`, `MDButtonsState`, `MDFreeTextState`, `MDTableState`, `MDTableRule`, `MDRowStyle`.

---

## Frontend — i18n (דו-לשוניות)

### `src/i18n/index.ts`
**תפקיד:** אתחול `react-i18next` — עברית ברירת מחדל, אנגלית נבחרת; התמדה ב-`localStorage['bt-lang']`. **מייצא:** `default` (i18n), `setAppLanguage(lang)`, `LANG_STORAGE_KEY`, `AppLang`. הערה: התרגומים עטופים ב-namespace `translation` כך ש-`t('login.x')` הם מפתחות מקוננים.

### `src/i18n/useDirection.ts`
**תפקיד:** hook יחיד שמסנכרן `<html dir/lang>` לפי השפה (he→rtl, en→ltr). **מייצא:** `useDirection()`. מופעל ב-root (`App`).

### `src/i18n/locales/he.json` · `en.json`
**תפקיד:** קבצי תרגום. כרגע namespaces `common` + `login` (מסך הכניסה מתורגם במלואו — Pilot).

---

## Frontend — Offline (עמידות בנתק)

> העמדה עובדת ברשת מבודדת מול DB SKY-KING. כשכבל הרשת מנותק היא ממשיכה לעבוד
> על המידע שהיה נכון לרגע הנתק, בלי שיתוף בין עמדות. ראה [ARCHITECTURE.md](ARCHITECTURE.md#עמידות-בנתק).

### `src/offline/policy.ts`
**תפקיד:** מסווג כל כתיבה בנתק - `private` (outbox מקומי) / `shared` (נחסמת) / `drop`. ברירת המחדל `shared` (fail closed). **מייצא:** `classifyWrite`, `isApiRequest`, `isReadMethod`, `normalizePath`.

### `src/offline/store.ts`
**תפקיד:** אחסון מקומי בעמדה מעל IndexedDB (נפילה לזיכרון כשאין), שני object stores: `api-cache` ו-`outbox`. **מייצא:** `createStore`, `createIdbStore`, `createMemoryStore`, `OfflineStore`.

### `src/offline/outbox.ts`
**תפקיד:** תור FIFO של כתיבות פרטיות שממתינות לחזרת הקשר; `drain` עוצר בכשל קשר ומסיר פריט שנדחה ב-4xx. **מייצא:** `Outbox`, `OutboxItem`, `seqKey`.

### `src/offline/netStatus.ts`
**תפקיד:** מקור אמת יחיד למצב הקשר וגיל המידע (לא `navigator.onLine` - הוא לא יודע אם השרת נפל). **מייצא:** `getNetSnapshot`, `subscribeNet`, `markOnline`, `markOffline`, `dataAgeMs`.

### `src/offline/apiFetch.ts`
**תפקיד:** **היירוט המרכזי** על `fetch` - GET נשמר ומוגש מה-cache בנתק, כתיבה מנותבת לפי `policy`. ה-cache **משויך לסביבה** (`X-Env`) כדי שתרגול ואמת לא יחלקו רשומות. **מייצא:** `installOfflineFetch`, `createOfflineFetch`, `cacheKey`, `BLOCKED_CODE`, `HDR_FROM_CACHE`, `HDR_CACHED_AT`.

### `src/offline/useNetStatus.ts`
**תפקיד:** hook ל-React (`useSyncExternalStore`); מתקתק כל שנייה **רק בנתק**. **מייצא:** `useNetStatus`, `formatAge`.

### `electron/stationServer.cjs`
**תפקיד:** שרת סטטי זעיר בתוך העמדה - מגיש את `dist/` מהדיסק ומפרוקסס `/api` ו-`/driver` לשרת האמיתי, עם כשל מהיר (502) במקום תקיעה. מאזין ל-127.0.0.1 בלבד, עם הגנת path traversal. **מייצא:** `createStationServer`, `shouldProxy`, `resolveStaticPath`, `contentTypeFor`, `isAssetLike`.

---

## Frontend — Utils

### `src/config.ts`
**תפקיד:** קבועי תצורה גלובליים. **מייצא:** `API_URL`, `SCREEN_SCALE_MAP`.

### `src/utils/routeLinks.ts`
**תפקיד:** **קישורי מסלולים בין שדות תעופה.** אותו מסלול פיזי מוגדר בכמה שדות בשמות שונים. קישור אחד הוא **קבוצה** של מסלולים, N>=2, והשדה **נגזר מהמסלול** (`airfield_routes.airfield_id`) ואינו נשמר בנפרד. שני מודלים קודמים הוחלפו: הזוגי (`route_a <-> route_b`), שדרש שלושה זוגות נפרדים כדי לקשר שלושה מסלולים וכל אחד מהם ניתן היה למחוק לבד ולהשאיר קישור חלקי ושקט; ו**החבר מבוסס-העמדה** (`preset_id + route_id`), שהיה טעות באפיון - מסלול שייך לשדה, ועמדה רק רואה אותו דרך השדה שלה, ולכן היה אפשר לקשר עמדה אחת בשדה ולהשאיר את שכנתה מנותקת. `routeKind` מסווג מסלול (מסלול המראה / מטוסים / רכב / כללי) כדי שהקישור יחול על **כל** סוגי המסלולים ולא רק על הסעה; `is_runway` גובר על הקטגוריה. מכוסה בדיקות (`routeLinks.test.ts`, 23).
**מייצא:** `LinkMember`, `LinkGroup`, `RouteKind`, `LinkValidation`, `MIN_LINK_MEMBERS`, `ROUTE_KINDS`, `routeKind`, `routeKindIcon`, `validateLinkGroup`, `isMemberTaken`, `addMember`, `removeMember`, `linkedRouteIds`, `groupSummary`.

### `src/utils/runwayEnds.ts`
**תפקיד:** **כיוון אחד למסלול בפאנל "מסלולים בשימוש".** שני קצוות של אותו מסלול פיזי הם כיוונים **מנוגדים** (המראה מ-15L מול נחיתה ל-33R = תנועות זו מול זו על אותו אספלט), אבל הפאנל החזיק שתי רשימות חופשיות ולכן איפשר לסמן את שניהם. כאן הכלל: כיוון אחד למסלול, **חוצה את שתי השורות**. לחיצה על הקצה הנגדי אינה נחסמת אלא **מחליפה כיוון** (זו הפעולה התכופה בשדה), ו-`endUseState` מחזיר `opposed` כדי שהכפתור יסומן כתום **לפני** הלחיצה. מכוסה בדיקות (`runwayEnds.test.ts`, 15). **מייצא:** `oppositeEnd`, `runwayEndsInUse`, `setEndInUse`, `endUseState`, `EndsInUse`, `UseRow`, `EndUseState`.

### `src/utils/schematicCanvas.ts`
**תפקיד:** **משטח הציור של שדה בלי מפת רקע.** שדה יכול להיבנות סכמטית בלבד (מסלולים, הקפות, אלמנטים על משטח ריק), אבל כל שכבות המפה ממוקמות לפי גבולות התמונה המרונדרת - וכשאין תמונה הגבולות היו `null` ו**שום שכבה לא רונדרה**: השרטוט "לא נטען". הקואורדינטות נשמרות באחוזים, ולכן היחס (4:3) הוא חלק מהנתון וחייב להיות זהה בעמדת הניהול (שם מציירים) ובעמדה (שם מציגים) - הקבוע כאן הוא המקור היחיד לשתיהן. `containBounds` היא נוסחת ה-`object-fit: contain` המשותפת, ולכן היא חלה גם על תמונה אמיתית וגם על המשטח. מכוסה בדיקות (`schematicCanvas.test.ts`, 7). **מייצא:** `SCHEMATIC_ASPECT`, `SCHEMATIC_ASPECT_CSS`, `containBounds`, `Bounds`.

### `src/utils/runwayShape.ts`
**תפקיד:** **ציור מסלול המראה כמסלול ולא כקו.** קו בעובי אחיד אינו נושא מידע מלבד "יש כאן מסלול"; השרטוט כאן נושא מיסעה ברוחב, ספי מסלול ("פסנתר") בשני הקצוות, קו מרכז מקווקו ומספר כיוון בכל קצה - מסובב לכיוון הטיסה מאותו קצה, כמו הצביעה על המסלול עצמו. אותו מרחב איזוטרופי של `trafficPattern.ts` (אחוז מגובה התמונה + `aspect`), אחרת רוחב המסלול היה משתנה עם הכיוון. `derivedRunwayWidth` גוזר את הרוחב מהאורך: הפרופורציה האמיתית (45 מ' על 3 ק"מ) יוצאת חוט דק שבו הסימונים אינם נראים - כלומר חזרה לקו - ולכן השרטוט סכמטי בכוונה וחסום בין 2.6 ל-7. מכוסה בדיקות (`runwayShape.test.ts`, 19).
**מייצא:** `RunwayGeo`, `RunwayAxis`, `ThresholdBar`, `Designator`, `DEFAULT_RUNWAY_WIDTH`, `MIN_RUNWAY_WIDTH`, `MAX_RUNWAY_WIDTH`, `derivedRunwayWidth`, `runwayAxis`, `runwayQuad`, `thresholdBars`, `centerlineDashes`, `designatorText`.

### `src/utils/scale.ts`
**תפקיד:** התאמת גודל לפי מסך. **מייצא:** `scale`, `sc(n)` — מכפיל ערך פיקסלים בפקטור המסך.

### `src/utils/session.ts`
**תפקיד:** ניהול סשן עמדה ב-sessionStorage + בניית הסקטורים הרלוונטיים לעמדה (`buildRelevantSectors`) — משותפת לכניסה לעמדה ולמסגרת הצפייה בעמדה אחרת; עמדה קלאסית **אינה** מקבלת את הרחבת סקטורי נקודות המסירה/הקבלה (היא נשענת על רשימה ריקה כדי לבחור את ענף הטעינה הנכון).
**מייצא:** `getSession`, `saveSession`, `clearSession`, `buildRelevantSectors`.

### `src/utils/stationPeek.ts`
**תפקיד:** הלוגיקה של **תצוגת עמדות אחרות בעמדה** — מי מוצג (סינון מול הרשאות המיראז'), באיזה סדר, באיזה גודל, ובאיזה URL. כולל את שתי ההגנות של מצב הצפייה: `installPeekWriteGuard` (חוסם כל כתיבה ל-API במסגרת peek — נקודה אחת במקום 149 אתרי כתיבה ב-SectorDashboard) ו-`installPeekPollThrottle` (מכפיל מרווחי פולינג ≥2ש' ב-`PEEK_POLL_FACTOR`; טיימרים מהירים כמו שעון העמדה נשארים מדויקים). שתיהן מותקנות ב-`src/index.tsx` ופעילות **רק** במסמך שנטען עם `?peek=`.
**מייצא:** `canViewStation`, `visibleViewStations`, `stationLabel`, `stepTileIdx`, `tileHeight`, `peekUrl`, `parsePeekPresetId`, `isPeekMode`, `IS_PEEK_FRAME`, `peekFetchGuard`, `installPeekWriteGuard`, `peekIntervalDelay`, `installPeekPollThrottle`, `reorderStations`, `TILE_WIDTHS`, `DEFAULT_TILE_IDX`, `PEEK_POLL_FACTOR`, `PEEK_PARAM`, `ViewStation`.

### `src/utils/presetGroups.ts`
**תפקיד:** קיבוץ עמדות לפי **בסיס אב** ומיון "האחרון שעודכן/נוצר ראשון" — הלוגיקה הטהורה שמאחורי בורר העמדה במסך הכניסה, בקובץ נפרד כדי שתיבדק בלי DOM ותשמש גם מסכים נוספים (הפצת בד"ח). החותמת הקובעת היא `updated_at` ובהיעדרה `created_at`; עמדה בלי חותמת מקבלת 0 ויורדת לסוף. קבוצת "ללא בסיס אב" תמיד אחרונה (סל שאריות, לא בסיס), ובסיס שנמחק (מזהה בלי שם מוכר) מאוחד אליה במקום להציג מזהה גולמי. `shouldShowGroupHeaders` מחזיר `false` לקבוצה יחידה — אז אין מה לקבץ והכותרת רק מוסיפה קליק.
בנוסף, אותו מודול מחזיק את **בסיס האב כציר הרשאה** במסך הניהול: `allowedBaseKeys` ממפה את העמדות שהמיראז' אישר לראש הצוות לבסיסי האב שלהן (אישור לעמדה אחת פותח את כל המכלול), רשימת אישורים ריקה = אין הגבלה (`null`), ו-`filterByAllowedBases`/`isBaseAllowed` מסננים לפיה כל תוכן admin. **תוכן בלי בסיס אב גלוי לכולם** — סל התוכן המשותף, לא תוכן מסווג. `groupItemsByBase` הוא הקיבוץ הכללי לתוכן admin (מפות, עזרים, בלוקים, עמדות במסך הניהול), ממוין **לפי שם** ולא לפי עדכניות — רשימת הגדרות שמחפשים בה לפי שם, בשונה מבורר הכניסה התפעולי.
**מייצא:** `presetStamp`, `groupPresetsByBase`, `shouldShowGroupHeaders`, `formatStationTime`, `baseKeyOf`, `allowedBaseKeys`, `isBaseAllowed`, `filterByAllowedBases`, `groupItemsByBase`, `PresetLike`, `BaseLike`, `StationGroup`, `BaseScoped`, `BaseItemGroup`.

### `src/utils/kiosk.ts`
**תפקיד:** מסך מלא בעליית עמדה (kiosk) — בבנייה לפרודקשן העמדה עולה כמו F11, בלי שורת כתובת ובלי טאבים. נקרא מתוך ה-click של הכניסה ב-`WorkstationLogin` (Fullscreen API דורש user gesture), תמיד על `document.documentElement` כדי ש-portals ל-`body` יישארו גלויים. דגל עקיפה ב-localStorage `bt-kiosk`: `off` מבטל, `on` מפעיל גם בפיתוח.
**מייצא:** `enterKioskFullscreen`, `isKioskEnabled`, `isFullscreen`, `KIOSK_FLAG_KEY`.

### `src/utils/mirageAuthError.ts`
**תפקיד:** מיפוי סטטוס שגיאה של הזדהות מיראז' למפתח i18n — משותף למסך ה-LOGIN (`App.tsx`) ולהחלפת איש צוות בעמדה (`MirageCrewSwap`), כדי שאותה שגיאה תיקרא אותו דבר בשני המקומות. מחזיר **מפתח** ולא טקסט מתורגם (הקורא מפעיל `t()`). `5xx` מופרד מ"שגיאה בכניסה" ל-`login.errorServerDown` — כשהשרת לא זמין המשתמש לא אמור לחשוב שהסיסמה שלו שגויה; `502` נשאר ייעודי (המיראז' עצמו לא ענה).
**מייצא:** `mirageAuthErrorKey`, `MirageErrorResponse`.

### `src/utils/aircraft.ts`
**תפקיד:** מערכת אייקוני מטוסים לפי טייסת. **מייצא:** `getSquadronAircraftType`, `isHeliAircraftType`, `getHeliPngSrc`, `renderAircraftSvgPaths`.

### `src/utils/queryBuilder.ts`
**תפקיד:** מנוע סינון (Query DSL) — AND/OR/NOT עם השוואות, כולל **שדות זמן** (`takeoff_time`, `planned_landing_time`) שההשוואה עליהם היא **בדקות מעכשיו** (`lt`/`gt`/`eq`/`neq`/`passed`) ו-"אצלי" לפי בסיס העמדה. **מייצא:** `Q_FIELDS`, `Q_TEXT_OPS`, `Q_BOOL_OPS`, `Q_TIME_OPS`, `Q_PRESET_OPS`, `Q_TIME_FIELDS`, `Q_OPERATOR_LABELS`, `qGenId`, `qMinutesFromNow`, `emptyQGroup`, `hasConditions`, `clampMenuPos`, `getQFieldValue`, `evalQLeaf`, `evaluateQuery`.

### `src/utils/dataWindows.ts`
**תפקיד:** חלונות נתונים בעמדה — מונים מוגדרי-שאילתא (הגדרה, ניקוי JSONB, הרצה על הפ"מים, מיזוג הגדרת העמדה עם שינויי הסשן). **מייצא:** `DW_MODES`, `DW_COUNT_BY`, `DW_DEFAULT_COLOR`, `dwDefault`, `dwNormalize`, `dwEvaluate`, `dwMergeSession`, `dwSessionKey`, `dwLoadSession`, `dwSaveSession`, `dwSubscribe`, טיפוסי `DataWindowDef`/`DataWindowResult`.

### `src/utils/strips.ts`
**תפקיד:** עזרי פ"מ וגובה. **מייצא:** `getFormationDisplayName`, `getTransferLabel`, `getTransferSq`, `normalizeAlt`, `parseAltToFeet`, `computeBlockDeviation`.

### `src/utils/stripOrder.ts`
**תפקיד:** סדר רשימת הפ"ממים בחלונית - קודם מי שבאוויר לפי זמן המראה (מוקדם→מאוחר), אחריהם מי שעל הקרקע לפי המראה מתוכנן; ללא זמן נדחף לסוף הקבוצה. **מייצא:** `takeoffMs`, `compareAirborneThenTakeoff`.

### `src/utils/digits.ts`
**תפקיד:** API לאימון OCR (ספרות כתב יד). **מייצא:** `getLearnedDigits`, `saveLearnedDigit`, `clearLearnedDigits`, `getDigitsCount`.

### `src/utils/handwriting.ts`
**תפקיד:** השוואת תמונות לזיהוי כתב יד. **מייצא:** `compareImages`.

### `src/utils/notes.ts`
**תפקיד:** קידוד/פענוח שדה הערה (טקסט / data-URL / JSON). **מייצא:** `parseNoteValue`, `serializeNoteValue`.

### `src/utils/bidi.ts`
**תפקיד:** בידוד דו-כיווני לטקסט שהוזן על ידי המשתמש (שם אזור, הערה, שם סגירה). שם שמתחיל בספרה כמו `61 צפון` מוצג הפוך (`צפון 61`) כשכיוון הבסיס של ההקשר הוא LTR - וזה המצב באזור המפה בעמדה, שיושב במיכל LTR מכוון (`#map-area`), וגם בכל המסך כשה-UI באנגלית. `bidiAuto` עוטף ב-FSI/PDI (התקן היוניקודי של `dir="auto"`): כיוון הבסיס נקבע לפי האות החזקה הראשונה במחרוזת עצמה, כלומר בדיוק כפי שהוזנה. זו הדרך היחידה שעובדת גם ב-SVG `<text>`, שאין בו תמיכה במאפיין `dir`; התווים בלתי נראים וברוחב אפס ולכן לא משנים מרכוז (`textAnchor="middle"`).
**מייצא:** `bidiAuto`, `FSI`, `PDI`.

### `src/utils/speech.ts`
**תפקיד:** זיהוי קולי - הפשטה מעל שני מנועים, כי ה-Web Speech API **לא עובד ב-Electron** (נשען על שירות ענן של גוגל שהמפתחות אליו קומפלו רק לתוך Chrome; ב-Electron נכשל מיד ב-`network`, ראה REFACTOR_LOG 31.07). בדפדפן משתמש ב-Web Speech כמו קודם; בעמדה מקליט ב-`MediaRecorder`, עוצר אוטומטית אחרי 1.2 שנ' שקט (`AnalyserNode` + `recordingDecision`), ממיר ל-16kHz מונו ושולח ל-whisper המקומי דרך `window.skyking`. מחזיר **טקסט גולמי בלבד** - פרסור הפקודות נשאר ב-`SectorDashboard`. מכוסה בדיקות (`speech.test.ts`, 13 - כללי העצירה האוטומטית).
**מייצא:** `startSpeech`, `speechBackend`, `isElectron`, `recordingDecision`, `isSilent`, `micErrorCode`, `SpeechSession`, `SpeechCallbacks`, `SILENCE_RMS`, `SILENCE_HOLD_MS`, `NO_SPEECH_MS`, `MAX_RECORD_MS`.

### `src/utils/wav.ts`
**תפקיד:** קידוד WAV (PCM 16 ביט מונו) עבור מנוע התמלול המקומי - whisper.cpp מקבל **רק** 16kHz מונו PCM16, והדפדפן מקליט webm/opus ב-48kHz. פונקציות טהורות בלי תלות ב-DOM (המרת הקצב עצמה נעשית ב-`OfflineAudioContext`). `bytesToBase64` מפצל לקטעים כדי ש-`btoa` לא יקרוס על הקלטה ארוכה. מכוסה בדיקות (`wav.test.ts`, 17).
**מייצא:** `encodeWav`, `floatTo16BitPCM`, `bytesToBase64`, `WAV_HEADER_BYTES`, `WHISPER_SAMPLE_RATE`.

### `src/utils/geo.ts`
**תפקיד:** המרות גיאו (פיקסל↔lat/lon) + פורמט DMS. **מייצא:** `MapGeoAnchor`, `buildGeoAnchor`, `geoToImagePct`, `imagePctToGeo`, `fmtDms`.

### `src/utils/sectorFocus.ts`
**תפקיד:** **סקטורים על המפה.** סקטור = מפת-בת (`parent_map_id` + `parent_rect` באחוזי-תמונה). בעמדה הסקטור **אינו מחליף מפה**: לחיצה ברשימה שבפינת המפה ממקדת את אותה מפה (זום+פאן) על תחום הסקטור, ו"מפה מלאה" מחזירה לזום 1 — כך הפ"ממים, האזורים ונקודות ההעברה נשארים חיים (מעבר למפת הבת היה מנתק אותם). `sectorFocusView` מחשב את הזום והפאן: שכבות המפה עוברות `translate(pan) scale(zoom)` עם `transform-origin: center`, ולכן `pan = (מרכז הפאנל - מרכז הסקטור) * zoom`; גודל הפאנל נגזר מ-`imgBounds` (`panelW = width + 2*left`) ולא ממדידת DOM נוספת. הזום נחסם בתקרת סרגל המפה (3) כדי שלא תיווצר קפיצה בלחיצה על +. מכוסה בדיקות (`sectorFocus.test.ts`, 10).
**מייצא:** `RectPct`, `ImgBounds`, `MapView`, `MAX_SECTOR_ZOOM`, `MIN_SECTOR_ZOOM`, `FULL_MAP_VIEW`, `parseParentRect`, `sectorFocusView`.

### `src/utils/trafficPattern.ts`
**תפקיד:** **הקפות** - המסלול המלבני סביב המסלול (אחרי המראה -> צולבת -> עם הרוח -> בסיס -> פיינל). **נשמר כפרמטרים ולא כרשימת נקודות חופשית:** עוגן (סף המסלול) + כיוון + צד (ימין/שמאל) + ארבעה אורכי צלעות, ושש הנקודות נגזרות. כך גרירת פינה מאריכה **רק** את הצלעות הצמודות והזוויות נשארות ישרות, ו"שכפול הפוך" הוא שיקוף סביב אמצע המסלול: העוגן עובר לקצה השני, הכיוון +180° והצד מתחלף - כך ההקפה נשארת באותו צד פיזי של המסלול.
**⚠ מרחב איזוטרופי:** שכבת ה-SVG של המפה היא `preserveAspectRatio="none"`, ולכן יחידה ב-X אינה שווה ליחידה ב-Y. מלבן אמיתי על הקרקע הוא מלבן ב**פיקסלים** - לכן כל החישוב נעשה ביחידות אחוז מגובה התמונה (`x_iso = x_pct * aspect`) וכל פונקציה מקבלת `aspect`. `fitToMap` מכווץ הצעה שגולשת מהתמונה (הקפה אמיתית גדולה פי כמה מהמסלול, ותרשים שדה אינו מכיל אותה). מכוסה בדיקות (`trafficPattern.test.ts`, 52).
**מייצא:** `PatternGeometry`, `PatternSide`, `PatternLeg`, `RunwayEnd`, `Pt`, `LEG_KEYS`, `LEG_LABEL_KEYS`, `MIN_LEG`, `DEFAULT_GEOMETRY`, `boundsAspect`, `patternPoints`, `patternLegs`, `mirrorGeometry`, `translateGeometry`, `resizeByCorner`, `reciprocalIdent`, `runwayEnds`, `fitToMap`, `geometryFromRunway`, `patternPathSegments`, `patternPathD`, `normalizeGeometry`.

### `src/utils/eta.ts`
**תפקיד:** זמן טיסה אוטומטי מהפ"מ לנקודת ההעברה, כשהמפה **מעוגנת**. טווח בקו ישר (haversine, מייל ימי) כפול `ROUTE_FACTOR` (10% - המסלול בפועל אינו קו ישר), חלקי מהירות שיוט: **350** קרב · **120** מסוק/תובלה/כטמ"מ/GA · **90** אז"מ · **80** מרסס · **50** דאון · **20** רחפן/טיסן. **המוצא הוא האזור, לא סמל הפ"מ:** `closestGeoOnPolygon` מחזיר את הנקודה בפוליגון האזור (או באזורים המחוברים - הקצר מביניהם) הקרובה ביותר ליעד; יעד בתוך האזור = טווח 0. הפוליגון מומר לנ"צ דרך עוגני המפה, והחישוב נעשה במישור מקומי סביב היעד כי מעלת אורך מתקצרת עם קו הרוחב. בלי אזור נופלים למיקום הפ"מ: נ"צ שמור (`map_lat/lon`) → `pos_x/y` של השיוך → פין (`map_pin_x/y`, state מקומי). הערך הוא **ברירת מחדל** בטופס ההעברה - הבקר יכול לדרוס. מכוסה בדיקות (`eta.test.ts`, 46).
**מייצא:** `ROUTE_FACTOR`, `SPEED_FIGHTER_KT`, `SPEED_HELI_TRANSPORT_KT`, `haversineNm`, `cruiseSpeedKt`, `etaMinutesFor`, `computeTransferEta`, `closestGeoOnPolygon`, `pixelToGeo`, `stripSavedGeo`, `stripPinGeo`, `transferPointGeo`, `GeoPoint`, `TransferEta`, `AutoEta`, `ImgBounds`, `TransferPointMarker`.

### `src/utils/emblemSource.ts`
**תפקיד:** מקור אמת יחיד לכתובות הסמלים שמנוהלים בניהול, ו-`warmEmblems` שמושך אותן מיד אחרי הכניסה לעמדה — לפני שהדשבורד מתחיל את מטח קריאות ה-API שלו (HTTP/1.1 = 6 חיבורים למקור). **מייצא:** `MICHA_EMBLEM_URL`, `baseEmblemUrl`, `warmEmblems`.

### `src/utils/emblemUpload.ts`
**תפקיד:** בחירת תמונת סמל בניהול — ולידציית סוג (בלי SVG) וכיווץ ל-350px (אותו גודל של הסמלים המובנים) לפני שמירה ב-DB, כך ששורה שוקלת ~50KB ולא מגה-בייטים. WebP כשהדפדפן יודע לקודד, אחרת PNG. מכוסה בדיקות (`emblemUpload.test.ts`, 28). **מייצא:** `EMBLEM_MAX_PX`, `EMBLEM_ACCEPT`, `EMBLEM_ALLOWED_TYPES`, `isAllowedEmblemFileType`, `fitWithin`, `dataUrlMime`, `fileToEmblemDataUrl`.

### `src/utils/stripGrid.ts`
**תפקיד:** עזרי runtime ל-Strip Grid (פריסת תאים). **מייצא:** `ensureSGBlinkStyle`, `sgGenId`, `sgDefaultCell`, `sgUpdate`, `sgSplit`, `sgRemove`, `sgGetAllCells`.

### `src/utils/stripWindow.tsx`
**תפקיד:** טיפוסים + עזרים לחלון סטריפ (Strip Window) — פריסות waypoint. **מייצא:** `SWLeaf`, `SWSplit`, `SWNode`, `SW_TEXTURES`, `SW_TEMPLATES`, `swGetBgStyle`, `swGenId`, `swDefaultLeaf`, `swRemapIds`, `swUpdate`, `swSplit`, `swRemove`, `swFindLeaf`.

### `src/utils/missionDesk.ts`
**תפקיד:** לוגיקה טהורה לדסק משימה כללי — עץ BSP, פרסר נוסחאות (בלי eval), סיכומים, עיצוב מותנה, מצבי כפתור, fan-out שיתוף. מכוסה בדיקות (`missionDesk.test.ts`, 29). **מייצא:** `mdGenId`, `mdDefaultLeaf`, `mdUpdate`, `mdSplit`, `mdRemove`, `mdGetAllLeaves`, `evalFormula`, `computeCells`, `computeSummary`, `summaryLabel`, `matchRule`, `rowStyle`, `cycleButtonState`, `resolveFanout`.

---

## Frontend — Shared Components

### `src/components/shared/ConfirmModal.tsx`
**תפקיד:** דיאלוג אישור גלובלי (מחליף `window.confirm`) עם תמיכת מקלדת. **מייצא:** `ConfirmModal` (default), `customConfirm`.

### `src/components/shared/ConnectionBanner.tsx`
**תפקיד:** חיווי "מידע לא חי" מעל כל המסכים - באנר נתק עם שעה ושעון גיל מתקתק, מונה פעולות ממתינות, הודעת חסימה לפעולה משותפת, וחיווי נתק שו"ב (GAPI). קורא את התמה מ-`body` (`light-mode`/`ocean-mode`) ולכן אינו דורש prop. אינו מוצג במסגרת צפייה (`?peek=`). **מייצא:** `ConnectionBanner` (default).

### `src/components/shared/ContextMenu.tsx`
**תפקיד:** תפריט קליק-ימני להעברת פ"מ לנקודת העברה. **מייצא:** `ContextMenu` (default).

### `src/components/shared/OnScreenKeyboard.tsx`
**תפקיד:** מקלדת וירטואלית לטאבלט (עברית/אנגלית/סמלים), ניתנת לגרירה. **מייצא:** `OnScreenKeyboard` (default).

### `src/components/shared/KeyboardLangIndicator.tsx`
**תפקיד:** מחוון מצב המקלדת (עברית/אנגלית) + CAPS LOCK, ליד שדה סיסמה. במסך מלא (Cintiq/Electron) מחוון השפה של Windows מוסתר, ובשדה סיסמה התווים מוסתרים — טעות שפה התגלתה רק אחרי כישלון הכניסה. עברית מסומנת בענבר (מצב "שים לב", סיסמאות לרוב לטיניות), אנגלית נייטרלית, ולפני שהמצב ידוע מוצג "?" עם הרמז "הקש תו לזיהוי" **בשורה ולא כ-tooltip** (מסך המגע לא יודע hover). תומך `dark` לרקע כהה. **בשימוש:** מסך ה-LOGIN (`App.tsx`, מתחת לשדה הסיסמה). **מייצא:** `KeyboardLangIndicator` (default).

### `src/hooks/useKeyboardLanguage.ts`
**תפקיד:** ה-hook שמאחורי המחוון. שני מקורות: (1) **תו שהוקלד בפועל** — `keydown` (`e.key`) ו-`beforeinput` עם `inputType='insertText'` (`e.data`), נחוץ כי מסלולי קלט שמייצרים טקסט דרך insertText מדלגים על keydown; הדבקה לא נספרת. (2) **זיהוי החלפת פריסה** — Alt+Shift "נקי" (בלי מקש נוסף ביניהם) או Win+Space **הופכים** את המצב מיד, כי בעמדה מותקנות שתי פריסות; מצב לא ידוע נשאר לא ידוע. חזרה לפוקוס מאפסת ל"לא ידוע" (הפריסה יכלה להשתנות מסרגל השפה מחוץ לאפליקציה).
**למה אין כאן `navigator.keyboard.getLayoutMap()`:** הגרסה הראשונה השתמשה בו והוא **החזיר תשובה שגויה בביטחון** — באג Chromium ([340949926](https://issues.chromium.org/issues/340949926)): בפריסה לא-לטינית ה-API מחזיר את מפת ה-US. כלומר קריאת "לטינית" ממנו לא נושאת מידע, והמחוון הציג "אנגלית" אחרי מעבר לעברית. תשובה שגויה גרועה מ"לא ידוע". **מייצא:** `useKeyboardLanguage`, `KeyboardLang`, `KeyboardState`.

### `src/hooks/useToolbarScale.ts`
**תפקיד:** מכפיל גודל לכפתורי סרגל כלים לפי גודל המסך הנבחר (15.6"=x1.0 · 16"=x1.1 · 18"=x1.2 · 24"=x1.4), **מעל** הזום הגלובלי `zoom: var(--s)`. הזום הגלובלי מגדיל הכל אחיד, ולכן כפתור 28px נשאר קטן *ביחס* למסך גם ב-24" - בסרגל צפוף זה לא מספיק לעט/מגע על Cintiq 24. קורא את `data-screen` מ-`<html>` ומאזין לשינויים (MutationObserver) כדי שהחלפת גודל תעודכן חי. **בשימוש:** `MapZoneEditor`. **מייצא:** `useToolbarScale` (גם default).

### `src/hooks/useDragPosition.ts`
**תפקיד:** **גרירת חלון צף** (`position: fixed`) בעכבר, בעט או באצבע - מקור אחד לכל חלונות הגרירה. מטפל בשלוש המלכודות שחוזרות בכל מימוש: (1) **סקייל** - `left/top` ביחידות `zoom: var(--s)` מול `clientX/Y` בפיקסלים אמיתיים, ולכן כל קואורדינטה מחולקת ב---s (בלעדיה החלון זז פי 1.65 מהיד ב-24"); (2) **מגע ועט** - `touch-action: none` (אחרת הדפדפן תופס את התנועה כגלילה ולא שולח `pointermove`) + `setPointerCapture` (אחרת הגרירה נקטעת מעל iframe של סרגל ההצצה); (3) **קפיצה בגרירה הראשונה** - המיקום ההתחלתי נקרא מה-DOM ולא מהמצביע. בלי `preventDefault` על pointerdown (מבטל אירועי עכבר תואמים בעט - REFACTOR_LOG 2026-08-01). כולל חסם שמונע גרירה אל מחוץ למסך ו-`reset()` להחזרה למקום. **בשימוש:** פאנל "מסלולים בשימוש" והתצוגה המוגדלת של המסלולים (SectorDashboard). מאומת ב-[e2e/fit-scale.spec.ts](e2e/fit-scale.spec.ts) - תזוזה 1:1 מול המצביע ב-15.6" וב-24". **מייצא:** `useDragPosition` (גם default), `DragPos`.

### `src/utils/scale.ts`
**תפקיד:** `scale`/`sc` הם passthrough היסטורי (הסקייל הגלובלי הוא `zoom` על `#root`, ראה App.css) · `TOOLBAR_SCALE_MAP`, `getToolbarScale`, `readToolbarScale`, `tbPx(n, s)` - הסקייל הנקודתי של כפתורי סרגל שמאחורי `useToolbarScale`.
**מלכודת `vw/vh` תחת `zoom`:** הזום מכפיל גם יחידות חלון, ולכן מודאל שממודד `96vw/93vh` יוצא פי `--s` מהמסך (ב-24" פי 1.65) והכותרת שלו נגזרת מחוץ למסך. הפתרון: `calc(96vw / var(--s,1))`. ראה `MapZoneEditor` ו-REFACTOR_LOG #030.

### `src/components/shared/HandwritingOverlay.tsx`
**תפקיד:** קנבס כתב-יד לקלט גובה עם OCR (Tesseract + digits שנלמדו). **מייצא:** `HandwritingOverlay` (default).

### `src/components/shared/LearnDigitsOverlay.tsx`
**תפקיד:** מסך אימון ספרות כתב-יד לכל בקר. **מייצא:** `LearnDigitsOverlay` (default).

### `src/components/shared/LeoLogo.tsx`
**תפקיד:** **סימן היצרן (LEO²)** - לוגו החברה המפתחת, רכיב משותף אחד לכל המסכים: קצה הסרגל העליון של עמדת הבקר (17px, אחרי השעון), הסרגל של דסק המשימה (17px), כותרת מסך הניהול (19px), הפוטר של מסך ההתחברות (24px, מעל מספר הגרסה) ותחתית **מסך הטעינה** (30px, מתחת לשלבי הטעינה, עם אנימציית הרכבה). SVG מוטבע - חד בכל גודל מסך ובכל גובה, נטען עם ה-bundle (בלי בקשת רשת שמתחרה בעליית הדשבורד) ומקבל צבע לפי התמה. יושב ב-`#root` → מתכווץ עם `--s` בלי טיפול ידני. **מייצא:** `LeoLogo`, `LEO_LOGO_ASPECT`.
**אנימציית כניסה (`animateIn`, `animateDelay`):** רצף הרכבה חד-פעמי - האותיות עולות, הכנף נפרשת (`scaleX` מהשורש החוצה), הקשת מטפסת והנקודה התכולה "נוחתת" בקצה עם overshoot. ~1.1ש' מתחילת ההשהיה, מכוון להסתיים גם בטעינה מהירה. ה-CSS מוזרק ב-`<style>` מקושר ל-`useId` (כמו ב-`RotatingEmblems`) כדי ששני מופעים לא יתנגשו על שמות keyframes, ומכובה תחת `prefers-reduced-motion: reduce`. **מופעל רק במסך הטעינה** - בסרגלים התפעוליים הסימן סטטי בכוונה (תנועה מתמדת בכרום של עמדת בקרה היא הסחה).
**התאמת תמה - שים לב:** רק `'light'` הוא רקע בהיר ומקבל את נייבי המותג. **`'ocean'` היא תמה כהה** (`T.surface = #05404e` בסרגל, `panel = #123a5c` בדסק) ולכן מקבלת - כמו `'dark'` - את גרסת ה-reversed (כיתוב בהיר). נייבי על ocean נותן ~1.3:1. הכחול הבהיר של הנקודה וה-² הוא צבע מותג ונשאר בשתי הגרסאות. `e2e/leo-logo.spec.ts` מודד ניגודיות WCAG בשלוש התמות.

### `src/components/shared/RotatingEmblems.tsx`
**תפקיד:** סמל בסיס האב + סמל מיח"ה (מפקדת יחידות הבקרה) מסתובבים — במסך הטעינה (`variant='loader'`, סיבוב/הקפה רציפים) ובסרגל העליון (`variant='topbar'`, סיבוב כניסה חד-פעמי בעליית המערכת). מותאם תמה (אור/שחור/כחול) וסקייל, מכבד `prefers-reduced-motion`. בסיס האב נפתר מ-`session.parentBase` (מ-`workstation_presets.parent_base_id`); בלי בסיס אב — מוצג רק מיח"ה. משותף ל-SectorDashboard ול-MissionDeskView. **מייצא:** `RotatingEmblems`.
**מקור הסמל:** הסמל המובנה מצויר **מיד**, ותמונת ה-DB (`/api/emblems/...`) מחליפה אותו ברגע שנטענה; אין סמל ב-DB → ה-`<img>` מוסר והמובנה נשאר; אין גם מובנה → placeholder מצויר. אין שלב "בדיקה" לפני הציור, כי בקשת התמונה מתחרה במטח קריאות ה-API של הדשבורד ונמדדו עיכובים של יותר מ-4 שניות — ומסך הטעינה היה עולה בלי סמלים. `App` מחמם את התמונות בכניסה (`warmEmblems`) ולכן ברוב המקרים הן כבר במטמון.
**סמלים מובנים:** `src/assets/emblems/emblems.tsx` — סמלים אמיתיים (Wikimedia, ב-`files/`) + registry `getBaseEmblem(name)` **לפי שם הבסיס** (עמודת `code` ריקה). `MichaEmblem` = סמל מערך הבקרה האווירית (מיח"ה 517), מוצג בכל עמדה. יחידות הבקרה `506`/`509` רשומות ב-registry עם סמל היחידה (WebP). מקורות+רישוי: `src/assets/emblems/SOURCES.md`. **מייצא גם:** `ImageEmblem` (תצוגת סמל מ-URL, משותפת למובנה ולמועלה).

### `src/components/admin/EmblemPicker.tsx`
**תפקיד:** בחירת תמונת סמל במסך הניהול — תצוגה מקדימה, בחירת קובץ (כולל הכיווץ דרך `emblemUpload`) והסרה. משותף לסמל הבסיס ולסמל מיח"ה; **מה עושים עם התוצאה** נשאר אצל הקורא (סמל בסיס נשמר עם הטופס כי בסיס חדש מקבל id רק בשמירה, סמל מיח"ה נשמר מיד). **מייצא:** `EmblemPicker`.

### `src/components/shared/StationPeekBar.tsx`
**תפקיד:** **תצוגת עמדות אחרות בעמדה** — סרגל ריבועים חיים בתחתית המסך (ON TOP), עם משולש ▲/▼ לכיווץ, כפתורי הקטנה/הגדלה, ולחיצה שמגדילה עמדה ל-2/3 מסך **לקריאה בלבד**. רכיב משותף: אותו סרגל בכל סוגי העמדות (בקר/מגדל/קלאסי/אזרחי/דסק משימה), מוצג/מוסתר מתפריט "תצוגה" ונזכר לעמדה ב-localStorage.
**איך המסך האמיתי מוצג:** כל ריבוע הוא `<iframe src="/?peek=<presetId>">` של האפליקציה עצמה, מוקטן ב-`transform: scale()` מגודל לוגי 1600×900. כך מוצגת העמדה הנצפית **כמו שהיא**, מכל סוג, ומתעדכנת בזמן אמת מעצמה — בלי לשכפל שורת רינדור, ובלי instance שני באותו מסמך שיתנגש על הגלובלים של העמדה החיה (תמה, מסך מלא, קיצורי מקלדת, 88 אפקטים).
**קריאה בלבד (שתי שכבות):** `pointer-events: none` על המסגרת + חסימת כל כתיבה ל-API במסמך ה-peek (`installPeekWriteGuard`). מאומת ב-e2e: מסגרת צפייה לא שולחת ולו בקשה אחת שאינה GET.
**הרשאה:** הרשימה מוגדרת במסך הניהול, אבל מי שרשאי להיכנס לעמדה במיראז' הוא שרשאי לצפות בה — סינון מול `crewMember.approved_workstations`. עמדה בלי הרשאה: הריבוע **לא מרונדר כלל** (לא מוצג נעול). אין עמדות מורשות → אין סרגל.
**שכבות z-index:** 8850 כסרגל (מתחת להודעות 9000 ולדסק החופשי 9500 — הוא רצועה תחתונה ואסור שיחסום אותם), 9600 בהגדלה.
**מייצא:** `StationPeekBar` (default).

### `src/components/shared/FitScaleBox.tsx`
**תפקיד:** **התאמת תוכן לשטח שהוקצה לו** — מקטין תוכן רחב מדי עד שהוא נכנס לרוחב המיכל (`mode='shrink'`, ברירת מחדל) או מגדיל אותו עד שהוא ממלא את השטח (`mode='fill'`). נועד לרצועת המסלולים בחלון העזרים: 4 מסלולים (~248px) בחלון של 220px — במקום גלילה אופקית שמסתירה מסלול, הכל (דיאגרמות, פונטים, בקרות התאורה) מוקטן יחד. אותו רכיב משמש את התצוגה המוגדלת בלחיצה. **מייצא:** `FitScaleBox` (default + named).
**למה `zoom` ולא `transform: scale()`:** `zoom` היא תכונת פריסה — גובה המיכל מתעדכן מעצמו (בלי לחשב גובה ידנית), הטקסט מרונדר מחדש בגודל החדש (חד, לא מטושטש), וזה גם המנגנון שכל ה-UI כבר נשען עליו (`#root { zoom: var(--s) }`).
**מדידה יחסית:** `getBoundingClientRect` מחזיר מידות אחרי כל הזומים (הגלובלי `--s` + המקומי), ולכן היחס `שטח פנוי / תוכן` תקף בכל גודל מסך בלי להמיר יחידות. ההתכנסות מוגנת מריצוד (סף 1% + מכסת התאמות ברצף). מאומת ב-[e2e/fit-scale.spec.ts](e2e/fit-scale.spec.ts) ב-15.6" וב-24".

### `src/components/shared/Modals.tsx`
**תפקיד:** מודלים גנריים. **מייצא:** `SettingsModal`, `MaybeSettingsModal`, `BlockSpaceCellTable`.

### `src/components/shared/StationCrewForm.tsx`
**תפקיד:** טופס **חברי העמדה** — רכיב משותף אחד לשני מסלולים: (1) עליית עמדה ("כניסה לעמדה", `App.tsx`), (2) "עדכון חברי העמדה" מתפריט המשתמש בעמדה (`SectorDashboard`). אותם שדות, אותה לוגיקה, אותו עיצוב; מה שמשתנה הוא הכותרת, תווית האישור, נוכחות "דלג" והמצב ההתחלתי.
**מצב התחלתי — `initialSessionRoles(saved, defaultBakar, fresh)`:** **עליית עמדה = הרכב חדש** — הטופס נפתח נקי (כולל דגלי ההשגחה), ורק שדה הבקר/פקח מתמלא במשתמש שנכנס; במסלול הזה גם לא נשלח `GET` של חברי העמדה, כי כל מה שיחזור נמחק ממילא. ב"עדכון חברי העמדה" ובתחקיר ההרכב השמור נטען כמו שהוא — הוא ההרכב שיושב בעמדה עכשיו — ו-`bakar` נופל למשתמש הנוכחי רק כשהוא ריק.
**מבנה לפי `preset_role`:** מגדל (`tower`) → פקח · אחורי · [מושגח] · קש"פ. יב"א ושאר → בקר · אחורי · [מושגח] · מפעיל · [מפעיל מושגח] · מש"ק · [מש"ק מושגח] · קש"פ. שדה "מושגח" אינו שורה קבועה: הוא נפתח **בצד** שורת האב רק אחרי סימון דגל "קיים משגיח", ותוויתו יושבת באותה שורה כמו תווית האב כדי ששתי התיבות יהיו מיושרות. בקר/פקח = אותו תא ב-DB.
**חיפוש מהיר:** `SearchPicker` — שדה טקסט חופשי עם רשימה מסוננת בהקלדה (מקלדת: ↑/↓/Enter/Esc). **כל שדה שם שואב מהתפריט של התפקיד המקצועי שלו** ב-`/api/auth/mirage-crew?presetId=N`: בעמדת יב"א — בקר, משגיח הבקר ואחורי מתפריט הבקרים; בעמדת מגדל — פקח, משגיח הפקח ואחורי מתפריט הפקחים · מש"ק ומשגיחו מתפריט המש"קים · מפעיל ומשגיחו מתפריט המפעילים. הרשימות מסוננות כבר בשרת לפי הרשאת העמדה. קש"פ הוא **מספר** ולכן אין לו תפריט. הקלדה חופשית נשארת חוקית — מי שאינו ברשימה (או כשמיראז' לא זמין) עדיין ניתן לרישום. לכל שדה יש `data-crew-field` — עוגן יציב לבדיקות, כי סדר השדות משתנה לפי סוג העמדה.
**התאמת השם — `matchCrewOptions(options, query)`** (טהורה, נבדקת ביחידה): נרמול (גרשיים ומרכאות יורדים, רווחים מתכווצים, lowercase) והתאמת **כל מילה שהוקלדה בנפרד** — "לב אורי" ו"אורן דור" מוצאים את "אורי לב" ו"אורן בן דור". עד 50 הצעות.
**תפריט שמסביר את עצמו:** התפריט נפתח גם כשהרשימה ריקה — תפקיד בלי אנשים במיראז' היה נראה כמו שדה תקול. רשימה ריקה → `crew.noOptionsForRole`; רשימה קיימת בלי התאמה → `crew.noResults`. כשאין מקום מתחת לשדה, התפריט **נפתח כלפי מעלה**: מדידה אחרי הרינדור (לא קבוע פיקסלים — הטופס נושא `zoom`) מול הכרטיס הגולל, שמסומן `data-crew-scroll` (גם ב-`DebriefForm`).
**יציאה בלי לשמור:** `onCancel` (אופציונלי) → "✕ סגור" בכותרת + Escape. מועבר מ-`SectorDashboard` במסלול "עדכון חברי העמדה"; במסלול הכניסה התפקיד ממולא ע"י "דלג" (`onSkip`). לחיצה על הרקע **אינה** סוגרת (עט על Cintiq — נגיעה מקרית הייתה מוחקת טופס מלא).
**תמה + סקייל:** `crewPalette(themeMode)` לשלוש התמות (ocean = כהה), ו-`maxHeight: calc(92vh / var(--s,1))` כדי לא לגלוש ב-24".
**מייצא:** `StationCrewForm` (default), `CrewFields`, `SearchPicker`, `matchCrewOptions`, `useMirageCrew`, `useSessionRoles`, `initialSessionRoles`, `crewPalette`, `normalizeRoles`, `EMPTY_SESSION_ROLES`, `SessionRoles`, `ThemeMode`, `Palette`.

### `src/components/shared/StationPicker.tsx`
**תפקיד:** **בורר העמדה** במסך הכניסה — רשימה מקובצת לפי בסיס אב במקום `<select>` שטוח. כל הקטגוריות סגורות בפתיחה (המסך נשאר קצר), לחיצה על כותרת חושפת את עמדות הבסיס, ובסיס אב יחיד → אין כותרת כלל והרשימה פתוחה. בכל קבוצה: העדכני ביותר ראשון, עם **זמן העדכון האחרון** לצד השם (תמיד עדכון, לא יצירה — לעמדה שלא שונתה מאז שנוצרה השניים שווים ממילא). הקיבוץ והמיון מגיעים מ-`src/utils/presetGroups.ts`.
**תמה:** `crewPalette(themeMode)` — אותה פלטה של `StationCrewForm`, שנפתח מיד אחרי הבחירה, כדי ששני השלבים ייראו כרצף אחד.
**RTL:** חותמת הזמן עטופה ב-`dir="ltr"` (רצף תווים חלשים שהאלגוריתם הדו-כיווני היה הופך), וחץ הקטגוריה הסגורה מסובב ב-180° בעברית. `data-testid="station-picker"` / `station-group` / `station-option` + `data-station-name` — עוגנים לבדיקות (ראה `pickWorkstation` ב-`e2e/helpers.ts`).
**מייצא:** `StationPicker` (default).

### `src/components/manpower/ManpowerPage.tsx`
**תפקיד:** מסך **כ"א ותחקירים** — נפתח ממסך ה-LOGIN לבעלי תפקיד `manpower` ("כח אדם") במיראז' בלבד. תפריט ביניים עם שני מסכים: **תחקירים** ו**כשירויות**. קריאה בלבד; אינו הרשאת ניהול.
**תחקירים:** טבלה עם סינון (עמדה · סיווג · נרשם ע"י · סוג מעורב · טווח תאריכים) וקיבוץ (עמדה / סיווג / נרשם ע"י / חודש). **קיבוץ לפי טקסט חופשי לא נתמך בכוונה** — פירוט תחקיר ופירוט אחריות מייצרים קבוצה לכל שורה ואינם נושאים מידע.
**הרחבת תחקיר:** לחיצה על שורה פותחת מתחתיה את מה שאינו עמודה — חברי הצוות (אותו סדר תפקידים כמו ב-`CrewFields`; שורת האב מתויגת "פקח" בעמדת מגדל לפי `preset_role`), פירוט התחקיר, פירוט האחריות ותמונת העמדה. התמונה **אינה** חוזרת ברשימה (dataURL של מסך מלא) ולכן נמשכת מ-`GET /api/debriefs/:id` בפתיחת השורה בלבד, פעם אחת לכל תחקיר; שורה עם תמונה מסומנת 📷 עוד לפני הפתיחה. לחיצה על התמונה פותחת אותה בגודל מלא (Esc / לחיצה סוגרים), עם `calc(…/var(--s))` כי `#root` נושא `zoom`.
**כשירויות:** שורה לכל איש צוות (מסודרת לפי סה"כ שעות), ומתחתיה משמרות העמדה שלו — שם עמדה, זמן כניסה, זמן יציאה עם תאריכים וסה"כ שעות; משמרת פתוחה מסומנת "עדיין בעמדה". מתג לגרף עמודות לפי ימים / שבועות / חודשים / שנים.
**הגרף:** SVG מקומי, בלי ספריית תרשימים. סדרה יחידה → **גוון אחד ובלי מקרא** (הכותרת מזהה את הסדרה), קצוות מעוגלים 4px מעוגנים לבסיס, מרווח משטח בין עמודות, סרגל וקווי עזר רצסיביים, ותווית ערך מופיעה ב-hover בלבד ולא על כל עמודה. הטבלה היא תצוגת ברירת המחדל ולכן תמיד קיימת חלופה טקסטואלית.
**מידור:** מוצגות רק עמדות שהמשתמש מורשה להן לפי מיראז' (`approved_workstations`; רשימה ריקה = כל העמדות), עם חיווי למשתמש. זהו מנגנון ההרשאה **הקיים** — מודל המידור הייעודי טרם אופיין, וכשיאופיין יש להחליף כאן את הסינון בלבד.
**מייצא:** `ManpowerPage` (default), `bucketKey`.

### `src/utils/stationSession.ts`
**תפקיד:** פתיחה וסגירה של משמרת עמדה מהלקוח. `openStationSession` נקרא בעליית עמדה, בהחלפת משתמש ובעדכון חברי העמדה; `closeStationSession` ביציאה, עם `keepalive: true` — הבקשה חייבת לשרוד את פריקת הדף שמגיעה מיד אחריה. כל הקריאות שקטות: כשל רשת לא חוסם כניסה לעמדה ולא יציאה ממנה.
**מייצא:** `openStationSession`, `closeStationSession`, `SessionEndReason`, `OpenSessionArgs`.

### `src/components/shared/DebriefForm.tsx`
**תפקיד:** טופס **תחקיר** — נפתח מתפריט העמדה ("צור תחקיר", מתחת ל"עדכון חברי העמדה"). מצלם את המצב ברגע האירוע: חברי הצוות (דרך `CrewFields` — אותם שדות בדיוק, בלי שכפול; עדכון כאן נשמר גם חזרה לעמדה), זמן אירוע, מהות, סיווג (קריטי/חמור/תאונה/כמעט ונפגע/בינוני/קל — **קוד** נשמר ב-DB והתווית מתורגמת, כדי ששינוי תרגום לא ישבור נתונים), פירוט, פירוט אחריות, מעורבים ותמונת העמדה.
**מעורבים:** שורות `{type, value}` — טייסת · או"ק · מספר במבנה · יב"א · מגדלים · אחר. טייסת/או"ק נגזרים מהפ"מים **החיים** בעמדה; יב"א/מגדלים/אחר מגיעים מטבלת **`units`** (מסך הניהול → לשונית "יחידות"), **ולא** מרשימת העמדות: עמדה היא תצורת תצוגה במערכת ויחידה היא גוף בשטח. השדה נשאר טקסט חופשי.
**מייצא:** `DebriefForm` (default), `DEBRIEF_SEVERITIES`, `INVOLVED_TYPES`, `toLocalInputValue`, `InvolvedRow`, `InvolvedType`.

### `src/components/shared/SuggestionForm.tsx`
**תפקיד:** טופס **הערה / הצעה למערכת** — נפתח מה-`+` בסעיף "הערות והצעות" בחלון האודות (סמל המערכת), בכל סוגי העמדות. שדות: שם מלא (ממולא מראש משם המפעיל המחובר), טלפון, יחידה, נושא ופירוט; לצד כל שדה `VKTrigger` (מקלדת וירטואלית — עמדת עט/מגע). **תאריך ושעה אינם נשאלים ואינם נשלחים**: הם נרשמים בשרת ב-`created_at`. פלטה מ-`crewPalette` (שלוש התמות), `maxHeight: calc(92vh / var(--s,1))`.
**מייצא:** `SuggestionForm` (default), `SuggestionFormProps`.

### `src/components/shared/HelpModal.tsx` · `src/utils/helpTopics.ts`
**תפקיד:** חלון **עזרה לעמדה** — נפתח מכפתור "עזרה" בפוטר של חלון האודות. מכסה את כל המסך: הסרגל העליון, **כל תפריט עם הכפתורים שבתוכו ומה כל אחד עושה**, חלון הפ"ממים (כולל כפתור השאילתה), חלון נקודות ההעברה (מוסר/מקבל, אשר/קלטתי/דחה), חלון העזרים (בלוקים, מדיניות, מסלולים, ATIS, קשרים, בד"ח...), המפה (מה רואים עליה) וסרגל הכלים שלה, ולבסוף **מונחים** (פ"מ, נקודת העברה, מוסר/מקבל, אזור, בלוק, ספרור, בד"ח...).
**מבנה דו-שכבתי:** נושא (תפריט / חלון / אזור מסך) ממוספר `n`, והכפתורים שבתוכו `n.m`. הפריטים מקופלים כברירת מחדל (`מה יש בתפריט (N)`) עם `פתח הכל`; חיפוש פותח אוטומטית את מה שתואם ו**שומר את המספור המקורי**, כדי ש"סעיף 13.8" יישאר אותו סעיף.
**עקרון הסינון (לב הרכיב):** `helpTopics.ts` מחזיק נושא לכל אזור ופריט לכל כפתור, לכל אחד `when(ctx)` — תנאי תצוגה **זהה לתנאי שמרנדר אותו** ב-`SectorDashboard` (`show_dashboard`, `show_serials`, `show_full_picture`, מצלמות, דו-מפה, שכבות/רכבים בעמדת שדה, שידוך בלחיצה, מפה עיוורת רק עם תמונת רקע, סגירות רק במפה מעוגנת נ"צ...). כפתור שלא נבחר בבניית העמדה גם לא מקבל סעיף עזרה — אחרת העזרה מלמדת על כפתורים שלא קיימים. **הספרור רץ אחרי הסינון** בשתי השכבות. הטקסטים חיים ב-registry `help` (`<id>Title/Body`, `<topicId>_<itemId>Title/Body`) וניתנים לעריכה ממסך התרגומים.
**מיקום + "הצג לי":** לכל נושא יש גם `whereKey` — **איפה הוא נמצא על המסך** (מוצג עם 📍 מתחת להסבר). נושא שיש לו עוגן `data-help="<topicId>"` ב-`SectorDashboard` מקבל גם כפתור **"הצג לי"**, שסוגר את חלונות העזרה/האודות ומאיר את הרכיב האמיתי (ראה `HelpSpotlight.tsx`). בדיקת יחידה סטטית מוודאת שכל נושא-מסך אכן נושא עוגן ושאין עוגן יתום.
**מייצא:** `HelpModal` (default), `HelpModalProps` · `HELP_TOPICS`, `visibleHelpTopics`, `countHelpEntries`, `HelpContext`, `HelpTopic`, `HelpItem`.

### `src/components/shared/HelpSpotlight.tsx`
**תפקיד:** ההצבעה החיה של "הצג לי" — מחשיך את המסך (`box-shadow` ענק סביב חלון הרכיב = "חור" בהחשכה), מקיף את הרכיב בטבעת ציאן פועמת, ומציג תווית עם שם הסעיף ומיקומו + "חזרה לעזרה". `Esc` או לחיצה מחוץ לתווית סוגרים.
**עוגן:** `[data-help="<topicId>"]` — מקור אמת יחיד, בלי רשימת סלקטורים משוכפלת. רכיב שנעלם (תפריט שנסגר) → הודעה במקום הצבעה שקרית.
**סקייל:** `getBoundingClientRect` מחזיר פיקסלי מסך והרכיב יושב תחת `zoom: var(--s)` — לכן כל קואורדינטה **וגם `innerWidth/Height`** מחולקות ב---s, ולתווית `boxSizing: border-box` (בלעדיו ה-padding הוסיף רוחב והיא גלשה מקצה המסך). נמדד ב-e2e ב-15.6" וב-24" אמיתי (2560px + ‎--s=1.65‎).
**מייצא:** `HelpSpotlight` (default), `HelpSpotlightProps`.

### `src/utils/stationSnapshot.ts`
**תפקיד:** צילום מסך העמדה לתחקיר — DOM→canvas (`html-to-image`), בלי דיאלוג הרשאת מסך. `getDisplayMedia` נפסל כי הוא פותח בחירת מסך בכל צילום, ובאמצע אירוע זה צעד מיותר. הצילום קורה **לפני** שהטופס נפתח (אחרת הטופס היה מכסה את העמדה בתמונה), וכל אלמנט עם `data-nosnapshot` מסונן החוצה כרשת ביטחון. `pixelRatio: 0.5` + `skipFonts` — קריא לתחקיר ורבע מנפח ה-base64. כישלון אינו חריג: מוחזר `''` והתחקיר נשמר בלי תמונה.
**מייצא:** `captureStation`.

### `src/components/shared/EnvironmentBadge.tsx`
**תפקיד:** באדג' הסביבה המחוברת בסרגל העליון — רכיב משותף ל-SectorDashboard (בקר/מגדל), ל-MissionDeskView ולכותרת מסך הניהול (ManagementPage). סביבת תרגול בולטת בכתום-אזהרה (בטיחות ATC: תרגול ≠ אמת); סביבה טסה נייטרלית נגזרת-תמה. קורא `getCurrentEnv()`.

### `src/utils/environment.ts`
**תפקיד:** לוגיקת הסביבה בצד הלקוח — מקור אמת יחיד למספר הסביבה, נורמליזציה/ולידציה, `enterEnvironment()` (נקודת כניסה אחת לכל מסלולי הכניסה מ-LOGIN: עמדה / ניהול / תחקיר — קובעת את הסביבה וממתינה ליצירת סכמת תרגול), ו-`installEnvFetchInterceptor()` שמוסיף כותרת `X-Env` לכל קריאת `/api` (בלי לגעת במאות ה-fetch).
**מייצא:** `getCurrentEnv`, `setCurrentEnv`, `enterEnvironment`, `isFlyingEnv`, `normalizeEnv`, `shouldTagRequest`, `envHeaderFor`, `installEnvFetchInterceptor`, `ENV_MIN/ENV_MAX/FLYING_MAX`.

---

## Frontend — Feature Components

### `src/components/strips/Strip.tsx`
**תפקיד:** רכיב הסטריפ המרכזי — כרטיס פ"מ עם גרירה, עריכת גובה/הערות, פאנל פרטים, סיריאלים, חריגת בלוק, קונפליקטים. **מייצא:** `Strip` (default). **משותף:** CTRL + TWR.

### `src/components/transfers/TransferCards.tsx`
**תפקיד:** כרטיסי העברה. **מייצא:** `TransferStripEditor`, `OutgoingTransferCard` (מוסר), `IncomingTransferCard` (מקבל + countdown).

### `src/components/transfers/DraggablePanels.tsx`
**תפקיד:** פאנלי העברה ניתנים לגרירה. **מייצא:** `DraggableNeighborPanel` (נקודת העברה מוסר/מקבל), `DraggableIncomingTransferMini`, `DraggableMapMarker` (סמן מפה), `DraggableIncomingTransfer`, `TableHandwritingCanvas`.

### `src/components/map/MapZoneEditor.tsx`
**תפקיד:** עורך אזורי מפה — ציור polygons, כיול גיאו (anchors/DMS), זיהוי אזורים אוטומטי (OCR), טווחי גובה, **ניהול הסקטורים של המפה** (יצירה, שינוי שם, תיחום מחדש, מחיקה), ו**מיקום קבוע של נקודות העברה** (מצב 🔀). פאנל "סקטורים במפה זו" בתפריט הצד מציג את מפות-הבת של המפה; בחירה מדגישה את התחום על המפה, ו"תיחום מחדש" חותך תמונה חדשה, מעדכן `parent_rect` ומסנכרן את האזורים מהאב. כשנפתח מהגדרת עמדה (props `presetId`/`presetName`/`transferSectorIds`) הקטלוג מצטמצם לנקודות ההעברה של אותה עמדה וניתן לשמור דריסה ייחודית לה. **מייצא:** `MapZoneEditor` (default). **שימוש:** admin (ניהול מפות + הגדרת עמדה).

### `src/components/map/TrafficPatternLayer.tsx`
**תפקיד:** שכבת ההקפות על מפת השדה - **רכיב אחד לתצוגה ולעריכה**, כדי שההקפה שהמנהל משרטט תיראה בדיוק כפי שהיא תיראה בעמדה. נטוע ב-SVG של המפה (`viewBox="0 0 100 100"`) ואינו יודע דבר על ה-DOM שסביבו: המרת קואורדינטות מצביע לאחוזים מגיעה מבחוץ דרך `toPct` (רק ההורה מכיר את גבולות התמונה, הזום והגלילה). בעריכה: שש ידיות פינה, ידית סיבוב סביב הסף, וגרירת הצורה כולה - הכל ב-Pointer Events עם `setPointerCapture` (עט ה-Cintiq). כל גודל מוכפל ב-`sz = 1/זום` כדי שיישאר קבוע על המסך. **מייצא:** `TrafficPatternLayer` (default), `PatternRow`, `PatternElementRow`.

### `src/components/map/RunwayLayer.tsx`
**תפקיד:** שכבת מסלולי ההמראה על מפת השדה - **אותו רכיב בעמדת הניהול ובעמדת השדה**, כך שמה שהמנהל מסמן הוא בדיוק מה שהפקח רואה. נטוע ב-SVG של המפה (`viewBox="0 0 100 100"`) ואינו יודע דבר על ה-DOM שסביבו. מסלול סגור (NOTAM `closed`) נצבע באדום ומקבל X על אורכו. הגאומטריה מגיעה מ-`airfield_runways` (הישות עם שני הקצוות והכיוונים) ולא מ-`airfield_routes`. **מייצא:** `RunwayLayer` (default), `RunwayRow`.

### `src/components/map/MapsManager.tsx`
**תפקיד:** ניהול מפות — העלאה (תמונה/PDF), מחיקה, embed של MapZoneEditor, ו**שיוך מפה לבסיס אב**. כשנפתח מתוך מסך הניהול (props `bases`/`assignableBases`/`allowedBases`) הרשימה מקובצת לפי בסיס אב וראש צוות רואה רק את המפות של המכלולים שלו; בלי הפרופס (מודל עצמאי) ההתנהגות נשארת רשימה שטוחה בלי סינון. **מייצא:** `MapsManager` (default). **שימוש:** admin.

### `src/components/ground/groundShared.tsx`
**תפקיד:** קבועים + אייקונים + עזרים משותפים לתפעול קרקעי. **מייצא:** קבועי מז"א (`AIR_DEFENSE_STATUSES`, `YABA_AIR_DEFENSE_STATUSES`, `ALL_MAZAA_STATUSES`), `GROUND_STATUSES`, `GROUND_POINT_MARKERS`, `GROUND_SVG_ICON_KEYS`, `GroundMarkerSVG`, `renderGroundSvgIcon`, `getElemDisplayStateOpts`, `normalizeAircraftPositions`, `ptLineDist`, `dpSimplify`, `toEmbedUrl`.

### `src/components/ground/GroundVehiclePanel.tsx`
**תפקיד:** ניהול כלי רכב + מערכות מז"א (פטריוט/יבה) — מיקום, סטטוס, עורך ויזואלי. **מייצא:** `GroundVehiclePanel` (default).

### `src/components/blocks/BlockMiniView.tsx`
**תפקיד:** תצוגת mini של בלוקי גובה לסטריפ + אינדיקציית קונפליקט. **מייצא:** `BlockMiniView` (default).

### `src/components/blocks/BlockVisualPainter.tsx`
**תפקיד:** כלי ציור ויזואלי ליצירת/עריכת בלוקי גובה. **מייצא:** `BlockVisualPainter`, `BLOCK_PALETTE`, `hexToHue`, `pickDistinctBlockColor`.

### `src/components/query/QueryBuilder.tsx`
**תפקיד:** ממשק בניית שאילתות סינון ויזואלי (עץ AND/OR/NOT). שדות עמדה ("נמצא בעמדה", "נוצר ע"י עמדה") נבחרים **מתפריט העמדות**; הרשימה מגיעה מ-prop, ובלעדיו נטענת פעם אחת מהשרת ומשותפת לכל בוני השאילתות. **מייצא:** `QueryBuilder`, `QGroupEditor`, `QBuilderCtx`, `usePresetNames`.

### `src/components/dataWindows/DataWindowLayer.tsx`
**תפקיד:** שכבת החלונות הצפים מעל מפת השדה — מונה לכל חלון, גרירה בעט/מגע, הרחבה לאו"קים והסתרה לסשן. **מייצא:** `DataWindowLayer` (default), `DataWindowRestoreBar`.

### `src/components/dataWindows/DataWindowsAdmin.tsx`
**תפקיד:** עורך חלונות הנתונים של עמדה במסך הניהול (כותרת, מצב תצוגה, ספירה לפי פ"מ/מטוס, סף אזהרה, צבע) מעל `QueryBuilder`. **מייצא:** `DataWindowsAdmin` (default).

### `src/components/classic/ClassicViews.tsx`
**תפקיד:** רכיבי תצוגה קלאסית ואזרחית. **מייצא:** `ClassicStripCard`, `ClassicView` (3 עמודות: קבלה/שלי/מסירה), `ClassicTransferHelpModal`, `ClassicPartnersAndPointsEditor`, `CivilianStripCard`, `CivilianView`, + טיפוסים `CivCol`/`CivAssignment` + `CIV_STATUSES`.

### `src/components/dashboard/AdminDashboard.tsx`
**תפקיד:** לוח מחוונים + מודל העברה. **מייצא:** `TransferFormModal` (העברה חלקית + ETA), `DonutChart`, `AdminDashboard` (עומס עמדות/מז"א).

---

## Frontend — Views (מסכים ראשיים)

### `src/components/views/SectorDashboard.tsx` (17,658 ש' — הגדול ביותר)
**תפקיד:** עמדת הבקר הראשית (CTRL) — מאחד את כל התצוגות: MapView, TableView, VerticalView, ClassicView, GroundView. מנהל את state הראשי: סטריפים, העברות, פילטרים, מפה, בלוקים, אזורים, sticky notes.
**סקטורים על המפה:** כשהעמדה הוגדרה כך, כל פאנל מפה מציג בפינה הימנית העליונה את רשימת הסקטורים שנבחרו לה (`sector_map_ids` למפה 1 · `map2_sector_map_ids` למפה 2). לחיצה ממקדת את **אותה** מפה על תחום הסקטור דרך `sectorFocusView`, ו"מפה מלאה" (וגם כפתור האיפוס שבסרגל הזום) מחזירה לתצוגה המלאה. המצב הוא פר-מפה, כך ששתי המפות אינן דורסות זו את בחירת זו.
**מייצא:** `SectorDashboard` (default).
**שימוש:** המסך שהבקר רואה רוב הזמן.

### `src/components/views/GroundView.tsx` (4,812 ש')
**תפקיד:** עמדת המגדל (TWR / מגרש) — 3 פאנלים: רשימת פ"מ, מפת שדה, נקודות העברה. ניהול מטוסים בודדים, דת"ק/כיפה, חימושים/מערכות, גרירת מטוס בודד.
**מייצא:** `GroundView` (default).
**נקודות העברה:** הפאנל עצמו הוא ה-`DraggableNeighborPanel` המשותף ומרונדר ב-SectorDashboard (`#neighbor-panel`). GroundView מקבלת `transferPins` / `onMoveTransferPin` / `onRemoveTransferPin` ומציירת כל נקודה שנגררה למפה כחץ (מיקום = שבר 0..1 מגבולות תמונת המפה; `#ground-map-area`, `#ground-airfield-img`). שחרור פ"מ על החץ → `onTransfer`.

### `src/components/views/VerticalView.tsx` (1,055 ש')
**תפקיד:** תצוגת ציר זמן — סטריפים לפי שעת המראה/זמ"מ, קיבוץ לפי ע"ר/כותרת/מבצע/בלוק.
**מייצא:** `VerticalView` (default).

---

## Frontend — דסק משימה כללי (Mission Desk)

### `src/components/missiondesk/MissionDeskBody.tsx`
**תפקיד:** קנבס הדסק — טוען את הגדרת הדסק ואת ה-state, מרנדר עץ BSP של שירותים, ספליטרים אישיים לעמדה (localStorage), polling ל-`/api/mission-desk-state` וכתיבה עם debounce. רכיב משותף: אותו קנבס רץ גם בעמדת `mission_desk` (בתוך SectorDashboard, במקום המפה) וגם במצב ההגדרה בניהול (`MissionDeskView`, `adminMode`). **מייצא:** `MissionDeskBody` (default), `useMissionDeskName(deskId)`.

### `src/components/missiondesk/MissionDeskView.tsx`
**תפקיד:** מסך עצמאי סביב `MissionDeskBody` — פס עליון (לוגו/שם דסק/משתמש/תמה/שעון), פתקיות והתראות מתפרצות. משמש היום את **מצב ההגדרה** במסך הניהול (`adminMode`). העמדה עצמה רצה דרך `SectorDashboard` (ראה למטה). **מייצא:** `MissionDeskView` (default).

> **עמדת `mission_desk` = SectorDashboard + קנבס הדסק במרכז.** ב-`SectorDashboard` הדגל `isMissionDeskMode` מחליף את המפה/סטריפים ב-`MissionDeskBody`, כך שכל מה שהוגדר לעמדה בניהול מוצג כמו בכל עמדה: חלון עזרים ימני (עזרים/בלוקים/מדיניות/קישורים/בד"ח/רשימות תיוג/מצבי בסיס), כפתור דש בורד מנהל (`show_dashboard`), לחץ/מז"א/ATIS/NOTAM, מד עומס, פתקיות, ספרורים והתראות. **לא** מוצגים פ"ממים ונקודות העברה (סרגל הפ"ממים, פאנל נקודות ההעברה, יצירת נקודה זמנית, פצל/אחד, זיהוי קולי, תצוגת בלוקים, איחוד/פיצול עמדה).

### `src/components/missiondesk/ButtonsBoard.tsx`
**תפקיד:** שירות "מסך ניהול אמצעים" — כפתורים בקליק ימני, גרירה חופשית (Pointer Events, מותאם Cintiq), מצבים עם צבע, טקסט חופשי, פונט/גודל, טריגר התראה מתפרצת (workstation-messages). **מייצא:** `ButtonsBoard` (default).

### `src/components/missiondesk/InkPad.tsx`
**תפקיד:** שירות "טקסט חופשי" — דיו על canvas (strokes יחסיים 0..1), שורות הפרדה, undo/פלנלית. ללא OCR. **מייצא:** `InkPad` (default).

### `src/components/missiondesk/SmartTable.tsx`
**תפקיד:** שירות "טבלה חכמה" — עמודות לפי config, עמודות חישוב, עיצוב מותנה, שורת סיכום, הוספת/מחיקת שורות. **מייצא:** `SmartTable` (default).

### `src/components/missiondesk/theme.ts`
**תפקיד:** פלטת 3 התמות (לילה/יום/תכלת) לרכיבי הדסק. **מייצא:** `MDThemeMode`, `MDTheme`, `mdTheme`.

---

## Frontend — Admin

### `src/components/admin/BaseGroupList.tsx`
**תפקיד:** קיבוץ תוכן מסך הניהול לפי **בסיס אב** — רכיב אחד לארבעת הטאבים (עמדות, מפות, עזרים, בלוקים) במקום ארבעה מימושים. `BaseGroupList` מקבל קבוצות מ-`groupItemsByBase` ופונקציית `renderItems`, כך שהוא משרת גם רשימה שטוחה (מפות, מרחבים) וגם קיבוץ-משנה בתוך הבסיס (עמדות לפי תפקיד, טבלאות בלוקים לפי קטגוריה). קבוצה יחידה → אין כותרת כלל; כמה קבוצות → כותרת מתקפלת **פתוחה כברירת מחדל** (משטח עבודה של אדמין, לא מסך תפעולי — הסתרה מאחורי קליק רק מאטה עריכה). `ParentBaseSelect` הוא בורר בסיס האב האחיד לכל הטפסים.
**מייצא:** `BaseGroupList` (+default), `ParentBaseSelect`.

### `src/components/admin/MissionDeskAdmin.tsx`
**תפקיד:** ניהול דסקי משימה — tab "דסקי משימה": CRUD דסקים, שירותים + עורכי config (טבלה/טקסט חופשי), עורך פריסה BSP (פיצול/גרירת שירות לאזור); ורכיב בחירת דסק+שיתוף בעורך העמדה. **מייצא:** `MissionDeskAdmin`, `MissionDeskPresetConfig`.

### `src/components/admin/PatternsSection.tsx`
**תפקיד:** סקשן "🔄 הקפות" בטאב שדות התעופה - רשימת ההקפות, בחירת קצה המסלול, צבע, כניסה לציור על המפה, שכפול / שכפול הפוך, ואלמנטים (שם + ICON + צבע + מיקום) השייכים **רק להקפה הספציפית**. השיוך הראשון למסלול גם מיישר את ההקפה לצירו (`geometryFromRunway`); "ישר למסלול" מאפשר לחזור ליישור אחרי סיבוב ידני. **מייצא:** `PatternsSection` (default). **שימוש:** admin.

### `src/components/admin/RouteLinksSection.tsx`
**תפקיד:** סקשן "🔗 קישורי מסלולים" ביישות שדה התעופה - **רובד בפני עצמו ולא בתוך "מסלולי הסעה"**, כי אותו מסלול פיזי מוגדר בשני שדות בשמות שונים גם כשהוא מסלול המראה. קבוצה אחת מחזיקה N מסלולים (N>=2) מ-N שדות, הבורר הוא **שדה תעופה -> מסלול שלו** (כל סוג מסלול, עם אייקון הסוג), וכפתור השמירה חסום עד שיש שני חברים. **מייצא:** `RouteLinksSection` (default). **שימוש:** admin.

### `src/components/admin/managers.tsx` (3,103 ש')
**תפקיד:** רכיבי ניהול נפרדים. **מייצא:** `StickyNotesLayer`, `WorkGroupsManager`, `TableModesManager`, `AidsManager`, `SerialsAdminTab`, `SerialsPanelModal`, `DebriefingTab` (תחקיר), `CivilianStripsAdmin`, `DefaultNamesManager`, `StripGridEditor`, `ClosuresManager`, `StripWindowAdmin`, `UnitsManager`, `SuggestionsManager`.
**`AidsManager`:** טאב "עזרים לעמדה" — רשימת העמדות משמאל **מקובצת לפי בסיס אב**, ורשימת "קשר לקבוצה קיימת" מסוננת לפי המכלולים שראש הצוות מורשה בהם. קבוצת עזרים חדשה יורשת אוטומטית את בסיס האב של העמדה שנבחרה, וניתן לשנות אותו בכותרת הקבוצה.
**`SuggestionsManager`:** טאב "הערות והצעות" (admin בלבד) — ההצעות שנשלחו מהעמדות, מהחדשה לישנה: נושא, שולח, טלפון, יחידה, העמדה ששלחה, תאריך ושעה, סינון לפי סטטוס (חדשה · בטיפול · בוצעה · נדחתה), הערת מנהל ומחיקה. **תוכן ההצעה עצמה אינו נערך** — רק הטיפול בה.

### `src/components/admin/ManagementPage.tsx` (7,797 ש')
**תפקיד:** מסך הניהול הראשי — מאגד את כל ה-managers, ניהול עמדות/סקטורים/שדות/בלוקים/BDH/סיריאלים/קשרים. **ניהול משתמשים אינו כאן** — הוא במיראז' בלבד (אין טאב "אנשי צוות").
**היקף הניהול של ראש צוות:** המסך טוען את הרשימות המלאות (`allPresets`/`allMaps`/`allBlockSpaces`/`allBlockTables`) וגוזר מהן `presets`/`maps`/`blockSpaces`/`blockTables` **מסוננים** לפי `allowedBases` — בסיסי האב שהמיראז' אישר לו בהם עמדה. כך כל צרכני הרשימות (AidsManager, WorkGroupsManager, בחירת עמדות לבלוק, קשרים, בורר המפה של העמדה) מוגבלים בנקודה אחת ולא כל אחד לחוד. `assignableBases` מגביל גם לאילו בסיסים מותר **לשייך** תוכן חדש. מנהל מערכת: `allowedBases = null` = בלי סינון.
**בורר הסקטורים של העמדה:** `renderSectorPicker` — **אותו רכיב** למפה 1 ולמפה 2, עם הגדרה נפרדת לחלוטין לכל אחת. מציע רק מפות-בת של אותה מפה (`parent_map_id`), כך שעמדה לא יכולה לבחור סקטור של מפה אחרת.
**מייצא:** `ManagementPage` (default).
**שימוש:** admin / team_lead.

---

## Entry Points

### `src/App.tsx` (728 ש')
**תפקיד:** שורש האפליקציה — `WorkstationLogin` (מסך כניסה — הזדהות מיראז' בלבד: מספר אישי + סיסמה, בלי רשימת משתמשים מקומית) + `App` (routing בין login / SectorDashboard / ManagementPage לפי סשן).

### `src/index.tsx`
**תפקיד:** mount של React אל ה-DOM. בנוסף מסמן **סביבת פיתוח**: כש-`import.meta.env.DEV` דולק מתווסף `dev-mode` ל-`body`, ו-[src/App.css](src/App.css) צובע את רקע העמוד בוורוד ומקיף את החלון במסגרת ורודה - כך שהרצה מקומית לא תתבלבל עם פרודקשן. הסימון יושב על `body` ולכן חל על כל המסכים בלי שכפול; אותו ורוד (`#ec4899`) מופיע גם ב-[mirage/admin.html](mirage/admin.html) וב-GAPI. Vite מקפל את התנאי בזמן build, ולכן חבילת הפרודקשן לא מכילה אותו כלל.

### `server.js`
**תפקיד:** entry point של ה-backend. **קודם תופס את הפורט** (`listen` מ-`server/listen.js`) ורק אז מעלה את ה-DB ברקע (`initDb` → `seedDb` → סנכרון סכמות סביבה, עם retry ל-cold-start של Neon) — כך `/api/health` עונה מיד ומדווח על ההתקדמות במקום 502 אילם ב-Railway. כשל בתפיסת הפורט → `exit 1` עם הסיבה (ולא לוג "listening" שקרי).

### `electron-main.cjs`
**תפקיד:** עטיפת Electron שפותחת את חלון העמדה במצב **kiosk**: `fullscreen: true` + `frame: false` (בלי X/מקסום/מיזעור) + `kiosk: true` (נעילת מסך מלא), בפיתוח ובגרסה הארוזה כאחד. `F11` משחרר/מחזיר את הנעילה (`setKiosk`), `F5`/`Ctrl+R` טוענים מחדש, `Ctrl+Shift+I` כלי פיתוח, `SKYKING_WINDOWED=1` מריץ בחלון רגיל.
**שלושה מצבי הרצה:** `bundled` (⭐ לרשת מבודדת - ה-`dist` ארוז בעמדה ומוגש מ-[electron/stationServer.cjs](electron/stationServer.cjs); **שורד נתק**) · `local` (שרת Express מלא בעמדה, legacy, דורש `DATABASE_URL`) · `remote` (לקוח דק - גם ה-HTML מהשרת; **אינו שורד נתק**).
**יעד הטעינה** (לפי סדר): `SKYKING_STATION_URL` → `config.json`: `mode:"local"` → `mode:"bundled"` או זיהוי אוטומטי (יש `dist/index.html` ואין `server.js`) → `config.json`: `APP_URL` → פיתוח `http://localhost:5000` / הפצה `https://sky-king.up.railway.app/` (Railway).
**חוסן רשת:** כשל טעינה, נפילת renderer או סטטוס HTTP ≥400 בכתובת היעד מציגים את `electron-status.html` ומנסים שוב ב-backoff 2/4/8/16/30 שניות. ניווט וחלונות מחוץ ל-origin של האפליקציה (מפות Google וכו') נפתחים בדפדפן המערכת. pinch-zoom מנוטרל (מסך מגע).
**הרשאות:** `setPermissionRequestHandler` + `setPermissionCheckHandler` מאשרים הרשאות (כולל **מיקרופון**, שנדרש לתמלול) **רק** ל-origin של האפליקציה - במקום ברירת המחדל של Electron שמאשרת הכל לכל עמוד.
**תמלול קולי:** רושם את ערוצי ה-IPC `stt:available` / `stt:transcribe`, שמאמתים את מקור השולח מול ה-origin של האפליקציה ומעבירים ל-`electron/whisper.cjs`. בעלייה מדפיס `[stt] מנוע התמלול מוכן` או את הקוד החסר.

### `electron-preload.cjs`
**תפקיד:** גשר `contextBridge` בין העמוד המרוחק לתהליך הראשי - חושף `window.skyking` עם **מתודה אחת לכל ערוץ IPC** (`sttAvailable`, `transcribe`), לא את `ipcRenderer` עצמו. בלעדיו זיהוי קולי לא עובד בעמדה. **חייב להיות ב-`files` של electron-builder** (whitelist).

### `electron/whisper.cjs`
**תפקיד:** מנוע התמלול המקומי - whisper.cpp + מודל עברית של ivrit-ai. מריץ את הבינארי כתת-תהליך (בלי מודול native = בלי rebuild ל-ABI של Electron), מנקה סימוני לא-דיבור (`[BLANK_AUDIO]`) לפני שהטקסט מגיע לפרסור הפקודות, ומגביל ל-60 שניות.
**חלון אודיו דינמי:** whisper מעבד תמיד 30 שניות גם על פקודה בת 2. `audioCtxForDuration` מצמצם את החלון לפי אורך ההקלטה - במדידה על i7-1355U זה הוריד אמירה של 2.5 שניות מ-15.8 שנ' ל-3.2 שנ'. ⚠️ רצפה של 256 פריימים: מתחתיה המודל נשבר ללולאת חזרות.
**נתיבים:** פיתוח `vendor/whisper/`, ארוז `resources/whisper/`; `config.json` → `WHISPER_DIR`/`WHISPER_MODEL_PATH` גוברים (החלפת מודל בעמדה בלי מתקין חדש). מכוסה בדיקות (`whisper.test.js`, 20).
**מייצא:** `transcribeWav`, `sttStatus`, `resolveSttPaths`, `cleanWhisperOutput`, `audioCtxForDuration`, `wavDurationSeconds`.

### `scripts/db-orphans.mjs`
**תפקיד:** מאתר (ובפקודה מפורשת גם מנקה) את השורות היתומות שחוסמות הוספת מפתחות זרים. `ensureForeignKeys` מדווחת בכל עלייה **אילו** FK חסומים אך לא כמה שורות חוסמות אותם ומה הן - זה מה שהכלי עונה עליו. סורק את `public` וכל סכמות התרגול, מצליב כל FK מוצהר שאינו קיים מול הנתונים בפועל.
**דגלים:** ללא דגל - דוח קריאה בלבד · `--sample` מוסיף עד 5 ערכים חוסמים לכל יתמות · `--schema=public` סכמה אחת · `--fix` ניקוי בטרנזקציה אחת לסכמה.
**מדיניות ניקוי** נגזרת מכלל המחיקה ב-`FOREIGN_KEYS`: `CASCADE` → מחיקה (השורה חסרת משמעות בלי ההורה), אחרת → `SET NULL` (מצביע אופציונלי). עמודה `NOT NULL` שאינה `CASCADE` מדווחת ואינה משתנית.
> ⚠️ **לפני `--fix` - להריץ `--sample` ולוודא לאן העמודה באמת מצביעה.** FK חסום אינו בהכרח נתונים מלוכלכים; ב-`strips.held_by_workstation` הוא היה **הצהרה שגויה**, וניקוי היה מוחק מצב תפעולי חי ושובר קבלת העברות. ראה [data-model.md](data-model.md#מפתחות-זרים--serverdbforeign-keysjs).

### `scripts/fetch-whisper.mjs`
**תפקיד:** מביא את מנוע התמלול ל-`vendor/whisper/` (ב-.gitignore): בינארי whisper.cpp v1.9.1 ל-Windows x64 + מודל `ivrit-ai/whisper-large-v3-turbo-ggml` (Apache-2.0), ומקוונטז אותו ל-q5_0 - **1549MB → 547MB**. הרצה: `npm run whisper:fetch`. **חובה לפני `electron:build:railway`** (המודל נכנס למתקין דרך `extraResources`).

### `electron-status.html`
**תפקיד:** מסך המצב המקומי של העמדה ("מתחבר לשרת" / "אין חיבור לשרת" + ספירה לאחור לניסיון הבא). נטען מ-file:// כי בעמדה אין שורת כתובת - כשל רשת חייב להיראות ולא להישאר מסך ריק. תרגום קודי שגיאה של Chromium לעברית.

### `scripts/electron-dev.mjs`
**תפקיד:** מפעיל את `electron .` אחרי ניקוי `ELECTRON_RUN_AS_NODE` — טרמינלים מוטמעים (VS Code) מגדירים אותו =1, ואז Electron רץ כ-Node ומת על `app.isPackaged` בלי לפתוח חלון. משמש את `npm run electron:dev`. דגלים: `--url=<כתובת>` (מגדיר `SKYKING_STATION_URL`), `--windowed`.

### `electron-builder.railway.json`
**תפקיד:** קונפיגורציית אריזה של העמדה כלקוח דק מול Railway - ארוזים רק `electron-main.cjs`, `electron-preload.cjs`, `electron/whisper.cjs`, `electron-status.html` ו-`package.json` (בלי `dist/`, `server.js` ו-`node_modules`). `extraResources` מוסיף את `vendor/whisper/` (מנוע התמלול, ~570MB) אל `resources/whisper/` - יש להריץ `npm run whisper:fetch` לפני הבנייה. פלט: `release-station/`. הרצה: `npm run electron:build:railway`.
⚠️ `files` הוא **whitelist**: קובץ חדש בצד Electron שלא נוסף לרשימה פשוט לא ייארז, והתקלה תתגלה רק בגרסה המותקנת.
⚠️ גם ה-`filter` של `extraResources` הוא whitelist מכוונת: הזיפ של whisper.cpp כולל ~20 בינארים שאיננו מריצים - ובראשם **`whisper-server.exe` שפותח מאזין רשת** - וגם talk-llama, stream, wchess, test-\*, parakeet-\* וכלי הקוונטיזציה (נחוץ רק ל-`whisper:fetch`, לא בעמדה). בעמדה מבצעית לא מתקינים מה שלא מריצים. נארזים רק: `whisper-cli`, `whisper.dll`, `ggml*.dll`, `libopenblas.dll`, `ggml-model.bin`.
⚠️ אין להוסיף מפתחות הערה בסגנון `"//key"` לקובץ הזה - electron-builder מוודא סכמה ונכשל על מפתח לא מוכר. האזהרה תקפה לכל קונפיגורציות ה-electron-builder, גם ברמה העליונה וגם בתוך `mac`/`win` (`_comment` נכשל בדיוק כך).

### `electron-builder.railway-lite.json`
**תפקיד:** אותו לקוח דק, **בלי** `extraResources` של whisper - מתקין של ~86MB במקום ~611MB. פלט: `release-station-lite/`. הרצה: `npm run electron:build:railway:lite` (Windows/nsis) · `npm run electron:build:railway:lite:mac` (mac/dmg+zip, **רק ממכונת mac**).
**mac:** `identity: null` (אין תעודת Apple) + `afterPack` → [scripts/mac-adhoc-sign.cjs](scripts/mac-adhoc-sign.cjs); `extendInfo.NSMicrophoneUsageDescription` (בלעדיו macOS דוחה את בקשת ההקלטה); `artifactName` כולל `${arch}` כי x64 ו-arm64 נבנים באותה ריצה והיו דורסים זה את זה.

### `electron-builder.station.json`
**תפקיד:** עמדה עצמאית לרשת מבודדת - `dist` ארוז בתוך העמדה ומוגש מ-`electron/stationServer.cjs`; רק `/api` יוצא לרשת. בניגוד ללקוח הדק, ממשיכה לעבוד בנתק. `server.js` **לא** נארז בכוונה - נוכחותו הייתה מפעילה מצב `local` (legacy) במקום `bundled`. פלט: `release-station-offline/`. הרצה: `npm run electron:build:station`.

### `scripts/mac-adhoc-sign.cjs`
**תפקיד:** hook `afterPack` שחותם את ה-`.app` חתימת **ad-hoc** (`codesign --force --deep --sign -`) ומאמת אותה. יוצא מיד כשה-platform אינו `darwin`. נחוץ כי electron-builder שובר את חתימת Electron המקורית באריזה (שינוי שם הבינארי, הזרקת `app.asar`, עריכת `Info.plist`), ו-macOS על Apple Silicon מסרב להריץ בינארי arm64 בלי חתימה תקפה. **אינו** מחליף חתימת Developer ID: קובץ שהורד עדיין ייחסם ב-Gatekeeper עד `xattr -dr com.apple.quarantine`.

### `.github/workflows/build-mac.yml`
**תפקיד:** בניית מתקין ה-mac ב-GitHub Actions על `macos-latest` - `npm ci` ואז `electron-builder --config electron-builder.railway-lite.json --mac`, והעלאת ה-DMG/ZIP כ-artifact (30 יום). מופעל ידנית (`workflow_dispatch` - מופיע בממשק רק מ-`main`) או אוטומטית בדחיפה שנוגעת בקבצי האריזה (`paths`). קיים כי electron-builder חוסם בניית יעדי mac מ-Windows ו-DMG דורש `hdiutil`.

### `public/favicon.svg` + `scripts/build-icon.mjs`
**תפקיד:** **סמל SKY KING - מקור אמת יחיד לכל האייקונים.** ה-SVG משמש ישירות כ-favicon של הדפדפן (`index.html`), ונגזר מלוגו מסך הכניסה (ראדאר + מטוס) בגרסה סטטית ומעובה כדי שייקרא ב-16x16. הסקריפט מרסטר אותו דרך Chromium של Playwright לשני קבצים: `build/icon.png` (1024x1024 - אייקון אפליקציית העמדה, electron-builder בונה ממנו את ה-.ico ל-Windows, ונטען גם כאייקון החלון בפיתוח) ו-`public/favicon.png` (192x192 - אייקון התראות הדפדפן; `Notification.icon` לא מקבל SVG). הרצה: `npm run icon:build` (`--preview <dir>` מייצר גם 256/48/32/16 לבדיקת קריאות).

---

## מפת תלויות — שכבות

```
Entry (App.tsx, server.js)
   │
   ▼
Views (SectorDashboard, GroundView, VerticalView) + ManagementPage
   │
   ▼
Feature Components (Strip, TransferCards, DraggablePanels, Map*, ground*, blocks*, query, classic, dashboard, admin/managers)
   │
   ▼
Shared Components (ConfirmModal, ContextMenu, OnScreenKeyboard, HandwritingOverlay, Modals)
   │
   ▼
Utils (scale, session, aircraft, queryBuilder, strips, digits, geo, notes, stripGrid, stripWindow)
   │
   ▼
Types (index, ground, stripGrid, stripFields) + config
```

> כלל: שכבה מייבאת רק משכבות מתחתיה. אין תלויות מעגליות.

---

## נספח א' — קטלוג Endpoints מלא (394)

#### environments.js
- `GET /api/environments`
- `POST /api/environments/:env/enter`
- `POST /api/environments/:env/reset`

#### admin.js
- `DELETE /api/activity-log`
- `DELETE /api/aid-groups/:id`
- `DELETE /api/aid-items/:id`
- `DELETE /api/bdh-items/:id`
- `DELETE /api/bdh/:id`
- `DELETE /api/serials/all`
- `DELETE /api/strip-serial-dismissals`
- `DELETE /api/strip-serial-selections`
- `DELETE /api/table-modes/:id`
- `DELETE /api/units/:id`
- `GET /api/activity-log`
- `GET /api/aid-groups`
- `GET /api/aid-groups/:id`
- `GET /api/bdh`
- `GET /api/bdh-alerts`
- `GET /api/bdh-preset-assignments`
- `GET /api/defaults`
- `GET /api/presets/:id/aid-group`
- `GET /api/presets/:id/bdh`
- `GET /api/serials`
- `GET /api/strip-serial-dismissals`
- `GET /api/strip-serial-selections`
- `GET /api/table-modes`
- `GET /api/units`
- `PATCH /api/bdh-alerts/:id/dismiss`
- `POST /api/activity-log`
- `POST /api/aid-groups`
- `POST /api/aid-groups/:id/duplicate`
- `POST /api/aid-groups/:id/items`
- `POST /api/aid-groups/:id/link`
- `POST /api/bdh`
- `POST /api/bdh-alerts`
- `POST /api/bdh/:id/items`
- `POST /api/defaults`
- `POST /api/serials/import`
- `POST /api/strip-serial-dismissals`
- `POST /api/strip-serial-selections`
- `POST /api/table-modes`
- `POST /api/units`
- `PUT /api/aid-groups/:id`
- `PUT /api/aid-items/:id`
- `PUT /api/bdh-items/:id`
- `PUT /api/bdh/:id`
- `PUT /api/bdh/:id/items/reorder`
- `PUT /api/presets/:id/aid-group`
- `PUT /api/presets/:id/bdh`
- `PUT /api/table-modes/:id`
- `PUT /api/units/:id`
#### airfield.js
- `DELETE /api/airfield-atis/:id`
- `DELETE /api/airfield-element-types/:id`
- `DELETE /api/airfield-elements/:id`
- `DELETE /api/airfield-general-notams/:id`
- `DELETE /api/airfield-pattern-elements/:id`
- `DELETE /api/airfield-patterns/:id`
- `DELETE /api/airfield-points/:id`
- `DELETE /api/airfield-polygon-statuses/:polygon_id`
- `DELETE /api/airfield-polygons/:id`
- `DELETE /api/airfield-routes/:id`
- `DELETE /api/airfield-runways/:id`
- `DELETE /api/airfield-sectors/:id`
- `DELETE /api/airfield-status-types/:id`
- `DELETE /api/airfield-taxiways/:id`
- `DELETE /api/airfields/:id`
- `DELETE /api/element-nav/:element_id`
- `DELETE /api/route-link-groups/:id`
- `DELETE /api/route-links/:id`
- `DELETE /api/runway-grf/:id`
- `DELETE /api/runway-notams/:id`
- `GET /api/active-takeoffs`
- `GET /api/airfield-atis`
- `GET /api/airfield-element-types`
- `GET /api/airfield-elements`
- `GET /api/airfield-elements/by-base/:baseId`
- `GET /api/airfield-general-notams`
- `GET /api/airfield-points/by-base/:baseId`
- `GET /api/airfield-polygon-statuses`
- `GET /api/airfield-polygons`
- `GET /api/airfield-routes`
- `GET /api/airfield-patterns`
- `GET /api/airfield-runways`
- `GET /api/airfield-sectors`
- `GET /api/airfield-status-types`
- `GET /api/airfield-taxiways`
- `GET /api/airfields`
- `GET /api/airfields/:id`
- `GET /api/airfields/:id/points`
- `GET /api/airfields/by-base/:baseId`
- `GET /api/element-nav`
- `GET /api/live-runway-conflicts`
- `GET /api/route-link-groups`
- `GET /api/route-links`
- `GET /api/runway-conflict`
- `GET /api/runway-end-use`
- `GET /api/runway-grf`
- `GET /api/runway-lighting`
- `GET /api/runway-notams`
- `POST /api/airfield-atis`
- `POST /api/airfield-element-types`
- `POST /api/airfield-elements`
- `POST /api/airfield-general-notams`
- `POST /api/airfield-polygon-statuses`
- `POST /api/airfield-polygons`
- `POST /api/airfield-routes`
- `POST /api/airfield-patterns`
- `POST /api/airfield-patterns/:id/duplicate`
- `POST /api/airfield-patterns/:id/elements`
- `POST /api/airfield-runways`
- `POST /api/airfield-sectors`
- `POST /api/airfield-status-types`
- `POST /api/airfield-taxiways`
- `POST /api/airfields`
- `POST /api/airfields/:id/duplicate`
- `POST /api/airfields/:id/points`
- `POST /api/route-link-groups`
- `POST /api/route-links`
- `POST /api/runway-grf`
- `POST /api/runway-notams`
- `PUT /api/airfield-element-types/:id`
- `PUT /api/airfield-elements/:id`
- `PUT /api/airfield-general-notams/:id`
- `PUT /api/airfield-points/:id`
- `PUT /api/airfield-polygons/:id`
- `PUT /api/airfield-routes/:id`
- `PUT /api/airfield-pattern-elements/:id`
- `PUT /api/airfield-patterns/:id`
- `PUT /api/airfield-runways/:id`
- `PUT /api/airfield-sectors/:id`
- `PUT /api/airfield-status-types/:id`
- `PUT /api/airfield-taxiways/:id`
- `PUT /api/airfields/:id`
- `PUT /api/airfields/:id/vector`
- `PUT /api/element-nav/:element_id`
- `PUT /api/runway-end-use`
- `PUT /api/runway-lighting/:runway_id`
- `PUT /api/runway-notams/:id`

#### base.js
- `DELETE /api/aviation-bases/:id`
- `DELETE /api/base-statuses/:id`
- `DELETE /api/workstation-contacts/:id`
- `GET /api/aviation-bases`
- `GET /api/base-pressure/:baseId`
- `GET /api/base-statuses`
- `GET /api/workstation-contacts`
- `GET /api/workstation-contacts/all`
- `PATCH /api/base-statuses/:id/air-defense`
- `PATCH /api/base-statuses/:id/atis`
- `PATCH /api/base-statuses/:id/notam`
- `POST /api/aviation-bases`
- `POST /api/base-statuses`
- `POST /api/workstation-contacts`
- `PUT /api/aviation-bases/:id`
- `PUT /api/base-pressure/:baseId`
- `PUT /api/base-statuses/:id`
- `PUT /api/workstation-contacts/:id`

#### emblem.js
- `DELETE /api/emblems/base/:id`
- `DELETE /api/emblems/system/:key`
- `GET /api/emblems/base/:id`
- `GET /api/emblems/system/:key`
- `PUT /api/emblems/base/:id`
- `PUT /api/emblems/system/:key`

#### blocks.js
- `DELETE /api/block-spaces/:id`
- `DELETE /api/block-tables/:id`
- `DELETE /api/blocks/:id`
- `GET /api/block-spaces`
- `GET /api/block-tables`
- `GET /api/blocks`
- `PATCH /api/strips/:id/block-deviation`
- `PATCH /api/strips/:id/block-space`
- `POST /api/block-spaces`
- `POST /api/block-tables`
- `POST /api/block-tables/:id/duplicate`
- `POST /api/blocks`
- `PUT /api/block-spaces/:id`
- `PUT /api/block-tables/:id`
- `PUT /api/blocks/:id`

#### civilian.js
- `DELETE /api/civ-strips/:id`
- `DELETE /api/civilian-assignments/:stripId/:presetId`
- `GET /api/civ-strips`
- `GET /api/civilian-assignments`
- `POST /api/civ-strips`
- `POST /api/civilian-assignments`

#### classic.js
- `DELETE /api/classic-strip-tables/:id`
- `DELETE /api/strip-window-cells/:id`
- `DELETE /api/strip-window-columns/:id`
- `DELETE /api/strip-window-layouts/:id`
- `GET /api/classic-strip-tables`
- `GET /api/strip-window-layouts`
- `POST /api/classic-strip-tables`
- `POST /api/strip-window-columns/:id/cells`
- `POST /api/strip-window-layouts`
- `POST /api/strip-window-layouts/:id/columns`
- `PUT /api/classic-strip-tables/:id`
- `PUT /api/classic-strip-tables/:id/layout`
- `PUT /api/classic-strip-tables/:id/rows`
- `PUT /api/strip-window-cells/:id`
- `PUT /api/strip-window-layouts/:id`

#### collaboration.js
- `DELETE /api/preset-mazaa-thresholds/:id`
- `DELETE /api/signals/:id`
- `DELETE /api/signals/adhoc/:presetId`
- `DELETE /api/sticky-notes/:id`
- `DELETE /api/work-group-notes/:id`
- `DELETE /api/work-groups/:id`
- `DELETE /api/work-groups/:id/members/:presetId`
- `GET /api/collab-state/:presetId`
- `GET /api/preset-mazaa-thresholds`
- `GET /api/signals`
- `GET /api/signals/incoming`
- `GET /api/sticky-notes`
- `GET /api/work-group-mazaa/:groupId`
- `GET /api/work-group-notes/for-preset/:presetId`
- `GET /api/work-groups`
- `GET /api/work-groups/:id/notes`
- `GET /api/workstation-messages`
- `PATCH /api/work-group-mazaa/:groupId`
- `POST /api/preset-mazaa-thresholds`
- `POST /api/signals`
- `POST /api/sticky-notes`
- `POST /api/sticky-notes/:id/distribute`
- `POST /api/work-groups`
- `POST /api/work-groups/:id/members`
- `POST /api/work-groups/:id/notes`
- `POST /api/workstation-messages`
- `PUT /api/collab-state/:presetId`
- `PUT /api/preset-mazaa-thresholds/:id`
- `PUT /api/signals/:id`
- `PUT /api/sticky-notes/:id`
- `PUT /api/work-group-notes/:id`
- `PUT /api/work-groups/:id`
- `PUT /api/workstation-messages/seen`

#### crew.js
- `DELETE /api/crew-members/:id`
- `DELETE /api/digits`
- `DELETE /api/strokes`
- `GET /api/crew-members`
- `GET /api/digits`
- `GET /api/digits/count`
- `GET /api/preset-active-crew`
- `GET /api/strokes`
- `GET /api/debriefs`
- `GET /api/debriefs/:id`
- `GET /api/station-sessions`
- `GET /api/workstation-session-roles`
- `GET /api/workstations/:id`
- `PATCH /api/crew-members/:id/preferences`
- `PATCH /api/workstations/:id/heartbeat`
- `POST /api/crew-members`
- `POST /api/debriefs`
- `POST /api/station-sessions`
- `POST /api/station-sessions/close`
- `POST /api/digits`
- `POST /api/strokes`
- `POST /api/workstations/login`
- `PUT /api/crew-members/:id`
- `PUT /api/preset-active-crew/:presetId`
- `PUT /api/workstation-session-roles/:preset_id`

#### driver.js
- `DELETE /api/base-routes/:id`
- `DELETE /api/preset-links/:id`
- `DELETE /api/vehicle-requests/:id`
- `GET /api/base-routes`
- `GET /api/google-maps-key`
- `GET /api/preset-links/:presetId`
- `GET /api/vehicle-gps/all-latest`
- `GET /api/vehicle-gps/latest/:requestId`
- `GET /api/vehicle-messages`
- `GET /api/vehicle-requests`
- `GET /driver`
- `POST /api/base-routes`
- `POST /api/preset-links/:presetId`
- `POST /api/route-plan`
- `POST /api/vehicle-gps`
- `POST /api/vehicle-messages`
- `POST /api/vehicle-requests`
- `PUT /api/base-routes/:id`
- `PUT /api/preset-links/:id`
- `PUT /api/vehicle-requests/:id`

#### maps.js
- `DELETE /api/closures/:id`
- `DELETE /api/map-transfer-points/:id`
- `DELETE /api/map-zones/:id`
- `DELETE /api/maps/:id`
- `DELETE /api/strip-zone-assignments/:strip_id`
- `DELETE /api/strip-zone-extra-zones/:id`
- `DELETE /api/strip-zone-extra-zones/by-strip/:strip_id`
- `DELETE /api/zone-altitude-ranges/:id`
- `GET /api/closures`
- `GET /api/map-transfer-points` (מיזוג ברירת המחדל של המפה עם דריסות העמדה)
- `GET /api/map-zones`
- `GET /api/maps`
- `GET /api/maps/:id`
- `GET /api/maps/:id/imagedata`
- `GET /api/strip-zone-assignments`
- `GET /api/strip-zone-extra-zones`
- `GET /api/zone-altitude-ranges`
- `PATCH /api/map-zones/:id/enabled`
- `PATCH /api/map-zones/:id/operational` (מצב תפעולי: `active_alt_range_ids` + `limitation_note`; ללא child-sync)
- `PATCH /api/maps/:id` (עדכון חלקי: שם / תמונה / `parent_rect` — תיחום מחדש של מפת סקטור)
- `PATCH /api/maps/:id/anchors`
- `POST /api/closures`
- `POST /api/map-transfer-points` (UPSERT לפי מפה+עמדה+סקטור+תת-נקודה)
- `POST /api/map-zones`
- `POST /api/maps`
- `POST /api/maps/:id/sync-zones-from-parent`
- `POST /api/strip-zone-assignments`
- `POST /api/strip-zone-extra-zones`
- `POST /api/zone-altitude-ranges`
- `PUT /api/closures/:id`
- `PUT /api/map-zones/:id`
- `PUT /api/zone-altitude-ranges/:id`

#### mirage.js
- `GET /api/auth/mirage-crew`
- `GET /api/auth/mirage-eligible`
- `POST /api/auth/mirage-login`

#### missionDesks.js
- `DELETE /api/mission-desk-services/:sid`
- `DELETE /api/mission-desks/:id`
- `GET /api/mission-desk-state`
- `GET /api/mission-desks`
- `POST /api/mission-desks`
- `POST /api/mission-desks/:id/services`
- `PUT /api/mission-desk-services/:sid`
- `PUT /api/mission-desk-state/:serviceId`
- `PUT /api/mission-desks/:id`

#### position-merges.js
- `GET /api/position-merges`
- `PATCH /api/position-merges/:id/end`
- `POST /api/position-merges`
- `POST /api/position-merges/:id/handover`

#### provisional-transfers.js
- `DELETE /api/provisional-transfer-points/:id`
- `GET /api/provisional-transfer-points`
- `PATCH /api/provisional-transfer-points/:id/pos`
- `POST /api/provisional-transfer-points`
- `POST /api/provisional-transfer-points/:id/approve`
- `POST /api/provisional-transfer-points/:id/touch`

#### sectors.js
- `DELETE /api/sectors/:id`
- `DELETE /api/sectors/:id/neighbors/:neighborId`
- `DELETE /api/sub-sectors/:id`
- `GET /api/sectors`
- `GET /api/sectors/:id/neighbors`
- `GET /api/sectors/:id/strips`
- `GET /api/sectors/:id/sub-sectors`
- `GET /api/sectors/:sectorId/workstations`
- `GET /api/workstation-presets/partner-alt-ranges`
- `PATCH /api/workstation-presets/:id/transfer-point`
- `POST /api/sectors`
- `POST /api/sectors/:id/neighbors`
- `POST /api/sectors/:id/sub-sectors`
- `PUT /api/sectors/:id`
- `PUT /api/sectors/:id/notes`
- `PUT /api/sub-sectors/:id`

#### strips.js
- `DELETE /api/default-armament-names/:id`
- `DELETE /api/default-system-names/:id`
- `DELETE /api/strip-aircraft-armaments/:id`
- `DELETE /api/strip-aircraft-systems/:id`
- `DELETE /api/strip-aircraft/:stripId/:idx`
- `DELETE /api/strip-table-assignments/:stripId/:presetId`
- `DELETE /api/strips/:id`
- `GET /api/default-armament-names`
- `GET /api/default-system-names`
- `GET /api/strip-aircraft`
- `GET /api/strip-aircraft-armaments`
- `GET /api/strip-aircraft-armaments/bulk`
- `GET /api/strip-aircraft-systems`
- `GET /api/strip-aircraft-systems/bulk`
- `GET /api/strips`
- `GET /api/strips/:id/formation-summary`
- `GET /api/strips/all`
- `GET /api/strips/formation-summaries`
- `GET /api/strips/global`
- `PATCH /api/strips/:id/pin-display`
- `PATCH /api/strips/:id/station-note` — הערת עמדה פר (פ"מ, עמדה); הערה ריקה מוחקת
- `POST /api/default-armament-names`
- `POST /api/default-system-names`
- `POST /api/strip-aircraft-armaments`
- `POST /api/strip-aircraft-systems`
- `POST /api/strip-aircraft/bulk-import`
- `POST /api/strip-aircraft/ensure-all`
- `POST /api/strip-aircraft/ensure/:stripId`
- `POST /api/strip-table-assignments`
- `POST /api/strips`
- `POST /api/strips/:id/accept-queued`
- `POST /api/strips/:id/assign`
- `POST /api/strips/:id/assign-workstation`
- `POST /api/strips/:id/merge-partial`
- `POST /api/strips/ground-create`
- `POST /api/strips/ground-single-transfer`
- `POST /api/strips/import`
- `POST /api/strips/partial-create`
- `POST /api/strips/reset-placement`
- `POST /api/strips/reset-placement-preset`
- `PUT /api/default-armament-names/:id`
- `PUT /api/default-system-names/:id`
- `PUT /api/strip-aircraft-armaments/:id`
- `PUT /api/strip-aircraft-systems/:id`
- `PUT /api/strip-aircraft/:stripId/:idx`
- `PUT /api/strips/:id`
- `PUT /api/strips/:id/aircraft`
- `PUT /api/strips/:id/formation-meta`
- `PUT /api/strips/update-takeoff-to-today`

#### transfers.js
- `GET /api/presets/:presetId/classic-incoming`
- `GET /api/presets/:presetId/classic-outgoing`
- `GET /api/sectors/:id/incoming-transfers`
- `GET /api/sectors/:id/outgoing-transfers`
- `GET /api/transfers/pending-all`
- `GET /api/workstations/:presetId/incoming-transfers`
- `GET /api/workstations/:presetId/outgoing-transfers`
- `PATCH /api/transfers/:id/note`
- `POST /api/strips/:id/transfer`
- `POST /api/strips/:id/transfer-to-preset`
- `POST /api/transfers/:id/accept`
- `POST /api/transfers/:id/accept-to-map`
- `POST /api/transfers/:id/acknowledge`
- `POST /api/transfers/:id/cancel`
- `POST /api/transfers/:id/dismiss`
- `POST /api/transfers/:id/move`
- `POST /api/transfers/:id/reject`
- `POST /api/transfers/:id/set-eta`

#### translations.js
- `DELETE /api/translations/:key`
- `GET /api/translations`
- `PUT /api/translations`

#### workstations.js
- `DELETE /api/preset-view-stations/:id`
- `DELETE /api/workstation-presets/:id`
- `GET /api/dashboard/load`
- `GET /api/preset-view-stations/:presetId`
- `POST /api/preset-view-stations/:presetId`
- `PUT /api/preset-view-stations/:id`
- `PUT /api/preset-view-stations/:presetId/order`
- `GET /api/workstation-personal-filters`
- `GET /api/workstation-presets`
- `GET /api/workstation-presets/:id/config`
- `GET /api/workstation-presets/:id/waiting-strips`
- `GET /api/workstations/:presetId/strips`
- `GET /api/workstations/:presetId/work-group-peers`
- `PATCH /api/workstation-presets/:id/thresholds`
- `POST /api/workstation-presets`
- `POST /api/workstation-presets/:id/duplicate`
- `PUT /api/workstation-personal-filters`
- `PUT /api/workstation-presets/:id`

