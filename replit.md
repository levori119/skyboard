# Overview

This is a React TypeScript application built with Vite, designed as a flight strip management system called "SKYBOARD" (לוח שמיים) for military aviation operations. The application features a drag-and-drop interface for managing flight strips (פממים) across different workstations, with OCR capabilities for digit recognition using Tesseract.js.

The system is fully in Hebrew (RTL) and designed for tablet use, with session-based workstation authentication and real-time collaboration features.

## Terminology
- **עמדה (Workstation)**: Defined by name, map, and transfer points (נקודות העברה)
- **נקודת העברה (Transfer Point)**: What was previously called "סקטור" (sector) - geographic/operational areas for aircraft handoff
- **פמם (Strip)**: Flight strip representing an aircraft
- **העברה (Transfer)**: Handoff of a strip between transfer points

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development with HMR (Hot Module Reloading)
- **Styling**: Tailwind CSS with custom CSS variables for theming (dark blue theme)
- **Animation**: Framer Motion for drag-and-drop interactions and smooth animations
- **Icons**: Lucide React for iconography
- **Utilities**: clsx and tailwind-merge for conditional class management

## Backend Architecture
- **Runtime**: Node.js with Express 5
- **API Pattern**: RESTful API served at `/api` endpoint
- **CORS**: Enabled for cross-origin requests
- **Proxy**: Vite dev server proxies `/api` requests to Express server on port 3001

## Data Layer
- **Database**: PostgreSQL via `pg` driver
- **Connection**: Uses `DATABASE_URL` environment variable
- **Extensions**: Uses `pgcrypto` for UUID generation

### Database Schema
- `crew_members` - Personnel with individual handwriting profiles (name, is_admin flag)
- `learned_digits` - OCR training data (digit, image_data, crew_member_id foreign key)
- `sectors` - Geographic/operational sectors (name, Hebrew label, category, notes)
- `sector_neighbors` - Many-to-many relationship for adjacent sectors
- `workstations` - Work positions with UUID primary keys
- `workstation_presets` - Preset configurations (name, map_id, relevant_sectors JSONB array)
- `maps` - Map assets for display in sectors
- `strips` - Flight strips with notes field and sector assignment
- `transfers` - Handoff records between transfer points

## Crew Member System
- Each crew member has their own personalized handwriting recognition database
- Login flow requires selecting crew member before accessing workstation options
- Admin users (is_admin=true) have access to distribution and management features
- Hot-swap capability: change crew member at active workstation without losing display state
- Default admin user "אורי לב" seeded on database initialization
- Handwriting calibration accessible from login screen for each crew member

## Session Management
- Client-side session storage for workstation authentication
- Sessions store workstation ID, name, relevant sectors array, map ID, auth token, and crew member info
- Workstations can have multiple relevant sectors for inter-workstation coordination
- Crew member context persists across session and enables personalized digit recognition

## Key Features
- Drag-and-drop flight strips with touch/tablet optimization
- OCR digit recognition using Tesseract.js
- Multi-sector workstation management
- Battle zone visualization with polygon overlays
- Light/dark mode toggle persisted in localStorage (`bt-lightMode`)
- Table mode grouping/sorting with draggable group rows
- In table mode, transferred strips (`pending_transfer`) remain visible grayed-out with "ממתין ⏳" badge until recipient accepts; only then do they disappear from the sending workstation's table (`myStrips` excludes them from map view; `myTableStrips` includes them for table view)
- Load mode (מוד עומס): per-workstation thresholds (`partial_load`, `full_load`) stored in `workstation_presets`; flashing orange badge for partial load, flashing red for full load; load count = active strips at workstation + pending incoming transfers
- Query-based strip filtering (מנגנון שאילתות): tree-based visual query builder with nested AND/OR/NONE groups and leaf conditions (field + operator + value); two levels: admin-level (`filter_query JSONB` on `workstation_presets`) and personal-level (`workstation_personal_filters` table per crew member per preset); personal filter overrides admin filter; filter applies to BOTH sidebar strip panel AND table mode; workstation_preset_id restriction always applied (filter narrows within own workstation); filter button in workstation header (🔍) opens editor panel with QueryBuilder component; closing the panel (any method: backdrop, ✕, "שמור וסגור") auto-saves the filter; `evaluateQuery()` used to filter `myStrips`/`myTableStrips`; QueryBuilder has no enable/disable toggle — always shows editor, filter active when conditions exist; "נקה סינון" button clears all conditions; Q_FIELDS: `sq` field labeled "טייסת"
- SQ field consolidation: `sq` is the canonical squadron field throughout; `squadron` DB column kept as legacy fallback; all display code uses `s.sq || s.squadron`; table editor saves to `sq`; CSV import maps 'sq'/'SQ'/'סקוודרון'/'squadron'/'טייסת' → `sq`; Q_FIELDS uses `sq` (label='SQ'); `squadron` removed from Q_FIELDS
- `number_of_formation` VARCHAR(50) column on strips; mapped to `numberOfFormation` in frontend; displayed on strip card as `callSign / numberOfFormation`; airborne strips have callSign div filled solid blue (background #1d4ed8); CSV/Excel import supports `NUMBEROFFORMATION`/`numberOfFormation`/`number_of_formation` headers
- Three new strip fields: `erka` VARCHAR(100) (ערכה), `koteret` VARCHAR(200) (כותרת), `mivtza` VARCHAR(100) (מבצע); all exposed in all GET endpoints; `koteret` shown on strip card face (italic purple subtitle); `erka`/`mivtza` editable in expanded panel; all three in creation form, CSV/Excel import mapping, and distribution panel display
- Work Groups (קבוצות עבודה): `work_groups` + `work_group_members` tables; admin tab "קבוצות עבודה" with `WorkGroupsManager` component; groups define which workstations can share sticky notes; API: GET/POST/PUT/DELETE `/api/work-groups`, POST/DELETE `/api/work-groups/:id/members`; GET `/api/workstations/:presetId/work-group-peers` returns all peer workstations in same groups
- Sticky Notes (פתקיות שיתופיות): `sticky_notes` + `sticky_note_recipients` tables; floating draggable colored notes on workstation screen; toolbar button "📝 פתקיות (N)" creates new notes; `StickyNotesLayer` component renders all notes; per-note: title, content textarea, color picker (8 pastel colors), 🔒/🔓 permission toggle (creator only), "הפץ ▶" distribute button sends to peer workstations; minimize/expand; delete with confirmation; hover tooltip shows last editor info; polled every 15 seconds; API: GET/POST/PUT/DELETE `/api/sticky-notes`, POST `/api/sticky-notes/:id/distribute`; position stored per-recipient in `sticky_note_recipients (x, y, minimized)`

# External Dependencies

## Database
- **PostgreSQL**: Primary data store, connected via `DATABASE_URL` environment variable

## NPM Packages (Runtime)
- `express` - Web server framework
- `pg` - PostgreSQL client
- `cors` - Cross-origin resource sharing middleware
- `tesseract.js` - OCR engine for digit recognition
- `framer-motion` - Animation and gesture library
- `lucide-react` - Icon components
- `clsx` / `tailwind-merge` - CSS utility functions

## Development Tools
- `vite` - Build tool and dev server
- `@vitejs/plugin-react` - React plugin for Vite
- `typescript` - Type checking

## Environment Variables Required
- `DATABASE_URL` - PostgreSQL connection string

## Workstation Aids (עזרים לעמדה)
- `aid_groups` table: named collections of aid items (id, name)
- `aid_items` table: individual items in a group (id, group_id, name, type [image/text], content TEXT base64, sort_order)
- `preset_aid_groups` table: links a preset to a group (preset_id PRIMARY KEY, group_id)
- Admin tab "עזרים לעמדה" with `AidsManager` component: create/edit/delete groups and items per preset, duplicate (independent copy) or link (shared group) to other presets
- Workstation view: aids panel displayed to the right of the strips sidebar; collapsible with 📌 pin; accordion items expandable with ▶/▼ triangle; only shows when the preset has an aid group
- Sharing modes: "שכפל" creates independent copies per target preset; "קשר" links same group (shared — updates affect all linked presets)

## Serials (ספרורים)
- `serials` table: stores all imported serials (id, control_station, serial_number, essence, relevant_to, created_at, imported_at)
- `strip_serial_selections` table: maps strips to selected serials per control station (strip_id, control_station, serial_id, dismissed, assigned_at); UNIQUE(strip_id, control_station)
- Admin tab "ספרורים" with `SerialsAdminTab` component: Excel upload (parses in browser via XLSX), displays imported serials grouped by control station, delete all button
- Excel column mapping: תא שליטה→control_station, מספר ספרור→serial_number, מהות ספרור→essence, רלוונטי ל→relevant_to, תאריך ושעה→created_at; replace=true on import
- Strip card: shows selected serial badges per control station (format: "station–number"); flashes red (`.serial-flash`) if outdated (newer serial exists for that station); expanded details panel has serial picker showing all stations with latest serial + select/update/remove buttons
- Map strip container: flashes with `.serial-strip-flash` CSS class if any selected serial is outdated
- Right-click context menu on strip: "ספרור לא רלוונטי לפ"מ" (dismiss all selections); "פ"מ עודכן בספרור" (update all outdated to latest)
- Sidebar strips (both map mode and table mode): compact serial badges with flashing for outdated ones
- Workstation toolbar button: "📡 ספרורים" — shows count badge; flashes red if any selection is outdated
- `SerialsPanelModal`: full-panel overlay showing all serials grouped by control station; filter by station (checkboxes); time filter (click header → show serials from last N hours); first serial per station highlighted in blue
- API: GET/POST(import)/DELETE(all) `/api/serials`; GET/POST(upsert)/DELETE `/api/strip-serial-selections`
- Serials polled every 30 seconds in SectorDashboard

## Altitude Conflict Detection (זיהוי קונפליקט גובה)
- `conflict_alt_delta INTEGER DEFAULT 500` column on `workstation_presets`
- Admin preset form has a new field "⚠️ סף קונפליקט גובה (±רגל)" below full_load
- When outgoing and incoming transfers at the same transfer point have an altitude difference ≤ delta, they are flagged as a conflict
- `DraggableNeighborPanel` receives `conflictAltDelta` prop from SectorDashboard (reads `myPresetConfig.conflict_alt_delta`)
- Conflict visual: panel header turns dark red with a red border + "⚠️ קונפליקט גובה" badge; each conflicting outgoing card goes dark red; `DraggableIncomingTransferMini` receives `isConflict` prop and also turns dark red
- Alt parsing: first integer found in alt string via regex (handles "176", "400-330", etc.)
- Setting delta to 0 disables conflict detection entirely

## Relevant Control Stations per Workstation (תאי שליטה רלוונטיים)
- `relevant_control_stations JSONB` column on `workstation_presets` (nullable array of station name strings)
- Admin preset form: "📡 תאי שליטה רלוונטיים לעמדה" section with toggle buttons per station (loaded from existing serials); "בחר הכל" / "נקה הכל" buttons; if empty → no filter (all stations shown)
- `relevantControlStations` + `relevantSerials` derived in SectorDashboard; if preset has stations defined, serials are filtered to those only
- Toolbar serial flash button: only checks strips in `myStrips`/`myTableStrips` (not all strips globally) and only for relevant stations — fixes flashing at transit workstations
- SerialsPanelModal, Strip map card, table mode serial picker, and sidebar serial badges all use `relevantSerials` instead of full `serials`