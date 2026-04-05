# Overview

This project is a React TypeScript application named "SKY KING" (לוח שמיים), designed as a flight strip management system for military aviation. It provides a drag-and-drop interface for managing flight strips across various workstations, featuring OCR capabilities for digit recognition using Tesseract.js. The system is fully in Hebrew (RTL), optimized for tablet use, and includes session-based workstation authentication and real-time collaboration. Its primary purpose is to streamline military aviation operations by offering an intuitive and efficient digital platform for flight strip management.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with custom theming
- **Animation**: Framer Motion
- **Icons**: Lucide React
- **Utilities**: clsx and tailwind-merge

## Backend
- **Runtime**: Node.js with Express 5
- **API Pattern**: RESTful API (`/api`)
- **CORS**: Enabled

## Data Layer
- **Database**: PostgreSQL with `pg` driver
- **Schema Highlights**: `crew_members`, `learned_digits`, `sectors`, `workstations`, `strips`, `transfers`, `sticky_notes`, `serials`, `strip_serial_selections`, `aid_groups`, `aid_items`
- **UUIDs**: `pgcrypto` for primary keys

## Key Features
- **Flight Strip Management**: Drag-and-drop interface, multi-sector workstation support.
- **OCR**: Tesseract.js for digit recognition, personalized per crew member.
- **Crew Member System**: Three roles — regular, ראש צוות (team lead, limited management access), מנהל (admin, full access). Personalized profiles, hot-swapping.
- **Session Management**: Client-side storage for workstation and crew context.
- **Battle Zone Visualization**: Polygon overlays.
- **UI/UX**: Light/dark mode, tablet optimization, dynamic table view with grouping and sorting.
- **Load Mode**: Workstation load thresholds with visual indicators.
- **Query-Based Filtering**: Tree-based visual query builder (admin and personal levels).
- **New Strip Fields**: `number_of_formation`, `erka`, `koteret`, `mivtza`.
- **Work Groups**: Define workstations for shared sticky notes.
- **Sticky Notes**: Floating, draggable, colored notes with distribution capabilities.
- **Workstation Aids**: Configurable aid items (image/text) linked to presets.
- **Serials Management**: Import and display serials, associate with strips, detect outdated serials. Serials are displayed in table mode and a dedicated panel, with actions for selection and dismissal.
- **Altitude Conflict Detection**: Flags potential conflicts based on altitude differences between incoming/outgoing transfers at a transfer point, visualized with red highlights and badges. Threshold configurable per sector.
- **Relevant Control Stations**: Workstation presets can define relevant control stations, filtering displayed serials accordingly.
- **BDH (בד"ח — ביצוע דרך חירום)**: Checklist document system. Team leads can create/edit BDH documents with name, category, title, and items. Items can be regular checklist entries or section headers (`is_header=true`). Editor shows a compact table-like row per item. BDH docs are assigned to workstations via many-to-many table (`workstation_bdh`). In the workstation aids panel, a "בד"ח" section groups assigned docs by category with search. Opening a BDH shows a floating draggable on-top panel (not full-screen modal) — smaller text, always visible, allows interaction with underlying UI; sections collapse via triangle. DB tables: `bdh_documents`, `bdh_items` (with `is_header` column), `workstation_bdh`.
- **ניהול מדניות (Work Group Notes)**: Per-work-group shared notes. Each work group can have one designated "admin workstation" (עמדת ניהול), set in the work groups manager. Only the admin workstation can create/edit/delete notes for that group; all workstations in the group can view them in the aids panel under "📌 מדניות". Notes have a title and content. DB tables: `work_group_notes`; `work_groups.admin_preset_id` column.
- **קישורים (Preset Links)**: Per-workstation-preset link list. Admins add links (URL, name, category, note) in the preset settings form under "🔗 קישורים". Links appear in the relevant workstation's aids panel as clickable items that open in a new tab, grouped by category. DB table: `preset_links`.
- **Smart Blocks (בלוקים חכמים)**: Altitude range management system. Block spaces group block tables, which contain blocks with altitude ranges (alt_from/alt_to), mission labels, colors, and workstation associations. Strips can be assigned to a block space. Block deviation detection: strips whose altitude falls outside their assigned block range flash orange; acknowledging deviation via right-click turns the flash to a static orange tint. Block tables are visualized per workstation in the distribution view. Block space is also a column in the table view (with dropdown editing). DB tables: `block_spaces`, `block_tables`, `blocks`; strip columns: `block_space_id`, `block_deviation`. Block tables support `note`, `category`, and `updated_at`; blocks support `note` and `updated_at`. Block tables list groups by category with collapse. New blocks auto-pick a maximally-distinct color vs existing blocks in the table. Altitude parsing uses FL-aware `parseAltToFeet` (handles FL330, 330 3-digit, raw feet).
- **Block Mini View**: When the left (transfer points) panel is open and the workstation has exactly 1 block table (or 1 is selected via activeBlockTableId), a narrow 80px "BlockMiniView" column appears between the transfer-points panel and the map area, showing altitude axis, block bands, and strip chips. With multiple block tables, this mini view is hidden; the full "תצוגת בלוקים" (formerly "תצוגה ורטיקאלית") is triggered from the view menu. Block tables in the aids panel are grouped under a collapsible "🗂️ בלוקים" section header.
- **GROUND Workstation Mode (מגרש)**: Preset type `ground` with associated `airfield_id`. Three-panel layout: Right=strip list with per-aircraft cards (click to cycle taxi/lineup/takeoff status, draggable), Center=airfield map with aircraft markers at assigned points (draggable to reassign), Left=transfer sector drop zones. Aircraft positions stored as JSONB `aircraft_positions` on strips. Status values: `none|taxi|lineup|takeoff`. Transfer dialog asks single-aircraft or full strip. Admin "שדות תעופה" tab to create/edit airfields and define named field points (X%/Y% for map positioning). DB tables: `airfields`, `airfield_points`; strip columns: `aircraft_positions`, `ground_status`; preset columns: `preset_type`, `airfield_id`.
- **Classic Strip Display (תצוגת סטריפים קלאסית)**: Alternative workstation display mode replacing the map/table view with 3 equal vertical panels: Right=Receive (📥 ממי מקבל), Center=My Strips (🎯 שלי), Left=Transfer (📤 למי מעביר). Each panel groups strips by configured sector points. Drag strips from Mine→Transfer panel drop zones to initiate transfer; drag from Receive panel→Mine to accept incoming transfer. Strip cards show 3 configurable rows (field, label, font size, color, bold/italic/underline, text align, editability). Configured per workstation preset (`display_mode='classic'`, `classic_strip_table_id`, `classic_receive_points`, `classic_transfer_points` JSONB columns). Strip templates managed in admin "סטריפים קלאסי" tab. DB tables: `classic_strip_tables`, `classic_strip_rows`.

# External Dependencies

## Database
- **PostgreSQL**: Main data store.

## NPM Packages (Frontend/Backend)
- `express`: Web server.
- `pg`: PostgreSQL client.
- `cors`: CORS middleware.
- `tesseract.js`: OCR engine.
- `framer-motion`: Animations.
- `lucide-react`: Icons.
- `clsx`, `tailwind-merge`: CSS utilities.

## Development Tools
- `vite`: Build tool and dev server.
- `@vitejs/plugin-react`: React plugin for Vite.
- `typescript`: Type checking.

## Environment Variables
- `DATABASE_URL`: PostgreSQL connection string.