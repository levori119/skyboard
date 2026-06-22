---
name: ground-view
description: Ground View Context — טען context של עמדת המגד (TWR/מגרש) לפני עבודה עליה. מסך ייחודי לניהול שדה קרקעי.
---

# Context: Ground View — עמדת מגד פיקוח (TWR)

## קרא CLAUDE.md

קרא `CLAUDE.md`. זכור: **מגד פיקוח (TWR)** = ניהול שדה אווירי וקרקעי באזורים המבצעיים.

## מה זה Ground View

Ground View היא עמדת המגד — שונה לחלוטין מעמדת הבקר, אבל משתמשת באותם רכיבי ליבה (DRY).

### פריסת המסך (3 פאנלים)
```
┌─────────────┬──────────────────┬──────────────┐
│ רשימת פ"מ   │   מפת שדה תעופה  │ סקטורי העברה │
│             │                  │              │
│ + פמ"מ      │  [מטוסים על מפה] │ [העברות]     │
│             │                  │              │
└─────────────┴──────────────────┴──────────────┘
```

### מה ייחודי ל-Ground View
- יצירת פ"מ חדש ישירות מהעמדה (`POST /api/strips/ground-create`)
- כרטיס סטריפ קביל/מורחב לפי מטוס בודד (לא רק פ"מ)
- `strip_aircraft` — טבלת מטוסים בודדים עם `datk` (מספר חניה) ו-`kipa`
- חימושים ומערכות לכל מטוס (armaments / systems)
- גרירת **מטוס בודד** על המפה (לא רק פ"מ שלם)
- סינון `ground_datk_filter` + `ground_status_filter` לפי בקר אישי
- שקדיה (🌰) indicator — מערכת שמיש בפ"מ

### Routes ייחודיים ל-Ground
```
POST /api/strips/ground-create
GET  /api/strip-aircraft?strip_ids=...
PUT  /api/strip-aircraft/:stripId/:idx
POST /api/strip-aircraft/ensure/:stripId
GET  /api/strip-aircraft-armaments/bulk?aircraft_ids=...
POST /api/strip-aircraft-armaments
PUT  /api/strip-aircraft-armaments/:id
DELETE /api/strip-aircraft-armaments/:id
GET  /api/strip-aircraft-systems/bulk?aircraft_ids=...
GET  /api/strips/:id/formation-summary
```

### State ב-App.tsx הרלוונטי
```typescript
groundStripAircraft: Record<string, GroundAircraftRow[]>
acArmaments, acSystems        // per aircraft
openAcPanel, formationSummary  // UI state
```

## עקרונות עבודה ב-Ground View

### DRY — מה משותף עם CTRL
- רכיבי כרטיס סטריפ בסיסי — משותפים
- מנגנון העברות — אותו מנגנון
- ConfirmModal, ClockWidget, VirtualKeyboard — משותפים
- Query Builder לסינון — משותף

### מה ייחודי ל-TWR בלבד
- `strip_aircraft` rows ועריכתם
- חימושים/מערכות לפי מטוס
- מפת שדה תעופה (airfield map) — שונה ממפת הסקטורים
- סינון לפי datk

## כשעובדים על Ground View

1. לבדוק שהשינוי לא שובר את MapView / TableView / ClassicView
2. `groundStripAircraft` state — debounce של 600ms על saves
3. formation summary מחושב בserver (`GET /api/strips/:id/formation-summary`)
4. שינוי ב-strip_aircraft חייב לעדכן גם summary

## אזהרות
- אל תשנה את מבנה `strip_aircraft` בלי `/migrate` + עדכון `data-model.md`
- `idx` ב-`strip_aircraft` הוא סידורי-חדש (לא המקורי) — בלבול נפוץ
- `aircraft_indices` ב-`strips` הוא המספרים המקוריים לפני renumber
