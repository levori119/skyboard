# מבנה נתונים — SKY KING

## מפתחות זרים — `server/db/foreign-keys.js`

**הרשימה המחייבת של ה-FK נמצאת ב-[`server/db/foreign-keys.js`](server/db/foreign-keys.js), לא ב-`init.js`.**

הרקע: ה-FK מוצהרים בתוך ה-`CREATE TABLE` ב-`init.js`, אבל `CREATE TABLE IF NOT
EXISTS` מדלג בשקט על טבלה שכבר קיימת. לכן כל FK שנוסף להצהרה **אחרי** שהטבלה
נוצרה בסביבה — לא נוצר שם מעולם. ב-31.07.2026 נמדד ש-**112 מתוך 121 ה-FK
המוצהרים לא היו קיימים ב-DB בפועל (93%)**: הצהרה שנראית תקינה בקוד ואינה נאכפת.
הבעיה התגלתה כשמחיקת אנשי צוות, שאמורה הייתה לגרור `CASCADE`, השאירה 37 שורות
יתומות.

`ensureForeignKeys()` רצה בסוף `initDb()` ומשלימה בכל עלייה את מה שחסר בסכמה
הנוכחית. היא אידמפוטנטית (בודקת `pg_constraint` לפני), ו**אינה מדלגת בשקט על
כשל** — FK שלא ניתן להוסיף נרשם ללוג בקול בכל עלייה, כי כמעט תמיד הסיבה היא
שורות יתומות שדורשות החלטה על הנתונים.

סכמות סביבות התרגול מקבלות את ה-FK בנפרד: `ensureEnvSchema()` משכפלת אותם
מ-`public` (ראה `envs.js` — `CREATE TABLE (LIKE ...)` לא מעתיק FK).

> **כשמוסיפים FK חדש ל-`init.js` — להוסיף אותו גם ל-`foreign-keys.js`.**
> אחרת הוא ייווצר רק בסביבות חדשות, וזו בדיוק התקלה שהמנגנון בא לפתור.

**מצב נוכחי (04.08.2026):** **136/136 ב-`public`, אפס חסומים.** 49-67 בכל סכמת
תרגול (טבלאות תפעוליות בלבד; אפס FK מסביבה אל טבלה תפעולית ב-`public`, כלומר
הבידוד שלם). 9 ה-FK שהיו חסומים טופלו — ראה להלן.

### היתומות שחסמו, וה-FK האחד שאסור שיהיה

עד 04.08.2026 דיווח הלוג בכל עלייה על 9 FK חסומים. הבדיקה הראתה **שתי תקלות
שונות** שהצטיירו כאחת:

- **8 מהם — נתונים.** 385 שורות יתומות: ילדים של הורה שכבר נמחק (`bdh_items` של
  מסמכים שנמחקו, `sector_neighbors`/`sub_sectors` של סקטורי ה-seed המקורי 1 ו-2,
  ושורות של פ"מים מחוקים — רובן בסביבת תרגול). נוקו, וה-FK נוצרו.
- **1 מהם — הצהרה שגויה.** `strips.held_by_workstation` הוצהר מול
  `workstations(id)`, אבל **0 מ-31 הערכים בייצור היו UUID של עמדה ו-31/31 היו
  `workstation_presets.id`**: הסמנטיקה של העמודה נדדה כשעברו לעמדות-preset
  (`transfers.js` כותב לשם `assignedPresetId`, ו-`workstations.js` קורא ומשווה
  לשתי הצורות). "ניקוי" ה-31 והוספת ה-FK היו **מפילים כל קבלת העברה**. ההצהרה
  הוסרה — גם מהרשימה וגם מה-`CREATE TABLE` — ומתועדת בשני המקומות.
  איחוד העמודה עם `workstation_preset_id` נותר כרפקטור נפרד.

> **לקח:** FK חסום אינו בהכרח "נתונים מלוכלכים". לפני ניקוי — לבדוק **לאן
> העמודה באמת מצביעה בייצור**. `node scripts/db-orphans.mjs --sample` מדפיס
> בדיוק את זה (דוח בלבד; `--fix` מנקה בטרנזקציה אחת לסכמה).

---

## אנשי צוות — `crew_members`

מאז המעבר להזדהות מול המיראז' בלבד, **המיראז' הוא המקור היחיד לזהויות** ואין
זריעה של אנשי צוות ב-`seed.js`. רשומה מקומית נוצרת רק בעקבות התחברות בפועל,
וכשאין התאמה לפי `personal_id` — `mirage-login` בונה משתמש וירטואלי מפרטי
המיראז' בלי לכתוב ל-DB (ראה `server/routes/mirage.js`).

`activity_log` שומר `crew_member_name` **denormalized** ואין בו FK ל-`crew_members`
— בכוונה: מחיקת איש צוות לא אמורה למחוק או לרוקן את יומן הביקורת.

---

## סביבות תרגול (סימולציה) — סכמה לכל סביבה

בסגנון גלקסיה: 50 סביבות עבודה. **סביבות טסות (1–10)** חולקות את המידע הטס
(פ"מ, סגירות, ספרורים זהים) — הן ממופות כולן לסכמת **`public`** הקיימת.
**סביבות תרגול (11–50)** מבודדות לחלוטין — לכל אחת סכמת PostgreSQL משלה
(`env_11` … `env_50`) המכילה עותק של הטבלאות **התפעוליות** בלבד.

**מיפוי:** הלקוח שולח כותרת `X-Env` (נבחרת ב-LOGIN, מוצגת בבאדג' בסרגל העליון);
middleware בשרת ([server/middleware/environment.js](server/middleware/environment.js))
ממפה סביבה→סכמה ומריץ כל בקשה תחת `search_path` מתאים, בלי לגעת ב-455 ה-routes.

**סיווג הטבלאות** ([server/db/env-tables.js](server/db/env-tables.js)) — מקור אמת יחיד:
- **תפעוליות** (מבודדות פר-סביבה): `strips` + טבלאות בת, `strip_transfers`,
  `provisional_transfer_points`, `serials`, `closures`, `activity_log`,
  `workstation_messages/signals`, `bdh_alerts`, `sticky_notes`, `blocks`,
  סטטוסי שדה קרקעי בזמן-ריצה, ועוד — ראה `OPERATIONAL_TABLES`.
- **קונפיגורציה** (משותפת, `public` בלבד): `sectors`, `workstations`,
  `workstation_presets`, `maps`, `crew_members`, `translations`, `airfields`,
  הגדרות דסקים/בד"ח — ראה `CONFIG_TABLES`. FKs תפעולי→קונפיג נפתרים ל-`public`.
- **היברידיות** (עותק שורות מ-public): `airfield_elements`, `airfield_taxiways`,
  `base_statuses` — הגדרת שדה שסטטוס חי יושב עליה.

**בטיחות:** בדיקת שלמות ב-boot (`checkTableClassification`) מפילה את העלייה אם
טבלה חדשה ב-public אינה מסווגת (מונע זליגת תרגול↔אמת שקטה). סכמת תרגול נוצרת
עצלנית בכניסה ראשונה ([server/db/envs.js](server/db/envs.js) `ensureEnvSchema`),
מסונכרנת ב-boot (`syncAllEnvSchemas`), וניתנת לאיפוס (`POST /api/environments/:env/reset`).

> ⚠️ **בידוד connection (קריטי):** מול ה-pooler של Neon (pgbouncer), החלפת
> `client.query` להזרקת `SET LOCAL` גורמת ל-search_path לדלוף לרמת ה-server
> connection. לכן connection ששירת סביבת תרגול דרך `pool.connect()` **מושמד**
> בשחרור ([server/db/pool.js](server/db/pool.js)) ולא חוזר ל-pool המשותף. נבדק
> ב-[server/db/env-isolation.integration.test.js](server/db/env-isolation.integration.test.js).

### טבלת `environments` — רישום הסביבות (ב-`public` בלבד)

| עמודה | סוג | תיאור |
|---|---|---|
| `env_number` | INT PK | מספר הסביבה (1–50) |
| `schema_created` | BOOLEAN | האם סכמת התרגול נוצרה (טסות: תמיד true) |
| `last_entered_at` | TIMESTAMPTZ | כניסה אחרונה (מזין את מסך הכניסה) |
| `created_at` | TIMESTAMPTZ | חותמת יצירה |

---

## טבלת `strips` — פ"מ (פלוגת מטוסים)

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `callsign` | VARCHAR(50) | אוק (חנית, כסף, ...) |
| `sq` | VARCHAR(10) | מספר פ"מ (1, 2, ...) |
| `squadron` | VARCHAR(100) | טייסת |
| `number_of_formation` | VARCHAR(50) | כמות מטוסים בפ"מ |
| `alt` | VARCHAR(10) | גובה |
| `task` | VARCHAR(50) | משימה |
| `erka` | TEXT | ע"ר/קא |
| `koteret` | TEXT | כותרת |
| `mivtza` | TEXT | מבצע |
| `takeoff_time` | TIMESTAMPTZ | זמן המראה |
| `planned_landing_time` | TIMESTAMPTZ | **זמן נחיתה מתוכנן** — ETA לשדה. הבסיס לאופרטורי הזמן היחסיים בשאילתא ("נוחת בעוד פחות מ-X דקות"). **לא** `strip_transfers.eta_minutes`, שהוא ספירה לאחור לנקודת העברה |
| `airborne` | BOOLEAN | בתעופה |
| `landed` | BOOLEAN | נחת - סוף חיים תפעולי. GAPI מפסיק להפיץ פ"מ כזה ושולח מסר מחיקה |
| `status` | VARCHAR(20) | queued / active / pending_transfer |
| `workstation_preset_id` | INT → presets | לאיזו עמדה שייך |
| `sector_id` | INT → sectors | סקטור |
| `x`, `y` | REAL | מיקום על מפה |
| `on_map` | BOOLEAN | האם על המפה |
| `in_table` | BOOLEAN | האם בטבלה |
| `aircraft_positions` | JSONB | `[{idx,x,y,point_id,status}]` — מיקום כל מטוס על מפת שדה |
| `notes` | TEXT | הערות |
| `formation_notes` | TEXT | הערה ברמת פ"מ |
| `parent_callsign` | VARCHAR(100) | או"ק פ"מ מקורי (אם שונה) |
| `weapons` | JSONB | נשק |
| `targets` | JSONB | **טבלת נקודות מכוון** (העברת מטרה לתקיפה) — **טבלת בן** של הפ"מ: מערך של נ"צי תקיפה. שורה: 11 שדות טקסט `{name, aim_point, coord, alt_ft, hd, an, an_min, fuze, armament, bombs, note}` + 4 **דגלים בוליאניים** `{air_verified, cleared_heading, abort_attack, ground_verified}`. `coord` = 17 ספרות `NDDMM.mmmm/EDDDMM.mmmm`; `fuze` בשניות (0.02 = 20 מ"ש); דגל חסר נקרא `false`. נשמר כ-JSONB ולא כטבלה נפרדת כדי שכל הטבלה תיכתב בפעולה אחת ולא יישארו שורות יתומות. מקור אמת: `src/types/aimPoints.ts` |
| `systems` | JSONB | מערכות |
| `custom_fields` | JSONB | שדות מותאמים, **וגם ערכי פקדים גלובליים** של הסטריפ (מפתח = `key` של הפקד). נכתב ב-`jsonb_set` על המפתח בלבד, כדי ששתי עמדות שמשנות שני פקדים לא ידרסו זו את זו. ראה [CIV_STRIP_CONTROLS.md](CIV_STRIP_CONTROLS.md) |
| **`parent_strip_id`** | INT → strips.id | **מופיע רק אחרי פיצול** — מצביע על ה-root |
| **`aircraft_indices`** | JSONB | **מופיע רק אחרי פיצול** — לדוגמה `[1, 3]` |
| **`original_formation_count`** | INT | **מופיע רק אחרי פיצול** — כמות מטוסים מקורית |
| `updated_at` | TIMESTAMPTZ | חותמת עדכון — מתוחזקת בטריגר. ראה §מעקב גרסה |
| `rev` | BIGINT | מונה גרסה — עולה ב-1 בכל `UPDATE`. ראה §מעקב גרסה |

---

## מעקב גרסה — `rev` + `updated_at`

חמש טבלאות נושאות מונה גרסה, וכולן אותן טבלאות שהעמדה כותבת אליהן **בנתק**:

| טבלה | מה נכתב בנתק |
|---|---|
| `strips` | הפ"מ עצמו, כולל `on_map`/`x`/`y` — גרירה על המפה |
| `strip_transfers` | העברות עמדה |
| `strip_zone_assignments` | הצבת פ"מ על אזור במפה |
| `strip_table_assignments` | הצבת פ"מ בטבלת עמדה |
| `joining_point_strips` | פ"מ בנקודת הצטרפות |

**למה זה קיים:** בסנכרון חזרה אחרי עבודה מנותקת יש שאלה אחת שחייבת תשובה
ודאית — *האם עמדה אחרת נגעה בפ"מ הזה בזמן שהייתי מנותק*. בלי מונה אי אפשר
להבדיל בין "אף אחד לא נגע" ל"כבר העבירו אותו", ובקרת טיסה לא מנחשת.

**למה טריגר ולא עדכון בקוד:** `strips` נכתבת מעשרות מקומות. שורת
`updated_at = NOW()` בכל אחד מהם היא בדיוק מה שנשכח בכתיבה החמישים ואחת,
ואז הסתירה נבלעת בשקט. הטריגר `<table>_touch_rev` אינו יכול להישכח.

**למה `rev` ולא רק חותמת זמן:** חותמת נשענת על שעון השרת. קפיצת NTP לאחור
הייתה גורמת לשינוי אמיתי להיראות ישן מהבסיס שהעמדה זוכרת — כלומר סתירה
שנבלעת. `rev` מונוטוני ואינו תלוי בשעון. החותמת משמשת לתצוגה ("השרת שינה
ב-14:32"), המונה להכרעה.

> ⚠️ **סביבות תרגול:** `CREATE TABLE (LIKE ... INCLUDING ALL)` מעתיק עמודות,
> defaults ואינדקסים אבל **לא טריגרים**. לכן [`server/db/envs.js`](server/db/envs.js)
> מתקין אותם במפורש בכל סכמת `env_NN`. בלי זה סביבת תרגול הייתה מקבלת את
> העמודות בלי המנגנון שממלא אותן, `rev` היה נשאר 0 לנצח, וסנכרון היה מדווח
> "אין סתירות" תמיד. מקור אמת לרשימה ולפקודות:
> [`server/db/versionedTables.js`](server/db/versionedTables.js).

---

### שדה מחושב ב-API: `at_preset_names` ("נמצא בעמדה")

`GET /api/strips/global` מחזיר לכל פ"מ מערך שמות של **כל העמדות שהוא נמצא בהן
כרגע**: איחוד של `strip_table_assignments` (נגרר לדסק) ו-`strip_zone_assignments.preset_id`
(חובר לאזור). פ"מ יכול להיות בכמה עמדות במקביל; יציאה מהדסק (נקודת העברה או
חזרה לחלון הפ"מים) מוחקת את שורת השיוך ולכן גורעת את העמדה.

**לא** נגזר מ-`strips.workstation_preset_id` — אותה עמודה נושאת גם **יעד העברה**,
ופ"מ שממתין בנקודת העברה כבר לא "נמצא" אצל אף אחד.

---

## טבלת `strip_station_notes` — הערת עמדה על פ"מ

הערה **פרטית לעמדה** על פ"מ. שתי עמדות שמחזיקות את אותו פ"מ בדסק שלהן כותבות
הערות נפרדות בלי לדרוס זו את זו. אינה מחליפה את `strips.notes` המשותפת אלא
מתווספת אליה: בטבלה יש עמודה לכל אחת (`notes` / `station_note`).

| עמודה | סוג | תיאור |
|---|---|---|
| `strip_id` | INT → strips (CASCADE) | הפ"מ |
| `preset_id` | INT → workstation_presets (CASCADE) | העמדה שכתבה |
| `note` | TEXT | ההערה. הערה ריקה = השורה נמחקת |
| `note_by_crew_id` | INT | איש הצוות שכתב |
| `updated_at` | TIMESTAMPTZ | חותמת עדכון |
| | PK | `(strip_id, preset_id)` — הערה אחת לכל צמד |

> **למה טבלה נפרדת ולא עמודה ב-`strip_table_assignments`:** אותה טבלה נמחקת
> בסיטונאות ב-`POST /api/strips/reset-placement[-preset]` ובהסרת פ"מ מהדסק, ולכן
> הערות שהיו תלויות בה היו נמחקות בניקוי הצבות. בנוסף, פ"מ שנמצא בדסק דרך
> התאמת query כלל אינו מחזיק שורת שיוך — וכאן הוא עדיין יכול לשאת הערה.

**נקרא ב-** `GET /api/strips/global` כמפה `station_notes = {preset_id: note}`
(תת-שאילתה סקלרית, לא JOIN — שני JOINים מצטברים היו מכפילים שורות).
**נכתב ב-** `PATCH /api/strips/:id/station-note` (upsert; הערה ריקה מוחקת).

---

## טבלת `strip_aircraft` — מטוס בודד

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `strip_id` | INT → strips | שייך לאיזה פ"מ |
| `idx` | INT | מספר המטוס בתוך הפ"מ (1, 2, 3...) |
| **`tail_number`** | VARCHAR(20) | **מספר זנב** |
| **`pilot_name`** | VARCHAR(200) | **שם טייס** |
| **`navigator_name`** | VARCHAR(200) | **שם נווט** |
| **`sagol_1`** | VARCHAR(50) | **סגול 1** |
| **`sagol_2`** | VARCHAR(50) | **סגול 2** |
| `datk` | INT | דת"ק (מספר חניה) |
| `kipa` | VARCHAR(100) | כיפה |
| **`has_fault`** | BOOLEAN | **תקלה במטוס** — הדגל שמאדים את הפ"מ בתצוגה |
| **`fault_type`** | VARCHAR(200) | **מהות התקלה** — שם מתוך `fault_types` (שם ולא FK, ראה למטה) |
| **`fault_details`** | TEXT | **פירוט התקלה** — טקסט חופשי |

### הצגה כטבלת בן בעמדה

הטבלה רשומה ב-[`src/types/subTables.ts`](src/types/subTables.ts) לצד טבלת נקודות
המכוון, ולכן היא נבחרת בכפתור **"הוסף טבלה"** בהגדרת **מוד הטבלה** (מסך ניהול)
ומקבלת בוחר עמודות משלה. `GET /api/strips/global` מחזיר אותה מקוננת על הפ"מ תחת
`aircraft` (חימושים ומערכות בתוך שורת המטוס), כך שהמנגנון הגנרי מוצא אותה באותו
`stripField` שבו הוא מוצא את `targets`.

| | |
|---|---|
| **עריכה בתא** | `rowWrite: 'aircraft-row'` ברישום: שורת מטוס היא **רשומת DB עם מפתח משלה** (`strip_id, idx`) ולכן נשמרת **לבדה** במסלול שלה, ולא ככתיבה של מערך שלם לשדה הפ"מ כמו `strips.targets` - כתיבה כזו הייתה דורסת שורות שעמדה אחרת עדכנה באותו רגע |
| **מה נערך** | תקלה (מתג) · מהות התקלה (מתפריט `fault_types` המנוהל, דרך `datalist`) · פירוט התקלה · מספר זנב · טייס · נווט · סגול 1/2 · דת"ק · כיפה |
| **מה לא** | מספר המטוס (`idx` - המפתח), חימושים ומערכות: הם שיטוח של טבלאות בן שלמות לטקסט אחד ("פצצה x2", "מכ\"ם (לא שמיש)"), ואי אפשר לפרק הקלדה חזרה לשורות |
| **שני מסלולי כתיבה** | התקלה ב-`/fault` (שלושת השדות יחד), השאר ב-`PUT /strip-aircraft/:stripId/:idx` בעדכון חלקי. `aircraftRowWrite` ([stripAircraft.ts](src/types/stripAircraft.ts)) בוחר ביניהם |
| **עמודות ברירת מחדל** | מספר, מספר זנב, שם טייס, דת"ק - השאר נוספות במקנפג |

> **הקלדת מהות/פירוט מדליקה את דגל התקלה.** השרת מתעלם משניהם כשהדגל כבוי
> (כיבוי = ניקוי), ולכן בלי זה מה שהוקלד היה נעלם בשקט. כיבוי נעשה במתג בלבד -
> ניקוי הטקסט אינו מכבה, כי "יש תקלה, פרטים בהמשך" הוא מצב לגיטימי.

### כמות השורות — לפי המס"מ

הטבלה היא **טבלת בן של הפ"מ**: שורה לכל מטוס, ולכן מספר השורות הוא ה**מס"מ**
(`strips.number_of_formation`) — מבנה של ארבעה מקבל ארבע שורות, `idx` 1..4.
היצירה אידמפוטנטית (`POST /api/strip-aircraft/ensure/:stripId` עם
`count = number_of_formation`, ו-`/ensure-all` לכל הפ"מים), ולכן קריאה חוזרת
אינה מכפילה שורות. בכיוון הנכנס מ-GAPI השורות נוצרות מ-`data.aircraft[]` עצמו.

### זהות המטוס וצוות האוויר

`tail_number`, `pilot_name`, `navigator_name`, `sagol_1`, `sagol_2` הן תכונות של
ה**מטוס הבודד** ולא של הפ"מ — במבנה של ארבעה יש ארבעה זנבות וארבעה צוותים,
ושדה אחד ברמת הפ"מ היה מנסה לדחוס ארבעה ערכים לתא אחד. כולן VARCHAR ולא
מספריות: מספר זנב וסגול נכתבים כפי שהם מוכתבים בקשר, לרבות אפסים מובילים.

| | |
|---|---|
| **כתיבה** | `PUT /api/strip-aircraft/:stripId/:idx` — **עדכון חלקי**: נכתבות רק העמודות שהופיעו ב-body. בלי זה, לקוח ששולח `{datk, kipa}` בלבד היה מוחק בשקט מספרי זנב ושמות צוות שהוזנו במסך אחר |
| **GAPI** | חמשת השדות הם **תפעוליים דו-כיווניים** (⇄) ונשלחים מקוננים ב-`aircraft[]` של הפ"מ. שלושת שדות התקלה הם **פנימיים ל-SKY-KING** — לא יוצאים, ו-upsert נכנס לא נוגע בהם |
| **מקור אמת** | [`server/gapi/entities.js`](server/gapi/entities.js) (`AIRCRAFT_FIELDS`) — ממנו נגזרים הכניסה, היציאה ומסלול העדכון. החוזה: [GAPI-CONTRACT.md](GAPI-CONTRACT.md) §6.1.2 |

### תקלה — על המטוס, מוצגת ברמת הפ"מ

התקלה היא תכונה של ה**מטוס**, כמו הדת"ק והכיפה. הפ"מ אינו נושא עמודת תקלה:
`GET /api/strips/global` מחשב לכל פ"מ שדה `aircraft_faults`
(`[{idx, fault_type, fault_details}]`, תת-שאילתה על מטוסים עם `has_fault`),
והתצוגה מרכיבה ממנו את שדה **"תקלות"**: `"תקלה למספר 2, תקלה למספר 4"` באדום,
וב-HINT `"מספר 2: מנוע - רעש חריג"`. הרכבת המחרוזות: [`src/utils/faults.ts`](src/utils/faults.ts).

| | |
|---|---|
| **כתיבה** | `PUT /api/strip-aircraft/:stripId/:idx/fault` — **מסלול נפרד** מדת"ק/כיפה, כדי שעדכון חנייה לא ידרוס תקלה שעמדה אחרת רשמה באותו רגע |
| **כיבוי הדגל** | מנקה גם את המהות וגם את הפירוט (בשרת ובלקוח) — "אין תקלה" חייב להיות אין תקלה, אחרת טקסט ישן היה צץ שוב בהדלקה הבאה |
| **הרשאות** | סימון תקלה = `USER` (דיווח תפעולי); עריכת תפריט המהויות = `STAFF` (מסך ניהול) |

### טבלת `fault_types` — תפריט מהויות התקלה

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `name` | VARCHAR(200) UNIQUE | שם המהות (מנוע, מכ"ם, ...) |
| `sort_order` | INT | סדר בתפריט |

טבלת **קונפיג** (`CONFIG_TABLES`) — מנוהלת במסך ניהול מערכת, טאב
"חימושים/מערכות/תקלות", ומשותפת לכל סביבות התרגול. המטוס שומר את **שם** המהות
ולא מזהה: `strip_aircraft` משוכפלת לכל סכמת `env_NN` בעוד `fault_types` חיה רק
ב-`public`, ו-FK חוצה-סכמות היה נשבר שם. לכן מחיקת מהות מהתפריט **אינה** מוחקת
תקלה שכבר נרשמה — היא רק מפסיקה להציע אותה (והבורר עדיין מציג ערך שנמחק).

### טבלת `strip_aircraft_armaments` — חימושים

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `strip_aircraft_id` | INT → strip_aircraft | שייך לאיזה מטוס |
| `armament_name` | VARCHAR(200) | שם החימוש |
| `quantity` | INT | כמות |

### טבלת `strip_aircraft_systems` — מערכות

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `strip_aircraft_id` | INT → strip_aircraft | שייך לאיזה מטוס |
| `system_name` | VARCHAR(200) | שם המערכת |
| `status` | VARCHAR | שמיש / חלקי / לא שמיש |

---

## טבלת `strip_transfers` — העברות עמדה

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `strip_id` | INT → strips | הפ"מ המועבר |
| `from_sector_id` | INT → sectors | סקטור מוסר |
| `to_sector_id` | INT → sectors | סקטור מקבל |
| `from_workstation_id` / `to_workstation_id` | INT | עמדות (העברה ישירה) |
| `status` | VARCHAR(20) | `pending` → `acknowledged` → `accepted` / `rejected` |
| `target_x`, `target_y` | REAL | מיקום יעד |
| `sub_sector_label` | VARCHAR(50) | תווית נקודת ההעברה |
| `eta_minutes`, `eta_set_at` | — | ETA לספירה לאחור |
| **`reject_note`** | TEXT | **הערת דחייה (חובה בדחייה) — מוצגת בפופאפ אצל המוסר** |
| `created_at` / `updated_at` | TIMESTAMP | חותמות |

### מצבי סטטוס (state machine)
- `pending` — נשלחה, ממתינה אצל המקבל.
- `acknowledged` — המקבל **אישר** קבלה; הפ"מ עדיין לא עבר (נשאר בעמודת הקבלה + ירוק אצל המוסר). נשאר גלוי ב-GET (`status IN ('pending','acknowledged')`).
- `accepted` — "קבל" סופי / גרירה למפה/טבלה; הסטריפ עבר, נגרע.
- `rejected` — נדחתה עם הערה; הסטריפ חזר למוסר + פופאפ (כתום אצל המוסר).

---

## טבלת `sectors` — נקודות המעבר עצמן

במסך הניהול לשונית "נקודות העברה" עורכת את הטבלה הזו: כל שורה היא **נקודת מעבר**
שאליה מעבירים פ"מ (`strip_transfers.to_sector_id`).

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `name` / `label_he` | VARCHAR | שם טכני / שם תצוגה |
| `category` | VARCHAR(100) | קטגוריה חופשית (מרחב, גישה, מסלול...) |
| `notes` | TEXT | הערות להעברת מידע בין העמדות |
| `conflict_alt_delta` | INT | סף קונפליקט גובה ברגליים (0 = כבוי) |
| **`auto_accept_mode`** | VARCHAR(12) | **קבלה אוטומטית של פ"מ בנקודה: `off` (ברירת מחדל) / `immediate` (ברגע השליחה) / `eta` (בתום `strip_transfers.eta_minutes`).** ראה למטה |

### קבלה אוטומטית (`auto_accept_mode`)

בשלב ה-MVP יש עמדה **אחת** ואין מי שילחץ "קבל פ"מ" בצד המקבל, ולכן כל העברה
נתקעת ב-`pending`. נקודת מעבר שסומנה לקבלה אוטומטית מבצעת את הקבלה בעצמה -
**באותו קוד** של קבלה ידנית (`acceptTransferTx`) - כדי שניתן יהיה לתרגל את
התהליך מקצה לקצה.

| | |
|---|---|
| **המנוע** | `runAutoAcceptOnce()` ב-[`server/routes/transfers.js`](server/routes/transfers.js), סבב כל 5ש' מ-`server.js` (`AUTO_ACCEPT_TICK_MS`), פר-סביבה |
| **מתי מבשילה** | [`server/utils/autoAccept.js`](server/utils/autoAccept.js) - `immediate`: מיד; `eta`: `eta_set_at + eta_minutes`. בלי זמן מוקצה = מיד (אחרת פ"מ בלי ETA נתקע לנצח דווקא בנקודה אוטומטית) |
| **מי המקבל** | `receivingPresetId = null` - נופל ל-`to_preset_id`/`to_workstation_id`, וכשאין כאלה הפ"מ פשוט עוזב את העמדה המוסרת, כמו מסירה לצד שאינו במערכת |
| **מרוצים** | "תפיסה" של השורה (`UPDATE ... WHERE status IN ('pending','acknowledged')`) בתוך הטרנזקציה - קבלה ידנית שקדמה מנצחת, ואין קבלה כפולה |
| **יומן** | `activity_log.transfer_accepted` עם `details.auto = true` |

---

## טבלת `sub_sectors` — נקודות העברה (בין סקטור לשכן)

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `sector_id` | INT → sectors | הסקטור |
| `neighbor_id` | INT → sectors | הסקטור השכן |
| `label` | VARCHAR(50) | שם נקודת ההעברה |
| `default_x`, `default_y` | REAL | מיקום ברירת מחדל על המפה |
| **`display_mode`** | VARCHAR(10) | **`full` (פאנל שלם, ברירת מחדל) / `arrow` (חץ מוקטן). ניתן לעקיפה נקודתית בעמדה מתפריט ההקשר.** |

---

## טבלת `provisional_transfer_points` — נקודת העברה זמנית בין 2 עמדות

נקודת העברה **ad-hoc** שבקר יוצר בזמן אמת מול עמדה אחרת (תפריט "יצירה", לא מסך ניהול).
דו-כיוונית. גרירת פ"מ אליה = העברה station-to-station לעמדה השנייה.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `name` | VARCHAR(100) | שם הנקודה |
| `preset_a` | INT → presets | העמדה היוצרת |
| `preset_b` | INT → presets | העמדה השנייה (המאשרת) |
| `notes` | TEXT | הערות לנקודת המעבר |
| `status` | VARCHAR(12) | `pending` (ממתינה לאישור B) → `active` (אחרי אישור) |
| `created_by` | VARCHAR(100) | איש הצוות שיצר |
| `created_at` / `approved_at` | TIMESTAMPTZ | חותמות |
| **`last_used_at`** | TIMESTAMPTZ | **מתעדכן בכל העברה דרכה. בסיס לניקוי האוטומטי.** |
| `pos_a_x/y`, `pos_b_x/y` | REAL | מיקום פר-עמדה על המפה (גרירה); NULL = פאנל בלבד |

**ניקוי אוטומטי:** נמחקת אם `last_used_at` > 12 שעות **וגם** עבר חצות מאז (רץ תקופתית, כמו `cleanupExpiredStrips`).

---

## טבלת `preset_view_stations` — תצוגת עמדות אחרות בעמדה

אילו עמדות מוצגות בסרגל התצוגה שבתחתית העמדה, ובאיזה סדר. נקבע במסך הניהול,
בטופס עריכת העמדה (סקשן "עמדות לצפייה").

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `preset_id` | INT → `workstation_presets` (CASCADE) | העמדה **הצופה** |
| `target_preset_id` | INT → `workstation_presets` (CASCADE) | העמדה **הנצפית** |
| `label` | VARCHAR(100) | שם תצוגה על הריבוע; ריק = שם העמדה הנצפית |
| `sort_order` | INT | סדר הריבועים (נקבע בגרירה) |
| | UNIQUE | `(preset_id, target_preset_id)` — אותה עמדה לא נצפית פעמיים |

> **ההרשאה אינה נשמרת בטבלה הזו.** מי שרשאי להיכנס לעמדה במיראז' רשאי לצפות
> בה: הריבוע מסונן בלקוח מול `crewMember.approved_workstations` (רשימה ריקה =
> בלי הגבלה). עמדה שאין לאיש הצוות המחובר הרשאה אליה — הריבוע שלה לא מרונדר.
> ראה `server/routes/mirage.js` ו-`src/utils/stationPeek.ts`.

---

## דסק משימה כללי (General Mission Desk)

### טבלת `mission_desks` — הגדרת דסק (admin)

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `name` | VARCHAR(100) | שם הדסק |
| `layout_json` | JSONB | עץ BSP (כמו `strip_window_layouts`): `split{direction,sizes,children}` / `leaf{service_id}` |
| `created_at` / `updated_at` | TIMESTAMPTZ | חותמות |

### טבלת `mission_desk_services` — שירות בתוך דסק

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה (זהות השירות — בסיס לשיתוף בין עמדות) |
| `desk_id` | INT → mission_desks | הדסק (ON DELETE CASCADE) |
| `service_type` | VARCHAR(12) | `buttons` (מסך ניהול אמצעים) / `freetext` (טקסט חופשי בכתב יד) / `table` (טבלה חכמה) / `image` (תמונה קבועה) / `label` (טקסט קבוע) / `map` (חלון מפה) / `strips` (חלון הפ"ממים של מפה) |
| `name` | VARCHAR(100) | שם השירות |
| `config` | JSONB | הגדרות אדמין — לפי סוג: freetext: `{ruled,lineGap,title}`; table: `{columns[],allowAddRows,initialRows,computed[],rules[],summary{}}`; image: `{dataUrl,fit}` (raster בלבד); label: `{text,font,fontSize,bold,align,color}`; strips: `{map_service_id}` (לאיזה חלון מפה שייך); map: `{}` — **המפה עצמה נבחרת פר-עמדה**, ראה `mission_desk_map_config` |
| `sort_order` | INT | סדר |

### טבלת `mission_desk_service_state` — מצב ריצה פר (שירות, עמדה)

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `service_id` | INT → mission_desk_services | השירות (CASCADE) |
| `preset_id` | INT → workstation_presets | העמדה (CASCADE) |
| `state` | JSONB | buttons: `{buttons:[{id,x,y,text,freeText,font,fontSize,bold,states:[{label,color,alertPresetIds[]}],activeStateIdx}]}`; freetext: `{strokes[]}`; table: `{rows:[{id,cells{}}]}` |
| `updated_at` | TIMESTAMPTZ | חותמת (בסיס ל-last-write-wins) |
| | UNIQUE | `(service_id, preset_id)` |

**שיתוף בין עמדות:** בכתיבת state, השרת מבצע **fan-out** — מעתיק את ה-state לכל עמדה
ברשימת `workstation_presets.mission_desk_sharing[service_id]` של העמדה הכותבת.
עמדה שהדסק שלה לא כולל את השירות — פשוט לא קוראת את הרשומה (ללא השפעה).

### עמודות חדשות ב-`workstation_presets`

| עמודה | סוג | תיאור |
|---|---|---|
| `mission_desk_id` | INT → mission_desks | הדסק של עמדה מסוג `preset_type='mission_desk'` |
| `mission_desk_sharing` | JSONB | `{ "<service_id>": [preset_id, ...] }` — לאילו עמדות מסונכרן כל שירות |
| `mission_desk_map_config` | JSONB DEFAULT `'{}'` | הגדרת **חלונות המפה** של הדסק, פר-עמדה: `{ "<map_service_id>": { map_id, transfer_points[], sector_maps_enabled, sector_map_ids[], flight_zones_mode, fz_pin_display, strips_panel } }`. המפה נקבעת כאן ולא בהגדרת הדסק, כי אותו דסק משרת עמדות שמסתכלות על מפות שונות. `map_id` הוא **חובה**: עמדה שבדסק שלה יש חלון מפה בלי מפה אינה נשמרת (`mdMissingMapServices`) |
| `parent_base_id` | INT (מזהה `aviation_bases`, **ללא FK אכיף** — ה-constraint מופל ב-`init.js` לצימוד רופף) | בסיס האב של העמדה. פותר את שם/סמל הבסיס: במיראז' (רשימת עמדות) ובתצוגת סמל הבסיס במסך הטעינה ובסרגל העליון. `NULL` = אין בסיס אב → מוצג רק סמל מיח"ה (מפקדת יחידות הבקרה). גם ציר הקיבוץ של בורר העמדה במסך הכניסה, וגם **ציר ההרשאה של ראש צוות במסך הניהול** — ראה "שיוך תוכן admin לבסיס אב" |
| `updated_at` | TIMESTAMPTZ DEFAULT NOW() | חותמת העדכון האחרון. נדרסת ב-PUT ובעדכון ספי העומס. הותקנה עם backfill מ-`created_at` לעמדות ותיקות, כדי שלא ייפלו לסוף רשימת "האחרון שעודכן/נוצר" בבורר העמדה |
| `sector_maps_enabled` | BOOLEAN DEFAULT false | האם להציג את רשימת הסקטורים בפינת **מפה 1** בעמדה |
| `sector_map_ids` | JSONB DEFAULT `[]` | מזהי מפות-הסקטור שיוצגו על מפה 1. הסדר במערך = סדר הרשימה על המפה. תקפים רק מזהים שה-`parent_map_id` שלהם הוא `map_id` |
| `map2_sector_maps_enabled` | BOOLEAN DEFAULT false | כנ"ל עבור **מפה 2** — הגדרה נפרדת לחלוטין |
| `map2_sector_map_ids` | JSONB DEFAULT `[]` | מזהי מפות-הסקטור שיוצגו על מפה 2 (`parent_map_id` = `map2_id`) |
| `air_picture_enabled` | BOOLEAN DEFAULT false | **תמונ"א על הדסק** — האם העמדה מציגה את התמונה האווירית מעל המפה. דורש מפה **מעוגנת**; מסך הניהול חוסם שמירה כשאין אף מפה מעוגנת (ראה [AIR_PICTURE_SPEC.md](AIR_PICTURE_SPEC.md) §7.4) |
| `air_picture_defaults` | JSONB DEFAULT `{}` | ברירות המחדל של העמדה לתמונ"א: `{on,scale,opacity,labels,classes[],altMin,altMax,resp}`. הפקח דורס אותן ב-`sessionStorage` בלי לשנות את העמדה — אותה תבנית של `data_windows` |
| `zone_watch_settings` | JSONB DEFAULT `{}` | **הגדרות זיהוי חריגה מאזור** (AIR_PICTURE_SPEC.md §8.5): `{alerts, whenPictureOff}`. שק אחד ולא עמודה למתג — ה-INSERT/UPDATE של הטבלה הם רשימות פוזיציוניות בנות 66 פרמטרים, וכל מתג נוסף שם הוא הזדמנות לשגיאת היסט שקטה. **מפתח חסר נקרא כברירת מחדל בקוד** (`alerts` דולק, `whenPictureOff` כבוי), ולכן עמדה ותיקה מתנהגת בדיוק כפי שהתנהגה |
| `data_windows` | JSONB DEFAULT `[]` | **חלונות נתונים** — מונים מוגדרי-שאילתא הצפים מעל מפת השדה. `[{id,title,query,mode,x,y,color,hidden}]` באותו DSL של `QueryBuilder`. זו **ברירת המחדל של העמדה**; הפקח מזיז/מכבה/עורך בסשן שלו (sessionStorage) בלי לשנות אותה |
| `show_data_windows` | BOOLEAN DEFAULT false | האם חלונות הנתונים ("הצג כמות מטוסים") פעילים בעמדה כברירת מחדל. הפקח מדליק/מכבה בסרגל העליון לסשן שלו בלבד |
| `show_window_container` | BOOLEAN DEFAULT false | **קונטיינר החלונות** — האם הוא **פתוח בעליית העמדה**. היכולת עצמה קיימת בכל עמדה — המתג בתפריט "תצוגה" אינו תלוי בעמודה הזו. סידור החלונות ב-`localStorage` פר-עמדה (לא ב-DB) |
| `window_container_position` | VARCHAR(20) DEFAULT `'beforeAids'` | **מיקום ברירת המחדל** של הקונטיינר: `left` / `mapRight` / `beforeAids` / `right`. חל כל עוד הפקח לא בחר מיקום בעצמו; בחירתו (localStorage) גוברת |

---

## תמונ"א — `air_picture_config`

**טבלה גלובלית, שורה אחת.** מחזיקה **רק הגדרה**: לאן לפנות, באיזה קצב, והאם דלוק.

> **אין טבלת מטוסים, וזה מכוון.** התמונ"א היא **המטוס הפיזי בשמיים** ואילו הפ"מ
> הוא הרישום שלו — שתי שכבות מידע נפרדות. המטוסים זורמים מהמאגר החיצוני ישירות
> לעמדה ואינם נשמרים לעולם: כתיבה שלהם ל-DB הייתה 300 `UPDATE` כל 2 שניות.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | סינגלטון — תמיד שורה אחת |
| `base_url` | TEXT | כתובת מאגר התמונ"א |
| `auth_token` | TEXT | אסימון המאגר. **לעולם לא נשלח ל-renderer** — `GET /api/air-picture/config` מחזיר רק `enabled`/`pollMs` |
| `poll_ms` | INTEGER DEFAULT 2000 | קצב הדגימה בעמדה |
| `enabled` | BOOLEAN DEFAULT false | מתג ראשי |
| `updated_at` | TIMESTAMPTZ DEFAULT NOW() | חותמת |

**למה גלובלית ולא פר-סביבה** (החלטת הצוות, 2026-08-07): בשלב זה יש **מאגר תמונ"א
אחד** שכל העמדות בכל הסביבות קוראות ממנו. הטבלה רשומה ב-`IGNORED_EXACT` של
[`server/db/env-tables.js`](server/db/env-tables.js) — כמו `gapi_env_config` —
ולכן אינה משוכפלת לסכמות התרגול. הפרדה עתידית = הוצאת שורה אחת מהרשימה.

**הרשאות:** `PUT /api/air-picture/config` הוא **ADMIN בלבד** (מפנה את התמונ"א
התפעולית למאגר אחר ומחזיק את הטוקן), ו-`GET /api/air-picture/admin-config`
הוא STAFF. הקריאה התפעולית (`/config`, `/live`) פתוחה לכל מזוהה.

---

## חברי העמדה — `workstation_session_roles`

שורה אחת לכל עמדה (UNIQUE על `preset_id`). נכתבת מטופס "כניסה לעמדה" (עליית עמדה)
ומ"עדכון חברי העמדה" (תפריט המשתמש) — אותו רכיב, `StationCrewForm`.

השורה מתארת את ההרכב **שיושב בעמדה עכשיו**, ולכן היא נקראת רק ב"עדכון חברי העמדה"
ובתחקיר. בעליית עמדה הטופס נפתח **נקי** (רק הבקר/פקח שנכנס) וה-`PUT` שבאישור דורס
את השורה כולה — אחרת אנשי המשמרת הקודמת היו נגררים להרכב החדש בשקט.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `preset_id` | INT → workstation_presets (UNIQUE, CASCADE) | העמדה |
| `bakar` | VARCHAR(200) | **בקר** (יב"א) / **פקח** (מגדל) — אותו תא, התווית לפי `preset_role` |
| `achori` | VARCHAR(200) | אחורי |
| `mushgach` | VARCHAR(200) | המושגח של הבקר/פקח |
| `mefale` | VARCHAR(200) | מפעיל (לא בעמדת מגדל) |
| `mefale_mushgach` | VARCHAR(200) | המושגח של המפעיל |
| `mashak` | VARCHAR(200) | מש"ק (לא בעמדת מגדל) |
| `mashak_mushgach` | VARCHAR(200) | המושגח של המש"ק |
| `kshp` | VARCHAR(200) | קש"פ — **מספר קשר פנים**, לא שם |
| `has_mushgach` | BOOLEAN | דגל "קיים משגיח" לבקר/פקח |
| `has_mefale_mushgach` | BOOLEAN | דגל "קיים משגיח" למפעיל |
| `has_mashak_mushgach` | BOOLEAN | דגל "קיים משגיח" למש"ק |
| `updated_at` | TIMESTAMP | חותמת עדכון |

**למה דגל נפרד מהשם:** "קיים משגיח" חייב להישאר מסומן גם לפני שהוקלד שם, אחרת
הדגל היה נופל בכל רענון. בשמירה, דגל כבוי **מנקה** את השם — כך "אין משגיח" הוא
מצב אחד ולא שניים.

**סדר התצוגה בטופס:** בקר · אחורי · [מושגח] · מפעיל · [מפעיל מושגח] · מש"ק ·
[מש"ק מושגח] · קש"פ. בעמדת מגדל: פקח · אחורי · [מושגח] · קש"פ. שדות המושגח
נפתחים **בצד** שורת האב רק אחרי סימון הדגל, כדי שהטופס בפתיחה ראשונה יישאר קצר.

---

## טבלת `debriefs` — תחקירים

נפתחת מתפריט העמדה ("צור תחקיר"). התחקיר שומר **snapshot** של המצב ולא הפניות:
העמדה והצוות משתנים, והתחקיר חייב להישאר קריא כפי שנרשם.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `preset_id` | INT → workstation_presets (SET NULL) | העמדה שבה נפתח התחקיר |
| `preset_name` | VARCHAR(200) | שם העמדה בזמן הרישום (נשמר כטקסט — העמדה עלולה להימחק) |
| `crew` | JSONB | חברי העמדה כפי שהיו: כל שדות `workstation_session_roles` |
| `essence` | TEXT | מהות תחקיר |
| `severity` | VARCHAR(40) | סיווג: `critical` / `severe` / `accident` / `near_miss` / `medium` / `light` — **קוד**, לא טקסט מתורגם |
| `details` | TEXT | פירוט תחקיר |
| `involved` | JSONB | מעורבים: `[{type, value}]`, כש-`type` ∈ `squadron` / `callsign` / `formation_no` / `yaba` / `tower` / `base` / `other` |
| `responsibility` | TEXT | פירוט אחריות |
| `screenshot` | TEXT | dataURL (PNG) של מסך העמדה, מצולם **לפני** פתיחת הטופס |
| `event_time` | TIMESTAMPTZ | זמן האירוע (ניתן לעריכה; ברירת מחדל = עכשיו) |
| `created_by` | VARCHAR(200) | מי רשם |
| `created_at` | TIMESTAMPTZ | מתי נרשם |

**אינדקסים:** `idx_debriefs_preset` (preset_id), `idx_debriefs_created` (created_at DESC).

**למה `severity` הוא קוד:** התוויות חיות ב-`src/i18n/registry/crew.json` וניתנות
לעריכה בזמן ריצה ממסך ניהול התרגומים. אילו נשמר הטקסט, שינוי תווית היה מנתק
תחקירים ישנים מהסיווג שלהם.

**נפח:** `GET /api/debriefs` (רשימה) **אינו** מחזיר את `screenshot` אלא
`has_screenshot` בלבד — dataURL של מסך מלא הוא עשרות KB לשורה.

---

## טבלת `suggestions` — הערות והצעות מהשטח

נשלחת מחלון "אודות" (סמל המערכת) בכל עמדה, ומוצגת למנהל המערכת הטכני בטאב
"הערות והצעות" במסך הניהול.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `full_name` | VARCHAR(100) NOT NULL | שם מלא של המציע (ממולא מראש משם המפעיל המחובר, ניתן לשינוי) |
| `phone` | VARCHAR(40) | טלפון ליצירת קשר |
| `unit` | VARCHAR(100) | היחידה של המציע — טקסט חופשי, **לא** מפתח ל-`units` (המציע אינו בהכרח מיחידה רשומה) |
| `subject` | VARCHAR(200) NOT NULL | נושא ההצעה |
| `details` | TEXT NOT NULL | פירוט (עד 5,000 תווים, נחתך בשרת) |
| `preset_id` | INT → workstation_presets (SET NULL) | העמדה ששלחה |
| `preset_name` | VARCHAR(100) | שם העמדה כטקסט — נשמר גם אם העמדה תימחק |
| `status` | VARCHAR(16) NOT NULL | `new` (ברירת מחדל) / `in_review` / `done` / `rejected` — **קוד**, התווית מתורגמת |
| `admin_note` | TEXT | הערת מנהל המערכת (מה נעשה עם ההצעה) |
| `created_at` | TIMESTAMPTZ | **נקבע בשרת** (`DEFAULT NOW()`) — הלקוח אינו שולח זמן, כדי שהרישום לא יהיה תלוי בשעון התחנה |
| `updated_at` | TIMESTAMPTZ | עדכון אחרון (מתעדכן ב-PATCH) |

**אינדקסים:** `idx_suggestions_created` (created_at DESC) — הרשימה תמיד מוצגת מהחדשה לישנה.

**סיווג סביבות:** **קונפיג** (`server/db/env-tables.js`) — יושבת ב-`public` בלבד
ומשותפת לכל הסביבות. הצעה שנשלחה מתוך סביבת תרגול היא משוב על המערכת, לא מידע
שדה: היא חייבת להגיע לאותה רשימה של מנהל המערכת ולא להימחק עם שחרור הסביבה.

**מה לא ניתן לעריכה:** ה-API מאפשר לעדכן `status` ו-`admin_note` בלבד. תוכן ההצעה
(שם, נושא, פירוט) נשמר כפי שנשלח — זו עדות של המפעיל.

---

## טבלת `station_sessions` — משמרות עמדה (זמני כניסה/יציאה)

נרשמות **תמיד**, בלי קשר לתחקיר. זה מקור הנתונים למסך הכשירויות.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `preset_id` | INT → workstation_presets (SET NULL) | העמדה |
| `preset_name` | VARCHAR(200) | שם העמדה בזמן הרישום (טקסט — העמדה עלולה להימחק) |
| `crew_member_id` | INT (**ללא FK**) | מזהה איש הצוות; משתמש מיראז' עשוי לא להיות ב-`crew_members` |
| `crew_name` | VARCHAR(200) | שם איש הצוות שישב על העמדה במקטע |
| `personal_id` | VARCHAR(50) | מספר אישי |
| `roles` | JSONB | חברי העמדה בתחילת המקטע |
| `entered_at` | TIMESTAMPTZ | זמן כניסה |
| `exited_at` | TIMESTAMPTZ | זמן סיום; `NULL` = עדיין בעמדה |
| `end_reason` | VARCHAR(30) | `logout` / `crew_swap` / `crew_update` / `reopen` |

**מקטע פתוח יחיד לעמדה:** `idx_station_sessions_open` הוא UNIQUE חלקי
(`WHERE exited_at IS NULL`) — רענון לשונית או כניסה כפולה לא מייצרים כפילות.

**`last_seen` — הדופק, ולמה הוא הכרחי:** מקטע פתוח **אינו** אומר שיושב שם אדם.
הוא נסגר רק ביציאה מפורשת, ומי שסגר לשונית או כיבה מסך נשאר "מחובר" לנצח —
בפרודקשן נמצאו מקטעים פתוחים בני **11 יום**. לכן העמדה מרעננת את `last_seen`
כל דקה (`PATCH /api/station-sessions/heartbeat`), ומי ששואל "האם העמדה מאוישת"
מכריע ב**טריות** ולא בקיום השורה:

```sql
COALESCE(last_seen, entered_at) > NOW() - INTERVAL '240 seconds'
```

החלון נדיב פי ארבעה מקצב הדופק, כי מנוע ה-polling משהה כשהלשונית מוסתרת.
הנפילה ל-`entered_at` נותנת חסד למקטע שנפתח לפני הדופק הראשון. הצרכן הראשון:
רשימת ההפצה של **הלאמת אזור זמני** ([TEMP_ZONE_SEIZURE_SPEC.md](TEMP_ZONE_SEIZURE_SPEC.md) §3.10).

**למה מקטעים ולא משמרת אחת:** המקטע נסגר בכל אירוע שמשנה מי יושב על העמדה
(החלפת משתמש, עדכון חברי העמדה, יציאה) ונפתח מיד חדש — למעט יציאה. אחרת כל
שעות המשמרת היו נזקפות למי שישב בסוף.

**חישוב שעות בשרת:** `GET /api/station-sessions` מחזיר `hours` מחושב
(`COALESCE(exited_at, NOW()) - entered_at`) ו-`open`, כדי שכל הצרכנים יראו
את אותו מספר.

---

## טבלת `units` — יחידות מבצעיות

רשימת ערכים ל"מעורבים בתחקיר". **קונפיג** (ב-`public` בלבד), לא מידע שדה.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `name` | VARCHAR(200) | שם היחידה |
| `kind` | VARCHAR(20) | `yaba` / `tower` / `base` / `squadron` / `other` (זהה לקודי `type` ב-`debriefs.involved`) |
| `active` | BOOLEAN | יחידה לא פעילה נשמרת בהיסטוריה ולא מוצעת בטופס |
| `sort_order` | INTEGER | סדר תצוגה |
| `created_at` | TIMESTAMPTZ | מתי נוצרה |
| | UNIQUE | `(name, kind)` |

**למה נפרדת מ-`workstation_presets`:** עמדה היא תצורת תצוגה במערכת, יחידה היא
גוף בשטח. יש יחידות בלי עמדה במערכת, ועמדה אחת יכולה לשרת כמה יחידות — גזירת
הרשימה מהעמדות הייתה גם חסרה וגם מציגה שמות טכניים למי שכותב תחקיר.
מנוהלת במסך הניהול, לשונית **"יחידות"**.

---

## טבלת `mirage_users` — משתמשי המיראז' (סימולטור ההזדהות)

> נוצרת ומנוהלת ע"י אפליקציית המיראז' (`mirage/store.js`), לא ע"י `initDb` של SKY-KING.
> בפרודקשן (יש `DATABASE_URL`) המיראז' עובד מולה; בפיתוח/בדיקות — מול `mirage/data.json`.
> בהפעלה ראשונה מול טבלה ריקה מתבצע ייבוא חד-פעמי מ-data.json.

| עמודה | סוג | תיאור |
|---|---|---|
| `personal_number` | VARCHAR(20) PK | מספר אישי |
| `first_name` / `last_name` | VARCHAR(100) | שם |
| `apps` | JSONB | `{ "SKY-KING": { roles:[admin/team_lead/user], workstations:[{id,name}] } }` |
| `created_at` / `updated_at` | TIMESTAMPTZ | חותמות |

---

## אזורי מפה (Flight Zones) — `map_zones` ומשפחתה

עמדת CTRL ("מצב אזורים") מציבה פ"מים על אזורים מצוירים על המפה. אזור = פוליגון; לכל אזור
אפשר כמה **גבהים** בעלי שם (בלוקים), ולכל פ"מ מוצב מוקצה בלוק.

### טבלת `map_zones` — אזור על המפה

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `map_id` | INT → maps | המפה (ON DELETE CASCADE) |
| `name` | VARCHAR(100) | שם האזור |
| `color` | VARCHAR(20) | צבע (ברירת מחדל `#3b82f6`) |
| `polygon` | TEXT (JSON) | קודקודים באחוזי-תמונה `[{x,y}]` |
| `polygon_geo` | TEXT (JSON) | קודקודים גאוגרפיים `[{lat,lon}]` (חלופה ל-polygon) |
| `parent_zone_id` | INT → map_zones | אזור-אב (סנכרון לתת-מפות) |
| `enabled` | BOOLEAN | האם מוצג |
| **`active_alt_range_ids`** | JSONB | **מצב תפעולי — הבלוקים (גבהים) הפעילים/מותרים כרגע. `[]`/NULL = כל הגבהים פעילים. נקבע בקליק ימני בעמדה, משותף בין העמדות.** |
| **`limitation_note`** | TEXT | **מצב תפעולי — מגבלת אזור חופשית, מוצגת בקטן ליד שם האזור. נקבע בקליק ימני בעמדה.** |
| `created_at` | TIMESTAMP | חותמת |

> **אין כאן `restriction`.** מצב האזור (סגור/מוגבל) נולד ישר בטבלה התפעולית
> `map_zone_operational_state` ולא כעמודה כאן, בדיוק כדי לא לחזור על התקלה
> שהשניים שמעל מתעדים.


### טבלת `map_zone_operational_state` — מצב תפעולי חי של אזור

**טבלה תפעולית** (מבודדת פר-סביבת תרגול), בעוד `map_zones` עצמה היא קונפיגורציה.

| עמודה | סוג | תיאור |
|---|---|---|
| `zone_id` | INT PK → map_zones (CASCADE) | האזור |
| `active_alt_range_ids` | JSONB | הבלוקים (גבהים) הפעילים/מותרים כרגע. `[]` = כל הגבהים פעילים |
| `limitation_note` | TEXT | מגבלת אזור חופשית, מוצגת בקטן ליד שם האזור |
| **`restriction`** | VARCHAR(20) NOT NULL DEFAULT `''` | **מצב האזור: `''` פתוח · `'restricted'` מוגבל · `'closed'` סגור.** נקבע בלחיצה על **קו** האזור |
| **`restriction_range_ids`** | JSONB | **הבלוקים שההגבלה חלה עליהם (`zone_altitude_ranges.id`). המנגנון של אזור **מפוצל** - בחירה מרובה בתפריט. ריק = מכריע הטווח המספרי** |
| **`restriction_alt_min`** | INTEGER | **טווח חופשי ברום טיסה, לאזור **לא מפוצל** שאין לו בלוקים לסמן** |
| **`restriction_alt_max`** | INTEGER | **הגבול העליון. הכול ריק (בלוקים + טווח) = ההגבלה חלה על **כל** הגבהים (סגירה גורפת)** |
| `updated_at` | TIMESTAMPTZ | חותמת |

> **אזור סגור / אזור מוגבל.** סגירה היא כמעט תמיד סגירה של **מרחב גובה** ולא של
> עמוד האוויר כולו ("סגור מ-100 עד 140"), ולכן לה טווח משלה - וטווח ריק הוא
> הסגירה הגורפת. מכאן שאותו אזור סגור לפ"מ ב-120 ופתוח לפ"מ ב-200, ואזור
> **מפוצל** לבלוקי גובה יכול להיות סגור בבלוק אחד ופתוח באחר.
>
> | מצב | שיוך פ"מ | התראה (**חלון קופץ**) | `activity_log` |
> |---|---|---|---|
> | `closed` | **נחסם** | "האזור סגור - השיוך נדחה" | `zone_closed_blocked` |
> | `closed`, והאזור נסגר **מתחת** לפ"מ שכבר בו | נשאר | "אויש אזור סגור" (חלון אחד לכל הפ"מים) | `zone_closed_manned` |
> | `restricted` | מותר | "שים לב - גררת לאזור מוגבל", עם ה**גבהים הפתוחים** והערת המגבלה | `zone_restricted_manned` |
>
> **ההכרעה היא ברמת הרצועה.** במפה המפוצלת לגבהים, הרצועה שעליה שוחרר הפ"מ היא
> מה שנשאל - ולא האזור כולו: רצועה סגורה חוסמת, ורצועה פתוחה **באותו אזור**
> ממשיכה לקבל. ראה `bandRestrictionKind`.
>
> ההבדל בין השניים הוא **מי מכריע**: באזור סגור המערכת מכריעה שלא, ובאזור מוגבל
> היא מוסרת את ההכרעה לפקח ומוודאת שהוא יודע.
>
> ההכרעה עצמה יושבת ב-[`src/utils/zoneRestriction.ts`](src/utils/zoneRestriction.ts)
> (טהורה, 40 בדיקות): הבלוק שהפ"מ הוקצה לו גובר על הגובה הרשום בפ"מ, וכשאין
> לא בלוק ולא גובה - **ההגבלה חלה** (ברירת המחדל הבטוחה: התראה מיותרת היא רעש,
> התראה שלא נשמעה היא פ"מ באזור סגור).
>
> ⚠️ **המצב וההיקף נכתבים בנפרד, והשרת הוא בעל המצב.** "היקף" = הבלוקים
> (`restriction_range_ids`) ו/או הטווח המספרי; שליחת אחד מהם מאפסת את השני, כי
> הם שני ניסוחים של אותה שאלה. `PATCH /operational` עם `restriction` בלבד שומר
> את ההיקף; עם היקף בלבד שומר את המצב (ואזור פתוח הופך ל-`restriction_if_open`,
> ברירת מחדל `restricted`); עם `restriction: ''` פותח ומנקה את ההיקף. הלקוח
> **אינו** מצרף את המצב הנוכחי לכתיבת היקף - אחרת state ישן בו היה מוריד אזור
> סגור ל"מוגבל", וזה קרה בפועל (ראה REFACTOR_LOG).
>
> **ההגבלה נמשכת בפולינג** מ-`GET /api/map-zones/operational?map_id=` (כל
> 5 שניות) - `map_zones` עצמה נטענת פעם אחת בלבד, ובלי הנתיב הקל הזה סגירה
> שנקבעה בעמדה אחת לא הייתה מגיעה לשאר עד רענון ידני.

> **למה הטבלה הזו קיימת:** שני השדות ישבו כעמודות על `map_zones`, שהיא
> **קונפיגורציה** ויושבת ב-`public` בלבד. הם נקבעים **חי בעמדה** (קליק ימני),
> ולכן עמדה בסביבת **תרגול** שהגבילה גובה שינתה את האזור **האמיתי**. הסיווג
> ב-`env-tables.js` הוא ברמת טבלה ולא ברמת עמודה, ולכן הזליגה חמקה ממנו.
> אותה תבנית כמו `blocks` (תפעולי) מול `block_spaces`/`block_tables` (קונפיג).
>
> העמודות הישנות ב-`map_zones` נשארו **deprecated לקריאה בלבד** (גיבוי הנתונים
> ההיסטוריים); `initDb` מעביר מהן את המצב הקיים פעם אחת, ואין כותב אליהן.
> `GET /api/map-zones` משרג את השדות חזרה לתוך האזור, ולכן חוזה ה-API לא השתנה.
> נשמר ע"י [env-isolation.integration.test.js](server/db/env-isolation.integration.test.js).

### טבלת `zone_altitude_ranges` — גובה (בלוק) בעל שם באזור

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `zone_id` | INT → map_zones | האזור (CASCADE) |
| `name` | VARCHAR(100) | שם הגובה (למשל "גבוה"/"נמוך") |
| `alt_min`, `alt_max` | INTEGER | טווח הגובה ב**רום טיסה** (מאות רגל): `140` = FL140 = 14,000 רגל. כך בכל 96 השורות בפועל ("נמוך" 100-140, "גבוה" 150-400), וכך גם `strips.alt` (`FL235`/`090`/`310`). **התמונ"א היא החריג היחיד** - היא מגיעה מהמאגר ברגל, ולכן כל השוואה בינה לבין בלוק חייבת לעבור ב-`blockAltFeet` (`src/airPicture/zoneWatch.ts`) |
| `sort_order` | INT | סדר תצוגה (עליון→תחתון) |

> **הבלוקים עוברים בירושה לתת-מפות.** אזור בתת-מפה מצביע על אזור-האב ב-`parent_zone_id`,
> ו-[`server/utils/zoneAltInherit.js`](server/utils/zoneAltInherit.js) מחיל את בלוקי האב
> על כל צאצאיו (לכל עומק). שני מצבים: **מראה** (`mirror`) בעריכת בלוק על האב - כולל
> מחיקה; **מילוי** (`fill`) בסנכרון שם/צבע/פוליגון וביצירת אזור-ילד - ילד שכבר יש לו
> בלוקים משלו לא נדרס. ההתאמה **לפי שם הבלוק** והשורה מתעדכנת במקומה, כדי ש-
> `strip_zone_assignments.altitude_range_id` (ON DELETE SET NULL) לא יתאפס ופ"מ מוצב
> לא ייפול מהבלוק שלו.

### טבלת `strip_zone_assignments` — הצבת פ"מ על אזור (הפ"מ המפה)

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `strip_id` | INT → strips | הפ"מ (CASCADE, UNIQUE — הצבה אחת לפ"מ) |
| `zone_id` | INT → map_zones | האזור (nullable — פ"מ מחוץ לאזור) |
| `altitude_range_id` | INT → zone_altitude_ranges | הבלוק/גובה שהפ"מ נמצא בו (ON DELETE SET NULL); שווה לראשון מבין `altitude_range_ids` |
| `altitude_range_ids` | JSONB | **בלוקי הגובה הרלוונטיים לפ"מ (בחירה מרובה)**; נבחרים בטופס בהצבה לאזור מרובה-בלוקים |
| `status` | VARCHAR(50) | בדרך לאזור / באזור / עוזב אזור |
| `note`, `coordination_note`, `is_coordinated` | — | הערות ותיאום קונפליקט |
| `pos_x`, `pos_y` | FLOAT | מיקום עוגן על המפה |
| `requested_zone_ids` | JSONB | אזורים מבוקשים נוספים |
| `map_id` | INT | מפה (לפ"מ ללא אזור) |
| `preset_id` | INT → workstation_presets (SET NULL) | **העמדה שחיברה את הפ"מ לאזור.** מרכיב של "נמצא בעמדה" (ראה §`at_preset_names`). עדכון שמגיע בלי הערך משמר את הקיים (`COALESCE`), כדי שעריכת הערה לא תמחק את המחזיק |

> **חריגה מבלוק:** פ"מ נחשב חורג אם גובהו (`strips.alt`) אינו נופל באף `zone_altitude_ranges`
> של האזור, **או** אם ה-`altitude_range_id` שלו אינו ב-`map_zones.active_alt_range_ids` (מוגבל).

> **`status` נכתב גם אוטומטית.** כשתמונ"א דולקת במוד אזורים, מנוע הזיהוי
> ([src/airPicture/zoneWatch.ts](src/airPicture/zoneWatch.ts)) מעדכן את השדה לפי מיקומו
> של **הרכיב האווירי** בפועל: `בדרך לאזור` → `באזור` → `עוזב אזור` (חריגת בלוק גובה
> נכתבת גם היא כ`עוזב אזור` - "כאילו חרג מהאזור"). הכתיבה עוברת ב-
> `PATCH /api/strip-zone-assignments/:strip_id/status` (שדה אחד, בלי upsert) ומבוצעת
> **רק ע"י העמדה שב-`preset_id`** - אחרת כל עמדה שרואה את האזור הייתה שולחת את אותה
> כתיבה. בלי תמונ"א הערך נשאר מה שהבקר קבע ידנית בתפריט ה-⋮.

---

## נקודות העברה קבועות על המפה — `map_transfer_points`

עד להוספת הטבלה, נקודת ההעברה נגררה למפה **ידנית בכל משמרת** ולא נשמרה בשום מקום
(`neighborPins`/`neighborMarkers` היו state בלבד ב-SectorDashboard). כאן היא מוגדרת פעם
אחת ב"ניהול עמדה" (עורך המפה) ונטענת אוטומטית בכל כניסה לעמדה.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `map_id` | INT → maps | המפה (CASCADE) |
| `preset_id` | INT → workstation_presets | **NULL = ברירת מחדל למפה** (חלה על כל עמדה שמשתמשת בה); מלא = דריסה של עמדה מסוימת (CASCADE) |
| `sector_id` | INT → sectors | נקודת ההעברה (סקטור) (CASCADE) |
| `sub_label` | VARCHAR(50) | NULL = הנקודה השלמה; אחרת תת-נקודה (`sub_sectors.label`) |
| `x_pct`, `y_pct` | FLOAT | מיקום באחוזי **תמונת המפה** (0-100) — יציב לשינוי גודל מסך |
| `lat`, `lon` | DOUBLE PRECISION | נ"צ, נגזר מעוגני המפה כשהיא מכוילת. העוגן המועדף בזמן ריצה |
| `display_mode` | VARCHAR(10) | `arrow` (חץ) / `full` (פאנל מלא) |
| `created_at` | TIMESTAMPTZ | חותמת |

**אינדקסים:** `uq_map_transfer_points` ייחודי על `(map_id, COALESCE(preset_id,0), sector_id, COALESCE(sub_label,''))`
— מאפשר UPSERT אמיתי; ועוד אינדקסים על `map_id` ו-`preset_id`.

**מיזוג (השרת):** `GET /api/map-transfer-points?map_id=&preset_id=` מחזיר את התמונה
**האפקטיבית** — ברירת המחדל של המפה, כשדריסת העמדה מחליפה את הנקודה המקבילה
(`is_override: true`). מחיקת דריסה מחזירה לברירת המחדל של המפה.

**זמן ריצה:** הנקודות נזרעות ל-pins/markers של המפה בכניסה לעמדה. הזזה או הסרה במהלך
המשמרת נשארות **זמניות** (state בלבד, לא נשמרות); כפתור ⟲ בפאנל נקודות ההעברה מחזיר
למיקום הקבוע.

---

## הקפות — `airfield_patterns` ו-`airfield_pattern_elements`

**הקפה** היא המסלול המלבני שטס מטוס סביב המסלול: אחרי המראה -> צולבת -> עם הרוח ->
בסיס -> פיינל, כשהפיינל מצביע חזרה למסלול. היא רובד נוסף על יישות שדה התעופה
בעמדת הניהול, ומשויכת ל**קצה מסלול** (`33`) ולא לזוג (`33/15`) — לכל קצה הקפה משלו,
וזה מה שמאפשר "שכפול הקפה הפוכה" שנותן את השם ההופכי (33 -> 15).

### טבלת `airfield_patterns` — הקפה

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `airfield_id` | INT → airfields | השדה (CASCADE) |
| `runway_id` | INT → airfield_runways | המסלול. **SET NULL** ולא CASCADE: מחיקת מסלול מנתקת את ההקפה, לא מוחקת את השרטוט |
| `runway_ident` | VARCHAR(10) | קצה המסלול (`33`, `09L`). ריק = הקפה משוכפלת שעוד לא שויכה |
| `color` | VARCHAR(20) | צבע השרטוט והתוויות על המפה |
| `geometry` | JSONB | פרמטרי ההקפה: `{anchor:{x,y}, bearing, side, rwyLen, upwind, width, baseExt}`. **זהו מקור האמת** |
| `points` | JSONB | שש הנקודות הנגזרות באחוזי תמונה — כדי ששכבת תצוגה תצייר בלי לחשב יחס תמונה |
| `downwind_alt_ft` | INT | גובה צלע "עם הרוח", רגל **מעל פני השדה**. NULL = לא הוגדר |
| `base_alt_ft` | INT | גובה צלע הבסיס, רגל **מעל פני השדה**. NULL = לא הוגדר |
| `sort_order` | INT | סדר בטבלה |
| `created_at` | TIMESTAMPTZ | חותמת |

**גבהי ההקפה על ההקפה ולא על השדה:** לשדה יש מסלול לכל כיוון והקפת ימין/שמאל, ולכל
אחת גובה משלה. `NULL` נופל לברירת מחדל **3000 / 1500 רגל** ב**קוד**
(`DEFAULT_ALT_PROFILE` ב-`src/utils/pattern3d.ts`) ולא ב-DDL — כך אפשר לשנות את
ברירת המחדל בלי מיגרציה, ו"לא הוגדר" נשאר מובחן מ"הוגדר במקרה לאותו ערך". הערכים
נצרכים רק בתצוגת **ההקפה התלת מימדית**; המבט מלמעלה שטוח ואינו יודע עליהם.
ה-`PUT` מעדכן אותם **רק כשהם נשלחו** (`CASE WHEN ... THEN ... ELSE <עמודה>`), אחרת
שמירה ממסך שאינו מכיר אותם הייתה מאפסת את ההגדרה בשקט.

**למה פרמטרים ולא רשימת נקודות חופשית:** הקפה היא צורה מוגדרת — חמש צלעות בזוויות
ישרות סביב ציר המסלול. שש נקודות חופשיות היו נשברות בגרירת פינה אחת, ו"שכפול הפוך"
היה צריך לנחש איזו נקודה היא הסף. עם המודל הפרמטרי, גרירת פינה מאריכה רק את הצלעות
הצמודות, סיבוב הוא שינוי מספר אחד, והשיקוף הוא: עוגן -> הקצה השני, כיוון +180°, צד
מתחלף. הלוגיקה כולה ב-`src/utils/trafficPattern.ts` (52 בדיקות) — גם השרת מסתמך עליה
ואינו מחשב גאומטריה בעצמו.

**⚠ יחידות:** האורכים ב-`geometry` הם ב**אחוז מגובה** תמונת המפה, לא אחוז מרוחבה.
שכבת ה-SVG היא `preserveAspectRatio="none"`, ומלבן אמיתי על הקרקע הוא מלבן בפיקסלים —
לכן החישוב עובר למרחב איזוטרופי (`x_iso = x_pct * aspect`) וכל פונקציה מקבלת `aspect`.

### `airfields.elev_ft` — גובה פני השדה (רגל)

| עמודה | סוג | תיאור |
|---|---|---|
| `elev_ft` | INT | גובה פני השדה ברגל. NULL = לא הוגדר → 0 |

נדרש בגלל ש**שתי מערכות גבהים** נפגשות באותה תצוגה: בלוקי נקודת ההצטרפות הם גובה
**מוחלט** (`alt_min_ft`/`alt_max_ft`, מוצג `040`), וגבהי ההקפה הם **מעל פני השדה**.
בלי גובה השדה אי אפשר לשים את שניהם על אותו ציר, וההשוואה ביניהם בתצוגה התלת מימדית
הייתה שקרית. ההמרה: `aglOf(altFt, elevFt) = altFt - (elevFt ?? 0)`
(`src/utils/pattern3d.ts`). נערך בטופס השדה ב"ניהול שדה תעופה", מאומת `0..15000`.

### טבלת `airfield_pattern_elements` — אלמנט של הקפה

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `pattern_id` | INT → airfield_patterns | ההקפה (CASCADE) |
| `name` | VARCHAR(200) | שם האלמנט |
| `icon` | VARCHAR(200) | אמוג'י |
| `color` | VARCHAR(20) | צבע |
| `x_pct`, `y_pct` | FLOAT | מיקום באחוזי תמונת המפה. NULL = עוד לא מוקם |
| `sort_order` | INT | סדר |
| `created_at` | TIMESTAMPTZ | חותמת |

האלמנט שייך **אך ורק להקפה הספציפית** (ולכן למסלול הספציפי) — לא לשדה. לכן הוא
בטבלה נפרדת עם FK CASCADE להקפה ולא ב-`airfield_elements`, ולכן גם **שכפול הקפה אינו
מעתיק אלמנטים**: מועתק השרטוט בלבד.

> שתיהן טבלאות **קונפיגורציה** (`server/db/env-tables.js`): שרטוט הגדרה של השדה,
> כמו מסלולים ונתיבים — ב-public בלבד, משותף לכל סביבות התרגול.

---

## נקודות הצטרפות (STAR) — `airfield_joining_points` ומשפחתה

**נקודת הצטרפות** היא נקודת כניסה לשדה שבה מטוסים מצטרפים לתנועת השדה. היא
**דומה לנקודת העברה** — מקבלת פ"ממים מעמדה אחרת דרך **אותו מנגנון העברות** —
אבל **התצוגה שונה**: הנקודה נפרסת ל**טבלת בלוקי גבהים**, ופ"מ יושב בבלוק לפי
גובהו. רלוונטית רק לעמדה מסוג **שדה** (`preset_type='ground'`).

**הנקודה שייכת לשדה ולא לעמדה**, בדיוק כמו מסלולים והקפות: עמדה רואה אותה דרך
השדה שלה. זה הלקח מ**קישורי המסלולים** — הצמדת ההגדרה לעמדה אפשרה לשתי עמדות
באותו שדה לחלוק על מה שקיים בשדה. לעמדה נשארת **דריסת תצוגה** בלבד.

### טבלת `airfield_joining_points` — הנקודה

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `airfield_id` | INT → airfields | השדה (CASCADE) |
| `name` | VARCHAR(100) | שם ה-STAR / נקודת ההצטרפות |
| `alt_min_ft`, `alt_max_ft` | INT | טווח הגבהים **ברגל** (4000–10000). התצוגה במאות (`040`–`100`) |
| `default_step_ft` | INT | הפרש ברירת מחדל בין בלוקים (1000 רגל) |
| `sector_id` | INT → sectors | **נקודת המעבר המקושרת** (SET NULL). ממנה מגיעים הפ"ממים לשורה העליונה |
| `sub_label` | VARCHAR(50) | תת-נקודה (`sub_sectors.label`), NULL = הנקודה השלמה |
| `x_pct`, `y_pct` | FLOAT | הדקירה על מפת השדה באחוזי תמונה. NULL = לא ממוקמת, לא מוצגת על המפה |
| `color` | VARCHAR(20) | צבע הסמן והטבלה |
| `sort_order` | INT | סדר |
| `created_at` | TIMESTAMPTZ | חותמת |

### טבלת `joining_point_alt_steps` — הפרש גבהים לפי טווח

הפרש הגבהים **אינו קבוע** לאורך הנקודה: אפשר 1000 רגל בין 4000 ל-7000 ו-500 רגל
בין 7000 ל-10000. טווח שאינו מכוסה נופל ל-`default_step_ft`.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `joining_point_id` | INT → airfield_joining_points | הנקודה (CASCADE) |
| `from_ft`, `to_ft` | INT | הטווח ברגל |
| `step_ft` | INT | ההפרש בתוך הטווח |
| `sort_order` | INT | סדר |

> הטווחים **אינם חופפים** — חפיפה נחסמת בשמירה. בניית הבלוקים עצמה היא לוגיקה
> טהורה ב-[src/utils/joiningPoints.ts](src/utils/joiningPoints.ts) ונבדקת ב-vitest.

### טבלת `joining_point_preset_overrides` — דריסת עמדה

**תצוגה בלבד** (מיקום ומצב פרוס/מכווץ). ההגדרה עצמה נשארת אחת לשדה, כדי שלא
ייווצרו שני מקורות אמת לטווח הגבהים או לנקודה המקושרת.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `joining_point_id` | INT → airfield_joining_points | הנקודה (CASCADE) |
| `preset_id` | INT → workstation_presets | העמדה הדורסת (CASCADE) |
| `x_pct`, `y_pct` | FLOAT | מיקום חלופי |
| `display_mode` | VARCHAR(10) | `pin` (סמן מכווץ) / `full` (טבלה פרוסה) |
| `updated_at` | TIMESTAMPTZ | חותמת |

**אינדקס:** `UNIQUE(joining_point_id, preset_id)` — UPSERT אמיתי.

### טבלת `joining_point_strips` — פ"מ בנקודה (תפעולי)

> **הגובה בפועל אינו נשמר כאן.** השיבוץ לבלוק כותב ל-`strips.alt` — הגובה שכל
> המערכת כבר מציגה ומזהה לפיו קונפליקטים. הטבלה מחזיקה **שיוך, תוכנית ותיאום**.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `joining_point_id` | INT → airfield_joining_points | הנקודה (CASCADE) |
| `strip_id` | INT → strips | הפ"מ (CASCADE) |
| `planned_alt` | VARCHAR(10) | **הגובה שתוכנן בבלוק.** גובר על `strips.alt` בקביעת מיקום הפ"מ בטבלה |
| `is_coordinated` | BOOLEAN | קונפליקט **אושר כמתואם** — מסיר את האדום ומשאיר סימון תיאום |
| `coordination_note` | TEXT | הערת התיאום |
| `created_at`, `updated_at` | TIMESTAMPTZ | חותמות |

**אינדקס:** `UNIQUE(joining_point_id, strip_id)`.

> **למה `planned_alt` ולא `strips.alt` בלבד:** נקודת הצטרפות היא לעתים גם
> **נקודת העברה**, והפקח מתכנן את הפ"מ לבלוק **לפני** הקבלה — בזמן שהגובה
> ב-`strips.alt` עדיין שייך לעמדה המוסרת, וכתיבה אליו הייתה משנה לה את המידע
> מתחת לידיים. לכן זו **תוכנית** ולא מצב: השרת כותב ל-`strips.alt` רק כשהפ"מ
> כבר בעמדה שלי, בקבלה התוכנית היא שנכתבת (**"הגובה שתוכנן הוא הקובע"**), ועד
> אז פער בינה לבין הגובה שנשלח הוא **התראה** בממשק (`altMismatch`).

### טבלת `joining_point_aircraft` — מטוס בודד בהצטרפות (תפעולי)

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `joining_point_id` | INT → airfield_joining_points | הנקודה שממנה הגיע (**SET NULL**) |
| `strip_id` | INT → strips | הפ"מ (CASCADE) |
| `aircraft_idx` | INT | `strip_aircraft.idx` |
| `runway_ident` | VARCHAR(10) | קצה המסלול שנבחר לנחיתה (`33R`) |
| `pattern_id` | INT → airfield_patterns | ההקפה (SET NULL) |
| `in_pattern` | BOOLEAN | FALSE = נגרר להקפה, מסגרת מקווקוות; TRUE = **בהקפה**, מסגרת קבועה ויצא מהטבלה |
| `pattern_frac` | FLOAT | מיקום על צלע "עם הרוח" (0..1) |
| `alt` | VARCHAR(10) | **גובה חריג למטוס הבודד** - פיצול המבנה בין שני בלוקים. NULL = הולך עם הפ"מ |
| `updated_at` | TIMESTAMPTZ | חותמת |

> **פיצול מבנה בין שני גבהים** אינו מפצל את הפ"מ לשתי רשומות: המטוסים שנבחרו
> מקבלים `alt` משלהם, והפ"מ מופיע בשני הבלוקים - "בננה/1+2" בגובה אחד
> ו"בננה/3+4" באחר, בדיוק כמו על הסדק. הפ"מ נשאר פ"מ אחד לכל שאר המערכת.

**אינדקס:** `UNIQUE(strip_id, aircraft_idx)` — **המפתח הוא המטוס ולא הנקודה**:
מטוס שנכנס להקפה עוזב את טבלת נקודת ההצטרפות אבל נשאר על ההקפה, ולכן המצב חייב
לשרוד את היציאה מהנקודה. לכן גם `joining_point_id` הוא SET NULL ולא CASCADE.

### `strip_aircraft.flight_status`

`VARCHAR(20) DEFAULT 'none'` — `none` / `greens` (ירוקים) / `cleared_to_land`
(אישור לנחות) / `landed` (נחיתה). הסטטוס הוא של ה**מטוס** ולא של ההצטרפות
("זה עובר לסטטוס מטוס") ולכן יושב על `strip_aircraft` ונשאר גם אחרי שהמטוס
עזב את הנקודה.

> **סיווג סביבות:** שלוש טבלאות ההגדרה הן **קונפיג** (ב-public בלבד);
> `joining_point_strips` ו-`joining_point_aircraft` הן **תפעוליות** ומבודדות
> לכל סביבת תרגול, כמו `blocks` ו-`strip_transfers`.

---

## מצב משותף למסלולי המראה מקושרים — `runway_end_use` ו-`runway_notams.link_uid`

אותו מסלול פיזי מוגדר בשני שדות בשמות שונים, ו**קישור מסלולים** מצהיר שהם אותו
דבר. מרגע שקושרו, מצב המסלול הוא מצב **פיזי אחד**: סגור אצל אחד = סגור אצל השני,
אותן נורות, ואותו כיוון בשימוש. הגשר הוא **מסלול הראי**: מסלול המראה -> הראי שלו
ב"מסלולי הסעה" -> קבוצת הקישור -> הראי השכן -> מסלול ההמראה שלו
([server/utils/linkedRunways.js](server/utils/linkedRunways.js)).

### טבלת `runway_end_use` — איזה קצה בשימוש

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `runway_id` | INT → airfield_runways | המסלול (CASCADE) |
| `end_name` | VARCHAR(20) | שם הקצה כפי שהוא מוגדר **באותו שדה** ('15L') |
| `in_takeoff` | BOOLEAN | בשימוש להמראה |
| `in_landing` | BOOLEAN | בשימוש לנחיתה |
| `updated_at` | TIMESTAMPTZ | חותמת |

**`UNIQUE(runway_id, end_name)`**. הטבלה **תפעולית** (`env-tables.js`) — מבודדת פר
סביבת תרגול, כמו הסגירות והתאורות.

עד 05.08.2026 זה היה **מצב סשן בלקוח בלבד**: לא נשמר, לא נראה בעמדה שכנה, וממילא
לא היה מה לסנכרן. **כיוון אחד למסלול:** הפעלת קצה מכבה את הנגדי — גם בהמראה וגם
בנחיתה, גם אצלי וגם אצל המקושר (הכלל נאכף גם בלקוח, `src/utils/runwayEnds.ts`).

**מיפוי קצוות בין שדות:** לפי **המספר** ולא לפי המיקום ('15L' אצלי = '15' אצלו),
כי שדה אחד יכול להגדיר `heading_a='18'` והשני `heading_a='36'` — התאמה לפי מיקום
הייתה מפעילה את הקצה ההפוך.

### הפתרון בקריאה, ולא העתקה בכתיבה

**המימוש הראשון העתיק** את המצב לכל המסלולים המקושרים ברגע הכתיבה, ונשבר בדיוק
במקום שבו הפקח נתקל בו: **מידע שכבר היה לפני שהקישור נוצר לא זז**, וקישור חדש
לקבוצה קיימת נשאר ריק עד ש"מאפסים ומזינים מחדש". גם ביטול קישור השאיר עותקים
שאיש לא ידע שהם עותקים.

מ-05.08.2026 **אין עותקים**: השורה נשמרת היכן שנכתבה, וכל קריאה מרכיבה את מצב
הקבוצה. קישור חדש רואה מיד את המידע הקיים, וביטול קישור מפריד מיד.

| מה חוזר בקריאה | |
|---|---|
| `runway_id` | ממופה למסלול **המקומי** — הלקוח ממשיך לפתח לפיו בלי שינוי |
| `id` | של השורה **המקורית** — עריכה ומחיקה חלות על שני הצדדים |
| `heading` / `end_name` / `shorten_end` | ממופים לשמות/מיקומי הקצוות של השדה ששואל |
| `source_runway_id`, `source_airfield_name`, `is_linked` | מי כתב את זה — כדי שהפקח לא ינחש למה המסלול שלו סגור |

**כללי הכרעה בתוך הקבוצה:** NOTAM = **איחוד** (שלי ראשון) · GRF = **הדיווח האחרון**
לכל קצה · תאורות = **העדכון האחרון** · מסלולים בשימוש = **כיוון אחד למסלול**,
האחרון גובר · אמצעי נחיתה = **העדכון האחרון** לכל (קצה, אמצעי). NOTAM של קיצור
שאי אפשר למפות את קצהו **נופל** — עדיף בלי קיצור מאשר קיצור בקצה ההפוך.

**כתיבה היא תמיד מקומית** (`INSERT`/`UPDATE`/`DELETE` על המסלול שבו נכתבה), ולכן
אין מה שיתיישן. הקריאה מרוכזת ב-[server/utils/runwayState.js](server/utils/runwayState.js),
ובדיקת שומר נכשלת על `SELECT ... FROM runway_notams|runway_grf|runway_lighting|runway_end_use|runway_aid_status`
ישיר בקובץ ראוט — קריאה כזו מחזירה רק את המסלול המקומי ומפספסת בשקט את המקושר.

| עמודה | סוג | תיאור |
|---|---|---|
| `runway_notams.link_uid` | UUID, nullable | **legacy**: קישר בין העותקים במימוש הישן. אינו נכתב יותר; שימש למיגרציה שמחקה את העותקים הכפולים |

---

## אמצעי נחיתה — `airfield_runways.aids_a/aids_b` + `runway_aid_status`

ILS / LOC / GS / VOR / TACAN. **אמצעי שייך לקצה נחיתה ולא למסלול**: ה-ILS של 27
וה-ILS של 09 הם התקנות נפרדות עם סטטוס נפרד.

### הגדרה — על המסלול (קונפיג)

| עמודה | סוג | תיאור |
|---|---|---|
| `airfield_runways.aids_a` | JSONB | מערך קודים לקצה A, בסדר התצוגה (`["ILS","GS"]`) |
| `airfield_runways.aids_b` | JSONB | אותו דבר לקצה B |

נקבע בעמדת הניהול, בתוך תיבות "צד A"/"צד B" של טופס המסלול. השרת מנקה את הרשימה
(רק סוגים מוכרים, אותיות גדולות, בלי כפילויות) — ערך אחר לא נשמר.

### סטטוס — טבלה תפעולית

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `runway_id` | INT → airfield_runways | המסלול (CASCADE) |
| `end_side` | VARCHAR(1) | `'a'` / `'b'` — **מיקום** הקצה, כמו `runway_notams.shorten_end` |
| `aid_type` | VARCHAR(10) | ILS / LOC / GS / VOR / TACAN |
| `status` | VARCHAR(16) | `ok` (תקין) · `unserviceable` (לא שמיש) · `maintenance` (אחזקה) · `restricted` (תקין מוחרג) |
| `note` | TEXT | הערת ההחרגה. נשמרת **רק** ב-`restricted`, ונמחקת בכל מעבר לסטטוס אחר |
| `updated_at` | TIMESTAMPTZ | חותמת — היא שמכריעה בין מסלולים מקושרים |

**`UNIQUE(runway_id, end_side, aid_type)`**. הטבלה **תפעולית** — מבודדת פר סביבת
תרגול, והקריאה עוברת ב-`resolveAidStatus` כמו שאר מצב המסלול.

**ההגדרה קובעת מה מוצג:** אמצעי מוגדר בלי שורת סטטוס מוצג כתקין, ושורת סטטוס
לאמצעי שהוסר מההגדרה נמחקת בעדכון המסלול — כך אין "אמצעי רפאים" ואין סטטוס ישן
שקם לתחייה כשמגדירים מחדש אותו אמצעי.

**התצוגה:** על המסלול (מפת השדה ודיאגרמת הווידג'ט בעמדה), בין הזברה למספר הכיוון
ובכיוון המסלול. ירוק = תקין · אדום + X = לא שמיש · אדום בלי X = אחזקה · כתום =
תקין מוחרג, וה-HINT נושא את הערת ההחרגה
([src/utils/runwayAids.ts](src/utils/runwayAids.ts), [src/components/map/RunwayLayer.tsx](src/components/map/RunwayLayer.tsx)).

---

## מסלול המראה כמסלול הסעה — `airfield_routes.source_runway_id`

מסלול המראה מוגדר ביישות **"מסלולים"** (`airfield_runways` — כיוונים, אורך, מרחקי
הכרזה), אבל **מסלולי ההסעה** (`airfield_routes`) הם השרטוט על המפה, ואליהם נקשרים
קישורי מסלולים, התראות המראה וקונפליקטים. עד 05.08.2026 ההגדרה הכפולה הייתה ידנית:
שם או קצה שהשתנו במקום אחד נשארו ישנים בשני, בשקט.

| עמודה | סוג | תיאור |
|---|---|---|
| `source_runway_id` | INT → airfield_runways, nullable | מסלול ההמראה שממנו נגזר המסלול (**CASCADE**). `NULL` = מסלול שנוצר ידנית ב"מסלולי הסעה" |

**מסלול ראי** נוצר ומתעדכן אוטומטית מ-`airfield_runways` ([server/utils/runwayRoute.js](server/utils/runwayRoute.js)):
`name` (או הקצוות אם אין שם), `is_runway=TRUE`, `end_a_name`/`end_b_name` מהכיוונים,
`route_path` = קו בין `start_*_pct` ל-`end_*_pct`, `route_category='aircraft'`, וצבע אחיד.
`notes` נושאת את **הערת המקור** ("נוצר אוטומטית מיישות 'מסלולים'...").

**אינו ניתן לעריכה במסלולי ההסעה:** `PUT`/`DELETE /api/airfield-routes/:id` מחזירים
**409 `route_from_runway`**, והממשק מציג 🔒 במקום כפתורי הפעולה. עורכים ביישות שממנה
הגיע; מחיקת המסלול שם מוחקת גם אותו (CASCADE).

**השרטוט נדרס רק כשליישות יש קואורדינטות** — מסלול שהוגדר בלי מיקום על המפה לא ימחק
שרטוט שכבר צויר ידנית.

**הגירה (רצה בעליית השרת):** לכל מסלול המראה קיים שאין לו ראי, `syncAllRunwayRoutes`
**מאמצת** מסלול הסעה מתאים (אותו שם, או אותם **שני** הקצוות) במקום ליצור כפילות,
ויוצרת רק כשאין. אידמפוטנטית. **בשכפול שדה** ה-`source_runway_id` מוסב למסלול ההמראה
של העותק — אחרת מחיקה בשדה המקורי הייתה מוחקת מסלול בעותק.

---

## קישורי מסלולים בין שדות תעופה — `route_link_groups` ו-`route_link_members`

אותו מסלול פיזי מוגדר בכמה שדות ב**שמות שונים**. קישור מצהיר שהם אותו דבר, כדי
שהתראות (למשל המראה פעילה) יחצו שדות — וממילא גם את העמדות שרואות אותם.

**המודל הקודם, `route_links`, היה זוגי** (`preset_id_a/route_id_a` מול
`preset_id_b/route_id_b`): קישור בין שלושה מסלולים דרש שלושה זוגות נפרדים, כל אחד
מהם ניתן היה למחוק לבד — ונשאר קישור חלקי בלי שאיש ידע. הטבלה נשארת בסכמה כמקור
להגירה בלבד; הקוד קורא מהקבוצות.

**החבר היה (עמדה + מסלול) — וזו הייתה טעות באפיון.** מסלול שייך ל**שדה**
(`airfield_routes.airfield_id`), ועמדה רק רואה אותו דרך השדה שלה. הצמדת עמדה לחבר
אפשרה קישור חלקי מסוג אחר: עמדה אחת בשדה "מקושרת" ושכנתה באותו שדה לא. מ-04.08.2026
החבר הוא **מסלול בלבד**, והשדה נגזר ממנו — כך אין שדה שסותר את המסלול שנרשם.

### טבלת `route_link_groups` — קישור אחד

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `name` | VARCHAR(100) | שם חופשי לקישור (אופציונלי) |
| `airfield_id` | INT → airfields | השדה שממנו נוצר הקישור (CASCADE). לתצוגה - הקישור מופיע גם בשדה של כל מסלול שבו |
| `migrated_from_link_id` | INT | ה-`route_links.id` שממנו הוגר. אינדקס ייחודי חלקי - כך שהגירה חוזרת בעלייה אינה יוצרת כפילויות |
| `created_at` | TIMESTAMPTZ | חותמת |

### טבלת `route_link_members` — מסלול בתוך הקישור

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `group_id` | INT → route_link_groups | הקישור (CASCADE) |
| `route_id` | INT → airfield_routes | המסלול (CASCADE). **השדה נגזר ממנו** ואינו נשמר בנפרד |
| `preset_id` | INT, nullable | **היסטוריה בלבד** — העמדה מהמודל הישן. אינה נכתבת ואינה נקראת, ו**אין עליה FK** בכוונה: ב-CASCADE מחיקת עמדה הייתה מוחקת חברים בקישור ושוברת אותו בשקט |

**`UNIQUE(group_id, route_id)`** (אינדקס `uq_route_link_members_group_route`) — אותו
מסלול לא נכנס פעמיים לאותו קישור. **שני מסלולים שונים מאותו שדה מותרים**: שדה יכול
להחזיק שני מסלולים שמקושרים לאותו מסלול פיזי אצל שכנו.

**כללי תקינות (`src/utils/routeLinks.ts`, נאכפים גם בשרת):** לפחות שני מסלולים
**שונים**, ולכל חבר `route_id` תקין.

> המיגרציה ב-`init.js` רצה על `public` **ועל כל סכמות התרגול**: הסנכרון ב-`envs.js`
> רק *מוסיף* טבלאות/עמודות/FK ואינו יודע להסיר `NOT NULL` או להחליף אילוץ ייחודי —
> בלי זה שמירת קישור בסביבת תרגול הייתה נופלת על `preset_id NOT NULL`.

**חל על כל סוגי המסלולים:** הקישור אינו שייך ל"מסלולי הסעה" — `routeKind` מסווג
מסלול המראה / מטוסים / רכב / כללי, ו-`is_runway` גובר על `route_category`.

**צריכה:** `GET /api/active-takeoffs` מרחיב את מסלולי השדה לכל המסלולים שנמצאים
באותה קבוצה — כלומר קבוצה של שלוש עמדות נספרת במלואה, ולא רק בן-הזוג.

---

## קטלוג השדות המותאמים - `strip_field_defs`

**מקור האמת היחיד להגדרת שדה/פקד של הפ"מ.** נערך גם מעורך הסטריפ (משבצת) וגם ממוד
הטבלה (עמודה), ונבחר בשניהם - ולכן טבלה, ולא הגדרה מוטבעת בתבנית.

| עמודה | סוג | תיאור |
|---|---|---|
| `key` | VARCHAR(64) UNIQUE | מזהה טכני שנוצר בשרת מרצף `strip_field_key_seq` (`fld_7`). **אינו נחשף למנהל** |
| `label` | VARCHAR(120) | מה שהמנהל רואה ועורך |
| `type` | VARCHAR(20) | `button` / `field` / `flag` / `select` / `multiselect` |
| `input_mode` | VARCHAR(20) | לשדה בלבד: `keyboard` / `handwriting` / `both` |
| `scope` | VARCHAR(10) | `window` (ערך פר-לוח) / `global` (ערך על הפ"מ) |
| `values_json` | JSONB | ערכי הכפתור / התפריט |
| `default_value` | JSONB | ב"מ |
| `styles_json` | JSONB | כללי עיצוב מותנה על ערך השדה |

טבלת **קונפיג** (ב-`public`, משותפת לכל הסביבות). הערכים עצמם תפעוליים:
`strips.custom_fields` לגלובלי, `strip_control_values` לפנימי ללוח.

---

## פקדי הסטריפ - `strip_control_values`

ערכי פקדים שהוגדרו **פנימיים ללוח**. פקד גלובלי אינו כאן - הוא יושב ב-`strips.custom_fields`
ונוסע עם הפ"מ. האפיון המלא: [CIV_STRIP_CONTROLS.md](CIV_STRIP_CONTROLS.md).

| עמודה | סוג | תיאור |
|---|---|---|
| `strip_id` | INT → strips.id (CASCADE) | הפ"מ |
| `preset_id` | INT → workstation_presets.id (CASCADE) | **הלוח** - זה מה ש"פנימי לחלון" אומר |
| `control_key` | VARCHAR(64) | מפתח הפקד (`^[A-Za-z0-9_]{1,64}# מבנה נתונים — SKY KING

## מפתחות זרים — `server/db/foreign-keys.js`

**הרשימה המחייבת של ה-FK נמצאת ב-[`server/db/foreign-keys.js`](server/db/foreign-keys.js), לא ב-`init.js`.**

הרקע: ה-FK מוצהרים בתוך ה-`CREATE TABLE` ב-`init.js`, אבל `CREATE TABLE IF NOT
EXISTS` מדלג בשקט על טבלה שכבר קיימת. לכן כל FK שנוסף להצהרה **אחרי** שהטבלה
נוצרה בסביבה — לא נוצר שם מעולם. ב-31.07.2026 נמדד ש-**112 מתוך 121 ה-FK
המוצהרים לא היו קיימים ב-DB בפועל (93%)**: הצהרה שנראית תקינה בקוד ואינה נאכפת.
הבעיה התגלתה כשמחיקת אנשי צוות, שאמורה הייתה לגרור `CASCADE`, השאירה 37 שורות
יתומות.

`ensureForeignKeys()` רצה בסוף `initDb()` ומשלימה בכל עלייה את מה שחסר בסכמה
הנוכחית. היא אידמפוטנטית (בודקת `pg_constraint` לפני), ו**אינה מדלגת בשקט על
כשל** — FK שלא ניתן להוסיף נרשם ללוג בקול בכל עלייה, כי כמעט תמיד הסיבה היא
שורות יתומות שדורשות החלטה על הנתונים.

סכמות סביבות התרגול מקבלות את ה-FK בנפרד: `ensureEnvSchema()` משכפלת אותם
מ-`public` (ראה `envs.js` — `CREATE TABLE (LIKE ...)` לא מעתיק FK).

> **כשמוסיפים FK חדש ל-`init.js` — להוסיף אותו גם ל-`foreign-keys.js`.**
> אחרת הוא ייווצר רק בסביבות חדשות, וזו בדיוק התקלה שהמנגנון בא לפתור.

**מצב נוכחי (04.08.2026):** **136/136 ב-`public`, אפס חסומים.** 49-67 בכל סכמת
תרגול (טבלאות תפעוליות בלבד; אפס FK מסביבה אל טבלה תפעולית ב-`public`, כלומר
הבידוד שלם). 9 ה-FK שהיו חסומים טופלו — ראה להלן.

### היתומות שחסמו, וה-FK האחד שאסור שיהיה

עד 04.08.2026 דיווח הלוג בכל עלייה על 9 FK חסומים. הבדיקה הראתה **שתי תקלות
שונות** שהצטיירו כאחת:

- **8 מהם — נתונים.** 385 שורות יתומות: ילדים של הורה שכבר נמחק (`bdh_items` של
  מסמכים שנמחקו, `sector_neighbors`/`sub_sectors` של סקטורי ה-seed המקורי 1 ו-2,
  ושורות של פ"מים מחוקים — רובן בסביבת תרגול). נוקו, וה-FK נוצרו.
- **1 מהם — הצהרה שגויה.** `strips.held_by_workstation` הוצהר מול
  `workstations(id)`, אבל **0 מ-31 הערכים בייצור היו UUID של עמדה ו-31/31 היו
  `workstation_presets.id`**: הסמנטיקה של העמודה נדדה כשעברו לעמדות-preset
  (`transfers.js` כותב לשם `assignedPresetId`, ו-`workstations.js` קורא ומשווה
  לשתי הצורות). "ניקוי" ה-31 והוספת ה-FK היו **מפילים כל קבלת העברה**. ההצהרה
  הוסרה — גם מהרשימה וגם מה-`CREATE TABLE` — ומתועדת בשני המקומות.
  איחוד העמודה עם `workstation_preset_id` נותר כרפקטור נפרד.

> **לקח:** FK חסום אינו בהכרח "נתונים מלוכלכים". לפני ניקוי — לבדוק **לאן
> העמודה באמת מצביעה בייצור**. `node scripts/db-orphans.mjs --sample` מדפיס
> בדיוק את זה (דוח בלבד; `--fix` מנקה בטרנזקציה אחת לסכמה).

---

## אנשי צוות — `crew_members`

מאז המעבר להזדהות מול המיראז' בלבד, **המיראז' הוא המקור היחיד לזהויות** ואין
זריעה של אנשי צוות ב-`seed.js`. רשומה מקומית נוצרת רק בעקבות התחברות בפועל,
וכשאין התאמה לפי `personal_id` — `mirage-login` בונה משתמש וירטואלי מפרטי
המיראז' בלי לכתוב ל-DB (ראה `server/routes/mirage.js`).

`activity_log` שומר `crew_member_name` **denormalized** ואין בו FK ל-`crew_members`
— בכוונה: מחיקת איש צוות לא אמורה למחוק או לרוקן את יומן הביקורת.

---

## סביבות תרגול (סימולציה) — סכמה לכל סביבה

בסגנון גלקסיה: 50 סביבות עבודה. **סביבות טסות (1–10)** חולקות את המידע הטס
(פ"מ, סגירות, ספרורים זהים) — הן ממופות כולן לסכמת **`public`** הקיימת.
**סביבות תרגול (11–50)** מבודדות לחלוטין — לכל אחת סכמת PostgreSQL משלה
(`env_11` … `env_50`) המכילה עותק של הטבלאות **התפעוליות** בלבד.

**מיפוי:** הלקוח שולח כותרת `X-Env` (נבחרת ב-LOGIN, מוצגת בבאדג' בסרגל העליון);
middleware בשרת ([server/middleware/environment.js](server/middleware/environment.js))
ממפה סביבה→סכמה ומריץ כל בקשה תחת `search_path` מתאים, בלי לגעת ב-455 ה-routes.

**סיווג הטבלאות** ([server/db/env-tables.js](server/db/env-tables.js)) — מקור אמת יחיד:
- **תפעוליות** (מבודדות פר-סביבה): `strips` + טבלאות בת, `strip_transfers`,
  `provisional_transfer_points`, `serials`, `closures`, `activity_log`,
  `workstation_messages/signals`, `bdh_alerts`, `sticky_notes`, `blocks`,
  סטטוסי שדה קרקעי בזמן-ריצה, ועוד — ראה `OPERATIONAL_TABLES`.
- **קונפיגורציה** (משותפת, `public` בלבד): `sectors`, `workstations`,
  `workstation_presets`, `maps`, `crew_members`, `translations`, `airfields`,
  הגדרות דסקים/בד"ח — ראה `CONFIG_TABLES`. FKs תפעולי→קונפיג נפתרים ל-`public`.
- **היברידיות** (עותק שורות מ-public): `airfield_elements`, `airfield_taxiways`,
  `base_statuses` — הגדרת שדה שסטטוס חי יושב עליה.

**בטיחות:** בדיקת שלמות ב-boot (`checkTableClassification`) מפילה את העלייה אם
טבלה חדשה ב-public אינה מסווגת (מונע זליגת תרגול↔אמת שקטה). סכמת תרגול נוצרת
עצלנית בכניסה ראשונה ([server/db/envs.js](server/db/envs.js) `ensureEnvSchema`),
מסונכרנת ב-boot (`syncAllEnvSchemas`), וניתנת לאיפוס (`POST /api/environments/:env/reset`).

> ⚠️ **בידוד connection (קריטי):** מול ה-pooler של Neon (pgbouncer), החלפת
> `client.query` להזרקת `SET LOCAL` גורמת ל-search_path לדלוף לרמת ה-server
> connection. לכן connection ששירת סביבת תרגול דרך `pool.connect()` **מושמד**
> בשחרור ([server/db/pool.js](server/db/pool.js)) ולא חוזר ל-pool המשותף. נבדק
> ב-[server/db/env-isolation.integration.test.js](server/db/env-isolation.integration.test.js).

### טבלת `environments` — רישום הסביבות (ב-`public` בלבד)

| עמודה | סוג | תיאור |
|---|---|---|
| `env_number` | INT PK | מספר הסביבה (1–50) |
| `schema_created` | BOOLEAN | האם סכמת התרגול נוצרה (טסות: תמיד true) |
| `last_entered_at` | TIMESTAMPTZ | כניסה אחרונה (מזין את מסך הכניסה) |
| `created_at` | TIMESTAMPTZ | חותמת יצירה |

---

## טבלת `strips` — פ"מ (פלוגת מטוסים)

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `callsign` | VARCHAR(50) | אוק (חנית, כסף, ...) |
| `sq` | VARCHAR(10) | מספר פ"מ (1, 2, ...) |
| `squadron` | VARCHAR(100) | טייסת |
| `number_of_formation` | VARCHAR(50) | כמות מטוסים בפ"מ |
| `alt` | VARCHAR(10) | גובה |
| `task` | VARCHAR(50) | משימה |
| `erka` | TEXT | ע"ר/קא |
| `koteret` | TEXT | כותרת |
| `mivtza` | TEXT | מבצע |
| `takeoff_time` | TIMESTAMPTZ | זמן המראה |
| `planned_landing_time` | TIMESTAMPTZ | **זמן נחיתה מתוכנן** — ETA לשדה. הבסיס לאופרטורי הזמן היחסיים בשאילתא ("נוחת בעוד פחות מ-X דקות"). **לא** `strip_transfers.eta_minutes`, שהוא ספירה לאחור לנקודת העברה |
| `airborne` | BOOLEAN | בתעופה |
| `landed` | BOOLEAN | נחת - סוף חיים תפעולי. GAPI מפסיק להפיץ פ"מ כזה ושולח מסר מחיקה |
| `status` | VARCHAR(20) | queued / active / pending_transfer |
| `workstation_preset_id` | INT → presets | לאיזו עמדה שייך |
| `sector_id` | INT → sectors | סקטור |
| `x`, `y` | REAL | מיקום על מפה |
| `on_map` | BOOLEAN | האם על המפה |
| `in_table` | BOOLEAN | האם בטבלה |
| `aircraft_positions` | JSONB | `[{idx,x,y,point_id,status}]` — מיקום כל מטוס על מפת שדה |
| `notes` | TEXT | הערות |
| `formation_notes` | TEXT | הערה ברמת פ"מ |
| `parent_callsign` | VARCHAR(100) | או"ק פ"מ מקורי (אם שונה) |
| `weapons` | JSONB | נשק |
| `targets` | JSONB | **טבלת נקודות מכוון** (העברת מטרה לתקיפה) — **טבלת בן** של הפ"מ: מערך של נ"צי תקיפה. שורה: 11 שדות טקסט `{name, aim_point, coord, alt_ft, hd, an, an_min, fuze, armament, bombs, note}` + 4 **דגלים בוליאניים** `{air_verified, cleared_heading, abort_attack, ground_verified}`. `coord` = 17 ספרות `NDDMM.mmmm/EDDDMM.mmmm`; `fuze` בשניות (0.02 = 20 מ"ש); דגל חסר נקרא `false`. נשמר כ-JSONB ולא כטבלה נפרדת כדי שכל הטבלה תיכתב בפעולה אחת ולא יישארו שורות יתומות. מקור אמת: `src/types/aimPoints.ts` |
| `systems` | JSONB | מערכות |
| `custom_fields` | JSONB | שדות מותאמים, **וגם ערכי פקדים גלובליים** של הסטריפ (מפתח = `key` של הפקד). נכתב ב-`jsonb_set` על המפתח בלבד, כדי ששתי עמדות שמשנות שני פקדים לא ידרסו זו את זו. ראה [CIV_STRIP_CONTROLS.md](CIV_STRIP_CONTROLS.md) |
| **`parent_strip_id`** | INT → strips.id | **מופיע רק אחרי פיצול** — מצביע על ה-root |
| **`aircraft_indices`** | JSONB | **מופיע רק אחרי פיצול** — לדוגמה `[1, 3]` |
| **`original_formation_count`** | INT | **מופיע רק אחרי פיצול** — כמות מטוסים מקורית |
| `updated_at` | TIMESTAMPTZ | חותמת עדכון — מתוחזקת בטריגר. ראה §מעקב גרסה |
| `rev` | BIGINT | מונה גרסה — עולה ב-1 בכל `UPDATE`. ראה §מעקב גרסה |

---

## מעקב גרסה — `rev` + `updated_at`

חמש טבלאות נושאות מונה גרסה, וכולן אותן טבלאות שהעמדה כותבת אליהן **בנתק**:

| טבלה | מה נכתב בנתק |
|---|---|
| `strips` | הפ"מ עצמו, כולל `on_map`/`x`/`y` — גרירה על המפה |
| `strip_transfers` | העברות עמדה |
| `strip_zone_assignments` | הצבת פ"מ על אזור במפה |
| `strip_table_assignments` | הצבת פ"מ בטבלת עמדה |
| `joining_point_strips` | פ"מ בנקודת הצטרפות |

**למה זה קיים:** בסנכרון חזרה אחרי עבודה מנותקת יש שאלה אחת שחייבת תשובה
ודאית — *האם עמדה אחרת נגעה בפ"מ הזה בזמן שהייתי מנותק*. בלי מונה אי אפשר
להבדיל בין "אף אחד לא נגע" ל"כבר העבירו אותו", ובקרת טיסה לא מנחשת.

**למה טריגר ולא עדכון בקוד:** `strips` נכתבת מעשרות מקומות. שורת
`updated_at = NOW()` בכל אחד מהם היא בדיוק מה שנשכח בכתיבה החמישים ואחת,
ואז הסתירה נבלעת בשקט. הטריגר `<table>_touch_rev` אינו יכול להישכח.

**למה `rev` ולא רק חותמת זמן:** חותמת נשענת על שעון השרת. קפיצת NTP לאחור
הייתה גורמת לשינוי אמיתי להיראות ישן מהבסיס שהעמדה זוכרת — כלומר סתירה
שנבלעת. `rev` מונוטוני ואינו תלוי בשעון. החותמת משמשת לתצוגה ("השרת שינה
ב-14:32"), המונה להכרעה.

> ⚠️ **סביבות תרגול:** `CREATE TABLE (LIKE ... INCLUDING ALL)` מעתיק עמודות,
> defaults ואינדקסים אבל **לא טריגרים**. לכן [`server/db/envs.js`](server/db/envs.js)
> מתקין אותם במפורש בכל סכמת `env_NN`. בלי זה סביבת תרגול הייתה מקבלת את
> העמודות בלי המנגנון שממלא אותן, `rev` היה נשאר 0 לנצח, וסנכרון היה מדווח
> "אין סתירות" תמיד. מקור אמת לרשימה ולפקודות:
> [`server/db/versionedTables.js`](server/db/versionedTables.js).

---

### שדה מחושב ב-API: `at_preset_names` ("נמצא בעמדה")

`GET /api/strips/global` מחזיר לכל פ"מ מערך שמות של **כל העמדות שהוא נמצא בהן
כרגע**: איחוד של `strip_table_assignments` (נגרר לדסק) ו-`strip_zone_assignments.preset_id`
(חובר לאזור). פ"מ יכול להיות בכמה עמדות במקביל; יציאה מהדסק (נקודת העברה או
חזרה לחלון הפ"מים) מוחקת את שורת השיוך ולכן גורעת את העמדה.

**לא** נגזר מ-`strips.workstation_preset_id` — אותה עמודה נושאת גם **יעד העברה**,
ופ"מ שממתין בנקודת העברה כבר לא "נמצא" אצל אף אחד.

---

## טבלת `strip_station_notes` — הערת עמדה על פ"מ

הערה **פרטית לעמדה** על פ"מ. שתי עמדות שמחזיקות את אותו פ"מ בדסק שלהן כותבות
הערות נפרדות בלי לדרוס זו את זו. אינה מחליפה את `strips.notes` המשותפת אלא
מתווספת אליה: בטבלה יש עמודה לכל אחת (`notes` / `station_note`).

| עמודה | סוג | תיאור |
|---|---|---|
| `strip_id` | INT → strips (CASCADE) | הפ"מ |
| `preset_id` | INT → workstation_presets (CASCADE) | העמדה שכתבה |
| `note` | TEXT | ההערה. הערה ריקה = השורה נמחקת |
| `note_by_crew_id` | INT | איש הצוות שכתב |
| `updated_at` | TIMESTAMPTZ | חותמת עדכון |
| | PK | `(strip_id, preset_id)` — הערה אחת לכל צמד |

> **למה טבלה נפרדת ולא עמודה ב-`strip_table_assignments`:** אותה טבלה נמחקת
> בסיטונאות ב-`POST /api/strips/reset-placement[-preset]` ובהסרת פ"מ מהדסק, ולכן
> הערות שהיו תלויות בה היו נמחקות בניקוי הצבות. בנוסף, פ"מ שנמצא בדסק דרך
> התאמת query כלל אינו מחזיק שורת שיוך — וכאן הוא עדיין יכול לשאת הערה.

**נקרא ב-** `GET /api/strips/global` כמפה `station_notes = {preset_id: note}`
(תת-שאילתה סקלרית, לא JOIN — שני JOINים מצטברים היו מכפילים שורות).
**נכתב ב-** `PATCH /api/strips/:id/station-note` (upsert; הערה ריקה מוחקת).

---

## טבלת `strip_aircraft` — מטוס בודד

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `strip_id` | INT → strips | שייך לאיזה פ"מ |
| `idx` | INT | מספר המטוס בתוך הפ"מ (1, 2, 3...) |
| **`tail_number`** | VARCHAR(20) | **מספר זנב** |
| **`pilot_name`** | VARCHAR(200) | **שם טייס** |
| **`navigator_name`** | VARCHAR(200) | **שם נווט** |
| **`sagol_1`** | VARCHAR(50) | **סגול 1** |
| **`sagol_2`** | VARCHAR(50) | **סגול 2** |
| `datk` | INT | דת"ק (מספר חניה) |
| `kipa` | VARCHAR(100) | כיפה |
| **`has_fault`** | BOOLEAN | **תקלה במטוס** — הדגל שמאדים את הפ"מ בתצוגה |
| **`fault_type`** | VARCHAR(200) | **מהות התקלה** — שם מתוך `fault_types` (שם ולא FK, ראה למטה) |
| **`fault_details`** | TEXT | **פירוט התקלה** — טקסט חופשי |

### הצגה כטבלת בן בעמדה

הטבלה רשומה ב-[`src/types/subTables.ts`](src/types/subTables.ts) לצד טבלת נקודות
המכוון, ולכן היא נבחרת בכפתור **"הוסף טבלה"** בהגדרת **מוד הטבלה** (מסך ניהול)
ומקבלת בוחר עמודות משלה. `GET /api/strips/global` מחזיר אותה מקוננת על הפ"מ תחת
`aircraft` (חימושים ומערכות בתוך שורת המטוס), כך שהמנגנון הגנרי מוצא אותה באותו
`stripField` שבו הוא מוצא את `targets`.

| | |
|---|---|
| **עריכה בתא** | `rowWrite: 'aircraft-row'` ברישום: שורת מטוס היא **רשומת DB עם מפתח משלה** (`strip_id, idx`) ולכן נשמרת **לבדה** במסלול שלה, ולא ככתיבה של מערך שלם לשדה הפ"מ כמו `strips.targets` - כתיבה כזו הייתה דורסת שורות שעמדה אחרת עדכנה באותו רגע |
| **מה נערך** | תקלה (מתג) · מהות התקלה (מתפריט `fault_types` המנוהל, דרך `datalist`) · פירוט התקלה · מספר זנב · טייס · נווט · סגול 1/2 · דת"ק · כיפה |
| **מה לא** | מספר המטוס (`idx` - המפתח), חימושים ומערכות: הם שיטוח של טבלאות בן שלמות לטקסט אחד ("פצצה x2", "מכ\"ם (לא שמיש)"), ואי אפשר לפרק הקלדה חזרה לשורות |
| **שני מסלולי כתיבה** | התקלה ב-`/fault` (שלושת השדות יחד), השאר ב-`PUT /strip-aircraft/:stripId/:idx` בעדכון חלקי. `aircraftRowWrite` ([stripAircraft.ts](src/types/stripAircraft.ts)) בוחר ביניהם |
| **עמודות ברירת מחדל** | מספר, מספר זנב, שם טייס, דת"ק - השאר נוספות במקנפג |

> **הקלדת מהות/פירוט מדליקה את דגל התקלה.** השרת מתעלם משניהם כשהדגל כבוי
> (כיבוי = ניקוי), ולכן בלי זה מה שהוקלד היה נעלם בשקט. כיבוי נעשה במתג בלבד -
> ניקוי הטקסט אינו מכבה, כי "יש תקלה, פרטים בהמשך" הוא מצב לגיטימי.

### כמות השורות — לפי המס"מ

הטבלה היא **טבלת בן של הפ"מ**: שורה לכל מטוס, ולכן מספר השורות הוא ה**מס"מ**
(`strips.number_of_formation`) — מבנה של ארבעה מקבל ארבע שורות, `idx` 1..4.
היצירה אידמפוטנטית (`POST /api/strip-aircraft/ensure/:stripId` עם
`count = number_of_formation`, ו-`/ensure-all` לכל הפ"מים), ולכן קריאה חוזרת
אינה מכפילה שורות. בכיוון הנכנס מ-GAPI השורות נוצרות מ-`data.aircraft[]` עצמו.

### זהות המטוס וצוות האוויר

`tail_number`, `pilot_name`, `navigator_name`, `sagol_1`, `sagol_2` הן תכונות של
ה**מטוס הבודד** ולא של הפ"מ — במבנה של ארבעה יש ארבעה זנבות וארבעה צוותים,
ושדה אחד ברמת הפ"מ היה מנסה לדחוס ארבעה ערכים לתא אחד. כולן VARCHAR ולא
מספריות: מספר זנב וסגול נכתבים כפי שהם מוכתבים בקשר, לרבות אפסים מובילים.

| | |
|---|---|
| **כתיבה** | `PUT /api/strip-aircraft/:stripId/:idx` — **עדכון חלקי**: נכתבות רק העמודות שהופיעו ב-body. בלי זה, לקוח ששולח `{datk, kipa}` בלבד היה מוחק בשקט מספרי זנב ושמות צוות שהוזנו במסך אחר |
| **GAPI** | חמשת השדות הם **תפעוליים דו-כיווניים** (⇄) ונשלחים מקוננים ב-`aircraft[]` של הפ"מ. שלושת שדות התקלה הם **פנימיים ל-SKY-KING** — לא יוצאים, ו-upsert נכנס לא נוגע בהם |
| **מקור אמת** | [`server/gapi/entities.js`](server/gapi/entities.js) (`AIRCRAFT_FIELDS`) — ממנו נגזרים הכניסה, היציאה ומסלול העדכון. החוזה: [GAPI-CONTRACT.md](GAPI-CONTRACT.md) §6.1.2 |

### תקלה — על המטוס, מוצגת ברמת הפ"מ

התקלה היא תכונה של ה**מטוס**, כמו הדת"ק והכיפה. הפ"מ אינו נושא עמודת תקלה:
`GET /api/strips/global` מחשב לכל פ"מ שדה `aircraft_faults`
(`[{idx, fault_type, fault_details}]`, תת-שאילתה על מטוסים עם `has_fault`),
והתצוגה מרכיבה ממנו את שדה **"תקלות"**: `"תקלה למספר 2, תקלה למספר 4"` באדום,
וב-HINT `"מספר 2: מנוע - רעש חריג"`. הרכבת המחרוזות: [`src/utils/faults.ts`](src/utils/faults.ts).

| | |
|---|---|
| **כתיבה** | `PUT /api/strip-aircraft/:stripId/:idx/fault` — **מסלול נפרד** מדת"ק/כיפה, כדי שעדכון חנייה לא ידרוס תקלה שעמדה אחרת רשמה באותו רגע |
| **כיבוי הדגל** | מנקה גם את המהות וגם את הפירוט (בשרת ובלקוח) — "אין תקלה" חייב להיות אין תקלה, אחרת טקסט ישן היה צץ שוב בהדלקה הבאה |
| **הרשאות** | סימון תקלה = `USER` (דיווח תפעולי); עריכת תפריט המהויות = `STAFF` (מסך ניהול) |

### טבלת `fault_types` — תפריט מהויות התקלה

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `name` | VARCHAR(200) UNIQUE | שם המהות (מנוע, מכ"ם, ...) |
| `sort_order` | INT | סדר בתפריט |

טבלת **קונפיג** (`CONFIG_TABLES`) — מנוהלת במסך ניהול מערכת, טאב
"חימושים/מערכות/תקלות", ומשותפת לכל סביבות התרגול. המטוס שומר את **שם** המהות
ולא מזהה: `strip_aircraft` משוכפלת לכל סכמת `env_NN` בעוד `fault_types` חיה רק
ב-`public`, ו-FK חוצה-סכמות היה נשבר שם. לכן מחיקת מהות מהתפריט **אינה** מוחקת
תקלה שכבר נרשמה — היא רק מפסיקה להציע אותה (והבורר עדיין מציג ערך שנמחק).

### טבלת `strip_aircraft_armaments` — חימושים

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `strip_aircraft_id` | INT → strip_aircraft | שייך לאיזה מטוס |
| `armament_name` | VARCHAR(200) | שם החימוש |
| `quantity` | INT | כמות |

### טבלת `strip_aircraft_systems` — מערכות

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `strip_aircraft_id` | INT → strip_aircraft | שייך לאיזה מטוס |
| `system_name` | VARCHAR(200) | שם המערכת |
| `status` | VARCHAR | שמיש / חלקי / לא שמיש |

---

## טבלת `strip_transfers` — העברות עמדה

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID |
| `strip_id` | INT → strips | הפ"מ המועבר |
| `from_sector_id` | INT → sectors | סקטור מוסר |
| `to_sector_id` | INT → sectors | סקטור מקבל |
| `from_workstation_id` / `to_workstation_id` | INT | עמדות (העברה ישירה) |
| `status` | VARCHAR(20) | `pending` → `acknowledged` → `accepted` / `rejected` |
| `target_x`, `target_y` | REAL | מיקום יעד |
| `sub_sector_label` | VARCHAR(50) | תווית נקודת ההעברה |
| `eta_minutes`, `eta_set_at` | — | ETA לספירה לאחור |
| **`reject_note`** | TEXT | **הערת דחייה (חובה בדחייה) — מוצגת בפופאפ אצל המוסר** |
| `created_at` / `updated_at` | TIMESTAMP | חותמות |

### מצבי סטטוס (state machine)
- `pending` — נשלחה, ממתינה אצל המקבל.
- `acknowledged` — המקבל **אישר** קבלה; הפ"מ עדיין לא עבר (נשאר בעמודת הקבלה + ירוק אצל המוסר). נשאר גלוי ב-GET (`status IN ('pending','acknowledged')`).
- `accepted` — "קבל" סופי / גרירה למפה/טבלה; הסטריפ עבר, נגרע.
- `rejected` — נדחתה עם הערה; הסטריפ חזר למוסר + פופאפ (כתום אצל המוסר).

---

## טבלת `sectors` — נקודות המעבר עצמן

במסך הניהול לשונית "נקודות העברה" עורכת את הטבלה הזו: כל שורה היא **נקודת מעבר**
שאליה מעבירים פ"מ (`strip_transfers.to_sector_id`).

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `name` / `label_he` | VARCHAR | שם טכני / שם תצוגה |
| `category` | VARCHAR(100) | קטגוריה חופשית (מרחב, גישה, מסלול...) |
| `notes` | TEXT | הערות להעברת מידע בין העמדות |
| `conflict_alt_delta` | INT | סף קונפליקט גובה ברגליים (0 = כבוי) |
| **`auto_accept_mode`** | VARCHAR(12) | **קבלה אוטומטית של פ"מ בנקודה: `off` (ברירת מחדל) / `immediate` (ברגע השליחה) / `eta` (בתום `strip_transfers.eta_minutes`).** ראה למטה |

### קבלה אוטומטית (`auto_accept_mode`)

בשלב ה-MVP יש עמדה **אחת** ואין מי שילחץ "קבל פ"מ" בצד המקבל, ולכן כל העברה
נתקעת ב-`pending`. נקודת מעבר שסומנה לקבלה אוטומטית מבצעת את הקבלה בעצמה -
**באותו קוד** של קבלה ידנית (`acceptTransferTx`) - כדי שניתן יהיה לתרגל את
התהליך מקצה לקצה.

| | |
|---|---|
| **המנוע** | `runAutoAcceptOnce()` ב-[`server/routes/transfers.js`](server/routes/transfers.js), סבב כל 5ש' מ-`server.js` (`AUTO_ACCEPT_TICK_MS`), פר-סביבה |
| **מתי מבשילה** | [`server/utils/autoAccept.js`](server/utils/autoAccept.js) - `immediate`: מיד; `eta`: `eta_set_at + eta_minutes`. בלי זמן מוקצה = מיד (אחרת פ"מ בלי ETA נתקע לנצח דווקא בנקודה אוטומטית) |
| **מי המקבל** | `receivingPresetId = null` - נופל ל-`to_preset_id`/`to_workstation_id`, וכשאין כאלה הפ"מ פשוט עוזב את העמדה המוסרת, כמו מסירה לצד שאינו במערכת |
| **מרוצים** | "תפיסה" של השורה (`UPDATE ... WHERE status IN ('pending','acknowledged')`) בתוך הטרנזקציה - קבלה ידנית שקדמה מנצחת, ואין קבלה כפולה |
| **יומן** | `activity_log.transfer_accepted` עם `details.auto = true` |

---

## טבלת `sub_sectors` — נקודות העברה (בין סקטור לשכן)

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `sector_id` | INT → sectors | הסקטור |
| `neighbor_id` | INT → sectors | הסקטור השכן |
| `label` | VARCHAR(50) | שם נקודת ההעברה |
| `default_x`, `default_y` | REAL | מיקום ברירת מחדל על המפה |
| **`display_mode`** | VARCHAR(10) | **`full` (פאנל שלם, ברירת מחדל) / `arrow` (חץ מוקטן). ניתן לעקיפה נקודתית בעמדה מתפריט ההקשר.** |

---

## טבלת `provisional_transfer_points` — נקודת העברה זמנית בין 2 עמדות

נקודת העברה **ad-hoc** שבקר יוצר בזמן אמת מול עמדה אחרת (תפריט "יצירה", לא מסך ניהול).
דו-כיוונית. גרירת פ"מ אליה = העברה station-to-station לעמדה השנייה.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `name` | VARCHAR(100) | שם הנקודה |
| `preset_a` | INT → presets | העמדה היוצרת |
| `preset_b` | INT → presets | העמדה השנייה (המאשרת) |
| `notes` | TEXT | הערות לנקודת המעבר |
| `status` | VARCHAR(12) | `pending` (ממתינה לאישור B) → `active` (אחרי אישור) |
| `created_by` | VARCHAR(100) | איש הצוות שיצר |
| `created_at` / `approved_at` | TIMESTAMPTZ | חותמות |
| **`last_used_at`** | TIMESTAMPTZ | **מתעדכן בכל העברה דרכה. בסיס לניקוי האוטומטי.** |
| `pos_a_x/y`, `pos_b_x/y` | REAL | מיקום פר-עמדה על המפה (גרירה); NULL = פאנל בלבד |

**ניקוי אוטומטי:** נמחקת אם `last_used_at` > 12 שעות **וגם** עבר חצות מאז (רץ תקופתית, כמו `cleanupExpiredStrips`).

---

## טבלת `preset_view_stations` — תצוגת עמדות אחרות בעמדה

אילו עמדות מוצגות בסרגל התצוגה שבתחתית העמדה, ובאיזה סדר. נקבע במסך הניהול,
בטופס עריכת העמדה (סקשן "עמדות לצפייה").

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `preset_id` | INT → `workstation_presets` (CASCADE) | העמדה **הצופה** |
| `target_preset_id` | INT → `workstation_presets` (CASCADE) | העמדה **הנצפית** |
| `label` | VARCHAR(100) | שם תצוגה על הריבוע; ריק = שם העמדה הנצפית |
| `sort_order` | INT | סדר הריבועים (נקבע בגרירה) |
| | UNIQUE | `(preset_id, target_preset_id)` — אותה עמדה לא נצפית פעמיים |

> **ההרשאה אינה נשמרת בטבלה הזו.** מי שרשאי להיכנס לעמדה במיראז' רשאי לצפות
> בה: הריבוע מסונן בלקוח מול `crewMember.approved_workstations` (רשימה ריקה =
> בלי הגבלה). עמדה שאין לאיש הצוות המחובר הרשאה אליה — הריבוע שלה לא מרונדר.
> ראה `server/routes/mirage.js` ו-`src/utils/stationPeek.ts`.

---

## דסק משימה כללי (General Mission Desk)

### טבלת `mission_desks` — הגדרת דסק (admin)

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `name` | VARCHAR(100) | שם הדסק |
| `layout_json` | JSONB | עץ BSP (כמו `strip_window_layouts`): `split{direction,sizes,children}` / `leaf{service_id}` |
| `created_at` / `updated_at` | TIMESTAMPTZ | חותמות |

### טבלת `mission_desk_services` — שירות בתוך דסק

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה (זהות השירות — בסיס לשיתוף בין עמדות) |
| `desk_id` | INT → mission_desks | הדסק (ON DELETE CASCADE) |
| `service_type` | VARCHAR(12) | `buttons` (מסך ניהול אמצעים) / `freetext` (טקסט חופשי בכתב יד) / `table` (טבלה חכמה) / `image` (תמונה קבועה) / `label` (טקסט קבוע) / `map` (חלון מפה) / `strips` (חלון הפ"ממים של מפה) |
| `name` | VARCHAR(100) | שם השירות |
| `config` | JSONB | הגדרות אדמין — לפי סוג: freetext: `{ruled,lineGap,title}`; table: `{columns[],allowAddRows,initialRows,computed[],rules[],summary{}}`; image: `{dataUrl,fit}` (raster בלבד); label: `{text,font,fontSize,bold,align,color}`; strips: `{map_service_id}` (לאיזה חלון מפה שייך); map: `{}` — **המפה עצמה נבחרת פר-עמדה**, ראה `mission_desk_map_config` |
| `sort_order` | INT | סדר |

### טבלת `mission_desk_service_state` — מצב ריצה פר (שירות, עמדה)

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `service_id` | INT → mission_desk_services | השירות (CASCADE) |
| `preset_id` | INT → workstation_presets | העמדה (CASCADE) |
| `state` | JSONB | buttons: `{buttons:[{id,x,y,text,freeText,font,fontSize,bold,states:[{label,color,alertPresetIds[]}],activeStateIdx}]}`; freetext: `{strokes[]}`; table: `{rows:[{id,cells{}}]}` |
| `updated_at` | TIMESTAMPTZ | חותמת (בסיס ל-last-write-wins) |
| | UNIQUE | `(service_id, preset_id)` |

**שיתוף בין עמדות:** בכתיבת state, השרת מבצע **fan-out** — מעתיק את ה-state לכל עמדה
ברשימת `workstation_presets.mission_desk_sharing[service_id]` של העמדה הכותבת.
עמדה שהדסק שלה לא כולל את השירות — פשוט לא קוראת את הרשומה (ללא השפעה).

### עמודות חדשות ב-`workstation_presets`

| עמודה | סוג | תיאור |
|---|---|---|
| `mission_desk_id` | INT → mission_desks | הדסק של עמדה מסוג `preset_type='mission_desk'` |
| `mission_desk_sharing` | JSONB | `{ "<service_id>": [preset_id, ...] }` — לאילו עמדות מסונכרן כל שירות |
| `mission_desk_map_config` | JSONB DEFAULT `'{}'` | הגדרת **חלונות המפה** של הדסק, פר-עמדה: `{ "<map_service_id>": { map_id, transfer_points[], sector_maps_enabled, sector_map_ids[], flight_zones_mode, fz_pin_display, strips_panel } }`. המפה נקבעת כאן ולא בהגדרת הדסק, כי אותו דסק משרת עמדות שמסתכלות על מפות שונות. `map_id` הוא **חובה**: עמדה שבדסק שלה יש חלון מפה בלי מפה אינה נשמרת (`mdMissingMapServices`) |
| `parent_base_id` | INT (מזהה `aviation_bases`, **ללא FK אכיף** — ה-constraint מופל ב-`init.js` לצימוד רופף) | בסיס האב של העמדה. פותר את שם/סמל הבסיס: במיראז' (רשימת עמדות) ובתצוגת סמל הבסיס במסך הטעינה ובסרגל העליון. `NULL` = אין בסיס אב → מוצג רק סמל מיח"ה (מפקדת יחידות הבקרה). גם ציר הקיבוץ של בורר העמדה במסך הכניסה, וגם **ציר ההרשאה של ראש צוות במסך הניהול** — ראה "שיוך תוכן admin לבסיס אב" |
| `updated_at` | TIMESTAMPTZ DEFAULT NOW() | חותמת העדכון האחרון. נדרסת ב-PUT ובעדכון ספי העומס. הותקנה עם backfill מ-`created_at` לעמדות ותיקות, כדי שלא ייפלו לסוף רשימת "האחרון שעודכן/נוצר" בבורר העמדה |
| `sector_maps_enabled` | BOOLEAN DEFAULT false | האם להציג את רשימת הסקטורים בפינת **מפה 1** בעמדה |
| `sector_map_ids` | JSONB DEFAULT `[]` | מזהי מפות-הסקטור שיוצגו על מפה 1. הסדר במערך = סדר הרשימה על המפה. תקפים רק מזהים שה-`parent_map_id` שלהם הוא `map_id` |
| `map2_sector_maps_enabled` | BOOLEAN DEFAULT false | כנ"ל עבור **מפה 2** — הגדרה נפרדת לחלוטין |
| `map2_sector_map_ids` | JSONB DEFAULT `[]` | מזהי מפות-הסקטור שיוצגו על מפה 2 (`parent_map_id` = `map2_id`) |
| `air_picture_enabled` | BOOLEAN DEFAULT false | **תמונ"א על הדסק** — האם העמדה מציגה את התמונה האווירית מעל המפה. דורש מפה **מעוגנת**; מסך הניהול חוסם שמירה כשאין אף מפה מעוגנת (ראה [AIR_PICTURE_SPEC.md](AIR_PICTURE_SPEC.md) §7.4) |
| `air_picture_defaults` | JSONB DEFAULT `{}` | ברירות המחדל של העמדה לתמונ"א: `{on,scale,opacity,labels,classes[],altMin,altMax,resp}`. הפקח דורס אותן ב-`sessionStorage` בלי לשנות את העמדה — אותה תבנית של `data_windows` |
| `zone_watch_settings` | JSONB DEFAULT `{}` | **הגדרות זיהוי חריגה מאזור** (AIR_PICTURE_SPEC.md §8.5): `{alerts, whenPictureOff}`. שק אחד ולא עמודה למתג — ה-INSERT/UPDATE של הטבלה הם רשימות פוזיציוניות בנות 66 פרמטרים, וכל מתג נוסף שם הוא הזדמנות לשגיאת היסט שקטה. **מפתח חסר נקרא כברירת מחדל בקוד** (`alerts` דולק, `whenPictureOff` כבוי), ולכן עמדה ותיקה מתנהגת בדיוק כפי שהתנהגה |
| `data_windows` | JSONB DEFAULT `[]` | **חלונות נתונים** — מונים מוגדרי-שאילתא הצפים מעל מפת השדה. `[{id,title,query,mode,x,y,color,hidden}]` באותו DSL של `QueryBuilder`. זו **ברירת המחדל של העמדה**; הפקח מזיז/מכבה/עורך בסשן שלו (sessionStorage) בלי לשנות אותה |
| `show_data_windows` | BOOLEAN DEFAULT false | האם חלונות הנתונים ("הצג כמות מטוסים") פעילים בעמדה כברירת מחדל. הפקח מדליק/מכבה בסרגל העליון לסשן שלו בלבד |
| `show_window_container` | BOOLEAN DEFAULT false | **קונטיינר החלונות** — האם הוא **פתוח בעליית העמדה**. היכולת עצמה קיימת בכל עמדה — המתג בתפריט "תצוגה" אינו תלוי בעמודה הזו. סידור החלונות ב-`localStorage` פר-עמדה (לא ב-DB) |
| `window_container_position` | VARCHAR(20) DEFAULT `'beforeAids'` | **מיקום ברירת המחדל** של הקונטיינר: `left` / `mapRight` / `beforeAids` / `right`. חל כל עוד הפקח לא בחר מיקום בעצמו; בחירתו (localStorage) גוברת |

---

## תמונ"א — `air_picture_config`

**טבלה גלובלית, שורה אחת.** מחזיקה **רק הגדרה**: לאן לפנות, באיזה קצב, והאם דלוק.

> **אין טבלת מטוסים, וזה מכוון.** התמונ"א היא **המטוס הפיזי בשמיים** ואילו הפ"מ
> הוא הרישום שלו — שתי שכבות מידע נפרדות. המטוסים זורמים מהמאגר החיצוני ישירות
> לעמדה ואינם נשמרים לעולם: כתיבה שלהם ל-DB הייתה 300 `UPDATE` כל 2 שניות.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | סינגלטון — תמיד שורה אחת |
| `base_url` | TEXT | כתובת מאגר התמונ"א |
| `auth_token` | TEXT | אסימון המאגר. **לעולם לא נשלח ל-renderer** — `GET /api/air-picture/config` מחזיר רק `enabled`/`pollMs` |
| `poll_ms` | INTEGER DEFAULT 2000 | קצב הדגימה בעמדה |
| `enabled` | BOOLEAN DEFAULT false | מתג ראשי |
| `updated_at` | TIMESTAMPTZ DEFAULT NOW() | חותמת |

**למה גלובלית ולא פר-סביבה** (החלטת הצוות, 2026-08-07): בשלב זה יש **מאגר תמונ"א
אחד** שכל העמדות בכל הסביבות קוראות ממנו. הטבלה רשומה ב-`IGNORED_EXACT` של
[`server/db/env-tables.js`](server/db/env-tables.js) — כמו `gapi_env_config` —
ולכן אינה משוכפלת לסכמות התרגול. הפרדה עתידית = הוצאת שורה אחת מהרשימה.

**הרשאות:** `PUT /api/air-picture/config` הוא **ADMIN בלבד** (מפנה את התמונ"א
התפעולית למאגר אחר ומחזיק את הטוקן), ו-`GET /api/air-picture/admin-config`
הוא STAFF. הקריאה התפעולית (`/config`, `/live`) פתוחה לכל מזוהה.

---

## חברי העמדה — `workstation_session_roles`

שורה אחת לכל עמדה (UNIQUE על `preset_id`). נכתבת מטופס "כניסה לעמדה" (עליית עמדה)
ומ"עדכון חברי העמדה" (תפריט המשתמש) — אותו רכיב, `StationCrewForm`.

השורה מתארת את ההרכב **שיושב בעמדה עכשיו**, ולכן היא נקראת רק ב"עדכון חברי העמדה"
ובתחקיר. בעליית עמדה הטופס נפתח **נקי** (רק הבקר/פקח שנכנס) וה-`PUT` שבאישור דורס
את השורה כולה — אחרת אנשי המשמרת הקודמת היו נגררים להרכב החדש בשקט.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `preset_id` | INT → workstation_presets (UNIQUE, CASCADE) | העמדה |
| `bakar` | VARCHAR(200) | **בקר** (יב"א) / **פקח** (מגדל) — אותו תא, התווית לפי `preset_role` |
| `achori` | VARCHAR(200) | אחורי |
| `mushgach` | VARCHAR(200) | המושגח של הבקר/פקח |
| `mefale` | VARCHAR(200) | מפעיל (לא בעמדת מגדל) |
| `mefale_mushgach` | VARCHAR(200) | המושגח של המפעיל |
| `mashak` | VARCHAR(200) | מש"ק (לא בעמדת מגדל) |
| `mashak_mushgach` | VARCHAR(200) | המושגח של המש"ק |
| `kshp` | VARCHAR(200) | קש"פ — **מספר קשר פנים**, לא שם |
| `has_mushgach` | BOOLEAN | דגל "קיים משגיח" לבקר/פקח |
| `has_mefale_mushgach` | BOOLEAN | דגל "קיים משגיח" למפעיל |
| `has_mashak_mushgach` | BOOLEAN | דגל "קיים משגיח" למש"ק |
| `updated_at` | TIMESTAMP | חותמת עדכון |

**למה דגל נפרד מהשם:** "קיים משגיח" חייב להישאר מסומן גם לפני שהוקלד שם, אחרת
הדגל היה נופל בכל רענון. בשמירה, דגל כבוי **מנקה** את השם — כך "אין משגיח" הוא
מצב אחד ולא שניים.

**סדר התצוגה בטופס:** בקר · אחורי · [מושגח] · מפעיל · [מפעיל מושגח] · מש"ק ·
[מש"ק מושגח] · קש"פ. בעמדת מגדל: פקח · אחורי · [מושגח] · קש"פ. שדות המושגח
נפתחים **בצד** שורת האב רק אחרי סימון הדגל, כדי שהטופס בפתיחה ראשונה יישאר קצר.

---

## טבלת `debriefs` — תחקירים

נפתחת מתפריט העמדה ("צור תחקיר"). התחקיר שומר **snapshot** של המצב ולא הפניות:
העמדה והצוות משתנים, והתחקיר חייב להישאר קריא כפי שנרשם.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `preset_id` | INT → workstation_presets (SET NULL) | העמדה שבה נפתח התחקיר |
| `preset_name` | VARCHAR(200) | שם העמדה בזמן הרישום (נשמר כטקסט — העמדה עלולה להימחק) |
| `crew` | JSONB | חברי העמדה כפי שהיו: כל שדות `workstation_session_roles` |
| `essence` | TEXT | מהות תחקיר |
| `severity` | VARCHAR(40) | סיווג: `critical` / `severe` / `accident` / `near_miss` / `medium` / `light` — **קוד**, לא טקסט מתורגם |
| `details` | TEXT | פירוט תחקיר |
| `involved` | JSONB | מעורבים: `[{type, value}]`, כש-`type` ∈ `squadron` / `callsign` / `formation_no` / `yaba` / `tower` / `base` / `other` |
| `responsibility` | TEXT | פירוט אחריות |
| `screenshot` | TEXT | dataURL (PNG) של מסך העמדה, מצולם **לפני** פתיחת הטופס |
| `event_time` | TIMESTAMPTZ | זמן האירוע (ניתן לעריכה; ברירת מחדל = עכשיו) |
| `created_by` | VARCHAR(200) | מי רשם |
| `created_at` | TIMESTAMPTZ | מתי נרשם |

**אינדקסים:** `idx_debriefs_preset` (preset_id), `idx_debriefs_created` (created_at DESC).

**למה `severity` הוא קוד:** התוויות חיות ב-`src/i18n/registry/crew.json` וניתנות
לעריכה בזמן ריצה ממסך ניהול התרגומים. אילו נשמר הטקסט, שינוי תווית היה מנתק
תחקירים ישנים מהסיווג שלהם.

**נפח:** `GET /api/debriefs` (רשימה) **אינו** מחזיר את `screenshot` אלא
`has_screenshot` בלבד — dataURL של מסך מלא הוא עשרות KB לשורה.

---

## טבלת `suggestions` — הערות והצעות מהשטח

נשלחת מחלון "אודות" (סמל המערכת) בכל עמדה, ומוצגת למנהל המערכת הטכני בטאב
"הערות והצעות" במסך הניהול.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `full_name` | VARCHAR(100) NOT NULL | שם מלא של המציע (ממולא מראש משם המפעיל המחובר, ניתן לשינוי) |
| `phone` | VARCHAR(40) | טלפון ליצירת קשר |
| `unit` | VARCHAR(100) | היחידה של המציע — טקסט חופשי, **לא** מפתח ל-`units` (המציע אינו בהכרח מיחידה רשומה) |
| `subject` | VARCHAR(200) NOT NULL | נושא ההצעה |
| `details` | TEXT NOT NULL | פירוט (עד 5,000 תווים, נחתך בשרת) |
| `preset_id` | INT → workstation_presets (SET NULL) | העמדה ששלחה |
| `preset_name` | VARCHAR(100) | שם העמדה כטקסט — נשמר גם אם העמדה תימחק |
| `status` | VARCHAR(16) NOT NULL | `new` (ברירת מחדל) / `in_review` / `done` / `rejected` — **קוד**, התווית מתורגמת |
| `admin_note` | TEXT | הערת מנהל המערכת (מה נעשה עם ההצעה) |
| `created_at` | TIMESTAMPTZ | **נקבע בשרת** (`DEFAULT NOW()`) — הלקוח אינו שולח זמן, כדי שהרישום לא יהיה תלוי בשעון התחנה |
| `updated_at` | TIMESTAMPTZ | עדכון אחרון (מתעדכן ב-PATCH) |

**אינדקסים:** `idx_suggestions_created` (created_at DESC) — הרשימה תמיד מוצגת מהחדשה לישנה.

**סיווג סביבות:** **קונפיג** (`server/db/env-tables.js`) — יושבת ב-`public` בלבד
ומשותפת לכל הסביבות. הצעה שנשלחה מתוך סביבת תרגול היא משוב על המערכת, לא מידע
שדה: היא חייבת להגיע לאותה רשימה של מנהל המערכת ולא להימחק עם שחרור הסביבה.

**מה לא ניתן לעריכה:** ה-API מאפשר לעדכן `status` ו-`admin_note` בלבד. תוכן ההצעה
(שם, נושא, פירוט) נשמר כפי שנשלח — זו עדות של המפעיל.

---

## טבלת `station_sessions` — משמרות עמדה (זמני כניסה/יציאה)

נרשמות **תמיד**, בלי קשר לתחקיר. זה מקור הנתונים למסך הכשירויות.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `preset_id` | INT → workstation_presets (SET NULL) | העמדה |
| `preset_name` | VARCHAR(200) | שם העמדה בזמן הרישום (טקסט — העמדה עלולה להימחק) |
| `crew_member_id` | INT (**ללא FK**) | מזהה איש הצוות; משתמש מיראז' עשוי לא להיות ב-`crew_members` |
| `crew_name` | VARCHAR(200) | שם איש הצוות שישב על העמדה במקטע |
| `personal_id` | VARCHAR(50) | מספר אישי |
| `roles` | JSONB | חברי העמדה בתחילת המקטע |
| `entered_at` | TIMESTAMPTZ | זמן כניסה |
| `exited_at` | TIMESTAMPTZ | זמן סיום; `NULL` = עדיין בעמדה |
| `end_reason` | VARCHAR(30) | `logout` / `crew_swap` / `crew_update` / `reopen` |

**מקטע פתוח יחיד לעמדה:** `idx_station_sessions_open` הוא UNIQUE חלקי
(`WHERE exited_at IS NULL`) — רענון לשונית או כניסה כפולה לא מייצרים כפילות.

**`last_seen` — הדופק, ולמה הוא הכרחי:** מקטע פתוח **אינו** אומר שיושב שם אדם.
הוא נסגר רק ביציאה מפורשת, ומי שסגר לשונית או כיבה מסך נשאר "מחובר" לנצח —
בפרודקשן נמצאו מקטעים פתוחים בני **11 יום**. לכן העמדה מרעננת את `last_seen`
כל דקה (`PATCH /api/station-sessions/heartbeat`), ומי ששואל "האם העמדה מאוישת"
מכריע ב**טריות** ולא בקיום השורה:

```sql
COALESCE(last_seen, entered_at) > NOW() - INTERVAL '240 seconds'
```

החלון נדיב פי ארבעה מקצב הדופק, כי מנוע ה-polling משהה כשהלשונית מוסתרת.
הנפילה ל-`entered_at` נותנת חסד למקטע שנפתח לפני הדופק הראשון. הצרכן הראשון:
רשימת ההפצה של **הלאמת אזור זמני** ([TEMP_ZONE_SEIZURE_SPEC.md](TEMP_ZONE_SEIZURE_SPEC.md) §3.10).

**למה מקטעים ולא משמרת אחת:** המקטע נסגר בכל אירוע שמשנה מי יושב על העמדה
(החלפת משתמש, עדכון חברי העמדה, יציאה) ונפתח מיד חדש — למעט יציאה. אחרת כל
שעות המשמרת היו נזקפות למי שישב בסוף.

**חישוב שעות בשרת:** `GET /api/station-sessions` מחזיר `hours` מחושב
(`COALESCE(exited_at, NOW()) - entered_at`) ו-`open`, כדי שכל הצרכנים יראו
את אותו מספר.

---

## טבלת `units` — יחידות מבצעיות

רשימת ערכים ל"מעורבים בתחקיר". **קונפיג** (ב-`public` בלבד), לא מידע שדה.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `name` | VARCHAR(200) | שם היחידה |
| `kind` | VARCHAR(20) | `yaba` / `tower` / `base` / `squadron` / `other` (זהה לקודי `type` ב-`debriefs.involved`) |
| `active` | BOOLEAN | יחידה לא פעילה נשמרת בהיסטוריה ולא מוצעת בטופס |
| `sort_order` | INTEGER | סדר תצוגה |
| `created_at` | TIMESTAMPTZ | מתי נוצרה |
| | UNIQUE | `(name, kind)` |

**למה נפרדת מ-`workstation_presets`:** עמדה היא תצורת תצוגה במערכת, יחידה היא
גוף בשטח. יש יחידות בלי עמדה במערכת, ועמדה אחת יכולה לשרת כמה יחידות — גזירת
הרשימה מהעמדות הייתה גם חסרה וגם מציגה שמות טכניים למי שכותב תחקיר.
מנוהלת במסך הניהול, לשונית **"יחידות"**.

---

## טבלת `mirage_users` — משתמשי המיראז' (סימולטור ההזדהות)

> נוצרת ומנוהלת ע"י אפליקציית המיראז' (`mirage/store.js`), לא ע"י `initDb` של SKY-KING.
> בפרודקשן (יש `DATABASE_URL`) המיראז' עובד מולה; בפיתוח/בדיקות — מול `mirage/data.json`.
> בהפעלה ראשונה מול טבלה ריקה מתבצע ייבוא חד-פעמי מ-data.json.

| עמודה | סוג | תיאור |
|---|---|---|
| `personal_number` | VARCHAR(20) PK | מספר אישי |
| `first_name` / `last_name` | VARCHAR(100) | שם |
| `apps` | JSONB | `{ "SKY-KING": { roles:[admin/team_lead/user], workstations:[{id,name}] } }` |
| `created_at` / `updated_at` | TIMESTAMPTZ | חותמות |

---

## אזורי מפה (Flight Zones) — `map_zones` ומשפחתה

עמדת CTRL ("מצב אזורים") מציבה פ"מים על אזורים מצוירים על המפה. אזור = פוליגון; לכל אזור
אפשר כמה **גבהים** בעלי שם (בלוקים), ולכל פ"מ מוצב מוקצה בלוק.

### טבלת `map_zones` — אזור על המפה

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `map_id` | INT → maps | המפה (ON DELETE CASCADE) |
| `name` | VARCHAR(100) | שם האזור |
| `color` | VARCHAR(20) | צבע (ברירת מחדל `#3b82f6`) |
| `polygon` | TEXT (JSON) | קודקודים באחוזי-תמונה `[{x,y}]` |
| `polygon_geo` | TEXT (JSON) | קודקודים גאוגרפיים `[{lat,lon}]` (חלופה ל-polygon) |
| `parent_zone_id` | INT → map_zones | אזור-אב (סנכרון לתת-מפות) |
| `enabled` | BOOLEAN | האם מוצג |
| **`active_alt_range_ids`** | JSONB | **מצב תפעולי — הבלוקים (גבהים) הפעילים/מותרים כרגע. `[]`/NULL = כל הגבהים פעילים. נקבע בקליק ימני בעמדה, משותף בין העמדות.** |
| **`limitation_note`** | TEXT | **מצב תפעולי — מגבלת אזור חופשית, מוצגת בקטן ליד שם האזור. נקבע בקליק ימני בעמדה.** |
| `created_at` | TIMESTAMP | חותמת |

> **אין כאן `restriction`.** מצב האזור (סגור/מוגבל) נולד ישר בטבלה התפעולית
> `map_zone_operational_state` ולא כעמודה כאן, בדיוק כדי לא לחזור על התקלה
> שהשניים שמעל מתעדים.


### טבלת `map_zone_operational_state` — מצב תפעולי חי של אזור

**טבלה תפעולית** (מבודדת פר-סביבת תרגול), בעוד `map_zones` עצמה היא קונפיגורציה.

| עמודה | סוג | תיאור |
|---|---|---|
| `zone_id` | INT PK → map_zones (CASCADE) | האזור |
| `active_alt_range_ids` | JSONB | הבלוקים (גבהים) הפעילים/מותרים כרגע. `[]` = כל הגבהים פעילים |
| `limitation_note` | TEXT | מגבלת אזור חופשית, מוצגת בקטן ליד שם האזור |
| **`restriction`** | VARCHAR(20) NOT NULL DEFAULT `''` | **מצב האזור: `''` פתוח · `'restricted'` מוגבל · `'closed'` סגור.** נקבע בלחיצה על **קו** האזור |
| **`restriction_range_ids`** | JSONB | **הבלוקים שההגבלה חלה עליהם (`zone_altitude_ranges.id`). המנגנון של אזור **מפוצל** - בחירה מרובה בתפריט. ריק = מכריע הטווח המספרי** |
| **`restriction_alt_min`** | INTEGER | **טווח חופשי ברום טיסה, לאזור **לא מפוצל** שאין לו בלוקים לסמן** |
| **`restriction_alt_max`** | INTEGER | **הגבול העליון. הכול ריק (בלוקים + טווח) = ההגבלה חלה על **כל** הגבהים (סגירה גורפת)** |
| `updated_at` | TIMESTAMPTZ | חותמת |

> **אזור סגור / אזור מוגבל.** סגירה היא כמעט תמיד סגירה של **מרחב גובה** ולא של
> עמוד האוויר כולו ("סגור מ-100 עד 140"), ולכן לה טווח משלה - וטווח ריק הוא
> הסגירה הגורפת. מכאן שאותו אזור סגור לפ"מ ב-120 ופתוח לפ"מ ב-200, ואזור
> **מפוצל** לבלוקי גובה יכול להיות סגור בבלוק אחד ופתוח באחר.
>
> | מצב | שיוך פ"מ | התראה (**חלון קופץ**) | `activity_log` |
> |---|---|---|---|
> | `closed` | **נחסם** | "האזור סגור - השיוך נדחה" | `zone_closed_blocked` |
> | `closed`, והאזור נסגר **מתחת** לפ"מ שכבר בו | נשאר | "אויש אזור סגור" (חלון אחד לכל הפ"מים) | `zone_closed_manned` |
> | `restricted` | מותר | "שים לב - גררת לאזור מוגבל", עם ה**גבהים הפתוחים** והערת המגבלה | `zone_restricted_manned` |
>
> **ההכרעה היא ברמת הרצועה.** במפה המפוצלת לגבהים, הרצועה שעליה שוחרר הפ"מ היא
> מה שנשאל - ולא האזור כולו: רצועה סגורה חוסמת, ורצועה פתוחה **באותו אזור**
> ממשיכה לקבל. ראה `bandRestrictionKind`.
>
> ההבדל בין השניים הוא **מי מכריע**: באזור סגור המערכת מכריעה שלא, ובאזור מוגבל
> היא מוסרת את ההכרעה לפקח ומוודאת שהוא יודע.
>
> ההכרעה עצמה יושבת ב-[`src/utils/zoneRestriction.ts`](src/utils/zoneRestriction.ts)
> (טהורה, 40 בדיקות): הבלוק שהפ"מ הוקצה לו גובר על הגובה הרשום בפ"מ, וכשאין
> לא בלוק ולא גובה - **ההגבלה חלה** (ברירת המחדל הבטוחה: התראה מיותרת היא רעש,
> התראה שלא נשמעה היא פ"מ באזור סגור).
>
> ⚠️ **המצב וההיקף נכתבים בנפרד, והשרת הוא בעל המצב.** "היקף" = הבלוקים
> (`restriction_range_ids`) ו/או הטווח המספרי; שליחת אחד מהם מאפסת את השני, כי
> הם שני ניסוחים של אותה שאלה. `PATCH /operational` עם `restriction` בלבד שומר
> את ההיקף; עם היקף בלבד שומר את המצב (ואזור פתוח הופך ל-`restriction_if_open`,
> ברירת מחדל `restricted`); עם `restriction: ''` פותח ומנקה את ההיקף. הלקוח
> **אינו** מצרף את המצב הנוכחי לכתיבת היקף - אחרת state ישן בו היה מוריד אזור
> סגור ל"מוגבל", וזה קרה בפועל (ראה REFACTOR_LOG).
>
> **ההגבלה נמשכת בפולינג** מ-`GET /api/map-zones/operational?map_id=` (כל
> 5 שניות) - `map_zones` עצמה נטענת פעם אחת בלבד, ובלי הנתיב הקל הזה סגירה
> שנקבעה בעמדה אחת לא הייתה מגיעה לשאר עד רענון ידני.

> **למה הטבלה הזו קיימת:** שני השדות ישבו כעמודות על `map_zones`, שהיא
> **קונפיגורציה** ויושבת ב-`public` בלבד. הם נקבעים **חי בעמדה** (קליק ימני),
> ולכן עמדה בסביבת **תרגול** שהגבילה גובה שינתה את האזור **האמיתי**. הסיווג
> ב-`env-tables.js` הוא ברמת טבלה ולא ברמת עמודה, ולכן הזליגה חמקה ממנו.
> אותה תבנית כמו `blocks` (תפעולי) מול `block_spaces`/`block_tables` (קונפיג).
>
> העמודות הישנות ב-`map_zones` נשארו **deprecated לקריאה בלבד** (גיבוי הנתונים
> ההיסטוריים); `initDb` מעביר מהן את המצב הקיים פעם אחת, ואין כותב אליהן.
> `GET /api/map-zones` משרג את השדות חזרה לתוך האזור, ולכן חוזה ה-API לא השתנה.
> נשמר ע"י [env-isolation.integration.test.js](server/db/env-isolation.integration.test.js).

### טבלת `zone_altitude_ranges` — גובה (בלוק) בעל שם באזור

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `zone_id` | INT → map_zones | האזור (CASCADE) |
| `name` | VARCHAR(100) | שם הגובה (למשל "גבוה"/"נמוך") |
| `alt_min`, `alt_max` | INTEGER | טווח הגובה ב**רום טיסה** (מאות רגל): `140` = FL140 = 14,000 רגל. כך בכל 96 השורות בפועל ("נמוך" 100-140, "גבוה" 150-400), וכך גם `strips.alt` (`FL235`/`090`/`310`). **התמונ"א היא החריג היחיד** - היא מגיעה מהמאגר ברגל, ולכן כל השוואה בינה לבין בלוק חייבת לעבור ב-`blockAltFeet` (`src/airPicture/zoneWatch.ts`) |
| `sort_order` | INT | סדר תצוגה (עליון→תחתון) |

> **הבלוקים עוברים בירושה לתת-מפות.** אזור בתת-מפה מצביע על אזור-האב ב-`parent_zone_id`,
> ו-[`server/utils/zoneAltInherit.js`](server/utils/zoneAltInherit.js) מחיל את בלוקי האב
> על כל צאצאיו (לכל עומק). שני מצבים: **מראה** (`mirror`) בעריכת בלוק על האב - כולל
> מחיקה; **מילוי** (`fill`) בסנכרון שם/צבע/פוליגון וביצירת אזור-ילד - ילד שכבר יש לו
> בלוקים משלו לא נדרס. ההתאמה **לפי שם הבלוק** והשורה מתעדכנת במקומה, כדי ש-
> `strip_zone_assignments.altitude_range_id` (ON DELETE SET NULL) לא יתאפס ופ"מ מוצב
> לא ייפול מהבלוק שלו.

### טבלת `strip_zone_assignments` — הצבת פ"מ על אזור (הפ"מ המפה)

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `strip_id` | INT → strips | הפ"מ (CASCADE, UNIQUE — הצבה אחת לפ"מ) |
| `zone_id` | INT → map_zones | האזור (nullable — פ"מ מחוץ לאזור) |
| `altitude_range_id` | INT → zone_altitude_ranges | הבלוק/גובה שהפ"מ נמצא בו (ON DELETE SET NULL) |
| `status` | VARCHAR(50) | בדרך לאזור / באזור / עוזב אזור |
| `note`, `coordination_note`, `is_coordinated` | — | הערות ותיאום קונפליקט |
| `pos_x`, `pos_y` | FLOAT | מיקום עוגן על המפה |
| `requested_zone_ids` | JSONB | אזורים מבוקשים נוספים |
| `map_id` | INT | מפה (לפ"מ ללא אזור) |
| `preset_id` | INT → workstation_presets (SET NULL) | **העמדה שחיברה את הפ"מ לאזור.** מרכיב של "נמצא בעמדה" (ראה §`at_preset_names`). עדכון שמגיע בלי הערך משמר את הקיים (`COALESCE`), כדי שעריכת הערה לא תמחק את המחזיק |

> **חריגה מבלוק:** פ"מ נחשב חורג אם גובהו (`strips.alt`) אינו נופל באף `zone_altitude_ranges`
> של האזור, **או** אם ה-`altitude_range_id` שלו אינו ב-`map_zones.active_alt_range_ids` (מוגבל).

> **`status` נכתב גם אוטומטית.** כשתמונ"א דולקת במוד אזורים, מנוע הזיהוי
> ([src/airPicture/zoneWatch.ts](src/airPicture/zoneWatch.ts)) מעדכן את השדה לפי מיקומו
> של **הרכיב האווירי** בפועל: `בדרך לאזור` → `באזור` → `עוזב אזור` (חריגת בלוק גובה
> נכתבת גם היא כ`עוזב אזור` - "כאילו חרג מהאזור"). הכתיבה עוברת ב-
> `PATCH /api/strip-zone-assignments/:strip_id/status` (שדה אחד, בלי upsert) ומבוצעת
> **רק ע"י העמדה שב-`preset_id`** - אחרת כל עמדה שרואה את האזור הייתה שולחת את אותה
> כתיבה. בלי תמונ"א הערך נשאר מה שהבקר קבע ידנית בתפריט ה-⋮.

---

## נקודות העברה קבועות על המפה — `map_transfer_points`

עד להוספת הטבלה, נקודת ההעברה נגררה למפה **ידנית בכל משמרת** ולא נשמרה בשום מקום
(`neighborPins`/`neighborMarkers` היו state בלבד ב-SectorDashboard). כאן היא מוגדרת פעם
אחת ב"ניהול עמדה" (עורך המפה) ונטענת אוטומטית בכל כניסה לעמדה.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `map_id` | INT → maps | המפה (CASCADE) |
| `preset_id` | INT → workstation_presets | **NULL = ברירת מחדל למפה** (חלה על כל עמדה שמשתמשת בה); מלא = דריסה של עמדה מסוימת (CASCADE) |
| `sector_id` | INT → sectors | נקודת ההעברה (סקטור) (CASCADE) |
| `sub_label` | VARCHAR(50) | NULL = הנקודה השלמה; אחרת תת-נקודה (`sub_sectors.label`) |
| `x_pct`, `y_pct` | FLOAT | מיקום באחוזי **תמונת המפה** (0-100) — יציב לשינוי גודל מסך |
| `lat`, `lon` | DOUBLE PRECISION | נ"צ, נגזר מעוגני המפה כשהיא מכוילת. העוגן המועדף בזמן ריצה |
| `display_mode` | VARCHAR(10) | `arrow` (חץ) / `full` (פאנל מלא) |
| `created_at` | TIMESTAMPTZ | חותמת |

**אינדקסים:** `uq_map_transfer_points` ייחודי על `(map_id, COALESCE(preset_id,0), sector_id, COALESCE(sub_label,''))`
— מאפשר UPSERT אמיתי; ועוד אינדקסים על `map_id` ו-`preset_id`.

**מיזוג (השרת):** `GET /api/map-transfer-points?map_id=&preset_id=` מחזיר את התמונה
**האפקטיבית** — ברירת המחדל של המפה, כשדריסת העמדה מחליפה את הנקודה המקבילה
(`is_override: true`). מחיקת דריסה מחזירה לברירת המחדל של המפה.

**זמן ריצה:** הנקודות נזרעות ל-pins/markers של המפה בכניסה לעמדה. הזזה או הסרה במהלך
המשמרת נשארות **זמניות** (state בלבד, לא נשמרות); כפתור ⟲ בפאנל נקודות ההעברה מחזיר
למיקום הקבוע.

---

## הקפות — `airfield_patterns` ו-`airfield_pattern_elements`

**הקפה** היא המסלול המלבני שטס מטוס סביב המסלול: אחרי המראה -> צולבת -> עם הרוח ->
בסיס -> פיינל, כשהפיינל מצביע חזרה למסלול. היא רובד נוסף על יישות שדה התעופה
בעמדת הניהול, ומשויכת ל**קצה מסלול** (`33`) ולא לזוג (`33/15`) — לכל קצה הקפה משלו,
וזה מה שמאפשר "שכפול הקפה הפוכה" שנותן את השם ההופכי (33 -> 15).

### טבלת `airfield_patterns` — הקפה

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `airfield_id` | INT → airfields | השדה (CASCADE) |
| `runway_id` | INT → airfield_runways | המסלול. **SET NULL** ולא CASCADE: מחיקת מסלול מנתקת את ההקפה, לא מוחקת את השרטוט |
| `runway_ident` | VARCHAR(10) | קצה המסלול (`33`, `09L`). ריק = הקפה משוכפלת שעוד לא שויכה |
| `color` | VARCHAR(20) | צבע השרטוט והתוויות על המפה |
| `geometry` | JSONB | פרמטרי ההקפה: `{anchor:{x,y}, bearing, side, rwyLen, upwind, width, baseExt}`. **זהו מקור האמת** |
| `points` | JSONB | שש הנקודות הנגזרות באחוזי תמונה — כדי ששכבת תצוגה תצייר בלי לחשב יחס תמונה |
| `downwind_alt_ft` | INT | גובה צלע "עם הרוח", רגל **מעל פני השדה**. NULL = לא הוגדר |
| `base_alt_ft` | INT | גובה צלע הבסיס, רגל **מעל פני השדה**. NULL = לא הוגדר |
| `sort_order` | INT | סדר בטבלה |
| `created_at` | TIMESTAMPTZ | חותמת |

**גבהי ההקפה על ההקפה ולא על השדה:** לשדה יש מסלול לכל כיוון והקפת ימין/שמאל, ולכל
אחת גובה משלה. `NULL` נופל לברירת מחדל **3000 / 1500 רגל** ב**קוד**
(`DEFAULT_ALT_PROFILE` ב-`src/utils/pattern3d.ts`) ולא ב-DDL — כך אפשר לשנות את
ברירת המחדל בלי מיגרציה, ו"לא הוגדר" נשאר מובחן מ"הוגדר במקרה לאותו ערך". הערכים
נצרכים רק בתצוגת **ההקפה התלת מימדית**; המבט מלמעלה שטוח ואינו יודע עליהם.
ה-`PUT` מעדכן אותם **רק כשהם נשלחו** (`CASE WHEN ... THEN ... ELSE <עמודה>`), אחרת
שמירה ממסך שאינו מכיר אותם הייתה מאפסת את ההגדרה בשקט.

**למה פרמטרים ולא רשימת נקודות חופשית:** הקפה היא צורה מוגדרת — חמש צלעות בזוויות
ישרות סביב ציר המסלול. שש נקודות חופשיות היו נשברות בגרירת פינה אחת, ו"שכפול הפוך"
היה צריך לנחש איזו נקודה היא הסף. עם המודל הפרמטרי, גרירת פינה מאריכה רק את הצלעות
הצמודות, סיבוב הוא שינוי מספר אחד, והשיקוף הוא: עוגן -> הקצה השני, כיוון +180°, צד
מתחלף. הלוגיקה כולה ב-`src/utils/trafficPattern.ts` (52 בדיקות) — גם השרת מסתמך עליה
ואינו מחשב גאומטריה בעצמו.

**⚠ יחידות:** האורכים ב-`geometry` הם ב**אחוז מגובה** תמונת המפה, לא אחוז מרוחבה.
שכבת ה-SVG היא `preserveAspectRatio="none"`, ומלבן אמיתי על הקרקע הוא מלבן בפיקסלים —
לכן החישוב עובר למרחב איזוטרופי (`x_iso = x_pct * aspect`) וכל פונקציה מקבלת `aspect`.

### `airfields.elev_ft` — גובה פני השדה (רגל)

| עמודה | סוג | תיאור |
|---|---|---|
| `elev_ft` | INT | גובה פני השדה ברגל. NULL = לא הוגדר → 0 |

נדרש בגלל ש**שתי מערכות גבהים** נפגשות באותה תצוגה: בלוקי נקודת ההצטרפות הם גובה
**מוחלט** (`alt_min_ft`/`alt_max_ft`, מוצג `040`), וגבהי ההקפה הם **מעל פני השדה**.
בלי גובה השדה אי אפשר לשים את שניהם על אותו ציר, וההשוואה ביניהם בתצוגה התלת מימדית
הייתה שקרית. ההמרה: `aglOf(altFt, elevFt) = altFt - (elevFt ?? 0)`
(`src/utils/pattern3d.ts`). נערך בטופס השדה ב"ניהול שדה תעופה", מאומת `0..15000`.

### טבלת `airfield_pattern_elements` — אלמנט של הקפה

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `pattern_id` | INT → airfield_patterns | ההקפה (CASCADE) |
| `name` | VARCHAR(200) | שם האלמנט |
| `icon` | VARCHAR(200) | אמוג'י |
| `color` | VARCHAR(20) | צבע |
| `x_pct`, `y_pct` | FLOAT | מיקום באחוזי תמונת המפה. NULL = עוד לא מוקם |
| `sort_order` | INT | סדר |
| `created_at` | TIMESTAMPTZ | חותמת |

האלמנט שייך **אך ורק להקפה הספציפית** (ולכן למסלול הספציפי) — לא לשדה. לכן הוא
בטבלה נפרדת עם FK CASCADE להקפה ולא ב-`airfield_elements`, ולכן גם **שכפול הקפה אינו
מעתיק אלמנטים**: מועתק השרטוט בלבד.

> שתיהן טבלאות **קונפיגורציה** (`server/db/env-tables.js`): שרטוט הגדרה של השדה,
> כמו מסלולים ונתיבים — ב-public בלבד, משותף לכל סביבות התרגול.

---

## נקודות הצטרפות (STAR) — `airfield_joining_points` ומשפחתה

**נקודת הצטרפות** היא נקודת כניסה לשדה שבה מטוסים מצטרפים לתנועת השדה. היא
**דומה לנקודת העברה** — מקבלת פ"ממים מעמדה אחרת דרך **אותו מנגנון העברות** —
אבל **התצוגה שונה**: הנקודה נפרסת ל**טבלת בלוקי גבהים**, ופ"מ יושב בבלוק לפי
גובהו. רלוונטית רק לעמדה מסוג **שדה** (`preset_type='ground'`).

**הנקודה שייכת לשדה ולא לעמדה**, בדיוק כמו מסלולים והקפות: עמדה רואה אותה דרך
השדה שלה. זה הלקח מ**קישורי המסלולים** — הצמדת ההגדרה לעמדה אפשרה לשתי עמדות
באותו שדה לחלוק על מה שקיים בשדה. לעמדה נשארת **דריסת תצוגה** בלבד.

### טבלת `airfield_joining_points` — הנקודה

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `airfield_id` | INT → airfields | השדה (CASCADE) |
| `name` | VARCHAR(100) | שם ה-STAR / נקודת ההצטרפות |
| `alt_min_ft`, `alt_max_ft` | INT | טווח הגבהים **ברגל** (4000–10000). התצוגה במאות (`040`–`100`) |
| `default_step_ft` | INT | הפרש ברירת מחדל בין בלוקים (1000 רגל) |
| `sector_id` | INT → sectors | **נקודת המעבר המקושרת** (SET NULL). ממנה מגיעים הפ"ממים לשורה העליונה |
| `sub_label` | VARCHAR(50) | תת-נקודה (`sub_sectors.label`), NULL = הנקודה השלמה |
| `x_pct`, `y_pct` | FLOAT | הדקירה על מפת השדה באחוזי תמונה. NULL = לא ממוקמת, לא מוצגת על המפה |
| `color` | VARCHAR(20) | צבע הסמן והטבלה |
| `sort_order` | INT | סדר |
| `created_at` | TIMESTAMPTZ | חותמת |

### טבלת `joining_point_alt_steps` — הפרש גבהים לפי טווח

הפרש הגבהים **אינו קבוע** לאורך הנקודה: אפשר 1000 רגל בין 4000 ל-7000 ו-500 רגל
בין 7000 ל-10000. טווח שאינו מכוסה נופל ל-`default_step_ft`.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `joining_point_id` | INT → airfield_joining_points | הנקודה (CASCADE) |
| `from_ft`, `to_ft` | INT | הטווח ברגל |
| `step_ft` | INT | ההפרש בתוך הטווח |
| `sort_order` | INT | סדר |

> הטווחים **אינם חופפים** — חפיפה נחסמת בשמירה. בניית הבלוקים עצמה היא לוגיקה
> טהורה ב-[src/utils/joiningPoints.ts](src/utils/joiningPoints.ts) ונבדקת ב-vitest.

### טבלת `joining_point_preset_overrides` — דריסת עמדה

**תצוגה בלבד** (מיקום ומצב פרוס/מכווץ). ההגדרה עצמה נשארת אחת לשדה, כדי שלא
ייווצרו שני מקורות אמת לטווח הגבהים או לנקודה המקושרת.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `joining_point_id` | INT → airfield_joining_points | הנקודה (CASCADE) |
| `preset_id` | INT → workstation_presets | העמדה הדורסת (CASCADE) |
| `x_pct`, `y_pct` | FLOAT | מיקום חלופי |
| `display_mode` | VARCHAR(10) | `pin` (סמן מכווץ) / `full` (טבלה פרוסה) |
| `updated_at` | TIMESTAMPTZ | חותמת |

**אינדקס:** `UNIQUE(joining_point_id, preset_id)` — UPSERT אמיתי.

### טבלת `joining_point_strips` — פ"מ בנקודה (תפעולי)

> **הגובה בפועל אינו נשמר כאן.** השיבוץ לבלוק כותב ל-`strips.alt` — הגובה שכל
> המערכת כבר מציגה ומזהה לפיו קונפליקטים. הטבלה מחזיקה **שיוך, תוכנית ותיאום**.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `joining_point_id` | INT → airfield_joining_points | הנקודה (CASCADE) |
| `strip_id` | INT → strips | הפ"מ (CASCADE) |
| `planned_alt` | VARCHAR(10) | **הגובה שתוכנן בבלוק.** גובר על `strips.alt` בקביעת מיקום הפ"מ בטבלה |
| `is_coordinated` | BOOLEAN | קונפליקט **אושר כמתואם** — מסיר את האדום ומשאיר סימון תיאום |
| `coordination_note` | TEXT | הערת התיאום |
| `created_at`, `updated_at` | TIMESTAMPTZ | חותמות |

**אינדקס:** `UNIQUE(joining_point_id, strip_id)`.

> **למה `planned_alt` ולא `strips.alt` בלבד:** נקודת הצטרפות היא לעתים גם
> **נקודת העברה**, והפקח מתכנן את הפ"מ לבלוק **לפני** הקבלה — בזמן שהגובה
> ב-`strips.alt` עדיין שייך לעמדה המוסרת, וכתיבה אליו הייתה משנה לה את המידע
> מתחת לידיים. לכן זו **תוכנית** ולא מצב: השרת כותב ל-`strips.alt` רק כשהפ"מ
> כבר בעמדה שלי, בקבלה התוכנית היא שנכתבת (**"הגובה שתוכנן הוא הקובע"**), ועד
> אז פער בינה לבין הגובה שנשלח הוא **התראה** בממשק (`altMismatch`).

### טבלת `joining_point_aircraft` — מטוס בודד בהצטרפות (תפעולי)

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `joining_point_id` | INT → airfield_joining_points | הנקודה שממנה הגיע (**SET NULL**) |
| `strip_id` | INT → strips | הפ"מ (CASCADE) |
| `aircraft_idx` | INT | `strip_aircraft.idx` |
| `runway_ident` | VARCHAR(10) | קצה המסלול שנבחר לנחיתה (`33R`) |
| `pattern_id` | INT → airfield_patterns | ההקפה (SET NULL) |
| `in_pattern` | BOOLEAN | FALSE = נגרר להקפה, מסגרת מקווקוות; TRUE = **בהקפה**, מסגרת קבועה ויצא מהטבלה |
| `pattern_frac` | FLOAT | מיקום על צלע "עם הרוח" (0..1) |
| `alt` | VARCHAR(10) | **גובה חריג למטוס הבודד** - פיצול המבנה בין שני בלוקים. NULL = הולך עם הפ"מ |
| `updated_at` | TIMESTAMPTZ | חותמת |

> **פיצול מבנה בין שני גבהים** אינו מפצל את הפ"מ לשתי רשומות: המטוסים שנבחרו
> מקבלים `alt` משלהם, והפ"מ מופיע בשני הבלוקים - "בננה/1+2" בגובה אחד
> ו"בננה/3+4" באחר, בדיוק כמו על הסדק. הפ"מ נשאר פ"מ אחד לכל שאר המערכת.

**אינדקס:** `UNIQUE(strip_id, aircraft_idx)` — **המפתח הוא המטוס ולא הנקודה**:
מטוס שנכנס להקפה עוזב את טבלת נקודת ההצטרפות אבל נשאר על ההקפה, ולכן המצב חייב
לשרוד את היציאה מהנקודה. לכן גם `joining_point_id` הוא SET NULL ולא CASCADE.

### `strip_aircraft.flight_status`

`VARCHAR(20) DEFAULT 'none'` — `none` / `greens` (ירוקים) / `cleared_to_land`
(אישור לנחות) / `landed` (נחיתה). הסטטוס הוא של ה**מטוס** ולא של ההצטרפות
("זה עובר לסטטוס מטוס") ולכן יושב על `strip_aircraft` ונשאר גם אחרי שהמטוס
עזב את הנקודה.

> **סיווג סביבות:** שלוש טבלאות ההגדרה הן **קונפיג** (ב-public בלבד);
> `joining_point_strips` ו-`joining_point_aircraft` הן **תפעוליות** ומבודדות
> לכל סביבת תרגול, כמו `blocks` ו-`strip_transfers`.

---

## מצב משותף למסלולי המראה מקושרים — `runway_end_use` ו-`runway_notams.link_uid`

אותו מסלול פיזי מוגדר בשני שדות בשמות שונים, ו**קישור מסלולים** מצהיר שהם אותו
דבר. מרגע שקושרו, מצב המסלול הוא מצב **פיזי אחד**: סגור אצל אחד = סגור אצל השני,
אותן נורות, ואותו כיוון בשימוש. הגשר הוא **מסלול הראי**: מסלול המראה -> הראי שלו
ב"מסלולי הסעה" -> קבוצת הקישור -> הראי השכן -> מסלול ההמראה שלו
([server/utils/linkedRunways.js](server/utils/linkedRunways.js)).

### טבלת `runway_end_use` — איזה קצה בשימוש

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `runway_id` | INT → airfield_runways | המסלול (CASCADE) |
| `end_name` | VARCHAR(20) | שם הקצה כפי שהוא מוגדר **באותו שדה** ('15L') |
| `in_takeoff` | BOOLEAN | בשימוש להמראה |
| `in_landing` | BOOLEAN | בשימוש לנחיתה |
| `updated_at` | TIMESTAMPTZ | חותמת |

**`UNIQUE(runway_id, end_name)`**. הטבלה **תפעולית** (`env-tables.js`) — מבודדת פר
סביבת תרגול, כמו הסגירות והתאורות.

עד 05.08.2026 זה היה **מצב סשן בלקוח בלבד**: לא נשמר, לא נראה בעמדה שכנה, וממילא
לא היה מה לסנכרן. **כיוון אחד למסלול:** הפעלת קצה מכבה את הנגדי — גם בהמראה וגם
בנחיתה, גם אצלי וגם אצל המקושר (הכלל נאכף גם בלקוח, `src/utils/runwayEnds.ts`).

**מיפוי קצוות בין שדות:** לפי **המספר** ולא לפי המיקום ('15L' אצלי = '15' אצלו),
כי שדה אחד יכול להגדיר `heading_a='18'` והשני `heading_a='36'` — התאמה לפי מיקום
הייתה מפעילה את הקצה ההפוך.

### הפתרון בקריאה, ולא העתקה בכתיבה

**המימוש הראשון העתיק** את המצב לכל המסלולים המקושרים ברגע הכתיבה, ונשבר בדיוק
במקום שבו הפקח נתקל בו: **מידע שכבר היה לפני שהקישור נוצר לא זז**, וקישור חדש
לקבוצה קיימת נשאר ריק עד ש"מאפסים ומזינים מחדש". גם ביטול קישור השאיר עותקים
שאיש לא ידע שהם עותקים.

מ-05.08.2026 **אין עותקים**: השורה נשמרת היכן שנכתבה, וכל קריאה מרכיבה את מצב
הקבוצה. קישור חדש רואה מיד את המידע הקיים, וביטול קישור מפריד מיד.

| מה חוזר בקריאה | |
|---|---|
| `runway_id` | ממופה למסלול **המקומי** — הלקוח ממשיך לפתח לפיו בלי שינוי |
| `id` | של השורה **המקורית** — עריכה ומחיקה חלות על שני הצדדים |
| `heading` / `end_name` / `shorten_end` | ממופים לשמות/מיקומי הקצוות של השדה ששואל |
| `source_runway_id`, `source_airfield_name`, `is_linked` | מי כתב את זה — כדי שהפקח לא ינחש למה המסלול שלו סגור |

**כללי הכרעה בתוך הקבוצה:** NOTAM = **איחוד** (שלי ראשון) · GRF = **הדיווח האחרון**
לכל קצה · תאורות = **העדכון האחרון** · מסלולים בשימוש = **כיוון אחד למסלול**,
האחרון גובר · אמצעי נחיתה = **העדכון האחרון** לכל (קצה, אמצעי). NOTAM של קיצור
שאי אפשר למפות את קצהו **נופל** — עדיף בלי קיצור מאשר קיצור בקצה ההפוך.

**כתיבה היא תמיד מקומית** (`INSERT`/`UPDATE`/`DELETE` על המסלול שבו נכתבה), ולכן
אין מה שיתיישן. הקריאה מרוכזת ב-[server/utils/runwayState.js](server/utils/runwayState.js),
ובדיקת שומר נכשלת על `SELECT ... FROM runway_notams|runway_grf|runway_lighting|runway_end_use|runway_aid_status`
ישיר בקובץ ראוט — קריאה כזו מחזירה רק את המסלול המקומי ומפספסת בשקט את המקושר.

| עמודה | סוג | תיאור |
|---|---|---|
| `runway_notams.link_uid` | UUID, nullable | **legacy**: קישר בין העותקים במימוש הישן. אינו נכתב יותר; שימש למיגרציה שמחקה את העותקים הכפולים |

---

## אמצעי נחיתה — `airfield_runways.aids_a/aids_b` + `runway_aid_status`

ILS / LOC / GS / VOR / TACAN. **אמצעי שייך לקצה נחיתה ולא למסלול**: ה-ILS של 27
וה-ILS של 09 הם התקנות נפרדות עם סטטוס נפרד.

### הגדרה — על המסלול (קונפיג)

| עמודה | סוג | תיאור |
|---|---|---|
| `airfield_runways.aids_a` | JSONB | מערך קודים לקצה A, בסדר התצוגה (`["ILS","GS"]`) |
| `airfield_runways.aids_b` | JSONB | אותו דבר לקצה B |

נקבע בעמדת הניהול, בתוך תיבות "צד A"/"צד B" של טופס המסלול. השרת מנקה את הרשימה
(רק סוגים מוכרים, אותיות גדולות, בלי כפילויות) — ערך אחר לא נשמר.

### סטטוס — טבלה תפעולית

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `runway_id` | INT → airfield_runways | המסלול (CASCADE) |
| `end_side` | VARCHAR(1) | `'a'` / `'b'` — **מיקום** הקצה, כמו `runway_notams.shorten_end` |
| `aid_type` | VARCHAR(10) | ILS / LOC / GS / VOR / TACAN |
| `status` | VARCHAR(16) | `ok` (תקין) · `unserviceable` (לא שמיש) · `maintenance` (אחזקה) · `restricted` (תקין מוחרג) |
| `note` | TEXT | הערת ההחרגה. נשמרת **רק** ב-`restricted`, ונמחקת בכל מעבר לסטטוס אחר |
| `updated_at` | TIMESTAMPTZ | חותמת — היא שמכריעה בין מסלולים מקושרים |

**`UNIQUE(runway_id, end_side, aid_type)`**. הטבלה **תפעולית** — מבודדת פר סביבת
תרגול, והקריאה עוברת ב-`resolveAidStatus` כמו שאר מצב המסלול.

**ההגדרה קובעת מה מוצג:** אמצעי מוגדר בלי שורת סטטוס מוצג כתקין, ושורת סטטוס
לאמצעי שהוסר מההגדרה נמחקת בעדכון המסלול — כך אין "אמצעי רפאים" ואין סטטוס ישן
שקם לתחייה כשמגדירים מחדש אותו אמצעי.

**התצוגה:** על המסלול (מפת השדה ודיאגרמת הווידג'ט בעמדה), בין הזברה למספר הכיוון
ובכיוון המסלול. ירוק = תקין · אדום + X = לא שמיש · אדום בלי X = אחזקה · כתום =
תקין מוחרג, וה-HINT נושא את הערת ההחרגה
([src/utils/runwayAids.ts](src/utils/runwayAids.ts), [src/components/map/RunwayLayer.tsx](src/components/map/RunwayLayer.tsx)).

---

## מסלול המראה כמסלול הסעה — `airfield_routes.source_runway_id`

מסלול המראה מוגדר ביישות **"מסלולים"** (`airfield_runways` — כיוונים, אורך, מרחקי
הכרזה), אבל **מסלולי ההסעה** (`airfield_routes`) הם השרטוט על המפה, ואליהם נקשרים
קישורי מסלולים, התראות המראה וקונפליקטים. עד 05.08.2026 ההגדרה הכפולה הייתה ידנית:
שם או קצה שהשתנו במקום אחד נשארו ישנים בשני, בשקט.

| עמודה | סוג | תיאור |
|---|---|---|
| `source_runway_id` | INT → airfield_runways, nullable | מסלול ההמראה שממנו נגזר המסלול (**CASCADE**). `NULL` = מסלול שנוצר ידנית ב"מסלולי הסעה" |

**מסלול ראי** נוצר ומתעדכן אוטומטית מ-`airfield_runways` ([server/utils/runwayRoute.js](server/utils/runwayRoute.js)):
`name` (או הקצוות אם אין שם), `is_runway=TRUE`, `end_a_name`/`end_b_name` מהכיוונים,
`route_path` = קו בין `start_*_pct` ל-`end_*_pct`, `route_category='aircraft'`, וצבע אחיד.
`notes` נושאת את **הערת המקור** ("נוצר אוטומטית מיישות 'מסלולים'...").

**אינו ניתן לעריכה במסלולי ההסעה:** `PUT`/`DELETE /api/airfield-routes/:id` מחזירים
**409 `route_from_runway`**, והממשק מציג 🔒 במקום כפתורי הפעולה. עורכים ביישות שממנה
הגיע; מחיקת המסלול שם מוחקת גם אותו (CASCADE).

**השרטוט נדרס רק כשליישות יש קואורדינטות** — מסלול שהוגדר בלי מיקום על המפה לא ימחק
שרטוט שכבר צויר ידנית.

**הגירה (רצה בעליית השרת):** לכל מסלול המראה קיים שאין לו ראי, `syncAllRunwayRoutes`
**מאמצת** מסלול הסעה מתאים (אותו שם, או אותם **שני** הקצוות) במקום ליצור כפילות,
ויוצרת רק כשאין. אידמפוטנטית. **בשכפול שדה** ה-`source_runway_id` מוסב למסלול ההמראה
של העותק — אחרת מחיקה בשדה המקורי הייתה מוחקת מסלול בעותק.

---

## קישורי מסלולים בין שדות תעופה — `route_link_groups` ו-`route_link_members`

אותו מסלול פיזי מוגדר בכמה שדות ב**שמות שונים**. קישור מצהיר שהם אותו דבר, כדי
שהתראות (למשל המראה פעילה) יחצו שדות — וממילא גם את העמדות שרואות אותם.

**המודל הקודם, `route_links`, היה זוגי** (`preset_id_a/route_id_a` מול
`preset_id_b/route_id_b`): קישור בין שלושה מסלולים דרש שלושה זוגות נפרדים, כל אחד
מהם ניתן היה למחוק לבד — ונשאר קישור חלקי בלי שאיש ידע. הטבלה נשארת בסכמה כמקור
להגירה בלבד; הקוד קורא מהקבוצות.

**החבר היה (עמדה + מסלול) — וזו הייתה טעות באפיון.** מסלול שייך ל**שדה**
(`airfield_routes.airfield_id`), ועמדה רק רואה אותו דרך השדה שלה. הצמדת עמדה לחבר
אפשרה קישור חלקי מסוג אחר: עמדה אחת בשדה "מקושרת" ושכנתה באותו שדה לא. מ-04.08.2026
החבר הוא **מסלול בלבד**, והשדה נגזר ממנו — כך אין שדה שסותר את המסלול שנרשם.

### טבלת `route_link_groups` — קישור אחד

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `name` | VARCHAR(100) | שם חופשי לקישור (אופציונלי) |
| `airfield_id` | INT → airfields | השדה שממנו נוצר הקישור (CASCADE). לתצוגה - הקישור מופיע גם בשדה של כל מסלול שבו |
| `migrated_from_link_id` | INT | ה-`route_links.id` שממנו הוגר. אינדקס ייחודי חלקי - כך שהגירה חוזרת בעלייה אינה יוצרת כפילויות |
| `created_at` | TIMESTAMPTZ | חותמת |

### טבלת `route_link_members` — מסלול בתוך הקישור

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `group_id` | INT → route_link_groups | הקישור (CASCADE) |
| `route_id` | INT → airfield_routes | המסלול (CASCADE). **השדה נגזר ממנו** ואינו נשמר בנפרד |
| `preset_id` | INT, nullable | **היסטוריה בלבד** — העמדה מהמודל הישן. אינה נכתבת ואינה נקראת, ו**אין עליה FK** בכוונה: ב-CASCADE מחיקת עמדה הייתה מוחקת חברים בקישור ושוברת אותו בשקט |

**`UNIQUE(group_id, route_id)`** (אינדקס `uq_route_link_members_group_route`) — אותו
מסלול לא נכנס פעמיים לאותו קישור. **שני מסלולים שונים מאותו שדה מותרים**: שדה יכול
להחזיק שני מסלולים שמקושרים לאותו מסלול פיזי אצל שכנו.

**כללי תקינות (`src/utils/routeLinks.ts`, נאכפים גם בשרת):** לפחות שני מסלולים
**שונים**, ולכל חבר `route_id` תקין.

> המיגרציה ב-`init.js` רצה על `public` **ועל כל סכמות התרגול**: הסנכרון ב-`envs.js`
> רק *מוסיף* טבלאות/עמודות/FK ואינו יודע להסיר `NOT NULL` או להחליף אילוץ ייחודי —
> בלי זה שמירת קישור בסביבת תרגול הייתה נופלת על `preset_id NOT NULL`.

**חל על כל סוגי המסלולים:** הקישור אינו שייך ל"מסלולי הסעה" — `routeKind` מסווג
מסלול המראה / מטוסים / רכב / כללי, ו-`is_runway` גובר על `route_category`.

**צריכה:** `GET /api/active-takeoffs` מרחיב את מסלולי השדה לכל המסלולים שנמצאים
באותה קבוצה — כלומר קבוצה של שלוש עמדות נספרת במלואה, ולא רק בן-הזוג.

---

, נאכף גם בשרת) |
| `value` | JSONB | מחרוזת, בוליאני **או מערך** - לפי סוג הפקד |
| `updated_at` | TIMESTAMPTZ | חותמת עדכון |

**PK:** `(strip_id, preset_id, control_key)` · **אינדקס:** `preset_id` (טעינת לוח).
**אין שורה = ברירת המחדל של הפקד** ("מתאפס לב"מ"), ולכן היעדר שורה הוא מצב תקין ולא חוסר.
טבלה **תפעולית** - משוכפלת לכל `env_NN` (`OPERATIONAL_TABLES`).

נוסף על כך, `workstation_presets.civilian_strip_table_id` (INT → `classic_strip_tables.id`,
SET NULL) קובע איזו תבנית גריד הלוח האזרחי מצייר. ריק = הכרטיס האזרחי הקבוע הישן.

---

## מה קורה כשפ"מ מפוצל

**לפני פיצול** — פ"מ "חנית" עם 3 מטוסים:

```
strips:
  { id:10, callsign:"חנית", number_of_formation:"3",
    parent_strip_id: NULL, aircraft_indices: NULL,
    original_formation_count: NULL }

strip_aircraft:
  { strip_id:10, idx:1, datk:5, kipa:"..." }
  { strip_id:10, idx:2, datk:3, kipa:"..." }
  { strip_id:10, idx:3, datk:7, kipa:"..." }
```

**אחרי פיצול** — חלצו מטוס #1 מ"חנית":

```
strips (מקורי — מעודכן):
  { id:10, callsign:"חנית", number_of_formation:"2",
    parent_strip_id: 10,        ← מצביע על עצמו (root)
    aircraft_indices: [2, 3],
    original_formation_count: 3 }

strips (חדש — הנפרד):
  { id:11, callsign:"חנית", number_of_formation:"1",
    parent_strip_id: 10,        ← מצביע על root
    aircraft_indices: [1],
    original_formation_count: 3 }

strip_aircraft (מקורי — renumbered):
  { strip_id:10, idx:1 }   ← היה idx:2
  { strip_id:10, idx:2 }   ← היה idx:3

strip_aircraft (חדש):
  { strip_id:11, idx:1 }   ← תמיד idx=1 בפ"מ חדש
```

### כללי פיצול:
- שני הפ"מים (מקורי וחדש) מקבלים את אותו `parent_strip_id` (ה-root)
- `getSectorSiblings` מוצא אחים על ידי חיפוש כל הפ"מים עם אותו `parent_strip_id`
- `aircraft_indices` בכל פ"מ מכיל את **המספרים המקוריים** (לפני renumber)
- `idx` ב-`strip_aircraft` הוא **מספר סידורי חדש** בתוך הפ"מ הנוכחי (מתחיל מ-1)

---

## שם תצוגה — `getFormationDisplayName(strip)`

ערך **מחושב** (לא שדה ב-DB), בנוי מ-`callsign` + `aircraft_indices`:

```typescript
const base = strip.callsign          // "חנית"
const indices = strip.aircraft_indices  // [1, 2, 3]

return `${base}${indices.sort().join('+')}`
```

| מצב | `aircraft_indices` | תצוגה |
|---|---|---|
| פ"מ מלא (לא פוצל) | `NULL` | `"חנית"` |
| אחרי איחוד מלא | `NULL` | `"חנית"` |
| חלקי — מטוסים 1,2,3 | `[1,2,3]` | `"חנית1+2+3"` |
| חלקי — מטוס 1 בלבד | `[1]` | `"חנית1"` |
| חלקי — מטוסים 2,3 | `[2,3]` | `"חנית2+3"` |

---

## GAPI (GALAXY API) — אינטגרציה דו-כיוונית עם מערכת השו"ב

> חוזה מלא: [GAPI-CONTRACT.md](GAPI-CONTRACT.md). קוד: `server/gapi/*` + `server/routes/gapi.js`.
> כבוי כברירת מחדל (`enabled=false`). סנכרון פ"ממים/ספרורים/סטטוס בסיסים/מז"א/סגירות.

### `gapi_env_config` — control-plane פר-סביבה (public בלבד, ב-`IGNORED_EXACT`)
| עמודה | סוג | תיאור |
|---|---|---|
| `env_number` | INT PK (1–50) | הסביבה |
| `base_url` | TEXT | כתובת ה-GAPI instance של הסביבה |
| `hmac_secret` | TEXT | סוד חתימה (write-only; לא נחשף ב-GET) |
| `enabled` | BOOL DEFAULT false | דגל הפעלה |
| `subscription` | JSONB | הגדרת המנוי (מה לקבל) — נדחפת ל-GAPI |
| `last_cursor` | TEXT | watermark של reconciliation |
| `last_sync_at` | TIMESTAMPTZ | סנכרון אחרון |

### `gapi_outbox` — תור יציאה (operational, משוכפל פר-סביבה)
`id`, `entity`, `op`, `local_id`, `gapi_id`, `payload` JSONB, `attempts`, `last_error`, `next_attempt_at` TIMESTAMPTZ, `created_at`.

### `gapi_inbound_events` — דדופ אירועים נכנסים (operational, פר-סביבה)
`event_id` TEXT PK, `entity`, `gapi_id`, `version` BIGINT, `processed_at`.

### עמודות סנכרון על ישויות קיימות
`strips` / `serials` / `base_statuses` / `closures` קיבלו: `gapi_id` TEXT, `gapi_version` BIGINT, `gapi_synced_at` TIMESTAMPTZ (+ index על `gapi_id`).
## בד"ח ורשימת תיוג — `bdh_documents` ומשפחתה

**טבלה אחת לשני הסוגים.** ההבדל היחיד הוא `kind`; הסעיפים, השיוך לעמדות
וההתראות משותפים. סיווג בקוד: [src/utils/bdhDocs.ts](src/utils/bdhDocs.ts).

### טבלת `bdh_documents` — מסמך

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `name` | VARCHAR(200) | שם המסמך |
| `category` | VARCHAR(200) | קטגוריה (קיבוץ ברשימה; ריק = "כללי") |
| `title` | TEXT | כותרת מוצגת בראש המסמך |
| `kind` | VARCHAR(20) | `'bdh'` (ברירת מחדל) \| `'checklist'` (רשימת תיוג) |
| `created_by` / `updated_by` | INT → `crew_members` | מי יצר / מי עדכן |
| `created_at` / `updated_at` | TIMESTAMPTZ | חותמות |

> כל ערך שאינו `'checklist'` — כולל מסמכים שנוצרו לפני הוספת העמודה — הוא בד"ח.
> `PUT /api/bdh/:id` **לא** משנה `kind`: מסמך לא מחליף סוג אחרי יצירה.

### טבלת `bdh_items` — סעיף בתוך מסמך

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `bdh_id` | INT → `bdh_documents` (CASCADE) | המסמך |
| `order_index` | INT | סדר הצגה (גרירה בעורך) |
| `content` | TEXT | תוכן (HTML: bold/italic/underline) |
| `is_header` | BOOLEAN | כותרת קבוצה (מקפלת את הסעיפים שתחתיה) |

### טבלת `workstation_bdh` — שיוך מסמך לעמדה

| עמודה | סוג | תיאור |
|---|---|---|
| `preset_id` | INT → `workstation_presets` (CASCADE) | העמדה |
| `bdh_id` | INT → `bdh_documents` (CASCADE) | המסמך (משני הסוגים) |

> PK מורכב `(preset_id, bdh_id)`. העמדה טוענת את המשויכים לה ומפצלת אותם
> לשתי קטגוריות בעזרים: **רשימת תיוג** מעל **בד"ח**.

### טבלת `bdh_alerts` — הפצת התראה לעמדה אחרת (בד"ח בלבד)

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `target_preset_id` | INT → `workstation_presets` (CASCADE) | העמדה המקבלת |
| `message` | TEXT | נוסח ההתראה |
| `bdh_name` | VARCHAR(200) | שם המסמך שהופץ |
| `sender_preset_name` | VARCHAR(200) | העמדה השולחת |
| `strip_ref` | VARCHAR(200) | הפ"מ שאליו ההתראה מתייחסת |
| `dismissed` | BOOLEAN | האם נסגרה |
| `created_at` | TIMESTAMPTZ | חותמת (טבלה תפעולית — מבודדת פר-סביבת תרגול) |

---

## שיוך תוכן admin לבסיס אב — `parent_base_id` ב-4 טבלאות קונפיג

בסיס האב אינו רק תווית תצוגה: הוא **ציר הקיבוץ** במסך הניהול וגם **ציר ההרשאה**
של ראש צוות. אותה עמודה, באותה מוסכמה בדיוק כמו `workstation_presets.parent_base_id`
(`INTEGER`, **ללא FK אכיף** — צימוד רופף מול `aviation_bases`), נוספה ל:

| טבלה | מה מקבל בסיס אב |
|---|---|
| `maps` | מפה |
| `aid_groups` | קבוצת עזרים |
| `block_spaces` | מרחב בלוקים |
| `block_tables` | טבלת בלוקים |

**סמנטיקה:**

- `NULL` = **תוכן משותף שלא שויך** — גלוי לכל ראשי הצוות, מוצג בקבוצת
  "ללא בסיס אב" (אחרונה בכל רשימה). לא תוכן מסווג, אלא סל השאריות.
- ערך = התוכן שייך למכלול הזה, ורק מי שמורשה בו רואה אותו.

**חישוב ההרשאה** (`src/utils/presetGroups.ts`): המיראז' מאשר **עמדות**;
`allowedBaseKeys()` ממפה את העמדות המאושרות לבסיסי האב שלהן, ואישור לעמדה אחת
פותח את **כל בסיס האב שלה** לניהול. רשימת אישורים ריקה = אין הגבלה (מנהל מערכת,
וגם ראש צוות שלא הוגבל במיראז'). כל הסינון והקיבוץ חיים במודול הזה — אותו מודול
שמקבץ את בורר העמדה במסך הכניסה.

**שדות שנשלחים ב-API:** `parent_base_id` ב-`POST/PATCH /api/maps`,
`POST/PUT /api/aid-groups`, `POST/PUT /api/block-spaces`, `POST/PUT /api/block-tables`.
`PUT /api/aid-groups/:id` מעדכן את הבסיס **רק כשהשדה נשלח**, כדי ששינוי שם
לא ינתק קבוצה מהבסיס שלה. שכפול טבלת בלוקים משמר את הבסיס; שכפול קבוצת עזרים
לעמדה אחרת מקבל את הבסיס של **עמדת היעד**.

---

## סמלים — `aviation_bases.emblem_data` ו-`system_emblems`

הסמלים שמוצגים בכל עמדה (סמל בסיס האב + סמל מיח"ה) מנוהלים ממסך הניהול,
טאב **בסיסים**. מקור האמת הוא ה-DB; אם אין שם תמונה, נופלים לסמל המובנה בקוד
(`src/assets/emblems/files/`), ואם גם הוא חסר — ל-placeholder המצויר.

### `aviation_bases` — העמודות הרלוונטיות

| עמודה | סוג | תיאור |
|---|---|---|
| `emblem_data` | TEXT | סמל הבסיס כ-data URL (`data:image/webp;base64,...`). `NULL` = אין → מוצג הסמל המובנה. הלקוח מכווץ ל-350px לפני השמירה (`src/utils/emblemUpload.ts`), השרת מאמת סוג וגודל (`server/utils/emblemImage.js`, תקרה 2MB, **בלי SVG**) |
| `coord_n` / `coord_e` | VARCHAR(20) | נ"צ עשרוני. **היה VARCHAR(10)** — לא הכיל נ"צ מלא (`30.611944444444444`), וכל שמירת בסיס עם שניות נכשלה ב-500. המסך גם מעגל ל-6 ספרות (~10 ס"מ) |

### טבלת `system_emblems` — סמלים ברמת מערכת

| עמודה | סוג | תיאור |
|---|---|---|
| `key` | VARCHAR(50) PK | מזהה הסמל. כרגע `micha` בלבד (סמל מערך הבקרה, מוצג בכל עמדה) |
| `image_data` | TEXT NOT NULL | התמונה כ-data URL, אותה ולידציה כמו סמל בסיס |
| `updated_at` | TIMESTAMPTZ | חותמת עדכון |

> **למה טבלה ולא מפתח ב-`system_defaults`:** `GET /api/defaults` נטען בכל עמדה,
> ותמונה בתוכו הייתה מנפחת כל טעינת דשבורד בעשרות KB.

> **למה `GET /api/aviation-bases` לא מחזיר את התמונה:** הרשימה נטענת בכל כניסה
> לעמדה. היא מחזירה `has_emblem` (בוליאני מחושב) בלבד, והתמונה נמשכת כבינארית
> מ-`GET /api/emblems/base/:id` — כך הדפדפן מטמין אותה (ETag + `no-cache`).

> שתיהן טבלאות **קונפיגורציה** (`server/db/env-tables.js`): משותפות לכל סביבות
> התרגול ויושבות ב-public בלבד.

---

## יומן הביטול (CTRL+Z) — `undo_actions` ו-`undo_journal`

מה השתנה ב-DB בעקבות כל פעולה של מפעיל, כדי שאפשר יהיה להחזירה. האפיון המלא
ב-[UNDO_SPEC.md](UNDO_SPEC.md); כאן המבנה בלבד.

**שתי טבלאות ולא אחת:** התווית, הזהות והסטטוס שייכים ל**פעולה**; ה-before/after
שייכים ל**שורה**. פעולה אחת נוגעת בדרך כלל בכמה שורות.

**סביבות תרגול:** שתיהן **מוחרגות** מסקופ הסביבות (`IGNORED_EXACT` ב-
[`server/db/env-tables.js`](server/db/env-tables.js)) ויושבות ב-`public` בלבד —
הן נושאות עמודת `env` משלהן וכל הכתיבות אליהן מפורשות `public.`, ולכן שכפולן
לסכמת `env_NN` היה מפצל את היומן לשני עותקים שאיש אינו קורא. **בלי הסיווג הזה
`checkTableClassification` מפיל את עליית ה-DB כולה** — קרה בייצור, ראה
REFACTOR_LOG #045.

### טבלת `undo_actions` — פעולה אחת של מפעיל

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | TEXT PK | UUID שנוצר ב-middleware. זה הערך שיושב ב-`app.action_id` בטרנזקציה |
| `created_at` | TIMESTAMPTZ | מגדיר את חלון חמש הדקות |
| `env` | INTEGER | הסביבה שבה נעשתה. הבידוד בין תרגול לטס נאכף בסינון עליה |
| `station_key` | TEXT | מזהה **מושב העמדה** (כותרת `X-Station`). זו המחסנית |
| `crew_member_id` / `crew_name` | INTEGER / TEXT | מהאסימון החתום, **לא** מהלקוח |
| `method` / `path` | TEXT | בקשת ה-HTTP שיצרה את הפעולה |
| `label_key` / `label_params` | TEXT / JSONB | מפתח i18n לתווית שהמפעיל רואה (`server/undo/labels.js`) |
| `kind` | TEXT | `action` (ברירת מחדל). שמור להרחבה |
| `status` | TEXT | `active` · `undone` · `blocked` |
| `block_reason` | TEXT | `no_pk` (טבלה בלי מפתח ראשי) · `oversized` (שורה מעל 128KB) |
| `undone_at` | TIMESTAMPTZ | מתי בוטלה |

### טבלת `undo_journal` — שורה אחת שהשתנתה

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | BIGSERIAL PK | גם סדר הכתיבה. הביטול רץ בסדר **הפוך** עליו |
| `action_id` | TEXT | הפעולה שאליה השורה שייכת |
| `at` | TIMESTAMPTZ | עמודת הגיזום |
| `table_schema` / `table_name` | TEXT | היכן יושבת השורה המקורית — כך פעולה בתרגול שנגעה גם בטבלת הגדרות ב-`public` מתבטלת בשלמותה |
| `op` | CHAR(1) | `I` · `U` · `D` |
| `pk` | JSONB | המפתח הראשי, נשלף מהקטלוג. תומך במפתח מורכב |
| `before` / `after` | JSONB | `to_jsonb` של השורה. `before` ריק ב-INSERT, `after` ריק ב-DELETE |

> **שתיהן ב-`public` בלבד** ואינן משוכפלות לסכמות התרגול, בשונה משאר הטבלאות
> התפעוליות: פעולה אחת יכולה לגעת גם בטבלה תפעולית (`env_NN`) וגם בטבלת
> הגדרות (`public`), ויומן פר-סכמה היה **מפצל אותה לשניים** — ביטול היה מחזיר
> חצי. הבידוד נשמר בעמודת `env`.

> **ללא FK בין השתיים** — בכוונה. ה-FK היה נוסף בדיקה לכל שורה בנתיב הכתיבה
> החם, ושתי הטבלאות נגזמות לפי זמן ממילא.

> **גיזום:** עצל, לפני יצירת פעולה חדשה ולכל היותר פעם ב-30 שניות. אין cron
> ואין תהליך רקע: מערכת שאיש אינו עובד בה אינה צוברת דבר.

---

## הלאמת אזור זמני — `temp_zone_seizures` ו-`temp_zone_seizure_targets`

מרחב שעמדה תופסת לזמן קצוב, **מציירת ביד** על המפה ומפיצה לשאר העמדות.
אפיון מלא: [TEMP_ZONE_SEIZURE_SPEC.md](TEMP_ZONE_SEIZURE_SPEC.md).

> ⚠️ **מקור האמת הגיאומטרי הוא `polygon_geo` בנ"צ** ולא אחוזי תמונה. המרחב נולד
> כדי להיות מוצג על מפות **אחרות**, ואחוזי תמונה של מפה אחת חסרי משמעות על מפה
> שנייה. כל עמדה מקרינה את הנ"צ למפה שלה דרך העוגנים (`geoToImagePct`), בדיוק כמו
> אזור עם `polygon_geo`. `polygon` (אחוזי המפה של היוצר) נשמר לחלון "פתח מפה" בלבד.

### `temp_zone_seizures` — ההלאמה עצמה (טבלה **תפעולית**)

| עמודה | טיפוס | הערות |
|-------|--------|-------|
| `id` | SERIAL PK | |
| `name` | VARCHAR(120) | חובה |
| `purpose` | TEXT | "לטובת מה" |
| `color` | VARCHAR(20) | ב"מ `#f97316` |
| `alt_min` / `alt_max` | INTEGER | **רום טיסה**. שניהם `NULL` = כל הגבהים |
| `polygon_geo` | JSONB | `[{lat,lon}]` - **מקור האמת** |
| `polygon` | JSONB | `[{x,y}]` באחוזי המפה של היוצר - לחלון "פתח מפה" |
| `creator_preset_id` | INTEGER FK | העמדה היוצרת |
| `creator_preset_name` | VARCHAR(100) | נשמר כטקסט - שם העמדה בזמן האירוע |
| `creator_map_id` | INTEGER FK | המפה שעליה צויר |
| `phone` / `radio` | VARCHAR(60) | לבירור. ב"מ מ-`workstation_contacts` |
| `note` | TEXT | |
| `eta_end` | TIMESTAMPTZ | זמן סיום **משוער**. חלוף הזמן מתריע ליוצר, ואינו מפקיע |
| `to_all` | BOOLEAN | הפצה כללית |
| `status` | VARCHAR(12) | `active` \| `ended` |
| `created_at` / `ended_at` | TIMESTAMPTZ | |
| `ended_by_preset_id` | INTEGER | |

### `temp_zone_seizure_targets` — עמדת יעד ואישורה (טבלה **תפעולית**)

| עמודה | טיפוס | הערות |
|-------|--------|-------|
| `seizure_id` | INTEGER FK CASCADE | |
| `preset_id` | INTEGER FK CASCADE | `UNIQUE(seizure_id, preset_id)` |
| `acked` / `ack_note` / `acked_at` | BOOLEAN / TEXT / TIMESTAMPTZ | "ראיתי את ההגבלה" |
| `pins_in_zone` | INTEGER | כמה פ"מים אצל העמדה עדיין בתוך המרחב |
| `affected_zone_names` | JSONB | האזורים שלה שהמרחב חותך |
| `seen_end` | BOOLEAN | האם ראתה את הודעת "יצאה מתוקף" |

> **שורות היעד נוצרות ביצירת ההלאמה**, גם ב"הפצה כללית" - כדי שטופס האישורים
> אצל היוצר יידע את מי הוא מחכה. רשימה שנגזרת בזמן ריצה הייתה משתנה תחת ידיו
> כשעמדה נוספת נכנסת למערכת באמצע האירוע.

> **`pins_in_zone` נכתב על ידי העמדה עצמה** (`PATCH /:id/report`). לכל עמדה מפה,
> עוגנים ואזורים משלה, וחישוב מרכזי בשרת היה מנחש.

> **סיום אינו מחיקה:** `status='ended'` והשורה נשארת, כדי שהודעת "יצאה מתוקף"
> תגיע גם לעמדה שהייתה מנותקת ברגע הסיום. הניקוי בפועל הוא עבודה מחזורית
> (`cleanupEndedSeizures`) אחרי 24 שעות.

### `workstation_presets.can_seize_zone` (קונפיג)

הרשאת ה**יצירה**, `BOOLEAN DEFAULT FALSE` כנדרש באפיון. **קבלה** של הלאמה אינה
דורשת הרשאה - עמדה שלא יודעת שנתפס מרחב מעליה היא בדיוק הכשל שהפיצ'ר מונע.

> שתי הטבלאות ב-`UNDO_DENYLIST`: ביטול שקט של הלאמה מחזיר לאוויר מרחב שעמדות
> כבר אישרו שנתפס, וביטול אישור הוא אישור שלא היה. ראה [UNDO_SPEC.md](UNDO_SPEC.md) §4.

---

## הגנ"ש - קטלוג מערכות האש והגילוי (`ad_*`)

**ניהול אמצעים למשימת הגנת שמי המדינה.** אפיון מלא:
[AIR_DEFENSE_SPEC.md](AIR_DEFENSE_SPEC.md).

חמש הטבלאות כאן הן **שכבת הקטלוג בלבד** - ה**דגם**: מהי מערכת, לאן היא רואה
ויורה, ומה יעילותה מול כל סוג איום. שכבת ה**פריסה** (איפה היא עומדת, מה ה-PTL
שלה ומה סטטוסה) היא טבלה תפעולית נפרדת שתגיע בשלב ב.

> **כולן `CONFIG_TABLES`** ב-[`server/db/env-tables.js`](server/db/env-tables.js):
> קטלוג טכני משותף לכל 50 הסביבות, כמו `fault_types` ו-`strip_field_defs`.
> טבלאות הפריסה והאירועים יסווגו **תפעוליות** - פריסה שמשתנה בתרגול אסור לה
> לגעת בפריסה האמיתית.

### `ad_threat_types` - סוגי איום

| עמודה | טיפוס | הערות |
|---|---|---|
| `id` | SERIAL PK | |
| `name` | VARCHAR(100) **UNIQUE** | נזרע ביצירה: מהיר · איטי · כטב"מ · מטוס · מסוק · לא ידוע |
| `sort_order` | INTEGER | סדר בתפריטים ובטבלת היעילות |
| `enabled` | BOOLEAN | |

> **הזריעה רצה רק כשהטבלה ריקה.** `INSERT ... ON CONFLICT` היה מחזיר לחיים בכל
> עלייה סוג איום שנמחק בכוונה.
>
> סוג האיום הוא **ישות** ולא מחרוזת חופשית, כי אותו ערך מופיע בשלוש טבלאות
> (יעילות אש, יעילות גילוי, אזור אירוע). מחרוזת חופשית הייתה מבטיחה ששני איותים
> של אותו איום לא ייפגשו, וחישוב הכיסוי היה מחזיר אפס בשקט.

### `ad_weapon_systems` / `ad_sensor_systems` - הדגמים

| עמודה | טיפוס | קיים ב | הערות |
|---|---|---|---|
| `id` | SERIAL PK | שתיהן | |
| `name` | VARCHAR(120) | שתיהן | שם הדגם |
| `kind` | VARCHAR(20) | שתיהן | `ground` / `air` |
| `range_nm` | NUMERIC | שתיהן | טווח בימ"י - **ברירת מחדל** שהפריסה תוכל לדרוס |
| `alt_min` / `alt_max` | INTEGER | שתיהן | **רום טיסה** (מאות רגל). ריק = ללא הגבלה לאותו כיוון |
| `color` | VARCHAR(20) | שתיהן | צבע ברירת מחדל לתצוגה על המפה (שלב ג) |
| `enabled` | BOOLEAN | שתיהן | |
| `missile_type` | VARCHAR(120) | אש | |
| `guidance` | VARCHAR(20) | אש | `radar` / `ir` (מכ"ם / חום) |
| `sector_from_deg` / `sector_to_deg` | NUMERIC | אש | גזרת אש |
| `detect_from_deg` / `detect_to_deg` | NUMERIC | גילוי | **מפתח זווית גילוי** |
| `track_from_deg` / `track_to_deg` | NUMERIC | גילוי | **מפתח זווית עקיבה** |

> ⚠️ **המפתחות נשמרים יחסית ל-PTL**, לא כאזימוט מוחלט: ה-PTL נקבע ב**פריסה**,
> ואותו דגם עומד בחמישה מקומות עם חמישה כיוונים. **שני** הגבולות `NULL` = מכ"ם
> **מסתובב** (360); גבול אחד בלבד הוא הגדרה חלקית והטופס חוסם אותה.
>
> ארבעת האזימוטים שהאפיון מבקש (תחילת/סיום גילוי ועקיבה) **אינם עמודות** - הם
> נגזרים מ-PTL + מפתח ב-[`src/utils/airDefense.ts`](src/utils/airDefense.ts).
> עמודה שמורה הייתה מתיישנת בשקט בכל עדכון PTL.
>
> **טווח הגובה נורמל בשרת** (`alt_min > alt_max` מתהפך): תקרה מתחת לרצפה הופכת
> כל בדיקת חפיפה ל"אין כיסוי" בלי שאיש רואה למה.

### `ad_weapon_effectiveness` / `ad_sensor_effectiveness` - טבלאות היעילות

| עמודה | טיפוס | הערות |
|---|---|---|
| `id` | SERIAL PK | |
| `system_id` | INT → הקטלוג | CASCADE |
| `threat_type_id` | INT → `ad_threat_types` | CASCADE |
| `quality_pct` | SMALLINT `CHECK (0..100)` | **איכות עמידה במשימה באחוזים** (הכרעת הצוות 2026-09-01) |
| `note` | TEXT | |
| | **UNIQUE (system_id, threat_type_id)** | מה שהופך את השמירה ל-UPSERT ומונע שתי הערכות סותרות לאותו צמד |

**דירוג האחוז** (`qualityBand`, מקור אחד לשרת וללקוח): `0` לא מתמודד ·
`1-49` חלקי · `50-100` מתמודד. הסף הוא `AD_FULL_COVER_PCT`.

> **צמד שלא הוזן = "לא מתמודד"**, ולא "לא ידוע": כיסוי שלא הוגדר במפורש אינו
> כיסוי. אותה ברירת מחדל בטוחה של [`zoneRestriction.ts`](src/utils/zoneRestriction.ts).
> לכן **אין** שורות אפס נזרעות - ו**אפס שהוזן במפורש כן נשמר** כשורה, כי
> "בדקנו ואינו מתמודד" הוא ידיעה ו"לא הוזן" אינו.
>
> **מחיקת סוג איום שיש לו הערכות נחסמת** (409 עם הספירה) ואינה נגררת ב-CASCADE:
> מחיקה שקטה כאן הייתה מוחקת את כל ההערכות מולו והכיסוי היה יורד בלי שאיש ידע.
> ה-CASCADE נשמר למחיקת **מערכת** - שם ההערכות באמת חסרות משמעות בלעדיה.

מאומת ב-[`server/routes/airDefense.test.js`](server/routes/airDefense.test.js)
(21 בדיקות מול Postgres אמיתי - PGlite בזיכרון).
