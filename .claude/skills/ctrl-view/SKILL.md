---
name: ctrl-view
description: Controller View Context — טען context של עמדת הבקר (CTRL) לפני עבודה עליה. המסך הראשי של בקר הטיסה.
---

# Context: Controller View — עמדת בקר טיסה (CTRL)

## קרא CLAUDE.md

קרא `CLAUDE.md`. זכור: **בקר טיסה (CTRL)** = ניהול ורישום מידע שדה בשולחן הבקרה.

## מה זה Controller View

זוהי עמדת העבודה הראשית של בקר הטיסה — המסך שרואים הכי הרבה.

### תצוגות זמינות לבקר
```
MapView      — מפת סקטורים + גרירת סטריפים
TableView    — טבלה עם עמודות מותאמות (table_modes)
VerticalView — ציר זמן / מיון לפי המראה
ClassicView  — 3 עמודות: קבלה / שלי / מסירה
```

### ה-UI הראשי של הבקר
```
┌──────────────────────────────────────────────────────┐
│  Header: שם עמדה | בקר | שעה | לחץ אטמוספרי        │
├───────────────────────┬──────────────────────────────┤
│                       │  פאנלי נקודות העברה          │
│   תצוגה ראשית        │  (DraggableNeighborPanel)     │
│   (Map/Table/etc.)    │                              │
│                       │  קישורים | קשרים | BDH       │
└───────────────────────┴──────────────────────────────┘
```

### מה ייחודי ל-CTRL
- תצוגת מפה עם אזורי סקטורים וזונות
- פאנלי נקודות העברה (DraggableNeighborPanel) — ניהול מוסר/מקבל
- Flight Zones Mode — שיוך סטריפ לאזור גובה
- בלוקים חכמים (Block Spaces/Tables) — ניהול גבהים
- Serials — ייבוא וניהול סיריאלים
- OCR — זיהוי כתב יד עם Tesseract.js
- Query Builder — סינון סטריפים לפי תנאים מורכבים
- BDH Checklist — רשימת תיוג לבקר

### Routes עיקריים ל-CTRL
```
GET  /api/strips               — כל הסטריפים (עם filter)
POST /api/strips               — יצירת סטריפ
PUT  /api/strips/:id           — עדכון סטריפ
DELETE /api/strips/:id         — מחיקת סטריפ
GET  /api/block-spaces         — מרחבי בלוקים
GET  /api/map-zones            — אזורי מפה
POST /api/strip-zone-assignments — שיוך לאזור
GET  /api/serials              — סיריאלים
POST /api/activity-log         — log event
```

### State ב-App.tsx הרלוונטי
```typescript
strips: Strip[]                 // הסטריפים הראשיים
transfers: Transfer[]           // העברות פעילות  
session: WorkstationSession     // מי אני ואיפה
filterQuery: QNode | null       // query filter נוכחי
viewMode: 'map'|'table'|'vertical'|'classic'
```

## עקרונות עבודה ב-Controller View

### DRY — מה משותף עם TWR
- רכיבי כרטיס סטריפ בסיסי
- מנגנון העברות (transfer-logic)
- ConfirmModal, ClockWidget, VirtualKeyboard
- activity_log

### מה ייחודי ל-CTRL בלבד
- MapView עם סקטורים (שונה ממפת שדה של מגרש)
- Flight Zones Mode
- Block Spaces
- DraggableNeighborPanel

## כשעובדים על Controller View

1. שינוי בתצוגת מפה — לא ישפיע על Ground Map (מפות שונות)
2. שינוי ב-StripCard הבסיסי — **ישפיע גם על TWR** → חובה /qa
3. Conflict detection (altitude) — חי ב-CTRL, לא ב-TWR
4. OCR + learned_digits — ייחודי ל-CTRL
5. Polling interval — כרגע 5 שניות, מספיק ל-CTRL אבל לא אידיאלי

## אזהרות
- אל תשנה logika של query filtering בלי לבדוק את `workstation_personal_filters`
- שינוי ב-`table_modes` יכול לשבור עמדות שמסתמכות על mode ספציפי
- `relevantSectors` בsession קובע מה הבקר רואה — שינוי שם חייב לעדכן את כל מי שמשתמש בו
