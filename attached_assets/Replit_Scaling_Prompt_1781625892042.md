# Skyboard — Responsive Scaling Prompt for Replit

## CONTEXT

The current Skyboard app is designed and pixel-perfect for a **15.6" screen at 1920×1080 resolution** (141 PPI).  
We need to support 3 additional screen sizes **without changing the overall layout logic**.

The approach: **CSS custom property `--s` (scale factor)** injected on `<html>` via JavaScript `matchMedia`, then used **only on the specific properties that need to scale** — NOT a global `zoom` or `transform: scale()`.

---

## STEP 1 — Detect screen and inject `--s`

Add this script in `index.html` **before** any CSS loads (prevents flash):

```html
<script>
  (function () {
    // Detect physical screen diagonal using screen.width/height + devicePixelRatio
    // We approximate by screen width at native resolution
    var w = screen.width * (window.devicePixelRatio || 1);
    var h = screen.height * (window.devicePixelRatio || 1);
    var diag = Math.sqrt(w * w + h * h);

    var s = 1.00; // default 15.6"
    if (diag >= 3600 && diag < 4200) s = 1.05;  // ~16"
    if (diag >= 4200 && diag < 5000) s = 1.22;  // ~18"
    if (diag >= 5000)                s = 1.65;  // ~24"

    document.documentElement.style.setProperty('--s', s);
    document.documentElement.setAttribute('data-screen', 
      s === 1.00 ? '15' : s === 1.05 ? '16' : s === 1.22 ? '18' : '24'
    );
  })();
</script>
```

Also expose `--s` override via localStorage for manual testing:
```html
<script>
  var override = localStorage.getItem('sky-scale');
  if (override) document.documentElement.style.setProperty('--s', override);
</script>
```

---

## STEP 2 — Add `--s` helper to App.css

At the top of `App.css`, after `:root { }`:

```css
:root {
  --s: 1;   /* default; overridden by JS above */
}

/* Scale helper — use calc(Xpx * var(--s)) everywhere below */
```

---

## STEP 3 — What to scale in App.css

Only modify these existing rules. Use `calc(original_value * var(--s))`:

```css
/* Strip sidebar width */
.de {
  grid-template-columns: calc(350px * var(--s)) 1fr;
  gap: calc(20px * var(--s));
  padding: calc(20px * var(--s));
}

/* Strip list padding */
.strip-list {
  padding: calc(15px * var(--s));
}

/* Strip card */
.flight-strip {
  padding: calc(15px * var(--s));
  margin-bottom: calc(12px * var(--s));
  border-right: calc(6px * var(--s)) solid var(--accent-blue);
  border-radius: calc(8px * var(--s));
}

/* Handwriting canvas area */
.canvas-area {
  height: calc(60px * var(--s));
  font-size: calc(12px * var(--s));
}

/* Undo bar (keep proportional) */
.undo-timer-bar {
  height: calc(3px * var(--s));
}
```

---

## STEP 4 — What to scale in App.tsx (inline styles)

Replace these hardcoded pixel values with `Math.round(N * scale)` using a helper:

```tsx
// Add near top of App.tsx, after imports:
const scale = parseFloat(
  document.documentElement.style.getPropertyValue('--s') || '1'
);
const sc = (n: number) => Math.round(n * scale);
```

Then replace the following specific inline style values only:

### LOGIN SCREEN
| Property | Current | Replace with |
|---|---|---|
| Login modal minWidth | 300px | `sc(300)` |
| Login modal maxWidth | 420px | `sc(420)` |
| Login modal padding | 32px 36px | `sc(32)` `sc(36)` |
| Login title fontSize | 28px | `sc(28)` |
| Login subtitle fontSize | 13px | `sc(13)` |
| Crew input padding | 15px 20px | `sc(15)` `sc(20)` |
| Crew input fontSize | 16px | `sc(16)` |
| Dropdown item padding | 12px 20px | `sc(12)` `sc(20)` |
| Admin badge fontSize | 11px | `sc(11)` |
| Login button padding | 10px 28px | `sc(10)` `sc(28)` |
| Login button fontSize | 15px | `sc(15)` |

### MODALS & DIALOGS
| Property | Current | Replace with |
|---|---|---|
| Standard modal minWidth | 300px | `sc(300)` |
| Standard modal maxWidth | 420px | `sc(420)` |
| Large modal minWidth | 450px | `sc(450)` |
| Modal padding | 32px 36px | `sc(32)` `sc(36)` |
| Modal title fontSize | 20px | `sc(20)` |
| Modal border-radius | 14px | `sc(14)` |
| PDF viewer width | 600px | `sc(600)` |
| Strip detail popup width | 230px | `sc(230)` |

### FONTS — everywhere in App.tsx
| fontSize value | Replace with |
|---|---|
| 28px (headings) | `sc(28)` |
| 20px (modal titles) | `sc(20)` |
| 18px (section headings, large btn) | `sc(18)` |
| 16px (primary text, inputs) | `sc(16)` |
| 15px (button text) | `sc(15)` |
| 14px (secondary text) | `sc(14)` |
| 13px (compact text) | `sc(13)` |
| 12px (small labels) | `sc(12)` |
| 11px (tiny badges) | `sc(11)` |
| 10px (micro text) | `sc(10)` |

### BUTTONS
| Property | Current | Replace with |
|---|---|---|
| Large btn padding | 20px | `sc(20)` |
| Standard btn padding-v | 10px | `sc(10)` |
| Standard btn padding-h | 28px | `sc(28)` |
| Small btn padding-v | 4px | `sc(4)` |
| Small btn padding-h | 10px | `sc(10)` |
| Zoom/icon btn width | 28px | `sc(28)` |
| Zoom/icon btn height | 28px | `sc(28)` |
| Close btn width | 32px | `sc(32)` |
| Close btn height | 32px | `sc(32)` |
| Btn border-radius | 8px | `sc(8)` |
| Btn border-radius small | 6px | `sc(6)` |

### INPUTS
| Property | Current | Replace with |
|---|---|---|
| Standard input padding | 15px | `sc(15)` |
| Compact input padding | 7px 10px | `sc(7)` `sc(10)` |
| Dropdown item padding | 12px 20px | `sc(12)` `sc(20)` |
| Coord input (degrees) | 40px | `sc(40)` |
| Coord input (minutes) | 34px | `sc(34)` |
| Coord input (seconds) | 42px | `sc(42)` |

### MAP EDITOR
| Property | Current | Replace with |
|---|---|---|
| Right sidebar width | 320px | `sc(320)` |
| Zoom buttons | 28px | `sc(28)` |

### SECTOR DASHBOARD (ground view)
| Property | Current | Replace with |
|---|---|---|
| Left strip column | 300px | `sc(300)` |
| Right sector column | 260px | `sc(260)` |
| Formation row height | 36px | `sc(36)` |
| DATK/KIPA input width | 60px | `sc(60)` |

### STICKY NOTES
| Property | Current | Replace with |
|---|---|---|
| Default width | 200px | `sc(200)` |
| Default height | 160px | `sc(160)` |
| Font size | 13px | `sc(13)` |

---

## STEP 5 — ClockWidget.tsx

Add at top of ClockWidget component:
```tsx
const scale = parseFloat(
  document.documentElement.style.getPropertyValue('--s') || '1'
);
const sc = (n: number) => Math.round(n * scale);
```

Scale these values only:

| Property | Current | Replace with |
|---|---|---|
| Panel width | 260px | `sc(260)` |
| Panel max-height | 220px | `sc(220)` |
| Panel border-radius | 10px | `sc(10)` |
| Header padding | 6px 10px 4px | `sc(6)` `sc(10)` `sc(4)` |
| Clock fontSize (HH:MM) | 26px | `sc(26)` |
| Clock seconds fontSize | 15px | `sc(15)` |
| Date fontSize | 10px | `sc(10)` |
| Tab fontSize | 11px | `sc(11)` |
| Tab padding-v | 5px | `sc(5)` |
| Timer input width | 180px | `sc(180)` |
| Timer input fontSize | 40px | `sc(40)` |
| Timer/stopwatch display | 48px | `sc(48)` |
| Reminder item padding | 4px 6px | `sc(4)` `sc(6)` |
| Reminder time min-width | 36px | `sc(36)` |
| Alert modal padding | 28px 36px | `sc(28)` `sc(36)` |
| Alert border-radius | 14px | `sc(14)` |
| Alert emoji fontSize | 48px | `sc(48)` |
| Alert time fontSize | 28px | `sc(28)` |
| Alert message fontSize | 18px | `sc(18)` |
| Alert button padding | 10px 32px | `sc(10)` `sc(32)` |
| Alert button fontSize | 16px | `sc(16)` |
| Lap row fontSize | 12px | `sc(12)` |
| Badge fontSize | 10px | `sc(10)` |

---

## STEP 6 — VirtualKeyboard.tsx

```tsx
const scale = parseFloat(
  document.documentElement.style.getPropertyValue('--s') || '1'
);
const sc = (n: number) => Math.round(n * scale);
```

| Property | Current | Replace with |
|---|---|---|
| Numeric key size | 36px | `sc(36)` |
| Full key size | 42px | `sc(42)` |
| Key fontSize | 16px | `sc(16)` |
| Numeric panel width | 200px | `sc(200)` |
| Full keyboard width | 480px | `sc(480)` |

---

## DO NOT SCALE — Leave these unchanged

These are already responsive or scaling them would break layout:

- `width: '96vw'`, `height: '93vh'`, `maxHeight: '80vh'` — already viewport-relative
- `width: '100%'` — always fills parent
- `height: '100vh'`, `height: '95vh'` — full screen heights
- `flex: 1`, `flex-grow` — fills available space
- Animation timings (`0.2s`, `0.7s`, etc.) — timing is not size
- `z-index` values
- `opacity` values
- Colors and gradients
- `border: 1px solid` — keep at 1px, do NOT scale borders to `calc(1px * var(--s))`
- `box-shadow` pixel offsets — scale visually looks wrong
- `overscroll-behavior`, `touch-action` — behavioral, not visual
- `transform: scale(0.98)` on active strip — relative, keep as-is
- `transition` durations
- `letter-spacing` values
- Map zoom range (`0.25` min, `8` max, `1.25` step) — map internal zoom, not UI scale
- `gap: '4px'`, `gap: '6px'` — micro gaps, leave unchanged
- Admin panel `width: '94vw'` — viewport relative
- `minWidth: '340px'` on workstation modal — this is already a minimum, leave it

---

## TESTING

After implementation, test each screen by running in browser console:
```js
// Simulate 16"
localStorage.setItem('sky-scale', '1.05'); location.reload();

// Simulate 18"
localStorage.setItem('sky-scale', '1.22'); location.reload();

// Simulate 24"
localStorage.setItem('sky-scale', '1.65'); location.reload();

// Reset to base
localStorage.removeItem('sky-scale'); location.reload();
```

Check that:
1. Strip list sidebar is wider and content inside is larger
2. No horizontal scrollbar appears (all content fits in viewport)
3. Modals open centered and fully visible
4. Map area still fills the remaining space (uses `1fr`)
5. Fonts are clearly larger and legible
6. Animations still play correctly
7. Drag-and-drop still functions (touch-action: none is preserved)
