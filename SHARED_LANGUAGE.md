# SKY-KING — שפה משותפת: שירותים והגדרות

> מסמך זה הוא ה**מילון המשותף** של הצוות: כל "שירות" (יכולת עסקית) במערכת —
> השם שלו, מה הוא עושה, איפה הקוד (frontend + backend), ומאיזה endpoints הוא בנוי.
> כשמדברים על פיצ'ר — משתמשים בשמות מהמסמך הזה.
> עודכן: 2026-06-22.

> 🔗 מסמכים קשורים: [SERVICES.md](SERVICES.md) (קטלוג טכני של כל מודול) · [DEV_GUIDE.md](DEV_GUIDE.md) (מילון מונחים) · [data-model.md](data-model.md) (DB) · [MAP_SERVICES.md](MAP_SERVICES.md) (שירותי מפה גנריים).

---

## מפת השירותים (תמונת על)

| # | שירות | למי | קוד frontend | קוד backend |
|---|--------|-----|--------------|-------------|
| 1 | ניהול סטריפים (פ"מ) | בקר + פקח | `strips/Strip.tsx` | `routes/strips.js` |
| 2 | העברות עמדה | בקר + פקח | `transfers/` | `routes/transfers.js` |
| 3 | נקודות העברה (סקטורים) | בקר | `transfers/DraggablePanels.tsx` | `routes/sectors.js` |
| 4 | עמדת בקר (CTRL) | בקר | `views/SectorDashboard.tsx` | `routes/workstations.js` |
| 5 | עמדת מגדל (TWR) | פקח | `views/GroundView.tsx` | `routes/airfield.js` |
| 6 | בלוקי גובה | בקר | `blocks/` | `routes/blocks.js` |
| 7 | אזורי מפה (Flight Zones) | בקר | `map/MapZoneEditor.tsx` | `routes/maps.js` |
| 8 | תצוגה קלאסית | בקר | `classic/ClassicViews.tsx` | `routes/classic.js` |
| 9 | תצוגה אנכית (ציר זמן) | בקר | `views/VerticalView.tsx` | `routes/strips.js` |
| 10 | סטריפים אזרחיים | בקר | `classic/ClassicViews.tsx` | `routes/civilian.js` |
| 11 | התראות בד"ח (BDH) | ראש צוות | `views/SectorDashboard.tsx` | `routes/admin.js` |
| 12 | סיריאלים | בקר | `admin/managers.tsx` | `routes/admin.js` |
| 13 | כלי שיתוף (פתקיות/קבוצות/ציור) | בקר | `views/SectorDashboard.tsx` | `routes/collaboration.js` |
| 14 | סטטוס בסיסים + קשרים | בקר | `views/SectorDashboard.tsx` | `routes/base.js` |
| 15 | מערכת נהג/רכב | נהג + פקח | `routes/driver.js` (HTML) | `routes/driver.js` |
| 16 | ניהול (Admin) | מנהל | `admin/ManagementPage.tsx` | `routes/admin.js` + רבים |
| 17 | זיהוי כתב יד (OCR) | בקר | `shared/HandwritingOverlay.tsx` | `routes/crew.js` (digits) |
| 18 | סינון פ"מים (Query) | בקר | `query/QueryBuilder.tsx` | (client-side) |
| 19 | תחקיר (Activity Log) | מנהל | `admin/managers.tsx` | `routes/admin.js` |
| 20 | דסק משימה כללי | מפעיל דסק | `missiondesk/` | `routes/missionDesks.js` |

---

## פירוט השירותים

### 1. ניהול סטריפים (פ"מ)
**מה:** יצירה/עדכון/מחיקה של פ"מ (פלוגת מטוסים) — היחידה המרכזית. כולל מטוסים בודדים (דת"ק, כיפה), חימושים, מערכות, פיצול ומיזוג תצורה.
**Endpoints:** `/api/strips`, `/api/strips/global`, `/api/strip-aircraft`, `/api/strips/partial-create`, `/api/strips/:id/merge-partial`.
**מונחים:** פ"מ, או"ק, דת"ק, כיפה, שקדיה, תצורה, פיצול.

### 2. העברות עמדה
**מה:** העברת פ"מ בין עמדות/סקטורים — שליחה, **קבל** (עבר אליי, נגרע), **אשר** (אישרתי קבלה, עדיין לא עבר), **דחה עם הערת חובה** (חוזר למוסר + פופאפ), ביטול, ETA, קבלה ישירות למפה, העברה חלקית.
**Endpoints:** `/api/strips/:id/transfer`, `/api/transfers/:id/accept`, `/api/transfers/:id/acknowledge`, `/api/transfers/:id/reject` (body: `note`), `/api/transfers/:id/dismiss`, `/api/transfers/:id/cancel`, `/api/transfers/:id/set-eta`.
**מצבי סטטוס:** `pending → acknowledged → accepted` / `rejected`. אצל המוסר: אושר=ירוק, נדחה=כתום, קונפליקט=אדום.
**מונחים:** מוסר, מקבל, נקודת העברה (שלמה/חץ), אשר, דחה, העברה חלקית, station-to-station.

### 3. נקודות העברה (סקטורים)
**מה:** הגדרת סקטורים (נקודות העברה) וקשרי שכנות ביניהם; פאנל מוסר/מקבל לכל נקודה.
**Endpoints:** `/api/sectors`, `/api/sectors/:id/neighbors`, `/api/sub-sectors`.

### 4. עמדת בקר (CTRL)
**מה:** המסך הראשי של הבקר. מאחד 4 תצוגות (מפה/טבלה/אנכית/קלאסית), פאנלי נקודות העברה, בלוקים, אזורים, התראות, כלי שיתוף.
**רכיב:** `SectorDashboard.tsx` (הגדול ביותר).

### 5. עמדת מגדל (TWR)
**מה:** מסך הפקח — 3 פאנלים: רשימת פ"מ, מפת שדה תעופה, סקטורי העברה. ניהול מטוסים בודדים על המפה, סטטוס קרקע, זיהוי קונפליקטים על מסלול.
**רכיב:** `GroundView.tsx`. **Endpoints:** `/api/airfields`, `/api/live-runway-conflicts`, `/api/active-takeoffs`, `/api/airfield-elements`.
**מונחים:** מגדל, פקח, מגרש, דת"ק, מסלול גלגול, רמזור/מחסום.

### 6. בלוקי גובה
**מה:** ניהול טווחי גובה למשימות — מרחבים, טבלאות, בלוקים, זיהוי חריגה מבלוק.
**Endpoints:** `/api/block-spaces`, `/api/block-tables`, `/api/blocks`, `/api/strips/:id/block-deviation`.

### 7. אזורי מפה (Flight Zones)
**מה:** ציור אזורי polygon על מפה + טווחי גובה, ושיוך פ"מ לאזור עם זיהוי קונפליקטים.
**Endpoints:** `/api/map-zones`, `/api/zone-altitude-ranges`, `/api/strip-zone-assignments`.

### 8. תצוגה קלאסית
**מה:** תצוגת 3 עמודות (קבלה / שלי / מסירה) בסגנון ניהול סטריפ קלאסי + קישורי שותף.
**רכיב:** `ClassicViews.tsx`. **Endpoints:** `/api/classic-strip-tables`, `/api/presets/:id/classic-incoming`.

### 9. תצוגה אנכית (ציר זמן)
**מה:** סטריפים לפי שעת המראה/זמ"מ, קיבוץ לפי ע"ר/כותרת/מבצע/בלוק.
**רכיב:** `VerticalView.tsx`.

### 10. סטריפים אזרחיים
**מה:** לוח טיסות אזרחי + שיוך לעמדות.
**Endpoints:** `/api/civ-strips`, `/api/civilian-assignments`.

### 11. התראות בד"ח (BDH)
**מה:** צ'ק-ליסטים מנוהלים + **הפצת התראה לעמדה אחרת** (כפתור "🔔 הפץ"). העמדה המקבלת רואה פופ-אפ.
**Endpoints:** `/api/bdh`, `/api/bdh-alerts` (POST=הפצה, GET=קבלה לפי עמדה).
**הערה:** תוקן באג tz שמנע הפצה (ראה REFACTOR_LOG #016).

### 12. סיריאלים
**מה:** ייבוא וניהול סיריאלים, שיוך לפ"מ לפי תחנת בקרה, זיהוי סיריאל לא עדכני.
**Endpoints:** `/api/serials`, `/api/strip-serial-selections`.

### 13. כלי שיתוף
**מה:** פתקיות (sticky notes) עם הפצה, הערות קבוצתיות, ציור משותף (pen/shapes), הודעות בין עמדות.
**Endpoints:** `/api/sticky-notes`, `/api/sticky-notes/:id/distribute`, `/api/work-group-notes`, `/api/collab-state`, `/api/workstation-messages`.

### 14. סטטוס בסיסים + קשרים
**מה:** סטטוס בסיסים (מז"א/ספיגה/ציפורים), לחץ אטמוספרי, קשרים (תדרים/ערוצים).
**Endpoints:** `/api/base-statuses`, `/api/aviation-bases`, `/api/workstation-contacts`.

### 15. מערכת נהג/רכב
**מה:** בקשות רכב, מעקב GPS, הודעות, חישוב נתיב (A*), אפליקציית נהג (`/driver`).
**Endpoints:** `/api/vehicle-requests`, `/api/vehicle-gps`, `/api/route-plan`.

### 16. ניהול (Admin)
**מה:** מסך ניהול מרכזי — עמדות, בקרים, סקטורים, שדות תעופה, בלוקים, BDH, סיריאלים, קשרים, מצבי טבלה.
**רכיב:** `ManagementPage.tsx` + `managers.tsx` (12 מנהלים).

### 17. זיהוי כתב יד (OCR)
**מה:** הזנת גובה/ערכים בכתב יד עם Tesseract + למידת ספרות אישית לכל בקר.
**Endpoints:** `/api/digits`.

### 18. סינון פ"מים (Query)
**מה:** מנוע סינון ויזואלי (AND/OR/NOT) להצגת פ"מים לפי תנאים. client-side.
**רכיב:** `QueryBuilder.tsx` + `utils/queryBuilder.ts`.

### 19. תחקיר (Activity Log)
**מה:** לוג audit לכל פעולה משמעותית (העברה, יצירה, מחיקה, קונפליקט) + מסך תחקיר עם פילטרים.
**Endpoints:** `/api/activity-log`.

### 20. דסק משימה כללי
**מה:** דסק גנרי לרישום — סוג עמדה חדש (`preset_type='mission_desk'`). האדמין בונה דסק במסך הניהול (פריסת BSP כמו חלון סטריפים) משלושה סוגי שירותים: **מסך ניהול אמצעים** (כפתורים עם מצבים/צבעים, נוצרים בעמדה בקליק ימני, מיקום חופשי בגרירה, טריגר התראה מתפרצת לעמדה אחרת), **טקסט חופשי** (כתב יד/דיו על canvas, שורות הפרדה וכותרת), **טבלה חכמה** (עמודות טקסט/מספר/V-X/תפריט, עמודות חישוב, עיצוב מותנה, שורת סיכום). שירות ניתן לשיתוף בין עמדות — שינוי בעמדה אחת מתעדכן בשנייה (fan-out בשרת + polling).
**Endpoints:** `/api/mission-desks`, `/api/mission-desks/:id/services`, `/api/mission-desk-services/:sid`, `/api/mission-desk-state`.
**מונחים:** דסק משימה, שירות, מסך ניהול אמצעים, טבלה חכמה, שיתוף שירות.

---

## איך משתמשים בשפה הזו

- כשמדווחים באג / מבקשים פיצ'ר — לנקוב בשם השירות (למשל "העברות עמדה" או "התראות בד"ח").
- לפני נגיעה בשירות — לקרוא את המודול שלו ב-[SERVICES.md](SERVICES.md) ואת ה-context skill אם יש (`/transfer-logic`, `/ctrl-view`, `/ground-view`).
- שם טכני (route/component) ↔ שם עסקי (השירות) — המיפוי כאן.
