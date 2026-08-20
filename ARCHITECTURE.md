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
│       │   └── views/GroundView.tsx ← עמדת מגדל TWR (5,883 ש') ✅ wired
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
│       │   └── missionDesks.js     ← 9 routes (דסק משימה כללי + fan-out שיתוף)
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

**למה PGlite ולא SQLite:** הסכמה היא Postgres לעומקה - JSONB, pgcrypto,
סכמות תרגול, `ANY($1::int[])`. PGlite מריץ את `init.js` ואת **457 ה-endpoints**
בלי שורת קוד שמשתנה. SQLite היה מחייב גרסה שנייה לכל שאילתה.

**נקודת ההחלפה יחידה:** `rawPool` ב-[server/db/pool.js](server/db/pool.js).
כך פיצ'ר חדש עובד בנתק ביום שהוא נכתב, בלי לזכור לתמוך בו.

**החסימה נשארה - במקום שבו היא נכונה.** `OFFLINE_SHARED_WRITE` עדיין חוסם
כתיבה משותפת בעמדה **בלי** מאגר מקומי (דפדפן, `mode: 'remote'`), כי שם אין
לאן לכתוב. כשיש מאגר מקומי הכתיבה נכנסת אליו, ו**הסתירה נפתרת בסנכרון** ולא
בניחוש: `rev` על חמש הטבלאות (ראה [data-model.md](data-model.md) §מעקב גרסה)
עונה על "האם מישהו אחר נגע בזה", ומה שמתנגש עולה להכרעת הבקר.

> 🔜 **טרם נבנה:** יומן הפעולות המקומיות, מנוע הסנכרון ומסך יישוב הסתירות.
> עד שייבנו, מצב מקומי מתאים לעמדה עצמאית (`mode: 'local'`) ולנתק שבסופו
> המידע המקומי אינו נדחף חזרה.

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
