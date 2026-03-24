# Overview

This is a React TypeScript application built with Vite, designed as a flight strip management system called "BLUE TORCH" (לפיד כחול) for military aviation operations. The application features a drag-and-drop interface for managing flight strips (פממים) across different workstations, with OCR capabilities for digit recognition using Tesseract.js.

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
- Query-based strip filtering (מנגנון שאילתות): tree-based visual query builder with nested AND/OR/NONE groups and leaf conditions (field + operator + value); two levels: admin-level (`filter_query JSONB` on `workstation_presets`) and personal-level (`workstation_personal_filters` table per crew member per preset); personal filter overrides admin filter; when active, replaces distribution-based `workstation_preset_id` assignment; filter button in workstation header (🔍) opens editor panel with QueryBuilder component; `evaluateQuery()` used to filter `myStrips`/`myTableStrips`
- SQ field consolidation: `sq` is the canonical squadron field throughout; `squadron` DB column kept as legacy fallback; all display code uses `s.sq || s.squadron`; table editor saves to `sq`; CSV import maps 'sq'/'SQ'/'סקוודרון'/'squadron'/'טייסת' → `sq`; Q_FIELDS uses `sq` (label='SQ'); `squadron` removed from Q_FIELDS
- `number_of_formation` VARCHAR(50) column on strips; mapped to `numberOfFormation` in frontend; displayed on strip card as `callSign / numberOfFormation`; airborne strips have callSign div filled solid blue (background #1d4ed8); CSV/Excel import supports `NUMBEROFFORMATION`/`numberOfFormation`/`number_of_formation` headers
- Three new strip fields: `erka` VARCHAR(100) (ערכה), `koteret` VARCHAR(200) (כותרת), `mivtza` VARCHAR(100) (מבצע); all exposed in all GET endpoints; `koteret` shown on strip card face (italic purple subtitle); `erka`/`mivtza` editable in expanded panel; all three in creation form, CSV/Excel import mapping, and distribution panel display

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