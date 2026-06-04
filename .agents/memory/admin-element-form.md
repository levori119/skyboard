---
name: Admin airfield element form design
description: How the element edit form works in the admin airfield panel (כרטיסיית ניהול אלמנטים)
---

The element edit form in the admin airfield tab (state: `showElementForm`, `editingElement`, `elementForm`, `adminElemFocusField`) uses a **card + focus-mode** pattern:

- Each field (שם, קטגוריה, סוג, הערה) is a collapsible row — click to expand just that field
- Status uses always-visible color-coded quick-pick buttons (no dropdown)
- Element type uses a visual button picker (color dot + icon + name)
- `adminElemFocusField` state controls which field is open

**Why:** User complained the original flat form (all inputs stacked) was unclear and hard to use on tablet.

**How to apply:** Any future changes to this form should preserve the focus-mode pattern. Don't revert to all-fields-at-once.
