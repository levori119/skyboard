# SKY-KING — Architecture Document
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
│       │   │   └── HandwritingOverlay.tsx ← OCR כתב יד ✅ wired
│       │   ├── strips/Strip.tsx     ← רכיב הסטריפ המרכזי (868 ש') ✅ wired
│       │   ├── transfers/TransferCards.tsx ← Outgoing/Incoming/StripEditor ✅ wired
│       │   ├── map/MapZoneEditor.tsx ← עורך אזורי מפה (1,225 ש') ✅ wired
│       │   ├── ground/groundShared.tsx ← constants + icons + helpers (מז"א, ground) ✅ wired
│       │   └── views/GroundView.tsx ← עמדת מגדל TWR (4,812 ש') ✅ wired
│       ├── components/views/       ← SectorDashboard (14.5k), GroundView (4.8k), VerticalView ✅
│       ├── components/admin/       ← ManagementPage (7.4k), managers (12 admin managers) ✅
│       ├── components/classic/     ← ClassicViews (Classic/Civilian/Strip cards) ✅
│       ├── components/transfers/   ← TransferCards, DraggablePanels ✅
│       ├── components/dashboard/   ← AdminDashboard, TransferFormModal, DonutChart ✅
│       ├── components/query/       ← QueryBuilder ✅
│       ├── components/blocks/      ← BlockMiniView, BlockVisualPainter ✅
│       ├── App.tsx                 ← 728 שורות (WorkstationLogin + App routing בלבד) ✅
│       ├── ClockWidget.tsx         ← שעון (הופרד)
│       └── VirtualKeyboard.tsx     ← מקלדת (הופרדה)
│
│   ✅ App.tsx פוצל במלואו: 41,625 → 728 שורות (98.3%), 38 מודולים, build יציב 2,699 kB.
│
├── Backend (Node.js ESM + Express 5)
│   ├── server.js                   ← entry point (19 שורות)
│   └── server/
│       ├── app.js                  ← express setup + router mounts
│       ├── db/
│       │   ├── pool.js             ← Pool יחיד (DATABASE_URL)
│       │   ├── init.js             ← initDb() — schema only
│       │   └── seed.js             ← seedDb() — initial data
│       ├── routes/                 ← 14 קבצים, 353 routes
│       │   ├── crew.js             ← 16 routes (crew, digits, login, session)
│       │   ├── strips.js           ← 45 routes (strips, aircraft, formations)
│       │   ├── transfers.js        ← 16 routes (transfer flow)
│       │   ├── sectors.js          ← 16 routes (sectors, sub-sectors)
│       │   ├── workstations.js     ← 13 routes (presets, filters)
│       │   ├── maps.js             ← 26 routes (maps, zones, closures)
│       │   ├── blocks.js           ← 15 routes (altitude blocks)
│       │   ├── airfield.js         ← 74 routes (full airfield ops)
│       │   ├── base.js             ← 18 routes (bases, contacts)
│       │   ├── collaboration.js    ← 27 routes (notes, messages, collab)
│       │   ├── admin.js            ← 42 routes (serials, BDH, aids)
│       │   ├── classic.js          ← 15 routes (classic strip tables)
│       │   ├── civilian.js         ← 6 routes (civilian strips)
│       │   └── driver.js           ← 20 routes (vehicle/driver system)
│       └── utils/
│           └── (geo, astar — TODO: extract from driver.js)
│
├── Database (PostgreSQL / Neon)     ← ~50 טבלאות
│   ├── Core: strips, strip_aircraft, strip_aircraft_armaments, _systems
│   ├── Transfers: strip_transfers, sectors, sector_neighbors, sub_sectors
│   ├── Workstations: workstation_presets, crew_members, table_modes
│   ├── Airfield: airfields, airfield_routes, airfield_elements, runways...
│   ├── Collaboration: sticky_notes, work_groups, workstation_collab_state
│   ├── Blocks: block_spaces, block_tables, blocks
│   ├── Zones: map_zones, zone_altitude_ranges, strip_zone_assignments
│   └── Admin: serials, bdh_documents, activity_log
│
└── Desktop (Electron)
    └── electron-main.cjs           ← loads config.json → imports server.js
```

---

## זרימת נתונים — Strip lifecycle

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
│Classic │   │Classic │  ← Classic — משותף לשניהם
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

## DB Schema — יחסי ליבה

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

## חוב טכני — סדר עדיפויות

| # | פריט | סיכון | עדיפות |
|---|------|-------|--------|
| 1 | App.tsx — 41K שורות | HIGH | גבוהה |
| 2 | אין WebSocket | MEDIUM | גבוהה |
| 3 | אין בדיקות | HIGH | גבוהה |
| 4 | auth client-side בלבד | MEDIUM | בינונית |
| 5 | CORS פתוח (cors()) | LOW | נמוכה |
| 6 | initDb = seed מעורבב | LOW | ✅ תוקן |
| 7 | server.js מונוליט | HIGH | ✅ תוקן |

---

## תרשים זרימה — Transfer חלקי (פיצול פ"מ)

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

## מבנה מסך — CTRL (בקר טיסה)

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

## מבנה מסך — TWR (מגדל פיקוח)

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
