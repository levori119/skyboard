# SKY KING — User Stories by Topic (English)

> This document lists all User Stories for the SKY KING flight strip management system, organized by topic and component. Written from a product manager perspective. Updated: June 2026.

---

## 1. Workstation Login & Authentication (WorkstationLogin)

- **US-01** — As an admin/operator, I want to select a workstation from a list so the system loads the correct configuration for my station.
- **US-02** — As a user, I want to authenticate with a name and password against the crew member list so the system knows who is operating the station.
- **US-03** — As an operator, I want the session to persist after a page refresh so I don't have to log in again every time.
- **US-04** — As a user, I want to perform a "hot swap" of crew members without losing the current screen state.
- **US-05** — As an admin, I want the system to allow direct entry to the management screen after authenticating as an admin.
- **US-06** — As an admin/team lead, I want to access the management screen with role-appropriate permissions (admin / team_lead).
- **US-07** — As a user, I want to log out of the station and return to the login screen with a single click.
- **US-08** — As an operator, I want to see my name and the station name at all times in the screen header.

---

## 2. Strip Management (Strip Component)

- **US-09** — As an operator, I want to see a strip card with all flight strip fields (callsign, squadron, altitude, mission, aircraft count, etc.) so I have all details at hand.
- **US-10** — As an operator, I want to edit strip fields directly on the card (including altitude, notes, takeoff time) without leaving the working screen.
- **US-11** — As an operator, I want to drag a strip on the map to a new position to track the flight's location.
- **US-12** — As an operator, I want to right-click a strip to get a context menu with quick actions (transfer, change altitude, delete, etc.).
- **US-13** — As an operator, I want to mark a flight as "airborne" with a single click to track flight status.
- **US-14** — As an operator, I want to see a clear visual indicator when a strip's altitude conflicts with another strip.
- **US-15** — As an operator, I want to add free-form notes to a strip (both typed and handwritten) to record information not covered by standard fields.
- **US-16** — As an operator, I want to see a thumbnail of handwriting saved in a strip's note field.
- **US-17** — As a user, I want the strip to automatically flag a past takeoff time in red so I know a flight is overdue.
- **US-18** — As an operator, I want to see the block altitude highlighted if the strip deviates from its assigned block.
- **US-19** — As an operator, I want to change a strip's altitude through a dedicated dialog that includes selection from available blocks.
- **US-20** — As a user, I want the strip to show a Shakadia indicator (🌰) when at least one aircraft in the formation has an active Shakadia system.
- **US-21** — As an operator, I want to see an armament summary (🚀) in the strip header to know at a glance what weapons the formation is carrying.

---

## 3. Transfer System

### Outgoing Transfer Card (OutgoingTransferCard)
- **US-22** — As an operator, I want to see the status of an outgoing transfer (pending, rejected, altitude conflict) to track what happened to it.
- **US-23** — As an operator, I want to cancel an outgoing transfer that hasn't been accepted yet to free the strip.
- **US-24** — As an operator, I want to edit a strip's altitude/note directly from the transfer card without cancelling it.
- **US-25** — As a user, I want to get a visual indication (red) when a transfer has an altitude conflict with other transfers.
- **US-26** — As a user, I want an alert when a transfer's altitude exceeds the station's defined altitude threshold.

### Incoming Transfer Card (IncomingTransferCard)
- **US-27** — As an operator, I want to receive a visual alert for an incoming transfer with a countdown timer so I don't miss it.
- **US-28** — As an operator, I want to accept an incoming transfer with a single click to add it to my map.
- **US-29** — As an operator, I want to reject an incoming transfer with a reason to return it to the sending station.
- **US-30** — As an operator, I want to accept a transfer directly to the map (Accept to Map) at a specific location without opening a dialog.
- **US-31** — As an operator, I want to send a reply to the sending station from the incoming transfer card.

### Transfer Point Panel (DraggableNeighborPanel)
- **US-32** — As an operator, I want to see a draggable panel with "outgoing" and "incoming" columns for each transfer point to manage both directions.
- **US-33** — As an operator, I want to drag a strip from the map directly to the transfer panel to send a transfer quickly.
- **US-34** — As a user, I want the transfer panel to show altitude conflicts between sent strips.

### Partial Transfer (TransferFormModal)
- **US-35** — As an operator, I want to select which aircraft in the formation to transfer (partial transfer) to split a large formation.
- **US-36** — As an operator, I want to set an ETA (arrival time in minutes) when sending a transfer to inform the receiving station.
- **US-37** — As a user, I want to receive an automatic warning when a transfer's altitude may violate a defined min/max.

### Direct Station-to-Station Transfer
- **US-38** — As an operator, I want to send a flight directly to another workstation (station-to-station) in addition to sector-based transfers.

---

## 4. Views & Layout

### Vertical View (VerticalView)
- **US-39** — As an operator, I want to see strips arranged on a time axis (takeoff / ZMM) to prioritize work.
- **US-40** — As an operator, I want to group strips by Erka, heading, operation, or block space.
- **US-41** — As an operator, I want to switch between sorting by takeoff time and sorting by ZMM with a single click.
- **US-42** — As a user, I want to see strip cards with altitude conflicts highlighted in color.
- **US-43** — As an operator, I want to update a strip's altitude directly from the vertical table view.
- **US-44** — As a user, I want to receive an altitude range suggestion (suggestAltRange) for a strip based on active blocks.

### Table View
- **US-45** — As an operator, I want to switch between map view and table view with a button click.
- **US-46** — As a user, I want to sort table columns as needed (by callsign, altitude, takeoff time, etc.).
- **US-47** — As an operator, I want to drag a strip row from the table directly onto the map.
- **US-48** — As a user, I want to group table rows by Erka, operation, heading, or status.
- **US-49** — As an admin, I want to define different table modes (TableModesManager) — columns, grouping, sorting — and save them as presets for a station.
- **US-50** — As an operator, I want to edit a strip field directly in a table cell (inline edit), including with handwriting.

### Classic View (ClassicView)
- **US-51** — As an operator, I want to work with three columns (Receive / Mine / Send) in classic strip-management style.
- **US-52** — As a user, I want to drag strip cards between columns to change status.
- **US-53** — As a user, I want to configure which fields appear on a classic strip card (ClassicStripCard).
- **US-54** — As a user, I want to reorder panels in the classic view by dragging (Live Reorder).
- **US-55** — As an admin, I want to define "partner links" between classic stations so strips sent from one arrive directly in the partner's receive column.
- **US-56** — As an admin, I want to define classic transfer points (classic_transfer_points) for a station to appear in the send column.

### Ground View (GroundView)
- **US-57** — As a ground operator, I want to see a three-panel layout: strip list, airfield map, transfer sectors.
- **US-58** — As a ground operator, I want to create a new flight directly from the station (+ PMM) with callsign, squadron, and aircraft count.
- **US-59** — As a ground operator, I want to collapse/expand strip cards to save space in the panel.
- **US-60** — As a ground operator, I want to drag a full strip onto the airfield map to physically place it.
- **US-61** — As a ground operator, I want to drag a single aircraft from a formation to a different map position.
- **US-62** — As a ground operator, I want to see a density warning when too many aircraft are placed in one area.
- **US-63** — As a ground operator, I want to manage air-defense status (MAZ status) and change it from the interface.

### Civilian View (CivilianView)
- **US-64** — As an operator, I want to manage civilian strips (ATC/GA) in a Kanban board with defined columns.
- **US-65** — As an admin, I want to define custom columns for the civilian view, including a color for each column.
- **US-66** — As an operator, I want to drag a civilian strip card between columns to change its stage.
- **US-67** — As an admin, I want to manage and import civilian strips from the management screen.

---

## 5. Map & Markers

- **US-68** — As an operator, I want to see an airfield map with zoom and pan capabilities.
- **US-69** — As an operator, I want to drag a flight marker (DraggableMapMarker) anywhere on the map.
- **US-70** — As a user, I want to see "transfer point" markers on the map and drag strips onto them for quick transfers.
- **US-71** — As an admin, I want to configure the position of transfer points on the map (Draggable Marker) and save them per station.
- **US-72** — As a user, I want to see connection lines between transferred strips (fzShowLines) for visual representation.
- **US-73** — As an operator, I want to draw freely on the map with a pen/mouse (freehand, FreehandCanvas) to mark things in real time.
- **US-74** — As a user, I want to save and load hand-drawn annotations on the map.
- **US-75** — As an operator, I want to draw geometric shapes (circle, rectangle) on the map.

---

## 6. Maps Management (MapsManager)

- **US-76** — As an admin, I want to upload a map image (PNG/JPEG/PDF) and assign it to a station.
- **US-77** — As an admin, I want to rename a map and delete maps that are no longer in use.
- **US-78** — As an admin, I want to open the map zone editor directly from the map list.

---

## 7. Map Zones (MapZoneEditor)

- **US-79** — As an admin, I want to draw a polygon on the map to define a classified flight zone (airspace).
- **US-80** — As an admin, I want to give each zone a name and color for quick visual identification.
- **US-81** — As an admin, I want to define altitude ranges within a zone, including FL min/max and a level name.
- **US-82** — As an admin, I want to edit and delete an existing polygon on the map.
- **US-83** — As an admin, I want to enable automatic zone detection from a map image (AI auto-detect zones).

---

## 8. Flight Zones Mode

- **US-84** — As an operator, I want to drag a flight from the side list and drop it onto a zone on the map to assign it to that zone.
- **US-85** — As an operator, I want to select an altitude range and status (en route / in zone / leaving zone) in the assignment dialog.
- **US-86** — As a user, I want to receive an automatic alert when two flights are assigned to the same zone + same altitude range (conflict).
- **US-87** — As an operator, I want to mark two flights as "coordinated" to resolve a zone conflict.
- **US-88** — As an operator, I want to drag an existing pin on the map to a new position within a zone.
- **US-89** — As an operator, I want all assignments to update in real time (polling every 5 seconds).
- **US-90** — As an operator, I want to split a formation (✂) and assign each part to a different zone.
- **US-91** — As an operator, I want to see a flight list grouped by zone in the right panel.
- **US-92** — As an operator, I want to collapse/expand a zone group in the side panel.
- **US-93** — As an operator, I want to drag flights on the flight zones map using a pen or touch (touch & pen support).
- **US-94** — As an operator, I want to drag a flight from the list directly onto a transfer marker on the map to trigger an automatic transfer.

---

## 9. Smart Blocks (Altitude Block Management)

- **US-95** — As an operator, I want to see a "mini view" of altitude blocks on the side to visualize altitude distribution among flights.
- **US-96** — As an admin, I want to define Block Spaces, block tables, and specific blocks with altitude ranges.
- **US-97** — As an operator, I want to open a full Block View by clicking.
- **US-98** — As a user, I want to receive an alert (deviation) when a strip's altitude deviates from its assigned block.
- **US-99** — As an admin, I want to draw blocks visually (BlockVisualPainter) on an altitude-time axis.
- **US-100** — As an operator, I want to temporarily mute block alerts when the situation is known.
- **US-101** — As a user, I want to see the relevant block space marked next to the strip in the vertical view.
- **US-102** — As an admin, I want to assign a block table to a specific workstation.

---

## 10. OCR & Handwriting Recognition (HandwritingOverlay, LearnDigitsOverlay)

- **US-103** — As an operator, I want to open a drawing canvas on an altitude field and write digits with a pen so the system recognizes them automatically (OCR).
- **US-104** — As a user, I want the system to automatically recognize the digits I wrote and fill the field after an 800ms delay.
- **US-105** — As an operator, I want to confirm or reject the recognized value before it's entered into the field.
- **US-106** — As a crew member, I want to teach the system my handwriting for digits 0–9 (LearnDigitsOverlay) to improve accuracy.
- **US-107** — As a user, I want to see a count of the training samples I saved, per crew member.
- **US-108** — As a user, I want to clear all my training samples and start fresh.
- **US-109** — As an admin, I want to enable handwriting input on defined fields (handwriting / both) on the strip card.

---

## 11. Voice Recognition

- **US-110** — As an operator, I want to press a microphone button (🎤) and issue a voice command to update a flight's altitude.
- **US-111** — As an operator, I want to say "Hanit 400" and have the system identify the flight and update its altitude to 400.
- **US-112** — As an operator, I want to say "Hanit 300 to 400" and have the system recognize an altitude range.
- **US-113** — As an operator, I want to say "Hanit to Charlie" and have the system send a transfer directly to the sector.
- **US-114** — As an operator, I want to say "Hanit to north zone" and have the system assign the flight to the map zone.
- **US-115** — As a user, I want to see an overlay with the voice command result (success / failure) for visual confirmation.
- **US-116** — As a user, I want the system to recognize numbers in Hebrew (three hundred, four hundred) and in digits.
- **US-117** — As an operator, I want to say "Hanit to north zone" to receive an incoming transfer and assign it to a zone in one action.

---

## 12. Workstation & Preset Management

- **US-118** — As an admin, I want to create, edit, and delete workstation presets.
- **US-119** — As an admin, I want to choose the station type (map / table / classic / ground / flight-zones / civilian).
- **US-120** — As an admin, I want to define a minimum and maximum altitude range per station (presetAltMin/Max) for deviation detection.
- **US-121** — As an admin, I want to configure serial display and view-switching capability per preset.
- **US-122** — As an admin, I want to assign a specific map to a station.
- **US-123** — As an admin, I want to configure transfer points (sectorIds) for a station.
- **US-124** — As an admin, I want to define an "admin workstation" for a work group.
- **US-125** — As an admin, I want to enable flight zones mode (flight_zones_mode) on a map-based station preset.
- **US-126** — As an admin, I want to control whether strips are grouped by base (Erka) in the table view.

---

## 13. Query-Based Filtering (Query Builder)

- **US-127** — As an admin, I want to build a filter query for a station (Query Builder) with multiple conditions (AND / OR / NOT).
- **US-128** — As an admin, I want to filter strips by fields such as: callsign, squadron, altitude, Erka, operation, status, and creating station.
- **US-129** — As an operator, I want to open a "personal filter" panel and change conditions that apply only to the current session (⚡ Apply to Session).
- **US-130** — As a user, I want the personal query to start from what the admin defined, and to be editable without saving.
- **US-131** — As an admin, I want to save a query and configure it for a station preset.

---

## 14. Serials Management

- **US-132** — As an admin, I want to import serials from a CSV/Excel document and save them in the system.
- **US-133** — As a user, I want to associate a serial with a specific strip and see it on the card.
- **US-134** — As a user, I want to receive a visual alert (flash) when the serial associated with a strip becomes outdated.
- **US-135** — As an admin, I want to manage serials in a dedicated screen (SerialsAdminTab) with an undo option.
- **US-136** — As an operator, I want to open a serials panel (SerialsPanelModal) for a consolidated view.
- **US-137** — As a user, I want to dismiss an outdated serial indicator for a specific strip.

---

## 15. Base Status Management

- **US-138** — As an admin, I want to manage base status entities (name, code, air-defense status, absorption status, bird status).
- **US-139** — As an admin, I want to import base statuses from CSV/Excel.
- **US-140** — As an admin, I want to assign specific bases to a station (base_status_ids) and decide whether to display them.
- **US-141** — As an operator, I want to see a collapsible base status panel on the right side of the station.
- **US-142** — As a user, I want to filter bases by relevance (All / Combat-Transport / Helicopters-UAV).

---

## 16. Workstation Contacts

- **US-143** — As an admin, I want to define default communication channels for each station (frequency, device, purpose, callsign).
- **US-144** — As a user, I want contacts to load into the session upon entering a station and be editable temporarily.
- **US-145** — As an operator, I want to see a "📡 Contacts" panel on the right side and edit rows inline.
- **US-146** — As an operator, I want to open a "summary" — a draggable window centralizing all contacts for related stations.
- **US-147** — As an admin, I want to manage contacts for multiple stations simultaneously (multi-preset UI).
- **US-148** — As a user, I want contact edits to save automatically when I leave a field (auto-save on blur).

---

## 17. BDH — Checklists

- **US-149** — As a team lead, I want to create a categorized BDH (checklist) and assign it to stations.
- **US-150** — As a team lead, I want to add, edit, and delete items in the checklist.
- **US-151** — As an operator, I want to open a draggable BDH panel on the station screen and mark items as "done."
- **US-152** — As an operator, I want to reset all BDH marks with a single click.
- **US-153** — As a user, I want the panel to remain open/closed even after navigation.

---

## 18. Sticky Notes (StickyNotesLayer)

- **US-154** — As an operator, I want to create a digital sticky note on the station screen with free-form text.
- **US-155** — As a user, I want to choose a color for the note and place it anywhere on the screen.
- **US-156** — As a user, I want to drag notes from place to place.
- **US-157** — As a user, I want to delete a note that's no longer needed.
- **US-158** — As a user, I want notes to persist per preset and work group.

---

## 19. Work Group Notes

- **US-159** — As a map admin, I want to create shared notes with a title and content accessible to all work group members.
- **US-160** — As a user, I want to see group notes updating in real time.
- **US-161** — As a map admin, I want to edit and delete group notes.

---

## 20. Work Groups Management (WorkGroupsManager)

- **US-162** — As an admin, I want to create work groups and assign stations to each group.
- **US-163** — As an admin, I want to define an "admin station" for a group to manage notes.
- **US-164** — As an admin, I want to configure an undo duration for management actions.

---

## 21. Workstation Aids (AidsManager)

- **US-165** — As an admin, I want to define categorized links for each station (preset links).
- **US-166** — As a user, I want to open an aids panel with categorized links and navigate to work pages with a click.
- **US-167** — As an admin, I want to arrange and tag links with visual categories.

---

## 22. Crew Member Management

- **US-168** — As an admin, I want to add, edit, and delete crew members with name and role.
- **US-169** — As an admin, I want to assign a role to each crew member: regular / team lead / admin.
- **US-170** — As a user, I want to perform an operator "hot swap" between crew members without resetting the session.
- **US-171** — As an admin, I want to see how many OCR training samples each crew member has saved.

---

## 23. Formation Management (Ground Mode)

- **US-172** — As a ground operator, I want to see a separate row for each aircraft in the formation with a numbered callsign, DATK, and KIPA.
- **US-173** — As an operator, I want to edit DATK and KIPA per aircraft directly in the row — with auto-save (debounce 600ms).
- **US-174** — As an operator, I want to cycle each aircraft's status with a button click.
- **US-175** — As an operator, I want to drag a single aircraft to a different position on the map.
- **US-176** — As an operator, I want to open the "Formation Panel" (📋) for a full summary of the entire formation.
- **US-177** — As an operator, I want to edit formation-level fields: "Original PMM callsign" (parent_callsign) and "General PMM note" (formation_notes).

---

## 24. Armaments & Systems

- **US-178** — As a ground operator, I want to open an armaments editor (🚀) per aircraft and add/edit/delete rows.
- **US-179** — As a ground operator, I want to open a systems editor (⚙) per aircraft with system name and status (Operational / Partial / Non-operational).
- **US-180** — As a user, I want to see an armament summary (name × quantity) on the collapsed strip card.
- **US-181** — As a user, I want the Shakadia indicator (🌰) to appear automatically when a Shakadia system with Operational status is defined.
- **US-182** — As an admin, I want to manage default lists of armament and system names (DefaultNamesManager) — used for autocomplete.
- **US-183** — As a user, I want to see Shakadia + armament summaries on strip cards outside the ground station (SectorDashboard table view).

---

## 25. Atmospheric Pressure Display

- **US-184** — As an operator, I want to click the pressure label in the station header bar and enter an inHg value.
- **US-185** — As a user, I want to see the current pressure in both units (inHg + mbar) simultaneously.
- **US-186** — As a user, I want the pressure to be stored for the session only (not persisted to DB).

---

## 26. Debriefing & Activity Log

- **US-187** — As an admin, I want every significant action (transfer sent/accepted/rejected, strip created/deleted) logged automatically.
- **US-188** — As an admin, I want altitude conflicts to be flagged as severity=critical (red) in the log.
- **US-189** — As an admin, I want transitions to a fully-overloaded station to be flagged as severity=warning (orange).
- **US-190** — As an admin, I want to filter the debriefing log by event type, date range, station, and crew member.
- **US-191** — As an admin, I want to see log rows with color coding by severity.
- **US-192** — As an admin, I want to clear the activity log with a click (reset for a new exercise).

---

## 27. Admin Dashboard (ManagementPage / AdminDashboard)

- **US-193** — As an admin, I want to see a dashboard with statistics: number of stations, active strips, transfers, deviations.
- **US-194** — As an admin, I want to manage custom strip fields — name, type, options, and editability.
- **US-195** — As an admin, I want to manage the strip window layout (StripWindowAdmin) and save layouts per preset.
- **US-196** — As an admin, I want to manage the Grid Card layout (StripGridEditor) for strip cards in table view.
- **US-197** — As an admin, I want to manage "closures" (ClosuresManager) — scheduled events blocking airspace areas.
- **US-198** — As an admin, I want to access tabs for: strips, stations, crew, maps, work groups, serials, debriefing, BDH, contacts, base statuses, aids, armaments, table modes, queries, custom fields, strip window, closures.
- **US-199** — As an admin, I want to see only tabs relevant to my role (team_lead vs admin).

---

## 28. Strip Window Layout Builder (StripWindowAdmin / SW Builder)

- **US-200** — As an admin, I want to visually build the strip "window layout": zones, rows, fields.
- **US-201** — As an admin, I want to choose from ready-made templates for window layouts.
- **US-202** — As an admin, I want to split cells vertically/horizontally and resize fields.
- **US-203** — As an admin, I want to assign a specific field to each cell in the layout (field-cell mapping).
- **US-204** — As an admin, I want to save the layout and assign it to a preset.

---

## 29. Grid Card for Table View (StripGridEditor)

- **US-205** — As an admin, I want to build a grid layout for strip cards in the table — columns, rows, fields.
- **US-206** — As an admin, I want to assign the grid to a specific Table Mode.
- **US-207** — As an admin, I want to define display conditions for a field: only if another field equals a certain value.

---

## 30. On-Screen Keyboard (OnScreenKeyboard)

- **US-208** — As an operator on a touch device, I want to open an on-screen keyboard (OSK) for any text field.
- **US-209** — As a user, I want to choose between keyboard layouts (QWERTY, numbers, Arabic-numerals).
- **US-210** — As a user, I want the keyboard to support Backspace and Enter.

---

## 31. Altitude Conflict Detection

- **US-211** — As a user, I want the system to automatically flag two flights as conflicting when the altitude difference is less than DELTA.
- **US-212** — As an admin, I want to define the conflict delta (conflictAltDelta) per preset.
- **US-213** — As a user, I want to see a red marker on both conflicting strip cards.
- **US-214** — As an admin, I want altitude conflicts during a transfer to be logged in the activity log as critical.

---

## 32. Workstation Load Management

- **US-215** — As a user, I want to see a station load indicator (below half / half / full / overloaded).
- **US-216** — As an admin, I want to define a threshold for a "full" station.
- **US-217** — As a user, I want transitions to "overloaded" status to be logged.

---

## 33. UI & Design Settings

- **US-218** — As a user, I want to switch between Light and Dark mode with a click.
- **US-219** — As a user, I want to change the card zoom level.
- **US-220** — As a user, I want to adjust strip card height for different screens.
- **US-221** — As a user, I want to switch between "single-click edit" and "double-click edit" mode.
- **US-222** — As a user, I want to "lock" the drawing layer while editing to prevent accidental movement.

---

## 34. Drag & Drop — Touch & Pen Support

- **US-223** — As an operator on a touch device, I want to drag a strip from the strip list to the map with a finger swipe.
- **US-224** — As an operator on a touch device, I want to drag a strip from the flight zones list to the map with a pen.
- **US-225** — As a user, I want pen movement over the map not to accidentally trigger page scroll (touchAction: none).
- **US-226** — As an operator, I want the pointer to be captured (setPointerCapture) during drag so I don't lose it when moving outside the element's bounds.

---

## 35. Civilian Strips Admin (CivilianStripsAdmin)

- **US-227** — As an admin, I want to create, edit, and delete civilian strips from the management screen.
- **US-228** — As an admin, I want to import civilian strips from a CSV file.
- **US-229** — As an admin, I want to define dedicated columns for the civilian strip view.

---

## 36. Custom Strip Fields

- **US-230** — As an admin, I want to define custom fields with different types: text, number, boolean, dropdown, toggle.
- **US-231** — As an admin, I want to configure the input method per field (none / keyboard / handwriting / both / toggle / dropdown).
- **US-232** — As a user, I want custom fields to appear on the strip card in the defined layout.

---

## 37. Freehand Drawing Canvas (FreehandCanvas)

- **US-233** — As an operator, I want to draw freely on a transparent canvas over the strips (FreehandCanvas) with a pen, mouse, or finger.
- **US-234** — As a user, I want to choose between pen mode and eraser mode.
- **US-235** — As a user, I want to clear all drawings with a click.
- **US-236** — As a user, I want drawings to persist between renders (not wiped on polling).

---

## 38. Closures Management (ClosuresManager)

- **US-237** — As an admin, I want to define a "closure" event with start time, end time, and affected zone.
- **US-238** — As a user, I want active closures to be displayed on the map as a visual overlay.
- **US-239** — As a user, I want to receive an alert when a flight is affected by an active closure.

---

## 39. Settings (Settings Overlay)

- **US-240** — As an operator, I want to open a settings panel from the top bar and change: zoom, card height, edit mode, light/dark theme.
- **US-241** — As an operator, I want to save UI preferences for the current session.

---

## 40. Airfield Admin — Vector Map (Airfield Admin)

- **US-242** — As an admin, I want to create an airfield with a background image and place elements on it (parking, barriers, towers, etc.).
- **US-243** — As an admin, I want to define points (Points) on the airfield map — position, name, and color.
- **US-244** — As an admin, I want to define routes (Routes) between points — aircraft routes and vehicle routes.
- **US-245** — As an admin, I want to define elements (Elements) — physical entities on the map with category, icon, status, and note.
- **US-246** — As an admin, I want to define polygons (Polygons) on the map — colored spatial areas.
- **US-247** — As an admin, I want to define airfield sectors (Sectors).
- **US-248** — As an admin, I want to define element types (Element Types) with custom icons and statuses.
- **US-249** — As an admin, I want to define runways with end names (End A / End B) and lighting.
- **US-250** — As an admin, I want to define taxiways and mark them as open/closed.
- **US-251** — As an operator, I want to change an element's status (open / closed / maintenance) directly from the airfield map.
- **US-252** — As an operator, I want to define a navigation route for an element — from origin point via route to destination point.

---

## 41. Camera Integration

- **US-253** — As an admin, I want to associate a camera URL (RTSP/HTTP) with a map element.
- **US-254** — As an operator, I want to open a draggable camera panel by clicking a camera element on the map.
- **US-255** — As an operator, I want to open multiple camera panels simultaneously (camera wall).
- **US-256** — As an operator, I want to view a live camera feed and expand/collapse the panel.

---

## 42. Runway NOTAMs

- **US-257** — As an admin, I want to add a closure NOTAM to a runway (runway closed NOTAM).
- **US-258** — As an operator, I want to see a closed runway visually marked on the airfield map (🚫 red).
- **US-259** — As an operator, I want to receive a warning when a flight attempts to take off from a runway with an active closure NOTAM.
- **US-260** — As an operator, I want to manage active takeoffs — mark an active runway and manage takeoff conflicts.

---

## 43. Map Layer Panel

- **US-261** — As an operator, I want to open a layer panel and toggle each layer individually: elements, aircraft routes, vehicle routes, points, polygons, sectors, cameras.
- **US-262** — As an operator, I want to control whether names / statuses / routes / card borders are displayed on elements.

---

## 44. Clock Widget (ClockWidget)

- **US-263** — As a user, I want to see a live digital/analog clock in the station header.
- **US-264** — As a user, I want the clock to display UTC time and local time simultaneously.

---

## 45. System-Wide Virtual Keyboard (VirtualKeyboard / VKTrigger)

- **US-265** — As an operator on a touch device, I want every input field in the system to display a virtual keyboard on tap (VKTrigger).
- **US-266** — As a user, I want to choose between numeric mode and full-text mode depending on the field type.
- **US-267** — As a user, I want the virtual keyboard to support RTL and backspace/confirm.

---

## 46. Notepad (Floating Scratchpad)

- **US-268** — As an operator, I want to open a floating notepad and write free-form text notes.
- **US-269** — As a user, I want to write in the notepad with both a keyboard and handwriting (canvas).
- **US-270** — As a user, I want to drag the notepad anywhere on the screen and resize it.
- **US-271** — As a user, I want the notepad content to persist throughout the session (not lost on refresh).

---

## 47. Flow Diagram (FlowDiagram)

- **US-272** — As a user, I want to see a visual flow diagram of transfer relationships between stations.
- **US-273** — As a user, I want the diagram to update in real time based on active transfers.

---

## 48. PDF — Uploading Maps from PDF

- **US-274** — As an admin, I want to upload a PDF file as a map and select a specific page to convert to an image.
- **US-275** — As a user, I want to navigate between PDF pages before making the final selection.

---

## 49. Accessibility & RTL

- **US-276** — As a Hebrew-speaking user, I want the entire interface to be fully RTL (including input fields, menus, and lists).
- **US-277** — As a user, I want all messages and labels to be in Hebrew.
- **US-278** — As a user, I want the system to support three color themes: Light, Dark, and Ocean (high-contrast blue).

---

## Summary Statistics

| Category | Stories |
|----------|---------|
| Login & Authentication | 8 |
| Strip Management | 13 |
| Transfers | 16 |
| Views (Vertical, Table, Classic, Ground, Civilian) | 31 |
| Map, Markers & Drawing | 8 |
| Maps Management | 3 |
| Map Zones | 5 |
| Flight Zones Mode | 11 |
| Smart Blocks | 8 |
| OCR & Handwriting | 7 |
| Voice Recognition | 8 |
| Workstation & Preset Management | 9 |
| Query-Based Filtering | 5 |
| Serials Management | 6 |
| Base Status Management | 5 |
| Workstation Contacts | 6 |
| BDH / Checklists | 5 |
| Sticky Notes | 5 |
| Work Group Notes | 3 |
| Work Groups Management | 3 |
| Aids & Links | 3 |
| Crew Member Management | 4 |
| Formation Management | 6 |
| Armaments & Systems | 6 |
| Atmospheric Pressure | 3 |
| Debriefing & Activity Log | 6 |
| Admin Dashboard | 7 |
| Strip Window Layout Builder | 5 |
| Grid Card for Table View | 3 |
| On-Screen Keyboard | 3 |
| Altitude Conflict Detection | 4 |
| Workstation Load Management | 3 |
| UI & Design Settings | 5 |
| Drag & Drop / Touch & Pen | 4 |
| Civilian Strips Admin | 3 |
| Custom Strip Fields | 3 |
| Freehand Drawing | 4 |
| Closures Management | 3 |
| Settings | 2 |
| Airfield Admin — Vector Map | 11 |
| Camera Integration | 4 |
| Runway NOTAMs | 4 |
| Map Layer Panel | 2 |
| Clock Widget | 2 |
| System-Wide Virtual Keyboard | 3 |
| Notepad | 4 |
| Flow Diagram | 2 |
| PDF Map Upload | 2 |
| Accessibility & RTL | 3 |
| **TOTAL** | **~278** |
