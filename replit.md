# Overview

This project is a React TypeScript application named "SKYBOARD" (לוח שמיים), designed as a flight strip management system for military aviation. It provides a drag-and-drop interface for managing flight strips across various workstations, featuring OCR capabilities for digit recognition using Tesseract.js. The system is fully in Hebrew (RTL), optimized for tablet use, and includes session-based workstation authentication and real-time collaboration. Its primary purpose is to streamline military aviation operations by offering an intuitive and efficient digital platform for flight strip management.

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
- **Crew Member System**: Personalized profiles, admin roles, hot-swapping.
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