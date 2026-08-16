# GAPI ⇄ SKYKING — חוזה אינטגרציה (API Contract)

> מסמך זה הוא **מקור האמת לממשק** בין SKYKING לבין מערכת השו"ב החיצונית **GAPI (GALAXY API)**.
> שני הצדדים מממשים מולו. גרסה: draft-1 · תאריך: 2026-07-29.
>
> החלטות מנחות (אושרו):
> - **תעבורה:** Webhooks דו-כיווני + מנוי (subscription) + reconciliation לפי cursor.
> - **מקור אמת:** GAPI סמכותי לשדות תפעוליים · SKYKING סמכותי לשדות פנימיים · LWW על משותפים.
> - **סביבות:** כל סביבת SKYKING (1–50, כולל תרגול) מתחברת ל-GAPI instance משלה, דרך כותרת `X-Env`.

---

## 1. טופולוגיה

```
                subscription (PUT)         ┌────────────────────┐
        ┌──────────────────────────────▶ │                    │
        │        ingest (POST, outbound)  │       GAPI         │
  ┌─────┴─────┐ ─────────────────────────▶│  (שרת + DB חדשים)  │
  │  SKYKING  │                            │  instance פר-סביבה │
  │  (desk)   │ ◀───────────────────────── │                    │
  └─────┬─────┘   inbound webhook (POST)   └────────┬───────────┘
        │                                           │
        └──────  reconciliation (GET ?since=cursor) ◀┘
```

- **inbound webhook**: כל שינוי שנוצר ב-GAPI נדחף **מיד** ל-SKYKING (`POST /api/gapi/inbound`).
- **outbound ingest**: כל שינוי רלוונטי שנוצר ב-SKYKING נדחף ל-GAPI (`POST {gapi}/ingest`).
- **subscription**: SKYKING מגדיר *מה* לקבל, ודוחף ל-GAPI (`PUT {gapi}/subscription`). ניתן לעדכון בכל עת.
- **reconciliation**: SKYKING מושך תקופתית (וב-boot) את כל מה שהתפספס (`GET {gapi}/changes?since=cursor`).

---

## 2. אימות (Authentication)

כל בקשה בין הצדדים חתומה ב-**HMAC-SHA256** על גוף הבקשה הגולמי:

| כותרת | ערך |
|---|---|
| `X-GAPI-Timestamp` | Unix ms של שליחת הבקשה |
| `X-GAPI-Signature` | `sha256=` + hex של `HMAC_SHA256(secret, timestamp + "." + rawBody)` |
| `X-Env` | מספר סביבה `1..50` (ברירת מחדל 1) |
| `Content-Type` | `application/json` |

- ה-`secret` **פר-סביבה** — נשמר ב-SKYKING בטבלת `gapi_env_config` (write-only, לא נחשף ב-GET).
- **חלון replay**: דחה בקשה אם `|now − timestamp| > 300s`.
- השוואת חתימה ב-**constant time** (`crypto.timingSafeEqual`).
- כשל אימות → `401`. חתימה תקינה אך `X-Env` לא חוקי → `400`.

---

## 3. ניתוב סביבה (Environments)

SKYKING הוא multi-environment: סביבות 1–10 = חי (`public`), 11–50 = תרגול (`env_NN`).
כל GAPI instance משויך לסביבה אחת ושולח את `X-Env` המתאים. ה-middleware הקיים של SKYKING
מכוון את כל שאילתות ה-DB לסכמה הנכונה אוטומטית — **אין צורך בקוד ניתוב ייעודי ב-GAPI**.

> קונפיג החיבור (base URL, secret, subscription, cursor) נשמר **פר-סביבה** ב-`public.gapi_env_config`
> (טבלת control-plane, ממופתחת ב-`env_number`, בדיוק כמו טבלת `environments`).

---

## 4. מעטפת אירוע (Event Envelope)

כל התעבורה (inbound / outbound / reconciliation) משתמשת באותה מעטפת:

```jsonc
{
  "batch_id": "uuid",             // מזהה מנה (ללוגים)
  "source":   "gapi" | "skyking", // מי שלח
  "cursor":   "opaque-string",    // watermark של השולח לסוף המנה (inbound/changes בלבד)
  "events": [
    {
      "event_id":   "uuid",                 // מפתח idempotency — ייחודי לכל אירוע
      "entity":     "sortie|serial|base_status|weather|closure",
      "op":         "upsert" | "delete",
      "gapi_id":    "string",               // מזהה יציב של הישות ב-GAPI
      "version":    42,                       // מונוטוני-עולה פר-ישות ב-GAPI (לזיהוי ישן/כפול)
      "updated_at": "2026-07-29T12:00:00Z",  // ISO-8601 UTC
      "data":       { /* שדות הישות — ראה §6. נעדר ב-delete */ }
    }
  ]
}
```

**תשובה** ל-`POST /api/gapi/inbound` וכן ל-`POST {gapi}/ingest`:
```json
{ "applied": 12, "skipped": 3, "rejected": 0, "cursor": "opaque-string", "errors": [] }
```

### כללי עיבוד אירוע (idempotency + סדר)
1. **דדופ**: אם `event_id` כבר עובד (טבלת `gapi_inbound_events` פר-סביבה) → `skipped`.
2. **גרסה**: אם קיים כבר record עם `version ≥` הנכנס → `skipped` (אירוע ישן/מסודר-לא-נכון).
3. **upsert**: מיפוי `data` → טבלת SKYKING לפי §6, שמירת `gapi_id`, `gapi_version`, `gapi_synced_at`.
4. **delete**: מחיקה/ביטול לפי הישות (ראה §6).
5. אחרי כל מנה: קדם את `cursor` השמור **רק** אם כל האירועים לפניו טופלו.

---

## 5. Endpoints

### 5.1 בצד SKYKING (GAPI קורא אליהם)

| METHOD | Path | תיאור |
|---|---|---|
| `POST` | `/api/gapi/inbound` | קליטת מנת אירועים מ-GAPI (webhook). דורש HMAC + `X-Env`. |
| `GET`  | `/api/gapi/health` | בדיקת חיים (`200 {ok:true, env, last_cursor}`). דורש HMAC. |

### 5.2 בצד GAPI (SKYKING קורא אליהם) — **יש לממש ב-GAPI**

| METHOD | Path | תיאור |
|---|---|---|
| `POST` | `{base}/ingest` | קליטת שינויים מ-SKYKING (outbound). מחזיר תשובת מעטפת. |
| `PUT`  | `{base}/subscription` | קביעת/עדכון המנוי (§7). מחזיר `200 {ok:true}`. |
| `GET`  | `{base}/changes?since=<cursor>&limit=500` | משיכת כל האירועים אחרי ה-cursor (reconciliation). מחזיר מעטפת עם `cursor` חדש. |

### 5.3 בצד SKYKING — ניהול (UI/אדמין, פנימי, לא ל-GAPI)

| METHOD | Path | תיאור |
|---|---|---|
| `GET`  | `/api/gapi/config` | קונפיג הסביבה הנוכחית (בלי secret). |
| `PUT`  | `/api/gapi/config` | עדכון `base_url` / `enabled` / `secret` / `subscription`. שמירה + **דחיפת subscription ל-GAPI**. |
| `GET`  | `/api/gapi/status` | סטטוס: מחובר?, `last_cursor`, `last_sync_at`, עומק outbox, ספירת אירועים אחרונים. |
| `POST` | `/api/gapi/resync` | reconciliation מלא מיידי (מ-`cursor=null`). |

---

## 6. ישויות ומיפוי שדות (Field Mapping)

> עמודה "כיוון": `⇄` דו-כיווני · `→` GAPI→SKYKING בלבד · `internal` = פנימי ל-SKYKING, **לא נשלח ולא נקבע ע"י GAPI**.
> GAPI סמכותי לכל שדה תפעולי (⇄/→). SKYKING סמכותי לכל שדה `internal`.

### 6.1 `sortie` (פ"מ) → `strips` + `strip_aircraft` (+ armaments/systems)

**סינון מנוי:** `landed = false` **AND** (`airborne = true` **OR** `takeoff_time` בטווח `[now, now + 4h]`, ניתן לכוונון §7).

**נסיגה (retract):** פ"מ שכבר הופץ ל-SKYKING ויצא מהתנאי - סומן `landed = true`, או שזמן ההמראה נדחה אל מחוץ לחלון, או שהחלון חלף מעצמו - מקבל אירוע `op: "delete"`, כך שהרשומה נמחקת אצל הבקר ולא נשארת שם כשהיא כבר לא רלוונטית. הנסיגה נשלחת גם בדחיפה המיידית וגם ב-sweep (למקרה שהחלון חלף בלי עריכה), ונרשמת ב-`change_log` כדי שגם מסלול המשיכה `/changes` ימחק.

| שדה GAPI (`data`) | SKYKING | כיוון | הערות |
|---|---|---|---|
| `gapi_id` | `strips.gapi_id` | ⇄ | מזהה יציב |
| `callsign` | `strips.callsign` (או"ק) | ⇄ | חובה |
| `sq` | `strips.sq` (מספר פ"מ) | ⇄ | |
| `task` | `strips.task` (משימה) | ⇄ | |
| `number_of_formation` | `strips.number_of_formation` | ⇄ | כמות מטוסים |
| `takeoff_time` | `strips.takeoff_time` | ⇄ | ISO-8601 UTC → `TIMESTAMPTZ` |
| `planned_landing_time` | `strips.planned_landing_time` | ⇄ | זמן נחיתה מתוכנן. ISO-8601 UTC → `TIMESTAMPTZ`. הבסיס לחלונות הנתונים בעמדה ("נוחת בעוד פחות מ-X דקות") |
| `airborne` | `strips.airborne` | ⇄ | קובע חברות במנוי |
| `landed` | `strips.landed` | ⇄ | נחת - מוציא מהמנוי וגורר אירוע `delete` |
| `erka` | `strips.erka` (ע"ר/קא) | ⇄ | |
| `koteret` | `strips.koteret` (כותרת) | ⇄ | |
| `mivtza` | `strips.mivtza` (מבצע) | ⇄ | |
| `tzevet_shilta` | `strips.tzevet_shilta` (צוות שליטה) | ⇄ | |
| `ta_shilta` | `strips.ta_shilta` (תא שליטה) | ⇄ | |
| `aim_points[]` | `strips.targets` (JSONB) | ⇄ | **טבלת נקודות מכוון** - נ"צי התקיפה של הפ"מ. מבנה מלא ב-§6.1.1 |
| `takeoff_airfield` `{code|name}` | `strips.takeoff_airfield_id` | → | **קריאה בלבד.** **resolve** מול `aviation_bases` (name/code). שדה ההמראה נקבע בתכנון הגיחה אצל GAPI ולא בשולחן הבקרה, ולכן אינו נשלח חזרה |
| `landing_airfield` `{code|name}` | `strips.landing_airfield_id` | → | **קריאה בלבד.** resolve כנ"ל |
| `aircraft[]` | `strip_aircraft` + ילדיו | ⇄ | **טבלת המטוסים** - שורה לכל מטוס בפ"מ. מבנה מלא ב-§6.1.2 |
| — | `x,y,on_map,status,in_table,workstation_preset_id,held_by_workstation,sector_id,map_*,aircraft_positions,ground_status,parent_strip_id,aircraft_indices,block_space_id,civ_*,creator_*,manual_entry,expires_at,notes,custom_fields,pin_display` | **internal** | מיקום/דסק/מפה — לא יוצא ולא נקבע ע"י GAPI |

#### 6.1.1 `aim_points[]` — טבלת נקודות מכוון (העברת מטרה לתקיפה)

**טבלת נקודות המכוון היא טבלת בן מתחת לפ"מ** — בדיוק כמו `aircraft[]`: ישות שיש לה
**כמה שורות לכל פ"מ**, ולא שדה בעל ערך יחיד. היא נשלחת מקוננת בתוך ה-`data` של ה-sortie
ואין לה אירוע (`entity`) משלה: מחזור החיים שלה הוא של הפ"מ, ומחיקת הפ"מ מוחקת אותה.

**כל איבר במערך הוא נ"צ תקיפה אחד.** המערך מוחלף בשלמותו בכל upsert
(**replace-set**, לא מיזוג פר-שורה) — אין לשורה מזהה יציב, וסדר האיברים הוא סדר
התצוגה בעמדה. בצד SKYKING הוא נשמר כמכלול ב-`strips.targets` (JSONB), כדי שכל
הטבלה תיכתב בפעולה אחת ולא יישארו שורות יתומות.

```jsonc
"aim_points": [
  {
    "name":      "אלפא",                    // שם מטרה
    "aim_point": "א1",                      // שם נקודת מכוון
    "coord":     "N3212.4500/E03456.8200",  // נ"צ - 17 ספרות (ראה למטה)
    "alt_ft":    "12000",                   // גובה ברגליים
    "hd":        "270",                     // HD - כיוון במעלות (0-360)
    "an":        "45",                      // AN - זווית חדירה במעלות (0-90)
    "an_min":    "30",                      // AN מזערי - זווית חדירה מזערית (0-90)
    "fuze":      "0.02",                    // מרעום ב**שניות**: 0.02 = 20 מילי-שניות
    "armament":  "MK84",                    // חימוש - מתוך קטלוג החימושים
    "bombs":     "2",                       // כמות פצצות
    "note":      "הערה חופשית",             // הערה

    // ── דגלי אישור לתקיפה — בוליאניים (ולא מחרוזות) ──
    "air_verified":    true,   // מאומת אווירי
    "cleared_heading": true,   // רשאי לצאת כיוון
    "abort_attack":    false,  // עצור תקיפה
    "ground_verified": false   // מאומת קרקעי
  }
]
```

**הדגלים** הם ארבעה שדות בוליאניים. `null`, שדה חסר, או ערך שאינו מובן — נקראים
**`false`**: ערך שלא הוכרע אינו אישור. `abort_attack` הוא היחיד שמשמעותו *לא לתקוף*,
והוא מוצג בעמדה באדום ובראש שורת התקציר.

| כלל | פירוט |
|---|---|
| **טיפוס** | שדות הטקסט והמספר הם **מחרוזות**; ארבעת הדגלים הם **בוליאניים**. כך מספר לא הופך ל-`0` כשהוא ריק, והערך עובר ללא שינוי בין המערכות. צד שמקבל מספר (`12000` ולא `"12000"`) ממיר אותו למחרוזת. |
| **שדה חסר** | מותר. שורה חלקית תקינה — שדה טקסט שלא נשלח נקרא כמחרוזת ריקה, ודגל שלא נשלח נקרא `false`. |
| **נ"צ** | `NDDMM.mmmm/EDDDMM.mmmm` — 17 ספרות: קו רוחב מעלות+דקות (4) ועוד 4 שברי דקה, לוכסן, קו אורך מעלות+דקות (5) ועוד 4 שברי דקה. `S`/`W` נתמכים. דקות < 60. |
| **מרעום** | ב**שניות**, שבר עשרוני. `0.02` פירושו 20 מילי-שניות. אין לשלוח מילי-שניות (`20`) בשדה זה. |
| **מערך ריק** | `[]` מוחק את כל נקודות המכוון של הפ"מ. שדה שלא נשלח כלל — לא נוגע בהן (partial update). |

> **תאימות לאחור:** לפני הרחבה זו נשאו השורות שני שדות בלבד (`name`, `aim_point`).
> שורה כזו נקראת כמו שהיא, שדות הטקסט ריקים והדגלים `false` — אין צורך בהמרה.

#### 6.1.2 `aircraft[]` — טבלת המטוסים

**טבלת המטוסים היא טבלת בן מתחת לפ"מ** — כמו טבלת נקודות המכוון: ישות שיש לה
**כמה שורות לכל פ"מ**, ולא שדה בעל ערך יחיד. היא נשלחת מקוננת ב-`data` של
ה-sortie ואין לה אירוע (`entity`) משלה — מחזור החיים שלה הוא של הפ"מ, ומחיקת
הפ"מ מוחקת אותה (CASCADE).

**כמות השורות נגזרת מה"מס"מ"** (`number_of_formation`): מבנה של ארבעה = ארבע
שורות, `idx` 1..4. ב-SKYKING הן נוצרות ב-`POST /api/strip-aircraft/ensure/:stripId`
עם `count = number_of_formation`; בכיוון הנכנס הן נוצרות מהמערך עצמו.

מבנה מטוס בודד (`strip_aircraft`, מפתח טבעי `idx`):
```jsonc
{
  "idx": 1,                     // strip_aircraft.idx (מספר בתוך הפ"מ) — המפתח
  "tail_number": "812",         // strip_aircraft.tail_number (מספר זנב)
  "pilot_name": "…",            // strip_aircraft.pilot_name (שם טייס)
  "navigator_name": "…",        // strip_aircraft.navigator_name (שם נווט)
  "sagol_1": "…",               // strip_aircraft.sagol_1 (סגול 1)
  "sagol_2": "…",               // strip_aircraft.sagol_2 (סגול 2)
  "datk": 3,                    // strip_aircraft.datk (דת"ק / מספר חניה)
  "kipa": "4",                  // strip_aircraft.kipa (כיפה)
  "armaments": [ { "name": "…", "quantity": 2 } ],  // strip_aircraft_armaments
  "systems":   [ { "name": "…", "status": "שמיש|חלקי|לא שמיש" } ] // strip_aircraft_systems
}
```

| שדה מטוס | SKYKING | כיוון | הערות |
|---|---|---|---|
| `idx` | `strip_aircraft.idx` | ⇄ | מפתח טבעי בתוך הפ"מ (1..מס"מ) |
| `tail_number` | `strip_aircraft.tail_number` | ⇄ | מספר זנב. מחרוזת ולא מספר - אפסים מובילים נשמרים |
| `pilot_name` | `strip_aircraft.pilot_name` | ⇄ | שם טייס |
| `navigator_name` | `strip_aircraft.navigator_name` | ⇄ | שם נווט |
| `sagol_1` | `strip_aircraft.sagol_1` | ⇄ | סגול 1 |
| `sagol_2` | `strip_aircraft.sagol_2` | ⇄ | סגול 2 |
| `datk` | `strip_aircraft.datk` | ⇄ | דת"ק (מספר חניה) |
| `kipa` | `strip_aircraft.kipa` | ⇄ | כיפה |
| `armaments[]` | `strip_aircraft_armaments` | → | **טבלת חימושים - קריאה בלבד.** replace-set פר-מטוס. קטלוג השמות: `default_armament_names`. החימוש נקבע בהכנת המטוס ולא בשולחן הבקרה, ולכן עריכה מקומית אינה מייצרת אירוע יוצא |
| `systems[]` | `strip_aircraft_systems` | → | **טבלת מערכות - קריאה בלבד.** replace-set פר-מטוס. קטלוג השמות: `default_system_names` |
| — | `has_fault`, `fault_type`, `fault_details` | **internal** | **תקלת המטוס - שדות של SKY-KING בלבד.** דיווח של הבקר/פקח בעמדה; GAPI אינו מקור אמת עבורם, ולכן upsert נכנס אינו נוגע בהם. מהות התקלה נבחרת מתפריט `fault_types` המנוהל במסך ניהול מערכת |
| — | `greens`, `flight_status` | **internal** | מצב המטוס בהקפה - תפעול המגדל |

> **מקור אמת לרשימה:** [`server/gapi/entities.js`](server/gapi/entities.js) —
> `AIRCRAFT_FIELDS` (תפעולי) ו-`AIRCRAFT_INTERNAL_COLUMNS` (פנימי). הכניסה
> (`sync.js`), היציאה (`outbox.js`) ומסלול העדכון בעמדה
> (`PUT /api/strip-aircraft/:stripId/:idx`) כולם נגזרים מהן, כך ששדה מטוס חדש
> נוסף במקום אחד.

> upsert של aircraft: מפתח `(strip_id, idx)` (כמו הלוגיקה הקיימת ב-`strip-aircraft`).
> **replace-set:** מטוס שאינו במערך נמחק, ולכן מטוס שכן במערך נלקח כשורה שלמה -
> שדה שנעדר ממנו נכתב `NULL`. armaments/systems — replace-set פר-מטוס.
> העמודות ה-`internal` שורדות את ההחלפה.
> `delete` של sortie: `DELETE FROM strips WHERE gapi_id=$1` (CASCADE מנקה מטוסים/חימושים/מערכות).

### 6.2 `serial` (ספרור) → `serials` — **הכל**

| שדה GAPI | SKYKING | כיוון |
|---|---|---|
| `gapi_id` | `serials.gapi_id` | ⇄ |
| `control_station` | `serials.control_station` (תא שליטה) | ⇄ |
| `serial_number` | `serials.serial_number` | ⇄ |
| `essence` | `serials.essence` (מהות) | ⇄ |
| `relevant_to` | `serials.relevant_to` (רלוונטי ל) | ⇄ |
| `created_at` | `serials.created_at` | → |
| — | `strip_serial_selections` (שיוך ספרור↔פ"מ על הדסק) | **internal** |

### 6.3 `base_status` (סטטוס בסיס) → `base_statuses` — **הכל**

| שדה GAPI | SKYKING | כיוון |
|---|---|---|
| `gapi_id` | `base_statuses.gapi_id` | ⇄ |
| `name` | `base_statuses.name` | ⇄ |
| `code` | `base_statuses.code` | ⇄ |
| `relevant_to` | `base_statuses.relevant_to` | ⇄ |
| `air_defense_status` | `base_statuses.air_defense_status` (הגנא"א) | ⇄ |
| `absorption_status` | `base_statuses.absorption_status` (מזא"ה) | ⇄ |
| `bird_status` | `base_statuses.bird_status` (ציפורים) | ⇄ |
| `airfield` `{code}` | `base_statuses.airfield_id` | ⇄ | resolve מול `airfields` |
| — | `workstation_presets.*` (תצוגה/הרשאה מקומית) | **internal** |

### 6.4 `weather` (מז"א) → תת-קבוצה של `base_statuses`

מז"א חי ב-SKYKING **בתוך** רשומת `base_statuses`. אירוע `weather` מעדכן את שדות המז"א של אותו בסיס
(match לפי `gapi_id` של הבסיס, או `airfield.code`). זה מאפשר ל-GAPI להזין מז"א בנפרד מסטטוס הבסיס.

| שדה GAPI | SKYKING | כיוון |
|---|---|---|
| `base_gapi_id` / `airfield.code` | לזיהוי רשומת `base_statuses` | → |
| `pressure_inhg` | `base_statuses.pressure_inhg` (לחץ) | ⇄ |
| `atis_text` | `base_statuses.atis_text` (ATIS) | ⇄ |
| `notam_text` | `base_statuses.notam_text` (נוטאם) | ⇄ |
| `bird_status` | `base_statuses.bird_status` | ⇄ |
| `absorption_status` | `base_statuses.absorption_status` | ⇄ |
| — | `preset_mazaa_thresholds` (ספי מז"א מקומיים) | **internal** |

### 6.5 `closure` (סגירה) → `closures`

**סינון מנוי:** `active = true` (ניתן לכוונון).

| שדה GAPI | SKYKING | כיוון |
|---|---|---|
| `gapi_id` | `closures.gapi_id` | ⇄ |
| `name` | `closures.name` | ⇄ |
| `category` | `closures.category` | ⇄ |
| `alt_min` / `alt_max` | `closures.alt_min` / `alt_max` | ⇄ |
| `dates` (array) | `closures.dates` (JSONB) | ⇄ |
| `time_start` / `time_end` | `closures.time_start` / `time_end` | ⇄ |
| `closure_status` | `closures.closure_status` (`coordinated`…) | ⇄ |
| `active` | `closures.active` | ⇄ |
| `polygon_geo` `[[lat,lon],…]` | `closures.polygon_geo` (JSONB) | ⇄ |
| — | `closures.color` (תצוגה, יש default) | **internal** |

---

## 7. מנוי (Subscription)

SKYKING שומר את המנוי ב-`gapi_env_config.subscription` (JSONB, פר-סביבה) ודוחף אותו ל-GAPI
(`PUT {base}/subscription`) בכל שינוי. GAPI מכבד את המנוי ושולח (inbound + changes) רק מה שתואם.

```jsonc
{
  "subscriber": "skyking",
  "env": 1,
  "callback_url": "https://<skyking-host>/api/gapi/inbound",
  "entities": {
    "sortie":      { "enabled": true, "airborne": true, "takeoff_within_hours": 4,
                     "include": ["aircraft", "armaments", "systems"] },
    "serial":      { "enabled": true, "scope": "all" },
    "base_status": { "enabled": true, "scope": "all" },
    "weather":     { "enabled": true, "scope": "all" },
    "closure":     { "enabled": true, "filter": { "active": true } }
  }
}
```

> דרישת "שינוי השאילתא": שינוי `takeoff_within_hours`, `filter`, או כיבוי ישות — נעשה ב-SKYKING
> (`PUT /api/gapi/config`), נשמר, ומיד נדחף ל-GAPI. GAPI מחיל על ה-feed שלו.

---

## 8. פתרון התנגשויות (Conflict Resolution)

1. **בעלות שדה** (עיקרי): שדה תפעולי → GAPI מנצח תמיד. שדה `internal` → SKYKING מנצח, לעולם לא נשלח.
2. **LWW על משותפים**: אם שני הצדדים עורכים אותו שדה תפעולי — הכי-טרי לפי `updated_at` מנצח;
   שוויון → GAPI מנצח (סמכותי).
3. **מניעת ping-pong (echo suppression)**: כשמחילים אירוע נכנס מ-GAPI, מסמנים `gapi_synced_at`
   ו-`gapi_version`, ו**לא** מייצרים בגינו רשומת outbound. רק שינוי שמקורו במשתמש SKYKING נכנס ל-outbox.
4. **idempotency**: `event_id` + `version` (§4) מונעים החלה כפולה ו-out-of-order.

---

## 9. אמינות מסירה (Delivery Reliability)

- **Outbox** (`gapi_outbox`, operational פר-סביבה): כל שינוי SKYKING שצריך לצאת נכתב לשם קודם,
  worker דוחף ל-`{base}/ingest` עם retry (backoff), מוחק בהצלחה. שורד ריסטארט/נפילת GAPI.
- **Inbound dedup** (`gapi_inbound_events`, operational פר-סביבה): שומר `event_id` שעובדו.
- **Reconciliation**: כל ~60ש' וב-boot — `GET {base}/changes?since=cursor`. תופס אירועים שאבדו
  (webhook נכשל / SKYKING היה למטה). מקדם `cursor` רק אחרי החלה מלאה.
- **Feature flag**: `gapi_env_config.enabled` — כל האינטגרציה כבויה כברירת מחדל עד קונפיג + הפעלה.

---

## 10. סכמת DB חדשה (SKYKING) — תקציר (מפורט ב-/migrate)

**Control-plane (public, `IGNORED_EXACT`, ממופתח env):**
```
gapi_env_config(env_number PK 1..50, base_url TEXT, hmac_secret TEXT, enabled BOOL DEFAULT false,
                subscription JSONB DEFAULT '{}', last_cursor TEXT, last_sync_at TIMESTAMPTZ,
                updated_at TIMESTAMPTZ DEFAULT NOW())
```
**Operational (משוכפל פר-סביבה, `OPERATIONAL_TABLES`):**
```
gapi_outbox(id SERIAL PK, entity TEXT, op TEXT, local_id INT, gapi_id TEXT, payload JSONB,
            attempts INT DEFAULT 0, next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
            created_at TIMESTAMPTZ DEFAULT NOW())
gapi_inbound_events(event_id TEXT PK, entity TEXT, gapi_id TEXT, version BIGINT,
                    processed_at TIMESTAMPTZ DEFAULT NOW())
```
**עמודות שנוספות לישויות קיימות (operational — מתפשט אוטומטית לכל הסביבות ב-boot):**
```
strips        + gapi_id TEXT, gapi_version BIGINT, gapi_synced_at TIMESTAMPTZ   (+ UNIQUE gapi_id)
serials       + gapi_id TEXT, gapi_version BIGINT, gapi_synced_at TIMESTAMPTZ
base_statuses + gapi_id TEXT, gapi_version BIGINT, gapi_synced_at TIMESTAMPTZ
closures      + gapi_id TEXT, gapi_version BIGINT, gapi_synced_at TIMESTAMPTZ
```
> חובה: לרשום `gapi_env_config` ב-`IGNORED_EXACT` ואת `gapi_outbox`/`gapi_inbound_events`
> ב-`OPERATIONAL_TABLES` שב-`server/db/env-tables.js`, אחרת `checkTableClassification` יפיל את ה-boot.

---

## 11. קודי שגיאה

| קוד | משמעות |
|---|---|
| `200` | טופל (ראה גוף התשובה ל-applied/skipped/rejected) |
| `400` | body/`X-Env` לא חוקי |
| `401` | חתימת HMAC שגויה / timestamp מחוץ לחלון |
| `409` | התנגשות גרסה בלתי-פתירה (נדיר; מוחזר עם ה-version הנוכחי) |
| `422` | ישות/שדה חובה חסרים |
| `503` | האינטגרציה כבויה (`enabled=false`) או סביבת תרגול לא זמינה |
