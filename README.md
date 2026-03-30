# Carded

Carded is a self-hosted, offline-first flashcard web app built as a Quizlet-style replacement for fast local study. It runs entirely in the browser, stores data in IndexedDB, and supports folders, sets, inline editing, study mode, learn mode, import/export, and installable PWA assets.

## Run locally

Serve the project directory over HTTP:

```bash
npx serve .
```

Then open the local URL in your browser. Serving over HTTP is recommended so the service worker and manifest load correctly.

## Stack

- Vanilla HTML, CSS, and JavaScript
- IndexedDB for local persistence
- Static hosting compatible

## Project files

- `index.html` — app shell and metadata
- `styles.css` — design system and layout
- `app.js` — storage, routing, and UI logic
- `manifest.webmanifest` — install metadata
- `sw.js` — offline asset caching
