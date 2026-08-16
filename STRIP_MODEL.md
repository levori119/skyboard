# מפת הפ"מ - מי הבעלים של כל שדה וכל טבלה

> **מה המסמך הזה עונה עליו:** בהינתן שדה או טבלה כלשהם מתחת לפ"מ - מי מקור האמת
> שלהם (GAPI או SKY-KING), ולאיזה כיוון הם זורמים.
>
> **מקורות אמת שממנו נגזר המסמך** (אם יש סתירה - הקוד קובע, לא המסמך):
> [`server/gapi/entities.js`](server/gapi/entities.js) (המיפוי), [`server/db/init.js`](server/db/init.js)
> (הסכמה), [`src/types/subTables.ts`](src/types/subTables.ts) (טבלאות הבן),
> [GAPI-CONTRACT.md](GAPI-CONTRACT.md) §6 (החוזה מול השו"ב).

---

## 0. שלוש קטגוריות בעלות - וכלל אחד שאוכף אותן

| סימון | שם | מי מקור האמת | מה קורה בפועל |
|---|---|---|---|
| **⇄** | **דו-כיווני** | GAPI סמכותי, LWW על התנגשות | נכתב פנימה מ-GAPI **וגם** יוצא החוצה בעריכת משתמש |
| **→** | **חד-כיווני (GAPI→SKY-KING)** | GAPI בלבד | נכנס פנימה, **לא** יוצא החוצה |
| **internal** | **SKY-KING בלבד** | SKY-KING | לא יוצא, ו-upsert נכנס **לא נוגע בו** |

**הכלל שמחזיק את זה:** [`adapter.js`](server/gapi/adapter.js) עובר **רק** על
`ENTITIES[entity].fields`. שדה שלא ברשימה הזו לא נכתב פנימה ולא נשלח החוצה -
לכן ההחרגה של השדות הפנימיים היא מבנית ולא משמעת של מתכנת. הוספת שדה תפעולי
חדש = שורה אחת ב-`entities.js`, והכניסה, היציאה ומסלול העריכה בעמדה נגזרים ממנה.

---

## 1. שכבה ראשונה - טבלת האב `strips`

### 1.1 שדות דו-כיווניים ⇄ (14 + מזהה)

| שדה GAPI | עמודה ב-SKY-KING | משמעות |
|---|---|---|
| `gapi_id` | `gapi_id` | מזהה יציב של הפ"מ אצל GAPI (מפתח ההתאמה) |
| `callsign` | `callsign` | או"ק |
| `sq` | `sq` | מספר פ"מ |
| `task` | `task` | משימה |
| `number_of_formation` | `number_of_formation` | מס"מ - כמות מטוסים (קובע כמה שורות בטבלת המטוסים) |
| `takeoff_time` | `takeoff_time` | זמן המראה (TIMESTAMPTZ) |
| `planned_landing_time` | `planned_landing_time` | זמן נחיתה מתוכנן - הבסיס לשאילתות "נוחת בעוד X" |
| `airborne` | `airborne` | בתעופה - קובע חברות במנוי |
| `landed` | `landed` | נחת - מוציא מהמנוי וגורר אירוע `delete` |
| `erka` | `erka` | ע"ר/קא |
| `koteret` | `koteret` | כותרת |
| `mivtza` | `mivtza` | מבצע |
| `tzevet_shilta` | `tzevet_shilta` | צוות שליטה |
| `ta_shilta` | `ta_shilta` | תא שליטה |
| `aim_points[]` | `targets` (JSONB) | **טבלת נקודות המכוון** - ראה §2.1 |

### 1.2 שדות חד-כיווניים → (GAPI→SKY-KING בלבד)

| שדה | עמודה | למה חד-כיווני |
|---|---|---|
| `takeoff_airfield {code\|name}` | `takeoff_airfield_id` | **שדה ההמראה הוא לקריאה בלבד** (החלטה, 2026-08-14). נפתר ל-id מול `aviation_bases` בכניסה, וביציאה אינו נשלח - `toGapiData` עובר על `fields` בלבד ולא על `airfields` |
| `landing_airfield {code\|name}` | `landing_airfield_id` | **שדה הנחיתה הוא לקריאה בלבד** - אותו דבר |
| *(מטא של הסנכרון)* | `gapi_version` | מונה גרסה של GAPI - נכתב רק בקליטה, משמש לדחיית אירוע ישן |
| *(מטא של הסנכרון)* | `gapi_synced_at` | חותמת ההחלה - הבסיס ל-echo suppression (מונע ping-pong) |

> **למה לקריאה בלבד:** שדה ההמראה והנחיתה נקבעים בתכנון הגיחה אצל השו"ב, ולא
> בשולחן הבקרה. בקר שהיה משנה אותם היה מייצר סתירה מול התכנון המקורי ולא תיקון.

### 1.3 שדות SKY-KING בלבד (internal) - כ-55 עמודות

GAPI אינו מכיר אף אחת מהן, אינו כותב אליהן, ו-upsert נכנס אינו נוגע בהן:

| משפחה | עמודות | למה פנימי |
|---|---|---|
| **מיקום ודסק** | `x`, `y`, `on_map`, `in_table`, `status`, `workstation_preset_id`, `held_by_workstation`, `sector_id` | איפה הפ"מ יושב על השולחן - שאלה של העמדה, לא של השו"ב |
| **מפה** | `map_zone_name`, `map_zone_alts`, `map_pin_x`, `map_pin_y`, `map_lat`, `map_lon`, `pin_display`, `aircraft_positions` | סימון על המפה |
| **אזורים ובלוקים** | `block_space_id`, `block_deviation` | הצבה במרחב גובה |
| **תוכן שהבקר כותב** | `notes`, `formation_notes`, `weapons`, `systems`, `shkadia`, `custom_fields`, `alt` | רישום מקומי; `alt` הוא הגובה שהמערכת מציגה ומזהה לפיו קונפליקטים |
| **פיצול פ"מ** | `parent_strip_id`, `aircraft_indices`, `original_formation_count`, `parent_callsign` | פיצול הוא פעולה של הבקר, ולא קיים ב-GAPI |
| **תעופה אזרחית** | `civ_status`, `civ_stand`, `civ_dest`, `civ_ssr`, `civ_fl`, `civ_route`, `civ_time`, `civ_runway` | מסלול נתונים אזרחי נפרד |
| **ניתובים ובסיסים legacy** | `sid`, `star`, `departure_base_id`, `landing_base_id`, `squadron`, `strip_type`, `flight_direction` | קדמו ל-GAPI ואינם במיפוי |
| **מגדל / קרקע** | `ground_status` | מצב קרקעי בעמדת TWR |
| **יצירה ומחזור חיים** | `creator_preset_id`, `creator_preset_name`, `creator_crew_id`, `creator_crew_name`, `manual_entry`, `expires_at`, `created_at` | מי יצר את הפ"מ בעמדה ומתי הוא פג |
| **מעקב גרסה** | `updated_at`, `rev` | מתוחזקות בטריגר `strips_touch_rev`; הבסיס להכרעת סתירות אחרי עבודה בנתק |

---

## 2. שכבה שנייה - הטבלאות שמתחת לפ"מ

### 2.1 טבלאות שמגיעות מ-GAPI (שתיים)

שתיהן **נשלחות מקוננות בתוך ה-`data` של אירוע ה-sortie** ואין להן `entity` משלהן:
מחזור החיים שלהן הוא של הפ"מ, ומחיקת הפ"מ מוחקת אותן. שתיהן רשומות ב-
[`src/types/subTables.ts`](src/types/subTables.ts) ולכן מוצגות במוד הטבלה עם בוחר עמודות משלהן.

#### א. טבלת נקודות מכוון - `aim_points[]` → `strips.targets` (JSONB)

**15 שדות, כולם ⇄. אין בה אף שדה SKY-KING בלבד.**

| # | שדה | סוג | כיוון |
|---|---|---|---|
| 1 | `name` (שם מטרה) | מחרוזת | ⇄ |
| 2 | `aim_point` (שם נקודת מכוון) | מחרוזת | ⇄ |
| 3 | `coord` (נ"צ, 17 ספרות `NDDMM.mmmm/EDDDMM.mmmm`) | מחרוזת | ⇄ |
| 4 | `alt_ft` (גובה ברגל) | מחרוזת | ⇄ |
| 5 | `hd` (כיוון, 0-360) | מחרוזת | ⇄ |
| 6 | `an` (זווית חדירה) | מחרוזת | ⇄ |
| 7 | `an_min` (AN מזערי) | מחרוזת | ⇄ |
| 8 | `fuze` (מרעום ב**שניות**: 0.02 = 20 מ"ש) | מחרוזת | ⇄ |
| 9 | `armament` (חימוש, מתוך `default_armament_names`) | מחרוזת | ⇄ |
| 10 | `bombs` (כמות פצצות) | מחרוזת | ⇄ |
| 11 | `note` (הערה) | מחרוזת | ⇄ |
| 12 | `air_verified` (מאומת אווירי) | **בוליאני** | ⇄ |
| 13 | `cleared_heading` (רשאי לצאת כיוון) | **בוליאני** | ⇄ |
| 14 | `abort_attack` (עצור תקיפה) | **בוליאני** | ⇄ |
| 15 | `ground_verified` (מאומת קרקעי) | **בוליאני** | ⇄ |

**אחסון:** JSONB על הפ"מ ולא טבלה נפרדת - כל הטבלה נכתבת בפעולה אחת ואין שורות
יתומות. **המודל הלוגי הוא טבלת בן**, וכך היא מוצגת, מקונפגת ונשלחת.
**סמנטיקה:** replace-set - המערך מוחלף בשלמותו בכל upsert; `[]` מוחק הכל; שדה
שלא נשלח כלל לא נוגע בטבלה. לשורה **אין מזהה יציב** - הסדר הוא סדר התצוגה.

#### ב. טבלת המטוסים - `aircraft[]` → `strip_aircraft`

**מפתח טבעי:** `(strip_id, idx)`. **כמות השורות = המס"מ** (`number_of_formation`).

| שדה | עמודה | כיוון | הערה |
|---|---|---|---|
| `idx` | `idx` | ⇄ | המפתח (זהות, לא תוכן) |
| `tail_number` | `tail_number` | ⇄ | מספר זנב - מחרוזת, אפסים מובילים נשמרים |
| `pilot_name` | `pilot_name` | ⇄ | שם טייס |
| `navigator_name` | `navigator_name` | ⇄ | שם נווט |
| `sagol_1` | `sagol_1` | ⇄ | סגול 1 |
| `sagol_2` | `sagol_2` | ⇄ | סגול 2 |
| `datk` | `datk` | ⇄ | דת"ק (מספר חניה) |
| `kipa` | `kipa` | ⇄ | כיפה |
| - | `has_fault` | **internal** | דגל התקלה - דיווח של הבקר/פקח |
| - | `fault_type` | **internal** | מהות התקלה (שם מתוך `fault_types`, לא FK) |
| - | `fault_details` | **internal** | פירוט התקלה |
| - | `greens` | **internal** | מצב בהקפה - תפעול המגדל |
| - | `flight_status` | **internal** | מצב טיסה בהקפה |

> אלה **שדות שנוספו לטבלה שמגיעה מ-GAPI והם רק ב-SKY-KING**. replace-set נכנס
> מוחק מטוסים שאינם במערך ודורס שדות שנעדרו - אבל **חמש העמודות הפנימיות שורדות
> את ההחלפה**, כי GAPI אינו מקור אמת עבורן.

##### ב.1 חימושים - `armaments[]` → `strip_aircraft_armaments` (נכד)

| שדה | עמודה | כיוון |
|---|---|---|
| `name` | `armament_name` | **→** |
| `quantity` | `quantity` | **→** |

replace-set פר-מטוס. קטלוג השמות: `default_armament_names` (טבלת קונפיג ב-SKY-KING).

##### ב.2 מערכות - `systems[]` → `strip_aircraft_systems` (נכד)

| שדה | עמודה | כיוון |
|---|---|---|
| `name` | `system_name` | **→** |
| `status` | `status` (שמיש / חלקי / לא שמיש) | **→** |

replace-set פר-מטוס. קטלוג השמות: `default_system_names`.

> **שתי טבלאות הנכד הן חד-כיווניות: תוכן שמגיע מ-GAPI בלבד** (החלטה, 2026-08-14).
> החימוש שתלוי על המטוס והשמישות של מערכותיו נקבעים בהכנת המטוס, ולא בשולחן
> הבקרה. לכן מסלולי העריכה המקומיים (`POST/PUT/DELETE /api/strip-aircraft-armaments`
> ו-`.../systems`) **אינם** מייצרים אירוע יוצא - וזו התנהגות מכוונת, לא פער.

### 2.2 טבלאות שקיימות רק ב-SKY-KING (עשר, כולן טכניות)

GAPI אינו יודע על קיומן. כולן `ON DELETE CASCADE` מהפ"מ, וכל שדותיהן פנימיים:

| טבלה | מה היא מחזיקה | שדות עיקריים |
|---|---|---|
| `strip_transfers` | **העברת עמדה** | `from/to_sector_id`, `from/to_workstation_id`, `status` (pending→acknowledged→accepted/rejected), `target_x/y`, `sub_sector_label`, `eta_minutes`, `eta_set_at`, `reject_note`, `rev` |
| `strip_table_assignments` | הצבת הפ"מ **בטבלת עמדה** (דסק) | `preset_id`, סדר, `rev` |
| `strip_zone_assignments` | הצבת הפ"מ **על אזור במפה** | `zone_id`, `preset_id`, `rev` |
| `strip_zone_extra_zones` | אזורים נוספים לאותו פ"מ | `zone_id` |
| `strip_station_notes` | **הערת עמדה פרטית** על הפ"מ | PK `(strip_id, preset_id)`, `note`, `note_by_crew_id` |
| `strip_serial_selections` | שיוך **ספרור** לפ"מ על הדסק | `serial_id`, `acted_by_workstation` |
| `strip_serial_dismissals` | ספרור שנדחה בעמדה | `strip_id`, `serial_id` |
| `civilian_strip_assignments` | שיוך פ"מ אזרחי | `strip_id` + הקצאה |
| `joining_point_strips` | פ"מ ב**נקודת הצטרפות** (STAR) | `joining_point_id`, שיוך ותיאום (הגובה עצמו יושב ב-`strips.alt`) |
| `joining_point_aircraft` | מטוס בודד בהצטרפות | מפתח `(strip_id, idx)`, מסלול נחיתה, האם בהקפה |

בנוסף, **טבלאות קונפיג** ב-SKY-KING שהפ"מ מפנה אליהן בשם (לא FK, כי הן חיות רק
ב-`public` בעוד טבלאות הפ"מ משוכפלות לכל `env_NN`): `fault_types`,
`default_armament_names`, `default_system_names`.

---

## 3. סיכום מספרי

| | ⇄ דו-כיווני | → חד-כיווני | internal |
|---|---|---|---|
| **`strips`** (האב) | 14 + `gapi_id` | 4 | ~55 |
| **נקודות מכוון** (`targets`) | 15 | 0 | 0 |
| **מטוסים** (`strip_aircraft`) | 7 + `idx` | 0 | 5 |
| **חימושים** (נכד) | 0 | 2 | 0 |
| **מערכות** (נכד) | 0 | 2 | 0 |
| **10 טבלאות טכניות** | 0 | 0 | הכל |

**המבנה בשורה אחת:** פ"מ = רשומת אב אחת + **שתי טבלאות בן שמגיעות מ-GAPI**
(נקודות מכוון, מטוסים - והמטוסים נושאים שתי טבלאות נכד: חימושים ומערכות) +
**עשר טבלאות בן טכניות של SKY-KING** שאינן יוצאות החוצה כלל.

---

## 4. הכרעות ופערים פתוחים

### 4.1 הוכרע (2026-08-14) - שני השדות הם חד-כיווניים במכוון

| מה הוכרע | מה זה אומר בקוד |
|---|---|
| **שדה המראה ושדה נחיתה - לקריאה בלבד מ-GAPI** | ההתנהגות הקיימת נכונה: [`adapter.js`](server/gapi/adapter.js) בונה את ה-payload היוצא מ-`def.fields` בלבד ולא מ-`def.airfields`, ולכן השדות נכנסים ולא יוצאים |
| **חימושים ומערכות - מ-GAPI בלבד** | ההתנהגות הקיימת נכונה: מסלולי ה-CRUD המקומיים אינם קוראים ל-`captureChange`, ולכן עריכה מקומית אינה מייצרת אירוע יוצא |

### 4.2 שני חידודים שנותרו בקוד (נגזרים מההכרעות)

| # | מה | למה זה משנה |
|---|---|---|
| 1 | `takeoff_airfield_id` ו-`landing_airfield_id` עדיין ברשימת [`SORTIE_OP_FIELDS`](server/gapi/hooks.js#L48) | עריכה מקומית שלהם מייצרת אירוע יוצא **ריק מהם** - רעש בתור היציאה בלי תוכן. השדות לקריאה בלבד ולכן מקומם אינו שם |
| 2 | [`toGapiAircraft`](server/gapi/adapter.js#L42) עדיין מצרף `armaments`/`systems` ל-payload היוצא | הן חד-כיווניות, ולכן ההחזרה היא הד מיותר. גרוע מכך: עריכה מקומית שנעשתה במסלולי ה-CRUD **תזלוג** החוצה ב"טרמפ" בפעם הבאה שעריכה אחרת של אותו פ"מ מפעילה אירוע, ותדרוס אצל GAPI את מקור האמת שלו |

### 4.3 פער תיעודי פתוח

`serial.created_at` מסומן `→` ב-[GAPI-CONTRACT.md](GAPI-CONTRACT.md) §6.2, אבל יושב
ב-`fields` של [`entities.js`](server/gapi/entities.js#L50) ולכן **גם יוצא החוצה**.
להחליט אם לתקן את החוזה או להוציא את השדה מהרשימה.

---

## 5. איפה משנים - נקודה אחת לכל סוג שינוי

| השינוי | הקובץ |
|---|---|
| שדה תפעולי חדש בפ"מ | [`server/gapi/entities.js`](server/gapi/entities.js) `ENTITIES.sortie.fields` + [`hooks.js`](server/gapi/hooks.js) `SORTIE_OP_FIELDS` |
| שדה תפעולי חדש במטוס | [`server/gapi/entities.js`](server/gapi/entities.js) `AIRCRAFT_FIELDS` |
| שדה מטוס פנימי חדש | `AIRCRAFT_INTERNAL_COLUMNS` באותו קובץ |
| עמודה חדשה בנקודת מכוון | [`src/types/aimPoints.ts`](src/types/aimPoints.ts) `AIM_POINT_COLUMNS` |
| **טבלת בן חדשה** מתחת לפ"מ | [`src/types/subTables.ts`](src/types/subTables.ts) - רשומה אחת, והתפריט/הבוחר/הרינדור נגזרים |
| עמודה חדשה ב-DB | [`server/db/init.js`](server/db/init.js) (`ADD COLUMN IF NOT EXISTS` בלבד) + [data-model.md](data-model.md) |
