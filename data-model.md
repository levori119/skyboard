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
