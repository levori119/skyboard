# תוכנית — תצוגת מפה כפולה (Dual Map) — חילוץ `<MapPanel>`

> מסמך תכנון. **לא לכתוב קוד עד שהסוכן המקביל ("איחוד עמדות") מסיים/מתמזג** — להימנע מהתנגשות ב-`SectorDashboard.tsx`.
> נוגע במנגנון ההעברות → לעבוד תחת `/transfer-logic` + `/qa` קפדני בין פרוסות.

## מצב נוכחי (ממצאי חקירה)
- **קונפיג קיים:** `dual_map_mode`, `map2_id`, `dual_map_layout` (side-by-side/stacked), `dual_map_split` — כולל UI בניהול.
- **רינדור קיים:** `isDualMapMode`, splitter נגרר, `dmMap1Region`/`dmMap2Region` (כולל **#4 החלפת מפות** — בוצע).
- **מפה 2 היום = תמונה + ציור + סרגל נפרד בלבד.** אין פ"מים/אזורים/נ"צ/drop.
- **ה-overlay של מפה 1 כולו inline** ב-SectorDashboard (~1200 שורות, 9036–10283) — לא מחולק לרכיב.
- **נתונים תומכים בהפרדה פר-מפה:** לפ"מים ולאזורים יש `map_id` (`currentMapId` נשמר בהנחה/zone-extra). נ"צ (sub_sectors) — ברמת עמדה, **טרם משויכות למפה**.

## עקרון
DRY (CLAUDE.md): **לחלץ רכיב `<MapPanel>` יחיד ולרנדר אותו פעמיים** — לא לשכפל JSX.

## אינוונטר ה-overlay של מפה1 (מה נכנס ל-MapPanel)
מתוך מיפוי הסקשנים (9036–10283):
1. סרגל זום/הזזה + בהירות (פאנל) + blind + ציור + closures toggle
2. סרגל ציור (כלים/צבע/גודל/מילוי/recognize/כתב-יד/שיתוף/ניקוי)
3. **מיכל Map+Strips עם transform (zoom/pan)** — הליבה:
   - תמונת מפה
   - **שכבת אזורים** (legacy % + geo image-bounded)
   - blind wireframe / flight-zones invisible drop targets
   - **שכבת פ"מים** (רק של העמדה, מסונן)
   - פיני אזורים + קווים, split/merge overlay
   - **שכבת Markers** (נ"צ/נקודות העברה) + neighbor pins + חיצים
   - flight-zones connectors / closures polygons / fz pins / split pins
4. flight-zones drop overlay (מחוץ ל-transform)
5. canvas ציור + shapes SVG
6. באנר/סטטוס flight-zones + פאנל צבעי אזורים

## Interface מוצע — `<MapPanel>`
```ts
interface MapPanelProps {
  mapId: number; mapImg: string | null;
  zoom: number; pan: {x:number;y:number}; brightness: number;
  onZoom; onPan; onBrightness;
  drawingMode; ...drawingState;            // per-map
  strips: Strip[];                          // כבר מסונן ל-mapId של הפאנל
  zones: Zone[]; subSectors: SubSector[];   // מסונן ל-mapId
  // handlers משותפים (מה-parent) — לא משוכפלים:
  onTransfer; onTransferPartial; onTransferWorkstation;
  onPlaceStrip(stripId, mapId, x, y);       // הנחה/מעבר בין מפות
  onDropOnZone(stripId, zoneId, mapId);
  themeMode; scale(--s);                    // לפי /ui-adapt
}
```
- **State per-map** (zoom/pan/brightness/drawing/shapes) — נשאר בחוץ, מועבר כ-props (כבר קיים map1*/map2*).
- **State משותף** (strips/zones/subSectors/transfers/handlers) — מהשורש, מסונן ל-`mapId` בכניסה לפאנל.

## סינון פר-מפה
- `strips.filter(s => s.map_id === panelMapId)` (או ברירת מחדל מפה1 לפ"מ בלי map_id — להגדיר חוק).
- `zones.filter(z => z.map_id === panelMapId)`.
- **נ"צ → מפה:** להוסיף שיוך. אופציה מועדפת: שדה `map_id` על נקודת-מעבר/neighbor בקונפיג עמדה (ניהול), או בחירה "מפה1/מפה2" לכל נקודה. → `/migrate` קל (nullable, default מפה1).

## גרירה בין-מפתית (#2)
- כל MapPanel חושף drop-zone משלו. ב-drop:
  - על אזור מפה → `onDropOnZone(stripId, zoneId, panelMapId)`.
  - על נקודת העברה של הפאנל → `onTransfer(...)` (זרימת ההעברות הקיימת — ללא שינוי ב-state machine).
  - על רקע המפה → `onPlaceStrip(stripId, panelMapId, x, y)` — אם הפ"מ הגיע ממפה אחרת, מעדכן `map_id`.
- **ההעברה עצמה לא משתנה** — רק יעד ה-drop. נשמר flow: `pending_transfer`/accept, activity_log, פיצול.

## פרוסות יישום + QA
1. **חילוץ `<MapPanel>` + רינדור מפה1 דרכו — אפס שינוי התנהגות.**
   QA: מפה1 עובדת בדיוק כמו לפני (פ"מים/אזורים/נ"צ/גרירה/zoom/ציור) — `/qa` runtime.
2. **רינדור מפה2 דרך אותו רכיב** (map2_id) → overlay מלא במפה2.
   QA: פ"מים/אזורים של מפה2 מופיעים; drop על מפה2 עובד.
3. **שיוך נ"צ→מפה** (ניהול + `/migrate`) → חלון נ"צ ימני למפה2.
4. **גרירה בין-מפתית** map↔map + לאזורי/נ"צ מפה2.
   QA חובה (transfer-logic): שליחה/דחייה/חלקית/כפילות/activity_log — בכל מפה.
5. אינטגרציה עם **#4 swap** (כבר קיים) + `/ui-adapt` (תמה+סקייל) לשני הפאנלים.

## סיכונים
- **refactor של הליבה הקריטית** — לבצע בפרוסות עם QA בין כל אחת; לא להמשיך אם פרוסה 1 לא ירוקה לחלוטין.
- **התנגשות עם הסוכן המקביל** ב-SectorDashboard.tsx — להתחיל קוד רק אחרי מיזוגו.
- **map_id חסר בפ"מ ישן** — להגדיר ברירת מחדל (מפה1) כדי לא "להעלים" פ"מים.

## בוצע עד כה
- ✅ #4 — `dualMapSwapped` + "🔄 החלף מפות" בתצוגה (left↔right), region geometry מחולץ.
