# SKY-KING - Architecture Document
> עודכן: 2026-06-21 | גרסה: 2.0 (post-refactor)

---

## מבנה המערכת הנוכחי

```
SKY-KING
├── Frontend (React 18 + TypeScript + Vite)
│   └── src/
│       ├── config.ts               ← API_URL, SCREEN_SCALE_MAP ✅ wired
│       ├── types/index.ts          ← כל ה-interfaces (Strip, Transfer, Session...) ✅ wired
│       ├── utils/
│       │   ├── aircraft.ts         ← SVG icons לפי טייסת ✅ wired
│       │   ├── queryBuilder.ts     ← מנוע סינון AND/OR/NOT ✅ wired (verified identical)
│       │   ├── dataWindows.ts      ← חלונות נתונים בעמדה (מונים מוגדרי-שאילתא) ✅ wired
│       │   ├── session.ts          ← getSession / saveSession / clearSession ✅ wired
│       │   ├── scale.ts            ← scale / sc (screen scaling) ✅ wired
│       │   ├── handwriting.ts      ← compareImages (OCR helper) ✅ wired
│       │   ├── notes.ts            ← parseNoteValue / serializeNoteValue ✅ wired
│       │   └── geo.ts              ← geoToImagePct / imagePctToGeo / fmtDms (לא wired עדיין)
│       ├── types/ground.ts        ← AircraftPos, MapZone, ZoneAltRange, StripZoneAssignment... ✅ wired
│       ├── utils/strips.ts         ← getFormationDisplayName, normalizeAlt, computeBlockDeviation... ✅ wired
│       ├── utils/digits.ts         ← OCR digit API helpers ✅ wired
│       ├── components/
│       │   ├── shared/
│       │   │   ├── ConfirmModal.tsx ← global confirm dialog ✅ wired (כולל customConfirm)
│       │   │   ├── ContextMenu.tsx  ← right-click transfer menu ✅ wired
│       │   │   ├── OnScreenKeyboard.tsx ← tablet virtual keyboard ✅ wired
│       │   │   ├── HandwritingOverlay.tsx ← OCR כתב יד ✅ wired
│       │   │   ├── StationPeekBar.tsx ← תצוגת עמדות אחרות (ריבועי iframe ?peek=) ✅ wired
│       │   │   └── StationScreenFrame.tsx ← מסך עמדה בקופסה (משותף: הצצה + מסך לדוגמה) ✅ wired
│       │   ├── strips/Strip.tsx     ← רכיב הסטריפ המרכזי (868 ש') ✅ wired
│       │   ├── transfers/TransferCards.tsx ← Outgoing/Incoming/StripEditor ✅ wired
│       │   ├── map/MapZoneEditor.tsx ← עורך אזורי מפה (1,225 ש') ✅ wired
│       │   ├── ground/groundShared.tsx ← constants + icons + helpers (מז"א, ground) ✅ wired
│       │   ├── ground/JoiningPointPanel.tsx ← נקודת הצטרפות (STAR): טבלת בלוקי גבהים ✅ wired
│       │   ├── ground/PatternAircraftLayer.tsx ← מטוסים על צלע "עם הרוח" של ההקפה ✅ wired
│       │   └── views/GroundView.tsx ← עמדת מגדל TWR (6,037 ש') ✅ wired
│       ├── components/views/       ← SectorDashboard (14.5k), GroundView (4.8k), VerticalView ✅
│       ├── components/admin/       ← ManagementPage (7.4k), managers (12 admin managers) ✅
│       ├── components/classic/     ← ClassicViews (Classic/Civilian/Strip cards) ✅
│       ├── components/transfers/   ← TransferCards, DraggablePanels ✅
│       ├── components/dashboard/   ← AdminDashboard, TransferFormModal, DonutChart ✅
│       ├── components/query/       ← QueryBuilder ✅
│       ├── components/dataWindows/ ← DataWindowLayer (צף מעל מפת השדה) + DataWindowsAdmin ✅
│       ├── components/blocks/      ← BlockMiniView, BlockVisualPainter ✅
│       ├── components/missiondesk/ ← MissionDeskBody (קנבס, משותף) + MissionDeskView (מצב הגדרה) + ButtonsBoard/InkPad/SmartTable ✅
│       ├── App.tsx                 ← 951 שורות (WorkstationLogin + PeekFrame + App routing בלבד) ✅
│       ├── ClockWidget.tsx         ← שעון (הופרד)
│       └── VirtualKeyboard.tsx     ← מקלדת (הופרדה)
│
│   ✅ App.tsx פוצל במלואו: 41,625 → 728 שורות (98.3%), 38 מודולים, build יציב 2,699 kB.
│
├── Backend (Node.js ESM + Express 5)
│   ├── server.js                   ← entry point (134 שורות: listen מיידי, ואז שרשרת ה-DB ברקע)
│   └── server/
│       ├── app.js                  ← express setup + router mounts
│       ├── db/
│       │   ├── pool.js             ← Pool יחיד (DATABASE_URL)
│       │   ├── init.js             ← initDb() - schema only
│       │   └── seed.js             ← seedDb() - initial data
│       ├── routes/                 ← 22 קבצים, 455 routes
│       │   ├── crew.js             ← 16 routes (crew, digits, login, session)
│       │   ├── strips.js           ← 45 routes (strips, aircraft, formations)
│       │   ├── transfers.js        ← 16 routes (transfer flow)
│       │   ├── sectors.js          ← 16 routes (sectors, sub-sectors)
│       │   ├── workstations.js     ← 13 routes (presets, filters)
│       │   ├── maps.js             ← 26 routes (maps, zones, closures)
│       │   ├── blocks.js           ← 15 routes (altitude blocks)
│       │   ├── airfield.js         ← 86 routes (full airfield ops)
│       │   ├── joiningPoints.js    ← 11 routes (נקודות הצטרפות STAR)
│       │   ├── base.js             ← 18 routes (bases, contacts)
│       │   ├── collaboration.js    ← 27 routes (notes, messages, collab)
│       │   ├── admin.js            ← 42 routes (serials, BDH, aids)
│       │   ├── classic.js          ← 15 routes (classic strip tables)
│       │   ├── civilian.js         ← 6 routes (civilian strips)
│       │   ├── stripControls.js   ← 3 routes (ערכי פקדים: פנימי ללוח / גלובלי לפ"מ)
│       │   ├── driver.js           ← 20 routes (vehicle/driver system)
│       │   └── missionDesks.js     ← 9 routes (דסק משימה כללי + fan-out שיתוף;
│       │                                  service_type כולל map/strips - חלון מפה
│       │                                  וחלון הפ"ממים שלו. המפה עצמה נבחרת
│       │                                  פר-עמדה ב-mission_desk_map_config,
│       │                                  ומרונדרת דרך renderMapPanel/renderStripsPanel
│       │                                  של SectorDashboard - בלי רכיב מפה שני)
│       └── utils/
│           └── (geo, astar - TODO: extract from driver.js)
│
├── Database (PostgreSQL / Neon)     ← ~50 טבלאות
│   ├── Core: strips, strip_aircraft, strip_aircraft_armaments, _systems
│   ├── Transfers: strip_transfers, sectors, sector_neighbors, sub_sectors
│   ├── Workstations: workstation_presets, crew_members, table_modes
│   ├── Airfield: airfields, airfield_routes, airfield_elements, runways...
│   ├── Collaboration: sticky_notes, work_groups, workstation_collab_state
│   ├── Blocks: block_spaces, block_tables, blocks
│   ├── Zones: map_zones, zone_altitude_ranges, strip_zone_assignments
│   │         map_zone_operational_state (מצב חי: בלוקים פעילים, מגבלה, סגור/מוגבל + טווח)
│   ├── נקודות העברה קבועות: map_transfer_points (ברירת מחדל למפה + דריסה פר-עמדה)
│   └── Admin: serials, bdh_documents, activity_log
│
└── Desktop (Electron)
    └── electron-main.cjs           ← loads config.json → imports server.js
```

---

## זרימת נתונים - Strip lifecycle

```
יצירת סטריפ
     │
     ▼
POST /api/strips  ──→  DB: strips (status='queued')
     │
     ▼
workstation_preset_id נקבע (filter_query match)
     │
     ├──→ בקר CTRL: מופיע ב-MapView / TableView / VerticalView
     └──→ מגדל TWR:  מופיע ב-GroundView

     │ [שינוי סטטוס]
     ▼
PUT /api/strips/:id  →  activity_log (event_type, severity)

     │ [העברה]
     ▼
POST /api/strips/:id/transfer
     │
     ▼
strip_transfers (status='pending')
     │
     ├──→ polling/push → IncomingTransferCard בעמדה המקבלת
     │
     ├──→ ACCEPT: PUT /api/transfers/:id/accept
     │         → strips.sector_id מתעדכן
     │         → activity_log: transfer_accepted
     │
     └──→ REJECT: PUT /api/transfers/:id/reject
               → strip חוזר לשולח
               → activity_log: transfer_rejected
```

---

## ארכיטקטורת עמדות

```
┌─────────────────────────────────────────────────────────┐
│                    WORKSTATION SESSION                   │
│  presetId | workstationName | crewMember | sectorIds    │
└─────────────────────────────────────────────────────────┘
           │
    ┌──────┴──────┐
    │             │
  CTRL           TWR
(בקר טיסה)   (מגדל פיקוח)
    │             │
┌───┴────┐   ┌───┴────┐
│MapView │   │Ground  │  ← מסכים שונים
│Table   │   │View    │
│Vertical│   │        │
│Classic │   │Classic │  ← Classic - משותף לשניהם
└────────┘   └────────┘
    │             │
    └──────┬──────┘
           │
    ┌──────┴────────────────────────────────────┐
    │        SHARED COMPONENTS                  │
    │  Strip | ConfirmModal | ContextMenu       │
    │  DraggableNeighborPanel | VirtualKeyboard │
    │  ClockWidget | ActivityLog | QueryBuilder │
    └───────────────────────────────────────────┘
```

---

## DB Schema - יחסי ליבה

```
workstation_presets (1) ──────── (N) crew_member_workstations
                                              │
                                     (N) crew_members

workstation_presets (1) ──────── (N) strips (via workstation_preset_id)
                                              │
                                     (N) strip_aircraft (idx, datk, kipa)
                                              │
                                     (N) strip_aircraft_armaments
                                     (N) strip_aircraft_systems

strips (1) ──────────────────── (N) strip_transfers
                  │
                  ├── (1) strip_zone_assignments → map_zones → zone_altitude_ranges
                  ├── (N) strip_serial_selections → serials
                  ├── (N) strip_table_assignments → workstation_presets
                  └── (1) parent_strip_id → strips (partial formation)

sectors (N) ──── (N) sector_neighbors
sectors (1) ──── (N) sub_sectors
```

---

## סנכרון בין עמדות

**מצב נוכחי: REST Polling**
```
Client A                    Server                    Client B
   │                           │                         │
   │─── GET /api/strips ──────>│                         │
   │<── [...strips] ───────────│                         │
   │                           │                         │
   │─── POST /api/strips ─────>│                         │
   │<── {id: 123} ─────────────│                         │
   │                           │                         │
   │    (5 seconds later)      │                         │
   │                           │──── GET /api/strips ───>│ (Client B polls)
   │                           │<─── [...strips] ────────│
```

**מצב מטרה: WebSocket (TODO)**
```
Client A ──── strip_updated event ────> Server ──── broadcast ────> Client B
```
ראה `/realtime` skill לפרטי מימוש.

---

## ביטול פעולה (CTRL+Z)

שכבה רוחבית שיושבת על **נקודת החנק היחידה** של הכתיבה - `server/db/pool.js` -
ולכן חלה על כל ~340 ה-endpoints שכותבים, כולל כאלה שטרם נכתבו.

```
  לקוח                    שרת                              DB
 ┌────────────┐   POST   ┌──────────────────────┐        ┌───────────────────┐
 │ יירוט fetch│─────────>│ actionContext        │        │  טריגר גנרי       │
 │  X-Station │          │  • מזהה פעולה (uuid) │        │  על כל טבלה       │
 │            │<─X-Undo──│  • תווית i18n        │        │       ↓           │
 │            │  Action  │  • רשימת חסימה       │        │  undo_journal     │
 │            │          │                      │        │  before / after   │
 │            │          │ pool: SET LOCAL      │───────>│  לכל שורה שהשתנתה │
 │  CTRL+Z    │          │       app.action_id  │        │                   │
 │      ↓     │          │                      │        │                   │
 │ חלון אישור │─POST────>│ מנוע ההיפוך          │───────>│  היפוך בסדר הפוך  │
 └────────────┘  /undo   └──────────────────────┘        └───────────────────┘
```

| | |
|---|---|
| **יחידת הביטול** | בקשת כתיבה אחת של מפעיל = פעולה אחת, גם כשנגעה בחמש טבלאות |
| **היקף** | הפעולות שלי, מהעמדה שלי, בסביבה שלי |
| **שמירה** | 5 דקות, גיזום עצל בלי cron ובלי תהליך רקע |
| **חסום** | העברות עמדה, GAPI, יומני ביקורת, זהות ומושב, תצוגה אישית |
| **התנגשות** | `rev` של `versionedTables` הופך כל נגיעה של עמדה אחרת לגלויה; ביטול נעצר ב-409 עד אישור מפורש |

האפיון המלא: [UNDO_SPEC.md](UNDO_SPEC.md).

---

## עמידות בנתק

הפריסה: **נתיב רקיע** - רשת מבודדת בלי חיבור לאינטרנט. שני נתקים אפשריים,
ולכל אחד מנגנון משלו.

```
   ┌──────────┐   נתק 1    ┌───────────────┐   נתק 2    ┌─────────┐
   │ DB GAPI  │ ─────────> │ DB SKY-KING   │ ─────────> │  עמדה   │
   │  (שו"ב)  │  store &   │   + שרת       │  cache     │ Electron│
   └──────────┘  forward   └───────────────┘  מקומי     └─────────┘
```

### נתק 1: GAPI ↔ DB SKY-KING (בשרת)

**כבר מטופל.** אירוע נכנס מ-GAPI נכתב ל-DB של SKY-KING ([server/gapi/sync.js](server/gapi/sync.js))
ולא מועבר לאפליקציה - האפליקציה קוראת אך ורק מ-DB SKY-KING. לכן בנתק המידע
**קפוא אבל שלם ועקבי**, והעבודה נמשכת. אידמפוטנטיות לפי `event_id` + `version`,
תור יציאה עם retry ([server/gapi/outbox.js](server/gapi/outbox.js), `MAX_ATTEMPTS=12`)
ו-reconciliation תקופתי סוגרים את הפער כשהקשר חוזר.

### נתק 2: DB SKY-KING ↔ עמדה (בלקוח) - [src/offline/](src/offline/)

| שכבה | מנגנון |
|---|---|
| **האפליקציה על העמדה** | מצב `bundled`: ה-`dist` ארוז בעמדה ומוגש מ-[electron/stationServer.cjs](electron/stationServer.cjs), שגם מפרוקסס `/api` לשרת. בלקוח דק כבל מנותק = אין אפילו אפליקציה לטעון. |
| **cache מקומי** | כל תשובת GET נשמרת ב-IndexedDB ומוגשת בנתק, עם כותרות `x-skyking-from-cache` + `x-skyking-cached-at`. |
| **אין מחיקת מצב** | כישלון רשת **לעולם** לא מרוקן פאנל. מסך שמציג "אין המראות פעילות" מוסר מידע שגוי - גרוע ממסך שקרס. |
| **חיווי** | [ConnectionBanner](src/components/shared/ConnectionBanner.tsx) מעל כל מסך, כבועית קטנה ופועמת בפינה השמאלית העליונה: שעת המידע + שעון גיל מתקתק + "שיתוף בין עמדות מושבת". |
| **מדיניות כתיבה** | פרטית (כתב יד, העדפות, יומן) → outbox מקומי. משותפת (העברות, ספרורים, סטטוס בסיס) → **נחסמת** ב-503 `OFFLINE_SHARED_WRITE` **כשאין מאגר מקומי**. כשיש - ראה §נתק 3. |

> ⚠️ **ה-cache משויך לסביבה** (`X-Env`). בלי זה סביבת תרגול וסביבה טסה היו
> חולקות רשומות - בדיוק הזליגה שמנגנון הסכמות בשרת בא למנוע.

### נתק 3: מאגר מקומי בעמדה - [server/db/localPool.js](server/db/localPool.js)

שכבת ה-cache למעלה שומרת על העמדה **קריאה** בנתק. המאגר המקומי הופך אותה
לעמדה **עובדת**: גרירת פ"מ על מפה, העברה לנקודת מעבר, קליטה בהצטרפות.

```
   דפדפן העמדה ──> stationServer ──┬──> שרת מרכזי + Postgres   (כשיש קשר)
                    (apiRouter)     └──> server/local.js + PGlite (בנתק)
```

| רכיב | תפקיד |
|---|---|
| [server/db/localPool.js](server/db/localPool.js) | **PostgreSQL 18 בתוך העמדה** (PGlite, WASM), עם ממשק תואם `pg.Pool`. נבחר ב-`SKYKING_LOCAL_DB=1` |
| [server/local.js](server/local.js) | אותו `app` של Express, מול המאגר המקומי. `127.0.0.1` בלבד, בלי עובדי GAPI |
| [electron/apiRouter.cjs](electron/apiRouter.cjs) | מכריע לאן הולכת כל בקשת `/api`. `auto` / `local` / `remote`, סף 3 כשלים |
| [electron/authBridge.cjs](electron/authBridge.cjs) | המשך זהות: מחליף אסימון מרכזי במקומי במעבר, ושומר אסמכתא לכניסה בנתק |
| `GET /api/__station/status` | מאיזה מאגר העמדה משרתת כרגע. נענה מקומית, ולכן עובד גם בנתק מלא |
| [scripts/station.mjs](scripts/station.mjs) | אותה עמדה בדיוק מתוך הריפו, לפיתוח ולבדיקה: `npm run station` |

**שלוש הדרכים שבהן העמדה עולה** - אותו `stationServer`, אותו `server/local.js`,
ורק ה-UI שונה:

| איך | מה מקבלים | מתי |
|---|---|---|
| **חלון kiosk** | ברירת המחדל של ההתקנה | עמדה ייעודית במגדל / בשולחן הבקרה |
| **סוכן עמדה** (`"AGENT": true`) | בלי חלון. הפקח פותח `http://127.0.0.1:5100` בדפדפן שלו | עמדה שעובדים בה ב-WEB ובכל זאת צריכה מאגר על המחשב |
| `npm run station` | אותו דבר מתוך הריפו, מול Vite | פיתוח ובדיקה |

⚠️ **הפורט קבוע (5100), וזה לא קוסמטיקה.** ה-cache בנתק יושב ב-IndexedDB והוא
משויך ל-origin; פורט אקראי בכל הפעלה פירושו עמדה שמאבדת את כל המידע השמור שלה
בכל הדלקה מחדש - בדיוק כשהוא הכי נחוץ. פורט תפוס נסוג לפורט חופשי במקום להפיל
את העמדה (`STATION_PORT` ב-config.json משנה אותו).

#### עמדה שעולה ב-WEB - [src/offline/stationAgent.ts](src/offline/stationAgent.ts)

הפקח פותח את הכתובת של SKY-KING בכרום, ולא את הסוכן. הדף **מוצא** את הסוכן
שעל המחשב ומפנה אליו את כל תעבורת ה-`/api`:

```
   כרום על הכתובת של SKY-KING
        │ כל /api  (אחרי שהאסימון ו-X-Env כבר צורפו)
        ▼
   http://127.0.0.1:5100  ← הסוכן
        ├──> השרת המרכזי   (כשיש קשר)
        └──> PGlite בעמדה   (בנתק)
```

| | |
|---|---|
| **גילוי** | `GET /api/__station/status` על הפורט הקבוע, בעליית הדף וכל דקה עד שנמצא |
| **בדיקת התאמה** | הסוכן מדווח את ה-`apiTarget` שלו. סוכן שמכוון ל**שרת אחר** אינו משמש - אחרת מידע השדה היה נשלח לשם בלי שאיש יראה |
| **שער מקורות** | הסוכן מאזין על 127.0.0.1 בלבד, אבל כל אתר בטאב אחר יכול לפנות אליו מהדפדפן. מורשים: ה-`apiTarget`, לוקלהוסט, ו-`ALLOWED_ORIGINS` |
| **Private Network Access** | כרום חוסם בקשה מדף ציבורי אל 127.0.0.1 גם כש-CORS תקין. הסוכן עונה `Access-Control-Allow-Private-Network` ב-preflight |
| **Local Network Access** | מכרום 142 הפנייה מדף **ציבורי** ל-loopback דורשת **אישור חד-פעמי של המפעיל**. הלקוח שולח `targetAddressSpace: 'loopback'`, השרת מוסיף `local-network-access=(self)` ל-`Permissions-Policy`, והפקד מבחין בין "נחסם" לבין "אין סוכן" דרך `navigator.permissions` |
| **CSP** | `connect-src` ב-[server/middleware/securityHeaders.js](server/middleware/securityHeaders.js) מתיר `http://127.0.0.1:*`. בלעדיו הדפדפן חוסם את הפנייה **לפני שהיא יוצאת**, והודעת החסימה מופיעה רק בקונסולה - בממשק זה נראה בדיוק כמו "אין סוכן" |
| **בלי סוכן** | אין שכתוב, והדף עובד מול המרכז בדיוק כמו קודם. הפקד אומר **למה** אין מאגר, ולא רק ש"אין" |

⚠️ **שלוש שכבות חסימה נפרדות, וכולן נראות אותו דבר בממשק.** CORS, CSP
(`connect-src`) ו-Local Network Access - כל אחת חוסמת את הפנייה לסוכן, כל אחת
מדווחת **רק בקונסולה של הדפדפן**, ובפקד זה נראה בדיוק כמו "אין סוכן". שלושתן
נתפסו רק בבדיקה מול הפריסה האמיתית, אחת אחרי השנייה.

⚠️ **השכתוב מותקן ראשון, ולכן הוא הפנימי ביותר בשרשרת ה-fetch.** יירוטי
האסימון, הסביבה והעמדה מצרפים את הכותרות שלהם לנתיב **יחסי** בלבד
(`shouldAttachToken` דורש `url.startsWith('/api')`). שכתוב לכתובת מוחלטת
לפניהם היה שולח כל בקשה לסוכן בלי אסימון ובלי `X-Env` - 401 על הכל, ומידע של
סביבה אחת שנקרא באחרת.

⚠️ **דפדפן בלי סוכן נשאר צפייה בלבד**, ואין דרך לעקוף זאת: PGlite ו-457
ה-endpoints דורשים תהליך Node על המחשב. לטאב בכרום אין כזה - ולכן הסוכן.

**אימות:** `npm run verify:web-agent` מרים את שלושת הצדדים (שרת מרכזי מדומה,
סוכן, דפדפן אמיתי) ובודק את מה שאי אפשר לבדוק בלי דפדפן: CORS ו-PNA, שרידות
האסימון וה-`X-Env`, תשובה מהמרכז כשיש קשר, ותשובה מהמאגר שבעמדה בנתק.

**למה PGlite ולא SQLite:** הסכמה היא Postgres לעומקה - JSONB, pgcrypto,
סכמות תרגול, `ANY($1::int[])`. PGlite מריץ את `init.js` ואת **457 ה-endpoints**
בלי שורת קוד שמשתנה. SQLite היה מחייב גרסה שנייה לכל שאילתה.

**איך הוא מגיע לעמדה:** `scripts/build-local-server.mjs` אורז את השרת המקומי
לקובץ אחד (esbuild, 2.3MB), ו-`electron-builder` מוציא אותו ואת PGlite מה-asar
(`asarUnpack`). שניהם חובה: התהליך הבן הוא Node רגיל ו**אינו יודע לקרוא מתוך
`app.asar`**. עד 2026-09-22 שום קובץ שרת לא נארז כלל, ולכן המאגר המקומי עבד רק
כשמריצים Electron מתוך הריפו - ראה [REFACTOR_LOG.md](REFACTOR_LOG.md).

**נקודת ההחלפה יחידה:** `rawPool` ב-[server/db/pool.js](server/db/pool.js).
כך פיצ'ר חדש עובד בנתק ביום שהוא נכתב, בלי לזכור לתמוך בו.

**החסימה נשארה - במקום שבו היא נכונה.** `OFFLINE_SHARED_WRITE` עדיין חוסם
כתיבה משותפת בעמדה **בלי** מאגר מקומי (דפדפן, `mode: 'remote'`), כי שם אין
לאן לכתוב. כשיש מאגר מקומי הכתיבה נכנסת אליו, ו**הסתירה נפתרת בסנכרון** ולא
בניחוש: `rev` על חמש הטבלאות (ראה [data-model.md](data-model.md) §מעקב גרסה)
עונה על "האם מישהו אחר נגע בזה", ומה שמתנגש עולה להכרעת הבקר.

### נתק 4: הסנכרון חזרה - [server/sync/](server/sync/)

**שלושת המצבים, וזה החוזה של המערכת:**

| מצב | מי מזין את מי |
|---|---|
| **קשר תקין** | המרכז מזין **גם את העמדה וגם את המאגר המקומי**. המאגר המקומי בשלב הזה הוא **קורא בלבד** - הוא מתעדכן מהמרכז ולא ממקור אחר |
| **נתק** | שני המאגרים היו זהים ברגע הניתוק, והעמדה מדברת **רק** עם המקומי |
| **חזרה מנתק** | מה שהעמדה עשתה בנתק נדחף ראשון ו**הוא הקובע**; כל השאר מתעדכן מהמרכז |

```
   מראה  ──> המרכז מצלם את מצב השדה → העמדה קולטת (withoutJournal)
   יומן  ──> טריגר על 5 הטבלאות רושם כל שינוי מקומי
   דחיפה ──> איחוד פר-שורה → rev שונה? → **האחרון מנצח** → הוחל / גרסת המרכז
```

#### שירות המראה - [server/sync/daemon.js](server/sync/daemon.js)

**מי מושך את המראה, ולמה זה השתנה.** עד 2026-09-22 הסנכרון רץ **בדפדפן**
([src/offline/syncClient.ts](src/offline/syncClient.ts)), וכל אחד מהתנאים
הבאים כיבה אותו בשקט: אין דפדפן פתוח · איש אינו מחובר · המפעיל סגר את העמדה
בסוף המשמרת. התוצאה הייתה מאגר מקומי ריק, שמתגלה רק כשהקשר נופל והמסך מתרוקן.

היום המראה נמשכת בשירות שרץ **כל עוד הסוכן רץ**, בלי תלות בדפדפן ובלי תלות
במי שמחובר.

| | |
|---|---|
| **איפה הוא חי** | **בתוך תהליך המאגר המקומי** ([server/local.js](server/local.js)), ולא כאפליקציה נפרדת. PGlite **נועל את תיקיית המאגר** ותהליך שני אינו יכול לפתוח אותה |
| **מה זה מפשט** | הצד המקומי הוא קריאת DB ישירה, ורק הצד המרכזי הוא HTTP. זה מסיר את הקושי שבגללו הסנכרון הושם בדפדפן מלכתחילה ("אסימון תקף לשני הצדדים באותה נשימה") |
| **זהות** | `STATION_TOKEN` - אסימון עמדה בכותרת `X-Station-Token`, עם רשימת היתר **סגורה וקריאה בלבד** (`STATION_PATHS` ב-[server/middleware/auth.js](server/middleware/auth.js)) |
| **למה לא `SERVICE_TOKEN`** | הרשימה ההיא משותפת לשירותי העמית (מיראז', ATSIM) ומתועדת שם כקריאה בלבד; הוספת נתיבי העמדה אליה הייתה פותחת אותם גם להם |
| **כיוון אחד** | מהמרכז אל העמדה בלבד. **הדחיפה חזרה נשארת בדפדפן**, שם יושבת זהות המפעיל ושם מוכרעות הסתירות - ולכן אסימון עמדה שנגנב אינו יכול לכתוב דבר |
| **קצב ונסיגה** | סיבוב כל 60 שניות; אחרי כשל נסיגה מתגברת מ-10 שניות עד 5 דקות |
| **הגנה** | `protectedKeys` בכל קבוצה - המראה לעולם אינה דורסת שורה שממתינה ביומן, כלומר עבודה שנעשתה בנתק וטרם נדחפה |
| **קליטה** | `SET LOCAL session_replication_role = 'replica'` - מפתחות זרים אינם נאכפים בזמן הקליטה. ראה למטה |

**למה הקליטה אינה אוכפת מפתחות זרים.** הצילום נלקח בטרנזקציה אחת במרכז, ושם
האילוצים כבר נאכפו; אכיפה חוזרת בעמדה אינה מוסיפה שום אמת - והיא נכשלת משתי
סיבות שאין להן קשר לנכונות הנתונים:

1. **רשימת החסימה.** `maps` אינה נשלחת (מגה-בייטים לשורה), וכ-66 טבלאות
   מצביעות עליה במישרין או בעקיפין. **כולן** נפלו.
2. **סדר התלויות.** בייצור `joining_point_strips` נמשך 65 מקומות לפני `strips`
   שהוא ההורה שלו.

`SET LOCAL` ולא `SET`: התוקף נגמר ב-COMMIT, ולכן שום כתיבה תפעולית אחרי
הקליטה אינה רצה בלי אכיפה. מאומת בבדיקה.

> **שתי גישות שנזנחו, ולמה:** `SET CONSTRAINTS ALL DEFERRED` אינו עושה דבר
> לאילוץ שאינו DEFERRABLE, ורובם אינם. SAVEPOINT לכל שורה הפיל את המאגר
> ב-`stack depth limit exceeded` - אלפי תת-טרנזקציות מרוקנות את מחסנית ה-WASM
> של PGlite.

**נמדד מול הייצור:** 128 טבלאות · 8343 שורות · 35 שניות · אפס כשלים, בלי
דפדפן פתוח.
| **חיווי** | מצב השירות ב-`GET /api/__localdb/summary`, ומוצג בראש דף המאגר המקומי |

**הפעלה:** `STATION_TOKEN` בשרת המרכזי, ואותו ערך ב-`STATION_TOKEN` בקובץ
התצורה של העמדה (או `--token=` ב-`npm run station`). בלעדיו השירות פשוט אינו
נדלק, והעמדה ממשיכה להסתנכרן מהדפדפן כמו קודם.

#### המראה מגיעה בחלקים - ולמה זה קריטי

**128 טבלאות · 4.58MB · 10.5 שניות** (נמדד מול הייצור). תקרת הזמן של הפרוקסי
בעמדה היא 8 שניות, ולכן הצילום המלא **חרג ממנה תמיד** וחזר `502` - המאגר
המקומי נשאר **ריק לנצח**, ובמעבר לנתק המסך התרוקן. הסימפטום שדווח: "יש
HTTP 502, וכשעובר לנתק כל הנתונים נעלמים".

| | |
|---|---|
| **חלוקה** | `GET /api/sync/mirror/tables` מחזיר את הרשימה **בסדר התלויות**, והלקוח מושך `MIRROR_BATCH=12` טבלאות בכל בקשה. נמדד: 11 קבוצות, הכבדה 1.2 שניות |
| **למה סדר תלויות** | חיתוך הרשימה בטוח רק כשהורה מגיע בקבוצה שלפני הילד; אחרת המפתחות הזרים נשברים בקליטה |
| **קטיעה** | מה שנקלט כבר יושב במאגר, והסבב הבא ממשיך **מהקבוצה שנפלה**. בלי זה רשת רועדת הייתה משאירה את העמדה ריקה לנצח |
| **תקרת זמן** | נתיבי `/api/sync/` מקבלים 120 שניות ולא 8. תקרת 8 השניות קיימת כדי לזהות נתק מהר - ובקשת סנכרון אינה בקשה תפעולית ואינה מעידה על מצב הקשר |
| **חיווי** | הפקד מציג "טוען את המאגר המקומי (n/m)" ו"נתק עכשיו יציג מסך ריק" **לפני** הניתוק, ולא מגלה זאת אחריו |

#### לראות מה באמת יש במאגר - [public/local-db.html](public/local-db.html)

עד שהדף הזה נבנה, הדרך היחידה לדעת אם המראה הצליחה הייתה **לנתק את העמדה
ולראות מסך ריק** - כלומר לגלות את התקלה ברגע הכי גרוע. הדף נפתח מהפקד
("הצג את המאגר המקומי") או ישירות ב-`/local-db.html`.

| | |
|---|---|
| **מה מוצג** | כל הטבלאות עם ספירת שורות אמיתית, סך הכל, נתיב המאגר על הדיסק, ותוכן טבלה בלחיצה |
| **דף עצמאי** | השאלה נשאלת בדיוק כשמשהו לא עובד; דף שתלוי באפליקציה היה מת יחד איתה |
| **איפה הוא שואל** | קודם המקור של הדף (עמדת Electron), ואם אין - סוכן העמדה. אותו דף לשני המצבים |
| **`/api/__local/`** | התחילית המפורשת כופה את המאגר המקומי. בקשה רגילה הייתה מנותבת **למרכז**, ושם הנתיב חסום ב-`localOnly` |
| **גבולות** | `localOnly` (לא קיים במרכז כלל) · שם הטבלה מאומת מול הקטלוג ולא רק מצוטט · תקרה של 500 שורות · קריאה בלבד |

**המדיניות: האחרון מנצח (LWW), והמערכת מכריעה לבדה.** בפועל פעילה בכל רגע
**עמדה אחת מכל סוג**, ולכן פ"מ שנגרר בעמדה מנותקת כמעט לעולם אינו נגוע
בו-זמנית במרכז - והמקרה הנפוץ הוא בכלל "אין סתירה". מסך שהיה עוצר את הבקר
אחרי כל נתק כדי לאשר את מה שממילא נכון הוא צעד נוסף מול הסדק, בדיוק מה
ש-SKY-KING בא למנוע.

`rev` לא נזרק: הוא עדיין מה שמזהה ששני הצדדים נגעו. הוא פשוט מדליק את השוואת
הזמנים במקום לעצור את הזרימה.

| מצב | מה קורה |
|---|---|
| איש לא נגע (הנפוץ) | נכתב במרכז. `applied` |
| העמדה עדכנה אחרי המרכז | נכתב במרכז. `applied` · `newer_here` |
| המרכז עודכן אחרי העמדה | גרסת המרכז מנצחת ו**מאומצת בעמדה מיד**. `superseded` |
| השורה נמחקה במרכז | המחיקה מנצחת, בלי להשוות זמנים - שחזור היה מחזיר מטוס רפאים למפה |
| אין חותמת זמן | `conflict` - **רק** כאן נדרש אדם |

> ⚠️ **שעונים.** העמדה שולחת את השעה שלה בדחיפה, והמרכז מתרגם (`skewMs`) לפני
> ההשוואה. בלי זה עמדה שהשעון שלה מקדים בעשר דקות הייתה מנצחת **תמיד**.

| רכיב | תפקיד |
|---|---|
| [server/db/syncJournal.js](server/db/syncJournal.js) | **יומן הפעולות המקומיות** - טריגר על חמש הטבלאות, במאגר המקומי בלבד. `app.sync_apply` מונע מקליטת המראה להירשם בו (אחרת לולאה) |
| [server/db/localIds.js](server/db/localIds.js) | **גוש מזהים לעמדה** - `SERIAL` בעמדה מנותקת מתנגש בזה של המרכז. הרצפים מוזזים ל-`1.5e9 + block×100k`, ולכן פ"מ שנולד בנתק ייחודי מלידתו |
| [server/sync/coalesce.js](server/sync/coalesce.js) | **איחוד** - 10 גרירות של אותו פ"מ = פעולת נטו אחת. `baseRev` מה-`before` הראשון, התוכן מה-`after` האחרון |
| [server/sync/apply.js](server/sync/apply.js) | **ההחלה במרכז + ההכרעה** - `rev` תואם → הוחל · שונה → השוואת זמנים (`decideByTime`) עם תיקון שעונים. הסכמה נקבעת בשרת ולא בבקשה |
| [server/sync/mirror.js](server/sync/mirror.js) | **המראה** - צילום התפעולי + הקונפיג לעמדה. אינה דורסת שורה שממתינה ביומן |
| [server/db/rowOps.js](server/db/rowOps.js) | פרימיטיבים לכתיבת שורה מ-JSONB, **משותפים עם מנוע הביטול** |
| [server/routes/sync.js](server/routes/sync.js) | שני הצדדים: `push`/`mirror` במרכז · `state`/`outbound`/`ack`/`resolve`/`mirror` בעמדה |
| [src/offline/syncClient.ts](src/offline/syncClient.ts) | **הדפדפן מריץ את הסנכרון** - הוא היחיד שמחזיק אסימון לשני הצדדים |
| [src/components/shared/SyncConflictsModal.tsx](src/components/shared/SyncConflictsModal.tsx) | **יומן ההכרעות** - מה הוכרע ולמה, שתי הגרסאות זו מול זו, ו"החזר את הגרסה שלי" להיפוך |

**שני נתיבים מפורשים** ב-[electron/stationServer.cjs](electron/stationServer.cjs):
`/api/__local/...` ו-`/api/__remote/...`. שכבת הסנכרון היא הצרכן היחיד שלהם,
כי היא חייבת לדבר עם שני הצדדים באותה נשימה. `/api/...` הרגיל מנותב לפי מצב
הקשר ויכול להגיע רק לאחד מהם.

**אין "מיזוג":** פ"מ אינו מסמך טקסט. מיזוג של גובה מגרסה אחת ועמדה מגרסה
שנייה מייצר מצב שאיש משני הצדדים לא בחר בו. יש גרסה מנצחת אחת, והיא שלמה.

**שקיפות במקום חסימה.** מה שהוכרע אוטומטית מופיע ביומן ההכרעות בפקד העמדה -
הבקר רואה מה נקבע, ויכול להחזיר את הגרסה שלו (דחיפה בכפייה). הוא פשוט אינו
**נעצר** בשביל זה.

### נתק מדומה - כלי התרגול

כפתור ב-[OutageSimPanel](src/components/shared/OutageSimPanel.tsx) מנתק **עמדה
אחת** מהמאגר המרכזי. השדה ממשיך לעבוד, שאר העמדות אינן יודעות דבר, ומי שלחץ
עובר לעבוד מול המאגר שלו. כך אפשר לראות את כל השרשרת - נתק, עבודה, סנכרון,
סתירה, הכרעה - בלי להפיל שדה.

| איפה | מה קורה |
|---|---|
| עמדת Electron עם מאגר מקומי | `POST /api/__station/outage` → הנתב עובר ל-`local`. הבקשות **מצליחות**, מול PGlite |
| דפדפן בלי מאגר מקומי | דגל ב-`localStorage`, ושכבת ה-fetch מפילה את הבקשות - cache לקריאה, outbox לכתיבה פרטית, חסימה לכתיבה משותפת |

**איך בודקים:** `npm run dev` + `npm run station`, ופותחים את **5100**. ב-5000 אין
שרת עמדה ואין מאגר מקומי, ולכן "נתק" שם הוא צפייה בלבד **בהגדרה** - וזה נראה
כמו תקלה. ראה [DEV_GUIDE.md](DEV_GUIDE.md) §בדיקת עבודה בנתק.

**הזהות היא החוליה השברירית:** לשרת המקומי סוד חתימה משלו, ולכן אסימון מרכזי
נדחה אצלו ב-401. שרת העמדה מנפיק מקביל מקומי בכל פעם שהמרכז **מקבל** את
האסימון (`authBridge.noteAccepted`) - ולא רק ברגע כניסה. בלי זה פקח שרענן את
הדף היה מקבל 401 על כל בקשה בנתק, כלומר "שום דבר לא נשמר".

> ⚠️ **הדימוי אינו מדווח על מצב הקשר האמיתי.** כשלים מלאכותיים אינם נספרים
> ב-`createRemoteHealth`, אחרת העמדה הייתה נשארת "מנותקת" גם אחרי הכיבוי.

> 🔜 **מה עוד לא:**
> · המראה אינה מעבירה מפות (`maps.image_data` - מגה-בייטים לשורה, ראה
>   `MIRROR_DENYLIST`), ולכן עמדה שלא ראתה מפה מעולם לא תראה אותה בנתק.
> · היומן מכסה את **חמש** הטבלאות בלבד. שורות בנות של פ"מ שנוצר בנתק
>   (`strip_aircraft` וילדיו) **אינן נדחפות** - הפ"מ מגיע למרכז, פרטי המטוס
>   שנרשמו לצידו בנתק לא. הרחבת היומן לטבלאות הבנות דורשת `rev` גם עליהן.

---

## יתירות ו-failover

הנתק שהעמדה שורדת (כבל בודד) הוא התרחיש **הקל** - הוא מבודד לעמדה אחת.
נפילת ה-DB או המתג המרכזי מפילה את **כל** העמדות בו-זמנית.

### מה כבר קיים בקוד

| מנגנון | איפה | מה נותן |
|---|---|---|
| **liveness** `GET /api/health` | [server/app.js](server/app.js) | לא נוגע ב-DB בכוונה. נשאר 200 בזמן עלייה, כדי שפלטפורמת האירוח לא תהרוג קונטיינר באמצע `initDb` (עשרות שניות מול Neon) |
| **readiness** `GET /api/ready` | [server/app.js](server/app.js) | 503 כל עוד `phase !== 'ready'` או שה-DB לא מגיב תוך 3ש'. זה מה ש-load balancer צריך כדי **לנתב הצידה** ממופע פגום במקום שהעמדות יקבלו 500 |
| **שרידות ל-failover של ה-DB** | [server/db/pool.js](server/db/pool.js) | `SELECT` בלבד משודר שוב (2 ניסיונות, 120/400ms) על שגיאת connection (`57P01`, `08006`, `ECONNRESET`...). כך failover של Neon הוא הבהוב ולא גל 500 |
| **cache בעמדה** | [src/offline/](src/offline/) | עמדה שורדת גם נפילת DB/שרת, לא רק נתק כבל - אותו מנגנון |

> ⚠️ **כתיבה לעולם אינה משודרת שוב.** כשה-connection מת אי אפשר לדעת אם
> ה-`INSERT` הספיק להתבצע בצד השרת, ושידור חוזר היה משכפל פ"מ או העברת עמדה.
> `isReadOnlySql` הוא **fail closed**: כל מה שאינו `SELECT` מובהק נחשב כתיבה.
> גם CTE שמכיל `INSERT`/`DELETE` נפסל. ראה [pool-retry.test.js](server/db/pool-retry.test.js).

### מה עדיין דורש החלטת תשתית (לא ניתן לפתרון בקוד)

| SPOF | מה נדרש |
|---|---|
| **DB יחיד** | standby עם streaming replication + failover אוטומטי. ב-Neon: read replica + promote; ב-Postgres עצמאי בנתיב רקיע: primary/standby + patroni או שקול ידני |
| **שרת אפליקציה יחיד** | שני מופעים מאחורי load balancer שמנטר את `/api/ready`. השרת חסר-מצב (המצב ב-DB), ולכן זו פעולת תצורה ולא שינוי קוד |
| **מתג מרכזי** | מסלול רשת כפול לעמדות הקריטיות |

**סדר עדיפות מומלץ:** LB + שני מופעי אפליקציה (זול, מסיר את ה-SPOF הנפוץ יותר)
→ standby ל-DB → יתירות רשת.

---

## חוב טכני - סדר עדיפויות

| # | פריט | סיכון | עדיפות |
|---|------|-------|--------|
| 1 | App.tsx - 41K שורות | HIGH | ✅ תוקן (951 שורות, 38 מודולים) |
| 2 | אין WebSocket | MEDIUM | גבוהה |
| 3 | אין בדיקות | HIGH | ✅ תוקן חלקית (2,055 unit + חבילת e2e ב-Playwright) |
| 4 | auth client-side בלבד | MEDIUM | בינונית |
| 5 | CORS פתוח (cors()) | LOW | נמוכה |
| 6 | initDb = seed מעורבב | LOW | ✅ תוקן |
| 7 | server.js מונוליט | HIGH | ✅ תוקן |
| 8 | עמדה לא שרדה נתק (לקוח דק) | HIGH | ✅ תוקן |
| 9 | `map_zones` היא קונפיג אך נושאת מצב תפעולי → תרגול כותב לאמת | HIGH | ✅ תוקן (`map_zone_operational_state`) |
| 10 | SPOF: DB יחיד + שרת אפליקציה יחיד | HIGH | ⚠️ הקוד מוכן (`/api/ready` + שרידות failover); **חסרה תצורת תשתית** |

---

## תרשים זרימה - Transfer חלקי (פיצול פ"מ)

```
בקר רוצה להעביר 2 מתוך 3 מטוסים
          │
          ▼
POST /api/strips/partial-create
    { stripId: 10, aircraftIndices: [1,2] }
          │
          ▼
DB: strips (חדש) id=11
    callsign="חנית"
    parent_strip_id=10
    aircraft_indices=[1,2]
    original_formation_count=3

DB: strips (מקורי) id=10
    parent_strip_id=10  ← מצביע על עצמו (root)
    aircraft_indices=[3]
          │
          ▼
strip 11 נשלח בהעברה:
POST /api/strips/11/transfer
          │
          ▼
בעמדה המקבלת: IncomingTransferCard מציג "חנית1+2"

```

---

## מבנה מסך - CTRL (בקר טיסה)

```
┌─────────────────────────────────────────────────────────────────┐
│  Header: [שם עמדה] [שם בקר] [שעה] [לחץ אטמוספרי] [יציאה]     │
├──────────────────────────────┬──────────────────────────────────┤
│                              │  DraggableNeighborPanel × N      │
│   MapView / TableView /      │  ┌─────────────────────────────┐ │
│   VerticalView / ClassicView │  │ מוסר | GILO | מקבל         │ │
│                              │  │ [OutgoingCard] [IncomingCard]│ │
│   [Strip markers on map]     │  └─────────────────────────────┘ │
│   [Zone polygons]            │                                   │
│   [Block altitude panel]     │  BDH | קשרים | קישורים          │
└──────────────────────────────┴──────────────────────────────────┘
```

### קונטיינר החלונות (עמודה אופציונלית)

עמדה שהיכולת מופעלת בה (`workstation_presets.show_window_container`) מקבלת
עמודה נוספת **בין הפ"מים לעזרים**, שאליה נדחפים חלונות צפים:

```
  order 4        order 5           order 6
┌ פ"מים ┐ ┌ קונטיינר ┐ ┌ עזרים ┐
│       │ │ פתקית    │ │       │   הרוחב קובע את הגודל,
│       │ │ הודעות   │ │       │   והחלונות נארזים למעלה
└───────┘ └──────────┘ └───────┘
```

החלון לא נבנה מחדש בעגינה - הוא נשאר במקומו בעץ הרכיבים ורק היעד ב-DOM
מתחלף (`createPortal`). המודל: [src/utils/windowDock.ts](src/utils/windowDock.ts);
ההצטרפות של חלון: [src/hooks/useDockableWindow.ts](src/hooks/useDockableWindow.ts).

## מבנה מסך - TWR (מגדל פיקוח)

```
┌──────────────────────────────────────────────────────────────────┐
│  Header: [שם עמדה] [שם פקח] [שעה]                               │
├─────────────────┬──────────────────────┬─────────────────────────┤
│  רשימת פ"מ      │    מפת שדה תעופה      │   סקטורי העברה          │
│                 │                      │                          │
│  + פמ"מ        │  [aircraft on map]   │  [NeighborPanels]        │
│                 │  [elements/runways]  │                          │
│  [StripCards]   │  [density warnings]  │                          │
│  collapsible    │                      │                          │
└─────────────────┴──────────────────────┴─────────────────────────┘
```

---

## הוראות שימוש בסקילים (workflow)

```
CEO (אורי) עם רעיון
     │
     ▼
/pm  ──→ סטורית משתמש + acceptance criteria
     │
     ▼
/arch ──→ תכנית טכנית (routes, state, DB)
     │
     ▼
/before ──→ gate check (DRY? event log? עברית?)
     │
     ▼
[כתיבת קוד]
     │
     ├── שינוי DB? → /migrate קודם
     ├── העברות? → /transfer-logic קודם
     ├── TWR? → /ground-view קודם
     └── CTRL? → /ctrl-view קודם
     │
     ▼
/qa ──→ דו"ח QA לפני done
```
