# SKY-KING — שירותי מפה גנריים (Map Services)

> חלוקת **כל נושא המפה** לשירותים **גנריים וניתנים לשימוש חוזר** — כך שאותה יכולת
> (עיגון, ציור פוליגון, יצירת דרך, ניתוב אוטומטי...) משרתת את כל ההקשרים:
> מפת הבקר (אזורי טיסה), מפת המגדל (שדה קרקעי), וניתוב רכב.
> עודכן: 2026-06-23. 🔗 [SHARED_LANGUAGE.md](SHARED_LANGUAGE.md) · [SERVICES.md](SERVICES.md) · [ARCHITECTURE.md](ARCHITECTURE.md)

---

## למה גנרי? (הבעיה היום)

נושא המפה פזור בין 3 קבצים עם **כפילויות לוגיקה** — אותה יכולת מומשה פעמיים:

| יכולת | מימוש א' | מימוש ב' | כפילות |
|--------|----------|----------|--------|
| עיגון image↔geo | `utils/geo.ts` + טבלת `maps` | `enrichWaypointsWithGeo` ב-`driver.js` | ✅ כפול |
| ציור פוליגונים | `map_zones` (אזורי טיסה) | `airfield_polygons` (שטחי קרקע) | ✅ כפול |
| מסלולים/דרכים | `airfield_routes` | `base_routes` (רכב) | ✅ כפול |
| מרחק (haversine) | — | `haversineM` ב-`driver.js` | ✅ פעמיים |
| סטטוס על צורה | `map_zones.enabled` | `airfield_polygon_statuses` | ✅ כפול |

**המטרה:** שירות אחד גנרי לכל יכולת → שינוי אחד חל בכל מקום (עקרון ה-DRY של CLAUDE.md).

---

## מפת השירותים הגנריים (9)

| # | שירות | מה הוא נותן | משרת את |
|---|--------|-------------|---------|
| M1 | **בסיס מפה** (Map Canvas) | טעינה והצגה של תמונה/PDF כשכבת בסיס | בקר, מגדל, רכב |
| M2 | **עיגון מפה** (Georeferencing) | המרה image-px ↔ lat/lon לפי 2 נקודות עיגון | כל מי שמציג קואורדינטות |
| M3 | **ציור אזורים** (Polygons) | יצירה/עריכה/שמירה של פוליגונים (img+geo) | אזורי טיסה, שטחי קרקע |
| M4 | **סימונים על מפה** (Markers/Elements) | מיקום נקודות/אלמנטים עם סוג, אייקון, סטטוס | נקודות שדה, מטוסים, רכבים |
| M5 | **דרך על מפה** (Routes) | יצירת מסלול כ-waypoints מסודרים (ציור ידני) | מסלולי שדה, נתיב רכב |
| M6 | **ניתוב אוטומטי** (Pathfinding) | חישוב מסלול אופטימלי על גרף (A* + haversine) | רכב (וגלגול מטוס בעתיד) |
| M7 | **שכבת סטטוס** (Status Overlay) | צביעה/סטטוס על פוליגונים/אלמנטים | מסלול פתוח/סגור, אזור פעיל |
| M8 | **קואורדינטות ומדידה** (Coords) | פורמט DMS/עשרוני, מרחק, מסב (bearing) | תצוגת מיקום בכל מפה |
| M9 | **זיהוי קונפליקטים גאומטרי** (Geo Conflicts) | point-in-polygon, תפיסת מסלול, חפיפת אזורים | קונפליקט מסלול, שיוך פ"מ לאזור |

---

## פירוט השירותים

### M1 — בסיס מפה (Map Canvas)
**מה:** רכיב גנרי שמקבל מקור (תמונה / PDF דרך `pdfjs-dist`) ומציג אותו כשכבת בסיס עם zoom/pan (Leaflet `imageOverlay` או canvas). מעליו נשענות כל השכבות (M3–M7).
**API מוצע:** `<MapCanvas source={img|pdf} anchor={MapGeoAnchor?} children={layers} />`
**גנריות:** אותו canvas למפת אזורי הטיסה (בקר), לשדה הקרקעי (מגדל), ולמפת הרכב.
**קוד היום:** מפוזר ב-`MapZoneEditor.tsx`, `GroundView.tsx`, ו-HTML של `driver.js`. **לאחד.**
**Endpoints:** `GET/POST/DELETE /api/maps`, `GET /api/maps/:id` (כולל `image_data`).

### M2 — עיגון מפה (Georeferencing) ⭐ הליבה
**מה:** קליברציה של 2 נקודות (image-px → lat/lon) שממנה נגזרות **כל** ההמרות. מקור אמת יחיד.
**API (כבר קיים ב-`utils/geo.ts`):** `buildGeoAnchor`, `geoToImagePct`, `imagePctToGeo`.
**גנריות:** כל שירות שצריך "איפה זה על המסך/בעולם" משתמש בזה — פוליגונים, סימונים, דרכים, רכב.
**דדופ נדרש:** `enrichWaypointsWithGeo` ב-`driver.js` משכפל את ההמרה — להעביר לשירות זה (משותף frontend+backend, או לחשב ב-client בלבד).
**Endpoints:** `PATCH /api/maps/:id/anchors`.

### M3 — ציור אזורים (Polygons)
**מה:** יצירה/עריכה/מחיקה של פוליגון על מפה — נשמר גם ב-image-coords וגם ב-geo-coords, עם שם, צבע, הפעלה, והורשה parent→child (sync בין מפת-אב למפות-בן).
**API מוצע:** `usePolygonLayer(mapId, kind)` → `{ polygons, create, update, remove, toggle }`. `kind ∈ {flight-zone, ground-area}`.
**דדופ נדרש:** `map_zones` (בקר) ו-`airfield_polygons` (מגדל) הם **אותו דבר** עם שמות שונים → להאחד לשירות פוליגון אחד עם שדה `kind`.
**Endpoints:** `*/api/map-zones`, `*/api/airfield-polygons` (לאיחוד).

### M4 — סימונים על מפה (Markers / Elements)
**מה:** מיקום נקודה/אלמנט גנרי על המפה — עם סוג (element type), אייקון, label, וסטטוס. מטוס, נקודת שדה, רכב, נקודת ציון — כולם "marker".
**API מוצע:** `useMarkerLayer(mapId)` + `MarkerType` (מהקטלוג).
**קוד היום:** `airfield_points`, `airfield_elements` + `airfield_element_types`. מיקומי מטוסים מצוירים בנפרד ב-GroundView. **להכליל.**
**Endpoints:** `*/api/airfield-elements`, `*/api/airfield-element-types`, `*/api/airfield-points`.

### M5 — דרך על מפה (Routes)
**מה:** יצירת מסלול כרשימת **waypoints מסודרים** שמציירים ידנית על המפה (לחיצות), עם שם/צבע/סוג. כל waypoint נושא x/y ו(אופציונלי) lat/lon מ-M2.
**API מוצע:** `useRouteEditor(mapId)` → `{ waypoints, addPoint, movePoint, save }`, `route_type ∈ {vehicle, airfield, ...}`.
**דדופ נדרש:** `airfield_routes` ו-`base_routes` — שני מבני דרך → לאחד לשירות דרך אחד עם `route_type`.
**Endpoints:** `*/api/airfield-routes`, `*/api/base-routes`.

### M6 — ניתוב אוטומטי (Pathfinding)
**מה:** בהינתן גרף (צמתים=נקודות, קשתות=מסלולי גלגול/כבישים) — חישוב המסלול הקצר/מהיר (A* עם heuristic של haversine). "כמו ניתוב רכב בעמדת ניהול קרקעי."
**API (קיים ב-`driver.js`):** `astarPath(graph, nodes, start, end)` → להוציא ל-`utils/pathfinding.ts` גנרי.
**גנריות:** רכב היום; בעתיד גם הצעת מסלול גלגול למטוס על taxiways — אותו מנוע.
**Endpoints:** `POST /api/route-plan`.

### M7 — שכבת סטטוס (Status Overlay)
**מה:** הקצאת סטטוס/צבע לצורה (פוליגון/אלמנט) — מסלול פתוח/סגור, אזור פעיל, שטח חסום. כולל קטלוג סוגי סטטוס.
**דדופ נדרש:** `airfield_polygon_statuses` + `airfield_status_types` קיימים לקרקע; `map_zones.enabled` הוא גרסה דלה לאזורי טיסה → להכליל לשכבת סטטוס אחת מעל M3/M4.
**Endpoints:** `*/api/airfield-status-types`, `*/api/airfield-polygon-statuses`.

### M8 — קואורדינטות ומדידה (Coords & Measure)
**מה:** פורמט DMS/עשרוני, קריאת מיקום עכבר→geo, מרחק (haversine), מסב (bearing).
**API:** `fmtDms` (קיים ב-`geo.ts`) + `haversineM` (קיים ב-`driver.js`) → **לאחד** ל-`utils/geo.ts` כך ששניהם במקום אחד.
**גנריות:** כל מפה מציגה מיקום/מרחק דרך אותו שירות.

### M9 — זיהוי קונפליקטים גאומטרי (Geo Conflicts)
**מה:** בדיקות גאומטריות: point-in-polygon (האם פ"מ באזור), תפיסת מסלול (live-runway-conflicts), חפיפת אזורים/גבהים.
**גנריות:** אותו מנוע גאומטרי משרת "שיוך פ"מ לאזור" (בקר) ו"קונפליקט על מסלול" (מגדל).
**Endpoints:** `GET /api/live-runway-conflicts`, `GET /api/active-takeoffs`, `GET /api/strip-zone-assignments`.

---

## תלות בין השירותים

```
M2 עיגון (ליבה)
 ├── M1 בסיס מפה ──── מעליו:
 │     ├── M3 פוליגונים ──┐
 │     ├── M4 סימונים ────┼── M7 סטטוס (צובע אותם)
 │     └── M5 דרכים ──────┘
 ├── M6 ניתוב אוטומטי (משתמש ב-M8 haversine, יוצר M5)
 ├── M8 קואורדינטות/מדידה
 └── M9 קונפליקטים (משתמש ב-M2 + גאומטריה על M3/M4)
```

---

## תוכנית יישום (מומלץ — דרך `/feature`, לא ישירות ל-main/פרודקשן)

עדיפות לפי ערך/סיכון:

1. **M8 + M2 (דדופ)** — לאחד `haversineM` ו-`enrichWaypointsWithGeo` ל-`utils/geo.ts`. סיכון נמוך, מנקה כפילות מיד.
2. **M6** — לחלץ `astarPath` ל-`utils/pathfinding.ts` גנרי + בדיקות יחידה (TDD).
3. **M3 + M5 + M7** — איחוד פוליגונים/דרכים/סטטוס (שינוי DB → דרך `/migrate`). הכי הרבה ערך, אבל גם הכי רגיש — feature נפרד.
4. **M1 + M4** — רכיבי canvas/markers גנריים ב-frontend.

> כל שלב: `/feature <name>` → worktree מבודד → TDD → VERIFY → QA → merge. **לא לדחוף ל-main בלי בדיקה** (main = פרודקשן ב-Railway).
