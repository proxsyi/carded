# Carded

Carded is a self-hosted flashcard PWA for fast local study. It runs entirely in the browser, stores data on-device with IndexedDB, and keeps the stack zero-build-step and static-host friendly.

**Features**

- Folders, sets, and standalone decks
- Inline editing for set names and card content
- Study mode with flip cards, keyboard shortcuts, and progress tracking
- Learn mode with multiple choice review
- Import/export for plain text card sets
- Offline support with a service worker and installable manifest

**Run locally**

Use a simple static server:

`python3 -m http.server 8000`

Then open `http://localhost:8000/`.

You can also open `index.html` directly, but serving over HTTP is recommended so the service worker and manifest behave correctly.

**GitHub Pages**

https://proxsyi.github.io/carded/

**Install on your device**

Visit the GitHub Pages URL, then install it from the browser menu:

- iPhone/iPad: Safari → Share → Add to Home Screen
- Android: Chrome → three-dot menu → Install app
- Desktop: Chrome or Edge → Install App / address bar install icon

Once installed, Carded runs like an app and keeps all data local to the browser on that device.

**Tech stack**

- Vanilla HTML, CSS, and JavaScript
- IndexedDB for local persistence
- Static hosting on GitHub Pages
- PWA manifest + service worker
