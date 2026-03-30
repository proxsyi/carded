
Carded is a self-hosted, offline-first flashcard web app built as a Quizlet-style replacement for fast local study. It runs entirely in the browser, stores data in IndexedDB, and supports folders, sets, inline editing, study mode, learn mode, import/export, and installable PWA assets.

**Run locally**

Serve the project directory over HTTP:

`npx serve .`

Then open the local URL in your browser. Serving over HTTP is recommended so the service worker and manifest load correctly.

**Connect through your browser**

Go to https://proxsyi.github.io/carded/

**Install on your device**

Carded works offline as a PWA. Once you visit the site, the service worker caches everything for offline use.

- iPhone/iPad — open in Safari → tap share (box with arrow) → Add to Home Screen
- Android — open in Chrome → tap three-dot menu → Install app
- Desktop — open in Chrome/Edge → click install icon in address bar

Once installed it runs like a native app with no browser chrome. All data stays on-device.

**Stack**

- Vanilla HTML, CSS, and JavaScript
- IndexedDB for local persistence
- Static hosting compatible

**Project files**

- `index.html` — app shell and metadata
- `styles.css` — design system and layout
- `app.js` — storage, routing, and UI logic
- `manifest.webmanifest` — install metadata
- `sw.js` — offline asset caching