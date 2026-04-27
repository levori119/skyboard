# Overview

"SKY KING" (לוח שמיים) is a React TypeScript application designed as a flight strip management system for military aviation. Its primary purpose is to streamline military aviation operations by providing an intuitive, efficient digital platform for managing flight strips. Key capabilities include a drag-and-drop interface, OCR for digit recognition using Tesseract.js, session-based workstation authentication, and real-time collaboration. The system is fully in Hebrew (RTL), optimized for tablet use, and features robust crew member management with different access roles.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Core Design Principles
- **User Interface**: React 18 with TypeScript, optimized for tablet use, featuring a drag-and-drop paradigm.
- **Styling**: Tailwind CSS with custom theming, animations via Framer Motion, and Lucide React icons.
- **Backend**: Node.js with Express 5, implementing a RESTful API.
- **Data Storage**: PostgreSQL as the primary database, utilizing `pgcrypto` for UUID primary keys.

## Key Features and Architectural Decisions
- **Flight Strip Management**: Intuitive drag-and-drop interface with multi-sector workstation support.
- **OCR Integration**: Tesseract.js for digit recognition, with personalized learning per crew member.
- **Crew Member System**: Role-based access control (regular, team lead, admin) and hot-swapping.
- **Session Management**: Client-side storage for workstation and crew context.
- **UI/UX Enhancements**: Light/dark mode, dynamic table views with grouping and sorting, battle zone visualization with polygon overlays.
- **Workstation Load Management**: Visual indicators and thresholds for workstation load.
- **Query-Based Filtering**: Tree-based visual query builder for both admin and personal configurations.
- **Collaborative Tools**: Work groups with shared sticky notes and configurable workstation aids.
- **Serials Management**: Import, display, and association of serials with strips, including outdated serial detection.
- **Altitude Conflict Detection**: Flags potential altitude conflicts between transfers with visual indicators.
- **BDH (Checklist) System**: Team-lead managed checklists with categorized items, assignable to workstations, displayed in a non-modal, draggable panel.
- **Work Group Notes**: Shared, title-and-content notes per work group, editable by a designated "admin workstation".
- **Preset Links**: Configurable, categorized links per workstation preset, accessible via the aids panel.
- **UI Toggles**: Per-preset controls for displaying serials and enabling view switching.
- **Smart Blocks (בלוקים חכמים)**: Altitude range management with block spaces, tables, and blocks. Includes deviation detection and visualization in a mini-view or full block view.
- **GROUND Workstation Mode (מגרש)**: Specialized preset type for ground operations featuring a three-panel layout (strip list, airfield map, transfer sectors) with aircraft status management, density warnings, and whole-strip dragging.
- **Classic Strip Display (תצוגת סטריפים קלאסית)**: An alternative workstation display mode with three vertical panels (Receive, My Strips, Transfer). Supports configurable strip card displays, in-card editing, and enhanced transfer mechanics with dual modes (direct station-to-station and sector-based). Includes an auto-mirroring feature for classic partner links and a live reorder capability for panel sections.

# External Dependencies

## Database
- **PostgreSQL**: Used for all persistent data storage.

## NPM Packages
- `express`: Web server framework.
- `pg`: PostgreSQL client for Node.js.
- `cors`: Middleware for enabling Cross-Origin Resource Sharing.
- `tesseract.js`: Client-side OCR library.
- `framer-motion`: Animation library for React.
- `lucide-react`: Icon library.
- `clsx`, `tailwind-merge`: Utilities for conditionally joining CSS class names.

## Development Tools
- `vite`: Fast build tool and development server.
- `@vitejs/plugin-react`: Vite plugin for React.
- `typescript`: For type-safe JavaScript development.