# AeroZone — Implementation Prompts
## רצף Prompts למימוש המערכת ב-Claude Code / Replit

> **הוראות שימוש:**
> - כל Prompt עצמאי ומוכן להדבקה ישירה ב-Claude Code או Replit AI
> - עבוד לפי הסדר — כל שלב מניח שהשלב הקודם הושלם
> - בסוף כל שלב: בדוק שהקוד עובד לפני שממשיכים
> - Stack: **React 18 + TypeScript** (Frontend) | **Node.js + Fastify** (Backend) | **PostgreSQL + PostGIS** (DB)

---

## 📋 מפת שלבי הפיתוח

```
שלב 1  → Project Setup & Monorepo
שלב 2  → Database Schema (PostgreSQL + PostGIS)
שלב 3  → Backend API — Auth & Users
שלב 4  → Backend API — Airports, Maps, Sectors
שלב 5  → Backend API — Polygons & Elements
שלב 6  → WebSocket Server — Real-time Updates
שלב 7  → Frontend Setup — React + Router + State
שלב 8  → Design System — Components Library
שלב 9  → Map Component — Leaflet + Layers
שלב 10 → S1 Login Screen
שלב 11 → S2 Main Board — Layout & Topbar
שלב 12 → S2 Sidebar & Element List
שלב 13 → S2 Right Panel — Status Updates
שלב 14 → S2 Status Visual System (colors, overlays)
שלב 15 → S3/S4 Sector Focus & Status Table
שלב 16 → S5/S6 Planning Editor
שלב 17 → S7 Display Profile Manager
שלב 18 → S8 System Admin
שלב 19 → S9 Event Log
שלב 20 → Alerts System (UI + Push)
שלב 21 → Camera Integration (RTSP/HLS)
שלב 22 → Weather Integration (METAR)
שלב 23 → Reports & Export (PDF + Excel)
שלב 24 → Mobile PWA
שלב 25 → Polish, Testing & Deployment
```

---

## שלב 1 — Project Setup & Monorepo

```
Create a full-stack monorepo project called "aerozone" with the following structure:

/aerozone
  /apps
    /web          ← React 18 + TypeScript + Vite frontend
    /api          ← Node.js + Fastify backend
  /packages
    /shared       ← shared TypeScript types and constants
  /docker
    docker-compose.yml
  package.json    ← pnpm workspace root

Requirements:
- Package manager: pnpm with workspaces
- Frontend: React 18, TypeScript 5, Vite 5, Tailwind CSS 3
- Backend: Node.js 20, Fastify 4, TypeScript 5
- Shared: TypeScript types package imported by both apps
- Docker Compose: PostgreSQL 16 with PostGIS 3, Redis 7

Create the following shared types in /packages/shared/src/types.ts:
  - Airport (id, icaoCode, name, type: 'military'|'civil'|'mixed', isActive)
  - User (id, username, email, role: 'operator'|'planning'|'admin', airportIds)
  - Polygon (id, airportId, name, type: 'runway'|'taxiway'|'apron'|'area', color, coordinates, parentId?)
  - Element (id, polygonId, name, type: 'barrier'|'lights'|'sign'|'traffic_light'|'camera', position, states)
  - OperationalStatus = 'operational'|'partial'|'closed'|'maintenance'
  - GRFStatus = 'dry'|'slippery'|'wet'
  - VisibilityStatus = { rvr: number, category: 'good'|'reduced'|'low' }
  - StatusUpdate (id, polygonId, updatedBy, timestamp, operational, grf, visibility, note)
  - Alert (id, type: 'info'|'warning'|'critical', message, elementId, timestamp, acknowledged)
  - WSMessage (type, payload) — WebSocket message envelope

Configure ESLint, Prettier, and TypeScript strict mode for both apps.
Add a root Makefile with commands: dev, build, test, db:migrate, db:seed.
```

---

## שלב 2 — Database Schema (PostgreSQL + PostGIS)

```
Create the complete PostgreSQL database schema for the AeroZone airport ground management system.
Use Drizzle ORM with PostgreSQL dialect and PostGIS extension.

Create file: /apps/api/src/db/schema.ts

Tables required:

1. airports
   - id (uuid, primary key)
   - icao_code (varchar 4, unique, not null)
   - name (varchar 100, not null)
   - name_he (varchar 100) ← Hebrew name
   - type (enum: military, civil, mixed)
   - is_active (boolean, default true)
   - grf_threshold_wet (integer, default 3) ← mm of rain
   - rvr_reduced (integer, default 800) ← meters
   - rvr_low (integer, default 400) ← meters
   - created_at, updated_at

2. users
   - id (uuid, primary key)
   - username (varchar 50, unique)
   - email (varchar 255, unique)
   - password_hash (varchar 255)
   - full_name (varchar 100)
   - role (enum: operator, planning, admin)
   - is_active (boolean, default true)
   - last_login (timestamp)
   - created_at, updated_at

3. user_airports (many-to-many)
   - user_id (uuid, fk users)
   - airport_id (uuid, fk airports)
   - primary key (user_id, airport_id)

4. maps
   - id (uuid, primary key)
   - airport_id (uuid, fk airports)
   - name (varchar 100)
   - file_url (text) ← path to image file
   - is_active (boolean, default true)
   - bounds (jsonb) ← { north, south, east, west }
   - created_by (uuid, fk users)
   - created_at, updated_at

5. sectors
   - id (uuid, primary key)
   - map_id (uuid, fk maps)
   - name (varchar 100)
   - name_he (varchar 100)
   - note (text)
   - bounds (jsonb) ← { x, y, width, height } relative to map
   - created_at, updated_at

6. polygons
   - id (uuid, primary key)
   - airport_id (uuid, fk airports)
   - parent_id (uuid, fk polygons, nullable) ← for sub-polygons
   - name (varchar 100, not null)
   - name_he (varchar 100)
   - type (enum: runway, taxiway, apron, area, segment)
   - color (varchar 7) ← hex color
   - note (text)
   - coordinates (geometry(Polygon, 4326)) ← PostGIS
   - sort_order (integer, default 0)
   - created_by (uuid, fk users)
   - created_at, updated_at

7. polygon_status (current status — one row per polygon)
   - polygon_id (uuid, primary key, fk polygons)
   - operational (enum: operational, partial, closed, maintenance, default: operational)
   - grf (enum: dry, slippery, wet, default: dry)
   - rvr (integer, nullable) ← meters
   - visibility_category (enum: good, reduced, low, default: good)
   - updated_by (uuid, fk users)
   - updated_at (timestamp)

8. status_log (append-only history)
   - id (uuid, primary key)
   - polygon_id (uuid, fk polygons)
   - airport_id (uuid, fk airports)
   - operational (enum)
   - grf (enum)
   - rvr (integer, nullable)
   - visibility_category (enum)
   - note (text)
   - updated_by (uuid, fk users)
   - created_at (timestamp, default now)

9. elements
   - id (uuid, primary key)
   - polygon_id (uuid, fk polygons, nullable)
   - airport_id (uuid, fk airports)
   - name (varchar 100)
   - type (enum: barrier, runway_lights, closure, sign, traffic_light_1, traffic_light_2, traffic_light_3, camera)
   - representation (enum: point, line)
   - position (geometry(Point, 4326)) ← for point
   - line_start (geometry(Point, 4326)) ← for line
   - line_end (geometry(Point, 4326)) ← for line
   - note (text)
   - states (jsonb) ← array of { name, icon, color, animation, blinkRate, affectsPolygon }
   - current_state (varchar 50, default: 'default')
   - created_by (uuid, fk users)
   - created_at, updated_at

10. cameras
    - id (uuid, primary key)
    - element_id (uuid, fk elements)
    - stream_url (text)
    - fov_polygon (geometry(Polygon, 4326)) ← field of view
    - ai_enabled (boolean, default false)
    - is_active (boolean, default true)

11. alerts
    - id (uuid, primary key)
    - airport_id (uuid, fk airports)
    - type (enum: info, warning, critical)
    - message (text)
    - element_id (uuid, nullable)
    - polygon_id (uuid, nullable)
    - is_acknowledged (boolean, default false)
    - acknowledged_by (uuid, fk users, nullable)
    - acknowledged_at (timestamp, nullable)
    - created_at (timestamp, default now)

12. display_profiles
    - id (uuid, primary key)
    - airport_id (uuid, fk airports)
    - name (varchar 100)
    - screens (jsonb) ← array of { sectorId, zoom, layers, isFocus }
    - created_by (uuid, fk users)
    - created_at, updated_at

13. alert_rules
    - id (uuid, primary key)
    - airport_id (uuid, fk airports)
    - name (varchar 100)
    - trigger_condition (jsonb) ← { field, operator, value }
    - alert_type (enum: info, warning, critical)
    - send_push (boolean)
    - push_roles (jsonb) ← array of roles
    - is_active (boolean, default true)

Create Drizzle migration files.
Add seed data: 2 airports (LLBG, LLHZ), 3 users (1 per role), basic runways for LLBG.
Create /apps/api/src/db/index.ts with connection pool setup.
```

---

## שלב 3 — Backend API: Auth & Users

```
Build the authentication and user management API endpoints for AeroZone using Fastify + TypeScript.

File structure:
/apps/api/src/
  routes/
    auth.ts
    users.ts
  middleware/
    authenticate.ts   ← JWT verification middleware
    authorize.ts      ← RBAC middleware
  services/
    auth.service.ts
    users.service.ts
  utils/
    jwt.ts
    password.ts

Endpoints to implement:

AUTH (/api/auth):
  POST /login
    body: { username: string, password: string }
    response: { accessToken: string, refreshToken: string, user: UserDTO }
    - verify password with bcrypt
    - issue JWT access token (15 min) + refresh token (7 days)
    - update last_login in DB
    - return user airports list

  POST /refresh
    body: { refreshToken: string }
    response: { accessToken: string }

  POST /logout
    header: Authorization Bearer
    - invalidate refresh token (store in Redis blacklist)

  GET /me
    header: Authorization Bearer
    response: UserDTO with airports

USERS (/api/users) — admin only:
  GET /
    query: { search?, role?, isActive? }
    response: paginated list of users with last login

  POST /
    body: { username, email, password, fullName, role, airportIds[] }
    - hash password, create user, assign airports

  GET /:id
  PUT /:id
    body: { fullName?, role?, airportIds?, isActive? }

  POST /:id/reset-password
    body: { newPassword: string }

  POST /:id/block
  POST /:id/unblock

DTOs (User response, never return password):
  UserDTO { id, username, email, fullName, role, isActive, lastLogin, airports[] }

JWT payload: { userId, role, airportIds[] }

Middleware:
  authenticate: extract + verify JWT, attach user to request
  authorize(roles[]): check request.user.role is in allowed roles
  authorizeAirport: check user has access to the requested airport

Error handling:
  - 401 for invalid/expired token
  - 403 for insufficient permissions
  - 400 for validation errors with field-level messages
  - Use Zod for all input validation

Tests: Write Jest unit tests for auth.service.ts (login success, wrong password, blocked user).
```

---

## שלב 4 — Backend API: Airports, Maps & Sectors

```
Build the airport configuration API for AeroZone. All endpoints require authentication.
Admin-only endpoints are marked.

/apps/api/src/routes/airports.ts
/apps/api/src/routes/maps.ts
/apps/api/src/routes/sectors.ts
/apps/api/src/services/ (corresponding services)

AIRPORTS (/api/airports):
  GET /
    - returns airports the current user has access to
    - admin sees all airports
    response: Airport[]

  POST / [admin only]
    body: { icaoCode, name, nameHe, type, grfThresholdWet?, rvrReduced?, rvrLow? }

  GET /:airportId
  PUT /:airportId [admin only]
  POST /:airportId/activate [admin only]
  POST /:airportId/deactivate [admin only]

MAPS (/api/airports/:airportId/maps):
  GET /
    response: Map[] for this airport

  POST / [planning+]
    Content-Type: multipart/form-data
    body: { name: string, file: File (image/png, image/jpeg, image/tiff, image/svg+xml) }
    - save file to /uploads/maps/{airportId}/{uuid}.ext
    - create map record
    - respond with map including fileUrl

  GET /:mapId
  PUT /:mapId [planning+]
    body: { name?, bounds?, isActive? }

  DELETE /:mapId [planning+]
    - check no active display profiles reference this map

  GET /:mapId/image
    - serve the map image file

SECTORS (/api/airports/:airportId/sectors):
  GET /
    response: Sector[] for this airport's active map

  POST / [planning+]
    body: { mapId, name, nameHe, note, bounds: { x, y, width, height } }

  PUT /:sectorId [planning+]
    body: { name?, nameHe?, note?, bounds? }

  DELETE /:sectorId [planning+]
    - check no display profile references this sector

All list endpoints support:
  - GET ?mapId=xxx to filter by map
  - Ordered by sort_order or name

Validation with Zod schemas.
```

---

## שלב 5 — Backend API: Polygons, Status & Elements

```
Build the core operational API — polygons (runways, taxiways, aprons), their status management,
and fixed elements (barriers, lights, cameras) for AeroZone.

POLYGONS (/api/airports/:airportId/polygons):
  GET /
    query: { parentId? (null = top-level), type?, includeChildren? }
    response: Polygon[] with current status embedded
    - use PostGIS ST_AsGeoJSON to return coordinates as GeoJSON
    - join with polygon_status for current operational/grf/visibility

  POST / [planning+]
    body: {
      parentId?: string,
      name: string,
      nameHe?: string,
      type: PolygonType,
      color: string,
      note?: string,
      coordinates: GeoJSON Polygon geometry
    }
    - use ST_GeomFromGeoJSON to store coordinates
    - auto-create polygon_status row with defaults (operational, dry, good)

  GET /:polygonId
    response: Polygon with status + children[] + recent status_log (last 10)

  PUT /:polygonId [planning+]
    body: { name?, color?, note?, coordinates? }

  DELETE /:polygonId [planning+]
    - check no children exist
    - soft delete (mark deleted_at)

STATUS (/api/airports/:airportId/polygons/:polygonId/status):
  GET /
    response: current PolygonStatus + last 20 log entries

  PUT / [operator+]
    body: {
      operational?: OperationalStatus,
      grf?: GRFStatus,
      rvr?: number,
      visibilityCategory?: VisibilityCategory,
      note?: string
    }
    - validate at least one field provided
    - update polygon_status (upsert)
    - INSERT into status_log
    - emit WebSocket event: { type: 'STATUS_UPDATE', payload: { polygonId, status, updatedBy, timestamp } }
    - evaluate alert_rules and create alerts if triggered
    - return updated status

  GET /history
    query: { from?: date, to?: date, limit?: number }
    response: status_log[] ordered by created_at desc

ELEMENTS (/api/airports/:airportId/elements):
  GET /
    query: { polygonId?, type? }
    response: Element[] with PostGIS coordinates as GeoJSON

  POST / [planning+]
    body: {
      polygonId?: string,
      name: string,
      type: ElementType,
      representation: 'point'|'line',
      position?: GeoJSON Point,   ← if point
      lineStart?: GeoJSON Point,  ← if line
      lineEnd?: GeoJSON Point,
      note?: string,
      states: ElementState[]
    }

  GET /:elementId
  PUT /:elementId [planning+]
  DELETE /:elementId [planning+]

  PUT /:elementId/state [operator+]
    body: { state: string }
    - update element current_state
    - if state has affectsPolygon: trigger polygon status update
    - emit WebSocket event: { type: 'ELEMENT_UPDATE', payload: ... }

CAMERAS (/api/airports/:airportId/cameras):
  GET /           ← list cameras with stream_url
  POST / [planning+]
  PUT /:cameraId [planning+]
  DELETE /:cameraId [planning+]

All responses include proper error handling and Zod validation.
Write integration tests for the status PUT endpoint.
```

---

## שלב 6 — WebSocket Server (Real-time Updates)

```
Implement a WebSocket server for AeroZone using Fastify WebSocket plugin.
Real-time updates must propagate to all connected clients within 1-5 seconds.

Files:
/apps/api/src/
  websocket/
    ws.server.ts      ← WebSocket server setup
    ws.manager.ts     ← connection management
    ws.events.ts      ← event type definitions

ARCHITECTURE:
- WebSocket endpoint: ws://host/ws?token=JWT
- On connect: verify JWT, register client with { userId, role, airportIds[] }
- Store connections in Map<connectionId, ClientInfo>
- Use Redis pub/sub for horizontal scaling (multiple API instances)

CLIENT INFO:
  {
    connectionId: string,
    userId: string,
    role: UserRole,
    airportIds: string[],
    subscribedAirport: string | null,
    socket: WebSocket
  }

INCOMING MESSAGES (client → server):
  { type: 'SUBSCRIBE', payload: { airportId: string } }
    → register client as subscriber for this airport
  { type: 'PING' }
    → respond { type: 'PONG', timestamp }

OUTGOING EVENTS (server → client):
  { type: 'STATUS_UPDATE', payload: {
      polygonId, polygonName,
      operational, grf, rvr, visibilityCategory,
      updatedBy: { id, username },
      timestamp
    }
  }
  { type: 'ELEMENT_UPDATE', payload: { elementId, elementName, currentState, timestamp } }
  { type: 'ALERT', payload: { id, type, message, polygonId?, elementId?, timestamp } }
  { type: 'METAR_UPDATE', payload: { airportId, metar: MetarData, timestamp } }
  { type: 'CONNECTED', payload: { connectionId, serverTime } }

WS MANAGER (ws.manager.ts):
  - broadcast(airportId, event): send event to all subscribers of an airport
  - broadcastToUser(userId, event): send to all connections of a user
  - getStats(): { totalConnections, byAirport: { [airportId]: number } }
  - cleanup(): remove dead connections

HEARTBEAT:
  - Server pings every 30s
  - Client must respond within 10s or connection is terminated

RECONNECTION (handled client-side):
  - Server closes connection with code 4001 for auth failure
  - Server closes with code 4002 for airport not authorized

Export a function broadcastStatusUpdate(airportId, payload) used by the status PUT endpoint.
Export a function broadcastElementUpdate(airportId, payload) used by the element state PUT endpoint.
Export a function broadcastAlert(airportId, alert) used by the alert service.

Add WebSocket connection count to the /api/health endpoint.
```

---

## שלב 7 — Frontend Setup: React + Router + State

```
Set up the React 18 + TypeScript frontend for AeroZone with routing, global state, and WebSocket client.

Files to create in /apps/web/src/:

ROUTING (using React Router v6):
  /                  → redirect to /login if not authenticated, else /board
  /login             → Login screen (S1)
  /board             → Main board (S2) — protected
  /board/:airportId  → Board for specific airport
  /planning          → Planning editor (S5/S6) — planning+ only
  /admin             → System admin (S8) — admin only
  /log               → Event log (S9) — all
  /reports           → Reports (S10) — planning+ only

GLOBAL STATE (Zustand stores):

1. authStore.ts
   state: { user: UserDTO | null, token: string | null, isAuthenticated: boolean }
   actions: login(username, password), logout(), refreshToken()

2. airportStore.ts
   state: {
     airports: Airport[],
     activeAirportId: string | null,
     polygons: Map<string, Polygon>,
     elements: Map<string, Element>,
     polygonStatuses: Map<string, PolygonStatus>
   }
   actions: setActiveAirport(id), loadPolygons(airportId), updatePolygonStatus(update), updateElement(update)

3. alertStore.ts
   state: { alerts: Alert[], unreadCount: number }
   actions: addAlert(alert), acknowledgeAlert(id), markAllRead()

4. uiStore.ts
   state: {
     selectedPolygonId: string | null,
     selectedElementId: string | null,
     mapZoom: number,
     activeLayers: Set<string>,
     theme: 'light'|'gray'|'dark',
     rightPanelOpen: boolean,
     alertPanelOpen: boolean
   }
   actions: selectPolygon(id), selectElement(id), setZoom(n), toggleLayer(name), setTheme(t)

WEBSOCKET CLIENT (src/lib/ws.client.ts):
   class AeroZoneWSClient:
     - connect(airportId: string, token: string)
     - disconnect()
     - on(event: WSEventType, handler: Function)
     - reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
     - connectionStatus: 'connecting'|'connected'|'disconnected'|'error'
     On STATUS_UPDATE: call airportStore.updatePolygonStatus()
     On ELEMENT_UPDATE: call airportStore.updateElement()
     On ALERT: call alertStore.addAlert()

API CLIENT (src/lib/api.client.ts):
   - Axios instance with base URL from env
   - Request interceptor: add Authorization header
   - Response interceptor: on 401 → try refresh token, else redirect to /login

THEME SYSTEM (src/lib/theme.ts):
   CSS variables for 3 themes (light, gray, dark):
   --color-bg, --color-card, --color-border,
   --color-text-primary, --color-text-secondary,
   --color-navy, --color-blue, --color-green, --color-amber, --color-red, --color-purple

   Apply theme class to <html> element.
   Persist theme choice in localStorage.

Environment variables (Vite):
   VITE_API_URL=http://localhost:3000
   VITE_WS_URL=ws://localhost:3000
```

---

## שלב 8 — Design System: Component Library

```
Build the AeroZone design system as reusable React components.
All components must support RTL (Hebrew) as primary direction.
Touch targets: minimum 56×56px. Fonts: Arial.

Create /apps/web/src/components/ui/:

COLOR CONSTANTS (constants/colors.ts):
  export const STATUS_COLORS = {
    operational: '#00A86B',
    partial: '#E8A020',
    closed: '#D43C2C',
    maintenance: '#A040C0',
  }
  export const GRF_COLORS = { dry: '#E8F5E9', slippery: '#FFF9C4', wet: '#BBDEFB' }
  export const VISIBILITY_COLORS = { good: 'transparent', reduced: '#CFD8DC', low: '#90A4AE' }

COMPONENTS TO BUILD:

1. StatusBadge.tsx
   props: { status: OperationalStatus | GRFStatus | VisibilityCategory, size?: 'sm'|'md'|'lg' }
   → colored pill with Hebrew + English label
   → sm: 16px, md: 24px, lg: 32px height

2. StatusButton.tsx
   props: { status: OperationalStatus, isActive: boolean, onClick: () => void, disabled?: boolean }
   → large button (56px height), full width, color = status color
   → active state: solid fill; inactive: outlined
   → includes Hebrew label + English abbreviation

3. ConfirmDialog.tsx
   props: { open: boolean, title: string, description: string, confirmLabel: string, confirmColor: string, onConfirm: () => void, onCancel: () => void }
   → modal, 320px wide, centered
   → ESC = cancel, ENTER = confirm
   → loading state on confirm button

4. MapTooltip.tsx
   props: { name: string, status: OperationalStatus, grf: GRFStatus, rvr?: number }
   → dark background card with status badge
   → shows on hover/focus

5. AlertBell.tsx
   props: { count: number, onClick: () => void }
   → bell icon + red badge with count
   → pulse animation when count > 0

6. AlertPanel.tsx (slide-in panel)
   props: { open: boolean, alerts: Alert[], onAcknowledge: (id: string) => void, onClose: () => void }
   → 380px wide, slides from right, 200ms ease-out
   → groups by type (CRITICAL first)
   → each item: type badge, timestamp, message, "Go to element" button

7. CriticalBanner.tsx
   props: { alert: Alert | null, onAcknowledge: () => void }
   → full-width red banner at top of screen
   → shake animation on mount
   → stays until acknowledged

8. GRFSelector.tsx
   props: { value: GRFStatus, onChange: (v: GRFStatus) => void }
   → 3 buttons: יבש / חלק / רטוב with droplet icons

9. RVRSlider.tsx
   props: { value: number, onChange: (v: number) => void }
   → range input 0-2000m, step 50
   → shows color-coded value label

10. ThemeToggle.tsx
    → cycles through light/gray/dark
    → updates CSS class on <html>

11. Topbar.tsx
    props: { airport: Airport, user: User, metar?: MetarData, wsStatus: string }
    → full layout: logo, airport selector, clocks, METAR, bell, user menu

12. Statusbar.tsx
    props: { rvr: number, grf: GRFStatus, openRunways: number, closedRunways: number, wsStatus: string, username: string }
    → 38px bottom bar, dark navy background

All components:
- Export TypeScript interfaces for props
- Include Storybook stories (optional but preferred)
- Use CSS variables for theming (no hardcoded colors except in constants)
- Support both Hebrew (RTL) and English (LTR) via dir attribute
```

---

## שלב 9 — Map Component (Leaflet + Layers)

```
Build the interactive airport map component for AeroZone using Leaflet.js with React-Leaflet.

File: /apps/web/src/components/map/AeroZoneMap.tsx

LAYER ARCHITECTURE (bottom to top):
  Layer 0 — Raster Base: airport image tile using ImageOverlay
  Layer 1 — Polygons: GeoJSON layer with fill color by status
  Layer 2 — Sub-Polygons: child polygon segments with independent colors
  Layer 3 — Elements: custom marker icons (barrier, lights, signs, cameras)
  Layer 4 — Overlays: GRF wetness effect + visibility fog effect
  Layer 5 — Labels: polygon name labels using DivIcon

MAP COMPONENT PROPS:
  {
    airportId: string,
    mapImageUrl: string,
    mapBounds: LatLngBounds,
    polygons: Polygon[],
    polygonStatuses: Map<string, PolygonStatus>,
    elements: Element[],
    selectedPolygonId: string | null,
    onPolygonClick: (polygon: Polygon) => void,
    onElementClick: (element: Element) => void,
    activeLayers: Set<string>,
    zoom?: number,
    onZoomChange?: (zoom: number) => void,
  }

POLYGON RENDERING:
  - Use react-leaflet GeoJSON layer
  - Style function receives polygon status:
    fillColor = STATUS_COLORS[status.operational]
    fillOpacity = 0.35 (selected: 0.6)
    weight = selected ? 3 : 1
    color = selected ? '#FFFFFF' : STATUS_COLORS[status.operational]
  - On click: call onPolygonClick, highlight with white border
  - On hover: show MapTooltip

GRF OVERLAY (Layer 4a):
  For each polygon with grf !== 'dry':
    - 'slippery': render 1 droplet SVG DivIcon centered on polygon
    - 'wet': render 2-3 droplet SVG DivIcons distributed across polygon
  Use polygon centroid (via turf.js centroid()) for positioning

VISIBILITY OVERLAY (Layer 4b):
  For each polygon with visibility !== 'good':
    - 'reduced': semi-transparent grey rectangle over polygon bounds, opacity 0.3
    - 'low': semi-transparent dark grey, opacity 0.6
  Use L.rectangle with polygon.getBounds()

ELEMENT ICONS (Layer 3):
  Create custom SVG DivIcons for each element type:
    barrier: || symbol, red when closed, green when open
    runway_lights: 💡 symbol, animated blink via CSS if state=blink
    sign: ⚠ symbol
    traffic_light_1: circle, color by state
    traffic_light_2: two circles
    traffic_light_3: three circles
    camera: 📷 symbol, green=active, grey=offline, orange=error
  Icon size: 32x32px, anchor at center
  Blink animation: CSS @keyframes, configurable rate via data attribute

CAMERA FOV POLYGON:
  For cameras with fov_polygon: render as semi-transparent blue polygon (opacity 0.15)

MAP CONTROLS:
  - Custom zoom buttons (not default Leaflet): ZoomControl component, top-left, 60px
  - Reset view button: fit to map bounds
  - Layer toggle panel: show/hide each layer
  - Scale bar: bottom-left

INTERACTIONS:
  - Polygon click → fire onPolygonClick
  - Element click → fire onElementClick
  - Long press (500ms, touch) → show quick status menu (Context Menu component)
  - Double-click polygon → zoom to fit polygon bounds
  - Map drag: standard Leaflet pan

SECTOR FOCUS MODE:
  Props: { focusSector?: Sector }
  When set: fit map to sector bounds + darken areas outside sector (dim overlay)

STATUS CHANGE ANIMATION:
  When a polygon status changes via WebSocket:
    → flash the polygon white twice (300ms each), then settle to new color
    → use a Leaflet custom animation trigger

Dependencies: leaflet, react-leaflet, @turf/turf, leaflet.smooth_marker_bouncing (optional)
```

---

## שלב 10 — S1: מסך כניסה (Login Screen)

```
Build the AeroZone Login screen (S1) as a React page.

File: /apps/web/src/pages/Login.tsx

LAYOUT:
  - Full viewport height
  - Background: dark overlay (#0A0F1E) with CSS grid pattern simulating aerial photo
  - Centered login card: max-width 420px, border-radius 12px, white background, subtle shadow
  - Card header: navy (#1A3A6C) background, "כניסה למערכת / Login" title in white

CARD CONTENT:
  1. Logo area: "AEROZONE" in large bold text (40px, #1A3A6C) + subtitle in Hebrew + English
  2. Username field:
     - Hebrew label: "שם משתמש" right-aligned
     - Input: full width, 44px height, border-radius 6px
     - Placeholder: "username@airport.il"
  3. Password field:
     - Hebrew label: "סיסמה" right-aligned
     - Input: password type with show/hide toggle button (eye icon, 28px)
  4. Login button:
     - Text: "כניסה / Login"
     - Height: 50px, full width, navy background, border-radius 8px
     - Loading spinner state while authenticating
  5. Language toggle: "EN | עב" link at bottom
  6. Version: "v1.0 | © 2026" at very bottom of card

TOP-RIGHT of card:
  - Server connection indicator: green dot + "Connected" / red dot + "Disconnected"
  - Poll /api/health every 5 seconds

BEHAVIOR:
  - ENTER key submits the form
  - On submit: call authStore.login(username, password)
  - Show inline error below fields: "שם משתמש או סיסמה שגויים" (never reveal which)
  - After 5 failed attempts: show CAPTCHA placeholder + 30s lockout message
  - On success:
    - If user has 1 airport + 1 display profile: navigate directly to /board/:airportId
    - Else: show Airport Selection modal (AirportSelectModal component)

AIRPORT SELECTION MODAL:
  - Title: "בחר שדה תעופה"
  - List of user's airports as cards: ICAO code + Hebrew name + status indicator
  - Below: "בחר פרופיל תצוגה" — dropdown of display profiles for selected airport
  - "כניסה" button → navigate to /board/:airportId?profile=:profileId

REMEMBER USERNAME:
  - Checkbox "זכור אותי" → save username to localStorage (not password)
  - Pre-fill on next visit

RTL: all Hebrew text right-aligned, direction=rtl on form.
Responsive: works on tablet (768px+) and large monitor (1920px+).
```

---

## שלב 11 — S2: לוח בקרה ראשי — Layout & Topbar

```
Build the main operational board layout (S2) for AeroZone — the primary working screen.
This screen runs on a 30" 4K touch screen and standard monitors.

File: /apps/web/src/pages/Board.tsx
Layout components in: /apps/web/src/components/board/

MAIN LAYOUT (CSS Grid):
  .board-layout {
    display: grid;
    grid-template-rows: 58px 1fr 38px;  /* topbar, content, statusbar */
    grid-template-columns: 220px 1fr 300px; /* sidebar, map, panel */
    height: 100vh;
    overflow: hidden;
  }
  - Topbar: spans all 3 columns (row 1)
  - Sidebar: column 1, row 2
  - Map: column 2, row 2 (flex grow)
  - Right Panel: column 3, row 2
  - Statusbar: spans all 3 columns (row 3)

TOPBAR (components/board/Topbar.tsx):
  Left section:
    - "AEROZONE" logo text (16px bold, white)
    - "Ground Control" subtitle (9px, #96B4DC)
    - Airport selector dropdown: current ICAO + name, click to change airport
      → shows list of user's airports
      → on change: reload polygons, elements, subscribe to new WebSocket channel

  Center section:
    - UTC clock: "UTC" label (9px) + time "14:32:07" (14px bold, Courier New, white)
    - LOCAL clock: same but local time
    - Update every second using setInterval

  Center-right:
    - METAR widget (MetarWidget component): compact single line
      → shows: temp, wind, visibility, QNH
      → click to expand full METAR modal
      → green freshness indicator, turns red if data > 10 min old

  Right section:
    - Alert bell (AlertBell component) with unread count badge
    - User menu button: username + role
      → dropdown: profile, theme toggle, logout
    - WebSocket status dot (green/yellow/red)

THEME: Topbar always navy (#1A3A6C) regardless of theme setting.

KEYBOARD SHORTCUTS:
  Ctrl+1: focus map
  Ctrl+2: open alert panel
  Ctrl+3: open status table
  Ctrl+S: open sector selector
  Escape: deselect polygon / close panels

AIRPORT LOAD SEQUENCE (on mount and on airport change):
  1. Load airport details
  2. Load active map image URL
  3. Load all polygons + statuses
  4. Load all elements
  5. Connect WebSocket, subscribe to airportId
  6. Load METAR
  7. Load unread alerts

Loading state: centered spinner with "טוען נתוני שדה..." overlay.
Error state: "שגיאה בטעינת נתונים" with retry button.
```

---

## שלב 12 — S2: Sidebar + Status Summary Panel

```
Build the left Sidebar for the AeroZone main board (S2).

File: /apps/web/src/components/board/Sidebar.tsx

SIDEBAR DIMENSIONS: 220px wide, full height between topbar and statusbar.
Background: white, right border: 1px solid #C8CDD8.

TAB BAR (top of sidebar):
  4 tabs with icons:
    ✈ שדות (Airports)
    ◉ אלמנטים (Elements)  
    ◈ סטטוסים (Statuses)
    ⦿ מצלמות (Cameras)
  Active tab: light blue background + left blue border stripe (3px)
  Tab height: 48px

TAB 1 — שדות (Airports):
  List user's airports as cards (compact):
    - colored status dot (green=active, red=has issues)
    - ICAO code (bold) + Hebrew name
    - click: switch active airport
  Active airport: blue border + highlighted background

TAB 2 — אלמנטים (Elements):
  Search input at top (full width)
  Tree view:
    ▶ Runways (count)
       RWY 33R [status dot]
         T1, T2, T3
       RWY 21L [status dot]
    ▶ Taxiways
    ▶ Aprons
    ▶ Elements (fixed)
  Click any item → selectPolygon() → map zooms + right panel opens
  Current selection: blue background

  Layer toggles at bottom (checkboxes):
    ☑ פוליגונים   ☑ אלמנטים   ☑ תוויות   ☑ מצלמות

TAB 3 — סטטוסים (Status Summary):
  Status summary cards:
    Operational status counts:
      ● שמיש (n)     → green badge
      ⚠ שמיש חלקי (n) → amber badge
      ✕ סגור (n)    → red badge
      🔧 שיפוצים (n) → purple badge

    GRF summary:
      💧 יבש / חלק / רטוב (counts)
    
    Visibility:
      ⛅ ראות: current RVR value in large text

  Quick filter: click any status card → filters element list to show only those
  "נקה סינון" link to reset

TAB 4 — מצלמות (Cameras):
  List all cameras for active airport:
    - Camera name + associated polygon
    - Status dot: green=live, grey=offline, orange=error
    - "▶ הפעל" button → opens VideoOverlay component
  Refresh status every 30 seconds via API poll

SWIPE TO CLOSE:
  On touch: swipe left to collapse sidebar to 0px (toggle with hamburger icon in topbar)
  On large screen (>1600px): sidebar always visible

Include ResizeHandle between sidebar and map (drag to resize 180px-300px range).
```

---

## שלב 13 — S2: Right Panel — Status Update

```
Build the Right Panel component for the AeroZone main board.
This panel shows details of the selected polygon and allows status updates.

File: /apps/web/src/components/board/RightPanel.tsx

DIMENSIONS: 300px wide, full height between topbar and statusbar.
Animation: slides in from right (translateX 300px → 0) in 200ms ease-out when a polygon is selected.
Background: white, left border: 1px solid #C8CDD8.

When NO polygon selected:
  Show placeholder: "בחר אלמנט מהמפה לצפייה ועריכה"
  Centered, TEXT_MID color, map pin icon.

When polygon IS selected — show these sections:

HEADER SECTION (navy background, 50px):
  - Polygon name (16px bold, white)
  - Polygon type in English (runway/taxiway/apron) in 10px subtitle

STATUS DISPLAY (read-only, always visible):
  Row 1 — מבצעיות:
    Label (right) + large StatusBadge (32px, left)
  Row 2 — GRF:
    Label + droplet icon(s) + text value
  Row 3 — ראות RVR:
    Label + numeric value in meters + category text

HISTORY (3 rows):
  Each row: timestamp | username | what changed
  Colored by change type
  "ראה הכל →" link → opens log page filtered to this polygon

UPDATE SECTION (below divider):

  Sub-title: "עדכן מבצעיות:"
  4 large buttons, full width, 44px each, 6px gap:
    [+ שמיש OPERATIONAL]     green
    [⚠ שמיש חלקי PARTIAL]   amber
    [✕ סגור CLOSED]          red
    [🔧 שיפוצים MAINTENANCE] purple
  Active status button: solid fill + checkmark icon
  Other buttons: light outline version

  Sub-title: "עדכן GRF:"
  GRFSelector component (3 buttons horizontal)

  Sub-title: "ראות RVR:"
  RVRSlider component (0-2000m)
  Plus 3 quick buttons: טובה | מופחתת | נמוכה

  Note field (textarea, 2 rows, optional):
    Placeholder: "הערה לשינוי (אופציונלי)"

  Save button — only appears when something changed:
    "שמור שינויים" — green, full width
    On click: show ConfirmDialog → on confirm → call PUT /status API → update stores

NOTE FIELD:
  If polygon has saved note: display in italic below status

CAMERA BUTTON (if polygon has associated cameras):
  "📷 הצג מצלמה" blue button
  Opens VideoOverlay for the associated camera

ELEMENT BUTTONS (if polygon has associated elements):
  Small chips showing each element and its current state
  Click → opens element detail sub-panel

REAL-TIME UPDATE:
  When a STATUS_UPDATE WebSocket event arrives for the selected polygon:
  → update status display with flash animation
  → update history list
  → do NOT close the panel

Touch optimization: all buttons 48px+ height, adequate spacing.
```

---

## שלב 14 — Status Visual System

```
Implement the complete visual status system for AeroZone map polygons.

This module handles: polygon coloring, GRF droplets, visibility fog overlay,
status change animations, and element icon animations.

Files:
/apps/web/src/lib/map-styles.ts     ← style calculation functions
/apps/web/src/lib/map-overlays.ts   ← GRF and visibility overlay components
/apps/web/src/lib/map-animations.ts ← status change animations

MAP-STYLES.TS:
  function getPolygonStyle(status: PolygonStatus, isSelected: boolean, isHovered: boolean): L.PathOptions {
    return {
      fillColor: STATUS_COLORS[status.operational],
      fillOpacity: isSelected ? 0.65 : isHovered ? 0.5 : 0.35,
      weight: isSelected ? 3 : 1,
      color: isSelected ? '#FFFFFF' : lighten(STATUS_COLORS[status.operational], 0.3),
      dashArray: status.operational === 'maintenance' ? '8 4' : undefined,
    }
  }

  function getElementIcon(element: Element): L.DivIcon {
    const state = element.states.find(s => s.name === element.currentState)
    const svg = renderElementSVG(element.type, state)
    return L.divIcon({
      html: svg,
      className: `aero-element ${state?.animation === 'blink' ? 'blink-' + state.blinkRate : ''}`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    })
  }

ELEMENT SVG ICONS (inline SVG strings for each type):
  barrier: rectangle with stripes, red X when closed
  runway_lights: row of dots
  sign: yellow diamond
  traffic_light_1/2/3: vertical rectangle with circles
  camera: camera shape with lens circle

CSS ANIMATIONS:
  .blink-fast  { animation: blink 0.5s step-start infinite }
  .blink-medium { animation: blink 1s step-start infinite }
  .blink-slow  { animation: blink 2s step-start infinite }
  @keyframes blink { 50% { opacity: 0.2 } }
  .status-flash { animation: statusFlash 0.6s ease-out }
  @keyframes statusFlash { 0%,100% { opacity: 1 } 50% { opacity: 0; filter: brightness(3) } }

GRF DROPLET OVERLAY:
  React component: GRFOverlay
  Props: { polygons: Polygon[], statuses: Map<string, PolygonStatus> }
  For each polygon with grf !== 'dry':
    - Calculate centroid using @turf/centroid
    - Calculate polygon area using @turf/area
    - Place 1 droplet for slippery, 2-3 droplets for wet (distributed via @turf/random-point)
    - Render as L.Marker with droplet DivIcon

DROPLET SVG:
  <svg width="16" height="22" viewBox="0 0 16 22">
    <path d="M8 0 C8 0 0 10 0 15 A8 8 0 0 0 16 15 C16 10 8 0 8 0Z" fill="#0F6FBF" opacity="0.7"/>
  </svg>

VISIBILITY FOG OVERLAY:
  React component: VisibilityOverlay
  For each polygon with visibility !== 'good':
    - 'reduced': L.rectangle(polygon.getBounds(), { fillColor: '#90A4AE', fillOpacity: 0.25, weight: 0 })
    - 'low': same with fillOpacity 0.55

STATUS CHANGE ANIMATION:
  function animatePolygonStatusChange(leafletLayer: L.GeoJSON, newStatus: OperationalStatus):
    1. Set fillColor to white, fillOpacity 0.9
    2. After 150ms: set fillColor to newStatus color, fillOpacity 0.9
    3. After 300ms: set fillOpacity back to 0.35
    Use leafletLayer.setStyle() calls with setTimeout

SECTOR FOCUS MODE:
  When a sector is "focused":
  - Apply dark overlay (rgba 0,0,0,0.5) over entire map
  - Then clear that overlay for polygons WITHIN the sector bounds
  - Draw a bright green dashed border around the sector
  Implementation: L.rectangle for full map bounds + L.rectangle with clip path
```

---

## שלב 15 — S3/S4: Sector Focus & Status Table

```
Build the Sector Focus window (S3) and the Status Table panel (S4) for AeroZone.

S3 — SECTOR FOCUS (SectorFocusWindow.tsx):
  A floating window that shows a zoomed-in view of a specific sector.

  Props: { sector: Sector, onClose: () => void }

  Behavior:
  - Rendered as an absolutely positioned div over the map: width 600px, height 450px
  - Draggable (react-draggable or CSS drag)
  - Resizable handle at bottom-right corner
  - Contains a full AeroZoneMap instance with:
    → mapBounds fitted to sector bounds
    → all layers active
    → same polygon/element data as main map
  - Sector highlight: bright green dashed border around the sector
  - Header bar: sector name + close button
  - Can open multiple instances simultaneously (different sectors)
  - Each instance has its own zoom state

  Trigger: clicking a sector in the Sidebar (Tab 1 or Tab 2 tree view).
  When selected sector changes in main map: update focus window map view.

S4 — STATUS TABLE (StatusTable.tsx):
  A collapsible panel showing ALL polygons and their status.

  Position: floating window, default position bottom-right, width 800px, height 400px.
  Trigger: Ctrl+3 keyboard shortcut or button in Sidebar.

  SEARCH & FILTER BAR (top of table):
    - Text search: filters by polygon name
    - Status filter chips: [הכל] [שמיש] [בעיות] — "בעיות" = closed + partial
    - GRF filter: [הכל] [רטוב] [חלק]

  TABLE COLUMNS:
    שם | סוג | מבצעיות | GRF | ראות | עדכון אחרון | מעדכן
    - All columns sortable (click header to sort asc/desc)
    - Status column: colored StatusBadge component
    - GRF column: droplet icon(s)
    - Visibility column: fog icon + value in meters

  ROW BEHAVIOR:
    - Click row → select polygon in main map (map pans/zooms to it) + opens right panel
    - Row background: light red for 'closed', light amber for 'partial', white otherwise
    - Rows auto-update when WebSocket STATUS_UPDATE events arrive
    - New status flashes (highlight row briefly)

  REAL-TIME: table data comes from airportStore.polygonStatuses (Zustand)
  — updates automatically when store updates

  EXPORT:
    "📄 ייצוא PDF" button → calls GET /api/airports/:id/reports/current-status → downloads PDF
    "📊 Excel" button → same endpoint with format=xlsx

  PAGINATION: virtual scrolling for airports with 100+ polygons (react-virtual)
```

---

## שלב 16 — S5/S6: Planning Editor

```
Build the Planning Editor screen for AeroZone — used by Planning Officers to define
all airport spatial elements: runways, sectors, fixed elements, cameras, and display profiles.

This is a complex multi-step editor. Run ONLY on desktop (not touch screens as primary mode).

File: /apps/web/src/pages/Planning.tsx
Components: /apps/web/src/components/planning/

PLANNING MODE ACTIVATION:
  - "מצב תכנון" button in Topbar (visible only for planning+ roles)
  - On click: navigate to /planning?airport=:airportId
  - Show amber "✏ מצב תכנון PLANNING" badge in Topbar
  - Save/Cancel buttons in Topbar replace other controls

LAYOUT:
  - Topbar (same as board, but with Save/Cancel)
  - Tool bar (52px, below topbar): drawing tools
  - Left panel (260px): element tree navigator
  - Map area (center): editable map
  - Right panel (260px): properties form

TOOLBAR TOOLS (ToolBar.tsx):
  [בחר] [פוליגון] [ריבוע] [קו] [נקודה] [עריכה] | [ביטול] [חזרה]
  Active tool: blue background
  Keyboard: P=polygon, R=rectangle, L=line, N=point, V=select, E=edit, Z=undo, Y=redo

LEFT PANEL — Tree Navigator (PlanningTree.tsx):
  Sections:
    📂 מפות → loaded maps list
    📂 סקטורים → sector list
    📂 מסלולים → runway polygons tree
    📂 מסלולי הסעה → taxiway tree
    📂 רחבות → aprons
    📂 אלמנטים קבועים → elements list
    📂 מצלמות → cameras
    📂 פרופילי תצוגה → display profiles
  Click item → highlight on map + load in properties panel
  "+" button per section → creates new item

MAP — Drawing Mode (using Leaflet.draw or custom):
  Polygon tool:
    - Click to add vertices, double-click to close
    - Show vertex count and area in bottom status bar
    - "snap to grid" toggle: snaps to 10m increments
    - Undo last vertex: Backspace key
  Rectangle tool:
    - Click and drag
  Line tool:
    - Click two points
  Point tool:
    - Single click to place
  Edit mode:
    - Click existing polygon → show vertex handles (draggable circles)
    - Drag vertices to reshape
    - Right-click vertex → delete vertex option

PROPERTIES PANEL — form changes based on selected item type:

  FOR POLYGONS (PolygonProperties.tsx):
    Fields: שם, שם ICAO, סוג (dropdown), צבע (color picker), הערה
    "הוסף מקטע": creates child polygon inside current polygon
    Sub-polygon list with edit/delete per item
    Element states: list with + button to add state
      Each state: name, icon selector, color picker, animation dropdown, affects-polygon dropdown

  FOR ELEMENTS (ElementProperties.tsx):
    Fields: שם, סוג, שיוך לפוליגון, הערה
    Representation: point / line radio
    States editor (multi-state config table):
      | שם מצב | צבע | אנימציה | קצב | פעולה על פוליגון |

  FOR CAMERAS (CameraProperties.tsx):
    Fields: שם, URL Stream, תיאור, AI enabled toggle
    Draw FOV button → activates polygon drawing mode for field of view

  FOR SECTORS (SectorProperties.tsx):
    Fields: שם, שם עברי, הערה
    Draw button → activates rectangle drawing mode

  FOR DISPLAY PROFILES (DisplayProfileEditor.tsx):
    Profile name field
    Number of screens: 1-6 selector
    For each screen: sector dropdown + zoom level + visible layers checkboxes
    Drag to reorder screens
    "סמן כמרכזי": primary screen flag

SAVE FLOW:
  "שמור" button → validate all changes → call API batch update → show success toast → navigate back to /board

UNDO/REDO:
  Maintain a history stack (max 50 steps) using immer
  Ctrl+Z / Ctrl+Y to navigate

MAP UPLOAD (tab within left panel for מפות section):
  File drop zone: drag & drop PNG/GeoTIFF/SVG
  Name input + upload button → POST /api/airports/:id/maps
  On success: load image as map base layer
```

---

## שלב 17 — S8: System Admin

```
Build the System Admin screen (S8) for AeroZone — accessible by admin role only.

File: /apps/web/src/pages/Admin.tsx
Components: /apps/web/src/components/admin/

LAYOUT:
  - Topbar with "⚙ ניהול מערכת ADMIN" red badge
  - Left nav (220px): section list
  - Main content area (remaining width)
  - Right slide-in panel: detail/edit form (300px)

LEFT NAVIGATION SECTIONS:
  👥 ניהול משתמשים (Users)
  ✈ שדות תעופה (Airports)
  📋 פרמטרים (Parameters)
  🔔 כללי התראה (Alert Rules)
  📄 לוג מערכת (System Log)
  📊 דוחות (Reports link)
  Active section: blue left border + light blue background

SECTION 1 — ניהול משתמשים (UserManagement.tsx):
  Table: שם משתמש | אימייל | תפקיד | שדות גישה | כניסה אחרונה | סטטוס | פעולות
  - Search input + role filter + status filter
  - Status badge: green=פעיל, red=חסום
  - Actions: edit (pencil), block/unblock (circle-slash)
  - Pagination: 10 rows per page

  Click edit → opens right panel with UserEditForm:
    Fields: שם מלא, אימייל, תפקיד (dropdown), שדות גישה (multi-select chips), סיסמה (reset only)
    Airport access chips: toggle each airport ON/OFF
    Save + block buttons

  "+ משתמש חדש" button → opens UserCreateForm in right panel:
    Fields: שם משתמש, שם מלא, אימייל, סיסמה זמנית, תפקיד, שדות גישה

SECTION 2 — שדות תעופה (AirportManagement.tsx):
  Table: ICAO | שם | שם עברי | סוג | מפה פעילה | סטטוס | פעולות
  "+ שדה חדש" → AirportCreateForm:
    Fields: קוד ICAO (4 chars uppercase), שם, שם עברי, סוג, ערכי GRF/RVR
  Edit → same form pre-filled
  Activate/Deactivate toggle

SECTION 3 — פרמטרים (ParametersManagement.tsx):
  Two sub-tabs: מצבי מבצעיות | GRF & ראות

  Operational statuses table: שם | שם עברי | צבע | סדר | פעולות
  "+" to add custom status (admin can extend beyond the 4 defaults)
  Drag rows to reorder
  Color picker for each

  GRF/Visibility table: similarly editable

  Export/Import JSON: "ייצוא מקרא" → downloads JSON | "ייבוא" → file upload

SECTION 4 — כללי התראה (AlertRulesManagement.tsx):
  Table: שם | תנאי | סוג התראה | Push | פעיל
  "+" → AlertRuleForm:
    שם הכלל
    תנאי: [שדה ▼] [פעולה ▼] [ערך]
      Fields: operational, grf, rvr
      Operators: equals, less_than, greater_than, changes_to
    סוג התראה: INFO | WARNING | CRITICAL
    שלח Push: checkbox
    לאיזה תפקיד: multi-select roles

SECTION 5 — לוג מערכת (SystemLog.tsx):
  Full-width table (no right panel):
    זמן | שדה | אלמנט | פעולה | ערך חדש | מבצע | חומרה
  Filters: airport, user, date range, action type, severity
  Color coding: red=critical, amber=warning, blue=info
  Export to CSV button
  Infinite scroll or pagination (50 rows per page)
```

---

## שלב 18 — Alerts System (Full Implementation)

```
Implement the complete Alerts system for AeroZone — from backend rule evaluation
to UI display and mobile push notifications.

BACKEND — Alert Service (/apps/api/src/services/alert.service.ts):

  function evaluateAlertRules(airportId: string, triggerContext: {
    polygonId?: string, elementId?: string, 
    newOperational?: OperationalStatus, newGrf?: GRFStatus, newRvr?: number
  }):
    1. Load active alert_rules for this airport from DB
    2. For each rule, evaluate condition:
       - rule.trigger_condition = { field: 'operational', operator: 'equals', value: 'closed' }
       - match against triggerContext
    3. If condition met:
       - INSERT into alerts table
       - broadcastAlert(airportId, alert)
       - if rule.sendPush: call sendPushNotification(rule.pushRoles, alert)

  function sendPushNotification(roles: string[], alert: Alert):
    - Query users with those roles who have push subscriptions
    - Use web-push library to send notification
    - Payload: { title: alert.type.toUpperCase(), body: alert.message, data: { alertId, polygonId } }
    - Store push_subscriptions in a new table:
      push_subscriptions (userId, endpoint, p256dh, auth, createdAt)

  API endpoints for push:
    POST /api/push/subscribe — save subscription from browser
    DELETE /api/push/unsubscribe

FRONTEND — Alert State Management:
  alertStore.ts (Zustand):
    state: { alerts: Alert[], unreadCount: number, criticalAlert: Alert | null }
    On WS ALERT event: addAlert(alert), increment unreadCount
    If alert.type === 'critical': set criticalAlert
    acknowledgeAlert(id): PUT /api/alerts/:id/acknowledge, update local state

FRONTEND — Alert UI Components:

  CriticalBanner (always on top, z-index 9999):
    - Renders if criticalAlert !== null
    - Full width, red background, 52px height
    - Content: ⚠ type | message | timestamp | "✓ אישור טיפול" button
    - Entrance: slide down from top, 250ms + shake animation (translateX ±5px, 3 times)
    - Click "אישור": call acknowledgeAlert(), clear criticalAlert

  AlertPanel (slide-in from right):
    - Opens when bell clicked or Ctrl+2
    - Width: 380px, full height
    - Header: "התראות (n)" + "נקה הכל" button
    - Filter tabs: הכל | קריטי | אזהרה | מידע
    - List of alerts, newest first
    - Each item:
        - Color-coded left border by type
        - Type badge + timestamp
        - Message text
        - "עבור לאלמנט" link (if elementId/polygonId)
        - "✕" to mark as read
    - Empty state: "אין התראות פעילות 🎉"

  AlertBell:
    - Badge count: animated scale-up when count increases
    - Pulse ring animation when unread > 0
    - Count resets visually after opening panel

MOBILE PUSH (PWA Service Worker):
  /apps/web/public/sw.js (Service Worker):
    - Register for push events
    - On push event: show notification with icon, title, body
    - On notification click: open the app at /board?highlight=:polygonId

  /apps/web/src/lib/push.ts:
    - requestNotificationPermission()
    - subscribeToNotifications(): call navigator.serviceWorker + POST /api/push/subscribe
    - Show "מאפשר התראות?" prompt once after login

Alert settings page (within Admin Section 4):
  Per-user preferences: user can set which alert types trigger push on their device.
```

---

## שלב 19 — Camera Integration (Video Overlay)

```
Build the camera video integration for AeroZone — displaying CCTV streams within the map interface.

BACKEND:
  The backend does NOT proxy video streams — it only provides stream URLs.
  Cameras serve RTSP streams → converted to HLS by an nginx-rtmp server (configured in docker-compose).

  GET /api/airports/:airportId/cameras
    returns: Camera[] with { id, name, streamUrl (HLS .m3u8), position, fovPolygon, isActive, elementId }

  WebSocket event CAMERA_STATUS: { cameraId, status: 'active'|'offline'|'error' }
    - Emitted when camera heartbeat fails or recovers (checked every 30s)

FRONTEND — VideoOverlay Component:
  File: /apps/web/src/components/camera/VideoOverlay.tsx
  Uses: hls.js for HLS stream playback

  Props: { camera: Camera, onClose: () => void, defaultPosition?: { x, y } }

  WINDOW FEATURES:
    - Draggable: use @use-gesture/react or react-draggable
    - Resizable: drag bottom-right corner handle (min: 320x180, max: 960x540)
    - Default size: 480×270px (16:9)
    - Default position: bottom-right of map area
    - z-index: 1000 (above map, below modals)
    - Multiple instances allowed (different cameras simultaneously)

  WINDOW HEADER (32px, dark background):
    - Camera name + associated polygon name
    - 🔴 LIVE indicator (pulsing red dot + "LIVE" text)
    - Buttons: [⛶ fullscreen] [— minimize] [✕ close]

  VIDEO AREA:
    <video> element managed by hls.js
    On load: Hls.isSupported() ? use HLS.js : use native HLS (Safari)
    Loading spinner while buffering
    Error state: "שגיאת חיבור — לחץ לנסות שוב" with retry button

  FULLSCREEN MODE:
    - Click ⛶ → expand to full screen (requestFullscreen API)
    - ESC → return to windowed
    - Show camera name + timestamp overlay in fullscreen

  MINIMIZE:
    - Collapses to 200x30px (just the header bar)
    - Click header to restore

CAMERA ON MAP:
  Camera icon (Layer 3): show camera SVG icon at camera position
  FOV polygon (Layer 4): semi-transparent blue polygon showing field of view
  Click camera icon → open VideoOverlay for that camera

CAMERA LIST (Sidebar Tab 4 — מצלמות):
  Each camera row: name | status dot | "▶ הפעל" button
  Status auto-updates via WebSocket CAMERA_STATUS events
  "הפעל כולן" button → opens VideoOverlay for all active cameras

CAMERA FIELD OF VIEW on map:
  Render fovPolygon as L.GeoJSON layer:
  { fillColor: '#0F6FBF', fillOpacity: 0.12, weight: 1, color: '#64B5F6', dashArray: '4 4' }

AI DETECTION PLACEHOLDER (future):
  If camera.aiEnabled:
    - Camera icon pulses with amber glow when AI event detected
    - WS event: CAMERA_AI_DETECTION { cameraId, objectType, confidence }
    - Auto-open VideoOverlay if confidence > 0.85 and user setting allows
```

---

## שלב 20 — Weather Integration (METAR)

```
Build the METAR weather integration for AeroZone.

BACKEND — METAR Service (/apps/api/src/services/metar.service.ts):

  Data source: avwx.rest API (free tier) OR NOAA Aviation Weather API
  Fallback: parse raw METAR strings manually

  function fetchMETAR(icaoCode: string): Promise<ParsedMETAR>
    - GET https://avwx.rest/api/metar/{icao}?token={API_KEY}
    - Parse and return structured data

  ParsedMETAR type:
    {
      icaoCode: string,
      rawText: string,
      observationTime: Date,
      temperature: number,     // Celsius
      dewpoint: number,
      windDirection: number,   // degrees
      windSpeed: number,       // knots
      windGust?: number,
      visibility: number,      // km
      rvr?: { runway: string, distance: number }[],
      clouds: { coverage: 'FEW'|'SCT'|'BKN'|'OVC', base: number }[],
      qnh: number,             // hPa
      phenomena: string[],     // RA, SN, FG, etc.
      isCavok: boolean,
      flightCategory: 'VFR'|'MVFR'|'IFR'|'LIFR'
    }

  Schedule: fetch METAR every 10 minutes per airport using setInterval
  Cache in Redis with 10-minute TTL
  On new METAR: broadcastToAirport(airportId, { type: 'METAR_UPDATE', payload: parsedMETAR })

  Suggestion engine:
    function getStatusSuggestions(metar: ParsedMETAR): StatusSuggestion[]
      - If phenomena includes 'RA' or 'SN': suggest GRF = 'wet'
      - If phenomena includes 'FG': suggest visibility = 'low'
      - If visibility < 0.4km: suggest RVR low
      - If isCavok: suggest visibility = 'good'
    Returns: { field: 'grf'|'visibility', suggestedValue: string, reason: string }[]

  API endpoints:
    GET /api/airports/:airportId/metar → current parsed METAR
    GET /api/airports/:airportId/metar/raw → raw string
    GET /api/airports/:airportId/metar/suggestions → status suggestions

FRONTEND — METAR Display:

  MetarWidget.tsx (compact, in Topbar):
    Shows: temp | wind dir/speed | vis | QNH
    Color: flight category badge (green=VFR, blue=MVFR, red=IFR, purple=LIFR)
    Freshness: green dot if < 10 min old, red if older
    Click → opens MetarModal

  MetarModal.tsx (full details popup):
    Raw METAR string at top (monospace, copyable)
    Parsed sections with Hebrew labels:
      טמפרטורה: 22°C / נקודת טל: 14°C
      רוח: 270° / 12kts (max gusts: 18kts)
      ראות: 8km
      RVR: מסלול 33R → 600m
      עננות: SCT030 BKN080
      QNH: 1013 hPa
      תופעות: RA (גשם)
    Wind direction arrow SVG
    Last updated timestamp

  Status Suggestions Banner (appears in RightPanel when suggestions exist):
    Yellow banner: "💡 על בסיס METAR, מומלץ לעדכן: GRF → רטוב"
    Buttons: "עדכן" (applies suggestion to selected polygon) | "התעלם"
    User must always confirm — never auto-update

  METAR on Map:
    Wind arrow: large directional arrow at top of map (Layer 5)
    Direction = wind direction, rotates in real-time
    Optional: visibility shading toggle (Layer 4) — grey overlay intensity by RVR
```

---

## שלב 21 — Reports & Export

```
Build the Reports and data export system for AeroZone.

BACKEND — Report Service (/apps/api/src/services/report.service.ts):
  Use pdfkit for PDF generation, exceljs for Excel.

  Report types:
    1. current-status: all polygons + current status (snapshot)
    2. daily-log: all status_log entries for a date
    3. element-history: status_log for a specific polygon, date range
    4. incidents: all CRITICAL alerts in date range
    5. user-activity: all actions by a user

  function generatePDF(reportType, params): Buffer
    Header: AeroZone logo (text) + airport name + report type + date range
    Footer: page numbers + "מסמך רגיש — לשימוש פנימי" + generated by user
    Content: tables formatted with pdfkit table helper
    Direction: RTL text using pdfkit Arabic shaping (use bidi-js for RTL)

  function generateExcel(reportType, params): Buffer
    Use ExcelJS workbook
    Header row with navy background, white text
    Data rows with alternating colors
    Column widths auto-fitted
    Sheet name = report type + date

  API Endpoints:
    GET /api/reports?type=:type&airportId=:id&from=:date&to=:date&format=pdf|xlsx
    → streams file download with appropriate Content-Disposition header

FRONTEND — Reports Page (S10):
  File: /apps/web/src/pages/Reports.tsx

  Layout: form on left (400px) + preview panel on right

  FORM:
    1. סוג דוח: radio buttons for 5 report types (with description)
    2. שדה תעופה: dropdown (user's airports)
    3. If applicable — אלמנט ספציפי: polygon search-select
    4. If applicable — משתמש: user search-select (admin only)
    5. טווח תאריכים: DateRangePicker
       Quick shortcuts: היום | שבוע אחרון | חודש אחרון | 3 חודשים
    6. פורמט: [PDF] [Excel] [CSV] radio

  PREVIEW SECTION:
    "תצוגה מקדימה" button → GET report with ?preview=true (returns JSON summary)
    Shows: total records count, date range, affected polygons, brief summary stats

  DOWNLOAD BUTTONS:
    "הורד PDF" → GET /api/reports?format=pdf → browser download
    "הורד Excel" → GET /api/reports?format=xlsx → browser download

  RECENT REPORTS:
    Table of last 10 report downloads for this user:
    סוג | שדה | תקופה | הורד ב | פעולה (הורד שוב)

QUICK EXPORT from StatusTable (S4):
  "📄 ייצוא PDF" button → calls /api/reports?type=current-status&format=pdf
  "📊 Excel" → same with format=xlsx
  Downloads immediately, no preview

EVENT LOG PAGE (S9):
  Separate from Reports — real-time log view
  File: /apps/web/src/pages/EventLog.tsx

  Table: זמן | שדה | אלמנט | פעולה | ערך חדש | מעדכן | חומרה
  Filters: airport, user, date range, polygon, severity
  Real-time: new entries prepend via WebSocket STATUS_UPDATE/ELEMENT_UPDATE events
  Color rows: red=critical, amber=warning
  Export CSV: "ייצוא CSV" with current filters
  Infinite scroll: load 50 rows at a time, load more on scroll bottom
```

---

## שלב 22 — Multi-Airport & Display Profiles

```
Implement multi-airport support and display profile management for AeroZone.
Users with access to 2-5 airports must be able to switch between them seamlessly.

AIRPORT SWITCHING:
  AirportSwitcher component (in Topbar):
    - Click current airport name → dropdown with all user airports
    - Each airport: ICAO code + Hebrew name + status indicator (green/amber/red)
    - Click to switch: clear current data → load new airport → reconnect WebSocket
    - Keyboard: Alt+1, Alt+2... to switch airports directly

  During switch loading:
    - Show loading overlay over map only (topbar stays)
    - "טוען שדה {icao}..." message
    - Do NOT clear right panel until new data loads

DISPLAY PROFILES:
  A display profile = saved window/screen layout for the board.

  ProfileSelector modal (shown on first login and accessible from user menu):
    Title: "בחר פרופיל תצוגה"
    Cards for each profile: name + screen count icon
    "ברירת מחדל" badge for default profile
    Click → apply profile → navigate to /board

  Applying a profile:
    profiles.screens = [
      { sectorId: 'NW', zoom: 3, layers: ['polygons', 'elements'], isFocus: false },
      { sectorId: 'C', zoom: 4, layers: ['polygons', 'labels'], isFocus: true }
    ]
    → For each screen: open in a new browser window/tab at /board/sector/:sectorId
    → Main window keeps full board (S2)
    → Additional windows show focused sector views (S3 variant)

  Multi-window sync:
    Use BroadcastChannel API to sync between windows:
      When polygon selected in main: broadcast { type: 'POLYGON_SELECTED', polygonId }
      Other windows highlight same polygon
      When status updates: broadcast { type: 'STATUS_UPDATE', ... }
    Fallback: all windows share same WebSocket connection to server

  Profile editor in Planning (S5 → tab: פרופילי תצוגה):
    Visual editor: drag-and-drop screen tiles
    Screen tile: shows sector name + zoom level
    Configure each screen: sector dropdown, zoom 1-5, visible layers checkboxes
    Mark one screen as "מרכזי" (focus)
    Save → POST /api/airports/:id/display-profiles

MULTIPLE AIRPORTS DASHBOARD (Admin view):
  /admin/overview — admin only
  Grid of airport cards: ICAO | name | active issues count | last update
  Color coding: green=all good, amber=warnings, red=critical issues
  Click airport → navigate to /board/:airportId
```

---

## שלב 23 — Performance, Accessibility & Polish

```
Optimize AeroZone for production: performance, accessibility, and UX polish.

PERFORMANCE:

  Map optimization:
    - Use Leaflet canvas renderer instead of SVG for 50+ polygons:
      L.canvas({ padding: 0.5 }) as renderer option
    - Cluster elements at low zoom levels using leaflet.markercluster
    - Lazy-load camera FOV polygons (only when camera layer is active)

  Data loading:
    - Implement React Query (TanStack Query) for all API calls:
      → automatic caching, background refetch, optimistic updates
    - Optimistic UI for status updates: update local state immediately,
      revert if API call fails
    - Preload adjacent airport data in background

  WebSocket efficiency:
    - Debounce rapid status updates (50ms debounce before updating map)
    - Only re-render map layers if the changed polygon is visible in viewport
    - Use React.memo on all expensive components (AeroZoneMap, StatusTable row)

  Code splitting:
    - Lazy load all route components with React.lazy + Suspense
    - Split vendor chunks: leaflet, hls.js, exceljs in separate chunks

ACCESSIBILITY:

  WCAG AA compliance:
    - All text: minimum contrast ratio 4.5:1 (use axe-core to validate)
    - All interactive elements: visible focus indicator (2px blue outline)
    - Keyboard navigation: Tab through all interactive elements
    - ARIA labels on all icon-only buttons
    - Status badges: use aria-label not just color (e.g., aria-label="סגור")
    - Map: aria-label="מפת שדה תעופה אינטרקטיבית — השתמש בחצים לניווט"
    - Alert banner: role="alert" aria-live="assertive"

  Screen reader support:
    - Announce WebSocket status updates via aria-live region (polite)
    - StatusTable: proper <table> semantics with scope attributes
    - Modal dialogs: focus trap + return focus on close

RTL POLISH:
  - Verify all components with direction="rtl"
  - Fix any Leaflet controls that don't auto-flip
  - Ensure all padding/margin are using logical properties (margin-inline-start vs margin-left)
  - Test Hebrew font rendering on Windows (Arial fallback chain)

TOUCH OPTIMIZATION:
  - Test all interactions on iPad (768px+)
  - Verify 56px touch targets for all status buttons
  - Long-press context menu: verify 500ms delay feels right
  - Pinch-zoom: test on actual touch device

LOADING STATES:
  - Skeleton screens for: polygon list, status table, user table
  - Use react-loading-skeleton library
  - Shimmer animation matching component shapes

ERROR BOUNDARIES:
  - Wrap map component in ErrorBoundary
  - Wrap right panel in ErrorBoundary
  - Error state: friendly Hebrew message + "נסה שוב" button

TOAST NOTIFICATIONS:
  Use react-hot-toast for success/error feedback:
  - Status update success: "✓ {polygonName} עודכן ל-{status}"
  - Status update error: "✕ שגיאה בעדכון — נסה שוב"
  - WebSocket reconnected: "🔗 חיבור שוחזר"
  - Position: bottom-right, RTL direction
```

---

## שלב 24 — Deployment & DevOps

```
Configure AeroZone for production deployment.

DOCKER SETUP:
  Update /docker/docker-compose.yml for production:

  Services:
    postgres:
      image: postgis/postgis:16-3.4
      volumes: postgres_data:/var/lib/postgresql/data
      environment: POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
      healthcheck: pg_isready

    redis:
      image: redis:7-alpine
      volumes: redis_data:/data
      command: redis-server --appendonly yes

    api:
      build: ./apps/api
      Dockerfile with multi-stage build:
        Stage 1 (builder): npm ci + tsc build
        Stage 2 (runner): node:20-alpine + copy dist
      environment: DATABASE_URL, REDIS_URL, JWT_SECRET, PORT=3000
      depends_on: postgres, redis
      healthcheck: wget /api/health

    web:
      build: ./apps/web
      Dockerfile:
        Stage 1: node:20 + npm ci + vite build
        Stage 2: nginx:alpine + copy dist to /usr/share/nginx/html
      nginx.conf: SPA routing (try_files $uri /index.html)
      environment: VITE_API_URL, VITE_WS_URL

    nginx (reverse proxy):
      image: nginx:alpine
      Ports: 80:80, 443:443
      Config: proxy_pass /api → api:3000, / → web:80
      WebSocket: proxy_http_version 1.1, proxy_set_header Upgrade

    nginx-rtmp (camera streams):
      image: alfg/nginx-rtmp
      Ports: 1935 (RTMP in), 8080 (HLS out)
      config: convert RTSP to HLS

ENVIRONMENT FILES:
  .env.production:
    DATABASE_URL=postgresql://user:pass@postgres:5432/aerozone
    REDIS_URL=redis://redis:6379
    JWT_SECRET=<32+ char random string>
    JWT_REFRESH_SECRET=<different 32+ char string>
    METAR_API_KEY=<avwx.rest key>
    VAPID_PUBLIC_KEY=<for push notifications>
    VAPID_PRIVATE_KEY=<for push notifications>
    UPLOAD_DIR=/uploads

DEPLOYMENT COMMANDS:
  Makefile targets:
    make build         → docker compose build
    make up            → docker compose up -d
    make db:migrate    → docker exec api npm run db:migrate
    make db:seed       → docker exec api npm run db:seed
    make logs          → docker compose logs -f
    make backup-db     → pg_dump to /backups/$(date +%Y%m%d).sql

HEALTH CHECKS:
  GET /api/health returns:
    { status: 'ok', db: 'connected', redis: 'connected', wsConnections: n, uptime: n }
  Monitor with: curl -f http://localhost/api/health || exit 1

REPLIT SPECIFIC:
  If deploying on Replit:
  - Use Replit's built-in PostgreSQL (Database tab) — note: no PostGIS
    → Alternative: Use Neon.tech PostgreSQL with PostGIS extension
  - Use Replit Secrets for environment variables
  - Add replit.nix with: pkgs.nodejs_20 pkgs.postgresql
  - .replit file:
      run = "make up"
      [nix] channel = "stable-23_11"
  - For WebSockets: Replit supports WS on the same port

CLAUDE CODE SPECIFIC:
  Use Claude Code to run:
    /init          → initialize project (runs npm install, db:migrate, db:seed)
    /dev           → starts all services in dev mode
    /test          → runs full test suite
  Add CLAUDE.md with project context for Claude Code assistant.
```

---

## 📌 סדר הגיוני לביצוע ב-Replit

```
1. העתק Prompt שלב 1 → צור את המבנה הבסיסי
2. העתק Prompt שלב 2 → הגדר את ה-DB Schema
3. בדוק שה-DB רץ ו-migrations עובדים
4. שלב 3 → Auth API (אמת שהלוגין עובד עם curl)
5. שלב 4+5 → שאר ה-API
6. שלב 6 → WebSocket (בדוק עם wscat)
7. שלב 7 → Frontend setup
8. שלב 8 → Design System (בדוק כל component בבידוד)
9. שלב 9 → Map (הכי קריטי — קדש לו זמן)
10. שלב 10-13 → מסכים ראשיים
11. שלב 14-15 → Status visuals + tables
12. שלב 16-17 → Planning + Admin
13. שלב 18-21 → Features נוספים
14. שלב 22-23 → Multi-airport + Polish
15. שלב 24 → Deploy
```

---

*AeroZone Implementation Prompts v1.0 | 25 שלבים | מאי 2026*
