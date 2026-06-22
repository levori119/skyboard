---
name: transfer-logic
description: Transfer Logic Context — טען context מלא של מנגנון ההעברות לפני כל שינוי בו. קריטי — אל תגע בהעברות בלי סקיל זה.
---

# Context: מנגנון ההעברות — SKY-KING

## אזהרה

מנגנון ההעברות הוא הליבה הקריטית ביותר של SKY-KING. כל שינוי בו יכול לשבור את זרימת העבודה של בקרי הטיסה.

**לפני כל שינוי בהעברות: קרא את כל הקבצים הרלוונטיים ואת הסקיל הזה במלואו.**

## קרא CLAUDE.md

קרא `CLAUDE.md` — במיוחד את עקרון הרכיבים המשותפים.

## ארכיטקטורת ההעברות

### ישויות ב-DB

```
strips → strip_transfers ← sectors (from / to)
         ↑                ↑
    workstations      sub_sectors
```

### מצבי סטריפ בהעברה
```
queued → active → pending_transfer → [at_next_station]
```

### סוגי העברות קיימים
1. **העברה לסקטור** — מבקר לסקטור שכן, דרך נקודת העברה (sub_sector)
2. **העברה ישירה לעמדה** (station-to-station) — ישירות לעמדה ספציפית
3. **העברה חלקית** — חלק מהמטוסים בפ"מ (מחייב פיצול)
4. **קבלה למפה** (accept-to-map) — קבלת העברה ישירות למפה
5. **קבלה קלאסית** — קבלה לפאנל הקבלה בתצוגה קלאסית

### Routes הקיימים (server.js)
```
POST /api/strip-transfers          — שליחת העברה
GET  /api/strip-transfers          — קבלת העברות פעילות
PUT  /api/strip-transfers/:id      — עדכון סטטוס (accept/reject)
POST /api/strips/:id/split         — פיצול פ"מ לפני העברה חלקית
GET  /api/strips/sector-siblings   — מציאת אחים אחרי פיצול
```

### פיצול פ"מ (Split Formation)
ראה `data-model.md` — סעיף "מה קורה כשפ"מ מפוצל".
- `parent_strip_id` מצביע על ה-root
- `aircraft_indices` מחזיק את המספרים המקוריים
- `getSectorSiblings` מוצא אחים

### Activity Log — Events של העברות
כל אירוע העברה חייב ללכת ל-activity_log:
- `transfer_sent` — כשנשלחת
- `transfer_accepted` — כשנתקבלה
- `transfer_rejected` — כשנדחתה
- `transfer_to_map` — כשנתקבלה למפה
- `altitude_conflict` — severity: critical

## גישה לשינויים בהעברות

### מה מותר לשנות
- הוספת שדה חדש ל-`strip_transfers` → דרך `/migrate`
- שינוי UI של כרטיס העברה (OutgoingTransferCard / IncomingTransferCard)
- הוספת סוג event ל-activity_log

### מה מחייב אישור CEO
- שינוי ב-flow של קבלה/דחייה
- שינוי לוגיקת פיצול
- שינוי מצבי הסטריפ (state machine)

### מה אסור לשנות בלי תכנון מלא
- מבנה טבלת `strip_transfers`
- לוגיקת `getSectorSiblings`
- מנגנון ה-polling של העברות

## בדיקות חובה אחרי שינוי בהעברות

1. שליחת העברה בין שתי עמדות → נתקבלה?
2. דחיית העברה → חזרה לשולח?
3. העברה חלקית → פיצול נכון?
4. שתי עמדות קיבלו אותה העברה → אין כפילות?
5. Activity log הוקלט נכון?
