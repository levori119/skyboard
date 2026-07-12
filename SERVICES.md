# SKY-KING — קטלוג מודולים (Services Catalog)

> מסמך זה מתעד כל מודול במערכת: שם, מיקום, תפקיד, ותלויות עיקריות.
> עודכן: 2026-06-22 | אחרי פירוק מלא של המונוליטים (server.js + App.tsx).

---

## תוכן עניינים

1. [Backend — DB Layer](#backend--db-layer)
2. [Backend — API Routes](#backend--api-routes)
3. [Frontend — Types](#frontend--types)
4. [Frontend — Utils](#frontend--utils)
5. [Frontend — Shared Components](#frontend--shared-components)
6. [Frontend — Feature Components](#frontend--feature-components)
7. [Frontend — Views (מסכים ראשיים)](#frontend--views-מסכים-ראשיים)
8. [Frontend — Admin](#frontend--admin)
9. [Entry Points](#entry-points)

---

## Backend — DB Layer

### `server/db/pool.js`
**תפקיד:** מופע יחיד (singleton) של PostgreSQL connection pool. מתחבר ל-Neon דרך `DATABASE_URL`.
**מייצא:** `pool` (default).
**הערה:** כל קובץ ב-backend מייבא את ה-pool מכאן — מקור אמת יחיד לחיבור ה-DB.

### `server/db/init.js`
**תפקיד:** יצירת סכמת ה-DB. מכיל `initDb()` שיוצר את כל ~50 הטבלאות (`CREATE TABLE IF NOT EXISTS`) + מיגרציות עמודות (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
**מייצא:** `initDb()`, `cleanupExpiredStrips()` (ניקוי שעתי של פ"מ ידניים שפג תוקפם).
**הערה:** schema בלבד — אין כאן נתוני אתחול.

### `server/db/seed.js`
**תפקיד:** נתוני אתחול (seed). מכניס בקרים ברירת מחדל, סקטורים, sub-sectors, table modes ועמדות, רק אם הטבלאות ריקות (`ON CONFLICT DO NOTHING`).
**מייצא:** `seedDb()`.
**הערה:** הופרד מ-init כדי שלא יערבב נתונים עם סכמה.

---

## Backend — API Routes

> כל קובץ route מייצא `express.Router`. סך הכל **353 endpoints**.

### `server/routes/crew.js` — 16 routes
**תפקיד:** ניהול בקרים (crew members), אימות כניסה לעמדה, OCR digits, תפקידי סשן, בקר פעיל לעמדה.
**Endpoints עיקריים:** `/api/crew-members`, `/api/digits`, `/api/workstations/login`, `/api/workstation-session-roles`, `/api/preset-active-crew`.

### `server/routes/strips.js` — 45 routes
**תפקיד:** ליבת ניהול הפ"מים — CRUD, ייבוא, מטוסים בודדים (`strip_aircraft`), חימושים, מערכות, פיצול/מיזוג תצורה, סיכומי תצורה.
**Endpoints עיקריים:** `/api/strips`, `/api/strip-aircraft`, `/api/strips/partial-create`, `/api/strips/:id/merge-partial`, `/api/strips/ground-create`.

### `server/routes/transfers.js` — 16 routes
**תפקיד:** מנגנון ההעברות בין עמדות/סקטורים — שליחה, קבלה, דחייה, ביטול, ETA, קבלה למפה, העברה קלאסית.
**Endpoints עיקריים:** `/api/strips/:id/transfer`, `/api/transfers/:id/accept`, `/api/transfers/:id/reject`, `/api/presets/:id/classic-incoming`.

### `server/routes/sectors.js` — 17 routes
**תפקיד:** ניהול סקטורים (נקודות העברה), קשרי שכנות, sub-sectors, תצורת נקודות העברה.
**Endpoints עיקריים:** `/api/sectors`, `/api/sectors/:id/neighbors`, `/api/sub-sectors`.

### `server/routes/workstations.js` — 13 routes
**תפקיד:** תצורות עמדה (presets), פילטרים אישיים, סטריפים לעמדה, עומס עמדה, קישורי קבוצת עבודה.
**Endpoints עיקריים:** `/api/workstation-presets`, `/api/workstation-personal-filters`, `/api/workstations/:id/strips`.

### `server/routes/maps.js` — 27 routes
**תפקיד:** מפות, אזורי מפה (polygons), טווחי גובה לאזור, שיוך פ"מ לאזור (flight zones), סגירות מרחב.
**Endpoints עיקריים:** `/api/maps`, `/api/map-zones`, `/api/zone-altitude-ranges`, `/api/strip-zone-assignments`, `/api/closures`.

### `server/routes/blocks.js` — 15 routes
**תפקיד:** ניהול בלוקי גובה — מרחבים, טבלאות, בלוקים, חריגות גובה.
**Endpoints עיקריים:** `/api/block-spaces`, `/api/block-tables`, `/api/blocks`, `/api/strips/:id/block-deviation`.

### `server/routes/airfield.js` — 74 routes (הגדול ביותר)
**תפקיד:** כל תפעול השדה הקרקעי — שדות תעופה, נקודות, מסלולי גלגול, מסלולי המראה, taxiways, אלמנטים (רמזורים/מחסומים), פוליגונים, ATIS, NOTAMs, GRF, תאורה, זיהוי קונפליקטים על מסלול.
**Endpoints עיקריים:** `/api/airfields`, `/api/airfield-elements`, `/api/airfield-runways`, `/api/live-runway-conflicts`, `/api/airfield-atis`.

### `server/routes/base.js` — 18 routes
**תפקיד:** בסיסי תעופה, סטטוס בסיסים (מז"א/ספיגה/ציפורים), לחץ אטמוספרי, קשרים (תדרים/ערוצים).
**Endpoints עיקריים:** `/api/aviation-bases`, `/api/base-statuses`, `/api/workstation-contacts`.

### `server/routes/collaboration.js` — 27 routes
**תפקיד:** כלי שיתוף — קבוצות עבודה, הערות קבוצתיות, sticky notes, מצב ציור משותף (pen/shapes), הודעות בין עמדות, ספי מז"א.
**Endpoints עיקריים:** `/api/work-groups`, `/api/sticky-notes`, `/api/collab-state`, `/api/workstation-messages`.

### `server/routes/admin.js` — 44 routes
**תפקיד:** ניהול — סיריאלים, BDH (צ'ק-ליסטים), כלי עזר (aids), מצבי טבלה, לוג תחקיר (activity log).
**Endpoints עיקריים:** `/api/serials`, `/api/bdh`, `/api/aid-groups`, `/api/table-modes`, `/api/activity-log`, `/api/defaults`.

### `server/routes/classic.js` — 15 routes
**תפקיד:** טבלאות סטריפ קלאסיות + פריסות חלון סטריפ (strip window layouts/columns/cells).
**Endpoints עיקריים:** `/api/classic-strip-tables`, `/api/strip-window-layouts`.

### `server/routes/civilian.js` — 6 routes
**תפקיד:** סטריפים אזרחיים ושיוכם לעמדות.
**Endpoints עיקריים:** `/api/civ-strips`, `/api/civilian-assignments`.

### `server/routes/driver.js` — 20 routes
**תפקיד:** מערכת נהג/רכב — בקשות רכב, GPS, הודעות, מסלולי בסיס, חישוב נתיב (A*), אפליקציית נהג (`/driver`).
**Endpoints עיקריים:** `/api/vehicle-requests`, `/api/vehicle-gps`, `/api/route-plan`, `/api/base-routes`.

### `server/app.js`
**תפקיד:** הרכבת Express — middleware (cors, json), חיבור כל ה-routers תחת `/api`, הגשת static (production) / redirect ל-Vite (dev).

---

## Frontend — Types

### `src/types/index.ts`
**תפקיד:** הגדרות TypeScript מרכזיות.
**מייצא:** `AircraftIconType`, `CrewMember`, `WorkstationSession`, `Strip`, `Transfer`, query types (`QOperator`/`QCompare`/`QLeaf`/`QGroup`/`QNode`), map types (`MapZone`/`ZoneAltRange`/`StripZoneAssignment`/`MapGeoAnchor`), ground types (`AircraftPos`/`GroundAircraftRow`).

### `src/types/ground.ts`
**תפקיד:** טיפוסי runtime של תפעול קרקעי (frontend-parsed shapes).
**מייצא:** `GroundStatusKey`, `AircraftPos`, `GroundAircraftRow`, `MapZone`, `ZoneAltRange`, `StripZoneAssignment`, `VectorLine`, `VectorData`.

### `src/types/stripGrid.ts`
**תפקיד:** טיפוסי פריסת Strip Grid (SG) + קטלוג שדות סטריפ קלאסי.
**מייצא:** `SGCell`, `SGSplit`, `SGNode`, `SGCondition`, `CLASSIC_STRIP_FIELDS`.

### `src/types/stripFields.ts`
**תפקיד:** קטלוגי שדות וקבועים משותפים לעריכה.
**מייצא:** `STRIP_FIELD_DEFS`, `CUSTOM_FIELD_EDITABLE_OPTIONS`, `EDITABLE_LABELS`, `STICKY_COLORS`.

---

## Frontend — i18n (דו-לשוניות)

### `src/i18n/index.ts`
**תפקיד:** אתחול `react-i18next` — עברית ברירת מחדל, אנגלית נבחרת; התמדה ב-`localStorage['bt-lang']`. **מייצא:** `default` (i18n), `setAppLanguage(lang)`, `LANG_STORAGE_KEY`, `AppLang`. הערה: התרגומים עטופים ב-namespace `translation` כך ש-`t('login.x')` הם מפתחות מקוננים.

### `src/i18n/useDirection.ts`
**תפקיד:** hook יחיד שמסנכרן `<html dir/lang>` לפי השפה (he→rtl, en→ltr). **מייצא:** `useDirection()`. מופעל ב-root (`App`).

### `src/i18n/locales/he.json` · `en.json`
**תפקיד:** קבצי תרגום. כרגע namespaces `common` + `login` (מסך הכניסה מתורגם במלואו — Pilot).

---

## Frontend — Utils

### `src/config.ts`
**תפקיד:** קבועי תצורה גלובליים. **מייצא:** `API_URL`, `SCREEN_SCALE_MAP`.

### `src/utils/scale.ts`
**תפקיד:** התאמת גודל לפי מסך. **מייצא:** `scale`, `sc(n)` — מכפיל ערך פיקסלים בפקטור המסך.

### `src/utils/session.ts`
**תפקיד:** ניהול סשן עמדה ב-sessionStorage. **מייצא:** `getSession`, `saveSession`, `clearSession`.

### `src/utils/aircraft.ts`
**תפקיד:** מערכת אייקוני מטוסים לפי טייסת. **מייצא:** `getSquadronAircraftType`, `isHeliAircraftType`, `getHeliPngSrc`, `renderAircraftSvgPaths`.

### `src/utils/queryBuilder.ts`
**תפקיד:** מנוע סינון (Query DSL) — AND/OR/NOT עם השוואות. **מייצא:** `Q_FIELDS`, `Q_TEXT_OPS`, `Q_BOOL_OPS`, `Q_OPERATOR_LABELS`, `qGenId`, `emptyQGroup`, `hasConditions`, `clampMenuPos`, `getQFieldValue`, `evalQLeaf`, `evaluateQuery`.

### `src/utils/strips.ts`
**תפקיד:** עזרי פ"מ וגובה. **מייצא:** `getFormationDisplayName`, `getTransferLabel`, `getTransferSq`, `normalizeAlt`, `parseAltToFeet`, `computeBlockDeviation`.

### `src/utils/digits.ts`
**תפקיד:** API לאימון OCR (ספרות כתב יד). **מייצא:** `getLearnedDigits`, `saveLearnedDigit`, `clearLearnedDigits`, `getDigitsCount`.

### `src/utils/handwriting.ts`
**תפקיד:** השוואת תמונות לזיהוי כתב יד. **מייצא:** `compareImages`.

### `src/utils/notes.ts`
**תפקיד:** קידוד/פענוח שדה הערה (טקסט / data-URL / JSON). **מייצא:** `parseNoteValue`, `serializeNoteValue`.

### `src/utils/geo.ts`
**תפקיד:** המרות גיאו (פיקסל↔lat/lon) + פורמט DMS. **מייצא:** `MapGeoAnchor`, `buildGeoAnchor`, `geoToImagePct`, `imagePctToGeo`, `fmtDms`.

### `src/utils/stripGrid.ts`
**תפקיד:** עזרי runtime ל-Strip Grid (פריסת תאים). **מייצא:** `ensureSGBlinkStyle`, `sgGenId`, `sgDefaultCell`, `sgUpdate`, `sgSplit`, `sgRemove`, `sgGetAllCells`.

### `src/utils/stripWindow.tsx`
**תפקיד:** טיפוסים + עזרים לחלון סטריפ (Strip Window) — פריסות waypoint. **מייצא:** `SWLeaf`, `SWSplit`, `SWNode`, `SW_TEXTURES`, `SW_TEMPLATES`, `swGetBgStyle`, `swGenId`, `swDefaultLeaf`, `swRemapIds`, `swUpdate`, `swSplit`, `swRemove`, `swFindLeaf`.

---

## Frontend — Shared Components

### `src/components/shared/ConfirmModal.tsx`
**תפקיד:** דיאלוג אישור גלובלי (מחליף `window.confirm`) עם תמיכת מקלדת. **מייצא:** `ConfirmModal` (default), `customConfirm`.

### `src/components/shared/ContextMenu.tsx`
**תפקיד:** תפריט קליק-ימני להעברת פ"מ לנקודת העברה. **מייצא:** `ContextMenu` (default).

### `src/components/shared/OnScreenKeyboard.tsx`
**תפקיד:** מקלדת וירטואלית לטאבלט (עברית/אנגלית/סמלים), ניתנת לגרירה. **מייצא:** `OnScreenKeyboard` (default).

### `src/components/shared/HandwritingOverlay.tsx`
**תפקיד:** קנבס כתב-יד לקלט גובה עם OCR (Tesseract + digits שנלמדו). **מייצא:** `HandwritingOverlay` (default).

### `src/components/shared/LearnDigitsOverlay.tsx`
**תפקיד:** מסך אימון ספרות כתב-יד לכל בקר. **מייצא:** `LearnDigitsOverlay` (default).

### `src/components/shared/Modals.tsx`
**תפקיד:** מודלים גנריים. **מייצא:** `SettingsModal`, `MaybeSettingsModal`, `BlockSpaceCellTable`.

---

## Frontend — Feature Components

### `src/components/strips/Strip.tsx`
**תפקיד:** רכיב הסטריפ המרכזי — כרטיס פ"מ עם גרירה, עריכת גובה/הערות, פאנל פרטים, סיריאלים, חריגת בלוק, קונפליקטים. **מייצא:** `Strip` (default). **משותף:** CTRL + TWR.

### `src/components/transfers/TransferCards.tsx`
**תפקיד:** כרטיסי העברה. **מייצא:** `TransferStripEditor`, `OutgoingTransferCard` (מוסר), `IncomingTransferCard` (מקבל + countdown).

### `src/components/transfers/DraggablePanels.tsx`
**תפקיד:** פאנלי העברה ניתנים לגרירה. **מייצא:** `DraggableNeighborPanel` (נקודת העברה מוסר/מקבל), `DraggableIncomingTransferMini`, `DraggableMapMarker` (סמן מפה), `DraggableIncomingTransfer`, `TableHandwritingCanvas`.

### `src/components/map/MapZoneEditor.tsx`
**תפקיד:** עורך אזורי מפה — ציור polygons, כיול גיאו (anchors/DMS), זיהוי אזורים אוטומטי (OCR), טווחי גובה. **מייצא:** `MapZoneEditor` (default). **שימוש:** admin.

### `src/components/map/MapsManager.tsx`
**תפקיד:** ניהול מפות — העלאה (תמונה/PDF), מחיקה, embed של MapZoneEditor. **מייצא:** `MapsManager` (default). **שימוש:** admin.

### `src/components/ground/groundShared.tsx`
**תפקיד:** קבועים + אייקונים + עזרים משותפים לתפעול קרקעי. **מייצא:** קבועי מז"א (`AIR_DEFENSE_STATUSES`, `YABA_AIR_DEFENSE_STATUSES`, `ALL_MAZAA_STATUSES`), `GROUND_STATUSES`, `GROUND_POINT_MARKERS`, `GROUND_SVG_ICON_KEYS`, `GroundMarkerSVG`, `renderGroundSvgIcon`, `getElemDisplayStateOpts`, `normalizeAircraftPositions`, `ptLineDist`, `dpSimplify`, `toEmbedUrl`.

### `src/components/ground/GroundVehiclePanel.tsx`
**תפקיד:** ניהול כלי רכב + מערכות מז"א (פטריוט/יבה) — מיקום, סטטוס, עורך ויזואלי. **מייצא:** `GroundVehiclePanel` (default).

### `src/components/blocks/BlockMiniView.tsx`
**תפקיד:** תצוגת mini של בלוקי גובה לסטריפ + אינדיקציית קונפליקט. **מייצא:** `BlockMiniView` (default).

### `src/components/blocks/BlockVisualPainter.tsx`
**תפקיד:** כלי ציור ויזואלי ליצירת/עריכת בלוקי גובה. **מייצא:** `BlockVisualPainter`, `BLOCK_PALETTE`, `hexToHue`, `pickDistinctBlockColor`.

### `src/components/query/QueryBuilder.tsx`
**תפקיד:** ממשק בניית שאילתות סינון ויזואלי (עץ AND/OR/NOT). **מייצא:** `QueryBuilder`, `QGroupEditor`, `QBuilderCtx`.

### `src/components/classic/ClassicViews.tsx`
**תפקיד:** רכיבי תצוגה קלאסית ואזרחית. **מייצא:** `ClassicStripCard`, `ClassicView` (3 עמודות: קבלה/שלי/מסירה), `ClassicTransferHelpModal`, `ClassicPartnersAndPointsEditor`, `CivilianStripCard`, `CivilianView`, + טיפוסים `CivCol`/`CivAssignment` + `CIV_STATUSES`.

### `src/components/dashboard/AdminDashboard.tsx`
**תפקיד:** לוח מחוונים + מודל העברה. **מייצא:** `TransferFormModal` (העברה חלקית + ETA), `DonutChart`, `AdminDashboard` (עומס עמדות/מז"א).

---

## Frontend — Views (מסכים ראשיים)

### `src/components/views/SectorDashboard.tsx` (14,573 ש' — הגדול ביותר)
**תפקיד:** עמדת הבקר הראשית (CTRL) — מאחד את כל התצוגות: MapView, TableView, VerticalView, ClassicView, GroundView. מנהל את state הראשי: סטריפים, העברות, פילטרים, מפה, בלוקים, אזורים, sticky notes.
**מייצא:** `SectorDashboard` (default).
**שימוש:** המסך שהבקר רואה רוב הזמן.

### `src/components/views/GroundView.tsx` (4,812 ש')
**תפקיד:** עמדת המגדל (TWR / מגרש) — 3 פאנלים: רשימת פ"מ, מפת שדה, סקטורי העברה. ניהול מטוסים בודדים, דת"ק/כיפה, חימושים/מערכות, גרירת מטוס בודד.
**מייצא:** `GroundView` (default).

### `src/components/views/VerticalView.tsx` (1,055 ש')
**תפקיד:** תצוגת ציר זמן — סטריפים לפי שעת המראה/זמ"מ, קיבוץ לפי ע"ר/כותרת/מבצע/בלוק.
**מייצא:** `VerticalView` (default).

---

## Frontend — Admin

### `src/components/admin/managers.tsx` (3,103 ש')
**תפקיד:** 12 רכיבי ניהול נפרדים. **מייצא:** `StickyNotesLayer`, `WorkGroupsManager`, `TableModesManager`, `AidsManager`, `SerialsAdminTab`, `SerialsPanelModal`, `DebriefingTab` (תחקיר), `CivilianStripsAdmin`, `DefaultNamesManager`, `StripGridEditor`, `ClosuresManager`, `StripWindowAdmin`.

### `src/components/admin/ManagementPage.tsx` (7,467 ש')
**תפקיד:** מסך הניהול הראשי — מאגד את כל ה-managers, ניהול עמדות/בקרים/סקטורים/שדות/בלוקים/BDH/סיריאלים/קשרים.
**מייצא:** `ManagementPage` (default).
**שימוש:** admin / team_lead.

---

## Entry Points

### `src/App.tsx` (728 ש')
**תפקיד:** שורש האפליקציה — `WorkstationLogin` (מסך כניסה) + `App` (routing בין login / SectorDashboard / ManagementPage לפי סשן).

### `src/index.tsx`
**תפקיד:** mount של React אל ה-DOM.

### `server.js` (19 ש')
**תפקיד:** entry point של ה-backend — `initDb()` → `seedDb()` → `app.listen()`.

### `electron-main.cjs`
**תפקיד:** עטיפת Electron — טוען config.json, מעלה את השרת, פותח חלון.

---

## מפת תלויות — שכבות

```
Entry (App.tsx, server.js)
   │
   ▼
Views (SectorDashboard, GroundView, VerticalView) + ManagementPage
   │
   ▼
Feature Components (Strip, TransferCards, DraggablePanels, Map*, ground*, blocks*, query, classic, dashboard, admin/managers)
   │
   ▼
Shared Components (ConfirmModal, ContextMenu, OnScreenKeyboard, HandwritingOverlay, Modals)
   │
   ▼
Utils (scale, session, aircraft, queryBuilder, strips, digits, geo, notes, stripGrid, stripWindow)
   │
   ▼
Types (index, ground, stripGrid, stripFields) + config
```

> כלל: שכבה מייבאת רק משכבות מתחתיה. אין תלויות מעגליות.

---

## נספח א' — קטלוג Endpoints מלא (353)

> רשימת כל ה-API endpoints לפי קובץ route. מיוצר אוטומטית מהקוד.

#### admin.js
DELETE /api/activity-log
DELETE /api/aid-groups/:id
DELETE /api/aid-items/:id
DELETE /api/bdh-items/:id
DELETE /api/bdh/:id
DELETE /api/serials/all
DELETE /api/strip-serial-dismissals
DELETE /api/strip-serial-selections
DELETE /api/table-modes/:id
GET /api/activity-log
GET /api/aid-groups
GET /api/aid-groups/:id
GET /api/bdh
GET /api/bdh-alerts
GET /api/bdh-preset-assignments
GET /api/defaults
GET /api/presets/:id/aid-group
GET /api/presets/:id/bdh
GET /api/serials
GET /api/strip-serial-dismissals
GET /api/strip-serial-selections
GET /api/table-modes
PATCH /api/bdh-alerts/:id/dismiss
POST /api/activity-log
POST /api/aid-groups
POST /api/aid-groups/:id/duplicate
POST /api/aid-groups/:id/items
POST /api/aid-groups/:id/link
POST /api/bdh
POST /api/bdh-alerts
POST /api/bdh/:id/items
POST /api/defaults
POST /api/serials/import
POST /api/strip-serial-dismissals
POST /api/strip-serial-selections
POST /api/table-modes
PUT /api/aid-groups/:id
PUT /api/aid-items/:id
PUT /api/bdh-items/:id
PUT /api/bdh/:id
PUT /api/bdh/:id/items/reorder
PUT /api/presets/:id/aid-group
PUT /api/presets/:id/bdh
PUT /api/table-modes/:id

#### airfield.js
DELETE /api/airfield-atis/:id
DELETE /api/airfield-element-types/:id
DELETE /api/airfield-elements/:id
DELETE /api/airfield-general-notams/:id
DELETE /api/airfield-points/:id
DELETE /api/airfield-polygon-statuses/:polygon_id
DELETE /api/airfield-polygons/:id
DELETE /api/airfield-routes/:id
DELETE /api/airfield-runways/:id
DELETE /api/airfield-sectors/:id
DELETE /api/airfield-status-types/:id
DELETE /api/airfield-taxiways/:id
DELETE /api/airfields/:id
DELETE /api/element-nav/:element_id
DELETE /api/route-links/:id
DELETE /api/runway-grf/:id
DELETE /api/runway-notams/:id
GET /api/active-takeoffs
GET /api/airfield-atis
GET /api/airfield-element-types
GET /api/airfield-elements
GET /api/airfield-elements/by-base/:baseId
GET /api/airfield-general-notams
GET /api/airfield-points/by-base/:baseId
GET /api/airfield-polygon-statuses
GET /api/airfield-polygons
GET /api/airfield-routes
GET /api/airfield-runways
GET /api/airfield-sectors
GET /api/airfield-status-types
GET /api/airfield-taxiways
GET /api/airfields
GET /api/airfields/:id
GET /api/airfields/:id/points
GET /api/airfields/by-base/:baseId
GET /api/element-nav
GET /api/live-runway-conflicts
GET /api/route-links
GET /api/runway-conflict
GET /api/runway-grf
GET /api/runway-lighting
GET /api/runway-notams
POST /api/airfield-atis
POST /api/airfield-element-types
POST /api/airfield-elements
POST /api/airfield-general-notams
POST /api/airfield-polygon-statuses
POST /api/airfield-polygons
POST /api/airfield-routes
POST /api/airfield-runways
POST /api/airfield-sectors
POST /api/airfield-status-types
POST /api/airfield-taxiways
POST /api/airfields
POST /api/airfields/:id/duplicate
POST /api/airfields/:id/points
POST /api/route-links
POST /api/runway-grf
POST /api/runway-notams
PUT /api/airfield-element-types/:id
PUT /api/airfield-elements/:id
PUT /api/airfield-general-notams/:id
PUT /api/airfield-points/:id
PUT /api/airfield-polygons/:id
PUT /api/airfield-routes/:id
PUT /api/airfield-runways/:id
PUT /api/airfield-sectors/:id
PUT /api/airfield-status-types/:id
PUT /api/airfield-taxiways/:id
PUT /api/airfields/:id
PUT /api/airfields/:id/vector
PUT /api/element-nav/:element_id
PUT /api/runway-lighting/:runway_id
PUT /api/runway-notams/:id

#### base.js
DELETE /api/aviation-bases/:id
DELETE /api/base-statuses/:id
DELETE /api/workstation-contacts/:id
GET /api/aviation-bases
GET /api/base-pressure/:baseId
GET /api/base-statuses
GET /api/workstation-contacts
GET /api/workstation-contacts/all
PATCH /api/base-statuses/:id/air-defense
PATCH /api/base-statuses/:id/atis
PATCH /api/base-statuses/:id/notam
POST /api/aviation-bases
POST /api/base-statuses
POST /api/workstation-contacts
PUT /api/aviation-bases/:id
PUT /api/base-pressure/:baseId
PUT /api/base-statuses/:id
PUT /api/workstation-contacts/:id

#### blocks.js
DELETE /api/block-spaces/:id
DELETE /api/block-tables/:id
DELETE /api/blocks/:id
GET /api/block-spaces
GET /api/block-tables
GET /api/blocks
PATCH /api/strips/:id/block-deviation
PATCH /api/strips/:id/block-space
POST /api/block-spaces
POST /api/block-tables
POST /api/block-tables/:id/duplicate
POST /api/blocks
PUT /api/block-spaces/:id
PUT /api/block-tables/:id
PUT /api/blocks/:id

#### civilian.js
DELETE /api/civ-strips/:id
DELETE /api/civilian-assignments/:stripId/:presetId
GET /api/civ-strips
GET /api/civilian-assignments
POST /api/civ-strips
POST /api/civilian-assignments

#### classic.js
DELETE /api/classic-strip-tables/:id
DELETE /api/strip-window-cells/:id
DELETE /api/strip-window-columns/:id
DELETE /api/strip-window-layouts/:id
GET /api/classic-strip-tables
GET /api/strip-window-layouts
POST /api/classic-strip-tables
POST /api/strip-window-columns/:id/cells
POST /api/strip-window-layouts
POST /api/strip-window-layouts/:id/columns
PUT /api/classic-strip-tables/:id
PUT /api/classic-strip-tables/:id/layout
PUT /api/classic-strip-tables/:id/rows
PUT /api/strip-window-cells/:id
PUT /api/strip-window-layouts/:id

#### collaboration.js
DELETE /api/preset-mazaa-thresholds/:id
DELETE /api/sticky-notes/:id
DELETE /api/work-group-notes/:id
DELETE /api/work-groups/:id
DELETE /api/work-groups/:id/members/:presetId
GET /api/collab-state/:presetId
GET /api/preset-mazaa-thresholds
GET /api/sticky-notes
GET /api/work-group-mazaa/:groupId
GET /api/work-group-notes/for-preset/:presetId
GET /api/work-groups
GET /api/work-groups/:id/notes
GET /api/workstation-messages
PATCH /api/work-group-mazaa/:groupId
POST /api/preset-mazaa-thresholds
POST /api/sticky-notes
POST /api/sticky-notes/:id/distribute
POST /api/work-groups
POST /api/work-groups/:id/members
POST /api/work-groups/:id/notes
POST /api/workstation-messages
PUT /api/collab-state/:presetId
PUT /api/preset-mazaa-thresholds/:id
PUT /api/sticky-notes/:id
PUT /api/work-group-notes/:id
PUT /api/work-groups/:id
PUT /api/workstation-messages/seen

#### crew.js
DELETE /api/crew-members/:id
DELETE /api/digits
GET /api/crew-members
GET /api/digits
GET /api/digits/count
GET /api/preset-active-crew
GET /api/workstation-session-roles
GET /api/workstations/:id
PATCH /api/crew-members/:id/preferences
PATCH /api/workstations/:id/heartbeat
POST /api/crew-members
POST /api/digits
POST /api/workstations/login
PUT /api/crew-members/:id
PUT /api/preset-active-crew/:presetId
PUT /api/workstation-session-roles/:preset_id

#### driver.js
DELETE /api/base-routes/:id
DELETE /api/preset-links/:id
DELETE /api/vehicle-requests/:id
GET /api/base-routes
GET /api/google-maps-key
GET /api/preset-links/:presetId
GET /api/vehicle-gps/all-latest
GET /api/vehicle-gps/latest/:requestId
GET /api/vehicle-messages
GET /api/vehicle-requests
GET /driver
POST /api/base-routes
POST /api/preset-links/:presetId
POST /api/route-plan
POST /api/vehicle-gps
POST /api/vehicle-messages
POST /api/vehicle-requests
PUT /api/base-routes/:id
PUT /api/preset-links/:id
PUT /api/vehicle-requests/:id

#### maps.js
DELETE /api/closures/:id
DELETE /api/map-zones/:id
DELETE /api/maps/:id
DELETE /api/strip-zone-assignments/:strip_id
DELETE /api/strip-zone-extra-zones/:id
DELETE /api/strip-zone-extra-zones/by-strip/:strip_id
DELETE /api/zone-altitude-ranges/:id
GET /api/closures
GET /api/map-zones
GET /api/maps
GET /api/maps/:id
GET /api/maps/:id/imagedata
GET /api/strip-zone-assignments
GET /api/strip-zone-extra-zones
GET /api/zone-altitude-ranges
PATCH /api/map-zones/:id/enabled
PATCH /api/maps/:id/anchors
POST /api/closures
POST /api/map-zones
POST /api/maps
POST /api/maps/:id/sync-zones-from-parent
POST /api/strip-zone-assignments
POST /api/strip-zone-extra-zones
POST /api/zone-altitude-ranges
PUT /api/closures/:id
PUT /api/map-zones/:id
PUT /api/zone-altitude-ranges/:id

#### sectors.js
DELETE /api/sectors/:id
DELETE /api/sectors/:id/neighbors/:neighborId
DELETE /api/sub-sectors/:id
GET /api/sectors
GET /api/sectors/:id/neighbors
GET /api/sectors/:id/strips
GET /api/sectors/:id/sub-sectors
GET /api/sectors/:sectorId/workstations
GET /api/workstation-presets/partner-alt-ranges
PATCH /api/workstation-presets/:id/transfer-point
POST /api/sectors
POST /api/sectors/:id/neighbors
POST /api/sectors/:id/sub-sectors
PUT /api/sectors/:id
PUT /api/sectors/:id/notes
PUT /api/sub-sectors/:id

#### strips.js
DELETE /api/default-armament-names/:id
DELETE /api/default-system-names/:id
DELETE /api/strip-aircraft-armaments/:id
DELETE /api/strip-aircraft-systems/:id
DELETE /api/strip-aircraft/:stripId/:idx
DELETE /api/strip-table-assignments/:stripId/:presetId
DELETE /api/strips/:id
GET /api/default-armament-names
GET /api/default-system-names
GET /api/strip-aircraft
GET /api/strip-aircraft-armaments
GET /api/strip-aircraft-armaments/bulk
GET /api/strip-aircraft-systems
GET /api/strip-aircraft-systems/bulk
GET /api/strips
GET /api/strips/:id/formation-summary
GET /api/strips/all
GET /api/strips/formation-summaries
GET /api/strips/global
POST /api/default-armament-names
POST /api/default-system-names
POST /api/strip-aircraft-armaments
POST /api/strip-aircraft-systems
POST /api/strip-aircraft/bulk-import
POST /api/strip-aircraft/ensure-all
POST /api/strip-aircraft/ensure/:stripId
POST /api/strip-table-assignments
POST /api/strips
POST /api/strips/:id/accept-queued
POST /api/strips/:id/assign
POST /api/strips/:id/assign-workstation
POST /api/strips/:id/merge-partial
POST /api/strips/ground-create
POST /api/strips/ground-single-transfer
POST /api/strips/import
POST /api/strips/partial-create
PUT /api/default-armament-names/:id
PUT /api/default-system-names/:id
PUT /api/strip-aircraft-armaments/:id
PUT /api/strip-aircraft-systems/:id
PUT /api/strip-aircraft/:stripId/:idx
PUT /api/strips/:id
PUT /api/strips/:id/aircraft
PUT /api/strips/:id/formation-meta
PUT /api/strips/update-takeoff-to-today

#### transfers.js
GET /api/presets/:presetId/classic-incoming
GET /api/presets/:presetId/classic-outgoing
GET /api/sectors/:id/incoming-transfers
GET /api/sectors/:id/outgoing-transfers
GET /api/transfers/pending-all
GET /api/workstations/:presetId/incoming-transfers
GET /api/workstations/:presetId/outgoing-transfers
PATCH /api/transfers/:id/note
POST /api/strips/:id/transfer
POST /api/strips/:id/transfer-to-preset
POST /api/transfers/:id/accept
POST /api/transfers/:id/accept-to-map
POST /api/transfers/:id/cancel
POST /api/transfers/:id/move
POST /api/transfers/:id/reject
POST /api/transfers/:id/set-eta

#### workstations.js
DELETE /api/workstation-presets/:id
GET /api/dashboard/load
GET /api/workstation-personal-filters
GET /api/workstation-presets
GET /api/workstation-presets/:id/config
GET /api/workstation-presets/:id/waiting-strips
GET /api/workstations/:presetId/strips
GET /api/workstations/:presetId/work-group-peers
PATCH /api/workstation-presets/:id/thresholds
POST /api/workstation-presets
POST /api/workstation-presets/:id/duplicate
PUT /api/workstation-personal-filters
PUT /api/workstation-presets/:id

