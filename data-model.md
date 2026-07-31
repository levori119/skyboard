# מבנה נתונים — SKY KING

## סביבות תרגול (סימולציה) — סכמה לכל סביבה

בסגנון גלקסיה: 50 סביבות עבודה. **סביבות טסות (1–10)** חולקות את המידע הטס
(פ"מ, סגירות, ספרורים זהים) — הן ממופות כולן לסכמת **`public`** הקיימת.
**סביבות תרגול (11–50)** מבודדות לחלוטין — לכל אחת סכמת PostgreSQL משלה
(`env_11` … `env_50`) המכילה עותק של הטבלאות **התפעוליות** בלבד.

**מיפוי:** הלקוח שולח כותרת `X-Env` (נבחרת ב-LOGIN, מוצגת בבאדג' בסרגל העליון);
middleware בשרת ([server/middleware/environment.js](server/middleware/environment.js))
ממפה סביבה→סכמה ומריץ כל בקשה תחת `search_path` מתאים, בלי לגעת ב-353 ה-routes.

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
| `airborne` | BOOLEAN | בתעופה |
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
| `targets` | JSONB | מטרות |
| `systems` | JSONB | מערכות |
| `custom_fields` | JSONB | שדות מותאמים |
| **`parent_strip_id`** | INT → strips.id | **מופיע רק אחרי פיצול** — מצביע על ה-root |
| **`aircraft_indices`** | JSONB | **מופיע רק אחרי פיצול** — לדוגמה `[1, 3]` |
| **`original_formation_count`** | INT | **מופיע רק אחרי פיצול** — כמות מטוסים מקורית |

---

## טבלת `strip_aircraft` — מטוס בודד

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `strip_id` | INT → strips | שייך לאיזה פ"מ |
| `idx` | INT | מספר המטוס בתוך הפ"מ (1, 2, 3...) |
| `datk` | INT | דת"ק (מספר חניה) |
| `kipa` | VARCHAR(100) | כיפה |

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
| `service_type` | VARCHAR(12) | `buttons` (מסך ניהול אמצעים) / `freetext` (טקסט חופשי בכתב יד) / `table` (טבלה חכמה) / `image` (תמונה קבועה) / `label` (טקסט קבוע) |
| `name` | VARCHAR(100) | שם השירות |
| `config` | JSONB | הגדרות אדמין — לפי סוג: freetext: `{ruled,lineGap,title}`; table: `{columns[],allowAddRows,initialRows,computed[],rules[],summary{}}`; image: `{dataUrl,fit}` (raster בלבד); label: `{text,font,fontSize,bold,align,color}` |
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
| `parent_base_id` | INT (מזהה `aviation_bases`, **ללא FK אכיף** — ה-constraint מופל ב-`init.js` לצימוד רופף) | בסיס האב של העמדה. פותר את שם/סמל הבסיס: במיראז' (רשימת עמדות) ובתצוגת סמל הבסיס במסך הטעינה ובסרגל העליון. `NULL` = אין בסיס אב → מוצג רק סמל מיח"ה (מפקדת יחידות הבקרה) |

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

### טבלת `zone_altitude_ranges` — גובה (בלוק) בעל שם באזור

| עמודה | סוג | תיאור |
|---|---|---|
| `id` | SERIAL PK | מזהה |
| `zone_id` | INT → map_zones | האזור (CASCADE) |
| `name` | VARCHAR(100) | שם הגובה (למשל "גבוה"/"נמוך") |
| `alt_min`, `alt_max` | INTEGER | טווח הגובה (רגל) |
| `sort_order` | INT | סדר תצוגה (עליון→תחתון) |

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

> **חריגה מבלוק:** פ"מ נחשב חורג אם גובהו (`strips.alt`) אינו נופל באף `zone_altitude_ranges`
> של האזור, **או** אם ה-`altitude_range_id` שלו אינו ב-`map_zones.active_alt_range_ids` (מוגבל).

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
