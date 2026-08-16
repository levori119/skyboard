# DB Reference - SKY-KING (ישויות פ"מ ונלוות)

> טבלת reference ממוקדת. מקור אמת מלא: [data-model.md](data-model.md) + [server/db/init.js](server/db/init.js).

## היררכיה

```
strips (פ"מ)
  └─ strip_aircraft (מטוס בודד)
        ├─ strip_aircraft_armaments (חימושים)
        └─ strip_aircraft_systems (מערכות)

serials (קטלוג ספרורים)  ──< strip_serial_selections (שיוך פ"מ↔תא שליטה)
base_statuses (סטטוס בסיסים)  - עצמאי
```

---

## בידוד סביבות תרגול (חשוב)

**אין עמודת "סביבה" באף טבלה כאן.** הסביבה היא ה**סכמה** (PostgreSQL schema) שבה השורה יושבת,
לא שדה בשורה. הלקוח שולח כותרת `X-Env` (נבחרת ב-LOGIN), ו-[environment.js](server/middleware/environment.js)
מריץ כל בקשה עם `search_path = env_NN, public` - כך `SELECT * FROM strips` מחזיר אוטומטית
את השורות של אותה סביבה בלבד.

| טווח סביבות | סכמה | התנהגות |
|---|---|---|
| **1-10 (טסות)** | `public` | חולקות את אותן שורות - אין העתק |
| **11-50 (תרגול)** | `env_11` … `env_50` | עותק נפרד של כל טבלה תפעולית בתוך הסכמה |

כל הטבלאות במסמך זה מסווגות **תפעוליות** ([env-tables.js](server/db/env-tables.js)) → משוכפלות לכל `env_NN`.

---

## פ"מ - `strips`

> **בידוד סביבות:** תפעולית טהורה - בסביבת תרגול חדשה נוצרת **ריקה**. הפ"מים שנוצרים בתרגול קיימים רק ב-`env_NN`.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `callsign` | VARCHAR(50) NOT NULL | אוק (חנית, כסף…) |
| `sq` | VARCHAR(10) | מספר פ"מ |
| `task` | VARCHAR(50) | משימה |
| `weapons` | JSONB DEFAULT `'[]'` | נשק |
| `targets` | JSONB DEFAULT `'[]'` | מטרות |
| `systems` | JSONB DEFAULT `'[]'` | מערכות |
| `takeoff_time` | TIMESTAMPTZ | זמן המראה |
| `airborne` | BOOLEAN DEFAULT FALSE | בתעופה |
| `number_of_formation` | VARCHAR(50) | כמות מטוסים בפ"מ |
| `erka` | VARCHAR(100) | ע"ר/קא |
| `koteret` | VARCHAR(200) | כותרת |
| `mivtza` | VARCHAR(100) | מבצע |
| `tzevet_shilta` | VARCHAR(100) | צוות שליטה |
| `ta_shilta` | VARCHAR(100) | תא שליטה |
| `takeoff_airfield_id` | INT → `aviation_bases` (ON DELETE SET NULL) | שדה המראה |
| `landing_airfield_id` | INT → `aviation_bases` (ON DELETE SET NULL) | שדה נחיתה |

---

## מטוסים - `strip_aircraft`

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `strip_id` | INT → `strips` (ON DELETE CASCADE) | לאיזה פ"מ שייך |
| `idx` | INT NOT NULL | מספר המטוס בתוך הפ"מ (1,2,3…) |
| `tail_number` | VARCHAR(20) | מספר זנב |
| `pilot_name` | VARCHAR(200) | שם טייס |
| `navigator_name` | VARCHAR(200) | שם נווט |
| `sagol_1` | VARCHAR(50) | סגול 1 |
| `sagol_2` | VARCHAR(50) | סגול 2 |
| `datk` | INT | דת"ק (מספר חניה) |
| `kipa` | VARCHAR(100) | כיפה |
| `has_fault` | BOOLEAN DEFAULT FALSE | תקלה במטוס (כן/לא) - **SKY-KING בלבד, לא יוצא ל-GAPI** |
| `fault_type` | VARCHAR(200) | מהות התקלה - שם מתוך `fault_types` (תפריט מנוהל במסך ניהול מערכת) - **SKY-KING בלבד** |
| `fault_details` | TEXT | פירוט התקלה - טקסט חופשי - **SKY-KING בלבד** |
| `greens` / `flight_status` | BOOLEAN / VARCHAR(20) | מצב המטוס בהקפה - **SKY-KING בלבד** |
| - | UNIQUE `(strip_id, idx)` | אין שני מטוסים עם אותו idx בפ"מ |

> **כמות השורות = המס"מ** (`strips.number_of_formation`): שורה לכל מטוס, `idx` 1..N.
> נוצרות ב-`POST /api/strip-aircraft/ensure/:stripId` (אידמפוטנטי).
> `PUT /api/strip-aircraft/:stripId/:idx` הוא **עדכון חלקי** — רק עמודות שנשלחו נכתבות.

---

## חימושים - `strip_aircraft_armaments`

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `strip_aircraft_id` | INT → `strip_aircraft` (ON DELETE CASCADE) | לאיזה מטוס שייך החימוש |
| `armament_name` | VARCHAR(200) NOT NULL DEFAULT '' | שם החימוש |
| `quantity` | INT DEFAULT 1 | כמות |

> קטלוג שמות ברירת מחדל: `default_armament_names` (`name` UNIQUE, `sort_order`).

---

## מערכות - `strip_aircraft_systems`

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `strip_aircraft_id` | INT → `strip_aircraft` (ON DELETE CASCADE) | לאיזה מטוס שייכת המערכת |
| `system_name` | VARCHAR(200) NOT NULL DEFAULT '' | שם המערכת |
| `status` | VARCHAR(20) DEFAULT `'שמיש'` | שמיש / חלקי / לא שמיש |

> קטלוג שמות ברירת מחדל: `default_system_names`.

---

## ספרורי תא שליטה - `serials`

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `control_station` | VARCHAR(100) NOT NULL | תא שליטה |
| `serial_number` | INT NOT NULL | מספר ספרור |
| `essence` | TEXT | מהות ספרור |
| `relevant_to` | VARCHAR(200) | רלוונטי ל |
| `created_at` | TIMESTAMPTZ NOT NULL | תאריך ושעה |
| `imported_at` | TIMESTAMPTZ DEFAULT NOW() | זמן ייבוא |

### שיוך - `strip_serial_selections`

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `strip_id` | INT → `strips` (ON DELETE CASCADE) | הפ"מ |
| `control_station` | VARCHAR(100) NOT NULL | תא שליטה |
| `serial_id` | INT → `serials` (ON DELETE SET NULL) | הספרור הנבחר |
| `dismissed` | BOOLEAN DEFAULT false | בוטל |
| `acted_at` / `acted_by` / `acted_by_workstation` | TIMESTAMPTZ / TEXT | מי טיפל ומתי |
| `assigned_at` | TIMESTAMPTZ DEFAULT NOW() | זמן שיוך |
| - | UNIQUE `(strip_id, control_station)` | בחירה אחת פר פ"מ פר תא שליטה |

> היסטוריית ביטולים: `strip_serial_dismissals` (`strip_id`, `serial_id` PK).

---

## סטטוס בסיסים - `base_statuses`

> **בידוד סביבות (היברידית):** בסביבת תרגול חדשה הטבלה נוצרת עם **עותק שורות ההגדרה מ-public**
> (`syncHybridRows` ב-boot - [env-tables.js:63](server/db/env-tables.js#L63)), כדי שהבסיסים יופיעו גם בתרגול.
> הסטטוס החי (מזא"ה, לחץ, NOTAM…) שמעודכן בתרגול נשאר ב-`env_NN`.
> ⚠️ עריכת שורת בסיס **קיימת** ב-public **לא** מתפשטת לסכמות תרגול קיימות - רק בסיסים **חדשים** מסונכרנים ב-boot.

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `name` | VARCHAR(100) NOT NULL | שם הבסיס |
| `code` | VARCHAR(20) | קוד |
| `relevant_to` | VARCHAR(50) DEFAULT `'כולם'` | רלוונטי ל |
| `air_defense_status` | VARCHAR(100) | סטטוס הגנא"א |
| `absorption_status` | VARCHAR(100) | סטטוס קליטה (מזא"ה) |
| `bird_status` | VARCHAR(100) | סטטוס ציפורים |
| `pressure_inhg` | FLOAT | לחץ (inHg) |
| `notam_text` | TEXT | נוטאם |
| `atis_text` | TEXT | ATIS |
| `airfield_id` | INT → `airfields` (ON DELETE SET NULL) | שדה מקושר |
| `updated_at` | TIMESTAMPTZ DEFAULT NOW() | עדכון אחרון |

> הגדרות תצוגה/הרשאה בעמדה יושבות ב-`workstation_presets`
> (`show_base_statuses`, `base_status_ids`, `can_update_pressure/atis/notam/mazaa`).
