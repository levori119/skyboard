# מבנה נתונים — SKY KING

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
| `service_type` | VARCHAR(12) | `buttons` (מסך ניהול אמצעים) / `freetext` (טקסט חופשי בכתב יד) / `table` (טבלה חכמה) |
| `name` | VARCHAR(100) | שם השירות |
| `config` | JSONB | הגדרות אדמין — לפי סוג: freetext: `{ruled,lineGap,title}`; table: `{columns[],allowAddRows,initialRows,computed[],rules[],summary{}}` |
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
