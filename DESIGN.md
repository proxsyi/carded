# Carded Design System

This is the single source of truth for all UI decisions. Every component built must reference this file.

---

## Color Tokens

### Dark Theme (default)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#1e1e2e` | Main page background |
| `--bg-secondary` | `#26263a` | Card / surface background |
| `--bg-tertiary` | `#31324a` | Elevated surfaces (modals, dropdowns, editing) |
| `--topbar-bg` | `#17171b` | Navigation bar background |
| `--border-color` | `#333340` | Default border |
| `--border-hover` | `rgba(149, 128, 255, 0.35)` | Border on hover / focus |
| `--text-primary` | `#e8e8ed` | Main body text |
| `--text-secondary` | `#9494a3` | Muted / subtitle text |
| `--text-tertiary` | `rgba(148, 148, 163, 0.5)` | Placeholder / disabled text |
| `--accent-primary` | `#9580ff` | Purple accent (buttons, highlights) |
| `--accent-hover` | `#b0a0ff` | Accent hover state |
| `--accent-active` | `#7c6de0` | Accent pressed state |
| `--accent-subtle` | `rgba(149, 128, 255, 0.12)` | Subtle accent tint (banners, tile folders) |
| `--accent-border` | `rgba(149, 128, 255, 0.26)` | Accent-tinted border |
| `--button-text` | `#121219` | Text on filled accent buttons |
| `--success` | `#4ade80` | Correct / success green |
| `--success-bg` | `rgba(74, 222, 128, 0.14)` | Success background tint |
| `--success-border` | `rgba(74, 222, 128, 0.5)` | Success border |
| `--error` | `#f87171` | Error / incorrect red |
| `--error-bg` | `rgba(248, 113, 113, 0.14)` | Error background tint |
| `--error-border` | `rgba(248, 113, 113, 0.4)` | Error border |
| `--error-text` | `#ffb4b4` | Inline error text |
| `--warning-bg` | `rgba(234, 179, 8, 0.12)` | Warning background tint |
| `--warning-border` | `rgba(234, 179, 8, 0.3)` | Warning border |
| `--warning-text` | `#fde68a` | Warning text |
| `--shadow` | `0 20px 60px rgba(0, 0, 0, 0.28)` | Standard card shadow |
| `--focus-ring` | `#7c3aed` | Focus outline color (keyboard nav) |

### Light Theme (TN Trooper Orange)

Applied via `[data-theme="light"]` on `<html>`.

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#F5F0E8` | Warm cream background |
| `--bg-secondary` | `#FFFFFF` | White card surface |
| `--bg-tertiary` | `#EDE8DD` | Slightly darker cream (modals) |
| `--topbar-bg` | `#F0EBE0` | Warm cream nav bar |
| `--border-color` | `#D4C9BB` | Warm gray-brown border |
| `--border-hover` | `rgba(196, 116, 44, 0.4)` | Orange-tinted hover border |
| `--text-primary` | `#2C1810` | Dark brown body text |
| `--text-secondary` | `#5C4A3A` | Medium brown muted text |
| `--text-tertiary` | `#8B7A6B` | Light brown placeholder |
| `--accent-primary` | `#C4742C` | Trooper orange accent |
| `--accent-hover` | `#A8612A` | Darker orange hover |
| `--accent-active` | `#8C5024` | Even darker orange pressed |
| `--accent-subtle` | `rgba(196, 116, 44, 0.10)` | Subtle orange tint |
| `--accent-border` | `rgba(196, 116, 44, 0.30)` | Orange-tinted border |
| `--button-text` | `#FFFFFF` | Text on orange buttons |
| `--success` | `#16a34a` | Darker green (contrast on light) |
| `--success-bg` | `rgba(22, 163, 74, 0.12)` | Success tint |
| `--success-border` | `rgba(22, 163, 74, 0.4)` | Success border |
| `--error` | `#dc2626` | Darker red (contrast on light) |
| `--error-bg` | `rgba(220, 38, 38, 0.10)` | Error tint |
| `--error-border` | `rgba(220, 38, 38, 0.35)` | Error border |
| `--error-text` | `#b91c1c` | Inline error text |
| `--warning-bg` | `rgba(180, 130, 0, 0.10)` | Warning tint |
| `--warning-border` | `rgba(180, 130, 0, 0.30)` | Warning border |
| `--warning-text` | `#92400e` | Warning text |
| `--shadow` | `0 20px 60px rgba(44, 24, 16, 0.12)` | Warm-toned shadow |
| `--focus-ring` | `#C4742C` | Focus outline color |

---

## Typography

| Token | Value |
|-------|-------|
| Font stack | `"Inter", system-ui, -apple-system, sans-serif` |
| Mono stack | `"JetBrains Mono", ui-monospace, SFMono-Regular, monospace` |
| Base size | `16px` |
| Base line-height | `1.5` |

### Size Scale

| Name | Value | Usage |
|------|-------|-------|
| `xs` | `0.78rem` | Eyebrow labels, flip-label |
| `sm` | `0.88rem` | Badge text, error messages |
| `base` | `0.9rem` | Field labels, meta text |
| `md` | `1rem` | Body text |
| `lg` | `1.05rem` | Card term content |
| `xl` | `1.1rem` | Tile name, flip content |
| `2xl` | `1.15rem` | Term in flip mode |
| `3xl` | `1.25rem` | Brand/logo name |
| `4xl` | `1.4rem` | Stat value |
| `display` | `clamp(1.6rem, 2vw, 2rem)` | Page/section titles |

### Weight Scale

| Name | Value | Usage |
|------|-------|-------|
| Regular | `400` | Body text |
| Semibold | `600` | Tile names |
| Bold | `700` | Brand, primary buttons, view titles |

### Letter Spacing

| Usage | Value |
|-------|-------|
| Brand logo | `-0.02em` |
| View titles | `-0.03em` |
| Eyebrow / uppercase labels | `0.08em` |

---

## Spacing Scale

All spacing uses multiples of 4px:

| Token | Value | Usage |
|-------|-------|-------|
| `4px` | `4px` | Micro gaps |
| `8px` | `8px` | Icon gaps, small padding |
| `10px` | `10px` | Badge padding, meta gaps |
| `12px` | `12px` | Button gaps, modal actions gap |
| `14px` | `14px` | Toast padding, tile gap, breadcrumb gap |
| `16px` | `16px` | Standard element gap, button padding |
| `18px` | `18px` | Topbar padding (vertical), card-row padding |
| `20px` | `20px` | Tile padding, panel padding |
| `24px` | `24px` | Page content gaps, modal padding, topbar (horizontal) |
| `28px` | `28px` | Flip face padding |
| `32px` | `32px` | Auth card padding, page top padding |
| `48px` | `48px` | Landing hero top, empty state padding |
| `64px` | `64px` | Page bottom padding |
| `72px` | `72px` | Landing page bottom |

---

## Border Radius

| Name | Value | Usage |
|------|-------|-------|
| `sm` | `6px` | Tile name inline edit bg |
| `md` | `8px` | Inputs, buttons |
| `lg` | `10px` | Card content values |
| `xl` | `12px` | Tiles, banners, toasts, panels, empty-states |
| `2xl` | `16px` | Modals, auth cards, storage error panels |
| `full` | `999px` | Pills, badges, profile circles, spinners, progress bars |

---

## Shadows

| Name | Value | Usage |
|------|-------|-------|
| `--shadow` | `0 20px 60px rgba(0, 0, 0, 0.28)` | Tiles, cards, modals, toasts |

---

## Transitions

| Usage | Value |
|-------|-------|
| Buttons (bg, border, color, transform) | `0.15s ease` |
| Tiles / cards (hover lift) | `0.2s ease` |
| Progress bar width | `0.2s ease` |
| Flip card rotation | `0.4s ease` |
| Toast slide in/out | `0.18s ease` |
| Theme switch (bg, color, border, shadow) | `0.35s ease` |

**Theme transitions**: All themed elements must include a smooth transition on color changes. Apply `transition: background-color 0.35s ease, color 0.35s ease, border-color 0.35s ease, box-shadow 0.35s ease` to any element that changes appearance between themes. No instant color swaps anywhere. Transform/scale hover transitions may remain at `0.2s ease`, but ALL color-related properties must use `0.35s ease` to ensure a unified fade when the theme is toggled.

---

## Breakpoints

| Name | Value | Notes |
|------|-------|-------|
| Mobile | `max-width: 428px` | Small phones (iPhone SE–14 Plus) |
| Tablet | `max-width: 768px` | Current primary breakpoint |

---

## Component Patterns

### Buttons

| Class | Style | Usage |
|-------|-------|-------|
| `.button` | Filled accent | Primary action |
| `.ghost-button` | Outlined surface | Secondary action |
| `.danger-button` | Red tint | Destructive action |
| `.pill-button` | Outlined, can be active | Toggle / filter |
| `.icon-button` | Outlined surface | Icon-only or compact |
| `.link-button` | Transparent, accent text | Inline text action |

All interactive buttons: `min-height: 44px`, `border-radius: 8px`, `transition: all 0.2s ease`.

**Button hover pattern** (universal): `transform: translateY(-2px)` + background highlight on hover. Every button class must implement this. No hover state should be flat (no transform, no color change).

### Cards / Tiles

- `.tile`: `background: --bg-secondary`, `border: 1px solid --border-color`, `border-radius: 12px`, `padding: 20px`
- `.tile.folder`: accent-tinted background gradient + accent border
- Hover state: `transform: translateY(-4px)`, `box-shadow` increases, bg lightens slightly
- `cursor: pointer` on clickable tiles

### Modals

- `.modal-backdrop`: `rgba(8, 8, 11, 0.72)` overlay, centered
- `.modal`: `border-radius: 16px`, `padding: 24px`, width `min(460px, 100%)`
- Focus trapped on open, restored on close

**Required modal behaviors** (all modals/overlays must implement):
1. Click outside modal content → close
2. `Escape` key → close
3. Cancel/confirm buttons must be wired and functional
4. Never ship a modal with dead buttons or non-functional dismiss

**Modal animation spec** (all modals and overlays must follow):
- **Open**: backdrop fades in `opacity: 0 → 1` over `0.2s ease`. Content scales in `opacity: 0, scale(0.95) → opacity: 1, scale(1)` over `0.2s ease`. Handled automatically by CSS when `.modal-backdrop` is inserted into the DOM.
- **Close**: add `.is-closing` class to backdrop, which plays the reverse animation. Remove from DOM (or add `.hidden`) only after `200ms`. Never instantly disappear.
- **Rule**: Modals must NEVER instantly appear or disappear. All modals and overlays use these enter/exit animations.

### Header

Every page (homepage and authenticated pages alike) must include the same top bar: logo on the left, theme toggle on the right, and either a profile link or login button. No page is exempt from this rule.

### Card Flip Animation

Standard flip animation specs:
- Container: `perspective: 1000px`
- Inner element on flip: `transform: rotateY(180deg)`
- Both faces: `backface-visibility: hidden`
- Transition: `transform 0.6s ease` (not `0.4s` — that's the shorter variant used for tiles; full card flips use `0.6s`)

### Toasts

- `.toast-root`: fixed, top-center
- `.toast`: `border-radius: 12px`, `min-width: 280px`, `max-width: min(92vw, 560px)`
- Animates in/out with translate + opacity
- Auto-dismiss after 4s, manual dismiss button

### Inputs

- `.input` / `.textarea` / `.select`: `border-radius: 8px`, `min-height: 44px`, `padding: 12px 14px`
- Border: `--border-color`; focus: `2px solid --focus-ring`

### Banners

- Standard banner: accent-tinted bg + border, `border-radius: 12px`, `padding: 14px 16px`
- Offline status: warning-tinted, top of page, no border-radius (edge-to-edge)

### Empty States

- `.empty-state`: centered grid, `padding: 48px 24px`, `text-align: center`

### Eyebrow

- Uppercase, `0.78rem`, `letter-spacing: 0.08em`, `color: --accent-hover`

---

## Interactive States

| State | Button | Input | Tile |
|-------|--------|-------|------|
| Default | Normal | Normal | Normal |
| Hover | Bg lightens | — | `translateY(-4px)`, shadow grows |
| Focus | `2px solid --focus-ring` | `2px solid --focus-ring` | `2px solid --focus-ring` |
| Active/Pressed | Slight darken | — | — |
| Disabled | `opacity: 0.65`, `cursor: not-allowed` | — | — |
| Loading | `opacity: 0.65`, `cursor: not-allowed` | — | — |

---

## Content Limits

| Item | Limit |
|------|-------|
| Folder name | 30 characters |
| Set name | 30 characters |
| Display name | 30 characters |
| Card term / definition | 5,000 characters (soft warning) |

---

## Walkthrough (`.wt-*`)

- Backdrop: `position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.6); pointer-events: none`
- Spotlight: `.wt-spotlight` — `box-shadow: 0 0 0 9999px rgba(0,0,0,0.6)`, `border-radius: 10px`, CSS transitions for smooth movement
- Tooltip: `.wt-tooltip` — `background: --bg-secondary`, `border: 1px solid --border`, `border-radius: 14px`, `padding: 20px`, max-width 340px, z-index 1002
- Progress bar track: `height: 3px`, `background: --bg-tertiary`; fill: `background: --accent`
- Auto-progression: **12–15 seconds per step** (never less than 12s — users need time to read); animates via `requestAnimationFrame`
- Z-index stack: backdrop 1000, spotlight 1001, tooltip 1002
- Steps that open a secondary overlay (e.g. shortcuts) must render content INLINE in the tooltip — do not call `showShortcutsOverlay()` or any overlay that would be obscured behind z-index 1000

## Shortcuts Overlay

- Reuses `.modal-backdrop` + `.modal` patterns
- `.shortcuts-modal`: `width: min(520px, 100%)`
- `.shortcut-group`: uppercase label rows, `font-size: 0.82rem`, `color: --text-secondary`

## Data Patterns

**Cascade deletes**: Deleting a folder must cascade to all child sets and their cards. Delete order: cards → sets → folder. Never leave orphaned sets or cards in the database or IndexedDB. The same cascade applies in both local (Dexie) and remote (Supabase) layers.

---

## Homepage Demo (`.landing-demo`)

- Centered card flip animation between hero and feature grid
- `.landing-demo__card`: `width: min(320px, 100%)`, `height: 180px`, `perspective: 1000px`
- `.landing-demo__inner`: `animation: demo-flip 5s ease-in-out infinite`
- Front face: `background: --bg-secondary`; back face: `background: --accent-subtle`, `border-color: --accent-border`
- Respects `prefers-reduced-motion` (animation disabled)
