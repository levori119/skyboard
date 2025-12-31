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
- `learned_digits` - Stores OCR training data (digit, image_data, timestamp)
- `sectors` - Geographic/operational sectors (name, Hebrew label, category, notes)
- `sector_neighbors` - Many-to-many relationship for adjacent sectors
- `workstations` - Work positions with UUID primary keys
- `workstation_presets` - Preset configurations (name, map_id, relevant_sectors JSONB array)
- `maps` - Map assets for display in sectors

## Session Management
- Client-side session storage for workstation authentication
- Sessions store workstation ID, name, relevant sectors array, map ID, and auth token
- Workstations can have multiple relevant sectors for inter-workstation coordination
- No persistent server-side session storage observed

## Key Features
- Drag-and-drop flight strips with touch/tablet optimization
- OCR digit recognition using Tesseract.js
- Multi-sector workstation management
- Battle zone visualization with polygon overlays

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