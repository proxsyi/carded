A self-hosted, offline-first flashcard web app. Quizlet replacement built for speed, simplicity, and real learning.

---

## Overview

**App name**: Carded

**Favicon / PWA icon**: 🃏 emoji rendered as a static image (generate a simple 512x512 PNG with the emoji centered on `#141417` background)

A single-page web app that runs entirely in the browser. No accounts, no cloud, no backend. All data lives on-device via IndexedDB. Works on desktop and mobile. Dark mode by default. Export your cards as `.txt` anytime.

---

## Core Concepts

- **Card** — A single `Term, Definition` pair
- **Set** — A named collection of cards (e.g. "Unit 3 Formulas")
- **Folder** — A named group of sets (e.g. "MATH 1710")
- Sets can exist **inside a folder** or **standalone** (no folder)
- Sets can be **dragged and dropped** between folders or out to standalone

---

## Features

### Home Screen

- Header shows app name "Carded" top-left
- Shows all **folders** and **standalone sets** in a grid/list
- Click a folder → see sets inside it
- Click a set → opens the set view
- Create new folder or new set from home
- Drag & drop sets into/out of folders
- Search bar to filter folders and sets by name
- **Sort options**: alphabetical, last studied, date created (saved to localStorage)
- **Card count badges** on folder tiles (total cards across all sets) and set tiles (card count)
- **Last studied** timestamp shown on set tiles (e.g. "Studied 2h ago" or "Never")
- **Empty state**: when no folders/sets exist, show a friendly centered prompt — "No sets yet — create your first one" with a create button
- **Rename folders/sets**: click the title text to edit inline (contenteditable, saves on blur or Enter)

### Folder View

- Identical layout to home screen but filtered to only show sets inside that folder
- **Breadcrumb nav** at top: `Home > Folder Name` ("Home" is clickable)
- Can rename the folder by clicking its title inline
- Can delete the folder from within the view (moves all sets inside to standalone, then removes folder)
- Can create new sets directly inside the folder

### Set View

- Shows all cards in the set as a scrollable list
- Each card shows Term and Definition side by side (or stacked on mobile)
- Add / edit / delete individual cards
- **Inline card editing**: click a card's term or definition text to edit it in place (contenteditable, saves on blur or Enter). No modals for editing
- **Bulk import** — two options:
    - **Paste**: a textarea where you paste `Term, Definition` lines directly, with an "Import" button
    - **File upload**: a "Choose .txt file" button that reads the file and imports
    - Both use the same parser. Show results via toast ("Imported 12 cards, 3 duplicates skipped")
- **Bulk export**: download all cards as a `.txt` file (`Term, Definition` per line)
- Button to enter **Study Mode** or **Learn Mode**
- **Breadcrumb nav**: `Home > Folder Name > Set Name` (or `Home > Set Name` for standalone sets)
- **Rename set**: click the set title to edit inline
- **Empty state**: when no cards in set, show "No cards yet — add one or import a .txt file" with action buttons
- **Confirm delete**: all destructive actions (delete folder, set, or card) show a confirmation modal first. Deleting a set removes all its cards + stats from IndexedDB (clean delete). Deleting a folder moves its sets to standalone first, then removes the folder
- **Card reordering**: drag & drop to reorder cards within a set (using SortableJS, same as folder/set drag & drop)
- **Long text**: always show full term and definition text in set view (no truncation). In study mode flip cards, content scrolls vertically if it overflows the card area
- **Folder/set name display**: truncate at ~40 characters with ellipsis on home/folder grid tiles. Full name visible in set view header and on hover (title attribute)

### Study Mode (Classic Flip Cards)

- One card at a time, shows the **Term** side first
- Tap/click to flip and reveal the **Definition**
- Swipe left/right (touch), arrow keys, or A/D keys to go next/previous
- **Shuffle toggle** visible during the session (top-right toggle button, reshuffles remaining cards when toggled on)
- Progress bar (e.g. 5/20)
- Can toggle direction: Term → Definition **or** Definition → Term
- **End of deck**: shows a completion screen with "Start over", "Shuffle & restart", or "Back to set". Does NOT auto-loop

### Learn Mode (Multiple Choice Quiz)

- Shows a prompt (term or definition)
- Answer choices = 1 correct + up to 3 wrong answers from the same set. If the set has fewer than 4 cards, show as many options as available (e.g. 3 cards = 3 choices, 2 cards = 2 choices). Minimum 2 cards required to use learn mode
- Both directions: sometimes shows Term → pick the Definition, sometimes Definition → pick the Term
- Immediate feedback: correct = green flash, wrong = red flash + show correct answer
- **Spaced repetition logic**: cards you get wrong come back more often. Cards you consistently get right fade out of rotation
- Round summary at the end: score (e.g. 14/20), time taken, list of missed cards with correct answers shown
- Option to **retry missed cards only**
- Option to **retry all cards** (reset boxes for this set)
- Option to **go back to set view**

### Progress Tracking

- Per-set stats: times studied, best score, last studied date
- Per-card tracking: how many times correct vs incorrect
- Simple streak counter (consecutive days studied)
- All stored locally in IndexedDB

---

## Data & Storage

### Storage Engine

- **IndexedDB** via a lightweight wrapper (like `idb` or Dexie.js)
- No cookies, no server, no cloud
- All data persists on-device across sessions
- Storage is per-browser (if you switch browsers, data doesn't carry over — but you can export/import)
- **IndexedDB unavailable fallback**: if IndexedDB is blocked (e.g. incognito mode in some browsers), show a full-screen friendly error: "Storage is unavailable — Carded needs browser storage to save your cards. Try using a regular (non-private) browser window." No app functionality loads behind it
- **Backup reminder**: if total card count across all sets exceeds 100 and user hasn't exported in 7+ days, show a subtle non-blocking banner at top of home: "You have X cards — consider exporting a backup." Dismissable, reappears after 7 more days

### Data Schema

```jsx
// Dexie.js database name: "FlashCardsDB"
// Version: 1

// Table: folders
// Indexes: id, order
Folder {
  id: string           // crypto.randomUUID()
  name: string
  createdAt: number    // Date.now()
  order: number        // integer for sorting
}

// Table: sets
// Indexes: id, folderId, order
Set {
  id: string           // crypto.randomUUID()
  name: string
  folderId: string | null   // null = standalone (not in any folder)
  createdAt: number         // Date.now()
  lastStudied: number | null
  bestScore: number | null  // percentage 0-100
  timesStudied: number      // default 0
  order: number
}

// Table: cards
// Indexes: id, setId, order
Card {
  id: string           // crypto.randomUUID()
  setId: string
  term: string
  definition: string
  correctCount: number    // default 0
  incorrectCount: number  // default 0
  box: number             // Leitner box 1-3, default 1
  lastSeen: number | null // Date.now() when last reviewed
  order: number
}

// Table: stats
// Indexes: id
Stats {
  id: "global"              // single row
  currentStreak: number     // consecutive days studied
  lastStudiedDate: string   // "YYYY-MM-DD" format
  longestStreak: number
}
```

### Import / Export

- **Import**: paste or upload a `.txt` file. Each line = `Term, Definition`. Parser splits on the **first comma** so definitions can contain commas
- **Export**: generates a `.txt` file download — one `Term, Definition` per line
- Future idea: export/import full sets as JSON for backup/sharing
- **Delimiter**: first comma in each line splits Term from Definition (so definitions can contain commas)
- **Encoding**: UTF-8
- Lines that are empty or whitespace-only are skipped during import
- **Duplicate handling**: on import, skip any card where both the term AND definition exactly match an existing card in the set (case-sensitive). Show a toast like "Imported 12 cards (3 duplicates skipped)"

---

## UI / Design Direction

### Design System — Final Decisions

**Style**: Clean, editorial, typographic. Functional minimalism. No glassmorphism, no neon gradients, no blur effects, no "vibe-coded" aesthetics. Think well-designed dev tool meets reading app.

**Accessibility (a11y)**:

- Semantic HTML throughout (`<nav>`, `<main>`, `<button>`, `<header>`, `<section>`, etc.)
- All interactive elements have visible **keyboard focus indicators** (2px `--accent` outline, 2px offset)
- Buttons and icons have `aria-label` attributes where text isn't visible (e.g. delete icon button → `aria-label="Delete card"`)
- Cards in study/learn mode are wrapped in `role="region"` with `aria-live="polite"` so screen readers announce new content
- Toast notifications use `role="alert"` and `aria-live="assertive"`
- Color contrast ratios meet WCAG AA: `--text-primary` on `--bg-primary` = 15.2:1, `--text-secondary` on `--bg-primary` = 7.1:1
- All text inputs have associated `<label>` elements (visually hidden where needed)
- Drag & drop has a keyboard fallback: select item with Enter, move with arrow keys, confirm with Enter

**Color Palette** (CSS custom properties):

|Variable|Value|Description|
|---|---|---|
|`--bg-primary`|`#141417`|Near-black, slightly warm|
|`--bg-secondary`|`#1c1c21`|Card/tile backgrounds|
|`--bg-tertiary`|`#26262d`|Hover states, inputs|
|`--border`|`#333340`|Subtle borders|
|`--text-primary`|`#e8e8ed`|Main text|
|`--text-secondary`|`#9494a3`|Muted/labels|
|`--accent`|`#9580ff`|Muted purple — buttons, links, active states|
|`--accent-hover`|`#b0a0ff`|Lighter purple for hover|
|`--correct`|`#4ade80`|Green — correct answers|
|`--incorrect`|`#f87171`|Red — wrong answers|
|`--folder-accent`|`#9580ff33`|Translucent purple for folder tiles|

**Typography**:

- UI font: `Inter` (Google Fonts CDN) — fallback `system-ui, -apple-system, sans-serif`
- Card terms: `'JetBrains Mono'` (Google Fonts CDN) — adds character, distinguishes terms from definitions
- Card definitions: `Inter` (same as UI)
- Base size: `16px`, card content: `18px`, headings scale: `1.25rem / 1.5rem / 2rem`

**Layout**:

- Mobile-first responsive design
- Breakpoints: `640px` (mobile→tablet), `1024px` (tablet→desktop)
- Home: CSS Grid of folder/set tiles — `auto-fill, minmax(280px, 1fr)`
- Set view: clean vertical card list, max-width `720px` centered
- Study/Learn mode: centered card, max-width `600px`, minimal surrounding chrome
- No page reloads — all view transitions via JS DOM swaps

**Spacing**:

- Base unit: `8px`
- Content padding: `24px` mobile, `48px` desktop
- Card padding: `20px`
- Gap between tiles: `16px`
- Border radius: `12px` (tiles/cards), `8px` (buttons/inputs)

**Micro-interactions**:

- Card flip: CSS 3D transform, `0.4s ease` transition
- Correct answer: card background flashes `--correct` at 20% opacity, fades over `0.5s`
- Wrong answer: card background flashes `--incorrect` at 20% opacity, shows correct answer for `1.5s`
- Drag & drop: `SortableJS` ghost with `0.6` opacity, smooth insertion animation
- Buttons: `0.15s` background-color transition on hover
- No spring physics, no bounces — keep it crisp and fast

**Toast notifications**:

- Position: **top-center**, fixed
- Auto-dismiss after **3 seconds**
- Small X button to dismiss early
- Slide-down entrance, fade-out exit
- Used for: import results, export confirmation, errors
- Max 1 toast visible at a time (new toast replaces current)

---

## Tech Stack

- **Vanilla HTML / CSS / JavaScript** — no frameworks, no build step, no dependencies except Dexie.js and SortableJS
- **IndexedDB** via `Dexie.js` (CDN import — clean API, solid browser support)
- **Drag & drop**: `SortableJS` (CDN import — lightweight, touch-friendly, works on mobile)
- **CSS**: custom properties for theming, CSS Grid + Flexbox for layout
- **Zero build step** — open `index.html` and it works
- **Hosting**: any static host — GitHub Pages, Netlify, Vercel, or just open the file locally
- **External deps (CDN only)**:
    - `Dexie.js` v4+ — IndexedDB wrapper
    - `SortableJS` v1.15+ — drag and drop

---

## File Structure

```jsx
carded/
├── index.html
├── manifest.json
├── service-worker.js
├── css/
│   ├── variables.css      (colors, spacing, type scale)
│   ├── base.css           (reset, global styles)
│   ├── components.css     (cards, buttons, modals)
│   └── layout.css         (grid, responsive)
├── js/
│   ├── app.js             (router, init)
│   ├── db.js              (IndexedDB / Dexie setup)
│   ├── models/
│   │   ├── folder.js
│   │   ├── set.js
│   │   └── card.js
│   ├── views/
│   │   ├── home.js
│   │   ├── folder.js
│   │   ├── set.js
│   │   ├── study.js
│   │   └── learn.js
│   ├── components/
│   │   ├── card-tile.js
│   │   ├── modal.js
│   │   ├── drag-drop.js
│   │   └── progress-bar.js
│   └── utils/
│       ├── import-export.js
│       ├── spaced-rep.js
│       └── helpers.js
└── assets/
    ├── icon-192.png   (🃏 on #141417)
    ├── icon-512.png   (🃏 on #141417)
    └── favicon.png    (32x32)
```

---

## Spaced Repetition Algorithm

Simplified Leitner system with weighted random selection:

- Each card has a `box` value: **1**, **2**, or **3**
- New cards start in **Box 1**
- **Correct answer** → move up one box (max 3)
- **Wrong answer** → reset to **Box 1** regardless of current box
- **Selection weights**: Box 1 = weight `6`, Box 2 = weight `3`, Box 3 = weight `1`
- Selection algorithm: sum all weights of remaining cards, pick a random number in that range, select the card at that position
- A card is "mastered" for the round when it's in Box 3 AND answered correctly in the current session
- Learn mode round = all cards in the set. Round ends when every card has been mastered at least once OR user quits
- Between rounds, box values persist in IndexedDB so progress carries across sessions
- **Retry missed** resets all cards that were answered wrong during the round back to Box 1 and starts a new round with only those cards

---

## Pages / Routes

|Route|What it shows|
|---|---|
|`/`|Home — all folders + standalone sets|
|`/folder/:id`|Folder view — sets inside that folder|
|`/set/:id`|Set view — all cards, edit, import/export|
|`/set/:id/study`|Study mode (flip cards)|
|`/set/:id/learn`|Learn mode (multiple choice quiz)|

Using hash-based routing (`#/set/123`) so it works as a static site with no server config.

---

## MVP Scope (v1)

- [x] Home screen with folders + standalone sets
- [x] Create / edit / delete folders and sets
- [x] Add / edit / delete cards within a set
- [x] Bulk import from `.txt` (Term, Definition format)
- [x] Export to `.txt`
- [x] Study mode (flip cards)
- [x] Learn mode (4-choice quiz, both directions)
- [x] Spaced repetition in learn mode
- [x] Progress tracking (per-set stats)
- [x] Drag & drop sets into folders
- [x] Dark mode
- [x] Mobile responsive
- [x] All data in IndexedDB

## Keyboard Shortcuts (include in v1)

|Key|Action|Context|
|---|---|---|
|`Space` or `Enter`|Flip card|Study mode|
|`→` or `D`|Next card|Study mode|
|`←` or `A`|Previous card|Study mode|
|`1` `2` `3` `4`|Select answer choice|Learn mode|
|`Esc`|Back / close modal|Everywhere|
|`N`|New set (when on home/folder)|Home / Folder view|

---

## PWA Support (include in v1)

- Add `manifest.json` with app name "Carded", icons (192px + 512px), theme color `#141417`, background color `#141417`, `display: "standalone"`
- Add a basic `service-worker.js` that caches `index.html`, CSS, JS, and font files for offline use
- This lets users "Add to Home Screen" on mobile and use it like a native app
- No push notifications needed

---

## Future Ideas (v2+)

- Light mode toggle
- JSON export/import for full backups
- Custom accent colors per folder
- Share sets via URL (encode cards in URL params or generate shareable links)
- Notion integration (pull cards directly from Notion pages)
- Audio pronunciation for language cards
- Timed challenge mode