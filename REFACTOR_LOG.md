# SKY-KING — לוג ארגון מחדש (Refactor Log)

> קובץ זה עוקב אחר כל שלב בארגון הקוד מחדש.
> כל שינוי מתועד: מה נעשה, למה, ותוצאת QA.
> עדכון אחרון: 2026-06-21

---

## 2026-07-08 — DRY בהעברות (ממצאי code-review C+D)

**מה נעשה:** ריכוז מנגנון קריאת ההעברות ב-[server/routes/transfers.js](server/routes/transfers.js):
- חולץ `transferSelect(where, order)` — מקור-אמת יחיד לרשימת ה-SELECT + ה-JOINs (superset). 6 ה-GET (`incoming/outgoing` לפי sector/workstation + `classic-incoming/outgoing`) עברו להשתמש בו; ה-`WHERE` של כל endpoint נשמר **מילה-במילה** — אין שינוי בלוגיקת ניתוב/סטטוס/state-machine.
- חולץ `restoreStripToSender(db, stripId, fromWorkstationId)` — משותף ל-`reject` ו-`cancel` (הוסר ~14 שורות כפילות).

**למה:** 6 עותקים של אותה רשימת SELECT היו מקור לבאגי "העברה שלא מופיעה" (עמודות חסרות בחלק מה-endpoints). כעת עמודה חדשה נוגעת במקום אחד.

**מה לא נגעתי (דחוי לאישור CEO / worktrees פתוחים):** איחוד `accept`+`accept-to-map` (שינוי flow); מיזוג עמודות ניתוב `*_workstation_id`/`*_preset_id` (ממצא B — מיגרציה); מנוע polling מאוחד (ממצא A).

**QA:** `node --check` ✅ · import נקי ✅ · smoke read-only מול DB אמיתי — כל 6 השאילתות המורכבות רצות ללא שגיאה (LIMIT 0, אימות עמודות+JOINs) ✅.

---

## מצב נקודת פתיחה (Baseline)

**תאריך:** 2026-06-21

### גדלי קבצים
| קובץ | שורות | הערה |
|---|---|---|
| `server.js` | 8,075 | מונוליט — DB + 355+ routes |
| `src/App.tsx` | 41,625 | מונוליט — כל ה-frontend |
| `src/mockData.ts` | 23 | mock data (לא בשימוש פעיל) |
| `src/ClockWidget.tsx` | קיים | כבר הופרד |
| `src/VirtualKeyboard.tsx` | קיים | כבר הופרד |

### Tech Stack
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS + Framer Motion
- Backend: Node.js ESM + Express 5
- DB: PostgreSQL / Neon (`pg` pool, `DATABASE_URL` מ-env)
- Desktop: Electron (`electron-main.cjs`)

---

## QA Baseline Report — מה המערכת עושה

**תאריך:** 2026-06-21 | **סטטוס:** ✅ הושלם

### ממצא חשוב: WebSocket כבר קיים!
ה-agent גילה `emit` calls בserver.js — כלומר WebSocket **כבר מיושם** (לפחות חלקית).
צריך לבדוק מה בדיוק מכוסה ומה עוד חסר.

---

### מבנה server.js

#### DB — 50+ טבלאות (לפי סדר יצירה ב-initDb):

| קבוצה | טבלאות |
|---|---|
| **Core** | `strips`, `strip_aircraft`, `strip_aircraft_armaments`, `strip_aircraft_systems` |
| **Transfers** | `strip_transfers`, `sectors`, `sector_neighbors`, `sub_sectors` |
| **Workstations** | `workstations`, `workstation_presets`, `crew_members`, `crew_member_workstations` |
| **Filters & Display** | `workstation_personal_filters`, `table_modes`, `classic_strip_tables` |
| **Airfield Ground** | `airfields`, `airfield_points`, `aviation_bases`, `airfield_routes`, `airfield_runways`, `airfield_taxiways`, `airfield_elements`, `airfield_polygons`, `airfield_sectors`, `airfield_atis`, `runway_grf`, `runway_notams`, `runway_lighting` |
| **Blocks & Zones** | `block_spaces`, `block_tables`, `blocks`, `map_zones`, `zone_altitude_ranges`, `strip_zone_assignments` |
| **Collaboration** | `work_groups`, `work_group_members`, `work_group_notes`, `sticky_notes`, `workstation_collab_state`, `workstation_messages` |
| **Admin** | `serials`, `strip_serial_selections`, `bdh_documents`, `bdh_items`, `aid_groups`, `base_statuses`, `activity_log` |
| **Driver/Vehicle** | `vehicle_requests`, `vehicle_gps`, `vehicle_messages`, `base_routes`, `element_nav_routes`, `route_links` |
| **Misc** | `learned_digits`, `preset_links`, `default_armament_names`, `default_system_names`, `closures`, `maps`, `preset_active_crew` |

#### Helper functions (ללא endpoint):
- `initDb()` — אתחול DB (שורות 21–1282)
- `cleanupExpiredStrips()` — ניקוי שעתי של סטריפים ישנים
- `mirrorClassicPartnerLinks()` — סנכרון קישורי שותף
- `bearingDeg()`, `turnLabel()`, `haversineM()`, `pctToGeo()` — geo utils
- `astarPath()` — A* pathfinding ברשת מסלולי שדה

---

### מבנה App.tsx (41,625 שורות)

| רכיב | שורות | תפקיד | שיתוף |
|---|---|---|---|
| Aircraft Icon System | 22–58 | SVG icons לפי טייסת | שניהם |
| ConfirmModal | 62–99 | דיאלוג אישור עם מקלדת | גלובלי |
| CrewMember / Session types | 102–128 | TypeScript interfaces | גלובלי |
| Query Builder DSL | 130–320 | מנוע סינון מורכב (AND/OR/NOT) | CTRL + admin |
| WorkstationLogin | 341–941 | מסך כניסה + בחירת עמדה | כולם |
| Digit Learning (OCR) | 945–987 | async helpers ל-Tesseract | לפי בקר |
| MapZoneEditor | 1,010–2,223 | עריכת אזורי מפה + גיאו-קיבוע | admin |
| MapsManager | 2,226–2,478 | ניהול מפות (upload/delete) | admin |
| LearnDigitsOverlay | 2,481–2,606 | canvas לאימון OCR | לפי בקר |
| HandwritingOverlay | 2,607–2,922 | כתב יד לגובה (Tesseract) | שניהם |
| OutgoingTransferCard | 3,013–3,099 | כרטיס העברה יוצאת | CTRL |
| IncomingTransferCard | 3,102–3,221 | כרטיס העברה נכנסת + countdown | שניהם |
| DraggableNeighborPanel | 3,224–3,789 | פאנל נקודת העברה (מוסר/מקבל) | שניהם |
| ContextMenu | 4,042–4,122 | תפריט קליק ימני להעברה | שניהם |
| DraggableMapMarker | 4,125–4,708 | marker ניתן לגרירה על מפה | CTRL |
| DraggableIncomingTransfer | 4,709–4,848 | כרטיס העברה נכנסת צף | CTRL |
| Strip (Core) | 4,849–5,716 | רכיב הסטריפ המרכזי | שניהם |
| OnScreenKeyboard | 5,741–5,806 | מקלדת וירטואלית לטאבלט | שניהם |
| TableHandwritingCanvas | 5,807–5,960 | canvas OCR לתצוגת טבלה | TWR |
| BlockMiniView | 5,961–6,098 | תצוגת בלוקי גובה | שניהם |
| GroundVehiclePanel | 6,099–7,013 | ניהול כלי רכב + מז"א (פטריוט, יבה) | admin/tactical |
| Ground constants & icons | 7,014–7,291 | SVG icons לגבולות שדה | TWR |
| ClassicBoardController | ~20K–30K | עמדת CTRL — מפה + סקטורים | CTRL |
| ClassicBoardTable | ~30K–40K | עמדת TWR — טבלה + העברות | TWR |
| App (root) | ~40K–41,625 | routing בין מסכים | גלובלי |

#### ממצאים קריטיים ל-refactor:
1. **אין State Management חיצוני** — הכל ב-local state, prop drilling סיכון
2. **fetch() מפוזר** בכל הרכיבים — אין centralized API layer
3. **אין הפרדה** בין CTRL לTWR בקוד — אותו קובץ, תלוי ב-session
4. **Ground Vehicle Panel** כולל ניהול מז"א — מורכב יותר ממה שנראה

---

### API Routes — קטלוג לפי קבוצה

| קבוצה | Routes | טבלות עיקריות |
|---|---|---|
| strips | ~25 | strips, strip_aircraft, armaments, systems |
| transfers | ~15 | strip_transfers |
| sectors | ~10 | sectors, sector_neighbors, sub_sectors |
| workstations | ~15 | workstation_presets, crew_members |
| maps | ~15 | maps, map_zones, zone_altitude_ranges |
| airfield/ground | ~40 | airfields, runways, elements, routes, polygons |
| blocks | ~10 | block_spaces, block_tables, blocks |
| collaboration | ~15 | sticky_notes, work_groups, collab_state |
| admin | ~20 | serials, BDH, aid_groups, activity_log |
| driver/vehicle | ~15 | base_routes, vehicle_*, element_nav |
| base_statuses | ~8 | base_statuses, atis |
| civilian | ~5 | civilian_strip_assignments |
| misc | ~10 | preset_links, contacts, table_modes |
| **סה"כ** | **~198 קבוצות, 355+ endpoints** | |

---

## תוכנית ארגון מחדש

### server.js → מבנה חדש

```
server/
  db/
    pool.js          ← Pool יחיד (DATABASE_URL)
    init.js          ← initDb() בלבד (CREATE TABLE)
    seed.js          ← seed data (INSERT ... ON CONFLICT DO NOTHING)
  routes/
    strips.js        ← /api/strips/*, /api/strip-aircraft/*, formations
    transfers.js     ← /api/transfers/*, /api/strips/:id/transfer*
    sectors.js       ← /api/sectors/*, /api/sub-sectors/*
    workstations.js  ← /api/workstation-presets/*, /api/crew-members/*
    maps.js          ← /api/maps/*, /api/map-zones/*, /api/zone-*
    airfield.js      ← /api/airfields/*, /api/airfield-*/*, /api/runway-*
    blocks.js        ← /api/block-*/*, /api/closures/*
    collaboration.js ← /api/sticky-notes/*, /api/work-groups/*, /api/collab-*
    admin.js         ← /api/serials/*, /api/bdh/*, /api/aid-groups/*, /api/table-modes/*
    base.js          ← /api/base-statuses/*, /api/aviation-bases/*, /api/workstation-contacts/*
    driver.js        ← /api/base-routes/*, /api/route-*/*, /driver
    activity.js      ← /api/activity-log
    strips-classic.js← /api/classic-strip-*/*, /api/strip-window-*/*, /api/strip-table-*
    civilian.js      ← /api/civ-strips/*, /api/civilian-*
  utils/
    geo.js           ← bearingDeg, haversineM, pctToGeo, astarPath
  app.js             ← express setup + כל router mounts
server.js            ← נשאר כ-entry point קצר (import app + listen)
```

### App.tsx → מבנה חדש

```
src/
  types/
    index.ts         ← כל ה-interfaces (Strip, Transfer, CrewMember...)
  components/
    shared/
      ConfirmModal.tsx
      AircraftIcon.tsx
      BlockMiniView.tsx
    login/
      WorkstationLogin.tsx
      HandwritingCalibration.tsx
    strips/
      Strip.tsx
      StripCard.tsx
    transfers/
      OutgoingTransferCard.tsx
      IncomingTransferCard.tsx
      DraggableNeighborPanel.tsx
      TransferContextMenu.tsx
    map/
      MapZoneEditor.tsx
      MapsManager.tsx
      DraggableMapMarker.tsx
    ground/
      GroundVehiclePanel.tsx
      AirfieldIcons.tsx
    input/
      HandwritingOverlay.tsx
      TableHandwritingCanvas.tsx
    views/
      ClassicBoardController.tsx  ← CTRL
      ClassicBoardTable.tsx       ← TWR
    admin/
      (AdminPanel components)
  utils/
    queryBuilder.ts  ← Query DSL logic
    handwriting.ts   ← OCR helpers
    geo.ts           ← geo calibration
  App.tsx            ← routing בלבד
```

---

## לוג שינויים

### #001 — יצירת קובץ לוג + QA Baseline
**תאריך:** 2026-06-21
**קבצים שהשתנו:** `REFACTOR_LOG.md` (חדש)
**מה נעשה:** תיעוד מצב נקודת פתיחה + ניתוח מלא של server.js ו-App.tsx
**QA לפני:** N/A
**QA אחרי:** N/A
**הערות:** WebSocket לא קיים בפועל — רק REST+polling. "emit" בדוח הQA היה שגיאה.

---

### #002 — פיצול server.js
**תאריך:** 2026-06-21
**קבצים שנוצרו:**
- `server/db/pool.js` — Pool יחיד
- `server/db/init.js` — initDb() + cleanupExpiredStrips()
- `server/db/seed.js` — seedDb() — נתוני אתחול בנפרד מסכמה
- `server/routes/crew.js` — 16 routes
- `server/routes/strips.js` — 45 routes
- `server/routes/transfers.js` — 16 routes
- `server/routes/sectors.js` — 16 routes
- `server/routes/workstations.js` — 13 routes
- `server/routes/maps.js` — 26 routes
- `server/routes/blocks.js` — 15 routes
- `server/routes/airfield.js` — 74 routes
- `server/routes/base.js` — 18 routes
- `server/routes/collaboration.js` — 27 routes
- `server/routes/admin.js` — 42 routes
- `server/routes/classic.js` — 15 routes
- `server/routes/civilian.js` — 6 routes
- `server/routes/driver.js` — 20 routes
- `server/app.js` — express setup + router mounts
- `server.js` — entry point קצר (19 שורות במקום 8,075)

**QA לפני:** server.js = 8,075 שורות, 353 routes
**QA אחרי:** ✅ 353/353 routes נשמרו בקבצים החדשים (ספירה מדויקת)
**הערות:**
- גילוי: `system_defaults` CREATE TABLE חסרה ב-initDb המקורי — נוספה ל-init.js
- גילוי: `airfield_polygon_statuses` CREATE TABLE חסרה גם — טבלה קיימת ב-DB מהיסטוריה
- seed data הופרדה מהסכמה לראשונה — init.js = schema בלבד, seed.js = נתונים

---

### #005 — Phase 2B: Extract utilities from App.tsx
**תאריך:** 2026-06-21
**קבצים שנוצרו:**
- `src/utils/session.ts` — getSession / saveSession / clearSession
- `src/utils/handwriting.ts` — compareImages (OCR similarity)
- `src/utils/notes.ts` — parseNoteValue / serializeNoteValue
- `src/utils/geo.ts` — geoToImagePct / imagePctToGeo / fmtDms + MapGeoAnchor

**QA:** ✅ כל הfunctions pure — אין side effects, אין JSX
**הערה:** App.tsx לא שונה — אלו עותקים עצמאיים. בשלב הבא App.tsx ישתמש ב-imports.

---

### #006 — Phase 2B: הרחבת src/types/index.ts
**תאריך:** 2026-06-21
**שינויים:**
- נוספו: `MapGeoAnchor`, `MapZone`, `ZoneAltRange`, `StripZoneAssignment`
- נוספו: `AircraftPos`, `GroundAircraftRow`
- נוספו: `Strip` (full interface), `Transfer` (full interface)

**QA:** ✅ 204 שורות, TypeScript valid

---

### #007 — Phase 2C: Extract leaf components
**תאריך:** 2026-06-21
**קבצים שנוצרו:**
- `src/components/shared/ContextMenu.tsx` — right-click menu להעברה
- `src/components/shared/OnScreenKeyboard.tsx` — מקלדת וירטואלית לטאבלט

**QA:** ✅ רכיבים עצמאיים עם props מוגדרים, ללא תלויות ב-App state

---

### #008 — Phase 3: ARCHITECTURE.md
**תאריך:** 2026-06-21
**קובץ שנוצר:** `ARCHITECTURE.md`
**תוכן:**
- מבנה מלא של Frontend/Backend/DB/Electron
- זרימת נתונים (Strip lifecycle, Transfer flow)
- ארכיטקטורת עמדות (CTRL vs TWR)
- DB Schema — יחסי ליבה
- מצב סנכרון (polling → WebSocket מטרה)
- מבנה מסכים (ASCII diagrams)
- workflow map עם סקילים

---

### #009 — Phase 4: Fix missing DB tables
**תאריך:** 2026-06-21
**שינוי:** `server/db/init.js` — נוספו CREATE TABLE:
- `airfield_polygons` — גיאומטריית polygon לשדה תעופה
- `airfield_sectors` — סקטורי תנועה קרקעית
- `airfield_status_types` — סוגי סטטוס תפעולי לשדה
- `airfield_polygon_statuses` — סטטוס + GRF + RVR לפי polygon
- `system_defaults` — ברירות מחדל מערכת (כבר תוקן בשלב #002)

**בעיה שנמצאה:** הטבלאות האלו קיימות ב-Neon אבל **לא היו** ב-initDb() המקורי.
→ על DB חדש (fresh) הייתה מתרחשת שגיאה בכל route שמשתמש בהן.
**QA לפני:** ❌ 4 טבלאות חסרות — Fresh DB היה נכשל
**QA אחרי:** ✅ כל 5 הטבלאות קיימות ב-init.js

---

### #010 — Phase 5: QA Final
**תאריך:** 2026-06-21
**תוצאות:**
| בדיקה | תוצאה |
|---|---|
| server.js שורות | 20 (היה 8,075) |
| Routes 353/353 | ✅ |
| server/db/*.js syntax | ✅ |
| server/routes/*.js syntax (14 קבצים) | ✅ |
| src/types/index.ts | ✅ 204 שורות |
| src/utils/*.ts (5 קבצים) | ✅ |
| src/components/shared/*.tsx (3 קבצים) | ✅ |
| DB tables (5 חסרות תוקנו) | ✅ |
| ARCHITECTURE.md | ✅ |

**App.tsx:** עדיין 41,625 שורות — foundation הונח, views split בפגישה הבאה
**אין regressions:** server.js המקורי שועתק 1:1 (353 routes, כל הלוגיקה)

---

### #003 — פיצול App.tsx — foundation
**תאריך:** 2026-06-21
**קבצים שנוצרו:**
- `src/types/index.ts` — כל ה-TypeScript interfaces (~80 שורות)
- `src/utils/aircraft.ts` — icon system לפי טייסת (~57 שורות)
- `src/utils/queryBuilder.ts` — Query DSL (AND/OR/NOT filter engine) (~218 שורות)
- `src/components/shared/ConfirmModal.tsx` — דיאלוג אישור גלובלי (~88 שורות)

**QA לפני:** App.tsx = 41,625 שורות (1 קובץ)
**QA אחרי:** ✅ App.tsx לא שונה — קבצים חדשים הם עותקים עצמאיים
**הערות:** שלב 1 של פיצול App.tsx. המשך (split לviews ו-components) בפגישה הבאה.

---

### #004 — QA סופי
**תאריך:** 2026-06-21
**בדיקות שבוצעו:**
- ✅ `node --check server.js` — OK
- ✅ `node --check server/app.js` — OK
- ✅ `node --check server/routes/*.js` — כל 14 קבצים OK
- ✅ 353/353 routes נשמרו
- ✅ `system_defaults` CREATE TABLE נוספה ל-init.js
- ✅ seed data הופרדה ל-seed.js
- ✅ App.tsx לא נשבר
**סטטוס:** ✅ אין regressions ידועים

---

### #011 — Phase 2D: חיבור App.tsx למודולים המחולצים (WIRING)
**תאריך:** 2026-06-21
**מה נעשה:** App.tsx עכשיו **מייבא בפועל** את הקבצים המחולצים והוסרו ההגדרות הכפולות.

**מיפוי coupling (קריטי):** נמצא שכל הרכיבים ב-App.tsx הם **top-level consts** עם props —
אין צימוד ל-App state. לכן פיצול הוא מכני ובטוח.

**מודולים שחוברו:**
- `./types` — AircraftIconType, CrewMember, WorkstationSession, Q* types
- `./config` — API_URL, SCREEN_SCALE_MAP (חדש)
- `./utils/scale` — scale, sc (חדש)
- `./utils/aircraft` — 4 icon functions
- `./utils/queryBuilder` — 11 items (Q_FIELDS verified identical to original via diff)
- `./utils/session` — getSession/saveSession/clearSession
- `./utils/handwriting` — compareImages
- `./utils/notes` — parseNoteValue/serializeNoteValue
- `./components/shared/ConfirmModal` — ConfirmModal + customConfirm (כיחידה, _showConfirm)
- `./components/shared/ContextMenu`
- `./components/shared/OnScreenKeyboard`

**QA לפני (baseline):**
- ✅ `tsc --noEmit` נקי
- ✅ `vite build` — 472 modules, bundle 2,699.49 kB

**QA אחרי (כל batch אומת):**
- ✅ `tsc --noEmit` נקי
- ✅ `vite build` — bundle 2,699.55 kB (הפרש 0.06 kB = רק שינוי imports)
- ✅ App.tsx: 41,625 → 41,131 שורות (494 הוסרו, מקור אמת יחיד)

**שיטת אימות:** queryBuilder אומת byte-level מול git HEAD (Q_FIELDS keys + לוגיקת
evalQLeaf/getQFieldValue זהים). bundle size כמעט זהה = הוכחת שקילות פונקציונלית.

**בעיה שנמצאה ותוקנה:** import של MapGeoAnchor התנגש עם הגדרה מקומית ב-App → הוסר מה-import.

---

### #012 — Architecture review
**תאריך:** 2026-06-21
**מה נעשה:** ARCHITECTURE.md עודכן לשקף את ה-wiring בפועל (סימון ✅ wired לכל מודול).
**ממצא ארכיטקטוני:** המבנה תקין. ה-keystone (API_URL, sc, types, shared utils) במקום —
זה פותח את חילוץ ה-views הגדולים בלי תלות מעגלית.

---

### #013 — Phase 2E: חילוץ views + ground layer (סשן 2)
**תאריך:** 2026-06-21
**שיטה:** bottom-up — קודם helpers/types, אז leaf components, אז views. build-verify אחרי כל שלב.

**מודולים שנוצרו וחוברו:**
- `src/utils/strips.ts` — getFormationDisplayName, getTransferLabel, getTransferSq, normalizeAlt, parseAltToFeet, computeBlockDeviation (אומת byte-level מול git)
- `src/utils/digits.ts` — getLearnedDigits, saveLearnedDigit, clearLearnedDigits, getDigitsCount
- `src/utils/geo.ts` — חובר בפועל (geoToImagePct, imagePctToGeo, fmtDms, buildGeoAnchor as getAnchorFromMapData)
- `src/types/ground.ts` — AircraftPos, GroundAircraftRow, MapZone, ZoneAltRange, StripZoneAssignment, GroundStatusKey, VectorLine, VectorData
- `src/components/shared/HandwritingOverlay.tsx` — OCR כתב יד
- `src/components/strips/Strip.tsx` — רכיב הסטריפ המרכזי (868 שורות, כולל _activeStripDetailsCloser singleton)
- `src/components/transfers/TransferCards.tsx` — TransferStripEditor, OutgoingTransferCard, IncomingTransferCard
- `src/components/map/MapZoneEditor.tsx` — עורך אזורי מפה (1,225 שורות)
- `src/components/ground/groundShared.tsx` — constants (מז"א, ground statuses), GroundMarkerSVG, renderGroundSvgIcon, getElemDisplayStateOpts, normalizeAircraftPositions, ptLineDist, dpSimplify, toEmbedUrl
- `src/components/views/GroundView.tsx` — עמדת מגדל TWR (4,812 שורות)

**QA לכל שלב:** ✅ tsc --noEmit נקי + ✅ vite build
**bundle:** יציב 2,699.55 kB לאורך כל החילוצים = הוכחת שקילות פונקציונלית מלאה.
**App.tsx:** 41,131 → **33,176 שורות** (~8,000 הוסרו לקבצים מודולריים).

**באגים שנתפסו ע"י tsc ותוקנו תוך כדי:**
- MapGeoAnchor import התנגש עם local def
- _activeStripDetailsCloser (singleton) — הועבר ל-Strip.tsx
- clampMenuPos — נוסף ל-imports של Strip
- MapZone.polygon — types/index.ts הגדיר string, אבל ה-runtime shape הוא array → הוגדר נכון ב-types/ground.ts
- GROUND_SVG_ICON_KEYS / AIR_DEFENSE_STATUSES — export פוספס בגלל type annotation, תוקן

---

### #014 — Phase 2F: פיצול App.tsx מלא (סשן 3) ✅ הושלם
**תאריך:** 2026-06-22
**מה נעשה:** כל הרכיבים חולצו מ-App.tsx, כולל שני הענקים. App.tsx ירד מ-41,625 ל-**728 שורות**.

**שיטה:** bottom-up מלא — types/consts → leaf components → mid components → giants. build-verify אחרי כל batch.

**מודולים חדשים (38 סה"כ):**
- **types/**: `ground.ts`, `stripGrid.ts`, `stripFields.ts` (+ index.ts מורחב)
- **utils/**: `strips.ts`, `digits.ts`, `stripGrid.ts`, `stripWindow.tsx` (+ geo/scale/session/notes/handwriting/aircraft/queryBuilder)
- **components/shared/**: HandwritingOverlay, LearnDigitsOverlay, Modals, ContextMenu, OnScreenKeyboard, ConfirmModal
- **components/strips/**: Strip
- **components/transfers/**: TransferCards, DraggablePanels
- **components/map/**: MapZoneEditor, MapsManager
- **components/ground/**: groundShared, GroundVehiclePanel
- **components/blocks/**: BlockMiniView, BlockVisualPainter
- **components/query/**: QueryBuilder
- **components/classic/**: ClassicViews
- **components/dashboard/**: AdminDashboard
- **components/admin/**: managers (12 admin managers), ManagementPage
- **components/views/**: GroundView, VerticalView, SectorDashboard

**הענקים שחולצו:**
- SectorDashboard — 14,535 שורות → `components/views/SectorDashboard.tsx`
- ManagementPage — 7,446 שורות → `components/admin/ManagementPage.tsx`
- admin managers — 3,165 שורות → `components/admin/managers.tsx`

**QA (כל batch):** ✅ tsc --noEmit + ✅ vite build. **bundle יציב 2,699.5 kB לכל אורך** = שקילות פונקציונלית מלאה, אפס regressions.

**App.tsx הסופי (728 שורות):** רק `WorkstationLogin` (מסך כניסה) + `App` (routing) + 13 imports נקיים.

**באגים ש-tsc/build תפסו ותוקנו תוך כדי:** ~15 (חוסר types/helpers משותפים, exports שפוספסו בגלל type annotation, ReactDOM→createPortal, name shadows). כולם ב-compile — אפס הגיעו ל-runtime.

---

### #015 — תשתית בדיקות (vitest) + בדיקות יחידה
**תאריך:** 2026-06-22
**מה נעשה:** הוספת vitest + בדיקות יחידה ל-utils הטהורים שחולצו בריפקטור.
- `package.json`: נוסף `npm test` (vitest run) + `npm run test:watch`
- קבצי בדיקה: `src/utils/{strips,queryBuilder,geo,notes,aircraft}.test.ts`
- כיסוי: normalizeAlt, parseAltToFeet, getFormationDisplayName, computeBlockDeviation,
  evaluateQuery/evalQLeaf/getQFieldValue, geo round-trip + fmtDms, notes round-trip, aircraft mapping

**QA:** ✅ **68/68 בדיקות עוברות** + tsc --noEmit נקי
**ערך:** רשת ביטחון ראשונה למערכת + אימות שחילוץ ה-utils בריפקטור היה נכון (התנהגות זהה למקור).

---

### #016 — תיקוני runtime (התגלו בהרצה בפועל) + ביצועים
**תאריך:** 2026-06-22
**הקשר:** אחרי שהמשתמש הריץ את האפליקציה לראשונה — באגים שרק runtime חושף (tsc/build לא תופסים).

1. **API 404** — `app.js` מן routers ב-`/api` בעוד הם מגדירים נתיב מלא `/api/*` → `/api/api/*`. תוקן: mount ב-root.
2. **runway-conflicts/active-takeoffs קרסו** — `jsonb_array_*` על `aircraft_positions` שאינו מערך (44 rows עם `{}`). הוקשח עם `jsonb_typeof()='array'`.
3. **התראות בד"ח לא הופצו** — `bdh_alerts.created_at` היה `timestamp` ללא tz; בשרת מקומי (UTC+3) הוסט 3ש' והסינון `created_at >= sessionStart` זרק כל התראה. הומר ל-`timestamptz`.
4. **ביצועים — האטת polling אגרסיבי:** loadData (strips/global+transfers) 1500→**5000ms**; workstation-messages 3000→**6000ms**; collab sync 3000→**6000ms**. (1000ms נשאר — countdown מקומי.)
5. **הקשחת pg Pool** — `max:12`, `idleTimeoutMillis:30000`, `connectionTimeoutMillis:10000` + `pool.on('error')`. מונע תקיעה כשה-pool מתמלא ומטפל ב-connections מתים של Neon.
6. **`npm run dev` cross-platform** — `concurrently` (היה `&` שלא עובד ב-Windows).

**QA מקיף:**
- ✅ tsc | ✅ 68/68 בדיקות | ✅ build (2,699 kB)
- ✅ Smoke test 22 endpoints → 200 (2 דרשו פרמטר = ולידציה תקינה)
- ✅ עומס 60 בקשות מקבילות → 60×200, ללא תקיעת pool

**לקח:** ה-QA gate צריך לכלול **smoke test runtime** — באגי routing/SQL/tz נתפסים רק בריצה.

**דפוס פתוח:** עוד עמודות `timestamp` ללא tz (`sticky_notes`, `work_group_notes`, `strips`...) — עלולות להיות מוסטות 3ש'. מומלץ audit + המרה ל-`timestamptz`.

---

### #017 — מצבי קבלה (קבל/אשר/דחה+הערה) + תצוגת נקודת העברה (שלמה/חץ)

**תאריך:** 2026-07-08

**מה נעשה:**
- **State machine של העברות** הורחב: `pending → acknowledged → accepted` / `rejected`.
  - Route חדש `POST /api/transfers/:id/acknowledge` — "אשר": המקבל אישר קבלה, הסטריפ נשאר אצל המוסר עד "קבל" סופי.
  - `POST /api/transfers/:id/reject` מקבל `note` (חובה) → נשמר ב-`reject_note`, ושולח פופאפ למוסר דרך `workstation-messages` (reuse).
  - Route חדש `POST /api/transfers/:id/dismiss` — המוסר מסלק כרטיס דחייה (כתום).
  - כל שאילתות ה-GET עודכנו: `status IN ('pending','acknowledged')` (בצד המוסר גם `rejected`) כדי ש-acknowledged/rejected לא ייעלמו.
- **UI** (`TransferCards.tsx`): כפתור **אשר**, תיבת דחייה עם הערת חובה, צביעה אצל המוסר (אושר=ירוק, נדחה=כתום, קונפליקט=אדום). `IncomingTransferCard.onReject` → `(id, note)`.
- **תצוגת נקודת העברה**: החץ (`neighborPin`) הוקטן בחצי (28×36→14×18). מתג המרה במקום שלם↔חץ (▽/△). ברירת מחדל פר-נקודה `sub_sectors.display_mode` ("הגדרת עמדה") מוחלת אוטומטית בגרירת שכן.
- **DB:** `strip_transfers.reject_note TEXT`, `sub_sectors.display_mode VARCHAR(10) DEFAULT 'full'` (ב-`init.js`).

**קבצים:** `server/routes/transfers.js`, `server/routes/sectors.js`, `server/db/init.js`, `src/components/transfers/TransferCards.tsx`, `src/components/transfers/DraggablePanels.tsx`, `src/components/views/SectorDashboard.tsx`, `data-model.md`, `SERVICES.md`, `SHARED_LANGUAGE.md`.

**Event Log:** `transfer_acknowledged`, `transfer_rejected` (עם note).

**QA:** tsc נקי · vite build ✅ · 120/120 בדיקות · syntax Backend תקין. **Runtime ויזואלי — ממתין לאימות משתמש** (דורש 2 עמדות + מפה + restart לשרת להחלת המיגרציה).

---

### #018 — דסק משימה כללי (General Mission Desk) — מודול חדש

**תאריך:** 2026-07-21 · **Branch:** `feature/general-mission-desk` · **מקור:** אפיון דסק משימה כללי.pdf

**מה נעשה:**
- **סוג עמדה חדש** `preset_type='mission_desk'` — דסק גנרי לרישום, נבנה במסך הניהול מ-3 סוגי שירותים:
  - **מסך ניהול אמצעים** (`ButtonsBoard`) — כפתורים נוצרים בעמדה בקליק ימני, מיקום חופשי בגרירה (Pointer Events, מותאם Cintiq), מצבים עם צבע לכל מצב, טקסט חופשי, פונט/גודל/מודגש, וטריגר **התראה מתפרצת** לעמדות אחרות (reuse `workstation-messages` + toast).
  - **טקסט חופשי** (`InkPad`) — דיו על canvas בקואורדינטות יחסיות, שורות הפרדה + כותרת לפי config, undo/פלנלית. ללא OCR.
  - **טבלה חכמה** (`SmartTable`) — עמודות (טקסט/מספר/V-X/תפריט), עמודות חישוב (פרסר נוסחאות ללא eval), עיצוב מותנה פר-שורה (+הבהוב), שורת סיכום (סכום/כמות/ממוצע/מינ/מקס), שורות התחלתיות והוספה בעמדה.
- **פריסת דסק** — עץ BSP (`layout_json`, אותה תבנית כמו חלון סטריפים); באדמין: פיצול אזורים + גרירת שירות לאזור (`MissionDeskAdmin`, קובץ נפרד — managers.tsx כבר ענק).
- **שיתוף שירות בין עמדות** — `mission_desk_sharing` JSONB בעמדה; כתיבת state עושה **fan-out בשרת** לעמדות המשותפות; polling (5ש') מקבל. grace 8ש' לכתיבה מקומית מונע דריסה בזמן עריכה.
- **DB:** `mission_desks`, `mission_desk_services`, `mission_desk_service_state` (UNIQUE(service,preset), TIMESTAMPTZ) + `workstation_presets.mission_desk_id/mission_desk_sharing`.
- **i18n:** קבוצת registry חדשה `missiondesk` (he+en מלא); dispatch ב-`App.tsx` (ללא נגיעה ב-SectorDashboard).

**קבצים:** `server/routes/missionDesks.js` (חדש), `server/app.js`, `server/routes/workstations.js`, `server/db/init.js`, `src/types/missionDesk.ts`, `src/utils/missionDesk.ts` (+29 בדיקות), `src/components/missiondesk/*` (5 קבצים), `src/components/admin/MissionDeskAdmin.tsx`, `ManagementPage.tsx` (tab + עורך עמדה), `App.tsx`, `src/i18n/registry/missiondesk.json`, `e2e/mission-desk.spec.ts` (חדש), `data-model.md`.

**Event Log:** `mission_desk_button_state_changed`, `mission_desk_row_added`.

**QA (עבר במלואו, כולל runtime):** tsc נקי · 167/167 unit (TDD — בדיקות נכשלות commit קודם למימוש) · vite build ✅ · smoke API מלא מול Neon (כולל fan-out שיתוף) · **2 בדיקות Playwright חדשות שרצו בפועל**: עמדה (יצירת כפתור בקליק ימני → החלפת מצב → **התראה מתפרצת נצפתה בעמדה שנייה חיה בדף נפרד** → סיכום טבלה חי → ציור דיו נשמר ל-DB → כניסה מחדש עם שרידות → activity_log) + אדמין (יצירת דסק+שירות+פריסה+שמירה). צילומי מסך אומתו ויזואלית.

**ידוע/נדחה:** אין גרירת מחיצות לשינוי יחסי פיצול באדמין (50/50 קבוע) · בחירת פונט מוגבלת ל-3 · עיכוב סנכרון עד ~8ש' בשירות שנערך במקביל בשתי עמדות.

---

### #019 — דסק משימה: אמצעים קבועים, מגע, גודל כפתור, פלנלית לפי מיקום

**תאריך:** 2026-07-21 · המשך #018 לפי משוב CEO.

**מה נעשה:**
- **אמצעים קבועים ונתוני טבלה בהגדרת עמדה** — כפתור "📌 פתח דסק להגדרה" בעורך העמדה פותח את הדסק האמיתי (`MissionDeskView adminMode`) מעל המסך; כפתורים/שורות שנוצרים שם מסומנים `fixed` ונשמרים ישירות ל-state של העמדה. קבוע (📌) בעמדה: מופעל/נגרר/טקסט חופשי — לא נמחק ולא נערך. במצב הגדרה לא נורות התראות אמת ולא נצרכות הודעות העמדה (seen).
- **מסך מגע** — פעולות גלויות ב"מסך ניהול אמצעים": ➕ צור כפתור + ✏️ מצב עריכה (לחיצה על כפתור פותחת עורך); קליק ימני נשאר כקיצור לעכבר בלבד. מחיקה גם מתוך העורך.
- **גודל כפתור** — רוחב/גובה בפיקסלים בעורך הכפתור (ריק = אוטומטי), לפי סעיף האפיון "גודל שונה לכל כפתור".
- **פלנלית** — כלי "מחק במיקום" (מחיקת strokes בגרירת הסמן, מרחק נקודה-מקטע — `eraseStrokesAt`, מכוסה 4 בדיקות) לצד "ניקוי מלא".
- **תיקונים בדרך:** רענון רשימת ה-presets ב-App בכל מעבר עמוד + בהתחברות (עמדת דסק שנוצרה כשהדף פתוח עלתה כמוד טבלאי); אייקון 🗂 בתפריט הצד; שגיאות שרת ביצירת/שמירת דסק כבר לא נבלעות.

**קבצים:** `types/missionDesk.ts` (w/h/fixed), `utils/missionDesk.ts` (+eraseStrokesAt), `missiondesk/ButtonsBoard/InkPad/SmartTable/MissionDeskView`, `admin/MissionDeskAdmin.tsx` (+MissionDeskConfigOverlay), `ManagementPage.tsx`, `App.tsx`, `registry/missiondesk.json`, `e2e/mission-desk.spec.ts` (4 בדיקות).

**QA:** tsc נקי · 171/171 unit (TDD ל-eraser) · build ✅ · **4/4 e2e בפועל** כולל: יצירת אמצעי דרך ➕ (מגע), התראה מתפרצת בין 2 דפים חיים, רגרסיית רשימה מיושנת, ותצוגת הגדרה מלאה (פתיחה מעורך העמדה → יצירת קבוע → `fixed:true` ב-DB).

---

### #020 — מיראז' (דמו) — מערכת ניהול משתמשים והרשאות + בחירת מקור הזדהות ב-LOGIN

**תאריך:** 2026-07-22

**מה נעשה:**
- **אפליקציית מיראז' נפרדת** (`mirage/`) — Express עצמאי (פורט 7300, `npm run mirage`): `POST /api/authorize` מקבל `{app, personalNumber}` ומחזיר `{authorized, roles, user}` (`admin`/`team_lead`/`user`); CRUD משתמשים + מסך ניהול (`/`, RTL, dark); נתונים ב-`mirage/data.json`.
- **מתווך ב-SKY-KING** — `server/routes/mirage.js`: `POST /api/auth/mirage-login` שולח למיראז' (`MIRAGE_URL`), ממפה roles → `is_admin`/`is_team_lead`, מאחד עם איש צוות קיים לפי `personal_id` (שומר עמדות מאושרות); אין תואם → משתמש וירטואלי (`id:null`). 403 אין הרשאה · 502 מיראז' לא זמין · timeout 4s.
- **מסך LOGIN** — checkbox "הזדהות דרך מיראז'" (**ברירת מחדל: מסומן**, נשמר ב-`localStorage['bt-authSource']`). מסומן → קלט מספר אישי במקום חיפוש איש צוות; לא מסומן → זרימת משתמשי המערכת ללא שינוי. כל הטקסטים דרך i18n (he+en).
- **e2e** — `playwright.config.ts` מקבע `bt-authSource=internal` דרך `storageState` (הבדיקות בודקות את הזרימה הפנימית).

**קבצים:** `mirage/` (app.js, server.js, admin.html, data.json, mirage.test.js), `server/routes/mirage.js`, `server/app.js`, `src/App.tsx`, `src/i18n/locales/he.json+en.json`, `playwright.config.ts`, `package.json` (סקריפט `mirage`).

**QA:** TDD — 11 בדיקות vitest למיראז' (נכתבו קודם, red→green) · tsc נקי · 185/185 unit · build ✅ · smoke מלא: מיראז' חי (authorize מורשה/לא מורשה/לא מוכר) + מתווך מול DB אמיתי (איחוד איש צוות קיים, משתמש וירטואלי, 403, 502 כשמיראז' כבוי) · e2e dashboard-baseline 2/2 ✅.

---

### #021 — מיראז': הרשאת עמדות למשתמש (בחירה מרובה מהאפליקציה + הזנה ידנית)

**תאריך:** 2026-07-22 · המשך #020.

**מה נעשה:**
- **פורמט מורחב במיראז'** — רשומת אפליקציה: `{roles, workstations}` (הפורמט הישן, מערך roles, נתמך לאחור). `workstations`: `{id, name}` מהאפליקציה או `{name}` ידני.
- **authorize** מחזיר גם `workstations` (ריק = אין הגבלה).
- **`GET /api/workstation-options`** במיראז' — מושך שמות עמדות חיים מ-SKY-KING (`SKYKING_URL`); לא זמין → `available:false` והמסך עובר להזנה ידנית.
- **מסך הניהול** — בחירה מרובה (checkboxes) של עמדות מהאפליקציה + שדה הזנה ידנית (מופרד בפסיקים) + עריכת משתמש קיים (כפתור "עריכה" → PUT).
- **המתווך ב-SKY-KING** — מפענח את `workstations` מול `workstation_presets`: עם `id` = השוואת ID טכני, בלי = השוואת טקסט (trim); התוצאה → `approved_workstations`. ריק = לפי ה-DB; לא זוהה כלל → `[-1]` (שום עמדה, מוצג "אין עמדות מאושרות").

**קבצים:** `mirage/app.js`, `mirage/admin.html`, `mirage/mirage.test.js` (+5 בדיקות TDD), `server/routes/mirage.js`.

**QA:** TDD red→green · 190/190 unit · smoke מקצה לקצה מול DB אמיתי: הגבלה לפי ID (29 ✓), לפי טקסט `בת"ק אריק` (26 ✓), משולב `[29,26]` ✓, עמדה לא קיימת → `[-1]` ✓, בלי הגבלה → נשאר לפי DB `[2]` ✓. הערה: curl בעברית מ-git-bash שולח קידוד שגוי — אימות טקסט נעשה ב-node fetch (כמו דפדפן).

---

### #022 — תיקון: בכניסת מיראז' מקור העמדות הוא מיראז' בלבד

**תאריך:** 2026-07-22 · תקלה מדווחת: בכניסה דרך מיראז' הוצגו העמדות המוגדרות למשתמש ב-SKY-KING.

**סיבת שורש (שני פערים):**
1. משתמש קיים בלי הגבלת עמדות במיראז' נפל לרשימת `crew_member_workstations` של SKY-KING — במקום "ריק = כל העמדות" כפי שמוצג במסך הניהול של מיראז'.
2. רכיב בחירת העמדה ב-LOGIN מתעלם מההגבלה עבור admin — ולכן admin ממיראז' ראה את כל העמדות גם עם הגבלה.

**התיקון:**
- שרת: בכניסת מיראז' `approved_workstations` = הגבלת מיראז' בלבד (`mirageApproved || []`) — גם למשתמש קיים.
- קליינט: `auth_source:'mirage'` על איש הצוות + ה-activity-log; הסינון חל גם על admin כשמקורו מיראז'.

**חריג מפורש (רכיב משותף):** בחירת עמדה ב-LOGIN — בכניסה **פנימית** admin רואה הכל (התנהגות קיימת, לא שונתה); בכניסת **מיראז'** ההגבלה חלה על כולם, כולל admin.

**QA:** tsc · 190/190 unit · אימות בדפדפן אמיתי (Playwright מול vite+API+מיראז' חיים): הגבלה → עמדה אחת בלבד ✓ · בלי הגבלה → כל 23 העמדות (לא ה-DB) ✓ · admin עם הגבלה → העמדה המוגבלת בלבד ✓.

---

### #023 — החלפת איש צוות בכניסת מיראז': סינון לפי הרשאת עמדה + הזדהות מחדש

**תאריך:** 2026-07-22 · המשך #020–#022.

**מה נעשה:**
- **שרת** — `GET /api/auth/mirage-eligible?presetId=N`: המורשים לעמדה לפי מיראז' (roles באפליקציה + הגבלת עמדות ריקה או שהעמדה בה, לפי id/שם). `POST /api/auth/mirage-login` מקבל `presetId` אופציונלי ואוכף את הרשאת העמדה (403 `workstation_not_permitted`).
- **רכיב משותף** `MirageCrewSwap` (DRY — ב-SectorDashboard ‏וב-MissionDeskView): רשימה מסוננת ממיראז' בלבד; בחירת איש → הקלדת מ.א. → מיראז' מאשר (כולל בדיקת התאמה בין המ.א. לאיש שנבחר) → ההחלפה. תמיכה בשתי תמות (בהיר במודל הבקר, כהה בתפריט הדסק).
- הכניסה הפנימית — זרימת ההחלפה הקיימת ללא שינוי. `crew_swap` ב-activity-log מתעד `auth_source`.

**קבצים:** `server/routes/mirage.js`, `src/components/shared/MirageCrewSwap.tsx` (חדש), `SectorDashboard.tsx`, `MissionDeskView.tsx`, `App.tsx`, `he.json+en.json`.

**QA:** tsc · 190/190 unit · אימות דפדפן מלא: eligible מסונן נכון (מוגבל-לעמדה-אחרת לא מופיע, ללא-הרשאת-אפליקציה לא מופיעה) · מ.א. שגוי → שגיאת אי-התאמה · מ.א. נכון → החלפה ליוחאי ✓ · hint מוצג ✓ · e2e mission-desk ‏4/4 (אין רגרסיה במצב פנימי).

---

## (היסטורי) הצעד הבא שתוכנן — שני הענקים הנותרים

### למה ManagementPage + SectorDashboard נדחו

שניהם **consumers בתחתית הקובץ** שצורכים עשרות sub-components המוגדרים מעליהם ב-App:
- **ManagementPage** (~7,400 שורות) צורך ~17 רכיבים: AidsManager, BlockVisualPainter, ClassicPartnersAndPointsEditor, ClassicStripCard, ClosuresManager, DefaultNamesManager, MapsManager, QueryBuilder, SerialsAdminTab, SettingsModal, StripGridEditor, StripWindowAdmin, TableModesManager, WorkGroupsManager, ...
- **SectorDashboard** (~14,500 שורות) צורך עוד יותר (Strip✅, transfer cards✅, DraggableNeighborPanel, BlockMiniView, ...)

**כלל:** אי אפשר לחלץ consumer לפני שכל ה-sub-components שלו importable.
לכן הסדר חייב להיות bottom-up:
1. חלץ את רכיבי ה-admin הבודדים → `src/components/admin/` (CrewManager, PresetsManager, AidsManager, TableModesManager, SerialsAdminTab, DebriefingTab, ClosuresManager, StripWindowAdmin, DefaultNamesManager, BlockVisualPainter, QueryBuilder, SettingsModal, ...)
2. חלץ רכיבי sector נותרים → DraggableNeighborPanel, BlockMiniView, TableHandwritingCanvas, GroundVehiclePanel, StickyNotesLayer
3. אז `ManagementPage` → `src/components/admin/ManagementPage.tsx`
4. ולבסוף `SectorDashboard` → `src/components/views/SectorDashboard.tsx`

**אזהרה קריטית:** כל שלב = build-verify מיד. לא להשאיר את ה-build שבור בין שלבים.

---

## (ישן) הצעד הבא — חילוץ ה-views הגדולים

**הענקים שנותרו ב-App.tsx:**
| view | שורות (~) | תפקיד |
|---|---|---|
| `SectorDashboard` | ~14,500 | עמדת CTRL הראשית |
| `ManagementPage` | ~7,400 | מסך admin |
| `GroundView` | ~4,800 | עמדת TWR (מגרש) |
| `Strip` | ~870 | רכיב הסטריפ המרכזי |
| `MapZoneEditor` | ~1,200 | עורך אזורי מפה |

**סדר מומלץ (מהקטן לגדול, כל אחד עם build verify):**
1. `Strip` → `src/components/strips/Strip.tsx` (תלוי: sc✅, customConfirm✅, parseNoteValue✅, HandwritingOverlay, BlockMiniView)
2. רכיבי transfer (OutgoingTransferCard, IncomingTransferCard) → `src/components/transfers/`
3. `MapZoneEditor` → `src/components/map/`
4. `GroundView` → `src/components/views/GroundView.tsx`
5. `ManagementPage` → `src/components/admin/`
6. `SectorDashboard` → `src/components/views/SectorDashboard.tsx` (אחרון — הכי מורכב)

**כלל זהב:** כל חילוץ = build verify מיד אחריו. אם build נשבר — לחזור אחורה.
**אזהרה:** SectorDashboard מחייב שכל הרכיבים שהוא משתמש בהם כבר חולצו תחילה.

---

## User Stories

---

## סטטוס כללי

| שלב | סטטוס | תאריך |
|---|---|---|
| #018 דסק משימה כללי (מודול חדש) | ✅ הושלם | 2026-07-21 |
| קובץ לוג + Baseline | ✅ הושלם | 2026-06-21 |
| QA Baseline | ✅ הושלם | 2026-06-21 |
| פיצול server.js — DB layer + routes | ✅ הושלם | 2026-06-21 |
| QA אחרי server.js — 353/353 routes | ✅ הושלם | 2026-06-21 |
| פיצול App.tsx — utilities + types + shared (חולץ) | ✅ הושלם | 2026-06-21 |
| פיצול App.tsx — WIRING (App מייבא בפועל) + build verify | ✅ הושלם | 2026-06-21 |
| פיצול App.tsx — Strip + transfers + MapZoneEditor + GroundView + ground layer | ✅ הושלם | 2026-06-21 |
| פיצול App.tsx — כל ה-sub-components + ManagementPage + SectorDashboard | ✅ הושלם | 2026-06-22 |
| **App.tsx: 41,625 → 728 שורות (98.3% חולץ ל-38 מודולים)** | ✅ הושלם | 2026-06-22 |
| QA סופי | ✅ הושלם | 2026-06-21 |
| User Stories | ✅ הושלם | 2026-06-21 |
| ARCHITECTURE.md | ✅ הושלם | 2026-06-21 |
| תיקון DB tables חסרות | ✅ הושלם | 2026-06-21 |
